import type { SetDetail, Lang } from "@/lib/tcgdex-api";
import { processCards, type ExportMode } from "@/lib/tcgdex-api";
import { loadCardWithOverlays } from "@/lib/pdf-utils";

const SIZE = 1080;

const FLAG_URLS: Record<Lang, string> = {
  fr: "https://flagcdn.com/w80/fr.png",
  en: "https://flagcdn.com/w80/gb.png",
  de: "https://flagcdn.com/w80/de.png",
  es: "https://flagcdn.com/w80/es.png",
  it: "https://flagcdn.com/w80/it.png",
  pt: "https://flagcdn.com/w80/pt.png",
  ja: "https://flagcdn.com/w80/jp.png",
};

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function hexToGradient(hex: string): { start: string; mid: string; end: string } {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const darken = (v: number, f: number) => Math.max(0, Math.round(v * f));
  const toHex = (r2: number, g2: number, b2: number) =>
    `#${r2.toString(16).padStart(2, "0")}${g2.toString(16).padStart(2, "0")}${b2.toString(16).padStart(2, "0")}`;
  return {
    start: toHex(darken(r, 0.3), darken(g, 0.3), darken(b, 0.3)),
    mid: hex,
    end: toHex(darken(r, 0.5), darken(g, 0.5), darken(b, 0.5)),
  };
}

/** Load 9 card images for a specific mode */
async function loadModeCards(
  setDetail: SetDetail,
  lang: Lang,
  mode: "complete" | "master" | "graded" | "grayscale",
  onProgress?: (loaded: number, total: number) => void
): Promise<(string | null)[]> {
  let cards;
  const isGrayscale = mode === "grayscale";
  const effectiveMode: ExportMode = isGrayscale ? "complete" : (mode as ExportMode);

  try {
    cards = await processCards(lang, setDetail, effectiveMode);
  } catch {
    // Fallback: use raw cards
    cards = setDetail.cards.slice(0, 9).map(c => ({
      ...c,
      reverse: false,
      reverseType: undefined as any,
      graded: false,
    }));
  }

  const sample = cards.slice(0, 9);
  const results: (string | null)[] = [];

  for (let i = 0; i < sample.length; i++) {
    const card = sample[i];
    let localId = card.localId
      .replace("_reverse_pokeball", "")
      .replace("_reverse_masterball", "")
      .replace("_reverse", "");
    const imgUrl = `https://assets.tcgdex.net/${lang}/${setDetail.serie.id}/${setDetail.id}/${localId}/high.png`;
    try {
      const dataUrl = await loadCardWithOverlays(imgUrl, {
        reverse: (card as any).reverse || false,
        reverseType: (card as any).reverseType,
        graded: (card as any).graded || false,
        grayscale: isGrayscale,
      });
      results.push(dataUrl);
    } catch {
      results.push(null);
    }
    onProgress?.(i + 1, sample.length);
  }

  return results;
}

/** Generate a mini PDF page preview (3x3 card grid) on an offscreen canvas */
async function generatePagePreview(
  cardImages: (string | null)[]
): Promise<HTMLCanvasElement> {
  const pageW = 420;
  const pageH = 594;
  const page = document.createElement("canvas");
  page.width = pageW;
  page.height = pageH;
  const pctx = page.getContext("2d")!;

  pctx.fillStyle = "#ffffff";
  pctx.fillRect(0, 0, pageW, pageH);

  const cardW = 126;
  const cardH = 176;
  const marginX = (pageW - cardW * 3) / 2;
  const marginY = 15;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const idx = row * 3 + col;
      if (idx >= cardImages.length) break;
      const dataUrl = cardImages[idx];
      if (!dataUrl) continue;
      const x = marginX + col * cardW;
      const y = marginY + row * cardH;
      try {
        const img = await loadImage(dataUrl);
        pctx.drawImage(img, x, y, cardW, cardH);
      } catch {
        // skip
      }
    }
  }

  return page;
}

/** Draw a page preview with shadow and rotation */
function drawPageOnCanvas(
  ctx: CanvasRenderingContext2D,
  page: HTMLCanvasElement,
  x: number, y: number, w: number, h: number,
  rotation: number = 0
) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((rotation * Math.PI) / 180);

  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetX = 5;
  ctx.shadowOffsetY = 8;

  ctx.fillStyle = "#fff";
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.shadowColor = "transparent";

  ctx.drawImage(page, -w / 2, -h / 2, w, h);

  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-w / 2, -h / 2, w, h);

  ctx.restore();
}

/** Draw a badge pill label */
function drawBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  color: string,
  rotation: number = 0
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotation * Math.PI) / 180);

  ctx.font = "bold 22px Arial, sans-serif";
  const textW = ctx.measureText(text).width;
  const bw = textW + 36;
  const bh = 38;

  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;

  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 19);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 2;
  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 19);
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 1);

  ctx.restore();
}

