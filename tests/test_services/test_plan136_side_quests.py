"""Plan 136 — side quests: DM-written quests players finish on their phones between sessions.

A quest runs by itself, with nobody supervising. So these tests lean on what can't go wrong
unattended: rewards pay exactly once, a player can't see past their current step, a private
quest makes no noise, and a broken quest can't be sent.
"""

import uuid

import pytest
from pydantic import ValidationError

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.character_item_repo import CharacterItemRepo
from db.repos.character_repo import CharacterRepo
from db.repos.side_quest_repo import SideQuestRunRepo
from domain.enums import CharacterClass
from domain.item import ItemCreate
from domain.side_quest import (
    QuestAdvance,
    QuestStep,
    SideQuestConflictError,
    SideQuestCreate,
    SideQuestNotFoundError,
    SideQuestSend,
    SideQuestUpdate,
    quest_problems,
)
from services import item_service
from services import side_quest_service as svc


class _Dice:
    """A random source that always rolls the same number."""

    def __init__(self, value: int) -> None:
        """Remember the number."""
        self.value = value

    def randint(self, _low: int, _high: int) -> int:
        """The number."""
        return self.value


def _dm() -> str:
    """A fresh DM email."""
    return f"dm136_{uuid.uuid4().hex[:8]}@example.com"


def _campaign(db, dm: str):
    """A campaign for ``dm``."""
    return camp_svc.create_campaign(db, name="C", setting="S", tone="T", dm_email=dm)


def _pc(db, campaign, dm: str, name: str = "Pip", gp: int = 0):
    """A level 1 Rogue, DEX 16, trained in Stealth: Stealth +5."""
    pc = char_svc.create_character(
        db,
        campaign_id=campaign.id,
        dm_email=dm,
        player_name="P",
        character_name=name,
        race="Human",
        character_class=CharacterClass.ROGUE,
        level=1,
        score_str=10,
        score_dex=16,
        score_con=12,
        score_int=10,
        score_wis=10,
        score_cha=10,
        hp_max=10,
        hp_current=10,
        ac=14,
        skill_proficiencies={"Stealth": 1},
    )
    if gp:
        row = CharacterRepo.get_by_id(db, pc.id)
        row.gp = gp
        db.add(row)
        db.commit()
    return pc


def _steps(**over) -> list[dict]:
    """Read → choice → check → (pass: reply → end | fail: end). Rewards on the way."""
    steps = [
        {"id": "a", "kind": "read", "text": "Opening words.", "next": "b"},
        {
            "id": "b",
            "kind": "choice",
            "text": "Which way?",
            "options": [{"label": "Left", "next": "c"}, {"label": "Right", "next": "d"}],
        },
        {
            "id": "c",
            "kind": "check",
            "text": "A locked door.",
            "skills": ["Stealth", "Athletics"],
            "dc": 12,
            "pass_next": "e",
            "fail_next": "d",
            "gp": 5,
        },
        {"id": "d", "kind": "end", "text": "You head home.", "gp": 10},
        {"id": "e", "kind": "reply", "text": "What do you take?", "next": "f"},
        {"id": "f", "kind": "end", "text": "Well done.", "gp": 50},
    ]
    for step in steps:
        step.update(over.get(step["id"], {}))
    return steps


def _quest(db, campaign, dm: str, **over):
    """A saved draft."""
    payload = {"title": "Title", "teaser": "Teaser", "steps": _steps(), **over}
    return svc.create_quest(db, campaign.id, SideQuestCreate(**payload), dm)


def _sent(db):
    """A DM, their campaign, a PC and a run of the standard quest."""
    dm = _dm()
    campaign = _campaign(db, dm)
    pc = _pc(db, campaign, dm)
    quest = _quest(db, campaign, dm)
    result = svc.send_quest(db, quest.id, SideQuestSend(character_ids=[pc.id]), dm)
    return dm, campaign, pc, quest, result.quest.runs[0].run_id


def _gold(db, pc) -> int:
    """The PC's gold now."""
    db.expire_all()
    return CharacterRepo.get_by_id(db, pc.id).gp


