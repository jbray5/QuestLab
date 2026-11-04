"""Plan 133 — DM homebrew races and subclasses, and the custom origin switch.

James (beta, 11/3) runs a 2014 Zelda campaign: he needs races with traits, skills, speed and
languages, and subclasses with features. A DM makes them in their own catalog; nobody else
sees them, and every character in that DM's campaigns can pick them (``for_campaign``).
Characters refer to them by name, so one in use can't be deleted or renamed. Custom origin
(Tasha's rule) is a 2014 switch on the campaign.
"""

import importlib.util
import uuid
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import sqlalchemy as sa
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.homebrew_service as hb_svc
from domain.character import PlayerCharacterUpdate
from domain.enums import CharacterClass
from domain.homebrew import CLASS_NAMES, SKILLS
from integrations.dnd_rules import rulesets

_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"


def _email() -> str:
    """A fresh DM email."""
    return f"dm133_{uuid.uuid4().hex[:8]}@example.com"


def _h(email: str) -> dict:
    """The trusted identity header for ``email``."""
    return {_AUTH: email}


def _race(name: str = "Hylian", **extras) -> dict:
    """James's Hylian: 2014, +2 DEX +1 WIS, Perception, two traits."""
    payload = {
        "name": name,
        "ruleset": "2014",
        "size": "Medium",
        "speed": 30,
        "ability_bonuses": {"DEX": 2, "WIS": 1},
        "ability_choice": None,
        "skills": ["Perception"],
        "skill_choice": 0,
        "traits": [
            {"name": "Hylian Ears", "text": "You hear the whispers of the goddess."},
            {"name": "Courage", "text": "Advantage on saves against being frightened."},
        ],
        "languages": "Common and Hylian",
        "hp_per_level": 0,
        "darkvision": None,
    }
    payload.update(extras)
    return payload


def _subclass(name: str = "Oath of the Triforce", **extras) -> dict:
    """A Paladin oath with features at 3 and 7, and always-prepared spells at 3."""
    payload = {
        "name": name,
        "character_class": "Paladin",
        "ruleset": None,
        "blurb": "Knights sworn to the three golden triangles.",
        "features": [
            {"level": 7, "name": "Aura of Wisdom", "text": "Allies near you add your Wisdom."},
            {"level": 3, "name": "Triforce Strike", "text": "Spend a Channel Divinity..."},
        ],
        "always_prepared": {"3": ["Shield of Faith", "Bless"]},
    }
    payload.update(extras)
    return payload


def _post(client, path: str, body: dict, email: str):
    """POST ``body`` to ``/api/homebrew/{path}`` as ``email``."""
    return client.post(f"/api/homebrew/{path}", json=body, headers=_h(email))


def _made(client, path: str, body: dict, email: str) -> dict:
    """Create a race or subclass and return it, asserting a 201."""
    got = _post(client, path, body, email)
    assert got.status_code == 201, got.text
    return got.json()


def _campaign(engine, dm: str, ruleset: str = "2014", **extras):
    """A campaign of ``dm``'s; return its CampaignRead."""
    with Session(engine) as s:
        return camp_svc.create_campaign(
            s, name=f"Hyrule {ruleset}", dm_email=dm, ruleset=ruleset, **extras
        )


def _pc(engine, dm: str, campaign_id, name: str, race: str, cls=CharacterClass.FIGHTER, **kw):
    """A level-3 character in ``dm``'s campaign; return its id."""
    with Session(engine) as s:
        pc = char_svc.create_character(
            s,
            campaign_id=campaign_id,
            dm_email=dm,
            player_name="Pat",
            character_name=name,
            race=race,
            character_class=cls,
            level=3,
            score_str=14,
            score_dex=14,
            score_con=13,
            score_int=10,
            score_wis=12,
            score_cha=10,
            hp_max=24,
            hp_current=24,
            ac=15,
            **kw,
        )
        return pc.id


def _update_pc(engine, dm: str, pc_id, **fields) -> None:
    """Change a character's fields as its DM."""
    with Session(engine) as s:
        char_svc.update_character(s, pc_id, dm, PlayerCharacterUpdate(**fields))


# ── Create, list and ownership ──────────────────────────────────────────────


