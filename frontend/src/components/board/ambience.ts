import { useCallback, useEffect, useRef } from "react";

/**
 * ambience — procedural WebAudio soundscape for the 3D views (Plan 46).
 *
 * Everything is synthesized (noise buffers + oscillators): wind always,
 * birdsong by day, crickets by night, rain patter with the rain weather,
 * fire crackle when torches burn. No audio assets, no licensing, no
 * loading. Must be started from a user gesture (browser autoplay policy).
 */

export interface AmbienceParams {
  darkness: number; // 0..1 (0 = fey midday)
  weather: string; // WeatherKind
  torches: number; // count of burning light tokens
}

function noiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buf;
}

interface Layer {
  gain: GainNode;
  nodes: AudioNode[];
}

export class AmbienceEngine {
  private ctx: AudioContext | null = null;

  private master: GainNode | null = null;

  private layers = new Map<string, Layer>();

  private timer: number | undefined;

  private params: AmbienceParams = { darkness: 0, weather: "none", torches: 0 };

  private volume = 0.7;

  start(): void {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.volume;
    master.connect(ctx.destination);
    this.master = master;

    const noise = noiseBuffer(ctx);

    // ── wind: looped noise → wandering lowpass ──────────────────────────
    {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 380;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.09;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 160;
      lfo.connect(lfoGain).connect(lp.frequency);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(lp).connect(gain).connect(master);
      src.start();
      lfo.start();
      this.layers.set("wind", { gain, nodes: [src, lp, lfo, lfoGain] });
    }

    // ── rain: looped noise → bandpass patter ────────────────────────────
    {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1900;
      bp.Q.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(bp).connect(gain).connect(master);
      src.start();
      this.layers.set("rain", { gain, nodes: [src, bp] });
    }

    // ── fire bed: looped noise → warm lowpass (crackles ride on top) ────
    {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 650;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(lp).connect(gain).connect(master);
      src.start();
      this.layers.set("fire", { gain, nodes: [src, lp] });
    }

    // Event scheduler: birds, crickets, crackles.
    this.timer = window.setInterval(() => this.tick(), 260);
    this.apply();
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = undefined;
    this.layers.clear();
    this.master = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
    }
  }

  update(params: AmbienceParams): void {
    this.params = params;
    this.apply();
  }

  private setLayer(name: string, target: number): void {
    const layer = this.layers.get(name);
    if (layer && this.ctx) {
      layer.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 1.2);
    }
  }

  private apply(): void {
    if (!this.ctx) return;
    const { darkness, weather, torches } = this.params;
    const precip = weather === "rain" || weather === "snow";
    this.setLayer("wind", 0.05 - darkness * 0.02 + (precip ? 0.02 : 0));
    this.setLayer("rain", weather === "rain" ? 0.085 : 0);
    this.setLayer("fire", torches > 0 || weather === "embers" ? 0.05 : 0);
  }

  /** DM soundboard one-shots, broadcast over the FX channel (Plan 46). */
  stinger(kind: string): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    if (kind === "howl") {
      // A wolf: two detuned sines gliding up then down, with slow vibrato.
      for (const detune of [0, 6]) {
        const osc = ctx.createOscillator();
        osc.detune.value = detune;
        osc.frequency.setValueAtTime(310, t);
        osc.frequency.exponentialRampToValueAtTime(720, t + 0.7);
        osc.frequency.exponentialRampToValueAtTime(560, t + 1.5);
        osc.frequency.exponentialRampToValueAtTime(330, t + 2.3);
        const vib = ctx.createOscillator();
        vib.frequency.value = 5.2;
        const vibGain = ctx.createGain();
        vibGain.gain.value = 9;
        vib.connect(vibGain).connect(osc.frequency);
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 1400;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.09, t + 0.35);
        g.gain.setValueAtTime(0.09, t + 1.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
        osc.connect(lp).connect(g).connect(master);
        osc.start(t);
        vib.start(t);
        osc.stop(t + 2.6);
        vib.stop(t + 2.6);
      }
    } else if (kind === "thunder") {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, 3);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(220, t);
      lp.frequency.exponentialRampToValueAtTime(70, t + 2.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.09);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.9);
      g.gain.exponentialRampToValueAtTime(0.28, t + 1.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      src.connect(lp).connect(g).connect(master);
      src.start(t);
    } else if (kind === "sting") {
      // A dramatic low hit: detuned saws + a noise thump.
      for (const [freq, detune] of [
        [82.4, 0],
        [82.4, -12],
        [164.8, 7],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = freq;
        osc.detune.value = detune;
        osc.frequency.exponentialRampToValueAtTime(freq * 0.94, t + 1.4);
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(900, t);
        lp.frequency.exponentialRampToValueAtTime(180, t + 1.4);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.09, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        osc.connect(lp).connect(g).connect(master);
        osc.start(t);
        osc.stop(t + 1.6);
      }
      const thump = ctx.createBufferSource();
      thump.buffer = noiseBuffer(ctx, 0.25);
      const tlp = ctx.createBiquadFilter();
      tlp.type = "lowpass";
      tlp.frequency.value = 160;
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.4, t);
      tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      thump.connect(tlp).connect(tg).connect(master);
      thump.start(t);
    }
  }

  /** Probabilistic one-shot events, scheduled against the audio clock. */
  private tick(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const { darkness, weather, torches } = this.params;
    const t = ctx.currentTime;

    // birdsong — bright fey daytime, not in rain/snow
    if (darkness < 0.35 && weather !== "rain" && weather !== "snow" && Math.random() < 0.09) {
      const chirps = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < chirps; i += 1) {
        const start = t + i * (0.13 + Math.random() * 0.1);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const f0 = 2400 + Math.random() * 1800;
        osc.frequency.setValueAtTime(f0, start);
        osc.frequency.exponentialRampToValueAtTime(f0 * (0.7 + Math.random() * 0.2), start + 0.09);
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(0.028, start + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
        osc.connect(g).connect(master);
        osc.start(start);
        osc.stop(start + 0.16);
      }
    }

    // crickets — night pulse-trains
    if (darkness > 0.55 && weather !== "rain" && Math.random() < 0.16) {
      const osc = ctx.createOscillator();
      osc.frequency.value = 4100 + Math.random() * 500;
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g).connect(master);
      const pulses = 6 + Math.floor(Math.random() * 6);
      for (let i = 0; i < pulses; i += 1) {
        const p = t + i * 0.055;
        g.gain.setValueAtTime(0.014, p);
        g.gain.setValueAtTime(0, p + 0.03);
      }
      osc.start(t);
      osc.stop(t + pulses * 0.055 + 0.05);
    }

    // fire crackles — riding above the fire bed
    if ((torches > 0 || weather === "embers") && Math.random() < 0.5) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, 0.06);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1400 + Math.random() * 1800;
      const g = ctx.createGain();
      const start = t + Math.random() * 0.2;
      g.gain.setValueAtTime(0.03 + Math.random() * 0.05, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.05 + Math.random() * 0.06);
      src.connect(hp).connect(g).connect(master);
      src.start(start);
    }
  }
}

/** Mount/unmount + retune the ambience engine from component state.
 * Returns a stinger trigger for broadcast soundboard events. */
export function useAmbience(
  enabled: boolean,
  volume: number,
  params: AmbienceParams,
): (kind: string) => void {
  const engine = useRef<AmbienceEngine | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const e = new AmbienceEngine();
    engine.current = e;
    e.start();
    return () => {
      e.stop();
      engine.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    engine.current?.setVolume(volume);
  }, [volume, enabled]);

  const { darkness, weather, torches } = params;
  useEffect(() => {
    engine.current?.update({ darkness, weather, torches });
  }, [darkness, weather, torches, enabled]);

  return useCallback((kind: string) => {
    engine.current?.stinger(kind);
  }, []);
}
