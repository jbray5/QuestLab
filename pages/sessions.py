"""Sessions page — list, create, and manage game sessions within an adventure.

Receives adventure_id via URL query param: ?adventure_id=<uuid>
UI only. All business logic is in services.session_service.
"""

import uuid
from datetime import date

import streamlit as st
from dotenv import load_dotenv

from db.base import get_session
from domain.session import SessionStatus, SessionUpdate
from integrations.identity import get_current_user_email
from services import adventure_service, campaign_service, session_service

load_dotenv()

st.set_page_config(page_title="Sessions · QuestLab", page_icon="📅", layout="wide")

# ── Auth ───────────────────────────────────────────────────────────────────────
try:
    dm_email = get_current_user_email()
except PermissionError as exc:
    st.error(str(exc))
    st.stop()

# ── Adventure context ──────────────────────────────────────────────────────────
adventure_id_str = st.query_params.get("adventure_id") or st.session_state.get("nav_adventure_id")
if not adventure_id_str:
    st.error("No adventure selected. Please go back to Adventures and choose one.")
    if st.button("← Back to Adventures"):
        st.switch_page("pages/adventures.py")
    st.stop()

try:
    adventure_id = uuid.UUID(adventure_id_str)
except ValueError:
    st.error("Invalid adventure ID in URL.")
    st.stop()

try:
    with next(get_session()) as session:
        adventure = adventure_service.get_adventure(session, adventure_id, dm_email)
        campaign = campaign_service.get_campaign(session, adventure.campaign_id, dm_email)
except (ValueError, PermissionError) as exc:
    st.error(str(exc))
    st.stop()

# ── Session state ──────────────────────────────────────────────────────────────
if "show_session_form" not in st.session_state:
    st.session_state.show_session_form = False
if "edit_session_id" not in st.session_state:
    st.session_state.edit_session_id = None
if "delete_session_id" not in st.session_state:
    st.session_state.delete_session_id = None

# ── Header ─────────────────────────────────────────────────────────────────────
col_back, col_enc = st.columns([1, 1])
with col_back:
    if st.button("← Adventures"):
        st.session_state["nav_campaign_id"] = str(campaign.id)
        st.query_params["campaign_id"] = str(campaign.id)
        st.switch_page("pages/adventures.py")
with col_enc:
    if st.button("Encounters →"):
        st.session_state["nav_adventure_id"] = str(adventure_id)
        st.session_state["nav_campaign_id"] = str(campaign.id)
        st.query_params["adventure_id"] = str(adventure_id)
        st.switch_page("pages/encounters.py")

st.markdown(
    "<h1 style='font-family:\"Cinzel Decorative\",serif; color:#C9A84C;'>📅 Sessions</h1>",
    unsafe_allow_html=True,
)
st.markdown(
    f"<p style='color:#8B9DC3; font-size:1.05rem; margin-top:-0.5rem;'>"
    f"Adventure: <strong>{adventure.title}</strong> &nbsp;·&nbsp; "
    f"Campaign: <em style='color:#B0A090;'>{campaign.name}</em></p>",
    unsafe_allow_html=True,
)
st.divider()

# ── Load sessions ──────────────────────────────────────────────────────────────
with next(get_session()) as session:
    sessions = session_service.list_sessions(session, adventure_id, dm_email)

_STATUS_EMOJI = {
    SessionStatus.DRAFT: "📝",
    SessionStatus.READY: "✅",
    SessionStatus.IN_PROGRESS: "⚔️",
    SessionStatus.COMPLETE: "🏁",
}

# ── Create session ─────────────────────────────────────────────────────────────
col_title, col_btn = st.columns([5, 1])
with col_title:
    st.subheader(f"Sessions ({len(sessions)})")
with col_btn:
    if st.button("＋ New Session", use_container_width=True, type="primary"):
        st.session_state.show_session_form = not st.session_state.show_session_form
        st.session_state.edit_session_id = None

if st.session_state.show_session_form:
    with st.form("create_session_form"):
        st.markdown("**Create New Session**")
        next_num = (max(s.session_number for s in sessions) + 1) if sessions else 1
        s_num = st.number_input("Session Number*", min_value=1, value=next_num, step=1)
        s_title = st.text_input(
            "Title*", max_chars=200, placeholder="The Goblin King's Throne Room"
        )
        s_date = st.date_input("Planned Date (optional)", value=None)
        s_notes = st.text_area(
            "Initial DM Notes (optional)", placeholder="Setup notes, hooks…", height=80
        )
        submitted = st.form_submit_button("Create Session", type="primary")
        if submitted:
            if not s_title:
                st.error("Title is required.")
            else:
                try:
                    with next(get_session()) as session:
                        session_service.create_session(
                            session,
                            adventure_id=adventure_id,
                            session_number=int(s_num),
                            title=s_title,
                            dm_email=dm_email,
                            date_planned=s_date if s_date else None,
                            actual_notes=s_notes or None,
                        )
                    st.session_state.show_session_form = False
                    st.success("Session created!")
                    st.rerun()
                except (ValueError, PermissionError) as e:
                    st.error(str(e))

