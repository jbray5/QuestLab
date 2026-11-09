"""Plan 141: a step can hurt (never below 1 HP), and can give some characters their own words.

What matters: damage can't knock anyone out between sessions, it's taken once, and one
character's words never reach another character's phone.
"""

import uuid

import pytest
from pydantic import ValidationError

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.character_repo import CharacterRepo
from domain.character import PlayerCharacterUpdate
from domain.enums import CharacterClass
from domain.side_quest import (
    QuestAdvance,
    QuestStep,
    SideQuestConflictError,
    SideQuestCreate,
    SideQuestSend,
    SideQuestUpdate,
)
from services import side_quest_service as svc


class _Dice:
    """A fake random source: every die shows ``face``."""

    def __init__(self, face: int):
        """Remember the face."""
        self.face = face

    def randint(self, _low: int, _high: int) -> int:
        """Always the same face."""
        return self.face


def _pc(db, campaign_id, dm: str, name: str, hp: int = 10):
    """A level 1 Rogue."""
    return char_svc.create_character(
        db,
        campaign_id=campaign_id,
        dm_email=dm,
        player_name="P",
        character_name=name,
        race="Human",
        character_class=CharacterClass.ROGUE,
        level=1,
        score_str=10,
        score_dex=10,
        score_con=10,
        score_int=10,
        score_wis=10,
        score_cha=10,
        hp_max=10,
        hp_current=hp,
        ac=12,
    )


def _campaign(db):
    """A DM, a campaign and two characters, Pip and Bo."""
    dm = f"dm141_{uuid.uuid4().hex[:8]}@example.com"
    campaign = camp_svc.create_campaign(db, name="C", setting="S", tone="T", dm_email=dm)
    return dm, campaign, _pc(db, campaign.id, dm, "Pip"), _pc(db, campaign.id, dm, "Bo")


def _send(db, dm, campaign, steps, pcs):
    """Create and send a quest; return {name: run id}."""
    quest = svc.create_quest(db, campaign.id, SideQuestCreate(title="Q", steps=steps), dm)
    sent = svc.send_quest(db, quest.id, SideQuestSend(character_ids=[p.id for p in pcs]), dm)
    names = {p.id: p.character_name for p in pcs}
    return quest, {names[r.character_id]: r.run_id for r in sent.quest.runs}


_FALL = [
    {"id": "a", "kind": "read", "text": "You climb.", "next": "b"},
    {"id": "b", "kind": "read", "text": "You fall.", "damage": "1d4", "next": "c"},
    {"id": "c", "kind": "end", "text": "Ow."},
]


def _set(db, pc_id, **fields) -> None:
    """Change a character's sheet directly."""
    CharacterRepo.update(db, CharacterRepo.get_by_id(db, pc_id), PlayerCharacterUpdate(**fields))


def _hp(db, pc_id):
    """(hp_current, temp_hp) now."""
    db.expire_all()
    pc = CharacterRepo.get_by_id(db, pc_id)
    return pc.hp_current, pc.temp_hp


# ── Damage ──────────────────────────────────────────────────────────────────


def test_damage_rolls_and_shows_on_the_phone(duckdb_session):
    """1d4 showing 3 takes 3 HP, says so in the outcome, and logs it for the DM."""
    dm, campaign, pip, _bo = _campaign(duckdb_session)
    quest, runs = _send(duckdb_session, dm, campaign, _FALL, [pip])
    view = svc.advance(duckdb_session, pip.id, runs["Pip"], QuestAdvance(step_id="a"), rng=_Dice(3))
    assert view.outcome.damage == 3
    assert _hp(duckdb_session, pip.id) == (7, 0)
    log = svc.list_runs(duckdb_session, quest.id, dm)[0].log
    assert [e.damage for e in log if e.damage] == [3]


def test_temp_hp_goes_first(duckdb_session):
    """2 temp HP soak 2 of a 4; the other 2 come off HP. The phone says 4."""
    dm, campaign, pip, _bo = _campaign(duckdb_session)
    _set(duckdb_session, pip.id, temp_hp=2)
    _q, runs = _send(duckdb_session, dm, campaign, _FALL, [pip])
    view = svc.advance(duckdb_session, pip.id, runs["Pip"], QuestAdvance(step_id="a"), rng=_Dice(4))
    assert view.outcome.damage == 4
    assert _hp(duckdb_session, pip.id) == (8, 0)


