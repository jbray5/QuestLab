"""Map service — business logic and authorization for Map, MapNode, and MapEdge.

Rules enforced here:
- A DM must own the parent campaign (via adventure) to manage maps.
- Node labels must be non-empty after stripping.
- No two nodes on the same map may share the same (x, y) grid position.
- Edges must reference nodes that belong to the same map.
- Deleting a map cascades to its nodes and edges.
- At most 1 map per adventure (MVP limit).
"""

import uuid
from typing import Optional

from sqlmodel import Session

from db.repos.adventure_repo import AdventureRepo
from db.repos.campaign_repo import CampaignRepo
from db.repos.map_repo import MapEdgeRepo, MapNodeRepo, MapRepo
from domain.enums import MapNodeType
from domain.map import (
    Map,
    MapCreate,
    MapEdge,
    MapEdgeCreate,
    MapEdgeUpdate,
    MapNode,
    MapNodeCreate,
    MapNodeUpdate,
    MapUpdate,
)

MAX_NODES_PER_MAP = 200
MAX_MAPS_PER_ADVENTURE = 1


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _assert_adventure_owner(db: Session, adventure_id: uuid.UUID, dm_email: str) -> None:
    """Verify the DM owns the campaign containing this adventure.

    Args:
        db: Active database session.
        adventure_id: UUID of the adventure.
        dm_email: Email of the requesting DM.

    Raises:
        ValueError: If the adventure or campaign does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    adventure = AdventureRepo.get_by_id(db, adventure_id)
    if adventure is None:
        raise ValueError(f"Adventure {adventure_id} not found.")
    campaign = CampaignRepo.get_by_id(db, adventure.campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign for adventure {adventure_id} not found.")
    if campaign.dm_email != dm_email.strip().lower():
        raise PermissionError("You do not have permission to manage maps for this adventure.")


def _assert_map_owner(db: Session, map_obj: Map, dm_email: str) -> None:
    """Verify the DM owns the map's adventure's campaign.

    Args:
        db: Active database session.
        map_obj: Map ORM object.
        dm_email: Email of the requesting DM.
    """
    _assert_adventure_owner(db, map_obj.adventure_id, dm_email)


def _get_map_or_raise(db: Session, map_id: uuid.UUID) -> Map:
    """Fetch a map by ID or raise ValueError.

    Args:
        db: Active database session.
        map_id: UUID of the map.

    Returns:
        Map ORM object.

    Raises:
        ValueError: If not found.
    """
    map_obj = MapRepo.get_by_id(db, map_id)
    if map_obj is None:
        raise ValueError(f"Map {map_id} not found.")
    return map_obj


# ---------------------------------------------------------------------------
# Map CRUD
# ---------------------------------------------------------------------------


def list_maps(db: Session, adventure_id: uuid.UUID, dm_email: str) -> list[Map]:
    """List all maps for an adventure.

    Args:
        db: Active database session.
        adventure_id: UUID of the parent adventure.
        dm_email: Email of the requesting DM.

    Returns:
        List of Map ORM objects.

    Raises:
        ValueError: If the adventure or campaign does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    _assert_adventure_owner(db, adventure_id, dm_email)
    return MapRepo.list_by_adventure(db, adventure_id)


def get_map(db: Session, map_id: uuid.UUID, dm_email: str) -> Map:
    """Fetch a single map by ID.

    Args:
        db: Active database session.
        map_id: UUID of the map.
        dm_email: Email of the requesting DM.

    Returns:
        Map ORM object.

    Raises:
        ValueError: If not found.
        PermissionError: If the DM does not own the campaign.
    """
    map_obj = _get_map_or_raise(db, map_id)
    _assert_map_owner(db, map_obj, dm_email)
    return map_obj


