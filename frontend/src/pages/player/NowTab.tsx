/**
 * Now (Plan 122): the screen follows the game. Your turn → move, one action,
 * one bonus action, with your real attacks to roll and a coach tip. Someone
 * else's turn → who's up, when you go, your reaction. No fight → quick checks
 * and the table's latest rolls.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Dices, Sparkles, Star } from "lucide-react";

import { playApi, type TurnOption } from "../../api/play";
import { usePlayer } from "./playerContext";
import { useRoll } from "./rollContext";
import { damageSpec, initiativeSpec, skillSpec, weaponAttackSpec } from "./rolls";
import { Label, Panel, Tip } from "./ui";
import { CONDITION_TEXT, fmt } from "./rules";

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
};

export default function NowTab() {
  const { pc, combat, turn, pcId } = usePlayer();
  const levelUp = pc.pending_level != null && pc.pending_level > pc.level;
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
      {combat?.in_combat ? turn?.active ? <YourTurn /> : <Waiting /> : <Exploring />}
      <Conditions />
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
  const spend = useMutation({
    mutationFn: (id: string) => playApi.spendFeature(pcId, id),
    onSuccess: () => refresh(),
  });
  const takeFeature = (o: TurnOption) => {
    const f = features.find((x) => x.feature_name.toLowerCase() === o.name.toLowerCase());
    if (f && f.max_uses > 0 && f.uses_spent < f.max_uses) {
      spend.mutate(f.id);
      notify(`${o.name} used.`);
    } else notify(`${o.name}: tell the DM you're using it.`);
  };

  const actionRow = (o: TurnOption, last: boolean) => {
    const leveled = (o.kind === "spell" || o.kind === "heal" || o.kind === "buff") && o.spell_level > 0;
    let button: React.ReactNode = null;
    if (o.to_hit != null && !leveled) {
      button = (
        <button type="button" className="btn btn-secondary" onClick={() => roll(weaponAttackSpec(pc, o))} style={{ minHeight: 42 }}>
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
    const numbers = [
      o.to_hit != null ? `${fmt(o.to_hit)} to hit` : null,
      o.save,
      o.damage ? `${o.damage}${o.damage_type ? ` ${o.damage_type}` : ""}` : null,
      o.uses_left != null && o.uses_left < 50 ? `${o.uses_left} left` : null,
    ].filter(Boolean);
    return (
      <div key={o.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: last ? "none" : "1px solid var(--border)" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600 }}>{o.name}</span>
          <span className="num" style={{ fontSize: 13, color: "var(--text2)" }}>{numbers.join(" · ")}</span>
          {help === "teach" && o.kind === "feature" && o.note && <span style={{ fontSize: 13, color: "var(--muted)" }}>{o.note}</span>}
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
  return (
    <>
      <Panel tone="lit" style={{ gap: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span className="story" style={{ fontWeight: 700, fontSize: 26, color: "var(--accent-text)" }}>Your turn</span>
          {turn?.round != null && <span style={{ fontSize: 13, color: "var(--text2)" }}>Round <span className="num">{turn.round}</span></span>}
        </div>
        {help !== "numbers" && <span style={{ fontSize: 14, color: "var(--text2)" }}>You can move, take one action and one bonus action, in any order.</span>}
      </Panel>

      <Step n={1} title="Move" right={<span className="num" style={{ fontWeight: 600 }}>{kit?.speed ?? pc.speed} ft</span>}>
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
          <span style={{ fontWeight: 600, fontSize: 16 }}>{turn?.active_combatant_name ? `${turn.active_combatant_name} is up` : "The fight is on"}</span>
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
  const { pc, liveSessionId, help } = usePlayer();
  const roll = useRoll();
  return (
    <>
      {help === "teach" && (
        <Panel tone="inset" style={{ padding: "10px 12px" }}>
          <span style={{ fontSize: 14, color: "var(--text2)" }}>
            No fight right now. When the DM asks for a check, tap it below and roll; it shows on the TV.
          </span>
        </Panel>
      )}
      <QuickChecks pcName={pc.character_name} />
      <button type="button" className="btn btn-secondary" onClick={() => roll(initiativeSpec(pc))} style={{ minHeight: 48 }}>
        <Dices size={18} /> Roll initiative
      </button>
      {liveSessionId && (
        <Link to={`/table/${liveSessionId}?pc=${pc.id}`} style={{ fontSize: 14, alignSelf: "flex-start", padding: "8px 0" }}>
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
      <Label>{help === "teach" ? "Checks the DM asks for most · tap to roll" : "Quick checks"}</Label>
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

function Conditions() {
  const { combat, help, pc } = usePlayer();
  const list = [...(combat?.in_combat ? combat.conditions : []), ...(pc.exhaustion ? ["exhaustion"] : [])];
  if (list.length === 0) return null;
  return (
    <Panel style={{ padding: "10px 12px", gap: 6 }}>
      {list.map((c) => (
        <div key={c} style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
          <span className="pill pill-amber" style={{ textTransform: "capitalize" }}>
            {c}
            {c === "exhaustion" ? ` ${pc.exhaustion}` : ""}
          </span>
          {help !== "numbers" && <span style={{ flex: "1 1 200px", fontSize: 13, color: "var(--text2)" }}>{CONDITION_TEXT[c.toLowerCase()] ?? "Ask the DM what this does."}</span>}
        </div>
      ))}
    </Panel>
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
      <Label>At the table</Label>
      {feed.map((r, i) => (
        <div key={r.id} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 0", borderBottom: i === feed.length - 1 ? "none" : "1px solid var(--border)" }}>
          <span className="story" style={{ fontWeight: 700, minWidth: 48 }}>{r.roller === pc.character_name ? "You" : r.roller.split(" ")[0] || "DM"}</span>
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
        <span style={{ fontWeight: 600, fontSize: 16, flex: 1 }}>{title}</span>
        {right}
      </div>
      {children}
    </Panel>
  );
}

function ordinalWord(n: number) {
  return ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"][n - 1] ?? `${n}th`;
}
