"""Side quests (Plan 136): DM-written quests players finish on their phones between sessions.

Rules enforced here:

- **Ownership.** Every DM operation needs the campaign's DM. Player operations take the PC's id
  (resolved from the play link by ``api.deps.play_pc_id``) and only touch that PC's runs; another
  PC's run is a 404.
- **The phone sees one step.** ``_view`` builds the only shape a player gets: the current step
  without its DC or links. Steps a player hasn't reached never leave the server.
- **Sending needs a finished quest.** A draft may be unfinished. ``quest_problems`` lists what's
  wrong, and a send refuses with that list.
- **After sending, only words and pictures change.** Links and rewards under a live run would
  break it.
- **Rewards pay exactly once.** The graph has no cycles, so a step is reached at most once. Moving
  a run forward is a compare-and-swap on its current step (``claim_step``), so of two requests at
  the same moment only one wins, and only the winner pays. If the server dies between the claim
  and the payment the player misses a reward rather than getting it twice.
- **Rolls are quiet.** ``player_service.throw_dice`` broadcasts to the TV and the party's phones.
  A private quest must not, so checks roll here.
- **A recap is the player's to give (Plan 138).** Nothing about a run reaches the party unless its
  player writes it, and then only their words and their character's name. It doesn't have to be
  true, and that's half the fun. The DM sees it next to what really happened.
"""

import logging
import random
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlmodel import Session

from db.repos.campaign_repo import CampaignRepo
from db.repos.character_repo import CharacterRepo
from db.repos.item_repo import ItemRepo
from db.repos.side_quest_repo import SideQuestRepo, SideQuestRunRepo
from domain.campaign import Campaign
from domain.character import CharacterItemCreate, PlayerCharacter, PlayerCharacterUpdate
from domain.crier import CrierSendRequest
from domain.side_quest import (
    PartyRecap,
    QuestAdvance,
    QuestCard,
    QuestHistoryItem,
    QuestLogEntry,
    QuestOptionView,
    QuestOutcome,
    QuestRecapShare,
    QuestRunDetail,
    QuestRunSummary,
    QuestRunView,
    QuestSkillView,
    QuestStep,
    QuestStepView,
    SideQuest,
    SideQuestConflictError,
    SideQuestCreate,
    SideQuestNotFoundError,
    SideQuestRead,
    SideQuestRun,
    SideQuestSend,
    SideQuestSendResult,
    SideQuestUpdate,
    quest_problems,
    structure_of,
)
from integrations.event_bus import publish_pc_updated
from services import crier_service, inventory_service
from services.auth_service import catalog_visible
from services.character_service import compute_skill_bonuses
from services.shop_service import _purse_copper, _redenominate

logger = logging.getLogger(__name__)

_NEW_QUEST_NOTICE = "You have a new side quest."


def _now() -> datetime:
    """Now, in UTC."""
    return datetime.now(timezone.utc)


# ── Lookups and authorization ───────────────────────────────────────────────


def _owned_campaign(db: Session, campaign_id: uuid.UUID, dm_email: str) -> Campaign:
    """The campaign, if ``dm_email`` runs it.

    Raises:
        SideQuestNotFoundError: If there is no such campaign.
        PermissionError: If the caller doesn't run it.
    """
    campaign = CampaignRepo.get_by_id(db, campaign_id)
    if campaign is None:
        raise SideQuestNotFoundError("That campaign doesn't exist.")
    if campaign.dm_email != (dm_email or "").strip().lower():
        raise PermissionError("You do not have permission to access this campaign.")
    return campaign


def _owned_quest(db: Session, quest_id: uuid.UUID, dm_email: str) -> SideQuest:
    """The quest, if ``dm_email`` runs its campaign.

    Raises:
        SideQuestNotFoundError: If there is no such quest.
        PermissionError: If the caller doesn't run its campaign.
    """
    quest = SideQuestRepo.get_by_id(db, quest_id)
    if quest is None:
        raise SideQuestNotFoundError("That side quest doesn't exist (it may have been deleted).")
    _owned_campaign(db, quest.campaign_id, dm_email)
    return quest


def _steps(quest: SideQuest) -> list[QuestStep]:
    """The quest's steps, as validated models."""
    return [QuestStep.model_validate(s) for s in quest.steps or []]


def _dump_steps(steps: list[QuestStep]) -> list[dict[str, Any]]:
    """Steps as JSON-safe dicts for the column."""
    return [s.model_dump(mode="json") for s in steps]


