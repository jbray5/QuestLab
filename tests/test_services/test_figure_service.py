"""Plan 45 tests — transparent minifig figure generation for PCs + monsters.

Same mocking pattern as the portrait tests: OpenAI + Blob patched on the
modules the service imports from.
"""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.monster_repo import MonsterRepo
from domain.enums import CharacterClass, CreatureSize, CreatureType
from domain.monster import MonsterStatBlockCreate
from services import portrait_service


def _dm() -> str:
    return f"dm_{uuid.uuid4().hex[:8]}@example.com"


def _make_pc(db: Session, dm: str):
    """Create a campaign + one PC owned by dm."""
    campaign = camp_svc.create_campaign(db, name="C", setting="S", tone="T", dm_email=dm)
    pc = char_svc.create_character(
        db,
        campaign_id=campaign.id,
        dm_email=dm,
        player_name="P",
        character_name="Thane",
        race="Wood Elf",
        character_class=CharacterClass.ROGUE,
        level=2,
        score_str=10,
        score_dex=16,
        score_con=12,
        score_int=12,
        score_wis=12,
        score_cha=10,
        hp_max=17,
        hp_current=17,
        ac=14,
        speed=35,
    )
    return pc


def _make_monster(db: Session):
    """Insert a minimal custom monster via the repo (no HTTP create path)."""
    return MonsterRepo.create(
        db,
        MonsterStatBlockCreate(
            name="Driven Wolf",
            size=CreatureSize.MEDIUM,
            creature_type=CreatureType.BEAST,
            ac=13,
            hp_average=11,
            hp_formula="2d8+2",
            score_str=12,
            score_dex=15,
            score_con=12,
            score_int=3,
            score_wis=12,
            score_cha=6,
            challenge_rating="1/4",
            xp=50,
            proficiency_bonus=2,
            is_custom=True,
        ),
    )


def _patch_image_and_blob(monkeypatch, *, png_bytes: bytes = b"\x89PNGFAKE"):
    """Stub generate_image + blob upload on portrait_service; capture args."""
    captured: dict = {}

    def fake_generate_image(prompt: str, **kwargs):
        captured["prompt"] = prompt
        captured["image_kwargs"] = kwargs
        return png_bytes

    def fake_upload(*, path: str, data: bytes, content_type: str = "image/png"):
        captured["upload_path"] = path
        captured["upload_bytes"] = data
        return f"https://fake.blob/{path}"

    from integrations import blob_storage as _blob

    monkeypatch.setattr(portrait_service, "generate_image", fake_generate_image)
    monkeypatch.setattr(_blob, "upload", fake_upload)
    return captured


class TestPcFigure:
    """generate_pc_figure — transparent standee onto figure_url."""

    def test_happy_path(self, duckdb_session: Session, monkeypatch):
        """Figure URL persists; prompt and image params carry the standee contract."""
        dm = _dm()
        pc = _make_pc(duckdb_session, dm)
        captured = _patch_image_and_blob(monkeypatch)

        updated = portrait_service.generate_pc_figure(duckdb_session, pc.id, dm)

        assert updated.figure_url == f"https://fake.blob/figures/pc-{pc.id}.png"
        assert updated.portrait_url is None  # untouched
        assert "Thane" in captured["prompt"]
        assert "transparent" in captured["prompt"].lower()
        assert captured["image_kwargs"].get("background") == "transparent"
        assert captured["image_kwargs"].get("size") == "1024x1536"

    def test_non_owner_forbidden(self, duckdb_session: Session, monkeypatch):
        """Only the owning DM can generate a PC figure."""
        pc = _make_pc(duckdb_session, _dm())
        _patch_image_and_blob(monkeypatch)

        with pytest.raises(PermissionError):
            portrait_service.generate_pc_figure(duckdb_session, pc.id, _dm())


class TestMonsterFigure:
    """generate_monster_figure — transparent standee onto figure_url."""

    def test_happy_path(self, duckdb_session: Session, monkeypatch):
        """Figure URL persists on the monster row; image_url untouched."""
        monster = _make_monster(duckdb_session)
        captured = _patch_image_and_blob(monkeypatch)

        updated = portrait_service.generate_monster_figure(duckdb_session, monster.id, _dm())

        assert updated.figure_url == f"https://fake.blob/figures/monster-{monster.id}.png"
        assert updated.image_url is None
        assert "Driven Wolf" in captured["prompt"]
        assert captured["image_kwargs"].get("background") == "transparent"

    def test_missing_monster_raises(self, duckdb_session: Session, monkeypatch):
        """Unknown monster id raises ValueError (maps to 404)."""
        _patch_image_and_blob(monkeypatch)
        with pytest.raises(ValueError):
            portrait_service.generate_monster_figure(duckdb_session, uuid.uuid4(), _dm())
