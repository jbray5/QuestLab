"""Tests for services/ai_service.py — all Claude-powered generators.

All Claude API calls are mocked so no real API key is needed. Mocking targets the
functions in integrations.claude_client that ai_service imports from.
"""

import json
import uuid
from unittest.mock import patch

import pytest
from sqlmodel import Session

import services.adventure_service as adv_svc
import services.ai_service as ai_svc
import services.campaign_service as camp_svc
import services.session_service as sess_svc
from db.repos.character_repo import CharacterRepo
from db.repos.encounter_repo import EncounterRepo
from db.repos.monster_repo import MonsterRepo
from domain.character import PlayerCharacterCreate as CharacterCreate
from domain.encounter import EncounterCreate
from domain.enums import AdventureTier, CharacterClass, EncounterDifficulty
from domain.monster import MonsterStatBlockCreate

# ---------------------------------------------------------------------------
# Constants — valid fixture JSON that matches internal Pydantic schemas
# ---------------------------------------------------------------------------

_RUNBOOK_JSON = json.dumps(
    {
        "opening_scene": "The tavern door creaks open.",
        "scenes": [
            {
                "title": "The Ambush",
                "read_aloud": "Shadows move between the trees.",
                "dm_notes": "Goblins strike on round 2.",
                "estimated_minutes": 30,
            }
        ],
        "npc_dialog": [
            {
                "npc_name": "Bragnar",
                "lines": ["Welcome, heroes.", "Beware the dark."],
                "improv_hooks": ["If PCs ignore him, he coughs dramatically."],
            }
        ],
        "encounter_flows": [
            {
                "encounter_name": "Goblin Ambush",
                "round_by_round": ["Round 1: Goblins hide.", "Round 2: Goblins attack."],
                "tactics": "Focus fire on the healer.",
                "terrain_notes": "Trees provide half cover.",
            }
        ],
        "closing_hooks": "The party finds a mysterious map.",
        "xp_awards": {"base_award": 500, "bonus_award": 100},
        "loot_notes": "A +1 shortsword hidden in the bandit camp.",
    }
)

_LOOT_JSON = json.dumps(
    {
        "entries": [
            {
                "name": "Healing Potion",
                "rarity": "Common",
                "description": "Restores 2d4+2 HP.",
                "value_gp": 50,
                "quantity": 2,
            },
            {
                "name": "Gold Coins",
                "rarity": "Common",
                "description": "Standard currency.",
                "value_gp": 100,
                "quantity": 1,
            },
        ]
    }
)

_NPC_JSON = json.dumps(
    {
        "name": "Mira Ashvale",
        "appearance": "Tall woman with silver-streaked hair.",
        "personality": "Cautious but kind.",
        "secret": "She is a retired assassin.",
        "dialog_hooks": [
            "Ask about the scar on her hand.",
            "Mention the king.",
            "Offer gold.",
            "Threaten her.",
            "Praise her cooking.",
        ],
    }
)

_DIALOG_JSON = json.dumps(
    {
        "lines": ["Stand back!", "I warned you.", "This ends now."],
        "improv_hooks": ["If PCs flatter him, he hesitates.", "If attacked, he retreats."],
    }
)


# ---------------------------------------------------------------------------
# DB helpers (reuse pattern from other test files)
# ---------------------------------------------------------------------------


def _unique_dm() -> str:
    """Return a unique DM email per test."""
    return f"dm_{uuid.uuid4().hex[:8]}@example.com"


def _make_campaign(session: Session, dm_email: str):
    """Create a minimal test campaign."""
    return camp_svc.create_campaign(
        session,
        name="Test Campaign",
        setting="Forgotten Realms",
        tone="Epic",
        dm_email=dm_email,
    )


def _make_adventure(session: Session, campaign_id: uuid.UUID, dm_email: str):
    """Create a minimal test adventure."""
    return adv_svc.create_adventure(
        session,
        campaign_id=campaign_id,
        title="Test Adventure",
        tier=AdventureTier.TIER2,
        dm_email=dm_email,
        synopsis="A thrilling adventure.",
    )


def _make_session(
    session: Session,
    adventure_id: uuid.UUID,
    dm_email: str,
    session_number: int = 1,
) -> object:
    """Create a minimal test game session."""
    return sess_svc.create_session(
        session,
        adventure_id=adventure_id,
        session_number=session_number,
        title=f"Session {session_number}",
        dm_email=dm_email,
    )


def _make_character(db: Session, campaign_id: uuid.UUID) -> object:
    """Insert a minimal PC and return it."""
    payload = CharacterCreate(
        campaign_id=campaign_id,
        character_name="Aldric",
        player_name="Alice",
        race="Human",
        character_class=CharacterClass.FIGHTER,
        level=5,
        hp_max=52,
        hp_current=52,
        ac=18,
        speed=30,
        score_str=16,
        score_dex=12,
        score_con=14,
        score_int=10,
        score_wis=10,
        score_cha=10,
    )
    return CharacterRepo.create(db, payload)


