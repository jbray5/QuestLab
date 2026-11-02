"""Plan 132 — DM homebrew spells over the API.

A DM makes a spell from scratch or by copying one, edits and deletes their own, and nobody
else sees it. Homebrew has no edition (Plan 131), so it shows in both a 2014 and a 2024
campaign's character builder. A spell characters know is not deleted: the 409 names who
knows it. A homebrew name may not clash with a spell its DM can already see, because the
builder and the level-up guide look spells up by name.
"""

import uuid

from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.spell_service as spell_svc
from domain.enums import CharacterClass
from domain.spell import SpellCreate

_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"


def _email() -> str:
    """A fresh DM email."""
    return f"dm132s_{uuid.uuid4().hex[:8]}@example.com"


def _h(email: str) -> dict:
    """The trusted identity header for ``email``."""
    return {_AUTH: email}


def _spell(name: str, **extras) -> dict:
    """A full homebrew spell payload, as the form sends it."""
    payload = {
        "name": name,
        "level": 2,
        "school": "Evocation",
        "casting_time": "Action",
        "range": "60 feet",
        "components_v": True,
        "components_s": True,
        "components_m": "a sliver of moonstone",
        "duration": "Instantaneous",
        "is_ritual": False,
        "is_concentration": False,
        "description": f"{name} lights the target up.",
        "higher_levels": "One more die per slot level above 2.",
        "damage_dice": "3d8",
        "damage_type": "radiant",
        "save_ability": "DEX",
        "attack_type": None,
        "classes": ["Wizard", "Cleric"],
        "source": "Homebrew",
    }
    payload.update(extras)
    return payload


def _seed_srd(engine) -> str:
    """One SRD Fireball in each edition; return the 2024 row's id."""
    base = {
        "name": "Fireball",
        "level": 3,
        "school": "Evocation",
        "casting_time": "Action",
        "range": "150 feet",
        "duration": "Instantaneous",
        "description": "A bright streak blossoms into an explosion of flame.",
        "damage_dice": "8d6",
        "damage_type": "fire",
        "save_ability": "DEX",
        "classes": ["Sorcerer", "Wizard"],
    }
    with Session(engine) as s:
        spell_svc.seed_spells(s, [SpellCreate(**base)], ruleset="2024")
        spell_svc.seed_spells(s, [SpellCreate(**base)], ruleset="2014")
        return str(next(r.id for r in spell_svc.list_spells(s, ruleset="2024")))


def _campaign(engine, dm: str, ruleset: str) -> str:
    """A campaign of ``dm``'s in ``ruleset``; return its id."""
    with Session(engine) as s:
        return str(
            camp_svc.create_campaign(
                s, name=f"Table {ruleset}", setting="R", tone="T", dm_email=dm, ruleset=ruleset
            ).id
        )


def _wizard(engine, dm: str, name: str) -> str:
    """A level-3 wizard in a new campaign of ``dm``'s; return the PC's id."""
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(s, name="C", setting="R", tone="T", dm_email=dm)
        pc = char_svc.create_character(
            s,
            campaign_id=campaign.id,
            dm_email=dm,
            player_name="Parker",
            character_name=name,
            race="Elf",
            character_class=CharacterClass.WIZARD,
            level=3,
            score_str=8,
            score_dex=14,
            score_con=13,
            score_int=16,
            score_wis=12,
            score_cha=10,
            hp_max=17,
            hp_current=17,
            ac=12,
        )
        return str(pc.id)


def _names(client, email: str, **params) -> set[str]:
    """Spell names in ``email``'s catalog list."""
    got = client.get("/api/spells", params=params, headers=_h(email))
    assert got.status_code == 200, got.text
    return {s["name"] for s in got.json()}


# ── Create ──────────────────────────────────────────────────────────────────


def test_create_stamps_the_owner_and_leaves_no_ruleset(client):
    """The author is stamped from the caller; a ruleset in the body is dropped."""
    dm = _email()
    made = client.post("/api/spells", json=_spell("Moonfire", ruleset="2014"), headers=_h(dm))
    assert made.status_code == 201, made.text
    body = made.json()
    assert body["created_by_email"] == dm
    assert body["ruleset"] is None
    assert body["classes"] == ["Wizard", "Cleric"]
    assert body["components_m"] == "a sliver of moonstone"


def test_create_without_a_source_says_homebrew(client):
    """A homebrew spell never claims to come from the SRD."""
    payload = _spell("Quiet Step")
    payload.pop("source")
    made = client.post("/api/spells", json=payload, headers=_h(_email()))
    assert made.status_code == 201, made.text
    assert made.json()["source"] == "Homebrew"


