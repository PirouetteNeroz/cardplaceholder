import type { SetDetail, Lang } from "@/lib/tcgdex-api";
import { fetchSeriesDetail } from "@/lib/tcgdex-api";

const SIZE = 1080;

// Flag emoji to image mapping (using country flag CDN)
const FLAG_URLS: Record<Lang, string> = {
  fr: "https://flagcdn.com/w80/fr.png",
  en: "https://flagcdn.com/w80/gb.png",
  de: "https://flagcdn.com/w80/de.png",
  es: "https://flagcdn.com/w80/es.png",
  it: "https://flagcdn.com/w80/it.png",
  pt: "https://flagcdn.com/w80/pt.png",
  ja: "https://flagcdn.com/w80/jp.png",
};

const MODE_BADGES: { label: string; color: string }[] = [
  { label: "Complete Set", color: "#F97316" },
  { label: "Master Set", color: "#3B82F6" },
  { label: "Graded Set", color: "#EF4444" },
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

function drawCardWithShadow(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
  rotation: number = 0
) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((rotation * Math.PI) / 180);

  // Shadow
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = 15;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 4;

  // Card border
  const radius = 10;
  roundRect(ctx, -w / 2, -h / 2, w, h, radius);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.shadowColor = "transparent";

  // Clip and draw
  ctx.save();
  roundRect(ctx, -w / 2 + 2, -h / 2 + 2, w - 4, h - 4, radius - 2);
  ctx.clip();
  ctx.drawImage(img, -w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
  ctx.restore();

  ctx.restore();
}

export async function generateEtsyVisual(
  setDetail: SetDetail,
  lang: Lang,
  langs: Lang[],
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  onProgress?.(5);

  // === Background gradient ===
  const bgGrad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  bgGrad.addColorStop(0, "#1a1035");
  bgGrad.addColorStop(0.5, "#2d1b69");
  bgGrad.addColorStop(1, "#1a1035");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Decorative diagonal stripes
  ctx.save();
  ctx.globalAlpha = 0.08;
  for (let i = -SIZE; i < SIZE * 2; i += 60) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + SIZE, SIZE);
    ctx.lineWidth = 20;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
  }
  ctx.restore();

  onProgress?.(10);

  // === Load set logo ===
  let logoImg: HTMLImageElement | null = null;
  if (setDetail.logo) {
    try {
      logoImg = await loadImage(setDetail.logo);
    } catch {
      // skip logo
    }
  }

  onProgress?.(15);

  // === Load sample card images ===
  const sampleCards = setDetail.cards.slice(0, 8);
  const cardImages: (HTMLImageElement | null)[] = [];

  for (let i = 0; i < sampleCards.length; i++) {
    const card = sampleCards[i];
    const imgUrl = `https://assets.tcgdex.net/${lang}/${setDetail.serie.id}/${setDetail.id}/${card.localId}/high.png`;
    try {
      const img = await loadImage(imgUrl);
      cardImages.push(img);
    } catch {
      cardImages.push(null);
    }
    onProgress?.(15 + ((i + 1) / sampleCards.length) * 45);
  }

  const fanCards = cardImages.filter(Boolean) as HTMLImageElement[];
  const cardW = 150;
  const cardH = 210;

  // === Draw scattered background cards (corners) ===
  const cornerPositions = [
    { x: -20, y: -10, r: -18, s: 0.9 },
    { x: SIZE - cardW * 0.9 + 20, y: -10, r: 15, s: 0.9 },
    { x: -20, y: SIZE - cardH * 0.85 - 40, r: 12, s: 0.85 },
    { x: SIZE - cardW * 0.85 + 20, y: SIZE - cardH * 0.85 - 40, r: -10, s: 0.85 },
    { x: SIZE / 2 - cardW * 0.7 / 2 - 280, y: SIZE / 2 - cardH * 0.7 / 2 + 20, r: -6, s: 0.7 },
    { x: SIZE / 2 - cardW * 0.7 / 2 + 280, y: SIZE / 2 - cardH * 0.7 / 2 + 20, r: 6, s: 0.7 },
  ];

  ctx.globalAlpha = 0.35;
  cornerPositions.forEach((pos, i) => {
    if (fanCards[i]) {
      drawCardWithShadow(ctx, fanCards[i], pos.x, pos.y, cardW * pos.s, cardH * pos.s, pos.r);
    }
  });
  ctx.globalAlpha = 1;

  // === Two main cards flanking the logo ===
  if (fanCards[0]) {
    drawCardWithShadow(ctx, fanCards[0], SIZE / 2 - 290, SIZE / 2 - cardH / 2 + 30, cardW, cardH, -7);
  }
  if (fanCards[1]) {
    drawCardWithShadow(ctx, fanCards[1], SIZE / 2 + 140, SIZE / 2 - cardH / 2 + 30, cardW, cardH, 7);
  }

  onProgress?.(70);

  // === Set logo (large, centered) ===
  if (logoImg) {
    const maxLogoW = 420;
    const maxLogoH = 200;
    const logoAspect = logoImg.width / logoImg.height;
    let logoW = maxLogoW;
    let logoH = logoW / logoAspect;
    if (logoH > maxLogoH) {
      logoH = maxLogoH;
      logoW = logoH * logoAspect;
    }

    // Glow behind logo
    ctx.save();
    ctx.shadowColor = "rgba(255, 215, 0, 0.5)";
    ctx.shadowBlur = 40;
    ctx.drawImage(logoImg, SIZE / 2 - logoW / 2, 60, logoW, logoH);
    ctx.restore();

    // Draw logo again crisp on top
    ctx.drawImage(logoImg, SIZE / 2 - logoW / 2, 60, logoW, logoH);
  } else {
    // Fallback: text title
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 56px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(setDetail.name, SIZE / 2, 80);
    ctx.restore();
  }

  // === Series name below logo ===
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 28px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(setDetail.serie.name, SIZE / 2, 280);
  ctx.restore();

  // === Set name if logo exists ===
  if (logoImg) {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 40px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(setDetail.name, SIZE / 2, 315);
    ctx.restore();
  }

  onProgress?.(80);

  // === Language flags ===
  const flagSize = 36;
  const flagGap = 12;
  const totalFlagsW = langs.length * flagSize + (langs.length - 1) * flagGap;
  let flagX = SIZE / 2 - totalFlagsW / 2;
  const flagY = 370;

  for (const l of langs) {
    try {
      const flagImg = await loadImage(FLAG_URLS[l]);
      ctx.save();
      ctx.beginPath();
      ctx.arc(flagX + flagSize / 2, flagY + flagSize / 2, flagSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(flagImg, flagX, flagY, flagSize, flagSize);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(flagX + flagSize / 2, flagY + flagSize / 2, flagSize / 2, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.stroke();
    } catch {
      // skip
    }
    flagX += flagSize + flagGap;
  }

  // === Mode badges (bottom area) ===
  const badgeStartY = SIZE - 220;
  const badgeSpacing = 44;
  MODE_BADGES.forEach((badge, i) => {
    const bx = SIZE / 2;
    const by = badgeStartY + i * badgeSpacing;
    ctx.font = "bold 18px Arial, sans-serif";
    const textWidth = ctx.measureText(badge.label).width;
    const bw = Math.max(textWidth + 50, 200);

    roundRect(ctx, bx - bw / 2, by - 17, bw, 36, 18);
    ctx.fillStyle = badge.color;
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, bx - bw / 2, by - 17, bw, 36, 18);
    ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badge.label, bx, by + 1);
  });

  // === "Download, Print, Cut" ===
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 30px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Download, Print, Cut", SIZE / 2, SIZE - 60);
  ctx.restore();

  // === "Color & Grayscale" ===
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "20px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Color & Grayscale", SIZE / 2, SIZE - 30);

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
