"""Loot card component — styled loot/treasure reveal display.

Usage::

    from pages._components.loot_card import render_loot_card
    render_loot_card(loot_items, gp_value=150, notes="Hidden chest in alcove")
"""

from typing import Optional

import streamlit as st


def render_loot_card(
    items: list[dict],
    *,
    gp_value: int = 0,
    notes: Optional[str] = None,
    title: str = "💰 Loot",
) -> None:
    """Render a styled loot reward card.

    Displays a treasure chest-themed card with item list, GP value,
    and optional DM notes.

    Args:
        items: List of loot item dicts, each with at least a ``name`` key.
            Optional keys: ``quantity``, ``rarity``, ``description``.
        gp_value: Total gold piece value of the loot.
        notes: Optional DM note displayed at the bottom of the card.
        title: Card heading text.
    """
    _RARITY_COLOR = {
        "common": "#B0A090",
        "uncommon": "#4caf50",
        "rare": "#2196F3",
        "very rare": "#9C27B0",
        "legendary": "#FF9800",
        "artifact": "#f44336",
    }

    items_html = ""
    for item in items:
        name = item.get("name", "Unknown Item")
        qty = item.get("quantity", 1)
        rarity = item.get("rarity", "common").lower()
        desc = item.get("description", "")
        color = _RARITY_COLOR.get(rarity, "#B0A090")
        qty_str = f" ×{qty}" if qty > 1 else ""
        desc_str = (
            f"<br><span style='color:#8B9DC3; font-size:0.8rem;'>{desc}</span>" if desc else ""
        )
        items_html += (
            f"<div style='padding:0.3rem 0; border-bottom:1px solid #2D1B4E44;'>"
            f"<span style='color:{color}; font-weight:600;'>{name}</span>"
            f'<span style=\'color:#B0A090; font-family:"Share Tech Mono",monospace;'
            f" font-size:0.8rem;'>{qty_str}</span>"
            f"<span style='color:{color}; font-size:0.7rem; margin-left:0.5rem;"
            f" text-transform:uppercase; letter-spacing:0.08em;'>[{rarity}]</span>"
            f"{desc_str}</div>"
        )

    if not items_html:
        items_html = "<div style='color:#B0A090; font-style:italic;'>No items.</div>"

    gp_html = ""
    if gp_value:
        gp_html = (
            f"<div style='margin-top:0.6rem; padding-top:0.4rem;"
            f" border-top:1px solid #C9A84C44; text-align:right;'>"
            f"<span style='color:#B0A090; font-size:0.85rem;'>Total value: </span>"
            f'<span style=\'color:#C9A84C; font-family:"Share Tech Mono",monospace;'
            f" font-size:1rem; font-weight:600;'>{gp_value:,} gp</span></div>"
        )

    notes_html = ""
    if notes:
        notes_html = (
            f"<div style='margin-top:0.5rem; padding:0.4rem 0.6rem;"
            f" background:#1E1E2E; border-radius:4px; color:#8B9DC3;"
            f" font-size:0.82rem; font-style:italic;'>📝 {notes}</div>"
        )

    html = f"""
<div style="background:linear-gradient(135deg,#1C1408,#221A0A,#1C1408);
  border:1px solid #C9A84C66; border-radius:6px; padding:1rem 1.25rem;
  box-shadow:inset 0 0 30px #00000055, 0 2px 12px #C9A84C11;">
  <div style="font-family:'Cinzel Decorative',serif; color:#C9A84C;
    font-size:1rem; margin-bottom:0.6rem;">{title}</div>
  {items_html}
  {gp_html}
  {notes_html}
</div>
"""
    st.markdown(html, unsafe_allow_html=True)