def _read(db: Session, quest: SideQuest) -> SideQuestRead:
    """A quest as the DM sees it: what's left to fix, and where each character is."""
    steps = _steps(quest)
    runs = SideQuestRunRepo.list_for_quest(db, quest.id)
    names = SideQuestRunRepo.character_names(db, [r.character_id for r in runs])
    return SideQuestRead(
        id=quest.id,
        campaign_id=quest.campaign_id,
        title=quest.title,
        teaser=quest.teaser,
        steps=steps,
        start_step=quest.start_step,
        status=quest.status,
        created_at=quest.created_at,
        updated_at=quest.updated_at,
        sent_at=quest.sent_at,
        problems=quest_problems(steps, quest.start_step),
        runs=[_summary(r, names.get(r.character_id, "")) for r in runs],
    )


def _summary(run: SideQuestRun, name: str) -> QuestRunSummary:
    """Where one character is in a quest."""
    return QuestRunSummary(
        run_id=run.id,
        character_id=run.character_id,
        character_name=name,
        status=run.status,
        opened_at=run.opened_at,
        finished_at=run.finished_at,
    )


# ── The DM's side ───────────────────────────────────────────────────────────


def list_quests(db: Session, campaign_id: uuid.UUID, dm_email: str) -> list[SideQuestRead]:
    """A campaign's quests, newest first.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: The requesting DM.

    Returns:
        The quests.

    Raises:
        SideQuestNotFoundError: If there is no such campaign.
        PermissionError: If the caller doesn't run it.
    """
    _owned_campaign(db, campaign_id, dm_email)
    return [_read(db, q) for q in SideQuestRepo.list_for_campaign(db, campaign_id)]


def create_quest(
    db: Session, campaign_id: uuid.UUID, payload: SideQuestCreate, dm_email: str
) -> SideQuestRead:
    """Save a new draft. It may be unfinished.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        payload: The validated quest.
        dm_email: The requesting DM.

    Returns:
        The new draft.

    Raises:
        SideQuestNotFoundError: If there is no such campaign.
        PermissionError: If the caller doesn't run it.
    """
    _owned_campaign(db, campaign_id, dm_email)
    quest = SideQuest(
        campaign_id=campaign_id,
        title=payload.title,
        teaser=payload.teaser,
        steps=_dump_steps(payload.steps),
        start_step=payload.start_step or (payload.steps[0].id if payload.steps else None),
    )
    return _read(db, SideQuestRepo.save(db, quest))


def get_quest(db: Session, quest_id: uuid.UUID, dm_email: str) -> SideQuestRead:
    """One quest, with its DCs and links.

    Args:
        db: Active database session.
        quest_id: UUID of the quest.
        dm_email: The requesting DM.

    Returns:
        The quest.

    Raises:
        SideQuestNotFoundError: If there is no such quest.
        PermissionError: If the caller doesn't run its campaign.
    """
    return _read(db, _owned_quest(db, quest_id, dm_email))


def update_quest(
    db: Session, quest_id: uuid.UUID, payload: SideQuestUpdate, dm_email: str
) -> SideQuestRead:
    """Change a quest. Once it's sent, only words and pictures may change.

    Args:
        db: Active database session.
        quest_id: UUID of the quest.
        payload: The fields to change.
        dm_email: The requesting DM.

    Returns:
        The updated quest.

    Raises:
        SideQuestNotFoundError: If there is no such quest.
        PermissionError: If the caller doesn't run its campaign.
        SideQuestConflictError: If a sent quest's links, checks or rewards would change.
    """
    quest = _owned_quest(db, quest_id, dm_email)
    patch = payload.model_dump(exclude_unset=True)
    new_steps = payload.steps if "steps" in patch else _steps(quest)
    new_start = patch["start_step"] if "start_step" in patch else quest.start_step
    if quest.status == "sent" and structure_of(new_steps, new_start) != structure_of(
        _steps(quest), quest.start_step
    ):
        raise SideQuestConflictError(
            "This quest has gone out, so you can only change its words and pictures now. "
            "Links, checks and rewards stay as they were."
        )
    if "title" in patch:
        quest.title = patch["title"]
    if "teaser" in patch:
        quest.teaser = patch["teaser"]
    quest.steps = _dump_steps(new_steps)
    quest.start_step = new_start
    quest.updated_at = _now()
    return _read(db, SideQuestRepo.save(db, quest))


