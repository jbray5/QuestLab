"""Plan 135 — the Weapons page by edition, magic weapons listed, missing SRD 5.1 weapons.

James (a 2014 table) saw only the 2024 list: weapon mastery, the 2024 firearms, and
none of the magic weapons the SRD writes against a kind of weapon ("Weapon (any
sword)", no damage die). ``list_weapons`` now takes a ruleset; without one it is
exactly what it was. The SRD 5.1 magic weapons the first seed missed reach existing
catalogs through an idempotent by-name sync at startup.
"""

import pytest
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from db.base import _json_serializer, relax_duckdb_indexes
from db.repos.item_repo import ItemRepo
from domain.enums import ItemRarity
from domain.item import Item, ItemCreate, ItemRead
from integrations.dnd_rules.magic_items import PHB_MAGIC_ITEMS, SRD51_MAGIC_WEAPONS
from integrations.dnd_rules.srd_weapons_2024 import SRD_WEAPONS_2024
from services import auth_service, item_service

DM = "wp135_dm@example.com"
OTHER = "wp135_other@example.com"


def _fresh_engine():
    """An isolated in-memory DuckDB with every table (counts here must not leak)."""
    engine = create_engine(
        "duckdb:///:memory:", poolclass=StaticPool, json_serializer=_json_serializer
    )
    SQLModel.metadata.create_all(engine)
    relax_duckdb_indexes(engine)
    return engine


def _startup_seed(db: Session) -> None:
    """The item seeding the API's lifespan runs, in the same order."""
    item_service.seed_magic_items(db)
    item_service.seed_missing_magic_items(db, SRD51_MAGIC_WEAPONS)
    item_service.seed_weapons(db, SRD_WEAPONS_2024)
    item_service.backfill_weapon_stats(db)


@pytest.fixture()
def db():
    """A session on a freshly seeded catalog, as a new deployment starts."""
    engine = _fresh_engine()
    with Session(engine) as session:
        _startup_seed(session)
        yield session


def _names(rows: list[ItemRead]) -> list[str]:
    """The names of a weapon list, in its order."""
    return [r.name for r in rows]


def _by_name(rows: list[ItemRead]) -> dict[str, ItemRead]:
    """A weapon list keyed by name."""
    return {r.name: r for r in rows}


def _old_list_weapons(db: Session, viewer: str, **filters) -> list[ItemRead]:
    """``list_weapons`` as it was before Plan 135, to pin "no ruleset = unchanged"."""
    items = [
        i
        for i in ItemRepo.list_all(db, is_magic=filters.get("is_magic"))
        if item_service.is_weapon(i) and auth_service.catalog_visible(i.created_by_email, viewer)
    ]
    if filters.get("mastery"):
        items = [i for i in items if (i.mastery or "").lower() == filters["mastery"].lower()]
    return [ItemRead.model_validate(i) for i in items]


# ── No ruleset: exactly as before ────────────────────────────────────────────


def test_no_ruleset_is_the_old_list(db):
    """Same rows, same order, same mastery; no stat-less magic weapon joins."""
    new = item_service.list_weapons(db, viewer=DM)
    old = _old_list_weapons(db, DM)
    assert [r.model_dump() for r in new] == [r.model_dump() for r in old]
    rows = _by_name(new)
    assert rows["Longsword"].mastery == "Sap"
    assert rows["Trident"].damage_die == "1d8"
    assert {"Musket", "Pistol"} <= set(rows)
    assert "+1 Weapon" not in rows and "Vicious Weapon" not in rows


def test_no_ruleset_mastery_filter_is_unchanged(db):
    """The mastery filter still narrows the list when no edition is asked for."""
    new = item_service.list_weapons(db, mastery="Vex", viewer=DM)
    assert _names(new) == _names(_old_list_weapons(db, DM, mastery="Vex"))
    assert new and all(r.mastery == "Vex" for r in new)


# ── 2014 ─────────────────────────────────────────────────────────────────────


def test_2014_clears_mastery_and_drops_the_firearms(db):
    """No row has a mastery; Musket and Pistol are gone; the rest of the SRD table stays."""
    rows = item_service.list_weapons(db, viewer=DM, ruleset="2014")
    assert rows and all(r.mastery is None for r in rows)
    names = set(_names(rows))
    assert not {"Musket", "Pistol"} & names
    mundane = {w.name for w in SRD_WEAPONS_2024} - {"Musket", "Pistol"}
    assert mundane <= names


def test_2014_ignores_the_mastery_filter(db):
    """A mastery left in the URL doesn't empty or narrow the 2014 list."""
    plain = item_service.list_weapons(db, viewer=DM, ruleset="2014")
    filtered = item_service.list_weapons(db, mastery="Vex", viewer=DM, ruleset="2014")
    assert _names(filtered) == _names(plain)