def create_map(
    db: Session,
    adventure_id: uuid.UUID,
    name: str,
    dm_email: str,
    grid_width: int = 20,
    grid_height: int = 20,
    background_color: str = "#1a1a2e",
) -> Map:
    """Create a new map for an adventure.

    Args:
        db: Active database session.
        adventure_id: UUID of the parent adventure.
        name: Map name.
        dm_email: Email of the owning DM.
        grid_width: Number of grid columns (5–100).
        grid_height: Number of grid rows (5–100).
        background_color: Hex color for the map background.

    Returns:
        Newly created Map ORM object.

    Raises:
        ValueError: If validation fails or map limit reached.
        PermissionError: If the DM does not own the campaign.
    """
    name = name.strip()
    if not name:
        raise ValueError("Map name cannot be empty.")

    _assert_adventure_owner(db, adventure_id, dm_email)

    existing = MapRepo.list_by_adventure(db, adventure_id)
    if len(existing) >= MAX_MAPS_PER_ADVENTURE:
        raise ValueError(
            f"Adventure already has {MAX_MAPS_PER_ADVENTURE} map (maximum). "
            "Delete the existing map to create a new one."
        )

    payload = MapCreate(
        adventure_id=adventure_id,
        name=name,
        grid_width=grid_width,
        grid_height=grid_height,
        background_color=background_color,
    )
    return MapRepo.create(db, payload)


def update_map(db: Session, map_id: uuid.UUID, dm_email: str, update: MapUpdate) -> Map:
    """Partially update a map's metadata.

    Args:
        db: Active database session.
        map_id: UUID of the map.
        dm_email: Email of the requesting DM.
        update: Partial update payload.

    Returns:
        Updated Map ORM object.

    Raises:
        ValueError: If not found.
        PermissionError: If the DM does not own the campaign.
    """
    map_obj = _get_map_or_raise(db, map_id)
    _assert_map_owner(db, map_obj, dm_email)
    if update.name is not None:
        update.name = update.name.strip()
        if not update.name:
            raise ValueError("Map name cannot be empty.")
    return MapRepo.update(db, map_obj, update)


def delete_map(db: Session, map_id: uuid.UUID, dm_email: str) -> bool:
    """Delete a map and all its nodes and edges.

    Args:
        db: Active database session.
        map_id: UUID of the map.
        dm_email: Email of the requesting DM.

    Returns:
        True if deleted.

    Raises:
        ValueError: If not found.
        PermissionError: If the DM does not own the campaign.
    """
    map_obj = _get_map_or_raise(db, map_id)
    _assert_map_owner(db, map_obj, dm_email)
    # Cascade: delete edges, then nodes, then map
    edges = MapEdgeRepo.list_by_map(db, map_id)
    for edge in edges:
        MapEdgeRepo.delete(db, edge)
    nodes = MapNodeRepo.list_by_map(db, map_id)
    for node in nodes:
        MapNodeRepo.delete(db, node)
    return MapRepo.delete(db, map_obj)


# ---------------------------------------------------------------------------
# MapNode CRUD
# ---------------------------------------------------------------------------


