"""Tests for the in-process event bus (Plan 00026)."""

import queue
import threading
import uuid

import pytest

from integrations.event_bus import (
    _EventBus,
)
from integrations.event_bus import event_bus as module_singleton
from integrations.event_bus import (
    publish_pc_updated,
    publish_session_combat_updated,
)


@pytest.fixture
def bus():
    """A fresh _EventBus instance per test (avoids cross-test bleed)."""
    return _EventBus()


class TestSubscribe:
    """Subscribe / unsubscribe lifecycle."""

    def test_subscribe_returns_queue(self, bus):
        """subscribe returns a queue.Queue (typed via duck-typing on get/put)."""
        q = bus.subscribe(["topic-a"])
        assert hasattr(q, "get")
        assert hasattr(q, "put_nowait")
        assert bus.subscriber_count("topic-a") == 1

    def test_subscribe_multiple_topics(self, bus):
        """One queue can be registered under several topics."""
        bus.subscribe(["topic-a", "topic-b"])
        assert bus.subscriber_count("topic-a") == 1
        assert bus.subscriber_count("topic-b") == 1
        assert bus.topic_count() == 2

    def test_unsubscribe_removes_only_that_queue(self, bus):
        """Unsubscribing one queue leaves others on the same topic."""
        q1 = bus.subscribe(["topic-a"])
        bus.subscribe(["topic-a"])
        assert bus.subscriber_count("topic-a") == 2
        bus.unsubscribe(["topic-a"], q1)
        assert bus.subscriber_count("topic-a") == 1

    def test_unsubscribe_last_removes_topic(self, bus):
        """When the last subscriber leaves, the topic is dropped from the map."""
        q = bus.subscribe(["topic-a"])
        bus.unsubscribe(["topic-a"], q)
        assert bus.subscriber_count("topic-a") == 0
        assert bus.topic_count() == 0


class TestPublish:
    """publish delivers events; non-blocking on slow subscribers."""

    def test_publish_delivers_to_subscriber(self, bus):
        """Event arrives in the subscriber's queue."""
        q = bus.subscribe(["topic-a"])
        bus.publish("topic-a", {"type": "ping", "n": 1})
        evt = q.get(timeout=0.1)
        assert evt == {"type": "ping", "n": 1}

    def test_publish_to_empty_topic_is_noop(self, bus):
        """No subscribers means delivered=0, no raise."""
        delivered = bus.publish("nobody-here", {"x": 1})
        assert delivered == 0

    def test_publish_to_multiple_subscribers(self, bus):
        """Both subscribers on the same topic receive the event."""
        q1 = bus.subscribe(["topic-a"])
        q2 = bus.subscribe(["topic-a"])
        bus.publish("topic-a", {"type": "ping"})
        assert q1.get(timeout=0.1) == {"type": "ping"}
        assert q2.get(timeout=0.1) == {"type": "ping"}

    def test_publish_does_not_cross_topics(self, bus):
        """A topic-a subscriber does NOT see a topic-b event."""
        q_a = bus.subscribe(["topic-a"])
        bus.subscribe(["topic-b"])
        bus.publish("topic-b", {"type": "ping"})
        with pytest.raises(queue.Empty):
            q_a.get(timeout=0.05)

    def test_publish_drops_when_queue_full(self, bus):
        """A subscriber that never reads gets events dropped past capacity."""
        q = bus.subscribe(["topic-a"])
        # Fill past capacity
        for i in range(_EventBus._QUEUE_MAX + 5):
            bus.publish("topic-a", {"i": i})
        # Drain — should have exactly _QUEUE_MAX
        received = 0
        try:
            while True:
                q.get_nowait()
                received += 1
        except queue.Empty:
            pass
        assert received == _EventBus._QUEUE_MAX


class TestPublishHelpers:
    """The convenience publishers stamp the topics correctly."""

    def test_publish_pc_updated_hits_both_topics(self):
        """publish_pc_updated emits to pc:{id} and campaign:{id}."""
        pc_id = uuid.uuid4()
        c_id = uuid.uuid4()
        q_pc = module_singleton.subscribe([f"pc:{pc_id}"])
        q_campaign = module_singleton.subscribe([f"campaign:{c_id}"])
        try:
            publish_pc_updated(pc_id, c_id)
            evt_pc = q_pc.get(timeout=0.1)
            evt_campaign = q_campaign.get(timeout=0.1)
            assert evt_pc["type"] == "pc.updated"
            assert evt_pc["pc_id"] == str(pc_id)
            assert evt_pc["campaign_id"] == str(c_id)
            assert evt_campaign == evt_pc
        finally:
            module_singleton.unsubscribe([f"pc:{pc_id}"], q_pc)
            module_singleton.unsubscribe([f"campaign:{c_id}"], q_campaign)

    def test_publish_pc_updated_custom_kind(self):
        """A custom kind label overrides the default."""
        pc_id = uuid.uuid4()
        c_id = uuid.uuid4()
        q = module_singleton.subscribe([f"pc:{pc_id}"])
        try:
            publish_pc_updated(pc_id, c_id, kind="pc.spells.updated")
            evt = q.get(timeout=0.1)
            assert evt["type"] == "pc.spells.updated"
        finally:
            module_singleton.unsubscribe([f"pc:{pc_id}"], q)

    def test_publish_session_combat_updated(self):
        """Combat events go to the campaign topic with the right payload."""
        session_id = uuid.uuid4()
        c_id = uuid.uuid4()
        q = module_singleton.subscribe([f"campaign:{c_id}"])
        try:
            publish_session_combat_updated(session_id, c_id)
            evt = q.get(timeout=0.1)
            assert evt["type"] == "session.combat.updated"
            assert evt["session_id"] == str(session_id)
            assert evt["campaign_id"] == str(c_id)
        finally:
            module_singleton.unsubscribe([f"campaign:{c_id}"], q)


class TestThreadSafety:
    """Publishing from a non-main thread still delivers."""

    def test_threaded_publisher(self, bus):
        """A worker thread can publish while the main thread reads."""
        q = bus.subscribe(["topic-a"])

        def worker():
            for i in range(20):
                bus.publish("topic-a", {"i": i})

        t = threading.Thread(target=worker)
        t.start()
        t.join(timeout=1.0)

        received = []
        try:
            while True:
                received.append(q.get_nowait())
        except queue.Empty:
            pass
        assert len(received) == 20
