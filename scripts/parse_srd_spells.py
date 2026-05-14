"""One-shot parser: SRD 5.2.1 spells.md -> SpellCreate seed file.

Source: downfallx/dnd-5e-srd-markdown (CC-BY-4.0, includes 2024 SRD 5.2.1).
This script is NOT part of the runtime app. Run it once to regenerate
``integrations/dnd_rules/srd_spells_2024.py`` after pulling fresh markdown.

Run:
    .venv/Scripts/python.exe scripts/parse_srd_spells.py

Usage notes:
- Reads /tmp/srd_spells.md (you must download it first via curl).
- Writes integrations/dnd_rules/srd_spells_2024.py.
- Idempotent — re-runs replace the file from scratch.
- Mechanical hints (damage_dice, save_ability, attack_type) are best-effort
  pattern matches against the prose; they're nice-to-haves, not required.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

MD_FILE = Path("scripts/.srd_spells.md")  # local cache, not committed
OUT_FILE = Path("integrations/dnd_rules/srd_spells_2024.py")

# ── Patterns ────────────────────────────────────────────────────────────────

# Spell heading: "#### Acid Splash" (level-4 heading, after the Spell Descriptions section)
HEADING_RE = re.compile(r"^####\s+([A-Z][^\n]+?)\s*$")

# Type line variants:
#   _Evocation Cantrip (Sorcerer, Wizard)_
#   _Level 1 Abjuration (Cleric, Paladin)_
#   _Conjuration Cantrip (Druid)_
TYPE_CANTRIP_RE = re.compile(r"^_([A-Z][a-z]+)\s+Cantrip\s*\(([^)]+)\)_\s*$")
TYPE_LEVELED_RE = re.compile(r"^_Level\s+(\d+)\s+([A-Z][a-z]+)\s*\(([^)]+)\)_\s*$")

# Field lines
CASTING_RE = re.compile(r"^\*\*Casting Time:\*\*\s*(.+?)\s*$")
RANGE_RE = re.compile(r"^\*\*Range:\*\*\s*(.+?)\s*$")
COMPONENTS_RE = re.compile(r"^\*\*Components:\*\*\s*(.+?)\s*$")
DURATION_RE = re.compile(r"^\*\*Duration:\*\*\s*(.+?)\s*$")

# Higher-levels markers
HIGHER_RE = re.compile(r"^_(Cantrip Upgrade|Using a Higher-Level Spell Slot)\._\s*(.*)$")

# Mechanical hints — prose pattern matchers (all optional)
DAMAGE_DICE_RE = re.compile(r"\b(\d+d\d+(?:\s*\+\s*\d+)?)\b")
DAMAGE_TYPE_RE = re.compile(
    r"\b(Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|"
    r"Psychic|Radiant|Slashing|Thunder)\s+damage\b"
)
SAVE_RE = re.compile(
    r"\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw\b"
)
ATTACK_RE = re.compile(r"\b(ranged|melee)\s+spell attack\b", re.IGNORECASE)

# Ability label shortener for save_ability
SAVE_SHORT = {
    "Strength": "STR",
    "Dexterity": "DEX",
    "Constitution": "CON",
    "Intelligence": "INT",
    "Wisdom": "WIS",
    "Charisma": "CHA",
}


def parse_components(text: str) -> tuple[bool, bool, Optional[str]]:
    """Parse "V, S, M (material text)" into (v, s, material_or_None)."""
    v = "V" in text.split("(")[0]
    s = "S" in text.split("(")[0]
    m_text: Optional[str] = None
    paren = re.search(r"M\s*\(([^)]+)\)", text)
    if paren:
        m_text = paren.group(1).strip()
    return v, s, m_text


def detect_damage(description: str) -> tuple[Optional[str], Optional[str]]:
    """Best-effort extraction of (damage_dice, damage_type) from the prose."""
    type_match = DAMAGE_TYPE_RE.search(description)
    if not type_match:
        return None, None
    damage_type = type_match.group(1).lower()
    # Look for dice within ~100 chars before the damage type word
    before = description[: type_match.start()]
    dice_match = None
    for m in DAMAGE_DICE_RE.finditer(before):
        dice_match = m
    dice = dice_match.group(1).replace(" ", "") if dice_match else None
    return dice, damage_type


def detect_save(description: str) -> Optional[str]:
    """Return the short ability label (DEX, WIS, ...) targeted by a save, if any."""
    m = SAVE_RE.search(description)
    return SAVE_SHORT[m.group(1)] if m else None


def detect_attack(description: str) -> Optional[str]:
    """Return "ranged" or "melee" if the spell makes a spell attack."""
    m = ATTACK_RE.search(description)
    return m.group(1).lower() if m else None


def py_str_literal(text: str) -> str:
    """Format a multi-line description as a parenthesized concatenation of short strings.

    Uses repr() per chunk so internal quotes and other escapes are handled correctly.
    """
    # Strip / normalize whitespace
    text = " ".join(text.split())
    if len(text) <= 90:
        return repr(text)
    # Word-wrap to ~80 chars per line
    words = text.split()
    lines: list[list[str]] = [[]]
    for w in words:
        cur_len = sum(len(s) + 1 for s in lines[-1])
        if cur_len + len(w) > 80 and lines[-1]:
            lines.append([w])
        else:
            lines[-1].append(w)
    parts = [" ".join(line) for line in lines]
    # Append a space to all but the last chunk so the concatenated result has spaces.
    parts = [p + " " for p in parts[:-1]] + [parts[-1]]
    quoted = [f"            {p!r}" for p in parts]
    return "(\n" + "\n".join(quoted) + "\n        )"


def build_spell_entry(
    name: str,
    level: int,
    school: str,
    classes: list[str],
    casting_time: str,
    range_: str,
    components: str,
    duration: str,
    description: str,
    higher: Optional[str],
) -> str:
    """Render one SpellCreate(...) Python literal."""
    v, s, m_text = parse_components(components)
    is_ritual = "Ritual" in casting_time
    is_concentration = duration.startswith("Concentration")
    casting_clean = casting_time
    damage_dice, damage_type = detect_damage(description)
    save_ability = detect_save(description)
    attack_type = detect_attack(description)

    lines = ["    SpellCreate("]
    lines.append(f"        name={name!r},")
    lines.append(f"        level={level},")
    lines.append(f"        school={school!r},")
    lines.append(f"        casting_time={casting_clean!r},")
    lines.append(f"        range={range_!r},")
    if v:
        lines.append("        components_v=True,")
    if s:
        lines.append("        components_s=True,")
    if m_text:
        lines.append(f"        components_m={m_text!r},")
    lines.append(f"        duration={duration!r},")
    if is_ritual:
        lines.append("        is_ritual=True,")
    if is_concentration:
        lines.append("        is_concentration=True,")
    lines.append(f"        description={py_str_literal(description)},")
    if higher:
        lines.append(f"        higher_levels={py_str_literal(higher)},")
    if damage_dice:
        lines.append(f"        damage_dice={damage_dice!r},")
    if damage_type:
        lines.append(f"        damage_type={damage_type!r},")
    if save_ability:
        lines.append(f"        save_ability={save_ability!r},")
    if attack_type:
        lines.append(f"        attack_type={attack_type!r},")
    lines.append(f"        classes={classes!r},")
    lines.append("    ),")
    return "\n".join(lines)


# ── Main parse ─────────────────────────────────────────────────────────────


def parse() -> list[str]:
    """Walk the markdown file, return a list of rendered SpellCreate(...) literals."""
    text = MD_FILE.read_text(encoding="utf-8")
    lines = text.split("\n")

    # Skip to "## Spell Descriptions"
    start = next((i for i, L in enumerate(lines) if L.strip() == "## Spell Descriptions"), 0)
    lines = lines[start + 1 :]

    entries: list[str] = []
    i = 0
    while i < len(lines):
        m = HEADING_RE.match(lines[i])
        if not m:
            i += 1
            continue
        name = m.group(1).strip()
        # Skip stat-block sub-headings inside spell descriptions (e.g. "Actions",
        # "Animated Object", "Conjure" stat blocks) — detect by absence of a
        # type line within the next 3 non-blank lines.
        j = i + 1
        type_line: Optional[str] = None
        for _ in range(5):
            if j >= len(lines):
                break
            if lines[j].strip() == "":
                j += 1
                continue
            if lines[j].startswith("_") and lines[j].endswith("_"):
                type_line = lines[j].strip()
            break
        if type_line is None:
            i += 1
            continue

        # Parse type line
        cantrip_m = TYPE_CANTRIP_RE.match(type_line)
        leveled_m = TYPE_LEVELED_RE.match(type_line)
        if cantrip_m:
            level = 0
            school = cantrip_m.group(1)
            classes = [c.strip() for c in cantrip_m.group(2).split(",")]
        elif leveled_m:
            level = int(leveled_m.group(1))
            school = leveled_m.group(2)
            classes = [c.strip() for c in leveled_m.group(3).split(",")]
        else:
            # Type line didn't match — not a spell entry, skip.
            i += 1
            continue

        # Walk forward gathering field lines + description until next #### or EOF.
        casting_time = ""
        range_ = ""
        components = ""
        duration = ""
        description_parts: list[str] = []
        higher: Optional[str] = None
        k = j + 1
        in_desc = False
        while k < len(lines):
            L = lines[k]
            if HEADING_RE.match(L):
                break
            if m_field := CASTING_RE.match(L):
                casting_time = m_field.group(1)
            elif m_field := RANGE_RE.match(L):
                range_ = m_field.group(1)
            elif m_field := COMPONENTS_RE.match(L):
                components = m_field.group(1)
            elif m_field := DURATION_RE.match(L):
                duration = m_field.group(1)
                in_desc = True
            elif m_field := HIGHER_RE.match(L):
                # Higher-levels paragraph; capture until next blank line or heading.
                higher_lines: list[str] = [m_field.group(2)]
                k += 1
                while k < len(lines) and lines[k].strip() and not HEADING_RE.match(lines[k]):
                    if lines[k].startswith("_") and lines[k].endswith("_"):
                        break
                    higher_lines.append(lines[k])
                    k += 1
                higher = " ".join(p.strip() for p in higher_lines if p.strip())
                continue
            elif in_desc and L.strip():
                # Skip italicized non-higher-levels paragraphs (like _Spell Lists._ markers).
                if L.strip().startswith("_") and L.strip().endswith("_"):
                    pass
                else:
                    description_parts.append(L.strip())
            k += 1

        description = " ".join(description_parts).strip()
        if not description:
            i = k
            continue

        # Bail if required fields are empty (some entries are malformed).
        if not casting_time or not range_ or not duration:
            i = k
            continue

        entries.append(
            build_spell_entry(
                name=name,
                level=level,
                school=school,
                classes=classes,
                casting_time=casting_time,
                range_=range_,
                components=components,
                duration=duration,
                description=description,
                higher=higher,
            )
        )
        i = k

    return entries


def render(entries: list[str]) -> str:
    """Render the full seed file."""
    header = '''"""SRD 5.5e (2024) spell catalog — seed data for the spells table.

