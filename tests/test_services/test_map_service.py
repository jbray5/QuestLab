"""Tests for services/map_service.py — map, node, and edge business logic."""

import uuid

import pytest
from sqlmodel import Session

import services.adventure_service as adv_svc
import services.campaign_service as camp_svc
import services.map_service as map_svc
from domain.enums import AdventureTier, MapNodeType
from domain.map import MapEdgeUpdate, MapNodeUpdate, MapUpdate

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _unique_dm() -> str:
    """Return a unique DM email per test."""
    return f"dm_{uuid.uuid4().hex[:8]}@example.com"


def _make_campaign(db: Session, dm_email: str):
    """Create a test campaign."""
    return camp_svc.create_campaign(
        db, name="Test Campaign", setting="Forgotten Realms", tone="Epic", dm_email=dm_email
    )


def _make_adventure(db: Session, campaign_id: uuid.UUID, dm_email: str):
    """Create a test adventure."""
    return adv_svc.create_adventure(
        db,
        campaign_id=campaign_id,
        title="Test Adventure",
        tier=AdventureTier.TIER2,
        dm_email=dm_email,
    )


def _make_map(db: Session, adventure_id: uuid.UUID, dm_email: str, name: str = "Dungeon Level 1"):
    """Create a test map."""
    return map_svc.create_map(db, adventure_id=adventure_id, name=name, dm_email=dm_email)


def _make_node(
    db: Session,
    map_id: uuid.UUID,
    dm_email: str,
    label: str = "Room A",
    x: int = 0,
    y: int = 0,
    node_type: MapNodeType = MapNodeType.ROOM,
):
    """Create a test map node."""
    return map_svc.create_node(
        db, map_id=map_id, label=label, node_type=node_type, x=x, y=y, dm_email=dm_email
    )


# ---------------------------------------------------------------------------
# Map CRUD
# ---------------------------------------------------------------------------


