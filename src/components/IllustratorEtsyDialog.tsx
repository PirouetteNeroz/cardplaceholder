import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ShoppingBag, Download, Loader2, CheckCircle2, Palette, Archive, Image, Eye } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { Lang, CardListItem } from "@/lib/tcgdex-api";
import { toast } from "sonner";

const BG_PRESETS = [
  { color: "#e91e8c", label: "Rose" },
  { color: "#2d1b69", label: "Violet" },
  { color: "#1a3a1a", label: "Vert" },
  { color: "#691b1b", label: "Rouge" },
  { color: "#1b3569", label: "Bleu" },
  { color: "#694b1b", label: "Or" },
  { color: "#1a1a1a", label: "Noir" },
  { color: "#0d3b4f", label: "Cyan" },
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

interface GeneratedFile {
  name: string;
  blob: Blob;
}

interface Props {
  entityName: string | null;
  entityLabel?: string;
  cards: CardListItem[];
  lang: Lang;
  disabled?: boolean;
  fetchCardsForLang?: (lang: Lang) => Promise<CardListItem[]>;
}

export function IllustratorEtsyDialog({ entityName, entityLabel = "Illustrateur", cards, lang, disabled, fetchCardsForLang }: Props) {
  const [open, setOpen] = useState(false);
  const [colorModes, setColorModes] = useState<("color" | "grayscale")[]>(["color"]);
  const [selectedPdfLangs, setSelectedPdfLangs] = useState<Lang[]>([lang]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
  const [maxPagesPerPDF, setMaxPagesPerPDF] = useState(15);
  const [includePromoVisual, setIncludePromoVisual] = useState(true);
  const [bgColor, setBgColor] = useState("#e91e8c");

  const toggleColorMode = (cm: "color" | "grayscale") => {
    setColorModes((prev) =>
      prev.includes(cm) ? prev.filter((c) => c !== cm) : [...prev, cm]
    );
  };

  const togglePdfLang = (l: Lang) => {
    setSelectedPdfLangs((prev) =>
      prev.includes(l) ? (prev.length > 1 ? prev.filter((x) => x !== l) : prev) : [...prev, l]
    );
  };

  const totalFileCount = colorModes.length * selectedPdfLangs.length + (includePromoVisual ? 1 : 0);

  const handleGenerate = async () => {
    if (!entityName || cards.length === 0 || colorModes.length === 0 || selectedPdfLangs.length === 0) return;
    setGenerating(true);
    setGeneratedFiles([]);
    const files: GeneratedFile[] = [];
    const totalJobs = totalFileCount;
    let jobIndex = 0;

    // Generate promo visual first
    if (includePromoVisual) {
      jobIndex++;
      setCurrentStep("Génération du visuel promo...");
      setProgress((jobIndex / totalJobs) * 10);
      try {
        const { generateIllustratorPromoVisual } = await import("@/lib/illustrator-promo-generator");
        const promoBlob = await generateIllustratorPromoVisual(
          entityName,
          entityLabel,
          cards,
          lang,
          (pct) => setProgress((jobIndex - 1) / totalJobs * 100 + pct / totalJobs),
          bgColor
        );
        files.push({ name: `${entityName}_promo.png`, blob: promoBlob });
      } catch (e) {
        console.error(e);
        toast.error("Erreur lors de la génération du visuel promo");
      }
    }

    for (const pdfLang of selectedPdfLangs) {
      let langCards: CardListItem[];
      if (pdfLang === lang) {
        langCards = cards;
      } else if (fetchCardsForLang) {
        try {
          setCurrentStep(`Chargement des cartes en ${pdfLang.toUpperCase()}...`);
          langCards = await fetchCardsForLang(pdfLang);
        } catch {
          toast.error(`Impossible de charger les cartes en ${pdfLang.toUpperCase()}`);
          continue;
        }
      } else {
        langCards = cards; // fallback to current cards
      }

      for (const colorMode of colorModes) {
        jobIndex++;
        const isGrayscale = colorMode === "grayscale";
        const colorLabel = isGrayscale ? "N&B" : "Couleur";
        const langLabel = pdfLang.toUpperCase();
        setCurrentStep(`${langLabel} — Génération PDF (${colorLabel})...`);

        try {
          const { jsPDF } = await import("jspdf");
          const cardsPerPage = 9;
          // For Pokémon entities: always 1 single PDF (no fragmentation)
          const isPokemonEntity = entityLabel === "Pokémon";
          const maxCardsPerPDF = isPokemonEntity ? langCards.length : cardsPerPage * maxPagesPerPDF;
          const totalParts = isPokemonEntity ? 1 : Math.ceil(langCards.length / maxCardsPerPDF);

          for (let part = 0; part < totalParts; part++) {
            const startIdx = part * maxCardsPerPDF;
            const endIdx = Math.min(startIdx + maxCardsPerPDF, langCards.length);
            const chunk = langCards.slice(startIdx, endIdx);

            const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

            doc.setFontSize(32);
            doc.setFont("helvetica", "bold");
            doc.text(entityName, 105, 60, { align: "center" });
            doc.setFontSize(18);
            doc.text(`${entityLabel} Pokémon TCG`, 105, 75, { align: "center" });
            doc.setFontSize(14);
            doc.text(`Cartes: ${langCards.length}`, 30, 200);
            doc.text(`Langue: ${langLabel}`, 30, 210);
            doc.text(`Format: ${colorLabel}`, 30, 220);
            if (totalParts > 1) doc.text(`Partie ${part + 1} / ${totalParts}`, 30, 230);
            doc.addPage();

            const cardW = 63, cardH = 88;
            const marginX = (210 - cardW * 3) / 2;
            let x = marginX, y = 20, count = 0;

            for (let i = 0; i < chunk.length; i++) {
              const card = chunk[i];
              const globalIdx = startIdx + i;
              setCurrentStep(`${langLabel} — ${colorLabel} — Carte ${globalIdx + 1}/${langCards.length}`);
              setProgress(((jobIndex - 1) / totalJobs + ((globalIdx + 1) / langCards.length) / totalJobs) * 100);

              const canvasW = 734, canvasH = 1024;
              const canvas = document.createElement("canvas");
              canvas.width = canvasW;
              canvas.height = canvasH;
              const ctx = canvas.getContext("2d")!;

              let hasImage = false;
              if (card.image) {
                try {
                  const resp = await fetch(`${card.image}/high.png`, { mode: "cors" });
                  const blob = await resp.blob();
                  const img = await createImageBitmap(blob);
                  canvas.width = img.width;
                  canvas.height = img.height;
                  ctx.drawImage(img, 0, 0);
                  hasImage = true;
                } catch { /* fallback */ }
              }

              if (!hasImage) {
                canvas.width = canvasW; canvas.height = canvasH;
                ctx.fillStyle = isGrayscale ? "#e0e0e0" : "#f0f0f0";
                ctx.fillRect(0, 0, canvasW, canvasH);
                const cx = canvasW / 2, cy = canvasH / 2, r = canvasW * 0.2;
                ctx.strokeStyle = isGrayscale ? "#888" : "#cc0000";
                ctx.lineWidth = r * 0.12;
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
                ctx.beginPath(); ctx.arc(cx, cy, r * 0.25, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = isGrayscale ? "#aaa" : "#cc0000";
                ctx.beginPath(); ctx.arc(cx, cy, r - ctx.lineWidth / 2, Math.PI, 0); ctx.closePath(); ctx.fill();
              }

              if (isGrayscale && hasImage) {
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                for (let p = 0; p < data.length; p += 4) {
                  const gray = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
                  data[p] = gray; data[p + 1] = gray; data[p + 2] = gray;
                }
                ctx.putImageData(imageData, 0, 0);
              }

              const labelText = `${card.setName || ""} #${card.localId}`;
              const fontSize = Math.round(canvas.width * 0.045);
              ctx.font = `bold ${fontSize}px Arial`;
              const tw = ctx.measureText(labelText).width;
              const pad = fontSize * 0.4;
              const bx = canvas.width - tw - pad * 2 - 8;
              const by = canvas.height - fontSize - pad * 2 - 8;
              ctx.fillStyle = "rgba(0,0,0,0.65)";
              ctx.beginPath(); ctx.roundRect(bx, by, tw + pad * 2, fontSize + pad * 2, 6); ctx.fill();
              ctx.fillStyle = "#fff";
              ctx.fillText(labelText, bx + pad, by + pad + fontSize * 0.85);

              doc.addImage(canvas.toDataURL("image/png"), "PNG", x, y, cardW, cardH);

              x += cardW;
              count++;
              if (count % 3 === 0) {
                x = marginX; y += cardH;
                if (count % 9 === 0 && count < chunk.length) {
                  doc.addPage(); x = marginX; y = 20;
                }
              }
            }

            const colorSuffix = isGrayscale ? "_nb" : "";
            const partSuffix = totalParts > 1 ? `_part${part + 1}` : "";
            files.push({
              name: `${pdfLang.toUpperCase()}_${entityName}${colorSuffix}${partSuffix}.pdf`,
              blob: doc.output("blob"),
            });
          }
        } catch (e) {
          console.error(e);
          toast.error(`Erreur pour ${pdfLang.toUpperCase()} ${colorLabel}`);
        }
      }
    }

    setGeneratedFiles(files);
    setGenerating(false);
    setProgress(100);
    setCurrentStep("Terminé !");
    toast.success(`${files.length} fichier(s) générés !`);
  };

  const handleDownload = (file: GeneratedFile) => {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement("a");
    a.href = url; a.download = file.name; a.click();
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
      a.href = url; a.download = `${entityName}_etsy_export.zip`; a.click();
      URL.revokeObjectURL(url);
      toast.success("ZIP téléchargé !");
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la création du ZIP");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!generating) setOpen(v); }}>
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
            Export Etsy — {entityName || entityLabel}
          </DialogTitle>
        </DialogHeader>

        {!generating && generatedFiles.length === 0 && (
          <div className="space-y-4 py-2">
            {entityLabel !== "Pokémon" && (
              <div className="flex items-center gap-2">
                <Label htmlFor="maxPagesEtsy" className="text-xs text-muted-foreground whitespace-nowrap">Pages max/PDF</Label>
                <Input
                  id="maxPagesEtsy"
                  type="number"
                  min={1}
                  max={50}
                  value={maxPagesPerPDF}
                  onChange={(e) => setMaxPagesPerPDF(Math.max(1, parseInt(e.target.value) || 6))}
                  className="w-[70px] h-9"
                />
              </div>
            )}

            <div>
              <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                <Palette className="h-4 w-4" /> Format de couleur :
              </p>
              <div className="flex gap-3">
                <div className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors flex-1">
                  <Checkbox id="illus-color-mode" checked={colorModes.includes("color")} onCheckedChange={() => toggleColorMode("color")} />
                  <Label htmlFor="illus-color-mode" className="font-medium cursor-pointer">Couleur</Label>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors flex-1">
                  <Checkbox id="illus-grayscale-mode" checked={colorModes.includes("grayscale")} onCheckedChange={() => toggleColorMode("grayscale")} />
                  <Label htmlFor="illus-grayscale-mode" className="font-medium cursor-pointer">Nuances de gris</Label>
                </div>
              </div>
            </div>

            {/* PDF Languages selector */}
            <div>
              <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                🌍 Langues des PDFs :
              </p>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_LANGS.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => togglePdfLang(l.value)}
                    className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                      selectedPdfLangs.includes(l.value)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              {!fetchCardsForLang && selectedPdfLangs.some(l => l !== lang) && (
                <p className="text-xs text-amber-500 mt-1">
                  ⚠️ Les langues autres que {lang.toUpperCase()} utiliseront les mêmes cartes
                </p>
              )}
            </div>

            {/* Background color for promo */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Palette className="h-3 w-3" /> Couleur de fond du visuel :
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

            <div className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
              <Checkbox id="include-promo" checked={includePromoVisual} onCheckedChange={(checked) => setIncludePromoVisual(!!checked)} />
              <Label htmlFor="include-promo" className="font-medium cursor-pointer flex items-center gap-2">
                <Image className="h-4 w-4 text-primary" />
                Visuel promo Etsy (1080x1080)
              </Label>
            </div>

            <p className="text-xs text-muted-foreground">
              {cards.length} carte{cards.length > 1 ? "s" : ""} • {selectedPdfLangs.length} langue{selectedPdfLangs.length > 1 ? "s" : ""} • {totalFileCount} fichier{totalFileCount > 1 ? "s" : ""}
            </p>
          </div>
        )}

        {generating && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Génération en cours...
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
            <div className="space-y-2 max-h-[250px] overflow-y-auto">
              {generatedFiles.map((file, idx) => {
                const isImage = file.name.endsWith(".png") || file.name.endsWith(".jpg");
                return (
                  <div key={idx} className="rounded-lg border bg-muted/30 overflow-hidden">
                    {isImage && (
                      <div className="p-2">
                        <img src={URL.createObjectURL(file.blob)} alt={file.name} className="w-full rounded border" />
                      </div>
                    )}
                    <div className="flex items-center justify-between p-3">
                      <span className="text-sm font-medium truncate flex-1">{file.name}</span>
                      <div className="flex gap-1">
                        {!isImage && (
                          <Button size="sm" variant="ghost" onClick={() => { window.open(URL.createObjectURL(file.blob), "_blank"); }}>
                            <Eye className="h-3 w-3" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => handleDownload(file)}>
                          <Download className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {!generating && generatedFiles.length === 0 && (
            <Button onClick={handleGenerate} disabled={colorModes.length === 0 || cards.length === 0 || selectedPdfLangs.length === 0} className="w-full sm:w-auto">
              Générer ({totalFileCount} fichier{totalFileCount > 1 ? "s" : ""})
            </Button>
          )}
          {!generating && generatedFiles.length > 0 && (
            <>
              <Button onClick={handleDownloadZip} className="w-full sm:w-auto">
                <Archive className="mr-2 h-4 w-4" />
                Télécharger ZIP
              </Button>
              <Button variant="outline" onClick={() => { setGeneratedFiles([]); setColorModes(["color"]); setSelectedPdfLangs([lang]); setProgress(0); }} className="w-full sm:w-auto">
                Nouveau export
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
