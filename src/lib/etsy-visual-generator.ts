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
  // Try fetch-as-blob first (works for CORS-restricted URLs like user-provided logos)
  try {
    const resp = await fetch(url, { mode: "cors" });
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(blobUrl); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error("load failed")); };
      img.src = blobUrl;
    });
  } catch {
    // Fallback to direct load
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }
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
    start: toHex(darken(r, 0.2), darken(g, 0.2), darken(b, 0.2)),
    mid: hex,
    end: toHex(darken(r, 0.4), darken(g, 0.4), darken(b, 0.4)),
  };
}

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
    cards = setDetail.cards.slice(0, 9).map(c => ({
      ...c, reverse: false, reverseType: undefined as any, graded: false,
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

async function generatePagePreview(
  cardImages: (string | null)[]
): Promise<HTMLCanvasElement> {
  const cols = 3;
  const rows = 3;
  const cardW = 140;
  const cardH = 196;
  const gap = 4;
  const pageW = cols * cardW + (cols - 1) * gap;
  const pageH = rows * cardH + (rows - 1) * gap;
  const page = document.createElement("canvas");
  page.width = pageW;
  page.height = pageH;
  const pctx = page.getContext("2d")!;

  // Transparent background (no white)
  pctx.clearRect(0, 0, pageW, pageH);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      if (idx >= cardImages.length) break;
      const dataUrl = cardImages[idx];
      if (!dataUrl) continue;
      const x = col * (cardW + gap);
      const y = row * (cardH + gap);
      try {
        const img = await loadImage(dataUrl);
        pctx.drawImage(img, x, y, cardW, cardH);
      } catch { /* skip */ }
    }
  }

  return page;
}

function drawPageOnCanvas(
  ctx: CanvasRenderingContext2D,
  page: HTMLCanvasElement,
  x: number, y: number, w: number, h: number,
  rotation: number = 0
) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((rotation * Math.PI) / 180);

  // Deep shadow
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetX = 8;
  ctx.shadowOffsetY = 12;

  // White page background with rounded corners
  const r = 8;
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.shadowColor = "transparent";

  // Clip and draw content
  ctx.save();
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.clip();
  ctx.drawImage(page, -w / 2, -h / 2, w, h);
  ctx.restore();

  // Border
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.stroke();

  ctx.restore();
}

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

  ctx.font = "bold 26px Arial, sans-serif";
  const textW = ctx.measureText(text).width;
  const bw = textW + 44;
  const bh = 44;

  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;

  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 22);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowColor = "transparent";

  // Inner highlight
  roundRect(ctx, -bw / 2 + 1, -bh / 2 + 1, bw - 2, bh / 2 - 1, 22);
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 22);
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

  // === BACKGROUND: solid color fill ===
  const baseColor = bgColor || "#f0c040";
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Subtle radial lighter center
  const grad = hexToGradient(baseColor);
  const spotlight = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE * 0.7);
  spotlight.addColorStop(0, "rgba(255,255,255,0.15)");
  spotlight.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = spotlight;
  ctx.fillRect(0, 0, SIZE, SIZE);

  onProgress?.(4);

  // === Load cards for each mode ===
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

  // === Generate page previews ===
  const completePage = await generatePagePreview(modeCardImages["complete"]);
  const masterPage = await generatePagePreview(modeCardImages["master"]);
  const gradedPage = await generatePagePreview(modeCardImages["graded"]);
  const grayscalePage = await generatePagePreview(modeCardImages["grayscale"]);

  onProgress?.(68);

  // === STYLED HEADER: "Download, Print, Cut" with decorative background ===
  ctx.save();
  // Dark ribbon behind text
  const ribbonH = 60;
  const ribbonY = 20;
  roundRect(ctx, 20, ribbonY, 480, ribbonH, 12);
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fill();
  // Text
  ctx.fillStyle = "#fff";
  ctx.font = "bold 40px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Download, Print, Cut", 42, ribbonY + ribbonH / 2);
  ctx.restore();

  // === FLAGS (inside ribbon, right side) ===
  const flagSize = 38;
  const flagGap = 8;
  let flagX = 520;
  const flagY = ribbonY + (ribbonH - flagSize * 0.67) / 2;

  for (const l of langs) {
    try {
      const flagImg = await loadImage(FLAG_URLS[l]);
      const fh = flagSize * 0.67;
      ctx.save();
      roundRect(ctx, flagX, flagY, flagSize, fh, 4);
      ctx.clip();
      ctx.drawImage(flagImg, flagX, flagY, flagSize, fh);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1.5;
      roundRect(ctx, flagX, flagY, flagSize, fh, 4);
      ctx.stroke();
      ctx.restore();
    } catch { /* skip */ }
    flagX += flagSize + flagGap;
  }

  onProgress?.(72);

  // === DIAGONAL CASCADE: bottom-left to top-right, ALL STRAIGHT (rot=0) ===
  const pages = [gradedPage, completePage, masterPage, grayscalePage];
  const labels = ["Graded Set", "Complete Set", "Master Set", "Grayscale"];
  const colors = ["#ef4444", "#f97316", "#3b82f6", "#8b5cf6"];

  const pageConfigs = [
    { w: 400, h: 565, x: -15, y: 430, rot: 0 },    // Graded - bottom-left
    { w: 360, h: 509, x: 190, y: 290, rot: 0 },     // Complete
    { w: 340, h: 480, x: 410, y: 170, rot: 0 },     // Master
    { w: 340, h: 480, x: 650, y: 70, rot: 0 },      // Grayscale - top-right
  ];

  // Draw pages back to front (rightmost first so left overlaps)
  for (let i = pages.length - 1; i >= 0; i--) {
    const c = pageConfigs[i];
    drawPageOnCanvas(ctx, pages[i], c.x, c.y, c.w, c.h, c.rot);
  }

  // Draw badges ON TOP of all pages
  for (let i = 0; i < pages.length; i++) {
    const c = pageConfigs[i];
    const badgeCx = c.x + c.w / 2;
    const badgeCy = c.y + 28;
    drawBadge(ctx, labels[i], badgeCx, badgeCy, colors[i], 0);
  }

  onProgress?.(80);

  // === LOGO (centered, ON TOP of pages, VERY large) ===
  const logoUrl = customLogoUrl && customLogoUrl.trim() !== "" ? customLogoUrl.trim() : setDetail.logo;
  let logoImg: HTMLImageElement | null = null;
  if (logoUrl) {
    try { logoImg = await loadImage(logoUrl); } catch (e) { console.warn("Logo load failed:", logoUrl, e); }
  }

  if (logoImg) {
    const maxLogoW = 750;
    const maxLogoH = 300;
    const logoAspect = logoImg.width / logoImg.height;
    let logoW = maxLogoW;
    let logoH = logoW / logoAspect;
    if (logoH > maxLogoH) { logoH = maxLogoH; logoW = logoH * logoAspect; }

    const logoX = SIZE / 2 - logoW / 2;
    const logoY = SIZE / 2 - logoH / 2 + 80;

    // Strong multi-layer shadow
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);
    ctx.restore();
    ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);
  } else {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#000";
    ctx.font = "bold 80px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(setDetail.name, SIZE / 2, SIZE / 2 + 60);
    ctx.restore();
  }

  onProgress?.(88);

  // === BOTTOM CTA: styled "✨ Download ✨" button ===
  ctx.save();
  const btnW = 480;
  const btnH = 70;
  const btnX = SIZE / 2 - btnW / 2;
  const btnY = SIZE - 100;

  // Button shadow
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 6;
  roundRect(ctx, btnX, btnY, btnW, btnH, 35);
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.shadowColor = "transparent";

  // Button text
  ctx.fillStyle = "#fff";
  ctx.font = "bold 42px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✨ Download ✨", SIZE / 2, btnY + btnH / 2);
  ctx.restore();

  onProgress?.(95);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) { onProgress?.(100); resolve(blob); }
      else reject(new Error("Canvas toBlob failed"));
    }, "image/png");
  });
}
