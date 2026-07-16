import * as THREE from "three";

/**
 * boardTheme — non-component values shared by the 3D board (Plan 45).
 * Kept out of the .tsx component files so react-refresh stays happy.
 */

export type WeatherKind = "none" | "embers" | "fireflies" | "rain" | "snow" | "dust";

export const WEATHER_KINDS: { value: WeatherKind; label: string }[] = [
  { value: "none", label: "Clear" },
  { value: "embers", label: "Embers" },
  { value: "fireflies", label: "Fireflies" },
  { value: "rain", label: "Rain" },
  { value: "snow", label: "Snow" },
  { value: "dust", label: "Dust" },
];

/** Card/standee tint so unlit billboards still sit in the night scene. */
export function cardTint(darkness: number): string {
  return `#${new THREE.Color("#ffffff").lerp(new THREE.Color("#93a2d6"), darkness * 0.8).getHexString()}`;
}

/** Mix two hex colors (t = 0 → a, t = 1 → b). */
export function mixHex(a: string, b: string, t: number): string {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}

let vignetteTexture: THREE.CanvasTexture | null = null;

/** Lazy singleton: radial edge-fade texture (transparent center, dark rim). */
export function getVignetteTexture(): THREE.CanvasTexture {
  if (vignetteTexture) return vignetteTexture;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#07070d";
  g.fillRect(0, 0, 512, 512);
  const grad = g.createRadialGradient(256, 256, 120, 256, 256, 260);
  grad.addColorStop(0, "rgba(0,0,0,1)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  vignetteTexture = new THREE.CanvasTexture(c);
  return vignetteTexture;
}

/** Alpha-curve + auto-crop a minifig cut-out.
 *
 * gpt-image-1 loves painting a soft halo/backdrop glow behind dark subjects
 * even with background=transparent. The halo lives in low-to-mid alpha, so we
 * remap alpha (≤LO → 0, LO..HI → ramp) and then letterbox the surviving
 * content into a 2:3 frame anchored to the bottom so feet sit on the base.
 * Returns null on failure (tainted canvas / empty result) — caller keeps the
 * raw texture.
 */
export function processFigureImage(img: HTMLImageElement): THREE.CanvasTexture | null {
  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return null;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, w, h);
    const px = data.data;
    const LO = 110;
    const HI = 230;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    for (let i = 0; i < px.length; i += 4) {
      const a = px[i + 3];
      const out = a <= LO ? 0 : a >= HI ? a : Math.round(((a - LO) * 255) / (HI - LO));
      px[i + 3] = out;
      if (out > 8) {
        const p = i / 4;
        const x = p % w;
        const y = (p - x) / w;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX <= minX || maxY <= minY) return null;
    g.putImageData(data, 0, 0);
    const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.04);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(w, maxX + pad);
    // NO bottom pad — content is bottom-anchored, so padding below the feet
    // made every cutout hover above its base (the "floating trees" bug).
    maxY = Math.min(h, maxY + 1);
    const bw = maxX - minX;
    const bh = maxY - minY;
    const outH = 1024;
    const outW = Math.round((outH * 2) / 3);
    const scale = Math.min(outW / bw, outH / bh);
    const dw = bw * scale;
    const dh = bh * scale;
    const oc = document.createElement("canvas");
    oc.width = outW;
    oc.height = outH;
    const og = oc.getContext("2d")!;
    og.drawImage(c, minX, minY, bw, bh, (outW - dw) / 2, outH - dh, dw, dh);
    const tex = new THREE.CanvasTexture(oc);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  } catch {
    return null;
  }
}

let horizonTexture: THREE.CanvasTexture | null = null;

/** Lazy singleton: vertical gradient (opaque dark at bottom → clear at top)
 * used to blend the backdrop dome into the dark under-world. */
export function getHorizonTexture(): THREE.CanvasTexture {
  if (horizonTexture) return horizonTexture;
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 256, 0, 0);
  grad.addColorStop(0, "rgba(7,7,13,1)");
  grad.addColorStop(0.55, "rgba(7,7,13,0.85)");
  grad.addColorStop(1, "rgba(7,7,13,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  horizonTexture = new THREE.CanvasTexture(c);
  return horizonTexture;
}
