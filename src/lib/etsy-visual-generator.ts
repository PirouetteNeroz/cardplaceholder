import type { SetDetail, Lang } from "@/lib/tcgdex-api";
import { fetchSeriesDetail, processCards, type ExportMode } from "@/lib/tcgdex-api";
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

const MODE_CONFIGS: { mode: ExportMode; label: string; badgeColor: string }[] = [
  { mode: "complete", label: "Complete Set", badgeColor: "#22c55e" },
  { mode: "master", label: "Master Set", badgeColor: "#3b82f6" },
  { mode: "graded", label: "Graded Set", badgeColor: "#ef4444" },
];

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
    start: toHex(darken(r, 0.5), darken(g, 0.5), darken(b, 0.5)),
    mid: hex,
    end: toHex(darken(r, 0.5), darken(g, 0.5), darken(b, 0.5)),
  };
}

/** Generate a mini PDF page preview (3x3 card grid) on an offscreen canvas */
async function generatePagePreview(
  cardImages: (string | null)[],
  grayscale: boolean = false
): Promise<HTMLCanvasElement> {
  const pageW = 420;
  const pageH = 594; // A4 ratio
  const page = document.createElement("canvas");
  page.width = pageW;
  page.height = pageH;
  const pctx = page.getContext("2d")!;

  // White page background
  pctx.fillStyle = "#ffffff";
  pctx.fillRect(0, 0, pageW, pageH);

  const cardW = 126;
  const cardH = 176;
  const marginX = (pageW - cardW * 3) / 2;
  const marginY = 15;
  let drawn = 0;

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
        drawn++;
      } catch {
        // skip
      }
    }
  }

  // Grayscale filter
  if (grayscale && drawn > 0) {
    const imageData = pctx.getImageData(0, 0, pageW, pageH);
    const data = imageData.data;
    for (let p = 0; p < data.length; p += 4) {
      const gray = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
      data[p] = gray;
      data[p + 1] = gray;
      data[p + 2] = gray;
    }
    pctx.putImageData(imageData, 0, 0);
  }

  return page;
}

/** Draw a page preview with shadow and rotation on the main canvas */
function drawPageOnCanvas(
  ctx: CanvasRenderingContext2D,
  page: HTMLCanvasElement,
  x: number, y: number, w: number, h: number,
  rotation: number = 0
) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((rotation * Math.PI) / 180);

  // Shadow
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 5;
  ctx.shadowOffsetY = 5;

  // Page background
  ctx.fillStyle = "#fff";
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.shadowColor = "transparent";

  // Draw page content
  ctx.drawImage(page, -w / 2, -h / 2, w, h);

  // Subtle border
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2, -h / 2, w, h);

  ctx.restore();
}

