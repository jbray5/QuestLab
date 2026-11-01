"""Plan 131 — the DM spell catalog over the API, filtered to one edition with ``?ruleset=``."""

import uuid

from sqlmodel import Session

import services.spell_service as spell_svc
from domain.spell import SpellCreate

_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"


def _dm() -> dict:
    """Headers for a fresh DM."""
    return {_AUTH: f"dm131s_{uuid.uuid4().hex[:8]}@example.com"}


def _spell(name: str, **extras) -> dict:
    """A minimal spell payload."""
    payload = {
        "name": name,
        "level": 3,
        "school": "Evocation",
        "casting_time": "1 action",
        "range": "150 feet",
        "duration": "Instantaneous",
        "description": f"{name}.",
        "classes": ["Wizard"],
    }
    payload.update(extras)
    return payload


def _seed_both(engine) -> None:
    """One SRD Fireball per edition, through the startup seed path."""
    with Session(engine) as s:
        spell_svc.seed_spells(s, [SpellCreate(**_spell("Fireball"))], ruleset="2024")
        spell_svc.seed_spells(s, [SpellCreate(**_spell("Fireball"))], ruleset="2014")


def test_list_filters_to_one_edition_plus_homebrew(client, api_engine):
    """``?ruleset=2014`` returns the 2014 rows and the DM's homebrew; omitted returns all."""
    _seed_both(api_engine)
    headers = _dm()
    made = client.post("/api/spells", json=_spell("Homebrew Bolt"), headers=headers)
    assert made.status_code == 201, made.text

    got = client.get("/api/spells", params={"ruleset": "2014"}, headers=headers)
    assert got.status_code == 200, got.text
    assert sorted((s["name"], s["ruleset"] or "") for s in got.json()) == [
        ("Fireball", "2014"),
        ("Homebrew Bolt", ""),
    ]
    got_2024 = client.get("/api/spells", params={"ruleset": "2024"}, headers=headers)
    assert {s["ruleset"] for s in got_2024.json()} == {"2024", None}
    everything = client.get("/api/spells", headers=headers)
    assert len(everything.json()) == 3


def test_list_combines_ruleset_with_other_filters(client, api_engine):
    """The edition filter stacks with the class and name filters."""
    _seed_both(api_engine)
    got = client.get(
        "/api/spells", params={"ruleset": "2014", "class": "Wizard", "q": "fire"}, headers=_dm()
    )
    assert [(s["name"], s["ruleset"]) for s in got.json()] == [("Fireball", "2014")]


def test_bad_ruleset_is_422(client):
    """Anything but 2024/2014 is refused by validation."""
    got = client.get("/api/spells", params={"ruleset": "1999"}, headers=_dm())
    assert got.status_code == 422


def test_homebrew_from_the_api_has_no_ruleset(client):
    """POST /spells ignores a ruleset in the body: homebrew belongs to both editions."""
    headers = _dm()
    made = client.post("/api/spells", json=_spell("Sneaky", ruleset="2014"), headers=headers)
    assert made.status_code == 201, made.text
    assert made.json()["ruleset"] is None
    listed = client.get("/api/spells", params={"ruleset": "2024"}, headers=headers)
    assert "Sneaky" in {s["name"] for s in listed.json()}
