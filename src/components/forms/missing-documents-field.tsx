"use client";

import React from "react";
import { FileWarning, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
/*
  W6-47. Il catalogo dei tipi vive nel dominio documentale nuovo, non in
  `shared-documents.ts` — che e il file destinato alla cancellazione, e che
  non conosceva ne la tessera sanitaria ne la delega.
*/
import {
  DOCUMENT_KIND_OPTIONS,
  getDocumentKindLabel,
} from "@/lib/documents/kind-catalog";
import type { MissingDocumentRequest } from "@/lib/api/forms";

/**
 * **Chiedere il documento che manca, invece di respingere.**
 *
 * Il difetto che questo componente chiude: la segreteria che approvava una
 * domanda a cui mancava il certificato medico aveva una sola risposta, il
 * rifiuto — e il rifiuto costa alla famiglia una compilazione da rifare e alla
 * segreteria una seconda pratica identica da riesaminare. Il server sapeva gia
 * fare la cosa giusta (`requestMissingDocuments`), la rotta leggeva gia il
 * campo, e nessuna schermata lo compilava: `documentRequests` non esisteva
 * nemmeno nel tipo del client, quindi la funzione restituiva `[]` ogni volta.
 *
 * **I tipi non sono un elenco nuovo.** Sono `SHARED_DOCUMENT_TYPES`, gli
 * stessi che la scheda atleta gia offre quando la segreteria chiede un
 * documento a mano. Un secondo vocabolario qui produrrebbe due «certificato
 * medico» diversi, e solo uno dei due verrebbe promosso a certificato vero nel
 * fascicolo — che e il modo in cui un documento risulta valido per la
 * segreteria e inesistente per il promemoria notturno.
 *
 * **Il titolo lo legge la famiglia.** Si propone l'etichetta del tipo e
 * resta modificabile: «Certificato medico agonistico di Marco» dice piu di
 * `medical_certificate` a chi apre la propria area e trova una riga da
 * evadere.
 */

export type MissingDocumentDraft = MissingDocumentRequest & {
  /** Chiave stabile per l'elenco: due righe possono avere lo stesso tipo. */
  key: string;
};

export const createMissingDocumentDraft = (): MissingDocumentDraft => ({
  /*
    `crypto.randomUUID` non c'e su ogni browser che questo prodotto incontra
    (Safari piu vecchi): la chiave serve solo a React, quindi un contatore
    sull'orologio piu un caso e sufficiente e non finge di essere un id.
  */
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  documentKind: "",
  title: "",
  dueDate: "",
  required: true,
});

const labelOfKind = (kind: string) => getDocumentKindLabel(kind);

type MissingDocumentsFieldProps = {
  value: MissingDocumentDraft[];
  onChange: (next: MissingDocumentDraft[]) => void;
  disabled?: boolean;
  /**
   * Falso quando l'approvazione non scrive nessun atleta. Una richiesta
   * documentale si intesta a una persona: senza, il server rifiuta
   * l'approvazione intera, e proporre il comando qui vorrebbe dire far
   * scoprire il vincolo dopo il clic.
   */
  canRequest: boolean;
};

export function MissingDocumentsField({
  value,
  onChange,
  disabled = false,
  canRequest,
}: MissingDocumentsFieldProps) {
  const patch = (key: string, changes: Partial<MissingDocumentDraft>) =>
    onChange(
      value.map((riga) => (riga.key === key ? { ...riga, ...changes } : riga)),
    );

  return (
    <section className="space-y-3 rounded-md border border-slate-200 p-4">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <FileWarning className="h-4 w-4 text-amber-600" aria-hidden />
          Manca un documento?
        </h3>
        <p className="text-xs text-slate-600">
          Chiedilo approvando: la domanda va avanti e il documento diventa una
          richiesta nel fascicolo della persona, con la sua scadenza. Rifiutare
          per un allegato mancante costa alla famiglia una compilazione da
          rifare.
        </p>
      </div>

      {!canRequest ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          Questa compilazione non crea ne aggiorna nessun atleta: non c&apos;e
          nessuno a cui intestare la richiesta.
        </p>
      ) : (
        <>
          {value.map((riga) => (
            <div
              key={riga.key}
              className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`missing-kind-${riga.key}`}>
                    Tipo di documento
                  </Label>
                  <Select
                    disabled={disabled}
                    value={riga.documentKind || undefined}
                    onValueChange={(tipo) =>
                      patch(riga.key, {
                        documentKind: tipo,
                        /*
                          Il titolo proposto segue il tipo finche nessuno lo ha
                          scritto a mano: sovrascrivere un titolo digitato
                          sarebbe la stessa cosa che l'anagrafica assistita non
                          fa mai — suggerire, non decidere.
                        */
                        title:
                          !riga.title || riga.title === labelOfKind(riga.documentKind)
                            ? labelOfKind(tipo)
                            : riga.title,
                      })
                    }
                  >
                    <SelectTrigger
                      id={`missing-kind-${riga.key}`}
                      className="min-h-[44px] bg-white"
                    >
                      <SelectValue placeholder="Scegli il documento" />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_KIND_OPTIONS.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`missing-title-${riga.key}`}>
                    Titolo che vede la famiglia
                  </Label>
                  <Input
                    id={`missing-title-${riga.key}`}
                    className="min-h-[44px] bg-white"
                    disabled={disabled}
                    value={riga.title}
                    onChange={(evento) =>
                      patch(riga.key, { title: evento.target.value })
                    }
                    placeholder="Certificato medico"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`missing-due-${riga.key}`}>
                    Entro il (facoltativo)
                  </Label>
                  <Input
                    id={`missing-due-${riga.key}`}
                    type="date"
                    className="eg-tabular min-h-[44px] bg-white"
                    disabled={disabled}
                    value={riga.dueDate || ""}
                    onChange={(evento) =>
                      patch(riga.key, { dueDate: evento.target.value })
                    }
                  />
                </div>

                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-slate-800">
                    <Checkbox
                      disabled={disabled}
                      checked={riga.required !== false}
                      onCheckedChange={(spuntato) =>
                        patch(riga.key, { required: Boolean(spuntato) })
                      }
                    />
                    Obbligatorio
                  </label>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() =>
                    onChange(value.filter((altra) => altra.key !== riga.key))
                  }
                >
                  <X className="mr-2 h-4 w-4" />
                  Togli
                </Button>
              </div>
            </div>
          ))}

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            className="w-full sm:w-auto"
            onClick={() => onChange([...value, createMissingDocumentDraft()])}
          >
            <Plus className="mr-2 h-4 w-4" />
            Aggiungi un documento da chiedere
          </Button>
        </>
      )}
    </section>
  );
}

/**
 * Le righe complete, nella forma che il server accetta.
 *
 * Una riga senza tipo non e una richiesta a meta: e una riga che qualcuno ha
 * aperto e non ha compilato, e il server la scarterebbe comunque
 * (`normalizeMissingDocuments` filtra su `documentKind`). Si toglie qui, cosi
 * chi legge la chiamata vede solo cio che verra davvero chiesto.
 */
export const collectMissingDocuments = (
  rows: MissingDocumentDraft[],
): MissingDocumentRequest[] =>
  rows
    .filter((riga) => String(riga.documentKind || "").trim())
    .map((riga) => ({
      documentKind: riga.documentKind,
      title: riga.title.trim() || labelOfKind(riga.documentKind),
      dueDate: riga.dueDate || "",
      required: riga.required !== false,
    }));
