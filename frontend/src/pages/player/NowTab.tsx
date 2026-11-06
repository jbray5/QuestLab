/**
 * Now (Plan 122): the screen follows the game. Your turn → move, one action,
 * one bonus action, with your real attacks to roll and a coach tip. Someone
 * else's turn → who's up, when you go, your reaction. No fight → quick checks
 * and the table's latest rolls. Conditions sit near the top (Plan 128): right
 * under "Your turn" in a fight, first thing otherwise. A side quest's card
 * (Plan 136) goes at the top, except on your turn, when it waits below the actions.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Dices, Sparkles, Star } from "lucide-react";

import { playApi, type TurnOption } from "../../api/play";
import { addToDamage, powerAttackHint, powerAttackLabel } from "../../lib/powerAttack";
import { rulesetOf } from "../../lib/ruleset";
import { speedList } from "../../lib/speeds";
import { usePlayer } from "./playerContext";
import { useRoll } from "./rollContext";
import { damageSpec, initiativeSpec, skillSpec, weaponAttackSpec } from "./rolls";
import { Label, Panel, Tip } from "./ui";
import { fmt } from "./rules";
import Conditions from "./Conditions";
import NamePrompt from "./NamePrompt";
import { QuestCards } from "./QuestScreen";

const BASIC_TEXT: Record<string, string> = {
  Dash: "Move again: double your movement this turn.",
  Disengage: "Your movement doesn't provoke opportunity attacks this turn.",
  Dodge: "Until your next turn, attacks against you have disadvantage.",
  Help: "Give a friend advantage on their next check or attack.",
  Hide: "Make a Stealth check to slip out of sight.",
  Influence: "Persuade, deceive or intimidate someone.",
  Ready: "Pick a trigger and an action; do it when the trigger happens.",
  Search: "Look for something: a Perception or Investigation check.",
  Study: "Recall or work something out: an Intelligence check.",
  Utilize: "Use an object: drink a potion, pull a lever, open a lock.",
  // Plan 131 — the 2014 rules' name for it.
  "Use an Object": "Use something that takes your action: drink a potion, pull a lever, open a lock.",
};

// Plan 131 — on the 2014 rules these are paid from a pool: turn-kit key → [tracked row, points].
const POOL_COST_2014: Record<string, [string, number]> = {
  flurry: ["ki", 1],
  patient_defense: ["ki", 1],
  step_of_the_wind: ["ki", 1],
  stunning_strike: ["ki", 1],
  quicken: ["sorcery points", 2],
};

export default function NowTab() {
  const { pc, combat, turn, pcId } = usePlayer();
  const levelUp = pc.pending_level != null && pc.pending_level > pc.level;
  const yourTurn = !!(combat?.in_combat && turn?.active);
  return (
    <>
      {levelUp && (
        <Link to={`/play/${pcId}/level-up`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, border: "1px solid var(--accent-edge)", background: "var(--accent-soft)", color: "var(--text)", textDecoration: "none" }}>
          <Star size={22} color="var(--accent-text)" />
          <span style={{ display: "flex", flexDirection: "column" }}>
            <span className="story" style={{ fontWeight: 700, fontSize: 18 }}>You reached level {pc.level + 1}</span>
            <span style={{ fontSize: 14, color: "var(--text2)" }}>Tap to choose what you gain.</span>
          </span>
          <ChevronRight size={18} color="var(--accent-text)" style={{ marginLeft: "auto" }} />
        </Link>
      )}
      <NamePrompt />
      {!yourTurn && <QuestCards />}
      {yourTurn ? (
        <>
          <YourTurn />
          <QuestCards />
        </>
      ) : (
        <>
          <Conditions />
          {combat?.in_combat ? <Waiting /> : <Exploring />}
        </>
      )}
      <Concentrating />
      <Feed />
    </>
  );
}

function YourTurn() {
  const { pc, kit, turn, help, features, skills, pcId, refresh, notify, go } = usePlayer();
  const roll = useRoll();
  const [more, setMore] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(help === "teach");
  // Plan 135 — attacks with their feat's −5/+10 trade switched on (key → on). Off by
  // default, per attack, and forgotten when the turn ends.
  const [powered, setPowered] = useState<Record<string, boolean>>({});
  const old = rulesetOf(pc.ruleset) === "2014";
  const spend = useMutation({
    mutationFn: ({ id, amount = 1 }: { id: string; amount?: number }) => playApi.spendFeature(pcId, id, amount),
    onSuccess: () => refresh(),
  });
  const takeFeature = (o: TurnOption) => {
    // 2014: Flurry of Blows and friends spend ki; Quickened Spell spends sorcery points.
    const cost = old ? POOL_COST_2014[o.key] : undefined;
    const pool = cost ? features.find((x) => x.feature_name.toLowerCase() === cost[0]) : undefined;
    if (cost && pool) {
      if (pool.max_uses - pool.uses_spent >= cost[1]) {
        spend.mutate({ id: pool.id, amount: cost[1] });
        notify(`${o.name}: ${cost[1]} ${pool.feature_name} spent.`);
      } else notify(`${o.name}: not enough ${pool.feature_name} left.`);
      return;
    }
    const f = features.find((x) => x.feature_name.toLowerCase() === o.name.toLowerCase());
    // A pool (Lay on Hands) spends a chosen number of points: that's on the Character tab.
    if (f && f.max_uses > 10) {
      go("character");
      notify(`${o.name}: choose how many points under "Features with uses".`);
    } else if (f && f.max_uses > 0 && f.uses_spent < f.max_uses) {
      spend.mutate({ id: f.id });
      notify(`${o.name} used.`);
    } else notify(`${o.name}: tell the DM you're using it.`);
  };

  const actionRow = (o: TurnOption, last: boolean) => {
    const leveled = (o.kind === "spell" || o.kind === "heal" || o.kind === "buff") && o.spell_level > 0;
    // Plan 135 — a homebrew feat's −5/+10 trade on this attack, when it's switched on.
    const pa = o.to_hit != null && !leveled ? o.power_attack ?? null : null;
    const on = !!pa && !!powered[o.key];
    let button: React.ReactNode = null;
    if (o.to_hit != null && !leveled) {
      button = (
        <button type="button" className="btn btn-secondary" onClick={() => roll(weaponAttackSpec(pc, o, on))} style={{ minHeight: 42 }}>
          <Dices size={16} /> Roll
        </button>
      );
    } else if (leveled) {
      button = (
        <button type="button" className="btn btn-secondary" onClick={() => go("spells")} style={{ minHeight: 42 }}>
          <Sparkles size={16} /> Cast
        </button>
      );
    } else if (o.kind === "feature") {
      button = (
        <button type="button" className="btn btn-secondary" onClick={() => takeFeature(o)} disabled={o.uses_left === 0} style={{ minHeight: 42 }}>
          Use
        </button>
      );
    } else if (o.damage) {
      const spec = damageSpec(o);
      if (spec) {
        button = (
          <button type="button" className="btn btn-secondary" onClick={() => roll(spec)} style={{ minHeight: 42 }}>
            <Dices size={16} /> Damage
          </button>
        );
      }
    }
    // A healing spell heals: "heals 2d8+3", never "2d8+3 force" (Nina, run 3).
    const damage = on && pa && o.damage ? addToDamage(o.damage, pa.damage) : o.damage;
    const amount = o.kind === "heal" ? (o.damage ? `heals ${o.damage}` : "heals") : damage ? `${damage}${o.damage_type ? ` ${o.damage_type}` : ""}` : null;
    const numbers = [
      o.to_hit != null ? `${fmt(o.to_hit + (on && pa ? pa.to_hit : 0))} to hit` : null,
      o.save,
      amount,
      o.uses_left != null && o.uses_left < 50 ? `${o.uses_left} left` : null,
    ].filter(Boolean);
    return (
      <div key={o.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: last ? "none" : "1px solid var(--border)" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>
            {o.name}
            {o.kind === "natural" && <span style={{ fontWeight: 400, color: "var(--muted)" }}> · natural</span>}
          </span>
          <span className="num" style={{ fontSize: 13, color: on ? "var(--accent-text)" : "var(--text2)" }}>{numbers.join(" · ")}</span>
          {help === "teach" && o.kind === "feature" && o.note && <span style={{ fontSize: 13, color: "var(--muted)" }}>{o.note}</span>}
          {/* Plan 135 — the DM's own note on a natural weapon ("STR · slashing · natural · reach 10 ft"). */}
          {help !== "numbers" && o.kind === "natural" && o.note.split(" · ").length > 3 && (
            <span style={{ fontSize: 13, color: "var(--muted)" }}>{o.note.split(" · ").slice(3).join(" · ")}</span>
          )}
          {pa && (
            <button
              type="button"
              aria-pressed={on}
              onClick={() => setPowered((p) => ({ ...p, [o.key]: !p[o.key] }))}
              title={powerAttackHint(pa)}
              aria-label={`${powerAttackHint(pa)} ${on ? "On" : "Off"}.`}
              style={{
                alignSelf: "flex-start",
                marginTop: 4,
                minHeight: 44,
                padding: "0 12px",
                borderRadius: 10,
                border: `1px solid ${on ? "var(--accent-line)" : "var(--border2)"}`,
                background: on ? "var(--accent-soft)" : "transparent",
                color: on ? "var(--accent-text)" : "var(--text2)",
                font: "500 14px var(--font-ui)",
                cursor: "pointer",
              }}
            >
              <span className="num">{powerAttackLabel(pa)}</span>
              {on ? " · on" : ""}
            </button>
          )}
          {pa && help === "teach" && <span style={{ fontSize: 13, color: "var(--muted)" }}>{powerAttackHint(pa)} Tap it before you roll.</span>}
        </div>
        {button}
      </div>
    );
  };

  // Unarmed strikes go last: a caster's first choices are their spells.
  const actions = [...(kit?.action ?? [])].sort((a, b) => Number(a.kind === "unarmed") - Number(b.kind === "unarmed"));
  const bonus = kit?.bonus ?? [];
  const cunning = bonus.find((b) => b.key === "cunning_action");
  const otherBonus = bonus.filter((b) => b.key !== "cunning_action");
  // What costs no action: Action Surge, Reckless Attack, Stunning Strike, Quickened Spell
  // (and 2014's Divine Smite). Plan 134: shown for both editions (2024 phones never showed it,
  // TD-131g). The Breath Weapon's use counter isn't an action; the attack above spends it.
  const free = (kit?.free ?? []).filter((o) => o.key !== "breath_weapon");
  // "Fly 30 ft · swim 40 ft", or "" for a character with only a walking speed.
  const others = speedList(pc.speeds)
    .map(([k, ft], i) => `${i === 0 ? k.charAt(0).toUpperCase() + k.slice(1) : k} ${ft} ft`)
    .join(" · ");
  return (
    <>
      <Panel tone="lit" style={{ gap: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <h2 className="story" style={{ margin: 0, fontWeight: 700, fontSize: 26, color: "var(--accent-text)" }}>Your turn</h2>
          {turn?.round != null && <span style={{ fontSize: 13, color: "var(--text2)" }}>Round <span className="num">{turn.round}</span></span>}
        </div>
        {help !== "numbers" && <span style={{ fontSize: 14, color: "var(--text2)" }}>You can move, take one action and one bonus action, in any order.</span>}
      </Panel>
      <Conditions />

      <Step n={1} title="Move" right={<span className="num" style={{ fontWeight: 600 }}>{kit?.speed ?? pc.speed} ft</span>}>
        {/* Plan 135 — fly, swim, climb, burrow (a homebrew race's). */}
        {others.length > 0 && <span className="num" style={{ fontSize: 14, color: "var(--text2)" }}>{others}</span>}
        {help === "teach" && <span style={{ fontSize: 14, color: "var(--muted)" }}>Split it however you like, before and after your action.</span>}
      </Step>

      <Step n={2} title="Action — pick one">
        <div style={{ display: "flex", flexDirection: "column" }}>
          {actions.length === 0 && <span style={{ fontSize: 14, color: "var(--muted)" }}>Loading what you can do…</span>}
          {actions.map((o, i) => actionRow(o, i === actions.length - 1 && !more))}
          <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44, background: "transparent", border: "none", color: "var(--accent-text)", font: "500 14px var(--font-ui)", cursor: "pointer", padding: 0 }}>
            Something else: Dash, Dodge, Help, Hide… {more ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          {more && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(kit?.basic_actions ?? Object.keys(BASIC_TEXT)).map((b) => (
                <div key={b} style={{ display: "flex", gap: 8, fontSize: 14 }}>
                  <span style={{ fontWeight: 600, width: 84, flexShrink: 0 }}>{b}</span>
                  {help !== "numbers" && <span style={{ color: "var(--text2)" }}>{BASIC_TEXT[b]}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </Step>

      <Step n={3} title="Bonus action" right={cunning ? <Label>Cunning Action</Label> : undefined}>
        {cunning && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            <span className="btn btn-ghost" style={{ minHeight: 42, cursor: "default" }}>Dash</span>
            <span className="btn btn-ghost" style={{ minHeight: 42, cursor: "default", padding: "0 6px" }}>Disengage</span>
            <button type="button" className="btn btn-secondary" onClick={() => roll({ ...skillSpec(pc, "Stealth", skills["Stealth"] ?? 0), title: "Hide (Stealth check)" })} style={{ minHeight: 42 }}>
              Hide
            </button>
          </div>
        )}
        {otherBonus.length > 0 && <div style={{ display: "flex", flexDirection: "column" }}>{otherBonus.map((o, i) => actionRow(o, i === otherBonus.length - 1))}</div>}
        {!cunning && otherBonus.length === 0 && help !== "numbers" && (
          <span style={{ fontSize: 14, color: "var(--muted)" }}>Nothing on your sheet uses a bonus action yet. That's normal.</span>
        )}
      </Step>

      {free.length > 0 && (
        <Panel style={{ gap: 8 }}>
          <h3 style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>No action needed</h3>
          {help === "teach" && <span style={{ fontSize: 14, color: "var(--muted)" }}>These don't use up your action or your bonus action.</span>}
          <div style={{ display: "flex", flexDirection: "column" }}>{free.map((o, i) => actionRow(o, i === free.length - 1))}</div>
        </Panel>
      )}

      {help !== "numbers" && (kit?.tips.length ?? 0) > 0 && (
        help === "teach" || tipsOpen ? (
          kit!.tips.slice(0, help === "teach" ? 2 : 4).map((t) => {
            const [title, ...rest] = t.split(": ");
            const body = rest.join(": ");
            return <Tip key={t} title={rest.length ? title : undefined}>{rest.length ? body.charAt(0).toUpperCase() + body.slice(1) : t}</Tip>;
          })
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => setTipsOpen(true)} style={{ minHeight: 44 }}>
            Tips for this turn
          </button>
        )
      )}
    </>
  );
}

function Waiting() {
  const { pc, turn, kit, help } = usePlayer();
  const order = turn?.order ?? [];
  const cur = order.findIndex((r) => r.current);
  const me = order.findIndex((r) => r.you);
  let when = "";
  if (cur >= 0 && me >= 0) {
    const ahead = (me - cur + order.length) % order.length;
    when = ahead === 1 ? "You're next." : me < cur ? `You go ${ordinalWord(me + 1)} in round ${(turn?.round ?? 1) + 1}.` : `${ahead - 1} turn${ahead - 1 === 1 ? "" : "s"} before yours.`;
  }
  return (
    <>
      <Panel style={{ gap: 8, padding: "12px 10px 8px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 4px", gap: 8 }}>
          <h2 style={{ margin: 0, fontWeight: 600, fontSize: 16, minWidth: 0, overflowWrap: "anywhere" }}>{turn?.active_combatant_name ? `${turn.active_combatant_name} is up` : "The fight is on"}</h2>
          {turn?.round != null && <Label>Round <span className="num">{turn.round}</span></Label>}
        </div>
        {when && <span style={{ fontSize: 14, color: "var(--text2)", padding: "0 4px" }}>{when}</span>}
        {order.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {order.map((r, i) => (
              <div key={`${r.name}-${i}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 10px", borderRadius: 8, background: r.current ? "var(--accent-soft)" : "transparent", opacity: r.defeated ? 0.45 : 1 }}>
                <span className="num" style={{ width: 24, textAlign: "right", fontWeight: 600, fontSize: 14, color: "var(--text2)" }}>{r.initiative}</span>
                <span className="story" style={{ flex: 1, fontSize: 17, fontWeight: r.current || r.you ? 700 : 500, color: r.side === "foe" ? "var(--danger-text)" : "var(--text)", textDecoration: r.defeated ? "line-through" : "none" }}>{r.name}</span>
                {r.current ? <span className="pill pill-live">Now</span> : r.you ? <span className="pill">You</span> : null}
              </div>
            ))}
          </div>
        )}
      </Panel>
      {(kit?.reaction.length ?? 0) > 0 && (
        <Panel style={{ gap: 4, padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--teal)" }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Your reaction is ready</span>
          </div>
          {kit!.reaction.slice(0, help === "numbers" ? 4 : 3).map((r) => (
            <span key={r.key} style={{ fontSize: 14, color: "var(--text2)" }}>
              <b style={{ color: "var(--text)", fontWeight: 600 }}>{r.name}</b>
              {help !== "numbers" && r.note ? `: ${r.note}` : ""}
            </span>
          ))}
        </Panel>
      )}
      <QuickChecks pcName={pc.character_name} />
    </>
  );
}

function Exploring() {
  const { pc, pcId, liveSessionId, help } = usePlayer();
  const roll = useRoll();
  return (
    <>
      <Panel tone="inset" style={{ padding: "10px 12px", gap: 2 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>No fight right now</h2>
        {help === "teach" && (
          <span style={{ fontSize: 14, color: "var(--text2)" }}>
            When the DM asks for a check, tap it below and roll; it shows on the TV.
          </span>
        )}
      </Panel>
      <QuickChecks pcName={pc.character_name} />
      <button type="button" className="btn btn-secondary" onClick={() => roll(initiativeSpec(pc))} style={{ minHeight: 48 }}>
        <Dices size={18} /> Roll initiative
      </button>
      {liveSessionId && (
        <Link to={`/table/${liveSessionId}?pc=${pcId}`} style={{ fontSize: 14, alignSelf: "flex-start", padding: "8px 0" }}>
          Open the table map
        </Link>
      )}
    </>
  );
}

function QuickChecks({ pcName }: { pcName: string }) {
  const { pc, skills, help } = usePlayer();
  const roll = useRoll();
  const ranks = (pc.skill_proficiencies as Record<string, number> | null) ?? {};
  const best = Object.entries(skills)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s)
    .filter((s) => !["Perception", "Insight", "Investigation"].includes(s));
  const picks = ["Perception", "Insight", "Investigation", ...best.slice(0, 3)].filter((s) => s in skills);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }} aria-label={`Quick checks for ${pcName}`}>
      <h2 style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>{help === "teach" ? "Checks the DM asks for most · tap to roll" : "Quick checks"}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {picks.map((s) => (
          <button key={s} type="button" className="btn btn-secondary" onClick={() => roll(skillSpec(pc, s, skills[s]))} style={{ minHeight: 44, justifyContent: "space-between", padding: "0 12px", fontSize: 14 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {ranks[s] ? <span aria-label={ranks[s] >= 2 ? "expert" : "trained"} style={{ color: "var(--accent-text)", fontSize: 11 }}>{ranks[s] >= 2 ? "◆" : "●"}</span> : null}
              {s}
            </span>
            <span className="num" style={{ fontWeight: 600 }}>{fmt(skills[s])}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Concentrating() {
  const { pc, pcId, refresh, help } = usePlayer();
  const drop = useMutation({ mutationFn: () => playApi.patchState(pcId, { concentration_on: null }), onSuccess: refresh });
  if (!pc.concentration_on) return null;
  return (
    <Panel style={{ padding: "10px 12px", flexDirection: "row", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 14 }}>Concentrating on <b>{pc.concentration_on}</b></span>
        {help === "teach" && <span style={{ fontSize: 13, color: "var(--muted)" }}>If you take damage, the DM asks for a Constitution save to keep it going.</span>}
      </div>
      <button type="button" className="btn btn-ghost" onClick={() => drop.mutate()} disabled={drop.isPending} style={{ minHeight: 40 }}>
        Drop it
      </button>
    </Panel>
  );
}

function Feed() {
  const { feed, pc } = usePlayer();
  if (feed.length === 0) return null;
  return (
    <Panel style={{ gap: 2, padding: "10px 12px" }}>
      <h2 style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>At the table</h2>
      {feed.map((r, i) => (
        <div key={r.id} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 0", borderBottom: i === feed.length - 1 ? "none" : "1px solid var(--border)" }}>
          <span className="story" style={{ fontWeight: 700, minWidth: 48, maxWidth: "45%", overflowWrap: "anywhere" }}>{r.roller === pc.character_name ? "You" : r.roller || "DM"}</span>
          <span style={{ flex: 1, fontSize: 14, color: "var(--text2)" }}>{r.label}</span>
          <span className="num" style={{ fontWeight: 600, color: r.crit ? "var(--accent-text)" : r.fumble ? "var(--danger-text)" : "var(--text)" }}>
            {r.total}
            {r.crit ? " crit" : r.fumble ? " miss" : ""}
          </span>
        </div>
      ))}
    </Panel>
  );
}

function Step({ n, title, right, children }: { n: number; title: string; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Panel style={{ gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span aria-hidden className="num" style={{ width: 24, height: 24, borderRadius: "50%", border: "1px solid var(--border2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: "var(--text2)" }}>{n}</span>
        <h3 style={{ margin: 0, fontWeight: 600, fontSize: 16, flex: 1 }}>{title}</h3>
        {right}
      </div>
      {children}
    </Panel>
  );
}

function ordinalWord(n: number) {
  return ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"][n - 1] ?? `${n}th`;
}
