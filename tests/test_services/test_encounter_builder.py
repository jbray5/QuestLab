"""Tests for the Plan 00031 encounter-builder helpers.

Covers:
- ``preview_difficulty`` — XP math without persisting.
- ``suggest_themed_monsters`` — orchestrates the AI call + name-to-id
  hydration. The AI call itself is monkey-patched so tests don't hit the
  network or require ANTHROPIC_API_KEY.
"""

import uuid

import pytest
from sqlmodel import Session

import services.adventure_service as adv_svc
import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.encounter_service as enc_svc
from db.repos.monster_repo import MonsterRepo
from domain.enums import AdventureTier, CharacterClass
from domain.monster import MonsterStatBlockCreate


def _dm() -> str:
    return f"dm_{uuid.uuid4().hex[:8]}@example.com"


def _campaign(db, dm):
    return camp_svc.create_campaign(
        db, name="Crypt of Shadows", setting="Forgotten Realms", tone="Gothic", dm_email=dm
    )


def _adventure(db, cid, dm, *, title: str = "The Whispering Crypt"):
    return adv_svc.create_adventure(
        db,
        campaign_id=cid,
        title=title,
        synopsis="A forgotten crypt beneath the chapel. Cold, candle-lit, restless dead.",
        tier=AdventureTier.TIER1,
        act_count=3,
        dm_email=dm,
        location_notes="Damp catacombs lined with marble sarcophagi.",
    )


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
        score_str=14,
        score_dex=12,
        score_con=14,
        score_int=10,
        score_wis=10,
        score_cha=10,
        hp_max=24,
        hp_current=24,
        ac=15,
        speed=30,
    )


