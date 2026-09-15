"use client";

import React from "react";
import { Download, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { joinMeta } from "@/lib/web/format";
import { ATHLETE_RECORD_SECTIONS } from "@/lib/athlete-profile-tabs";
import {
  RecordRowList,
  RecordSection,
  dateOrMissing,
  medicalCertificateStatus,
} from "./v2/record-primitives";

/**
 * **I certificati medici di un atleta** (N5), nella forma della scheda V2.
 *
 * Come gli altri pannelli non possiede lo stato: riceve le righe e
 * restituisce le intenzioni, cosi la pagina resta l'unico posto che decide
 * come si salvano.
 *
 * La riga «mancante» e sintetica: non e un certificato, e il **buco** che la
 * scheda mostra quando non ce n'e nessuno valido. Per questo non offre ne
 * modifica ne cancellazione — non c'e niente da correggere e niente da
 * togliere — ed e la ragione per cui `isVirtualMissing` esiste.
 *
 * Lo stato non si scrive qui: arriva da `getMedicalCertificateStatus`
 * (`valid` · `expiring` · `expired`) e la pillola lo traduce con il
 * vocabolario del sistema (`CERTIFICATE_STATUS`).
 */

export type AthleteCertificateRow = {
  id?: string | null;
  type?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  status?: string | null;
  fileUrl?: string | null;
};

export function AthleteCertificatesPanel({
  certificates,
  deletingCertificateId,
  onAdd,
  onEdit,
  onView,
  onDownload,
  onDelete,
}: {
  certificates: AthleteCertificateRow[];
  deletingCertificateId?: string | null;
  /** Mantenuto per compatibilita di firma: le date si formattano con il sistema. */
  formatDate?: (value: any) => string;
  onAdd: () => void;
  onEdit: (certificate: AthleteCertificateRow) => void;
  onView: (certificate: AthleteCertificateRow) => void;
  onDownload: (certificate: AthleteCertificateRow) => void;
  onDelete: (certificate: AthleteCertificateRow) => void;
}) {
  const rows = Array.isArray(certificates) ? certificates : [];

  return (
    <RecordSection
      id={ATHLETE_RECORD_SECTIONS.certificati}
      eyebrow="Sanità"
      title="Certificati medici"
      actions={
        <Button variant="secondary" size="sm" icon={<Plus />} onClick={onAdd}>
          Aggiungi certificato medico
        </Button>
      }
    >
      <RecordRowList
        aria-label="Certificati medici"
        rows={rows.map((certificate, index) => {
          const isVirtualMissing =
            certificate.status === "missing" ||
            String(certificate.id || "").startsWith("missing-");
          const hasFile = Boolean(String(certificate.fileUrl || "").trim());
          const label = certificate.type || "Certificato medico";

          return {
            id: String(certificate.id || index),
            title: label,
            meta: joinMeta(
              certificate.issueDate ? `Emesso ${dateOrMissing(certificate.issueDate)}` : null,
              certificate.expiryDate ? `Scade ${dateOrMissing(certificate.expiryDate)}` : null,
            ),
            status: <StatusPill status={medicalCertificateStatus(certificate.status)} size="sm" />,
            actions: (
              <>
                {hasFile ? (
                  <>
                    <IconButton aria-label={`Visualizza il certificato ${label}`} onClick={() => onView(certificate)}>
                      <Eye />
                    </IconButton>
                    <IconButton aria-label={`Scarica il certificato ${label}`} onClick={() => onDownload(certificate)}>
                      <Download />
                    </IconButton>
                  </>
                ) : null}
                {!isVirtualMissing ? (
                  <>
                    <IconButton aria-label={`Modifica il certificato ${label}`} onClick={() => onEdit(certificate)}>
                      <Pencil />
                    </IconButton>
                    <IconButton
                      aria-label={`Elimina il certificato ${label}`}
                      loading={deletingCertificateId === certificate.id}
                      onClick={() => onDelete(certificate)}
                    >
                      <Trash2 />
                    </IconButton>
                  </>
                ) : null}
              </>
            ),
          };
        })}
        empty="Nessun certificato medico registrato"
      />
    </RecordSection>
  );
}
