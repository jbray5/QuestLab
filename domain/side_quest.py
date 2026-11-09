"""Side quests (Plan 136): DM-written quests players finish on their phones between sessions.

A quest is a small graph of steps. Each character it's sent to gets their own private run, which
walks the graph one step at a time.

Security shape: ``steps`` holds the DCs, the links and every later step, so it is DM-only. The
phone only ever gets a ``QuestRunView``, built by the service: the current step, with its links
and DC removed. Players open dev tools, so a secret must not be in the payload.

Every word is the DM's. Text is plain: the phone renders line breaks, never HTML.

A draft may be unfinished. ``quest_problems`` lists what has to be fixed before it can be sent.
The graph has no cycles, so a step is reached at most once per run. That is what makes each step's
reward safe to pay on arrival.
"""

import re
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, Literal, Optional

from pydantic import BaseModel
from pydantic import Field as PField
from pydantic import StringConstraints, field_validator, model_validator
from sqlalchemy import Column, Text, UniqueConstraint
from sqlalchemy.types import JSON, DateTime
from sqlmodel import Field, SQLModel

from domain.homebrew import SKILLS

MAX_STEPS = 40
MAX_OPTIONS = 4
MAX_CHECK_SKILLS = 3
MAX_STEP_ITEMS = 5
MAX_TEXT = 4000
MAX_REPLY = 2000
MAX_RECAP = 1500
MAX_GP_GAIN = 10000
MAX_GP_COST = 1000
MAX_TEXT_FOR = 12
# Plan 141: a step's damage. Dice ("1d4", "2d6+1") or a flat number ("3").
DAMAGE_RE = re.compile(r"^(?:(\d{1,2})d(4|6|8|10|12|20)([+-]\d{1,2})?|(\d{1,2}))$")

StepKind = Literal["read", "choice", "check", "reply", "end"]
StepId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
QuestTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
OptionLabel = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
RunStatus = Literal["new", "active", "done"]


class SideQuestNotFoundError(LookupError):
    """No side quest or run with that id (an HTTP 404)."""


class SideQuestConflictError(ValueError):
    """A side quest change that can't happen (an HTTP 409). The message is shown to the DM."""


def _now() -> datetime:
    """Now, in UTC (SQLModel refuses naive datetimes for timezone-aware columns)."""
    return datetime.now(timezone.utc)


def _ts_column(nullable: bool = False) -> Column:
    """A timezone-aware timestamp column (one fresh Column per table field)."""
    return Column(DateTime(timezone=True), nullable=nullable)


def _check_image_url(value: Optional[str]) -> Optional[str]:
    """Empty, an https link, or one of the app's own ``/uploads/`` paths."""
    url = (value or "").strip()
    if not url:
        return None
    if not url.startswith(("https://", "/uploads/")):
        raise ValueError("A picture has to be an upload or an https:// link.")
    if len(url) > 500:
        raise ValueError("That picture's link is too long (500 characters at most).")
    return url


# ── Steps ───────────────────────────────────────────────────────────────────


class QuestOption(BaseModel):
    """One button on a choice step, and the step it leads to."""

    label: OptionLabel
    next: Optional[StepId] = None


