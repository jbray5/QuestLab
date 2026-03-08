"""Encounters page — build and manage combat encounters within an Adventure.

Receives adventure_id via URL query param: ?adventure_id=<uuid>
UI only. All business logic is in services.encounter_service.
"""

import uuid

import streamlit as st
from dotenv import load_dotenv

from db.base import get_session
from domain.encounter import EncounterUpdate
from domain.enums import EncounterDifficulty
from integrations.dnd_rules.encounter_math import CR_TO_XP, calculate_difficulty
from integrations.identity import get_current_user_email
from services import adventure_service, campaign_service, encounter_service

load_dotenv()

st.set_page_config(page_title="Encounters · QuestLab", page_icon="⚔️", layout="wide")

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
    if st.button("← Back to Campaigns"):
        st.switch_page("pages/campaigns.py")
    st.stop()

try:
    adventure_id = uuid.UUID(adventure_id_str)
except ValueError:
    st.error("Invalid adventure ID in URL.")
    st.stop()

# Load adventure and campaign for context
try:
    with next(get_session()) as session:
        adventure = adventure_service.get_adventure(session, adventure_id, dm_email)
    with next(get_session()) as session:
        campaign = campaign_service.get_campaign(session, adventure.campaign_id, dm_email)
except (ValueError, PermissionError) as exc:
    st.error(str(exc))
    st.stop()

# ── Session state ──────────────────────────────────────────────────────────────
if "show_enc_form" not in st.session_state:
    st.session_state.show_enc_form = False
if "edit_enc_id" not in st.session_state:
    st.session_state.edit_enc_id = None
if "delete_enc_id" not in st.session_state:
    st.session_state.delete_enc_id = None
if "roster_monsters" not in st.session_state:
    st.session_state.roster_monsters = []  # list of {monster_id, name, cr, xp, count}
if "edit_roster_monsters" not in st.session_state:
    st.session_state.edit_roster_monsters = []

# ── Header ─────────────────────────────────────────────────────────────────────
col_back1, col_back2 = st.columns([1, 1])
with col_back1:
    if st.button("← Adventures"):
        st.session_state["nav_campaign_id"] = str(adventure.campaign_id)
        st.query_params["campaign_id"] = str(adventure.campaign_id)
        st.switch_page("pages/adventures.py")
with col_back2:
    if st.button("← Campaigns"):
        st.switch_page("pages/campaigns.py")

st.markdown(
    "<h1 style='font-family:\"Cinzel Decorative\",serif; color:#C9A84C;'>⚔️ Encounters</h1>",
    unsafe_allow_html=True,
)
st.markdown(
    f"<p style='color:#8B9DC3; font-size:1.05rem; margin-top:-0.5rem;'>"
    f"Campaign: <strong>{campaign.name}</strong> &nbsp;·&nbsp; "
    f"Adventure: <strong>{adventure.title}</strong></p>",
    unsafe_allow_html=True,
)
st.divider()

# ── Difficulty badge helper ────────────────────────────────────────────────────
_DIFF_CSS = {
    EncounterDifficulty.LOW: "badge-low",
    EncounterDifficulty.MODERATE: "badge-moderate",
    EncounterDifficulty.HIGH: "badge-high",
    EncounterDifficulty.DEADLY: "badge-deadly",
}
_DIFF_LABEL = {
    EncounterDifficulty.LOW: "Low",
    EncounterDifficulty.MODERATE: "Moderate",
    EncounterDifficulty.HIGH: "High",
    EncounterDifficulty.DEADLY: "Deadly",
}


def _diff_badge(diff: EncounterDifficulty) -> str:
    """Return HTML badge markup for a difficulty value."""
    css = _DIFF_CSS.get(diff, "badge-low")
    label = _DIFF_LABEL.get(diff, str(diff))
    return f"<span class='{css}'>{label}</span>"


# ── PC level input (shared for XP calculation) ─────────────────────────────────
with st.expander("Party Setup (for XP budget calculation)", expanded=False):
    st.caption("Enter one level per PC, comma-separated (e.g. 5,5,5,4 for a four-person party).")
    pc_levels_raw = st.text_input(
        "PC Levels",
        value=st.session_state.get("pc_levels_input", ""),
        placeholder="5,5,5,5",
        key="pc_levels_input",
    )

    pc_levels: list[int] = []
    if pc_levels_raw.strip():
        try:
            pc_levels = [int(x.strip()) for x in pc_levels_raw.split(",") if x.strip()]
            if any(not 1 <= lvl <= 20 for lvl in pc_levels):
                st.error("All PC levels must be between 1 and 20.")
                pc_levels = []
            else:
                st.success(f"{len(pc_levels)} PC(s) · levels {pc_levels}")
        except ValueError:
            st.error("Enter levels as numbers separated by commas.")
            pc_levels = []

