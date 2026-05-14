# Plan 00014 — Push-to-Talk NPC Voice

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [ ] Complete

**Started:** _not yet_
**Last updated:** 2026-05-14
**Implemented by:** _TBD_

---

## Purpose

Give the DM a hotkey-driven voice prompt: hold a key, speak a short directive ("the merchant scoffs at the offer"), release. The app transcribes, looks up the active NPC's profile + recent scene context, asks Claude Haiku for a one-or-two-line response in the NPC's voice, and streams it back into the session runner so the DM can deliver the line at the table.

This is **post-session-1 work.** Placeholder scaffold; real design happens after we have one session of feedback to know what voice moments the DM actually wanted.

---

## Progress

- [ ] Step 1: TBD — design after session 1 retrospective

---

## Surprises and Discoveries

None so far.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|

---

## Context and Orientation

### Files touched
_TBD. Initial guess:_
- `services/ai_service.py` — new `generate_npc_line(npc_id, prompt, recent_log)` method
- `integrations/claude_client.py` — streaming wrapper if not already present
- `integrations/voice/` (new) — Whisper API client OR local whisper.cpp adapter
- `api/routers/voice.py` (new) — `POST /api/voice/npc` multipart audio endpoint
- `frontend/src/components/PushToTalk.tsx` (new) — browser MediaRecorder + hotkey handler
- `pages/session_runner.py` — Streamlit fallback button if React isn't ready

### Architecture layers involved
`pages|api → services → integrations`. Voice transcription is an integration; NPC line generation is in `ai_service.py` (already exists).

### Key terms defined
- **Push-to-talk (PTT):** DM holds a key, audio is captured only while held. Released = stop and submit.
- **NPC profile block:** Existing record in `domain/character.py` (NPC type) plus any campaign-level voice/personality notes. Prompt-cached.
- **Recent scene context:** Last N session-notes entries + current encounter description, also cache-friendly.

---

## Concrete Steps

_TBD — design pass scheduled after session 1._

### Step 1: Retrospective from session 1
**Action:** Observe / log
**Details:** During session 1, write down every moment a voice prompt would have helped, plus what kind of output you actually needed (line of dialog? quick rules lookup? scene description?). Bring those notes back here.
**Verify:** A list of ≥5 concrete moments captured.

### Step 2: Pick the slimmest MVP that addresses those moments
**Action:** Decide
**Details:** Two design axes — (a) input: PTT vs always-listening with wake word; (b) ASR: Whisper API vs local whisper.cpp. Default recommendation: PTT + Whisper API.

### Step 3: Implementation
**Action:** TBD after Step 2.

---

## Validation and Acceptance

- [ ] Hotkey + speak + release produces a streamed NPC line within 2s of release
- [ ] Line reflects the NPC's existing profile (voice, personality, knowledge constraints)
- [ ] Cost per line ≤ $0.005
- [ ] Falls back gracefully if Whisper or Claude errors — DM is not left staring at a spinner
- [ ] Audio is NOT persisted unless the user opts in (privacy)

---

## Idempotence and Recovery

N/A until implementation begins.

---

## Interfaces and Dependencies

**Produces:** `POST /api/voice/npc` returning streamed text; a UI button/hotkey in the session runner.
**Depends on:** Whisper API key (or local whisper.cpp setup); existing `services/ai_service.py`; existing NPC `Character` records.

---

## Outcomes and Retrospective

_Fill in after completion._
