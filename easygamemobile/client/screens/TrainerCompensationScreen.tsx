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
import { formatItalianDate } from "@/lib/mobile-ui";
import { Spacing } from "@/constants/theme";
import type { OwnCompensationStatement } from "@/services/api";

const formatEuro = (value: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
    value || 0,
  );

/**
 * I propri compensi, sola lettura — stesso endpoint del Web
 * (`GET /api/v1/sport-work/me`). Elenco chiuso: niente IBAN, niente dati
 * contributivi, esattamente cio che il server restituisce e nient'altro
 * (`OwnCompensationStatement`, `src/lib/server/trainer-area.ts`).
 */
export default function TrainerCompensationScreen() {
  const { status, data, errorMessage, reload } =
    useAsyncSection<OwnCompensationStatement | null>(
      () => mobileBackendStorage.getMyCompensation(),
      (statement) => statement === null,
    );

  return (
    <SecondaryScreenLayout
      title="I miei compensi"
      eyebrow="Personale"
      skyHeight={360}
    >
      {status === "loading" ? (
        <StateMessage kind="loading" tone="dark" title="Carico i compensi…" />
      ) : status === "forbidden" ? (
        <StateMessage
          kind="forbidden"
          tone="dark"
          message="Il club non ti ha dato accesso ai compensi."
        />
      ) : status === "network" || status === "error" ? (
        <StateMessage
          kind="error"
          tone="dark"
          message={errorMessage}
          actionLabel="Riprova"
          onAction={reload}
        />
      ) : status === "empty" || !data ? (
        <StateMessage
          kind="empty"
          tone="dark"
          title="Nessun rapporto configurato"
          message="Il club non ti ha ancora inserito nel registro del lavoro sportivo."
        />
      ) : (
        <>
          {data.position ? (
            <GlassCard
              eyebrow={`Posizione ${data.position.year}`}
              title="Situazione annuale"
            >
              <MetaRow icon="cash-outline">
                Erogato dal club: {formatEuro(data.position.clubGross)}
              </MetaRow>
              <MetaRow icon="document-text-outline">
                Dichiarato da altri:{" "}
                {formatEuro(data.position.externalDeclared)}
              </MetaRow>
              <MetaRow icon="calculator-outline">
                Totale: {formatEuro(data.position.progressive)}
              </MetaRow>
            </GlassCard>
          ) : null}

          <SignatureText
            variant="eyebrow"
            tone="onDarkMuted"
            style={{ marginTop: Spacing.sm }}
          >
            Rapporti
          </SignatureText>
          {data.relationships.length === 0 ? (
            <StateMessage kind="empty" tone="dark" title="Nessun rapporto" />
          ) : (
            data.relationships.map((relationship) => (
              <GlassCard key={relationship.id} style={{ gap: Spacing.xs }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: Spacing.sm,
                  }}
                >
                  <SignatureText variant="h4" tone="ink" style={{ flex: 1 }}>
                    {relationship.role}
                  </SignatureText>
                  <StatusPill
                    label={relationship.status}
                    variant="primary"
                    small
                  />
                </View>
                <MetaRow icon="calendar-outline">
                  Dal {formatItalianDate(relationship.startDate)}
                  {relationship.endDate
                    ? ` al ${formatItalianDate(relationship.endDate)}`
                    : ""}
                </MetaRow>
                {relationship.contractAmount ? (
                  <MetaRow icon="cash-outline">
                    {formatEuro(relationship.contractAmount)} ·{" "}
                    {relationship.compensationFrequency}
                  </MetaRow>
                ) : null}
              </GlassCard>
            ))
          )}

          <SignatureText
            variant="eyebrow"
            tone="onDarkMuted"
            style={{ marginTop: Spacing.sm }}
          >
            Rate
          </SignatureText>
          {data.installments.length === 0 ? (
            <StateMessage kind="empty" tone="dark" title="Nessuna rata" />
          ) : (
            data.installments.map((installment) => (
              <GlassCard key={installment.id} style={{ gap: Spacing.xs }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: Spacing.sm,
                  }}
                >
                  <SignatureText variant="h4" tone="ink" style={{ flex: 1 }}>
                    {installment.label}
                  </SignatureText>
                  <StatusPill
                    label={installment.status}
                    variant="primary"
                    small
                  />
                </View>
                <MetaRow icon="calendar-outline">
                  Scadenza {formatItalianDate(installment.dueDate)}
                </MetaRow>
                <MetaRow icon="cash-outline">
                  Lordo {formatEuro(installment.grossAmount)} · Erogato{" "}
                  {formatEuro(installment.paidAmount)}
                </MetaRow>
              </GlassCard>
            ))
          )}
        </>
      )}
      <View style={{ height: Spacing.lg }} />
    </SecondaryScreenLayout>
  );
}
