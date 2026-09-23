import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { findBone, useFigure } from "./figureModel";
import type { Adornment } from "./adorn";
import { DEFAULT_HEIGHT_FT } from "./heights";
import { useQuality } from "./quality";
import { TIMING } from "./strikes";

/**
 * A character who walks to the cell it is told (Plan 108; instanced for a
 * whole table in Plan 109; any model in Plan 111).
 *
 * The rule every model obeys: a move is a *walk* — a turn to face the way, a
 * walk cycle while under way (a run, when it is far), a settle into idle on
 * arrival. A hit is a stagger — the rig's hit clip when it has one, a recoil
 * when it has not. Going down is a fall — the death clip, or a topple. The
 * model is whatever the token carries; the Soldier when it carries nothing.
 *
 * Under the feet: a ring in the side's colour, brighter and breathing when it
 * is this figure's turn, grey when it is down. Over the head: the name.
 */
export interface FigureModel {
  url: string | null;
  /** How tall the figure stands, in feet; the model is scaled to it. */
  heightFt?: number | null;
}

/** A strike the figure is told to play (Plan 113). */
export interface Strike {
  id: string;
  kind: "melee" | "shoot" | "cast";
  /** Where the target stands. */
  toward: THREE.Vector3;
  /** When it started (performance.now). */
  at: number;
  /** Debug: hold the pose at this phase (0–1) instead of playing it through. */
  hold?: number;
}

const STRIKE_MS: Record<Strike["kind"], number> = { melee: 730, shoot: 520, cast: 760 };
/** When a packed strike clip lands its blow, in its own seconds (measured: Sword_Attack, Spell_Simple_Shoot, Pistol_Shoot). */
const CLIP_CONTACT_S: Record<Strike["kind"], number> = { melee: 0.4, cast: 0.1, shoot: 0.03 };
const TRAIL_N = 14;
const TRAIL_MS = 110;
const BLADE = 0.58;
const _hand = new THREE.Vector3();
const _fore = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _pw = new THREE.Quaternion();
const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _hp = new THREE.Vector3();
const _hq = new THREE.Quaternion();
const _gq = new THREE.Quaternion();
type Bent = { bone: THREE.Object3D; q: THREE.Quaternion };
/** Turn a bone about a world axis, on top of whatever the clip put there this frame. */
function bend(bone: THREE.Object3D | null, axis: THREE.Vector3, angle: number, bent: Bent[]) {
  if (!bone || !bone.parent || Math.abs(angle) < 1e-4) return;
  bent.push({ bone, q: bone.quaternion.clone() });
  bone.parent.getWorldQuaternion(_pw);
  _q.setFromAxisAngle(axis, angle);
  const inv = _pw.clone().invert();
  bone.quaternion.premultiply(inv.multiply(_q).multiply(_pw));
}

const WALK = 1.5; // units per second — a brisk walk
const RUN = 3.4;
const RUN_FROM = 3.5; // cells: farther than this, and the figure runs if it can
const TOPPLE_S = 0.55;

type Mode = "idle" | "walk" | "run" | "hit" | "death" | "slash" | "cast" | "shoot" | "sit";
/** One-shot clips that return to standing when they end. */
const ONE_SHOT: Mode[] = ["hit", "slash", "cast", "shoot"];