# ── What can be sent ────────────────────────────────────────────────────────


def test_the_standard_quest_is_ready():
    """A finished quest has no problems."""
    steps = [QuestStep(**s) for s in _steps()]
    assert quest_problems(steps, "a") == []


@pytest.mark.parametrize(
    ("over", "start", "needle"),
    [
        ({"a": {"next": "nope"}}, "a", "doesn't exist"),
        ({"a": {"next": None}}, "a", "what comes next"),
        ({"a": {"text": ""}}, "a", "no text"),
        ({"b": {"options": [{"label": "Only", "next": "c"}]}}, "a", "two options"),
        ({"c": {"dc": None}}, "a", "DC"),
        ({"c": {"skills": []}}, "a", "skill"),
        ({"c": {"fail_next": None}}, "a", "pass and a fail"),
        ({"d": {"kind": "read", "next": "a"}}, "a", "loops back"),
        (
            {"b": {"options": [{"label": "L", "next": "c"}, {"label": "R", "next": "c"}]}},
            "b",
            "reach",
        ),
        ({}, "nope", "comes first"),
    ],
)
def test_broken_quests_say_what_to_fix(over, start, needle):
    """Dangling links, loops, unreachable steps and half-filled steps are named in plain words."""
    steps = [QuestStep(**s) for s in _steps(**over)]
    assert any(needle in p for p in quest_problems(steps, start))


def test_a_quest_with_no_ending_is_refused():
    """A path that never ends can't be sent."""
    steps = [
        QuestStep(id="a", kind="read", text="x", next="b"),
        QuestStep(id="b", kind="read", text="y", next="a"),
    ]
    assert any("ending" in p or "loops" in p for p in quest_problems(steps, "a"))


def test_a_draft_may_be_unfinished_but_cant_be_sent(duckdb_session):
    """Saving half a quest is fine; sending it is refused with the list of what to fix."""
    dm = _dm()
    campaign = _campaign(duckdb_session, dm)
    pc = _pc(duckdb_session, campaign, dm)
    draft = _quest(duckdb_session, campaign, dm, steps=[{"id": "a", "kind": "read", "text": "x"}])
    assert draft.status == "draft" and draft.problems
    with pytest.raises(SideQuestConflictError, match="what comes next"):
        svc.send_quest(duckdb_session, draft.id, SideQuestSend(character_ids=[pc.id]), dm)
    assert svc.get_quest(duckdb_session, draft.id, dm).status == "draft"


@pytest.mark.parametrize(
    "step",
    [
        {"id": "a", "kind": "read", "image_url": "javascript:alert(1)"},
        {"id": "a", "kind": "read", "image_url": "http://example.com/a.png"},
        {"id": "a", "kind": "check", "skills": ["Lockpicking"]},
        {"id": "a", "kind": "check", "dc": 31},
        {"id": "a", "kind": "read", "gp": -1001},
        {"id": "a", "kind": "read", "text": "x" * 4001},
    ],
)
def test_bad_step_fields_are_refused(step):
    """Unsafe picture links, unknown skills and out-of-range numbers are 422s."""
    with pytest.raises(ValidationError):
        QuestStep(**step)


def test_two_steps_with_one_id_are_refused():
    """Step ids are unique within a quest."""
    with pytest.raises(ValidationError):
        SideQuestCreate(title="T", steps=[{"id": "a", "kind": "end"}, {"id": "a", "kind": "end"}])


def test_a_reward_item_this_dm_cant_see_blocks_the_send(duckdb_session):
    """Another DM's homebrew item can't be a reward."""
    dm, other = _dm(), _dm()
    campaign = _campaign(duckdb_session, dm)
    pc = _pc(duckdb_session, campaign, dm)
    theirs = item_service.create_item(
        duckdb_session,
        ItemCreate(name=f"Secret {uuid.uuid4().hex[:6]}", rarity="Common", item_type="Gear"),
        other,
    )
    quest = _quest(duckdb_session, campaign, dm, steps=_steps(d={"item_ids": [str(theirs.id)]}))
    with pytest.raises(SideQuestConflictError, match="no longer exists"):
        svc.send_quest(duckdb_session, quest.id, SideQuestSend(character_ids=[pc.id]), dm)


