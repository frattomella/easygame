import React from "react";

import {
  GlassRow,
  InfoNote,
  SecondaryScreenLayout,
  SectionLabel,
  StateMessage,
  StatusPill,
  SummaryCard,
} from "@/components/signature";
import type {
  StatusPillTier,
  StatusPillTone,
} from "@/components/signature/StatusPill";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { useAsyncSection } from "@/hooks/useAsyncSection";
import {
  normalizeTrainerDocuments,
  resolveTrainerDocumentStatus,
  TRAINER_DOCUMENT_STATUS_LABELS,
  type TrainerDocument,
  type TrainerDocumentStatus,
} from "@/lib/trainer-documents";
import { formatItalianDate } from "@/lib/mobile-ui";

/** Quattro livelli del design (quiet · outline · solid · urgent) per i cinque stati del documento. */
const STATUS_LOOK: Record<
  TrainerDocumentStatus,
  { tier: StatusPillTier; tone: StatusPillTone; color: string }
> = {
  valid: { tier: "quiet", tone: "success", color: "#10B981" },
  expiring: { tier: "solid", tone: "warning", color: "#F59E0B" },
  expired: { tier: "urgent", tone: "danger", color: "#EF4444" },
  "no-expiry": { tier: "quiet", tone: "neutral", color: "#64748B" },
  "missing-file": { tier: "outline", tone: "warning", color: "#F59E0B" },
};

/**
 * I propri documenti — stesso record letto sul Web (`GET /api/v1/trainers`).
 * Sola lettura: "per caricare o sostituire rivolgiti alla segreteria", come
 * sul Web. L'apertura/il download del file non e implementato in questo
 * giro — vedi la nota di testa in `client/lib/trainer-documents.ts`.
 *
 * Composizione: design `IA e Home` §3c ("Documenti") — scheda scura "Da
 * rinnovare · N" nel cielo, poi una riga per documento con icona tinta
 * dallo stato, titolo, scadenza e pill a quattro livelli.
 */
export default function TrainerDocumentsScreen() {
  const { status, data, errorMessage, reload } = useAsyncSection<
    TrainerDocument[]
  >(
    async () => {
      const profile = await mobileBackendStorage.getTrainerProfile();
      return normalizeTrainerDocuments(profile?.documents);
    },
    (list) => list.length === 0,
  );

  const documents = data || [];
  const toRenew = documents.filter((document) => {
    const documentStatus = resolveTrainerDocumentStatus(document);
    return documentStatus === "expiring" || documentStatus === "expired";
  }).length;

  return (
    <SecondaryScreenLayout
      title="Documenti"
      eyebrow="Allenatore · I tuoi documenti"
      skyHeight={300}
      contentGap={10}
    >
      {status === "loading" ? (
        <StateMessage kind="loading" tone="dark" title="Carico i documenti…" />
      ) : status === "forbidden" ? (
        <StateMessage
          kind="forbidden"
          tone="dark"
          message="Il club non ti ha dato accesso ai documenti."
        />
      ) : status === "network" || status === "error" ? (
        <StateMessage
          kind="error"
          tone="dark"
          message={errorMessage}
          actionLabel="Riprova"
          onAction={reload}
        />
      ) : status === "empty" ? (
        <StateMessage
          kind="empty"
          tone="dark"
          title="Nessun documento"
          message="Il club non ha ancora registrato documenti per te. Per caricarne uno rivolgiti alla segreteria."
        />
      ) : (
        <>
          <SummaryCard
            icon="document-text-outline"
            eyebrow={toRenew > 0 ? "In scadenza" : "Tutto in regola"}
            title={toRenew > 0 ? "Da rinnovare" : "Nessuna scadenza vicina"}
            value={String(toRenew)}
            valueMuted={toRenew === 0}
          />
          <SectionLabel
            label="I tuoi documenti"
            trailing={String(documents.length)}
            style={{ paddingTop: 4 }}
          />
          {documents.map((document) => {
            const documentStatus = resolveTrainerDocumentStatus(document);
            const look = STATUS_LOOK[documentStatus];
            return (
              <GlassRow
                key={document.id}
                icon={
                  documentStatus === "missing-file"
                    ? "alert-circle-outline"
                    : /medic|sanit/i.test(document.typeLabel)
                      ? "medkit-outline"
                      : /tesser|card|iscri/i.test(document.typeLabel)
                        ? "card-outline"
                        : "document-text-outline"
                }
                iconColor={look.color}
                title={document.title}
                meta={
                  document.expiryDate
                    ? `${document.typeLabel} · Scade il ${formatItalianDate(document.expiryDate)}`
                    : document.typeLabel
                }
                borderColor={
                  documentStatus === "expired"
                    ? "rgba(239,68,68,0.35)"
                    : undefined
                }
                trailing={
                  <StatusPill
                    label={TRAINER_DOCUMENT_STATUS_LABELS[documentStatus]}
                    tier={look.tier}
                    tone={look.tone}
                    small
                  />
                }
              />
            );
          })}
          <InfoNote style={{ marginTop: 4 }}>
            Per caricare o sostituire un documento rivolgiti alla segreteria del
            club.
          </InfoNote>
        </>
      )}
    </SecondaryScreenLayout>
  );
}
