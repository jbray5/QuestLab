"""Maps page — interactive SVG node-graph map builder for dungeon/overworld maps.

Receives adventure_id via URL query param: ?adventure_id=<uuid>
UI only. All business logic is in services.map_service.

Interaction model:
  - Click an empty cell to create a node there.
  - Click an existing node to select it; click a second to connect them.
  - Sidebar shows selected node details and all node/edge lists.
"""

import uuid
from html import escape

import streamlit as st
from dotenv import load_dotenv

from db.base import get_session
from domain.enums import MapNodeType
from domain.map import MapEdgeUpdate, MapNodeUpdate, MapUpdate
from integrations.identity import get_current_user_email
from services import adventure_service, campaign_service, map_service

load_dotenv()

st.set_page_config(page_title="Maps · QuestLab", page_icon="🗺️", layout="wide")

# ── Auth ───────────────────────────────────────────────────────────────────────
try:
    dm_email = get_current_user_email()
except PermissionError as exc:
    st.error(str(exc))
    st.stop()

# ── Adventure context ──────────────────────────────────────────────────────────
adventure_id_str = st.query_params.get("adventure_id") or st.session_state.get("nav_adventure_id")
if not adventure_id_str:
    st.error("No adventure selected. Please go back and choose one.")
    if st.button("← Back to Adventures"):
        st.switch_page("pages/adventures.py")
    st.stop()

try:
    adventure_id = uuid.UUID(adventure_id_str)
except ValueError:
    st.error("Invalid adventure ID in URL.")
    st.stop()

try:
    with next(get_session()) as db:
        adventure = adventure_service.get_adventure(db, adventure_id, dm_email)
        campaign = campaign_service.get_campaign(db, adventure.campaign_id, dm_email)
except (ValueError, PermissionError) as exc:
    st.error(str(exc))
    st.stop()

# ── Session state ──────────────────────────────────────────────────────────────
if "map_selected_node_id" not in st.session_state:
    st.session_state.map_selected_node_id = None
if "map_connecting_from_id" not in st.session_state:
    st.session_state.map_connecting_from_id = None
if "map_show_create_form" not in st.session_state:
    st.session_state.map_show_create_form = False
if "map_pending_cell" not in st.session_state:
    st.session_state.map_pending_cell = None

# ── Node type colours and emojis ───────────────────────────────────────────────
_NODE_COLOR = {
    MapNodeType.ROOM: "#4a3a1a",
    MapNodeType.CORRIDOR: "#2a3a2a",
    MapNodeType.OUTDOOR: "#1a3a1a",
    MapNodeType.SETTLEMENT: "#2a1a4a",
    MapNodeType.DUNGEON: "#3a1a1a",
    MapNodeType.LAIR: "#4a1a2a",
}
_NODE_BORDER = {
    MapNodeType.ROOM: "#C9A84C",
    MapNodeType.CORRIDOR: "#7a9a5a",
    MapNodeType.OUTDOOR: "#5a9a4a",
    MapNodeType.SETTLEMENT: "#9a7acf",
    MapNodeType.DUNGEON: "#cf5a5a",
    MapNodeType.LAIR: "#cf4a7a",
}
_NODE_EMOJI = {
    MapNodeType.ROOM: "🚪",
    MapNodeType.CORRIDOR: "🔀",
    MapNodeType.OUTDOOR: "🌲",
    MapNodeType.SETTLEMENT: "🏘️",
    MapNodeType.DUNGEON: "💀",
    MapNodeType.LAIR: "🐉",
}
_CELL_PX = 48  # pixels per grid cell

# ── Header ─────────────────────────────────────────────────────────────────────
col_back, _ = st.columns([1, 4])
with col_back:
    if st.button("← Adventures"):
        st.session_state["nav_campaign_id"] = str(campaign.id)
        st.query_params["campaign_id"] = str(campaign.id)
        st.switch_page("pages/adventures.py")

