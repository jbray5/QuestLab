"""Plan 143: the DM lets a player play again, and some characters skip a roll.

What matters: a replay starts clean on the phone and for the party, the DM keeps the earlier try,
taking back never empties a purse past zero or invents an item, damage stays, and a no-roll
character passes without a die while everyone else still rolls.
"""

import uuid

import pytest

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.character_repo import CharacterRepo
from db.repos.item_repo import ItemRepo
from domain.enums import CharacterClass, ItemRarity
from domain.item import ItemCreate
from domain.side_quest import (
    QuestAdvance,
    QuestPlayAgain,
    QuestPractice,
    QuestRecapShare,
    SideQuestConflictError,
    SideQuestCreate,
    SideQuestNotFoundError,
    SideQuestSend,
    SideQuestUpdate,
)
from services import inventory_service
from services import side_quest_service as svc


def _pc(db, campaign_id, dm: str, name: str):
    """A level 1 Rogue with 10 HP."""
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


def _steps(item_id=None):
    """Four tasks; the fire is a DC 30 check (nobody passes by rolling); the pack pays."""
    return [
        {
            "id": "ch",
            "kind": "choice",
            "text": "Four useful things.",
            "party_sees": True,
            "options": [{"label": "Fire", "next": "fire"}, {"label": "Lantern", "next": "e"}],
        },
        {
            "id": "fire",
            "kind": "check",
            "text": "Wet wood.",
            "skills": ["Survival"],
            "dc": 30,
            "pass_next": "pack",
            "fail_next": "fell",
        },
        {
            "id": "pack",
            "kind": "read",
            "text": "A pack.",
            "gp": 25,
            "item_ids": [str(item_id)] if item_id else [],
            "next": "e",
        },
        {"id": "fell", "kind": "read", "text": "Ow.", "damage": "3", "next": "e"},
        {"id": "e", "kind": "end", "text": "Morning."},
    ]


def _setup(db, no_roll_for: str = ""):
    """A Hollowmere-ish quest with a potion reward, sent to Creed and Willa."""
    dm = f"dm143_{uuid.uuid4().hex[:8]}@example.com"
    campaign = camp_svc.create_campaign(db, name="C", setting="S", tone="T", dm_email=dm)
    creed = _pc(db, campaign.id, dm, "Creed")
    willa = _pc(db, campaign.id, dm, "Willa")
    potion = ItemRepo.create(
        db,
        ItemCreate(
            name=f"Potion {uuid.uuid4().hex[:6]}", rarity=ItemRarity.COMMON, item_type="Potion"
        ),
        owner_email=dm,
    )
    steps = _steps(potion.id)
    if no_roll_for:
        steps[1]["no_roll"] = [str({"Creed": creed.id, "Willa": willa.id}[no_roll_for])]
    quest = svc.create_quest(
        db, campaign.id, SideQuestCreate(title="The First Night", steps=steps), dm
    )
    svc.send_quest(db, quest.id, SideQuestSend(character_ids=[creed.id, willa.id]), dm)
    runs = {r.character_name: r.run_id for r in svc.get_quest(db, quest.id, dm).runs}
    return dm, quest, creed, willa, potion, runs


def _play_fire(db, pc_id, run_id, die: int = 1):
    """Open, take the fire, roll ``die`` (or skip the roll), and continue to the end."""
    svc.open_run(db, pc_id, run_id)
    svc.advance(db, pc_id, run_id, QuestAdvance(step_id="ch", option=0))
    view = svc.advance(db, pc_id, run_id, QuestAdvance(step_id="fire", skill="Survival", real=die))
    view = svc.advance(db, pc_id, run_id, QuestAdvance(step_id=view.step.id))
    return view


def _sheet(db, pc_id):
    """(hp, gp) now."""
    db.expire_all()
    pc = CharacterRepo.get_by_id(db, pc_id)
    return pc.hp_current, pc.gp


def _potions(db, pc_id, dm, potion_id) -> int:
    """How many of the reward potion the sheet holds."""
    rows = inventory_service.list_for_character(db, pc_id, dm)
    return sum(r.quantity for r in rows if r.item_id == potion_id)


# ── No roll ─────────────────────────────────────────────────────────────────


def test_no_roll_character_passes_without_a_die(duckdb_session):
    """Creed's phone gets no skills and a no-roll flag; any move passes and pays."""
    dm, quest, creed, _, potion, runs = _setup(duckdb_session, no_roll_for="Creed")
    run = runs["Creed"]
    svc.open_run(duckdb_session, creed.id, run)
    view = svc.advance(duckdb_session, creed.id, run, QuestAdvance(step_id="ch", option=0))
    assert view.step.id == "fire" and view.step.no_roll is True and view.step.skills == []
    view = svc.advance(duckdb_session, creed.id, run, QuestAdvance(step_id="fire"))
    assert view.step.id == "pack"
    assert view.outcome.no_roll is True and view.outcome.passed is True and view.outcome.die is None
    assert view.outcome.gp == 25
    [fire] = [h for h in view.history if h.step_id == "fire"]
    assert fire.no_roll is True and fire.passed is True
    log = svc.list_runs(duckdb_session, quest.id, dm)
    entry = next(
        e for r in log if r.character_name == "Creed" for e in r.log if e.step_id == "fire"
    )
    assert entry.auto is True and entry.die is None


