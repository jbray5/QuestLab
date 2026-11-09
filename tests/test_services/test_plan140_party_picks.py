"""Plan 140: on a choice step whose DM turns it on, the party sees who picked what.

What matters: it's off unless the DM says so for that step, a pick only shows if the player was
told first, and nothing but a name and an option number crosses from one run to another.
"""

import copy
import uuid

import pytest

import services.campaign_service as camp_svc
import services.character_service as char_svc
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

_REPLY = "Only my DM may read this."
_QUEST = {
    "title": "The Cold",
    "steps": [
        {"id": "r", "kind": "reply", "text": "Who do you think of?", "next": "ch"},
        {
            "id": "ch",
            "kind": "choice",
            "text": "Four useful things.",
            "party_sees": True,
            "options": [
                {"label": "Build a fire", "next": "ch2"},
                {"label": "Walk to the lantern", "next": "e"},
                {"label": "Find food", "next": "e"},
            ],
        },
        {
            "id": "ch2",
            "kind": "choice",
            "text": "A pack. Take it?",
            "options": [{"label": "Take it", "next": "e"}, {"label": "Leave it", "next": "e"}],
        },
        {"id": "e", "kind": "end", "text": "Morning."},
    ],
}


def _quest(first_step_shown: bool = True) -> dict:
    """The quest, with the first choice's switch on or off."""
    quest = copy.deepcopy(_QUEST)
    quest["steps"][1]["party_sees"] = first_step_shown
    return quest


def _pc(db, campaign_id, dm: str, name: str):
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
        hp_current=10,
        ac=12,
    )


def _setup(db, shown: bool = True):
    """A quest sent to Pip, Bo and Cy, each past the reply: (dm, quest, {name: (pc, run id)})."""
    dm = f"dm140_{uuid.uuid4().hex[:8]}@example.com"
    campaign = camp_svc.create_campaign(db, name="C", setting="S", tone="T", dm_email=dm)
    pcs = [_pc(db, campaign.id, dm, name) for name in ("Pip", "Bo", "Cy")]
    quest = svc.create_quest(db, campaign.id, SideQuestCreate(**_quest(shown)), dm)
    sent = svc.send_quest(db, quest.id, SideQuestSend(character_ids=[p.id for p in pcs]), dm)
    runs = {r.character_id: r.run_id for r in sent.quest.runs}
    party_runs = {p.character_name: (p, runs[p.id]) for p in pcs}
    for pc, run_id in party_runs.values():
        svc.advance(db, pc.id, run_id, QuestAdvance(step_id="r", reply=_REPLY))
    return dm, sent.quest, party_runs


def _pick(db, runs, name: str, step: str, option: int):
    """``name`` picks an option."""
    pc, run_id = runs[name]
    return svc.advance(db, pc.id, run_id, QuestAdvance(step_id=step, option=option))


def _view(db, runs, name: str):
    """The view ``name``'s phone gets."""
    pc, run_id = runs[name]
    return svc.get_view(db, pc.id, run_id)


def _tags(db, runs, name: str) -> dict[int, list[str]]:
    """The names on each option of the step ``name`` is on (only options that have any)."""
    return {o.index: o.taken_by for o in _view(db, runs, name).step.options if o.taken_by}


def _switch(db, dm, quest, on: bool):
    """Turn the first choice's switch on or off on a sent quest."""
    steps = [QuestStep.model_validate(s) for s in _quest(on)["steps"]]
    return svc.update_quest(db, quest.id, SideQuestUpdate(steps=steps), dm)


@pytest.fixture
def events(monkeypatch) -> list:
    """The character ids the service refreshes, in order."""
    seen: list = []
    monkeypatch.setattr(svc, "publish_pc_updated", lambda pc_id, _c, **_kw: seen.append(pc_id))
    return seen


def test_off_unless_the_step_says_so(duckdb_session):
    """A step without the switch shows nobody's pick, and the phone says nothing about it."""
    _dm, _quest_read, runs = _setup(duckdb_session, shown=False)
    _pick(duckdb_session, runs, "Pip", "ch", 0)
    view = _view(duckdb_session, runs, "Bo")
    assert view.step.party_sees_pick is False
    assert all(o.taken_by == [] for o in view.step.options)


