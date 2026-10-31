/**
 * Character (Plan 122): the sheet at three help levels. Teach me explains every
 * number; Remind me labels them; Just the numbers packs them tight. Every
 * check, save and ability is a roll; hit points, temp HP, inspiration, hit dice,
 * features and exhaustion are all one tap. Plan 128: conditions in plain words
 * right under hit points, and "What you can do", the class's features by level.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronRight, Shirt, Swords } from "lucide-react";

import { playApi } from "../../api/play";
import { portraitSrc } from "../../lib/portrait";
import { usePlayer } from "./playerContext";
import { useRoll } from "./rollContext";
import { abilitySpec, initiativeSpec, saveSpec, skillSpec } from "./rolls";
import { Heading, HelpSwitch, HpBar, Label, Monogram, Panel, Pips } from "./ui";
import { ABILITIES, HIT_DIE_BY_CLASS, RECOVERY_TEXT, SKILLS, fmt, mod, profBonus, realPlayerName } from "./rules";
import Conditions from "./Conditions";

export default function CharacterTab() {
  const { pc, pcId, help, setHelp } = usePlayer();
  const subline = [`${pc.character_class} ${pc.level}`, pc.subclass, pc.race, realPlayerName(pc.player_name)].filter(Boolean).join(" · ");
  return (
    <>
      <header style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 16 }}>
        <Monogram name={pc.character_name} cls={pc.character_class} url={pc.portrait_url ? portraitSrc(pc.portrait_url, pc.updated_at) : null} size={48} />
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <h1 className="story" style={{ margin: 0, fontWeight: 700, fontSize: 22, lineHeight: 1.1, overflowWrap: "anywhere" }}>{pc.character_name}</h1>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{subline}</span>
        </div>
      </header>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Label>Help</Label>
        <HelpSwitch value={help} onChange={setHelp} />
      </div>
      <HitPoints />
      <Conditions />
      {help === "teach" && <TeachSheet />}
      {help === "remind" && <RemindSheet />}
      {help === "numbers" && <NumbersSheet />}
      <ClassFeatures />
      <Features />
      <HitDice />
      <Exhaustion />
      <nav aria-label="More about your character" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <MoreLink to={`/play/${pcId}/character`} icon={<Shirt size={18} />} title="Your look and gear" sub="Equip items, describe how you look." />
        <MoreLink to={`/play/${pcId}/arena`} icon={<Swords size={18} />} title="Practice in the Arena" sub="Spar with your real sheet. Nothing here changes your character." />
      </nav>
    </>
  );
}

function MoreLink({ to, icon, title, sub }: { to: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <Link to={to} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", textDecoration: "none" }}>
      <span style={{ color: "var(--accent-text)" }}>{icon}</span>
      <span style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <span style={{ fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 13, color: "var(--text2)" }}>{sub}</span>
      </span>
      <ChevronRight size={18} color="var(--muted)" />
    </Link>
  );
}

function HitPoints() {
  const { pc, pcId, refresh, help } = usePlayer();
  const [amount, setAmount] = useState("");
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  const done = () => {
    setAmount("");
    refresh();
  };
  const damage = useMutation({ mutationFn: () => playApi.applyDamage(pcId, n), onSuccess: done });
  const heal = useMutation({ mutationFn: () => playApi.applyHealing(pcId, n), onSuccess: done });
  const temp = useMutation({ mutationFn: () => playApi.patchState(pcId, { temp_hp: Math.min(999, n) }), onSuccess: done });
  const insp = useMutation({ mutationFn: () => playApi.patchState(pcId, { heroic_inspiration: !pc.heroic_inspiration }), onSuccess: refresh });
  const busy = damage.isPending || heal.isPending || temp.isPending;
  return (
    <Panel style={{ gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <Heading>Hit points{pc.temp_hp > 0 ? ` · +${pc.temp_hp} temporary` : ""}</Heading>
        <span className="num">
          <span style={{ fontSize: 34, fontWeight: 600 }}>{pc.hp_current}</span>
          <span style={{ color: "var(--muted)", fontSize: 16 }}> / {pc.hp_max}</span>
        </span>
      </div>
      <HpBar cur={pc.hp_current} max={pc.hp_max} height={8} />
      {help === "teach" && <span style={{ fontSize: 13, color: "var(--muted)" }}>Type the number the DM says, then tap. Damage takes temporary hit points first.</span>}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input inputMode="numeric" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} placeholder="0" className="num" style={{ width: 72, minHeight: 44, textAlign: "center", fontWeight: 600, fontSize: 17 }} />
        <button type="button" className="btn btn-secondary" disabled={!n || busy} onClick={() => damage.mutate()} style={{ minHeight: 44, flex: 1 }}>Took damage</button>
        <button type="button" className="btn btn-secondary" disabled={!n || busy} onClick={() => heal.mutate()} style={{ minHeight: 44, flex: 1 }}>Healed</button>
        <button type="button" className="btn btn-ghost" disabled={!n || busy} onClick={() => temp.mutate()} style={{ minHeight: 44 }} title="Set temporary hit points">Temp</button>
      </div>
      <button type="button" aria-pressed={pc.heroic_inspiration} onClick={() => insp.mutate()} disabled={insp.isPending} className="btn btn-ghost" style={{ minHeight: 44, justifyContent: "flex-start", whiteSpace: "normal", textAlign: "left", borderColor: pc.heroic_inspiration ? "var(--accent-edge)" : undefined, color: pc.heroic_inspiration ? "var(--accent-text)" : undefined }}>
        <span aria-hidden style={{ width: 14, height: 14, flexShrink: 0, borderRadius: "50%", border: "2px solid currentColor", background: pc.heroic_inspiration ? "currentColor" : "transparent" }} />
        {pc.heroic_inspiration ? "Heroic Inspiration: tap to spend it" : "No Heroic Inspiration"}
        {help === "teach" && !pc.heroic_inspiration && <span style={{ color: "var(--muted)", fontWeight: 400 }}> · the DM hands it out</span>}
      </button>
    </Panel>
  );
}

function StatCard({ label, value, note, onTap }: { label: string; value: string; note?: string; onTap?: () => void }) {
  const inner = (
    <>
      <span style={{ fontSize: 13, color: "var(--muted)" }}>{label}</span>
      <span className="num" style={{ fontWeight: 600, fontSize: 24, lineHeight: 1.1 }}>{value}</span>
      {note && <span style={{ fontSize: 13, color: "var(--text2)" }}>{note}</span>}
    </>
  );
  const style: React.CSSProperties = { borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 2, textAlign: "left", color: "var(--text)" };
  return onTap ? (
    <button type="button" onClick={onTap} style={{ ...style, cursor: "pointer", font: "inherit" }}>{inner}</button>
  ) : (
    <div style={style}>{inner}</div>
  );
}

function passivePerception(pc: ReturnType<typeof usePlayer>["pc"], skills: Record<string, number>) {
  return 10 + (skills["Perception"] ?? mod(pc.score_wis));
}

function TeachSheet() {
  const { pc, skills, saves } = usePlayer();
  const roll = useRoll();
  const [allAbilities, setAllAbilities] = useState(false);
  const [allSkills, setAllSkills] = useState(false);
  const ranks = (pc.skill_proficiencies as Record<string, number> | null) ?? {};
  const scores = ABILITIES.map((a) => ({ ...a, m: mod(pc[`score_${a.key}` as const] as number) }));
  const best = [...scores].sort((a, b) => b.m - a.m)[0];
  const shown = allAbilities ? scores : [best];
  const good = Object.keys(skills).filter((s) => ranks[s]);
  const rest = Object.keys(skills).filter((s) => !ranks[s]).sort();
  const savesTrained = ABILITIES.filter((a) => (saves[a.abbr] ?? 0) - mod(pc[`score_${a.key}` as const] as number) > 0);
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        <StatCard label="Armor Class" value={String(pc.ac)} note="How hard you are to hit." />
        <StatCard label="Speed" value={`${pc.speed} ft`} note="How far you move on a turn." />
        <StatCard label="Initiative · tap to roll" value={fmt(mod(pc.score_dex))} note="Added when a fight starts." onTap={() => roll(initiativeSpec(pc))} />
        <StatCard label="Passive Perception" value={String(passivePerception(pc, skills))} note="What you notice without trying." />
      </div>
      <Panel style={{ gap: 6 }}>
        <Heading>{allAbilities ? "Your six abilities · tap to roll" : "Your best ability"}</Heading>
        {shown.map((a) => (
          <button key={a.key} type="button" onClick={() => roll(abilitySpec(pc, a.key))} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 0", background: "transparent", border: "none", borderBottom: allAbilities ? "1px solid var(--border)" : "none", color: "inherit", textAlign: "left", cursor: "pointer", font: "inherit" }}>
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", width: "100%" }}>
              <span style={{ fontWeight: 600, fontSize: 16 }}>{a.name}</span>
              <span className="num" style={{ fontWeight: 600, fontSize: 18 }}>{fmt(a.m)}</span>
            </span>
            <span style={{ fontSize: 14, color: "var(--text2)" }}>{a.teach}</span>
          </button>
        ))}
        <button type="button" onClick={() => setAllAbilities((v) => !v)} style={{ alignSelf: "flex-start", minHeight: 36, background: "transparent", border: "none", color: "var(--accent-text)", font: "500 14px var(--font-ui)", padding: 0, cursor: "pointer" }}>
          {allAbilities ? "Show just your best" : "See all six abilities"}
        </button>
      </Panel>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Heading>You're good at · tap to roll</Heading>
        <SkillGrid names={good} />
        <button type="button" onClick={() => setAllSkills((v) => !v)} style={{ alignSelf: "flex-start", minHeight: 36, background: "transparent", border: "none", color: "var(--accent-text)", font: "500 14px var(--font-ui)", padding: 0, cursor: "pointer" }}>
          {allSkills ? "Hide the other skills" : `The other ${rest.length} skills`}
        </button>
        {allSkills && <SkillGrid names={rest} teach />}
      </div>
      <Panel style={{ gap: 6 }}>
        <Heading>Saving throws · when something tries to hurt or trick you</Heading>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
          {ABILITIES.map((a) => (
            <button key={a.abbr} type="button" className="btn btn-secondary" onClick={() => roll(saveSpec(pc, a.abbr, saves[a.abbr] ?? 0))} style={{ minHeight: 44, justifyContent: "space-between", padding: "0 10px", fontSize: 14 }}>
              <span>{a.name}</span>
              <span className="num" style={{ fontWeight: 600 }}>{fmt(saves[a.abbr] ?? 0)}</span>
            </button>
          ))}
        </div>
        {savesTrained.length > 0 && <span style={{ fontSize: 13, color: "var(--muted)" }}>You're trained in {savesTrained.map((a) => a.name).join(" and ")} saves.</span>}
      </Panel>
    </>
  );
}

function SkillGrid({ names, teach }: { names: string[]; teach?: boolean }) {
  const { pc, skills } = usePlayer();
  const roll = useRoll();
  const ranks = (pc.skill_proficiencies as Record<string, number> | null) ?? {};
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
      {names.map((s) => (
        <button key={s} type="button" className="btn btn-secondary" onClick={() => roll(skillSpec(pc, s, skills[s] ?? 0))} title={teach ? SKILLS[s]?.teach : undefined} style={{ minHeight: 44, justifyContent: "space-between", padding: "0 10px", fontSize: 14 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
            {ranks[s] ? <span aria-label={ranks[s] >= 2 ? "expert" : "trained"} style={{ color: "var(--accent-text)", fontSize: 11 }}>{ranks[s] >= 2 ? "◆" : "●"}</span> : null}
            {s}
          </span>
          <span className="num" style={{ fontWeight: 600 }}>{fmt(skills[s] ?? 0)}</span>
        </button>
      ))}
    </div>
  );
}

function RemindSheet() {
  const { pc, skills, saves } = usePlayer();
  const roll = useRoll();
  const tiles: Array<[string, string, (() => void) | undefined]> = [
    ["Armor", String(pc.ac), undefined],
    ["Speed", String(pc.speed), undefined],
    ["Init", fmt(mod(pc.score_dex)), () => roll(initiativeSpec(pc))],
    ["Pass. Perc.", String(passivePerception(pc, skills)), undefined],
  ];
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
        {tiles.map(([l, v, tap]) => (
          <button key={l} type="button" onClick={tap} disabled={!tap} title={l === "Pass. Perc." ? "Passive Perception" : l === "Init" ? "Initiative" : undefined} style={{ borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", padding: "7px 9px", display: "flex", flexDirection: "column", textAlign: "left", color: "var(--text)", font: "inherit", cursor: tap ? "pointer" : "default", opacity: 1 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{l}</span>
            <span className="num" style={{ fontWeight: 600, fontSize: 19 }}>{v}</span>
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
        {ABILITIES.map((a) => (
          <button key={a.key} type="button" className="btn btn-secondary" title={a.name} onClick={() => roll(abilitySpec(pc, a.key))} style={{ minHeight: 44, justifyContent: "space-between", padding: "0 10px" }}>
            <span style={{ fontSize: 13, color: "var(--text2)" }}>{a.abbr}</span>
            <span className="num" style={{ fontWeight: 600 }}>{fmt(mod(pc[`score_${a.key}` as const] as number))}</span>
          </button>
        ))}
      </div>
      <Heading>Saves</Heading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
        {ABILITIES.map((a) => (
          <button key={a.abbr} type="button" className="btn btn-ghost" title={`${a.name} save`} onClick={() => roll(saveSpec(pc, a.abbr, saves[a.abbr] ?? 0))} style={{ minHeight: 40, justifyContent: "space-between", padding: "0 10px", fontSize: 13 }}>
            <span>{a.abbr}</span>
            <span className="num" style={{ fontWeight: 600, color: "var(--text)" }}>{fmt(saves[a.abbr] ?? 0)}</span>
          </button>
        ))}
      </div>
      <Heading>Skills · ◆ expert, ● trained · tap to roll</Heading>
      <SkillGrid names={Object.keys(skills).sort((a, b) => (skills[b] ?? 0) - (skills[a] ?? 0) || a.localeCompare(b))} />
    </>
  );
}

function NumbersSheet() {
  const { pc, skills, saves } = usePlayer();
  const roll = useRoll();
  const ranks = (pc.skill_proficiencies as Record<string, number> | null) ?? {};
  const dense: Array<[string, string, string]> = [
    ["AC", String(pc.ac), "Armor Class"],
    ["SPD", String(pc.speed), "Speed"],
    ["INIT", fmt(mod(pc.score_dex)), "Initiative"],
    ["PB", fmt(profBonus(pc.level)), "Proficiency bonus"],
    ["PP", String(passivePerception(pc, skills)), "Passive Perception"],
    ["HD", `${pc.level}d${HIT_DIE_BY_CLASS[pc.character_class] ?? 8}`, "Hit dice"],
  ];
  return (
    <>
      <div className="num" style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 14 }}>
        {dense.map(([l, v, full]) => (
          <span key={l} title={full}><span style={{ color: "var(--muted)" }}>{l}</span> <b>{v}</b></span>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 4 }}>
        {ABILITIES.map((a) => (
          <button key={a.key} type="button" title={a.name} onClick={() => roll(abilitySpec(pc, a.key))} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "4px 0", display: "flex", flexDirection: "column", alignItems: "center", background: "transparent", color: "var(--text)", font: "inherit", cursor: "pointer", minHeight: 44 }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{a.abbr}</span>
            <span className="num" style={{ fontWeight: 600 }}>{fmt(mod(pc[`score_${a.key}` as const] as number))}</span>
          </button>
        ))}
      </div>
      <div className="num" style={{ fontSize: 13, color: "var(--text2)", display: "flex", flexWrap: "wrap", gap: "2px 10px" }}>
        <span style={{ color: "var(--muted)" }}>Saves</span>
        {ABILITIES.map((a) => (
          <button key={a.abbr} type="button" onClick={() => roll(saveSpec(pc, a.abbr, saves[a.abbr] ?? 0))} style={{ background: "transparent", border: "none", color: "var(--text)", font: "inherit", padding: "4px 0", cursor: "pointer" }}>
            {a.abbr} <b>{fmt(saves[a.abbr] ?? 0)}</b>
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0 16px", fontSize: 13 }}>
        {Object.keys(skills).sort().map((s) => (
          <button key={s} type="button" onClick={() => roll(skillSpec(pc, s, skills[s]))} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", background: "transparent", border: "none", borderBottom: "1px solid var(--border)", color: "var(--text)", font: "inherit", cursor: "pointer", textAlign: "left" }}>
            <span>{ranks[s] ? (ranks[s] >= 2 ? "◆ " : "● ") : ""}{s}</span>
            <span className="num" style={{ fontWeight: 600 }}>{fmt(skills[s])}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * "What you can do" (Plan 128): every class feature the character has, by the
 * level it arrives. The list comes from `/play/{key}/class-features` (group
 * C2); until that answers, the section stays hidden.
 */
