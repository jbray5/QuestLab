"""Plan 45 tests — AI backdrop generation for battle maps.

Mirrors the portrait-service test pattern: OpenAI + Blob are monkeypatched on
the modules the service imports from, so no network is touched.
"""

import uuid

import pytest
from sqlmodel import Session

import services.battle_map_service as map_svc
import services.campaign_service as camp_svc
import services.table_service as table_svc
from domain.battle_map import BattleMapCreate
from domain.table_state import TableStateUpdate
from tests.test_services.test_table_service import _campaign_and_session, _dm


def _make_map(db: Session, campaign_id: uuid.UUID, dm: str, name: str = "Waystone Road"):
    """Create a minimal gridded map for backdrop tests."""
    return map_svc.create_map(
        db,
        campaign_id,
        dm,
        BattleMapCreate(
            name=name,
            image_url="https://blob.example/road.jpg",
            width=2000,
            height=1400,
            grid_size=140,
        ),
    )


def _patch_image_and_blob(monkeypatch, *, png_bytes: bytes = b"\x89PNGFAKE"):
    """Stub generate_image + blob upload; return captured call args."""
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

    monkeypatch.setattr(map_svc, "generate_image", fake_generate_image)
    monkeypatch.setattr(_blob, "upload", fake_upload)
    return captured


class TestGenerateBackdrop:
    """generate_backdrop orchestrates prompt + gen + upload + save."""

    def test_happy_path_persists_url(self, duckdb_session: Session, monkeypatch):
        """The generated URL lands on backdrop_url and survives a re-read."""
        dm = _dm()
        campaign, _, _ = _campaign_and_session(duckdb_session, dm)
        battle_map = _make_map(duckdb_session, campaign.id, dm)
        captured = _patch_image_and_blob(monkeypatch)

        updated = map_svc.generate_backdrop(duckdb_session, battle_map.id, dm)

        assert updated.backdrop_url == f"https://fake.blob/backdrops/battlemap-{battle_map.id}.png"
        assert captured["upload_bytes"] == b"\x89PNGFAKE"
        maps = map_svc.list_maps(duckdb_session, campaign.id, dm)
        assert maps[0].backdrop_url == updated.backdrop_url

    def test_prompt_carries_map_name_and_hints(self, duckdb_session: Session, monkeypatch):
        """Map name and DM style hints are folded into the prompt."""
        dm = _dm()
        campaign, _, _ = _campaign_and_session(duckdb_session, dm)
        battle_map = _make_map(duckdb_session, campaign.id, dm, name="Gullwash Cliffs")
        captured = _patch_image_and_blob(monkeypatch)

        map_svc.generate_backdrop(
            duckdb_session, battle_map.id, dm, style_hints="storm rolling in over a grey sea"
        )

        assert "Gullwash Cliffs" in captured["prompt"]
        assert "storm rolling in over a grey sea" in captured["prompt"]
        assert captured["image_kwargs"].get("size") == "1536x1024"

    def test_non_owner_forbidden(self, duckdb_session: Session, monkeypatch):
        """A different DM cannot generate onto someone else's map."""
        dm = _dm()
        campaign, _, _ = _campaign_and_session(duckdb_session, dm)
        battle_map = _make_map(duckdb_session, campaign.id, dm)
        _patch_image_and_blob(monkeypatch)

        with pytest.raises(PermissionError):
            map_svc.generate_backdrop(duckdb_session, battle_map.id, _dm())

    def test_missing_map_raises(self, duckdb_session: Session, monkeypatch):
        """Unknown map id raises ValueError (maps to 404)."""
        dm = _dm()
        camp_svc.create_campaign(duckdb_session, name="C", setting="S", tone="T", dm_email=dm)
        _patch_image_and_blob(monkeypatch)

        with pytest.raises(ValueError):
            map_svc.generate_backdrop(duckdb_session, uuid.uuid4(), dm)

    def test_terrain_happy_path(self, duckdb_session: Session, monkeypatch):
        """generate_heightmap downloads the source, edits it, persists the URL."""
        dm = _dm()
        campaign, _, _ = _campaign_and_session(duckdb_session, dm)
        battle_map = _make_map(duckdb_session, campaign.id, dm)
        captured: dict = {}

        def fake_download(url: str, **kwargs):
            captured["download_url"] = url
            return b"\x89SRCPNG"

        def fake_edit_image(prompt: str, image_bytes: bytes, **kwargs):
            captured["edit_prompt"] = prompt
            captured["edit_source"] = image_bytes
            captured["edit_kwargs"] = kwargs
            return b"\x89HEIGHTPNG"

        def fake_upload(*, path: str, data: bytes, content_type: str = "image/png"):
            captured["upload_path"] = path
            captured["upload_bytes"] = data
            return f"https://fake.blob/{path}"

        from integrations import blob_storage as _blob

        monkeypatch.setattr(_blob, "download", fake_download)
        monkeypatch.setattr(_blob, "upload", fake_upload)
        monkeypatch.setattr(map_svc, "edit_image", fake_edit_image)

        updated = map_svc.generate_heightmap(duckdb_session, battle_map.id, dm)

        assert (
            updated.heightmap_url == f"https://fake.blob/heightmaps/battlemap-{battle_map.id}.png"
        )
        assert captured["download_url"] == battle_map.image_url
        assert captured["edit_source"] == b"\x89SRCPNG"
        assert "HEIGHT MAP" in captured["edit_prompt"]
        assert captured["upload_bytes"] == b"\x89HEIGHTPNG"

    def test_terrain_non_owner_forbidden(self, duckdb_session: Session, monkeypatch):
        """A different DM cannot generate terrain on someone else's map."""
        dm = _dm()
        campaign, _, _ = _campaign_and_session(duckdb_session, dm)
        battle_map = _make_map(duckdb_session, campaign.id, dm)
        monkeypatch.setattr(map_svc, "edit_image", lambda *a, **k: b"x")

        with pytest.raises(PermissionError):
            map_svc.generate_heightmap(duckdb_session, battle_map.id, _dm())

    def test_projection_carries_backdrop(self, duckdb_session: Session, monkeypatch):
        """The player-safe projection resolves backdrop_url on the active map."""
        dm = _dm()
        campaign, _, gs = _campaign_and_session(duckdb_session, dm)
        battle_map = _make_map(duckdb_session, campaign.id, dm)
        _patch_image_and_blob(monkeypatch)
        updated = map_svc.generate_backdrop(duckdb_session, battle_map.id, dm)
        table_svc.update_table_state(
            duckdb_session, gs.id, dm, TableStateUpdate(active_map_id=battle_map.id)
        )

        projection = table_svc.get_projection(duckdb_session, gs.id)

        assert projection.map is not None
        assert projection.map.backdrop_url == updated.backdrop_url
