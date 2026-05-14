"""One-shot parser: SRD 5.2.1 equipment.md weapons section -> ItemCreate seed.

Source: downfallx/dnd-5e-srd-markdown (CC-BY-4.0). Run once to regenerate
``integrations/dnd_rules/srd_weapons_2024.py`` after pulling fresh markdown.

Run:
    .venv/Scripts/python.exe scripts/parse_srd_weapons.py
"""

from __future__ import annotations

import re
from pathlib import Path

MD_FILE = Path("scripts/.srd_equipment.md")
OUT_FILE = Path("integrations/dnd_rules/srd_weapons_2024.py")

# Section headers like:
#   <th colspan="6"><em>Simple Melee Weapons</em></th>
# Capture the category from "Simple Melee Weapons" -> "Simple Melee".
SECTION_RE = re.compile(
    r'<th\s+colspan="6"><em>(Simple|Martial)\s+(Melee|Ranged)\s+Weapons</em></th>',
    re.IGNORECASE,
)

# Standalone weapon row: 6 <td> cells.
ROW_RE = re.compile(
    r"<tr>\s*"
    r"<td>([^<]+)</td>\s*"  # name
    r"<td>([^<]+)</td>\s*"  # damage like "1d8 Slashing"
    r"<td>([^<]+)</td>\s*"  # properties
    r"<td>([^<]+)</td>\s*"  # mastery
    r"<td>([^<]+)</td>\s*"  # weight
    r"<td>([^<]+)</td>\s*"  # cost
    r"</tr>",
    re.IGNORECASE,
)

# Damage parsing:
#   "1d8 Slashing" -> ("1d8", "slashing")
#   "1 Piercing"   -> ("1", "piercing")   (Blowgun)
DAMAGE_RE = re.compile(r"^\s*(\d+(?:d\d+)?)\s+([A-Za-z]+)\s*$")

# Property tokens that take a "(Range X/Y[; ammo-type])" or "(1d8)" inline parameter.
RANGE_RE = re.compile(r"\(Range\s+(\d+/\d+)[^)]*\)")
VERSATILE_RE = re.compile(r"Versatile\s*\((\d+d\d+)\)")

# Property tokens we recognize and surface as a list. Strip parens/range.
KNOWN_PROPERTIES = {
    "Ammunition",
    "Finesse",
    "Heavy",
    "Light",
    "Loading",
    "Range",  # appears as standalone occasionally
    "Reach",
    "Thrown",
    "Two-Handed",
    "Versatile",
}

# Coin-to-copper conversion for ``value_gp`` (rounded down).
COIN_TO_CP = {"CP": 1, "SP": 10, "EP": 50, "GP": 100, "PP": 1000}
COST_RE = re.compile(r"^\s*(\d+)\s*(CP|SP|EP|GP|PP)\s*$", re.IGNORECASE)


def parse_cost_to_gp(text: str) -> int:
    """Parse '5 GP' / '1 SP' / '2 CP' / '50 GP' / '—' into GP int (rounded down).

    Args:
        text: Cost field as printed in the SRD table.

    Returns:
        Cost in GP (0 if unparseable or '—').
    """
    m = COST_RE.match(text)
    if not m:
        return 0
    cp = int(m.group(1)) * COIN_TO_CP[m.group(2).upper()]
    return cp // 100


def parse_properties(text: str) -> tuple[list[str], str | None, str | None]:
    """Parse the properties cell.

    Args:
        text: Properties text from the SRD table.

    Returns:
        Tuple of (property names, weapon_range_or_None, versatile_damage_or_None).
    """
    if text.strip() in ("—", "-", ""):
        return [], None, None
    range_match = RANGE_RE.search(text)
    versatile_match = VERSATILE_RE.search(text)
    weapon_range = range_match.group(1) if range_match else None
    versatile = versatile_match.group(1) if versatile_match else None

    # Strip the parens to get clean tokens.
    cleaned = RANGE_RE.sub("", text)
    cleaned = VERSATILE_RE.sub("Versatile", cleaned)
    tokens = [t.strip() for t in cleaned.split(",")]
    props: list[str] = []
    for tok in tokens:
        if not tok:
            continue
        # Drop trailing/leading punctuation
        norm = tok.strip(" .,;:")
        if norm in KNOWN_PROPERTIES and norm not in props:
            props.append(norm)
    return props, weapon_range, versatile


def parse_mastery(text: str) -> str | None:
    """Strip whitespace + dashes from the mastery cell."""
    cleaned = text.strip()
    if cleaned in ("—", "-", ""):
        return None
    return cleaned


