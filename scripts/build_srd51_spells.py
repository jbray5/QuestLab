"""Build the 2014 (SRD 5.1) spell catalog seed module from the 5e-database JSON.

Plan 131. This script is NOT part of the runtime app. Run it to (re)generate
``integrations/dnd_rules/srd_spells_2014.py``, the 2014 twin of ``srd_spells_2024.py``.

Source: ``src/2014/en/5e-SRD-Spells.json`` from https://github.com/5e-bits/5e-database
(the JSON is MIT; its content is the SRD 5.1, CC-BY-4.0). The dataset is never committed;
pass the folder that holds it on the command line.

Run (from anywhere; the output path is found from this file):
    .venv/Scripts/python -I scripts/build_srd51_spells.py <dataset_dir>
    .venv/Scripts/python -I scripts/build_srd51_spells.py <dataset_dir> --out other.py

Notes:
- Deterministic: records are sorted by level, then name, and every run writes the same bytes.
- The JSON is untrusted input. Every field is type- and length-checked against the limits in
  ``domain/spell.py`` and every string is escaped, so a bad file fails loudly instead of
  writing a broken (or dangerous) module.
- The output is already black/isort/flake8 clean (lines <= 100 chars), so it needs no
  per-file flake8 ignore.
- Mechanical hints come from the dataset's structured fields, not from the prose:
  ``damage_dice``/``damage_type`` from ``damage`` (lowest slot, or the level-1 cantrip value),
  ``save_ability`` from ``dc``, ``attack_type`` from ``attack_type``.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Optional

DATASET_FILE = "5e-SRD-Spells.json"
OUT_FILE = Path(__file__).resolve().parent.parent / "integrations/dnd_rules/srd_spells_2014.py"
EXPECTED_COUNT = 319

SOURCE = "SRD 5.1 (2014)"
RULESET = "2014"

# Field caps from domain/spell.py (SpellCreate / the spells table).
_MAX = {"name": 120, "school": 40, "casting_time": 400, "range": 120, "duration": 120}
_MAX_MATERIAL = 600
_MAX_HINT = 40

_LINE = 100  # black / flake8 line length
_KWARG_INDENT = " " * 8
_CHUNK_INDENT = " " * 12
_CHUNK_WIDTH = 80  # escaped characters per wrapped string chunk

_CLASSES = {
    "Barbarian",
    "Bard",
    "Cleric",
    "Druid",
    "Fighter",
    "Monk",
    "Paladin",
    "Ranger",
    "Rogue",
    "Sorcerer",
    "Warlock",
    "Wizard",
}
_SCHOOLS = {
    "Abjuration",
    "Conjuration",
    "Divination",
    "Enchantment",
    "Evocation",
    "Illusion",
    "Necromancy",
    "Transmutation",
}
_SAVES = {"STR", "DEX", "CON", "INT", "WIS", "CHA"}

# The dataset drops the trigger from a reaction's casting time; these are the SRD 5.1 lines.
_REACTION_TRIGGERS = {
    "Counterspell": (
        "1 reaction, which you take when you see a creature within 60 feet of you casting a spell"
    ),
    "Feather Fall": "1 reaction, which you take when you or a creature within 60 feet of you falls",
    "Hellish Rebuke": (
        "1 reaction, which you take in response to being damaged by a creature within 60 feet "
        "of you that you can see"
    ),
    "Shield": (
        "1 reaction, which you take when you are hit by an attack or targeted by the magic "
        "missile spell"
    ),
}

_ABILITY = r"(strength|dexterity|constitution|intelligence|wisdom|charisma)"
# Ability names are capitalised in the printed SRD; the dataset lowercases them. Only fix
# them as game terms ("wisdom saving throw"), not as plain nouns ("their intelligence").
_ABILITY_TERM_RE = re.compile(
    rf"\b{_ABILITY}(?=\s+(?:saving throws?|checks?|scores?|modifiers?)\b)"
)
_ABILITY_PAIR_RE = re.compile(
    rf"\b{_ABILITY}(?=\s+(?:and|or)\s+(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|"
    r"Charisma)\b)"
)
_BOLD_RE = re.compile(r"\*\*\*(.+?)\*\*\*")
_HEADING_RE = re.compile(r"^#{2,6}\s+(.+?)\s*$")
_TABLE_SEPARATOR_RE = re.compile(r"^\|(?:\s*:?-{2,}:?\s*\|)+$")
_SPLIT_DICE_RE = re.compile(r"\b(\d+)d (\d+)\b")
_DICE_RE = re.compile(r"^\d+d\d+(?:\+\d+)?$")
_CANTRIP_SCALING_RE = re.compile(r"\b(?:when you reach|at) 5th level\b")
_BAD_CHARS_RE = re.compile(r"[\x00-\x09\x0b-\x1f\x7f]")


# ── Reading and checking the dataset ───────────────────────────────────────────


def _text(value: Any, field: str, name: str, max_len: Optional[int] = None) -> str:
    """Return a stripped, non-empty string field, or stop with a clear message."""
    if not isinstance(value, str) or not value.strip():
        raise SystemExit(f"{name}: {field} must be a non-empty string, got {value!r}")
    if _BAD_CHARS_RE.search(value):
        raise SystemExit(f"{name}: {field} holds control characters")
    value = value.strip()
    if max_len is not None and len(value) > max_len:
        raise SystemExit(f"{name}: {field} is {len(value)} chars (limit {max_len})")
    return value


def _paragraphs(value: Any, field: str, name: str) -> list[str]:
    """Return a list of non-empty paragraph strings."""
    if not isinstance(value, list) or not all(isinstance(p, str) for p in value):
        raise SystemExit(f"{name}: {field} must be a list of strings")
    return [_text(p, field, name) for p in value if p.strip()]


def _ref_name(value: Any, field: str, name: str) -> str:
    """Return the ``name`` of a dataset reference object ({index, name, url})."""
    if not isinstance(value, dict):
        raise SystemExit(f"{name}: {field} must be an object")
    return _text(value.get("name"), f"{field}.name", name)


def _flag(value: Any, field: str, name: str) -> bool:
    """Return a boolean field."""
    if not isinstance(value, bool):
        raise SystemExit(f"{name}: {field} must be true/false, got {value!r}")
    return value


# ── Text clean-up ──────────────────────────────────────────────────────────────


def _clean_line(text: str) -> str:
    """Tidy one dataset paragraph: spacing, bold labels, headings, ability names, dice."""
    text = " ".join(text.split())
    text = _BOLD_RE.sub(r"**\1**", text)  # ***Label.*** -> **Label.** (the 2024 style)
    heading = _HEADING_RE.match(text)
    if heading:
        text = f"**{heading.group(1)}**"
    text = _SPLIT_DICE_RE.sub(r"\1d\2", text)  # a dataset typo: "10d 10"
    text = _ABILITY_TERM_RE.sub(lambda m: m.group(1).capitalize(), text)
    return _ABILITY_PAIR_RE.sub(lambda m: m.group(1).capitalize(), text)


def _join_paragraphs(parts: list[str]) -> str:
    """Join paragraphs with blank lines; keep table rows and list items on single lines.

    Markdown table separator rows (``|---|---|``) are dropped: the text shows as plain
    pre-wrapped text, where the rows read fine on their own.
    """
    blocks: list[tuple[str, list[str]]] = []
    for raw in parts:
        line = _clean_line(raw)
        if _TABLE_SEPARATOR_RE.match(line):
            continue
        kind = "row" if line.startswith("|") else "item" if line.startswith("- ") else "text"
        if kind != "text" and blocks and blocks[-1][0] == kind:
            blocks[-1][1].append(line)
        else:
            blocks.append((kind, [line]))
    return "\n\n".join("\n".join(lines) for _, lines in blocks)


def _material(text: str) -> str:
    """Material text in the 2024 module's style: lowercase start, no closing period."""
    text = " ".join(text.split()).rstrip(".")
    if len(text) > 1 and text[0].isupper() and (text[1].islower() or text[1] == " "):
        text = text[0].lower() + text[1:]
    return text


