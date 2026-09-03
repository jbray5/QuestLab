import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../api/client";

/**
 * CharacterCreator (Plan 74) — /join/:campaignId/new
 *
 * Phone-first, seven quick steps, SRD 5.2.1 compendium from the API.
 * Ends on the player's brand-new live sheet. No accounts, no DM step.
 */

type Ability = "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";
const ABILITIES: Ability[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
const ABILITY_NAMES: Record<Ability, string> = {
  STR: "Strength", DEX: "Dexterity", CON: "Constitution", INT: "Intelligence", WIS: "Wisdom", CHA: "Charisma",
};

interface Options {
  campaign_name: string;
  species: { name: string; size: string; speed: number; traits: string[]; bonus_skill_choices?: number; bonus_origin_feat?: boolean }[];
  backgrounds: { name: string; abilities: Ability[]; feat: string; skills: string[]; tool: string; blurb: string }[];
  origin_feats: { name: string; blurb: string }[];
  classes: Record<string, {
    hit_die: number; primary: Ability[]; saves: Ability[];
    skills: { choose: number; from: string[] }; armor: string[]; subclass_level: number;
    srd_subclasses: string[]; spellcasting: { ability: Ability; cantrips_base: number; prepared: number[] } | null;
    kits: { name: string; items: string[]; armor: string | null; shield: boolean }[];
  }>;
  skills: Record<string, Ability>;
  standard_array: number[];
  point_buy_cost: Record<string, number>;
  point_buy_budget: number;
  armor: Record<string, { base: number; dex_cap: number | null; category: string; str_min?: number }>;
  spells: { name: string; level: number; classes: string[]; school: string }[];
  weapons: { name: string; damage_die: string; damage_type: string; category: string }[];
}

const CSS = `
.cc { min-height: 100dvh; padding: 1.2rem 1rem 6rem; color: #e6ddc8; font-family: Georgia, 'Palatino Linotype', serif;
  background: radial-gradient(ellipse at 50% -10%, #241a38 0%, #0d0a16 55%, #06050a 100%); }
.cc-inner { max-width: 640px; margin: 0 auto; }
.cc h1 { font-family: Cinzel, Georgia, serif; font-size: clamp(1.3rem, 5vw, 1.8rem); letter-spacing: 0.06em; color: #f0e6c8; margin: 0.2rem 0 0.1rem; }
.cc .sub { color: #b3a789; font-style: italic; margin: 0 0 1rem; font-size: 0.95rem; }
.cc .steps { display: flex; gap: 5px; margin-bottom: 1rem; }
.cc .steps i { flex: 1; height: 4px; border-radius: 2px; background: rgba(240,230,200,0.15); }
.cc .steps i.on { background: #d6af36; }
.cc h2 { font-family: Cinzel, Georgia, serif; font-size: 1.1rem; color: #d6af36; letter-spacing: 0.05em; margin: 0.4rem 0 0.6rem; }
.cc label { display: block; font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: #9a9078; margin: 0.7rem 0 0.25rem; }
.cc input[type=text], .cc textarea, .cc select { width: 100%; font-size: 16px; padding: 0.6rem 0.7rem; border-radius: 9px; border: 1px solid rgba(240,230,200,0.2); background: #14101d; color: #e6ddc8; }
.cc .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 9px; }
.cc .card { text-align: left; border: 1px solid rgba(240,230,200,0.18); border-radius: 12px; background: rgba(20,16,30,0.75); color: #e6ddc8; padding: 0.7rem 0.75rem; cursor: pointer; }
.cc .card.on { border-color: #d6af36; box-shadow: inset 0 0 22px rgba(214,175,54,0.14); }
.cc .card b { display: block; font-family: Cinzel, Georgia, serif; font-size: 0.95rem; color: #f0e6c8; margin-bottom: 0.2rem; }
.cc .card small { color: #9a9078; font-size: 0.78rem; line-height: 1.3; display: block; }
.cc .chips { display: flex; flex-wrap: wrap; gap: 6px; }
.cc .chip { border: 1px solid rgba(240,230,200,0.22); border-radius: 999px; padding: 0.3rem 0.7rem; background: transparent; color: #e6ddc8; font-size: 0.85rem; cursor: pointer; }
.cc .chip.on { border-color: #d6af36; background: rgba(214,175,54,0.16); color: #ffd76a; }
.cc .chip:disabled { opacity: 0.35; cursor: not-allowed; }
.cc .scores { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.cc .score { border: 1px solid rgba(240,230,200,0.18); border-radius: 12px; padding: 0.5rem; text-align: center; background: rgba(20,16,30,0.75); }
.cc .score b { display: block; font-family: Cinzel, serif; font-size: 0.7rem; letter-spacing: 0.1em; color: #9a9078; }
.cc .score .v { font-size: 1.6rem; color: #f0e6c8; font-family: Cinzel, serif; }
.cc .score .m { font-size: 0.8rem; color: #d6af36; }
.cc .score select { margin-top: 4px; font-size: 16px; }
.cc .score .pm { display: flex; justify-content: center; gap: 6px; margin-top: 4px; }
.cc .score .pm button { width: 34px; height: 30px; border-radius: 7px; border: 1px solid rgba(240,230,200,0.25); background: transparent; color: #e6ddc8; font-size: 1rem; }
.cc .traits { font-size: 0.85rem; color: #b3a789; padding-left: 1.1rem; margin: 0.4rem 0 0; }
.cc .traits li { margin: 0.25rem 0; }
.cc .note { color: #9a9078; font-size: 0.82rem; margin: 0.4rem 0; }
.cc .err { color: #ef5350; margin: 0.5rem 0; }
.cc .nav { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 8px; padding: 0.8rem 1rem calc(0.8rem + env(safe-area-inset-bottom)); background: rgba(6,5,10,0.92); border-top: 1px solid rgba(240,230,200,0.12); backdrop-filter: blur(6px); }
.cc .btn { flex: 1; padding: 0.8rem; border-radius: 10px; font-family: Cinzel, serif; font-size: 0.95rem; letter-spacing: 0.06em; cursor: pointer; border: 1px solid rgba(240,230,200,0.25); background: transparent; color: #e6ddc8; }
.cc .btn.primary { background: #8b2f2a; border-color: #b03a34; color: #fff; }
.cc .btn:disabled { opacity: 0.45; cursor: not-allowed; }
.cc .summary { border: 1px solid rgba(214,175,54,0.5); border-radius: 12px; padding: 0.8rem 1rem; background: rgba(20,16,30,0.75); }
.cc .summary div { display: flex; justify-content: space-between; padding: 0.2rem 0; border-bottom: 1px solid rgba(240,230,200,0.08); font-size: 0.95rem; }
.cc .summary div span:last-child { color: #f0e6c8; text-align: right; }
`;

const STEPS = ["Name", "Species", "Class", "Background", "Abilities", "Skills & gear", "Spells", "Review"];

export default function CharacterCreator() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const [opts, setOpts] = useState<Options | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build state.
  const [characterName, setCharacterName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [species, setSpecies] = useState("");
  const [customSpecies, setCustomSpecies] = useState("");
  const [klass, setKlass] = useState("");
  const [subclass, setSubclass] = useState("");
  const [customSub, setCustomSub] = useState("");
  const [level, setLevel] = useState(1);
  const [background, setBackground] = useState("");
  const [customBg, setCustomBg] = useState("");
  const [method, setMethod] = useState<"standard" | "pointbuy" | "manual">("standard");
  const [scores, setScores] = useState<Record<Ability, number>>({ STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 });
  const [bonusMode, setBonusMode] = useState<"21" | "111">("21");
  const [bonusPlus2, setBonusPlus2] = useState<Ability | "">("");
  const [bonusPlus1, setBonusPlus1] = useState<Ability | "">("");
  const [skills, setSkills] = useState<string[]>([]);
  const [originFeat, setOriginFeat] = useState("");
  const [kit, setKit] = useState("");
  const [cantrips, setCantrips] = useState<string[]>([]);
  const [spells, setSpells] = useState<string[]>([]);
  const [appearance, setAppearance] = useState("");

  useEffect(() => {
    if (!campaignId) return;
    api
      .get<Options>(`/play/join/${campaignId}/options`)
      .then(setOpts)
      .catch((e: Error) => setLoadError(e.message));
  }, [campaignId]);

  const cls = opts && klass ? opts.classes[klass] : null;
  const speciesRow = opts?.species.find((s) => s.name === species);
  const bg = opts?.backgrounds.find((b) => b.name === background);
  const speciesName = species === "__other" ? customSpecies : species;
  const subclassName = subclass === "__other" ? customSub : subclass;
  const bgName = background === "__other" ? customBg : background;

  const bonus = useMemo(() => {
    if (!bg) return {} as Record<string, number>;
    if (bonusMode === "111") return Object.fromEntries(bg.abilities.map((a) => [a, 1]));
    const out: Record<string, number> = {};
    if (bonusPlus2) out[bonusPlus2] = 2;
    if (bonusPlus1 && bonusPlus1 !== bonusPlus2) out[bonusPlus1] = 1;
    return out;
  }, [bg, bonusMode, bonusPlus2, bonusPlus1]);

  const finalScores = useMemo(
    () => Object.fromEntries(ABILITIES.map((a) => [a, Math.min(20, scores[a] + (bonus[a] ?? 0))])) as Record<Ability, number>,
    [scores, bonus],
  );
  const mod = (v: number) => Math.floor((v - 10) / 2);
  const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

  const pointsSpent = useMemo(
    () => ABILITIES.reduce((sum, a) => sum + (opts?.point_buy_cost[String(scores[a])] ?? 0), 0),
    [scores, opts],
  );
  const arrayUsed = useMemo(() => [...ABILITIES.map((a) => scores[a])].sort((x, y) => y - x), [scores]);

  // Spell caps mirror the server's SRD tables.
  const cantripCap = cls?.spellcasting?.cantrips_base ? cls.spellcasting.cantrips_base + (level >= 4 ? 1 : 0) + (level >= 10 ? 1 : 0) : 0;
  const spellCap = cls?.spellcasting ? cls.spellcasting.prepared[Math.max(1, Math.min(20, level)) - 1] : 0;
  const maxSpellLevel = useMemo(() => {
    if (!cls?.spellcasting) return 0;
    if (klass === "Paladin" || klass === "Ranger") return level >= 2 ? Math.min(5, Math.floor((level + 1) / 4)) : 1;
    if (klass === "Warlock") return Math.min(5, Math.floor((level + 1) / 2));
    return Math.min(9, Math.floor((level + 1) / 2));
  }, [cls, klass, level]);
  const classSpells = useMemo(
    () => (opts && klass ? opts.spells.filter((s) => s.classes.includes(klass) && s.level <= Math.max(1, maxSpellLevel)) : []),
    [opts, klass, maxSpellLevel],
  );

  const skillPicksAllowed = (cls?.skills.choose ?? 0) + (speciesRow?.bonus_skill_choices ?? 0);
  const classSkillPicks = skills.filter((s) => !(bg?.skills ?? []).includes(s));

  // HP/AC preview (same math as the server).
  const preview = useMemo(() => {
    if (!cls || !opts) return null;
    const con = mod(finalScores.CON), dex = mod(finalScores.DEX);
    let hp = cls.hit_die + con + (Math.floor(cls.hit_die / 2) + 1 + con) * (level - 1);
    if (species === "Dwarf") hp += level;
    if ((bg?.feat.startsWith("Tough") || originFeat === "Tough")) hp += 2 * level;
    const k = cls.kits.find((x) => x.name === kit) ?? cls.kits[0];
    let ac = 10 + dex;
    if (k?.armor && opts.armor[k.armor]) {
      const a = opts.armor[k.armor];
      ac = a.base + (a.dex_cap === null ? dex : Math.min(dex, a.dex_cap));
    }
    if (k?.shield) ac += 2;
    if (klass === "Monk" && !k?.armor) ac = 10 + dex + mod(finalScores.WIS);
    if (klass === "Barbarian" && !k?.armor) ac = 10 + dex + con;
    return { hp: Math.max(1, hp), ac };
  }, [cls, opts, finalScores, level, species, bg, originFeat, kit, klass]);

  function canNext(): boolean {
    switch (step) {
      case 0: return characterName.trim().length > 0 && playerName.trim().length > 0;
      case 1: return species !== "" && (species !== "__other" || customSpecies.trim().length > 0);
      case 2: return klass !== "" && (level < (cls?.subclass_level ?? 3) || subclass === "" || subclass !== "__other" || customSub.trim().length > 0);
      case 3: return background !== "" && (background !== "__other" || customBg.trim().length > 0) && (!bg || bonusMode === "111" || (bonusPlus2 !== "" && bonusPlus1 !== "" && bonusPlus2 !== bonusPlus1));
      case 4: return method !== "pointbuy" || pointsSpent <= (opts?.point_buy_budget ?? 27);
      case 5: return classSkillPicks.length === skillPicksAllowed && (!speciesRow?.bonus_origin_feat || originFeat !== "") && (!cls?.kits.length || kit !== "");
      default: return true;
    }
  }

  async function submit() {
    if (!campaignId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ pc_id: string; warnings: string[] }>(`/play/join/${campaignId}/characters`, {
        character_name: characterName.trim(),
        player_name: playerName.trim(),
        species: speciesName,
        character_class: klass,
        subclass: level >= (cls?.subclass_level ?? 3) && subclassName ? subclassName : null,
        background: bgName,
        level,
        scores,
        score_method: method,
        background_bonus: bonus,
        skills,
        origin_feat: originFeat || null,
        cantrips,
        spells,
        kit: kit || null,
        appearance: appearance.trim() || null,
      });
      try {
        localStorage.setItem(`qj-pick-${campaignId}`, res.pc_id);
      } catch {
        /* fine */
      }
      navigate(`/play/${res.pc_id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="cc"><style>{CSS}</style><div className="cc-inner"><h1>Can&rsquo;t open the creator</h1><p className="err">{loadError}</p></div></div>
    );
  }
  if (!opts) {
    return <div className="cc"><style>{CSS}</style><div className="cc-inner"><p className="sub">Opening the compendium…</p></div></div>;
  }

  return (
    <div className="cc">
      <style>{CSS}</style>
      <div className="cc-inner">
        <h1>{opts.campaign_name}</h1>
        <p className="sub">Create your character — {STEPS[step]} ({step + 1} of {STEPS.length})</p>
        <div className="steps">{STEPS.map((_, i) => <i key={i} className={i <= step ? "on" : ""} />)}</div>

        {step === 0 && (
          <>
            <h2>Who are you?</h2>
            <label htmlFor="cname">Character name</label>
            <input id="cname" type="text" value={characterName} onChange={(e) => setCharacterName(e.target.value)} placeholder="Bram Oakhelm" autoFocus />
            <label htmlFor="pname">Your name (the player)</label>
            <input id="pname" type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="What the table calls you" />
            <label htmlFor="lvl">Starting level</label>
            <select id="lvl" value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((l) => <option key={l} value={l}>Level {l}</option>)}
            </select>
            <p className="note">Ask your DM what level the table starts at. Most start at 1 or 3.</p>
          </>
        )}

        {step === 1 && (
          <>
            <h2>Species</h2>
            <div className="cards">
              {opts.species.map((s) => (
                <button key={s.name} className={`card ${species === s.name ? "on" : ""}`} onClick={() => setSpecies(s.name)}>
                  <b>{s.name}</b><small>{s.size} · {s.speed} ft.</small>
                </button>
              ))}
              <button className={`card ${species === "__other" ? "on" : ""}`} onClick={() => setSpecies("__other")}>
                <b>From my book…</b><small>Any species your DM allows. You track its traits.</small>
              </button>
            </div>
            {species === "__other" && (
              <>
                <label htmlFor="cspecies">Species name</label>
                <input id="cspecies" type="text" value={customSpecies} onChange={(e) => setCustomSpecies(e.target.value)} placeholder="e.g. Aasimar" />
              </>
            )}
            {speciesRow && <ul className="traits">{speciesRow.traits.map((t) => <li key={t}>{t}</li>)}</ul>}
          </>
        )}

        {step === 2 && (
          <>
            <h2>Class</h2>
            <div className="cards">
              {Object.entries(opts.classes).map(([name, c]) => (
                <button key={name} className={`card ${klass === name ? "on" : ""}`} onClick={() => { setKlass(name); setSubclass(""); setSkills([]); setKit(c.kits[0]?.name ?? ""); setCantrips([]); setSpells([]); }}>
                  <b>{name}</b><small>d{c.hit_die} · {c.primary.join("/")} · saves {c.saves.join(", ")}{c.spellcasting ? " · caster" : ""}</small>
                </button>
              ))}
            </div>
            {cls && level >= cls.subclass_level && (
              <>
                <label>Subclass (level {cls.subclass_level}+)</label>
                <div className="chips">
                  {cls.srd_subclasses.map((s) => (
                    <button key={s} className={`chip ${subclass === s ? "on" : ""}`} onClick={() => setSubclass(s)}>{s}</button>
                  ))}
                  <button className={`chip ${subclass === "__other" ? "on" : ""}`} onClick={() => setSubclass("__other")}>From my book…</button>
                </div>
                {subclass === "__other" && (
                  <input type="text" value={customSub} onChange={(e) => setCustomSub(e.target.value)} placeholder="e.g. Oath of the Ancients" style={{ marginTop: 8 }} />
                )}
                <p className="note">Only the SRD subclass ships with rules text; a subclass from your book is recorded by name and you play it from the book.</p>
              </>
            )}
            {cls && level < cls.subclass_level && <p className="note">Subclass comes at level {cls.subclass_level}.</p>}
          </>
        )}

        {step === 3 && (
          <>
            <h2>Background</h2>
            <div className="cards">
              {opts.backgrounds.map((b) => (
                <button key={b.name} className={`card ${background === b.name ? "on" : ""}`} onClick={() => { setBackground(b.name); setBonusPlus2(""); setBonusPlus1(""); }}>
                  <b>{b.name}</b><small>{b.blurb}</small><small style={{ marginTop: 4 }}>{b.abilities.join(" / ")} · {b.feat} · {b.skills.join(", ")}</small>
                </button>
              ))}
              <button className={`card ${background === "__other" ? "on" : ""}`} onClick={() => setBackground("__other")}>
                <b>From my book…</b><small>Recorded by name; no automatic bonuses.</small>
              </button>
            </div>
            {background === "__other" && (
              <input type="text" value={customBg} onChange={(e) => setCustomBg(e.target.value)} placeholder="Background name" style={{ marginTop: 8 }} />
            )}
            {bg && (
              <>
                <label>Ability bonus from {bg.name}</label>
                <div className="chips" style={{ marginBottom: 8 }}>
                  <button className={`chip ${bonusMode === "21" ? "on" : ""}`} onClick={() => setBonusMode("21")}>+2 and +1</button>
                  <button className={`chip ${bonusMode === "111" ? "on" : ""}`} onClick={() => setBonusMode("111")}>+1 to all three</button>
                </div>
                {bonusMode === "21" && (
                  <div className="chips">
                    {bg.abilities.map((a) => (
                      <button key={a} className={`chip ${bonusPlus2 === a ? "on" : ""}`} onClick={() => { setBonusPlus2(a); if (bonusPlus1 === a) setBonusPlus1(""); }}>+2 {a}</button>
                    ))}
                    <span style={{ width: "100%" }} />
                    {bg.abilities.map((a) => (
                      <button key={a} className={`chip ${bonusPlus1 === a ? "on" : ""}`} disabled={bonusPlus2 === a} onClick={() => setBonusPlus1(a)}>+1 {a}</button>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <h2>Ability scores</h2>
            <div className="chips" style={{ marginBottom: 10 }}>
              <button className={`chip ${method === "standard" ? "on" : ""}`} onClick={() => { setMethod("standard"); setScores({ STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 }); }}>Standard array</button>
              <button className={`chip ${method === "pointbuy" ? "on" : ""}`} onClick={() => { setMethod("pointbuy"); setScores({ STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 }); }}>Point buy</button>
              <button className={`chip ${method === "manual" ? "on" : ""}`} onClick={() => setMethod("manual")}>Rolled / manual</button>
            </div>
            {method === "pointbuy" && <p className="note">{pointsSpent} of {opts.point_buy_budget} points spent.</p>}
            {method === "standard" && <p className="note">Assign 15, 14, 13, 12, 10, 8 — each once. {cls ? `${klass} likes ${cls.primary.join(" or ")}.` : ""}</p>}
            <div className="scores">
              {ABILITIES.map((a) => (
                <div key={a} className="score">
                  <b>{ABILITY_NAMES[a]}</b>
                  <div className="v">{finalScores[a]}</div>
                  <div className="m">{fmt(mod(finalScores[a]))}{bonus[a] ? ` (+${bonus[a]} bg)` : ""}</div>
                  {method === "standard" ? (
                    <select value={scores[a]} onChange={(e) => setScores({ ...scores, [a]: Number(e.target.value) })}>
                      {opts.standard_array.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  ) : (
                    <div className="pm">
                      <button onClick={() => setScores({ ...scores, [a]: Math.max(method === "pointbuy" ? 8 : 3, scores[a] - 1) })}>−</button>
                      <button onClick={() => setScores({ ...scores, [a]: Math.min(method === "pointbuy" ? 15 : 20, scores[a] + 1) })}>+</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {method === "standard" && JSON.stringify(arrayUsed) !== JSON.stringify([...opts.standard_array].sort((x, y) => y - x)) && (
              <p className="err">Each array value must be used exactly once.</p>
            )}
          </>
        )}

        {step === 5 && cls && (
          <>
            <h2>Skills</h2>
            <p className="note">Pick {skillPicksAllowed} from the {klass} list{bg ? `; ${bg.name} already gives ${bg.skills.join(" and ")}.` : "."}</p>
            <div className="chips">
              {Object.keys(opts.skills).map((s) => {
                const fromBg = (bg?.skills ?? []).includes(s);
                const allowed = cls.skills.from.includes(s) || (speciesRow?.bonus_skill_choices ?? 0) > 0;
                const on = skills.includes(s) || fromBg;
                const full = classSkillPicks.length >= skillPicksAllowed && !skills.includes(s);
                return (
                  <button key={s} className={`chip ${on ? "on" : ""}`} disabled={fromBg || !allowed || full}
                    onClick={() => setSkills(on ? skills.filter((x) => x !== s) : [...skills, s])}>
                    {s} <small style={{ opacity: 0.6 }}>{opts.skills[s]}</small>
                  </button>
                );
              })}
            </div>
            {speciesRow?.bonus_origin_feat && (
              <>
                <label>Versatile — your Origin feat</label>
                <div className="chips">
                  {opts.origin_feats.map((f) => (
                    <button key={f.name} className={`chip ${originFeat === f.name ? "on" : ""}`} title={f.blurb} onClick={() => setOriginFeat(f.name)}>{f.name}</button>
                  ))}
                </div>
              </>
            )}
            {cls.kits.length > 0 && (
              <>
                <label>Starting gear</label>
                <div className="cards">
                  {cls.kits.map((k) => (
                    <button key={k.name} className={`card ${kit === k.name ? "on" : ""}`} onClick={() => setKit(k.name)}>
                      <b>{k.name}</b><small>{[...k.items, k.armor, k.shield ? "Shield" : null].filter(Boolean).join(", ")}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {step === 6 && (
          <>
            <h2>Spells</h2>
            {!cls?.spellcasting ? (
              <p className="note">{klass} doesn&rsquo;t cast spells{cls ? "" : ""} — nothing to pick here.</p>
            ) : (
              <>
                {cantripCap > 0 && (
                  <>
                    <label>Cantrips — {cantrips.length} of {cantripCap}</label>
                    <div className="chips">
                      {classSpells.filter((s) => s.level === 0).map((s) => (
                        <button key={s.name} className={`chip ${cantrips.includes(s.name) ? "on" : ""}`} disabled={!cantrips.includes(s.name) && cantrips.length >= cantripCap}
                          onClick={() => setCantrips(cantrips.includes(s.name) ? cantrips.filter((x) => x !== s.name) : [...cantrips, s.name])}>{s.name}</button>
                      ))}
                    </div>
                  </>
                )}
                <label>Prepared spells — {spells.length} of {spellCap}</label>
                <div className="chips">
                  {classSpells.filter((s) => s.level >= 1).map((s) => (
                    <button key={s.name} className={`chip ${spells.includes(s.name) ? "on" : ""}`} disabled={!spells.includes(s.name) && spells.length >= spellCap}
                      onClick={() => setSpells(spells.includes(s.name) ? spells.filter((x) => x !== s.name) : [...spells, s.name])}>{s.name} <small style={{ opacity: 0.6 }}>L{s.level}</small></button>
                  ))}
                </div>
                <p className="note">You can change prepared spells any time from your sheet.</p>
              </>
            )}
          </>
        )}

        {step === 7 && (
          <>
            <h2>Review</h2>
            <div className="summary">
              <div><span>Name</span><span>{characterName}</span></div>
              <div><span>Species</span><span>{speciesName}</span></div>
              <div><span>Class</span><span>{klass}{subclassName && level >= (cls?.subclass_level ?? 3) ? ` · ${subclassName}` : ""} · L{level}</span></div>
              <div><span>Background</span><span>{bgName}</span></div>
              <div><span>Scores</span><span>{ABILITIES.map((a) => `${a} ${finalScores[a]}`).join(" · ")}</span></div>
              <div><span>Skills</span><span>{[...new Set([...(bg?.skills ?? []), ...skills])].join(", ") || "—"}</span></div>
              {preview && <div><span>HP / AC</span><span>{preview.hp} / {preview.ac}</span></div>}
              {cls?.spellcasting && <div><span>Spells</span><span>{[...cantrips, ...spells].join(", ") || "—"}</span></div>}
            </div>
            <label htmlFor="look">How you look (optional — the forge paints from this)</label>
            <textarea id="look" rows={3} value={appearance} onChange={(e) => setAppearance(e.target.value)} placeholder="Scarred, grey braids, a dented breastplate and a green cloak" />
            {error && <p className="err">{error}</p>}
          </>
        )}
      </div>

      <div className="nav">
        <button className="btn" onClick={() => (step === 0 ? navigate(`/join/${campaignId}`) : setStep(step - 1))} disabled={busy}>
          {step === 0 ? "Back" : "Previous"}
        </button>
        {step < STEPS.length - 1 ? (
          <button className="btn primary" onClick={() => setStep(step + 1)} disabled={!canNext()}>Next</button>
        ) : (
          <button className="btn primary" onClick={() => void submit()} disabled={busy}>{busy ? "Creating…" : "Create & open my sheet"}</button>
        )}
      </div>
    </div>
  );
}
