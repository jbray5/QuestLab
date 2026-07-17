"""Plan 46 tests — the auto-props diorama pipeline.

image_tools gets real synthetic PNGs through the actual diff; the service
test mocks the externals (download/edit/upload) but runs the real footprint
math end to end.
"""

import pytest
from sqlmodel import Session

import services.battle_map_service as map_svc
from integrations import image_tools
from tests.test_services.test_battle_map_backdrop import _campaign_and_session, _dm, _make_map


def _scene_png(with_features: bool) -> bytes:
    """A 192x128 'map': green field; optionally a tree blob + gray stone."""
    w, h = 192, 128
    px = bytearray()
    for y in range(h):
        for x in range(w):
            r, g, b = 90, 150, 60  # grass
            if with_features:
                if (x - 48) ** 2 + (y - 40) ** 2 < 22**2:
                    r, g, b = 30, 110, 30  # dark green canopy
                elif (x - 140) ** 2 + (y - 90) ** 2 < 11**2:
                    r, g, b = 120, 120, 125  # gray stone
            px += bytes((r, g, b))
    return image_tools.encode_rgb_png(w, h, bytes(px))


class TestImageTools:
    """PNG codec + footprint diff on synthetic scenes."""

    def test_roundtrip_decode(self):
        """encode_rgb_png output decodes back to the same dimensions."""
        png = _scene_png(True)
        w, h, bpp, data = image_tools.decode_png(png)
        assert (w, h, bpp) == (192, 128, 3)
        assert len(data) == 192 * 128 * 3

    def test_diff_finds_tree_and_stone(self):
        """The tree classifies green, the stone gray; both located roughly."""
        feet = image_tools.diff_footprints(_scene_png(True), _scene_png(False), min_cells=3)
        kinds = sorted(f["kind"] for f in feet)
        assert "tree" in kinds and "stone" in kinds
        tree = next(f for f in feet if f["kind"] == "tree")
        assert abs(tree["x"] - 48) < 14 and abs(tree["y"] - 40) < 14

    def test_identical_images_no_footprints(self):
        """No differences -> no props."""
        png = _scene_png(False)
        assert image_tools.diff_footprints(png, png, min_cells=3) == []

    def test_dimension_mismatch_raises(self):
        """Mismatched sizes are a hard error."""
        small = image_tools.encode_rgb_png(4, 4, bytes(4 * 4 * 3))
        with pytest.raises(ValueError):
            image_tools.diff_footprints(_scene_png(True), small)


class TestGenerateProps:
    """generate_props orchestrates ground layer + diff + sprite placement."""

    def test_happy_path(self, duckdb_session: Session, monkeypatch):
        """Ground URL + classified props persist on the map row."""
        dm = _dm()
        campaign, _, _ = _campaign_and_session(duckdb_session, dm)
        battle_map = _make_map(duckdb_session, campaign.id, dm)
        captured: dict = {}

        monkeypatch.setattr("integrations.blob_storage.download", lambda url, **k: _scene_png(True))

        def fake_edit_image(prompt: str, image_bytes: bytes, **kwargs):
            captured["prompt"] = prompt
            return _scene_png(False)

        def fake_upload(*, path: str, data: bytes, content_type: str = "image/png"):
            captured["upload_path"] = path
            return f"https://fake.blob/{path}"

        from integrations import blob_storage as _blob

        monkeypatch.setattr(map_svc, "edit_image", fake_edit_image)
        monkeypatch.setattr(_blob, "upload", fake_upload)

        updated = map_svc.generate_props(duckdb_session, battle_map.id, dm)

        assert updated.ground_url == f"https://fake.blob/grounds/battlemap-{battle_map.id}.png"
        assert updated.props and len(updated.props) >= 2
        kinds = {p["kind"] for p in updated.props}
        assert "tree" in kinds and "stone" in kinds
        for p in updated.props:
            assert p["url"].startswith("https://")
            assert 1.0 <= p["h"] <= 4.0
        assert "removed" in captured["prompt"]

    def test_non_owner_forbidden(self, duckdb_session: Session, monkeypatch):
        """Only the owning DM can dioramify."""
        dm = _dm()
        campaign, _, _ = _campaign_and_session(duckdb_session, dm)
        battle_map = _make_map(duckdb_session, campaign.id, dm)
        monkeypatch.setattr(map_svc, "edit_image", lambda *a, **k: b"x")

        with pytest.raises(PermissionError):
            map_svc.generate_props(duckdb_session, battle_map.id, _dm())
