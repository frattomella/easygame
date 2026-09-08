"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Download, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import {
  readRegistrationFederationLabel,
  type ClubFederation,
} from "@/lib/club-federations";

/**
 * **I tesseramenti di un atleta** (N2, N4).
 *
 * Estratto da `app/athletes/[id]/page.tsx`, che sta sotto un tetto di righe
 * (WP-19): il pannello va cresciuto — modifica, allegato, ente — e crescerlo
 * in pagina l'avrebbe sfondato. Come gli altri pannelli non possiede lo stato:
 * riceve le righe e restituisce le intenzioni.
 *
 * Tre difetti che questa estrazione chiude.
 *
 * **«Visualizza» e «Scarica» comparivano sempre** (N4). Erano due pulsanti
 * incondizionati che, senza file, aprivano un avviso: e la forma piu comune di
 * bugia dell'interfaccia — un'azione offerta che non puo riuscire. Il numero di
 * tessera e facoltativo di proposito (un tesseramento si registra prima che la
 * federazione emetta il numero), e l'allegato lo e altrettanto, quindi la riga
 * **senza file era il caso ordinario**, non il limite. `src/lib/client-files.ts`
 * lo dice gia in testa: «se compare Visualizza, il file si deve vedere».
 *
 * **Non si poteva correggere niente** (N4). C'erano solo aggiunta e
 * cancellazione: correggere una data, o allegare il documento arrivato dopo,
 * voleva dire cancellare il tesseramento e rifarlo — perdendo la riga e
 * lasciando orfano l'allegato di prima.
 *
 * **L'ente era una stringa** (N2). Ora si legge dal registro del club per
 * identificativo; l'etichetta congelata sulla riga resta il ripiego per gli
 * enti che il club ha poi tolto, perche uno storico deve poter dire cosa fu
 * vero.
 */

export type AthleteRegistration = {
  id?: string | null;
  federationId?: string | null;
  federation?: string | null;
  number?: string | null;
  status?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
  fileName?: string | null;
  fileUrl?: string | null;
};

const badgeClassName = (status: unknown) => {
  const value = String(status || "");
  if (value === "In corso") return "bg-green-500";
  if (value === "Scaduto") return "bg-red-500";
  return "bg-yellow-500";
};

export function AthleteRegistrationsPanel({
  registrations,
  federations,
  canManage = true,
  formatDate,
  onAdd,
  onEdit,
  onView,
  onDownload,
  onDelete,
}: {
  registrations: AthleteRegistration[];
  /** Le federazioni configurate dal club, gia risolte con il loro id. */
  federations: readonly ClubFederation[];
  canManage?: boolean;
  formatDate: (value: any) => string;
  onAdd: () => void;
  onEdit: (registration: AthleteRegistration) => void;
  onView: (registration: AthleteRegistration) => void;
  onDownload: (registration: AthleteRegistration) => void;
  onDelete: (registration: AthleteRegistration) => void;
}) {
  const rows = Array.isArray(registrations) ? registrations : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Tesseramento</CardTitle>
        {canManage ? (
          <Button size="sm" onClick={onAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Aggiungi Tesseramento
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {/*
          Nessuna federazione configurata: il club non puo tesserare nessuno, e
          dirlo qui evita che qualcuno apra la finestra per scoprire una tendina
          vuota.
        */}
        {federations.length === 0 ? (
          <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            Nessuna federazione o ente registrato nel club. Aggiungili nella
            pagina Club, scheda «Federazione», prima di registrare un
            tesseramento.
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Federazione/Ente</th>
                <th className="text-left p-2">Numero</th>
                <th className="text-left p-2">Scadenza</th>
                <th className="text-left p-2">Stato</th>
                <th className="text-left p-2">Allegato</th>
                <th className="text-left p-2">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((registration, index) => {
                  const federationLabel =
                    readRegistrationFederationLabel(registration, federations) ||
                    "-";
                  const hasFile = Boolean(
                    String(registration.fileUrl || "").trim(),
                  );

                  return (
                    <tr key={registration.id || index} className="border-b">
                      <td className="p-2">{federationLabel}</td>
                      <td className="p-2">{registration.number || "-"}</td>
                      <td className="p-2">
                        {formatDate(registration.expiryDate) || "-"}
                      </td>
                      <td className="p-2">
                        <Badge className={badgeClassName(registration.status)}>
                          {registration.status || "-"}
                        </Badge>
                      </td>
                      <td className="p-2">
                        {/*
                          Le due azioni sul file compaiono **solo se il file
                          c'e**. Prima comparivano sempre e producevano un
                          avviso: un'azione offerta che non puo riuscire.
                        */}
                        {hasFile ? (
                          <div className="flex flex-wrap gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Visualizza l'allegato del tesseramento ${federationLabel}`}
                              onClick={() => onView(registration)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Scarica l'allegato del tesseramento ${federationLabel}`}
                              onClick={() => onDownload(registration)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Nessun allegato
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        {canManage ? (
                          <div className="flex flex-wrap gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Modifica il tesseramento ${federationLabel}`}
                              onClick={() => onEdit(registration)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Elimina il tesseramento ${federationLabel}`}
                              onClick={() => onDelete(registration)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="p-4 text-center text-muted-foreground"
                  >
                    Nessun tesseramento registrato
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
