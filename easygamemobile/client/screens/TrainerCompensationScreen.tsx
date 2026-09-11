import React from "react";

import {
  GlassCard,
  GlassRow,
  MetaRow,
  SecondaryScreenLayout,
  SectionLabel,
  StateMessage,
  StatusPill,
  SummaryCard,
} from "@/components/signature";
import type { StatusPillTier, StatusPillTone } from "@/components/signature";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { useAsyncSection } from "@/hooks/useAsyncSection";
import { formatItalianDate } from "@/lib/mobile-ui";
import type { OwnCompensationStatement } from "@/services/api";

const formatEuro = (value: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
    value || 0,
  );

/** Lo stato di una rata lo scrive il server; qui si sceglie solo il peso visivo (design §5c). */
const installmentLook = (
  status: string,
  remaining: number,
): { tier: StatusPillTier; tone: StatusPillTone; color: string } => {
  const key = status.toLowerCase();
  if (/liquidat|pagat|paid|settled/.test(key) || remaining <= 0) {
    return { tier: "quiet", tone: "success", color: "#10B981" };
  }
  if (/scadut|overdue|ritardo/.test(key)) {
    return { tier: "urgent", tone: "danger", color: "#EF4444" };
  }
  if (/liquidazione|processing|attesa|pending/.test(key)) {
    return { tier: "outline", tone: "warning", color: "#F59E0B" };
  }
  return { tier: "solid", tone: "info", color: "#2563EB" };
};

/**
 * I propri compensi, sola lettura — stesso endpoint del Web
 * (`GET /api/v1/sport-work/me`). Elenco chiuso: niente IBAN, niente dati
 * contributivi, esattamente cio che il server restituisce e nient'altro
 * (`OwnCompensationStatement`, `src/lib/server/trainer-area.ts`).
 *
 * Composizione: design `IA e Home` §3c ("Compensi") — scheda scura con la
 * posizione dell'anno nel cielo, poi una riga per rata (mese/etichetta,
 * "sessioni · importo", pill: In liquidazione / Liquidato / Scaduto) e i
 * rapporti come schede con `MetaRow`.
 */
export default function TrainerCompensationScreen() {
  const { status, data, errorMessage, reload } =
    useAsyncSection<OwnCompensationStatement | null>(
      () => mobileBackendStorage.getMyCompensation(),
      (statement) => statement === null,
    );

  const installments = [...(data?.installments || [])].sort((a, b) =>
    b.dueDate.localeCompare(a.dueDate),
  );

  return (
    <SecondaryScreenLayout
      title="Compensi"
      eyebrow={`Allenatore · ${data?.position ? `Anno ${data.position.year}` : "Lavoro sportivo"}`}
      skyHeight={300}
      contentGap={10}
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
          <SummaryCard
            icon="cash-outline"
            eyebrow={
              data.position ? `Posizione ${data.position.year}` : "Posizione"
            }
            title={
              data.position
                ? formatEuro(data.position.clubGross)
                : "Nessuna posizione annuale"
            }
            value="→"
            valueMuted
          >
            {data.position ? (
              <>
                <MetaRow icon="document-text-outline" onDark>
                  Dichiarato da altri:{" "}
                  {formatEuro(data.position.externalDeclared)}
                </MetaRow>
                <MetaRow icon="calculator-outline" onDark>
                  Progressivo: {formatEuro(data.position.progressive)}
                </MetaRow>
              </>
            ) : null}
          </SummaryCard>

          <SectionLabel
            label="Rate"
            trailing={String(installments.length)}
            style={{ paddingTop: 4 }}
          />
          {installments.length === 0 ? (
            <StateMessage kind="empty" title="Nessuna rata" />
          ) : (
            installments.map((installment) => {
              const look = installmentLook(
                installment.status,
                installment.remainingAmount,
              );
              return (
                <GlassRow
                  key={installment.id}
                  icon="cash-outline"
                  iconColor={look.color}
                  title={installment.label}
                  meta={`Scadenza ${formatItalianDate(installment.dueDate)} · ${formatEuro(installment.grossAmount)}${installment.paidAmount ? ` · erogato ${formatEuro(installment.paidAmount)}` : ""}`}
                  borderColor={
                    look.tier === "urgent" ? "rgba(239,68,68,0.35)" : undefined
                  }
                  trailing={
                    <StatusPill
                      label={installment.status}
                      tier={look.tier}
                      tone={look.tone}
                      small
                    />
                  }
                />
              );
            })
          )}

          <SectionLabel
            label="Rapporti"
            trailing={String(data.relationships.length)}
            style={{ paddingTop: 6 }}
          />
          {data.relationships.length === 0 ? (
            <StateMessage kind="empty" title="Nessun rapporto" />
          ) : (
            data.relationships.map((relationship) => (
              <GlassCard
                key={relationship.id}
                eyebrow={relationship.relationshipType}
                title={relationship.role}
              >
                <StatusPill
                  label={relationship.status}
                  tier="quiet"
                  tone="info"
                  small
                  style={{ marginBottom: 6 }}
                />
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
        </>
      )}
    </SecondaryScreenLayout>
  );
}
