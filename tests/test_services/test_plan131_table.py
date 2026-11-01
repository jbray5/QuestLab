"""Plan 131 — table rules on the 2014 rules: exhaustion, weapon mastery, encounter math.

Covers:
- Exhaustion never changes a PC's rolled numbers on the server, in either edition (the
  2024 −2 per level is shown on the sheet, never folded in; 2014 has no numeric penalty).
- The play payload carries the PC's ruleset for the phone.
- Weapon mastery is skipped for a 2014 PC: the attack preview and the phone's gear list.
- 2014 encounter math: per-character thresholds and the monster-count multiplier, with
  the party-size shifts; the encounter service uses it in a 2014 campaign and leaves a
  2024 campaign's results exactly as before.

The SRD values are hard-coded: tests can't read the 5e-database dataset.
"""

import uuid

import pytest
from sqlmodel import Session

import services.adventure_service as adv_svc
import services.attack_service as atk
import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.encounter_service as enc_svc
import services.inventory_service as inv_svc
import services.item_service as item_svc
import services.player_service as play_svc
from api.routers.play import _PLAYER_HIDDEN
from db.repos.monster_repo import MonsterRepo
from domain.character import CharacterItemCreate, PlayerCharacter
from domain.enums import AdventureTier, CharacterClass, EncounterDifficulty, ItemRarity
from domain.item import Item, ItemCreate
from domain.monster import MonsterStatBlockCreate
from integrations.dnd_rules.encounter_math import (
    calculate_difficulty,
    calculate_difficulty_2014,
    encounter_multiplier_2014,
)


def _dm() -> str:
    return f"dm131t_{uuid.uuid4().hex[:8]}@example.com"


def _campaign(db, dm, ruleset: str):
    return camp_svc.create_campaign(db, name=f"Rules {ruleset}", dm_email=dm, ruleset=ruleset)


def _pc(db, cid, dm, *, level: int = 3, name: str = "Hero"):
    return char_svc.create_character(
        db,
        campaign_id=cid,
        dm_email=dm,
        player_name="P",
        character_name=name,
        race="Human",
        character_class=CharacterClass.FIGHTER,
        level=level,
        score_str=16,
        score_dex=14,
        score_con=14,
        score_int=10,
        score_wis=12,
        score_cha=8,
        hp_max=28,
        hp_current=28,
        ac=16,
        speed=30,
        saving_throw_proficiencies=["STR", "CON"],
        skill_proficiencies={"Athletics": 1, "Perception": 1},
    )


def _weapon_item(db, *, name: str = "Greatsword", mastery: str | None = "Graze"):
    return item_svc.create_item(
        db,
        ItemCreate(
            name=f"{name} {uuid.uuid4().hex[:6]}",
            rarity=ItemRarity.COMMON,
            item_type="Weapon",
            value_gp=50,
            weapon_category="Martial Melee",
            damage_die="2d6",
            damage_type="slashing",
            weapon_properties=["Heavy", "Two-Handed"],
            mastery=mastery,
        ),
    )


# ── Exhaustion ────────────────────────────────────────────────────────────────