export async function generateEtsyVisual(
  setDetail: SetDetail,
  lang: Lang,
  langs: Lang[],
  onProgress?: (pct: number) => void,
  bgColor?: string,
  customLogoUrl?: string
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  onProgress?.(2);

  // === Background gradient ===
  const baseColor = bgColor || "#e91e8c";
  const grad = hexToGradient(baseColor);
  const bgGrad = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 100, SIZE / 2, SIZE / 2, SIZE * 0.75);
  bgGrad.addColorStop(0, grad.mid);
  bgGrad.addColorStop(1, grad.start);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Subtle grid overlay
  ctx.save();
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < SIZE; i += 40) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, SIZE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(SIZE, i);
    ctx.stroke();
  }
  ctx.restore();

  onProgress?.(4);

  // === Load mode-specific cards ===
  const modes: ("complete" | "master" | "graded" | "grayscale")[] = ["complete", "master", "graded", "grayscale"];
  const modeCardImages: Record<string, (string | null)[]> = {};
  
  for (let mi = 0; mi < modes.length; mi++) {
    const m = modes[mi];
    modeCardImages[m] = await loadModeCards(setDetail, lang, m, (loaded, total) => {
      const modeBase = 4 + mi * 15;
      onProgress?.(modeBase + (loaded / total) * 15);
    });
  }

  onProgress?.(64);

  // === Generate page previews per mode ===
  const completePage = await generatePagePreview(modeCardImages["complete"]);
  const masterPage = await generatePagePreview(modeCardImages["master"]);
  const gradedPage = await generatePagePreview(modeCardImages["graded"]);
  const grayscalePage = await generatePagePreview(modeCardImages["grayscale"]);

  onProgress?.(68);

  // === Scattered layout — LARGE pages like reference images ===
  const bigW = 340;
  const bigH = 480;
  const medW = 300;
  const medH = 424;

  // Draw order: back to front (furthest back first)
  // Grayscale - right side, tall
  drawPageOnCanvas(ctx, grayscalePage, 640, 200, medW, medH, 5);
  drawBadge(ctx, "Grayscale", 790, 230, "#8b5cf6", 5);

  // Master - top center
  drawPageOnCanvas(ctx, masterPage, 350, 120, medW, medH, -2);
  drawBadge(ctx, "Master Set", 500, 150, "#3b82f6", -2);

  // Complete - center-left, overlapping
  drawPageOnCanvas(ctx, completePage, 140, 260, bigW, bigH, -6);
  drawBadge(ctx, "Complete Set", 310, 290, "#f97316", -6);

  // Graded - bottom-left, largest & most prominent (front)
  drawPageOnCanvas(ctx, gradedPage, -10, 420, bigW + 40, bigH + 56, -10);
  drawBadge(ctx, "Graded Set", 180, 465, "#ef4444", -10);

  onProgress?.(75);

  // === "Download, Print, Cut" header (top-left, bold) ===
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 48px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Download, Print, Cut", 40, 35);
  ctx.restore();

  onProgress?.(78);

  // === Language flags (below header, top-left) ===
  const flagSize = 50;
  const flagGap = 14;
  let flagX = 45;
  const flagY = 100;

  for (const l of langs) {
    try {
      const flagImg = await loadImage(FLAG_URLS[l]);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 8;
      const fh = flagSize * 0.67;
      roundRect(ctx, flagX, flagY, flagSize, fh, 5);
      ctx.clip();
      ctx.drawImage(flagImg, flagX, flagY, flagSize, fh);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      roundRect(ctx, flagX, flagY, flagSize, fh, 5);
      ctx.stroke();
      ctx.restore();
    } catch {
      // skip
    }
    flagX += flagSize + flagGap;
  }

  onProgress?.(82);

  // === Set logo (centered) ===
  const logoUrl = customLogoUrl || setDetail.logo;
  let logoImg: HTMLImageElement | null = null;
  if (logoUrl) {
    try {
      logoImg = await loadImage(logoUrl);
    } catch {
      // skip
    }
  }

  if (logoImg) {
    const maxLogoW = 550;
    const maxLogoH = 220;
    const logoAspect = logoImg.width / logoImg.height;
    let logoW = maxLogoW;
    let logoH = logoW / logoAspect;
    if (logoH > maxLogoH) {
      logoH = maxLogoH;
      logoW = logoH * logoAspect;
    }

    const logoX = SIZE / 2 - logoW / 2;
    const logoY = SIZE / 2 - logoH / 2 - 40;

    // Strong glow
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
    ctx.shadowBlur = 40;
    ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);
    ctx.restore();
    ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);
  } else {
    // Fallback: set name as large text
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 25;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 64px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(setDetail.name, SIZE / 2, SIZE / 2 - 40);
    ctx.restore();
  }

  onProgress?.(90);

  // === Bottom CTA: "✨ Download ✨" ===
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 52px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("✨ Download ✨", SIZE / 2, SIZE - 30);
  ctx.restore();

  onProgress?.(95);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        onProgress?.(100);
        resolve(blob);
      } else {
        reject(new Error("Canvas toBlob failed"));
      }
    }, "image/png");
  });
}
