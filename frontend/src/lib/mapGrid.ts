/**
 * mapGrid — battle-map grid math in squares (Plan 133).
 *
 * The server stores `grid_size`: pixels per 5-foot square. DMs think in squares
 * ("25 across, 75 down", the way Inkarnate and Roll20 show it), so the editor
 * asks for squares across and works the pixels out. Nothing downstream changes.
 *
 * The import guess looks for a square count that makes a plausible battle map,
 * tall and wide strips included. When the grid is drawn into the art it checks
 * where the lines fall, which settles maps whose size fits several grids
 * (1400 × 2800 is 25 × 50 at 56 px, but also 20 × 40 at 70 px). When it can't
 * be sure it returns null and the editor asks. It never picks a size silently.
 *
 * Pure functions except `edgeProfiles`, which needs a browser canvas.
 */

/** Fewest and most squares along either side of a plausible battle map. */
export const MIN_SQUARES = 6;
export const MAX_SQUARES = 100;
/** The server's bounds on pixels per square (domain/battle_map.py). */
export const MIN_GRID_PX = 8;
export const MAX_GRID_PX = 1000;
/** Squares smaller or larger than this aren't considered by the guess. */
const GUESS_MIN_PX = 16;
const GUESS_MAX_PX = 400;
/** Sizes map makers and VTTs export at: Roll20 70, Foundry 100, Czepeku 140, … */
const COMMON_PX = [70, 100, 140, 50, 72, 96, 128, 150, 200, 64, 80, 120, 60, 90, 75, 256];
/** How much stronger the lines must be than the gaps between them to trust them. */
const LINE_CONFIDENCE = 1.6;

/** A grid read as squares. `exact` is false when the squares don't fill the image evenly. */
export interface Squares {
  across: number;
  down: number;
  exact: boolean;
}

/** One grid the guess considers: `period` is the exact square width in image pixels. */
export interface GridCandidate {
  across: number;
  down: number;
  period: number;
  gridPx: number;
  /** Whole squares both ways at a whole-pixel size. */
  exact: boolean;
}

/** What the import guess found, and from what. */
export interface GridGuess {
  gridPx: number;
  across: number;
  down: number;
  exact: boolean;
  source: "lines" | "size";
}

/** Column and row edge strength of a (downscaled) image, plus the downscale factors. */
export interface EdgeProfiles {
  cols: Float32Array;
  rows: Float32Array;
  sx: number;
  sy: number;
}

/** Squares across and down for a stored grid size (pixels per square). */
export function squaresOf(w: number, h: number, gridPx: number): Squares {
  return {
    across: Math.max(1, Math.round(w / gridPx)),
    down: Math.max(1, Math.round(h / gridPx)),
    exact: w % gridPx === 0 && h % gridPx === 0,
  };
}

/** "25 × 75 squares", or "about 25 × 75 squares" when they don't divide evenly. */
export function squaresLabel(s: Squares): string {
  return `${s.exact ? "" : "about "}${s.across} × ${s.down} squares`;
}

/**
 * The stored grid size for "N squares across": round(width ÷ N), and how many
 * squares that makes down. Null when N isn't a usable count for this image.
 */
export function gridFromAcross(
  w: number,
  h: number,
  across: number,
): { gridPx: number; down: number; exact: boolean } | null {
  if (!Number.isFinite(across) || across < 1 || !Number.isInteger(across)) return null;
  const gridPx = Math.round(w / across);
  if (gridPx < MIN_GRID_PX || gridPx > MAX_GRID_PX) return null;
  const downExact = (h * across) / w;
  const down = Math.max(1, Math.round(downExact));
  return { gridPx, down, exact: w % across === 0 && Math.abs(downExact - down) < 1e-9 };
}

/** The square counts across this image width can take within the server's pixel bounds. */
export function acrossRange(w: number): { min: number; max: number } {
  // round(w / n) must land in [MIN_GRID_PX, MAX_GRID_PX].
  return {
    min: Math.max(1, Math.floor(w / (MAX_GRID_PX + 0.5)) + 1),
    max: Math.max(1, Math.floor(w / (MIN_GRID_PX - 0.5))),
  };
}

/** Every square count that makes a plausible board of this image, fewest squares first. */
export function gridCandidates(w: number, h: number): GridCandidate[] {
  const out: GridCandidate[] = [];
  for (let across = MIN_SQUARES; across <= MAX_SQUARES; across++) {
    const period = w / across;
    if (period < GUESS_MIN_PX || period > GUESS_MAX_PX) continue;
    const down = Math.round(h / period);
    if (down < MIN_SQUARES || down > MAX_SQUARES) continue;
    const exact = Number.isInteger(period) && h % period === 0;
    out.push({ across, down, period, gridPx: Math.round(period), exact });
  }
  return out;
}

