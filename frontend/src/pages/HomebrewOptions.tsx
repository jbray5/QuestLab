import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ChevronRight, Copy, Pencil, Plus } from "lucide-react";

import {
  homebrewApi,
  homebrewRulesLabel,
  type HomebrewRace,
  type HomebrewSubclass,
} from "../api/homebrew";
import RaceForm, { type HomebrewFormMode } from "../components/homebrew/RaceForm";
import SubclassForm from "../components/homebrew/SubclassForm";
import { ABILITY_LIST, andList, signed } from "../components/homebrew/options";
import PhoneSheet from "../components/PhoneSheet";
import RowMenu from "../components/RowMenu";
import { useIsCompact } from "../hooks/useIsCompact";

/**
 * Races & subclasses (Plan 133) — the DM's own character options, at /homebrew.
 *
 * Every row here is the DM's own (homebrew races and subclasses have no shared rows), so
 * there is no "Yours" chip. Players pick them when they build a character in any of the
 * DM's campaigns. `?tab=subclasses` opens the second tab and `?new=1` opens a blank form on
 * arrival, for "make one now" links from the character builder.
 */

type Tab = "races" | "subclasses";

type FormState =
  | { kind: "race"; mode: HomebrewFormMode; from: HomebrewRace | null; key: number }
  | { kind: "subclass"; mode: HomebrewFormMode; from: HomebrewSubclass | null; key: number };

// Every homebrew query lives under ["homebrew", ...], so one invalidation refreshes them all.
const HOMEBREW_KEYS = { races: ["homebrew", "races"], subclasses: ["homebrew", "subclasses"] } as const;

/** A muted label over its value. */
function Fact({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <div style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>{label}</div>
      <div style={{ color: "var(--text)" }}>{children}</div>
    </div>
  );
}

const FACTS: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "0.6rem 1rem",
  fontSize: "0.875rem",
  marginBottom: "0.75rem",
};

/** "DEX +2, WIS +1, plus two +1s of the player's choice (not CHA)". */
function bonusLine(r: HomebrewRace): string | null {
  const fixed = ABILITY_LIST.filter(([code]) => (r.ability_bonuses[code] ?? 0) > 0).map(
    ([code]) => `${code} ${signed(r.ability_bonuses[code] ?? 0)}`,
  );
  const choice = r.ability_choice;
  const words = ["", "one", "two", "three"];
  if (choice) {
    const picks = `${choice.choose === 1 ? "one +1" : `${words[choice.choose]} +1s`} of the player's choice`;
    const not = choice.exclude.length ? ` (not ${andList(choice.exclude)})` : "";
    fixed.push(`${fixed.length ? "plus " : ""}${picks}${not}`);
  }
  return fixed.length ? capFirst(fixed.join(", ")) : null;
}

function skillLine(r: HomebrewRace): string | null {
  const parts = [...r.skills];
  if (r.skill_choice) {
    const more = `${r.skill_choice === 1 ? "one skill" : `${r.skill_choice} skills`} of the player's choice`;
    parts.push(parts.length ? `plus ${more}` : more);
  }
  return parts.length ? capFirst(parts.join(", ")) : null;
}

/** "one skill …" → "One skill …" when a line starts with the player's picks. */
function capFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The short line under a race's name. */
function raceSummary(r: HomebrewRace): string {
  const bits = [homebrewRulesLabel(r.ruleset), r.size, `${r.speed} ft`];
  const bonus = r.ruleset !== "2024" ? bonusLine(r) : null;
  if (bonus) bits.push(bonus);
  return bits.join(" · ");
}

