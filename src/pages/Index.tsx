import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { SeriesList } from "@/components/SeriesList";
import { SetsList } from "@/components/SetsList";
import { CardGrid } from "@/components/CardGrid";
import { CardsTable } from "@/components/CardsTable";
import {
  fetchSeries, fetchSeriesDetail, fetchSetDetail, processCards,
  type Lang, type ExportMode, type SeriesItem, type SetItem,
  type SetDetail, type ProcessedCard, type CardItem,
  SPECIAL_RARITIES,
} from "@/lib/tcgdex-api";
import { PdfProgressDialog } from "@/components/PdfProgressDialog";
import { EtsyExportDialog } from "@/components/EtsyExportDialog";
import { Loader2, Download, BookOpen, Layers } from "lucide-react";
import { toast } from "sonner";

const LANGS: { value: Lang; label: string }[] = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "it", label: "Italiano" },
  { value: "pt", label: "Português" },
  { value: "ja", label: "日本語" },
];

const MODES: { value: ExportMode; label: string }[] = [
  { value: "complete", label: "Complete Set" },
  { value: "master", label: "Master Set (avec reverses)" },
  { value: "graded", label: "Graded (excl. Common/Uncommon)" },
  { value: "special", label: "Master Set Spécial (4x reverse)" },
];

