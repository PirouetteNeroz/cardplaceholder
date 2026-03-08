import type { SetDetail, Lang } from "@/lib/tcgdex-api";

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

  // === Load sample card images ===
  const sampleCards = setDetail.cards.slice(0, 9);
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
    onProgress?.(10 + ((i + 1) / sampleCards.length) * 50);
  }

  // === Draw cards in a fan/scattered layout ===
  const cardW = 180;
  const cardH = 252;

  // Main featured cards (fan arrangement in center)
  const fanCards = cardImages.filter(Boolean).slice(0, 7) as HTMLImageElement[];
  const centerX = SIZE / 2;
  const centerY = SIZE / 2 + 20;

  // Background cards (smaller, faded)
  if (fanCards.length > 4) {
    ctx.globalAlpha = 0.3;
    const bgPositions = [
      { x: 50, y: 100, r: -15, s: 0.7 },
      { x: 830, y: 80, r: 12, s: 0.7 },
      { x: 850, y: 550, r: 8, s: 0.65 },
      { x: 30, y: 580, r: -10, s: 0.65 },
    ];
    bgPositions.forEach((pos, i) => {
      if (fanCards[3 + i]) {
        drawCardWithShadow(ctx, fanCards[3 + i], pos.x, pos.y, cardW * pos.s, cardH * pos.s, pos.r);
      }
    });
    ctx.globalAlpha = 1;
  }

  // Main fan of 3-4 cards
  const mainPositions = [
    { x: centerX - cardW - 60, y: centerY - cardH / 2 + 30, r: -8 },
    { x: centerX - cardW / 2, y: centerY - cardH / 2 - 10, r: 0 },
    { x: centerX + 60, y: centerY - cardH / 2 + 30, r: 8 },
  ];

  mainPositions.forEach((pos, i) => {
    if (fanCards[i]) {
      drawCardWithShadow(ctx, fanCards[i], pos.x, pos.y, cardW, cardH, pos.r);
    }
  });

  onProgress?.(70);

  // === Grayscale mini preview (top right) ===
  if (fanCards[0]) {
    const grayW = 140;
    const grayH = 196;
    const grayX = SIZE - grayW - 60;
    const grayY = 60;

    // Create grayscale version
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = fanCards[0].width;
    tmpCanvas.height = fanCards[0].height;
    const tmpCtx = tmpCanvas.getContext("2d")!;
    tmpCtx.drawImage(fanCards[0], 0, 0);
    const imageData = tmpCtx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
    tmpCtx.putImageData(imageData, 0, 0);
    const grayImg = await loadImage(tmpCanvas.toDataURL());
    drawCardWithShadow(ctx, grayImg, grayX, grayY, grayW, grayH, 5);

    // "Grayscale" badge
    ctx.save();
    const badgeX = grayX + grayW / 2;
    const badgeY = grayY - 5;
    ctx.translate(badgeX, badgeY);
    ctx.rotate(5 * Math.PI / 180);
    roundRect(ctx, -55, -14, 110, 28, 14);
    ctx.fillStyle = "#8B5CF6";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Grayscale", 0, 0);
    ctx.restore();
  }

  onProgress?.(80);

  // === Set name (top center) ===
  ctx.save();
  // Text shadow
  ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;

  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 52px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(setDetail.name, SIZE / 2, 30);

  // Series name
  ctx.fillStyle = "#fff";
  ctx.font = "bold 26px Arial, sans-serif";
  ctx.fillText(setDetail.serie.name, SIZE / 2, 90);
  ctx.restore();

  // === Mode badges ===
  const badgeStartY = SIZE - 200;
  const badgeSpacing = 42;
  MODE_BADGES.forEach((badge, i) => {
    const bx = SIZE / 2;
    const by = badgeStartY + i * badgeSpacing;
    const textWidth = ctx.measureText(badge.label).width || badge.label.length * 12;
    const bw = Math.max(textWidth + 40, 180);

    roundRect(ctx, bx - bw / 2, by - 15, bw, 32, 16);
    ctx.fillStyle = badge.color;
    ctx.fill();

    // White border
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, bx - bw / 2, by - 15, bw, 32, 16);
    ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badge.label, bx, by + 1);
  });

  // === "Download, Print, Cut" text ===
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 28px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Download, Print, Cut", SIZE / 2, SIZE - 60);
  ctx.restore();

  // === "Color & Grayscale" subtitle ===
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "18px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Color & Grayscale", SIZE / 2, SIZE - 32);

  // === Language flags ===
  const flagSize = 32;
  const flagGap = 10;
  const totalFlagsW = langs.length * flagSize + (langs.length - 1) * flagGap;
  let flagX = SIZE / 2 - totalFlagsW / 2;
  const flagY = 125;

  for (const l of langs) {
    try {
      const flagImg = await loadImage(FLAG_URLS[l]);
      // Draw circular flag
      ctx.save();
      ctx.beginPath();
      ctx.arc(flagX + flagSize / 2, flagY + flagSize / 2, flagSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(flagImg, flagX, flagY, flagSize, flagSize);
      ctx.restore();

      // Flag border
      ctx.beginPath();
      ctx.arc(flagX + flagSize / 2, flagY + flagSize / 2, flagSize / 2, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.stroke();
    } catch {
      // skip flag
    }
    flagX += flagSize + flagGap;
  }

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