class TestExhaustionNumbers:
    """No edition's exhaustion is folded into a PC's server-side numbers."""

    @pytest.mark.parametrize("ruleset", ["2014", "2024"])
    def test_exhaustion_leaves_checks_saves_and_attacks_alone(
        self, duckdb_session: Session, ruleset: str
    ):
        """Exhaustion 3: skills, saves and the attack preview read as at exhaustion 0.

        2014 has no numeric penalty at all (disadvantage instead, shown on the roll);
        2024's −2 per level is shown on the sheet and the phone, and was never applied
        here — Plan 131 keeps it that way.
        """
        dm = _dm()
        c = _campaign(duckdb_session, dm, ruleset)
        pc = _pc(duckdb_session, c.id, dm)
        weapon = _weapon_item(duckdb_session)
        skills = play_svc.skill_bonuses(duckdb_session, pc.id)
        saves = play_svc.saving_throws(duckdb_session, pc.id)
        hit = atk.compute_attack(weapon, char_svc.CharacterRepo.get_by_id(duckdb_session, pc.id))

        play_svc.patch_state(duckdb_session, pc.id, {"exhaustion": 3})
        tired = char_svc.CharacterRepo.get_by_id(duckdb_session, pc.id)
        assert tired.exhaustion == 3
        assert play_svc.skill_bonuses(duckdb_session, pc.id) == skills
        assert play_svc.saving_throws(duckdb_session, pc.id) == saves
        assert atk.compute_attack(weapon, tired).hit_bonus == hit.hit_bonus
        # Fighter 3, STR 16: +3 STR, +2 proficiency.
        assert hit.hit_bonus == 5
        assert saves["STR"] == 5 and saves["DEX"] == 2

    def test_play_payload_carries_the_ruleset(self, duckdb_session: Session):
        """The phone's sheet read (/play/{key}) includes the PC's ruleset."""
        dm = _dm()
        c = _campaign(duckdb_session, dm, "2014")
        pc = _pc(duckdb_session, c.id, dm)
        sheet = play_svc.get_character(duckdb_session, pc.id)
        assert sheet.ruleset == "2014"
        # /play/{key} answers with the PlayerCharacter model minus _PLAYER_HIDDEN.
        assert "ruleset" in PlayerCharacter.model_fields
        assert "ruleset" not in _PLAYER_HIDDEN


# ── Weapon mastery ────────────────────────────────────────────────────────────


def _mem_pc(ruleset: str) -> PlayerCharacter:
    """An in-memory Fighter on the given rules (no DB)."""
    return PlayerCharacter(
        id=uuid.uuid4(),
        campaign_id=uuid.uuid4(),
        player_name="P",
        character_name="Hero",
        race="Human",
        character_class=CharacterClass.FIGHTER,
        level=1,
        score_str=16,
        score_dex=14,
        score_con=12,
        score_int=10,
        score_wis=10,
        score_cha=10,
        hp_max=12,
        hp_current=12,
        ac=16,
        speed=30,
        ruleset=ruleset,
    )


def _mem_rapier() -> Item:
    return Item(
        id=uuid.uuid4(),
        name="Rapier",
        rarity=ItemRarity.COMMON,
        item_type="Weapon",
        weapon_category="Martial Melee",
        damage_die="1d8",
        damage_type="piercing",
        weapon_properties=["Finesse"],
        mastery="Vex",
    )


class TestWeaponMastery:
    """Weapon mastery is a 2024 rule: a 2014 PC never gets one."""

    def test_attack_preview_skips_mastery_for_2014(self):
        """Same rapier: Vex for a 2024 Fighter, nothing for a 2014 one; numbers match."""
        rapier = _mem_rapier()
        new = atk.compute_attack(rapier, _mem_pc("2024"))
        old = atk.compute_attack(rapier, _mem_pc("2014"))
        assert new.mastery == "Vex"
        assert old.mastery is None
        assert (old.hit_bonus, old.damage_roll) == (new.hit_bonus, new.damage_roll) == (5, "1d8+3")

    def test_mastery_for_defaults_to_2024(self):
        """A PC row without a ruleset value reads as 2024 and keeps the mastery."""
        pc = _mem_pc("2024")
        pc.ruleset = None  # an old in-memory row; normalize() treats None as 2024
        assert atk.mastery_for(_mem_rapier(), pc) == "Vex"

    @pytest.mark.parametrize("ruleset,expected", [("2014", None), ("2024", "Graze")])
    def test_phone_gear_hides_mastery_for_2014(
        self, duckdb_session: Session, ruleset: str, expected
    ):
        """The phone's gear list shows a weapon's mastery only on the 2024 rules."""
        dm = _dm()
        c = _campaign(duckdb_session, dm, ruleset)
        pc = _pc(duckdb_session, c.id, dm)
        item = _weapon_item(duckdb_session)
        inv_svc.add_item(
            duckdb_session, pc.id, CharacterItemCreate(item_id=item.id, equipped=True), dm
        )
        gear = play_svc.list_gear(duckdb_session, pc.id)
        assert len(gear) == 1
        assert gear[0]["mastery"] == expected
        assert gear[0]["damage_die"] == "2d6"


# ── Encounter math ────────────────────────────────────────────────────────────