class TestCreateMap:
    """Tests for map_service.create_map."""

    def test_create_minimal_map(self, duckdb_session: Session):
        """Create a map with only required fields."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)

        m = _make_map(duckdb_session, adv.id, dm)
        assert m.name == "Dungeon Level 1"
        assert m.adventure_id == adv.id
        assert m.grid_width == 20
        assert m.grid_height == 20

    def test_empty_name_raises(self, duckdb_session: Session):
        """Empty map name raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        with pytest.raises(ValueError, match="name"):
            map_svc.create_map(duckdb_session, adventure_id=adv.id, name="   ", dm_email=dm)

    def test_map_limit_enforced(self, duckdb_session: Session):
        """Creating more than MAX_MAPS_PER_ADVENTURE raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        _make_map(duckdb_session, adv.id, dm)
        with pytest.raises(ValueError, match="maximum"):
            _make_map(duckdb_session, adv.id, dm, name="Second Map")

    def test_non_owner_cannot_create(self, duckdb_session: Session):
        """Non-owner gets PermissionError."""
        dm1 = _unique_dm()
        dm2 = _unique_dm()
        c = _make_campaign(duckdb_session, dm1)
        adv = _make_adventure(duckdb_session, c.id, dm1)
        with pytest.raises(PermissionError):
            map_svc.create_map(duckdb_session, adventure_id=adv.id, name="Stolen Map", dm_email=dm2)

    def test_missing_adventure_raises(self, duckdb_session: Session):
        """Non-existent adventure raises ValueError."""
        dm = _unique_dm()
        with pytest.raises(ValueError):
            map_svc.create_map(duckdb_session, adventure_id=uuid.uuid4(), name="X", dm_email=dm)


class TestListMaps:
    """Tests for map_service.list_maps."""

    def test_empty_list_for_new_adventure(self, duckdb_session: Session):
        """Fresh adventure has no maps."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        assert map_svc.list_maps(duckdb_session, adv.id, dm) == []

    def test_lists_created_map(self, duckdb_session: Session):
        """Created map appears in list."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        _make_map(duckdb_session, adv.id, dm)
        maps = map_svc.list_maps(duckdb_session, adv.id, dm)
        assert len(maps) == 1

    def test_non_owner_cannot_list(self, duckdb_session: Session):
        """Non-owner gets PermissionError."""
        dm1 = _unique_dm()
        dm2 = _unique_dm()
        c = _make_campaign(duckdb_session, dm1)
        adv = _make_adventure(duckdb_session, c.id, dm1)
        with pytest.raises(PermissionError):
            map_svc.list_maps(duckdb_session, adv.id, dm2)


class TestUpdateMap:
    """Tests for map_service.update_map."""

    def test_update_name(self, duckdb_session: Session):
        """Updating name changes the stored value."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        updated = map_svc.update_map(duckdb_session, m.id, dm, MapUpdate(name="Level 2"))
        assert updated.name == "Level 2"

    def test_empty_name_on_update_raises(self, duckdb_session: Session):
        """Setting name to blank on update raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        with pytest.raises(ValueError, match="name"):
            map_svc.update_map(duckdb_session, m.id, dm, MapUpdate(name="  "))


class TestDeleteMap:
    """Tests for map_service.delete_map."""

    def test_delete_removes_map(self, duckdb_session: Session):
        """Deleting a map removes it from the list."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        assert map_svc.delete_map(duckdb_session, m.id, dm) is True
        assert map_svc.list_maps(duckdb_session, adv.id, dm) == []

    def test_delete_cascades_nodes_and_edges(self, duckdb_session: Session):
        """Deleting a map also removes all its nodes and edges."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        n1 = _make_node(duckdb_session, m.id, dm, label="A", x=0, y=0)
        n2 = _make_node(duckdb_session, m.id, dm, label="B", x=1, y=1)
        map_svc.create_edge(duckdb_session, m.id, n1.id, n2.id, dm)

        map_svc.delete_map(duckdb_session, m.id, dm)
        # Adventure now allows a new map
        new_m = _make_map(duckdb_session, adv.id, dm, name="New Map")
        assert new_m.name == "New Map"

    def test_delete_missing_raises(self, duckdb_session: Session):
        """Deleting non-existent map raises ValueError."""
        dm = _unique_dm()
        with pytest.raises(ValueError):
            map_svc.delete_map(duckdb_session, uuid.uuid4(), dm)


# ---------------------------------------------------------------------------
# MapNode CRUD
# ---------------------------------------------------------------------------


class TestCreateNode:
    """Tests for map_service.create_node."""

    def test_create_node(self, duckdb_session: Session):
        """Create a node with required fields."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        node = _make_node(duckdb_session, m.id, dm, label="Entry Hall", x=5, y=3)
        assert node.label == "Entry Hall"
        assert node.x == 5
        assert node.y == 3
        assert node.map_id == m.id

    def test_duplicate_position_raises(self, duckdb_session: Session):
        """Two nodes at the same (x, y) raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        _make_node(duckdb_session, m.id, dm, label="A", x=3, y=3)
        with pytest.raises(ValueError, match="occupied"):
            _make_node(duckdb_session, m.id, dm, label="B", x=3, y=3)

    def test_out_of_bounds_x_raises(self, duckdb_session: Session):
        """Node x beyond grid width raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        with pytest.raises(ValueError, match="outside grid"):
            _make_node(duckdb_session, m.id, dm, label="X", x=999, y=0)

    def test_out_of_bounds_y_raises(self, duckdb_session: Session):
        """Node y beyond grid height raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        with pytest.raises(ValueError, match="outside grid"):
            _make_node(duckdb_session, m.id, dm, label="Y", x=0, y=999)

    def test_empty_label_raises(self, duckdb_session: Session):
        """Empty node label raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        with pytest.raises(ValueError, match="label"):
            _make_node(duckdb_session, m.id, dm, label="   ", x=0, y=0)

    def test_five_nodes_different_positions(self, duckdb_session: Session):
        """Five nodes with distinct positions all create successfully."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        positions = [(0, 0), (1, 0), (2, 0), (0, 1), (1, 1)]
        for i, (x, y) in enumerate(positions):
            _make_node(duckdb_session, m.id, dm, label=f"Node {i}", x=x, y=y)
        nodes = map_svc.list_nodes(duckdb_session, m.id, dm)
        assert len(nodes) == 5


class TestUpdateNode:
    """Tests for map_service.update_node."""

    def test_update_label(self, duckdb_session: Session):
        """Updating label stores the new value."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        node = _make_node(duckdb_session, m.id, dm, label="Old", x=0, y=0)
        updated = map_svc.update_node(duckdb_session, node.id, dm, MapNodeUpdate(label="New Label"))
        assert updated.label == "New Label"

    def test_update_position_to_occupied_raises(self, duckdb_session: Session):
        """Moving a node to an occupied position raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        n1 = _make_node(duckdb_session, m.id, dm, label="A", x=0, y=0)
        _make_node(duckdb_session, m.id, dm, label="B", x=1, y=0)
        with pytest.raises(ValueError, match="occupied"):
            map_svc.update_node(duckdb_session, n1.id, dm, MapNodeUpdate(x=1, y=0))

    def test_update_position_to_same_position_ok(self, duckdb_session: Session):
        """Updating a node without changing position is allowed."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        node = _make_node(duckdb_session, m.id, dm, label="A", x=0, y=0)
        updated = map_svc.update_node(
            duckdb_session, node.id, dm, MapNodeUpdate(x=0, y=0, label="A Renamed")
        )
        assert updated.label == "A Renamed"


class TestDeleteNode:
    """Tests for map_service.delete_node."""

    def test_delete_removes_node(self, duckdb_session: Session):
        """Deleted node no longer appears in list."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        node = _make_node(duckdb_session, m.id, dm)
        map_svc.delete_node(duckdb_session, node.id, dm)
        assert map_svc.list_nodes(duckdb_session, m.id, dm) == []

    def test_delete_node_removes_connected_edges(self, duckdb_session: Session):
        """Deleting a node also removes edges connecting to/from it."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        n1 = _make_node(duckdb_session, m.id, dm, label="A", x=0, y=0)
        n2 = _make_node(duckdb_session, m.id, dm, label="B", x=1, y=0)
        map_svc.create_edge(duckdb_session, m.id, n1.id, n2.id, dm)
        assert len(map_svc.list_edges(duckdb_session, m.id, dm)) == 1

        map_svc.delete_node(duckdb_session, n1.id, dm)
        assert map_svc.list_edges(duckdb_session, m.id, dm) == []