st.divider()

# ── Session list ───────────────────────────────────────────────────────────────
if not sessions:
    st.info("No sessions yet. Click **＋ New Session** to begin planning.")
else:
    for gs in sessions:
        sid = str(gs.id)

        # Edit form
        if st.session_state.edit_session_id == sid:
            with st.form(f"edit_session_{sid}"):
                st.markdown(f"**Editing Session {gs.session_number}:** {gs.title}")
                e_title = st.text_input("Title", value=gs.title, max_chars=200)
                e_num = st.number_input("Session Number", min_value=1, value=gs.session_number)
                e_status = st.selectbox(
                    "Status",
                    options=list(SessionStatus),
                    index=list(SessionStatus).index(gs.status),
                    format_func=lambda s: f"{_STATUS_EMOJI[s]} {s.value.capitalize()}",
                )
                e_date_val = gs.date_planned if isinstance(gs.date_planned, date) else None
                e_date = st.date_input("Planned Date", value=e_date_val)
                e_notes = st.text_area("DM Notes", value=gs.actual_notes or "", height=100)
                col_save, col_cancel = st.columns(2)
                with col_save:
                    saved = st.form_submit_button("Save", type="primary", use_container_width=True)
                with col_cancel:
                    cancelled = st.form_submit_button("Cancel", use_container_width=True)

            if saved:
                try:
                    with next(get_session()) as session:
                        session_service.update_session(
                            session,
                            gs.id,
                            dm_email,
                            SessionUpdate(
                                title=e_title,
                                session_number=int(e_num),
                                status=e_status,
                                date_planned=e_date if e_date else None,
                                actual_notes=e_notes or None,
                            ),
                        )
                    st.session_state.edit_session_id = None
                    st.rerun()
                except (ValueError, PermissionError) as e:
                    st.error(str(e))
            if cancelled:
                st.session_state.edit_session_id = None
                st.rerun()
            continue

        # Delete confirmation
        if st.session_state.delete_session_id == sid:
            st.warning(
                f"Delete **Session {gs.session_number}: {gs.title}**? "
                f"This will also delete its runbook. This cannot be undone."
            )
            col_yes, col_no = st.columns(2)
            with col_yes:
                if st.button("Yes, delete", key=f"del_yes_{sid}", type="primary"):
                    try:
                        with next(get_session()) as session:
                            session_service.delete_session(session, gs.id, dm_email)
                        st.session_state.delete_session_id = None
                        st.rerun()
                    except (ValueError, PermissionError) as e:
                        st.error(str(e))
            with col_no:
                if st.button("Cancel", key=f"del_no_{sid}"):
                    st.session_state.delete_session_id = None
                    st.rerun()
            continue

        # Normal session card
        status_emoji = _STATUS_EMOJI.get(gs.status, "")
        date_str = gs.date_planned.strftime("%b %d, %Y") if gs.date_planned else "Date TBD"

        with st.container():
            c1, c2 = st.columns([7, 3])
            with c1:
                st.markdown(
                    f"<div style='background:#1a1e12; border:2px solid #2a3a1a; "
                    f"border-radius:8px; padding:1rem 1.2rem; margin-bottom:0.6rem;'>"
                    f"<span style='color:#C9A84C; font-size:1.05rem; font-weight:600;'>"
                    f"Session {gs.session_number}: {gs.title}</span>"
                    f"<br><span style='color:#8B9DC3; font-size:0.82rem;'>"
                    f"{status_emoji} {gs.status.value.capitalize()}</span>"
                    f"&nbsp;&nbsp;<span style='color:#B0A090; font-size:0.82rem;'>"
                    f"📅 {date_str}</span>"
                    f"</div>",
                    unsafe_allow_html=True,
                )
            with c2:
                st.markdown("")
                if st.button(
                    "🎲 Run Session", key=f"run_{sid}", use_container_width=True, type="primary"
                ):
                    st.session_state["nav_session_id"] = sid
                    st.session_state["nav_adventure_id"] = str(adventure_id)
                    st.query_params["session_id"] = sid
                    st.switch_page("pages/session_runner.py")
                col_e, col_d = st.columns(2)
                with col_e:
                    if st.button("✏️", key=f"edit_{sid}", use_container_width=True, help="Edit"):
                        st.session_state.edit_session_id = sid
                        st.rerun()
                with col_d:
                    if st.button("🗑️", key=f"del_{sid}", use_container_width=True, help="Delete"):
                        st.session_state.delete_session_id = sid
                        st.rerun()
