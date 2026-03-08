"""Stat block card component — renders a D&D 5e-style monster stat block.

Emits HTML styled to match the .stat-block CSS class defined in main.css.
Usage::

    from pages._components.stat_block_card import render_stat_block_card
    render_stat_block_card(monster)
"""

import streamlit as st

from domain.monster import Monster


def render_stat_block_card(monster: Monster) -> None:
    """Render a formatted 5e-style stat block for a monster.

    Matches the visual layout of the D&D Beyond / Player's Handbook stat block:
    name, type/size, AC/HP/Speed, ability scores, traits, actions.

    Args:
        monster: Monster domain object to render.
    """
    scores = {
        "STR": monster.score_str,
        "DEX": monster.score_dex,
        "CON": monster.score_con,
        "INT": monster.score_int,
        "WIS": monster.score_wis,
        "CHA": monster.score_cha,
    }

    def _mod(score: int) -> str:
        """Format an ability score modifier with sign."""
        m = (score - 10) // 2
        return f"+{m}" if m >= 0 else str(m)

    score_cells = "".join(
        f"<td style='text-align:center; padding:0 0.6rem;'>"
        f"<div style='color:#B0A090; font-size:0.7rem; letter-spacing:0.1em;'>{abbr}</div>"
        f"<div style='color:#F5E6C8; font-family:\"Share Tech Mono\",monospace;'>"
        f"{score} ({_mod(score)})</div></td>"
        for abbr, score in scores.items()
    )

    traits_html = ""
    for trait in monster.traits or []:
        name = trait.get("name", "")
        desc = trait.get("description", "")
        traits_html += (
            f"<p style='margin:0.4rem 0;'>" f"<em style='color:#C9A84C;'>{name}.</em> {desc}</p>"
        )

    actions_html = ""
    for action in monster.actions or []:
        name = action.get("name", "")
        desc = action.get("description", "")
        actions_html += (
            f"<p style='margin:0.4rem 0;'>" f"<em style='color:#C9A84C;'>{name}.</em> {desc}</p>"
        )

    cr_display = str(monster.challenge_rating) if monster.challenge_rating is not None else "—"
    xp_display = f"{monster.xp_value:,}" if monster.xp_value else "—"
    hd_html = (
        f' <span style="color:#8B9DC3;">({monster.hit_dice})</span>' if monster.hit_dice else ""
    )
    traits_block = f'<div style="margin-top:0.6rem;">{traits_html}</div>' if traits_html else ""
    actions_label = (
        "<p style=\"color:#C9A84C; font-family:'Cinzel Decorative',serif;"
        ' margin:0.6rem 0 0.2rem; font-size:0.85rem; letter-spacing:0.1em;">ACTIONS</p>'
    )
    actions_block = (actions_label + actions_html) if actions_html else ""
    hr = (
        '<hr style="height:3px; background:linear-gradient(to right,#8B0000,#C9A84C,#8B0000);'
        ' border:none; margin:0.5rem 0;">'
    )

    html = f"""
<div class="stat-block">
  <h3 style="font-family:'Cinzel Decorative',serif; color:#8B0000; margin:0 0 0.1rem;">
    {monster.name}
  </h3>
  <p style="color:#B0A090; font-style:italic; margin:0 0 0.5rem; font-size:0.9rem;">
    {monster.size or ''} {monster.monster_type or ''}
    {(' — ' + monster.alignment) if monster.alignment else ''}
  </p>
  {hr}
  <p style="margin:0.25rem 0;"><strong style="color:#C9A84C;">Armor Class</strong>
    <span style="font-family:'Share Tech Mono',monospace;"> {monster.armor_class}</span></p>
  <p style="margin:0.25rem 0;"><strong style="color:#C9A84C;">Hit Points</strong>
    <span style="font-family:'Share Tech Mono',monospace;"> {monster.hit_points}</span>
    {hd_html}</p>
  <p style="margin:0.25rem 0;"><strong style="color:#C9A84C;">Speed</strong>
    <span style="font-family:'Share Tech Mono',monospace;"> {monster.speed or '—'}</span></p>
  {hr}
  <table style="width:100%; border-collapse:collapse;">
    <tr>{score_cells}</tr>
  </table>
  {hr}
  <p style="margin:0.25rem 0;"><strong style="color:#C9A84C;">Challenge</strong>
    <span style="font-family:'Share Tech Mono',monospace;">
      {cr_display} ({xp_display} XP)</span></p>
  {traits_block}
  {actions_block}
</div>
"""
    st.markdown(html, unsafe_allow_html=True)
