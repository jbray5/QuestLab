"""BattleMap repository — DB access only, no business logic (Plan 42)."""

import uuid
from typing import Optional

from sqlmodel import Session, select

from domain.battle_map import BattleMap, BattleMapCreate, BattleMapUpdate


class BattleMapRepo:
    """CRUD for campaign battle-map library entries."""

    @staticmethod
    def get_by_id(session: Session, map_id: uuid.UUID) -> Optional[BattleMap]:
        """Fetch a battle map by primary key.

        Args:
            session: Active database session.
            map_id: UUID of the battle map.

        Returns:
            The BattleMap if found, else None.
        """
        stmt = select(BattleMap).where(BattleMap.id == map_id).limit(1)
        return session.exec(stmt).first()

    @staticmethod
    def list_for_campaign(session: Session, campaign_id: uuid.UUID) -> list[BattleMap]:
        """List a campaign's battle maps, newest first.

        Args:
            session: Active database session.
            campaign_id: UUID of the owning campaign.

        Returns:
            Battle maps ordered by created_at descending.
        """
        stmt = (
            select(BattleMap)
            .where(BattleMap.campaign_id == campaign_id)
            .order_by(BattleMap.created_at.desc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, campaign_id: uuid.UUID, data: BattleMapCreate) -> BattleMap:
        """Persist a new battle map.

        Args:
            session: Active database session.
            campaign_id: UUID of the owning campaign.
            data: Validated creation payload.

        Returns:
            The newly-created BattleMap.
        """
        row = BattleMap.model_validate(
            {
                **data.model_dump(exclude={"regions"}),
                "campaign_id": campaign_id,
                "regions": [r.model_dump() for r in data.regions],
            }
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def update(session: Session, battle_map: BattleMap, data: BattleMapUpdate) -> BattleMap:
        """Apply a partial update to a battle map.

        Args:
            session: Active database session.
            battle_map: Existing BattleMap ORM object.
            data: Partial update payload.

        Returns:
            The updated BattleMap.
        """
        patch = data.model_dump(exclude_unset=True)
        if "regions" in patch and patch["regions"] is not None:
            patch["regions"] = [
                r if isinstance(r, dict) else r.model_dump() for r in patch["regions"]
            ]
        for field, value in patch.items():
            setattr(battle_map, field, value)
        session.add(battle_map)
        session.commit()
        session.refresh(battle_map)
        return battle_map

    @staticmethod
    def delete(session: Session, battle_map: BattleMap) -> bool:
        """Delete a battle map.

        Args:
            session: Active database session.
            battle_map: BattleMap ORM object to delete.

        Returns:
            True once deleted.
        """
        session.delete(battle_map)
        session.commit()
        return True
