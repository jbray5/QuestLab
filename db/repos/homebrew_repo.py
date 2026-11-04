"""Homebrew race, subclass and feat repositories (Plans 133, 135): DB access only.

Owner and name matches ignore case and outer spaces. A ``ruleset`` filter keeps that
edition's rows plus the ones valid in both (NULL), the way ``spell_repo`` does.
"""

import uuid
from datetime import UTC, datetime
from typing import Any, Optional

from sqlalchemy import func, or_
from sqlmodel import Session, select

from domain.campaign import Campaign
from domain.character import PlayerCharacter
from domain.enums import CharacterClass
from domain.homebrew import (
    HomebrewFeat,
    HomebrewFeatCreate,
    HomebrewRace,
    HomebrewRaceCreate,
    HomebrewSubclass,
    HomebrewSubclassCreate,
)


def _key(text: str) -> str:
    """The comparison form of an email or a name: trimmed, lower case."""
    return text.strip().lower()


def _in_ruleset(stmt: Any, column: Any, ruleset: Optional[str]) -> Any:
    """Keep one edition's rows plus the rows valid in both (NULL), or every row."""
    if not ruleset:
        return stmt
    return stmt.where(or_(column == str(getattr(ruleset, "value", ruleset)), column.is_(None)))


def _save(session: Session, row: Any) -> Any:
    """Commit one row and return it refreshed."""
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def _patch(session: Session, row: Any, patch: dict[str, Any]) -> Any:
    """Apply ``patch`` (field → value) to ``row``, stamp ``updated_at`` and commit."""
    for field, value in patch.items():
        setattr(row, field, value)
    row.updated_at = datetime.now(UTC)
    return _save(session, row)


class HomebrewRaceRepo:
    """CRUD and lookups for HomebrewRace rows."""

    @staticmethod
    def get_by_id(session: Session, race_id: uuid.UUID) -> Optional[HomebrewRace]:
        """Fetch one race by primary key.

        Args:
            session: Active database session.
            race_id: UUID of the race.

        Returns:
            The race, or None.
        """
        return session.get(HomebrewRace, race_id)

    @staticmethod
    def list_for_owner(
        session: Session, email: str, ruleset: Optional[str] = None
    ) -> list[HomebrewRace]:
        """One DM's races, by name.

        Args:
            session: Active database session.
            email: The owning DM.
            ruleset: "2024"/"2014" keeps that edition's races plus those valid in both;
                None lists them all.

        Returns:
            The races, ordered by name.
        """
        stmt = select(HomebrewRace).where(func.lower(HomebrewRace.created_by_email) == _key(email))
        stmt = _in_ruleset(stmt, HomebrewRace.ruleset, ruleset)
        return list(session.exec(stmt.order_by(func.lower(HomebrewRace.name))).all())

    @staticmethod
    def list_named(session: Session, email: str, name: str) -> list[HomebrewRace]:
        """The DM's races with exactly this name, ignoring case (an equality, not a pattern).

        Args:
            session: Active database session.
            email: The owning DM.
            name: The race name.

        Returns:
            Matching races (normally none or one).
        """
        stmt = select(HomebrewRace).where(
            func.lower(HomebrewRace.created_by_email) == _key(email),
            func.lower(HomebrewRace.name) == _key(name),
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, data: HomebrewRaceCreate, owner_email: str) -> HomebrewRace:
        """Persist a new race owned by ``owner_email``.

        Args:
            session: Active database session.
            data: The validated race.
            owner_email: The authoring DM.

        Returns:
            The new race.
        """
        row = HomebrewRace.model_validate({**data.model_dump(), "created_by_email": owner_email})
        return _save(session, row)

    @staticmethod
    def update(session: Session, race: HomebrewRace, patch: dict[str, Any]) -> HomebrewRace:
        """Apply a partial update (field → value, already validated).

        Args:
            session: Active database session.
            race: The race to change.
            patch: The fields to set.

        Returns:
            The updated race.
        """
        return _patch(session, race, patch)

    @staticmethod
    def delete(session: Session, race: HomebrewRace) -> None:
        """Delete a race.

        Args:
            session: Active database session.
            race: The race to delete.
        """
        session.delete(race)
        session.commit()

    @staticmethod
    def users(session: Session, owner_email: str, name: str) -> list[tuple[str, str]]:
        """Characters in the owner's campaigns whose race is ``name`` (ignoring case).

        Args:
            session: Active database session.
            owner_email: The DM whose campaigns to look in.
            name: The race name.

        Returns:
            ``(character name, character ruleset)`` pairs, by name.
        """
        stmt = (
            select(PlayerCharacter.character_name, PlayerCharacter.ruleset)
            .join(Campaign, Campaign.id == PlayerCharacter.campaign_id)
            .where(func.lower(Campaign.dm_email) == _key(owner_email))
            .where(func.lower(PlayerCharacter.race) == _key(name))
            .order_by(PlayerCharacter.character_name.asc())
        )
        return [(row[0], row[1]) for row in session.exec(stmt).all()]


