"""Plan 56 tests — the Town Crier.

The things that must not be wrong, in order of how much damage they do:
  1. The webhook URL never reaches a client. It is a bearer credential —
     anyone holding it can post to that channel forever.
  2. A public demo deployment cannot post into the DM's real Discord.
  3. A failed send is still logged, so nothing goes out (or fails to go
     out) without a trace.
"""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.crier_service as crier
from domain.crier import (
    CrierChannelCreate,
    CrierChannelUpdate,
    CrierNpcCreate,
    CrierSendRequest,
)
from integrations import discord_webhook

WEBHOOK = "https://discord.com/api/webhooks/123456789/abcdefghijklmnop"


def _dm() -> str:
    return f"dm-{uuid.uuid4().hex[:8]}@example.com"


def _campaign(db: Session, dm: str):
    return camp_svc.create_campaign(db, name="C", setting="S", tone="T", dm_email=dm)


def _channel(db: Session, cid, dm, url: str = WEBHOOK):
    return crier.create_channel(
        db, cid, dm, CrierChannelCreate(label="#blackreef-cove", webhook_url=url)
    )


def _npc(db: Session, cid, dm, name: str = "The Tallyman"):
    return crier.create_npc(
        db, cid, dm, CrierNpcCreate(name=name, avatar_url="https://x/a.png", embed_color=0xC8963E)
    )


@pytest.fixture()
def sent(monkeypatch):
    """Capture outbound Discord posts instead of making them.

    Args:
        monkeypatch: Pytest monkeypatch fixture.

    Returns:
        A list that each intercepted call appends its kwargs to.
    """
    calls: list[dict] = []

    def _fake_post(url, **kwargs):
        calls.append({"url": url, **kwargs})

    monkeypatch.setattr(discord_webhook, "post", _fake_post)
    return calls


# ── The credential must not leak ──────────────────────────────────────────────


def test_channel_read_omits_webhook_url(duckdb_session):
    """The client-facing projection carries no webhook URL, only a hint."""
    dm = _dm()
    camp = _campaign(duckdb_session, dm)
    read = _channel(duckdb_session, camp.id, dm)

    dumped = read.model_dump_json()
    assert "webhook" not in dumped.lower() or "url_hint" in dumped
    assert WEBHOOK not in dumped
    assert "abcdefghijklmnop" not in dumped
    assert read.configured is True
    # The hint is a tail short enough to be useless on its own.
    assert read.url_hint == "…klmnop"


def test_list_channels_never_serializes_the_url(duckdb_session):
    """Listing channels is the most-called route; it must stay clean too."""
    dm = _dm()
    camp = _campaign(duckdb_session, dm)
    _channel(duckdb_session, camp.id, dm)

    for row in crier.list_channels(duckdb_session, camp.id, dm):
        assert WEBHOOK not in row.model_dump_json()


def test_update_without_url_keeps_the_stored_one(duckdb_session, sent):
    """Renaming a channel must not blank its webhook.

    The UI never receives the URL, so it cannot echo one back on an edit.
    """
    dm = _dm()
    camp = _campaign(duckdb_session, dm)
    ch = _channel(duckdb_session, camp.id, dm)
    npc = _npc(duckdb_session, camp.id, dm)

    crier.update_channel(duckdb_session, ch.id, dm, CrierChannelUpdate(label="#renamed"))
    crier.send(
        duckdb_session,
        camp.id,
        dm,
        CrierSendRequest(channel_id=ch.id, npc_id=npc.id, content="hello"),
    )
    assert sent[0]["url"] == WEBHOOK


def test_rejects_a_non_discord_url(duckdb_session):
    """A pasted wrong URL fails loudly rather than posting somewhere odd."""
    dm = _dm()
    camp = _campaign(duckdb_session, dm)
    with pytest.raises(ValueError, match="Discord webhook URL"):
        crier.create_channel(
            duckdb_session,
            camp.id,
            dm,
            CrierChannelCreate(label="#x", webhook_url="https://evil.example/hook"),
        )


# ── Authorization ─────────────────────────────────────────────────────────────


def test_other_dm_cannot_list_or_send(duckdb_session):
    """Campaign ownership gates every crier operation."""
    dm, intruder = _dm(), _dm()
    camp = _campaign(duckdb_session, dm)
    ch = _channel(duckdb_session, camp.id, dm)
    npc = _npc(duckdb_session, camp.id, dm)

    with pytest.raises(PermissionError):
        crier.list_channels(duckdb_session, camp.id, intruder)
    with pytest.raises(PermissionError):
        crier.send(
            duckdb_session,
            camp.id,
            intruder,
            CrierSendRequest(channel_id=ch.id, npc_id=npc.id, content="hi"),
        )