def test_a_race_is_stamped_and_listed_only_to_its_dm(client):
    """The author is stamped from the caller; another DM's list stays empty."""
    dm, other = _email(), _email()
    race = _made(client, "races", _race(), dm)
    assert race["created_by_email"] == dm
    assert race["ability_bonuses"] == {"DEX": 2, "WIS": 1}
    assert race["skills"] == ["Perception"]
    assert [t["name"] for t in race["traits"]] == ["Hylian Ears", "Courage"]
    assert race["created_at"] and race["updated_at"]

    mine = client.get("/api/homebrew/races", headers=_h(dm)).json()
    assert [r["name"] for r in mine] == ["Hylian"]
    assert client.get("/api/homebrew/races", headers=_h(other)).json() == []


def test_another_dm_cannot_change_or_delete_it(client):
    """403 on another DM's race or subclass; 404 for one that doesn't exist."""
    dm, other = _email(), _email()
    race = _made(client, "races", _race(), dm)
    sub = _made(client, "subclasses", _subclass(), dm)

    for path, change in (
        (f"races/{race['id']}", {"speed": 35}),
        (f"subclasses/{sub['id']}", {"blurb": "x"}),
    ):
        changed = client.patch(f"/api/homebrew/{path}", json=change, headers=_h(other))
        assert changed.status_code == 403, changed.text
        assert "Only the DM who made" in changed.json()["detail"]
        assert client.delete(f"/api/homebrew/{path}", headers=_h(other)).status_code == 403

    missing = client.patch(f"/api/homebrew/races/{uuid.uuid4()}", json={}, headers=_h(dm))
    assert missing.status_code == 404
    assert (
        client.delete(f"/api/homebrew/subclasses/{uuid.uuid4()}", headers=_h(dm)).status_code == 404
    )


def test_no_identity_is_refused(client):
    """Fail closed: no header, no homebrew."""
    assert client.get("/api/homebrew/races").status_code == 401
    assert client.post("/api/homebrew/subclasses", json=_subclass()).status_code == 401


def test_owner_edits_and_deletes(client):
    """The author edits fields (unset ones stay) and deletes an unused race."""
    dm = _email()
    race = _made(client, "races", _race(), dm)
    got = client.patch(
        f"/api/homebrew/races/{race['id']}",
        json={"speed": 35, "darkvision": 60, "skills": ["stealth", "Perception"]},
        headers=_h(dm),
    )
    assert got.status_code == 200, got.text
    body = got.json()
    assert (body["speed"], body["darkvision"]) == (35, 60)
    assert body["skills"] == ["Stealth", "Perception"]
    assert body["ability_bonuses"] == {"DEX": 2, "WIS": 1}
    assert body["updated_at"] >= race["updated_at"]

    assert client.delete(f"/api/homebrew/races/{race['id']}", headers=_h(dm)).status_code == 204
    assert client.get("/api/homebrew/races", headers=_h(dm)).json() == []


def test_subclasses_sort_features_and_filter_by_class(client):
    """Features come back in level order; ?character_class= keeps one class."""
    dm = _email()
    sub = _made(client, "subclasses", _subclass(), dm)
    assert [f["level"] for f in sub["features"]] == [3, 7]
    assert sub["character_class"] == "Paladin"
    assert sub["always_prepared"] == {"3": ["Bless", "Shield of Faith"]}
    _made(client, "subclasses", _subclass("Way of the Wind", character_class="monk"), dm)

    paladins = client.get(
        "/api/homebrew/subclasses", params={"character_class": "paladin"}, headers=_h(dm)
    ).json()
    assert [s["name"] for s in paladins] == ["Oath of the Triforce"]
    every = client.get("/api/homebrew/subclasses", headers=_h(dm)).json()
    assert [s["character_class"] for s in every] == ["Monk", "Paladin"]
    bad = client.get(
        "/api/homebrew/subclasses", params={"character_class": "Bard-ish"}, headers=_h(dm)
    )
    assert bad.status_code == 422


# ── Names ───────────────────────────────────────────────────────────────────


