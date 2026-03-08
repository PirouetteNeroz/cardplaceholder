import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ShoppingBag, Download, Loader2, CheckCircle2, Palette } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { Lang, CardListItem } from "@/lib/tcgdex-api";
import { toast } from "sonner";

interface GeneratedFile {
  name: string;
  blob: Blob;
}

interface Props {
  illustratorName: string | null;
  cards: CardListItem[];
  lang: Lang;
  disabled?: boolean;
}

export function IllustratorEtsyDialog({ illustratorName, cards, lang, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [colorModes, setColorModes] = useState<("color" | "grayscale")[]>(["color"]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
  const [maxPagesPerPDF, setMaxPagesPerPDF] = useState(15);

  const toggleColorMode = (cm: "color" | "grayscale") => {
    setColorModes((prev) =>
      prev.includes(cm) ? prev.filter((c) => c !== cm) : [...prev, cm]
    );
  };

  const handleGenerate = async () => {
    if (!illustratorName || cards.length === 0 || colorModes.length === 0) return;
    setGenerating(true);
    setGeneratedFiles([]);
    const files: GeneratedFile[] = [];
    const totalJobs = colorModes.length;
    let jobIndex = 0;

    for (const colorMode of colorModes) {
      jobIndex++;
      const isGrayscale = colorMode === "grayscale";
      const colorLabel = isGrayscale ? "N&B" : "Couleur";
      setCurrentStep(`Génération PDF (${colorLabel})...`);
      setProgress(0);

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
          doc.setFontSize(32);
          doc.setFont("helvetica", "bold");
          doc.text(illustratorName, 105, 60, { align: "center" });
          doc.setFontSize(18);
          doc.setFont("helvetica", "normal");
          doc.text("Illustrateur Pokémon TCG", 105, 75, { align: "center" });
          doc.setFontSize(14);
          doc.text(`Cartes: ${cards.length}`, 30, 200);
          doc.text(`Langue: ${lang.toUpperCase()}`, 30, 210);
          doc.text(`Format: ${colorLabel}`, 30, 220);
          if (totalParts > 1) doc.text(`Partie ${part + 1} / ${totalParts}`, 30, 230);
          doc.addPage();

          const cardW = 63, cardH = 88;
          const marginX = (210 - cardW * 3) / 2;
          let x = marginX, y = 20, count = 0;

          for (let i = 0; i < chunk.length; i++) {
            const card = chunk[i];
            const globalIdx = startIdx + i;
            setCurrentStep(`${colorLabel} — Partie ${part + 1}/${totalParts} — Carte ${globalIdx + 1}/${cards.length}`);
            setProgress(((jobIndex - 1) / totalJobs + ((globalIdx + 1) / cards.length) / totalJobs) * 100);

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

                // Grayscale conversion
                if (isGrayscale) {
                  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                  const data = imageData.data;
                  for (let p = 0; p < data.length; p += 4) {
                    const gray = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
                    data[p] = gray;
                    data[p + 1] = gray;
                    data[p + 2] = gray;
                  }
                  ctx.putImageData(imageData, 0, 0);
                }

                // Draw set name + number overlay
                const labelText = `${card.setName || ""} #${card.localId}`;
                const fontSize = Math.round(img.width * 0.045);
                ctx.font = `bold ${fontSize}px Arial`;
                const textWidth = ctx.measureText(labelText).width;
                const padding = fontSize * 0.4;
                const boxX = img.width - textWidth - padding * 2 - 8;
                const boxY = img.height - fontSize - padding * 2 - 8;
                ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
                ctx.roundRect(boxX, boxY, textWidth + padding * 2, fontSize + padding * 2, 6);
                ctx.fill();
                ctx.fillStyle = "#ffffff";
                ctx.fillText(labelText, boxX + padding, boxY + padding + fontSize * 0.85);

                const dataUrl = canvas.toDataURL("image/png");
                doc.addImage(dataUrl, "PNG", x, y, cardW, cardH);
              } catch {
                // skip
              }
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

          const colorSuffix = isGrayscale ? "_nb" : "";
          const suffix = totalParts > 1 ? `_part${part + 1}` : "";
          files.push({
            name: `${illustratorName}${colorSuffix}${suffix}.pdf`,
            blob: doc.output("blob"),
          });
        }
      } catch (e) {
        console.error(e);
        toast.error(`Erreur pour le format ${colorLabel}`);
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

  const handleDownloadAll = () => {
    generatedFiles.forEach((file) => handleDownload(file));
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
            Export Etsy — {illustratorName || "Illustrateur"}
          </DialogTitle>
        </DialogHeader>

        {!generating && generatedFiles.length === 0 && (
          <div className="space-y-4 py-2">
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

            <div>
              <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                <Palette className="h-4 w-4" /> Format de couleur :
              </p>
              <div className="flex gap-3">
                <div className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors flex-1">
                  <Checkbox
                    id="illus-color-mode"
                    checked={colorModes.includes("color")}
                    onCheckedChange={() => toggleColorMode("color")}
                  />
                  <Label htmlFor="illus-color-mode" className="font-medium cursor-pointer">Couleur</Label>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors flex-1">
                  <Checkbox
                    id="illus-grayscale-mode"
                    checked={colorModes.includes("grayscale")}
                    onCheckedChange={() => toggleColorMode("grayscale")}
                  />
                  <Label htmlFor="illus-grayscale-mode" className="font-medium cursor-pointer">Nuances de gris</Label>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {cards.length} carte{cards.length > 1 ? "s" : ""} • {colorModes.length} format{colorModes.length > 1 ? "s" : ""}
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
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              {generatedFiles.length} fichier(s) prêt(s) !
            </div>
            <div className="space-y-2">
              {generatedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <span className="text-sm font-medium">{file.name}</span>
                  <Button size="sm" variant="outline" onClick={() => handleDownload(file)}>
                    <Download className="h-3 w-3 mr-1" />
                    Télécharger
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {!generating && generatedFiles.length === 0 && (
            <Button onClick={handleGenerate} disabled={colorModes.length === 0 || cards.length === 0}>
              Générer ({colorModes.length} PDF{colorModes.length > 1 ? "s" : ""})
            </Button>
          )}
          {!generating && generatedFiles.length > 1 && (
            <Button onClick={handleDownloadAll}>
              <Download className="mr-2 h-4 w-4" />
              Tout télécharger
            </Button>
          )}
          {!generating && generatedFiles.length > 0 && (
            <Button variant="outline" onClick={() => { setGeneratedFiles([]); setColorModes(["color"]); setProgress(0); }}>
              Nouveau export
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