def delete_quest(db: Session, quest_id: uuid.UUID, dm_email: str) -> None:
    """Delete a quest and its runs. Gold and items already paid stay on the sheets.

    Args:
        db: Active database session.
        quest_id: UUID of the quest.
        dm_email: The requesting DM.

    Raises:
        SideQuestNotFoundError: If there is no such quest.
        PermissionError: If the caller doesn't run its campaign.
    """
    quest = _owned_quest(db, quest_id, dm_email)
    character_ids = SideQuestRunRepo.character_ids_with_run(db, quest.id)
    campaign_id = quest.campaign_id
    SideQuestRepo.delete(db, quest)
    for character_id in character_ids:
        publish_pc_updated(character_id, campaign_id)


def send_quest(
    db: Session, quest_id: uuid.UUID, payload: SideQuestSend, dm_email: str
) -> SideQuestSendResult:
    """Send a finished quest to characters. Anyone who already has a run is skipped.

    A Discord failure doesn't undo the send: the quest is on the phones either way, and the
    result says what went wrong.

    Args:
        db: Active database session.
        quest_id: UUID of the quest.
        payload: Who gets it, and an optional Discord post.
        dm_email: The requesting DM.

    Returns:
        The quest, how many new runs were made, and any Discord error.

    Raises:
        SideQuestNotFoundError: If there is no such quest.
        PermissionError: If the caller doesn't run its campaign.
        SideQuestConflictError: If the quest isn't finished (the message lists what to fix).
        ValueError: If a character isn't in this campaign.
    """
    quest = _owned_quest(db, quest_id, dm_email)
    steps = _steps(quest)
    problems = quest_problems(steps, quest.start_step) + _item_problems(db, steps, dm_email)
    if problems:
        raise SideQuestConflictError(" ".join(problems))
    existing = SideQuestRunRepo.character_ids_with_run(db, quest.id)
    targets = list(dict.fromkeys(payload.character_ids))
    pcs = [_campaign_pc(db, cid, quest.campaign_id) for cid in targets]
    new_runs = 0
    for pc in pcs:
        if pc.id in existing:
            continue
        SideQuestRunRepo.save(
            db, SideQuestRun(quest_id=quest.id, character_id=pc.id, step_id=quest.start_step)
        )
        new_runs += 1
    if quest.status != "sent":
        quest.status = "sent"
        quest.sent_at = _now()
        quest = SideQuestRepo.save(db, quest)
    for pc in pcs:
        if pc.id not in existing:
            publish_pc_updated(pc.id, pc.campaign_id, notice=_NEW_QUEST_NOTICE)
    return SideQuestSendResult(
        quest=_read(db, quest),
        new_runs=new_runs,
        ping_error=_ping(db, quest.campaign_id, payload, dm_email),
    )


def _ping(
    db: Session, campaign_id: uuid.UUID, payload: SideQuestSend, dm_email: str
) -> Optional[str]:
    """Post the optional Discord message; return what went wrong, if anything."""
    if payload.ping is None:
        return None
    try:
        crier_service.send(
            db,
            campaign_id,
            dm_email,
            CrierSendRequest(
                channel_id=payload.ping.channel_id,
                npc_id=payload.ping.npc_id,
                content=payload.ping.content,
            ),
        )
    except (ValueError, PermissionError) as exc:
        return str(exc)
    return None


def _campaign_pc(db: Session, character_id: uuid.UUID, campaign_id: uuid.UUID) -> PlayerCharacter:
    """The character, if it's in this campaign.

    Raises:
        ValueError: If it isn't.
    """
    pc = CharacterRepo.get_by_id(db, character_id)
    if pc is None or pc.campaign_id != campaign_id:
        raise ValueError("That character isn't in this campaign.")
    return pc


def _item_problems(db: Session, steps: list[QuestStep], dm_email: str) -> list[str]:
    """Reward items this DM can't hand out (deleted, or another DM's homebrew)."""
    problems: list[str] = []
    for index, step in enumerate(steps):
        for item_id in step.item_ids:
            item = ItemRepo.get_by_id(db, item_id)
            if item is None or not catalog_visible(item.created_by_email, dm_email):
                problems.append(f"Step {index + 1} rewards an item that no longer exists.")
    return problems


