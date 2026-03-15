// Logo URLs from original code
export const REVERSE_LOGO_URL = "https://i.postimg.cc/c4w5048f/petillant.png";
export const POKEBALL_LOGO_URL = "https://i.postimg.cc/k4SGC1c4/jeux.png";
export const MASTERBALL_LOGO_URL = "https://i.postimg.cc/k45KYwxr/jeux.png";
export const GRADED_LOGO_URL = "https://i.postimg.cc/K3mmKhcv/graded.png";

const imageBitmapCache = new Map<string, ImageBitmap>();

async function loadImageAsBlob(url: string): Promise<ImageBitmap> {
  const cached = imageBitmapCache.get(url);
  if (cached) return cached;
  const resp = await fetch(url, { mode: "cors" });
  const blob = await resp.blob();
  const bmp = await createImageBitmap(blob);
  imageBitmapCache.set(url, bmp);
  return bmp;
}

/** Clear the image cache (e.g. when switching sets) */
export function clearImageCache() {
  imageBitmapCache.clear();
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
    const img = await loadImageAsBlob(imgUrl);

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    // Reverse logo overlay
    if (options.reverse) {
      let logo: ImageBitmap | undefined;
      if (options.reverseType === "pokeball") logo = logos.pokeball;
      else if (options.reverseType === "masterball") logo = logos.masterball;
      else logo = logos.reverse;

      if (logo) {
        const logoW = img.width * 0.6;
        const logoH = (logo.height / logo.width) * logoW;
        ctx.drawImage(logo, (img.width - logoW) / 2, (img.height - logoH) / 2 + 150, logoW, logoH);
      }
    }

    // Graded logo overlay
    if (options.graded && logos.graded) {
      const logoW = img.width * 0.5;
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

    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