/** The strongest edge value within a pixel of x. */
function peakNear(p: Float32Array, x: number): number {
  const i0 = Math.max(0, Math.floor(x) - 1);
  const i1 = Math.min(p.length - 1, Math.ceil(x) + 1);
  let m = 0;
  for (let i = i0; i <= i1; i++) if (p[i] > m) m = p[i];
  return m;
}

/**
 * How strongly an edge profile repeats at `period` (in profile pixels): the
 * mean edge on the would-be grid lines over the mean edge halfway between
 * them. About 1 for a period the art doesn't have; well above 1 for the drawn
 * grid. A multiple of the true size scores about 1 (its midpoints land on
 * lines too), so the guess can't jump to double-size squares.
 */
export function lineStrength(p: Float32Array, period: number): number {
  if (period < 5) return 0; // too fine to tell lines from gaps at this scale
  let on = 0;
  let off = 0;
  let n = 0;
  for (let k = 1; k * period < p.length - 2; k++) {
    on += peakNear(p, k * period);
    off += peakNear(p, k * period - period / 2);
    n += 1;
  }
  if (n < 2) return 0;
  const eps = 1e-3 * n;
  return (on + eps) / (off + eps);
}

/** The grid drawn into the art, if its lines are clear. */
function guessFromLines(w: number, h: number, prof: EdgeProfiles): GridCandidate | null {
  const scored = gridCandidates(w, h).map((c) => ({
    c,
    s: Math.min(lineStrength(prof.cols, c.period * prof.sx), lineStrength(prof.rows, c.period * prof.sy)),
  }));
  const best = scored.reduce((m, x) => Math.max(m, x.s), 0);
  if (best < LINE_CONFIDENCE) return null;
  // Lines every 3 squares score like lines every square; take the most squares
  // among the near-best (gridCandidates is in ascending `across`, so the last).
  // Half-size squares score about (best + 1) / 2, below this band.
  const near = scored.filter((x) => x.s >= best * 0.85);
  return near[near.length - 1].c;
}

/** The one common export size that fits this image exactly, if there is only one. */
function guessFromSize(w: number, h: number): GridCandidate | null {
  const known = gridCandidates(w, h).filter((c) => c.exact && COMMON_PX.includes(c.gridPx));
  return known.length === 1 ? known[0] : null;
}

/**
 * The import guess. With edge profiles of the art it first looks for drawn grid
 * lines; otherwise (or when none show) it trusts the image size only when a
 * single common square size fits it exactly. Null means "ask the DM".
 */
export function guessGrid(w: number, h: number, profiles?: EdgeProfiles | null): GridGuess | null {
  const fromLines = profiles ? guessFromLines(w, h, profiles) : null;
  const c = fromLines ?? guessFromSize(w, h);
  if (!c) return null;
  const sq = squaresOf(w, h, c.gridPx);
  return {
    gridPx: c.gridPx,
    across: c.across,
    down: c.down,
    exact: c.exact && sq.exact,
    source: fromLines ? "lines" : "size",
  };
}

/** A few square counts that fit this image exactly, to try with one tap. */
export function suggestAcross(w: number, h: number, max = 5): number[] {
  return gridCandidates(w, h)
    .filter((c) => c.exact && c.period >= 40 && c.period <= 200)
    .slice(-max)
    .map((c) => c.across);
}

/**
 * Edge profiles of an image for `guessGrid`, from a downscaled copy (a few
 * megapixels) so big exports stay quick and within phone canvas limits.
 * Null if the browser can't draw or read it.
 */
export function edgeProfiles(img: CanvasImageSource, w: number, h: number): EdgeProfiles | null {
  try {
    const s = Math.min(1, Math.sqrt(6_000_000 / (w * h)));
    const cw = Math.max(1, Math.round(w * s));
    const ch = Math.max(1, Math.round(h * s));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, cw, ch);
    const { data } = ctx.getImageData(0, 0, cw, ch);
    const lum = new Float32Array(cw * ch);
    for (let i = 0, j = 0; j < lum.length; i += 4, j++) {
      lum[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    const cols = new Float32Array(cw);
    const rows = new Float32Array(ch);
    for (let y = 0; y < ch; y++) {
      const o = y * cw;
      for (let x = 1; x < cw; x++) cols[x] += Math.abs(lum[o + x] - lum[o + x - 1]);
      if (y > 0) {
        let sum = 0;
        for (let x = 0; x < cw; x++) sum += Math.abs(lum[o + x] - lum[o - cw + x]);
        rows[y] = sum;
      }
    }
    // Release the canvas backing store promptly (Safari keeps it otherwise).
    canvas.width = 0;
    canvas.height = 0;
    return { cols, rows, sx: cw / w, sy: ch / h };
  } catch {
    return null;
  }
}
