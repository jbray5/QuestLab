"""Plan 92 — the Green Hag block, and 2024-style action text in the arena."""

from integrations.dnd_rules.stat_blocks import _SRD_MONSTERS
from services.arena_service import parse_foe_attacks


def _green_hag():
    return next(m for m in _SRD_MONSTERS if m["name"] == "Green Hag")


class TestTheBlock:
    """The catalog row matches the 2024 stat block."""

    def test_defences_skills_and_languages(self):
        hag = _green_hag()
        assert hag["ac"] == 17 and hag["hp_average"] == 82 and hag["hp_formula"] == "11d8+33"
        assert hag["speed"] == {"walk": 30, "swim": 30}
        assert hag["skills"]["arcana"] == 5  # +5, not the +3 the old row carried
        assert hag["languages"] == "Common, Elvish, Sylvan"
        assert hag["challenge_rating"] == "3" and hag["xp"] == 700
        # A green hag has no damage resistances in the 2024 block.
        assert not hag.get("damage_resistances")

    def test_traits_and_actions(self):
        hag = _green_hag()
        assert [t["name"] for t in hag["traits"]] == ["Amphibious", "Coven Magic", "Mimicry"]
        assert "spell save DC 11" in hag["traits"][1]["desc"]
        assert "DC 14 Wisdom (Insight)" in hag["traits"][2]["desc"]
        assert [a["name"] for a in hag["actions"]] == ["Multiattack", "Claw", "Spellcasting"]
        claw = hag["actions"][1]["desc"]
        assert "+6" in claw and "1d8 + 4" in claw and "1d6) Poison" in claw
        assert "Ray of Sickness (level 3 version)" in hag["actions"][2]["desc"]


class TestArenaReadsTheBlock:
    """The referee can run the hag: two claws at +6 for 1d8+4 slashing."""

    def test_the_hag_parses_into_two_claws(self):
        attacks = parse_foe_attacks(_green_hag()["actions"])
        assert len(attacks) == 1
        claw = attacks[0]
        assert claw.name == "Claw" and claw.hit_bonus == 6
        assert claw.damage == "1d8+4" and claw.damage_type == "slashing"
        assert claw.count == 2  # Multiattack: "makes two Claw attacks"

    def test_the_older_to_hit_phrasing_still_parses(self):
        attacks = parse_foe_attacks([{"name": "Claws", "desc": "+6 to hit, 2d8+4 slashing"}])
        assert attacks[0].hit_bonus == 6 and attacks[0].damage == "2d8+4"
        assert attacks[0].damage_type == "slashing"