function ClassFeatures() {
  const { pc, pcId, help } = usePlayer();
  const { data, isError } = useQuery({
    queryKey: ["play-class-features", pcId],
    queryFn: () => playApi.classFeatures(pcId),
    retry: false,
    staleTime: 300_000,
  });
  if (isError || !data || data.length === 0) return null;
  // "class" | "subclass": only a subclass feature says where it comes from.
  const from = (source: string) => (source === "subclass" ? ` · ${pc.subclass || "your subclass"}` : "");
  const rows = [...data].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return (
    <Panel style={{ gap: 2 }}>
      <Heading style={{ paddingBottom: 4 }}>{help === "teach" ? `What you can do · what being a ${pc.character_class} gives you` : "What you can do"}</Heading>
      {rows.map((f, i) => (
        <div key={`${f.source}-${f.level}-${f.name}`} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0", borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, flex: "1 1 auto", minWidth: 0 }}>{f.name}</h3>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              Level <span className="num">{f.level}</span>
              {from(f.source)}
            </span>
          </div>
          {help !== "numbers" && f.note && <span style={{ fontSize: 14, color: "var(--text2)" }}>{f.note}</span>}
        </div>
      ))}
    </Panel>
  );
}

function Features() {
  const { features, pcId, refresh, help, notify } = usePlayer();
  const spend = useMutation({ mutationFn: (id: string) => playApi.spendFeature(pcId, id), onSuccess: refresh });
  const counted = features.filter((f) => f.max_uses > 0);
  if (counted.length === 0) return null;
  return (
    <Panel style={{ gap: 10 }}>
      <Heading>Features with uses{help === "teach" ? " · tap a filled dot when you use one" : ""}</Heading>
      {counted.map((f) => {
        const left = Math.max(0, f.max_uses - f.uses_spent);
        if (f.max_uses > POOL_FROM) return <PoolRow key={f.id} feature={f} left={left} />;
        return (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 150px", display: "flex", flexDirection: "column" }}>
              <span style={{ fontWeight: 600 }}>{f.feature_name}</span>
              {help !== "numbers" && <span style={{ fontSize: 13, color: "var(--muted)" }}>{RECOVERY_TEXT[f.recovery] ?? f.recovery}</span>}
            </div>
            <Pips filled={left} total={f.max_uses} size={20} label={f.feature_name} onTap={(_, on) => {
              if (on) {
                spend.mutate(f.id);
                notify(`${f.feature_name} used. ${left - 1} left.`);
              }
            }} />
          </div>
        );
      })}
    </Panel>
  );
}