class QuestStep(BaseModel):
    """One step of a quest. Which fields matter depends on ``kind``.

    - ``read``: story text, then ``next``.
    - ``choice``: story text, then one of ``options``.
    - ``check``: the player picks one of ``skills`` and rolls against ``dc``, then ``pass_next``
      or ``fail_next``.
    - ``reply``: the player writes an answer for the DM, then ``next``.
    - ``end``: the quest is finished. No links.

    Any step can pay ``gp`` (negative is a cost) and ``item_ids`` when it's reached.

    ``party_sees`` (Plan 140, choice steps only): everyone on the quest sees the others' names on
    the options they picked here. A display setting, so it can change after the quest is sent.

    Plan 141: ``damage`` hurts on arrival (dice or a flat number, temp HP first, never below 1 HP).
    ``text_for`` gives some characters their own words in place of ``text``; each phone only ever
    gets its own character's. Words, so they can change after sending.
    """

    id: StepId
    kind: StepKind
    text: str = PField(default="", max_length=MAX_TEXT)
    image_url: Optional[str] = None
    next: Optional[StepId] = None
    options: list[QuestOption] = PField(default_factory=list, max_length=MAX_OPTIONS)
    skills: list[str] = PField(default_factory=list, max_length=MAX_CHECK_SKILLS)
    dc: Optional[int] = PField(default=None, ge=1, le=30)
    pass_next: Optional[StepId] = None
    fail_next: Optional[StepId] = None
    gp: int = PField(default=0, ge=-MAX_GP_COST, le=MAX_GP_GAIN)
    item_ids: list[uuid.UUID] = PField(default_factory=list, max_length=MAX_STEP_ITEMS)
    party_sees: bool = False
    damage: Optional[str] = None
    text_for: dict[uuid.UUID, str] = PField(default_factory=dict)

    @field_validator("damage", mode="before")
    @classmethod
    def _damage(cls, value: Any) -> Optional[str]:
        """Empty, dice like "1d4" or "2d6+1", or a flat number up to 99."""
        if value is None:
            return None
        text = str(value).replace(" ", "").lower()
        if not text or text == "0":
            return None
        if not DAMAGE_RE.match(text):
            raise ValueError('Damage is dice like "1d4" or "2d6+1", or a number.')
        return text

    @field_validator("text_for")
    @classmethod
    def _text_for(cls, value: dict[uuid.UUID, str]) -> dict[uuid.UUID, str]:
        """Trimmed; empty ones dropped; each within the step's text limit."""
        out = {k: v.strip() for k, v in value.items() if v and v.strip()}
        if len(out) > MAX_TEXT_FOR:
            raise ValueError(
                f"A step can have its own words for {MAX_TEXT_FOR} characters at most."
            )
        if any(len(v) > MAX_TEXT for v in out.values()):
            raise ValueError(f"A character's words can be {MAX_TEXT} characters at most.")
        return out

    @field_validator("image_url")
    @classmethod
    def _image(cls, value: Optional[str]) -> Optional[str]:
        """Empty, an https link, or an upload."""
        return _check_image_url(value)

    @field_validator("skills")
    @classmethod
    def _skills(cls, value: list[str]) -> list[str]:
        """Canonical skill names, each once."""
        by_key = {s.casefold(): s for s in SKILLS}
        out: list[str] = []
        for raw in value:
            skill = by_key.get(str(raw).strip().casefold())
            if skill is None:
                raise ValueError(f"{raw!r} isn't a skill. Pick from the 18 on a character sheet.")
            if skill not in out:
                out.append(skill)
        return out

    def links(self) -> list[str]:
        """The step ids this step can lead to, without gaps or repeats."""
        if self.kind in ("read", "reply"):
            found = [self.next]
        elif self.kind == "choice":
            found = [o.next for o in self.options]
        elif self.kind == "check":
            found = [self.pass_next, self.fail_next]
        else:
            found = []
        return list(dict.fromkeys(s for s in found if s))


def _label(index: int) -> str:
    """How the DM's form names a step: "Step 3"."""
    return f"Step {index + 1}"


def _step_problems(step: QuestStep, label: str, known: set[str]) -> list[str]:
    """What's wrong with one step on its own, in plain words."""
    problems: list[str] = []
    if step.kind != "end" and not step.text.strip() and step.kind != "check":
        problems.append(f"{label} has no text yet.")
    if step.kind in ("read", "reply") and not step.next:
        problems.append(f"{label} doesn't say what comes next.")
    if step.kind == "choice":
        if len(step.options) < 2:
            problems.append(f"{label} is a choice, so it needs at least two options.")
        if any(not o.next for o in step.options):
            problems.append(f"{label} has an option that doesn't lead anywhere.")
    if step.kind == "check":
        if not step.skills:
            problems.append(f"{label} is a check, so it needs at least one skill.")
        if step.dc is None:
            problems.append(f"{label} is a check, so it needs a DC.")
        if not step.pass_next or not step.fail_next:
            problems.append(f"{label} has to say where a pass and a fail go.")
    if step.kind == "end" and not step.text.strip() and not step.gp and not step.item_ids:
        problems.append(f"{label} is an ending with no text or reward.")
    for link in step.links():
        if link not in known:
            problems.append(f"{label} points at a step that doesn't exist.")
    return problems


