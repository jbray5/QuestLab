"""Adventures page — list, create, edit adventures within a campaign.

Receives campaign_id via URL query param: ?campaign_id=<uuid>
UI only. All business logic is in services.adventure_service.
"""

import uuid

import streamlit as st
from dotenv import load_dotenv

from db.base import get_session
from domain.adventure import AdventureUpdate
from domain.enums import AdventureTier
from integrations.identity import get_current_user_email
from services import adventure_service, campaign_service

load_dotenv()

st.set_page_config(page_title="Adventures · QuestLab", page_icon="⚔️", layout="wide")

# ── Auth ───────────────────────────────────────────────────────────────────────
try:
    dm_email = get_current_user_email()
except PermissionError as exc:
    st.error(str(exc))
    st.stop()

# ── Campaign context ───────────────────────────────────────────────────────────
campaign_id_str = st.query_params.get("campaign_id") or st.session_state.get("nav_campaign_id")
if not campaign_id_str:
    st.error("No campaign selected. Please go back to Campaigns and choose one.")
    if st.button("← Back to Campaigns"):
        st.switch_page("pages/campaigns.py")
    st.stop()

try:
    campaign_id = uuid.UUID(campaign_id_str)
except ValueError:
    st.error("Invalid campaign ID in URL.")
    st.stop()

try:
    with next(get_session()) as session:
        campaign = campaign_service.get_campaign(session, campaign_id, dm_email)
except (ValueError, PermissionError) as exc:
    st.error(str(exc))
    st.stop()

# ── Session state ──────────────────────────────────────────────────────────────
if "show_adv_form" not in st.session_state:
    st.session_state.show_adv_form = False
if "edit_adv_id" not in st.session_state:
    st.session_state.edit_adv_id = None
if "delete_adv_id" not in st.session_state:
    st.session_state.delete_adv_id = None
if "show_npc_builder" not in st.session_state:
    st.session_state.show_npc_builder = False

# ── Header ─────────────────────────────────────────────────────────────────────
if st.button("← Campaigns"):
    st.switch_page("pages/campaigns.py")

st.markdown(
    "<h1 style='font-family:\"Cinzel Decorative\",serif; color:#C9A84C;'>⚔️ Adventures</h1>",
    unsafe_allow_html=True,
)
st.markdown(
    f"<p style='color:#8B9DC3; font-size:1.05rem; margin-top:-0.5rem;'>"
    f"Campaign: <strong>{campaign.name}</strong> &nbsp;·&nbsp; "
    f"<em style='color:#B0A090;'>{campaign.setting}</em></p>",
    unsafe_allow_html=True,
)
st.divider()

# ── Load adventures ────────────────────────────────────────────────────────────
with next(get_session()) as session:
    adventures = adventure_service.list_adventures(session, campaign_id, dm_email)

_TIER_LABELS = {
    AdventureTier.TIER1: "Tier 1 · Levels 1–4",
    AdventureTier.TIER2: "Tier 2 · Levels 5–10",
    AdventureTier.TIER3: "Tier 3 · Levels 11–16",
    AdventureTier.TIER4: "Tier 4 · Levels 17–20",
}

# ── Create adventure ───────────────────────────────────────────────────────────
col_title, col_btn = st.columns([5, 1])
with col_title:
    st.subheader(f"Adventures ({len(adventures)})")
with col_btn:
    if st.button("＋ New Adventure", use_container_width=True, type="primary"):
        st.session_state.show_adv_form = not st.session_state.show_adv_form
        st.session_state.edit_adv_id = None

if st.session_state.show_adv_form:
    with st.form("create_adventure_form"):
        st.markdown("**Create New Adventure**")
        a_title = st.text_input("Title*", max_chars=200, placeholder="The Shattered Spire")
        a_synopsis = st.text_area("Synopsis", placeholder="1–3 sentences…", height=80)
        a_tier = st.selectbox(
            "Tier*",
            options=list(AdventureTier),
            format_func=lambda t: _TIER_LABELS[t],
        )
        a_acts = st.slider("Number of Acts", min_value=1, max_value=5, value=3)
        a_loc = st.text_area("Location Notes", placeholder="Key locations and areas…", height=80)
        submitted = st.form_submit_button("Create Adventure", type="primary")
        if submitted:
            if not a_title:
                st.error("Title is required.")
            else:
                try:
                    with next(get_session()) as session:
                        adventure_service.create_adventure(
                            session,
                            campaign_id=campaign_id,
                            title=a_title,
                            tier=a_tier,
                            dm_email=dm_email,
                            synopsis=a_synopsis or None,
                            act_count=a_acts,
                            location_notes=a_loc or None,
                        )
                    st.session_state.show_adv_form = False
                    st.success("Adventure created!")
                    st.rerun()
                except (ValueError, PermissionError) as e:
                    st.error(str(e))

st.divider()

# ── Adventure list ─────────────────────────────────────────────────────────────
if not adventures:
    st.info("No adventures yet. Click **＋ New Adventure** to begin.")
