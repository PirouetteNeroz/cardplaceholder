import type { Lang, CardListItem } from "@/lib/tcgdex-api";

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

function drawCardWithShadow(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
  rotation: number = 0
) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((rotation * Math.PI) / 180);

  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = 15;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 4;

  const radius = 10;
  roundRect(ctx, -w / 2, -h / 2, w, h, radius);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.save();
  roundRect(ctx, -w / 2 + 2, -h / 2 + 2, w - 4, h - 4, radius - 2);
  ctx.clip();
  ctx.drawImage(img, -w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
  ctx.restore();

  ctx.restore();
}

export async function generateIllustratorPromoVisual(
  entityName: string,
  entityLabel: string,
  cards: CardListItem[],
  lang: Lang,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  onProgress?.(5);

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  bgGrad.addColorStop(0, "#1a1035");
  bgGrad.addColorStop(0.5, "#2d1b69");
  bgGrad.addColorStop(1, "#1a1035");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Decorative stripes
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

  // Load sample card images (up to 8)
  const sampleCards = cards.slice(0, 8);
  const cardImages: (HTMLImageElement | null)[] = [];

  for (let i = 0; i < sampleCards.length; i++) {
    const card = sampleCards[i];
    if (card.image) {
      try {
        const img = await loadImage(`${card.image}/high.png`);
        cardImages.push(img);
      } catch {
        cardImages.push(null);
      }
    } else {
      cardImages.push(null);
    }
    onProgress?.(10 + ((i + 1) / sampleCards.length) * 40);
  }

  const fanCards = cardImages.filter(Boolean) as HTMLImageElement[];
  const cardW = 150;
  const cardH = 210;

  // Corner background cards
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

  // Two main cards flanking
  if (fanCards[0]) {
    drawCardWithShadow(ctx, fanCards[0], SIZE / 2 - 290, SIZE / 2 - cardH / 2 + 30, cardW, cardH, -7);
  }
  if (fanCards[1]) {
    drawCardWithShadow(ctx, fanCards[1], SIZE / 2 + 140, SIZE / 2 - cardH / 2 + 30, cardW, cardH, 7);
  }

  onProgress?.(60);

  // Entity name (large, centered)
  ctx.save();
  ctx.shadowColor = "rgba(255, 215, 0, 0.5)";
  ctx.shadowBlur = 40;
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 72px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(entityName, SIZE / 2, 80);
  ctx.restore();

  // Draw again crisp
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 72px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(entityName, SIZE / 2, 80);

  // Subtitle
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 28px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${entityLabel} Pokémon TCG`, SIZE / 2, 170);
  ctx.restore();

  // Card count
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "24px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${cards.length} cartes`, SIZE / 2, 210);

  onProgress?.(70);

  // Language flag
  const flagSize = 48;
  const flagY = 260;
  try {
    const flagImg = await loadImage(FLAG_URLS[lang]);
    ctx.save();
    ctx.beginPath();
    ctx.arc(SIZE / 2, flagY + flagSize / 2, flagSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(flagImg, SIZE / 2 - flagSize / 2, flagY, flagSize, flagSize);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(SIZE / 2, flagY + flagSize / 2, flagSize / 2, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
  } catch {
    // skip
  }

  onProgress?.(80);

  // Badges
  const badges = [
    { label: "Couleur", color: "#F97316" },
    { label: "Nuances de gris", color: "#6B7280" },
  ];
  const badgeStartY = SIZE - 200;
  const badgeSpacing = 50;

  badges.forEach((badge, i) => {
    const bx = SIZE / 2;
    const by = badgeStartY + i * badgeSpacing;
    ctx.font = "bold 20px Arial, sans-serif";
    const textWidth = ctx.measureText(badge.label).width;
    const bw = Math.max(textWidth + 50, 200);

    roundRect(ctx, bx - bw / 2, by - 18, bw, 38, 19);
    ctx.fillStyle = badge.color;
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, bx - bw / 2, by - 18, bw, 38, 19);
    ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badge.label, bx, by + 1);
  });

  // Bottom text
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 30px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Download, Print, Cut", SIZE / 2, SIZE - 50);
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
