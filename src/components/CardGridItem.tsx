import type { ProcessedCard } from "@/lib/tcgdex-api";

interface Props {
  card: ProcessedCard;
  imageUrl: string;
}

function getRarityClass(rarity?: string): string {
  if (!rarity) return "";
  const r = rarity.toLowerCase();
  if (r.includes("common") || r === "commune" || r === "häufig") return "border-t-rarity-common";
  if (r.includes("uncommon") || r === "peu commune" || r === "ungewöhnlich") return "border-t-rarity-uncommon";
  if (r.includes("ultra")) return "border-t-rarity-ultra";
  if (r.includes("illustration")) return "border-t-rarity-illustration";
  if (r.includes("double")) return "border-t-rarity-double-rare";
  if (r.includes("high") || r.includes("tech")) return "border-t-rarity-hightech";
  if (r.includes("noir") || r.includes("black") || r.includes("schwarz")) return "border-t-rarity-bw";
  if (r.includes("rare") || r === "selten") return "border-t-rarity-rare";
  return "border-t-primary";
}

function getVariantBorderClass(card: ProcessedCard): string {
  if (card.reverse) {
    if (card.reverseType === "pokeball") return "border-t-4 border-t-reverse-pokeball";
    if (card.reverseType === "masterball") return "border-t-4 border-t-reverse-masterball";
    return "border-t-4 border-t-reverse-normal";
  }
  if (card.graded) return "border-2 border-graded";
  return `border-t-4 ${getRarityClass(card.rarity)}`;
}

export function CardGridItem({ card, imageUrl }: Props) {
  let label = card.name;
  if (card.reverse) {
    if (card.reverseType === "pokeball") label += " (Rev. Poké Ball)";
    else if (card.reverseType === "masterball") label += " (Rev. Master Ball)";
    else label += " (Reverse)";
  }

  return (
    <div
      className={`bg-card rounded-lg p-2 text-center card-glow card-glow-hover transition-transform hover:-translate-y-1 ${getVariantBorderClass(card)}`}
    >
      <div className="relative">
        {card.reverse && (
          <span className="absolute top-1 right-1 bg-reverse-normal text-accent-foreground text-[10px] font-bold px-1.5 py-0.5 rounded">
            REV
          </span>
        )}
        {card.graded && (
          <span className="absolute top-1 left-1 bg-graded text-accent-foreground text-[10px] font-bold px-1.5 py-0.5 rounded">
            GRADED
          </span>
        )}
        <img
          src={imageUrl}
          alt={card.name}
          className="w-full rounded"
          loading="lazy"
        />
      </div>
      <p className="text-xs font-semibold mt-2 truncate text-card-foreground">{label}</p>
      {card.rarity && (
        <p className="text-[11px] text-muted-foreground">{card.rarity}</p>
      )}
    </div>
  );
}