st.divider()

# ── Load encounters ────────────────────────────────────────────────────────────
with next(get_session()) as session:
    encounters = encounter_service.list_encounters(session, adventure_id, dm_email)

# ── Monster search helper ──────────────────────────────────────────────────────


def _render_monster_picker(roster_key: str) -> list[dict]:
    """Render a monster search + roster builder widget.

    Args:
        roster_key: Session state key for the monster roster list.

    Returns:
        Current roster as a list of dicts {monster_id, name, cr, xp, count}.
    """
    roster: list[dict] = st.session_state.get(roster_key, [])

    search_col, cr_col = st.columns([3, 1])
    with search_col:
        search_q = st.text_input(
            "Search monsters", placeholder="goblin, dragon…", key=f"ms_{roster_key}"
        )
    with cr_col:
        cr_filter = st.selectbox(
            "CR filter",
            options=["Any"] + list(CR_TO_XP.keys()),
            key=f"cr_{roster_key}",
        )

    with next(get_session()) as session:
        all_monsters = encounter_service.list_monsters(session, search=search_q or None)

    if cr_filter != "Any":
        all_monsters = [m for m in all_monsters if m.challenge_rating == cr_filter]

    if all_monsters:
        monster_options = {
            f"{m.name} (CR {m.challenge_rating}, {m.xp} XP)": m for m in all_monsters
        }
        selected_label = st.selectbox(
            "Select monster", options=list(monster_options.keys()), key=f"sel_{roster_key}"
        )
        add_count = st.number_input(
            "Count", min_value=1, max_value=20, value=1, key=f"cnt_{roster_key}"
        )
        if st.button("Add to Roster", key=f"add_{roster_key}"):
            selected_m = monster_options[selected_label]
            # Merge with existing entry if same monster
            existing = next((r for r in roster if r["monster_id"] == str(selected_m.id)), None)
            if existing:
                existing["count"] = existing["count"] + add_count
            else:
                roster.append(
                    {
                        "monster_id": str(selected_m.id),
                        "name": selected_m.name,
                        "cr": selected_m.challenge_rating,
                        "xp": selected_m.xp,
                        "count": add_count,
                    }
                )
            st.session_state[roster_key] = roster
            st.rerun()
    else:
        st.info("No monsters found. Try a different search.")

    # Show current roster
    if roster:
        st.markdown("**Current Roster:**")
        total_xp = sum(r["xp"] * r["count"] for r in roster)
        to_remove = None
        for i, entry in enumerate(roster):
            rcol1, rcol2, rcol3 = st.columns([4, 2, 1])
            with rcol1:
                st.markdown(f"**{entry['name']}** — CR {entry['cr']} · {entry['xp']} XP each")
            with rcol2:
                new_cnt = st.number_input(
                    "×",
                    min_value=1,
                    max_value=20,
                    value=entry["count"],
                    key=f"rcnt_{roster_key}_{i}",
                )
                if new_cnt != entry["count"]:
                    roster[i]["count"] = new_cnt
                    st.session_state[roster_key] = roster
            with rcol3:
                if st.button("✕", key=f"rm_{roster_key}_{i}"):
                    to_remove = i
        if to_remove is not None:
            roster.pop(to_remove)
            st.session_state[roster_key] = roster
            st.rerun()

        # Live XP preview
        if pc_levels:
            xp_vals = []
            for r in roster:
                xp_vals.extend([r["xp"]] * r["count"])
            result = calculate_difficulty(pc_levels, xp_vals)
            diff_html = _diff_badge(result.difficulty)
            st.markdown(
                f"**XP Budget Preview:** Raw {result.raw_xp:,} × {result.multiplier} "
                f"= **{result.adjusted_xp:,} adjusted XP** &nbsp;→&nbsp; {diff_html} "
                f"(Deadly ≥ {result.deadly_threshold:,})",
                unsafe_allow_html=True,
            )
        else:
            st.caption(
                f"Total raw XP: {total_xp:,}  (set party levels above for difficulty rating)"
            )
    else:
        st.info("No monsters added yet.")

    return roster


# ── Create encounter form ──────────────────────────────────────────────────────
col_title, col_btn = st.columns([5, 1])
with col_title:
    st.subheader(f"Encounters ({len(encounters)})")
