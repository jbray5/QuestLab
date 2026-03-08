"""Admin page — user management, monster seeding, and data export.

Access is restricted to bootstrap admins (BOOTSTRAP_ADMIN_EMAILS env var).
All authorization is enforced via services.auth_service.require_admin().

Tabs:
  Overview   — current user, admin list, system stats
  Monsters   — SRD monster count, seed/force-reseed
  Export     — download all campaigns as JSON (admin-only)
"""

import json

import streamlit as st
from dotenv import load_dotenv

from db.base import get_session
from db.repos.campaign_repo import CampaignRepo
from db.repos.monster_repo import MonsterRepo
from integrations.dnd_rules.stat_blocks import seed_monsters
from integrations.identity import get_current_user_email
from services import auth_service

load_dotenv()

st.set_page_config(page_title="Admin · QuestLab", page_icon="⚙️", layout="wide")

# ── Auth — fail closed ──────────────────────────────────────────────────────────
try:
    dm_email = get_current_user_email()
except PermissionError as exc:
    st.error(str(exc))
    st.stop()

try:
    auth_service.require_admin(dm_email)
except PermissionError:
    st.error("🚫 Admin access required. You do not have permission to view this page.")
    st.stop()

# ── Header ──────────────────────────────────────────────────────────────────────
st.markdown(
    "<h2 style='font-family:\"Cinzel Decorative\",serif; color:#C9A84C;'>⚙️ Admin Panel</h2>",
    unsafe_allow_html=True,
)
st.caption(f"Authenticated as **{dm_email}**")
st.divider()

tab_overview, tab_monsters, tab_export = st.tabs(["📊 Overview", "🐉 Monsters", "📦 Export"])

# ═══════════════════════════════════════════════════════════════════════════════
# TAB: Overview
# ═══════════════════════════════════════════════════════════════════════════════
with tab_overview:
    st.subheader("System Overview")

    admins = auth_service.get_bootstrap_admins()

    col_a, col_b, col_c = st.columns(3)

    with next(get_session()) as db:
        campaign_count = len(CampaignRepo.list_by_dm(db, dm_email))
        monster_count = MonsterRepo.count(db)

    with col_a:
        st.metric("Bootstrap Admins", len(admins))
    with col_b:
        st.metric("Your Campaigns", campaign_count)
    with col_c:
        st.metric("Monster Stat Blocks", monster_count)

    st.divider()
    st.markdown("#### Bootstrap Admins")
    if admins:
        for admin in admins:
            badge = " ← you" if admin == dm_email else ""
            st.markdown(
                f"<div style='padding:0.3rem 0; color:#F5E6C8;'>"
                f"👤 <code>{admin}</code>"
                f"<span style='color:#C9A84C;'>{badge}</span></div>",
                unsafe_allow_html=True,
            )
    else:
        st.warning("No bootstrap admins configured. Set BOOTSTRAP_ADMIN_EMAILS in .env.")

# ═══════════════════════════════════════════════════════════════════════════════
# TAB: Monsters
# ═══════════════════════════════════════════════════════════════════════════════
with tab_monsters:
    st.subheader("SRD Monster Stat Blocks")

    with next(get_session()) as db:
        count = MonsterRepo.count(db)

    col_info, col_actions = st.columns([3, 2])

    with col_info:
        st.markdown(
            f'<div style=\'font-family:"Share Tech Mono",monospace; font-size:1.1rem;'
            f" color:#C9A84C;'>{count} monsters</div>",
            unsafe_allow_html=True,
        )
        if count == 0:
            st.warning("Monster table is empty — click **Seed Monsters** to populate.")
        else:
            st.success(f"Monster table populated ({count} stat blocks).")

    with col_actions:
        if st.button("🌱 Seed Monsters", use_container_width=True, type="primary"):
            with next(get_session()) as db:
                inserted = seed_monsters(db)
            if inserted == 0:
                st.info("Table already populated. Use Force Reseed to replace all data.")
            else:
                st.success(f"Seeded {inserted} monsters.")
                st.rerun()

        with st.expander("⚠️ Force Reseed (destructive)", expanded=False):
            st.warning(
                "This will **delete all monster stat blocks** (including custom ones) "
                "and re-seed from SRD data. This cannot be undone."
            )
            if st.button("🗑️ Delete All & Reseed", type="secondary", use_container_width=True):
                with next(get_session()) as db:
                    deleted = MonsterRepo.delete_all(db)
                    inserted = seed_monsters(db)
                st.success(f"Deleted {deleted} monsters, re-seeded {inserted}.")
                st.rerun()

    st.divider()
    st.markdown("#### Monster List")
    with next(get_session()) as db:
        monsters = MonsterRepo.list_all(db)
    if monsters:
        rows = [
            {
                "Name": m.name,
                "CR": str(m.challenge_rating) if m.challenge_rating is not None else "—",
                "Type": m.monster_type or "—",
                "HP": m.hit_points,
                "AC": m.armor_class,
                "Source": m.source or "—",
            }
            for m in monsters
        ]
        st.dataframe(rows, use_container_width=True, hide_index=True)
    else:
        st.caption("No monsters in database.")

# ═══════════════════════════════════════════════════════════════════════════════
# TAB: Export
# ═══════════════════════════════════════════════════════════════════════════════
with tab_export:
    st.subheader("Data Export")
    st.markdown(
        "Export your campaigns as JSON. The export includes campaign metadata only — "
        "adventures, sessions, characters, encounters, and maps are not included in this export."
    )

    with next(get_session()) as db:
        all_campaigns = CampaignRepo.list_by_dm(db, dm_email)

    if not all_campaigns:
        st.info("No campaigns to export.")
    else:
        export_data = [
            {
                "id": str(c.id),
                "name": c.name,
                "setting": c.setting,
                "tone": c.tone,
                "dm_email": c.dm_email,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in all_campaigns
        ]
        export_json = json.dumps(export_data, indent=2)

        st.download_button(
            label=f"⬇️ Download {len(all_campaigns)} campaigns as JSON",
            data=export_json,
            file_name="questlab_campaigns_export.json",
            mime="application/json",
            type="primary",
            use_container_width=True,
        )

        with st.expander("Preview export data"):
            st.code(export_json, language="json")