# ── Ownership ───────────────────────────────────────────────────────────────


def test_only_the_campaigns_dm_touches_a_quest(duckdb_session):
    """Every DM operation refuses a stranger."""
    dm, stranger = _dm(), _dm()
    campaign = _campaign(duckdb_session, dm)
    pc = _pc(duckdb_session, campaign, dm)
    quest = _quest(duckdb_session, campaign, dm)
    calls = [
        lambda: svc.list_quests(duckdb_session, campaign.id, stranger),
        lambda: svc.create_quest(duckdb_session, campaign.id, SideQuestCreate(title="T"), stranger),
        lambda: svc.get_quest(duckdb_session, quest.id, stranger),
        lambda: svc.update_quest(duckdb_session, quest.id, SideQuestUpdate(title="X"), stranger),
        lambda: svc.delete_quest(duckdb_session, quest.id, stranger),
        lambda: svc.send_quest(
            duckdb_session, quest.id, SideQuestSend(character_ids=[pc.id]), stranger
        ),
        lambda: svc.list_runs(duckdb_session, quest.id, stranger),
    ]
    for call in calls:
        with pytest.raises(PermissionError):
            call()


def test_a_character_from_another_campaign_cant_be_sent_to(duckdb_session):
    """A send only reaches this campaign's characters."""
    dm = _dm()
    campaign, other = _campaign(duckdb_session, dm), _campaign(duckdb_session, dm)
    outsider = _pc(duckdb_session, other, dm)
    quest = _quest(duckdb_session, campaign, dm)
    with pytest.raises(ValueError, match="isn't in this campaign"):
        svc.send_quest(duckdb_session, quest.id, SideQuestSend(character_ids=[outsider.id]), dm)


def test_another_characters_run_is_not_found(duckdb_session):
    """One play link can't read or move another character's run."""
    dm, campaign, _pc1, _quest1, run_id = _sent(duckdb_session)
    other = _pc(duckdb_session, campaign, dm, name="Other")
    calls = [
        lambda: svc.get_view(duckdb_session, other.id, run_id),
        lambda: svc.open_run(duckdb_session, other.id, run_id),
        lambda: svc.advance(duckdb_session, other.id, run_id, QuestAdvance(step_id="a")),
    ]
    for call in calls:
        with pytest.raises(SideQuestNotFoundError):
            call()


# ── What the phone sees ─────────────────────────────────────────────────────


def test_the_phone_never_gets_a_dc_a_link_or_a_later_step(duckdb_session):
    """The whole payload at the check step holds no DC, link or unreached text."""
    _dm_email, _c, pc, _q, run_id = _sent(duckdb_session)
    svc.open_run(duckdb_session, pc.id, run_id)
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="a"))
    view = svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="b", option=0))
    assert view.step.kind == "check"
    assert [(s.name, s.bonus) for s in view.step.skills] == [("Stealth", 5), ("Athletics", 0)]
    raw = view.model_dump_json()
    for secret in (
        '"dc"',
        "pass_next",
        "fail_next",
        '"next"',
        "You head home",
        "What do you take",
        "Well done",
    ):
        assert secret not in raw


def test_choice_options_carry_only_an_index_and_a_label(duckdb_session):
    """A choice's links stay on the server. ``taken_by`` (Plan 140) is empty unless a DM asks."""
    _d, _c, pc, _q, run_id = _sent(duckdb_session)
    svc.open_run(duckdb_session, pc.id, run_id)
    view = svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="a"))
    assert [o.model_dump() for o in view.step.options] == [
        {"index": 0, "label": "Left", "taken_by": []},
        {"index": 1, "label": "Right", "taken_by": []},
    ]