def list_nodes(db: Session, map_id: uuid.UUID, dm_email: str) -> list[MapNode]:
    """List all nodes on a map.

    Args:
        db: Active database session.
        map_id: UUID of the map.
        dm_email: Email of the requesting DM.

    Returns:
        List of MapNode ORM objects.

    Raises:
        ValueError: If the map does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    map_obj = _get_map_or_raise(db, map_id)
    _assert_map_owner(db, map_obj, dm_email)
    return MapNodeRepo.list_by_map(db, map_id)


def create_node(
    db: Session,
    map_id: uuid.UUID,
    label: str,
    node_type: MapNodeType,
    x: int,
    y: int,
    dm_email: str,
    description: Optional[str] = None,
    encounter_id: Optional[uuid.UUID] = None,
    notes: Optional[str] = None,
) -> MapNode:
    """Create a new node on a map.

    Args:
        db: Active database session.
        map_id: UUID of the parent map.
        label: Short node label.
        node_type: Type of map node (Room, Corridor, etc.).
        x: Grid column position (0-indexed).
        y: Grid row position (0-indexed).
        dm_email: Email of the owning DM.
        description: Optional longer description shown on hover/click.
        encounter_id: Optional UUID of a linked encounter.
        notes: Optional private DM notes.

    Returns:
        Newly created MapNode ORM object.

    Raises:
        ValueError: If label is empty, position out of grid bounds, or position occupied.
        PermissionError: If the DM does not own the campaign.
    """
    label = label.strip()
    if not label:
        raise ValueError("Node label cannot be empty.")

    map_obj = _get_map_or_raise(db, map_id)
    _assert_map_owner(db, map_obj, dm_email)

    if x < 0 or x >= map_obj.grid_width:
        raise ValueError(f"x={x} is outside grid width {map_obj.grid_width}.")
    if y < 0 or y >= map_obj.grid_height:
        raise ValueError(f"y={y} is outside grid height {map_obj.grid_height}.")

    existing_nodes = MapNodeRepo.list_by_map(db, map_id)
    if len(existing_nodes) >= MAX_NODES_PER_MAP:
        raise ValueError(f"Map already has {MAX_NODES_PER_MAP} nodes (maximum).")
    for node in existing_nodes:
        if node.x == x and node.y == y:
            raise ValueError(f"Position ({x}, {y}) is already occupied by node '{node.label}'.")

    payload = MapNodeCreate(
        map_id=map_id,
        label=label,
        node_type=node_type,
        x=x,
        y=y,
        description=description,
        encounter_id=encounter_id,
        notes=notes,
    )
    return MapNodeRepo.create(db, payload)


def update_node(
    db: Session,
    node_id: uuid.UUID,
    dm_email: str,
    update: MapNodeUpdate,
) -> MapNode:
    """Partially update a map node.

    Args:
        db: Active database session.
        node_id: UUID of the node.
        dm_email: Email of the requesting DM.
        update: Partial update payload.

    Returns:
        Updated MapNode ORM object.

    Raises:
        ValueError: If not found, label empty, or new position already occupied.
        PermissionError: If the DM does not own the campaign.
    """
    node = MapNodeRepo.get_by_id(db, node_id)
    if node is None:
        raise ValueError(f"MapNode {node_id} not found.")
    map_obj = _get_map_or_raise(db, node.map_id)
    _assert_map_owner(db, map_obj, dm_email)

    if update.label is not None:
        update.label = update.label.strip()
        if not update.label:
            raise ValueError("Node label cannot be empty.")

    new_x = update.x if update.x is not None else node.x
    new_y = update.y if update.y is not None else node.y
    if new_x != node.x or new_y != node.y:
        if new_x < 0 or new_x >= map_obj.grid_width:
            raise ValueError(f"x={new_x} is outside grid width {map_obj.grid_width}.")
        if new_y < 0 or new_y >= map_obj.grid_height:
            raise ValueError(f"y={new_y} is outside grid height {map_obj.grid_height}.")
        for other in MapNodeRepo.list_by_map(db, node.map_id):
            if other.id != node_id and other.x == new_x and other.y == new_y:
                raise ValueError(
                    f"Position ({new_x}, {new_y}) is already occupied by '{other.label}'."
                )

    return MapNodeRepo.update(db, node, update)


def delete_node(db: Session, node_id: uuid.UUID, dm_email: str) -> bool:
    """Delete a map node and all edges that reference it.

    Args:
        db: Active database session.
        node_id: UUID of the node.
        dm_email: Email of the requesting DM.

    Returns:
        True if deleted.

    Raises:
        ValueError: If not found.
        PermissionError: If the DM does not own the campaign.
    """
    node = MapNodeRepo.get_by_id(db, node_id)
    if node is None:
        raise ValueError(f"MapNode {node_id} not found.")
    map_obj = _get_map_or_raise(db, node.map_id)
    _assert_map_owner(db, map_obj, dm_email)
    # Remove edges connected to this node
    for edge in MapEdgeRepo.list_by_map(db, node.map_id):
        if edge.from_node_id == node_id or edge.to_node_id == node_id:
            MapEdgeRepo.delete(db, edge)
    return MapNodeRepo.delete(db, node)


# ---------------------------------------------------------------------------
# MapEdge CRUD
# ---------------------------------------------------------------------------


def list_edges(db: Session, map_id: uuid.UUID, dm_email: str) -> list[MapEdge]:
    """List all edges on a map.

    Args:
        db: Active database session.
        map_id: UUID of the map.
        dm_email: Email of the requesting DM.

    Returns:
        List of MapEdge ORM objects.

    Raises:
        ValueError: If the map does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    map_obj = _get_map_or_raise(db, map_id)
    _assert_map_owner(db, map_obj, dm_email)
    return MapEdgeRepo.list_by_map(db, map_id)