def _make_monster(db: Session, name: str = "Test Goblin", cr: str = "1/4") -> uuid.UUID:
    """Insert a minimal monster stat block and return its ID."""
    xp_map = {"1/4": 50, "1": 200, "5": 1800}
    payload = MonsterStatBlockCreate(
        name=name,
        size="Small",
        creature_type="Humanoid",
        ac=15,
        hp_average=7,
        hp_formula="2d6",
        score_str=8,
        score_dex=14,
        score_con=10,
        score_int=10,
        score_wis=8,
        score_cha=8,
        challenge_rating=cr,
        xp=xp_map.get(cr, 50),
        proficiency_bonus=2,
        speed={"walk": 30},
    )
    m = MonsterRepo.create(db, payload)
    return m.id


def _make_encounter(db: Session, adventure_id: uuid.UUID) -> object:
    """Insert a minimal encounter."""
    payload = EncounterCreate(
        adventure_id=adventure_id,
        name="Goblin Ambush",
        difficulty=EncounterDifficulty.LOW,
        xp_budget=0,
    )
    return EncounterRepo.create(db, payload)


# ---------------------------------------------------------------------------
# generate_session_runbook
# ---------------------------------------------------------------------------


class TestGenerateSessionRunbook:
    """Tests for ai_service.generate_session_runbook."""

    def test_returns_runbook_create(self, duckdb_session: Session):
        """Happy path: mocked complete_json returns valid JSON → SessionRunbookCreate."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)

        with patch("services.ai_service.complete_json", return_value=_parse_runbook()) as mock_cj:
            result = ai_svc.generate_session_runbook(duckdb_session, gs.id, dm)

        mock_cj.assert_called_once()
        assert result.session_id == gs.id
        assert result.opening_scene == "The tavern door creaks open."
        assert len(result.scenes) == 1
        assert result.scenes[0]["title"] == "The Ambush"
        assert result.model_used == "claude-opus-4-6"

    def test_includes_encounter_and_pc_context(self, duckdb_session: Session):
        """Prompt includes encounter and PC info when they exist."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        _make_character(duckdb_session, c.id)
        _make_encounter(duckdb_session, adv.id)
        gs = _make_session(duckdb_session, adv.id, dm)

        captured_calls = []

        def capture_call(**kwargs):
            """Capture the system prompt for inspection."""
            captured_calls.append(kwargs.get("system", ""))
            return _parse_runbook()

        with patch("services.ai_service.complete_json", side_effect=capture_call):
            ai_svc.generate_session_runbook(duckdb_session, gs.id, dm)

        assert captured_calls, "complete_json was not called"
        system_prompt = captured_calls[0]
        assert "Aldric" in system_prompt or "FIGHTER" in system_prompt.upper()
        assert "Goblin Ambush" in system_prompt

    def test_missing_session_raises_value_error(self, duckdb_session: Session):
        """Non-existent session_id raises ValueError."""
        dm = _unique_dm()
        with pytest.raises(ValueError, match="not found"):
            ai_svc.generate_session_runbook(duckdb_session, uuid.uuid4(), dm)

    def test_wrong_owner_raises_permission_error(self, duckdb_session: Session):
        """DM who doesn't own the campaign gets PermissionError."""
        dm1 = _unique_dm()
        dm2 = _unique_dm()
        c = _make_campaign(duckdb_session, dm1)
        adv = _make_adventure(duckdb_session, c.id, dm1)
        gs = _make_session(duckdb_session, adv.id, dm1)

        with patch("services.ai_service.complete_json", return_value=_parse_runbook()):
            with pytest.raises(PermissionError):
                ai_svc.generate_session_runbook(duckdb_session, gs.id, dm2)

    def test_extra_notes_included_in_prompt(self, duckdb_session: Session):
        """extra_notes appear in the system prompt sent to Claude."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)

        captured = []

        def capture(**kwargs):
            captured.append(kwargs.get("system", ""))
            return _parse_runbook()

        with patch("services.ai_service.complete_json", side_effect=capture):
            ai_svc.generate_session_runbook(
                duckdb_session, gs.id, dm, extra_notes="Focus on the mystery of the lost relic."
            )

        assert "Focus on the mystery of the lost relic." in captured[0]


# ---------------------------------------------------------------------------
# generate_loot_table
# ---------------------------------------------------------------------------


class TestGenerateLootTable:
    """Tests for ai_service.generate_loot_table."""

    def test_returns_list_of_dicts(self):
        """Happy path: two loot entries returned as list of dicts."""
        with patch("services.ai_service.complete_json", return_value=_parse_loot()):
            result = ai_svc.generate_loot_table("Tier2", avg_cr=3.0, num_entries=2)

        assert isinstance(result, list)
        assert len(result) == 2
        assert result[0]["name"] == "Healing Potion"
        assert result[0]["value_gp"] == 50

    def test_entry_has_required_keys(self):
        """Each loot entry dict has all required keys."""
        with patch("services.ai_service.complete_json", return_value=_parse_loot()):
            result = ai_svc.generate_loot_table("Tier1")

        for entry in result:
            for key in ("name", "rarity", "description", "value_gp", "quantity"):
                assert key in entry, f"Missing key: {key}"


# ---------------------------------------------------------------------------
# generate_npc
# ---------------------------------------------------------------------------


class TestGenerateNpc:
    """Tests for ai_service.generate_npc."""

    def test_returns_dict_with_expected_keys(self):
        """NPC dict has name, appearance, personality, secret, dialog_hooks."""
        with patch("services.ai_service.complete_json", return_value=_parse_npc()):
            result = ai_svc.generate_npc(role="innkeeper", setting="Waterdeep", tone="gritty")

        assert result["name"] == "Mira Ashvale"
        assert isinstance(result["dialog_hooks"], list)
        assert len(result["dialog_hooks"]) == 5


# ---------------------------------------------------------------------------
# generate_npc_dialog
# ---------------------------------------------------------------------------


class TestGenerateNpcDialog:
    """Tests for ai_service.generate_npc_dialog."""

    def test_returns_lines_and_hooks(self):
        """Returns dialog lines plus [Hook] prefixed improv hooks."""
        with patch("services.ai_service.complete_json", return_value=_parse_dialog()):
            result = ai_svc.generate_npc_dialog(
                npc_name="Lord Varyn",
                personality="Cold and calculating.",
                context="The villain confronts the party.",
            )

        assert "Stand back!" in result
        hook_entries = [r for r in result if r.startswith("[Hook]")]
        assert len(hook_entries) == 2


# ---------------------------------------------------------------------------
# generate_monster_flavor
# ---------------------------------------------------------------------------


class TestGenerateMonsterFlavor:
    """Tests for ai_service.generate_monster_flavor."""

    def test_returns_string(self):
        """Flavor text is returned as a plain string."""
        with patch(
            "services.ai_service.complete",
            return_value="A massive creature fills the doorway.",
        ):
            result = ai_svc.generate_monster_flavor(
                monster_name="Troll",
                setting_context="Underground lair.",
                tone="horror",
            )

        assert isinstance(result, str)
        assert "massive creature" in result


# ---------------------------------------------------------------------------
# generate_adventure_hook
# ---------------------------------------------------------------------------


class TestGenerateAdventureHook:
    """Tests for ai_service.generate_adventure_hook."""

    def test_returns_string(self):
        """Adventure hook is returned as a plain string."""
        expected = "A mysterious stranger arrives at the village gate."
        with patch("services.ai_service.complete", return_value=expected):
            result = ai_svc.generate_adventure_hook(
                campaign_setting="Forgotten Realms",
                tier="Tier2",
                tone="high adventure",
                campaign_name="The Shattered Spire",
            )

        assert result == expected


# ---------------------------------------------------------------------------
# API key missing — PermissionError propagation
# ---------------------------------------------------------------------------


class TestApiKeyMissing:
    """Claude client raises PermissionError when API key is not set."""

    def test_generate_monster_flavor_propagates_permission_error(self):
        """PermissionError from complete() bubbles up to the caller."""
        with patch(
            "services.ai_service.complete",
            side_effect=PermissionError("ANTHROPIC_API_KEY is not configured."),
        ):
            with pytest.raises(PermissionError, match="ANTHROPIC_API_KEY"):
                ai_svc.generate_monster_flavor("Dragon", "Mountain lair")

    def test_generate_loot_table_propagates_permission_error(self):
        """PermissionError from complete_json() bubbles up to the caller."""
        with patch(
            "services.ai_service.complete_json",
            side_effect=PermissionError("ANTHROPIC_API_KEY is not configured."),
        ):
            with pytest.raises(PermissionError, match="ANTHROPIC_API_KEY"):
                ai_svc.generate_loot_table("Tier1")


# ---------------------------------------------------------------------------
# Internal parse helpers — construct Pydantic objects from fixture JSON
# ---------------------------------------------------------------------------


def _parse_runbook():
    """Return a _RunbookOutput instance parsed from fixture JSON."""
    from services.ai_service import _RunbookOutput  # noqa: PLC0415

    return _RunbookOutput.model_validate_json(_RUNBOOK_JSON)


def _parse_loot():
    """Return a _LootOutput instance parsed from fixture JSON."""
    from services.ai_service import _LootOutput  # noqa: PLC0415

    return _LootOutput.model_validate_json(_LOOT_JSON)


def _parse_npc():
    """Return a _NPCOutput instance parsed from fixture JSON."""
    from services.ai_service import _NPCOutput  # noqa: PLC0415

    return _NPCOutput.model_validate_json(_NPC_JSON)


def _parse_dialog():
    """Return a _DialogOutput-like object parsed from fixture JSON."""
    import json

    from pydantic import BaseModel

    class _D(BaseModel):
        lines: list[str]
        improv_hooks: list[str]

    return _D.model_validate(json.loads(_DIALOG_JSON))