def test_history_shows_what_they_passed_and_did(duckdb_session):
    """A player can read back the steps they've passed, with their own choice."""
    _d, _c, pc, _q, run_id = _sent(duckdb_session)
    svc.open_run(duckdb_session, pc.id, run_id)
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="a"))
    view = svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="b", option=1))
    assert [h.text for h in view.history] == ["Opening words.", "Which way?"]
    assert view.history[1].option == "Right"


# ── Playing it ──────────────────────────────────────────────────────────────


def test_a_check_uses_the_real_bonus_and_branches(duckdb_session):
    """Stealth +5: a 7 totals 12 and passes DC 12; a 6 totals 11 and fails."""
    dm, campaign, pc, _q, run_id = _sent(duckdb_session)
    svc.open_run(duckdb_session, pc.id, run_id)
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="a"))
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="b", option=0))
    passed = svc.advance(
        duckdb_session, pc.id, run_id, QuestAdvance(step_id="c", skill="Stealth"), rng=_Dice(7)
    )
    assert passed.step.id == "e"
    assert (passed.outcome.die, passed.outcome.bonus, passed.outcome.total) == (7, 5, 12)
    assert passed.outcome.passed is True

    other = _pc(duckdb_session, campaign, dm, name="Other")
    quest2 = _quest(duckdb_session, campaign, dm)
    run2 = svc.send_quest(duckdb_session, quest2.id, SideQuestSend(character_ids=[other.id]), dm)
    run2_id = run2.quest.runs[0].run_id
    svc.advance(duckdb_session, other.id, run2_id, QuestAdvance(step_id="a"))
    svc.advance(duckdb_session, other.id, run2_id, QuestAdvance(step_id="b", option=0))
    failed = svc.advance(
        duckdb_session, other.id, run2_id, QuestAdvance(step_id="c", skill="Stealth"), rng=_Dice(6)
    )
    assert failed.step.id == "d" and failed.outcome.passed is False and failed.status == "done"


def test_a_typed_real_die_is_used_and_logged(duckdb_session):
    """A player rolling real dice types the die; the log says so."""
    dm, _c, pc, quest, run_id = _sent(duckdb_session)
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="a"))
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="b", option=0))
    view = svc.advance(
        duckdb_session, pc.id, run_id, QuestAdvance(step_id="c", skill="Stealth", real=20)
    )
    assert view.outcome.total == 25 and view.outcome.real is True
    log = svc.list_runs(duckdb_session, quest.id, dm)[0].log
    assert next(e for e in log if e.kind == "check").real is True


@pytest.mark.parametrize(
    ("step_id", "move"),
    [
        ("b", {"option": 9}),
        ("b", {}),
        ("c", {"skill": "Arcana"}),
        ("c", {}),
        ("e", {"reply": "  "}),
    ],
)
def test_a_move_that_doesnt_fit_changes_nothing(duckdb_session, step_id, move):
    """No option, a skill the check doesn't take, or an empty reply is refused."""
    _d, _c, pc, _q, run_id = _sent(duckdb_session)
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="a"))
    if step_id in ("c", "e"):
        svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="b", option=0))
    if step_id == "e":
        svc.advance(
            duckdb_session, pc.id, run_id, QuestAdvance(step_id="c", skill="Stealth"), rng=_Dice(20)
        )
    with pytest.raises(ValueError):
        svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id=step_id, **move))
    assert svc.get_view(duckdb_session, pc.id, run_id).step.id == step_id


def test_the_dm_sees_every_choice_roll_and_reply(duckdb_session):
    """The results hold what the player chose, rolled and wrote."""
    dm, _c, pc, quest, run_id = _sent(duckdb_session)
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="a"))
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="b", option=0))
    svc.advance(
        duckdb_session, pc.id, run_id, QuestAdvance(step_id="c", skill="Stealth"), rng=_Dice(15)
    )
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="e", reply="The silver cup."))
    [detail] = svc.list_runs(duckdb_session, quest.id, dm)
    assert detail.status == "done" and detail.character_name == "Pip" and detail.finished_at
    by_kind = {e.kind: e for e in detail.log}
    assert by_kind["choice"].option == "Left"
    assert (by_kind["check"].skill, by_kind["check"].total) == ("Stealth", 20)
    assert by_kind["reply"].reply == "The silver cup."