st.markdown(
    "<h1 style='font-family:\"Cinzel Decorative\",serif; color:#C9A84C;'>🗺️ Map Builder</h1>",
    unsafe_allow_html=True,
)
st.markdown(
    f"<p style='color:#8B9DC3; font-size:1.05rem; margin-top:-0.5rem;'>"
    f"Adventure: <strong>{adventure.title}</strong> &nbsp;·&nbsp; "
    f"Campaign: <em style='color:#B0A090;'>{campaign.name}</em></p>",
    unsafe_allow_html=True,
)
st.divider()

# ── Load / create map ──────────────────────────────────────────────────────────
with next(get_session()) as db:
    maps = map_service.list_maps(db, adventure_id, dm_email)

if not maps:
    st.info("No map yet for this adventure.")
    with st.form("create_map_form"):
        st.markdown("**Create Map**")
        m_name = st.text_input("Map Name*", value="Dungeon Level 1", max_chars=200)
        c1, c2 = st.columns(2)
        with c1:
            m_w = st.slider("Grid Width", min_value=5, max_value=50, value=20)
        with c2:
            m_h = st.slider("Grid Height", min_value=5, max_value=50, value=20)
        if st.form_submit_button("Create Map", type="primary"):
            if not m_name.strip():
                st.error("Name is required.")
            else:
                try:
                    with next(get_session()) as db:
                        map_service.create_map(
                            db,
                            adventure_id=adventure_id,
                            name=m_name,
                            dm_email=dm_email,
                            grid_width=m_w,
                            grid_height=m_h,
                        )
                    st.rerun()
                except (ValueError, PermissionError) as e:
                    st.error(str(e))
    st.stop()

current_map = maps[0]
map_id = current_map.id

with next(get_session()) as db:
    nodes = map_service.list_nodes(db, map_id, dm_email)
    edges = map_service.list_edges(db, map_id, dm_email)

# Index for fast lookups
node_by_id = {n.id: n for n in nodes}
node_at = {(n.x, n.y): n for n in nodes}

# ── Layout: map canvas left, sidebar right ─────────────────────────────────────
col_canvas, col_sidebar = st.columns([4, 2])

