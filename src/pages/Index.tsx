import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Loader2, Download, BookOpen, Layers, Paintbrush } from "lucide-react";
import { toast } from "sonner";
import { NavLink } from "@/components/NavLink";
import { loadCardWithOverlays } from "@/lib/pdf-utils";

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
  { value: "master3reverse", label: "Master Set 3 Reverse (3x Pokémon, 2x Dresseur)" },
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
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfStep, setPdfStep] = useState("");
  const [maxPagesPerPDF, setMaxPagesPerPDF] = useState(15);

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
    setPdfGenerating(true);
    setPdfProgress(0);
    setPdfStep("Initialisation...");
    try {
      const { jsPDF } = await import("jspdf");
      const cardsPerPage = 9;
      const maxCardsPerPDF = cardsPerPage * maxPagesPerPDF;
      const totalParts = Math.ceil(processedCards.length / maxCardsPerPDF);

      for (let part = 0; part < totalParts; part++) {
        const startIdx = part * maxCardsPerPDF;
        const endIdx = Math.min(startIdx + maxCardsPerPDF, processedCards.length);
        const chunk = processedCards.slice(startIdx, endIdx);

        const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

        if (part === 0) {
          setPdfStep("Page de couverture...");
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
        }

        const cardW = 63, cardH = 88;
        const marginX = (210 - cardW * 3) / 2;
        let x = marginX, y = 20, count = 0;

        for (let i = 0; i < chunk.length; i++) {
          const card = chunk[i];
          const globalIdx = startIdx + i;
          setPdfStep(`Partie ${part + 1}/${totalParts} — Carte ${globalIdx + 1} / ${processedCards.length}...`);
          setPdfProgress(5 + ((globalIdx + 1) / processedCards.length) * 90);

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
            });
            if (dataUrl) {
              doc.addImage(dataUrl, "PNG", x, y, cardW, cardH);
            }
          } catch {
            // skip
          }

          x += cardW;
          count++;
          if (count % 3 === 0) {
            x = marginX;
            y += cardH;
            if (count % 9 === 0 && count < chunk.length) {
              doc.addPage();
              x = marginX;
              y = 20;
            }
          }
        }

        const suffix = totalParts > 1 ? `_part${part + 1}` : "";
        const modeLabel = mode === "complete" ? "complete-set" : mode === "master" ? "master-set" : mode === "graded" ? "graded-set" : "special-set";
        doc.save(`${lang.toUpperCase()}_${setDetail.name}_${modeLabel}${suffix}.pdf`);
      }

      setPdfStep("Finalisation...");
      setPdfProgress(100);
      toast.success(totalParts > 1 ? `${totalParts} PDFs téléchargés !` : "PDF téléchargé !");
    } catch (e) {
      toast.error("Erreur lors de la génération du PDF");
      console.error(e);
    }
    setTimeout(() => setPdfGenerating(false), 800);
  }, [setDetail, processedCards, lang, mode, maxPagesPerPDF]);

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
            <NavLink to="/illustrators" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              <Paintbrush className="h-4 w-4" /> Illustrateurs
            </NavLink>
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
            <div className="flex items-center gap-2">
              <Label htmlFor="maxPages" className="text-xs text-muted-foreground whitespace-nowrap">Pages max/PDF</Label>
              <Input
                id="maxPages"
                type="number"
                min={1}
                max={50}
                value={maxPagesPerPDF}
                onChange={(e) => setMaxPagesPerPDF(Math.max(1, parseInt(e.target.value) || 6))}
                className="w-[70px] h-9"
              />
            </div>
            <Button variant="outline" onClick={handleExportPDF} disabled={processedCards.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              PDF
            </Button>
            <EtsyExportDialog setDetail={setDetail} lang={lang} disabled={!setDetail} />
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

      <PdfProgressDialog
        open={pdfGenerating}
        progress={pdfProgress}
        currentStep={pdfStep}
      />
    </div>
  );
};

export default Index;
