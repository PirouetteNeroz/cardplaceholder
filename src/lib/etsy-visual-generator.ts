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
    start: toHex(darken(r, 0.3), darken(g, 0.3), darken(b, 0.3)),
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
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 25;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 6;

  // Page background
  ctx.fillStyle = "#fff";
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.shadowColor = "transparent";

  // Draw page content
  ctx.drawImage(page, -w / 2, -h / 2, w, h);

  // Border
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1.5;
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

  ctx.font = "bold 20px Arial, sans-serif";
  const textW = ctx.measureText(text).width;
  const bw = textW + 30;
  const bh = 34;

  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;

  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 17);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowColor = "transparent";

  // White border for contrast
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 17);
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
  bgColor?: string
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

  // Subtle pattern overlay
  ctx.save();
  ctx.globalAlpha = 0.06;
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

  onProgress?.(5);

  // === Load card images ===
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

  // === Generate page previews ===
  const pageW = 240;
  const pageH = 340;

  const completePage = await generatePagePreview(cardDataUrls.slice(0, 9));
  const masterPage = await generatePagePreview(
    cardDataUrls.slice(9, 18).length >= 9 ? cardDataUrls.slice(9, 18) : cardDataUrls.slice(0, 9)
  );
  const gradedPage = await generatePagePreview(
    cardDataUrls.slice(18, 27).length >= 9 ? cardDataUrls.slice(18, 27) : cardDataUrls.slice(0, 9)
  );
  const grayscalePage = await generatePagePreview(cardDataUrls.slice(0, 9), true);

  onProgress?.(55);

  // === Fan layout: 4 pages spread from bottom center like a hand of cards ===
  const fanCenterX = SIZE / 2;
  const fanCenterY = SIZE + 180; // pivot below canvas
  const fanRadius = 620;
  const angles = [-22, -8, 8, 22]; // spread angles
  const pages = [gradedPage, completePage, masterPage, grayscalePage];
  const pageLabels = ["Graded Set", "Complete Set", "Master Set", "Grayscale"];
  const badgeColors = ["#ef4444", "#22c55e", "#3b82f6", "#6b7280"];

  for (let i = 0; i < pages.length; i++) {
    const angle = angles[i];
    const rad = (angle * Math.PI) / 180;
    const px = fanCenterX + Math.sin(rad) * fanRadius - pageW / 2;
    const py = fanCenterY - Math.cos(rad) * fanRadius - pageH / 2;
    drawPageOnCanvas(ctx, pages[i], px, py, pageW, pageH, angle);
  }

  onProgress?.(65);

  // === Badges along the bottom of each page ===
  for (let i = 0; i < pages.length; i++) {
    const angle = angles[i];
    const rad = (angle * Math.PI) / 180;
    const bx = fanCenterX + Math.sin(rad) * (fanRadius - pageH / 2 + 30);
    const by = fanCenterY - Math.cos(rad) * (fanRadius - pageH / 2 + 30);
    drawBadge(ctx, pageLabels[i], bx, by, badgeColors[i], angle * 0.5);
  }

  onProgress?.(70);

  // === Set logo (centered, upper area) ===
  let logoImg: HTMLImageElement | null = null;
  if (setDetail.logo) {
    try {
      logoImg = await loadImage(setDetail.logo);
    } catch {
      // skip
    }
  }

  const logoAreaY = 100;
  if (logoImg) {
    const maxLogoW = 500;
    const maxLogoH = 180;
    const logoAspect = logoImg.width / logoImg.height;
    let logoW = maxLogoW;
    let logoH = logoW / logoAspect;
    if (logoH > maxLogoH) {
      logoH = maxLogoH;
      logoW = logoH * logoAspect;
    }

    const logoX = SIZE / 2 - logoW / 2;
    const logoY = logoAreaY;

    // Glow behind logo
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 35;
    ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);
    ctx.restore();
    ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);
  } else {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 60px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(setDetail.name, SIZE / 2, logoAreaY + 80);
    ctx.restore();
  }

  onProgress?.(80);

  // === "Download · Print · Cut" header ===
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 32px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Download  ·  Print  ·  Cut", SIZE / 2, 30);
  ctx.restore();

  // === Language flags (horizontal row below logo) ===
  const flagSize = 44;
  const flagGap = 12;
  const totalFlagW = langs.length * flagSize + (langs.length - 1) * flagGap;
  let flagX = SIZE / 2 - totalFlagW / 2;
  const flagY = logoImg ? logoAreaY + 200 : logoAreaY + 160;

  for (const l of langs) {
    try {
      const flagImg = await loadImage(FLAG_URLS[l]);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 6;
      // Draw flag with rounded corners
      const fh = flagSize * 0.67;
      roundRect(ctx, flagX, flagY, flagSize, fh, 4);
      ctx.clip();
      ctx.drawImage(flagImg, flagX, flagY, flagSize, fh);
      ctx.restore();
      // Border
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1.5;
      roundRect(ctx, flagX, flagY, flagSize, fh, 4);
      ctx.stroke();
      ctx.restore();
    } catch {
      // skip
    }
    flagX += flagSize + flagGap;
  }

  onProgress?.(88);

  // === Bottom CTA ===
  ctx.save();
  // Semi-transparent dark bar
  const barH = 60;
  const barY = SIZE - barH;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(0, barY, SIZE, barH);
  
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 30px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✨  Instant Digital Download  ✨", SIZE / 2, barY + barH / 2);
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