def test_damage_never_goes_below_one_hp(duckdb_session):
    """At 2 HP a 4 takes 1. At 1 HP it takes nothing. Nobody gets the dying screen."""
    dm, campaign, pip, bo = _campaign(duckdb_session)
    _set(duckdb_session, pip.id, hp_current=2)
    _set(duckdb_session, bo.id, hp_current=1)
    _q, runs = _send(duckdb_session, dm, campaign, _FALL, [pip, bo])
    pip_view = svc.advance(
        duckdb_session, pip.id, runs["Pip"], QuestAdvance(step_id="a"), rng=_Dice(4)
    )
    bo_view = svc.advance(
        duckdb_session, bo.id, runs["Bo"], QuestAdvance(step_id="a"), rng=_Dice(4)
    )
    assert pip_view.outcome.damage == 1 and _hp(duckdb_session, pip.id) == (1, 0)
    assert bo_view.outcome.damage == 0 and _hp(duckdb_session, bo.id) == (1, 0)


def test_a_character_already_down_stays_down(duckdb_session):
    """Damage doesn't lift 0 HP to 1."""
    dm, campaign, pip, _bo = _campaign(duckdb_session)
    _set(duckdb_session, pip.id, hp_current=0)
    _q, runs = _send(duckdb_session, dm, campaign, _FALL, [pip])
    svc.advance(duckdb_session, pip.id, runs["Pip"], QuestAdvance(step_id="a"), rng=_Dice(4))
    assert _hp(duckdb_session, pip.id) == (0, 0)


def test_a_double_tap_hurts_once(duckdb_session):
    """The same move twice changes nothing the second time."""
    dm, campaign, pip, _bo = _campaign(duckdb_session)
    _q, runs = _send(duckdb_session, dm, campaign, _FALL, [pip])
    for _ in range(2):
        svc.advance(duckdb_session, pip.id, runs["Pip"], QuestAdvance(step_id="a"), rng=_Dice(2))
    assert _hp(duckdb_session, pip.id) == (8, 0)


def test_flat_damage_and_modifiers(duckdb_session):
    """A flat "3" is 3; "1d4+1" showing 2 is 3."""
    dm, campaign, pip, bo = _campaign(duckdb_session)
    flat = [dict(s) for s in _FALL]
    flat[1] = {**flat[1], "damage": "3"}
    plus = [dict(s) for s in _FALL]
    plus[1] = {**plus[1], "damage": "1d4+1"}
    _q, runs = _send(duckdb_session, dm, campaign, flat, [pip])
    _q2, runs2 = _send(duckdb_session, dm, campaign, plus, [bo])
    svc.advance(duckdb_session, pip.id, runs["Pip"], QuestAdvance(step_id="a"), rng=_Dice(1))
    svc.advance(duckdb_session, bo.id, runs2["Bo"], QuestAdvance(step_id="a"), rng=_Dice(2))
    assert _hp(duckdb_session, pip.id) == (7, 0)
    assert _hp(duckdb_session, bo.id) == (7, 0)


@pytest.mark.parametrize("bad", ["d4", "1d5", "100", "1d4+100", "lots"])
def test_damage_has_to_be_dice_or_a_number(bad):
    """Anything else is refused before it's saved."""
    with pytest.raises(ValidationError):
        QuestStep(id="a", kind="read", damage=bad)


def test_damage_is_frozen_once_sent(duckdb_session):
    """Like gold, it can't change under a live run."""
    dm, campaign, pip, _bo = _campaign(duckdb_session)
    quest, _runs = _send(duckdb_session, dm, campaign, _FALL, [pip])
    steps = [QuestStep.model_validate(s) for s in _FALL]
    steps[1].damage = "1d6"
    with pytest.raises(SideQuestConflictError):
        svc.update_quest(duckdb_session, quest.id, SideQuestUpdate(steps=steps), dm)