def list_runs(db: Session, quest_id: uuid.UUID, dm_email: str) -> list[QuestRunDetail]:
    """Everything each character did in a quest: choices, rolls and replies.

    Args:
        db: Active database session.
        quest_id: UUID of the quest.
        dm_email: The requesting DM.

    Returns:
        One detail per run.

    Raises:
        SideQuestNotFoundError: If there is no such quest.
        PermissionError: If the caller doesn't run its campaign.
    """
    quest = _owned_quest(db, quest_id, dm_email)
    runs = SideQuestRunRepo.list_for_quest(db, quest.id)
    names = SideQuestRunRepo.character_names(db, [r.character_id for r in runs])
    return [
        QuestRunDetail(
            **_summary(r, names.get(r.character_id, "")).model_dump(),
            step_id=r.step_id,
            log=[QuestLogEntry.model_validate(e) for e in r.log or []],
            recap=r.recap,
            recap_at=r.recap_at,
        )
        for r in runs
    ]


# ── The player's side ───────────────────────────────────────────────────────


def list_cards(db: Session, pc_id: uuid.UUID) -> list[QuestCard]:
    """A character's quests for the phone's card and Journal, newest first.

    Args:
        db: Active database session.
        pc_id: The character the play link belongs to.

    Returns:
        The cards.
    """
    return [
        QuestCard(
            run_id=run.id,
            title=quest.title,
            teaser=quest.teaser,
            status=run.status,
            sent_at=run.created_at,
            finished_at=run.finished_at,
        )
        for run, quest in SideQuestRunRepo.list_for_character(db, pc_id)
    ]


def _own_run(db: Session, pc_id: uuid.UUID, run_id: uuid.UUID) -> tuple[SideQuestRun, SideQuest]:
    """A run of this character, with its quest. Anyone else's is "not found".

    Raises:
        SideQuestNotFoundError: If this character has no such run.
    """
    run = SideQuestRunRepo.get_by_id(db, run_id)
    quest = SideQuestRepo.get_by_id(db, run.quest_id) if run else None
    if run is None or quest is None or run.character_id != pc_id:
        raise SideQuestNotFoundError("That side quest isn't here any more.")
    return run, quest


def get_view(db: Session, pc_id: uuid.UUID, run_id: uuid.UUID) -> QuestRunView:
    """The current step of a character's run, as the phone may see it.

    Args:
        db: Active database session.
        pc_id: The character the play link belongs to.
        run_id: UUID of the run.

    Returns:
        The view.

    Raises:
        SideQuestNotFoundError: If this character has no such run.
    """
    run, quest = _own_run(db, pc_id, run_id)
    return _view(db, run, quest)


def open_run(db: Session, pc_id: uuid.UUID, run_id: uuid.UUID) -> QuestRunView:
    """Open a new quest, paying whatever its first step pays. Opening twice changes nothing.

    Args:
        db: Active database session.
        pc_id: The character the play link belongs to.
        run_id: UUID of the run.

    Returns:
        The view.

    Raises:
        SideQuestNotFoundError: If this character has no such run.
    """
    run, quest = _own_run(db, pc_id, run_id)
    if SideQuestRunRepo.claim_open(db, run.id, _now()):
        db.refresh(run)
        by_id = {s.id: s for s in _steps(quest)}
        step = by_id[run.step_id]
        entry: dict[str, Any] = {"step_id": step.id, "kind": "opened", "at": _now().isoformat()}
        _arrive(db, run, quest, step, entry)
    return _view(db, run, quest)


def advance(
    db: Session, pc_id: uuid.UUID, run_id: uuid.UUID, move: QuestAdvance, rng: Any = None
) -> QuestRunView:
    """Take a player's move on the current step, and go on to the next.

    A move for a step the run has already left, or on a finished run, changes nothing and returns
    the current view: that's a double tap, not an error.

    Args:
        db: Active database session.
        pc_id: The character the play link belongs to.
        run_id: UUID of the run.
        move: The player's move.
        rng: A random source with ``randint`` (tests); defaults to ``SystemRandom``.

    Returns:
        The view of wherever the run is now.

    Raises:
        SideQuestNotFoundError: If this character has no such run.
        ValueError: If the move doesn't fit the step (no option picked, an empty reply...).
    """
    run, quest = _own_run(db, pc_id, run_id)
    if run.status == "new":
        open_run(db, pc_id, run_id)
        db.refresh(run)
    if run.status == "done" or move.step_id != run.step_id:
        return _view(db, run, quest)
    by_id = {s.id: s for s in _steps(quest)}
    step = by_id[run.step_id]
    pc = _pc(db, pc_id)
    entry, next_id = _resolve(step, move, pc, rng or random.SystemRandom())
    target = by_id.get(next_id)
    if target is None:
        raise SideQuestNotFoundError("That side quest isn't here any more.")
    if SideQuestRunRepo.claim_step(db, run.id, step.id, target.id):
        db.refresh(run)
        _arrive(db, run, quest, target, entry)
    else:
        db.refresh(run)
    return _view(db, run, quest)