def test_names_are_unique_per_dm_ignoring_case(client):
    """A second "hylian" is a 409; another DM may use the name."""
    dm, other = _email(), _email()
    _made(client, "races", _race(), dm)
    again = _post(client, "races", _race("  HYLIAN "), dm)
    assert again.status_code == 409
    assert "already have a homebrew race called Hylian" in again.json()["detail"]
    assert _post(client, "races", _race(), other).status_code == 201

    _made(client, "subclasses", _subclass(), dm)
    clash = _post(
        client, "subclasses", _subclass("oath of the triforce", character_class="Cleric"), dm
    )
    assert clash.status_code == 409


def test_srd_names_are_refused(client):
    """An SRD race, 2014 subrace or subclass name (either edition) is a 409."""
    dm = _email()
    for name in ("Dwarf", "half-orc", "Goliath", "Hill Dwarf"):
        got = _post(client, "races", _race(name), dm)
        assert got.status_code == 409, name
        assert "The rules already have a race" in got.json()["detail"]
    for name, cls in (
        ("Champion", "Paladin"),
        ("way of the open hand", "Monk"),
        ("Evoker", "Wizard"),
    ):
        got = _post(client, "subclasses", _subclass(name, character_class=cls), dm)
        assert got.status_code == 409, name
        assert "The rules already have a subclass" in got.json()["detail"]


def test_rename_to_a_taken_name_is_refused(client):
    """Renaming checks the same rules; renaming to itself in other case is fine."""
    dm = _email()
    _made(client, "races", _race(), dm)
    goron = _made(client, "races", _race("Goron", ability_bonuses={"STR": 2, "CON": 1}), dm)
    url = f"/api/homebrew/races/{goron['id']}"
    assert client.patch(url, json={"name": "hylian"}, headers=_h(dm)).status_code == 409
    assert client.patch(url, json={"name": "Elf"}, headers=_h(dm)).status_code == 409
    assert client.patch(url, json={"name": "GORON"}, headers=_h(dm)).status_code == 200


# ── Validation ──────────────────────────────────────────────────────────────


def test_bad_races_are_422(client):
    """Bonuses, totals, skills, darkvision, speed, size and names are checked."""
    dm = _email()
    bad = [
        _race(ability_bonuses={"DEX": 3}),
        _race(ability_bonuses={"DEX": 2, "WIS": 2, "STR": 2, "CON": 1}),
        _race(ability_bonuses={"DEX": 2, "WIS": 2}, ability_choice={"choose": 3}),
        _race(ability_bonuses={"LUCK": 1}),
        _race(skills=["Cooking"]),
        _race(skill_choice=5),
        _race(darkvision=90),
        _race(speed=33),
        _race(speed=70),
        _race(size="Large"),
        _race(hp_per_level=3),
        _race(name="   "),
        _race(traits=[{"name": "", "text": "x"}]),
        _race(traits=[{"name": f"T{i}", "text": ""} for i in range(21)]),
        _race(ruleset="5e"),
    ]
    for body in bad:
        got = _post(client, "races", body, dm)
        assert got.status_code == 422, body


def test_a_merged_update_over_six_is_422(client):
    """A partial update is checked against the whole race: the cap is +6 in all (a Human)."""
    dm = _email()
    race = _made(client, "races", _race(), dm)
    url = f"/api/homebrew/races/{race['id']}"
    ok = client.patch(url, json={"ability_choice": {"choose": 3}}, headers=_h(dm))
    assert ok.status_code == 200, ok.text  # +2/+1 and three +1 picks: +6
    human = _made(
        client,
        "races",
        _race(
            "Everyman", ability_bonuses={a: 1 for a in ("STR", "DEX", "CON", "INT", "WIS", "CHA")}
        ),
        dm,
    )
    assert human["ability_bonuses"]["CHA"] == 1
    over = client.patch(
        url,
        json={"ability_bonuses": {"DEX": 2, "WIS": 2}, "ability_choice": {"choose": 3}},
        headers=_h(dm),
    )
    assert over.status_code == 422
    assert "+6" in over.json()["detail"]
    assert client.patch(url, json={"name": None}, headers=_h(dm)).status_code == 422


