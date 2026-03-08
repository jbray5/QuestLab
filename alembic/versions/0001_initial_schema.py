"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-03-07

Creates all QuestLab tables:
  campaigns, adventures, player_characters, monster_stat_blocks, loot_tables,
  encounters, items, maps, map_nodes, map_edges, sessions, session_runbooks
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create all tables in dependency order (parents before children)."""
    # ── campaigns ──────────────────────────────────────────────────────────────
    op.create_table(
        "campaigns",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("setting", sa.String(200), nullable=False),
        sa.Column("tone", sa.String(200), nullable=False),
        sa.Column("world_notes", sa.Text(), nullable=True),
        sa.Column("dm_email", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_campaigns_dm_email", "campaigns", ["dm_email"])

    # ── adventures ─────────────────────────────────────────────────────────────
    op.create_table(
        "adventures",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "campaign_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("campaigns.id"),
            nullable=False,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("synopsis", sa.Text(), nullable=True),
        sa.Column("tier", sa.String(10), nullable=False),
        sa.Column("act_count", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("location_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("npc_roster", postgresql.JSON(), nullable=True),
    )
    op.create_index("ix_adventures_campaign_id", "adventures", ["campaign_id"])

    # ── player_characters ──────────────────────────────────────────────────────
    op.create_table(
        "player_characters",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "campaign_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("campaigns.id"),
            nullable=False,
        ),
        sa.Column("player_name", sa.String(100), nullable=False),
        sa.Column("character_name", sa.String(100), nullable=False),
        sa.Column("race", sa.String(100), nullable=False),
        sa.Column("character_class", sa.String(50), nullable=False),
        sa.Column("subclass", sa.String(100), nullable=True),
        sa.Column("level", sa.Integer(), nullable=False),
        sa.Column("background", sa.String(100), nullable=True),
        sa.Column("alignment", sa.String(50), nullable=True),
        sa.Column("score_str", sa.Integer(), nullable=False),
        sa.Column("score_dex", sa.Integer(), nullable=False),
        sa.Column("score_con", sa.Integer(), nullable=False),
        sa.Column("score_int", sa.Integer(), nullable=False),
        sa.Column("score_wis", sa.Integer(), nullable=False),
        sa.Column("score_cha", sa.Integer(), nullable=False),
        sa.Column("hp_max", sa.Integer(), nullable=False),
        sa.Column("hp_current", sa.Integer(), nullable=False),
        sa.Column("ac", sa.Integer(), nullable=False),
        sa.Column("speed", sa.Integer(), nullable=False),
        sa.Column("portrait_url", sa.String(500), nullable=True),
        sa.Column("backstory", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("saving_throw_proficiencies", postgresql.JSON(), nullable=True),
        sa.Column("skill_proficiencies", postgresql.JSON(), nullable=True),
        sa.Column("feats", postgresql.JSON(), nullable=True),
        sa.Column("equipment", postgresql.JSON(), nullable=True),
        sa.Column("spells_known", postgresql.JSON(), nullable=True),
        sa.Column("spell_slots", postgresql.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_player_characters_campaign_id", "player_characters", ["campaign_id"])

    # ── monster_stat_blocks ────────────────────────────────────────────────────
    op.create_table(
        "monster_stat_blocks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("source", sa.String(50), nullable=False, server_default="SRD"),
        sa.Column("size", sa.String(20), nullable=False),
        sa.Column("creature_type", sa.String(30), nullable=False),
        sa.Column("alignment", sa.String(100), nullable=True),
        sa.Column("ac", sa.Integer(), nullable=False),
        sa.Column("ac_notes", sa.String(200), nullable=True),
        sa.Column("hp_average", sa.Integer(), nullable=False),
        sa.Column("hp_formula", sa.String(50), nullable=False),
        sa.Column("score_str", sa.Integer(), nullable=False),
        sa.Column("score_dex", sa.Integer(), nullable=False),
        sa.Column("score_con", sa.Integer(), nullable=False),
        sa.Column("score_int", sa.Integer(), nullable=False),
        sa.Column("score_wis", sa.Integer(), nullable=False),
        sa.Column("score_cha", sa.Integer(), nullable=False),
        sa.Column("challenge_rating", sa.String(5), nullable=False),
        sa.Column("xp", sa.Integer(), nullable=False),
        sa.Column("proficiency_bonus", sa.Integer(), nullable=False),
        sa.Column("languages", sa.String(500), nullable=True),
        sa.Column("is_custom", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_by_email", sa.String(200), nullable=True),
        sa.Column("speed", postgresql.JSON(), nullable=True),
        sa.Column("saving_throws", postgresql.JSON(), nullable=True),
        sa.Column("skills", postgresql.JSON(), nullable=True),
        sa.Column("senses", postgresql.JSON(), nullable=True),
        sa.Column("damage_resistances", postgresql.JSON(), nullable=True),
        sa.Column("damage_immunities", postgresql.JSON(), nullable=True),
        sa.Column("condition_immunities", postgresql.JSON(), nullable=True),
        sa.Column("traits", postgresql.JSON(), nullable=True),
        sa.Column("actions", postgresql.JSON(), nullable=True),
        sa.Column("bonus_actions", postgresql.JSON(), nullable=True),
        sa.Column("reactions", postgresql.JSON(), nullable=True),
        sa.Column("legendary_actions", postgresql.JSON(), nullable=True),
        sa.Column("lair_actions", postgresql.JSON(), nullable=True),
    )

    # ── loot_tables ────────────────────────────────────────────────────────────
    op.create_table(
        "loot_tables",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "adventure_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("adventures.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("tier", sa.String(10), nullable=False),
        sa.Column("entries", postgresql.JSON(), nullable=True),
    )
    op.create_index("ix_loot_tables_adventure_id", "loot_tables", ["adventure_id"])

    # ── items ──────────────────────────────────────────────────────────────────
    op.create_table(
        "items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("rarity", sa.String(20), nullable=False),
        sa.Column("item_type", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("attunement_required", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("value_gp", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_magic", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("properties", postgresql.JSON(), nullable=True),
    )

    # ── encounters ─────────────────────────────────────────────────────────────
    op.create_table(
        "encounters",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "adventure_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("adventures.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("difficulty", sa.String(20), nullable=False, server_default="Moderate"),
        sa.Column("xp_budget", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("terrain_notes", sa.Text(), nullable=True),
        sa.Column("read_aloud_text", sa.Text(), nullable=True),
        sa.Column("dm_notes", sa.Text(), nullable=True),
        sa.Column("reward_xp", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "loot_table_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("loot_tables.id"),
            nullable=True,
        ),
        sa.Column("monster_roster", postgresql.JSON(), nullable=True),
    )
    op.create_index("ix_encounters_adventure_id", "encounters", ["adventure_id"])

    # ── maps ───────────────────────────────────────────────────────────────────
    op.create_table(
        "maps",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "adventure_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("adventures.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("grid_width", sa.Integer(), nullable=False, server_default="20"),
        sa.Column("grid_height", sa.Integer(), nullable=False, server_default="20"),
        sa.Column("background_color", sa.String(20), nullable=False, server_default="#1a1a2e"),
    )
    op.create_index("ix_maps_adventure_id", "maps", ["adventure_id"])

    # ── map_nodes ──────────────────────────────────────────────────────────────
    op.create_table(
        "map_nodes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "map_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("maps.id"),
            nullable=False,
        ),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("node_type", sa.String(20), nullable=False),
        sa.Column("x", sa.Integer(), nullable=False),
        sa.Column("y", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "encounter_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("encounters.id"),
            nullable=True,
        ),
        sa.Column(
            "loot_table_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("loot_tables.id"),
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_map_nodes_map_id", "map_nodes", ["map_id"])

    # ── map_edges ──────────────────────────────────────────────────────────────
    op.create_table(
        "map_edges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "map_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("maps.id"),
            nullable=False,
        ),
        sa.Column(
            "from_node_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("map_nodes.id"),
            nullable=False,
        ),
        sa.Column(
            "to_node_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("map_nodes.id"),
            nullable=False,
        ),
        sa.Column("label", sa.String(100), nullable=True),
        sa.Column("is_secret", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_index("ix_map_edges_map_id", "map_edges", ["map_id"])

    # ── sessions ───────────────────────────────────────────────────────────────
    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "adventure_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("adventures.id"),
            nullable=False,
        ),
        sa.Column("session_number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("date_planned", sa.Date(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="Draft"),
        sa.Column("actual_notes", sa.Text(), nullable=True),
        sa.Column("attending_pc_ids", postgresql.JSON(), nullable=True),
    )
    op.create_index("ix_sessions_adventure_id", "sessions", ["adventure_id"])

    # ── session_runbooks ───────────────────────────────────────────────────────
    op.create_table(
        "session_runbooks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sessions.id"),
            nullable=False,
            unique=True,
        ),
        sa.Column("model_used", sa.String(100), nullable=False),
        sa.Column("opening_scene", sa.Text(), nullable=False),
        sa.Column("generated_at", sa.DateTime(), nullable=False),
        sa.Column("closing_hooks", sa.Text(), nullable=True),
        sa.Column("scenes", postgresql.JSON(), nullable=True),
        sa.Column("npc_dialog", postgresql.JSON(), nullable=True),
        sa.Column("encounter_flows", postgresql.JSON(), nullable=True),
        sa.Column("xp_awards", postgresql.JSON(), nullable=True),
        sa.Column("loot_awards", postgresql.JSON(), nullable=True),
    )
    op.create_index("ix_session_runbooks_session_id", "session_runbooks", ["session_id"])


def downgrade() -> None:
    """Drop all tables in reverse dependency order."""
    op.drop_table("session_runbooks")
    op.drop_table("sessions")
    op.drop_table("map_edges")
    op.drop_table("map_nodes")
    op.drop_table("maps")
    op.drop_table("encounters")
    op.drop_table("items")
    op.drop_table("loot_tables")
    op.drop_table("player_characters")
    op.drop_table("monster_stat_blocks")
    op.drop_table("adventures")
    op.drop_table("campaigns")
