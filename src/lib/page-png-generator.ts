import type { Lang, SetDetail, ProcessedCard, ExportMode } from "@/lib/tcgdex-api";
import { processCards, fetchSetDetail } from "@/lib/tcgdex-api";
import { loadCardWithOverlays } from "@/lib/pdf-utils";

const CARDS_PER_PAGE = 9;
const CARD_W_MM = 63;
const CARD_H_MM = 88;
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const DPI_SCALE = 4; // High-res PNG

/**
 * Render a single page of cards (3x3 grid) as a PNG blob.
 */
export async function renderPageAsPng(
  cards: ProcessedCard[],
  pageIndex: number,
  lang: Lang,
  setDetail: SetDetail,
  options: { grayscale?: boolean } = {},
  onProgress?: (pct: number) => void
): Promise<Blob | null> {
  const startIdx = pageIndex * CARDS_PER_PAGE;
  const pageCards = cards.slice(startIdx, startIdx + CARDS_PER_PAGE);
  if (pageCards.length === 0) return null;

  const canvasW = PAGE_W_MM * DPI_SCALE;
  const canvasH = PAGE_H_MM * DPI_SCALE;
  const cardW = CARD_W_MM * DPI_SCALE;
  const cardH = CARD_H_MM * DPI_SCALE;
  const marginX = (canvasW - cardW * 3) / 2;
  const marginY = 20 * DPI_SCALE;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d")!;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);

  for (let i = 0; i < pageCards.length; i++) {
    const card = pageCards[i];
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = marginX + col * cardW;
    const y = marginY + row * cardH;

    let localId = card.localId
      .replace("_reverse_pokeball", "")
      .replace("_reverse_masterball", "")
      .replace("_reverse", "");
    const imgUrl = `https://assets.tcgdex.net/${lang}/${setDetail.serie.id}/${setDetail.id}/${localId}/high.png`;

    try {
      const dataUrl = await loadCardWithOverlays(imgUrl, {
        reverse: card.reverse,
        reverseType: card.reverseType,
        graded: card.graded,
        grayscale: options.grayscale,
      });
      if (dataUrl) {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = dataUrl;
        });
        ctx.drawImage(img, x, y, cardW, cardH);
      }
    } catch {
      // skip card
    }
    onProgress?.(((i + 1) / pageCards.length) * 100);
  }

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

/**
 * Calculate total pages for a set of cards.
 */
export function getTotalPages(cardCount: number): number {
  return Math.ceil(cardCount / CARDS_PER_PAGE);
}