def test_bad_subclasses_are_422(client):
    """Class, feature levels and lengths, and the always-prepared shape are checked."""
    dm = _email()
    bad = [
        _subclass(character_class="Artificer"),
        _subclass(character_class="Jester"),
        _subclass(features=[{"level": 21, "name": "Too late", "text": ""}]),
        _subclass(features=[{"level": 3, "name": "x" * 81, "text": ""}]),
        _subclass(features=[{"level": 3, "name": "Long", "text": "x" * 2001}]),
        _subclass(features=[{"level": 3, "name": f"F{i}", "text": ""} for i in range(41)]),
        _subclass(always_prepared={"0": ["Bless"]}),
        _subclass(always_prepared=["Bless"]),
        _subclass(blurb="x" * 301),
    ]
    for body in bad:
        got = _post(client, "subclasses", body, dm)
        assert got.status_code == 422, body


# ── for_campaign ────────────────────────────────────────────────────────────


def test_for_campaign_keeps_the_dms_rows_that_fit_the_rules(client, api_engine):
    """A 2014 campaign gets "both" and 2014 rows; a 2024 one "both" and 2024; others none."""
    dm, other = _email(), _email()
    _made(client, "races", _race("Hylian", ruleset=None), dm)
    _made(client, "races", _race("Zora", ruleset="2014"), dm)
    _made(client, "races", _race("Rito", ruleset="2024", ability_bonuses={}), dm)
    _made(client, "subclasses", _subclass(ruleset="2014"), dm)
    _made(client, "subclasses", _subclass("Path of the Gerudo", character_class="Barbarian"), dm)
    _made(client, "races", _race("Kokiri", ruleset=None), other)

    c14, c24 = _campaign(api_engine, dm, "2014"), _campaign(api_engine, dm, "2024")
    c_other = _campaign(api_engine, other, "2024")
    with Session(api_engine) as s:
        races14, subs14 = hb_svc.for_campaign(s, c14)
        races24, subs24 = hb_svc.for_campaign(s, c24)
        theirs, _ = hb_svc.for_campaign(s, c_other)
        assert [r.name for r in races14] == ["Hylian", "Zora"]
        assert [r.name for r in races24] == ["Hylian", "Rito"]
        assert [(x.character_class, x.name) for x in subs14] == [
            ("Barbarian", "Path of the Gerudo"),
            ("Paladin", "Oath of the Triforce"),
        ]
        assert [x.name for x in subs24] == ["Path of the Gerudo"]
        assert [r.name for r in theirs] == ["Kokiri"]

        # Name lookups, as the builder and the level-up guide use them.
        assert hb_svc.race_for(s, c14, " zora ").name == "Zora"
        assert hb_svc.race_for(s, c24, "Zora") is None
        assert hb_svc.race_for(s, c14, "Kokiri") is None
        found = hb_svc.subclass_for(s, c14, CharacterClass.PALADIN, "oath of the triforce")
        assert found is not None and [f.level for f in found.features] == [3, 7]
        assert hb_svc.subclass_for(s, c14, "Fighter", "Oath of the Triforce") is None
        assert hb_svc.subclass_for(s, c24, "Paladin", "Oath of the Triforce") is None

        # Anything with dm_email and ruleset will do (a Campaign row, a CampaignRead, ...).
        loose = SimpleNamespace(dm_email=dm.upper(), ruleset=None)
        assert [r.name for r in hb_svc.for_campaign(s, loose)[0]] == ["Hylian", "Rito"]


# ── In use ──────────────────────────────────────────────────────────────────


def test_a_race_in_use_cannot_be_deleted_until_freed(client, api_engine):
    """The 409 names who uses it; once nobody does, it deletes."""
    dm = _email()
    race = _made(client, "races", _race(), dm)
    campaign = _campaign(api_engine, dm)
    link = _pc(api_engine, dm, campaign.id, "Link", "hylian")
    url = f"/api/homebrew/races/{race['id']}"

    refused = client.delete(url, headers=_h(dm))
    assert refused.status_code == 409
    assert refused.json()["detail"] == (
        "Hylian can't be deleted yet: Link uses it. Change Link's race first, then delete it."
    )
    # A rename would orphan Link's sheet too; other fields are fine.
    assert client.patch(url, json={"name": "Hyrulean"}, headers=_h(dm)).status_code == 409
    assert client.patch(url, json={"speed": 35}, headers=_h(dm)).status_code == 200
    # Narrowing to the rules Link doesn't play by is refused; to his own is fine.
    assert client.patch(url, json={"ruleset": "2024"}, headers=_h(dm)).status_code == 409
    assert client.patch(url, json={"ruleset": None}, headers=_h(dm)).status_code == 200

    _update_pc(api_engine, dm, link, race="Human")
    assert client.delete(url, headers=_h(dm)).status_code == 204