def test_2014_shows_the_srd51_stats_where_they_differ(db):
    """Lance, Trident and War Pick read as SRD 5.1 has them; the stored rows don't change."""
    rows = _by_name(item_service.list_weapons(db, viewer=DM, ruleset="2014"))
    assert rows["Trident"].damage_die == "1d6" and rows["Trident"].versatile_damage == "1d8"
    assert rows["Lance"].damage_die == "1d12"
    assert rows["Lance"].weapon_properties == ["Reach", "Special"]
    assert "aren't mounted" in (rows["Lance"].description or "")
    assert rows["War Pick"].weapon_properties is None
    assert rows["War Pick"].versatile_damage is None
    # A magic weapon built on a trident follows its base weapon.
    assert rows["Trident of Fish Command"].damage_die == "1d6"
    # Untouched in the database and in the 2024 view.
    stored = ItemRepo.list_named(db, "Trident")[0]
    assert stored.damage_die == "1d8" and stored.mastery == "Topple"
    r24 = _by_name(item_service.list_weapons(db, viewer=DM, ruleset="2024"))
    assert r24["Trident"].damage_die == "1d8" and r24["Trident"].mastery == "Topple"


def test_2014_property_filter_reads_the_2014_properties(db):
    """War Pick is Versatile in 2024 only; Lance is Heavy in 2024 only."""
    v14 = _names(item_service.list_weapons(db, property_name="Versatile", ruleset="2014"))
    v24 = _names(item_service.list_weapons(db, property_name="Versatile", ruleset="2024"))
    assert "War Pick" in v24 and "War Pick" not in v14
    h14 = _names(item_service.list_weapons(db, property_name="Heavy", ruleset="2014"))
    assert "Lance" not in h14 and "Greatsword" in h14


def test_2014_keeps_a_homebrew_weapon_as_its_dm_wrote_it(db):
    """A DM's own "Trident" variant keeps its dice; only the mastery goes."""
    item_service.create_item(
        db,
        ItemCreate(
            name="Coral Trident",
            rarity=ItemRarity.COMMON,
            item_type="Weapon (trident)",
            is_magic=True,
            weapon_category="Martial Melee",
            damage_die="1d10",
            damage_type="piercing",
            mastery="Topple",
        ),
        dm_email=DM,
    )
    row = _by_name(item_service.list_weapons(db, viewer=DM, ruleset="2014"))["Coral Trident"]
    assert row.damage_die == "1d10" and row.mastery is None


def test_an_unknown_ruleset_is_refused(db):
    """Only "2024" and "2014" are editions."""
    with pytest.raises(ValueError):
        item_service.list_weapons(db, viewer=DM, ruleset="1999")


# ── Magic weapons ────────────────────────────────────────────────────────────


@pytest.mark.parametrize("ruleset", ["2024", "2014"])
def test_magic_weapons_are_listed_in_both_editions(db, ruleset):
    """Backfilled ones and the stat-less ones ("+1 Weapon", ammunition) all show."""
    names = set(_names(item_service.list_weapons(db, viewer=DM, ruleset=ruleset)))
    expected = {
        "Flame Tongue",
        "Vorpal Sword",
        "Holy Avenger",
        "+1 Weapon",
        "+3 Weapon",
        "Vicious Weapon",
        "+2 Ammunition",
        "Arrow of Slaying",
        "Dancing Sword",
        "Luck Blade",
        "Oathbow",
    }
    assert expected <= names
    assert "Potion of Healing" not in names and "+1 Armor" not in names


@pytest.mark.parametrize("ruleset", ["2024", "2014"])
def test_magic_weapons_honour_search_and_magic_only(db, ruleset):
    """Name search finds a stat-less one; magic-only keeps them; mundane-only drops them."""
    found = item_service.list_weapons(db, q="vicious", viewer=DM, ruleset=ruleset)
    assert _names(found) == ["Vicious Weapon"]
    magic = item_service.list_weapons(db, is_magic=True, viewer=DM, ruleset=ruleset)
    assert magic and all(r.is_magic for r in magic)
    assert {"+1 Weapon", "Flame Tongue"} <= set(_names(magic))
    mundane = _names(item_service.list_weapons(db, is_magic=False, viewer=DM, ruleset=ruleset))
    assert "+1 Weapon" not in mundane and "Flame Tongue" not in mundane
    assert "Longsword" in mundane


@pytest.mark.parametrize("ruleset", ["2024", "2014"])
def test_a_category_filter_leaves_out_the_stat_less_ones(db, ruleset):
    """ "+1 Weapon" has no category to match; a backfilled Flame Tongue is a martial melee."""
    rows = _names(
        item_service.list_weapons(db, category="Martial Melee", viewer=DM, ruleset=ruleset)
    )
    assert "+1 Weapon" not in rows and "Vicious Weapon" not in rows
    assert "Flame Tongue" in rows and "Longsword" in rows
    props = _names(item_service.list_weapons(db, property_name="Finesse", ruleset=ruleset))
    assert "+1 Weapon" not in props


def test_a_2024_mastery_filter_leaves_out_the_stat_less_ones(db):
    """A stat-less magic weapon has no mastery, so a 2024 mastery filter drops it."""
    rows = item_service.list_weapons(db, mastery="Sap", viewer=DM, ruleset="2024")
    assert rows and all(r.mastery == "Sap" for r in rows)
    assert "+1 Weapon" not in _names(rows)


