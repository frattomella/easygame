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
import { Download, Eye, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

/**
 * **I certificati medici di un atleta** (N5).
 *
 * Estratto da `app/athletes/[id]/page.tsx`, che sta sotto un tetto di righe
 * (WP-19). Come gli altri pannelli non possiede lo stato: riceve le righe e
 * restituisce le intenzioni, cosi la pagina resta l'unico posto che decide
 * come si salvano.
 *
 * La riga «mancante» e sintetica: non e un certificato, e il **buco** che la
 * scheda mostra quando non ce n'e nessuno valido. Per questo non offre ne
 * modifica ne cancellazione — non c'e niente da correggere e niente da
 * togliere — ed e la ragione per cui `isVirtualMissing` esiste.
 */

export type AthleteCertificateRow = {
  id?: string | null;
  type?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  status?: string | null;
  fileUrl?: string | null;
};

const statusBadgeClassName = (status: unknown) => {
  const value = String(status || "");
  if (value === "valid") return "bg-green-500 text-white";
  if (value === "expiring") return "bg-amber-500 text-white";
  return "bg-red-500 text-white";
};

const statusLabel = (status: unknown) => {
  const value = String(status || "");
  if (value === "valid") return "Valido";
  if (value === "expiring") return "In scadenza";
  return "Scaduto";
};

export function AthleteCertificatesPanel({
  certificates,
  deletingCertificateId,
  formatDate,
  onAdd,
  onEdit,
  onView,
  onDownload,
  onDelete,
}: {
  certificates: AthleteCertificateRow[];
  deletingCertificateId?: string | null;
  formatDate: (value: any) => string;
  onAdd: () => void;
  onEdit: (certificate: AthleteCertificateRow) => void;
  onView: (certificate: AthleteCertificateRow) => void;
  onDownload: (certificate: AthleteCertificateRow) => void;
  onDelete: (certificate: AthleteCertificateRow) => void;
}) {
  const rows = Array.isArray(certificates) ? certificates : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Certificati Medici</CardTitle>
        <Button size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Aggiungi certificato medico
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Tipo</th>
                <th className="text-left p-2">Emissione</th>
                <th className="text-left p-2">Scadenza</th>
                <th className="text-left p-2">Stato</th>
                <th className="text-left p-2">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((certificate) => {
                  const isVirtualMissing =
                    certificate.status === "missing" ||
                    String(certificate.id || "").startsWith("missing-");
                  const hasFile = Boolean(
                    String(certificate.fileUrl || "").trim(),
                  );

                  return (
                    <tr key={certificate.id} className="border-b">
                      <td className="p-2">{certificate.type}</td>
                      <td className="p-2">
                        {certificate.issueDate
                          ? formatDate(certificate.issueDate)
                          : "-"}
                      </td>
                      <td className="p-2">
                        {certificate.expiryDate
                          ? formatDate(certificate.expiryDate)
                          : "-"}
                      </td>
                      <td className="p-2">
                        <Badge
                          className={statusBadgeClassName(certificate.status)}
                        >
                          {statusLabel(certificate.status)}
                        </Badge>
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-2">
                          {hasFile ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onView(certificate)}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Visualizza
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onDownload(certificate)}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Scarica
                              </Button>
                            </>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                          {!isVirtualMissing ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onEdit(certificate)}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Modifica
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                disabled={
                                  deletingCertificateId === certificate.id
                                }
                                onClick={() => onDelete(certificate)}
                              >
                                {deletingCertificateId === certificate.id ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4 mr-2" />
                                )}
                                Elimina
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="p-4 text-center text-muted-foreground"
                  >
                    Nessun certificato medico registrato
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
