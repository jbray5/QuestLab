// Web Audio synthesized sound effects (Plan 00030).
//
// No audio files — everything is generated via AudioContext. Cheap,
// licensing-free, works offline, and zero bundle weight. The sounds are
// gated by the user's persisted "soundEnabled" preference (see
// useDicePrefs); when off, every function below is a no-op.

let _ctx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (_ctx) return _ctx;
  try {
    // Safari needs the prefixed constructor on older versions.
    const Ctor = (window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) return null;
    _ctx = new Ctor();
    return _ctx;
  } catch {
    return null;
  }
}

/** Some browsers (iOS Safari) suspend the context until a user gesture. */
function unlock(c: AudioContext): void {
  if (c.state === "suspended") {
    void c.resume();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Brief dice-clatter sound — a short noise burst with envelope plus a
 * couple of attenuated "tick" hits to suggest die faces bouncing.
 */
export function playDiceClatter(): void {
  const c = ctx();
  if (!c) return;
  unlock(c);

  const duration = 0.35;
  const now = c.currentTime;

  // Noise buffer
  const buffer = c.createBuffer(1, c.sampleRate * duration, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    // White noise with a quick exponential decay envelope.
    const t = i / data.length;
    data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 6);
  }

  const source = c.createBufferSource();
  source.buffer = buffer;

  // Highpass to suggest hard surface contact (less rumble, more clack).
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1500;

  // Gentle bandpass peak around 4kHz for the "tick" character.
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 4000;
  bp.Q.value = 0.6;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.42, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(hp);
  hp.connect(bp);
  bp.connect(gain);
  gain.connect(c.destination);
  source.start(now);
  source.stop(now + duration + 0.02);

  // Three quick "tick" oscillators on top of the noise — these are what
  // sells it as dice landing rather than just static.
  [0.04, 0.14, 0.23].forEach((delay, i) => {
    const osc = c.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(2200 - i * 250, now + delay);
    const tickGain = c.createGain();
    tickGain.gain.setValueAtTime(0, now + delay);
    tickGain.gain.linearRampToValueAtTime(0.12, now + delay + 0.005);
    tickGain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.08);
    osc.connect(tickGain);
    tickGain.connect(c.destination);
    osc.start(now + delay);
    osc.stop(now + delay + 0.1);
  });
}

/**
 * Triumphant fanfare — a quick ascending major-chord arpeggio. Used on
 * natural 20 rolls in the RollHelper.
 */
export function playCritFanfare(): void {
  const c = ctx();
  if (!c) return;
  unlock(c);

  const now = c.currentTime;
  // C5 → E5 → G5 → C6 (a quick triumphant arpeggio)
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    const t = now + i * 0.08;
    const osc = c.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;

    const gain = c.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.28, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}

/**
 * Low descending tone — sad horn — for nat 1 / crit miss flavor.
 */
export function playFumbleTrombone(): void {
  const c = ctx();
  if (!c) return;
  unlock(c);

  const now = c.currentTime;
  const osc = c.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.linearRampToValueAtTime(70, now + 0.55);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.22, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;

  osc.connect(lp);
  lp.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.7);
}