export function Walker({
  cell,
  tint = "#d6af36",
  active = false,
  down = false,
  size = 1,
  label,
  hit,
  hitAt,
  hitFrom,
  strike = null,
  model = null,
  attention = null,
  still = false,
  phase = 0,
  facing = 0,
  ring: showRing = true,
  adorn = null,
  rest = "idle",
}: {
  /** Where this figure should be. Changing it makes the figure walk there. */
  cell: THREE.Vector3;
  tint?: string;
  active?: boolean;
  down?: boolean;
  /** In grid squares — a Large creature is 2. Sets the ring, not the height. */
  size?: number;
  label?: string;
  /** Changes when this figure takes damage; it flinches. */
  hit?: string;
  /** When that blow lands (performance.now) — the flinch waits for it. */
  hitAt?: number;
  /** Where it came from — the figure turns to face its attacker as it lands. */
  hitFrom?: THREE.Vector3 | null;
  /** A strike to play: face the target, swing or cast. */
  strike?: Strike | null;
  model?: FigureModel | null;
  /** Where the action is — the head turns toward it, as people do. */
  attention?: THREE.Vector3 | null;
  /** A resident: holds a pose (the mixer settles a clip, then stops) whatever the quality mode. */
  still?: boolean;
  /** Seconds into the idle at the start, so a crowd does not breathe in step. */
  phase?: number;
  /** Initial facing, radians about up; 0 faces +z (down the picture). */
  facing?: number;
  /** The ring under the feet — off for a resident. */
  ring?: boolean;
  /** A crown, a pair of ears: worn on the head bone. */
  adorn?: Adornment | null;
  /** The clip to rest in when there is nothing to do: standing, or seated. */
  rest?: "idle" | "sit";
}) {
  const fig = useFigure(model?.url ?? null, model?.heightFt ?? DEFAULT_HEIGHT_FT);
  const group = useRef<THREE.Group>(null);
  const pose = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  // The mixer drives the cloned body; its actions live in a ref so the
  // one-shot settings (loop, clamp, time) can be written as they change.
  const mixer = useMemo(() => new THREE.AnimationMixer(fig.body), [fig.body]);
  const actions = useRef<Partial<Record<Mode, THREE.AnimationAction>>>({});

  const mode = useRef<Mode>("idle");
  const current = useRef<THREE.AnimationAction | null>(null);
  const pos = useRef(new THREE.Vector3(cell.x, 0, cell.z));
  const yaw = useRef(facing);
  const flinch = useRef<{ t: number } | null>(null);
  const lastHit = useRef<string | undefined>(undefined);
  const pendingHit = useRef<{ at: number; from: THREE.Vector3 | null } | null>(null);
  const faceTo = useRef<{ x: number; z: number; until: number } | null>(null);
  const swing = useRef<{ kind: Strike["kind"]; toward: THREE.Vector3; t0: number; hold?: number; clip?: boolean; clipAt?: number; clipScale?: number } | null>(null);
  const lastStrike = useRef<string | undefined>(undefined);
  const bent = useRef<Bent[]>([]);
  const bones = useMemo(
    () => ({
      ra: findBone(fig.body, "rightarm"),
      rf: findBone(fig.body, "rightforearm"),
      la: findBone(fig.body, "leftarm"),
      lf: findBone(fig.body, "leftforearm"),
      head: findBone(fig.body, "head"),
      neck: findBone(fig.body, "neck"),
      rh: findBone(fig.body, "righthand"),
      lul: findBone(fig.body, "leftupleg"),
      rul: findBone(fig.body, "rightupleg"),
      ll: findBone(fig.body, "leftleg"),
      rl: findBone(fig.body, "rightleg"),
    }),
    [fig.body],
  );
  // The weapon trail: the last few places the hand and the blade's tip were, as a ribbon that fades in a tenth of a second.
  const trailMesh = useRef<THREE.Mesh>(null);
  const trailGeom = useRef<THREE.BufferGeometry>(null);
  const trailPts = useRef<{ a: THREE.Vector3; b: THREE.Vector3; t: number }[]>([]);
  const trailBuffers = useMemo(() => {
    const idx = new Uint16Array((TRAIL_N - 1) * 6);
    for (let i = 0; i < TRAIL_N - 1; i++) {
      const o = i * 2;
      idx.set([o, o + 1, o + 2, o + 1, o + 3, o + 2], i * 6);
    }
    return { pos: new Float32Array(TRAIL_N * 6), col: new Float32Array(TRAIL_N * 6), idx };
  }, []);
  const gaze = useRef(0);
  // The adornment rides the head: each frame it takes the head bone's world pose, in this group's space.
  const adornRef = useRef<THREE.Group>(null);
  // Fast mode: a figure with nothing to do holds its pose — a game piece until it is its turn.
  // The mixer still runs for a moment after any clip starts, so the pose it holds is the clip's, not the rig's rest.
  const { fast } = useQuality();
  const settledAt = useRef(0);
  /** 0 standing, 1 on the floor — the topple, when there is no death clip. */
  const fallen = useRef(down ? 1 : 0);
  const firstDown = useRef(down);

  /** Crossfade to a clip; a one-shot clip holds its last frame when `clamp`. Reads only refs, so it is stable. */
  const play = useCallback((name: Mode, fade = 0.2, once = false, clamp = false, fromEnd = false) => {
    const next = actions.current[name];
    if (!next) return false;
    if (current.current && current.current !== next) current.current.fadeOut(fade);
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = clamp;
    next.fadeIn(fade).play();
    if (fromEnd) next.time = next.getClip().duration;
    current.current = next;
    mode.current = name;
    settledAt.current = performance.now() + 1500;
    return true;
  }, []);

  // The rig arrived (or changed): build its actions; stand idle, or lie where it fell.
  useEffect(() => {
    const built: Partial<Record<Mode, THREE.AnimationAction>> = {};
    for (const clip of fig.clips) built[clip.name as Mode] = mixer.clipAction(clip);
    actions.current = built;
    current.current = null;
    if (down && built.death) play("death", 0, true, true, firstDown.current);
    else if (!play(rest, 0)) play("idle", 0);
    if (phase && built[rest]) built[rest]!.time = phase;
    firstDown.current = false;
    return () => {
      mixer.stopAllAction();
      for (const clip of fig.clips) mixer.uncacheClip(clip);
      actions.current = {};
    };
  }, [mixer, fig.clips, down, play, phase, rest]);

  // A hit clip plays once and returns to standing.
  useEffect(() => {
    const onDone = (e: { action: THREE.AnimationAction }) => {
      const m = mode.current;
      if (!ONE_SHOT.includes(m) || e.action !== actions.current[m]) return;
      if (!play(rest, 0.2)) play("idle", 0.2);
    };
    mixer.addEventListener("finished", onDone);
    return () => mixer.removeEventListener("finished", onDone);
  }, [mixer, play, rest]);

  // A hit is queued for the moment the blow lands (the bolt's arrival); a strike starts at once.
  useEffect(() => {
    if (hit && hit !== lastHit.current) {
      lastHit.current = hit;
      pendingHit.current = { at: hitAt ?? performance.now(), from: hitFrom ? hitFrom.clone() : null };
    }
  }, [hit, hitAt, hitFrom]);
  useEffect(() => {
    if (strike && strike.id !== lastStrike.current) {
      lastStrike.current = strike.id;
      swing.current = { kind: strike.kind, toward: strike.toward.clone(), t0: strike.at, hold: strike.hold };
      // A real clip for this strike (Mixamo, via pack.mjs --anim slash|cast|shoot) plays instead of the built swing.
      const clip = strike.kind === "melee" ? "slash" : strike.kind;
      if (!down && actions.current[clip] && strike.hold === undefined) {
        // The clip's own contact moment is lined up with the strike's clock: started late when the
        // clip lands early, run faster when it lands late — so the blow falls when the table says.
        const want = (strike.kind === "melee" ? TIMING.melee.impact : TIMING[strike.kind].launch) / 1000;
        const contact = CLIP_CONTACT_S[strike.kind];
        swing.current.clip = true;
        swing.current.clipAt = strike.at + Math.max(0, want - contact) * 1000;
        swing.current.clipScale = contact > want ? contact / want : 1;
      }
    }
  }, [strike, down, play]);

  useFrame((_, dt) => {
    // Undo last frame's strike bends before the clip writes this frame's pose.
    for (const b of bent.current) b.bone.quaternion.copy(b.q);
    bent.current.length = 0;
    const g = group.current;
    const p = pos.current;
    if (!g) return;
    const busy = active || down || mode.current !== rest || !!swing.current || !!pendingHit.current || !!flinch.current || Math.hypot(cell.x - p.x, cell.z - p.z) > 0.08;
    if (!(fast || still) || busy || performance.now() < settledAt.current) mixer.update(dt);
    if (pendingHit.current && performance.now() >= pendingHit.current.at) {
      const from = pendingHit.current.from;
      pendingHit.current = null;
      if (!down && actions.current.hit) play("hit", 0.08, true);
      else flinch.current = { t: 0 };
      if (from) faceTo.current = { x: from.x, z: from.z, until: performance.now() + 700 };
    }
    const dx = cell.x - p.x;
    const dz = cell.z - p.z;
    const dist = Math.hypot(dx, dz);
    const moving = mode.current === "walk" || mode.current === "run";
    if (dist > 0.08 && !down) {
      if (!moving && !ONE_SHOT.includes(mode.current)) {
        if (!(dist > RUN_FROM && play("run", 0.2))) play("walk", 0.2);
      }
      const speed = mode.current === "run" ? RUN : WALK;
      const step = Math.min(dist, speed * dt);
      p.x += (dx / dist) * step;
      p.z += (dz / dist) * step;
      const want = Math.atan2(dx, dz);
      let d = want - yaw.current;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw.current += d * Math.min(1, dt * 10);
    } else if (moving) {
      if (!play(rest, 0.25)) play("idle", 0.25);
    }
    g.position.copy(p);
    g.rotation.y = yaw.current - fig.forwardYaw;

    // Attention: the head turns toward the action, up to a comfortable angle, and eases back.
    {
      let wantGaze = 0;
      if (attention && !down && dist <= 0.08 && !swing.current) {
        const ax = attention.x - p.x;
        const az = attention.z - p.z;
        if (Math.hypot(ax, az) > 0.4) {
          let dy = Math.atan2(ax, az) - yaw.current;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          wantGaze = Math.max(-1.0, Math.min(1.0, dy));
        }
      }
      gaze.current += (wantGaze - gaze.current) * Math.min(1, dt * 3);
      if (Math.abs(gaze.current) > 0.01) {
        bend(bones.neck, _up, gaze.current * 0.35, bent.current);
        bend(bones.head, _up, gaze.current * 0.65, bent.current);
      }
    }
    // Struck: turn to face whoever did it (while standing still).
    const ft = faceTo.current;
    if (ft && !down && dist <= 0.08) {
      const want = Math.atan2(ft.x - p.x, ft.z - p.z);
      let dy = want - yaw.current;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw.current += dy * Math.min(1, dt * 10);
      g.rotation.y = yaw.current - fig.forwardYaw;
      if (performance.now() > ft.until) faceTo.current = null;
    }
    // Plan 113 — the strike: face the target; lunge and chop for a blow, raise the arms for a bolt.
    const s = swing.current;
    let lean = 0;
    if (s && !down) {
      if (s.clip && s.clipAt !== undefined && performance.now() >= s.clipAt) {
        const name = s.kind === "melee" ? "slash" : s.kind;
        play(name, 0.08, true);
        const a = actions.current[name];
        if (a) a.timeScale = s.clipScale ?? 1;
        s.clipAt = undefined;
      }
      const k = s.hold ?? Math.min(1, (performance.now() - s.t0) / STRIKE_MS[s.kind]);
      const want = Math.atan2(s.toward.x - p.x, s.toward.z - p.z);
      let dy = want - yaw.current;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw.current += dy * Math.min(1, dt * 14);
      g.rotation.y = yaw.current - fig.forwardYaw;
      // The figure's right-hand axis in the world: arms swing about it.
      _axis.set(-Math.cos(yaw.current), 0, Math.sin(yaw.current));
      if (s.clip) {
        // The clip carries the body; the walker only keeps the figure facing its target.
      } else if (s.kind === "melee") {
        const reach = Math.sin(Math.min(1, k / 0.6) * Math.PI) * 0.3;
        g.position.x += Math.sin(yaw.current) * reach;
        g.position.z += Math.cos(yaw.current) * reach;
        lean = 0.14 * Math.sin(k * Math.PI);
        // Wind up over the head (2.5 rad forward-up is past vertical), chop through to waist height, settle.
        const a = k < 0.3 ? (k / 0.3) * 2.5 : k < 0.55 ? 2.5 - ((k - 0.3) / 0.25) * 2.0 : 0.5 - ((k - 0.55) / 0.45) * 0.5;
        bend(bones.ra, _axis, a, bent.current);
        bend(bones.rf, _axis, Math.max(0, a) * 0.45, bent.current);
      } else {
        const raise = k < 0.22 ? k / 0.22 : k > 0.72 ? Math.max(0, (1 - k) / 0.28) : 1;
        const e = raise * raise * (3 - 2 * raise);
        bend(bones.ra, _axis, 1.4 * e, bent.current);
        bend(bones.rf, _axis, 0.25 * e, bent.current);
        bend(bones.la, _axis, (s.kind === "cast" ? 1.4 : 1.15) * e, bent.current);
        if (s.kind === "cast") bend(bones.lf, _axis, 0.25 * e, bent.current);
      }
      // The blade's path, sampled through the chop.
      if (s.kind === "melee" && k > 0.2 && k < 0.7 && bones.rh && bones.rf) {
        bones.rh.getWorldPosition(_hand);
        bones.rf.getWorldPosition(_fore);
        _tip.copy(_hand).sub(_fore).normalize().multiplyScalar(BLADE).add(_hand);
        g.worldToLocal(_hand);
        g.worldToLocal(_tip);
        trailPts.current.push({ a: _hand.clone(), b: _tip.clone(), t: performance.now() });
        if (trailPts.current.length > TRAIL_N) trailPts.current.shift();
      }
      if (k >= 1 && s.hold === undefined) swing.current = null;
    }
    // Draw the trail from whatever samples are still young.
    {
      const now = performance.now();
      const pts = trailPts.current;
      while (pts.length && now - pts[0].t > TRAIL_MS) pts.shift();
      const tm = trailMesh.current;
      const tg = trailGeom.current;
      if (tm && tg) {
        tm.visible = pts.length >= 2;
        if (tm.visible) {
          const pa = tg.getAttribute("position") as THREE.BufferAttribute;
          const ca = tg.getAttribute("color") as THREE.BufferAttribute;
          for (let i = 0; i < pts.length; i++) {
            const q = pts[i];
            // Faint at the hand, bright only at the tip and only for the newest samples: a swoosh, not a fan.
            const bright = 0.42 * (1 - (now - q.t) / TRAIL_MS) * (0.2 + 0.8 * (i / Math.max(1, pts.length - 1)));
            pa.setXYZ(i * 2, q.a.x, q.a.y, q.a.z);
            pa.setXYZ(i * 2 + 1, q.b.x, q.b.y, q.b.z);
            ca.setXYZ(i * 2, bright * 0.08, bright * 0.08, bright * 0.07);
            ca.setXYZ(i * 2 + 1, bright, bright * 0.95, bright * 0.8);
          }
          pa.needsUpdate = true;
          ca.needsUpdate = true;
          tg.setDrawRange(0, (pts.length - 1) * 6);
        }
      }
    }

    // The topple and the rise, when the rig has no death clip.
    const wantFall = down && !actions.current.death ? 1 : 0;
    if (fallen.current !== wantFall) {
      const k = Math.min(1, dt / TOPPLE_S);
      fallen.current += Math.sign(wantFall - fallen.current) * k;
      fallen.current = Math.min(1, Math.max(0, fallen.current));
    }
    const f = fallen.current;
    const ease = f * f * (3 - 2 * f);
    if (pose.current) {
      pose.current.rotation.x = (-Math.PI / 2) * ease + lean;
      pose.current.rotation.z = 0.22 * ease;
      pose.current.position.y = 0.12 * ease;
    }
    // Going down, the knees give and the legs fold — a body, not a plank.
    if (ease > 0.01 && !actions.current.death) {
      _axis.set(-Math.cos(yaw.current), 0, Math.sin(yaw.current));
      bend(bones.lul, _axis, 0.55 * ease, bent.current);
      bend(bones.rul, _axis, 0.8 * ease, bent.current);
      bend(bones.ll, _axis, -1.1 * ease, bent.current);
      bend(bones.rl, _axis, -0.7 * ease, bent.current);
      bend(bones.la, _axis, 0.5 * ease, bent.current);
      bend(bones.ra, _axis, 0.3 * ease, bent.current);
    }
    // The recoil: a short, sharp lean back and a stagger to standing.
    const fl = flinch.current;
    if (fl) {
      fl.t += dt;
      const k = Math.min(1, fl.t / 0.38);
      const punch = Math.sin(k * Math.PI);
      g.position.y = -0.04 * punch;
      g.rotation.x = -0.18 * punch;
      if (k >= 1) {
        flinch.current = null;
        g.rotation.x = 0;
        g.position.y = 0;
      }
    }
    if (ring.current && active) {
      const t = performance.now() / 1000;
      ring.current.scale.setScalar(1 + 0.08 * Math.sin(t * 4));
    }
    if (adornRef.current && bones.head) {
      const a = adornRef.current;
      bones.head.getWorldPosition(_hp);
      bones.head.getWorldQuaternion(_hq);
      g.worldToLocal(_hp);
      g.getWorldQuaternion(_gq).invert();
      a.position.copy(_hp);
      a.quaternion.copy(_gq).multiply(_hq);
    }
  });

  const ringColor = down ? "#5a5a60" : tint;
  const glow = active ? 3.2 : down ? 0.6 : 1.4;
  const c = new THREE.Color(ringColor).multiplyScalar(glow);
  return (
    <group ref={group}>
      <group ref={pose}>
        <group scale={fig.scale} position={[0, fig.lift, 0]}>
          <primitive object={fig.body} />
        </group>
      </group>
      {adorn && (
        <group ref={adornRef}>
          {adorn === "crown" ? <Crown /> : <Ears />}
        </group>
      )}
      <mesh ref={trailMesh} frustumCulled={false} renderOrder={4} visible={false}>
        <bufferGeometry ref={trailGeom} drawRange={{ start: 0, count: 0 }}>
          <bufferAttribute attach="attributes-position" args={[trailBuffers.pos, 3]} />
          <bufferAttribute attach="attributes-color" args={[trailBuffers.col, 3]} />
          <bufferAttribute attach="index" args={[trailBuffers.idx, 1]} />
        </bufferGeometry>
        <meshBasicMaterial vertexColors transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh ref={ring} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={showRing} renderOrder={2}>
        <ringGeometry args={[0.36 * size, 0.46 * size, 32]} />
        <meshBasicMaterial color={c} toneMapped={false} transparent opacity={active ? 0.95 : 0.7} />
      </mesh>
      {label && (
        <Html position={[0, fig.height + 0.32, 0]} center distanceFactor={7} style={{ pointerEvents: "none" }}>
          <div
            style={{
              font: "600 12px system-ui, sans-serif",
              color: down ? "#9a95a3" : "#f0e6c8",
              background: "rgba(10,8,16,0.72)",
              border: `1px solid ${active ? tint : "rgba(255,255,255,0.14)"}`,
              borderRadius: 8,
              padding: "3px 8px",
              whiteSpace: "nowrap",
              textDecoration: down ? "line-through" : "none",
            }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

/** A queen's circlet: a gold band with five points and a jewel, above the crown of the head. The head bone's +y is up through the skull. */
function Crown() {
  const gold = { color: "#e0b93c", roughness: 0.3, metalness: 0.9 };
  return (
    <group position={[0, 0.085, 0.01]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.092, 0.011, 8, 32]} />
        <meshStandardMaterial {...gold} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.088, 0.032, Math.sin(a) * 0.088]} castShadow>
            <coneGeometry args={[0.014, 0.07, 5]} />
            <meshStandardMaterial {...gold} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.028, 0.092]}>
        <sphereGeometry args={[0.013, 10, 10]} />
        <meshStandardMaterial color="#3fd28a" roughness={0.2} metalness={0.1} emissive="#1a8a4a" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

/** A harengon's ears: two long, slightly parted ears, fur outside and pink within, from the top of the head. */
function Ears() {
  return (
    <group position={[0, 0.07, 0]}>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.038, 0, 0]} rotation={[-0.2, 0, side * -0.42]}>
          <mesh position={[0, 0.085, 0]} castShadow>
            <capsuleGeometry args={[0.016, 0.13, 4, 10]} />
            <meshStandardMaterial color="#5e4a36" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.085, 0.012]} scale={[0.42, 0.7, 1]}>
            <capsuleGeometry args={[0.016, 0.1, 4, 10]} />
            <meshStandardMaterial color="#a8706c" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