def test_only_the_owners_campaigns_count(client, api_engine):
    """Another DM's character with the same race name doesn't block the delete."""
    dm, other = _email(), _email()
    race = _made(client, "races", _race(), dm)
    _pc(api_engine, other, _campaign(api_engine, other).id, "Not Link", "Hylian")
    assert client.delete(f"/api/homebrew/races/{race['id']}", headers=_h(dm)).status_code == 204


def test_a_subclass_in_use_needs_its_class_too(client, api_engine):
    """A Paladin with the oath blocks the delete; a Fighter with that name doesn't."""
    dm = _email()
    sub = _made(client, "subclasses", _subclass(), dm)
    campaign = _campaign(api_engine, dm)
    url = f"/api/homebrew/subclasses/{sub['id']}"
    _pc(api_engine, dm, campaign.id, "Wrong Class", "Human", subclass="Oath of the Triforce")
    paladins = [
        _pc(
            api_engine,
            dm,
            campaign.id,
            n,
            "Human",
            CharacterClass.PALADIN,
            subclass="oath of the triforce",
        )
        for n in ("Link", "Zelda", "Impa", "Rauru")
    ]

    refused = client.delete(url, headers=_h(dm))
    assert refused.status_code == 409
    detail = refused.json()["detail"]
    assert "Impa, Link, Rauru and 1 more use it" in detail
    assert "Wrong Class" not in detail
    moved = client.patch(url, json={"character_class": "Cleric"}, headers=_h(dm))
    assert moved.status_code == 409
    assert "moved to another class" in moved.json()["detail"]

    for pc in paladins:
        _update_pc(api_engine, dm, pc, subclass=None)
    assert client.delete(url, headers=_h(dm)).status_code == 204


# ── Custom origin ───────────────────────────────────────────────────────────


def test_custom_origin_is_refused_on_2024_and_allowed_on_2014(client):
    """Create and update: 2024 says no in plain words (422); 2014 switches freely."""
    dm = _email()
    refused = client.post(
        "/api/campaigns",
        json={"name": "Modern", "ruleset": "2024", "custom_origin": True},
        headers=_h(dm),
    )
    assert refused.status_code == 422
    assert "Custom origin is a 2014 rule" in refused.json()["detail"]

    made = client.post(
        "/api/campaigns",
        json={"name": "Hyrule", "ruleset": "2014", "custom_origin": True},
        headers=_h(dm),
    )
    assert made.status_code == 201, made.text
    assert made.json()["custom_origin"] is True
    url = f"/api/campaigns/{made.json()['id']}"
    assert (
        client.patch(url, json={"custom_origin": False}, headers=_h(dm)).json()["custom_origin"]
        is False
    )
    assert (
        client.patch(url, json={"custom_origin": True}, headers=_h(dm)).json()["custom_origin"]
        is True
    )
    # A null never touches it.
    assert (
        client.patch(url, json={"custom_origin": None}, headers=_h(dm)).json()["custom_origin"]
        is True
    )

    modern = client.post("/api/campaigns", json={"name": "M", "ruleset": "2024"}, headers=_h(dm))
    on = client.patch(
        f"/api/campaigns/{modern.json()['id']}", json={"custom_origin": True}, headers=_h(dm)
    )
    assert on.status_code == 422


