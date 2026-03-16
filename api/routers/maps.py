"""Maps router — map, node, and edge CRUD scoped to an adventure."""

import uuid

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from api.deps import DB, CurrentUser
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
from services import ai_service, map_service

router = APIRouter(tags=["maps"])


# ── Maps ───────────────────────────────────────────────────────────────────────


@router.get("/adventures/{adventure_id}/maps", response_model=list[Map])
def list_maps(adventure_id: uuid.UUID, db: DB, user: CurrentUser) -> list[Map]:
    """List all maps for an adventure.

    Args:
        adventure_id: UUID of the parent adventure.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        List of Map objects.
    """
    try:
        return map_service.list_maps(db, adventure_id, user)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post(
    "/adventures/{adventure_id}/maps",
    response_model=Map,
    status_code=status.HTTP_201_CREATED,
)
def create_map(adventure_id: uuid.UUID, body: MapCreate, db: DB, user: CurrentUser) -> Map:
    """Create a new map for an adventure.

    Args:
        adventure_id: UUID of the parent adventure.
        body: Map creation payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Newly created Map.
    """
    try:
        return map_service.create_map(
            db,
            adventure_id=adventure_id,
            name=body.name,
            dm_email=user,
            grid_width=body.grid_width,
            grid_height=body.grid_height,
            background_color=body.background_color,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.get("/maps/{map_id}", response_model=Map)
def get_map(map_id: uuid.UUID, db: DB, user: CurrentUser) -> Map:
    """Fetch a single map by ID.

    Args:
        map_id: UUID of the map.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Map object.
    """
    try:
        return map_service.get_map(db, map_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.patch("/maps/{map_id}", response_model=Map)
def update_map(map_id: uuid.UUID, body: MapUpdate, db: DB, user: CurrentUser) -> Map:
    """Update a map's metadata.

    Args:
        map_id: UUID of the map.
        body: Partial update payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Updated Map object.
    """
    try:
        return map_service.update_map(db, map_id, user, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.delete("/maps/{map_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_map(map_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete a map and all its nodes and edges.

    Args:
        map_id: UUID of the map.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        map_service.delete_map(db, map_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


# ── Nodes ──────────────────────────────────────────────────────────────────────


@router.get("/maps/{map_id}/nodes", response_model=list[MapNode])
def list_nodes(map_id: uuid.UUID, db: DB, user: CurrentUser) -> list[MapNode]:
    """List all nodes on a map.

    Args:
        map_id: UUID of the map.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        List of MapNode objects.
    """
    try:
        return map_service.list_nodes(db, map_id, user)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/maps/{map_id}/nodes", response_model=MapNode, status_code=status.HTTP_201_CREATED)
def create_node(map_id: uuid.UUID, body: MapNodeCreate, db: DB, user: CurrentUser) -> MapNode:
    """Add a node to a map.

    Args:
        map_id: UUID of the map.
        body: Node creation payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Newly created MapNode.
    """
    try:
        return map_service.create_node(
            db,
            map_id=map_id,
            label=body.label,
            node_type=body.node_type,
            x=body.x,
            y=body.y,
            dm_email=user,
            description=body.description,
            encounter_id=body.encounter_id,
            notes=body.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.patch("/maps/{map_id}/nodes/{node_id}", response_model=MapNode)
def update_node(
    map_id: uuid.UUID, node_id: uuid.UUID, body: MapNodeUpdate, db: DB, user: CurrentUser
) -> MapNode:
    """Update a map node.

    Args:
        map_id: UUID of the map (for ownership check).
        node_id: UUID of the node.
        body: Partial update payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Updated MapNode object.
    """
    try:
        return map_service.update_node(db, map_id, node_id, user, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.delete("/maps/{map_id}/nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_node(map_id: uuid.UUID, node_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete a node and its connected edges.

    Args:
        map_id: UUID of the map (for ownership check).
        node_id: UUID of the node.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        map_service.delete_node(db, map_id, node_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


# ── Edges ──────────────────────────────────────────────────────────────────────


@router.get("/maps/{map_id}/edges", response_model=list[MapEdge])
def list_edges(map_id: uuid.UUID, db: DB, user: CurrentUser) -> list[MapEdge]:
    """List all edges on a map.

    Args:
        map_id: UUID of the map.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        List of MapEdge objects.
    """
    try:
        return map_service.list_edges(db, map_id, user)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/maps/{map_id}/edges", response_model=MapEdge, status_code=status.HTTP_201_CREATED)
def create_edge(map_id: uuid.UUID, body: MapEdgeCreate, db: DB, user: CurrentUser) -> MapEdge:
    """Add an edge between two nodes on a map.

    Args:
        map_id: UUID of the map.
        body: Edge creation payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Newly created MapEdge.
    """
    try:
        return map_service.create_edge(
            db,
            map_id=map_id,
            from_node_id=body.from_node_id,
            to_node_id=body.to_node_id,
            dm_email=user,
            label=body.label,
            is_secret=body.is_secret,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.patch("/maps/{map_id}/edges/{edge_id}", response_model=MapEdge)
def update_edge(
    map_id: uuid.UUID, edge_id: uuid.UUID, body: MapEdgeUpdate, db: DB, user: CurrentUser
) -> MapEdge:
    """Update a map edge.

    Args:
        map_id: UUID of the map (for ownership check).
        edge_id: UUID of the edge.
        body: Partial update payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Updated MapEdge object.
    """
    try:
        return map_service.update_edge(db, map_id, edge_id, user, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.delete("/maps/{map_id}/edges/{edge_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_edge(map_id: uuid.UUID, edge_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete a map edge.

    Args:
        map_id: UUID of the map (for ownership check).
        edge_id: UUID of the edge.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        map_service.delete_edge(db, map_id, edge_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


# ── World map generation ───────────────────────────────────────────────────────


class _GenerateWorldRequest(BaseModel):
    """Request body for world map generation."""

    prompt: str


class _GenerateWorldResponse(BaseModel):
    """Response body for world map generation."""

    nodes: list[MapNode]
    edges: list[MapEdge]


@router.post("/maps/{map_id}/generate", response_model=_GenerateWorldResponse)
def generate_world(
    map_id: uuid.UUID, body: _GenerateWorldRequest, db: DB, user: CurrentUser
) -> _GenerateWorldResponse:
    """Generate a world-scale map using Claude AI.

    Populates an empty map with regions, cities, towns, landmarks, ports,
    and roads based on the DM's creative prompt.

    Args:
        map_id: UUID of the map to populate (should be empty).
        body: Contains the DM's world description prompt.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Created nodes and edges.
    """
    try:
        nodes, edges = ai_service.generate_world_map(db, map_id, body.prompt, user)
        return _GenerateWorldResponse(nodes=nodes, edges=edges)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI generation failed: {exc}",
        )
