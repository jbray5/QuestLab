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
