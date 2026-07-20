"""Plan 48 tests — the Character Forge (player gear/appearance/hero).

Image + blob calls are monkeypatched on portrait_service; everything else
(ownership scoping, cooldown, gear join) runs for real on DuckDB.
"""

from datetime import datetime, timezone

import pytest
from sqlmodel import Session

import services.inventory_service as inv_svc
import services.item_service as item_svc
import services.player_service as play_svc
import services.portrait_service as portrait_svc
from domain.character import CharacterItemCreate
from domain.enums import ItemRarity
from domain.item import ItemCreate
from tests.test_services.test_player_service import _campaign, _dm, _pc


def _give_item(db, pc_id, dm, name="Longsword", equipped=False):
    """Create a catalog item and put it in the PC's inventory."""
    item = item_svc.create_item(
        db, ItemCreate(name=name, rarity=ItemRarity.COMMON, item_type="Weapon", value_gp=15)
    )
    return inv_svc.add_item(db, pc_id, CharacterItemCreate(item_id=item.id, equipped=equipped), dm)


def _patch_hero_gen(monkeypatch):
    """Stub the image + blob calls; capture the prompt."""
    captured: dict = {}

    def fake_generate_image(prompt, **kwargs):
        captured["prompt"] = prompt
        captured["kwargs"] = kwargs
        return b"\x89PNGFAKE"

    monkeypatch.setattr(portrait_svc, "generate_image", fake_generate_image)
    monkeypatch.setattr(
        portrait_svc.blob_storage,
        "upload",
        lambda *, path, data, content_type="image/png": f"https://fake.blob/{path}",
    )
    return captured


def _patch_loadout_gen(monkeypatch):
    """Stub download + edit_image + upload for the dressed-render path."""
    captured: dict = {}

    def fake_edit_image(prompt, image_bytes, **kwargs):
        captured["prompt"] = prompt
        captured["source"] = image_bytes
        captured["kwargs"] = kwargs
        return b"\x89DRESSED"

    monkeypatch.setattr(portrait_svc, "edit_image", fake_edit_image)
    monkeypatch.setattr(portrait_svc.blob_storage, "download", lambda url, **k: b"\x89BASE")
    monkeypatch.setattr(
        portrait_svc.blob_storage,
        "upload",
        lambda *, path, data, content_type="image/png": f"https://fake.blob/{path}",
    )
    return captured


class TestGearAndAppearance:
    """Gear join, player equip scoping, appearance notes."""

    def test_list_gear_joins_item_details(self, duckdb_session: Session):
        """Gear rows carry the catalog name/type/rarity and derived slot."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        _give_item(duckdb_session, pc.id, dm, name="Moonblade")

        gear = play_svc.list_gear(duckdb_session, pc.id)

        assert len(gear) == 1
        assert gear[0]["name"] == "Moonblade"
        assert gear[0]["item_type"] == "Weapon"
        assert gear[0]["equipped"] is False
        assert gear[0]["slot"] == "main_hand"

    def test_player_equips_own_row(self, duckdb_session: Session):
        """Equipping via the player scope flips the flag."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        row = _give_item(duckdb_session, pc.id, dm)

        updated = play_svc.set_equipped(duckdb_session, pc.id, row.id, True)

        assert updated.equipped is True
        assert play_svc.list_gear(duckdb_session, pc.id)[0]["equipped"] is True

    def test_player_cannot_equip_another_pcs_row(self, duckdb_session: Session):
        """A row belonging to a different PC in the same campaign is denied."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc_a = _pc(duckdb_session, c.id, dm)
        pc_b = _pc(duckdb_session, c.id, dm)
        row_b = _give_item(duckdb_session, pc_b.id, dm)

        with pytest.raises(PermissionError):
            play_svc.set_equipped(duckdb_session, pc_a.id, row_b.id, True)

    def test_appearance_saved_and_capped(self, duckdb_session: Session):
        """Appearance persists and is truncated to the cap."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)

        updated = play_svc.set_appearance(duckdb_session, pc.id, "  Storm-grey eyes. " + "x" * 2000)

        assert updated.appearance is not None
        assert updated.appearance.startswith("Storm-grey eyes.")
        assert len(updated.appearance) <= 1500


