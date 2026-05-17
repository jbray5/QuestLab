"""In-process pub/sub event bus for live sync (Plan 00026).

Used by services to emit ``pc.updated``-style events whenever a PC's
state changes. Subscribed to by the SSE endpoints in
``api/routers/stream.py`` so connected player views and DM HUDs can
refetch.

Design:
- Subscribers register a ``queue.SimpleQueue`` under one or more topics.
- ``publish(topic, event)`` enqueues the event for every subscriber of
  that topic, non-blocking. Slow/full subscribers drop events silently;
  React Query's window-focus refetch closes any state drift on resume.
- Topics are free-form strings. Convention:
    pc:{pcId}             — events for a single PC
    campaign:{campaignId} — events for any PC in a campaign

Single-process design — when we scale beyond one Render instance, swap
the backing store for Redis pub/sub. Public API (``subscribe``,
``unsubscribe``, ``publish``) is intentionally narrow to make that swap
trivial.
"""

from __future__ import annotations

import queue
import threading
from collections.abc import Iterable
from typing import Any

# Type alias for events. Kept open so each event-emitting service can
# decide the shape, but conventionally:
#   {"type": "pc.updated", "pc_id": "...", "campaign_id": "..."}
Event = dict[str, Any]


class _EventBus:
    """In-process pub/sub. Thread-safe.

    Single module-level instance via ``event_bus`` below — do not
    instantiate elsewhere.
    """

    # Per-subscriber queue capacity. Bigger than expected burst (a long
    # rest restoring all features + slots for one PC fires ~6 events).
    _QUEUE_MAX = 64

    def __init__(self) -> None:
        """Initialize an empty bus with a re-entrant lock guarding the maps."""
        self._lock = threading.Lock()
        self._topics: dict[str, set[queue.Queue]] = {}

    def subscribe(self, topics: Iterable[str]) -> queue.Queue:
        """Register a new subscriber queue under the given topics.

        Args:
            topics: Iterable of topic strings to register the queue under.

        Returns:
            The subscriber's ``queue.Queue`` — read from this to receive
            events. Caller is responsible for calling ``unsubscribe`` on
            disconnect.
        """
        q: queue.Queue = queue.Queue(maxsize=self._QUEUE_MAX)
        with self._lock:
            for topic in topics:
                self._topics.setdefault(topic, set()).add(q)
        return q

    def unsubscribe(self, topics: Iterable[str], q: queue.Queue) -> None:
        """Remove a subscriber queue from the given topics.

        Args:
            topics: Iterable of topic strings to unregister.
            q: The queue returned by ``subscribe``.
        """
        with self._lock:
            for topic in topics:
                subs = self._topics.get(topic)
                if subs is None:
                    continue
                subs.discard(q)
                if not subs:
                    self._topics.pop(topic, None)

    def publish(self, topic: str, event: Event) -> int:
        """Publish an event to all subscribers of ``topic``.

        Non-blocking: if a subscriber's queue is full, the event is
        dropped for that subscriber (the client will pick up state on
        the next refocus/refetch).

        Args:
            topic: Topic string to publish to.
            event: Event payload. Typically contains a ``type`` field.

        Returns:
            Number of subscribers the event was successfully delivered to
            (not including those whose queues were full).
        """
        with self._lock:
            subs = list(self._topics.get(topic, ()))
        delivered = 0
        for q in subs:
            try:
                q.put_nowait(event)
                delivered += 1
            except queue.Full:
                continue
        return delivered

    def topic_count(self) -> int:
        """Return the number of topics with at least one subscriber.

        Useful for tests and ad-hoc introspection.
        """
        with self._lock:
            return len(self._topics)

    def subscriber_count(self, topic: str) -> int:
        """Return the number of subscribers for a given topic.

        Args:
            topic: Topic string to count.

        Returns:
            Number of registered subscriber queues, or 0 if none.
        """
        with self._lock:
            return len(self._topics.get(topic, ()))


# Module-level singleton — callers do ``from integrations.event_bus import event_bus``.
event_bus = _EventBus()


# ── Convenience publishers ────────────────────────────────────────────────────
# Services call these instead of constructing the topic + payload by hand,
# so the event taxonomy lives in one place.


def publish_pc_updated(pc_id: Any, campaign_id: Any, kind: str = "pc.updated") -> None:
    """Publish a PC-mutation event to both per-PC and per-campaign topics.

    Args:
        pc_id: UUID of the player character that changed.
        campaign_id: UUID of the owning campaign.
        kind: Event type label — defaults to ``"pc.updated"``. Use a
            more specific label (``"pc.spells.updated"``,
            ``"pc.features.updated"``, etc.) when the caller knows what
            React-Query keys to invalidate. The default is fine for
            "anything about this PC may have changed."
    """
    payload: Event = {
        "type": kind,
        "pc_id": str(pc_id),
        "campaign_id": str(campaign_id),
    }
    event_bus.publish(f"pc:{pc_id}", payload)
    event_bus.publish(f"campaign:{campaign_id}", payload)


def publish_session_combat_updated(session_id: Any, campaign_id: Any) -> None:
    """Publish a combat-tracker change event to the campaign topic.

    Args:
        session_id: UUID of the session whose combat tracker changed.
        campaign_id: UUID of the owning campaign.
    """
    payload: Event = {
        "type": "session.combat.updated",
        "session_id": str(session_id),
        "campaign_id": str(campaign_id),
    }
    event_bus.publish(f"campaign:{campaign_id}", payload)


def publish_pc_turn_changed(pc_id: Any, active: bool, **extra: Any) -> None:
    """Publish a per-PC turn-state change event (Plan 00028).

    Used when combat advances or is restarted: emit ``active=True`` to the
    PC whose turn just began and ``active=False`` to the PC whose turn just
    ended. The player view listens on its ``pc:{pcId}`` stream and toggles
    the "It's your turn!" banner.

    Args:
        pc_id: UUID of the player character whose turn just changed.
        active: True if it's now this PC's turn; False if it just ended.
        **extra: Optional extras (session_id, round, active_combatant_name).
    """
    payload: Event = {
        "type": "pc.turn.changed",
        "pc_id": str(pc_id),
        "active": active,
    }
    payload.update({k: (str(v) if k.endswith("_id") else v) for k, v in extra.items()})
    event_bus.publish(f"pc:{pc_id}", payload)