# ── Rewards pay exactly once ────────────────────────────────────────────────


def test_rewards_pay_on_arrival_and_add_up(duckdb_session):
    """The check step pays 5 and the ending pays 50."""
    _d, _c, pc, _q, run_id = _sent(duckdb_session)
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="a"))
    view = svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="b", option=0))
    assert view.outcome.gp == 5 and _gold(duckdb_session, pc) == 5
    svc.advance(
        duckdb_session, pc.id, run_id, QuestAdvance(step_id="c", skill="Stealth"), rng=_Dice(20)
    )
    view = svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="e", reply="x"))
    assert view.status == "done" and view.outcome.gp == 50 and _gold(duckdb_session, pc) == 55


def test_a_double_tap_changes_nothing(duckdb_session):
    """The same move again, with its now-stale step id, pays nothing and moves nothing."""
    _d, _c, pc, _q, run_id = _sent(duckdb_session)
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="a"))
    first = svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="b", option=0))
    again = svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="b", option=0))
    assert first.step.id == again.step.id == "c" and _gold(duckdb_session, pc) == 5
    assert len(svc.get_view(duckdb_session, pc.id, run_id).history) == 2


def test_a_lost_race_pays_nothing(duckdb_session, monkeypatch):
    """If another request already claimed the step, this one pays nothing."""
    _d, _c, pc, _q, run_id = _sent(duckdb_session)
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="a"))
    monkeypatch.setattr(SideQuestRunRepo, "claim_step", staticmethod(lambda *a: False))
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="b", option=0))
    assert _gold(duckdb_session, pc) == 0


def test_the_claim_only_wins_from_the_expected_step(duckdb_session):
    """The compare-and-swap refuses a run that has already moved."""
    _d, _c, pc, _q, run_id = _sent(duckdb_session)
    assert SideQuestRunRepo.claim_step(duckdb_session, run_id, "a", "b") is True
    assert SideQuestRunRepo.claim_step(duckdb_session, run_id, "a", "b") is False


def test_opening_twice_pays_once(duckdb_session):
    """A reward on the first step pays when it's opened, once."""
    dm = _dm()
    campaign = _campaign(duckdb_session, dm)
    pc = _pc(duckdb_session, campaign, dm)
    quest = _quest(duckdb_session, campaign, dm, steps=_steps(a={"gp": 7}))
    sent = svc.send_quest(duckdb_session, quest.id, SideQuestSend(character_ids=[pc.id]), dm)
    run_id = sent.quest.runs[0].run_id
    assert svc.get_view(duckdb_session, pc.id, run_id).status == "new"
    assert _gold(duckdb_session, pc) == 0
    assert svc.open_run(duckdb_session, pc.id, run_id).outcome.gp == 7
    svc.open_run(duckdb_session, pc.id, run_id)
    assert _gold(duckdb_session, pc) == 7


def test_a_finished_run_can_be_reread_but_not_replayed(duckdb_session):
    """After the ending, a stale move pays nothing and the ending still shows."""
    _d, _c, pc, _q, run_id = _sent(duckdb_session)
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="a"))
    done = svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="b", option=1))
    assert done.status == "done" and _gold(duckdb_session, pc) == 10
    again = svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="d"))
    assert again.step.text == "You head home." and _gold(duckdb_session, pc) == 10


def test_a_cost_comes_out_of_the_purse(duckdb_session):
    """A negative reward is a real cost."""
    dm = _dm()
    campaign = _campaign(duckdb_session, dm)
    pc = _pc(duckdb_session, campaign, dm, gp=30)
    quest = _quest(duckdb_session, campaign, dm, steps=_steps(d={"gp": -10}))
    sent = svc.send_quest(duckdb_session, quest.id, SideQuestSend(character_ids=[pc.id]), dm)
    run_id = sent.quest.runs[0].run_id
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="a"))
    view = svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="b", option=1))
    assert view.outcome.gp == -10 and _gold(duckdb_session, pc) == 20