def test_create_refuses_bad_fields(client):
    """Blank names, over-long rolls and missing required fields are 422s."""
    dm = _h(_email())
    assert client.post("/api/spells", json=_spell("   "), headers=dm).status_code == 422
    too_long = _spell("Long Dice", damage_dice="1d6" * 20)
    assert client.post("/api/spells", json=too_long, headers=dm).status_code == 422
    missing = _spell("No Range")
    missing.pop("range")
    assert client.post("/api/spells", json=missing, headers=dm).status_code == 422


# ── Visibility ──────────────────────────────────────────────────────────────


def test_homebrew_is_seen_only_by_its_author_in_both_editions(client, api_engine):
    """The author sees it under 2014 and 2024; another DM sees it under neither."""
    _seed_srd(api_engine)
    author, other = _email(), _email()
    assert (
        client.post("/api/spells", json=_spell("Moonfire"), headers=_h(author)).status_code == 201
    )
    for edition in ("2014", "2024"):
        assert {"Fireball", "Moonfire"} <= _names(client, author, ruleset=edition)
        assert "Moonfire" not in _names(client, other, ruleset=edition)
    assert "Moonfire" not in _names(client, other)


# ── Copy and edit ───────────────────────────────────────────────────────────


def test_copy_makes_a_new_row_and_leaves_the_original(client, api_engine):
    """Copying an SRD spell under a new name saves a new homebrew row; the SRD row is untouched."""
    srd_id = _seed_srd(api_engine)
    dm = _email()
    original = client.get(f"/api/spells/{srd_id}", headers=_h(dm)).json()
    copy = {k: v for k, v in original.items() if k not in ("id", "created_by_email", "ruleset")}
    copy.update(name="Fireball (homebrew)", damage_dice="10d6", source="Homebrew")
    made = client.post("/api/spells", json=copy, headers=_h(dm))
    assert made.status_code == 201, made.text
    assert made.json()["id"] != srd_id
    assert made.json()["created_by_email"] == dm
    assert made.json()["damage_dice"] == "10d6"
    assert client.get(f"/api/spells/{srd_id}", headers=_h(dm)).json()["damage_dice"] == "8d6"


def test_copy_under_the_same_name_is_refused_in_plain_words(client, api_engine):
    """A homebrew spell can't share a name with one its DM sees: pickers find spells by name."""
    _seed_srd(api_engine)
    dm, other = _email(), _email()
    clash = client.post("/api/spells", json=_spell("fireball "), headers=_h(dm))
    assert clash.status_code == 409
    assert "already have a spell called Fireball" in clash.json()["detail"]

    assert client.post("/api/spells", json=_spell("Moonfire"), headers=_h(dm)).status_code == 201
    again = client.post("/api/spells", json=_spell("MOONFIRE"), headers=_h(dm))
    assert again.status_code == 409
    assert "You already have a homebrew spell called Moonfire" in again.json()["detail"]
    # Another DM never sees the first one's homebrew, so the name is free for them.
    assert client.post("/api/spells", json=_spell("Moonfire"), headers=_h(other)).status_code == 201


# ── Edit ────────────────────────────────────────────────────────────────────


def test_the_author_edits_their_spell(client):
    """The author can change any field; the row keeps its owner and no ruleset."""
    dm = _email()
    made = client.post("/api/spells", json=_spell("Moonfire"), headers=_h(dm)).json()
    patch = {"name": "Moonfire Lance", "level": 3, "classes": ["Druid"], "higher_levels": None}
    got = client.patch(f"/api/spells/{made['id']}", json=patch, headers=_h(dm))
    assert got.status_code == 200, got.text
    body = got.json()
    assert (body["name"], body["level"], body["classes"]) == ("Moonfire Lance", 3, ["Druid"])
    assert body["higher_levels"] is None
    assert body["created_by_email"] == dm and body["ruleset"] is None


def test_edit_is_403_for_another_dm_and_for_the_srd(client, api_engine):
    """Only the author (or an admin) changes homebrew; the SRD rows are admin-only."""
    srd_id = _seed_srd(api_engine)
    author, other = _email(), _email()
    made = client.post("/api/spells", json=_spell("Moonfire"), headers=_h(author)).json()
    assert (
        client.patch(f"/api/spells/{made['id']}", json={"level": 9}, headers=_h(other)).status_code
        == 403
    )
    srd = client.patch(f"/api/spells/{srd_id}", json={"level": 9}, headers=_h(author))
    assert srd.status_code == 403
    assert "admin" in srd.json()["detail"]