// Plan 128 — a feature with more uses than this is a pool of points (Lay on
// Hands: 5 × level), spent a chosen number at a time, not a row of dots.
const POOL_FROM = 10;

function PoolRow({ feature, left }: { feature: { id: string; feature_name: string; max_uses: number; recovery: string }; left: number }) {
  const { pcId, refresh, help, notify } = usePlayer();
  const [amount, setAmount] = useState(() => Math.min(5, Math.max(1, left)));
  const spend = useMutation({
    mutationFn: (n: number) => playApi.spendFeature(pcId, feature.id, n),
    onSuccess: (_row, n) => {
      notify(`${feature.feature_name}: ${n} used. ${Math.max(0, left - n)} left.`);
      refresh();
    },
  });
  const n = Math.max(1, Math.min(left, Math.floor(amount) || 1));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, flex: "1 1 150px" }}>{feature.feature_name}</span>
        <span>
          <span className="num" style={{ fontSize: 22, fontWeight: 700 }}>{left}</span>
          <span className="num" style={{ color: "var(--muted)" }}> of {feature.max_uses} left</span>
        </span>
      </div>
      {help !== "numbers" && (
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          {help === "teach" ? "A pool of points: spend as many as you need at once. " : ""}
          {RECOVERY_TEXT[feature.recovery] ?? feature.recovery}
        </span>
      )}
      {left > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
            <span style={{ fontSize: 14 }}>Points</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={left}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="num"
              style={{ width: 84, minHeight: 44, fontSize: 17 }}
            />
          </label>
          <button type="button" className="btn btn-secondary" disabled={spend.isPending} onClick={() => spend.mutate(n)} style={{ minHeight: 44 }}>
            Use {n}
          </button>
        </div>
      )}
    </div>
  );
}