def share_recap(
    db: Session, pc_id: uuid.UUID, run_id: uuid.UUID, payload: QuestRecapShare
) -> QuestRunView:
    """Tell the party what happened on a finished quest, change it, or take it back.

    Every phone at the table refreshes, and the others get a card on the Now screen. A correction
    keeps its time, so it doesn't bring the card back.

    Args:
        db: Active database session.
        pc_id: The character the play link belongs to.
        run_id: UUID of the run.
        payload: The player's words. Empty takes the recap back.

    Returns:
        The view, with the recap as it now stands.

    Raises:
        SideQuestNotFoundError: If this character has no such run.
        SideQuestConflictError: If the quest isn't finished yet.
    """
    run, quest = _own_run(db, pc_id, run_id)
    if run.status != "done":
        raise SideQuestConflictError("Finish the quest first.")
    pc = _pc(db, pc_id)
    first = not run.recap and bool(payload.text)
    run.recap = payload.text or None
    if first:
        run.recap_at = _now()
    elif not payload.text:
        run.recap_at = None
    SideQuestRunRepo.save(db, run)
    for other in CharacterRepo.list_by_campaign(db, pc.campaign_id):
        publish_pc_updated(other.id, pc.campaign_id)
    return _view(db, run, quest)


def party_recaps(db: Session, pc_id: uuid.UUID) -> list[PartyRecap]:
    """What everyone in this character's campaign has told the party, newest first.

    Args:
        db: Active database session.
        pc_id: The character the play link belongs to.

    Returns:
        The recaps: who, and their words. Nothing else about the run.
    """
    pc = _pc(db, pc_id)
    return [
        PartyRecap(
            character_name=name,
            text=run.recap or "",
            at=run.recap_at or run.created_at,
            mine=run.character_id == pc_id,
        )
        for run, name in SideQuestRunRepo.recaps_for_campaign(db, pc.campaign_id)
    ]


def _pc(db: Session, pc_id: uuid.UUID) -> PlayerCharacter:
    """The character.

    Raises:
        SideQuestNotFoundError: If it's gone.
    """
    pc = CharacterRepo.get_by_id(db, pc_id)
    if pc is None:
        raise SideQuestNotFoundError("That character doesn't exist.")
    return pc


def _resolve(
    step: QuestStep, move: QuestAdvance, pc: PlayerCharacter, rng: Any
) -> tuple[dict[str, Any], str]:
    """What the player did on ``step``: the log entry, and the step it leads to.

    Raises:
        ValueError: If the move doesn't fit the step.
    """
    entry: dict[str, Any] = {"step_id": step.id, "kind": step.kind, "at": _now().isoformat()}
    if step.kind == "read":
        return entry, step.next or ""
    if step.kind == "choice":
        if move.option is None or not 0 <= move.option < len(step.options):
            raise ValueError("Pick one of the options.")
        option = step.options[move.option]
        entry["option"] = option.label
        return entry, option.next or ""
    if step.kind == "reply":
        if not move.reply:
            raise ValueError("Write something first.")
        entry["reply"] = move.reply
        return entry, step.next or ""
    if step.kind == "check":
        if move.skill not in step.skills:
            raise ValueError("Pick one of the skills.")
        bonus = compute_skill_bonuses(pc).get(move.skill, 0)
        die = move.real if move.real is not None else rng.randint(1, 20)
        total = die + bonus
        passed = total >= (step.dc or 0)
        entry.update(
            skill=move.skill,
            die=die,
            bonus=bonus,
            total=total,
            passed=passed,
            real=move.real is not None,
        )
        return entry, (step.pass_next if passed else step.fail_next) or ""
    raise ValueError("This quest is finished.")


def _arrive(
    db: Session,
    run: SideQuestRun,
    quest: SideQuest,
    step: QuestStep,
    entry: dict[str, Any],
) -> None:
    """Pay what arriving at ``step`` pays, write the log, and finish the run on an ending.

    Only ever called by whoever won the claim, so it runs once per step per run.
    """
    pc = _pc(db, run.character_id)
    paid = _pay_gold(db, pc, step.gp)
    if paid:
        entry["gp"] = paid
    items = _grant_items(db, pc, quest, step)
    if items:
        entry["items"] = items
    run.log = [*(run.log or []), entry]
    if step.kind == "end":
        run.status = "done"
        run.finished_at = _now()
    SideQuestRunRepo.save(db, run)
    publish_pc_updated(pc.id, pc.campaign_id)