else:
    for adv in adventures:
        aid = str(adv.id)

        # Edit form
        if st.session_state.edit_adv_id == aid:
            with st.form(f"edit_adv_{aid}"):
                st.markdown(f"**Editing:** {adv.title}")
                e_title = st.text_input("Title", value=adv.title, max_chars=200)
                e_synopsis = st.text_area("Synopsis", value=adv.synopsis or "", height=80)
                e_tier = st.selectbox(
                    "Tier",
                    options=list(AdventureTier),
                    index=list(AdventureTier).index(adv.tier),
                    format_func=lambda t: _TIER_LABELS[t],
                )
                e_acts = st.slider("Acts", 1, 5, value=adv.act_count)
                e_loc = st.text_area("Location Notes", value=adv.location_notes or "", height=80)

                # NPC Roster sub-section
                st.markdown("**NPC Roster**")
                npc_raw = adv.npc_roster or []
                npc_text = st.text_area(
                    "One NPC per line: Name | Role | Description",
                    value="\n".join(
                        f"{n.get('name', '')} | {n.get('role', '')} | {n.get('description', '')}"
                        for n in npc_raw
                    ),
                    height=120,
                    help="Format: Name | Role | Description (description optional)",
                )
                col_save, col_cancel = st.columns(2)
                with col_save:
                    saved = st.form_submit_button("Save", type="primary", use_container_width=True)
                with col_cancel:
                    cancelled = st.form_submit_button("Cancel", use_container_width=True)

            if saved:
                # Parse NPC text into roster
                parsed_npcs = []
                for line in npc_text.splitlines():
                    parts = [p.strip() for p in line.split("|")]
                    if len(parts) >= 2 and parts[0] and parts[1]:
                        parsed_npcs.append(
                            {
                                "name": parts[0],
                                "role": parts[1],
                                "description": parts[2] if len(parts) > 2 else "",
                            }
                        )
                try:
                    with next(get_session()) as session:
                        adventure_service.update_adventure(
                            session,
                            adv.id,
                            dm_email,
                            AdventureUpdate(
                                title=e_title,
                                synopsis=e_synopsis or None,
                                tier=e_tier,
                                act_count=e_acts,
                                location_notes=e_loc or None,
                                npc_roster=parsed_npcs if parsed_npcs else None,
                            ),
                        )
                    st.session_state.edit_adv_id = None
                    st.rerun()
                except (ValueError, PermissionError) as e:
                    st.error(str(e))
            if cancelled:
                st.session_state.edit_adv_id = None
                st.rerun()
            continue

        # Delete confirmation
        if st.session_state.delete_adv_id == aid:
            st.warning(f"Delete **{adv.title}**? This cannot be undone.")
            col_yes, col_no = st.columns(2)
            with col_yes:
                if st.button("Yes, delete", key=f"del_yes_{aid}", type="primary"):
                    try:
                        with next(get_session()) as session:
                            adventure_service.delete_adventure(session, adv.id, dm_email)
                        st.session_state.delete_adv_id = None
                        st.rerun()
                    except (ValueError, PermissionError) as e:
                        st.error(str(e))
            with col_no:
                if st.button("Cancel", key=f"del_no_{aid}"):
                    st.session_state.delete_adv_id = None
                    st.rerun()
            continue

        # Normal adventure card
        npc_count = len(adv.npc_roster or [])
        synopsis_html = ""
        if adv.synopsis:
            snip = adv.synopsis[:100] + ("…" if len(adv.synopsis) > 100 else "")
            synopsis_html = (
                f"<br><span style='color:#9a8878; font-size:0.8rem; font-style:italic;'>"
                f"{snip}</span>"
            )
        npc_label = f"👥 {npc_count} NPC{'s' if npc_count != 1 else ''}"
        with st.container():
            c1, c2 = st.columns([7, 3])
            with c1:
                st.markdown(
                    f"<div style='background:#1e1412; border:2px solid #3a2a1a; "
                    f"border-radius:8px; padding:1rem 1.2rem; margin-bottom:0.6rem;'>"
                    f"<span style='color:#C9A84C; font-size:1.05rem; font-weight:600;'>"
                    f"{adv.title}</span>"
                    f"<br><span style='color:#8B9DC3; font-size:0.82rem;'>"
                    f"🎭 {_TIER_LABELS[adv.tier]}</span>"
                    f"&nbsp;&nbsp;<span style='color:#B0A090; font-size:0.82rem;'>"
                    f"{adv.act_count} acts</span>"
                    f"{synopsis_html}"
                    f"<br><span style='color:#5a7a5a; font-size:0.78rem;'>{npc_label}</span>"
                    f"</div>",
                    unsafe_allow_html=True,
                )
            with c2:
                st.markdown("")
                if st.button("🗺️ Map →", key=f"map_{aid}", use_container_width=True):
                    st.session_state["nav_adventure_id"] = aid
                    st.session_state["nav_campaign_id"] = str(campaign_id)
                    st.query_params["adventure_id"] = aid
                    st.switch_page("pages/maps.py")
                if st.button(
                    "Sessions →", key=f"ses_{aid}", use_container_width=True, type="primary"
                ):
                    st.session_state["nav_adventure_id"] = aid
                    st.session_state["nav_campaign_id"] = str(campaign_id)
                    st.query_params["adventure_id"] = aid
                    st.switch_page("pages/sessions.py")
                if st.button("Encounters →", key=f"enc_{aid}", use_container_width=True):
                    st.session_state["nav_adventure_id"] = aid
                    st.session_state["nav_campaign_id"] = str(campaign_id)
                    st.query_params["adventure_id"] = aid
                    st.switch_page("pages/encounters.py")
                col_e, col_d = st.columns(2)
                with col_e:
                    if st.button(
                        "✏️", key=f"edit_adv_{aid}", use_container_width=True, help="Edit"
                    ):
                        st.session_state.edit_adv_id = aid
                        st.rerun()
                with col_d:
                    if st.button(
                        "🗑️", key=f"del_adv_{aid}", use_container_width=True, help="Delete"
                    ):
                        st.session_state.delete_adv_id = aid
                        st.rerun()

                # NPC roster expander
                if npc_count > 0:
                    with st.expander(f"NPCs ({npc_count})"):
                        for npc in adv.npc_roster or []:
                            st.markdown(
                                f"**{npc.get('name')}** — *{npc.get('role')}*"
                                + (f"\n{npc.get('description')}" if npc.get("description") else "")
                            )
