// TCGdex API utilities

export type Lang = "fr" | "en" | "de" | "es" | "it" | "pt" | "ja";

export type ExportMode = "complete" | "master" | "graded" | "special" | "master3reverse";

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
  serieId?: string;
  releaseDate?: string;
}

export async function fetchCardsByIllustrator(lang: Lang, illustrator: string): Promise<CardListItem[]> {
  const res = await fetch(`${BASE_URL}/${lang}/cards?illustrator=${encodeURIComponent(illustrator)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cards: CardListItem[] = await res.json();
  // Filter out Pokémon Pocket cards (by id prefix only)
  let filtered = cards.filter((c) => !c.id.startsWith("tcgp-"));

  // Extract unique set IDs from card IDs (format: "setId-localId")
  const setIds = [...new Set(filtered.map((c) => c.id.replace(/-[^-]+$/, "")))];

  // Fetch set details for release dates and serie names
  const setInfoMap: Record<string, { releaseDate: string; setName: string; serieName: string; serieId: string }> = {};
  await Promise.all(
    setIds.map(async (setId) => {
      try {
        const setDetail = await fetchSetDetail(lang, setId);
        setInfoMap[setId] = {
          releaseDate: (setDetail as any).releaseDate || "9999-12-31",
          setName: setDetail.name,
          serieName: setDetail.serie.name,
          serieId: (setDetail.serie as any).id || "",
        };
      } catch {
        setInfoMap[setId] = { releaseDate: "9999-12-31", setName: setId, serieName: "", serieId: "" };
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
      card.serieId = info.serieId;
      card.releaseDate = info.releaseDate;
    }
  }

  // Filter out Pocket (serie id "tcgp") and generic TCG series by name
  const EXCLUDED_SERIES_NAMES = ["jeu de cartes à collectionner", "trading card game", "sammelkartenspiel"];
  filtered = filtered.filter((c) => {
    if (c.serieId === "tcgp") return false;
    const sn = (c.serieName || "").toLowerCase();
    return !EXCLUDED_SERIES_NAMES.some((ex) => sn.includes(ex));
  });

  // Sort by release date, then by localId within same set
  filtered.sort((a, b) => {
    const dateA = a.releaseDate || "9999-12-31";
    const dateB = b.releaseDate || "9999-12-31";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return a.id.localeCompare(b.id);
  });

  return filtered;
}

// Suffixes to strip for base Pokemon name extraction
const POKEMON_SUFFIXES = [
  " ex", " EX", " Ex",
  " gx", " GX", " Gx",
  " vmax", " VMAX", " Vmax",
  " vstar", " VSTAR", " Vstar",
  " v", " V",
  " δ", " ◇", " ☆",
  "-ex", "-EX", "-gx", "-GX", "-V", "-VMAX", "-VSTAR",
  " Lv.X", " LV.X",
  " TURBO", " Turbo",
  " BREAK", " Break",
  " Radieux", " Radiant",
  " de Hisui", " d'Alola", " de Galar", " de Paldea",
  " Hisuian", " Alolan", " Galarian", " Paldean",
];

// Strip a single trailer (suffix forms, gender, etc.) from one token
function stripTrailers(name: string): string {
  let base = name.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of POKEMON_SUFFIXES) {
      if (base.endsWith(suffix)) {
        base = base.slice(0, -suffix.length).trim();
        changed = true;
      }
    }
  }
  base = base.replace(/[\s]*(♀|♂)$/, "").trim();
  return base;
}

// Strip possessive prefixes like "Misty's ", "Ondine's ", "Sacha's ", "Pierre's ", "N's ", "Team Rocket's "
function stripPossessivePrefix(name: string): string {
  // Matches "<Trainer>'s ", "<Trainer>’s ", or "<Trainer> de " (FR), keep only what comes after
  const patterns = [
    /^.+?['’]s\s+/i,         // EN/most: "Misty's Psyduck"
    /^.+?\sde\s+/i,          // FR: "Psyduck de Ondine" -> handled below differently
  ];
  for (const re of patterns) {
    const m = name.match(re);
    if (m) {
      // Only strip the "'s" form aggressively; "de" is risky -> only if first token is capitalized trainer
      if (re.source.includes("['’]s")) {
        return name.slice(m[0].length).trim();
      }
    }
  }
  return name;
}

// Returns ALL base Pokémon names contained in a card name.
// Handles: suffixes (ex/V/VMAX...), possessive prefixes ("Misty's Psyduck"),
// and combined names ("Slowpoke & Psyduck", "Slowpoke et Psyduck", "Slowpoke und Psyduck").
function extractBasePokemonNames(name: string): string[] {
  const cleaned = stripPossessivePrefix(name.trim());
  // Split on combiner tokens
  const parts = cleaned.split(/\s+(?:&|et|und|y|e|and)\s+/i);
  const result: string[] = [];
  for (const p of parts) {
    const base = stripTrailers(stripPossessivePrefix(p));
    if (base) result.push(base);
  }
  return result.length > 0 ? result : [stripTrailers(cleaned)];
}

// Backwards-compatible single-name extraction (primary base name)
function extractBasePokemonName(name: string): string {
  return extractBasePokemonNames(name)[0] || name.trim();
}

export async function fetchPokemonNames(lang: Lang): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/${lang}/cards`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cards: { id: string; name: string }[] = await res.json();
  // Filter out Pokémon Pocket cards and extract ALL unique BASE names
  const names = new Set<string>();
  for (const c of cards) {
    if (!c.id.startsWith("tcgp-")) {
      for (const n of extractBasePokemonNames(c.name)) {
        names.add(n);
      }
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export async function fetchCardsByPokemonName(lang: Lang, baseName: string): Promise<CardListItem[]> {
  // Fetch all cards and filter by base name match (a card may match via multiple names)
  const res = await fetch(`${BASE_URL}/${lang}/cards`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const allCards: CardListItem[] = await res.json();

  const target = baseName.toLowerCase();
  // Filter cards whose extracted base names include the requested base name
  let filtered = allCards.filter((c) => {
    if (c.id.startsWith("tcgp-")) return false;
    const bases = extractBasePokemonNames(c.name).map(b => b.toLowerCase());
    return bases.includes(target);
  });

  const setIds = [...new Set(filtered.map((c) => c.id.replace(/-[^-]+$/, "")))];
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

  for (const card of filtered) {
    const setId = card.id.replace(/-[^-]+$/, "");
    const info = setInfoMap[setId];
    if (info) {
      card.setName = info.setName;
      card.serieName = info.serieName;
      card.releaseDate = info.releaseDate;
    }
  }

  const EXCLUDED_SERIES = ["jeu de cartes à collectionner", "trading card game", "sammelkartenspiel"];
  filtered = filtered.filter((c) => {
    const sn = (c.serieName || "").toLowerCase();
    return !EXCLUDED_SERIES.some((ex) => sn.includes(ex));
  });

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

// Determine if a card should have reverse variants
// Force reverse for non-special cards even if the API doesn't report it
function shouldHaveReverse(detailed: CardItem, isSpecial: boolean): boolean {
  if (isSpecial) return false;
  // If the API says reverse exists, trust it
  if (detailed.variants?.reverse) return true;
  // Force reverse for common/uncommon/rare cards that the API might not have updated yet
  const REVERSE_ELIGIBLE_RARITIES = [
    "Common", "Commune", "Häufig",
    "Uncommon", "Peu Commune", "Ungewöhnlich",
    "Rare", "Selten",
    "ACE SPEC Rare",
    "HIGH-TECG rare",
  ];
  if (!detailed.rarity) return true; // No rarity info = assume eligible
  return REVERSE_ELIGIBLE_RARITIES.some(r => r.toLowerCase() === (detailed.rarity || "").toLowerCase());
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
      const hasReverse = shouldHaveReverse(detailed, !!isSpecial);

      if (mode === "master") {
        cards.push({ ...detailed });
        if (hasReverse) {
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
          if (hasReverse) {
            cards.push({ ...detailed, reverse: true, reverseType: "normal", localId: detailed.localId + "_reverse" });
            cards.push({ ...detailed, reverse: true, reverseType: "pokeball", localId: detailed.localId + "_reverse_pokeball" });
            if (detailed.category !== "Dresseur") {
              cards.push({ ...detailed, reverse: true, reverseType: "masterball", localId: detailed.localId + "_reverse_masterball" });
            }
          }
        }
      } else if (mode === "master3reverse") {
        if (isSpecial) {
          cards.push({ ...detailed });
        } else {
          cards.push({ ...detailed });
          if (hasReverse) {
            cards.push({ ...detailed, reverse: true, reverseType: "normal", localId: detailed.localId + "_reverse" });
            if (detailed.category !== "Dresseur") {
              cards.push({ ...detailed, reverse: true, reverseType: "pokeball", localId: detailed.localId + "_reverse_pokeball" });
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