def test_demo_mode_refuses_to_send(duckdb_session, monkeypatch, sent):
    """DEMO_MODE pins every visitor to one identity — so sending closes."""
    dm = _dm()
    camp = _campaign(duckdb_session, dm)
    ch = _channel(duckdb_session, camp.id, dm)
    npc = _npc(duckdb_session, camp.id, dm)

    monkeypatch.setenv("DEMO_MODE", "true")
    with pytest.raises(PermissionError, match="disabled on the public demo"):
        crier.send(
            duckdb_session,
            camp.id,
            dm,
            CrierSendRequest(channel_id=ch.id, npc_id=npc.id, content="hi"),
        )
    assert sent == []


def test_cannot_send_through_another_campaigns_channel(duckdb_session, sent):
    """Channel and identity must both belong to the campaign being posted to."""
    dm = _dm()
    mine = _campaign(duckdb_session, dm)
    theirs = _campaign(duckdb_session, dm)
    ch = _channel(duckdb_session, theirs.id, dm)
    npc = _npc(duckdb_session, mine.id, dm)

    with pytest.raises(ValueError, match="Channel not found"):
        crier.send(
            duckdb_session,
            mine.id,
            dm,
            CrierSendRequest(channel_id=ch.id, npc_id=npc.id, content="hi"),
        )


# ── Sending and the log ───────────────────────────────────────────────────────


def test_send_uses_the_npc_identity(duckdb_session, sent):
    """The NPC's name, face, and colour ride along on the post."""
    dm = _dm()
    camp = _campaign(duckdb_session, dm)
    ch = _channel(duckdb_session, camp.id, dm)
    npc = _npc(duckdb_session, camp.id, dm)

    crier.send(
        duckdb_session,
        camp.id,
        dm,
        CrierSendRequest(channel_id=ch.id, npc_id=npc.id, embed_description="Two paid, two owed."),
    )
    call = sent[0]
    assert call["username"] == "The Tallyman"
    assert call["avatar_url"] == "https://x/a.png"
    assert call["embed_color"] == 0xC8963E
    assert call["embed_description"] == "Two paid, two owed."


def test_failed_send_is_still_logged_then_raises(duckdb_session, monkeypatch):
    """A post that did not land must leave a trace, not vanish."""
    dm = _dm()
    camp = _campaign(duckdb_session, dm)
    ch = _channel(duckdb_session, camp.id, dm)
    npc = _npc(duckdb_session, camp.id, dm)

    def _boom(url, **kwargs):
        raise ValueError("Discord refused the post (HTTP 404)")

    monkeypatch.setattr(discord_webhook, "post", _boom)

    with pytest.raises(ValueError, match="404"):
        crier.send(
            duckdb_session,
            camp.id,
            dm,
            CrierSendRequest(channel_id=ch.id, npc_id=npc.id, content="hi"),
        )

    posts = crier.list_posts(duckdb_session, camp.id, dm)
    assert len(posts) == 1
    assert posts[0].status == "failed"
    assert "404" in posts[0].error


def test_log_snapshots_survive_a_rename(duckdb_session, sent):
    """The log keeps who posted where, even after the roster changes."""
    dm = _dm()
    camp = _campaign(duckdb_session, dm)
    ch = _channel(duckdb_session, camp.id, dm)
    npc = _npc(duckdb_session, camp.id, dm)

    crier.send(
        duckdb_session,
        camp.id,
        dm,
        CrierSendRequest(channel_id=ch.id, npc_id=npc.id, content="hi"),
    )
    crier.delete_npc(duckdb_session, npc.id, dm)

    posts = crier.list_posts(duckdb_session, camp.id, dm)
    assert posts[0].npc_name == "The Tallyman"
    assert posts[0].channel_label == "#blackreef-cove"


# ── Payload shape ─────────────────────────────────────────────────────────────


def test_empty_post_is_rejected_at_the_boundary():
    """Discord 400s on an empty message; fail in Pydantic instead."""
    with pytest.raises(ValueError):
        CrierSendRequest(channel_id=uuid.uuid4(), npc_id=uuid.uuid4(), content="   ")


def test_over_long_content_is_rejected():
    """Discord's 2000-char content cap is enforced before the DM hits send."""
    with pytest.raises(ValueError):
        CrierSendRequest(channel_id=uuid.uuid4(), npc_id=uuid.uuid4(), content="x" * 2001)


def test_payload_omits_empty_fields():
    """Discord rejects an embed with a null description — so don't send one."""
    payload = discord_webhook.build_payload(username="The Tallyman", content="just text")
    assert payload == {"username": "The Tallyman", "content": "just text"}
    assert "embeds" not in payload


def test_payload_carries_the_embed_and_colour():
    """An embed-only post still builds a valid body."""
    payload = discord_webhook.build_payload(
        username="Sister Maren",
        avatar_url="https://x/m.png",
        embed_description="Hm.",
        embed_color=0xD9C9A3,
    )
    assert payload["embeds"] == [{"description": "Hm.", "color": 0xD9C9A3}]
    assert "content" not in payload
