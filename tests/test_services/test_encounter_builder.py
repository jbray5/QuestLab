"""Tests for the Plan 00031 encounter-builder helpers.

Covers ``preview_difficulty`` — the live difficulty meter's XP math, without
persisting. (The AI monster suggestions went in Plan 124.)
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
