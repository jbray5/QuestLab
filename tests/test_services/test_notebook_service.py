"""Plan 57 tests — the Session Notebook.

What must not be wrong, in constitutional order:
  1. Laws 1 and 2 — only the DM's own saves write blocks; margin pins
     (including suggestion pins saved before Plan 124) stay beside them.
  2. The feature flag: everything refuses while NOTEBOOK_ENABLED is off.
  3. Ownership gates every operation.
  4. Search finds what the DM wrote, with mention tokens collapsed.
"""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.notebook_service as nb
from domain.notebook import (
    NotebookCreate,
    PageCreate,
    PageUpdate,
)


@pytest.fixture(autouse=True)
def _enable_notebook(monkeypatch):
    """Notebook tests run with the feature flag on (except the flag test)."""
    monkeypatch.setenv("NOTEBOOK_ENABLED", "true")


def _dm() -> str:
    return f"dm-{uuid.uuid4().hex[:8]}@example.com"


def _campaign(db: Session, dm: str):
    return camp_svc.create_campaign(db, name="C", setting="Blackreef", tone="T", dm_email=dm)


def _notebook(db: Session, cid, dm, title="Session 5"):
    return nb.create_notebook(db, cid, dm, NotebookCreate(title=title))


def _page(db: Session, notebook_id, dm, title="Homecoming"):
    return nb.create_page(db, notebook_id, dm, PageCreate(title=title))


# ── The feature flag ──────────────────────────────────────────────────────────


def test_everything_refuses_when_flag_disabled(duckdb_session, monkeypatch):
    """NOTEBOOK_ENABLED=false is the kill switch: nothing runs."""
    dm = _dm()
    camp = _campaign(duckdb_session, dm)
    monkeypatch.setenv("NOTEBOOK_ENABLED", "false")

    with pytest.raises(PermissionError, match="disabled"):
        nb.list_notebooks(duckdb_session, camp.id, dm)
    with pytest.raises(PermissionError, match="disabled"):
        nb.create_notebook(duckdb_session, camp.id, dm, NotebookCreate(title="X"))
    with pytest.raises(PermissionError, match="disabled"):
        nb.search(duckdb_session, camp.id, dm, "anything")


def test_demo_mode_is_always_dark(duckdb_session, monkeypatch):
    """The shared-identity demo never gets a notebook, flag or no flag."""
    dm = _dm()
    camp = _campaign(duckdb_session, dm)
    monkeypatch.setenv("DEMO_MODE", "true")
    monkeypatch.setenv("NOTEBOOK_ENABLED", "true")

    with pytest.raises(PermissionError, match="demo"):
        nb.list_notebooks(duckdb_session, camp.id, dm)


# ── Ownership ─────────────────────────────────────────────────────────────────


def test_other_dm_cannot_touch_a_notebook(duckdb_session):
    """Campaign ownership gates notebooks, pages, and search."""
    dm, intruder = _dm(), _dm()
    camp = _campaign(duckdb_session, dm)
    notebook = _notebook(duckdb_session, camp.id, dm)
    page = _page(duckdb_session, notebook.id, dm)

    with pytest.raises(PermissionError):
        nb.list_pages(duckdb_session, notebook.id, intruder)
    with pytest.raises(PermissionError):
        nb.get_page(duckdb_session, page.id, intruder)
    with pytest.raises(PermissionError):
        nb.update_page(duckdb_session, page.id, intruder, PageUpdate(title="stolen"))


# ── The document ──────────────────────────────────────────────────────────────


def test_new_page_starts_with_one_empty_text_block(duckdb_session):
    """A fresh page is ready to type into."""
    dm = _dm()
    camp = _campaign(duckdb_session, dm)
    notebook = _notebook(duckdb_session, camp.id, dm)
    page = _page(duckdb_session, notebook.id, dm)

    assert len(page.blocks) == 1
    assert page.blocks[0]["type"] == "text"
    assert page.pins == []


def test_save_replaces_blocks_and_derives_search_text(duckdb_session):
    """The editor's single write path re-derives the search column."""
    dm = _dm()
    camp = _campaign(duckdb_session, dm)
    notebook = _notebook(duckdb_session, camp.id, dm)
    page = _page(duckdb_session, notebook.id, dm)

    blocks = [
        {"id": "b1", "type": "verbatim", "content": {"text": "The gangplank comes down."}},
        {"id": "b2", "type": "card", "content": {"title": "Beats", "beats": ["board the ship"]}},
        {"id": "b3", "type": "sketch", "content": {"paths": [], "height": 240}},
    ]
    saved = nb.update_page(duckdb_session, page.id, dm, PageUpdate(blocks=blocks))
    assert "gangplank" in saved.search_text
    assert "board the ship" in saved.search_text
    # Sketches contribute nothing textual.
    assert "paths" not in saved.search_text


