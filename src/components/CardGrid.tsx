import type { ProcessedCard } from "@/lib/tcgdex-api";
import { getCardImageUrl, type Lang } from "@/lib/tcgdex-api";
import { CardGridItem } from "./CardGridItem";

interface Props {
  cards: ProcessedCard[];
  lang: Lang;
  serieId: string;
  setId: string;
}

function cleanLocalId(localId: string): string {
  return localId
    .replace("_reverse_pokeball", "")
    .replace("_reverse_masterball", "")
    .replace("_reverse", "");
}

export function CardGrid({ cards, lang, serieId, setId }: Props) {
  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {cards.map((card) => (
        <CardGridItem
          key={card.localId}
          card={card}
          imageUrl={getCardImageUrl(lang, serieId, setId, cleanLocalId(card.localId))}
        />
      ))}
    </div>
  );
}