def _monster(db, name: str, cr: str = "1/4"):
    xp_map = {"0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "5": 1800}
    payload = MonsterStatBlockCreate(
        name=name,
        size="Medium",
        creature_type="Undead",
        ac=12,
        hp_average=22,
        hp_formula="5d8",
        score_str=10,
        score_dex=12,
        score_con=10,
        score_int=6,
        score_wis=10,
        score_cha=6,
        challenge_rating=cr,
        xp=xp_map.get(cr, 50),
        proficiency_bonus=2,
        speed={"walk": 30},
    )
    return MonsterRepo.create(db, payload)


class TestPreviewDifficulty:
    """preview_difficulty runs the math without persisting."""

    def test_empty_roster(self, duckdb_session: Session):
        """No monsters, 4 PCs at L3 → trivial / Low difficulty."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        adv = _adventure(duckdb_session, c.id, dm)
        for i in range(4):
            _pc(duckdb_session, c.id, dm, name=f"PC{i}")
        result = enc_svc.preview_difficulty(duckdb_session, adv.id, [], dm)
        assert result["raw_xp"] == 0
        assert result["adjusted_xp"] == 0
        assert result["party_levels"] == [3, 3, 3, 3]
        # 4 × 75 = 300 medium threshold (per 2024 DMG table used in
        # integrations.dnd_rules.encounter_math).
        assert result["moderate_threshold"] >= 300

    def test_one_monster(self, duckdb_session: Session):
        """One CR-1 skeleton (200 XP) for a 4-PC L3 party → some difficulty value."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        adv = _adventure(duckdb_session, c.id, dm)
        for i in range(4):
            _pc(duckdb_session, c.id, dm, name=f"PC{i}")
        skel = _monster(duckdb_session, "Skeleton", cr="1/4")
        result = enc_svc.preview_difficulty(
            duckdb_session, adv.id, [{"monster_id": str(skel.id), "count": 1}], dm
        )
        assert result["raw_xp"] == 50
        # Adjusted may include multiplier depending on count; raw is fixed.
        assert result["difficulty"] in ("Low", "Moderate", "High", "Deadly")

    def test_party_empty_returns_difficulty_null(self, duckdb_session: Session):
        """No PCs means we can't compute thresholds — difficulty is null."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        adv = _adventure(duckdb_session, c.id, dm)
        skel = _monster(duckdb_session, "Skeleton", cr="1/4")
        result = enc_svc.preview_difficulty(
            duckdb_session, adv.id, [{"monster_id": str(skel.id), "count": 1}], dm
        )
        assert result["party_levels"] == []
        assert result["difficulty"] is None
        assert result["raw_xp"] == 50

    def test_invalid_monster_id_silently_dropped(self, duckdb_session: Session):
        """Bad UUIDs in the roster are ignored, not raised."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        adv = _adventure(duckdb_session, c.id, dm)
        _pc(duckdb_session, c.id, dm)
        result = enc_svc.preview_difficulty(
            duckdb_session,
            adv.id,
            [{"monster_id": "not-a-uuid", "count": 2}],
            dm,
        )
        assert result["raw_xp"] == 0

    def test_non_owner_denied(self, duckdb_session: Session):
        """Another DM can't preview encounters for someone else's adventure."""
        dm1, dm2 = _dm(), _dm()
        c = _campaign(duckdb_session, dm1)
        adv = _adventure(duckdb_session, c.id, dm1)
        with pytest.raises(PermissionError):
            enc_svc.preview_difficulty(duckdb_session, adv.id, [], dm2)


class TestSuggestThemedMonsters:
    """suggest_themed_monsters orchestrates the AI call."""

    def test_hydrates_monster_ids_from_names(self, duckdb_session: Session, monkeypatch):
        """AI returns names; the service maps each to a monster UUID."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        adv = _adventure(duckdb_session, c.id, dm)
        # 4-PC party so the test's "3 skeletons + 1 ghoul" suggestion
        # lands inside the Moderate band and isn't trimmed by the
        # Plan-31 safety net.
        for i in range(4):
            _pc(duckdb_session, c.id, dm, name=f"PC{i}")
        ghoul = _monster(duckdb_session, "Ghoul", cr="1")
        skeleton = _monster(duckdb_session, "Skeleton", cr="1/4")
        _monster(duckdb_session, "Goblin", cr="1/4")  # in pool but not chosen

        def fake_ai(**kwargs):
            return {
                "encounter_concept": (
                    "Skeletons rise from cracked sarcophagi as a ghoul lurks behind."
                ),
                "suggestions": [
                    {
                        "monster_name": "Skeleton",
                        "count": 3,
                        "rationale": "Fills the crypt with menace.",
                    },
                    {"monster_name": "Ghoul", "count": 1, "rationale": "A lurking centerpiece."},
                ],
            }

        from services import ai_service

        monkeypatch.setattr(ai_service, "suggest_themed_monsters", fake_ai)

        result = enc_svc.suggest_themed_monsters(duckdb_session, adv.id, dm, "Moderate")
        assert result["encounter_concept"].startswith("Skeletons")
        names = [s["monster_name"] for s in result["suggestions"]]
        assert "Skeleton" in names and "Ghoul" in names
        # Skeleton ID is the one we created above.
        skel_entry = next(s for s in result["suggestions"] if s["monster_name"] == "Skeleton")
        assert skel_entry["monster_id"] == str(skeleton.id)
        assert skel_entry["count"] == 3
        ghoul_entry = next(s for s in result["suggestions"] if s["monster_name"] == "Ghoul")
        assert ghoul_entry["monster_id"] == str(ghoul.id)

    def test_unknown_names_silently_dropped(self, duckdb_session: Session, monkeypatch):
        """AI returning a name we don't have just gets filtered out."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        adv = _adventure(duckdb_session, c.id, dm)
        _pc(duckdb_session, c.id, dm)
        _monster(duckdb_session, "Skeleton", cr="1/4")

        def fake_ai(**kwargs):
            return {
                "encounter_concept": "test",
                "suggestions": [
                    {"monster_name": "Skeleton", "count": 1, "rationale": "fits"},
                    {"monster_name": "Beholder", "count": 1, "rationale": "noise"},
                ],
            }

        from services import ai_service

        monkeypatch.setattr(ai_service, "suggest_themed_monsters", fake_ai)

        result = enc_svc.suggest_themed_monsters(duckdb_session, adv.id, dm, "Moderate")
        assert len(result["suggestions"]) == 1
        assert result["suggestions"][0]["monster_name"] == "Skeleton"

    def test_name_match_is_case_insensitive(self, duckdb_session: Session, monkeypatch):
        """Minor capitalization drift in AI output still resolves."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        adv = _adventure(duckdb_session, c.id, dm)
        _pc(duckdb_session, c.id, dm)
        _monster(duckdb_session, "Skeleton", cr="1/4")

        def fake_ai(**kwargs):
            return {
                "encounter_concept": "...",
                "suggestions": [
                    {"monster_name": "skeleton", "count": 1, "rationale": "fits"},
                ],
            }

        from services import ai_service

        monkeypatch.setattr(ai_service, "suggest_themed_monsters", fake_ai)

        result = enc_svc.suggest_themed_monsters(duckdb_session, adv.id, dm, "Moderate")
        assert len(result["suggestions"]) == 1
        assert result["suggestions"][0]["monster_name"] == "Skeleton"

    def test_non_owner_denied(self, duckdb_session: Session, monkeypatch):
        """A DM who doesn't own the campaign can't request suggestions."""
        dm1, dm2 = _dm(), _dm()
        c = _campaign(duckdb_session, dm1)
        adv = _adventure(duckdb_session, c.id, dm1)
        with pytest.raises(PermissionError):
            enc_svc.suggest_themed_monsters(duckdb_session, adv.id, dm2, "Moderate")


class TestSuggestionOvershoot:
    """Plan 31 bugfix — the AI sometimes overshoots; the service must trim."""

    def _setup_party_l3x4(self, db):
        """4-PC level-3 party — Moderate threshold = 600 XP (75×4×… per the 2024 table)."""
        dm = _dm()
        c = _campaign(db, dm)
        adv = _adventure(db, c.id, dm)
        for i in range(4):
            _pc(db, c.id, dm, name=f"PC{i}")
        return dm, c, adv

    def test_trims_when_ai_overshoots(self, duckdb_session: Session, monkeypatch):
        """AI returns 4 CR-1 monsters (200 XP × 4 × 2 mult = 1600 adj > Moderate hi).

        The service should reduce counts so the projected adjusted XP
        no longer exceeds the Moderate band's upper bound.
        """
        dm, _c, adv = self._setup_party_l3x4(duckdb_session)
        _monster(duckdb_session, "Ghoul", cr="1")
        _monster(duckdb_session, "Skeleton", cr="1/4")

        def fake_ai(**kwargs):
            # 4 ghouls = 800 raw × 2.0 multiplier = 1600 adjusted. Way
            # over Moderate (which tops out at the High threshold).
            return {
                "encounter_concept": "Way too many ghouls.",
                "suggestions": [
                    {"monster_name": "Ghoul", "count": 4, "rationale": "test"},
                ],
            }

        from services import ai_service

        monkeypatch.setattr(ai_service, "suggest_themed_monsters", fake_ai)

        result = enc_svc.suggest_themed_monsters(duckdb_session, adv.id, dm, "Moderate")
        # We should have at most 2 ghouls left (200 × 2 × 1.5 mult = 600).
        total_count = sum(s["count"] for s in result["suggestions"])
        assert (
            total_count <= 3
        ), f"Service did not trim overbudget suggestions: {result['suggestions']}"

    def test_does_not_trim_when_within_band(self, duckdb_session: Session, monkeypatch):
        """AI returns picks that already fit — service leaves them alone."""
        dm, _c, adv = self._setup_party_l3x4(duckdb_session)
        _monster(duckdb_session, "Skeleton", cr="1/4")

        def fake_ai(**kwargs):
            # 3 skeletons = 150 raw × 2.0 = 300 adj — well inside Low/Moderate.
            return {
                "encounter_concept": "Reasonable encounter.",
                "suggestions": [
                    {"monster_name": "Skeleton", "count": 3, "rationale": "test"},
                ],
            }

        from services import ai_service

        monkeypatch.setattr(ai_service, "suggest_themed_monsters", fake_ai)

        result = enc_svc.suggest_themed_monsters(duckdb_session, adv.id, dm, "Moderate")
        # Unchanged — count stays at 3.
        assert result["suggestions"][0]["count"] == 3

    def test_passes_budget_to_ai_service(self, duckdb_session: Session, monkeypatch):
        """Service must include a numeric budget in the AI call kwargs."""
        dm, _c, adv = self._setup_party_l3x4(duckdb_session)
        _monster(duckdb_session, "Skeleton", cr="1/4")
        captured: dict = {}

        def fake_ai(**kwargs):
            captured.update(kwargs)
            return {"encounter_concept": "", "suggestions": []}

        from services import ai_service

        monkeypatch.setattr(ai_service, "suggest_themed_monsters", fake_ai)

        enc_svc.suggest_themed_monsters(duckdb_session, adv.id, dm, "Moderate")
        assert "budget" in captured and captured["budget"] is not None
        b = captured["budget"]
        assert b["target_raw_xp_min"] > 0
        assert b["target_raw_xp_max"] > b["target_raw_xp_min"]
        assert "Moderate" in b["adjusted_xp_band"]
