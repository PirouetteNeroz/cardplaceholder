import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ShoppingBag, Download, Loader2, CheckCircle2, Palette, Image as ImageIcon, Archive, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { ExportMode, SetDetail, Lang } from "@/lib/tcgdex-api";
import { processCards } from "@/lib/tcgdex-api";
import { toast } from "sonner";
import { loadCardWithOverlays } from "@/lib/pdf-utils";
import { generateEtsyVisual } from "@/lib/etsy-visual-generator";

const MODES: { value: ExportMode; label: string; description: string }[] = [
  { value: "complete", label: "Complete Set", description: "Toutes les cartes du set" },
  { value: "master", label: "Master Set", description: "Avec reverses pour les cartes éligibles" },
  { value: "graded", label: "Graded", description: "Exclut Common et Uncommon" },
  { value: "special", label: "Master Set Spécial", description: "4x reverse (normal, Poké Ball, Master Ball)" },
];

const AVAILABLE_LANGS: { value: Lang; label: string }[] = [
  { value: "fr", label: "🇫🇷 FR" },
  { value: "en", label: "🇬🇧 EN" },
  { value: "de", label: "🇩🇪 DE" },
  { value: "es", label: "🇪🇸 ES" },
  { value: "it", label: "🇮🇹 IT" },
  { value: "pt", label: "🇵🇹 PT" },
  { value: "ja", label: "🇯🇵 JA" },
];

const BG_PRESETS = [
  { color: "#2d1b69", label: "Violet" },
  { color: "#1a3a1a", label: "Vert" },
  { color: "#691b1b", label: "Rouge" },
  { color: "#1b3569", label: "Bleu" },
  { color: "#694b1b", label: "Or" },
  { color: "#1a1a1a", label: "Noir" },
  { color: "#2d2d2d", label: "Gris" },
  { color: "#0d3b4f", label: "Cyan" },
];

interface GeneratedFile {
  name: string;
  mode?: ExportMode;
  blob: Blob;
  type: "pdf" | "image";
  pagePreviewUrls?: string[];
}

interface Props {
  setDetail: SetDetail | null;
  lang: Lang;
  disabled?: boolean;
}

