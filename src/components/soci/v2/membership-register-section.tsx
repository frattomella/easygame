"use client";

import * as React from "react";
import { BookOpen } from "lucide-react";
import { DetailCard, EmptyStateCard, type DetailField } from "@/components/web/page/Cards";
import { CollapsedSection } from "@/components/web/record/Record";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { formatDateShort, MISSING, orMissing } from "@/lib/web/format";
import type { MembershipRecordView } from "@/lib/members/client";
import { MEMBERSHIP_EVENT_LABELS, MEMBERSHIP_EVENT_TYPES, MEMBERSHIP_REGISTER_DISCLAIMER, canApplyMembershipEvent } from "@/lib/members/model";
import { registerStatusSpec } from "@/components/soci/v2/member-model";

/**
 * L'area «Libro soci» della scheda: la posizione derivata e lo storico.
 *
 * Sostituisce `membership-register-panel.tsx` (V1) con le stesse letture:
 * il record arriva da `fetchMembershipRecord` (lo carica la scheda, che ne ha
 * bisogno anche per l'intestazione) e la scrittura vive nel cassetto
 * `MembershipEventDrawer`. Registrare una dimissione non modifica niente —
 * aggiunge una riga — ed e la ragione per cui qui non esiste un pulsante
 * «disattiva».
 */
const dateOrMissing = (value?: string | null) => (String(value || "").trim() ? formatDateShort(value) : MISSING);

export function MembershipRegisterSection({
  record,
  loading,
  canManage,
  onRecordEvent,
}: {
  record: MembershipRecordView | null;
  loading: boolean;
  /** `canManageMembershipRegister(role)`: senza, il pulsante e assente, non disabilitato. */
  canManage: boolean;
  onRecordEvent: () => void;
}) {
  const stato = record?.status;
  const eventiPossibili = MEMBERSHIP_EVENT_TYPES.filter((tipo) => canApplyMembershipEvent(stato?.status || "mai_ammesso", tipo));
  const events = record?.events || [];

  const fields: DetailField[] = [
    {
      label: "Stato",
      value: (
        <div>
          <StatusPill status={registerStatusSpec(stato?.status)} detail={stato?.since ? `dal ${formatDateShort(stato.since)}` : undefined} />
          <p className="mt-1.5 font-brand text-[11.5px] text-[rgba(11,26,58,.55)]">Lo stato non è un campo: si ricava dagli eventi qui sotto.</p>
        </div>
      ),
    },
    { label: "Numero di tessera", value: <span className="egw-num">{orMissing(stato?.membershipNumber)}</span> },
    { label: "Ammesso il", value: dateOrMissing(stato?.admittedOn) },
    { label: "Delibera", value: orMissing(stato?.resolutionReference) },
    ...(stato?.endedOn
      ? [
          { label: "Cessazione", value: dateOrMissing(stato.endedOn) },
          { label: "Motivo", value: orMissing(stato.reason) },
        ]
      : []),
  ];

  return (
    <>
      <DetailCard
        eyebrow="Libro soci"
        title="Posizione associativa"
        fields={loading ? undefined : fields}
        loading={loading}
        actions={
          canManage && eventiPossibili.length > 0 ? (
            <Button variant="secondary" size="sm" icon={<BookOpen />} onClick={onRecordEvent}>
              Registra un evento
            </Button>
          ) : null
        }
      >
        <p className="mt-5 font-brand text-[12px] leading-[1.5] text-egw-ink-62">{MEMBERSHIP_REGISTER_DISCLAIMER}</p>
      </DetailCard>

      <CollapsedSection id="storico" recordType="member" title="Storico" count={events.length} defaultOpen summary={events.length ? `Ultimo evento: ${MEMBERSHIP_EVENT_LABELS[events[events.length - 1].eventType] || events[events.length - 1].eventType}` : "Nessun evento nel libro"}>
        {!events.length ? (
          <EmptyStateCard
            flat
            icon={<BookOpen />}
            iconTone="neutral"
            title="Nessun evento nel libro per questo socio"
            description="Chi è stato registrato prima che il libro esistesse entra con la sua ammissione, con gli estremi della delibera che la decise."
          />
        ) : (
          <ul className="flex flex-col">
            {events.map((evento) => (
              <li key={evento.id} className="flex flex-col gap-1 border-b border-egw-rule py-3 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <DataChip size="sm" tone={evento.eventType === "ADMISSION" || evento.eventType === "REINSTATEMENT" ? "green" : "neutral"}>
                    {MEMBERSHIP_EVENT_LABELS[evento.eventType] || evento.eventType}
                  </DataChip>
                  <span className="font-brand text-[13px] font-semibold text-egw-ink">{dateOrMissing(evento.effectiveDate)}</span>
                  {evento.membershipNumber ? <span className="egw-num font-brand text-[12px] text-egw-ink-62">tessera {evento.membershipNumber}</span> : null}
                </div>
                <div className="flex flex-col gap-0.5 font-brand text-[12.5px] text-egw-ink-72">
                  {evento.resolutionReference ? (
                    <p>
                      {evento.resolutionReference}
                      {evento.resolutionDate ? ` — ${formatDateShort(evento.resolutionDate)}` : ""}
                    </p>
                  ) : null}
                  {evento.reason ? <p>Motivo: {evento.reason}</p> : null}
                  {evento.notes ? <p>{evento.notes}</p> : null}
                  <p className="text-[11.5px] text-[rgba(11,26,58,.55)]">
                    Registrato il {dateOrMissing(evento.createdAt)} a nome di {evento.memberLabel}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CollapsedSection>
    </>
  );
}