def create_edge(
    db: Session,
    map_id: uuid.UUID,
    from_node_id: uuid.UUID,
    to_node_id: uuid.UUID,
    dm_email: str,
    label: Optional[str] = None,
    is_secret: bool = False,
) -> MapEdge:
    """Create a directed edge between two nodes on the same map.

    Args:
        db: Active database session.
        map_id: UUID of the parent map.
        from_node_id: UUID of the source node.
        to_node_id: UUID of the destination node.
        dm_email: Email of the owning DM.
        label: Optional edge label (e.g. 'locked door', 'secret passage').
        is_secret: If True, the passage is hidden from players.

    Returns:
        Newly created MapEdge ORM object.

    Raises:
        ValueError: If nodes don't exist, don't belong to this map, or a duplicate edge exists.
        PermissionError: If the DM does not own the campaign.
    """
    map_obj = _get_map_or_raise(db, map_id)
    _assert_map_owner(db, map_obj, dm_email)

    from_node = MapNodeRepo.get_by_id(db, from_node_id)
    if from_node is None or from_node.map_id != map_id:
        raise ValueError(f"Source node {from_node_id} not found on this map.")
    to_node = MapNodeRepo.get_by_id(db, to_node_id)
    if to_node is None or to_node.map_id != map_id:
        raise ValueError(f"Destination node {to_node_id} not found on this map.")
    if from_node_id == to_node_id:
        raise ValueError("A node cannot connect to itself.")

    # Prevent duplicate directed edges
    for existing in MapEdgeRepo.list_by_map(db, map_id):
        if existing.from_node_id == from_node_id and existing.to_node_id == to_node_id:
            raise ValueError(
                f"An edge from '{from_node.label}' to '{to_node.label}' already exists."
            )

    payload = MapEdgeCreate(
        map_id=map_id,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        label=label.strip() if label else None,
        is_secret=is_secret,
    )
    return MapEdgeRepo.create(db, payload)


def update_edge(
    db: Session,
    edge_id: uuid.UUID,
    dm_email: str,
    update: MapEdgeUpdate,
) -> MapEdge:
    """Partially update a map edge (label or is_secret).

    Args:
        db: Active database session.
        edge_id: UUID of the edge.
        dm_email: Email of the requesting DM.
        update: Partial update payload.

    Returns:
        Updated MapEdge ORM object.

    Raises:
        ValueError: If not found.
        PermissionError: If the DM does not own the campaign.
    """
    edge = MapEdgeRepo.get_by_id(db, edge_id)
    if edge is None:
        raise ValueError(f"MapEdge {edge_id} not found.")
    map_obj = _get_map_or_raise(db, edge.map_id)
    _assert_map_owner(db, map_obj, dm_email)
    return MapEdgeRepo.update(db, edge, update)


def delete_edge(db: Session, edge_id: uuid.UUID, dm_email: str) -> bool:
    """Delete a map edge.

    Args:
        db: Active database session.
        edge_id: UUID of the edge.
        dm_email: Email of the requesting DM.

    Returns:
        True if deleted.

    Raises:
        ValueError: If not found.
        PermissionError: If the DM does not own the campaign.
    """
    edge = MapEdgeRepo.get_by_id(db, edge_id)
    if edge is None:
        raise ValueError(f"MapEdge {edge_id} not found.")
    map_obj = _get_map_or_raise(db, edge.map_id)
    _assert_map_owner(db, map_obj, dm_email)
    return MapEdgeRepo.delete(db, edge)
