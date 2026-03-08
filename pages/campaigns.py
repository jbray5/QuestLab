"""Campaigns page — list, create, edit, and delete D&D campaigns.

UI only. All business logic and authorization is enforced in services.campaign_service.
"""

import streamlit as st
from dotenv import load_dotenv

from db.base import get_session
from domain.campaign import CampaignUpdate
from integrations.identity import get_current_user_email
from services import campaign_service

load_dotenv()

st.set_page_config(page_title="Campaigns · QuestLab", page_icon="📜", layout="wide")

# ── Auth ───────────────────────────────────────────────────────────────────────
try:
    dm_email = get_current_user_email()
except PermissionError as exc:
    st.error(str(exc))
    st.stop()

# ── Helpers ────────────────────────────────────────────────────────────────────


def _card_style(selected: bool) -> str:
    """Return inline CSS for a campaign card."""
    border = "#C9A84C" if selected else "#3a2a1a"
    return (
        f"background:#1e1412; border:2px solid {border}; border-radius:8px; "
        "padding:1rem 1.2rem; margin-bottom:0.6rem; cursor:pointer;"
    )


# ── Session state ──────────────────────────────────────────────────────────────
if "show_create_form" not in st.session_state:
    st.session_state.show_create_form = False
if "edit_campaign_id" not in st.session_state:
    st.session_state.edit_campaign_id = None
if "delete_confirm_id" not in st.session_state:
    st.session_state.delete_confirm_id = None

# ── Page header ────────────────────────────────────────────────────────────────
st.markdown(
    "<h1 style='font-family:\"Cinzel Decorative\",serif; color:#C9A84C;'>" "📜 Campaigns</h1>",
    unsafe_allow_html=True,
)
st.caption(f"Signed in as **{dm_email}**")
st.divider()

# ── Load campaigns ─────────────────────────────────────────────────────────────
with next(get_session()) as session:
    campaigns = campaign_service.list_campaigns(session, dm_email)

# ── Create campaign form ───────────────────────────────────────────────────────
col_title, col_btn = st.columns([5, 1])
with col_title:
    st.subheader(f"Your Campaigns ({len(campaigns)})")
with col_btn:
    if st.button("＋ New Campaign", use_container_width=True, type="primary"):
        st.session_state.show_create_form = not st.session_state.show_create_form
        st.session_state.edit_campaign_id = None

if st.session_state.show_create_form:
    with st.form("create_campaign_form"):
        st.markdown("**Create New Campaign**")
        new_name = st.text_input("Campaign Name*", max_chars=200, placeholder="The Sunken Citadel")
        new_setting = st.text_input("Setting*", max_chars=200, placeholder="Forgotten Realms")
        new_tone = st.text_input(
            "Tone*", max_chars=200, placeholder="Dark and gritty, political intrigue"
        )
        new_notes = st.text_area(
            "World Notes", placeholder="Key lore, factions, geography…", height=100
        )
        submitted = st.form_submit_button("Create Campaign", type="primary")
        if submitted:
            if not new_name or not new_setting or not new_tone:
                st.error("Name, Setting, and Tone are required.")
            else:
                try:
                    with next(get_session()) as session:
                        campaign_service.create_campaign(
                            session,
                            name=new_name,
                            setting=new_setting,
                            tone=new_tone,
                            dm_email=dm_email,
                            world_notes=new_notes or None,
                        )
                    st.session_state.show_create_form = False
                    st.success("Campaign created!")
                    st.rerun()
                except ValueError as e:
                    st.error(str(e))

st.divider()

# ── Campaign list ──────────────────────────────────────────────────────────────
if not campaigns:
    st.info("No campaigns yet. Click **＋ New Campaign** to begin your first adventure.")
else:
    for c in campaigns:
        cid = str(c.id)

        # Edit inline form
        if st.session_state.edit_campaign_id == cid:
            with st.form(f"edit_{cid}"):
                st.markdown(f"**Editing:** {c.name}")
                e_name = st.text_input("Name", value=c.name, max_chars=200)
                e_setting = st.text_input("Setting", value=c.setting, max_chars=200)
                e_tone = st.text_input("Tone", value=c.tone, max_chars=200)
                e_notes = st.text_area("World Notes", value=c.world_notes or "", height=80)
                col_save, col_cancel = st.columns(2)
                with col_save:
                    saved = st.form_submit_button("Save", type="primary", use_container_width=True)
                with col_cancel:
                    cancelled = st.form_submit_button("Cancel", use_container_width=True)
            if saved:
                try:
                    with next(get_session()) as session:
                        campaign_service.update_campaign(
                            session,
                            c.id,
                            dm_email,
                            CampaignUpdate(
                                name=e_name,
                                setting=e_setting,
                                tone=e_tone,
                                world_notes=e_notes or None,
                            ),
                        )
                    st.session_state.edit_campaign_id = None
                    st.rerun()
                except (ValueError, PermissionError) as e:
                    st.error(str(e))
            if cancelled:
                st.session_state.edit_campaign_id = None
                st.rerun()
            continue

        # Delete confirmation
        if st.session_state.delete_confirm_id == cid:
            st.warning(f"Delete **{c.name}**? This cannot be undone.")
            col_yes, col_no = st.columns(2)
            with col_yes:
                if st.button("Yes, delete", key=f"confirm_del_{cid}", type="primary"):
                    try:
                        with next(get_session()) as session:
                            campaign_service.delete_campaign(session, c.id, dm_email)
                        st.session_state.delete_confirm_id = None
                        st.rerun()
                    except (ValueError, PermissionError) as e:
                        st.error(str(e))
            with col_no:
                if st.button("Cancel", key=f"cancel_del_{cid}"):
                    st.session_state.delete_confirm_id = None
                    st.rerun()
            continue

        # Normal card
        notes_html = ""
        if c.world_notes:
            snip = c.world_notes[:120] + ("…" if len(c.world_notes) > 120 else "")
            notes_html = f"<br><span style='color:#9a8878; font-size:0.8rem;'>{snip}</span>"
        with st.container():
            c1, c2 = st.columns([7, 3])
            with c1:
                st.markdown(
                    f"<div style='{_card_style(False)}'>"
                    f"<span style='color:#C9A84C; font-size:1.1rem; font-weight:600;'>"
                    f"{c.name}</span>"
                    f"<br><span style='color:#8B9DC3; font-size:0.85rem;'>🌍 {c.setting}</span>"
                    f"&nbsp;&nbsp;<span style='color:#B0A090; font-size:0.85rem;"
                    f" font-style:italic;'>{c.tone}</span>"
                    f"{notes_html}"
                    "</div>",
                    unsafe_allow_html=True,
                )
            with c2:
                st.markdown("")  # vertical spacer
                if st.button("Adventures →", key=f"goto_{cid}", use_container_width=True):
                    st.session_state["nav_campaign_id"] = cid
                    st.query_params["campaign_id"] = cid
                    st.switch_page("pages/adventures.py")
                if st.button("Characters →", key=f"chars_{cid}", use_container_width=True):
                    st.session_state["nav_campaign_id"] = cid
                    st.query_params["campaign_id"] = cid
                    st.switch_page("pages/characters.py")
                col_e, col_d = st.columns(2)
                with col_e:
                    if st.button("✏️", key=f"edit_{cid}", use_container_width=True, help="Edit"):
                        st.session_state.edit_campaign_id = cid
                        st.rerun()
                with col_d:
                    if st.button("🗑️", key=f"del_{cid}", use_container_width=True, help="Delete"):
                        st.session_state.delete_confirm_id = cid
                        st.rerun()
