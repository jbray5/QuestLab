"""Dice roller component — animated d20 roll widget.

Renders a button that triggers a d20 roll with a CSS spin animation.
Result is displayed inline using Streamlit session_state.

Usage::

    from pages._components.dice_roller import render_dice_roller
    result = render_dice_roller(key="my_roll", label="Roll Check")
    if result:
        st.write(f"You rolled: {result}")
"""

import random

import streamlit as st


def render_dice_roller(
    key: str,
    label: str = "🎲 Roll d20",
    modifier: int = 0,
) -> int | None:
    """Render an animated d20 roller button.

    Clicking the button rolls 1d20, applies the modifier, stores the result
    in session_state, and triggers a rerun to display the animation.

    Args:
        key: Unique session_state key for this roller instance.
        label: Button label text.
        modifier: Integer modifier to add to the d20 result (can be negative).

    Returns:
        The total roll result (1–20 + modifier) if a result is stored,
        else None if not yet rolled.
    """
    roll_key = f"_dice_{key}_roll"
    raw_key = f"_dice_{key}_raw"

    if roll_key not in st.session_state:
        st.session_state[roll_key] = None
        st.session_state[raw_key] = None

    col_btn, col_result = st.columns([1, 2])

    with col_btn:
        if st.button(label, key=f"_dice_{key}_btn", use_container_width=True):
            raw = random.randint(1, 20)
            st.session_state[raw_key] = raw
            st.session_state[roll_key] = raw + modifier
            st.rerun()

    with col_result:
        if st.session_state[roll_key] is not None:
            raw = st.session_state[raw_key]
            total = st.session_state[roll_key]
            nat_color = "#C9A84C" if raw == 20 else ("#f44336" if raw == 1 else "#F5E6C8")
            nat_label = " ✨ NAT 20!" if raw == 20 else (" 💀 NAT 1" if raw == 1 else "")
            mod_str = (
                f" + {modifier}"
                if modifier > 0
                else (f" − {abs(modifier)}" if modifier < 0 else "")
            )
            st.markdown(
                f"<div class='dice-rolling' style='font-family:\"Share Tech Mono\",monospace;"
                f" font-size:1.3rem; color:{nat_color}; padding:0.2rem 0;'>"
                f"🎲 {raw}{mod_str} = <strong>{total}</strong>{nat_label}</div>",
                unsafe_allow_html=True,
            )

    return st.session_state[roll_key]