# ── Sidebar ────────────────────────────────────────────────────────────────────
with col_sidebar:
    st.markdown(f"### {current_map.name}")

    # Map settings
    with st.expander("⚙️ Map Settings"):
        with st.form("map_settings_form"):
            new_name = st.text_input("Name", value=current_map.name, max_chars=200)
            new_bg = st.color_picker("Background", value=current_map.background_color)
            saved = st.form_submit_button("Save", type="primary")
            if saved:
                try:
                    with next(get_session()) as db:
                        map_service.update_map(
                            db, map_id, dm_email, MapUpdate(name=new_name, background_color=new_bg)
                        )
                    st.rerun()
                except (ValueError, PermissionError) as e:
                    st.error(str(e))
        if st.button("🗑️ Delete Map", type="secondary"):
            try:
                with next(get_session()) as db:
                    map_service.delete_map(db, map_id, dm_email)
                st.rerun()
            except (ValueError, PermissionError) as e:
                st.error(str(e))

    st.divider()

    # Connection mode status
    if st.session_state.map_connecting_from_id:
        from_node = node_by_id.get(st.session_state.map_connecting_from_id)
        from_label = from_node.label if from_node else "?"
        st.warning(f"🔗 Connecting from **{from_label}** — click another node to connect.")
        if st.button("Cancel Connection"):
            st.session_state.map_connecting_from_id = None
            st.rerun()
        st.divider()

    # Selected node detail
    sel_id = st.session_state.map_selected_node_id
    if sel_id and sel_id in node_by_id:
        sel = node_by_id[sel_id]
        st.markdown(f"**Selected: {_NODE_EMOJI.get(sel.node_type, '')} {sel.label}**")
        st.markdown(
            f"<span style='color:#8B9DC3; font-size:0.85rem;'>"
            f"Type: {sel.node_type.value} · Position: ({sel.x}, {sel.y})</span>",
            unsafe_allow_html=True,
        )
        if sel.description:
            st.markdown(f"*{sel.description}*")
        if sel.notes:
            st.info(sel.notes)

        with st.expander("✏️ Edit Node"):
            with st.form(f"edit_node_{sel_id}"):
                e_label = st.text_input("Label", value=sel.label, max_chars=100)
                e_type = st.selectbox(
                    "Type",
                    options=list(MapNodeType),
                    index=list(MapNodeType).index(sel.node_type),
                    format_func=lambda t: f"{_NODE_EMOJI[t]} {t.value}",
                )
                e_desc = st.text_area("Description", value=sel.description or "", height=60)
                e_notes = st.text_area("DM Notes", value=sel.notes or "", height=60)
                col_sv, col_dl = st.columns(2)
                with col_sv:
                    do_save = st.form_submit_button(
                        "Save", type="primary", use_container_width=True
                    )
                with col_dl:
                    do_delete = st.form_submit_button("Delete", use_container_width=True)

            if do_save:
                try:
                    with next(get_session()) as db:
                        map_service.update_node(
                            db,
                            sel_id,
                            dm_email,
                            MapNodeUpdate(
                                label=e_label,
                                node_type=e_type,
                                description=e_desc or None,
                                notes=e_notes or None,
                            ),
                        )
                    st.session_state.map_selected_node_id = None
                    st.rerun()
                except (ValueError, PermissionError) as e:
                    st.error(str(e))
            if do_delete:
                try:
                    with next(get_session()) as db:
                        map_service.delete_node(db, sel_id, dm_email)
                    st.session_state.map_selected_node_id = None
                    st.rerun()
                except (ValueError, PermissionError) as e:
                    st.error(str(e))

        col_c1, col_c2 = st.columns(2)
        with col_c1:
            if st.button("🔗 Connect →", use_container_width=True):
                st.session_state.map_connecting_from_id = sel_id
                st.session_state.map_selected_node_id = None
                st.rerun()
        with col_c2:
            if st.button("Deselect", use_container_width=True):
                st.session_state.map_selected_node_id = None
                st.rerun()

    # Create node form (triggered by cell click)
    if st.session_state.map_pending_cell:
        cx, cy = st.session_state.map_pending_cell
        st.markdown(f"**New Node at ({cx}, {cy})**")
        with st.form("create_node_form"):
            n_label = st.text_input("Label*", max_chars=100, placeholder="Entry Hall")
            n_type = st.selectbox(
                "Type",
                options=list(MapNodeType),
                format_func=lambda t: f"{_NODE_EMOJI[t]} {t.value}",
            )
            n_desc = st.text_area("Description (optional)", height=60)
            col_ok, col_cancel = st.columns(2)
            with col_ok:
                submitted = st.form_submit_button(
                    "Place Node", type="primary", use_container_width=True
                )
            with col_cancel:
                cancelled = st.form_submit_button("Cancel", use_container_width=True)

        if submitted:
            if not n_label.strip():
                st.error("Label is required.")
            else:
                try:
                    with next(get_session()) as db:
                        map_service.create_node(
                            db,
                            map_id=map_id,
                            label=n_label,
                            node_type=n_type,
                            x=cx,
                            y=cy,
                            dm_email=dm_email,
                            description=n_desc or None,
                        )
                    st.session_state.map_pending_cell = None
                    st.rerun()
                except (ValueError, PermissionError) as e:
                    st.error(str(e))
        if cancelled:
            st.session_state.map_pending_cell = None
            st.rerun()

    st.divider()

    # Edge list
    st.markdown(f"**Connections ({len(edges)})**")
    if edges:
        for edge in edges:
            fn = node_by_id.get(edge.from_node_id)
            tn = node_by_id.get(edge.to_node_id)
            if fn and tn:
                secret_badge = " 🔒" if edge.is_secret else ""
                edge_label = f" *({edge.label})*" if edge.label else ""
                with st.expander(
                    f"{fn.label} → {tn.label}{edge_label}{secret_badge}", expanded=False
                ):
                    with st.form(f"edge_form_{edge.id}"):
                        e_lbl = st.text_input("Label", value=edge.label or "", max_chars=100)
                        e_sec = st.checkbox("Secret passage", value=edge.is_secret)
                        col_sv, col_dl = st.columns(2)
                        with col_sv:
                            do_sv = st.form_submit_button(
                                "Save", type="primary", use_container_width=True
                            )
                        with col_dl:
                            do_dl = st.form_submit_button("Delete", use_container_width=True)
                    if do_sv:
                        try:
                            with next(get_session()) as db:
                                map_service.update_edge(
                                    db,
                                    edge.id,
                                    dm_email,
                                    MapEdgeUpdate(label=e_lbl or None, is_secret=e_sec),
                                )
                            st.rerun()
                        except (ValueError, PermissionError) as ex:
                            st.error(str(ex))
                    if do_dl:
                        try:
                            with next(get_session()) as db:
                                map_service.delete_edge(db, edge.id, dm_email)
                            st.rerun()
                        except (ValueError, PermissionError) as ex:
                            st.error(str(ex))
    else:
        st.caption("No connections yet. Select a node and click 🔗 Connect →")

    st.divider()
    # Node list
    st.markdown(f"**Nodes ({len(nodes)})**")
    for node in nodes:
        emoji = _NODE_EMOJI.get(node.node_type, "")
        enc_badge = " ⚔️" if node.encounter_id else ""
        if st.button(
            f"{emoji} {node.label}{enc_badge} ({node.x},{node.y})",
            key=f"nodelist_{node.id}",
            use_container_width=True,
        ):
            st.session_state.map_selected_node_id = node.id
            st.rerun()