def test_a_cost_past_zero_empties_the_purse_without_a_dead_end(duckdb_session):
    """Nobody supervises a quest, so a cost they can't afford doesn't stop them."""
    dm = _dm()
    campaign = _campaign(duckdb_session, dm)
    pc = _pc(duckdb_session, campaign, dm, gp=3)
    quest = _quest(duckdb_session, campaign, dm, steps=_steps(d={"gp": -10}))
    sent = svc.send_quest(duckdb_session, quest.id, SideQuestSend(character_ids=[pc.id]), dm)
    run_id = sent.quest.runs[0].run_id
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="a"))
    view = svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="b", option=1))
    assert view.status == "done" and view.outcome.gp == -3 and _gold(duckdb_session, pc) == 0


def test_items_are_granted_once_and_a_deleted_one_is_skipped(duckdb_session):
    """A reward item lands in the bag; one deleted since the send doesn't stop the quest."""
    dm = _dm()
    campaign = _campaign(duckdb_session, dm)
    pc = _pc(duckdb_session, campaign, dm)
    name = f"Charm {uuid.uuid4().hex[:6]}"
    item = item_service.create_item(
        duckdb_session, ItemCreate(name=name, rarity="Common", item_type="Gear"), dm
    )
    gone = item_service.create_item(
        duckdb_session, ItemCreate(name=f"Gone {name}", rarity="Common", item_type="Gear"), dm
    )
    steps = _steps(d={"item_ids": [str(item.id), str(gone.id)]})
    quest = _quest(duckdb_session, campaign, dm, steps=steps)
    sent = svc.send_quest(duckdb_session, quest.id, SideQuestSend(character_ids=[pc.id]), dm)
    run_id = sent.quest.runs[0].run_id
    item_service.delete_item(duckdb_session, gone.id, dm)
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="a"))
    view = svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="b", option=1))
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="b", option=1))
    assert view.outcome.items == [name]
    assert CharacterItemRepo.find_by_pc_and_item(duckdb_session, pc.id, item.id).quantity == 1


# ── Quiet, private, and tidy ────────────────────────────────────────────────


def test_a_quest_roll_makes_no_noise(duckdb_session, monkeypatch):
    """A quest check reaches neither the TV nor the party's phones, and needs no session."""
    import integrations.event_bus as bus

    calls: list[str] = []
    monkeypatch.setattr(bus, "publish_table_roll", lambda *a, **k: calls.append("table"))
    monkeypatch.setattr(bus, "publish_dice_rolled", lambda *a, **k: calls.append("party"))
    _d, _c, pc, _q, run_id = _sent(duckdb_session)
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="a"))
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="b", option=0))
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="c", skill="Stealth"))
    assert calls == []


def test_notices_go_only_to_the_character_who_got_the_quest(duckdb_session, monkeypatch):
    """The "new side quest" notice goes to recipients only and never names the quest."""
    notices: list[tuple] = []
    monkeypatch.setattr(
        svc,
        "publish_pc_updated",
        lambda pc_id, _c, kind="pc.updated", notice=None: notices.append((pc_id, notice)),
    )
    dm = _dm()
    campaign = _campaign(duckdb_session, dm)
    mine, other = _pc(duckdb_session, campaign, dm), _pc(duckdb_session, campaign, dm, name="B")
    quest = _quest(duckdb_session, campaign, dm, title="Very Secret Title")
    svc.send_quest(duckdb_session, quest.id, SideQuestSend(character_ids=[mine.id]), dm)
    assert [n for n in notices if n[1]] == [(mine.id, "You have a new side quest.")]
    assert all(n[0] != other.id for n in notices)


