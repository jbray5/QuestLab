"""Plan 43 tests — generate_dm_brief service (the glanceable, not read-aloud, contract).

The AI call is mocked at the claude_client seam (services.ai_service.complete_structured),
so no network is touched. These lock the shape: beats carry machine triggers, NPCs carry
play-faces, spotlight is per-PC, and NOTHING is a read-aloud scene.
"""

import json
import uuid

import pytest
from sqlmodel import Session

import services.adventure_service as adv_svc
import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.session_brief_service as brief_svc
import services.session_service as sess_svc
from domain.enums import CharacterClass
from domain.session_brief import Beat, NpcFace, Road, Spotlight
from integrations import claude_client
from services.ai_service import _BriefOutput


def _dm() -> str:
    return f"dm_{uuid.uuid4().hex[:8]}@example.com"


def _campaign_and_session(db: Session, dm: str):
    campaign = camp_svc.create_campaign(db, name="C", setting="R", tone="dark fantasy", dm_email=dm)
    adventure = adv_svc.create_adventure(
        db,
        campaign_id=campaign.id,
        title="Adv",
        synopsis="s",
        tier="Tier1",
        act_count=3,
        dm_email=dm,
    )
    gs = sess_svc.create_session(
        db,
        adventure_id=adventure.id,
        session_number=3,
        title="The Morning After",
        dm_email=dm,
        date_planned=None,
        attending_pc_ids=[],
    )
    return campaign, adventure, gs


def _make_pc(db: Session, campaign_id: uuid.UUID, dm: str, name: str = "Creed"):
    return char_svc.create_character(
        db,
        campaign_id=campaign_id,
        dm_email=dm,
        player_name="Cory",
        character_name=name,
        race="Human",
        character_class=CharacterClass.PALADIN,
        level=2,
        score_str=16,
        score_dex=10,
        score_con=14,
        score_int=10,
        score_wis=12,
        score_cha=14,
        hp_max=20,
        hp_current=20,
        ac=18,
        speed=30,
    )


def _fake_brief(*_args, **_kwargs) -> _BriefOutput:
    """Stand-in for the AI call — a glanceable brief, never a read-aloud runbook."""
    return _BriefOutput(
        cold_open="Dawn. The silver light is back, soft and ordinary.",
        premise="Let them have the win, then complicate it quietly.",
        danger_dial="Keep it scary, not a TPK — a downed PC is drama.",
        fallback="Print this sheet; it runs off paper alone.",
        beats=[
            Beat(
                title="The lucid flicker",
                cue="The bark stills; she finds Thane's face for one breath.",
                kind="combat",
                trigger_kind="hp_lte",
                trigger_value=25,
                target="Wenneth",
                spotlight_pc="Thane",
                dm_note="Slow down. Let it land.",
            ),
            Beat(
                title="The grove dies",
                cue="-2 HP at the start of her turn.",
                kind="clock",
                trigger_kind="round_gte",
                trigger_value=5,
            ),
        ],
        npc_faces=[
            NpcFace(
                name="Belva",
                quick_who="British innkeeper, warm and game",
                want_now="patch her wall, feed the town",
                knows=["the festival saved Hollowmere"],
                voice="'oooh — well there's me deposit gone'",
                secret_short="",
            )
        ],
        spotlight=[Spotlight(pc_name="Creed", flag="You held the breach — the paladin's dream.")],
        roads=[
            Road(
                label="South — the Silverway",
                flavor="toward the city, where Halve also walked",
                pull="Thane's compass",
            )
        ],
    )


class TestGenerateBrief:
    """generate_brief persists a glanceable brief with the session-2 shape."""

    def test_generate_and_read(self, duckdb_session: Session, monkeypatch):
        """A generated brief persists with beats, play-faces, spotlight, and roads."""
        monkeypatch.setattr("services.ai_service.complete_structured", _fake_brief)
        dm = _dm()
        campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        _make_pc(duckdb_session, campaign.id, dm)

        brief = brief_svc.generate_brief(duckdb_session, gs.id, dm, notes="morning after")
        assert brief.model_used == claude_client.DEFAULT_MODEL
        assert brief.cold_open.startswith("Dawn.")

        read = brief_svc.get_brief(duckdb_session, gs.id, dm)
        assert read is not None
        assert read.beats[0]["trigger_kind"] == "hp_lte"
        assert read.beats[0]["trigger_value"] == 25
        assert read.npc_faces[0]["quick_who"].startswith("British")
        assert read.spotlight[0]["pc_name"] == "Creed"
        assert read.roads[0]["label"].startswith("South")

    def test_brief_is_glanceable_not_read_aloud(self, duckdb_session: Session, monkeypatch):
        """The persisted brief carries NO read-aloud scene fields — cues only."""
        monkeypatch.setattr("services.ai_service.complete_structured", _fake_brief)
        dm = _dm()
        _campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        brief = brief_svc.generate_brief(duckdb_session, gs.id, dm)
        blob = json.dumps(
            {"beats": brief.beats, "faces": brief.npc_faces, "spotlight": brief.spotlight}
        )
        assert "read_aloud" not in blob
        assert "scenes" not in blob
        # every beat is a short cue, not a paragraph script
        assert all("cue" in b for b in brief.beats)

    def test_regenerate_overwrites(self, duckdb_session: Session, monkeypatch):
        """Generating twice replaces the prior brief (1:1 with the session)."""
        monkeypatch.setattr("services.ai_service.complete_structured", _fake_brief)
        dm = _dm()
        _campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        first = brief_svc.generate_brief(duckdb_session, gs.id, dm)
        second = brief_svc.generate_brief(duckdb_session, gs.id, dm)
        assert first.id != second.id
        # still only one brief for the session
        assert brief_svc.get_brief(duckdb_session, gs.id, dm).id == second.id

    def test_non_owner_denied(self, duckdb_session: Session, monkeypatch):
        """A DM who doesn't own the campaign cannot generate a brief."""
        monkeypatch.setattr("services.ai_service.complete_structured", _fake_brief)
        dm = _dm()
        _campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        with pytest.raises(PermissionError):
            brief_svc.generate_brief(duckdb_session, gs.id, _dm())


class TestUpdateBrief:
    """Inline edits to a generated brief."""

    def test_edit_cold_open(self, duckdb_session: Session, monkeypatch):
        """Patching cold_open updates only that field."""
        from domain.session_brief import SessionBriefUpdate

        monkeypatch.setattr("services.ai_service.complete_structured", _fake_brief)
        dm = _dm()
        _campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        brief_svc.generate_brief(duckdb_session, gs.id, dm)
        updated = brief_svc.update_brief(
            duckdb_session, gs.id, dm, SessionBriefUpdate(cold_open="A colder open.")
        )
        assert updated.cold_open == "A colder open."
        assert updated.premise.startswith("Let them have the win")  # untouched

    def test_update_without_brief_raises(self, duckdb_session: Session):
        """Editing before any brief exists raises ValueError."""
        from domain.session_brief import SessionBriefUpdate

        dm = _dm()
        _campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        with pytest.raises(ValueError):
            brief_svc.update_brief(duckdb_session, gs.id, dm, SessionBriefUpdate(premise="x"))
