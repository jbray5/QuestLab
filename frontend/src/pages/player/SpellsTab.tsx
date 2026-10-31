/**
 * Spells (Plan 122): slots you can tap, and a Cast button that spends the right
 * one — asking which when you could upcast — then rolls the attack or damage.
 * Rituals cast free; concentration starts itself. Daily preparers can change
 * their prepared list here.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Dices, Sparkles } from "lucide-react";

import { playApi, type PlaySpell, type TurnOption } from "../../api/play";
import { friendlyApiError } from "../../api/errors";
import { usePlayer } from "./playerContext";
import { useRoll, type RollSpec } from "./rollContext";
import { Label, Panel, Pips } from "./ui";
import { DAILY_PREPARERS, fmt, ordinal, parseDice } from "./rules";

export default function SpellsTab() {
  const { spells, pc, help, stats } = usePlayer();
  const [preparing, setPreparing] = useState(false);
  const canPrepare = DAILY_PREPARERS.has(pc.character_class);
  const levels = [...new Set(spells.map((s) => s.level))].sort((a, b) => a - b);
  const prepared = spells.filter((s) => s.level > 0 && s.prepared).length;
  return (
    <>
      <SlotsPanel />
      {stats?.ability && help !== "teach" && (
        <span className="num" style={{ fontSize: 13, color: "var(--text2)" }}>
          Spell attack {fmt(stats.attack_bonus ?? 0)} · save DC {stats.save_dc}
        </span>
      )}
      {stats?.ability && help === "teach" && (
        <span style={{ fontSize: 13, color: "var(--text2)" }}>
          Your spells hit with <b className="num">{fmt(stats.attack_bonus ?? 0)}</b>, and targets resist them with a save against <b className="num">{stats.save_dc}</b>.
        </span>
      )}
      {levels.map((lvl) => (
        <Panel key={lvl} style={{ gap: 0, padding: "10px 14px" }}>
          <Label style={{ paddingBottom: 4 }}>{lvl === 0 ? (help === "teach" ? "Cantrips · never run out" : "Cantrips") : `${ordinal(lvl)} level`}</Label>
          {spells
            .filter((s) => s.level === lvl)
            .sort((a, b) => Number(b.prepared) - Number(a.prepared) || a.name.localeCompare(b.name))
            .map((s, i, arr) => (
              <SpellRow key={s.id} spell={s} last={i === arr.length - 1} preparing={preparing && canPrepare && lvl > 0} />
            ))}
        </Panel>
      ))}
      {canPrepare && (
        <button type="button" className="btn btn-ghost" onClick={() => setPreparing((p) => !p)} style={{ minHeight: 44 }}>
          {preparing ? "Done changing" : `Prepared ${prepared} · change after a long rest`}
        </button>
      )}
    </>
  );
}

function SlotsPanel() {
  const { slots, pcId, help, notify } = usePlayer();
  const qc = useQueryClient();
  const levels = Object.entries(slots?.levels ?? {}).filter(([, l]) => l.max > 0).sort((a, b) => Number(a[0]) - Number(b[0]));
  const after = () => void qc.invalidateQueries({ queryKey: ["play-slots", pcId] });
  const expend = useMutation({ mutationFn: (l: number) => playApi.expendSpellSlot(pcId, l), onSuccess: after });
  const restore = useMutation({ mutationFn: (l: number) => playApi.restoreSpellSlot(pcId, l), onSuccess: after });
  if (levels.length === 0) return null;
  return (
    <Panel style={{ gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontWeight: 600 }}>Spell slots</span>
        {help !== "numbers" && <Label>Back after a long rest</Label>}
      </div>
      {levels.map(([lvl, l]) => (
        <div key={lvl} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: help === "numbers" ? 28 : 74, fontSize: 14, color: "var(--text2)" }}>{help === "numbers" ? `L${lvl}` : `${ordinal(Number(lvl))} level`}</span>
          <div style={{ flex: 1 }}>
            <Pips filled={l.remaining} total={l.max} label={`${ordinal(Number(lvl))}-level slot`} onTap={(_, on) => {
              if (on) {
                expend.mutate(Number(lvl));
                notify(`Spent a ${ordinal(Number(lvl))}-level slot. Tap an empty dot to undo.`);
              } else restore.mutate(Number(lvl));
            }} />
          </div>
          <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>{l.remaining} left</span>
        </div>
      ))}
    </Panel>
  );
}

function SpellRow({ spell, last, preparing }: { spell: PlaySpell; last: boolean; preparing: boolean }) {
  const { pcId, slots, kit, stats, help, refresh, notify } = usePlayer();
  const roll = useRoll();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const kitOpt: TurnOption | undefined = [...(kit?.action ?? []), ...(kit?.bonus ?? [])].find((o) => o.name === spell.name);
  const cost = /bonus/i.test(spell.casting_time) ? "Bonus" : /reaction/i.test(spell.casting_time) ? "Reaction" : null;
  const usable = spell.level === 0 || spell.prepared;
  const available = Object.entries(slots?.levels ?? {})
    .map(([k, l]) => ({ level: Number(k), left: l.remaining }))
    .filter((x) => x.level >= spell.level && x.left > 0)
    .sort((a, b) => a.level - b.level);

  const followUp = (slotLevel: number | null): RollSpec | null => {
    const dmg = kitOpt?.damage || spell.damage_dice || "";
    if (spell.attack_type || kitOpt?.to_hit != null) {
      return {
        title: `${spell.name} attack`,
        kind: "attack",
        die: "d20",
        modifier: kitOpt?.to_hit ?? stats?.attack_bonus ?? 0,
        why: `${fmt(kitOpt?.to_hit ?? stats?.attack_bonus ?? 0)} is your spell attack bonus.`,
        damage: dmg ? { dice: dmg, type: spell.damage_type ?? undefined } : undefined,
      };
    }
    const d = parseDice(dmg);
    if (d && spell.save_ability) {
      return {
        title: `${spell.name} damage${slotLevel && slotLevel > spell.level ? ` (${ordinal(slotLevel)} level)` : ""}`,
        kind: "damage",
        die: `d${d.sides}` as RollSpec["die"],
        count: Math.min(10, d.count),
        modifier: d.plus,
        why: `Targets make a ${spell.save_ability} save against your DC ${stats?.save_dc ?? "?"}. ${spell.higher_levels && slotLevel && slotLevel > spell.level ? "Upcasting may add dice: check the spell." : ""}`.trim(),
      };
    }
    return null;
  };

  async function cast(body: { slot_level?: number; ritual?: boolean }) {
    setBusy(true);
    try {
      const r = await playApi.castSpell(pcId, spell.id, body);
      setPicking(false);
      refresh();
      notify(
        r.slot_level
          ? `${spell.name} cast with a ${ordinal(r.slot_level)}-level slot.${r.concentration ? " You're concentrating on it." : ""}`
          : `${spell.name} cast${body.ritual ? " as a ritual" : ""}.${r.concentration ? " You're concentrating on it." : ""}`,
      );
      const next = followUp(r.slot_level);
      if (next) roll(next);
    } catch (e) {
      notify(friendlyApiError((e as Error).message, `Couldn't cast ${spell.name}.`));
    } finally {
      setBusy(false);
    }
  }

  function onCast() {
    if (spell.level === 0) {
      const next = followUp(null);
      if (next && !spell.is_concentration) roll(next);
      else void cast({});
      return;
    }
    if (available.length === 1 && available[0].level === spell.level && !spell.is_ritual) void cast({ slot_level: spell.level });
    else setPicking((p) => !p);
  }

  const prep = useMutation({
    mutationFn: (v: boolean) => playApi.prepareSpell(pcId, spell.id, v),
    onSuccess: (r) => {
      refresh();
      notify(`${spell.name} ${r.prepared ? "prepared" : "set aside"}. ${r.count} of ${r.cap} prepared.`);
    },
    onError: (e) => notify(friendlyApiError((e as Error).message, "Couldn't change that.")),
  });

  const summary = [
    kitOpt?.to_hit != null ? `${fmt(kitOpt.to_hit)} to hit` : spell.attack_type ? `${fmt(stats?.attack_bonus ?? 0)} to hit` : null,
    spell.save_ability ? `${spell.save_ability} save` : null,
    kitOpt?.damage || spell.damage_dice ? `${kitOpt?.damage || spell.damage_dice}${spell.damage_type ? ` ${spell.damage_type}` : ""}` : null,
    help !== "numbers" ? spell.range : null,
  ].filter(Boolean);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "9px 0", borderBottom: last ? "none" : "1px solid var(--border)", opacity: usable || preparing ? 1 : 0.6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "transparent", border: "none", color: "inherit", textAlign: "left", padding: 0, cursor: "pointer", font: "inherit" }}>
          <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {open ? <ChevronDown size={14} color="var(--muted)" /> : <ChevronRight size={14} color="var(--muted)" />}
            {spell.name}
            {cost && <span className={cost === "Reaction" ? "pill pill-teal" : "pill"}>{cost}</span>}
            {spell.is_concentration && <span className="pill" title="Concentration">{help === "numbers" ? "C" : "Concentration"}</span>}
            {spell.is_ritual && <span className="pill" title="Ritual">{help === "numbers" ? "R" : "Ritual"}</span>}
            {!usable && <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 400 }}>not prepared</span>}
          </span>
          {summary.length > 0 && <span className="num" style={{ fontSize: 13, color: "var(--text2)", paddingLeft: 20 }}>{summary.join(" · ")}</span>}
        </button>
        {preparing ? (
          <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, margin: 0, fontSize: 14, color: "var(--text)" }}>
            <input type="checkbox" checked={spell.prepared} disabled={prep.isPending} onChange={(e) => prep.mutate(e.target.checked)} style={{ width: 20, height: 20 }} />
            Prepared
          </label>
        ) : usable || spell.is_ritual ? (
          <button type="button" className="btn btn-secondary" disabled={busy || (spell.level > 0 && usable && available.length === 0 && !spell.is_ritual)} onClick={onCast} style={{ minHeight: 42, borderColor: picking ? "var(--accent-edge)" : undefined, color: picking ? "var(--accent-text)" : undefined }}>
            {spell.level === 0 && (spell.attack_type || kitOpt?.to_hit != null) ? <Dices size={16} /> : <Sparkles size={16} />}
            {usable ? "Cast" : "Ritual"}
          </button>
        ) : null}
      </div>
      {picking && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 10, background: "var(--surface2)", border: "1px solid var(--border)" }}>
          <span style={{ fontSize: 13, color: "var(--text2)" }}>{help === "teach" ? "Which slot? A higher slot can make some spells stronger." : "Cast it with"}</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            {usable &&
              available.map((a, i) => (
                <button key={a.level} type="button" className={`btn ${i === 0 ? "btn-primary" : "btn-secondary"}`} disabled={busy} onClick={() => void cast({ slot_level: a.level })} style={{ minHeight: 42, fontSize: 14 }}>
                  {ordinal(a.level)} slot · {a.left} left
                </button>
              ))}
            {spell.is_ritual && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void cast({ ritual: true })} style={{ minHeight: 42, fontSize: 14 }}>
                As a ritual · no slot
              </button>
            )}
          </div>
          {usable && available.length === 0 && <span style={{ fontSize: 13, color: "var(--muted)" }}>No slots left at this level or higher.</span>}
        </div>
      )}
      {open && <SpellDetails spell={spell} />}
    </div>
  );
}

function SpellDetails({ spell }: { spell: PlaySpell }) {
  const parts = [spell.components_v && "V", spell.components_s && "S", spell.components_m && `M (${spell.components_m})`].filter(Boolean).join(", ");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 10, background: "var(--surface2)", fontSize: 14, lineHeight: 1.5 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", fontSize: 13, color: "var(--text2)" }}>
        <span><b style={{ color: "var(--text)" }}>Casting time</b> {spell.casting_time}</span>
        <span><b style={{ color: "var(--text)" }}>Range</b> {spell.range}</span>
        <span><b style={{ color: "var(--text)" }}>Lasts</b> {spell.duration}</span>
        {parts && <span><b style={{ color: "var(--text)" }}>Needs</b> {parts}</span>}
      </div>
      <div style={{ whiteSpace: "pre-wrap" }}>{spell.description}</div>
      {spell.higher_levels && (
        <div style={{ fontSize: 13, color: "var(--text2)" }}>
          <b style={{ color: "var(--text)" }}>With a higher slot:</b> {spell.higher_levels}
        </div>
      )}
    </div>
  );
}
