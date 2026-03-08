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

  // === BACKGROUND: rich multi-layer gradient ===
  const baseColor = bgColor || "#e91e8c";
  const grad = hexToGradient(baseColor);

  // Base dark gradient
  const bgGrad = ctx.createRadialGradient(SIZE / 2, SIZE * 0.3, 0, SIZE / 2, SIZE / 2, SIZE * 0.9);
  bgGrad.addColorStop(0, grad.mid);
  bgGrad.addColorStop(0.5, grad.end);
  bgGrad.addColorStop(1, grad.start);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Large warm spotlight behind pages area
  ctx.save();
  const spotlight = ctx.createRadialGradient(SIZE / 2, SIZE * 0.55, 0, SIZE / 2, SIZE * 0.55, SIZE * 0.6);
  spotlight.addColorStop(0, "rgba(255,255,255,0.10)");
  spotlight.addColorStop(0.5, "rgba(255,255,255,0.04)");
  spotlight.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = spotlight;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.restore();

  // Subtle bokeh-like circles for depth
  ctx.save();
  ctx.globalAlpha = 0.04;
  for (let i = 0; i < 8; i++) {
    const bx = 100 + Math.sin(i * 1.7) * 400;
    const by = 200 + Math.cos(i * 2.3) * 350;
    const br = 80 + (i % 3) * 60;
    const bokeh = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    bokeh.addColorStop(0, "#fff");
    bokeh.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = bokeh;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Deep vignette for drama
  ctx.save();
  const vignette = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.25, SIZE / 2, SIZE / 2, SIZE * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.45)");
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

  // === FLAGS (top-left corner) ===
  const flagSize = 44;
  const flagGap = 10;
  let flagX = 28;
  const flagY = 28;

  for (const l of langs) {
    try {
      const flagImg = await loadImage(FLAG_URLS[l]);
      const fh = flagSize * 0.67;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 8;
      roundRect(ctx, flagX, flagY, flagSize, fh, 5);
      ctx.clip();
      ctx.drawImage(flagImg, flagX, flagY, flagSize, fh);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1.5;
      roundRect(ctx, flagX, flagY, flagSize, fh, 5);
      ctx.stroke();
      ctx.restore();
    } catch { /* skip */ }
    flagX += flagSize + flagGap;
  }

  onProgress?.(72);

  // === LOGO (centered, VERY LARGE) ===
  const logoUrl = customLogoUrl && customLogoUrl.trim() !== "" ? customLogoUrl.trim() : setDetail.logo;
  let logoImg: HTMLImageElement | null = null;
  if (logoUrl) {
    try { logoImg = await loadImage(logoUrl); } catch (e) { console.warn("Logo load failed:", logoUrl, e); }
  }

  const logoBottomY = (() => {
    if (logoImg) {
      const maxLogoW = 780;
      const maxLogoH = 260;
      const logoAspect = logoImg.width / logoImg.height;
      let logoW = maxLogoW;
      let logoH = logoW / logoAspect;
      if (logoH > maxLogoH) { logoH = maxLogoH; logoW = logoH * logoAspect; }

      const logoX = SIZE / 2 - logoW / 2;
      const logoY = 65;

      // Multi-layer glow
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
      ctx.shadowBlur = 60;
      ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);
      ctx.restore();
      ctx.save();
      ctx.shadowColor = grad.mid;
      ctx.shadowBlur = 80;
      ctx.globalAlpha = 0.3;
      ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);
      ctx.globalAlpha = 1;
      ctx.restore();
      // Crisp logo
      ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);

      return logoY + logoH;
    } else {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = "#fff";
      ctx.font = "bold 86px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(setDetail.name, SIZE / 2, 50);
      ctx.restore();
      return 50 + 100;
    }
  })();

  onProgress?.(76);

  // === STAGGERED CASCADE: 4 large pages, dramatic overlap ===
  const pageW = 360;
  const pageH = 508;
  const fanCenterX = SIZE / 2;
  const fanBaseY = logoBottomY + 15;
  const spacing = 175;
  const verticalStep = 40;
  const rotations = [-11, -3.5, 3.5, 11];
  const pages = [gradedPage, completePage, masterPage, grayscalePage];
  const labels = ["Graded Set", "Complete Set", "Master Set", "Grayscale"];
  const colors = ["#ef4444", "#f97316", "#3b82f6", "#8b5cf6"];

  const totalFanW = (pages.length - 1) * spacing;
  const startX = fanCenterX - totalFanW / 2 - pageW / 2;

  // Draw all pages back to front
  for (let i = 0; i < pages.length; i++) {
    const px = startX + i * spacing;
    const py = fanBaseY + i * verticalStep;
    drawPageOnCanvas(ctx, pages[i], px, py, pageW, pageH, rotations[i]);
  }

  // Draw all badges ON TOP
  for (let i = 0; i < pages.length; i++) {
    const px = startX + i * spacing;
    const py = fanBaseY + i * verticalStep;
    const badgeCx = px + pageW / 2;
    const badgeCy = py + pageH - 15;
    drawBadge(ctx, labels[i], badgeCx, badgeCy, colors[i], rotations[i]);
  }

  onProgress?.(88);

  // === PREMIUM BOTTOM BANNER ===
  ctx.save();
  const bannerH = 90;
  const bannerY = SIZE - bannerH;

  // Gradient banner background
  const bannerGrad = ctx.createLinearGradient(0, bannerY, 0, SIZE);
  bannerGrad.addColorStop(0, "rgba(0,0,0,0.0)");
  bannerGrad.addColorStop(0.3, "rgba(0,0,0,0.5)");
  bannerGrad.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.fillStyle = bannerGrad;
  ctx.fillRect(0, bannerY, SIZE, bannerH);

  // Accent line
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(0, bannerY + 10, SIZE, 1);

  // CTA text with glow
  ctx.shadowColor = "rgba(255,255,255,0.3)";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 44px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✨ Instant Digital Download ✨", SIZE / 2, bannerY + bannerH / 2 + 5);

  // Subtle subtext
  ctx.shadowColor = "transparent";
  ctx.font = "20px Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("Placeholders + Checklist  •  Color & Grayscale", SIZE / 2, bannerY + bannerH / 2 + 32);
  ctx.restore();

  onProgress?.(95);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) { onProgress?.(100); resolve(blob); }
      else reject(new Error("Canvas toBlob failed"));
    }, "image/png");
  });
}
