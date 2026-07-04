"""SessionBrief repository — DB access only, no business logic (Plan 43)."""

import uuid
from typing import Optional

from sqlmodel import Session, select

from domain.session_brief import SessionBrief, SessionBriefCreate, SessionBriefUpdate


class SessionBriefRepo:
    """CRUD for the per-session DM brief (1:1 with a session)."""

    @staticmethod
    def get_by_session(session: Session, session_id: uuid.UUID) -> Optional[SessionBrief]:
        """Fetch the brief for a session, if one exists.

        Args:
            session: Active database session.
            session_id: UUID of the parent game session.

        Returns:
            The SessionBrief if present, else None.
        """
        stmt = select(SessionBrief).where(SessionBrief.session_id == session_id).limit(1)
        return session.exec(stmt).first()

    @staticmethod
    def create(session: Session, data: SessionBriefCreate) -> SessionBrief:
        """Persist a brief, overwriting any existing one for this session.

        Args:
            session: Active database session.
            data: Validated brief creation payload.

        Returns:
            The newly-created SessionBrief.
        """
        existing = SessionBriefRepo.get_by_session(session, data.session_id)
        if existing:
            session.delete(existing)
            session.flush()
        row = SessionBrief.model_validate(
            {
                "session_id": data.session_id,
                "model_used": data.model_used,
                "cold_open": data.cold_open,
                "premise": data.premise,
                "danger_dial": data.danger_dial,
                "fallback": data.fallback,
                "beats": [b.model_dump() for b in data.beats],
                "npc_faces": [n.model_dump() for n in data.npc_faces],
                "spotlight": [s.model_dump() for s in data.spotlight],
                "roads": [r.model_dump() for r in data.roads],
            }
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def update(session: Session, brief: SessionBrief, data: SessionBriefUpdate) -> SessionBrief:
        """Apply a partial update to a brief (inline edits).

        Args:
            session: Active database session.
            brief: Existing SessionBrief ORM object.
            data: Partial update payload.

        Returns:
            The updated SessionBrief.
        """
        patch = data.model_dump(exclude_unset=True)
        for key in ("beats", "npc_faces", "spotlight", "roads"):
            if key in patch and patch[key] is not None:
                patch[key] = [i if isinstance(i, dict) else i.model_dump() for i in patch[key]]
        for field, value in patch.items():
            setattr(brief, field, value)
        session.add(brief)
        session.commit()
        session.refresh(brief)
        return brief

    @staticmethod
    def delete(session: Session, brief: SessionBrief) -> bool:
        """Delete a brief.

        Args:
            session: Active database session.
            brief: SessionBrief ORM object to delete.

        Returns:
            True once deleted.
        """
        session.delete(brief)
        session.commit()
        return True
