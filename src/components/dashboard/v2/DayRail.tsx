"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { Button } from "@/components/web/primitives/Button";
import { DataChip } from "@/components/web/primitives/StatusPill";
import { Skeleton } from "@/components/web/primitives/Controls";
import { TimelineRow } from "@/components/web/page/Cards";
import { MatchCertificateWarningBadge } from "@/components/matches/MatchCertificateWarningBadge";
import { formatDayMonth, formatTime, joinMeta } from "@/lib/web/format";
import { getInvalidCertificatesForConvocatedAthletes } from "@/lib/match-certificate-warnings";

/**
 * La colonna del giorno (guideline 09 §9.7): `Prossime gare`, `Appuntamenti`,
 * `Promemoria`. Ogni pannello ha un occhiello, al piu tre righe, il conteggio
 * e il link `Vedi tutte`; vuoto, dice il fatto in una riga e tiene il link.
 *
 * Le tre liste sono quelle della V1: prossime gare non annullate, prossimi
 * appuntamenti in ordine cronologico, promemoria attivi — gia selezionate da
 * `@/lib/dashboard/club-overview`.
 */
const MAX_ROWS = 3;

function RailPanel({
  eyebrow,
  title,
  titleId,
  count,
  href,
  emptyText,
  loading,
  children,
}: {
  eyebrow: string;
  title: string;
  titleId: string;
  count: number;
  href: string;
  emptyText: string;
  loading: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Panel as="section" aria-labelledby={titleId} className="p-5">
      <PanelHeader
        eyebrow={eyebrow}
        title={
          <span id={titleId} className="inline-flex items-center gap-2">
            {title}
            {!loading ? (
              <DataChip size="sm" className="egw-num" aria-label={`${count} in elenco`}>
                {count}
              </DataChip>
            ) : null}
          </span>
        }
        className="mb-3"
      />
      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      ) : count === 0 ? (
        <p className="font-brand text-[12.5px] leading-[1.5] text-egw-ink-62">{emptyText}</p>
      ) : (
        <div>{children}</div>
      )}
      <div className="mt-3">
        <Button variant="text" size="sm" className="-ml-2" onClick={() => router.push(href)}>
          Vedi tutte
        </Button>
      </div>
    </Panel>
  );
}

const timeOrMissing = (time: unknown) => {
  const text = String(time || "").trim();
  return text ? formatTime(text) : "—";
};

export function UpcomingMatchesPanel({
  matches,
  athletes,
  loading,
}: {
  matches: any[];
  athletes: any[];
  loading: boolean;
}) {
  return (
    <RailPanel
      eyebrow="Calendario"
      title="Prossime gare"
      titleId="egw-rail-matches"
      count={matches.length}
      href="/matches"
      emptyText="Nessuna gara in programma."
      loading={loading}
    >
      {matches.slice(0, MAX_ROWS).map((match) => {
        const warning = getInvalidCertificatesForConvocatedAthletes(match, athletes);
        return (
          <TimelineRow
            key={match.id}
            stripe="match"
            time={timeOrMissing(match.time)}
            duration={formatDayMonth(match.date)}
            title={match.opponent ? `vs ${match.opponent}` : match.title || "Gara"}
            meta={joinMeta(match.category, match.location)}
            aside={
              warning.hasInvalidCertificates ? (
                <MatchCertificateWarningBadge warning={warning} compact />
              ) : undefined
            }
          />
        );
      })}
    </RailPanel>
  );
}

export function UpcomingAppointmentsPanel({
  appointments,
  loading,
}: {
  appointments: any[];
  loading: boolean;
}) {
  return (
    <RailPanel
      eyebrow="Agenda"
      title="Appuntamenti"
      titleId="egw-rail-appointments"
      count={appointments.length}
      href="/secretariat"
      emptyText="Nessun appuntamento in agenda."
      loading={loading}
    >
      {appointments.slice(0, MAX_ROWS).map((appointment) => (
        <TimelineRow
          key={appointment.id}
          time={timeOrMissing(appointment.time)}
          duration={formatDayMonth(appointment.date)}
          title={appointment.title || "Appuntamento"}
          meta={appointment.person || appointment.athlete || undefined}
        />
      ))}
    </RailPanel>
  );
}

export function ActiveNotesPanel({ notes, loading }: { notes: any[]; loading: boolean }) {
  return (
    <RailPanel
      eyebrow="Segreteria"
      title="Promemoria"
      titleId="egw-rail-notes"
      count={notes.length}
      href="/secretariat"
      emptyText="Nessun promemoria attivo."
      loading={loading}
    >
      <ul className="divide-y divide-egw-rule">
        {notes.slice(0, MAX_ROWS).map((note) => (
          <li key={note.id} className="py-2.5 first:pt-0">
            <p className="line-clamp-2 font-brand text-[13px] font-semibold leading-5 text-egw-ink">
              {note.content}
            </p>
            <p className="mt-0.5 font-brand text-[11.5px] text-egw-ink-62">
              {note.expiryDate ? `Scade ${formatDayMonth(note.expiryDate)}` : "Promemoria attivo"}
            </p>
          </li>
        ))}
      </ul>
    </RailPanel>
  );
}