# ── SVG Map Canvas ─────────────────────────────────────────────────────────────
with col_canvas:
    st.markdown("**Map Grid** — click an empty cell to place a node, click a node to select it.")
    st.caption(
        f"Grid: {current_map.grid_width}×{current_map.grid_height} cells · "
        f"{len(nodes)} nodes · {len(edges)} connections"
    )

    # Build edge lines (SVG lines between node centres)
    edge_svg_lines = []
    for edge in edges:
        fn = node_by_id.get(edge.from_node_id)
        tn = node_by_id.get(edge.to_node_id)
        if fn and tn:
            x1 = fn.x * _CELL_PX + _CELL_PX // 2
            y1 = fn.y * _CELL_PX + _CELL_PX // 2
            x2 = tn.x * _CELL_PX + _CELL_PX // 2
            y2 = tn.y * _CELL_PX + _CELL_PX // 2
            color = "#cf4a4a" if edge.is_secret else "#C9A84C"
            dash = "stroke-dasharray='6,4'" if edge.is_secret else ""
            label_html = ""
            if edge.label:
                mx, my = (x1 + x2) // 2, (y1 + y2) // 2
                safe = escape(edge.label[:12])
                label_html = (
                    f"<text x='{mx}' y='{my - 4}' fill='#aaaaaa' font-size='9' "
                    f"text-anchor='middle'>{safe}</text>"
                )
            edge_svg_lines.append(
                f"<line x1='{x1}' y1='{y1}' x2='{x2}' y2='{y2}' "
                f"stroke='{color}' stroke-width='2' {dash}/>" + label_html
            )

    # Build clickable cell buttons using Streamlit columns
    # Render SVG overlay first, then interactive grid below
    svg_w = current_map.grid_width * _CELL_PX
    svg_h = current_map.grid_height * _CELL_PX

    # Build node rectangles for SVG display
    node_rects = []
    for node in nodes:
        nx = node.x * _CELL_PX
        ny = node.y * _CELL_PX
        bg = _NODE_COLOR.get(node.node_type, "#2a2a2a")
        border = _NODE_BORDER.get(node.node_type, "#C9A84C")
        is_selected = str(node.id) == str(st.session_state.map_selected_node_id)
        is_connect_src = str(node.id) == str(st.session_state.map_connecting_from_id)
        if is_selected:
            border = "#ffffff"
        elif is_connect_src:
            border = "#00ffaa"
        safe_label = escape(node.label[:8])
        emoji = _NODE_EMOJI.get(node.node_type, "")
        enc_dot = "<circle cx='42' cy='6' r='4' fill='#cf4a4a'/>" if node.encounter_id else ""
        node_rects.append(
            f"<rect x='{nx+1}' y='{ny+1}' width='{_CELL_PX-2}' height='{_CELL_PX-2}' "
            f"rx='4' fill='{bg}' stroke='{border}' stroke-width='2'/>"
            f"<text x='{nx + _CELL_PX//2}' y='{ny + 16}' fill='#ffffff' font-size='12' "
            f"text-anchor='middle'>{emoji}</text>"
            f"<text x='{nx + _CELL_PX//2}' y='{ny + 30}' fill='#e0d0b0' font-size='8' "
            f"text-anchor='middle' font-weight='bold'>{safe_label}</text>" + enc_dot
        )

    # Grid lines
    grid_lines = []
    for gx in range(current_map.grid_width + 1):
        px = gx * _CELL_PX
        grid_lines.append(
            f"<line x1='{px}' y1='0' x2='{px}' y2='{svg_h}' "
            f"stroke='#2a2a3a' stroke-width='0.5'/>"
        )
    for gy in range(current_map.grid_height + 1):
        py = gy * _CELL_PX
        grid_lines.append(
            f"<line x1='0' y1='{py}' x2='{svg_w}' y2='{py}' "
            f"stroke='#2a2a3a' stroke-width='0.5'/>"
        )

    svg_html = (
        f"<div style='overflow:auto; max-height:520px; border:2px solid #3a2a1a; "
        f"border-radius:8px; background:{current_map.background_color};'>"
        f"<svg width='{svg_w}' height='{svg_h}' xmlns='http://www.w3.org/2000/svg'>"
        + "".join(grid_lines)
        + "".join(edge_svg_lines)
        + "".join(node_rects)
        + "</svg></div>"
    )
    st.markdown(svg_html, unsafe_allow_html=True)

    st.markdown("")
    st.markdown("**Place or Select Node**")
    st.caption("Enter grid coordinates to click a cell:")

    inp_col1, inp_col2, inp_col3 = st.columns([1, 1, 2])
    with inp_col1:
        click_x = st.number_input(
            "X (col)", min_value=0, max_value=current_map.grid_width - 1, value=0, key="click_x"
        )
    with inp_col2:
        click_y = st.number_input(
            "Y (row)", min_value=0, max_value=current_map.grid_height - 1, value=0, key="click_y"
        )
    with inp_col3:
        st.markdown("<div style='margin-top:1.6rem;'></div>", unsafe_allow_html=True)
        if st.button("Select Cell", use_container_width=True):
            cx, cy = int(click_x), int(click_y)
            if (cx, cy) in node_at:
                # Select the existing node
                clicked_node = node_at[(cx, cy)]
                if st.session_state.map_connecting_from_id:
                    # Complete connection
                    from_id = st.session_state.map_connecting_from_id
                    if from_id != clicked_node.id:
                        try:
                            with next(get_session()) as db:
                                map_service.create_edge(
                                    db, map_id, from_id, clicked_node.id, dm_email
                                )
                        except (ValueError, PermissionError) as e:
                            st.error(str(e))
                    st.session_state.map_connecting_from_id = None
                else:
                    st.session_state.map_selected_node_id = clicked_node.id
                    st.session_state.map_pending_cell = None
            else:
                # Empty cell — open create form
                st.session_state.map_pending_cell = (cx, cy)
                st.session_state.map_selected_node_id = None
                st.session_state.map_connecting_from_id = None
            st.rerun()

    # Legend
    st.markdown("")
    st.markdown("**Legend**")
    leg_cols = st.columns(3)
    for i, ntype in enumerate(MapNodeType):
        with leg_cols[i % 3]:
            emoji = _NODE_EMOJI[ntype]
            st.markdown(
                f"<span style='background:{_NODE_COLOR[ntype]}; border:1px solid "
                f"{_NODE_BORDER[ntype]}; padding:2px 8px; border-radius:4px; "
                f"font-size:0.75rem; color:#e0d0b0;'>{emoji} {ntype.value}</span>",
                unsafe_allow_html=True,
            )