def test_new_magic_weapons_get_their_base_weapon_stats(db):
    """The backfill gives the Plan 135 additions their weapon's dice, as it does the rest."""
    rows = _by_name(item_service.list_weapons(db, viewer=DM, ruleset="2024"))
    assert rows["Dwarven Thrower"].damage_die == "1d8"  # warhammer
    assert rows["Hammer of Thunderbolts"].damage_die == "2d6"  # maul
    assert rows["Oathbow"].weapon_category == "Martial Ranged"
    assert rows["Dancing Sword"].damage_die == "1d8"  # any sword reads as a longsword
    assert rows["Vicious Weapon"].damage_die is None  # "any" names no weapon


# ── Homebrew visibility (SEC-003) ────────────────────────────────────────────


@pytest.mark.parametrize("ruleset", [None, "2024", "2014"])
def test_another_dms_homebrew_weapon_never_shows(db, ruleset):
    """Neither a statted nor a stat-less homebrew weapon reaches another DM's list."""
    item_service.create_item(
        db,
        ItemCreate(
            name=f"Glassfang {ruleset}",
            rarity=ItemRarity.COMMON,
            item_type="Weapon",
            weapon_category="Simple Melee",
            damage_die="1d4",
            damage_type="piercing",
        ),
        dm_email=OTHER,
    )
    item_service.create_item(
        db,
        ItemCreate(
            name=f"Whisper Edge {ruleset}",
            rarity=ItemRarity.RARE,
            item_type="Weapon (any sword)",
            is_magic=True,
        ),
        dm_email=OTHER,
    )
    mine = _names(item_service.list_weapons(db, viewer=DM, ruleset=ruleset))
    assert f"Glassfang {ruleset}" not in mine and f"Whisper Edge {ruleset}" not in mine
    theirs = _names(item_service.list_weapons(db, viewer=OTHER, ruleset=ruleset))
    assert f"Glassfang {ruleset}" in theirs
    assert (f"Whisper Edge {ruleset}" in theirs) == (ruleset is not None)


# ── The missing-SRD-weapons sync ─────────────────────────────────────────────


def test_the_sync_fills_an_old_catalog_once_and_touches_nothing():
    """An existing catalog gains the missing ones; a second run inserts nothing."""
    engine = _fresh_engine()
    with Session(engine) as s:
        assert item_service.seed_magic_items(s) == len(PHB_MAGIC_ITEMS)
        # A catalog that already has one of them, with its own text: it stays as is.
        kept = ItemRepo.create(
            s,
            ItemCreate(
                name="Luck Blade",
                rarity=ItemRarity.LEGENDARY,
                item_type="Weapon (any sword)",
                description="Our table's own wording.",
                is_magic=True,
            ),
        )
        before = {i.id: i.model_dump() for i in ItemRepo.list_all(s)}

        added = item_service.seed_missing_magic_items(s, SRD51_MAGIC_WEAPONS)
        assert added == len(SRD51_MAGIC_WEAPONS) - 1
        assert item_service.seed_missing_magic_items(s, SRD51_MAGIC_WEAPONS) == 0

        rows = ItemRepo.list_all(s)
        names = [i.name for i in rows]
        assert len(names) == len(set(names))
        assert len(rows) == len(before) + added
        after = {i.id: i.model_dump() for i in rows if i.id in before}
        assert after == before
        assert ItemRepo.get_by_id(s, kept.id).description == "Our table's own wording."
        oathbow = ItemRepo.list_named(s, "Oathbow")[0]
        assert oathbow.is_magic and oathbow.created_by_email is None
        assert oathbow.attunement_required and oathbow.rarity == ItemRarity.VERY_RARE


def test_a_dms_homebrew_of_the_same_name_doesnt_block_the_srd_row():
    """As with armor (Plan 132): only shared rows count, so a homebrew never stands in."""
    engine = _fresh_engine()
    with Session(engine) as s:
        item_service.create_item(
            s,
            ItemCreate(
                name="Oathbow",
                rarity=ItemRarity.RARE,
                item_type="Weapon (longbow)",
                is_magic=True,
            ),
            dm_email=DM,
        )
        assert item_service.seed_missing_magic_items(s, SRD51_MAGIC_WEAPONS) == len(
            SRD51_MAGIC_WEAPONS
        )
        owners = sorted(i.created_by_email or "" for i in ItemRepo.list_named(s, "Oathbow"))
        assert owners == ["", DM]


def test_the_additions_are_new_names():
    """None of the Plan 135 additions repeats a name the first seed already had."""
    first = {e["name"].casefold() for e in PHB_MAGIC_ITEMS}
    added = [e["name"].casefold() for e in SRD51_MAGIC_WEAPONS]
    assert len(added) == len(set(added))
    assert not first & set(added)
    for e in SRD51_MAGIC_WEAPONS:
        assert item_service.is_variant_magic_weapon(
            Item(**{**e, "rarity": ItemRarity(e["rarity"])})
        )
