"""Characters page — view, create, edit, and delete player characters for a campaign.

Receives campaign_id via URL query param: ?campaign_id=<uuid>
UI only. All business logic and authorization is enforced in services.character_service.
"""

import uuid

import streamlit as st
from dotenv import load_dotenv

from db.base import get_session
from domain.character import PlayerCharacterRead, PlayerCharacterUpdate
from domain.enums import AbilityScore, CharacterClass
from integrations.identity import get_current_user_email
from services import campaign_service, character_service

load_dotenv()

st.set_page_config(page_title="Characters · QuestLab", page_icon="🧙", layout="wide")

# ── Auth ───────────────────────────────────────────────────────────────────────
try:
    dm_email = get_current_user_email()
except PermissionError as exc:
    st.error(str(exc))
    st.stop()

# ── Campaign context ───────────────────────────────────────────────────────────
campaign_id_str = st.query_params.get("campaign_id") or st.session_state.get("nav_campaign_id")
if not campaign_id_str:
    st.error("No campaign selected. Go back to Campaigns and choose one.")
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
if "show_char_form" not in st.session_state:
    st.session_state.show_char_form = False
if "view_char_id" not in st.session_state:
    st.session_state.view_char_id = None
if "edit_char_id" not in st.session_state:
    st.session_state.edit_char_id = None
if "delete_char_id" not in st.session_state:
    st.session_state.delete_char_id = None

# ── Helpers ────────────────────────────────────────────────────────────────────

_ABILITY_ABBR = {
    AbilityScore.STR: "STR",
    AbilityScore.DEX: "DEX",
    AbilityScore.CON: "CON",
    AbilityScore.INT: "INT",
    AbilityScore.WIS: "WIS",
    AbilityScore.CHA: "CHA",
}


def _mod_str(score: int) -> str:
    """Return formatted modifier string e.g. '+2' or '-1'."""
    m = character_service.ability_modifier(score)
    return f"+{m}" if m >= 0 else str(m)


def _prof_str(pb: int) -> str:
    """Return formatted proficiency bonus string e.g. '+3'."""
    return f"+{pb}"


def _slot_display(slots: dict) -> str:
    """Return human-readable spell slot string for display."""
    if not slots:
        return "None"
    if "pact" in slots:
        count = slots.get("pact", 0)
        level = slots.get("level", 1)
        return f"{count}× Level {level} (Pact Magic)"
    parts = [f"L{k}: {v}" for k, v in sorted(slots.items(), key=lambda x: int(x))]
    return " · ".join(parts)


class _CharStub:
    """Lightweight stub used only to pass character stats to compute_skill_bonuses."""

    def __init__(self, char: PlayerCharacterRead) -> None:
        """Initialise from a PlayerCharacterRead schema."""
        self.level = char.level
        self.score_str = char.score_str
        self.score_dex = char.score_dex
        self.score_con = char.score_con
        self.score_int = char.score_int
        self.score_wis = char.score_wis
        self.score_cha = char.score_cha
        self.skill_proficiencies = char.skill_proficiencies


# ── Header ─────────────────────────────────────────────────────────────────────
if st.button("← Campaigns"):
    st.switch_page("pages/campaigns.py")

st.markdown(
    "<h1 style='font-family:\"Cinzel Decorative\",serif; color:#C9A84C;'>🧙 Characters</h1>",
    unsafe_allow_html=True,
)
st.markdown(
    f"<p style='color:#8B9DC3; font-size:1.05rem; margin-top:-0.5rem;'>"
    f"Campaign: <strong>{campaign.name}</strong> &nbsp;·&nbsp; "
    f"<em style='color:#B0A090;'>{campaign.setting}</em></p>",
    unsafe_allow_html=True,
)
st.divider()

# ── Load characters ────────────────────────────────────────────────────────────
with next(get_session()) as session:
    characters = character_service.list_characters(session, campaign_id, dm_email)

max_chars = character_service.MAX_CHARACTERS_PER_CAMPAIGN

# ── Create character form ──────────────────────────────────────────────────────
col_title, col_btn = st.columns([5, 1])
with col_title:
    st.subheader(f"Party ({len(characters)}/{max_chars})")