function RaceDetail({ r }: { r: HomebrewRace }) {
  const bonus = r.ruleset !== "2024" ? bonusLine(r) : null;
  const skills = skillLine(r);
  return (
    <>
      <div style={FACTS}>
        <Fact label="Rules">{homebrewRulesLabel(r.ruleset)}</Fact>
        <Fact label="Size">{r.size}</Fact>
        <Fact label="Speed">
          <span className="num">{r.speed}</span> feet
        </Fact>
        <Fact label="Darkvision">{r.darkvision ? `${r.darkvision} feet` : "None"}</Fact>
        {r.hp_per_level > 0 && (
          <Fact label="Extra hit points">
            <span className="num">+{r.hp_per_level}</span> every level
          </Fact>
        )}
        {r.languages && <Fact label="Languages">{r.languages}</Fact>}
        {bonus && (
          <Fact label={r.ruleset === null ? "Ability bonuses (2014 games)" : "Ability bonuses"} wide>
            {bonus}
          </Fact>
        )}
        {skills && (
          <Fact label="Skills" wide>
            {skills}
          </Fact>
        )}
      </div>
      {r.traits.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
          {r.traits.map((t, i) => (
            <p key={i} style={{ margin: 0, fontSize: "0.9375rem", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
              <strong style={{ fontWeight: 600 }}>{t.name}.</strong> {t.text}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-muted" style={{ margin: 0, fontSize: "0.875rem" }}>
          No traits yet. Edit the race to add what makes it special.
        </p>
      )}
    </>
  );
}

function SubclassDetail({ s }: { s: HomebrewSubclass }) {
  const prepared = Object.entries(s.always_prepared ?? {});
  return (
    <>
      <div style={FACTS}>
        <Fact label="Class">{s.character_class}</Fact>
        <Fact label="Rules">{homebrewRulesLabel(s.ruleset)}</Fact>
      </div>
      {s.blurb && (
        <p className="story" style={{ margin: "0 0 0.75rem", fontSize: "1rem", lineHeight: 1.55 }}>
          {s.blurb}
        </p>
      )}
      {s.features.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {s.features.map((f, i) => (
            <div key={i} style={{ display: "flex", gap: "0.6rem", alignItems: "baseline" }}>
              <span className="pill" style={{ flexShrink: 0 }}>
                Level <span className="num">{f.level}</span>
              </span>
              <p style={{ margin: 0, fontSize: "0.9375rem", lineHeight: 1.55, whiteSpace: "pre-wrap", minWidth: 0 }}>
                <strong style={{ fontWeight: 600 }}>{f.name}.</strong> {f.text}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted" style={{ margin: 0, fontSize: "0.875rem" }}>
          No features yet. Edit the subclass to add what it gives at each level.
        </p>
      )}
      {prepared.length > 0 && (
        <div style={{ marginTop: "0.75rem", fontSize: "0.875rem" }}>
          <div style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>Always prepared</div>
          {prepared.map(([level, spells]) => (
            <div key={level}>
              From level <span className="num">{level}</span>: {spells.join(", ")}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Edit, Copy and edit, and Delete (in the ⋯ menu, asking first) for one row. */
function Actions({
  name,
  what,
  phone,
  onEdit,
  onCopy,
  onDelete,
  deleteError,
}: {
  name: string;
  what: "race" | "subclass";
  phone: boolean;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  deleteError: string | null;
}) {
  const btn: React.CSSProperties = { minHeight: phone ? 44 : undefined, flex: phone ? "1 1 auto" : undefined };
  return (
    <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
        <button type="button" className="btn btn-secondary" style={btn} onClick={onEdit}>
          <Pencil size={15} aria-hidden /> Edit
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={btn}
          onClick={onCopy}
          title={`Start a new ${what} from this one; the original stays as it is`}
        >
          <Copy size={15} aria-hidden /> Copy and edit
        </button>
        <RowMenu
          label={`More for ${name}`}
          items={[
            {
              label: `Delete ${what}`,
              danger: true,
              confirm: `Delete ${name}? This can't be undone.`,
              onSelect: onDelete,
            },
          ]}
        />
      </div>
      {deleteError && (
        <p role="alert" style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "var(--danger-text)" }}>
          {deleteError}
        </p>
      )}
    </div>
  );
}

/** One list row: opens in place on a laptop, in a bottom sheet on a phone. */
function Row({
  title,
  summary,
  open,
  phone,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  phone: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: `1px solid ${open ? "var(--border2)" : "var(--border)"}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={phone ? undefined : open}
        style={{
          width: "100%",
          minHeight: 52,
          background: "transparent",
          border: "none",
          padding: "0.6rem 0.75rem 0.6rem 0.9rem",
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          color: "var(--text)",
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="story" style={{ display: "block", fontWeight: 700, fontSize: "1.05rem" }}>
            {title}
          </span>
          <span style={{ display: "block", marginTop: "0.15rem", fontSize: "0.8125rem", color: "var(--muted)" }}>
            {summary}
          </span>
        </span>
        <ChevronRight
          size={18}
          aria-hidden
          style={{ color: "var(--muted)", flexShrink: 0, transform: !phone && open ? "rotate(90deg)" : undefined }}
        />
      </button>
      {!phone && open && (
        <div style={{ padding: "0.75rem 1rem 1rem", borderTop: "1px solid var(--border)", background: "var(--surface2)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function HomebrewOptions() {
  const phone = useIsCompact(640);
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => (params.get("tab") === "subclasses" ? "subclasses" : "races"));
  const [form, setForm] = useState<FormState | null>(() =>
    params.get("new") === "1"
      ? params.get("tab") === "subclasses"
        ? { kind: "subclass", mode: "new", from: null, key: 0 }
        : { kind: "race", mode: "new", from: null, key: 0 }
      : null,
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);

  const races = useQuery({ queryKey: HOMEBREW_KEYS.races, queryFn: homebrewApi.races });
  const subclasses = useQuery({ queryKey: HOMEBREW_KEYS.subclasses, queryFn: () => homebrewApi.subclasses() });
  const raceRows = races.data ?? [];
  const subRows = subclasses.data ?? [];

  function pickTab(t: Tab) {
    setTab(t);
    setOpenId(null);
    setDeleteError(null);
    const next = new URLSearchParams(params);
    next.delete("new");
    if (t === "subclasses") next.set("tab", "subclasses");
    else next.delete("tab");
    setParams(next, { replace: true });
  }

  function openRace(mode: HomebrewFormMode, from: HomebrewRace | null) {
    setDeleteError(null);
    setForm((prev) => ({ kind: "race", mode, from, key: (prev?.key ?? 0) + 1 }));
  }

  function openSubclass(mode: HomebrewFormMode, from: HomebrewSubclass | null) {
    setDeleteError(null);
    setForm((prev) => ({ kind: "subclass", mode, from, key: (prev?.key ?? 0) + 1 }));
  }

  function closeForm() {
    setForm(null);
    if (params.get("new")) {
      const next = new URLSearchParams(params);
      next.delete("new");
      setParams(next, { replace: true });
    }
  }

  function saved(kind: "race" | "subclass", mode: HomebrewFormMode, row: { id: string; name: string }) {
    closeForm();
    setOpenId(row.id);
    void qc.invalidateQueries({ queryKey: ["homebrew"] });
    const where = kind === "race" ? "races" : "subclasses";
    setNotice(
      mode === "edit"
        ? `Saved your changes to ${row.name}.`
        : `${row.name} is in your ${where}. Players can pick it when they build a character in your campaigns.`,
    );
  }

  async function remove(kind: "race" | "subclass", row: { id: string; name: string }) {
    setDeleteError(null);
    try {
      if (kind === "race") await homebrewApi.removeRace(row.id);
      else await homebrewApi.removeSubclass(row.id);
      setOpenId(null);
      void qc.invalidateQueries({ queryKey: ["homebrew"] });
      setNotice(`Deleted ${row.name}.`);
    } catch (e) {
      setDeleteError({ id: row.id, message: e instanceof Error ? e.message : `Couldn't delete ${row.name}.` });
    }
  }

  const loading = tab === "races" ? races.isLoading : subclasses.isLoading;
  const failed = tab === "races" ? races.isError : subclasses.isError;
  const openRaceRow = phone ? raceRows.find((r) => r.id === openId) : undefined;
  const openSubRow = phone ? subRows.find((s) => s.id === openId) : undefined;

  const raceActions = (r: HomebrewRace) => (
    <Actions
      name={r.name}
      what="race"
      phone={phone}
      onEdit={() => openRace("edit", r)}
      onCopy={() => openRace("copy", r)}
      onDelete={() => void remove("race", r)}
      deleteError={deleteError?.id === r.id ? deleteError.message : null}
    />
  );
  const subActions = (s: HomebrewSubclass) => (
    <Actions
      name={s.name}
      what="subclass"
      phone={phone}
      onEdit={() => openSubclass("edit", s)}
      onCopy={() => openSubclass("copy", s)}
      onDelete={() => void remove("subclass", s)}
      deleteError={deleteError?.id === s.id ? deleteError.message : null}
    />
  );

  const tabBtn = (t: Tab, label: string, count: number) => {
    const on = tab === t;
    return (
      <button
        type="button"
        role="tab"
        id={`homebrew-tab-${t}`}
        aria-selected={on}
        aria-controls="homebrew-panel"
        onClick={() => pickTab(t)}
        className={on ? "btn btn-secondary" : "btn btn-ghost"}
        style={{
          minHeight: 44,
          flex: phone ? 1 : undefined,
          justifyContent: "center",
          border: `1px solid ${on ? "var(--accent-line)" : "var(--border2)"}`,
          background: on ? "var(--accent-soft)" : "transparent",
          color: on ? "var(--accent-text)" : "var(--text2)",
          fontWeight: on ? 600 : 400,
        }}
      >
        {label}
        {count > 0 && (
          <span className="num" style={{ marginLeft: "0.35rem", opacity: 0.8 }}>
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="fade-in">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <h1>Races &amp; subclasses</h1>
          <p className="text-muted" style={{ margin: 0 }}>
            Your own races and subclasses. Players pick them when they build a character in any of your campaigns. Only
            you can see and change them.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => (tab === "races" ? openRace("new", null) : openSubclass("new", null))}
          style={{ minHeight: 44, width: phone ? "100%" : undefined, justifyContent: "center" }}
        >
          <Plus size={16} aria-hidden /> {tab === "races" ? "New race" : "New subclass"}
        </button>
      </div>

      <div role="tablist" aria-label="Races or subclasses" style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {tabBtn("races", "Races", raceRows.length)}
        {tabBtn("subclasses", "Subclasses", subRows.length)}
      </div>

      {notice && (
        <div
          role="status"
          className="card"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", padding: "0.6rem 0.9rem" }}
        >
          <span style={{ flex: 1, fontSize: "0.9375rem" }}>{notice}</span>
          <button type="button" className="btn btn-ghost" onClick={() => setNotice(null)} style={{ minHeight: phone ? 44 : undefined }}>
            OK
          </button>
        </div>
      )}

      <div id="homebrew-panel" role="tabpanel" aria-labelledby={`homebrew-tab-${tab}`}>
        {loading && <p className="text-muted">Loading…</p>}
        {failed && (
          <p role="alert" style={{ color: "var(--danger-text)" }}>
            Couldn&apos;t load your {tab}. Check your connection and reload the page.
          </p>
        )}

        {!loading && !failed && tab === "races" && raceRows.length === 0 && (
          <div className="card">
            <p style={{ marginTop: 0 }}>No races yet.</p>
            <p className="text-muted" style={{ fontSize: "0.9375rem" }}>
              Make one for your world: its size and speed, traits, skills and languages, and the ability bonuses for 2014
              games. You can start from a rules race and change what you like.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => openRace("new", null)} style={{ minHeight: 44 }}>
              <Plus size={16} aria-hidden /> New race
            </button>
          </div>
        )}
        {!loading && !failed && tab === "subclasses" && subRows.length === 0 && (
          <div className="card">
            <p style={{ marginTop: 0 }}>No subclasses yet.</p>
            <p className="text-muted" style={{ fontSize: "0.9375rem" }}>
              Make one for any class: what it gives at each level, and any spells it always has prepared. The level-up
              guide shows each feature when a character reaches it.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => openSubclass("new", null)} style={{ minHeight: 44 }}>
              <Plus size={16} aria-hidden /> New subclass
            </button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {tab === "races" &&
            raceRows.map((r) => (
              <Row
                key={r.id}
                title={r.name}
                summary={raceSummary(r)}
                open={openId === r.id}
                phone={phone}
                onToggle={() => {
                  setDeleteError(null);
                  setOpenId(openId === r.id && !phone ? null : r.id);
                }}
              >
                <RaceDetail r={r} />
                {raceActions(r)}
              </Row>
            ))}
          {tab === "subclasses" &&
            subRows.map((s) => (
              <Row
                key={s.id}
                title={s.name}
                summary={[
                  s.character_class,
                  `${s.features.length} ${s.features.length === 1 ? "feature" : "features"}`,
                  homebrewRulesLabel(s.ruleset),
                ].join(" · ")}
                open={openId === s.id}
                phone={phone}
                onToggle={() => {
                  setDeleteError(null);
                  setOpenId(openId === s.id && !phone ? null : s.id);
                }}
              >
                <SubclassDetail s={s} />
                {subActions(s)}
              </Row>
            ))}
        </div>
      </div>

      {phone && tab === "races" && openRaceRow && !form && (
        <PhoneSheet title={openRaceRow.name} onClose={() => setOpenId(null)}>
          <RaceDetail r={openRaceRow} />
          {raceActions(openRaceRow)}
        </PhoneSheet>
      )}
      {phone && tab === "subclasses" && openSubRow && !form && (
        <PhoneSheet title={openSubRow.name} onClose={() => setOpenId(null)}>
          <SubclassDetail s={openSubRow} />
          {subActions(openSubRow)}
        </PhoneSheet>
      )}

      {form?.kind === "race" && (
        <RaceForm
          key={form.key}
          mode={form.mode}
          from={form.from}
          onClose={closeForm}
          onSaved={(row) => saved("race", form.mode, row)}
        />
      )}
      {form?.kind === "subclass" && (
        <SubclassForm
          key={form.key}
          mode={form.mode}
          from={form.from}
          onClose={closeForm}
          onSaved={(row) => saved("subclass", form.mode, row)}
        />
      )}
    </div>
  );
}