def test_custom_origin_works_with_characters_and_resets_on_a_move_to_2024(client, api_engine):
    """It may change any time on 2014 (even with PCs); an empty campaign moving to 2024 drops it."""
    dm = _email()
    full = _campaign(api_engine, dm, "2014")
    _pc(api_engine, dm, full.id, "Link", "Human")
    on = client.patch(f"/api/campaigns/{full.id}", json={"custom_origin": True}, headers=_h(dm))
    assert on.status_code == 200 and on.json()["custom_origin"] is True

    empty = _campaign(api_engine, dm, "2014", custom_origin=True)
    assert empty.custom_origin is True
    moved = client.patch(f"/api/campaigns/{empty.id}", json={"ruleset": "2024"}, headers=_h(dm))
    assert moved.status_code == 200, moved.text
    assert (moved.json()["ruleset"], moved.json()["custom_origin"]) == ("2024", False)
    both = client.patch(f"/api/campaigns/{full.id}", json={"name": "Still 2014"}, headers=_h(dm))
    assert both.json()["custom_origin"] is True
    clash = client.patch(
        f"/api/campaigns/{empty.id}",
        json={"ruleset": "2014", "custom_origin": True},
        headers=_h(dm),
    )
    assert clash.status_code == 200 and clash.json()["custom_origin"] is True


def test_custom_origin_defaults_to_false(client, api_engine):
    """New campaigns read false, and so does a row written without the column (server default)."""
    dm = _email()
    assert _campaign(api_engine, dm, "2014").custom_origin is False
    made = client.post("/api/campaigns", json={"name": "Plain"}, headers=_h(dm)).json()
    assert made["custom_origin"] is False

    row_id = uuid.uuid4()
    now = datetime.now(UTC)
    with api_engine.begin() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO campaigns (id, name, setting, tone, dm_email, allow_player_signup, "
                "created_at, updated_at) VALUES (:id, 'Old', '', '', :dm, TRUE, :now, :now)"
            ),
            {"id": str(row_id), "dm": dm, "now": now},
        )
        stored = conn.execute(
            sa.text("SELECT custom_origin FROM campaigns WHERE id = :id"), {"id": str(row_id)}
        ).scalar_one()
    assert stored is False


def test_migration_0062_adds_the_column_with_a_false_default(monkeypatch):
    """The Postgres migration: both tables, and custom_origin NOT NULL with server default false."""
    path = Path(__file__).resolve().parents[2] / "alembic" / "versions"
    spec = importlib.util.spec_from_file_location(
        "m0062", path / "0062_homebrew_races_subclasses.py"
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

    assert module.revision == "0062" and module.down_revision == "0061"
    tables = {c[1] for c in calls if c[0] == "table"}
    assert tables == {"homebrew_races", "homebrew_subclasses"}
    assert ("index", "homebrew_races", ("created_by_email",)) in calls
    assert ("index", "homebrew_subclasses", ("created_by_email",)) in calls
    (column,) = [c[2] for c in calls if c[0] == "column"]
    assert column.name == "custom_origin" and column.nullable is False
    assert str(column.server_default.arg).lower() == "false"


# ── Templates and shared lists ──────────────────────────────────────────────


def test_race_templates_lay_out_the_srd_races(client):
    """2014 subraces come whole; darkvision and languages move into their fields."""
    dm = _email()
    got = client.get("/api/homebrew/race-templates", params={"ruleset": "2014"}, headers=_h(dm))
    assert got.status_code == 200
    by_name = {t["name"]: t for t in got.json()}
    hill = by_name["Hill Dwarf"]
    assert hill["ability_bonuses"] == {"CON": 2, "WIS": 1}
    assert (hill["hp_per_level"], hill["darkvision"], hill["speed"]) == (1, 60, 25)
    assert hill["languages"] == "Common and Dwarvish"
    assert not any(t["name"].startswith(("Darkvision", "Languages")) for t in hill["traits"])
    assert by_name["Half-Elf"]["ability_choice"] == {"choose": 2, "amount": 1, "exclude": ["CHA"]}
    assert all(len(t["name"]) <= 80 for r in got.json() for t in r["traits"])

    both = client.get("/api/homebrew/race-templates", headers=_h(dm)).json()
    assert {t["ruleset"] for t in both} == {"2014", "2024"}
    assert (
        next(t for t in both if t["name"] == "Dwarf" and t["ruleset"] == "2024")["darkvision"]
        == 120
    )


def test_domain_lists_match_the_rules_tables():
    """The domain's skill and class lists equal the builder's (domain can't import them)."""
    for edition in rulesets.RULESETS:
        srd = rulesets.options(edition)
        assert set(SKILLS) == set(srd.SKILLS)
        assert set(CLASS_NAMES) == set(srd.CLASSES)