def test_mention_tokens_collapse_to_names_in_search_text(duckdb_session):
    """@[Mira](npc:123) is searchable as 'Mira', not as token syntax."""
    dm = _dm()
    camp = _campaign(duckdb_session, dm)
    notebook = _notebook(duckdb_session, camp.id, dm)
    page = _page(duckdb_session, notebook.id, dm)

    blocks = [
        {
            "id": "b1",
            "type": "text",
            # Long (original) and short (current) token forms together.
            "content": {"text": "@[Mira](npc:abc-123) meets @[Edrik] at [[The Mooring]]."},
        }
    ]
    saved = nb.update_page(duckdb_session, page.id, dm, PageUpdate(blocks=blocks))
    assert "Mira meets Edrik at The Mooring." in saved.search_text
    assert "npc:abc-123" not in saved.search_text
    assert "@[" not in saved.search_text


def test_deleting_a_notebook_removes_its_pages(duckdb_session):
    """No orphan pages behind a deleted notebook."""
    dm = _dm()
    camp = _campaign(duckdb_session, dm)
    notebook = _notebook(duckdb_session, camp.id, dm)
    page = _page(duckdb_session, notebook.id, dm)

    nb.delete_notebook(duckdb_session, notebook.id, dm)
    with pytest.raises(ValueError, match="not found"):
        nb.get_page(duckdb_session, page.id, dm)


# ── Search ────────────────────────────────────────────────────────────────────


def test_search_hits_title_and_body_with_snippet(duckdb_session):
    """The acceptance search: 'gangplank' found across pages."""
    dm = _dm()
    camp = _campaign(duckdb_session, dm)
    notebook = _notebook(duckdb_session, camp.id, dm)
    p1 = _page(duckdb_session, notebook.id, dm, title="Homecoming")
    _page(duckdb_session, notebook.id, dm, title="The Gangplank Question")
    nb.update_page(
        duckdb_session,
        p1.id,
        dm,
        PageUpdate(
            blocks=[
                {
                    "id": "b1",
                    "type": "text",
                    "content": {"text": "Night falls and the gangplank waits for them."},
                }
            ]
        ),
    )

    hits = nb.search(duckdb_session, camp.id, dm, "gangplank")
    titles = {h.page_title for h in hits}
    assert titles == {"Homecoming", "The Gangplank Question"}
    body_hit = next(h for h in hits if h.page_title == "Homecoming")
    assert "gangplank" in body_hit.snippet.lower()
    assert body_hit.notebook_title == "Session 5"


def test_search_empty_query_returns_nothing(duckdb_session):
    """Blank searches don't dump the whole campaign."""
    dm = _dm()
    camp = _campaign(duckdb_session, dm)
    assert nb.search(duckdb_session, camp.id, dm, "   ") == []


# ── Promote (the only one) ────────────────────────────────────────────────────


def test_runbook_flag_is_the_only_promotion(duckdb_session):
    """Flagging surfaces the page in the runbook list; unflagging removes it."""
    dm = _dm()
    camp = _campaign(duckdb_session, dm)
    notebook = _notebook(duckdb_session, camp.id, dm)
    page = _page(duckdb_session, notebook.id, dm)

    assert nb.list_runbooks(duckdb_session, camp.id, dm) == []
    nb.update_page(duckdb_session, page.id, dm, PageUpdate(is_runbook=True))
    assert [p.id for p in nb.list_runbooks(duckdb_session, camp.id, dm)] == [page.id]
    nb.update_page(duckdb_session, page.id, dm, PageUpdate(is_runbook=False))
    assert nb.list_runbooks(duckdb_session, camp.id, dm) == []


# ── The margin (Law 2) ────────────────────────────────────────────────────────


def test_saved_suggestion_pins_still_load_beside_the_page(duckdb_session):
    """Suggestion pins saved before Plan 124 round-trip untouched and never enter blocks."""
    dm = _dm()
    camp = _campaign(duckdb_session, dm)
    notebook = _notebook(duckdb_session, camp.id, dm)
    page = _page(duckdb_session, notebook.id, dm)
    blocks = [{"id": "b1", "type": "text", "content": {"text": "They board at midnight."}}]
    pins = [
        {
            "id": "p1",
            "block_id": "b1",
            "kind": "ai",
            "text": "The rail is wet.",
            "model": "older-model",
            "at": "2026-08-01T00:00:00Z",
            "prompt": "They board at midnight.",
        }
    ]
    nb.update_page(duckdb_session, page.id, dm, PageUpdate(blocks=blocks, pins=pins))

    after = nb.get_page(duckdb_session, page.id, dm)
    assert after.blocks == blocks
    assert after.pins == pins
