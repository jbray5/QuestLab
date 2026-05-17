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
        _pc(duckdb_session, c.id, dm)
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
