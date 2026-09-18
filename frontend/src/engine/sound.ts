/**
 * The table's sounds (Plan 113, the Friday push): a whoosh for a swing, a
 * thud when it lands, a shimmer for a cast and a pop where the bolt bursts,
 * a chime for a heal, a boom for a knockout, a tick when the turn moves.
 *
 * Every sound is synthesised on the spot from oscillators and filtered noise
 * — no files, nothing licensed, nothing generated elsewhere. Browsers refuse
 * audio until the page has been touched, so `unlock()` runs on the first
 * pointer or key event and until then `play` is silent.
 */
export type Sfx = "whoosh" | "hit" | "cast" | "burst" | "twang" | "heal" | "ko" | "turn";

const KEY = "ql.engine.sound";
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = (() => {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
})();

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  const seconds = 1.5;
  noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Call from a user gesture: browsers keep audio silent until one. */
export function unlock(): void {
  const c = ensure();
  if (c && c.state === "suspended") void c.resume();
}

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* a private window forgets; fine */
  }
  if (on) unlock();
}

function noise(c: AudioContext, out: AudioNode, t0: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number, attack = 0.005) {
  if (!noiseBuf) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filt = c.createBiquadFilter();
  filt.type = type;
  filt.Q.value = q;
  filt.frequency.setValueAtTime(f0, t0);
  filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt).connect(g).connect(out);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

function tone(c: AudioContext, out: AudioNode, t0: number, dur: number, type: OscillatorType, f0: number, f1: number, peak: number, attack = 0.01) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** Play a sound now (or `delayMs` from now). Silent until unlocked, or when sound is off. */
export function play(name: Sfx, delayMs = 0): void {
  if (!enabled) return;
  const c = ensure();
  if (!c || !master || c.state !== "running") return;
  const t = c.currentTime + Math.max(0, delayMs) / 1000;
  const out = master;
  switch (name) {
    case "whoosh":
      noise(c, out, t, 0.28, "bandpass", 300, 1400, 1.2, 0.5, 0.06);
      break;
    case "hit":
      noise(c, out, t, 0.09, "lowpass", 900, 200, 0.7, 0.9);
      tone(c, out, t, 0.16, "sine", 95, 40, 0.7);
      break;
    case "twang":
      tone(c, out, t, 0.14, "triangle", 260, 180, 0.35, 0.003);
      noise(c, out, t, 0.08, "bandpass", 1800, 900, 2, 0.35);
      break;
    case "cast":
      tone(c, out, t, 0.36, "sine", 520, 1180, 0.28, 0.04);
      tone(c, out, t + 0.05, 0.3, "sine", 780, 1560, 0.16, 0.04);
      noise(c, out, t + 0.02, 0.32, "highpass", 2200, 5000, 0.8, 0.12, 0.08);
      break;
    case "burst":
      noise(c, out, t, 0.22, "bandpass", 1200, 250, 0.9, 0.7);
      tone(c, out, t, 0.2, "sine", 220, 70, 0.4);
      break;
    case "heal":
      for (const [i, f] of [523, 659, 784].entries()) tone(c, out, t + i * 0.09, 0.55, "sine", f, f, 0.16, 0.02);
      noise(c, out, t, 0.5, "highpass", 3000, 6000, 0.8, 0.05, 0.1);
      break;
    case "ko":
      tone(c, out, t, 0.7, "sine", 70, 28, 0.9, 0.01);
      noise(c, out, t, 0.35, "lowpass", 400, 60, 0.7, 0.6);
      break;
    case "turn":
      tone(c, out, t, 0.07, "triangle", 880, 880, 0.12, 0.004);
      break;
  }
}