def test_everyone_else_still_rolls(duckdb_session):
    """Willa isn't on the list: she gets her skills, must pick one, and fails a DC 30."""
    _, _, _, willa, _, runs = _setup(duckdb_session, no_roll_for="Creed")
    run = runs["Willa"]
    svc.open_run(duckdb_session, willa.id, run)
    view = svc.advance(duckdb_session, willa.id, run, QuestAdvance(step_id="ch", option=0))
    assert view.step.no_roll is False and [s.name for s in view.step.skills] == ["Survival"]
    with pytest.raises(ValueError):
        svc.advance(duckdb_session, willa.id, run, QuestAdvance(step_id="fire"))
    view = svc.advance(
        duckdb_session, willa.id, run, QuestAdvance(step_id="fire", skill="Survival", real=20)
    )
    assert view.step.id == "fell"


def test_no_roll_can_change_after_sending(duckdb_session):
    """It's a ruling, not structure: a sent quest takes it, and a rival edit to a DC still can't."""
    dm, quest, creed, _, _, _ = _setup(duckdb_session)
    steps = [s.model_dump(mode="json") for s in svc.get_quest(duckdb_session, quest.id, dm).steps]
    steps[1]["no_roll"] = [str(creed.id)]
    saved = svc.update_quest(duckdb_session, quest.id, SideQuestUpdate(steps=steps), dm)
    assert saved.steps[1].no_roll == [creed.id]
    steps[1]["dc"] = 5
    with pytest.raises(SideQuestConflictError):
        svc.update_quest(duckdb_session, quest.id, SideQuestUpdate(steps=steps), dm)


def test_no_roll_only_on_checks():
    """A read or choice step drops the list: there's no roll to skip."""
    from domain.side_quest import QuestStep

    step = QuestStep(id="r", kind="read", text="x", next="e", no_roll=[uuid.uuid4()])
    assert step.no_roll == []


# ── Play again ──────────────────────────────────────────────────────────────


def test_play_again_takes_back_gold_and_items_and_keeps_the_earlier_try(duckdb_session):
    """Creed passes the fire (no roll), gets 25 gp and a potion; the DM resets and takes it back."""
    dm, quest, creed, _, potion, runs = _setup(duckdb_session, no_roll_for="Creed")
    run = runs["Creed"]
    _play_fire(duckdb_session, creed.id, run)
    svc.advance(duckdb_session, creed.id, run, QuestAdvance(step_id="e"))
    assert (
        _sheet(duckdb_session, creed.id)[1] == 25
        and _potions(duckdb_session, creed.id, dm, potion.id) == 1
    )

    detail = svc.play_again(duckdb_session, quest.id, run, QuestPlayAgain(), dm)
    assert detail.status == "new" and detail.step_id == "ch"
    again = detail.log[-1]
    assert again.kind == "again" and again.taken_gp == 25 and again.taken_items == [potion.name]
    assert any(e.option == "Fire" for e in detail.log), "the earlier try stays for the DM"
    assert (
        _sheet(duckdb_session, creed.id)[1] == 0
        and _potions(duckdb_session, creed.id, dm, potion.id) == 0
    )

    view = svc.open_run(duckdb_session, creed.id, run)
    assert view.step.id == "ch" and view.history == [] and view.outcome.gp == 0
    assert view.status == "active"


def test_play_again_can_keep_what_was_paid(duckdb_session):
    """Untick take back: gold and the potion stay; the replay can pay again."""
    dm, quest, creed, _, potion, runs = _setup(duckdb_session, no_roll_for="Creed")
    run = runs["Creed"]
    _play_fire(duckdb_session, creed.id, run)
    detail = svc.play_again(duckdb_session, quest.id, run, QuestPlayAgain(take_back=False), dm)
    assert detail.log[-1].taken_gp is None and detail.log[-1].taken_items == []
    assert (
        _sheet(duckdb_session, creed.id)[1] == 25
        and _potions(duckdb_session, creed.id, dm, potion.id) == 1
    )


def test_take_back_stops_at_an_empty_purse_and_names_what_is_gone(duckdb_session):
    """He spent 20 of the 25 and drank the potion: 5 gp comes back off, the potion is named kept."""
    dm, quest, creed, _, potion, runs = _setup(duckdb_session, no_roll_for="Creed")
    run = runs["Creed"]
    _play_fire(duckdb_session, creed.id, run)
    pc = CharacterRepo.get_by_id(duckdb_session, creed.id)
    from domain.character import PlayerCharacterUpdate

    CharacterRepo.update(duckdb_session, pc, PlayerCharacterUpdate(gp=5))
    row = next(
        r
        for r in inventory_service.list_for_character(duckdb_session, creed.id, dm)
        if r.item_id == potion.id
    )
    inventory_service.remove(duckdb_session, row.id, dm)
    again = svc.play_again(duckdb_session, quest.id, run, QuestPlayAgain(), dm).log[-1]
    assert again.taken_gp == 5 and again.kept_items == [potion.name] and again.taken_items == []
    assert _sheet(duckdb_session, creed.id)[1] == 0