class TestEncounterMath2014:
    """The 2014 DMG method: thresholds per character and a monster-count multiplier."""

    def test_brief_spot_check(self):
        """4 level-3 PCs vs 2 CR 1 monsters: 400 × 1.5 = 600 adjusted XP → Medium."""
        r = calculate_difficulty([3, 3, 3, 3], [200, 200], "2014")
        assert (r.low_threshold, r.moderate_threshold, r.high_threshold, r.deadly_threshold) == (
            300,
            600,
            900,
            1600,
        )
        assert r.raw_xp == 400
        assert r.multiplier == 1.5
        assert r.adjusted_xp == 600
        assert r.difficulty == EncounterDifficulty.MODERATE
        assert r.label == "Medium"
        assert r.ruleset == "2014"
        # The 2014 alias properties name the real 2014 thresholds here.
        assert (r.easy_threshold, r.medium_threshold, r.hard_threshold) == (300, 600, 900)

    @pytest.mark.parametrize(
        "monsters,expected",
        [(0, 1.0), (1, 1.0), (2, 1.5), (3, 2.0), (6, 2.0), (7, 2.5), (10, 2.5)]
        + [(11, 3.0), (14, 3.0), (15, 4.0), (30, 4.0)],
    )
    def test_multiplier_table(self, monsters: int, expected: float):
        """×1, ×1.5, ×2 (3–6), ×2.5 (7–10), ×3 (11–14), ×4 (15+) for a party of 3–5."""
        assert encounter_multiplier_2014(monsters, 4) == expected

    @pytest.mark.parametrize(
        "monsters,party,expected",
        [(1, 2, 1.5), (2, 1, 2.0), (15, 2, 5.0), (1, 6, 0.5), (2, 6, 1.0), (15, 7, 3.0)],
    )
    def test_party_size_shifts(self, monsters: int, party: int, expected: float):
        """Under 3 PCs: the next multiplier up. 6 or more: the next one down."""
        assert encounter_multiplier_2014(monsters, party) == expected

    def test_bands_and_labels(self):
        """Trivial under Easy (stored LOW), Easy, Hard and Deadly at their lines."""
        party = [5, 5, 5, 5]  # 1000 / 2000 / 3000 / 4400
        trivial = calculate_difficulty_2014(party, [450])  # 450 adjusted
        assert (trivial.difficulty, trivial.label) == (EncounterDifficulty.LOW, "Trivial")
        easy = calculate_difficulty_2014(party, [1100])
        assert (easy.difficulty, easy.label) == (EncounterDifficulty.LOW, "Easy")
        hard = calculate_difficulty_2014(party, [1100, 1100])  # 2200 × 1.5 = 3300
        assert (hard.adjusted_xp, hard.label) == (3300, "Hard")
        assert hard.difficulty == EncounterDifficulty.HIGH
        deadly = calculate_difficulty_2014(party, [1800, 1800, 1800])  # 5400 × 2
        assert (deadly.adjusted_xp, deadly.difficulty) == (10800, EncounterDifficulty.DEADLY)
        assert deadly.label == "Deadly"

    def test_level_20_thresholds(self):
        """The top row of the 2014 table: 2800 / 5700 / 8500 / 12700 per character."""
        r = calculate_difficulty_2014([20], [])
        assert (r.low_threshold, r.moderate_threshold, r.high_threshold, r.deadly_threshold) == (
            2800,
            5700,
            8500,
            12700,
        )
        assert r.adjusted_xp == 0

    def test_2014_rejects_bad_levels(self):
        """Levels outside 1–20 raise, as in 2024."""
        with pytest.raises(ValueError):
            calculate_difficulty([0, 3], [200], "2014")

    def test_2024_results_unchanged(self):
        """The same fight on the 2024 rules: raw XP, no multiplier, Low — as before."""
        default = calculate_difficulty([3, 3, 3, 3], [200, 200])
        explicit = calculate_difficulty([3, 3, 3, 3], [200, 200], "2024")
        assert default == explicit
        assert default.raw_xp == default.adjusted_xp == 400
        assert default.multiplier == 1.0
        assert (default.low_threshold, default.moderate_threshold, default.high_threshold) == (
            600,
            900,
            1600,
        )
        assert default.deadly_threshold == 2400
        assert default.difficulty == EncounterDifficulty.LOW
        assert default.label == "Low"
        assert default.ruleset == "2024"


