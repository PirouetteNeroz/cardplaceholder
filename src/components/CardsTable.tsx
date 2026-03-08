import type { CardItem } from "@/lib/tcgdex-api";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface Props {
  title: string;
  cards: CardItem[];
}

export function CardsTable({ title, cards }: Props) {
  if (cards.length === 0) return null;

  return (
    <div>
      <h3 className="font-display text-lg font-semibold mb-3 text-foreground">{title}</h3>
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-primary">
              <TableHead className="text-primary-foreground font-semibold">ID</TableHead>
              <TableHead className="text-primary-foreground font-semibold">Nom</TableHead>
              <TableHead className="text-primary-foreground font-semibold">Rareté</TableHead>
              <TableHead className="text-primary-foreground font-semibold">Variants</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards.map((card) => {
              const variants = card.variants
                ? Object.entries(card.variants)
                    .filter(([, v]) => v)
                    .map(([k]) => k)
                    .join(", ")
                : "Aucun";
              return (
                <TableRow key={card.localId} className="hover:bg-muted/50">
                  <TableCell className="font-mono text-sm">{card.localId}</TableCell>
                  <TableCell>{card.name}</TableCell>
                  <TableCell>{card.rarity || "N/A"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{variants}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
