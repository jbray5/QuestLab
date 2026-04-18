"""Map, MapNode, and MapEdge repositories — DB access only, no business logic."""

import uuid
from typing import Optional

from sqlalchemy.exc import NotSupportedError
from sqlmodel import Session, select

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


class MapRepo:
    """CRUD operations for Map records."""

    @staticmethod
    def get_by_id(session: Session, map_id: uuid.UUID) -> Optional[Map]:
        """Fetch a single map by primary key.

        Args:
            session: Active database session.
            map_id: UUID of the map.

        Returns:
            Map if found, else None.
        """
        return session.get(Map, map_id)

    @staticmethod
    def list_by_adventure(session: Session, adventure_id: uuid.UUID) -> list[Map]:
        """List all maps for an adventure.

        Args:
            session: Active database session.
            adventure_id: UUID of the parent adventure.

        Returns:
            Maps ordered by name ascending.
        """
        stmt = select(Map).where(Map.adventure_id == adventure_id).order_by(Map.name.asc())
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, data: MapCreate) -> Map:
        """Persist a new map.

        Args:
            session: Active database session.
            data: Validated map creation payload.

        Returns:
            The newly created Map.
        """
        map_obj = Map.model_validate(data)
        session.add(map_obj)
        session.commit()
        session.refresh(map_obj)
        return map_obj

    @staticmethod
    def update(session: Session, map_obj: Map, data: MapUpdate) -> Map:
        """Apply a partial update to a map.

        Args:
            session: Active database session.
            map_obj: Existing Map ORM object.
            data: Partial update payload.

        Returns:
            The updated Map.
        """
        patch = data.model_dump(exclude_unset=True)
        for field, value in patch.items():
            setattr(map_obj, field, value)
        session.add(map_obj)
        session.commit()
        session.refresh(map_obj)
        return map_obj

    @staticmethod
    def delete(session: Session, map_obj: Map) -> bool:
        """Delete a map record.

        Args:
            session: Active database session.
            map_obj: Map ORM object to delete.

        Returns:
            True if deleted.
        """
        session.delete(map_obj)
        session.commit()
        return True


class MapNodeRepo:
    """CRUD operations for MapNode records."""

    @staticmethod
    def get_by_id(session: Session, node_id: uuid.UUID) -> Optional[MapNode]:
        """Fetch a single map node by primary key.

        Args:
            session: Active database session.
            node_id: UUID of the node.

        Returns:
            MapNode if found, else None.
        """
        return session.get(MapNode, node_id)

    @staticmethod
    def list_by_map(session: Session, map_id: uuid.UUID) -> list[MapNode]:
        """List all nodes on a map.

        Args:
            session: Active database session.
            map_id: UUID of the parent map.

        Returns:
            MapNodes ordered by label ascending.
        """
        stmt = select(MapNode).where(MapNode.map_id == map_id).order_by(MapNode.label.asc())
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, data: MapNodeCreate) -> MapNode:
        """Persist a new map node.

        Args:
            session: Active database session.
            data: Validated node creation payload.

        Returns:
            The newly created MapNode.
        """
        node = MapNode.model_validate(data)
        session.add(node)
        session.commit()
        session.refresh(node)
        return node

    @staticmethod
    def update(session: Session, node: MapNode, data: MapNodeUpdate) -> MapNode:
        """Apply a partial update to a map node.

        DuckDB treats UPDATE as DELETE+INSERT internally, which triggers
        spurious FK-constraint violations when ``map_edges`` references this
        node.  On DuckDB we detach referencing edges, flush the node update,
        then re-attach them.

        Args:
            session: Active database session.
            node: Existing MapNode ORM object.
            data: Partial update payload.

        Returns:
            The updated MapNode.
        """
        patch = data.model_dump(exclude_unset=True)
        for field, value in patch.items():
            setattr(node, field, value)
        session.add(node)
        try:
            session.commit()
        except NotSupportedError:
            # DuckDB FK constraint workaround — detach edges, update, re-attach
            session.rollback()
            edges = list(
                session.exec(
                    select(MapEdge).where(
                        (MapEdge.from_node_id == node.id) | (MapEdge.to_node_id == node.id)
                    )
                ).all()
            )
            edge_data = [
                {
                    "id": str(e.id),
                    "map_id": str(e.map_id),
                    "from_node_id": str(e.from_node_id),
                    "to_node_id": str(e.to_node_id),
                    "label": e.label,
                    "is_secret": e.is_secret,
                    "door_type": e.door_type,
                }
                for e in edges
            ]
            for e in edges:
                session.delete(e)
            session.flush()
            # Re-apply patch (rollback undid the setattr changes)
            for field, value in patch.items():
                setattr(node, field, value)
            session.add(node)
            session.flush()
            for ed in edge_data:
                restored = MapEdge(
                    id=uuid.UUID(ed["id"]),
                    map_id=uuid.UUID(ed["map_id"]),
                    from_node_id=uuid.UUID(ed["from_node_id"]),
                    to_node_id=uuid.UUID(ed["to_node_id"]),
                    label=ed["label"],
                    is_secret=ed["is_secret"],
                    door_type=ed["door_type"],
                )
                session.add(restored)
            session.commit()
        session.refresh(node)
        return node

    @staticmethod
    def delete(session: Session, node: MapNode) -> bool:
        """Delete a map node record.

        Args:
            session: Active database session.
            node: MapNode ORM object to delete.

        Returns:
            True if deleted.
        """
        session.delete(node)
        session.commit()
        return True


class MapEdgeRepo:
    """CRUD operations for MapEdge records."""

    @staticmethod
    def get_by_id(session: Session, edge_id: uuid.UUID) -> Optional[MapEdge]:
        """Fetch a single map edge by primary key.

        Args:
            session: Active database session.
            edge_id: UUID of the edge.

        Returns:
            MapEdge if found, else None.
        """
        return session.get(MapEdge, edge_id)

    @staticmethod
    def list_by_map(session: Session, map_id: uuid.UUID) -> list[MapEdge]:
        """List all edges on a map.

        Args:
            session: Active database session.
            map_id: UUID of the parent map.

        Returns:
            MapEdges for the given map.
        """
        stmt = select(MapEdge).where(MapEdge.map_id == map_id)
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, data: MapEdgeCreate) -> MapEdge:
        """Persist a new map edge.

        Args:
            session: Active database session.
            data: Validated edge creation payload.

        Returns:
            The newly created MapEdge.
        """
        edge = MapEdge.model_validate(data)
        session.add(edge)
        session.commit()
        session.refresh(edge)
        return edge

    @staticmethod
    def update(session: Session, edge: MapEdge, data: MapEdgeUpdate) -> MapEdge:
        """Apply a partial update to a map edge.

        Args:
            session: Active database session.
            edge: Existing MapEdge ORM object.
            data: Partial update payload.

        Returns:
            The updated MapEdge.
        """
        patch = data.model_dump(exclude_unset=True)
        for field, value in patch.items():
            setattr(edge, field, value)
        session.add(edge)
        session.commit()
        session.refresh(edge)
        return edge

    @staticmethod
    def delete(session: Session, edge: MapEdge) -> bool:
        """Delete a map edge record.

        Args:
            session: Active database session.
            edge: MapEdge ORM object to delete.

        Returns:
            True if deleted.
        """
        session.delete(edge)
        session.commit()
        return True