with col_btn:
    if st.button("＋ Add Character", use_container_width=True, type="primary"):
        st.session_state.show_char_form = not st.session_state.show_char_form
        st.session_state.edit_char_id = None

if st.session_state.show_char_form:
    with st.form("create_character_form"):
        st.markdown("**Add New Player Character**")

        st.markdown("##### Identity")
        id1, id2 = st.columns(2)
        with id1:
            f_player = st.text_input("Player Name*", max_chars=100, placeholder="Alice")
            f_char = st.text_input("Character Name*", max_chars=100, placeholder="Thalindra")
            f_race = st.text_input("Race/Species*", max_chars=100, placeholder="Half-Elf")
        with id2:
            f_class = st.selectbox("Class*", options=list(CharacterClass))
            f_level = st.number_input("Level*", min_value=1, max_value=20, value=1, step=1)
            f_subclass = st.text_input("Subclass", max_chars=100, placeholder="Evocation")
        bg1, bg2 = st.columns(2)
        with bg1:
            f_background = st.text_input("Background", max_chars=100, placeholder="Sage")
        with bg2:
            f_alignment = st.text_input("Alignment", max_chars=50, placeholder="Chaotic Good")

        st.markdown("##### Ability Scores")
        sc1, sc2, sc3, sc4, sc5, sc6 = st.columns(6)
        score_inputs = {}
        for col, (key, label) in zip(
            [sc1, sc2, sc3, sc4, sc5, sc6],
            [
                ("str", "STR"),
                ("dex", "DEX"),
                ("con", "CON"),
                ("int", "INT"),
                ("wis", "WIS"),
                ("cha", "CHA"),
            ],
        ):
            with col:
                score_inputs[key] = st.number_input(
                    label, min_value=1, max_value=30, value=10, step=1, key=f"c_{key}"
                )

        st.markdown("##### Combat")
        cm1, cm2, cm3, cm4 = st.columns(4)
        with cm1:
            f_hp_max = st.number_input("HP Max*", min_value=1, value=8, step=1)
        with cm2:
            f_hp_cur = st.number_input("HP Current*", min_value=0, value=8, step=1)
        with cm3:
            f_ac = st.number_input("AC*", min_value=1, max_value=30, value=10, step=1)
        with cm4:
            f_speed = st.number_input("Speed (ft)*", min_value=0, value=30, step=5)

        st.markdown("##### Saving Throw Proficiencies")
        st_cols = st.columns(6)
        st_profs = []
        for i, ab in enumerate(AbilityScore):
            with st_cols[i]:
                if st.checkbox(_ABILITY_ABBR[ab], key=f"cst_{ab.value}"):
                    st_profs.append(ab)

        st.markdown("##### Skill Proficiencies")
        skills_list = list(character_service.SKILLS.keys())
        sk_cols = st.columns(3)
        skill_profs: dict[str, int] = {}
        for idx, skill in enumerate(skills_list):
            with sk_cols[idx % 3]:
                sk_level = st.selectbox(
                    skill,
                    options=[0, 1, 2],
                    format_func=lambda x: ["—", "Proficient", "Expertise"][x],
                    key=f"csk_{skill}",
                )
                if sk_level > 0:
                    skill_profs[skill] = sk_level

        st.markdown("##### Feats & Equipment")
        fe1, fe2 = st.columns(2)
        with fe1:
            f_feats_raw = st.text_area(
                "Feats (one per line)", placeholder="Alert\nMagic Initiate", height=80
            )
        with fe2:
            f_equip_raw = st.text_area(
                "Equipment (Name | Qty | Notes)",
                placeholder="Longsword | 1 | +1\nLeather Armor | 1",
                height=80,
            )

        st.markdown("##### Backstory & Notes")
        f_backstory = st.text_area("Backstory", height=100, placeholder="Character history…")
        f_notes = st.text_area("DM Notes", height=60, placeholder="Private DM notes…")

        submitted = st.form_submit_button("Add Character", type="primary")
        if submitted:
            if not f_player or not f_char or not f_race:
                st.error("Player Name, Character Name, and Race are required.")
            elif f_hp_cur > f_hp_max:
                st.error("Current HP cannot exceed Max HP.")
            else:
                feats_parsed = [ln.strip() for ln in f_feats_raw.splitlines() if ln.strip()]
                equip_parsed = []
                for ln in f_equip_raw.splitlines():
                    parts = [p.strip() for p in ln.split("|")]
                    if parts and parts[0]:
                        equip_parsed.append(
                            {
                                "name": parts[0],
                                "quantity": (
                                    int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 1
                                ),
                                "notes": parts[2] if len(parts) > 2 else "",
                            }
                        )
                try:
                    with next(get_session()) as session:
                        character_service.create_character(
                            session,
                            campaign_id=campaign_id,
                            dm_email=dm_email,
                            player_name=f_player,
                            character_name=f_char,
                            race=f_race,
                            character_class=f_class,
                            level=int(f_level),
                            score_str=int(score_inputs["str"]),
                            score_dex=int(score_inputs["dex"]),
                            score_con=int(score_inputs["con"]),
                            score_int=int(score_inputs["int"]),
                            score_wis=int(score_inputs["wis"]),
                            score_cha=int(score_inputs["cha"]),
                            hp_max=int(f_hp_max),
                            hp_current=int(f_hp_cur),
                            ac=int(f_ac),
                            speed=int(f_speed),
                            subclass=f_subclass or None,
                            background=f_background or None,
                            alignment=f_alignment or None,
                            saving_throw_proficiencies=st_profs or None,
                            skill_proficiencies=skill_profs or None,
                            feats=feats_parsed or None,
                            equipment=equip_parsed or None,
                            backstory=f_backstory or None,
                            notes=f_notes or None,
                        )
                    st.session_state.show_char_form = False
                    st.success(f"{f_char} added to the party!")
                    st.rerun()
                except (ValueError, PermissionError) as e:
                    st.error(str(e))