def _pay_gold(db: Session, pc: PlayerCharacter, gp: int) -> float:
    """Add gold, or take a cost from the purse. A cost past zero empties the purse.

    Returns:
        What actually changed, in gp (negative for a cost; 3.5 if the purse only held that).
    """
    if gp > 0:
        CharacterRepo.update(db, pc, PlayerCharacterUpdate(gp=(pc.gp or 0) + gp))
        return float(gp)
    if gp < 0:
        purse = _purse_copper(pc)
        taken = min(purse, -gp * 100)
        if taken:
            CharacterRepo.update(db, pc, PlayerCharacterUpdate(**_redenominate(purse - taken)))
        return -taken / 100
    return 0.0


def _grant_items(db: Session, pc: PlayerCharacter, quest: SideQuest, step: QuestStep) -> list[str]:
    """Hand over a step's items. One deleted since the send is skipped, not an error.

    Returns:
        The names of the items handed over.
    """
    names: list[str] = []
    campaign = CampaignRepo.get_by_id(db, quest.campaign_id)
    if campaign is None:
        return names
    for item_id in step.item_ids:
        item = ItemRepo.get_by_id(db, item_id)
        try:
            inventory_service.add_item(
                db,
                pc.id,
                CharacterItemCreate(item_id=item_id, quantity=1),
                campaign.dm_email,
                notice=f"Side quest reward: {item.name}." if item else None,
            )
        except ValueError:
            logger.warning("Side quest %s skipped missing reward item %s", quest.id, item_id)
            continue
        if item:
            names.append(item.name)
    return names


# ── What the phone may see ──────────────────────────────────────────────────


def _step_view(step: QuestStep, pc: PlayerCharacter) -> QuestStepView:
    """A step without its DC or links. The only way a step leaves the server to a player."""
    bonuses = compute_skill_bonuses(pc) if step.kind == "check" else {}
    return QuestStepView(
        id=step.id,
        kind=step.kind,
        text=step.text,
        image_url=step.image_url,
        options=[
            QuestOptionView(index=i, label=o.label)
            for i, o in enumerate(step.options)
            if step.kind == "choice"
        ],
        skills=(
            [QuestSkillView(name=s, bonus=bonuses.get(s, 0)) for s in step.skills]
            if step.kind == "check"
            else []
        ),
    )


def _outcome(entry: dict[str, Any]) -> QuestOutcome:
    """The last thing that happened, from its log entry."""
    return QuestOutcome(
        die=entry.get("die"),
        bonus=entry.get("bonus"),
        total=entry.get("total"),
        passed=entry.get("passed"),
        real=entry.get("real"),
        skill=entry.get("skill"),
        gp=entry.get("gp") or 0,
        items=entry.get("items") or [],
    )


def _history(run: SideQuestRun, by_id: dict[str, QuestStep]) -> list[QuestHistoryItem]:
    """The steps this character has already passed, and what they did on each."""
    items: list[QuestHistoryItem] = []
    for entry in run.log or []:
        step = by_id.get(entry.get("step_id", ""))
        if step is None or entry.get("kind") == "opened":
            continue
        items.append(
            QuestHistoryItem(
                step_id=step.id,
                kind=step.kind,
                text=step.text,
                image_url=step.image_url,
                option=entry.get("option"),
                skill=entry.get("skill"),
                total=entry.get("total"),
                passed=entry.get("passed"),
                replied=bool(entry.get("reply")),
            )
        )
    return items


def _view(db: Session, run: SideQuestRun, quest: SideQuest) -> QuestRunView:
    """A run as the phone gets it: the current step, what just happened, and the way here."""
    by_id = {s.id: s for s in _steps(quest)}
    step = by_id.get(run.step_id)
    if step is None:
        raise SideQuestNotFoundError("That side quest isn't here any more.")
    log = run.log or []
    return QuestRunView(
        run_id=run.id,
        title=quest.title,
        status=run.status,
        step=_step_view(step, _pc(db, run.character_id)),
        outcome=_outcome(log[-1]) if log else None,
        history=_history(run, by_id),
        recap=run.recap,
    )