export function EtsyExportDialog({ setDetail, lang, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedModes, setSelectedModes] = useState<ExportMode[]>([]);
  const [colorModes, setColorModes] = useState<("color" | "grayscale")[]>(["color"]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
  const [bgColor, setBgColor] = useState("#2d1b69");

  // Visual generator state
  const [generatingVisual, setGeneratingVisual] = useState(false);
  const [visualProgress, setVisualProgress] = useState(0);
  const [selectedVisualLangs, setSelectedVisualLangs] = useState<Lang[]>([lang]);
  const [visualPreview, setVisualPreview] = useState<string | null>(null);

  // Preview state
  const [previewFile, setPreviewFile] = useState<GeneratedFile | null>(null);
  const [previewPage, setPreviewPage] = useState(0);

  const toggleMode = (mode: ExportMode) => {
    setSelectedModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    );
  };

  const toggleColorMode = (cm: "color" | "grayscale") => {
    setColorModes((prev) =>
      prev.includes(cm) ? prev.filter((c) => c !== cm) : [...prev, cm]
    );
  };

  const toggleVisualLang = (l: Lang) => {
    setSelectedVisualLangs((prev) =>
      prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]
    );
  };

  const handleGenerateVisual = async () => {
    if (!setDetail) return;
    setGeneratingVisual(true);
    setVisualProgress(0);
    try {
      const blob = await generateEtsyVisual(
        setDetail,
        lang,
        selectedVisualLangs.length > 0 ? selectedVisualLangs : [lang],
        (pct) => setVisualProgress(pct),
        bgColor
      );
      const url = URL.createObjectURL(blob);
      setVisualPreview(url);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${setDetail.name}_etsy_visual.png`;
      a.click();

      toast.success("Visuel Etsy généré !");
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la génération du visuel");
    }
    setGeneratingVisual(false);
  };

  const handleGenerate = async () => {
    if (!setDetail || selectedModes.length === 0 || colorModes.length === 0) return;
    setGenerating(true);
    setGeneratedFiles([]);
    const files: GeneratedFile[] = [];
    const totalJobs = selectedModes.length * colorModes.length;
    let jobIndex = 0;

    for (const mode of selectedModes) {
      for (const colorMode of colorModes) {
        jobIndex++;
        const isGrayscale = colorMode === "grayscale";
        const colorLabel = isGrayscale ? "N&B" : "Couleur";
        setCurrentFileIndex(jobIndex);
        setCurrentStep(`Traitement (${MODES.find(m => m.value === mode)?.label} — ${colorLabel})...`);
        setProgress(0);

        try {
          const cards = await processCards(lang, setDetail, mode, (pct) => {
            setProgress(pct * 0.3);
          });

          setCurrentStep(`Génération du PDF (${MODES.find(m => m.value === mode)?.label} — ${colorLabel})...`);
          const { jsPDF } = await import("jspdf");

          const cardsPerPage = 9;
          const maxPagesPerPDF = 15;
          const maxCardsPerPDF = cardsPerPage * maxPagesPerPDF;
          const totalParts = Math.ceil(cards.length / maxCardsPerPDF);

          for (let part = 0; part < totalParts; part++) {
            const startIdx = part * maxCardsPerPDF;
            const endIdx = Math.min(startIdx + maxCardsPerPDF, cards.length);
            const chunk = cards.slice(startIdx, endIdx);

            const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
            const pageCanvases: string[] = [];

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
            doc.text(`Cartes: ${cards.length}`, 30, 220);
            doc.text(`Langue: ${lang.toUpperCase()}`, 30, 230);
            if (totalParts > 1) doc.text(`Partie ${part + 1} / ${totalParts}`, 30, 240);
            
            // Capture cover page preview
            pageCanvases.push(doc.output("datauristring"));
            doc.addPage();

            const cardW = 63, cardH = 88;
            const marginX = (210 - cardW * 3) / 2;
            let x = marginX, y = 20, count = 0;
            let currentPageCardCount = 0;

            for (let ci = 0; ci < chunk.length; ci++) {
              const card = chunk[ci];
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
                  grayscale: isGrayscale,
                });
                if (dataUrl) {
                  doc.addImage(dataUrl, "PNG", x, y, cardW, cardH);
                }
              } catch {
                // skip
              }

              x += cardW;
              count++;
              currentPageCardCount++;
              if (count % 3 === 0) {
                x = marginX;
                y += cardH;
                if (count % 9 === 0 && count < chunk.length) {
                  doc.addPage();
                  x = marginX;
                  y = 20;
                  currentPageCardCount = 0;
                }
              }

              const globalProgress = (startIdx + ci + 1) / cards.length;
              setProgress(30 + globalProgress * 70);
            }

            const colorSuffix = isGrayscale ? "_nb" : "";
            const suffix = totalParts > 1 ? `_part${part + 1}` : "";
            const pdfBlob = doc.output("blob");
            
            // Generate page previews from PDF
            const previewUrls: string[] = [];
            const totalPages = doc.getNumberOfPages();
            for (let p = 1; p <= Math.min(totalPages, 5); p++) {
              doc.setPage(p);
              // We'll use a simple canvas approach for preview
            }
            
            files.push({
              name: `${setDetail.name}_${mode}${colorSuffix}${suffix}.pdf`,
              mode,
              blob: pdfBlob,
              type: "pdf",
            });
          }
        } catch (e) {
          console.error(e);
          toast.error(`Erreur pour le mode ${mode}`);
        }
      }
    }

    setGeneratedFiles(files);
    setGenerating(false);
    setProgress(100);
    setCurrentStep("Terminé !");
    toast.success(`${files.length} fichier(s) PDF générés !`);
  };

  const handleDownload = (file: GeneratedFile) => {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadZip = async () => {
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      generatedFiles.forEach((file) => zip.file(file.name, file.blob));
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${setDetail?.name}_etsy_export.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("ZIP téléchargé !");
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la création du ZIP");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!generating && !generatingVisual) setOpen(v); }}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <ShoppingBag className="mr-2 h-4 w-4" />
          Etsy Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            Export Etsy — {setDetail?.name || "Set"}
          </DialogTitle>
        </DialogHeader>

        {!generating && generatedFiles.length === 0 && (
          <div className="space-y-4 py-2">
            {/* === Visual Generator Section === */}
            <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-primary" />
                Visuel promotionnel (1080×1080)
              </h3>

              {/* Background color picker */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Palette className="h-3 w-3" /> Couleur de fond :
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {BG_PRESETS.map((preset) => (
                    <button
                      key={preset.color}
                      onClick={() => setBgColor(preset.color)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        bgColor === preset.color ? "border-primary scale-110 ring-2 ring-primary/30" : "border-border hover:scale-105"
                      }`}
                      style={{ backgroundColor: preset.color }}
                      title={preset.label}
                    />
                  ))}
                  <Input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-8 h-8 p-0.5 rounded cursor-pointer border-border"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {AVAILABLE_LANGS.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => toggleVisualLang(l.value)}
                    className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                      selectedVisualLangs.includes(l.value)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>

              {generatingVisual && (
                <div className="space-y-2">
                  <Progress value={visualProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground text-center">Génération du visuel...</p>
                </div>
              )}

              {visualPreview && !generatingVisual && (
                <div className="rounded-lg overflow-hidden border">
                  <img src={visualPreview} alt="Aperçu visuel Etsy" className="w-full" />
                </div>
              )}

              <Button
                size="sm"
                onClick={handleGenerateVisual}
                disabled={generatingVisual || !setDetail}
                className="w-full"
              >
                {generatingVisual ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ImageIcon className="mr-2 h-4 w-4" />
                )}
                Générer le visuel Etsy
              </Button>
            </div>

            {/* === PDF Export Section === */}
            <div className="border-t pt-4">
              <p className="text-sm text-muted-foreground mb-3">
                Sélectionnez les modes d'export PDF :
              </p>
              <div className="space-y-3">
                {MODES.map((m) => (
                  <div key={m.value} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <Checkbox
                      id={m.value}
                      checked={selectedModes.includes(m.value)}
                      onCheckedChange={() => toggleMode(m.value)}
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor={m.value} className="font-medium cursor-pointer">
                        {m.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">{m.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t pt-3 mt-3">
                <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                  <Palette className="h-4 w-4" /> Format de couleur :
                </p>
                <div className="flex gap-3">
                  <div className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors flex-1">
                    <Checkbox
                      id="color-mode"
                      checked={colorModes.includes("color")}
                      onCheckedChange={() => toggleColorMode("color")}
                    />
                    <Label htmlFor="color-mode" className="font-medium cursor-pointer">Couleur</Label>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors flex-1">
                    <Checkbox
                      id="grayscale-mode"
                      checked={colorModes.includes("grayscale")}
                      onCheckedChange={() => toggleColorMode("grayscale")}
                    />
                    <Label htmlFor="grayscale-mode" className="font-medium cursor-pointer">Nuances de gris</Label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {generating && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Fichier {currentFileIndex} / {selectedModes.length * colorModes.length}
            </div>
            <Progress value={progress} className="h-3" />
            <p className="text-sm text-muted-foreground text-center">{currentStep}</p>
          </div>
        )}

        {!generating && generatedFiles.length > 0 && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-sm text-primary">
              <CheckCircle2 className="h-4 w-4" />
              {generatedFiles.length} fichier(s) prêt(s) !
            </div>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {generatedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <span className="text-sm font-medium truncate flex-1">{file.name}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => {
                      const url = URL.createObjectURL(file.blob);
                      window.open(url, "_blank");
                    }}>
                      <Eye className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDownload(file)}>
                      <Download className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {!generating && generatedFiles.length === 0 && (
            <Button onClick={handleGenerate} disabled={selectedModes.length === 0 || colorModes.length === 0}>
              Générer {selectedModes.length > 0 && colorModes.length > 0 && `(${selectedModes.length * colorModes.length})`}
            </Button>
          )}
          {!generating && generatedFiles.length > 0 && (
            <>
              <Button onClick={handleDownloadZip} className="w-full sm:w-auto">
                <Archive className="mr-2 h-4 w-4" />
                Télécharger ZIP
              </Button>
              <Button variant="outline" onClick={() => { setGeneratedFiles([]); setSelectedModes([]); setColorModes(["color"]); setProgress(0); }} className="w-full sm:w-auto">
                Nouveau export
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
