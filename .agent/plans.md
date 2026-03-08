ExecPlan Specification
Read this before writing any plan. Every plan in plans/ must follow this format.

When to Write a Plan
Write a plan before starting any task that: - Spans more than one architectural layer, OR - Requires a migration or schema change, OR - Is estimated to take more than ~20 minutes

For small single-layer changes (fix a label, add a missing validator), no plan needed.

Plan Naming
plans/NNNNN-short-description.md - NNNNN = zero-padded sequence number: 00001, 00002, ... - short-description = kebab-case, max 5 words - Example: plans/00001-initial-scaffold.md

Non-Negotiable Requirements
Self-contained. Embed all needed knowledge in the plan. Do not link to external docs. If context is needed, write it in plain language inside the plan.

Living document. Update Progress, Surprises, and Decision Log every time you stop. A plan with no updates after work begins is not being followed.

Novice-enabling. A junior engineer who has never seen this codebase can complete the plan. Every file path is explicit. Every term is defined.

Outcome-focused. The Validation section describes observable, runnable proof of completion — not "code was written."

Idempotent. If you stop and restart with only this plan and the codebase, you know exactly where to resume. The Progress checkboxes are the restart guide.

6. Concision. In all plans, interactions, and commit messages, be extremely concise and sacrifice grammar for the sake of concision.
Required Skeleton (copy this for every new plan)
# Plan NNNNN — [Short Title]

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [ ] Complete

**Started:** _timestamp_
**Last updated:** _timestamp_
**Implemented by:** _agent or engineer_

---

## Purpose
_Why does this work exist? What will be different when it is done? 3–5 sentences.
A new team member should understand the goal without asking anyone._

---

## Progress
_Update every time you stop. Check items as you complete them. Add timestamps._
- [ ] Step 1: ...
- [ ] Step 2: ...

---

## Surprises and Discoveries
_Anything unexpected. Update as you go. Write "None so far" if nothing yet — do not leave blank._

---

## Decision Log
_Every non-trivial choice: what options existed, what was chosen, why._

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|

---

## Context and Orientation

### Files touched
_Full paths from repo root for every file created or modified._

### Architecture layers involved
_Which layers? Which boundary rules apply?_

### Key terms defined
_Any domain term used in this plan, in plain language._

---

## Concrete Steps

_Each step is independently verifiable. Specify: file path, action (create/modify/delete),
exact content or change, and how to verify it succeeded._

### Step 1: [Action]
**File:** `path/to/file`
**Action:** Create / Modify / Delete
**Details:** _what goes in the file or what changes_
**Verify:** _how you know this step worked_

---

## Validation and Acceptance
_Observable proof that this work is complete. Things you can run, query, or click._

- [ ] `pytest -q` passes
- [ ] [Specific behavior]: _how to verify_

---

## Idempotence and Recovery
_How to resume after an unexpected stop. Which steps are safe to re-run?_

---

## Interfaces and Dependencies
**Produces:** _what this work exposes for other parts of the system_
**Depends on:** _what must already exist_

---

## Outcomes and Retrospective
_Fill in after completion. What was harder than expected? What to do differently next time?_
Mandatory Living Sections
Update these every time you stop working: 1. Status — change the checkbox 2. Progress — check completed items, add timestamps 3. Surprises and Discoveries — even if "none so far" 4. Decision Log — even if no decisions were made this session

What Not to Do in a Plan
Do not say "see ARCHITECTURE.md" — embed the relevant piece directly
Do not use vague verbs like "update" or "fix" — specify exactly what changes
Do not combine multiple independent features in one plan
Do not leave Decision Log empty — if no decisions, say so explicitly
Do not omit file paths — always use full paths from repo root