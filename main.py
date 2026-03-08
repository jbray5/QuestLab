"""QuestLab — AI-powered D&D 5e DM planning and session execution tool.

Entry point for the Streamlit application. Configures global page settings,
injects the dark fantasy CSS theme, loads Google Fonts, and renders the main
navigation sidebar.
"""

import os
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

import domain.adventure  # noqa: F401
import domain.campaign  # noqa: F401
import domain.character  # noqa: F401
import domain.encounter  # noqa: F401
import domain.item  # noqa: F401
import domain.map  # noqa: F401
import domain.monster  # noqa: F401
import domain.session  # noqa: F401
from db.base import create_db_and_tables, get_session
from integrations.dnd_rules.stat_blocks import seed_monsters

load_dotenv()

# ── DB bootstrap — creates tables in DuckDB on first run ───────────────────────
create_db_and_tables()
with next(get_session()) as _seed_session:
    seed_monsters(_seed_session)

# ── Page config (must be first Streamlit call) ─────────────────────────────────
st.set_page_config(
    page_title="QuestLab",
    page_icon="⚔️",
    layout="wide",
    initial_sidebar_state="expanded",
)


def _load_css() -> None:
    """Inject global dark fantasy CSS and Google Fonts into the app."""
    css_path = Path(__file__).parent / "static" / "styles" / "main.css"
    css = css_path.read_text(encoding="utf-8") if css_path.exists() else ""

    fonts = (
        "https://fonts.googleapis.com/css2?"
        "family=Cinzel+Decorative:wght@400;700;900"
        "&family=EB+Garamond:ital,wght@0,400;0,600;1,400"
        "&family=Share+Tech+Mono"
        "&display=swap"
    )
    st.html(f'<link href="{fonts}" rel="stylesheet"><style>{css}</style>')


def _render_sidebar() -> None:
    """Render the persistent sidebar navigation."""
    with st.sidebar:
        st.markdown(
            """
            <div style='text-align:center; padding: 1rem 0 0.5rem;'>
                <span style='font-size:2.5rem;'>⚔️</span>
                <h2 style='margin:0; font-family:"Cinzel Decorative",serif;
                           color:#C9A84C; font-size:1.3rem; letter-spacing:0.1em;'>
                    QuestLab
                </h2>
                <p style='color:#8B0000; font-size:0.75rem; margin:0;
                          font-family:"EB Garamond",serif; font-style:italic;'>
                    Your Campaign Companion
                </p>
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.divider()

        env = os.environ.get("ENV", "production").lower()
        if env == "development":
            dev_email = os.environ.get("CURRENT_USER_EMAIL", "dev@local.test")
            st.caption(f"🛠 Dev mode · {dev_email}")
            st.divider()

        st.markdown("**Navigation**")
        st.page_link("main.py", label="Home", icon="🏰")
        st.page_link("pages/campaigns.py", label="Campaigns", icon="📜")
        st.page_link("pages/encounters.py", label="Encounters", icon="⚔️")
        st.page_link("pages/maps.py", label="Maps", icon="🗺️")
        st.page_link("pages/session_runner.py", label="Session Runner", icon="🎲")

        st.divider()
        st.page_link("pages/admin.py", label="Admin", icon="⚙️")
        st.markdown(
            "<p style='color:#B0A090; font-size:0.7rem; text-align:center;"
            ' font-family:"Share Tech Mono",monospace;\'>5e 2024 Rules</p>',
            unsafe_allow_html=True,
        )


def _render_home() -> None:
    """Render the QuestLab home / dashboard page."""
    st.markdown(
        """
        <div style='text-align:center; padding: 3rem 0 2rem;'>
            <h1 style='font-size:3rem; letter-spacing:0.15em;'>⚔️ QuestLab</h1>
            <p style='font-size:1.3rem; color:#B0A090; font-style:italic;'>
                Your AI-powered Dungeon Master companion for D&amp;D 5e (2024)
            </p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.divider()

    col1, col2, col3 = st.columns(3)

    with col1:
        st.markdown("### 📜 Campaign Builder")
        st.markdown(
            "Craft campaigns and adventures with full world notes, NPC rosters, "
            "and location lore. Structure your story arc by arc."
        )
        if st.button("Open Campaigns", key="nav_campaigns", use_container_width=True):
            st.switch_page("pages/campaigns.py")

    with col2:
        st.markdown("### ⚔️ Encounter & Map Tools")
        st.markdown(
            "Design encounters with real-time XP budget math (2024 rules). "
            "Build dungeon and overworld maps with linked encounters and loot."
        )
        if st.button("Open Encounters", key="nav_encounters", use_container_width=True):
            st.switch_page("pages/encounters.py")

    with col3:
        st.markdown("### 🎲 AI Session Runner")
        st.markdown(
            "Generate full session runbooks with quotable dialog, encounter flows, "
            "and improv hooks. Run live sessions with initiative tracking."
        )
        if st.button("Open Session Runner", key="nav_sessions", use_container_width=True):
            st.switch_page("pages/session_runner.py")

    st.divider()

    st.markdown("### Getting Started")
    st.markdown("""
        1. **Create a Campaign** — Set your world, tone, and setting.
        2. **Add Adventures** — Structure story arcs within your campaign.
        3. **Add Player Characters** — Input full 5e 2024 character sheets.
        4. **Build Encounters** — Roster monsters, check XP budget, set terrain.
        5. **Build Maps** — Connect rooms and areas, link encounters and loot.
        6. **Generate a Session Runbook** — Let the AI write your session plan.
        7. **Run Your Session** — Track initiative, HP, and progress live.
        """)


# ── App bootstrap ──────────────────────────────────────────────────────────────
_load_css()
_render_sidebar()
_render_home()
