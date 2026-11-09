"""Side quest repository (Plan 136): ``side_quests`` and ``side_quest_runs``. DB access only."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import func, update
from sqlmodel import Session, select

from domain.character import PlayerCharacter
from domain.side_quest import SideQuest, SideQuestRun


class SideQuestRepo:
    """CRUD for side_quests rows."""

    @staticmethod
    def get_by_id(session: Session, quest_id: uuid.UUID) -> Optional[SideQuest]:
        """Fetch one quest by primary key.

        Args:
            session: Active database session.
            quest_id: UUID of the quest.

        Returns:
            The quest, or None.
        """
        return session.get(SideQuest, quest_id)

    @staticmethod
    def list_for_campaign(session: Session, campaign_id: uuid.UUID) -> list[SideQuest]:
        """A campaign's quests, newest first.

        Args:
            session: Active database session.
            campaign_id: UUID of the campaign.

        Returns:
            The quests.
        """
        stmt = (
            select(SideQuest)
            .where(SideQuest.campaign_id == campaign_id)
            .order_by(SideQuest.created_at.desc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def save(session: Session, quest: SideQuest) -> SideQuest:
        """Commit one quest and return it refreshed.

        Args:
            session: Active database session.
            quest: The new or changed quest.

        Returns:
            The saved quest.
        """
        session.add(quest)
        session.commit()
        session.refresh(quest)
        return quest

    @staticmethod
    def delete(session: Session, quest: SideQuest) -> None:
        """Delete a quest and its runs (runs first, in their own commit, for DuckDB's FKs).

        Args:
            session: Active database session.
            quest: The quest to delete.
        """
        for run in SideQuestRunRepo.list_for_quest(session, quest.id):
            session.delete(run)
        session.commit()
        session.delete(quest)
        session.commit()


class SideQuestRunRepo:
    """CRUD for side_quest_runs rows."""

    @staticmethod
    def get_by_id(session: Session, run_id: uuid.UUID) -> Optional[SideQuestRun]:
        """Fetch one run by primary key.

        Args:
            session: Active database session.
            run_id: UUID of the run.

        Returns:
            The run, or None.
        """
        return session.get(SideQuestRun, run_id)

    @staticmethod
    def list_for_quest(session: Session, quest_id: uuid.UUID) -> list[SideQuestRun]:
        """A quest's runs, oldest first.

        Args:
            session: Active database session.
            quest_id: UUID of the quest.

        Returns:
            The runs.
        """
        stmt = (
            select(SideQuestRun)
            .where(SideQuestRun.quest_id == quest_id)
            .order_by(SideQuestRun.created_at.asc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def list_for_character(
        session: Session, character_id: uuid.UUID
    ) -> list[tuple[SideQuestRun, SideQuest]]:
        """A character's runs with their quests, newest first.

        Args:
            session: Active database session.
            character_id: UUID of the character.

        Returns:
            ``(run, quest)`` pairs.
        """
        stmt = (
            select(SideQuestRun, SideQuest)
            .join(SideQuest, SideQuest.id == SideQuestRun.quest_id)
            .where(SideQuestRun.character_id == character_id)
            .order_by(SideQuestRun.created_at.desc())
        )
        return [(row[0], row[1]) for row in session.exec(stmt).all()]

    @staticmethod
    def recaps_for_campaign(
        session: Session, campaign_id: uuid.UUID
    ) -> list[tuple[SideQuestRun, str]]:
        """Every run in a campaign with a shared recap, newest first (Plan 138).

        Args:
            session: Active database session.
            campaign_id: UUID of the campaign.

        Returns:
            ``(run, character name)`` pairs.
        """
        stmt = (
            select(SideQuestRun, PlayerCharacter.character_name)
            .join(PlayerCharacter, PlayerCharacter.id == SideQuestRun.character_id)
            .where(PlayerCharacter.campaign_id == campaign_id)
            .where(SideQuestRun.recap.is_not(None))
            .order_by(SideQuestRun.recap_at.desc())
        )
        return [(row[0], row[1]) for row in session.exec(stmt).all()]

    @staticmethod
    def character_ids_with_run(session: Session, quest_id: uuid.UUID) -> set[uuid.UUID]:
        """The characters who already have a run of this quest.

        Args:
            session: Active database session.
            quest_id: UUID of the quest.

        Returns:
            Their ids.
        """
        stmt = select(SideQuestRun.character_id).where(SideQuestRun.quest_id == quest_id)
        return set(session.exec(stmt).all())

    @staticmethod
    def character_names(session: Session, ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
        """Character names by id.

        Args:
            session: Active database session.
            ids: The characters.

        Returns:
            Id → name, for those that exist.
        """
        if not ids:
            return {}
        stmt = select(PlayerCharacter.id, PlayerCharacter.character_name).where(
            PlayerCharacter.id.in_(ids)
        )
        return {row[0]: row[1] for row in session.exec(stmt).all()}

    @staticmethod
    def count_for_quest(session: Session, quest_id: uuid.UUID) -> int:
        """How many runs a quest has.

        Args:
            session: Active database session.
            quest_id: UUID of the quest.

        Returns:
            The count.
        """
        stmt = (
            select(func.count()).select_from(SideQuestRun).where(SideQuestRun.quest_id == quest_id)
        )
        return int(session.exec(stmt).one())

    @staticmethod
    def claim_step(session: Session, run_id: uuid.UUID, from_step: str, to_step: str) -> bool:
        """Move a run on, only if it's still on ``from_step``. Of two callers, one wins.

        Args:
            session: Active database session.
            run_id: UUID of the run.
            from_step: The step the caller believes the run is on.
            to_step: The step to move to.

        Returns:
            True if this call moved it.
        """
        result = session.exec(
            update(SideQuestRun)
            .where(SideQuestRun.id == run_id, SideQuestRun.step_id == from_step)
            .values(step_id=to_step)
        )
        session.commit()
        return result.rowcount == 1

    @staticmethod
    def claim_open(session: Session, run_id: uuid.UUID, when: datetime) -> bool:
        """Mark a new run as opened, only if it's still new. Of two callers, one wins.

        Args:
            session: Active database session.
            run_id: UUID of the run.
            when: The time it was opened.

        Returns:
            True if this call opened it.
        """
        result = session.exec(
            update(SideQuestRun)
            .where(SideQuestRun.id == run_id, SideQuestRun.status == "new")
            .values(status="active", opened_at=when)
        )
        session.commit()
        return result.rowcount == 1

    @staticmethod
    def save(session: Session, run: SideQuestRun) -> SideQuestRun:
        """Commit one run and return it refreshed.

        Args:
            session: Active database session.
            run: The new or changed run.

        Returns:
            The saved run.
        """
        session.add(run)
        session.commit()
        session.refresh(run)
        return run

    @staticmethod
    def delete(session: Session, run: SideQuestRun) -> None:
        """Delete one run (Plan 142: a practice run the DM is done with).

        Args:
            session: Active database session.
            run: The run.
        """
        session.delete(run)
        session.commit()

    @staticmethod
    def delete_for_character(session: Session, character_id: uuid.UUID) -> None:
        """Mark a character's runs for deletion (the caller commits, in FK-safe order).

        Args:
            session: Active database session.
            character_id: UUID of the character.
        """
        stmt = select(SideQuestRun).where(SideQuestRun.character_id == character_id)
        for run in session.exec(stmt).all():
            session.delete(run)