Plan 00017. Each entry matches the ``SpellCreate`` shape. The seeder reads
this list at startup and inserts rows when the table is empty (idempotent).

This file is GENERATED by scripts/parse_srd_spells.py from the SRD 5.2.1
markdown at downfallx/dnd-5e-srd-markdown (CC-BY-4.0). Do not edit by hand
unless you also update the parser or the source markdown.

The SRD 5.2.1 ("System Reference Document 5.2.1") is © Wizards of the
Coast LLC, distributed under CC-BY-4.0. This file inherits that license
for the spell text it contains. See:
https://creativecommons.org/licenses/by/4.0/

Notable 2024 changes vs 2014 baked in here (verbatim from the SRD):
- Cure Wounds: 2d8 + spellcasting modifier (was 1d8).
- True Strike: a weapon-attack cantrip with radiant rider.
- Hunter's Mark: bonus action, +1d6 weapon damage on hits.
"""

from domain.spell import SpellCreate

SRD_SPELLS_2024: list[SpellCreate] = [
'''
    body = "\n".join(entries)
    footer = '''
]
"""Validated SpellCreate payloads parsed from the 2024 SRD 5.2.1."""
'''
    return header + body + footer


def main() -> None:
    """Run the parser and write the seed file."""
    if not MD_FILE.exists():
        raise SystemExit(
            f"Source file {MD_FILE} not found. Download it first:\n"
            f"  curl -sL https://raw.githubusercontent.com/downfallx/"
            f"dnd-5e-srd-markdown/master/spells.md -o {MD_FILE}"
        )
    entries = parse()
    OUT_FILE.write_text(render(entries), encoding="utf-8")
    print(f"Parsed {len(entries)} spells -> {OUT_FILE}")


if __name__ == "__main__":
    main()
