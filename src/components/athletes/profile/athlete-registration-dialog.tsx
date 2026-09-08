"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ClubFederation } from "@/lib/club-federations";

/**
 * **La finestra di un tesseramento: crea e corregge** (N2, N4).
 *
 * Estratta con il proprio pannello da `app/athletes/[id]/page.tsx`, sotto il
 * tetto di righe (WP-19).
 *
 * Due cose che qui non sono cosmetiche.
 *
 * **La tendina porta identificativi.** Il `value` di ogni voce e l'`id` della
 * federazione, non il suo nome: il nome e la scritta. Prima il valore *era* la
 * scritta, quindi rinominare un'affiliazione in `/organization` orfanava ogni
 * tesseramento gia registrato — e nessuno se ne accorgeva, perche la scheda
 * continuava a mostrare la vecchia stringa.
 *
 * **In correzione l'allegato non e obbligatorio.** Non lo e mai stato, del
 * resto: un tesseramento si registra prima che la federazione emetta il numero
 * e prima che il documento arrivi. Caricarne uno quando ce n'e gia uno lo
 * **sostituisce**.
 */

export type RegistrationDraft = {
  federation: string;
  number: string;
  status: string;
  issueDate: string;
  expiryDate: string;
  notes: string;
  file: File | null;
};

const REGISTRATION_STATUSES = ["In corso", "In rinnovo", "Scaduto"];

export function AthleteRegistrationDialog({
  open,
  onOpenChange,
  draft,
  onDraftChange,
  federations,
  isEditing,
  hasExistingFile,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: RegistrationDraft;
  onDraftChange: (next: RegistrationDraft) => void;
  federations: readonly ClubFederation[];
  isEditing: boolean;
  hasExistingFile: boolean;
  onSave: () => void;
}) {
  const patch = (changes: Partial<RegistrationDraft>) =>
    onDraftChange({ ...draft, ...changes });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Modifica Tesseramento" : "Nuovo Tesseramento"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Federazione/Ente *</Label>
              <Select
                value={draft.federation}
                onValueChange={(value) => patch({ federation: value })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Seleziona federazione o ente" />
                </SelectTrigger>
                <SelectContent>
                  {federations.map((federation) => (
                    <SelectItem key={federation.id} value={federation.id}>
                      {federation.name}
                      {federation.registrationNumber
                        ? ` · n. ${federation.registrationNumber}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {federations.length === 0 && (
                <p className="mt-2 text-xs text-amber-600">
                  Nessuna federazione registrata nel club. Aggiungile prima
                  nella pagina Club, scheda «Federazione».
                </p>
              )}
            </div>
            <div>
              <Label>Numero Tessera</Label>
              <Input
                value={draft.number}
                onChange={(e) => patch({ number: e.target.value })}
                className="mt-2"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Data Emissione</Label>
              <Input
                type="date"
                value={draft.issueDate}
                onChange={(e) => patch({ issueDate: e.target.value })}
                className="mt-2"
              />
            </div>
            <div>
              <Label>Data Scadenza</Label>
              <Input
                type="date"
                value={draft.expiryDate}
                onChange={(e) => patch({ expiryDate: e.target.value })}
                className="mt-2"
              />
            </div>
          </div>
          <div>
            <Label>Stato</Label>
            <Select
              value={draft.status}
              onValueChange={(value) => patch({ status: value })}
            >
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Seleziona stato" />
              </SelectTrigger>
              <SelectContent>
                {REGISTRATION_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Note</Label>
            <Textarea
              value={draft.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              className="mt-2"
            />
          </div>
          <div>
            <Label>{hasExistingFile ? "Sostituisci allegato" : "Allegato"}</Label>
            <Input
              type="file"
              onChange={(e) => patch({ file: e.target.files?.[0] || null })}
              className="mt-2"
            />
            {hasExistingFile && !draft.file ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Un allegato e gia presente. Sceglierne uno nuovo lo sostituisce;
                lasciando vuoto resta quello.
              </p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={onSave} className="bg-blue-600 hover:bg-blue-700">
            {isEditing ? "Salva modifiche" : "Salva Tesseramento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
