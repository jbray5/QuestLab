import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Copy, Dices, ExternalLink, Plus, QrCode, ScrollText, Users, X } from "lucide-react";
import { zoomable } from "../lib/lightbox";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { campaignsApi } from "../api/campaigns";
import { charactersApi } from "../api/characters";
import { featuresApi } from "../api/features";
import type { PlayerCharacter } from "../api/types";
import CharacterSheet from "../components/character-sheet/CharacterSheet";
import PlayerLinkButton from "../components/character-sheet/PlayerLinkButton";
import FeaturePanel from "../components/FeaturePanel";
import ImageUpload from "../components/ImageUpload";
import InventoryPanel from "../components/InventoryPanel";
import SpellPanel from "../components/SpellPanel";
import { portraitSrc } from "../lib/portrait";
import RowMenu from "../components/RowMenu";
import RulesPicker from "../components/RulesPicker";
import { rulesetOf, type Ruleset } from "../lib/ruleset";
import Monogram from "../components/character-sheet/Monogram";
import { useIsCompact } from "../hooks/useIsCompact";

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

/** The join link as players open it. */
function joinUrlFor(campaignId: string): string {
  return `${window.location.origin}/join/${campaignId}`;
}

/**
 * How players join (Plan 128): the campaign's join link with Copy and a QR,
 * the optional join code, and whether players may build their own characters.
 * The page used to say "Share your join link" without showing one.
 */
