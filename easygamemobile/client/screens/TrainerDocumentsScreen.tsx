import React from "react";
import { View } from "react-native";

import {
  GlassCard,
  MetaRow,
  SecondaryScreenLayout,
  SignatureText,
  StateMessage,
  StatusPill,
} from "@/components/signature";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { useAsyncSection } from "@/hooks/useAsyncSection";
import {
  normalizeTrainerDocuments,
  resolveTrainerDocumentStatus,
  TRAINER_DOCUMENT_STATUS_LABELS,
  type TrainerDocument,
} from "@/lib/trainer-documents";
import { formatItalianDate } from "@/lib/mobile-ui";
import { Spacing } from "@/constants/theme";
import type { StatusPillVariant } from "@/components/signature/StatusPill";

const STATUS_VARIANT: Record<string, StatusPillVariant> = {
  valid: "success",
  expiring: "warning",
  expired: "destructive",
  "no-expiry": "default",
  "missing-file": "default",
};

/**
 * I propri documenti — stesso record letto sul Web
 * (`GET /api/v1/trainers`, dopo la correzione dell'allow-list in WP1: prima
 * questa sezione sarebbe stata sempre vuota, anche con documenti caricati
 * dalla segreteria). Sola lettura: "per caricare o sostituire rivolgiti alla
 * segreteria", come sul Web.
 *
 * L'apertura/il download del file non e implementato in questo giro — vedi
 * la nota di testa in `client/lib/trainer-documents.ts`.
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

  return (
    <SecondaryScreenLayout title="Documenti" eyebrow="Personale">
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
        (data || []).map((document) => {
          const documentStatus = resolveTrainerDocumentStatus(document);
          return (
            <GlassCard key={document.id} style={{ gap: Spacing.xs }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: Spacing.sm,
                }}
              >
                <SignatureText variant="h4" tone="ink" style={{ flex: 1 }}>
                  {document.title}
                </SignatureText>
                <StatusPill
                  label={TRAINER_DOCUMENT_STATUS_LABELS[documentStatus]}
                  variant={STATUS_VARIANT[documentStatus]}
                  small
                />
              </View>
              <MetaRow icon="pricetag-outline">{document.typeLabel}</MetaRow>
              {document.expiryDate ? (
                <MetaRow icon="calendar-outline">
                  Scade il {formatItalianDate(document.expiryDate)}
                </MetaRow>
              ) : null}
            </GlassCard>
          );
        })
      )}
      <View style={{ height: Spacing.lg }} />
    </SecondaryScreenLayout>
  );
}