# ---------------------------------------------------------------------------
# MapEdge CRUD
# ---------------------------------------------------------------------------


class TestCreateEdge:
    """Tests for map_service.create_edge."""

    def test_create_edge(self, duckdb_session: Session):
        """Create a directed edge between two nodes."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        n1 = _make_node(duckdb_session, m.id, dm, label="A", x=0, y=0)
        n2 = _make_node(duckdb_session, m.id, dm, label="B", x=1, y=0)
        edge = map_svc.create_edge(duckdb_session, m.id, n1.id, n2.id, dm, label="Door")
        assert edge.from_node_id == n1.id
        assert edge.to_node_id == n2.id
        assert edge.label == "Door"
        assert edge.is_secret is False

    def test_secret_edge(self, duckdb_session: Session):
        """Create an edge marked as a secret passage."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        n1 = _make_node(duckdb_session, m.id, dm, label="A", x=0, y=0)
        n2 = _make_node(duckdb_session, m.id, dm, label="B", x=1, y=0)
        edge = map_svc.create_edge(duckdb_session, m.id, n1.id, n2.id, dm, is_secret=True)
        assert edge.is_secret is True

    def test_self_loop_raises(self, duckdb_session: Session):
        """Connecting a node to itself raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        n1 = _make_node(duckdb_session, m.id, dm, label="A", x=0, y=0)
        with pytest.raises(ValueError, match="itself"):
            map_svc.create_edge(duckdb_session, m.id, n1.id, n1.id, dm)

    def test_duplicate_edge_raises(self, duckdb_session: Session):
        """Creating the same directed edge twice raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        n1 = _make_node(duckdb_session, m.id, dm, label="A", x=0, y=0)
        n2 = _make_node(duckdb_session, m.id, dm, label="B", x=1, y=0)
        map_svc.create_edge(duckdb_session, m.id, n1.id, n2.id, dm)
        with pytest.raises(ValueError, match="already exists"):
            map_svc.create_edge(duckdb_session, m.id, n1.id, n2.id, dm)

    def test_reverse_edge_allowed(self, duckdb_session: Session):
        """A→B and B→A are separate directed edges; both are valid."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        n1 = _make_node(duckdb_session, m.id, dm, label="A", x=0, y=0)
        n2 = _make_node(duckdb_session, m.id, dm, label="B", x=1, y=0)
        map_svc.create_edge(duckdb_session, m.id, n1.id, n2.id, dm)
        map_svc.create_edge(duckdb_session, m.id, n2.id, n1.id, dm)
        assert len(map_svc.list_edges(duckdb_session, m.id, dm)) == 2

    def test_node_from_wrong_map_raises(self, duckdb_session: Session):
        """Node not on the target map raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        n1 = _make_node(duckdb_session, m.id, dm, label="A", x=0, y=0)
        with pytest.raises(ValueError):
            map_svc.create_edge(duckdb_session, m.id, n1.id, uuid.uuid4(), dm)


class TestUpdateEdge:
    """Tests for map_service.update_edge."""

    def test_update_label_and_secret(self, duckdb_session: Session):
        """Updating label and is_secret stores new values."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        n1 = _make_node(duckdb_session, m.id, dm, label="A", x=0, y=0)
        n2 = _make_node(duckdb_session, m.id, dm, label="B", x=1, y=0)
        edge = map_svc.create_edge(duckdb_session, m.id, n1.id, n2.id, dm)
        updated = map_svc.update_edge(
            duckdb_session, edge.id, dm, MapEdgeUpdate(label="Hidden Passage", is_secret=True)
        )
        assert updated.label == "Hidden Passage"
        assert updated.is_secret is True


class TestDeleteEdge:
    """Tests for map_service.delete_edge."""

    def test_delete_edge(self, duckdb_session: Session):
        """Deleting an edge removes it from the list."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        m = _make_map(duckdb_session, adv.id, dm)
        n1 = _make_node(duckdb_session, m.id, dm, label="A", x=0, y=0)
        n2 = _make_node(duckdb_session, m.id, dm, label="B", x=1, y=0)
        edge = map_svc.create_edge(duckdb_session, m.id, n1.id, n2.id, dm)
        map_svc.delete_edge(duckdb_session, edge.id, dm)
        assert map_svc.list_edges(duckdb_session, m.id, dm) == []

    def test_delete_missing_edge_raises(self, duckdb_session: Session):
        """Deleting a non-existent edge raises ValueError."""
        dm = _unique_dm()
        with pytest.raises(ValueError):
            map_svc.delete_edge(duckdb_session, uuid.uuid4(), dm)
