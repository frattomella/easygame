"use client";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CategoryDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: {
    name: string;
    sport: string;
    birthYearsLabel: string;
    athletesCount: number;
    trainersCount: number;
    trainingsPerWeek: number;
  } | null;
  onEdit: () => void;
}

export function CategoryDetailsDialog({
  open,
  onOpenChange,
  category,
  onEdit,
}: CategoryDetailsDialogProps) {
  if (!category) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>Informazioni Categoria {category.name}</span>
            <Button
              type="button"
              onClick={onEdit}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Modifica Categoria
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="rounded-xl border bg-slate-50 p-5 dark:bg-slate-900/60">
            <h4 className="mb-3 font-medium">Informazioni Generali</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <p>
                <strong>Nome:</strong> {category.name}
              </p>
              <p>
                <strong>Sport:</strong> {category.sport}
              </p>
              <p>
                <strong>Anni di nascita:</strong> {category.birthYearsLabel}
              </p>
              <p>
                <strong>Atleti iscritti:</strong> {category.athletesCount}
              </p>
              <p>
                <strong>Allenatori:</strong> {category.trainersCount}
              </p>
              <p>
                <strong>Allenamenti settimanali:</strong>{" "}
                {category.trainingsPerWeek}
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-slate-50 p-5 dark:bg-slate-900/60">
            <h4 className="mb-3 font-medium">Note</h4>
            <p>
              Categoria {category.name} collegata agli atleti nati in questo
              intervallo: {category.birthYearsLabel}.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Per visualizzare allenatori e atleti specifici, utilizza le
              sezioni dedicate del sistema.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