# ── Each phone its own words ────────────────────────────────────────────────


def _scrap(pip_id, bo_id=None) -> list[dict]:
    """A quest whose second step has words for Pip (and maybe Bo)."""
    text_for = {str(pip_id): "PIP ONLY: the mill at dawn."}
    if bo_id:
        text_for[str(bo_id)] = "BO ONLY: your brother's name."
    return [
        {"id": "a", "kind": "read", "text": "A scrap of paper.", "next": "b"},
        {"id": "b", "kind": "read", "text": "Scribble.", "text_for": text_for, "next": "c"},
        {"id": "c", "kind": "end", "text": "Done."},
    ]


def test_each_phone_gets_only_its_own_words(duckdb_session):
    """Pip reads Pip's line, Bo reads Bo's, and neither payload holds the other's."""
    dm, campaign, pip, bo = _campaign(duckdb_session)
    _q, runs = _send(duckdb_session, dm, campaign, _scrap(pip.id, bo.id), [pip, bo])
    pip_view = svc.advance(duckdb_session, pip.id, runs["Pip"], QuestAdvance(step_id="a"))
    bo_view = svc.advance(duckdb_session, bo.id, runs["Bo"], QuestAdvance(step_id="a"))
    assert pip_view.step.text == "PIP ONLY: the mill at dawn."
    assert bo_view.step.text == "BO ONLY: your brother's name."
    assert "BO ONLY" not in pip_view.model_dump_json()
    assert "PIP ONLY" not in bo_view.model_dump_json()


def test_someone_without_words_gets_the_shared_text(duckdb_session):
    """Bo has no line of his own, so he reads the step's text."""
    dm, campaign, pip, bo = _campaign(duckdb_session)
    _q, runs = _send(duckdb_session, dm, campaign, _scrap(pip.id), [pip, bo])
    view = svc.advance(duckdb_session, bo.id, runs["Bo"], QuestAdvance(step_id="a"))
    assert view.step.text == "Scribble." and "PIP ONLY" not in view.model_dump_json()


def test_history_keeps_their_own_words(duckdb_session):
    """Reading back the way here shows the line they actually read."""
    dm, campaign, pip, _bo = _campaign(duckdb_session)
    _q, runs = _send(duckdb_session, dm, campaign, _scrap(pip.id), [pip])
    svc.advance(duckdb_session, pip.id, runs["Pip"], QuestAdvance(step_id="a"))
    view = svc.advance(duckdb_session, pip.id, runs["Pip"], QuestAdvance(step_id="b"))
    assert [h.text for h in view.history if h.step_id == "b"] == ["PIP ONLY: the mill at dawn."]


def test_words_can_change_after_sending(duckdb_session):
    """They're words, so a sent quest takes a fix."""
    dm, campaign, pip, _bo = _campaign(duckdb_session)
    quest, runs = _send(duckdb_session, dm, campaign, _scrap(pip.id), [pip])
    steps = [QuestStep.model_validate(s) for s in _scrap(pip.id)]
    steps[1].text_for = {pip.id: "PIP ONLY: the mill at noon."}
    svc.update_quest(duckdb_session, quest.id, SideQuestUpdate(steps=steps), dm)
    view = svc.advance(duckdb_session, pip.id, runs["Pip"], QuestAdvance(step_id="a"))
    assert view.step.text == "PIP ONLY: the mill at noon."


def test_words_for_a_stranger_block_the_send(duckdb_session):
    """A character from another campaign (or deleted) is caught before the quest goes out."""
    dm, campaign, pip, _bo = _campaign(duckdb_session)
    quest = svc.create_quest(
        duckdb_session, campaign.id, SideQuestCreate(title="Q", steps=_scrap(uuid.uuid4())), dm
    )
    with pytest.raises(SideQuestConflictError, match="isn't in this campaign"):
        svc.send_quest(duckdb_session, quest.id, SideQuestSend(character_ids=[pip.id]), dm)


def test_blank_words_are_dropped():
    """An emptied box means the shared text again."""
    step = QuestStep(id="a", kind="read", text="x", text_for={str(uuid.uuid4()): "   "})
    assert step.text_for == {}