st.divider()

# ── Character list ─────────────────────────────────────────────────────────────
if not characters:
    st.info("No characters yet. Click **＋ Add Character** to build your first party member.")
else:
    for char in characters:
        cid = str(char.id)
        pb = char.computed_proficiency_bonus

        # Delete confirmation
        if st.session_state.delete_char_id == cid:
            st.warning(f"Delete **{char.character_name}**? This cannot be undone.")
            dc1, dc2 = st.columns(2)
            with dc1:
                if st.button("Yes, delete", key=f"del_yes_{cid}", type="primary"):
                    try:
                        with next(get_session()) as session:
                            character_service.delete_character(session, char.id, dm_email)
                        st.session_state.delete_char_id = None
                        st.rerun()
                    except (ValueError, PermissionError) as e:
                        st.error(str(e))
            with dc2:
                if st.button("Cancel", key=f"del_no_{cid}"):
                    st.session_state.delete_char_id = None
                    st.rerun()
            continue

        # Edit form
        if st.session_state.edit_char_id == cid:
            with st.form(f"edit_char_{cid}"):
                st.markdown(f"**Editing:** {char.character_name}")
                ec1, ec2 = st.columns(2)
                with ec1:
                    e_player = st.text_input("Player Name", value=char.player_name, max_chars=100)
                    e_char = st.text_input(
                        "Character Name", value=char.character_name, max_chars=100
                    )
                    e_race = st.text_input("Race", value=char.race, max_chars=100)
                with ec2:
                    e_class = st.selectbox(
                        "Class",
                        options=list(CharacterClass),
                        index=list(CharacterClass).index(char.character_class),
                    )
                    e_level = st.number_input(
                        "Level", min_value=1, max_value=20, value=char.level, step=1
                    )
                    e_subclass = st.text_input("Subclass", value=char.subclass or "", max_chars=100)

                st.markdown("##### Ability Scores")
                es1, es2, es3, es4, es5, es6 = st.columns(6)
                edit_scores = {}
                for col, (key, label, val) in zip(
                    [es1, es2, es3, es4, es5, es6],
                    [
                        ("str", "STR", char.score_str),
                        ("dex", "DEX", char.score_dex),
                        ("con", "CON", char.score_con),
                        ("int", "INT", char.score_int),
                        ("wis", "WIS", char.score_wis),
                        ("cha", "CHA", char.score_cha),
                    ],
                ):
                    with col:
                        edit_scores[key] = st.number_input(
                            label, 1, 30, value=val, step=1, key=f"e_{key}_{cid}"
                        )

                st.markdown("##### Combat")
                ecm1, ecm2, ecm3, ecm4 = st.columns(4)
                with ecm1:
                    e_hp_max = st.number_input(
                        "HP Max", 1, value=char.hp_max, step=1, key=f"ehpmax_{cid}"
                    )
                with ecm2:
                    e_hp_cur = st.number_input(
                        "HP Current", 0, value=char.hp_current, step=1, key=f"ehpcur_{cid}"
                    )
                with ecm3:
                    e_ac = st.number_input("AC", 1, 30, value=char.ac, step=1, key=f"eac_{cid}")
                with ecm4:
                    e_speed = st.number_input(
                        "Speed", 0, value=char.speed, step=5, key=f"espd_{cid}"
                    )

                st.markdown("##### Saving Throw Proficiencies")
                est_cols = st.columns(6)
                e_st_profs = []
                cur_sts = char.saving_throw_proficiencies or []
                for i, ab in enumerate(AbilityScore):
                    with est_cols[i]:
                        checked = ab in cur_sts or ab.value in cur_sts
                        if st.checkbox(
                            _ABILITY_ABBR[ab], value=checked, key=f"est_{cid}_{ab.value}"
                        ):
                            e_st_profs.append(ab)

                e_backstory = st.text_area(
                    "Backstory", value=char.backstory or "", height=80, key=f"ebs_{cid}"
                )
                e_notes = st.text_area(
                    "DM Notes", value=char.notes or "", height=60, key=f"enotes_{cid}"
                )

                col_save, col_cancel = st.columns(2)
                with col_save:
                    saved = st.form_submit_button("Save", type="primary", use_container_width=True)
                with col_cancel:
                    cancelled = st.form_submit_button("Cancel", use_container_width=True)

            if saved:
                try:
                    with next(get_session()) as session:
                        character_service.update_character(
                            session,
                            char.id,
                            dm_email,
                            PlayerCharacterUpdate(
                                player_name=e_player,
                                character_name=e_char,
                                race=e_race,
                                character_class=e_class,
                                level=int(e_level),
                                subclass=e_subclass or None,
                                score_str=int(edit_scores["str"]),
                                score_dex=int(edit_scores["dex"]),
                                score_con=int(edit_scores["con"]),
                                score_int=int(edit_scores["int"]),
                                score_wis=int(edit_scores["wis"]),
                                score_cha=int(edit_scores["cha"]),
                                hp_max=int(e_hp_max),
                                hp_current=int(e_hp_cur),
                                ac=int(e_ac),
                                speed=int(e_speed),
                                saving_throw_proficiencies=e_st_profs or None,
                                backstory=e_backstory or None,
                                notes=e_notes or None,
                            ),
                        )
                    st.session_state.edit_char_id = None
                    st.rerun()
                except (ValueError, PermissionError) as e:
                    st.error(str(e))
            if cancelled:
                st.session_state.edit_char_id = None
                st.rerun()
            continue

        # Normal character card
        class_level = f"{char.character_class.value} {char.level}"
        if char.subclass:
            class_level = f"{char.subclass} {class_level}"
        hp_text = f"❤️ {char.hp_current}/{char.hp_max}"

        with st.container():
            card_l, card_r = st.columns([7, 3])
            with card_l:
                st.markdown(
                    f"<div style='background:#1e1412; border:2px solid #3a2a1a; "
                    f"border-radius:8px; padding:1rem 1.2rem; margin-bottom:0.4rem;'>"
                    f"<span style='color:#C9A84C; font-size:1.05rem; font-weight:600;'>"
                    f"{char.character_name}</span>"
                    f"<span style='color:#9a8878; font-size:0.85rem;'> — {char.player_name}</span>"
                    f"<br><span style='color:#8B9DC3; font-size:0.82rem;'>"
                    f"🎭 {class_level} &nbsp;·&nbsp; {char.race}</span>"
                    f"<br><span style='color:#B0A090; font-size:0.82rem;'>"
                    f"{hp_text} &nbsp;·&nbsp; 🛡️ AC {char.ac}"
                    f" &nbsp;·&nbsp; ⭐ PB {_prof_str(pb)}</span>"
                    f"</div>",
                    unsafe_allow_html=True,
                )
            with card_r:
                st.markdown("")
                toggled = st.session_state.view_char_id == cid
                sheet_label = "▲ Sheet" if toggled else "📋 Sheet"
                if st.button(sheet_label, key=f"view_{cid}", use_container_width=True):
                    st.session_state.view_char_id = None if toggled else cid
                    st.rerun()
                col_e, col_d = st.columns(2)
                with col_e:
                    if st.button("✏️", key=f"edit_{cid}", use_container_width=True, help="Edit"):
                        st.session_state.edit_char_id = cid
                        st.session_state.view_char_id = None
                        st.rerun()
                with col_d:
                    if st.button("🗑️", key=f"del_{cid}", use_container_width=True, help="Delete"):
                        st.session_state.delete_char_id = cid
                        st.rerun()

        # Expanded sheet view
        if st.session_state.view_char_id == cid:
            with st.expander("Character Sheet", expanded=True):
                v1, v2, v3 = st.columns(3)

                with v1:
                    st.markdown("**Ability Scores**")
                    scores_display = [
                        ("STR", char.score_str),
                        ("DEX", char.score_dex),
                        ("CON", char.score_con),
                        ("INT", char.score_int),
                        ("WIS", char.score_wis),
                        ("CHA", char.score_cha),
                    ]
                    for ab_name, score in scores_display:
                        mod = _mod_str(score)
                        st.markdown(
                            f"<span style='color:#8B9DC3;font-weight:600;'>{ab_name}</span> "
                            f"**{score}** <span style='color:#C9A84C;'>({mod})</span>",
                            unsafe_allow_html=True,
                        )

                    st.markdown("")
                    st.markdown("**Saving Throws**")
                    st_profs_view = char.saving_throw_proficiencies or []
                    ab_score_vals = {
                        AbilityScore.STR: char.score_str,
                        AbilityScore.DEX: char.score_dex,
                        AbilityScore.CON: char.score_con,
                        AbilityScore.INT: char.score_int,
                        AbilityScore.WIS: char.score_wis,
                        AbilityScore.CHA: char.score_cha,
                    }
                    for ab, score in ab_score_vals.items():
                        is_prof = ab in st_profs_view or ab.value in st_profs_view
                        base = character_service.ability_modifier(score)
                        total = base + (pb if is_prof else 0)
                        sign = "+" if total >= 0 else ""
                        dot = "●" if is_prof else "○"
                        st.markdown(f"{dot} {_ABILITY_ABBR[ab]}: **{sign}{total}**")

                with v2:
                    st.markdown("**Skills**")
                    stub = _CharStub(char)
                    skill_bonuses = character_service.compute_skill_bonuses(stub)
                    for skill in character_service.SKILLS:
                        bonus = skill_bonuses[skill]
                        prof_level = (char.skill_proficiencies or {}).get(skill, 0)
                        dot = "◆" if prof_level == 2 else ("●" if prof_level == 1 else "○")
                        sign = "+" if bonus >= 0 else ""
                        st.markdown(f"{dot} {sign}{bonus} {skill}")

                with v3:
                    st.markdown("**Combat**")
                    st.markdown(f"❤️ HP: **{char.hp_current} / {char.hp_max}**")
                    st.markdown(f"🛡️ AC: **{char.ac}**")
                    st.markdown(f"👟 Speed: **{char.speed} ft**")
                    st.markdown(f"⭐ Prof. Bonus: **{_prof_str(pb)}**")

                    if char.spell_slots:
                        st.markdown("")
                        st.markdown("**Spell Slots**")
                        st.markdown(_slot_display(char.spell_slots))

                    if char.feats:
                        st.markdown("")
                        st.markdown("**Feats**")
                        for feat in char.feats:
                            st.markdown(f"- {feat}")

                    if char.equipment:
                        st.markdown("")
                        st.markdown("**Equipment**")
                        for item in char.equipment:
                            qty = item.get("quantity", 1)
                            item_notes = item.get("notes", "")
                            line = f"- {item.get('name', '?')} ×{qty}"
                            if item_notes:
                                line += f" *({item_notes})*"
                            st.markdown(line)

                if char.backstory:
                    st.markdown("**Backstory**")
                    st.markdown(char.backstory)
                if char.notes:
                    st.markdown("**DM Notes**")
                    st.caption(char.notes)
