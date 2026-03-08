"""Session Runner page — live session management, initiative tracker, and runbook display.

Receives session_id via URL query param: ?session_id=<uuid>
UI only. Business logic in services.session_service and services.ai_service.

Layout:
  Top bar  : session title, status badge, status-advance button, notes button
  Left pane: Initiative tracker + HP tracker + encounter controls
  Right pane: Runbook (scene nav, NPC dialog, encounter flows) + stat block reference
"""

import uuid

import streamlit as st
from dotenv import load_dotenv

from db.base import get_session
from db.repos.character_repo import CharacterRepo
from db.repos.encounter_repo import EncounterRepo
from db.repos.monster_repo import MonsterRepo
from domain.enums import SessionStatus
from integrations.identity import get_current_user_email
from services import ai_service, session_service

load_dotenv()


# ── Helper — defined early so module-level code can call it ────────────────────


def _get_campaign_id(db, adventure_id: uuid.UUID) -> uuid.UUID:
    """Return the campaign_id for a given adventure.

    Args:
        db: Active database session.
        adventure_id: UUID of the adventure.

    Returns:
        UUID of the parent campaign.
    """
    from db.repos.adventure_repo import AdventureRepo  # noqa: PLC0415

    adv = AdventureRepo.get_by_id(db, adventure_id)
    return adv.campaign_id if adv else uuid.uuid4()


st.set_page_config(page_title="Session Runner · QuestLab", page_icon="🎲", layout="wide")

# ── Auth ───────────────────────────────────────────────────────────────────────
try:
    dm_email = get_current_user_email()
except PermissionError as exc:
    st.error(str(exc))
    st.stop()

# ── Session context ────────────────────────────────────────────────────────────
session_id_str = st.query_params.get("session_id") or st.session_state.get("nav_session_id")
if not session_id_str:
    st.error("No session selected. Please go back to Sessions and choose one.")
    if st.button("← Back to Sessions"):
        st.switch_page("pages/sessions.py")
    st.stop()

try:
    session_id = uuid.UUID(session_id_str)
except ValueError:
    st.error("Invalid session ID in URL.")
    st.stop()

try:
    with next(get_session()) as db:
        game_session = session_service.get_session(db, session_id, dm_email)
except (ValueError, PermissionError) as exc:
    st.error(str(exc))
    st.stop()

# ── State keys scoped to this session (reset when session changes) ─────────────
_SCOPE = str(session_id)
_INIT_KEY = f"initiative_{_SCOPE}"
_TURN_KEY = f"current_turn_{_SCOPE}"
_ROUND_KEY = f"round_{_SCOPE}"
_SCENE_KEY = f"scene_idx_{_SCOPE}"

for _k, _default in [(_TURN_KEY, 0), (_ROUND_KEY, 1), (_SCENE_KEY, 0)]:
    if _k not in st.session_state:
        st.session_state[_k] = _default
if _INIT_KEY not in st.session_state:
    st.session_state[_INIT_KEY] = []  # list of combatant dicts

# ── Load runbook + encounter data ──────────────────────────────────────────────
with next(get_session()) as db:
    runbook = session_service.get_runbook(db, session_id, dm_email)

# ── Status helpers ─────────────────────────────────────────────────────────────
_STATUS_COLOR = {
    SessionStatus.DRAFT: "#6a6a7a",
    SessionStatus.READY: "#4a7a9a",
    SessionStatus.IN_PROGRESS: "#4a9a4a",
    SessionStatus.COMPLETE: "#9a4a4a",
}
_STATUS_LABEL = {
    SessionStatus.DRAFT: "📋 Draft",
    SessionStatus.READY: "✅ Ready",
    SessionStatus.IN_PROGRESS: "⚔️ In Progress",
    SessionStatus.COMPLETE: "🏆 Complete",
}
_ADVANCE_LABEL = {
    SessionStatus.DRAFT: "Mark Ready →",
    SessionStatus.READY: "Start Session →",
    SessionStatus.IN_PROGRESS: "Complete Session →",
}

# ── Top bar ────────────────────────────────────────────────────────────────────
col_back, col_title, col_status, col_advance = st.columns([1, 4, 1, 2])
with col_back:
    adventure_id_str = st.session_state.get("nav_adventure_id", "")
    if st.button("← Sessions"):
        if adventure_id_str:
            st.query_params["adventure_id"] = adventure_id_str
        st.switch_page("pages/sessions.py")

