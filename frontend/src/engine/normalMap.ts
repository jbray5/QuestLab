import * as THREE from "three";

/**
 * Relief from a painted map, in the browser (Plan 108).
 *
 * The map is a picture. To make torchlight *catch* on its flagstones instead of
 * washing evenly over it, we read luminance as height and turn the gradient
 * into a tangent-space normal map. It is a cheat — bright paint becomes a
 * bump — but it is the single biggest reason the floor stops reading as a
 * photograph of a map and starts reading as a floor.
 *
 * Strength is kept modest by the caller: the painter's own shading would
 * otherwise become exaggerated ridges.
 */
export async function normalMapFromImage(
  src: string,
  size = 1024,
  strength = 1.6,
): Promise<THREE.CanvasTexture> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`could not load ${src}`));
    el.src = src;
  });
  const aspect = img.naturalHeight / img.naturalWidth;
  const w = img.naturalWidth >= img.naturalHeight ? size : Math.round(size / aspect);
  const h = img.naturalWidth >= img.naturalHeight ? Math.round(size * aspect) : size;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // Luminance as height.
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    lum[i] = (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255;
  }
  const at = (x: number, y: number) =>
    lum[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];

  // Sobel gradient → OpenGL-style normal (+X right, +Y up in texture space).
  // Image rows run downward, so a height increase toward the top of the
  // texture is a *negative* dy here — hence the sign on g.
  const out = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)
        - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const dy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)
        - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      let nx = -dx * strength;
      let ny = dy * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const o = (y * w + x) * 4;
      out.data[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out.data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out.data[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out.data[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}