def _duration(text: str, concentration: bool) -> str:
    """The printed SRD form: "Concentration, up to 1 minute" (the dataset drops the word)."""
    if concentration and text.lower().startswith("up to "):
        return f"Concentration, up to {text[6:]}"
    return text


def _damage(raw: dict[str, Any], name: str) -> tuple[Optional[str], Optional[str]]:
    """(damage_dice, damage_type) from the first typed damage entry, or (None, None).

    Uses the lowest slot level (a leveled spell's own level) or the level-1 value of a
    cantrip. Entries with no damage type are skipped: Sleep's "5d8" is a hit-point pool,
    and Prismatic Spray's type depends on the ray. ``+ MOD`` is dropped (not dice), and a
    flat number (Guardian of Faith's 20) keeps only its type.
    """
    entries = raw.get("damage")
    if entries is None:
        return None, None
    if isinstance(entries, dict):
        entries = [entries]
    if not isinstance(entries, list):
        raise SystemExit(f"{name}: damage must be a list")
    for entry in entries:
        if not isinstance(entry, dict) or "damage_type" not in entry:
            continue
        damage_type = _ref_name(entry["damage_type"], "damage.damage_type", name).lower()
        table = entry.get("damage_at_slot_level") or entry.get("damage_at_character_level")
        if not isinstance(table, dict) or not table:
            return None, damage_type[:_MAX_HINT]
        try:
            lowest = min(table, key=int)
        except ValueError:
            raise SystemExit(f"{name}: damage levels must be numbers")
        dice = _text(table[lowest], "damage", name).replace(" ", "").replace("+MOD", "")
        return (dice if _DICE_RE.match(dice) else None), damage_type[:_MAX_HINT]
    return None, None