function JoinCard({
  campaignId,
  joinCode,
  signupOn,
  signupPending,
  onSignup,
  codePending,
  onCodeDraft,
  onCodeCommit,
}: {
  campaignId: string;
  joinCode: string;
  signupOn: boolean;
  signupPending: boolean;
  onSignup: (on: boolean) => void;
  codePending: boolean;
  onCodeDraft: (code: string) => void;
  onCodeCommit: (code: string) => void;
}) {
  const phone = useIsCompact(640);
  const url = joinUrlFor(campaignId);
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrError, setQrError] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  async function toggleQr() {
    const next = !qrOpen;
    setQrOpen(next);
    if (!next || qr) return;
    try {
      // Loaded on first use: most visits never open the QR.
      const QRCode = (await import("qrcode")).default;
      setQr(await QRCode.toDataURL(url, { width: 440, margin: 2, color: { dark: "#11151a", light: "#f3ead6" } }));
      setQrError(false);
    } catch {
      setQrError(true);
    }
  }

  function generateCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    onCodeDraft(code);
    onCodeCommit(code);
  }

  return (
    <section className="card" aria-labelledby="join-card-title" style={{ marginBottom: "1.5rem" }}>
      <h2 id="join-card-title" style={{ fontSize: "1.1rem", margin: "0 0 0.3rem" }}>
        How players join
      </h2>
      <p className="text-sm text-muted" style={{ margin: "0 0 0.75rem", lineHeight: 1.5 }}>
        Send this link (or let them scan the QR) and players pick their character on their phone
        {signupOn ? ", or build one" : ""}.
        {joinCode ? (
          <>
            {" "}They type the join code <strong className="num" style={{ color: "var(--text)" }}>{joinCode}</strong> first.
          </>
        ) : (
          " Add a join code so only your table can see the party."
        )}
      </p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: phone ? "wrap" : "nowrap", alignItems: "center" }}>
        <input
          type="text"
          readOnly
          value={url}
          aria-label="Join link"
          onFocus={(e) => e.currentTarget.select()}
          className="num"
          style={{ flex: "1 1 260px", minWidth: 0, fontSize: phone ? 16 : "0.875rem", padding: "0.4rem 0.6rem" }}
        />
        <button type="button" className="btn btn-primary" onClick={() => void copy()} style={{ flex: phone ? "1 1 0" : "none" }}>
          {copied ? <><Check size={15} aria-hidden /> Copied</> : <><Copy size={15} aria-hidden /> Copy link</>}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void toggleQr()}
          aria-expanded={qrOpen}
          style={{ flex: phone ? "1 1 0" : "none" }}
        >
          <QrCode size={15} aria-hidden /> {qrOpen ? "Hide QR" : "Show QR"}
        </button>
      </div>

      {qrOpen && (
        <div style={{ marginTop: "0.85rem", display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          {qr ? (
            <img
              src={qr}
              alt={`QR code for the join link ${url}`}
              width={200}
              height={200}
              style={{ width: 200, height: 200, borderRadius: 10, border: "1px solid var(--border2)" }}
            />
          ) : (
            <span className="text-sm text-muted">
              {qrError ? "Couldn't draw the QR. The link above works the same." : "Drawing the QR…"}
            </span>
          )}
          <p className="text-sm text-muted" style={{ margin: 0, maxWidth: 320, lineHeight: 1.5 }}>
            Players point their phone camera at it. At the table, the HUD can also put this QR on the TV.
          </p>
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: "0.75rem 1.5rem",
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: "0.9rem",
          paddingTop: "0.75rem",
          borderTop: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <label
            htmlFor="join-code"
            style={{ margin: 0, fontSize: "0.875rem", color: "var(--text2)" }}
            title="Players open your join link (or scan the QR), type this code, then pick or build their character. Without a code, anyone with the link can see the party."
          >
            Join code
          </label>
          <input
            id="join-code"
            value={joinCode}
            onChange={(e) => onCodeDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
            onBlur={(e) => onCodeCommit(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            placeholder="no code"
            maxLength={12}
            className="num"
            style={{ width: 130, padding: "0.3rem 0.5rem", fontSize: phone ? 16 : "0.875rem" }}
          />
          {/* Review 10/30 — sign-up on with no code showed "Join code: none" and no way forward. */}
          {!joinCode && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: "0.8125rem", padding: "0.3rem 0.6rem", minHeight: 0 }}
              disabled={codePending}
              onClick={generateCode}
              title="Make a short code the join page asks for"
            >
              <Dices size={14} aria-hidden /> Generate
            </button>
          )}
        </div>
        {/* Plan 74 — players build their own characters from the join link. */}
        <label
          className="ql-s6-tap"
          style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.875rem", color: "var(--text2)", cursor: "pointer", margin: 0 }}
          title="When on, anyone with your join link and code can create a character in this campaign"
        >
          <input
            type="checkbox"
            checked={signupOn}
            onChange={(e) => onSignup(e.target.checked)}
            disabled={signupPending}
            style={{ width: 20, height: 20, flex: "none" }}
          />
          Players can build their own characters
        </label>
      </div>
    </section>
  );
}

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
  // Plan 131 — the campaign's rules; the server refuses a change once characters exist.
  const rulesMut = useMutation({
    mutationFn: (r: Ruleset) => campaignsApi.update(campaignId as string, { ruleset: r }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PlayerCharacter | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [formError, setFormError] = useState("");
  const [sheetPcId, setSheetPcId] = useState<string | null>(null);
  // Phones (Plan 123): the add/edit form stacks, and `.ql-s6` makes the small
  // inline buttons and fields thumb-sized (index.css, S6 block).
  const phone = useIsCompact(640);

  const { data: characters = [], isLoading } = useQuery({
    queryKey: ["characters", campaignId],
    queryFn: () => charactersApi.list(campaignId!),
    enabled: !!campaignId,
  });

  // Plan 126 — back from the wizard with ?new=<id>: light that card, bring it into view,
  // and say how the player gets it.
  const [params, setParams] = useSearchParams();
  const newId = params.get("new");
  const newPc = newId ? characters.find((c) => c.id === newId) : undefined;
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!newPc || scrolledTo.current === newPc.id) return;
    scrolledTo.current = newPc.id;
    window.setTimeout(() => document.getElementById(`pc-${newPc.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
  }, [newPc]);
  function dismissNew() {
    const next = new URLSearchParams(params);
    next.delete("new");
    setParams(next, { replace: true });
  }

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
    <div className="fade-in ql-s6">
      <div
        className="flex items-center"
        style={{ marginBottom: "1rem", justifyContent: "space-between", gap: phone ? "0.75rem" : undefined, flexWrap: "wrap" }}
      >
        <h1 style={{ margin: 0 }}>Characters</h1>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
          {/* Plan 126 — Add character opens the guided, rules-checked wizard (the one players
              use); copying a finished sheet in by hand lives in the ⋯ menu. */}
          <Link className="btn btn-primary" to={`/campaigns/${campaignId}/characters/new`}>
            <Plus size={16} aria-hidden /> Add character
          </Link>
          {/* Usability pass — a party level-up happens every few sessions, so it
              lives in the page's ⋯ menu (it still confirms with the names). */}
          <RowMenu
            label="More for the party"
            items={[
              {
                label: "Enter an existing sheet…",
                onSelect: () => {
                  resetForm();
                  setShowForm(true);
                },
              },
              {
                label: "Level up the party…",
                disabled: !characters.length,
                onSelect: () => void levelUpParty(),
              },
            ]}
          />
        </div>
      </div>

      {/* Plan 128 — the join link the page tells you to share, right here (Adaeze, Marco). */}
      {campaignId && (
        <JoinCard
          campaignId={campaignId}
          joinCode={joinCode}
          signupOn={campaign?.allow_player_signup ?? true}
          signupPending={signupMut.isPending}
          onSignup={(on) => signupMut.mutate(on)}
          codePending={codeMut.isPending}
          onCodeDraft={(code) => setJoinCodeDraft(code)}
          onCodeCommit={(code) => {
            if ((campaign?.join_code ?? "") !== code) codeMut.mutate(code);
          }}
        />
      )}

      {/* Plan 131 — which edition this table plays by; locked once a character exists. */}
      {campaign && !isLoading && (
        <section className="card" aria-label="Rules" style={{ marginBottom: "1.25rem" }}>
          <RulesPicker
            value={rulesetOf(campaign.ruleset)}
            onChange={(r) => rulesMut.mutate(r)}
            locked={characters.length > 0}
            busy={rulesMut.isPending}
          />
          {rulesMut.isError && (
            <p role="alert" className="text-sm" style={{ color: "var(--danger-text)", margin: "0.4rem 0 0" }}>
              {(rulesMut.error as Error).message}
            </p>
          )}
        </section>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem", maxWidth: 600 }}>
          <h3>{editing ? "Edit character" : "Enter an existing sheet"}</h3>
          {!editing && (
            <p className="text-sm text-muted" style={{ margin: "-0.25rem 0 0.75rem" }}>
              For a character that already exists on paper or in another app: type in what the sheet says. To make a new
              one with the rules checked, use Add character.
            </p>
          )}

          <div
            style={{
              display: "flex",
              flexDirection: phone ? "column" : undefined,
              gap: "1.25rem",
              alignItems: phone ? "stretch" : "flex-start",
              marginBottom: "0.75rem",
            }}
          >
            <ImageUpload
              currentUrl={form.portrait_url || null}
              onUrlChange={(url) => setForm((prev) => ({ ...prev, portrait_url: url }))}
              label="Portrait"
              size={100}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="grid-2"
                style={phone ? { gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0 0.75rem", alignItems: "end" } : undefined}
              >
                <div className="form-group">
                  <label htmlFor="pc-name">Character name *</label>
                  <input id="pc-name" value={form.character_name} onChange={f("character_name")} />
                </div>
                <div className="form-group">
                  <label htmlFor="pc-player">Player name</label>
                  <input id="pc-player" value={form.player_name} onChange={f("player_name")} />
                </div>
                <div className="form-group">
                  <label htmlFor="pc-species">Species</label>
                  <input id="pc-species" value={form.race} onChange={f("race")} placeholder="e.g. Dwarf" />
                </div>
                <div className="form-group">
                  <label htmlFor="pc-class">Class</label>
                  <select
                    id="pc-class"
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
                  <label htmlFor="pc-subclass">Subclass (chosen at level 3)</label>
                  <input
                    id="pc-subclass"
                    value={form.subclass}
                    onChange={f("subclass")}
                    placeholder="e.g. Champion, Circle of the Moon"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="pc-level">Level</label>
                  <input
                    id="pc-level"
                    type="number"
                    min={1}
                    max={20}
                    value={form.level}
                    onChange={f("level")}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="pc-speed">Speed (ft)</label>
                  <input
                    id="pc-speed"
                    type="number"
                    value={form.speed}
                    onChange={f("speed")}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="pc-ac">Armor class</label>
                  <input
                    id="pc-ac"
                    type="number"
                    value={form.ac}
                    onChange={f("ac")}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="pc-hp">Hit points</label>
                  <input
                    id="pc-hp"
                    type="number"
                    value={form.hp_current}
                    onChange={f("hp_current")}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="pc-maxhp">Max hit points</label>
                  <input
                    id="pc-maxhp"
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
              gridTemplateColumns: phone ? "repeat(3, minmax(0, 1fr))" : "repeat(6, 1fr)",
              gap: "0.5rem",
              margin: "0.5rem 0 1rem",
            }}
          >
            {STATS.map((s, i) => (
              <div key={s} className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor={`pc-${s}`} title={ABILITY_NAMES[i]}>{STAT_LABELS[i]}</label>
                <input
                  id={`pc-${s}`}
                  aria-label={ABILITY_NAMES[i]}
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
            <label htmlFor="pc-notes">Notes</label>
            <textarea id="pc-notes" value={form.notes} onChange={f("notes")} rows={2} style={{ resize: "vertical" }} />
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

      {newPc && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "1rem",
            padding: "0.35rem 0.35rem 0.35rem 0.85rem",
            background: "var(--accent-soft)",
            border: "1px solid var(--accent-line)",
            borderRadius: 8,
            fontSize: "0.9375rem",
            color: "var(--text2)",
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            Send <span className="story" style={{ color: "var(--text)", fontWeight: 700 }}>{newPc.character_name}</span>&rsquo;s
            player their link: Share player link on the card.
          </span>
          <button
            className="btn btn-ghost ql-s6-sq"
            style={{ padding: "0.25rem 0.4rem", minHeight: 0, border: "none" }}
            aria-label="Dismiss"
            title="Dismiss"
            onClick={dismissNew}
          >
            <X size={15} />
          </button>
        </div>
      )}

      <div className="ql-card-grid">
        {characters.map((c) => (
          <div
            key={c.id}
            id={`pc-${c.id}`}
            className="card"
            style={c.id === newId ? { borderColor: "var(--accent-edge)", background: "var(--accent-soft)" } : undefined}
          >
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
                <Monogram name={c.character_name} cls={c.character_class} />
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
                  {/* Plan 126 — a DM-built character waits for its player. */}
                  {c.player_name === "Not assigned yet"
                    ? " · no player yet"
                    : c.player_name
                      ? ` · played by ${c.player_name}`
                      : ""}
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

            {/* Usability pass — art is set once, so it folds away under the stats.
                10/31 — no 3D figures here (Justin): a WebGL preview per character
                ran phones out of memory and crashed the page. */}
            <details style={{ marginTop: "0.75rem" }}>
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  color: "var(--muted)",
                  padding: phone ? "0.75rem 0" : undefined,
                }}
              >
                Portrait
              </summary>
              <div style={{ marginTop: "0.6rem", display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                <ImageUpload
                  currentUrl={portraitSrc(c.portrait_url, c.updated_at) ?? null}
                  onUrlChange={(url) => updateImage.mutate({ id: c.id, url })}
                  label="Portrait"
                  size={48}
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
                  href={`/play/${c.play_token ?? c.id}/level-up`}
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
              <PlayerLinkButton characterId={c.id} playToken={c.play_token} characterName={c.character_name} />
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
              Your party lives here: each player&rsquo;s sheet, spells and gear. Send players the join link
              above so they build their own, or use Add character to build one step by step.
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