def test_damage_stays_taken(duckdb_session):
    """Willa fails the fire and takes 3; a reset with take back doesn't heal her."""
    dm, quest, _, willa, _, runs = _setup(duckdb_session)
    run = runs["Willa"]
    _play_fire(duckdb_session, willa.id, run, die=1)
    assert _sheet(duckdb_session, willa.id)[0] == 7
    svc.play_again(duckdb_session, quest.id, run, QuestPlayAgain(), dm)
    assert _sheet(duckdb_session, willa.id)[0] == 7


def test_the_party_stops_seeing_the_earlier_pick_and_recap(duckdb_session):
    """Creed's first-try pick leaves Willa's options; his old party story moves to the DM's log."""
    dm, quest, creed, willa, _, runs = _setup(duckdb_session, no_roll_for="Creed")
    _play_fire(duckdb_session, creed.id, runs["Creed"])
    svc.advance(duckdb_session, creed.id, runs["Creed"], QuestAdvance(step_id="e"))
    svc.share_recap(duckdb_session, creed.id, runs["Creed"], QuestRecapShare(text="I lit it."))
    svc.open_run(duckdb_session, willa.id, runs["Willa"])
    before = svc.get_view(duckdb_session, willa.id, runs["Willa"])
    assert before.step.options[0].taken_by == ["Creed"]
    assert len(svc.party_recaps(duckdb_session, willa.id)) == 1

    detail = svc.play_again(duckdb_session, quest.id, runs["Creed"], QuestPlayAgain(), dm)
    assert detail.recap is None and detail.log[-1].recap == "I lit it."
    after = svc.get_view(duckdb_session, willa.id, runs["Willa"])
    assert after.step.options[0].taken_by == []
    assert svc.party_recaps(duckdb_session, willa.id) == []

    svc.open_run(duckdb_session, creed.id, runs["Creed"])
    svc.advance(duckdb_session, creed.id, runs["Creed"], QuestAdvance(step_id="ch", option=1))
    again = svc.get_view(duckdb_session, willa.id, runs["Willa"])
    assert again.step.options[1].taken_by == ["Creed"] and again.step.options[0].taken_by == []


def test_play_again_twice_keeps_both_earlier_tries(duckdb_session):
    """Each reset adds its own marker; the second takes back only the second try's pay."""
    dm, quest, creed, _, _, runs = _setup(duckdb_session, no_roll_for="Creed")
    run = runs["Creed"]
    _play_fire(duckdb_session, creed.id, run)
    svc.play_again(duckdb_session, quest.id, run, QuestPlayAgain(take_back=False), dm)
    _play_fire(duckdb_session, creed.id, run)
    assert _sheet(duckdb_session, creed.id)[1] == 50
    detail = svc.play_again(duckdb_session, quest.id, run, QuestPlayAgain(), dm)
    assert [e.kind for e in detail.log].count("again") == 2
    assert detail.log[-1].taken_gp == 25 and _sheet(duckdb_session, creed.id)[1] == 25


def test_who_can_play_again(duckdb_session):
    """Only the quest's DM, only a real run, only once it's been opened, only this quest's run."""
    dm, quest, creed, willa, _, runs = _setup(duckdb_session)
    with pytest.raises(SideQuestConflictError):
        svc.play_again(duckdb_session, quest.id, runs["Willa"], QuestPlayAgain(), dm)
    svc.open_run(duckdb_session, creed.id, runs["Creed"])
    with pytest.raises(PermissionError):
        svc.play_again(
            duckdb_session, quest.id, runs["Creed"], QuestPlayAgain(), "other@example.com"
        )
    with pytest.raises(SideQuestNotFoundError):
        svc.play_again(duckdb_session, quest.id, uuid.uuid4(), QuestPlayAgain(), dm)
    steven = _pc(duckdb_session, quest.campaign_id, dm, "Steven")
    practice = svc.practice(duckdb_session, quest.id, QuestPractice(character_id=steven.id), dm)
    with pytest.raises(SideQuestConflictError):
        svc.play_again(duckdb_session, quest.id, practice.run_id, QuestPlayAgain(), dm)


def test_send_lists_a_no_roll_character_from_elsewhere(duckdb_session):
    """A no-roll id that isn't in the campaign blocks the send, like stray words do."""
    dm = f"dm143_{uuid.uuid4().hex[:8]}@example.com"
    campaign = camp_svc.create_campaign(
        duckdb_session, name="C", setting="S", tone="T", dm_email=dm
    )
    creed = _pc(duckdb_session, campaign.id, dm, "Creed")
    steps = _steps()
    steps[1]["no_roll"] = [str(uuid.uuid4())]
    quest = svc.create_quest(
        duckdb_session, campaign.id, SideQuestCreate(title="Q", steps=steps), dm
    )
    with pytest.raises(SideQuestConflictError, match="skips the roll"):
        svc.send_quest(duckdb_session, quest.id, SideQuestSend(character_ids=[creed.id]), dm)
