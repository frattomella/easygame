"use client";

import { FileHeart, FolderOpen } from "lucide-react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Badge } from "@/components/ui/badge";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import {
  SectionBlockedState,
  SectionEmptyState,
  SurfacePanel,
  formatDate,
  getAthleteDisplayName,
} from "@/components/trainer/trainer-dashboard-shared";
import {
  TRAINER_DOCUMENT_STATUS_CLASSES,
  TRAINER_DOCUMENT_STATUS_LABELS,
  resolveTrainerDocumentStatus,
  type TrainerDocument,
} from "@/lib/trainer-documents";
import { buildTrainerSquadCertificates } from "@/lib/trainer-clinical-view";
import { cn } from "@/lib/utils";

const CERTIFICATE_BADGE_CLASSES: Record<string, string> = {
  missing: "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100",
  expired: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50",
  expiring: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50",
  valid: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
};

/**
 * **I documenti pertinenti a un allenatore: i propri, e lo stato di quelli del
 * suo gruppo.**
 *
 * Due riquadri, e la distinzione fra i due e tutta la ragione della pagina.
 *
 * 1. **I miei documenti.** Contratto, documento d'identita, certificati,
 *    assicurazione: esistevano gia, e si vedevano **solo** dall'area
 *    gestionale — cioe da chiunque tranne l'interessato. Qui sono in sola
 *    lettura, con la scadenza e lo stato, perche la domanda a cui rispondono e
 *    «il mio contratto e ancora valido?» e non richiede di poterlo sostituire.
 *
 * 2. **Certificati in scadenza del mio gruppo.** Qui vale il taglio D-4: si
 *    vede **se** un atleta puo scendere in campo, non **perche**. Nessuna
 *    allergia, nessun farmaco, nessun gruppo sanguigno, nessun file — e
 *    nemmeno le loro etichette con un trattino accanto: il server non manda
 *    quei campi e questa schermata non li nomina. Un club che concedesse
 *    `clinical.read` a un ruolo diverso vedrebbe il contenuto altrove, non
 *    qui: questo riquadro risponde a una domanda operativa, e quella domanda
 *    non ha bisogno del contenuto.
 *
 * L'elenco mostra solo cio che chiede un intervento — mancante, scaduto, in
 * scadenza. Un elenco di certificati validi e rumore: la domanda e «chi non
 * puo giocare domenica».
 */
export default function TrainerDocumentsDashboardPage() {
  const { assignedAthletes, clinical, ownDocuments, permissions } =
    useTrainerDashboard();

  if (!permissions.navigation.documents) {
    return <SectionBlockedState section="documents" />;
  }

  const documents = ownDocuments as TrainerDocument[];
  const certificates = buildTrainerSquadCertificates({
    athletes: assignedAthletes,
    clinical,
    getDisplayName: getAthleteDisplayName,
  });

  return (
    <div className="space-y-6 pb-2">
      <PageHeading
        eyebrow="Dashboard trainer"
        title="Documenti"
        subtitle="I tuoi documenti e le scadenze del tuo gruppo."
      />

      <SurfacePanel
        title="I miei documenti"
        description="Sola lettura: per caricare o sostituire, rivolgiti alla segreteria."
        icon={FolderOpen}
      >
        {documents.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {documents.map((document) => {
              const status = resolveTrainerDocumentStatus(document);

              return (
                <article
                  key={document.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {document.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {document.typeLabel}
                      </p>
                    </div>
                    <Badge
                      className={cn(
                        "shrink-0",
                        TRAINER_DOCUMENT_STATUS_CLASSES[status],
                      )}
                    >
                      {TRAINER_DOCUMENT_STATUS_LABELS[status]}
                    </Badge>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {document.expiryDate
                      ? `Scadenza ${formatDate(document.expiryDate)}`
                      : "Senza scadenza"}
                    {document.uploadedAt
                      ? ` · caricato il ${formatDate(document.uploadedAt)}`
                      : ""}
                  </p>
                </article>
              );
            })}
          </div>
        ) : (
          <SectionEmptyState
            title="Nessun documento"
            description="Il club non ha ancora registrato documenti sulla tua scheda."
          />
        )}
      </SurfacePanel>

      <SurfacePanel
        title="Certificati del mio gruppo"
        description="Solo lo stato: valido, in scadenza, scaduto o mancante."
        icon={FileHeart}
        action={
          certificates.allowed && certificates.attentionCount > 0 ? (
            <Badge className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">
              {certificates.attentionCount} da sistemare
            </Badge>
          ) : null
        }
      >
        {!certificates.allowed ? (
          <SectionEmptyState
            title="Stato dei certificati non disponibile"
            description="Il club non ha concesso al tuo ruolo la lettura dello stato sanitario."
          />
        ) : certificates.rows.length > 0 ? (
          <div className="overflow-x-auto">
            <ul className="min-w-[18rem] space-y-2">
              {certificates.rows.map((row) => (
                <li
                  key={row.athleteId}
                  className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {row.athleteName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.categoryName}
                      {row.expiryDate
                        ? ` · scadenza ${formatDate(row.expiryDate)}`
                        : ""}
                    </p>
                  </div>
                  <Badge
                    className={cn(
                      "shrink-0",
                      CERTIFICATE_BADGE_CLASSES[row.availability],
                    )}
                  >
                    {row.availabilityLabel}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <SectionEmptyState
            title="Nessuna scadenza da seguire"
            description="Tutti gli atleti del tuo gruppo hanno un certificato valido."
          />
        )}
      </SurfacePanel>
    </div>
  );
}
