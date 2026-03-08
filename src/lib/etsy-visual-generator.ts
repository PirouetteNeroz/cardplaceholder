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

  // === BACKGROUND: rich radial gradient + spotlight ===
  const baseColor = bgColor || "#e91e8c";
  const grad = hexToGradient(baseColor);

  // Base gradient
  const bgGrad = ctx.createRadialGradient(SIZE / 2, SIZE * 0.35, 50, SIZE / 2, SIZE / 2, SIZE * 0.85);
  bgGrad.addColorStop(0, grad.mid);
  bgGrad.addColorStop(0.6, grad.end);
  bgGrad.addColorStop(1, grad.start);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Spotlight glow at top-center
  ctx.save();
  const spotlight = ctx.createRadialGradient(SIZE / 2, 120, 0, SIZE / 2, 120, 500);
  spotlight.addColorStop(0, "rgba(255,255,255,0.12)");
  spotlight.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = spotlight;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.restore();

  // Subtle vignette
  ctx.save();
  const vignette = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.3, SIZE / 2, SIZE / 2, SIZE * 0.75);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.restore();

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

  // === LOGO (top, centered, large) ===
  const logoUrl = customLogoUrl || setDetail.logo;
  let logoImg: HTMLImageElement | null = null;
  if (logoUrl) {
    try { logoImg = await loadImage(logoUrl); } catch { /* skip */ }
  }

  const logoBottomY = (() => {
    if (logoImg) {
      const maxLogoW = 600;
      const maxLogoH = 180;
      const logoAspect = logoImg.width / logoImg.height;
      let logoW = maxLogoW;
      let logoH = logoW / logoAspect;
      if (logoH > maxLogoH) { logoH = maxLogoH; logoW = logoH * logoAspect; }

      const logoX = SIZE / 2 - logoW / 2;
      const logoY = 40;

      // Glow behind logo
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
      ctx.shadowBlur = 50;
      ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);
      ctx.restore();
      // Crisp logo on top
      ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);

      return logoY + logoH;
    } else {
      // Fallback: set name
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = "#fff";
      ctx.font = "bold 72px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(setDetail.name, SIZE / 2, 55);
      ctx.restore();
      return 55 + 80;
    }
  })();

  onProgress?.(72);

  // === FLAGS (centered, below logo) ===
  const flagSize = 54;
  const flagGap = 16;
  const totalFlagsW = langs.length * flagSize + (langs.length - 1) * flagGap;
  let flagX = SIZE / 2 - totalFlagsW / 2;
  const flagY = logoBottomY + 20;

  for (const l of langs) {
    try {
      const flagImg = await loadImage(FLAG_URLS[l]);
      const fh = flagSize * 0.67;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 10;
      roundRect(ctx, flagX, flagY, flagSize, fh, 6);
      ctx.clip();
      ctx.drawImage(flagImg, flagX, flagY, flagSize, fh);
      ctx.restore();
      // Border
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      roundRect(ctx, flagX, flagY, flagSize, fh, 6);
      ctx.stroke();
      ctx.restore();
    } catch { /* skip */ }
    flagX += flagSize + flagGap;
  }

  onProgress?.(76);

  // === FAN LAYOUT: 4 pages in cascade left→right ===
  const pageW = 280;
  const pageH = 396;
  const fanCenterX = SIZE / 2;
  const fanBaseY = flagY + 70;
  const spacing = 195; // horizontal spacing between pages
  const rotations = [-12, -4, 4, 12];
  const pages = [gradedPage, completePage, masterPage, grayscalePage];
  const labels = ["Graded Set", "Complete Set", "Master Set", "Grayscale"];
  const colors = ["#ef4444", "#f97316", "#3b82f6", "#8b5cf6"];

  // Calculate positions: centered fan
  const totalFanW = (pages.length - 1) * spacing;
  const startX = fanCenterX - totalFanW / 2 - pageW / 2;

  for (let i = 0; i < pages.length; i++) {
    const px = startX + i * spacing;
    const py = fanBaseY + Math.abs(rotations[i]) * 2; // slight vertical offset for outer pages

    drawPageOnCanvas(ctx, pages[i], px, py, pageW, pageH, rotations[i]);

    // Badge at bottom of each page
    const badgeCx = px + pageW / 2;
    const badgeCy = py + pageH - 10;
    drawBadge(ctx, labels[i], badgeCx, badgeCy, colors[i], rotations[i]);
  }

  onProgress?.(88);

  // === BOTTOM BANNER ===
  ctx.save();
  // Semi-transparent dark bar
  const bannerH = 80;
  const bannerY = SIZE - bannerH;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(0, bannerY, SIZE, bannerH);

  // Top highlight line
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(0, bannerY, SIZE, 2);

  // CTA text
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 42px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✨ Instant Digital Download ✨", SIZE / 2, bannerY + bannerH / 2);
  ctx.restore();

  onProgress?.(95);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) { onProgress?.(100); resolve(blob); }
      else reject(new Error("Canvas toBlob failed"));
    }, "image/png");
  });
}
