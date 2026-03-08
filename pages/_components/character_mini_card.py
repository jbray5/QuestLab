"""Character mini card component — compact PC card for session and encounter views.

Usage::

    from pages._components.character_mini_card import render_character_mini_card
    render_character_mini_card(pc)
"""

import streamlit as st

from domain.character import PlayerCharacter


def render_character_mini_card(pc: PlayerCharacter, *, show_stats: bool = True) -> None:
    """Render a compact player character card.

    Displays name, class/race, HP bar, AC, and key ability scores.
    Suitable for session runner sidebar and encounter participant lists.

    Args:
        pc: PlayerCharacter domain object to render.
        show_stats: If True, render ability score row beneath the HP bar.
    """
    hp_pct = max(0, min(100, int(pc.hp_current / max(pc.hp_max, 1) * 100)))
    hp_color = "#4caf50" if hp_pct > 50 else ("#ffc107" if hp_pct > 20 else "#f44336")

    scores_html = ""
    if show_stats:
        abbrs = ["STR", "DEX", "CON", "INT", "WIS", "CHA"]
        vals = [
            pc.score_str,
            pc.score_dex,
            pc.score_con,
            pc.score_int,
            pc.score_wis,
            pc.score_cha,
        ]

        def _mod(s: int) -> str:
            """Return a signed modifier string for an ability score."""
            m = (s - 10) // 2
            return f"+{m}" if m >= 0 else str(m)

        cells = "".join(
            f"<td style='text-align:center; padding:0 0.3rem;'>"
            f"<div style='color:#8B9DC3; font-size:0.65rem;'>{a}</div>"
            f"<div style='color:#F5E6C8; font-family:\"Share Tech Mono\",monospace; font-size:0.8rem;'>"  # noqa: E501
            f"{_mod(v)}</div></td>"
            for a, v in zip(abbrs, vals)
        )
        scores_html = (  # noqa: E501
            f"<table style='width:100%; border-collapse:collapse; margin-top:0.4rem;'>"
            f"<tr>{cells}</tr></table>"
        )

    html = f"""
<div style="background:#1C1408; border:1px solid #C9A84C44; border-radius:6px;
  padding:0.6rem 0.9rem; margin-bottom:0.5rem;">
  <div style="display:flex; justify-content:space-between; align-items:baseline;">
    <span style="font-family:'Cinzel Decorative',serif; color:#C9A84C; font-size:0.9rem;">
      {pc.character_name}
    </span>
    <span style="font-family:'Share Tech Mono',monospace; color:#8B9DC3; font-size:0.75rem;">
      AC {pc.ac}
    </span>
  </div>
  <div style="color:#B0A090; font-size:0.78rem; margin:0.1rem 0 0.4rem;">
    {pc.race or ''}
  </div>
  <div style="background:#0D0D0D; border-radius:3px; height:8px; overflow:hidden;">
    <div style="width:{hp_pct}%; background:{hp_color}; height:100%;
      border-radius:3px; transition:width 0.3s;"></div>
  </div>
  <div style="display:flex; justify-content:space-between; font-size:0.72rem;
    font-family:'Share Tech Mono',monospace; color:#B0A090; margin-top:0.2rem;">
    <span>HP</span>
    <span>{pc.hp_current} / {pc.hp_max}</span>
  </div>
  {scores_html}
</div>
"""
    st.markdown(html, unsafe_allow_html=True)
