/**
 * Bag (Plan 122): coin in words, what you're wearing and carrying, drink a
 * potion or hand it to a friend, give gold, and the market one tap away.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Shirt, Store } from "lucide-react";

import { playApi, type GearRow } from "../../api/play";
import { friendlyApiError } from "../../api/errors";
import { usePlayer } from "./playerContext";
import { Label, Panel } from "./ui";

const COINS: Array<["pp" | "gp" | "ep" | "sp" | "cp", string]> = [
  ["pp", "platinum"],
  ["gp", "gold"],
  ["ep", "electrum"],
  ["sp", "silver"],
  ["cp", "copper"],
];

export default function BagTab() {
  const { pc, pcId } = usePlayer();
  const { data: gear = [], isLoading } = useQuery({ queryKey: ["play-inventory", pcId], queryFn: () => playApi.gear(pcId) });
  const equipped = gear.filter((g) => g.equipped);
  const pack = gear.filter((g) => !g.equipped);
  const attuned = gear.filter((g) => g.attuned).length;
  return (
    <>
      <Coin />
      <Panel style={{ gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Label>Equipped</Label>
          {attuned > 0 && <Label>Attuned <span className="num">{attuned} of 3</span></Label>}
        </div>
        {isLoading ? <span style={{ fontSize: 14, color: "var(--muted)" }}>Opening your bag…</span> : equipped.length === 0 ? (
          <span style={{ fontSize: 14, color: "var(--muted)" }}>Nothing equipped yet. Pick your gear in “Your look and gear”.</span>
        ) : (
          equipped.map((g, i) => <Item key={g.character_item_id} g={g} last={i === equipped.length - 1} />)
        )}
      </Panel>
      <Panel style={{ gap: 4 }}>
        <Label>In your pack</Label>
        {!isLoading && pack.length === 0 && <span style={{ fontSize: 14, color: "var(--muted)" }}>Your pack is empty. Loot and market buys land here.</span>}
        {pack.map((g, i) => <Item key={g.character_item_id} g={g} last={i === pack.length - 1} />)}
      </Panel>
      <CardLink to={`/market/${pc.campaign_id}?pc=${pc.id}`} icon={<Store size={20} />} title="Visit the market" sub="Buy with your coin; sell what you don't need." lit />
      <CardLink to={`/play/${pc.id}/character`} icon={<Shirt size={20} />} title="Your look and gear" sub="Equip and swap what you carry." />
    </>
  );
}

function CardLink({ to, icon, title, sub, lit }: { to: string; icon: React.ReactNode; title: string; sub: string; lit?: boolean }) {
  return (
    <Link to={to} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14, border: `1px solid ${lit ? "var(--accent-line)" : "var(--border)"}`, background: lit ? "var(--accent-soft)" : "var(--surface)", color: "var(--text)", textDecoration: "none" }}>
      <span style={{ color: "var(--accent-text)" }}>{icon}</span>
      <span style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <span style={{ fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 13, color: "var(--text2)" }}>{sub}</span>
      </span>
      <ChevronRight size={18} color="var(--accent-text)" />
    </Link>
  );
}

function Coin() {
  const { pc, pcId, refresh, help, notify } = usePlayer();
  const [editing, setEditing] = useState(false);
  const [giving, setGiving] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const { data: party = [] } = useQuery({ queryKey: ["play-party", pcId], queryFn: () => playApi.party(pcId) });
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const shown = COINS.filter(([k]) => (pc[k] ?? 0) > 0 || k === "gp");

  async function save() {
    const patch: Record<string, number> = {};
    for (const [k] of COINS) {
      if (vals[k] !== undefined) patch[k] = Math.max(0, Math.floor(Number(vals[k]) || 0));
    }
    if (Object.keys(patch).length) await playApi.patchState(pcId, patch);
    setEditing(false);
    setVals({});
    refresh();
  }
  async function give() {
    try {
      await playApi.give(pcId, to, Number(amount));
      const mate = party.find((p) => p.id === to);
      notify(`You gave ${mate?.character_name.split(" ")[0] ?? "them"} ${amount} gp.`);
      setGiving(false);
      setAmount("");
      refresh();
    } catch (e) {
      notify(friendlyApiError((e as Error).message, "That didn't go through."));
    }
  }
  return (
    <Panel style={{ gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600 }}>Coin</span>
        <div style={{ display: "flex", gap: 4 }}>
          {party.length > 0 && !editing && (
            <button type="button" className="btn btn-ghost" onClick={() => setGiving((g) => !g)} style={{ minHeight: 36, fontSize: 14 }}>Give</button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => (editing ? void save() : setEditing(true))} style={{ minHeight: 36, fontSize: 14 }}>
            {editing ? "Save" : "Edit"}
          </button>
        </div>
      </div>
      {editing ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
          {COINS.map(([k, name]) => (
            <label key={k} style={{ display: "flex", flexDirection: "column", gap: 2, margin: 0, fontSize: 12, color: "var(--muted)" }}>
              {name}
              <input inputMode="numeric" value={vals[k] ?? String(pc[k] ?? 0)} onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value.replace(/\D/g, "") }))} className="num" style={{ minHeight: 44, textAlign: "center", padding: "0 4px", fontWeight: 600 }} />
            </label>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          {shown.map(([k, name]) => (
            <span key={k} className="num" style={{ fontSize: 18, fontWeight: 600 }}>
              {pc[k] ?? 0} <span style={{ fontSize: 13, color: "var(--muted)", fontFamily: "var(--font-ui)", fontWeight: 500 }}>{name}</span>
            </span>
          ))}
        </div>
      )}
      {help === "teach" && !editing && <span style={{ fontSize: 13, color: "var(--muted)" }}>10 copper make a silver; 10 silver make a gold.</span>}
      {giving && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select aria-label="Give to" value={to} onChange={(e) => setTo(e.target.value)} style={{ flex: "1 1 140px", minHeight: 44 }}>
            <option value="">Give to…</option>
            {party.map((p) => (
              <option key={p.id} value={p.id}>{p.character_name}</option>
            ))}
          </select>
          <input inputMode="decimal" aria-label="Gold to give" placeholder="gold" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="num" style={{ width: 80, minHeight: 44, textAlign: "center" }} />
          <button type="button" className="btn btn-secondary" disabled={!to || !(Number(amount) > 0)} onClick={() => void give()} style={{ minHeight: 44 }}>Give</button>
        </div>
      )}
    </Panel>
  );
}

const USABLE = /potion|provisions|food|ration|jam|cake|bun|cordial|cask/i;

function Item({ g, last }: { g: GearRow; last: boolean }) {
  const { pcId, refresh, notify } = usePlayer();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [using, setUsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: party = [] } = useQuery({ queryKey: ["play-party", pcId], queryFn: () => playApi.party(pcId) });
  const usable = !g.equipped && USABLE.test(`${g.item_type} ${g.name}`);
  const weapon = g.damage_die ? [`${g.damage_die}${g.damage_type ? ` ${g.damage_type}` : ""}`, g.weapon_range, g.mastery ? `mastery: ${g.mastery}` : null].filter(Boolean).join(" · ") : null;
  const sub = weapon ?? [g.item_type, g.rarity && g.rarity !== "Common" ? g.rarity.replace("VeryRare", "Very rare") : null].filter(Boolean).join(" · ");

  async function use(target?: string) {
    setBusy(true);
    try {
      const r = await playApi.useItem(pcId, g.character_item_id, target);
      const what =
        r.effect === "heal"
          ? `${r.target_name} heals ${r.amount} (now ${r.target_hp_current} of ${r.target_hp_max}).`
          : r.effect === "temp_hp"
            ? `${r.target_name} has ${r.target_temp_hp} temporary hit points.`
            : `${r.target_name}'s exhaustion is now ${r.target_exhaustion}.`;
      notify(`${r.item_name}: ${what}`);
      void qc.invalidateQueries({ queryKey: ["play-inventory", pcId] });
      refresh();
    } catch (e) {
      notify(friendlyApiError((e as Error).message, "That didn't work."));
    } finally {
      setBusy(false);
      setUsing(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 0", borderBottom: last ? "none" : "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "transparent", border: "none", padding: 0, color: "inherit", textAlign: "left", font: "inherit", cursor: "pointer" }}>
          <span style={{ fontWeight: 600 }}>
            {g.name}
            {g.quantity > 1 ? ` ×${g.quantity}` : ""}
          </span>
          {sub && <span className="num" style={{ fontSize: 13, color: "var(--text2)" }}>{sub}</span>}
        </button>
        {usable && (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setUsing((u) => !u)} style={{ minHeight: 40 }}>
            {/potion|cordial/i.test(g.name) ? "Drink" : "Use"}
          </button>
        )}
      </div>
      {using && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void use()} style={{ minHeight: 40 }}>On me</button>
          {party.map((p) => (
            <button key={p.id} type="button" className="btn btn-secondary" disabled={busy} onClick={() => void use(p.id)} style={{ minHeight: 40 }}>
              On {p.character_name.split(" ")[0]}
            </button>
          ))}
        </div>
      )}
      {open && (
        <div style={{ padding: "8px 10px", borderRadius: 10, background: "var(--surface2)", fontSize: 14, lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 4 }}>
          {g.description ? <span className="story" style={{ fontSize: 15 }}>{g.description}</span> : <span style={{ color: "var(--muted)" }}>Nothing remarkable. Ask the DM.</span>}
          <span style={{ fontSize: 13, color: "var(--text2)" }}>
            {[g.is_magic ? "Magic item" : null, g.attunement_required ? `Needs attunement${g.attuned ? " (attuned)" : ""}` : null, g.value_gp > 0 ? `Worth ${g.value_gp} gp` : null, g.sell_gp != null ? `Sells for ${g.sell_gp} gp` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      )}
    </div>
  );
}
