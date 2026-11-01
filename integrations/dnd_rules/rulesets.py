"""Which rules tables a campaign uses (Plan 131): the 2024 rules or the 2014 rules.

A campaign (and every PC in it) plays by one ruleset, ``"2024"`` (SRD 5.2.1, the
default) or ``"2014"`` (SRD 5.1). Each edition keeps its data in its own modules
with the same public names and shapes, so a service asks for the module here
instead of importing an edition directly:

    srd = rulesets.options(campaign.ruleset)    # species, backgrounds, classes, ...
    rules = rulesets.levelup(pc.ruleset)        # features by level, feats, choices, ...

Imports are lazy, so loading this module never pulls in tables nobody asked for.
"""

from importlib import import_module
from types import ModuleType
from typing import Any

R2024 = "2024"
R2014 = "2014"
RULESETS = (R2024, R2014)

_OPTIONS = {
    R2024: "integrations.dnd_rules.srd_character_options_2024",
    R2014: "integrations.dnd_rules.srd_character_options_2014",
}
_LEVELUP = {
    R2024: "integrations.dnd_rules.levelup_2024",
    R2014: "integrations.dnd_rules.levelup_2014",
}
_FEATURES = {
    R2024: ("integrations.dnd_rules.class_features_2024", "CLASS_FEATURES_2024"),
    R2014: ("integrations.dnd_rules.class_features_2014", "CLASS_FEATURES_2014"),
}
_SPELLS = {
    R2024: ("integrations.dnd_rules.srd_spells_2024", "SRD_SPELLS_2024"),
    R2014: ("integrations.dnd_rules.srd_spells_2014", "SRD_SPELLS_2014"),
}


def normalize(ruleset: Any) -> str:
    """The plain value ("2024"/"2014") of a Ruleset, a str, or None (None means 2024).

    Args:
        ruleset: A Ruleset enum member, its string value, or None.

    Returns:
        "2024" or "2014".

    Raises:
        ValueError: For anything else.
    """
    value = str(getattr(ruleset, "value", ruleset) or R2024)
    if value not in RULESETS:
        raise ValueError(f"Unknown ruleset {ruleset!r}; expected one of {RULESETS}.")
    return value


def is_2014(ruleset: Any) -> bool:
    """True when ``ruleset`` is the 2014 rules.

    Args:
        ruleset: A Ruleset enum member, its string value, or None.

    Returns:
        Whether it is "2014".
    """
    return normalize(ruleset) == R2014


def options(ruleset: Any) -> ModuleType:
    """The character-creation tables: species, backgrounds, classes, armor, helpers.

    Args:
        ruleset: The campaign's ruleset.

    Returns:
        ``srd_character_options_2024`` or ``srd_character_options_2014``.
    """
    return import_module(_OPTIONS[normalize(ruleset)])


def levelup(ruleset: Any) -> ModuleType:
    """The level-up tables: features by level, feats, ASI levels, class choices.

    Args:
        ruleset: The campaign's ruleset.

    Returns:
        ``levelup_2024`` or ``levelup_2014``.
    """
    return import_module(_LEVELUP[normalize(ruleset)])


def class_features(ruleset: Any) -> list:
    """The tracked class-feature catalog rows (uses and recovery) for one edition.

    Args:
        ruleset: The campaign's ruleset.

    Returns:
        ``CLASS_FEATURES_2024`` or ``CLASS_FEATURES_2014``.
    """
    module, name = _FEATURES[normalize(ruleset)]
    return getattr(import_module(module), name)


def spell_seed(ruleset: Any) -> list:
    """The SRD spell catalog to seed for one edition.

    Args:
        ruleset: The ruleset.

    Returns:
        ``SRD_SPELLS_2024`` or ``SRD_SPELLS_2014``.
    """
    module, name = _SPELLS[normalize(ruleset)]
    return getattr(import_module(module), name)
