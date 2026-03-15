// Logo URLs from original code
export const REVERSE_LOGO_URL = "https://i.postimg.cc/c4w5048f/petillant.png";
export const POKEBALL_LOGO_URL = "https://i.postimg.cc/k4SGC1c4/jeux.png";
export const MASTERBALL_LOGO_URL = "https://i.postimg.cc/k45KYwxr/jeux.png";
export const GRADED_LOGO_URL = "https://i.postimg.cc/K3mmKhcv/graded.png";

async function loadImageAsBlob(url: string): Promise<ImageBitmap> {
  const resp = await fetch(url, { mode: "cors" });
  const blob = await resp.blob();
  return createImageBitmap(blob);
}

let logosCache: {
  reverse?: ImageBitmap;
  pokeball?: ImageBitmap;
  masterball?: ImageBitmap;
  graded?: ImageBitmap;
} = {};

export async function preloadLogos() {
  if (logosCache.reverse) return logosCache;
  const [reverse, pokeball, masterball, graded] = await Promise.all([
    loadImageAsBlob(REVERSE_LOGO_URL),
    loadImageAsBlob(POKEBALL_LOGO_URL),
    loadImageAsBlob(MASTERBALL_LOGO_URL),
    loadImageAsBlob(GRADED_LOGO_URL),
  ]);
  logosCache = { reverse, pokeball, masterball, graded };
  return logosCache;
}

/**
 * Loads a card image and composites overlay logos (reverse/graded) onto it.
 * Returns a dataURL ready for jsPDF.
 */
// Target size for PDF cards (63x88mm at ~150dpi) — no need for full-res images
const TARGET_W = 374;
const TARGET_H = 520;

export async function loadCardWithOverlays(
  imgUrl: string,
  options: {
    reverse?: boolean;
    reverseType?: "normal" | "pokeball" | "masterball";
    graded?: boolean;
    grayscale?: boolean;
  }
): Promise<string | null> {
  try {
    const logos = await preloadLogos();
    const resp = await fetch(imgUrl, { mode: "cors" });
    const blob = await resp.blob();
    const img = await createImageBitmap(blob);

    const canvas = document.createElement("canvas");
    canvas.width = TARGET_W;
    canvas.height = TARGET_H;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, TARGET_W, TARGET_H);

    // Reverse logo overlay
    if (options.reverse) {
      let logo: ImageBitmap | undefined;
      if (options.reverseType === "pokeball") logo = logos.pokeball;
      else if (options.reverseType === "masterball") logo = logos.masterball;
      else logo = logos.reverse;

      if (logo) {
        const logoW = TARGET_W * 0.6;
        const logoH = (logo.height / logo.width) * logoW;
        ctx.drawImage(logo, (TARGET_W - logoW) / 2, (TARGET_H - logoH) / 2 + (150 * TARGET_H / img.height), logoW, logoH);
      }
    }

    // Graded logo overlay
    if (options.graded && logos.graded) {
      const logoW = TARGET_W * 0.5;
      const logoH = (logos.graded.height / logos.graded.width) * logoW;
      ctx.drawImage(logos.graded, 5, 5, logoW, logoH);
    }

    // Grayscale conversion
    if (options.grayscale) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      }
      ctx.putImageData(imageData, 0, 0);
    }

    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
}

/**
 * Load multiple cards in parallel batches for faster PDF generation.
 */
export async function loadCardsBatch(
  cards: { imgUrl: string; options: { reverse?: boolean; reverseType?: "normal" | "pokeball" | "masterball"; graded?: boolean; grayscale?: boolean } }[],
  batchSize = 6,
  onProgress?: (loaded: number, total: number) => void,
): Promise<(string | null)[]> {
  const results: (string | null)[] = new Array(cards.length).fill(null);
  for (let i = 0; i < cards.length; i += batchSize) {
    const batch = cards.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(c => loadCardWithOverlays(c.imgUrl, c.options))
    );
    batchResults.forEach((r, j) => { results[i + j] = r; });
    onProgress?.(Math.min(i + batchSize, cards.length), cards.length);
  }
  return results;
}