with col_btn:
    if st.button("＋ New Encounter", use_container_width=True, type="primary"):
        st.session_state.show_enc_form = not st.session_state.show_enc_form
        st.session_state.edit_enc_id = None
        if st.session_state.show_enc_form:
            st.session_state.roster_monsters = []

if st.session_state.show_enc_form:
    st.markdown("### Create New Encounter")
    enc_name = st.text_input("Encounter Name*", max_chars=200, placeholder="Goblin Ambush")
    enc_desc = st.text_area("Description", placeholder="Brief scene description…", height=80)
    enc_terrain = st.text_area(
        "Terrain Notes", placeholder="Dense forest, difficult terrain every 5 ft…", height=60
    )
    enc_read_aloud = st.text_area(
        "Read-Aloud Text",
        placeholder="Box text to read to players when the encounter starts…",
        height=80,
    )
    enc_dm_notes = st.text_area(
        "DM Notes (private)", placeholder="Tactics, traps, secret doors…", height=60
    )
    enc_reward_xp = st.number_input("Reward XP (awarded to party)", min_value=0, value=0, step=50)

    st.markdown("#### Monster Roster")
    roster = _render_monster_picker("roster_monsters")

    if st.button("Create Encounter", type="primary"):
        if not enc_name.strip():
            st.error("Encounter name is required.")
        else:
            try:
                with next(get_session()) as session:
                    encounter_service.create_encounter(
                        session,
                        adventure_id=adventure_id,
                        name=enc_name,
                        dm_email=dm_email,
                        description=enc_desc or None,
                        monster_roster=roster,
                        terrain_notes=enc_terrain or None,
                        read_aloud_text=enc_read_aloud or None,
                        dm_notes=enc_dm_notes or None,
                        reward_xp=int(enc_reward_xp),
                        pc_levels=pc_levels or None,
                    )
                st.session_state.show_enc_form = False
                st.session_state.roster_monsters = []
                st.success("Encounter created!")
                st.rerun()
            except (ValueError, PermissionError) as e:
                st.error(str(e))
    if st.button("Cancel", key="cancel_create_enc"):
        st.session_state.show_enc_form = False
        st.session_state.roster_monsters = []
        st.rerun()

st.divider()

# ── Encounter list ─────────────────────────────────────────────────────────────
if not encounters:
    st.info("No encounters yet. Click **＋ New Encounter** to build one.")