def test_edit_refuses_clashing_names_and_empty_fields(client, api_engine):
    """Renaming onto an SRD name is a 409; blanking or nulling a required field is a 422."""
    _seed_srd(api_engine)
    dm = _email()
    made = client.post("/api/spells", json=_spell("Moonfire"), headers=_h(dm)).json()
    url = f"/api/spells/{made['id']}"
    assert client.patch(url, json={"name": "Fireball"}, headers=_h(dm)).status_code == 409
    assert client.patch(url, json={"name": " "}, headers=_h(dm)).status_code == 422
    assert client.patch(url, json={"description": None}, headers=_h(dm)).status_code == 422
    # Changing only the case of its own name is fine.
    assert client.patch(url, json={"name": "MoonFire"}, headers=_h(dm)).status_code == 200


# ── Delete ──────────────────────────────────────────────────────────────────


def test_delete_works_when_no_character_knows_it(client):
    """An unused homebrew spell deletes; another DM can't delete it."""
    author, other = _email(), _email()
    made = client.post("/api/spells", json=_spell("Moonfire"), headers=_h(author)).json()
    assert client.delete(f"/api/spells/{made['id']}", headers=_h(other)).status_code == 403
    assert client.delete(f"/api/spells/{made['id']}", headers=_h(author)).status_code == 204
    assert client.get(f"/api/spells/{made['id']}", headers=_h(author)).status_code == 404


def test_delete_is_refused_while_a_character_knows_it(client, api_engine):
    """A known spell isn't deleted (no broken spell lists); the 409 names who knows it."""
    dm = _email()
    pc_id = _wizard(api_engine, dm, "Thane")
    made = client.post("/api/spells", json=_spell("Moonfire"), headers=_h(dm)).json()
    learned = client.post(
        f"/api/characters/{pc_id}/spells", json={"spell_id": made["id"]}, headers=_h(dm)
    )
    assert learned.status_code == 201, learned.text

    refused = client.delete(f"/api/spells/{made['id']}", headers=_h(dm))
    assert refused.status_code == 409
    detail = refused.json()["detail"]
    assert detail == (
        "Moonfire can't be deleted yet: Thane knows it. "
        "Take it off their spell list first, then delete it."
    )
    # Still there, still on Thane's list.
    assert client.get(f"/api/spells/{made['id']}", headers=_h(dm)).status_code == 200
    rows = client.get(f"/api/characters/{pc_id}/spells", headers=_h(dm)).json()
    assert [r["spell_id"] for r in rows] == [made["id"]]

    # Off the list, the spell deletes.
    gone = client.delete(f"/api/characters/{pc_id}/spells/{rows[0]['id']}", headers=_h(dm))
    assert gone.status_code == 204
    assert client.delete(f"/api/spells/{made['id']}", headers=_h(dm)).status_code == 204


def test_delete_refusal_names_several_knowers(client, api_engine):
    """With more than one character, the message lists them (three at most)."""
    dm = _email()
    made = client.post("/api/spells", json=_spell("Moonfire"), headers=_h(dm)).json()
    for name in ("Mira", "Bruni", "Thane", "Ash"):
        pc_id = _wizard(api_engine, dm, name)
        assert (
            client.post(
                f"/api/characters/{pc_id}/spells", json={"spell_id": made["id"]}, headers=_h(dm)
            ).status_code
            == 201
        )
    detail = client.delete(f"/api/spells/{made['id']}", headers=_h(dm)).json()["detail"]
    assert detail.startswith("Moonfire can't be deleted yet: Ash, Bruni, Mira and 1 more know it.")
    assert "their spell lists" in detail


# ── Both editions in the builder ────────────────────────────────────────────


def test_homebrew_shows_in_both_editions_builder_for_its_owner_only(client, api_engine):
    """The owner's 2014 and 2024 campaigns both offer it, once; another DM's campaign doesn't."""
    _seed_srd(api_engine)
    owner, other = _email(), _email()
    made = client.post(
        "/api/spells", json=_spell("Moonfire", classes=["Wizard"]), headers=_h(owner)
    )
    assert made.status_code == 201, made.text

    for edition in ("2014", "2024"):
        cid = _campaign(api_engine, owner, edition)
        got = client.get(f"/api/campaigns/{cid}/character-builder/options", headers=_h(owner))
        assert got.status_code == 200, got.text
        spells = got.json()["spells"]
        moonfire = [s for s in spells if s["name"] == "Moonfire"]
        assert len(moonfire) == 1 and moonfire[0]["classes"] == ["Wizard"]
        # The SRD Fireball shows once: only this campaign's edition.
        assert [s["name"] for s in spells].count("Fireball") == 1

    other_cid = _campaign(api_engine, other, "2024")
    theirs = client.get(f"/api/campaigns/{other_cid}/character-builder/options", headers=_h(other))
    assert theirs.status_code == 200, theirs.text
    assert "Moonfire" not in {s["name"] for s in theirs.json()["spells"]}