function HitDice() {
  const { pc, pcId, refresh, help } = usePlayer();
  const roll = useRoll();
  const size = HIT_DIE_BY_CLASS[pc.character_class] ?? 8;
  const con = mod(pc.score_con);
  const left = Math.max(0, pc.level - pc.hit_dice_spent);
  const spend = () =>
    roll({
      title: "Hit die",
      kind: "hitdie",
      die: `d${size}` as "d8",
      modifier: con,
      why: `On a short rest, roll a hit die and add your Constitution ${fmt(con)}; you heal that much.`,
      onResult: async (r) => {
        const heal = Math.max(1, r.total);
        await playApi.spendHitDice(pcId, 1);
        await playApi.applyHealing(pcId, heal);
        refresh();
        return `You heal ${heal}. ${left - 1} hit ${left - 1 === 1 ? "die" : "dice"} left.`;
      },
    });
  return (
    <Panel style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 160px", display: "flex", flexDirection: "column" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Hit dice <span className="num" style={{ fontWeight: 500, color: "var(--text2)" }}>{left} of {pc.level} · d{size}</span></h2>
        {help === "teach" && <span style={{ fontSize: 13, color: "var(--muted)" }}>Spend them on a short rest to heal. Half come back after a long rest.</span>}
      </div>
      <button type="button" className="btn btn-secondary" disabled={left === 0} onClick={spend} style={{ minHeight: 44 }}>
        Spend one
      </button>
    </Panel>
  );
}