def parse() -> list[dict]:
    """Walk the markdown file, return a list of weapon dicts."""
    text = MD_FILE.read_text(encoding="utf-8")
    entries: list[dict] = []
    current_category: str | None = None
    pos = 0
    while pos < len(text):
        section = SECTION_RE.search(text, pos)
        row = ROW_RE.search(text, pos)
        # Pick the earliest of section header or row.
        if section is None and row is None:
            break
        if section is not None and (row is None or section.start() < row.start()):
            current_category = f"{section.group(1).title()} {section.group(2).title()}"
            pos = section.end()
            continue
        assert row is not None
        if current_category is None:
            pos = row.end()
            continue
        # Stop at the magic-weapons table (it doesn't have category headers we care about).
        if not current_category.startswith(("Simple ", "Martial ")):
            pos = row.end()
            continue

        name = row.group(1).strip()
        damage_cell = row.group(2).strip()
        props_cell = row.group(3).strip()
        mastery_cell = row.group(4).strip()
        cost_cell = row.group(6).strip()

        damage_match = DAMAGE_RE.match(damage_cell)
        if not damage_match:
            pos = row.end()
            continue
        damage_die = damage_match.group(1)
        damage_type = damage_match.group(2).lower()

        properties, weapon_range, versatile_damage = parse_properties(props_cell)
        mastery = parse_mastery(mastery_cell)
        value_gp = parse_cost_to_gp(cost_cell)

        entries.append(
            {
                "name": name,
                "rarity": "Common",
                "item_type": "Weapon",
                "value_gp": value_gp,
                "is_magic": False,
                "weapon_category": current_category,
                "damage_die": damage_die,
                "damage_type": damage_type,
                "weapon_properties": properties,
                "versatile_damage": versatile_damage,
                "weapon_range": weapon_range,
                "mastery": mastery,
            }
        )
        pos = row.end()
    return entries


def render(entries: list[dict]) -> str:
    """Render the seed file."""
    header = '''"""SRD 5.5e (2024) weapon catalog — seed data for the items table.

Plan 00018. Each entry is an ItemCreate payload with weapon-specific fields
populated (weapon_category, damage_die, damage_type, weapon_properties,
versatile_damage, weapon_range, mastery).

GENERATED by scripts/parse_srd_weapons.py from the SRD 5.2.1 equipment.md
at downfallx/dnd-5e-srd-markdown (CC-BY-4.0). Re-run the parser after a
fresh markdown pull rather than editing this file by hand.

The SRD 5.2.1 ("System Reference Document 5.2.1") is © Wizards of the
Coast LLC, distributed under CC-BY-4.0. See:
https://creativecommons.org/licenses/by/4.0/
"""

from domain.enums import ItemRarity
from domain.item import ItemCreate

SRD_WEAPONS_2024: list[ItemCreate] = [
'''
    body_lines: list[str] = []
    for e in entries:
        lines = ["    ItemCreate("]
        lines.append(f"        name={e['name']!r},")
        lines.append("        rarity=ItemRarity.COMMON,")
        lines.append("        item_type='Weapon',")
        lines.append(f"        value_gp={e['value_gp']},")
        lines.append(f"        weapon_category={e['weapon_category']!r},")
        lines.append(f"        damage_die={e['damage_die']!r},")
        lines.append(f"        damage_type={e['damage_type']!r},")
        if e["weapon_properties"]:
            lines.append(f"        weapon_properties={e['weapon_properties']!r},")
        if e["versatile_damage"]:
            lines.append(f"        versatile_damage={e['versatile_damage']!r},")
        if e["weapon_range"]:
            lines.append(f"        weapon_range={e['weapon_range']!r},")
        if e["mastery"]:
            lines.append(f"        mastery={e['mastery']!r},")
        lines.append("    ),")
        body_lines.append("\n".join(lines))
    footer = '''
]
"""Validated weapon ItemCreate payloads parsed from the SRD 5.2.1."""
'''
    return header + "\n".join(body_lines) + footer


def main() -> None:
    """Run the parser and write the seed file."""
    if not MD_FILE.exists():
        raise SystemExit(f"Source file {MD_FILE} not found. Download it first via curl.")
    entries = parse()
    OUT_FILE.write_text(render(entries), encoding="utf-8")
    print(f"Parsed {len(entries)} weapons -> {OUT_FILE}")


if __name__ == "__main__":
    main()