def _has_cycle(by_id: dict[str, QuestStep], start: str) -> bool:
    """True if the walk from ``start`` can come back to a step it's already on."""
    done: set[str] = set()
    on_path: set[str] = set()

    def visit(step_id: str) -> bool:
        """Depth-first search; a link back to the current path is a cycle."""
        if step_id in on_path:
            return True
        if step_id in done or step_id not in by_id:
            return False
        on_path.add(step_id)
        cycle = any(visit(link) for link in by_id[step_id].links())
        on_path.discard(step_id)
        done.add(step_id)
        return cycle

    return visit(start)


def _reachable(by_id: dict[str, QuestStep], start: str) -> set[str]:
    """Every step a run can get to from ``start``."""
    seen: set[str] = set()
    stack = [start]
    while stack:
        step_id = stack.pop()
        if step_id in seen or step_id not in by_id:
            continue
        seen.add(step_id)
        stack.extend(by_id[step_id].links())
    return seen


def quest_problems(steps: list[QuestStep], start_step: Optional[str]) -> list[str]:
    """What has to be fixed before a quest can be sent, in plain words (empty when it's ready).

    Args:
        steps: The quest's steps, in the order the DM's form shows them.
        start_step: The id of the first step.

    Returns:
        One sentence per problem.
    """
    if not steps:
        return ["A quest needs at least one step."]
    by_id = {s.id: s for s in steps}
    problems: list[str] = []
    if len(by_id) != len(steps):
        problems.append("Two steps have the same id.")
    if not start_step or start_step not in by_id:
        problems.append("The quest doesn't say which step comes first.")
        return problems
    for index, step in enumerate(steps):
        problems.extend(_step_problems(step, _label(index), set(by_id)))
    if _has_cycle(by_id, start_step):
        problems.append("A path loops back to an earlier step. Every path has to move forward.")
    reached = _reachable(by_id, start_step)
    for index, step in enumerate(steps):
        if step.id not in reached:
            problems.append(f"{_label(index)} can't be reached from the start.")
    if not any(s.kind == "end" for s in steps if s.id in reached):
        problems.append("The quest needs an ending.")
    return problems


def structure_of(steps: list[QuestStep], start_step: Optional[str]) -> list[Any]:
    """Everything about a quest except its words and pictures, for comparing two versions.

    Once a quest is sent only words and pictures may change. Option labels count as words.

    Args:
        steps: The steps.
        start_step: The first step's id.

    Returns:
        A comparable list.
    """
    shape: list[Any] = [start_step]
    for s in steps:
        shape.append(
            (
                s.id,
                s.kind,
                s.next,
                [o.next for o in s.options],
                list(s.skills),
                s.dc,
                s.pass_next,
                s.fail_next,
                s.gp,
                [str(i) for i in s.item_ids],
                s.damage,
            )
        )
    return shape


# ── Tables ──────────────────────────────────────────────────────────────────


class SideQuest(SQLModel, table=True):
    """A quest a DM wrote for their campaign."""

    __tablename__ = "side_quests"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    campaign_id: uuid.UUID = Field(foreign_key="campaigns.id", index=True)
    title: str = Field(min_length=1, max_length=120)
    teaser: str = Field(default="", max_length=200)
    steps: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    start_step: Optional[str] = Field(default=None, max_length=40)
    status: str = Field(default="draft", max_length=10)
    created_at: datetime = Field(default_factory=_now, sa_column=_ts_column())
    updated_at: datetime = Field(default_factory=_now, sa_column=_ts_column())
    sent_at: Optional[datetime] = Field(default=None, sa_column=_ts_column(nullable=True))


class SideQuestRun(SQLModel, table=True):
    """One character's private run through a quest."""

    __tablename__ = "side_quest_runs"
    __table_args__ = (
        UniqueConstraint("quest_id", "character_id", name="uq_side_quest_runs_quest_character"),
        {"extend_existing": True},
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    quest_id: uuid.UUID = Field(foreign_key="side_quests.id", index=True)
    character_id: uuid.UUID = Field(foreign_key="player_characters.id", index=True)
    step_id: str = Field(max_length=40)
    status: str = Field(default="new", max_length=10)
    log: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=_now, sa_column=_ts_column())
    opened_at: Optional[datetime] = Field(default=None, sa_column=_ts_column(nullable=True))
    finished_at: Optional[datetime] = Field(default=None, sa_column=_ts_column(nullable=True))
    # Plan 138: what the player chose to tell the party. Their own words, and they may not be true.
    recap: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    recap_at: Optional[datetime] = Field(default=None, sa_column=_ts_column(nullable=True))


