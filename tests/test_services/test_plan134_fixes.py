"""Plan 134 — 2024 rules gaps: heavy armor ignores DEX (TD-131l).

A low DEX never lowers AC in heavy armor, in either edition; light and medium armor are
unchanged (a negative DEX still counts there).
"""

import pytest

from services.character_builder_service import _armor_class

_SCORES = {"STR": 15, "DEX": 8, "CON": 14, "INT": 10, "WIS": 12, "CHA": 10}


@pytest.mark.parametrize("ruleset", ["2024", "2014"])
def test_heavy_armor_ignores_a_low_dex(ruleset):
    """A DEX 8 Fighter in chain mail has AC 16, not 15; with a shield, 18."""
    kit = {"armor": "Chain Mail", "shield": False}
    assert _armor_class("Fighter", _SCORES, kit, [], None, [], ruleset) == 16
    shielded = {"armor": "Chain Mail", "shield": True}
    assert _armor_class("Fighter", _SCORES, shielded, [], None, [], ruleset) == 18


def test_light_and_medium_armor_still_count_a_low_dex():
    """Leather (light) 11 − 1 = 10; Hide (medium) 12 − 1 = 11."""
    assert _armor_class("Fighter", _SCORES, {"armor": "Leather Armor"}, [], None, []) == 10
    assert _armor_class("Fighter", _SCORES, {"armor": "Hide Armor"}, [], None, []) == 11


def test_phone_daily_limit_frees_2024_always_prepared(duckdb_session):
    """A 2024 Life Cleric 3's domain spells don't count against the daily number (TD-131j)."""
    import uuid

    import services.campaign_service as camp_svc
    import services.character_service as char_svc
    from domain.enums import CharacterClass
    from services import player_service

    dm = f"p134_{uuid.uuid4().hex[:8]}@example.com"
    c = camp_svc.create_campaign(duckdb_session, name="Life", dm_email=dm)
    pc = char_svc.create_character(
        duckdb_session,
        campaign_id=c.id,
        dm_email=dm,
        player_name="P",
        character_name="Cleric",
        race="Human",
        character_class=CharacterClass.CLERIC,
        level=3,
        subclass="Life Domain",
        score_str=10,
        score_dex=10,
        score_con=14,
        score_int=10,
        score_wis=16,
        score_cha=10,
        hp_max=20,
        hp_current=20,
        ac=16,
    )
    free = player_service._always_prepared(duckdb_session, pc, "Cleric")
    assert {"aid", "bless", "cure wounds", "lesser restoration"} <= free