def test_sending_twice_skips_who_already_has_it(duckdb_session):
    """A second send adds the new character and leaves the first run where it is."""
    dm, campaign, pc, quest, run_id = _sent(duckdb_session)
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="a"))
    other = _pc(duckdb_session, campaign, dm, name="B")
    result = svc.send_quest(
        duckdb_session, quest.id, SideQuestSend(character_ids=[pc.id, other.id]), dm
    )
    assert result.new_runs == 1 and len(result.quest.runs) == 2
    assert svc.get_view(duckdb_session, pc.id, run_id).step.id == "b"


def test_each_character_sees_only_their_own_quests(duckdb_session):
    """The card list is per character."""
    dm, campaign, pc, _q, run_id = _sent(duckdb_session)
    other = _pc(duckdb_session, campaign, dm, name="B")
    assert [c.run_id for c in svc.list_cards(duckdb_session, pc.id)] == [run_id]
    assert svc.list_cards(duckdb_session, other.id) == []


def test_after_sending_only_words_can_change(duckdb_session):
    """A typo can be fixed under a live run; links, checks and rewards can't move."""
    dm, _c, pc, quest, run_id = _sent(duckdb_session)
    fixed = _steps(a={"text": "Fixed words."})
    changed = svc.update_quest(
        duckdb_session, quest.id, SideQuestUpdate(steps=fixed, title="New"), dm
    )
    assert changed.title == "New"
    assert svc.get_view(duckdb_session, pc.id, run_id).step.text == "Fixed words."
    for over in (
        {"a": {"next": "d"}},
        {"c": {"dc": 5}},
        {"d": {"gp": 999}},
        {"c": {"skills": ["Arcana"]}},
    ):
        with pytest.raises(SideQuestConflictError, match="words and pictures"):
            svc.update_quest(duckdb_session, quest.id, SideQuestUpdate(steps=_steps(**over)), dm)


def test_a_draft_can_change_freely(duckdb_session):
    """Before sending, anything goes."""
    dm = _dm()
    campaign = _campaign(duckdb_session, dm)
    quest = _quest(duckdb_session, campaign, dm)
    changed = svc.update_quest(
        duckdb_session, quest.id, SideQuestUpdate(steps=_steps(c={"dc": 5})), dm
    )
    assert next(s for s in changed.steps if s.id == "c").dc == 5


def test_deleting_a_quest_keeps_what_it_paid(duckdb_session):
    """The quest and its runs go; gold already earned stays."""
    dm, _c, pc, quest, run_id = _sent(duckdb_session)
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="a"))
    svc.advance(duckdb_session, pc.id, run_id, QuestAdvance(step_id="b", option=1))
    svc.delete_quest(duckdb_session, quest.id, dm)
    assert svc.list_cards(duckdb_session, pc.id) == []
    assert _gold(duckdb_session, pc) == 10


def test_deleting_a_character_or_a_campaign_cleans_up(duckdb_session):
    """Runs go with their character; quests go with their campaign."""
    dm, campaign, pc, quest, run_id = _sent(duckdb_session)
    char_svc.delete_character(duckdb_session, pc.id, dm)
    assert SideQuestRunRepo.get_by_id(duckdb_session, run_id) is None
    assert svc.get_quest(duckdb_session, quest.id, dm).runs == []
    camp_svc.delete_campaign(duckdb_session, campaign.id, dm)
    with pytest.raises(SideQuestNotFoundError):
        svc.get_quest(duckdb_session, quest.id, dm)


def test_a_discord_failure_doesnt_undo_the_send(duckdb_session):
    """The quest is on the phones either way; the result says what went wrong."""
    dm = _dm()
    campaign = _campaign(duckdb_session, dm)
    pc = _pc(duckdb_session, campaign, dm)
    quest = _quest(duckdb_session, campaign, dm)
    result = svc.send_quest(
        duckdb_session,
        quest.id,
        SideQuestSend(
            character_ids=[pc.id],
            ping={
                "channel_id": uuid.uuid4(),
                "npc_id": uuid.uuid4(),
                "content": "Check your phone.",
            },
        ),
        dm,
    )
    assert result.new_runs == 1 and result.ping_error
