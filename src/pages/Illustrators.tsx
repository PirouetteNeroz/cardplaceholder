import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchIllustrators, fetchCardsByIllustrator, type Lang, type CardListItem } from "@/lib/tcgdex-api";
import { Loader2, Paintbrush, Search, ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { NavLink } from "@/components/NavLink";
import { PdfProgressDialog } from "@/components/PdfProgressDialog";

const LANGS: { value: Lang; label: string }[] = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "it", label: "Italiano" },
  { value: "pt", label: "Português" },
  { value: "ja", label: "日本語" },
];

const Illustrators = () => {
  const [lang, setLang] = useState<Lang>("fr");
  const [illustrators, setIllustrators] = useState<string[]>([]);
  const [filteredIllustrators, setFilteredIllustrators] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIllustrator, setSelectedIllustrator] = useState<string | null>(null);
  const [cards, setCards] = useState<CardListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);

  // PDF state
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfStep, setPdfStep] = useState("");
  const [maxPagesPerPDF, setMaxPagesPerPDF] = useState(15);

  const handleLoad = useCallback(async () => {
    setLoading(true);
    setIllustrators([]);
    setFilteredIllustrators([]);
    setSelectedIllustrator(null);
    setCards([]);
    setSearch("");
    try {
      const data = await fetchIllustrators(lang);
      const sorted = data.sort((a, b) => a.localeCompare(b));
      setIllustrators(sorted);
      setFilteredIllustrators(sorted);
      toast.success(`${sorted.length} illustrateurs chargés`);
    } catch (e) {
      toast.error("Erreur lors du chargement des illustrateurs");
      console.error(e);
    }
    setLoading(false);
  }, [lang]);

  const handleSearch = (value: string) => {
    setSearch(value);
    const q = value.toLowerCase();
    setFilteredIllustrators(
      illustrators.filter((name) => name.toLowerCase().includes(q))
    );
  };

  const handleSelectIllustrator = useCallback(async (name: string) => {
    setSelectedIllustrator(name);
    setLoadingCards(true);
    try {
      const data = await fetchCardsByIllustrator(lang, name);
      setCards(data);
      toast.success(`${data.length} cartes par ${name}`);
    } catch (e) {
      toast.error("Erreur lors du chargement des cartes");
      console.error(e);
    }
    setLoadingCards(false);
  }, [lang]);

  const handleExportPDF = useCallback(async () => {
    if (!selectedIllustrator || cards.length === 0) {
      toast.error("Veuillez d'abord sélectionner un illustrateur");
      return;
    }
    setPdfGenerating(true);
    setPdfProgress(0);
    setPdfStep("Initialisation...");
    try {
      const { jsPDF } = await import("jspdf");
      const cardsPerPage = 9;
      const maxCardsPerPDF = cardsPerPage * maxPagesPerPDF;
      const totalParts = Math.ceil(cards.length / maxCardsPerPDF);

      for (let part = 0; part < totalParts; part++) {
        const startIdx = part * maxCardsPerPDF;
        const endIdx = Math.min(startIdx + maxCardsPerPDF, cards.length);
        const chunk = cards.slice(startIdx, endIdx);

        const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

        // Cover page
        if (part === 0) {
          setPdfStep("Page de couverture...");
          doc.setFontSize(32);
          doc.setFont("helvetica", "bold");
          doc.text(selectedIllustrator, 105, 60, { align: "center" });
          doc.setFontSize(18);
          doc.setFont("helvetica", "normal");
          doc.text("Illustrateur Pokémon TCG", 105, 75, { align: "center" });
          doc.setFontSize(14);
          doc.text(`Cartes: ${cards.length}`, 30, 200);
          doc.text(`Langue: ${lang.toUpperCase()}`, 30, 210);
          if (totalParts > 1) doc.text(`Partie ${part + 1} / ${totalParts}`, 30, 220);
          doc.addPage();
        }

        const cardW = 63, cardH = 88;
        const labelH = 10; // space for label below card
        const totalCardH = cardH + labelH;
        const marginX = (210 - cardW * 3) / 2;
        let x = marginX, y = 15, count = 0;

        for (let i = 0; i < chunk.length; i++) {
          const card = chunk[i];
          const globalIdx = startIdx + i;
          setPdfStep(`Partie ${part + 1}/${totalParts} — Carte ${globalIdx + 1} / ${cards.length}...`);
          setPdfProgress(5 + ((globalIdx + 1) / cards.length) * 90);

          if (card.image) {
            const imgUrl = `${card.image}/high.png`;
            try {
              const resp = await fetch(imgUrl, { mode: "cors" });
              const blob = await resp.blob();
              const img = await createImageBitmap(blob);
              const canvas = document.createElement("canvas");
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext("2d")!;
              ctx.drawImage(img, 0, 0);
              const dataUrl = canvas.toDataURL("image/png");
              doc.addImage(dataUrl, "PNG", x, y, cardW, cardH);
            } catch {
              // skip
            }
          }

          // Draw serie name + card number below the card
          const labelText = `${card.serieName || ""} #${card.localId}`;
          doc.setFontSize(7);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 100, 100);
          doc.text(labelText, x + cardW - 1, y + cardH + 4, { align: "right" });
          doc.setTextColor(0, 0, 0);

          x += cardW;
          count++;
          if (count % 3 === 0) {
            x = marginX;
            y += totalCardH;
            if (count % 9 === 0 && count < chunk.length) {
              doc.addPage();
              x = marginX;
              y = 15;
            }
          }
        }

        const suffix = totalParts > 1 ? `_part${part + 1}` : "";
        doc.save(`${selectedIllustrator}${suffix}.pdf`);
      }

      setPdfStep("Finalisation...");
      setPdfProgress(100);
      toast.success(totalParts > 1 ? `${totalParts} PDFs téléchargés !` : "PDF téléchargé !");
    } catch (e) {
      toast.error("Erreur lors de la génération du PDF");
      console.error(e);
    }
    setTimeout(() => setPdfGenerating(false), 800);
  }, [selectedIllustrator, cards, lang, maxPagesPerPDF]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <Paintbrush className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-display font-bold text-foreground">Illustrateurs</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 ml-auto">
            <NavLink to="/" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" /> Explorer
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
            <Button onClick={handleLoad} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Charger les illustrateurs
            </Button>
            <div className="flex items-center gap-2">
              <Label htmlFor="maxPagesIllustrator" className="text-xs text-muted-foreground whitespace-nowrap">Pages max/PDF</Label>
              <Input
                id="maxPagesIllustrator"
                type="number"
                min={1}
                max={50}
                value={maxPagesPerPDF}
                onChange={(e) => setMaxPagesPerPDF(Math.max(1, parseInt(e.target.value) || 6))}
                className="w-[70px] h-9"
              />
            </div>
            <Button variant="outline" onClick={handleExportPDF} disabled={cards.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              PDF
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {illustrators.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <Paintbrush className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h2 className="font-display text-2xl font-bold text-foreground mb-2">Illustrateurs</h2>
            <p className="text-muted-foreground max-w-md">
              Parcourez tous les illustrateurs de cartes Pokémon TCG. Sélectionnez une langue puis cliquez sur "Charger les illustrateurs".
            </p>
          </div>
        )}

        {illustrators.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
            {/* Illustrators list */}
            <div className="bg-card rounded-lg p-4 card-glow">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un illustrateur..."
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                {filteredIllustrators.length} illustrateur{filteredIllustrators.length > 1 ? "s" : ""}
              </p>
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="space-y-1 pr-3">
                  {filteredIllustrators.map((name) => (
                    <button
                      key={name}
                      onClick={() => handleSelectIllustrator(name)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        selectedIllustrator === name
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "hover:bg-muted text-foreground"
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Cards area */}
            <div>
              {selectedIllustrator && (
                <div className="mb-4">
                  <h2 className="font-display text-xl font-bold text-foreground">{selectedIllustrator}</h2>
                  <p className="text-sm text-muted-foreground">
                    {loadingCards ? "Chargement..." : `${cards.length} carte${cards.length > 1 ? "s" : ""}`}
                  </p>
                </div>
              )}

              {loadingCards && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}

              {!loadingCards && cards.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {cards.map((card) => (
                    <div
                      key={card.id}
                      className="bg-card rounded-lg p-2 text-center card-glow card-glow-hover transition-transform hover:-translate-y-1 border-t-4 border-t-primary"
                    >
                      {card.image && (
                        <img
                          src={`${card.image}/high.png`}
                          alt={card.name}
                          className="w-full rounded"
                          loading="lazy"
                        />
                      )}
                      <p className="text-xs font-semibold mt-2 truncate text-card-foreground">{card.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{card.serieName} #{card.localId}</p>
                    </div>
                  ))}
                </div>
              )}

              {!loadingCards && !selectedIllustrator && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Paintbrush className="h-12 w-12 text-muted-foreground/20 mb-3" />
                  <p className="text-muted-foreground">Sélectionnez un illustrateur pour voir ses cartes</p>
                </div>
              )}
            </div>
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

export default Illustrators;