# ── The DM's shapes ─────────────────────────────────────────────────────────


class _QuestChecks(BaseModel):
    """The quest form's checks, shared by the create and the partial update."""

    @field_validator("teaser", check_fields=False)
    @classmethod
    def _trim(cls, value: Optional[str]) -> Optional[str]:
        """Trim the teaser."""
        return None if value is None else value.strip()

    @field_validator("steps", check_fields=False)
    @classmethod
    def _unique_ids(cls, value: Optional[list[QuestStep]]) -> Optional[list[QuestStep]]:
        """Step ids are unique within a quest."""
        ids = [s.id for s in value or []]
        if len(ids) != len(set(ids)):
            raise ValueError("Two steps have the same id.")
        return value


class SideQuestCreate(_QuestChecks):
    """A new side quest, as the DM's form sends it. It may be unfinished."""

    title: QuestTitle
    teaser: str = PField(default="", max_length=200)
    steps: list[QuestStep] = PField(default_factory=list, max_length=MAX_STEPS)
    start_step: Optional[StepId] = None


class SideQuestUpdate(_QuestChecks):
    """A partial change to a side quest. Once it's sent, only words and pictures may change."""

    title: Optional[QuestTitle] = None
    teaser: Optional[str] = PField(default=None, max_length=200)
    steps: Optional[list[QuestStep]] = PField(default=None, max_length=MAX_STEPS)
    start_step: Optional[StepId] = None

    @field_validator("title", "teaser", "steps", mode="before")
    @classmethod
    def _not_null(cls, value: Any) -> Any:
        """Refuse an explicit null for a field every quest has."""
        if value is None:
            raise ValueError("can't be empty")
        return value


class QuestRunSummary(BaseModel):
    """Where one character is in a quest, for the DM's list."""

    run_id: uuid.UUID
    character_id: uuid.UUID
    character_name: str
    status: RunStatus
    opened_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class SideQuestRead(BaseModel):
    """A side quest as the DM sees it, DCs and links included."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    title: str
    teaser: str = ""
    steps: list[QuestStep] = PField(default_factory=list)
    start_step: Optional[str] = None
    status: str = "draft"
    created_at: datetime
    updated_at: datetime
    sent_at: Optional[datetime] = None
    # What has to be fixed before it can be sent (empty when it's ready).
    problems: list[str] = PField(default_factory=list)
    runs: list[QuestRunSummary] = PField(default_factory=list)


class QuestLogEntry(BaseModel):
    """One thing a player did or got in a run. Only the DM sees the whole log."""

    step_id: str
    kind: str
    at: datetime
    option: Optional[str] = None
    skill: Optional[str] = None
    die: Optional[int] = None
    bonus: Optional[int] = None
    total: Optional[int] = None
    passed: Optional[bool] = None
    real: Optional[bool] = None
    reply: Optional[str] = None
    # Plan 140: which button, and whether the party could see it when it was picked.
    option_index: Optional[int] = None
    party: Optional[bool] = None
    # What arriving at the next step paid: a cost is negative, and can be part of a gold piece
    # when it empties a purse.
    gp: Optional[float] = None
    items: list[str] = PField(default_factory=list)
    # Plan 141: HP it actually took (temp HP included), after the floor at 1 HP.
    damage: Optional[int] = None


class QuestRunDetail(QuestRunSummary):
    """A character's whole run, for the DM's results."""

    step_id: str
    log: list[QuestLogEntry] = PField(default_factory=list)
    recap: Optional[str] = None
    recap_at: Optional[datetime] = None


class QuestPing(BaseModel):
    """An optional Discord post through the Town Crier when a quest goes out.

    It goes to a shared channel, so the DM's form keeps it generic: a private quest's title
    would give it away.
    """

    channel_id: uuid.UUID
    npc_id: uuid.UUID
    content: str = PField(min_length=1, max_length=2000)


class SideQuestSend(BaseModel):
    """Who gets a quest. Characters who already have a run are skipped."""

    character_ids: list[uuid.UUID] = PField(min_length=1, max_length=50)
    ping: Optional[QuestPing] = None


class SideQuestSendResult(BaseModel):
    """What a send did. A Discord failure doesn't undo it; ``ping_error`` says what went wrong."""

    quest: SideQuestRead
    new_runs: int
    ping_error: Optional[str] = None