function Exhaustion() {
  const { pc, pcId, refresh, help } = usePlayer();
  const set = useMutation({ mutationFn: (n: number) => playApi.patchState(pcId, { exhaustion: n }), onSuccess: refresh });
  const level = pc.exhaustion ?? 0;
  if (level === 0 && help !== "numbers") {
    return (
      <button type="button" className="btn btn-ghost" onClick={() => set.mutate(1)} style={{ minHeight: 40, alignSelf: "flex-start" }}>
        Add a level of exhaustion
      </button>
    );
  }
  return (
    <Panel style={{ gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Exhaustion <span className="num">{level}</span></h2>
        {level > 0 && <span className="num" style={{ fontSize: 13, color: "var(--amber-text)" }}>−{level * 2} to every d20 roll</span>}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <button key={i} type="button" aria-label={`Exhaustion level ${i}`} aria-pressed={i <= level} onClick={() => set.mutate(i === level ? level - 1 : i)} style={{ width: 44, height: 44, borderRadius: 10, border: `1px solid ${i <= level ? "var(--amber)" : "var(--border2)"}`, background: i <= level ? "var(--amber-soft)" : "transparent", color: "var(--text)", font: "600 15px var(--font-mono)", cursor: "pointer" }}>
            {i}
          </button>
        ))}
      </div>
      {help === "teach" && <span style={{ fontSize: 13, color: "var(--muted)" }}>A long rest removes one level. Level 6 is death.</span>}
    </Panel>
  );
}