with col_title:
    st.markdown(
        f"<h2 style='font-family:\"Cinzel Decorative\",serif; color:#C9A84C; margin:0;'>"
        f"🎲 Session {game_session.session_number}: {game_session.title}</h2>",
        unsafe_allow_html=True,
    )

with col_status:
    color = _STATUS_COLOR[game_session.status]
    label = _STATUS_LABEL[game_session.status]
    st.markdown(
        f"<div style='background:{color}; border-radius:6px; padding:0.4rem 0.8rem; "
        f"color:#ffffff; font-size:0.85rem; text-align:center; margin-top:0.4rem;'>"
        f"{label}</div>",
        unsafe_allow_html=True,
    )

with col_advance:
    advance_label = _ADVANCE_LABEL.get(game_session.status)
    if advance_label:
        if st.button(advance_label, type="primary", use_container_width=True):
            try:
                with next(get_session()) as db:
                    game_session = session_service.advance_status(db, session_id, dm_email)
                st.rerun()
            except (ValueError, PermissionError) as e:
                st.error(str(e))

st.divider()

# ── Main layout: left (tracker) + right (runbook) ─────────────────────────────
col_left, col_right = st.columns([2, 3])

# ═══════════════════════════════════════════════════════════════════════════════
# LEFT PANE — Initiative Tracker
# ═══════════════════════════════════════════════════════════════════════════════
with col_left:
    st.markdown("### ⚔️ Initiative Tracker")

    tracker = st.session_state[_INIT_KEY]

    # Build combatant list from PCs + encounter monsters
    if not tracker:
        with st.expander("🎲 Roll Initiative", expanded=True):
            st.caption("Load combatants from this session's PCs and adventure encounters.")

            with next(get_session()) as db:
                # Attending PCs
                pc_ids = [uuid.UUID(str(pid)) for pid in (game_session.attending_pc_ids or [])]
                all_pcs = CharacterRepo.list_by_campaign(
                    db,
                    # We need the campaign_id — get it via adventure
                    # Load via the adventure's campaign
                    _get_campaign_id(db, game_session.adventure_id),
                )
                attending_pcs = [pc for pc in all_pcs if pc.id in pc_ids] if pc_ids else all_pcs[:4]

                # Encounters for this adventure
                encounters = EncounterRepo.list_by_adventure(db, game_session.adventure_id)

            combatants_to_roll = []
            for pc in attending_pcs:
                combatants_to_roll.append(
                    {
                        "name": pc.character_name,
                        "dex_score": pc.score_dex,
                        "hp": pc.hp_current,
                        "max_hp": pc.hp_max,
                        "type": "pc",
                    }
                )

            # Add monsters from encounters
            monster_ids_seen = set()
            for enc in encounters:
                for entry in enc.monster_roster or []:
                    mid = uuid.UUID(str(entry.get("monster_id", "")))
                    count = int(entry.get("count", 1))
                    if mid in monster_ids_seen:
                        continue
                    monster_ids_seen.add(mid)
                    with next(get_session()) as db:
                        monster = MonsterRepo.get_by_id(db, mid)
                    if monster:
                        for i in range(count):
                            suffix = f" #{i + 1}" if count > 1 else ""
                            combatants_to_roll.append(
                                {
                                    "name": f"{monster.name}{suffix}",
                                    "dex_score": monster.score_dex,
                                    "hp": monster.hp_average,
                                    "max_hp": monster.hp_average,
                                    "type": "monster",
                                }
                            )

            # Allow manual additions
            st.markdown(f"**{len(combatants_to_roll)} combatants loaded** from session data.")
            extra_name = st.text_input("Add extra combatant name (optional)", key="extra_name")
            extra_dex = st.number_input(
                "DEX score", min_value=1, max_value=30, value=10, key="extra_dex"
            )
            extra_hp = st.number_input(
                "Max HP", min_value=1, max_value=500, value=20, key="extra_hp"
            )
            if st.button("Add Combatant") and extra_name.strip():
                combatants_to_roll.append(
                    {
                        "name": extra_name.strip(),
                        "dex_score": int(extra_dex),
                        "hp": int(extra_hp),
                        "max_hp": int(extra_hp),
                        "type": "monster",
                    }
                )

            if st.button("🎲 Roll Initiative!", type="primary", use_container_width=True):
                rolled = session_service.roll_initiative(combatants_to_roll)
                if rolled:
                    rolled[0]["active"] = True
                st.session_state[_INIT_KEY] = rolled
                st.session_state[_TURN_KEY] = 0
                st.session_state[_ROUND_KEY] = 1
                st.rerun()

    else:
        # Round counter + controls
        round_num = st.session_state[_ROUND_KEY]
        cur_turn = st.session_state[_TURN_KEY]

        ctrl_col1, ctrl_col2, ctrl_col3 = st.columns([2, 2, 2])
        with ctrl_col1:
            st.markdown(
                f"<div style='background:#2a1a0a; border:2px solid #C9A84C; border-radius:6px; "
                f"padding:0.4rem; text-align:center; color:#C9A84C; font-size:1.1rem;'>"
                f"Round {round_num}</div>",
                unsafe_allow_html=True,
            )
        with ctrl_col2:
            if st.button("⏭ Next Turn", use_container_width=True, type="primary"):
                alive = [i for i, c in enumerate(tracker) if not c["defeated"]]
                if alive:
                    cur_pos = alive.index(cur_turn) if cur_turn in alive else -1
                    next_pos = (cur_pos + 1) % len(alive)
                    tracker[cur_turn]["active"] = False
                    next_idx = alive[next_pos]
                    tracker[next_idx]["active"] = True
                    st.session_state[_TURN_KEY] = next_idx
                    if next_pos == 0:
                        st.session_state[_ROUND_KEY] += 1
                st.rerun()
        with ctrl_col3:
            if st.button("🔄 Re-roll", use_container_width=True):
                st.session_state[_INIT_KEY] = []
                st.session_state[_TURN_KEY] = 0
                st.session_state[_ROUND_KEY] = 1
                st.rerun()

        st.markdown("")

        # Combatant rows
        for idx, combatant in enumerate(tracker):
            is_active = combatant.get("active", False)
            is_defeated = combatant.get("defeated", False)
            is_pc = combatant.get("type") == "pc"

            bg = "#1e2e1e" if is_active else ("#1a1a1a" if not is_defeated else "#2a1a1a")
            border = "#00ff88" if is_active else ("#444" if not is_defeated else "#8a2222")
            name_color = "#00ff88" if is_active else ("#e0d0b0" if not is_defeated else "#7a5a5a")
            icon = "🟢" if is_active else ("💀" if is_defeated else ("👤" if is_pc else "👹"))
            init_val = combatant.get("initiative", 0)
            hp = combatant.get("hp", 0)
            max_hp = combatant.get("max_hp", 1)

            with st.container():
                row_l, row_r = st.columns([3, 2])
                with row_l:
                    st.markdown(
                        f"<div style='background:{bg}; border:1px solid {border}; "
                        f"border-radius:6px; padding:0.4rem 0.7rem; margin-bottom:0.3rem;'>"
                        f"<span style='font-size:1rem;'>{icon}</span> "
                        f"<span style='color:{name_color}; font-weight:600;'>"
                        f"{combatant['name']}</span>"
                        f"<br><span style='color:#8B9DC3; font-size:0.78rem;'>"
                        f"Initiative: {init_val} &nbsp;·&nbsp; "
                        f"HP: {hp}/{max_hp}</span>"
                        f"</div>",
                        unsafe_allow_html=True,
                    )
                with row_r:
                    if not is_defeated:
                        dmg = st.number_input(
                            "DMG",
                            min_value=0,
                            max_value=9999,
                            value=0,
                            key=f"dmg_{idx}_{_SCOPE}",
                            label_visibility="collapsed",
                        )
                        heal = st.number_input(
                            "Heal",
                            min_value=0,
                            max_value=9999,
                            value=0,
                            key=f"heal_{idx}_{_SCOPE}",
                            label_visibility="collapsed",
                        )
                        if st.button(
                            "Apply", key=f"apply_{idx}_{_SCOPE}", use_container_width=True
                        ):
                            new_hp = max(0, hp - dmg + heal)
                            tracker[idx]["hp"] = new_hp
                            tracker[idx]["defeated"] = new_hp <= 0
                            if new_hp <= 0 and tracker[idx].get("active"):
                                tracker[idx]["active"] = False
                            st.rerun()
                    else:
                        if st.button(
                            "Revive", key=f"revive_{idx}_{_SCOPE}", use_container_width=True
                        ):
                            tracker[idx]["hp"] = 1
                            tracker[idx]["defeated"] = False
                            st.rerun()

        st.divider()

        # Session notes
        with st.expander("📝 Session Notes"):
            notes_val = game_session.actual_notes or ""
            new_notes = st.text_area("DM Notes", value=notes_val, height=120, key="session_notes")
            if st.button("Save Notes"):
                try:
                    with next(get_session()) as db:
                        session_service.update_notes(db, session_id, dm_email, new_notes)
                    st.success("Notes saved.")
                except (ValueError, PermissionError) as e:
                    st.error(str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# RIGHT PANE — Runbook display + AI generation
# ═══════════════════════════════════════════════════════════════════════════════
with col_right:

    # ── Runbook generation ──────────────────────────────────────────────────
    st.markdown("### 📜 Session Runbook")

    gen_col, notes_col = st.columns([1, 2])
    with gen_col:
        generate_clicked = st.button(
            "✨ Generate Runbook", type="primary", use_container_width=True
        )
    with notes_col:
        extra_notes = st.text_input(
            "Extra context for Claude (optional)",
            placeholder="Last-minute plot points…",
            key="runbook_extra_notes",
        )

    if generate_clicked:
        try:
            with st.spinner("Claude is crafting your runbook…"):
                with next(get_session()) as db:
                    runbook_create = ai_service.generate_session_runbook(
                        db,
                        session_id=session_id,
                        dm_email=dm_email,
                        extra_notes=extra_notes or None,
                    )
                with next(get_session()) as db:
                    session_service.save_runbook(db, session_id, dm_email, runbook_create)
            st.success("Runbook generated and saved!")
            st.rerun()
        except PermissionError as exc:
            st.error(f"API key error: {exc}")
        except (ValueError, Exception) as exc:
            st.error(f"Generation failed: {exc}")

    if runbook is None:
        st.info("No runbook yet. Click **✨ Generate Runbook** to create one.")
    else:
        # Metadata
        ts = runbook.generated_at
        st.caption(
            f"Generated by {runbook.model_used} · "
            f"{ts.strftime('%b %d, %Y %H:%M') if ts else 'unknown'}"
        )

        # Opening scene
        st.markdown(
            f"<div style='background:#1a1412; border-left:4px solid #C9A84C; "
            f"padding:0.8rem 1rem; border-radius:0 6px 6px 0; font-style:italic; "
            f"color:#d4c4b0; margin-bottom:0.6rem;'>"
            f"{runbook.opening_scene}</div>",
            unsafe_allow_html=True,
        )

        # Scene navigator
        scenes = runbook.scenes or []
        if scenes:
            scene_idx = min(st.session_state[_SCENE_KEY], len(scenes) - 1)
            st.session_state[_SCENE_KEY] = scene_idx

            nav_prev, nav_label, nav_next = st.columns([1, 3, 1])
            with nav_prev:
                if st.button("◀ Prev", disabled=(scene_idx == 0), use_container_width=True):
                    st.session_state[_SCENE_KEY] -= 1
                    st.rerun()
            with nav_label:
                scene = scenes[scene_idx]
                st.markdown(
                    f"<div style='text-align:center; color:#C9A84C; font-weight:600;'>"
                    f"Scene {scene_idx + 1} of {len(scenes)}: "
                    f"{scene.get('title', '')}</div>",
                    unsafe_allow_html=True,
                )
            with nav_next:
                if st.button(
                    "Next ▶", disabled=(scene_idx >= len(scenes) - 1), use_container_width=True
                ):
                    st.session_state[_SCENE_KEY] += 1
                    st.rerun()

            # Current scene
            st.markdown(
                f"<div style='background:#1a1412; border-left:4px solid #8B9DC3; "
                f"padding:0.7rem 0.9rem; border-radius:0 6px 6px 0; "
                f"font-style:italic; color:#d4c4b0; margin:0.4rem 0;'>"
                f"{scene.get('read_aloud', '')}</div>",
                unsafe_allow_html=True,
            )
            est = scene.get("estimated_minutes", 20)
            with st.expander(f"🔒 DM Notes (~{est} min)", expanded=False):
                st.info(scene.get("dm_notes", ""))

        st.markdown("")

        # NPC Dialog
        if runbook.npc_dialog:
            with st.expander(f"👥 NPC Dialog ({len(runbook.npc_dialog)} NPCs)"):
                for npc in runbook.npc_dialog:
                    st.markdown(f"**🗣️ {npc.get('npc_name', 'NPC')}**")
                    for line in npc.get("lines", []):
                        st.markdown(f'> *"{line}"*')
                    hooks = npc.get("improv_hooks", [])
                    if hooks:
                        st.markdown("*Improv hooks:*")
                        for hook in hooks:
                            st.markdown(f"- {hook}")
                    st.markdown("---")

        # Encounter flows
        if runbook.encounter_flows:
            with st.expander(f"⚔️ Encounter Tactics ({len(runbook.encounter_flows)} encounters)"):
                for enc in runbook.encounter_flows:
                    st.markdown(f"**{enc.get('encounter_name', 'Encounter')}**")
                    for r in enc.get("round_by_round", []):
                        st.markdown(f"- {r}")
                    if enc.get("tactics"):
                        st.info(enc["tactics"])
                    if enc.get("terrain_notes"):
                        st.markdown(f"🗺️ *{enc['terrain_notes']}*")
                    st.markdown("---")

        # Closing + XP
        if runbook.closing_hooks or runbook.xp_awards:
            close_col, xp_col = st.columns([3, 2])
            with close_col:
                if runbook.closing_hooks:
                    st.markdown("**🔗 Closing Hooks**")
                    st.markdown(
                        f"<div style='background:#12181a; border-left:3px solid #5a7a5a; "
                        f"padding:0.6rem 0.8rem; border-radius:0 4px 4px 0; color:#d4c4b0;'>"
                        f"{runbook.closing_hooks}</div>",
                        unsafe_allow_html=True,
                    )
            with xp_col:
                if runbook.xp_awards:
                    st.markdown("**🏆 XP Awards**")
                    for label, xp in runbook.xp_awards.items():
                        st.metric(label.replace("_", " ").title(), f"{xp:,} XP")

    # ── Monster stat block quick reference ──────────────────────────────────
    st.markdown("---")
    with st.expander("📖 Monster Stat Block Reference"):
        with next(get_session()) as db:
            encounters = EncounterRepo.list_by_adventure(db, game_session.adventure_id)
        seen_monster_ids: set[uuid.UUID] = set()
        for enc in encounters:
            for entry in enc.monster_roster or []:
                mid = uuid.UUID(str(entry.get("monster_id", "")))
                if mid in seen_monster_ids:
                    continue
                seen_monster_ids.add(mid)
                with next(get_session()) as db:
                    monster = MonsterRepo.get_by_id(db, mid)
                if monster:
                    with st.expander(
                        f"👹 {monster.name} (CR {monster.challenge_rating})", expanded=False
                    ):
                        s1, s2, s3 = st.columns(3)
                        with s1:
                            st.metric("AC", monster.ac)
                            st.metric("HP", f"{monster.hp_average} ({monster.hp_formula})")
                        with s2:
                            st.metric("CR", monster.challenge_rating)
                            st.metric("XP", f"{monster.xp:,}")
                        with s3:
                            st.metric("Prof. Bonus", f"+{monster.proficiency_bonus}")
                        ab_cols = st.columns(6)
                        for col, (label, val) in zip(
                            ab_cols,
                            [
                                ("STR", monster.score_str),
                                ("DEX", monster.score_dex),
                                ("CON", monster.score_con),
                                ("INT", monster.score_int),
                                ("WIS", monster.score_wis),
                                ("CHA", monster.score_cha),
                            ],
                        ):
                            mod = (val - 10) // 2
                            sign = "+" if mod >= 0 else ""
                            col.metric(label, f"{val} ({sign}{mod})")
                        if monster.actions:
                            st.markdown("**Actions**")
                            for action in monster.actions or []:
                                name = action.get("name", "")
                                desc = action.get("description", "")
                                st.markdown(f"**{name}:** {desc}")
        if not seen_monster_ids:
            st.caption("No monsters linked to this adventure's encounters yet.")