else:
    for enc in encounters:
        eid = str(enc.id)

        # ── Edit form ─────────────────────────────────────────────────────────
        if st.session_state.edit_enc_id == eid:
            st.markdown(f"### ✏️ Editing: {enc.name}")

            e_name = st.text_input("Name", value=enc.name, max_chars=200, key=f"en_{eid}")
            e_desc = st.text_area(
                "Description", value=enc.description or "", height=80, key=f"ed_{eid}"
            )
            e_terrain = st.text_area(
                "Terrain Notes", value=enc.terrain_notes or "", height=60, key=f"et_{eid}"
            )
            e_read_aloud = st.text_area(
                "Read-Aloud Text",
                value=enc.read_aloud_text or "",
                height=80,
                key=f"era_{eid}",
            )
            e_dm_notes = st.text_area(
                "DM Notes", value=enc.dm_notes or "", height=60, key=f"edn_{eid}"
            )
            e_reward = st.number_input(
                "Reward XP", min_value=0, value=enc.reward_xp or 0, step=50, key=f"erxp_{eid}"
            )

            st.markdown("#### Monster Roster")
            # Initialise edit roster from stored encounter data on first open
            if not st.session_state.edit_roster_monsters:
                init_roster = []
                with next(get_session()) as session:
                    for entry in enc.monster_roster or []:
                        try:
                            mid = uuid.UUID(str(entry["monster_id"]))
                        except (ValueError, KeyError):
                            continue
                        m = next(
                            (x for x in encounter_service.list_monsters(session) if x.id == mid),
                            None,
                        )
                        if m:
                            init_roster.append(
                                {
                                    "monster_id": str(m.id),
                                    "name": m.name,
                                    "cr": m.challenge_rating,
                                    "xp": m.xp,
                                    "count": int(entry.get("count", 1)),
                                }
                            )
                st.session_state.edit_roster_monsters = init_roster

            edit_roster = _render_monster_picker("edit_roster_monsters")

            col_save, col_cancel = st.columns(2)
            with col_save:
                if st.button(
                    "Save Changes", type="primary", key=f"save_{eid}", use_container_width=True
                ):
                    try:
                        with next(get_session()) as session:
                            encounter_service.update_encounter(
                                session,
                                enc.id,
                                dm_email,
                                EncounterUpdate(
                                    name=e_name,
                                    description=e_desc or None,
                                    monster_roster=edit_roster,
                                    terrain_notes=e_terrain or None,
                                    read_aloud_text=e_read_aloud or None,
                                    dm_notes=e_dm_notes or None,
                                    reward_xp=int(e_reward),
                                ),
                                pc_levels=pc_levels or None,
                            )
                        st.session_state.edit_enc_id = None
                        st.session_state.edit_roster_monsters = []
                        st.rerun()
                    except (ValueError, PermissionError) as e:
                        st.error(str(e))
            with col_cancel:
                if st.button("Cancel", key=f"cancel_{eid}", use_container_width=True):
                    st.session_state.edit_enc_id = None
                    st.session_state.edit_roster_monsters = []
                    st.rerun()
            continue

        # ── Delete confirmation ────────────────────────────────────────────────
        if st.session_state.delete_enc_id == eid:
            st.warning(f"Delete **{enc.name}**? This cannot be undone.")
            col_yes, col_no = st.columns(2)
            with col_yes:
                if st.button("Yes, delete", key=f"del_yes_{eid}", type="primary"):
                    try:
                        with next(get_session()) as session:
                            encounter_service.delete_encounter(session, enc.id, dm_email)
                        st.session_state.delete_enc_id = None
                        st.rerun()
                    except (ValueError, PermissionError) as e:
                        st.error(str(e))
            with col_no:
                if st.button("Cancel", key=f"del_no_{eid}"):
                    st.session_state.delete_enc_id = None
                    st.rerun()
            continue

        # ── Normal encounter card ──────────────────────────────────────────────
        roster_count = len(enc.monster_roster or [])
        diff_badge_html = _diff_badge(enc.difficulty)
        with st.container():
            c1, c2 = st.columns([7, 3])
            with c1:
                st.markdown(
                    f"<div style='background:#1e1412; border:2px solid #3a2a1a; "
                    f"border-radius:8px; padding:1rem 1.2rem; margin-bottom:0.6rem;'>"
                    f"<span style='color:#C9A84C; font-size:1.05rem; font-weight:600;'>"
                    f"{enc.name}</span>"
                    f"<br>{diff_badge_html}"
                    f"&nbsp;&nbsp;<span style='color:#B0A090; font-size:0.85rem;'>"
                    f"💰 {enc.xp_budget:,} XP budget</span>"
                    f"<br><span style='color:#5a7a5a; font-size:0.8rem;'>"
                    f"🐉 {roster_count} monster type{'s' if roster_count != 1 else ''}"
                    f"&nbsp;&nbsp;🎁 {enc.reward_xp:,} reward XP</span>"
                    + (
                        f"<br><span style='color:#9a8878; font-size:0.78rem; font-style:italic;'>"
                        f"{(enc.description or '')[:100]}"
                        f"{'…' if len(enc.description or '') > 100 else ''}</span>"
                        if enc.description
                        else ""
                    )
                    + "</div>",
                    unsafe_allow_html=True,
                )
            with c2:
                st.markdown("")
                col_e, col_d = st.columns(2)
                with col_e:
                    if st.button(
                        "✏️", key=f"edit_enc_{eid}", use_container_width=True, help="Edit"
                    ):
                        st.session_state.edit_enc_id = eid
                        st.session_state.edit_roster_monsters = []
                        st.rerun()
                with col_d:
                    if st.button(
                        "🗑️", key=f"del_enc_{eid}", use_container_width=True, help="Delete"
                    ):
                        st.session_state.delete_enc_id = eid
                        st.rerun()

                # Roster expander
                if roster_count > 0:
                    with st.expander(f"Roster ({roster_count} types)"):
                        for entry in enc.monster_roster or []:
                            name = entry.get("name", "Unknown")
                            cr = entry.get("cr", "?")
                            xp = entry.get("xp", 0)
                            count = entry.get("count", 1)
                            st.markdown(f"**{count}× {name}** — CR {cr} · {xp:,} XP each")

                # Read-aloud expander
                if enc.read_aloud_text:
                    with st.expander("📖 Read-Aloud"):
                        st.markdown(
                            f"<div class='read-aloud'>{enc.read_aloud_text}</div>",
                            unsafe_allow_html=True,
                        )
