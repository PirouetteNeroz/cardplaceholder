import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ShoppingBag, Download, Loader2, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { ExportMode, SetDetail, Lang } from "@/lib/tcgdex-api";
import { processCards } from "@/lib/tcgdex-api";
import { toast } from "sonner";
import { loadCardWithOverlays } from "@/lib/pdf-utils";

const MODES: { value: ExportMode; label: string; description: string }[] = [
  { value: "complete", label: "Complete Set", description: "Toutes les cartes du set" },
  { value: "master", label: "Master Set", description: "Avec reverses pour les cartes éligibles" },
  { value: "graded", label: "Graded", description: "Exclut Common et Uncommon" },
  { value: "special", label: "Master Set Spécial", description: "4x reverse (normal, Poké Ball, Master Ball)" },
];

interface GeneratedFile {
  name: string;
  mode: ExportMode;
  blob: Blob;
}

interface Props {
  setDetail: SetDetail | null;
  lang: Lang;
  disabled?: boolean;
}

export function EtsyExportDialog({ setDetail, lang, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedModes, setSelectedModes] = useState<ExportMode[]>([]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);

  const toggleMode = (mode: ExportMode) => {
    setSelectedModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    );
  };

  const handleGenerate = async () => {
    if (!setDetail || selectedModes.length === 0) return;
    setGenerating(true);
    setGeneratedFiles([]);
    const files: GeneratedFile[] = [];

    for (let i = 0; i < selectedModes.length; i++) {
      const mode = selectedModes[i];
      setCurrentFileIndex(i + 1);
      setCurrentStep(`Traitement des cartes (${MODES.find(m => m.value === mode)?.label})...`);
      setProgress(0);

      try {
        const cards = await processCards(lang, setDetail, mode, (pct) => {
          setProgress(pct * 0.5); // 0-50% for card processing
        });

        setCurrentStep(`Génération du PDF (${MODES.find(m => m.value === mode)?.label})...`);
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
        doc.text(`Cartes: ${cards.length}`, 30, 220);
        doc.text(`Langue: ${lang.toUpperCase()}`, 30, 230);
        doc.addPage();

        // Cards
        const cardW = 63, cardH = 88;
        const marginX = (210 - cardW * 3) / 2;
        let x = marginX, y = 20, count = 0;

        for (let ci = 0; ci < cards.length; ci++) {
          const card = cards[ci];
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
            // skip
          }

          x += cardW;
          count++;
          if (count % 3 === 0) {
            x = marginX;
            y += cardH;
            if (count % 9 === 0 && count < cards.length) {
              doc.addPage();
              x = marginX;
              y = 20;
            }
          }

          setProgress(50 + ((ci + 1) / cards.length) * 50);
        }

        const pdfBlob = doc.output("blob");
        files.push({
          name: `${setDetail.name}_${mode}.pdf`,
          mode,
          blob: pdfBlob,
        });
      } catch (e) {
        console.error(e);
        toast.error(`Erreur pour le mode ${mode}`);
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            Export Etsy — {setDetail?.name || "Set"}
          </DialogTitle>
        </DialogHeader>

        {!generating && generatedFiles.length === 0 && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Sélectionnez les modes d'export à générer :
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
          </div>
        )}

        {generating && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Fichier {currentFileIndex} / {selectedModes.length}
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
              {generatedFiles.map((file) => (
                <div key={file.mode} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
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
            <Button onClick={handleGenerate} disabled={selectedModes.length === 0}>
              Générer {selectedModes.length > 0 && `(${selectedModes.length})`}
            </Button>
          )}
          {!generating && generatedFiles.length > 1 && (
            <Button onClick={handleDownloadAll}>
              <Download className="mr-2 h-4 w-4" />
              Tout télécharger
            </Button>
          )}
          {!generating && generatedFiles.length > 0 && (
            <Button variant="outline" onClick={() => { setGeneratedFiles([]); setSelectedModes([]); setProgress(0); }}>
              Nouveau export
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
