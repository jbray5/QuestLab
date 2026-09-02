import { SUBCLASS_CARD_ART } from "./subclassArt";

/**
 * Legend Cards (Plan 68) — the scroll-stopper.
 *
 * Composites a 1080×1920 story-ready share card on a canvas: the PC's
 * painted render over their subclass art, name set in Cinzel inside a
 * gold frame, class plate, campaign wordmark. Blob art is CORS-`*` so
 * the canvas stays untainted and exportable.
 */

export interface LegendCardInput {
  name: string;
  subtitle: string; // "Level 3 Dragonborn Paladin · Oath of the Ancients"
  campaign: string;
  subclass?: string | null;
  /** Best render available: loadout || hero || figure || portrait. */
  artUrl: string;
}

const W = 1080;
const H = 1920;

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
  return img;
}

/** Shrink a font size until the text fits the given width. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: number,
  max: number,
  maxWidth: number,
): number {
  let size = max;
  for (; size > 30; size -= 4) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
  }
  return size;
}

/** Render the card; resolves to a PNG blob ready for the share sheet. */
export async function renderLegendCard(input: LegendCardInput): Promise<Blob> {
  // The card is typography-first — make sure Cinzel is actually loaded
  // before we draw, or every face falls back to a default serif.
  try {
    await Promise.all([
      document.fonts.load("700 120px Cinzel"),
      document.fonts.load("600 44px Cinzel"),
    ]);
  } catch {
    /* draw with fallbacks */
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  // ── Ground: subclass art (cover) under a heavy scrim, else a dark field.
  ctx.fillStyle = "#0d0a16";
  ctx.fillRect(0, 0, W, H);
  const bgUrl = input.subclass ? SUBCLASS_CARD_ART[input.subclass] : undefined;
  if (bgUrl) {
    try {
      const bg = await loadImage(bgUrl);
      const scale = Math.max(W / bg.width, H / bg.height);
      const bw = bg.width * scale;
      const bh = bg.height * scale;
      ctx.drawImage(bg, (W - bw) / 2, (H - bh) / 2, bw, bh);
    } catch {
      /* dark field is fine */
    }
  }
  const scrim = ctx.createLinearGradient(0, 0, 0, H);
  scrim.addColorStop(0, "rgba(8,6,14,0.82)");
  scrim.addColorStop(0.32, "rgba(8,6,14,0.42)");
  scrim.addColorStop(0.78, "rgba(8,6,14,0.55)");
  scrim.addColorStop(1, "rgba(8,6,14,0.94)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);

  // ── The hero render, filling the middle of the frame.
  const art = await loadImage(input.artUrl);
  const artMaxH = H * 0.62;
  const artMaxW = W * 0.86;
  const s = Math.min(artMaxW / art.width, artMaxH / art.height);
  const aw = art.width * s;
  const ah = art.height * s;
  const ax = (W - aw) / 2;
  const ay = H * 0.72 - ah; // feet planted at ~72% down
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.75)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  ctx.drawImage(art, ax, ay, aw, ah);
  ctx.restore();
  // Grounding pool under the feet.
  const pool = ctx.createRadialGradient(W / 2, H * 0.72, 20, W / 2, H * 0.72, W * 0.32);
  pool.addColorStop(0, "rgba(0,0,0,0.5)");
  pool.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(W / 2, H * 0.72, W * 0.32, 46, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Gold frame, inset like a plate.
  ctx.strokeStyle = "rgba(214,175,54,0.85)";
  ctx.lineWidth = 4;
  ctx.strokeRect(44, 44, W - 88, H - 88);
  ctx.strokeStyle = "rgba(214,175,54,0.3)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(60, 60, W - 120, H - 120);

  // ── Top block: campaign eyebrow.
  ctx.textAlign = "center";
  ctx.fillStyle = "#c9b989";
  ctx.font = "500 34px Cinzel, Georgia, serif";
  const campaign = input.campaign.toUpperCase();
  // Manual letterspacing — canvas has none.
  const spaced = campaign.split("").join("  ");
  ctx.fillText(spaced, W / 2, 170);

  // ── Name, fitted, with a soft gold glow.
  const nameSize = fitFont(ctx, input.name, "Cinzel, Georgia, serif", 700, 118, W - 180);
  ctx.font = `700 ${nameSize}px Cinzel, Georgia, serif`;
  ctx.shadowColor = "rgba(214,175,54,0.55)";
  ctx.shadowBlur = 34;
  ctx.fillStyle = "#f2e3ae";
  ctx.fillText(input.name, W / 2, 292);
  ctx.shadowBlur = 0;

  // Rule under the name.
  const rule = ctx.createLinearGradient(W * 0.24, 0, W * 0.76, 0);
  rule.addColorStop(0, "rgba(216,185,92,0)");
  rule.addColorStop(0.5, "rgba(216,185,92,0.95)");
  rule.addColorStop(1, "rgba(216,185,92,0)");
  ctx.fillStyle = rule;
  ctx.fillRect(W * 0.24, 330, W * 0.52, 3);

  // ── Bottom block: class plate + wordmark.
  const subSize = fitFont(ctx, input.subtitle, "Cinzel, Georgia, serif", 600, 46, W - 200);
  ctx.font = `600 ${subSize}px Cinzel, Georgia, serif`;
  ctx.fillStyle = "#e6d6a8";
  ctx.fillText(input.subtitle, W / 2, H * 0.72 + 130);

  ctx.font = "500 30px Cinzel, Georgia, serif";
  ctx.fillStyle = "rgba(201,185,137,0.75)";
  ctx.fillText("⚔  Q U E S T L A B", W / 2, H - 108);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Card export failed");
  return blob;
}

/** Share via the native sheet where possible, else download. */
export async function shareLegendCard(blob: Blob, name: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], `${name.replace(/\W+/g, "-").toLowerCase()}-legend.png`, {
    type: "image/png",
  });
  const nav = navigator as Navigator & {
    canShare?: (d: { files: File[] }) => boolean;
    share?: (d: { files: File[]; title?: string }) => Promise<void>;
  };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: `${name} — QuestLab` });
      return "shared";
    } catch {
      /* user cancelled or unsupported — fall through to download */
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