# ── Encounter service ─────────────────────────────────────────────────────────


def _adventure(db, cid, dm):
    return adv_svc.create_adventure(
        db,
        campaign_id=cid,
        title="The Old Mill",
        synopsis="Bandits hole up in the mill above the river.",
        tier=AdventureTier.TIER1,
        act_count=3,
        dm_email=dm,
    )


def _cr1(db):
    return MonsterRepo.create(
        db,
        MonsterStatBlockCreate(
            name=f"Brute {uuid.uuid4().hex[:6]}",
            size="Medium",
            creature_type="Humanoid",
            ac=13,
            hp_average=30,
            hp_formula="5d8+8",
            score_str=15,
            score_dex=12,
            score_con=14,
            score_int=8,
            score_wis=10,
            score_cha=8,
            challenge_rating="1",
            xp=200,
            proficiency_bonus=2,
            speed={"walk": 30},
        ),
    )


def _party_and_roster(db, ruleset: str):
    dm = _dm()
    c = _campaign(db, dm, ruleset)
    adv = _adventure(db, c.id, dm)
    for i in range(4):
        _pc(db, c.id, dm, name=f"PC{i}")
    brute = _cr1(db)
    return dm, adv, [{"monster_id": str(brute.id), "count": 2}]


class TestEncounterService:
    """The encounter builder uses the campaign's rules."""

    def test_preview_in_a_2014_campaign(self, duckdb_session: Session):
        """The live meter gets 2014 thresholds, the multiplier and the 2014 label."""
        dm, adv, roster = _party_and_roster(duckdb_session, "2014")
        p = enc_svc.preview_difficulty(duckdb_session, adv.id, roster, dm)
        assert p["ruleset"] == "2014"
        assert p["party_levels"] == [3, 3, 3, 3]
        assert (p["raw_xp"], p["multiplier"], p["adjusted_xp"]) == (400, 1.5, 600)
        assert (p["low_threshold"], p["moderate_threshold"]) == (300, 600)
        assert (p["high_threshold"], p["deadly_threshold"]) == (900, 1600)
        assert p["difficulty"] == "Moderate"
        assert p["difficulty_label"] == "Medium"

    def test_preview_in_a_2024_campaign_is_unchanged(self, duckdb_session: Session):
        """A 2024 campaign's preview has the same numbers as before Plan 131."""
        dm, adv, roster = _party_and_roster(duckdb_session, "2024")
        p = enc_svc.preview_difficulty(duckdb_session, adv.id, roster, dm)
        assert p["ruleset"] == "2024"
        assert (p["raw_xp"], p["multiplier"], p["adjusted_xp"]) == (400, 1.0, 400)
        assert (p["low_threshold"], p["moderate_threshold"]) == (600, 900)
        assert (p["high_threshold"], p["deadly_threshold"]) == (1600, 2400)
        assert p["difficulty"] == p["difficulty_label"] == "Low"

    @pytest.mark.parametrize(
        "ruleset,budget,band",
        [("2014", 600, EncounterDifficulty.MODERATE), ("2024", 400, EncounterDifficulty.LOW)],
    )
    def test_saved_encounter_uses_the_campaign_rules(
        self, duckdb_session: Session, ruleset: str, budget: int, band
    ):
        """Create and roster-update both store the edition's budget and band."""
        dm, adv, roster = _party_and_roster(duckdb_session, ruleset)
        made = enc_svc.create_encounter(
            duckdb_session,
            adv.id,
            "Mill ambush",
            dm,
            monster_roster=roster,
            pc_levels=[3, 3, 3, 3],
        )
        assert (made.xp_budget, made.difficulty) == (budget, band)

        from domain.encounter import EncounterUpdate

        empty = enc_svc.create_encounter(duckdb_session, adv.id, "Later", dm)
        updated = enc_svc.update_encounter(
            duckdb_session,
            empty.id,
            dm,
            EncounterUpdate(monster_roster=roster),
            pc_levels=[3, 3, 3, 3],
        )
        assert (updated.xp_budget, updated.difficulty) == (budget, band)