/** Draw a badge label */
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

  // Shadow
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;

  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 8);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowColor = "transparent";

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
  bgColor?: string
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  onProgress?.(2);

  // === Solid background ===
  ctx.fillStyle = bgColor || "#e91e8c";
  ctx.fillRect(0, 0, SIZE, SIZE);

  onProgress?.(5);

  // === Load card images for page previews ===
  // We need ~27 cards (3 pages x 9 cards) for the collage
  const sampleCards = setDetail.cards.slice(0, 27);
  const cardDataUrls: (string | null)[] = [];

  for (let i = 0; i < sampleCards.length; i++) {
    const card = sampleCards[i];
    const imgUrl = `https://assets.tcgdex.net/${lang}/${setDetail.serie.id}/${setDetail.id}/${card.localId}/high.png`;
    try {
      const dataUrl = await loadCardWithOverlays(imgUrl, {
        reverse: false,
        grayscale: false,
      });
      cardDataUrls.push(dataUrl);
    } catch {
      cardDataUrls.push(null);
    }
    onProgress?.(5 + ((i + 1) / sampleCards.length) * 40);
  }

  onProgress?.(45);

  // === Generate page previews for each mode ===
  const pageW = 280;
  const pageH = 396;

  // Complete Set page (cards 0-8)
  const completePage = await generatePagePreview(cardDataUrls.slice(0, 9));
  // Master Set page (cards 9-17)  
  const masterPage = await generatePagePreview(
    cardDataUrls.slice(9, 18).length >= 9 ? cardDataUrls.slice(9, 18) : cardDataUrls.slice(0, 9)
  );
  // Graded Set page (cards 18-26)
  const gradedPage = await generatePagePreview(
    cardDataUrls.slice(18, 27).length >= 9 ? cardDataUrls.slice(18, 27) : cardDataUrls.slice(0, 9)
  );
  // Grayscale page
  const grayscalePage = await generatePagePreview(cardDataUrls.slice(0, 9), true);

  onProgress?.(55);

  // === Draw pages in collage layout matching reference ===
  // Grayscale - top right, slightly rotated
  drawPageOnCanvas(ctx, grayscalePage, 640, -30, pageW * 0.85, pageH * 0.85, 5);

  // Complete Set - center left, overlapping
  drawPageOnCanvas(ctx, completePage, 120, 130, pageW, pageH, -3);

  // Master Set - center, slightly behind
  drawPageOnCanvas(ctx, masterPage, 330, 60, pageW * 0.95, pageH * 0.95, 2);

  // Graded Set - bottom left
  drawPageOnCanvas(ctx, gradedPage, -40, 450, pageW, pageH, -5);

  // Another graded variation bottom
  drawPageOnCanvas(ctx, gradedPage, 150, 550, pageW * 0.9, pageH * 0.9, 3);

  onProgress?.(65);

  // === Draw mode badges near their pages ===
  drawBadge(ctx, "Grayscale", 780, 50, "#6b7280", 5);
  drawBadge(ctx, "Complete Set", 220, 200, "#22c55e", -5);
  drawBadge(ctx, "Master Set", 480, 140, "#3b82f6", 3);
  drawBadge(ctx, "Graded Set", 100, 520, "#ef4444", -8);

  onProgress?.(70);

  // === Set logo (large, centered) ===
  let logoImg: HTMLImageElement | null = null;
  if (setDetail.logo) {
    try {
      logoImg = await loadImage(setDetail.logo);
    } catch {
      // skip
    }
  }

  if (logoImg) {
    const maxLogoW = 450;
    const maxLogoH = 250;
    const logoAspect = logoImg.width / logoImg.height;
    let logoW = maxLogoW;
    let logoH = logoW / logoAspect;
    if (logoH > maxLogoH) {
      logoH = maxLogoH;
      logoW = logoH * logoAspect;
    }

    const logoX = SIZE / 2 - logoW / 2 + 40;
    const logoY = SIZE / 2 - logoH / 2 + 30;

    // White glow/shadow behind logo for readability
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 30;
    ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);
    ctx.restore();

    // Crisp logo on top
    ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);
  } else {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 64px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(setDetail.name, SIZE / 2, SIZE / 2);
    ctx.restore();
  }

  onProgress?.(80);

  // === "Download, Print, Cut" top left ===
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#000";
  ctx.font = "bold 36px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Download, Print, Cut", 25, 20);
  ctx.restore();

  // === Language flags (top left, below text) ===
  const flagSize = 40;
  const flagGap = 8;
  let flagX = 30;
  const flagY = 70;

  for (const l of langs) {
    try {
      const flagImg = await loadImage(FLAG_URLS[l]);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 4;
      ctx.drawImage(flagImg, flagX, flagY, flagSize, flagSize * 0.67);
      ctx.restore();
    } catch {
      // skip
    }
    flagX += flagSize + flagGap;
  }

  onProgress?.(88);

  // === "✨ Download ✨" bottom center ===
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#000";
  ctx.font = "bold 52px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("✨ Download ✨", SIZE / 2, SIZE - 30);
  ctx.restore();

  onProgress?.(95);

  // === Export as blob ===
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