class TestForgeHero:
    """Hero generation: prompt content, persistence, cooldown."""

    def test_forge_model_is_appearance_only_not_gear(self, duckdb_session: Session, monkeypatch):
        """The model prompt carries identity + appearance but NOT equipped gear.

        The persistent-model revision: equipping a sword must never change the
        character render (gear lives in slots), so equipped item names stay out
        of the prompt.
        """
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        _give_item(duckdb_session, pc.id, dm, name="Moonblade", equipped=True)
        play_svc.set_appearance(duckdb_session, pc.id, "Storm-grey eyes, ash-blonde braid")
        captured = _patch_hero_gen(monkeypatch)

        result = play_svc.forge_hero(duckdb_session, pc.id)

        assert result["hero_url"] == f"https://fake.blob/heroes/pc-{pc.id}.png"
        assert "Hero" in captured["prompt"]
        assert "Storm-grey eyes" in captured["prompt"]
        assert "Moonblade" not in captured["prompt"]
        assert captured["kwargs"].get("size") == "1024x1536"
        assert captured["kwargs"].get("background") == "transparent"
        refreshed = play_svc.get_character(duckdb_session, pc.id)
        assert refreshed.hero_url == result["hero_url"]

    def test_gear_slot_derivation(self, duckdb_session: Session):
        """Names map to the expected paper-doll slots; consumables get None."""
        assert play_svc._equip_slot("Weapon", "Longsword") == "main_hand"
        assert play_svc._equip_slot("Armor", "Wooden Shield, Reinforced") == "off_hand"
        assert play_svc._equip_slot("Armor", "Chain Mail") == "body"
        assert play_svc._equip_slot("Wondrous Item", "Cloak of Billowing") == "back"
        assert play_svc._equip_slot("Ring", "Ring of Protection") == "ring"
        assert play_svc._equip_slot("Wondrous Item", "Amulet of Health") == "neck"
        assert play_svc._equip_slot("Adventuring Gear", "Leather Boots") == "feet"
        assert play_svc._equip_slot("Potion", "Potion of Healing") is None
        assert play_svc._equip_slot("Provisions", "Bramblecrust Loaf") is None

    def test_forge_cooldown_blocks_rapid_regen(self, duckdb_session: Session, monkeypatch):
        """A second forge inside the window raises with the wait message."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        _patch_hero_gen(monkeypatch)

        play_svc.forge_hero(duckdb_session, pc.id)

        with pytest.raises(ValueError, match="forge is still glowing"):
            play_svc.forge_hero(duckdb_session, pc.id)

    def test_forge_allowed_after_cooldown(self, duckdb_session: Session, monkeypatch):
        """A stale hero_generated_at lets the forge run again."""
        from db.repos.character_repo import CharacterRepo
        from domain.character import PlayerCharacterUpdate

        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        _patch_hero_gen(monkeypatch)
        play_svc.forge_hero(duckdb_session, pc.id)
        row = CharacterRepo.get_by_id(duckdb_session, pc.id)
        CharacterRepo.update(
            duckdb_session,
            row,
            PlayerCharacterUpdate(hero_generated_at=datetime(2020, 1, 1, tzinfo=timezone.utc)),
        )

        result = play_svc.forge_hero(duckdb_session, pc.id)

        assert result["hero_url"].startswith("https://fake.blob/heroes/")


class TestDressModel:
    """The image-to-image 'gear on the model' render."""

    def _base_pc(self, db, monkeypatch, *, stale=True):
        """A PC with a base model already forged (cooldown cleared)."""
        from db.repos.character_repo import CharacterRepo
        from domain.character import PlayerCharacterUpdate

        dm = _dm()
        c = _campaign(db, dm)
        pc = _pc(db, c.id, dm)
        _patch_hero_gen(monkeypatch)
        play_svc.forge_hero(db, pc.id)
        if stale:
            row = CharacterRepo.get_by_id(db, pc.id)
            CharacterRepo.update(
                db,
                row,
                PlayerCharacterUpdate(hero_generated_at=datetime(2020, 1, 1, tzinfo=timezone.utc)),
            )
        return dm, pc

    def test_dress_edits_base_and_lists_equipped(self, duckdb_session: Session, monkeypatch):
        """Dressing edits the base image with the equipped gear, keeps identity."""
        dm, pc = self._base_pc(duckdb_session, monkeypatch)
        _give_item(duckdb_session, pc.id, dm, name="Moonblade", equipped=True)
        _give_item(duckdb_session, pc.id, dm, name="Bedroll", equipped=False)
        captured = _patch_loadout_gen(monkeypatch)

        result = play_svc.dress_model(duckdb_session, pc.id)

        assert result["loadout_url"] == f"https://fake.blob/heroes/pc-{pc.id}-loadout.png"
        assert captured["source"] == b"\x89BASE"  # base render fed to image-to-image
        assert "Moonblade" in captured["prompt"]
        assert "Bedroll" not in captured["prompt"]
        assert "identical face" in captured["prompt"].lower()
        assert captured["kwargs"].get("background") == "transparent"
        refreshed = play_svc.get_character(duckdb_session, pc.id)
        assert refreshed.loadout_url == result["loadout_url"]

    def test_regen_base_clears_loadout(self, duckdb_session: Session, monkeypatch):
        """Regenerating the base identity drops the stale dressed render."""
        from db.repos.character_repo import CharacterRepo
        from domain.character import PlayerCharacterUpdate

        dm, pc = self._base_pc(duckdb_session, monkeypatch)
        _patch_loadout_gen(monkeypatch)
        play_svc.dress_model(duckdb_session, pc.id)
        assert play_svc.get_character(duckdb_session, pc.id).loadout_url is not None
        # Clear the cooldown, then regenerate the base identity.
        row = CharacterRepo.get_by_id(duckdb_session, pc.id)
        CharacterRepo.update(
            duckdb_session,
            row,
            PlayerCharacterUpdate(hero_generated_at=datetime(2020, 1, 1, tzinfo=timezone.utc)),
        )
        _patch_hero_gen(monkeypatch)

        play_svc.forge_hero(duckdb_session, pc.id)

        assert play_svc.get_character(duckdb_session, pc.id).loadout_url is None

    def test_dress_cooldown_guarded(self, duckdb_session: Session, monkeypatch):
        """A dress inside the cooldown window is rejected."""
        dm, pc = self._base_pc(duckdb_session, monkeypatch, stale=False)
        _patch_loadout_gen(monkeypatch)

        with pytest.raises(ValueError, match="forge is still glowing"):
            play_svc.dress_model(duckdb_session, pc.id)


class TestUseItem:
    """Plan 52 — consumables that actually heal."""

    def _pc_with_potion(self, db, monkeypatch=None, *, name="Potion of Healing", qty=1, hp=5):
        """A hurt PC holding a consumable."""
        import services.inventory_service as inv_svc
        import services.item_service as item_svc
        from db.repos.character_repo import CharacterRepo
        from domain.character import CharacterItemCreate, PlayerCharacterUpdate
        from domain.item import ItemCreate

        dm = _dm()
        c = _campaign(db, dm)
        pc = _pc(db, c.id, dm)
        row_pc = CharacterRepo.get_by_id(db, pc.id)
        CharacterRepo.update(db, row_pc, PlayerCharacterUpdate(hp_current=hp))
        item = item_svc.create_item(
            db,
            ItemCreate(name=name, rarity=ItemRarity.COMMON, item_type="Potion", value_gp=50),
        )
        row = inv_svc.add_item(db, pc.id, CharacterItemCreate(item_id=item.id, quantity=qty), dm)
        return dm, c, pc, row

    def test_heal_self_consumes_and_clamps(self, duckdb_session: Session):
        """Healing lands (2d4+2 is 4..10), row is consumed, HP caps at max."""
        dm, c, pc, row = self._pc_with_potion(duckdb_session, hp=25)

        receipt = play_svc.use_item(duckdb_session, pc.id, row.id)

        assert receipt["effect"] == "heal"
        assert 4 <= receipt["amount"] <= 10
        assert receipt["target_hp_current"] == 30  # clamped at hp_max
        assert receipt["quantity_left"] == 0
        assert all(
            g["character_item_id"] != str(row.id) for g in play_svc.list_gear(duckdb_session, pc.id)
        )

    def test_heal_party_member(self, duckdb_session: Session):
        """Using a potion on a hurt friend heals the friend."""
        from db.repos.character_repo import CharacterRepo
        from domain.character import PlayerCharacterUpdate

        dm, c, pc, row = self._pc_with_potion(duckdb_session)
        friend = _pc(duckdb_session, c.id, dm)
        frow = CharacterRepo.get_by_id(duckdb_session, friend.id)
        CharacterRepo.update(duckdb_session, frow, PlayerCharacterUpdate(hp_current=5))

        receipt = play_svc.use_item(duckdb_session, pc.id, row.id, friend.id)

        assert receipt["target_name"] == "Hero"
        assert 5 + 4 <= receipt["target_hp_current"] <= 5 + 10

    def test_cross_campaign_target_denied(self, duckdb_session: Session):
        """You cannot pour a potion down a stranger's throat."""
        dm, c, pc, row = self._pc_with_potion(duckdb_session)
        other_campaign = _campaign(duckdb_session, dm)
        outsider = _pc(duckdb_session, other_campaign.id, dm)

        with pytest.raises(PermissionError):
            play_svc.use_item(duckdb_session, pc.id, row.id, outsider.id)

    def test_unknown_item_refused(self, duckdb_session: Session):
        """Items outside the effects table go to the DM."""
        dm, c, pc, row = self._pc_with_potion(duckdb_session, name="Mysterious Orb")

        with pytest.raises(ValueError, match="ask the DM"):
            play_svc.use_item(duckdb_session, pc.id, row.id)

    def test_stack_decrements(self, duckdb_session: Session):
        """A stack of 3 leaves 2 after one use."""
        dm, c, pc, row = self._pc_with_potion(duckdb_session, qty=3)

        receipt = play_svc.use_item(duckdb_session, pc.id, row.id)

        assert receipt["quantity_left"] == 2

    def test_temp_hp_takes_higher(self, duckdb_session: Session):
        """Plum jam grants temp HP; existing higher temp HP is kept."""
        from db.repos.character_repo import CharacterRepo
        from domain.character import PlayerCharacterUpdate

        dm, c, pc, row = self._pc_with_potion(duckdb_session, name="Fey-Touched Plum Jam")
        rowpc = CharacterRepo.get_by_id(duckdb_session, pc.id)
        CharacterRepo.update(duckdb_session, rowpc, PlayerCharacterUpdate(temp_hp=10))

        receipt = play_svc.use_item(duckdb_session, pc.id, row.id)

        assert receipt["effect"] == "temp_hp"
        assert receipt["target_temp_hp"] == 10  # 1d4 can't beat 10
