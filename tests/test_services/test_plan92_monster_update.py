"""Plan 92 — the descriptive half of a stat block is editable.

``MonsterStatBlockUpdate`` carried only the numbers and the action lists, so a
DM could never correct a monster's languages, senses, alignment or damage
lists — a PATCH with those keys was silently dropped.
"""

from sqlmodel import Session

import services.encounter_service as enc_svc
from domain.enums import CreatureSize, CreatureType
from domain.monster import MonsterStatBlockCreate, MonsterStatBlockUpdate


def _hag(db: Session):
    return enc_svc.create_custom_monster(
        db,
        MonsterStatBlockCreate(
            name="Green Hag (test)",
            size=CreatureSize.MEDIUM,
            creature_type=CreatureType.FEY,
            alignment="neutral evil",
            ac=17,
            hp_average=82,
            hp_formula="11d8+33",
            score_str=18,
            score_dex=12,
            score_con=16,
            score_int=13,
            score_wis=14,
            score_cha=14,
            challenge_rating="3",
            xp=700,
            proficiency_bonus=2,
            languages="Common, Draconic, Sylvan",
            damage_resistances=["Bludgeoning", "Piercing", "Slashing"],
        ),
        "dm@example.com",
    )


def test_languages_senses_and_damage_lists_are_patchable(duckdb_session: Session):
    """The fields the old schema dropped now round-trip through an update."""
    monster = _hag(duckdb_session)
    assert monster.languages == "Common, Draconic, Sylvan"

    updated = enc_svc.update_monster(
        duckdb_session,
        monster.id,
        MonsterStatBlockUpdate(
            languages="Common, Elvish, Sylvan",
            senses={"darkvision": 60, "passive_perception": 14},
            damage_resistances=[],
            alignment="neutral evil",
        ),
    )
    assert updated.languages == "Common, Elvish, Sylvan"
    assert updated.senses == {"darkvision": 60, "passive_perception": 14}
    assert updated.damage_resistances == []


def test_an_omitted_field_is_left_alone(duckdb_session: Session):
    """A partial update still only touches what it names."""
    monster = _hag(duckdb_session)
    updated = enc_svc.update_monster(duckdb_session, monster.id, MonsterStatBlockUpdate(ac=18))
    assert updated.ac == 18 and updated.languages == "Common, Draconic, Sylvan"
