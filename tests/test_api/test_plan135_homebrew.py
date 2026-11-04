"""Plan 135 — the homebrew feat routes, the new race and subclass fields, and migration 0063.

Ownership works as for races (Plan 133): a DM sees only their own feats, others get a 403 on
change, a rules feat name is a 409, a bad field a 422.
"""

import importlib.util
import uuid
from pathlib import Path
from types import SimpleNamespace

from domain.homebrew import DAMAGE_TYPES

_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"


def _email() -> str:
    """A fresh DM email."""
    return f"dm135_{uuid.uuid4().hex[:8]}@example.com"


def _h(email: str) -> dict:
    """The trusted identity header for ``email``."""
    return {_AUTH: email}


def _feat(name: str = "Deadeye", **extras) -> dict:
    """A 2014 feat: +1 DEX, −5/+10 with ranged weapons."""
    payload = {
        "name": name,
        "ruleset": "2014",
        "category": "general",
        "blurb": "Long shots and hard hits.",
        "description": "Ranged attacks can take −5 to hit for +10 damage.",
        "prerequisite": "",
        "asi_options": ["DEX"],
        "repeatable": False,
        "power_attack": {"to_hit": -5, "damage": 10, "weapons": "ranged"},
    }
    payload.update(extras)
    return payload


def test_feat_routes(client):
    """Create (201), list own only, patch, 403 for others, 409 on a rules name, delete (204)."""
    dm, other = _email(), _email()
    made = client.post("/api/homebrew/feats", json=_feat(), headers=_h(dm))
    assert made.status_code == 201, made.text
    feat = made.json()
    assert feat["created_by_email"] == dm and feat["power_attack"]["damage"] == 10
    assert [f["name"] for f in client.get("/api/homebrew/feats", headers=_h(dm)).json()] == [
        "Deadeye"
    ]
    assert client.get("/api/homebrew/feats", headers=_h(other)).json() == []

    url = f"/api/homebrew/feats/{feat['id']}"
    assert client.patch(url, json={"blurb": "Mine."}, headers=_h(other)).status_code == 403
    assert client.delete(url, headers=_h(other)).status_code == 403
    patched = client.patch(url, json={"asi_options": None}, headers=_h(dm))
    assert patched.status_code == 200 and patched.json()["asi_options"] is None

    clash = client.post("/api/homebrew/feats", json=_feat("Grappler"), headers=_h(dm))
    assert clash.status_code == 409 and "Grappler" in clash.json()["detail"]
    bad = client.post(
        "/api/homebrew/feats",
        json=_feat("Wild", power_attack={"to_hit": 5, "damage": 10}),
        headers=_h(dm),
    )
    assert bad.status_code == 422

    assert client.delete(url, headers=_h(dm)).status_code == 204
    assert client.get("/api/homebrew/feats", headers=_h(dm)).json() == []


def test_race_and_subclass_routes_carry_the_new_fields(client):
    """Speeds and natural weapons on a race; counters on a subclass; left out = defaults."""
    dm = _email()
    race = client.post(
        "/api/homebrew/races",
        json={
            "name": "Rito",
            "speeds": {"fly": 30},
            "natural_weapons": [{"name": "Talons", "damage": "1d4", "damage_type": "slashing"}],
        },
        headers=_h(dm),
    )
    assert race.status_code == 201, race.text
    assert race.json()["speeds"] == {"fly": 30}
    assert race.json()["natural_weapons"][0]["ability"] == "STR"
    plain = client.post("/api/homebrew/races", json={"name": "Goron"}, headers=_h(dm)).json()
    assert plain["speeds"] is None and plain["natural_weapons"] == []

    sub = client.post(
        "/api/homebrew/subclasses",
        json={
            "name": "Sheikah Blade",
            "character_class": "Fighter",
            "resources": [
                {"name": "Superiority Dice", "level": 3, "uses": {"3": 4}, "die": {"3": "d8"}}
            ],
        },
        headers=_h(dm),
    )
    assert sub.status_code == 201, sub.text
    assert sub.json()["resources"][0]["recovery"] == "long"
    cleared = client.patch(
        f"/api/homebrew/races/{race.json()['id']}", json={"speeds": None}, headers=_h(dm)
    )
    assert cleared.status_code == 200 and cleared.json()["speeds"] is None
    refused = client.patch(
        f"/api/homebrew/races/{race.json()['id']}", json={"natural_weapons": None}, headers=_h(dm)
    )
    assert refused.status_code == 422


def test_damage_types_are_the_thirteen():
    """The natural-weapon damage types are the 13 of the rules."""
    assert len(DAMAGE_TYPES) == 13 and "slashing" in DAMAGE_TYPES


def test_migration_0063(monkeypatch):
    """homebrew_feats (indexed by author) and four JSON columns, NOT NULL ones with a default."""
    path = Path(__file__).resolve().parents[2] / "alembic" / "versions"
    spec = importlib.util.spec_from_file_location(
        "m0063", path / "0063_homebrew_feats_speeds_resources.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    calls: list[tuple] = []
    recorder = SimpleNamespace(
        create_table=lambda name, *cols, **kw: calls.append(("table", name, cols)),
        create_index=lambda name, table, cols, **kw: calls.append(("index", table, tuple(cols))),
        add_column=lambda table, col: calls.append(("column", table, col)),
    )
    monkeypatch.setattr(module, "op", recorder)
    module.upgrade()

    assert module.revision == "0063" and module.down_revision == "0062"
    assert {c[1] for c in calls if c[0] == "table"} == {"homebrew_feats"}
    assert ("index", "homebrew_feats", ("created_by_email",)) in calls
    columns = {(c[1], c[2].name): c[2] for c in calls if c[0] == "column"}
    assert set(columns) == {
        ("homebrew_races", "speeds"),
        ("homebrew_races", "natural_weapons"),
        ("homebrew_subclasses", "resources"),
        ("player_characters", "speeds"),
    }
    for key in (("homebrew_races", "natural_weapons"), ("homebrew_subclasses", "resources")):
        assert columns[key].nullable is False
        assert str(columns[key].server_default.arg) == "[]"
    assert columns[("player_characters", "speeds")].nullable is True