def build_record(raw: dict[str, Any]) -> dict[str, Any]:
    """Map one dataset spell onto SpellCreate keyword arguments (in output order)."""
    if not isinstance(raw, dict):
        raise SystemExit("Each spell must be a JSON object")
    name = _text(raw.get("name"), "name", "?", _MAX["name"])
    level = raw.get("level")
    if not isinstance(level, int) or isinstance(level, bool) or not 0 <= level <= 9:
        raise SystemExit(f"{name}: level must be 0-9, got {level!r}")
    school = _ref_name(raw.get("school"), "school", name).title()
    if school not in _SCHOOLS:
        raise SystemExit(f"{name}: unknown school {school!r}")
    components = raw.get("components")
    if not isinstance(components, list) or not set(components) <= {"V", "S", "M"}:
        raise SystemExit(f"{name}: components must be a list of V/S/M")
    concentration = _flag(raw.get("concentration"), "concentration", name)

    casting_time = _text(raw.get("casting_time"), "casting_time", name, _MAX["casting_time"])
    if casting_time == "1 reaction" and name in _REACTION_TRIGGERS:
        casting_time = _REACTION_TRIGGERS[name]

    desc = _paragraphs(raw.get("desc"), "desc", name)
    higher = _paragraphs(raw.get("higher_level", []), "higher_level", name)
    # A cantrip's damage scaling is its last paragraph; the 2024 module keeps that text in
    # higher_levels (its "Cantrip Upgrade"), so move it there for the same display.
    if level == 0 and not higher and len(desc) > 1 and _CANTRIP_SCALING_RE.search(desc[-1]):
        higher = [desc.pop()]

    record: dict[str, Any] = {
        "name": name,
        "level": level,
        "school": school,
        "casting_time": casting_time,
        "range": _text(raw.get("range"), "range", name, _MAX["range"]),
        "components_v": "V" in components,
        "components_s": "S" in components,
    }
    if "M" in components:
        material = _material(_text(raw.get("material"), "material", name))
        if len(material) > _MAX_MATERIAL:
            raise SystemExit(f"{name}: material is {len(material)} chars")
        record["components_m"] = material
    duration = _duration(_text(raw.get("duration"), "duration", name), concentration)
    record["duration"] = _text(duration, "duration", name, _MAX["duration"])
    record["is_ritual"] = _flag(raw.get("ritual"), "ritual", name)
    record["is_concentration"] = concentration
    record["description"] = _join_paragraphs(desc)
    if not record["description"]:
        raise SystemExit(f"{name}: empty description")
    if higher:
        record["higher_levels"] = _join_paragraphs(higher)

    damage_dice, damage_type = _damage(raw, name)
    record["damage_dice"] = damage_dice
    record["damage_type"] = damage_type
    save = None
    if "dc" in raw:
        dc = raw["dc"]
        save = _ref_name(dc.get("dc_type") if isinstance(dc, dict) else None, "dc.dc_type", name)
        save = save.upper()
        if save not in _SAVES:
            raise SystemExit(f"{name}: unknown save {save!r}")
    record["save_ability"] = save
    attack = raw.get("attack_type")
    if attack is not None and attack not in ("ranged", "melee"):
        raise SystemExit(f"{name}: unknown attack_type {attack!r}")
    record["attack_type"] = attack

    classes = [_ref_name(c, "classes", name) for c in raw.get("classes") or []]
    unknown = set(classes) - _CLASSES
    if unknown:
        raise SystemExit(f"{name}: unknown classes {sorted(unknown)}")
    record["classes"] = classes
    record["source"] = SOURCE
    record["ruleset"] = RULESET
    return record


def load(dataset_dir: Path) -> list[dict[str, Any]]:
    """Read the dataset and return every record, sorted by level then name."""
    path = dataset_dir / DATASET_FILE
    if not path.is_file():
        raise SystemExit(f"{path} not found. Pass the folder holding {DATASET_FILE}.")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise SystemExit(f"{path}: expected a JSON list of spells")
    records = sorted((build_record(raw) for raw in data), key=lambda r: (r["level"], r["name"]))
    names = [r["name"].casefold() for r in records]
    if len(set(names)) != len(names):
        raise SystemExit("Duplicate spell names in the dataset")
    if len(records) != EXPECTED_COUNT:
        print(f"Warning: {len(records)} spells (the SRD 5.1 has {EXPECTED_COUNT}).")
    return records


# ── Rendering (black-stable Python source) ────────────────────────────────────


