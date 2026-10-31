"""Plan 45/46 tests — battle-map art on the board.

Generation went with Plan 124 (no generative AI). What stays: art already on a
map (backdrop, ground layer, props) is saved through ``update_map`` and reaches
the player-safe projection, and the weather/dimension edits around it.
"""

import uuid

import pytest
from sqlmodel import Session

import services.battle_map_service as map_svc
import services.campaign_service as camp_svc
import services.table_service as table_svc
from domain.battle_map import BattleMapCreate, BattleMapUpdate
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


class TestStoredMapArt:
    """Art already on a map keeps reaching the board (Plan 124 removed only the generation)."""

    def test_backdrop_url_round_trips_through_update(self, duckdb_session: Session):
        """A stored backdrop_url is saved by update_map and survives a re-read."""
        dm = _dm()
        campaign, _, _ = _campaign_and_session(duckdb_session, dm)
        battle_map = _make_map(duckdb_session, campaign.id, dm)

        updated = map_svc.update_map(
            duckdb_session,
            battle_map.id,
            dm,
            BattleMapUpdate(backdrop_url="https://blob.example/backdrop.png"),
        )

        assert updated.backdrop_url == "https://blob.example/backdrop.png"
        maps = map_svc.list_maps(duckdb_session, campaign.id, dm)
        assert maps[0].backdrop_url == updated.backdrop_url

    def test_non_owner_cannot_change_art(self, duckdb_session: Session):
        """A different DM cannot rewrite someone else's map art."""
        dm = _dm()
        campaign, _, _ = _campaign_and_session(duckdb_session, dm)
        battle_map = _make_map(duckdb_session, campaign.id, dm)

        with pytest.raises(PermissionError):
            map_svc.update_map(
                duckdb_session,
                battle_map.id,
                _dm(),
                BattleMapUpdate(backdrop_url="https://blob.example/x.png"),
            )

    def test_missing_map_raises(self, duckdb_session: Session):
        """Unknown map id raises ValueError (maps to 404)."""
        dm = _dm()
        camp_svc.create_campaign(duckdb_session, name="C", setting="S", tone="T", dm_email=dm)

        with pytest.raises(ValueError):
            map_svc.update_map(
                duckdb_session, uuid.uuid4(), dm, BattleMapUpdate(backdrop_url="https://x/y.png")
            )

    def test_weather_syncs_to_projection(self, duckdb_session: Session):
        """DM-set weather lands in the player-safe projection (Plan 46)."""
        dm = _dm()
        _, _, gs = _campaign_and_session(duckdb_session, dm)
        table_svc.update_table_state(duckdb_session, gs.id, dm, TableStateUpdate(weather="rain"))

        projection = table_svc.get_projection(duckdb_session, gs.id)

        assert projection.weather == "rain"
        cleared = table_svc.update_table_state(
            duckdb_session, gs.id, dm, TableStateUpdate(weather=None)
        )
        assert cleared.weather is None

    def test_projection_carries_stored_art(self, duckdb_session: Session):
        """The player-safe projection resolves backdrop, ground and props on the active map."""
        dm = _dm()
        campaign, _, gs = _campaign_and_session(duckdb_session, dm)
        battle_map = _make_map(duckdb_session, campaign.id, dm)
        props = [{"x": 10, "y": 20, "kind": "tree", "url": "https://blob.example/t.png", "h": 3}]
        updated = map_svc.update_map(
            duckdb_session,
            battle_map.id,
            dm,
            BattleMapUpdate(
                backdrop_url="https://blob.example/backdrop.png",
                ground_url="https://blob.example/ground.png",
                props=props,
            ),
        )
        table_svc.update_table_state(
            duckdb_session, gs.id, dm, TableStateUpdate(active_map_id=battle_map.id)
        )

        projection = table_svc.get_projection(duckdb_session, gs.id)

        assert projection.map is not None
        assert projection.map.backdrop_url == updated.backdrop_url
        assert projection.map.ground_url == "https://blob.example/ground.png"
        assert projection.map.props == props


def test_update_can_change_dimensions(duckdb_session):
    """An art swap may change aspect ratio; width/height must be patchable.

    Regression: BattleMapUpdate had no width/height, so re-pointing The
    Crossing to a portrait ship's deck silently kept the old landscape
    dimensions and the board stretched the new art (2026-08-07).
    """
    import services.battle_map_service as bms
    import services.campaign_service as camp_svc
    from domain.battle_map import BattleMapCreate, BattleMapUpdate

    dm = f"dm-{uuid.uuid4().hex[:8]}@example.com"
    camp = camp_svc.create_campaign(duckdb_session, name="C", setting="S", tone="T", dm_email=dm)
    m = bms.create_map(
        duckdb_session,
        camp.id,
        dm,
        BattleMapCreate(name="Deck", image_url="https://x/a.png", width=1536, height=1024),
    )
    out = bms.update_map(
        duckdb_session, m.id, dm, BattleMapUpdate(width=1024, height=1536, grid_size=128)
    )
    assert (out.width, out.height, out.grid_size) == (1024, 1536, 128)