def test_on_shows_names_in_the_order_they_picked(duckdb_session):
    """Two picks of the fire show on the third phone, first picker first, and the phone warns."""
    _dm, _quest_read, runs = _setup(duckdb_session)
    assert _view(duckdb_session, runs, "Bo").step.party_sees_pick is True
    _pick(duckdb_session, runs, "Cy", "ch", 0)
    _pick(duckdb_session, runs, "Pip", "ch", 0)
    assert _tags(duckdb_session, runs, "Bo") == {0: ["Cy", "Pip"]}


def test_a_step_without_the_switch_stays_private(duckdb_session):
    """The next choice (the pack) shows no names and no warning, even on the same quest."""
    _dm, _quest_read, runs = _setup(duckdb_session)
    _pick(duckdb_session, runs, "Pip", "ch", 0)
    _pick(duckdb_session, runs, "Pip", "ch2", 0)
    _pick(duckdb_session, runs, "Bo", "ch", 0)
    view = _view(duckdb_session, runs, "Bo")
    assert view.step.id == "ch2" and view.step.party_sees_pick is False
    assert all(o.taken_by == [] for o in view.step.options)


def test_only_picks_made_while_on_show(duckdb_session):
    """Turning it on after a pick doesn't reveal it; turning it off hides everything."""
    dm, quest, runs = _setup(duckdb_session, shown=False)
    _pick(duckdb_session, runs, "Pip", "ch", 1)
    on = _switch(duckdb_session, dm, quest, True)
    assert on.status == "sent" and on.steps[1].party_sees is True
    assert _tags(duckdb_session, runs, "Bo") == {}
    _pick(duckdb_session, runs, "Cy", "ch", 2)
    assert _tags(duckdb_session, runs, "Bo") == {2: ["Cy"]}
    _switch(duckdb_session, dm, quest, False)
    assert _tags(duckdb_session, runs, "Bo") == {}
    assert _view(duckdb_session, runs, "Bo").step.party_sees_pick is False


def test_the_switch_doesnt_unlock_a_sent_quest(duckdb_session):
    """It's a display setting, not a loophole: links still can't change once it's sent."""
    dm, quest, _runs = _setup(duckdb_session)
    steps = [QuestStep.model_validate(s) for s in _quest(False)["steps"]]
    steps[1].options[0].next = "e"
    with pytest.raises(SideQuestConflictError):
        svc.update_quest(duckdb_session, quest.id, SideQuestUpdate(steps=steps), dm)


def test_only_a_name_crosses_between_runs(duckdb_session):
    """The other phone gets no reply, no later step, and nothing about where a pick led."""
    _dm, _quest_read, runs = _setup(duckdb_session)
    _pick(duckdb_session, runs, "Pip", "ch", 0)
    payload = _view(duckdb_session, runs, "Bo").model_dump_json()
    assert _REPLY not in payload and "A pack" not in payload
    assert "ch2" not in payload


def test_a_shown_pick_refreshes_the_other_phones(duckdb_session, events):
    """On: everyone else on the quest refreshes. Off: only the picker's own phone does."""
    _dm, _quest_read, runs = _setup(duckdb_session)
    events.clear()
    _pick(duckdb_session, runs, "Pip", "ch", 0)
    assert set(events) == {runs[n][0].id for n in ("Pip", "Bo", "Cy")}
    events.clear()
    _pick(duckdb_session, runs, "Pip", "ch2", 0)
    assert set(events) == {runs["Pip"][0].id}


def test_the_dm_log_keeps_the_option_number(duckdb_session):
    """The DM's results say which button, and whether the party could see it."""
    dm, quest, runs = _setup(duckdb_session)
    _pick(duckdb_session, runs, "Pip", "ch", 0)
    _pick(duckdb_session, runs, "Pip", "ch2", 1)
    pip = next(r for r in svc.list_runs(duckdb_session, quest.id, dm) if r.character_name == "Pip")
    picks = [(e.option, e.option_index, e.party) for e in pip.log if e.kind == "choice"]
    assert picks == [("Build a fire", 0, True), ("Leave it", 1, None)]
