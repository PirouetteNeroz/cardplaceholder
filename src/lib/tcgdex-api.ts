// TCGdex API utilities

export type Lang = "fr" | "en" | "de" | "es" | "it" | "pt" | "ja";

export type ExportMode = "complete" | "master" | "graded" | "special";

export interface SeriesItem {
  id: string;
  name: string;
  logo?: string;
}

export interface SetItem {
  id: string;
  name: string;
  logo?: string;
  symbol?: string;
  cardCount?: { total: number; official: number };
}

export interface SeriesDetail {
  id: string;
  name: string;
  logo?: string;
  sets: SetItem[];
}

export interface CardVariants {
  normal?: boolean;
  reverse?: boolean;
  holo?: boolean;
  firstEdition?: boolean;
}

export interface CardItem {
  id: string;
  localId: string;
  name: string;
  image?: string;
  rarity?: string;
  category?: string;
  variants?: CardVariants;
}

export interface SetDetail {
  id: string;
  name: string;
  logo?: string;
  symbol?: string;
  serie: { id: string; name: string };
  cardCount: { total: number; official: number };
  cards: CardItem[];
}

export interface ProcessedCard extends CardItem {
  reverse?: boolean;
  reverseType?: "normal" | "pokeball" | "masterball";
  graded?: boolean;
}

const BASE_URL = "https://api.tcgdex.net/v2";

export const SPECIAL_RARITIES = [
  "Illustration rare", "Selten, Illustration",
  "Ultra Rare", "Ultra Selten",
  "Illustration spéciale rare", "Selten, besondere Illustration",
  "Rare Noir Blanc",
  "Double rare", "Doppelselten",
  "Hyper rare",
  "Special illustration rare",
  "Mega Hyper Rare", "Mega Hyper Selten",
  "ACE SPEC Rare",
  "Black White Rare", "Schwarz-Weiß Selten",
];

const GRADED_EXCLUDED_RARITIES = [
  "Common", "Häufig", "Peu Commune", "Selten", "Commune", "Rare",
  "Ungewöhnlich", "Double rare", "Doppelselten", "HIGH-TECG rare",
  "Uncommon", "ACE SPEC Rare",
];

export async function fetchSeries(lang: Lang): Promise<SeriesItem[]> {
  const res = await fetch(`${BASE_URL}/${lang}/series`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchSeriesDetail(lang: Lang, seriesId: string): Promise<SeriesDetail> {
  const res = await fetch(`${BASE_URL}/${lang}/series/${seriesId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchSetDetail(lang: Lang, setId: string): Promise<SetDetail> {
  const res = await fetch(`${BASE_URL}/${lang}/sets/${setId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchCardDetail(lang: Lang, cardId: string): Promise<CardItem> {
  const res = await fetch(`${BASE_URL}/${lang}/cards/${cardId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchIllustrators(lang: Lang): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/${lang}/illustrators`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface CardListItem {
  id: string;
  localId: string;
  name: string;
  image?: string;
  setName?: string;
  serieName?: string;
  releaseDate?: string;
}

export async function fetchCardsByIllustrator(lang: Lang, illustrator: string): Promise<CardListItem[]> {
  const res = await fetch(`${BASE_URL}/${lang}/cards?illustrator=${encodeURIComponent(illustrator)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cards: CardListItem[] = await res.json();
  // Filter out Pokémon Pocket cards
  let filtered = cards.filter((c) => !c.id.startsWith("tcgp-"));

  // Extract unique set IDs from card IDs (format: "setId-localId")
  const setIds = [...new Set(filtered.map((c) => c.id.replace(/-[^-]+$/, "")))];

  // Fetch set details for release dates and serie names
  const setInfoMap: Record<string, { releaseDate: string; setName: string; serieName: string }> = {};
  await Promise.all(
    setIds.map(async (setId) => {
      try {
        const setDetail = await fetchSetDetail(lang, setId);
        setInfoMap[setId] = {
          releaseDate: (setDetail as any).releaseDate || "9999-12-31",
          setName: setDetail.name,
          serieName: setDetail.serie.name,
        };
      } catch {
        setInfoMap[setId] = { releaseDate: "9999-12-31", setName: setId, serieName: "" };
      }
    })
  );

  // Enrich cards with set/serie info
  for (const card of filtered) {
    const setId = card.id.replace(/-[^-]+$/, "");
    const info = setInfoMap[setId];
    if (info) {
      card.setName = info.setName;
      card.serieName = info.serieName;
      card.releaseDate = info.releaseDate;
    }
  }

  // Sort by release date, then by localId within same set
  filtered.sort((a, b) => {
    const dateA = a.releaseDate || "9999-12-31";
    const dateB = b.releaseDate || "9999-12-31";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return a.id.localeCompare(b.id);
  });

  return filtered;
}

export function getCardImageUrl(lang: Lang, serieId: string, setId: string, localId: string): string {
  return `https://assets.tcgdex.net/${lang}/${serieId}/${setId}/${localId}/high.png`;
}

export async function processCards(
  lang: Lang,
  set: SetDetail,
  mode: ExportMode,
  onProgress?: (pct: number) => void
): Promise<ProcessedCard[]> {
  const cards: ProcessedCard[] = [];

  if (mode === "complete") {
    return set.cards.map(c => ({ ...c }));
  }

  const total = set.cards.length;
  let done = 0;

  const promises = set.cards.map(async (card) => {
    try {
      const detailed = await fetchCardDetail(lang, card.id);
      const isSpecial = detailed.rarity && SPECIAL_RARITIES.includes(detailed.rarity);

      if (mode === "master") {
        cards.push({ ...detailed });
        if (!isSpecial && detailed.variants?.reverse) {
          cards.push({ ...detailed, reverse: true, localId: detailed.localId + "_reverse" });
        }
      } else if (mode === "graded") {
        if (detailed.rarity && !GRADED_EXCLUDED_RARITIES.includes(detailed.rarity)) {
          cards.push({ ...detailed, graded: true });
        }
      } else if (mode === "special") {
        if (isSpecial) {
          cards.push({ ...detailed });
        } else {
          cards.push({ ...detailed });
          if (detailed.variants?.reverse) {
            cards.push({ ...detailed, reverse: true, reverseType: "normal", localId: detailed.localId + "_reverse" });
            cards.push({ ...detailed, reverse: true, reverseType: "pokeball", localId: detailed.localId + "_reverse_pokeball" });
            if (detailed.category !== "Dresseur") {
              cards.push({ ...detailed, reverse: true, reverseType: "masterball", localId: detailed.localId + "_reverse_masterball" });
            }
          }
        }
      }
    } catch {
      cards.push({ ...card });
    }
    done++;
    onProgress?.(Math.round((done / total) * 100));
  });

  await Promise.all(promises);
  cards.sort((a, b) => a.localId.localeCompare(b.localId));
  return cards;
}
