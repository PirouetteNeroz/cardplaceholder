import type { SeriesItem } from "@/lib/tcgdex-api";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  series: SeriesItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

export function SeriesList({ series, selectedId, onSelect }: Props) {
  return (
    <ScrollArea className="h-[300px]">
      <div className="space-y-1 pr-3">
        {series.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors
              ${selectedId === s.id
                ? "bg-primary text-primary-foreground"
                : "hover:bg-secondary text-foreground"
              }`}
          >
            {s.name}
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
