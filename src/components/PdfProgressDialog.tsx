import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2 } from "lucide-react";

interface Props {
  open: boolean;
  progress: number;
  currentStep: string;
  totalFiles?: number;
  currentFile?: number;
}

export function PdfProgressDialog({ open, progress, currentStep, totalFiles = 1, currentFile = 1 }: Props) {
  const isDone = progress >= 100;

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            {isDone ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
            {isDone ? "PDF prêt !" : "Génération du PDF..."}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {totalFiles > 1 && (
            <p className="text-sm text-muted-foreground">
              Fichier {currentFile} / {totalFiles}
            </p>
          )}
          <Progress value={progress} className="h-3" />
          <p className="text-sm text-muted-foreground text-center">{currentStep}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