# ── The phone's shapes: no DCs, no links, no later steps ────────────────────


class QuestOptionView(BaseModel):
    """A choice button. ``index`` is what the phone sends back; the link stays on the server.

    ``taken_by`` (Plan 140) names the other characters who picked it, on a step whose DM turned on
    ``party_sees``. Only picks made while that was on count, so a player was told first.
    """

    index: int
    label: str
    taken_by: list[str] = PField(default_factory=list)


class QuestSkillView(BaseModel):
    """A skill a check accepts, with this character's real bonus."""

    name: str
    bonus: int


class QuestStepView(BaseModel):
    """The current step, as the phone gets it."""

    id: str
    kind: StepKind
    text: str = ""
    image_url: Optional[str] = None
    options: list[QuestOptionView] = PField(default_factory=list)
    skills: list[QuestSkillView] = PField(default_factory=list)
    # Plan 140: true on a choice the party will see this player's pick on.
    party_sees_pick: bool = False


class QuestOutcome(BaseModel):
    """What just happened: the roll, and what arriving at this step paid."""

    die: Optional[int] = None
    bonus: Optional[int] = None
    total: Optional[int] = None
    passed: Optional[bool] = None
    real: Optional[bool] = None
    skill: Optional[str] = None
    gp: float = 0
    items: list[str] = PField(default_factory=list)
    damage: int = 0


class QuestHistoryItem(BaseModel):
    """A step this character has already passed, and what they did on it.

    A reply's words stay out (Plan 139): they're for the DM, and this goes to whoever holds the
    link. The phone that wrote them keeps its own copy.
    """

    step_id: str
    kind: StepKind
    text: str = ""
    image_url: Optional[str] = None
    option: Optional[str] = None
    skill: Optional[str] = None
    total: Optional[int] = None
    passed: Optional[bool] = None
    replied: bool = False


class QuestRunView(BaseModel):
    """A run as the phone gets it: never a DC, a link, or a step they haven't reached."""

    run_id: uuid.UUID
    title: str
    status: RunStatus
    step: QuestStepView
    outcome: Optional[QuestOutcome] = None
    history: list[QuestHistoryItem] = PField(default_factory=list)
    recap: Optional[str] = None


class QuestRecapShare(BaseModel):
    """What a player tells the party about a finished quest. Empty takes it back."""

    text: str = PField(default="", max_length=MAX_RECAP)

    @field_validator("text")
    @classmethod
    def _trim(cls, value: str) -> str:
        """Trim it."""
        return value.strip()


class PartyRecap(BaseModel):
    """A recap as the party gets it: who and their words.

    Never the quest's title, an id, or what really happened: a private quest stays private unless
    its player says otherwise, and they get to tell it their way.
    """

    character_name: str
    text: str
    at: datetime
    mine: bool = False


class QuestCard(BaseModel):
    """A quest on the phone's Now card or Journal list."""

    run_id: uuid.UUID
    title: str
    teaser: str = ""
    status: RunStatus
    sent_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class QuestAdvance(BaseModel):
    """A player's move. ``step_id`` guards a double tap: a stale one changes nothing."""

    step_id: StepId
    option: Optional[int] = PField(default=None, ge=0, le=MAX_OPTIONS)
    skill: Optional[str] = None
    real: Optional[int] = PField(default=None, ge=1, le=20)
    reply: Optional[str] = PField(default=None, max_length=MAX_REPLY)

    @model_validator(mode="after")
    def _trim_reply(self) -> "QuestAdvance":
        """Trim the reply."""
        if self.reply is not None:
            self.reply = self.reply.strip()
        return self
