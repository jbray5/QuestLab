import { useState } from "react";
import { ArrowUp, Dices, ExternalLink, Plus, ScrollText, Users, X } from "lucide-react";
import { zoomable } from "../lib/lightbox";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { campaignsApi } from "../api/campaigns";
import { charactersApi } from "../api/characters";
import { featuresApi } from "../api/features";
import type { PlayerCharacter } from "../api/types";
import CharacterSheet from "../components/character-sheet/CharacterSheet";
import FeaturePanel from "../components/FeaturePanel";
import ImageUpload from "../components/ImageUpload";
import ModelUpload from "../components/ModelUpload";
import { heightFtForRace } from "../engine/heights";
import InventoryPanel from "../components/InventoryPanel";
import SpellPanel from "../components/SpellPanel";
import { portraitSrc } from "../lib/portrait";
import RowMenu from "../components/RowMenu";
import Monogram from "../components/character-sheet/Monogram";

function mod(score: number) {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

/** A muted label over a mono value — the card's stat tiles (Plan 121). */
function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
      <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>{label}</span>
      <span className="num" style={{ fontSize: "0.95rem", color: "var(--text)" }}>{children}</span>
    </div>
  );
}

function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  // Lamplit health: teal → amber at half → red when critical.
  const cls = pct > 50 ? "green" : pct > 20 ? "yellow" : "red";
  return (
    <div className="hp-bar-track" style={{ marginTop: "0.35rem" }}>
      <div className={`hp-bar-fill ${cls}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const BLANK_FORM = {
  character_name: "",
  player_name: "",
  race: "",
  character_class: "",
  subclass: "",
  level: 1,
  speed: 30,
  hp_current: 10,
  hp_max: 10,
  ac: 10,
  score_str: 10,
  score_dex: 10,
  score_con: 10,
  score_int: 10,
  score_wis: 10,
  score_cha: 10,
  notes: "",
  portrait_url: "",
};

const STATS = [
  "score_str",
  "score_dex",
  "score_con",
  "score_int",
  "score_wis",
  "score_cha",
] as const;
const STAT_LABELS = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
const ABILITY_NAMES = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];

export default function Characters() {
  const { campaignId } = useParams<{ campaignId: string }>();
  // Plan 74 — the campaign row carries the player sign-up switch.
  const { data: campaign } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: () => campaignsApi.get(campaignId as string),
    enabled: !!campaignId,
  });
  const signupMut = useMutation({
    mutationFn: (on: boolean) =>
      campaignsApi.update(campaignId as string, { allow_player_signup: on } as Record<string, unknown>),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["campaign", campaignId] }),
  });
  // Plan 83 — an optional join code: the join page asks for it before it lists the party.
  const [joinCodeDraft, setJoinCodeDraft] = useState<string | null>(null);
  const joinCode = joinCodeDraft ?? (campaign?.join_code ?? "");
  const codeMut = useMutation({
    mutationFn: (code: string) =>
      campaignsApi.update(campaignId as string, { join_code: code } as Record<string, unknown>),
    onSuccess: () => {
      setJoinCodeDraft(null);
      void qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
    },
  });
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PlayerCharacter | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [formError, setFormError] = useState("");
  const [sheetPcId, setSheetPcId] = useState<string | null>(null);

  const { data: characters = [], isLoading } = useQuery({
    queryKey: ["characters", campaignId],
    queryFn: () => charactersApi.list(campaignId!),
    enabled: !!campaignId,
  });

  const create = useMutation({
    mutationFn: () => charactersApi.create(campaignId!, { ...form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["characters", campaignId] });
      resetForm();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const update = useMutation({
    mutationFn: async () => {
      const saved = await charactersApi.update(editing!.id, { ...form });
      // Level/subclass may have changed — sync class features (idempotent).
      await featuresApi.sync(editing!.id).catch(() => undefined);
      return saved;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["characters", campaignId] });
      resetForm();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const updateImage = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) =>
      charactersApi.updateImage(id, url),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters", campaignId] }),
  });

  // Plan 111 — the rigged figure the immersive table walks for this PC.
  const updateModel = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string | null }) =>
      charactersApi.update(id, { model_url: url }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters", campaignId] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => charactersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters", campaignId] }),
  });

  /** Plan 115 — open a level-up: the player's sheet shows the guide and they make their own
   * choices (HP, feat, spells). The DM never fills a prompt. */
  const grantLevel = useMutation({
    mutationFn: (id: string) => charactersApi.grantLevelUp(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters", campaignId] }),
    onError: (e: Error) => window.alert(e.message),
  });
  const revokeLevel = useMutation({
    mutationFn: (id: string) => charactersApi.revokeLevelUp(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters", campaignId] }),
  });

  /** Grant the next level to every PC at the party's level (stragglers and test builds skip). */
  async function levelUpParty() {
    const top = Math.max(0, ...characters.map((c) => c.level));
    const party = characters.filter((c) => c.level === top && !(c.pending_level && c.pending_level > c.level));
    if (!party.length || top >= 20) return;
    const names = party.map((c) => `• ${c.character_name}`).join("\n");
    const prompt = `Level up to ${top + 1}?\n\n${names}\n\nEach player gets the level-up guide on their sheet.`;
    if (!window.confirm(prompt)) return;
    for (const c of party) await charactersApi.grantLevelUp(c.id);
    void qc.invalidateQueries({ queryKey: ["characters", campaignId] });
  }

  function resetForm() {
    setForm(BLANK_FORM);
    setFormError("");
    setShowForm(false);
    setEditing(null);
  }

  function startEdit(c: PlayerCharacter) {
    setEditing(c);
    setForm({
      character_name: c.character_name,
      player_name: c.player_name ?? "",
      race: c.race ?? "",
      character_class: c.character_class ?? "",
      subclass: c.subclass ?? "",
      level: c.level,
      speed: c.speed ?? 30,
      hp_current: c.hp_current,
      hp_max: c.hp_max,
      ac: c.ac,
      score_str: c.score_str,
      score_dex: c.score_dex,
      score_con: c.score_con,
      score_int: c.score_int,
      score_wis: c.score_wis,
      score_cha: c.score_cha,
      notes: c.notes ?? "",
      portrait_url: c.portrait_url ?? "",
    });
    setFormError("");
    setShowForm(true);
  }

  const f =
    (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({
        ...prev,
        [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value,
      }));

  return (
    <div className="fade-in">
      <div
        className="flex items-center"
        style={{ marginBottom: "1.5rem", justifyContent: "space-between" }}
      >
        <div>
          <h1 style={{ marginBottom: "0.2rem" }}>Characters</h1>
          {(campaign?.allow_player_signup ?? true) && (
            <p className="text-sm text-muted" style={{ margin: 0 }}>
              Players join from your join link or the QR on the TV
              {joinCode ? (
                <>
                  , type <strong className="num" style={{ color: "var(--text)" }}>{joinCode}</strong>, and build or pick their character.
                </>
              ) : (
                " and build their character. Add a join code so only your table can see the party."
              )}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
          {/* Plan 74 — players build their own characters from the join link. */}
          <label
            style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.8125rem", color: "var(--text2)", cursor: "pointer", margin: 0 }}
            title="When on, anyone with your join link / QR can create a character in this campaign"
          >
            <input
              type="checkbox"
              checked={campaign?.allow_player_signup ?? true}
              onChange={(e) => signupMut.mutate(e.target.checked)}
              disabled={signupMut.isPending}
            />
            Players can create their own characters
          </label>
          <label
            style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.8125rem", color: "var(--text2)", margin: 0 }}
            title="Players open your join link (or scan the QR on the TV), type this code, then pick or build their character. Without a code, anyone with the link can see the party."
          >
            Join code
            <input
              value={joinCode}
              onChange={(e) => setJoinCodeDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
              onBlur={() => {
                if ((campaign?.join_code ?? "") !== joinCode) codeMut.mutate(joinCode);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder="no code"
              maxLength={12}
              className="num"
              style={{ width: 120, padding: "0.3rem 0.5rem", fontSize: "0.875rem" }}
            />
            {/* Review 10/30 — sign-up on with no code showed "Join code: none"
                and no way forward. One tap makes one; the hint says how it's used. */}
            {!joinCode && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: "0.8125rem", padding: "0.3rem 0.6rem", minHeight: 0 }}
                disabled={codeMut.isPending}
                onClick={() => {
                  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
                  const bytes = crypto.getRandomValues(new Uint8Array(6));
                  const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
                  setJoinCodeDraft(code);
                  codeMut.mutate(code);
                }}
                title="Make a short code the join page asks for"
              >
                <Dices size={14} /> Generate
              </button>
            )}
          </label>
          <button
            className={showForm && !editing ? "btn btn-secondary" : "btn btn-primary"}
            onClick={() => {
              resetForm();
              setShowForm(!showForm);
            }}
          >
            {showForm && !editing ? (
              <>
                <X size={16} /> Cancel
              </>
            ) : (
              <>
                <Plus size={16} /> Add character
              </>
            )}
          </button>
          {/* Usability pass — a party level-up happens every few sessions, so it
              lives in the page's ⋯ menu (it still confirms with the names). */}
          <RowMenu
            label="More for the party"
            items={[
              {
                label: "Level up the party…",
                disabled: !characters.length,
                onSelect: () => void levelUpParty(),
              },
            ]}
          />
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem", maxWidth: 600 }}>
          <h3>{editing ? "Edit character" : "New character"}</h3>

          <div style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start", marginBottom: "0.75rem" }}>
            <ImageUpload
              currentUrl={form.portrait_url || null}
              onUrlChange={(url) => setForm((prev) => ({ ...prev, portrait_url: url }))}
              label="Portrait"
              size={100}
            />
            <div style={{ flex: 1 }}>
              <div className="grid-2">
                <div className="form-group">
                  <label>Character name *</label>
                  <input value={form.character_name} onChange={f("character_name")} />
                </div>
                <div className="form-group">
                  <label>Player name</label>
                  <input value={form.player_name} onChange={f("player_name")} />
                </div>
                <div className="form-group">
                  <label>Race</label>
                  <input value={form.race} onChange={f("race")} />
                </div>
                <div className="form-group">
                  <label>Class</label>
                  <select
                    value={form.character_class}
                    onChange={(e) => setForm((p) => ({ ...p, character_class: e.target.value }))}
                  >
                    <option value="">— select —</option>
                    {["Barbarian","Bard","Cleric","Druid","Fighter","Monk","Paladin",
                      "Ranger","Rogue","Sorcerer","Warlock","Wizard","Artificer"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Subclass (chosen at level 3)</label>
                  <input
                    value={form.subclass}
                    onChange={f("subclass")}
                    placeholder="e.g. Champion, Circle of the Moon"
                  />
                </div>
                <div className="form-group">
                  <label>Level</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={form.level}
                    onChange={f("level")}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div className="form-group">
                  <label>Speed (ft)</label>
                  <input
                    type="number"
                    value={form.speed}
                    onChange={f("speed")}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div className="form-group">
                  <label>AC</label>
                  <input
                    type="number"
                    value={form.ac}
                    onChange={f("ac")}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div className="form-group">
                  <label>HP</label>
                  <input
                    type="number"
                    value={form.hp_current}
                    onChange={f("hp_current")}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div className="form-group">
                  <label>Max HP</label>
                  <input
                    type="number"
                    value={form.hp_max}
                    onChange={f("hp_max")}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: "0.5rem",
              margin: "0.5rem 0 1rem",
            }}
          >
            {STATS.map((s, i) => (
              <div key={s} className="form-group" style={{ marginBottom: 0 }}>
                <label>{STAT_LABELS[i]}</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={form[s]}
                  onChange={f(s)}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{ textAlign: "center" }}
                />
              </div>
            ))}
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea value={form.notes} onChange={f("notes")} rows={2} style={{ resize: "vertical" }} />
          </div>

          {formError && (
            <p style={{ color: "var(--danger-text)", fontSize: "0.875rem", margin: "0.25rem 0 0.5rem" }}>
              {formError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              className="btn btn-primary"
              onClick={() => (editing ? update.mutate() : create.mutate())}
              disabled={
                !form.character_name.trim() ||
                !form.character_class ||
                create.isPending ||
                update.isPending
              }
            >
              {editing ? "Save" : "Create"}
            </button>
            <button className="btn btn-secondary" onClick={resetForm}>Cancel</button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-muted">Loading…</p>}

      <div className="ql-card-grid">
        {characters.map((c) => (
          <div key={c.id} className="card">
            <div className="flex items-center" style={{ gap: "0.75rem", marginBottom: "0.85rem" }}>
              {c.portrait_url ? (
                <img
                  src={portraitSrc(c.portrait_url, c.updated_at)} {...zoomable(portraitSrc(c.portrait_url, c.updated_at), c.character_name)}
                  alt={c.character_name}
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 6,
                    objectFit: "cover",
                    border: "1px solid var(--border2)",
                    flexShrink: 0,
                  }}
                />
              ) : (
                <Monogram name={c.character_name} />
              )}
              <div style={{ minWidth: 0, flex: "1 1 0" }}>
                <h3
                  className="story"
                  style={{ margin: 0, fontSize: "1.2rem", lineHeight: 1.2, wordBreak: "break-word" }}
                >
                  {c.character_name}
                </h3>
                <p style={{ margin: "0.15rem 0 0", fontSize: "0.875rem", color: "var(--muted)" }}>
                  {[`Level ${c.level}`, [c.race, c.character_class].filter(Boolean).join(" ")]
                    .filter(Boolean)
                    .join(" ")}
                  {c.player_name ? ` · played by ${c.player_name}` : ""}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: "1.25rem", alignItems: "baseline", flexWrap: "wrap" }}>
              <span title="Armor Class — what an attack roll must reach to hit">
                <Stat label="AC">{c.ac}</Stat>
              </span>
              <span title="Hit points — current / maximum">
                <Stat label="HP">
                  {c.hp_current}/{c.hp_max}
                </Stat>
              </span>
            </div>
            <HpBar hp={c.hp_current} maxHp={c.hp_max} />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(6, 1fr)",
                gap: "0.25rem",
                marginTop: "0.85rem",
                padding: "0.45rem 0.25rem",
                background: "var(--surface2)",
                borderRadius: 8,
                textAlign: "center",
              }}
            >
              {STATS.map((s, i) => (
                <div key={s} title={`${ABILITY_NAMES[i]} ${c[s]} (modifier ${mod(c[s])})`}>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{STAT_LABELS[i]}</div>
                  <div className="num" style={{ fontSize: "0.95rem", color: "var(--text)" }}>{mod(c[s])}</div>
                  <div className="num" style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{c[s]}</div>
                </div>
              ))}
            </div>

            {/* Usability pass — art is set once, so it folds away under the stats. */}
            <details style={{ marginTop: "0.75rem" }}>
              <summary style={{ cursor: "pointer", fontSize: "0.8125rem", color: "var(--muted)" }}>
                Portrait and 3D figure
              </summary>
              <div style={{ marginTop: "0.6rem", display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                <ImageUpload
                  currentUrl={portraitSrc(c.portrait_url, c.updated_at) ?? null}
                  onUrlChange={(url) => updateImage.mutate({ id: c.id, url })}
                  label="Portrait"
                  size={48}
                />
                <ModelUpload
                  currentUrl={c.model_url}
                  onUrlChange={(url) => updateModel.mutate({ id: c.id, url })}
                  heightFt={heightFtForRace(c.race)}
                />
              </div>
            </details>

            <InventoryPanel characterId={c.id} characterName={c.character_name} />

            <SpellPanel
              characterId={c.id}
              characterClass={c.character_class}
              characterName={c.character_name}
            />

            <FeaturePanel
              characterId={c.id}
              characterClass={c.character_class}
              characterLevel={c.level}
              characterName={c.character_name}
            />

            {/* A pending level-up is live: the player's guide is waiting. */}
            {c.pending_level && c.pending_level > c.level ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginTop: "0.75rem",
                  padding: "0.35rem 0.35rem 0.35rem 0.75rem",
                  background: "var(--accent-soft)",
                  border: "1px solid var(--accent-line)",
                  borderRadius: 8,
                  fontSize: "0.875rem",
                }}
              >
                <ArrowUp size={14} style={{ color: "var(--accent-text)" }} />
                <span style={{ flex: 1, color: "var(--text2)" }}>Level {c.level + 1} is waiting for the player</span>
                <a
                  className="btn btn-ghost"
                  style={{ fontSize: "0.8125rem", padding: "0.25rem 0.55rem", minHeight: 0, color: "var(--accent-text)", borderColor: "var(--accent-line)" }}
                  href={`/play/${c.id}/level-up`}
                  target="_blank"
                  rel="noreferrer"
                  title="The player's guide — open it here to walk them through it"
                >
                  Open guide <ExternalLink size={13} />
                </a>
                <button
                  className="btn btn-ghost"
                  style={{ padding: "0.25rem 0.4rem", minHeight: 0, border: "none" }}
                  title="Withdraw the level-up"
                  aria-label={`Withdraw ${c.character_name}'s level-up`}
                  onClick={() => revokeLevel.mutate(c.id)}
                >
                  <X size={15} />
                </button>
              </div>
            ) : null}

            <div className="flex gap-2" style={{ marginTop: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
              <button
                className="btn btn-secondary"
                onClick={() => setSheetPcId(c.id)}
                title="Open full character sheet"
              >
                <ScrollText size={16} /> Open sheet
              </button>
              <button className="btn btn-ghost" onClick={() => startEdit(c)}>
                Edit
              </button>
              <span style={{ marginLeft: "auto" }}>
                <RowMenu
                  label={`More for ${c.character_name}`}
                  items={[
                    // Usability pass — a single PC's level-up is occasional: it lives here.
                    ...(c.pending_level && c.pending_level > c.level
                      ? []
                      : [
                          {
                            label: `Level up to ${c.level + 1}`,
                            disabled: c.level >= 20,
                            onSelect: () => grantLevel.mutate(c.id),
                          },
                        ]),
                    {
                      label: "Delete character…",
                      danger: true,
                      confirm: `Delete ${c.character_name}? Their sheet, spells and inventory go with them, and ${c.player_name || "their player"}'s link stops working. This can't be undone.`,
                      onSelect: () => del.mutate(c.id),
                    },
                  ]}
                />
              </span>
            </div>
          </div>
        ))}
        {!isLoading && characters.length === 0 && (
          <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
            <div className="empty-icon">
              <Users size={28} />
            </div>
            <p style={{ maxWidth: 460, margin: "0 auto" }}>
              Your party lives here: each player&rsquo;s sheet, spells and gear. Share your join link so
              players build their own, or use Add character.
            </p>
          </div>
        )}
      </div>

      {sheetPcId && (
        <CharacterSheet
          characterId={sheetPcId}
          onClose={() => setSheetPcId(null)}
        />
      )}
    </div>
  );
}