const Index = () => {
  const [lang, setLang] = useState<Lang>("fr");
  const [mode, setMode] = useState<ExportMode>("complete");
  const [series, setSeries] = useState<SeriesItem[]>([]);
  const [sets, setSets] = useState<SetItem[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<string>();
  const [selectedSet, setSelectedSet] = useState<string>();
  const [setDetail, setSetDetail] = useState<SetDetail | null>(null);
  const [processedCards, setProcessedCards] = useState<ProcessedCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [view, setView] = useState<"grid" | "table">("grid");

  const handleLoadSeries = useCallback(async () => {
    setLoading(true);
    setSets([]);
    setProcessedCards([]);
    setSetDetail(null);
    setSelectedSeries(undefined);
    setSelectedSet(undefined);
    try {
      const data = await fetchSeries(lang);
      setSeries(data);
      toast.success(`${data.length} séries chargées`);
    } catch (e) {
      toast.error("Erreur lors du chargement des séries");
      console.error(e);
    }
    setLoading(false);
  }, [lang]);

  const handleSelectSeries = useCallback(async (seriesId: string) => {
    setSelectedSeries(seriesId);
    setSelectedSet(undefined);
    setProcessedCards([]);
    setSetDetail(null);
    setLoading(true);
    try {
      const detail = await fetchSeriesDetail(lang, seriesId);
      setSets(detail.sets || []);
    } catch (e) {
      toast.error("Erreur lors du chargement des sets");
      console.error(e);
    }
    setLoading(false);
  }, [lang]);

  const handleSelectSet = useCallback(async (setId: string) => {
    setSelectedSet(setId);
    setLoading(true);
    setProgress(0);
    try {
      const detail = await fetchSetDetail(lang, setId);
      setSetDetail(detail);

      const cards = await processCards(lang, detail, mode, (pct) => setProgress(pct));
      setProcessedCards(cards);
      toast.success(`${cards.length} cartes chargées`);
    } catch (e) {
      toast.error("Erreur lors du chargement des cartes");
      console.error(e);
    }
    setLoading(false);
    setProgress(0);
  }, [lang, mode]);

  const handleExportPDF = useCallback(async () => {
    if (!setDetail || processedCards.length === 0) {
      toast.error("Veuillez d'abord charger un set");
      return;
    }
    toast.info("Export PDF en cours...");
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      // Cover page
      doc.setFontSize(32);
      doc.setFont("helvetica", "bold");
      doc.text(setDetail.name, 105, 60, { align: "center" });
      doc.setFontSize(18);
      doc.setFont("helvetica", "normal");
      doc.text("Collection Pokémon", 105, 75, { align: "center" });
      doc.setFontSize(14);
      doc.text(`Série: ${setDetail.serie.name}`, 30, 200);
      doc.text(`Mode: ${MODES.find(m => m.value === mode)?.label}`, 30, 210);
      doc.text(`Cartes: ${processedCards.length}`, 30, 220);
      doc.text(`Langue: ${lang.toUpperCase()}`, 30, 230);
      doc.addPage();

      // Cards
      const cardW = 63, cardH = 88;
      const marginX = (210 - cardW * 3) / 2;
      let x = marginX, y = 20, count = 0;

      for (const card of processedCards) {
        let localId = card.localId
          .replace("_reverse_pokeball", "")
          .replace("_reverse_masterball", "")
          .replace("_reverse", "");
        const imgUrl = `https://assets.tcgdex.net/${lang}/${setDetail.serie.id}/${setDetail.id}/${localId}/high.png`;

        try {
          const resp = await fetch(imgUrl, { mode: "cors" });
          const blob = await resp.blob();
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          doc.addImage(dataUrl, "PNG", x, y, cardW, cardH);
        } catch {
          // skip failed images
        }

        x += cardW;
        count++;
        if (count % 3 === 0) {
          x = marginX;
          y += cardH;
          if (count % 9 === 0 && count < processedCards.length) {
            doc.addPage();
            x = marginX;
            y = 20;
          }
        }
      }

      doc.save(`${setDetail.name}_${mode}.pdf`);
      toast.success("PDF téléchargé !");
    } catch (e) {
      toast.error("Erreur lors de la génération du PDF");
      console.error(e);
    }
  }, [setDetail, processedCards, lang, mode]);

  // Derive table data
  const reverseCards = processedCards.filter(c => c.reverse && !c.reverseType);
  const gradedCards = processedCards.filter(c => c.graded);
  const baseCards: CardItem[] = setDetail?.cards || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-display font-bold text-foreground">TCGdex Explorer</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 ml-auto">
            <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={mode} onValueChange={(v) => setMode(v as ExportMode)}>
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleLoadSeries} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Charger les séries
            </Button>
            <Button variant="outline" onClick={handleExportPDF} disabled={processedCards.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              PDF
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* Progress */}
        {loading && progress > 0 && (
          <Progress value={progress} className="mb-4 h-2" />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[280px_280px_1fr] gap-6">
          {/* Series panel */}
          {series.length > 0 && (
            <div className="bg-card rounded-lg p-4 card-glow">
              <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
                Séries ({series.length})
              </h2>
              <SeriesList series={series} selectedId={selectedSeries} onSelect={handleSelectSeries} />
            </div>
          )}

          {/* Sets panel */}
          {sets.length > 0 && (
            <div className="bg-card rounded-lg p-4 card-glow">
              <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
                Sets ({sets.length})
              </h2>
              <SetsList sets={sets} selectedId={selectedSet} onSelect={handleSelectSet} />
            </div>
          )}

          {/* Cards area */}
          {processedCards.length > 0 && setDetail && (
            <div className="lg:col-span-1">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-foreground">
                    {setDetail.name}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {processedCards.length} cartes • {setDetail.serie.name}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={view === "grid" ? "default" : "outline"}
                    onClick={() => setView("grid")}
                  >
                    <Layers className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={view === "table" ? "default" : "outline"}
                    onClick={() => setView("table")}
                  >
                    Table
                  </Button>
                </div>
              </div>

              {view === "grid" ? (
                <CardGrid
                  cards={processedCards}
                  lang={lang}
                  serieId={setDetail.serie.id}
                  setId={setDetail.id}
                />
              ) : (
                <div className="space-y-6">
                  <CardsTable title="Toutes les cartes" cards={baseCards} />
                  {reverseCards.length > 0 && (
                    <CardsTable title="Cartes Reverse" cards={reverseCards} />
                  )}
                  {gradedCards.length > 0 && (
                    <CardsTable title="Cartes Gradées" cards={gradedCards} />
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Empty state */}
        {series.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <BookOpen className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h2 className="font-display text-2xl font-bold text-foreground mb-2">TCGdex Explorer</h2>
            <p className="text-muted-foreground max-w-md">
              Explorez les séries, sets et cartes Pokémon TCG. Sélectionnez une langue et un mode, puis cliquez sur "Charger les séries" pour commencer.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