class HomebrewSubclassRepo:
    """CRUD and lookups for HomebrewSubclass rows."""

    @staticmethod
    def get_by_id(session: Session, subclass_id: uuid.UUID) -> Optional[HomebrewSubclass]:
        """Fetch one subclass by primary key.

        Args:
            session: Active database session.
            subclass_id: UUID of the subclass.

        Returns:
            The subclass, or None.
        """
        return session.get(HomebrewSubclass, subclass_id)

    @staticmethod
    def list_for_owner(
        session: Session,
        email: str,
        ruleset: Optional[str] = None,
        character_class: Optional[str] = None,
    ) -> list[HomebrewSubclass]:
        """One DM's subclasses, by class then name.

        Args:
            session: Active database session.
            email: The owning DM.
            ruleset: "2024"/"2014" keeps that edition's subclasses plus those valid in both;
                None lists them all.
            character_class: A class name ("Paladin") to keep only that class's subclasses.

        Returns:
            The subclasses, ordered by class, then name.
        """
        stmt = select(HomebrewSubclass).where(
            func.lower(HomebrewSubclass.created_by_email) == _key(email)
        )
        stmt = _in_ruleset(stmt, HomebrewSubclass.ruleset, ruleset)
        if character_class:
            stmt = stmt.where(HomebrewSubclass.character_class == character_class)
        stmt = stmt.order_by(HomebrewSubclass.character_class, func.lower(HomebrewSubclass.name))
        return list(session.exec(stmt).all())

    @staticmethod
    def list_named(session: Session, email: str, name: str) -> list[HomebrewSubclass]:
        """The DM's subclasses (any class) with exactly this name, ignoring case.

        Args:
            session: Active database session.
            email: The owning DM.
            name: The subclass name.

        Returns:
            Matching subclasses (normally none or one).
        """
        stmt = select(HomebrewSubclass).where(
            func.lower(HomebrewSubclass.created_by_email) == _key(email),
            func.lower(HomebrewSubclass.name) == _key(name),
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def create(
        session: Session, data: HomebrewSubclassCreate, owner_email: str
    ) -> HomebrewSubclass:
        """Persist a new subclass owned by ``owner_email``.

        Args:
            session: Active database session.
            data: The validated subclass.
            owner_email: The authoring DM.

        Returns:
            The new subclass.
        """
        row = HomebrewSubclass.model_validate(
            {**data.model_dump(), "created_by_email": owner_email}
        )
        return _save(session, row)

    @staticmethod
    def update(
        session: Session, subclass: HomebrewSubclass, patch: dict[str, Any]
    ) -> HomebrewSubclass:
        """Apply a partial update (field → value, already validated).

        Args:
            session: Active database session.
            subclass: The subclass to change.
            patch: The fields to set.

        Returns:
            The updated subclass.
        """
        return _patch(session, subclass, patch)

    @staticmethod
    def delete(session: Session, subclass: HomebrewSubclass) -> None:
        """Delete a subclass.

        Args:
            session: Active database session.
            subclass: The subclass to delete.
        """
        session.delete(subclass)
        session.commit()

    @staticmethod
    def users(
        session: Session, owner_email: str, character_class: str, name: str
    ) -> list[tuple[str, str]]:
        """Characters in the owner's campaigns of this class with this subclass.

        Args:
            session: Active database session.
            owner_email: The DM whose campaigns to look in.
            character_class: The class name ("Paladin").
            name: The subclass name (ignoring case).

        Returns:
            ``(character name, character ruleset)`` pairs, by name.
        """
        stmt = (
            select(PlayerCharacter.character_name, PlayerCharacter.ruleset)
            .join(Campaign, Campaign.id == PlayerCharacter.campaign_id)
            .where(func.lower(Campaign.dm_email) == _key(owner_email))
            .where(PlayerCharacter.character_class == CharacterClass(character_class))
            .where(func.lower(PlayerCharacter.subclass) == _key(name))
            .order_by(PlayerCharacter.character_name.asc())
        )
        return [(row[0], row[1]) for row in session.exec(stmt).all()]


class HomebrewFeatRepo:
    """CRUD and lookups for HomebrewFeat rows (Plan 135)."""

    @staticmethod
    def get_by_id(session: Session, feat_id: uuid.UUID) -> Optional[HomebrewFeat]:
        """Fetch one feat by primary key.

        Args:
            session: Active database session.
            feat_id: UUID of the feat.

        Returns:
            The feat, or None.
        """
        return session.get(HomebrewFeat, feat_id)

    @staticmethod
    def list_for_owner(
        session: Session, email: str, ruleset: Optional[str] = None
    ) -> list[HomebrewFeat]:
        """One DM's feats, by name.

        Args:
            session: Active database session.
            email: The owning DM.
            ruleset: "2024"/"2014" keeps that edition's feats plus those valid in both;
                None lists them all.

        Returns:
            The feats, ordered by name.
        """
        stmt = select(HomebrewFeat).where(func.lower(HomebrewFeat.created_by_email) == _key(email))
        stmt = _in_ruleset(stmt, HomebrewFeat.ruleset, ruleset)
        return list(session.exec(stmt.order_by(func.lower(HomebrewFeat.name))).all())

    @staticmethod
    def list_named(session: Session, email: str, name: str) -> list[HomebrewFeat]:
        """One DM's feats called ``name`` (ignoring case).

        Args:
            session: Active database session.
            email: The owning DM.
            name: The feat name.

        Returns:
            The matching feats (at most one, unless the data predates the name check).
        """
        stmt = select(HomebrewFeat).where(
            func.lower(HomebrewFeat.created_by_email) == _key(email),
            func.lower(HomebrewFeat.name) == _key(name),
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, data: HomebrewFeatCreate, owner_email: str) -> HomebrewFeat:
        """Persist a new feat owned by ``owner_email``.

        Args:
            session: Active database session.
            data: The validated feat.
            owner_email: The authoring DM.

        Returns:
            The new feat.
        """
        row = HomebrewFeat.model_validate({**data.model_dump(), "created_by_email": owner_email})
        return _save(session, row)

    @staticmethod
    def update(session: Session, feat: HomebrewFeat, patch: dict[str, Any]) -> HomebrewFeat:
        """Apply a partial update (field → value, already validated).

        Args:
            session: Active database session.
            feat: The feat to change.
            patch: The fields to set.

        Returns:
            The updated feat.
        """
        return _patch(session, feat, patch)

    @staticmethod
    def delete(session: Session, feat: HomebrewFeat) -> None:
        """Delete a feat.

        Args:
            session: Active database session.
            feat: The feat to delete.
        """
        session.delete(feat)
        session.commit()

    @staticmethod
    def characters_with_feats(
        session: Session, owner_email: str
    ) -> list[tuple[str, Optional[str], list]]:
        """Characters in the owner's campaigns that have any feats on their sheet.

        Feats live in a JSON list, so the name match happens in the service.

        Args:
            session: Active database session.
            owner_email: The DM whose campaigns to look in.

        Returns:
            ``(character name, character ruleset, feats)`` triples, by name.
        """
        stmt = (
            select(PlayerCharacter.character_name, PlayerCharacter.ruleset, PlayerCharacter.feats)
            .join(Campaign, Campaign.id == PlayerCharacter.campaign_id)
            .where(func.lower(Campaign.dm_email) == _key(owner_email))
            .where(PlayerCharacter.feats.is_not(None))
            .order_by(PlayerCharacter.character_name.asc())
        )
        return [(row[0], row[1], list(row[2] or [])) for row in session.exec(stmt).all()]
