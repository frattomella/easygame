"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { DetailCard, EmptyStateCard, KpiCard } from "@/components/web/page/Cards";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { Skeleton } from "@/components/web/primitives/Controls";
import { formatDateShort, formatTime, joinMeta, MISSING } from "@/lib/web/format";
import type { TrialAthlete, TrialAttendanceRow } from "@/lib/trials/client";
import { ageFromBirthDate, trialStatusSpec } from "@/components/trials/v2/trial-model";

/**
 * La scheda di una persona in prova (ADR-0188), la stessa nella pagina del
 * club e nel cassetto dell'allenatore: anagrafica, stato, dove si allena,
 * recapiti (solo per chi puo leggerli), note, e lo **storico delle prove** —
 * conteggio, prima e ultima prova, l'elenco degli allenamenti con categoria
 * e sede — derivato dalle presenze, mai scritto a mano.
 */
export function TrialProfile({
  trial,
  attendances,
  loading,
  canReadContacts,
  onEdit,
  athleteHref,
}: {
  trial: TrialAthlete | null;
  attendances: TrialAttendanceRow[];
  loading: boolean;
  canReadContacts: boolean;
  onEdit?: () => void;
  /** Dove sta la scheda atleta, quando la persona e stata convertita. */
  athleteHref?: (athleteId: string) => string;
}) {
  if (loading || !trial) {
    return (
      <div className="flex flex-col gap-[18px]" role="status" aria-busy>
        <span className="sr-only">Scheda in caricamento</span>
        <div className="grid gap-[18px] sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Panel key={index}>
              <Skeleton className="mb-3 h-3 w-20" />
              <Skeleton className="h-8 w-16" />
            </Panel>
          ))}
        </div>
        <Panel>
          <Skeleton className="mb-3 h-3 w-24" />
          <Skeleton className="h-5 w-64" />
        </Panel>
      </div>
    );
  }

  const presenti = attendances.filter((row) => row.status === "present");
  const eta = ageFromBirthDate(trial.birthDate);
  const categorie = Array.from(new Set(presenti.map((row) => row.event.categoryLabel).filter(Boolean))) as string[];
  const sedi = Array.from(new Set(presenti.map((row) => row.event.location).filter(Boolean))) as string[];

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid gap-[18px] sm:grid-cols-3">
        <KpiCard label="Allenamenti di prova" value={trial.trialsCount} icon={<CalendarDays />} qualifier={trial.trialsCount === 1 ? "prova registrata" : "prove registrate"} />
        <KpiCard label="Prima prova" value={<span className="text-[20px]">{trial.firstTrialAt ? formatDateShort(trial.firstTrialAt) : MISSING}</span>} />
        <KpiCard label="Ultima prova" value={<span className="text-[20px]">{trial.lastTrialAt ? formatDateShort(trial.lastTrialAt) : MISSING}</span>} />
      </div>

      {trial.status === "enrolled" && trial.athleteId ? (
        <Panel className="flex flex-wrap items-center justify-between gap-3 py-4">
          <p className="font-brand text-[13px] text-egw-ink-72">
            Iscritta il <span className="egw-num font-semibold text-egw-ink">{formatDateShort(trial.convertedAt)}</span>: ha fatto{" "}
            <span className="egw-num font-semibold text-egw-ink">{trial.trialsCount}</span> {trial.trialsCount === 1 ? "allenamento di prova" : "allenamenti di prova"} prima dell&apos;iscrizione.
          </p>
          {athleteHref ? (
            <Link href={athleteHref(trial.athleteId)} className="rounded-egw-micro font-brand text-[12.5px] font-semibold text-egw-blue-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:shadow-egw-focus">
              Apri la scheda atleta
            </Link>
          ) : null}
        </Panel>
      ) : null}

      <DetailCard
        eyebrow="Anagrafica"
        title={trial.name}
        onEdit={onEdit}
        actions={<StatusPill status={trialStatusSpec(trial.status)} />}
        fields={[
          { label: "Data di nascita", value: trial.birthDate ? joinMeta(formatDateShort(trial.birthDate), eta !== null ? `${eta} anni` : null) : "Non nota · si chiede all'iscrizione" },
          { label: "Categoria", value: trial.categoryLabel ? <DataChip>{trial.categoryLabel}</DataChip> : null },
          { label: "Sede", value: trial.siteName },
          ...(canReadContacts
            ? [
                { label: "Telefono", value: trial.phone },
                { label: "Email", value: trial.email },
                { label: "Genitore o tutore", value: joinMeta(trial.guardianName, trial.guardianPhone) || null },
              ]
            : []),
          { label: "Note", value: trial.notes, wide: true },
          ...(trial.status === "declined" ? [{ label: "Non prosegue dal", value: formatDateShort(trial.declinedAt) }] : []),
        ]}
      />

      <Panel as="section">
        <PanelHeader
          eyebrow="Storico"
          title="Allenamenti di prova"
          description={
            categorie.length || sedi.length
              ? joinMeta(categorie.length ? `Categorie: ${categorie.join(", ")}` : null, sedi.length ? `Sedi: ${sedi.join(", ")}` : null)
              : "Le presenze registrate dal registro presenze degli allenamenti."
          }
        />
        {attendances.length === 0 ? (
          <EmptyStateCard flat icon={<CalendarDays />} title="Nessuna prova registrata" description="La presenza si segna dal registro presenze dell'allenamento, con «Atleta in prova»." />
        ) : (
          <ul className="divide-y divide-egw-rule" aria-label="Elenco delle prove">
            {attendances.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="egw-ellipsis font-brand text-[13px] font-semibold text-egw-ink">
                    <span className="egw-num">{formatDateShort(row.event.startsAt)}</span>
                    {" · "}
                    <span className="egw-num">{formatTime(row.event.startsAt)}</span>
                    {row.event.title ? ` · ${row.event.title}` : ""}
                  </p>
                  <p className="egw-ellipsis font-brand text-[11.5px] text-egw-ink-62">
                    {joinMeta(row.event.kind === "match" ? "Gara" : "Allenamento", row.event.location, row.notes)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {row.event.categoryLabel ? <DataChip size="sm">{row.event.categoryLabel}</DataChip> : null}
                  <StatusPill size="sm" status={row.status === "present" ? "present" : "absent"} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