def _quote(text: str) -> str:
    """A string literal the way black writes it: double quotes unless that adds escapes."""
    body = text.replace("\\", "\\\\").replace("\n", "\\n")
    if text.count('"') > text.count("'"):
        return "'" + body.replace("'", "\\'") + "'"
    return '"' + body.replace('"', '\\"') + '"'


def _chunks(text: str, width: int) -> list[str]:
    """Wrap text into pieces whose literals stay within ``width`` characters.

    Each piece keeps its trailing space or newline(s), so the pieces concatenate back to
    exactly ``text``. Breaks fall after a space or at a line end.
    """
    tokens = re.findall(r"[^ \n]+ *|\n+| +", text)
    pieces: list[str] = []
    current = ""
    for token in tokens:
        if token.startswith("\n"):
            current += token
            pieces.append(current)
            current = ""
            continue
        if current and len(_quote(current + token.rstrip(" "))) > width + 2:
            pieces.append(current)
            current = ""
        current += token
    if current:
        pieces.append(current)
    return pieces


def _kwarg(key: str, text: str) -> list[str]:
    """Render ``key="text",`` on one line, or as a parenthesised implicit concatenation."""
    single = f"{_KWARG_INDENT}{key}={_quote(text)},"
    if len(single) <= _LINE:
        return [single]
    # Black joins string pieces that fit on one line inside the parentheses, so wrap only
    # text too long for that line; shorter text goes alone between the parentheses.
    if len(_CHUNK_INDENT + _quote(text)) <= _LINE:
        pieces = [text]
    else:
        pieces = _chunks(text, _CHUNK_WIDTH)
    lines = [f"{_KWARG_INDENT}{key}=("]
    lines += [f"{_CHUNK_INDENT}{_quote(p)}" for p in pieces]
    lines.append(f"{_KWARG_INDENT}),")
    return lines


def _list_kwarg(key: str, items: list[str]) -> list[str]:
    """Render ``key=[...],`` on one line, or exploded with a trailing comma (black style)."""
    single = f"{_KWARG_INDENT}{key}=[{', '.join(_quote(i) for i in items)}],"
    if len(single) <= _LINE:
        return [single]
    return (
        [f"{_KWARG_INDENT}{key}=["]
        + [f"{_CHUNK_INDENT}{_quote(i)}," for i in items]
        + [f"{_KWARG_INDENT}],"]
    )


def render_record(record: dict[str, Any]) -> str:
    """Render one ``SpellCreate(...)`` literal, leaving out false/None defaults."""
    lines = ["    SpellCreate("]
    for key, value in record.items():
        if value is None or value is False:
            continue
        if value is True:
            lines.append(f"{_KWARG_INDENT}{key}=True,")
        elif isinstance(value, int):
            lines.append(f"{_KWARG_INDENT}{key}={value},")
        elif isinstance(value, list):
            lines += _list_kwarg(key, value)
        else:
            lines += _kwarg(key, value)
    lines.append("    ),")
    return "\n".join(lines)


_HEADER = '''"""SRD 5.1 (2014) spell catalog: seed data for the spells table (Plan 131).

Each entry is a ``SpellCreate`` with ``ruleset="2014"``, the 2014 twin of
``srd_spells_2024.py``. The startup seed (``services.spell_service.seed_srd_spells``)
inserts these rows when the catalog holds no 2014 spells yet.

GENERATED by scripts/build_srd51_spells.py from 5e-bits/5e-database
(src/2014/en/5e-SRD-Spells.json; the JSON is MIT). Do not edit by hand: change the
script and re-run it.

This work includes material taken from the System Reference Document 5.1 ("SRD 5.1")
by Wizards of the Coast LLC and available at
https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed
under the Creative Commons Attribution 4.0 International License available at
https://creativecommons.org/licenses/by/4.0/legalcode. This file inherits that
license for the spell text it contains.
"""

from domain.spell import SpellCreate

SRD_SPELLS_2014: list[SpellCreate] = [
'''

_FOOTER = '''
]
"""Validated SpellCreate payloads generated from the SRD 5.1 spells."""
'''


def render(records: list[dict[str, Any]]) -> str:
    """Render the full seed module."""
    return _HEADER + "\n".join(render_record(r) for r in records) + _FOOTER


def main() -> None:
    """Parse the arguments, build the records and write the module."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("dataset_dir", type=Path, help=f"folder holding {DATASET_FILE}")
    parser.add_argument("--out", type=Path, default=OUT_FILE, help="output .py path")
    args = parser.parse_args()
    records = load(args.dataset_dir)
    source = render(records)
    too_long = [n for n, line in enumerate(source.splitlines(), 1) if len(line) > _LINE]
    if too_long:
        raise SystemExit(f"Rendered lines over {_LINE} chars: {too_long[:10]}")
    args.out.write_text(source, encoding="utf-8", newline="\n")
    print(f"Wrote {len(records)} spells -> {args.out}")


if __name__ == "__main__":
    main()
