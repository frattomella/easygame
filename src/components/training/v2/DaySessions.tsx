"use client";

import * as React from "react";
import { CalendarDays, MapPin, MoreHorizontal, Pencil, RotateCcw, Trash2, Users, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/web/primitives/Surface";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { Skeleton } from "@/components/web/primitives/Controls";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/web/primitives/Overlays";
import { EmptyStateCard, TimelineRow } from "@/components/web/page/Cards";
import { formatTime } from "@/lib/web/format";
import { getTrainingStableKey } from "@/lib/training-utils";
import {
  attendanceStatusSpec,
  attendanceVerb,
  sessionAttendanceSummary,
  sessionAttendanceTone,
  sessionDurationMinutes,
  sessionPhase,
  sessionStatusSpec,
  type TrainingSession,
} from "@/components/training/v2/training-page-model";

/**
 * Le sedute della giornata (mockup P4, guideline 09 §9.3 «Timeline card»):
 * un pannello per seduta, il rail dell'ora a sinistra, titolo + chip
 * categoria, sede · allenatori, la riga delle presenze (`14/16 presenti` in
 * verde tabellare, o la conseguenza in ambra), a destra la pillola e **il**
 * verbo delle presenze; tutto il resto — Modifica, Annulla, Ripristina,
 * Elimina — sta nel `···`, le distruttive in fondo.
 *
 * Le azioni che il ruolo non puo fare non compaiono: gli stessi predicati
 * della V1 (`canRecordTrainingAttendance`, la fase derivata), non uno in piu.
 */
export type SessionActions = {
  onAttendance: (training: TrainingSession) => void;
  onEdit: (training: TrainingSession) => void;
  onCancel: (training: TrainingSession) => void;
  onRestore: (training: TrainingSession) => void;
  onDelete: (training: TrainingSession) => void;
};

export function SessionActionsMenu({
  training,
  actions,
  size = "sm",
}: {
  training: TrainingSession;
  actions: SessionActions;
  size?: "sm" | "xs";
}) {
  const phase = sessionPhase(training);
  const cancelled = phase === "annullato";
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton aria-label={`Altre azioni per ${training.title}`} variant="row" size={size}>
          <MoreHorizontal />
        </IconButton>
      </MenuTrigger>
      <MenuContent align="end" width={220}>
        {!cancelled ? (
          <MenuItem onSelect={() => actions.onEdit(training)}>
            <Pencil />
            Modifica
          </MenuItem>
        ) : null}
        {!cancelled && phase !== "concluded" ? (
          <MenuItem onSelect={() => actions.onCancel(training)}>
            <XCircle />
            Annulla allenamento
          </MenuItem>
        ) : null}
        {cancelled ? (
          <MenuItem onSelect={() => actions.onRestore(training)}>
            <RotateCcw />
            Ripristina
          </MenuItem>
        ) : null}
        <MenuSeparator />
        <MenuItem tone="danger" onSelect={() => actions.onDelete(training)}>
          <Trash2 />
          Elimina
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** La riga «14/16 presenti» o la conseguenza in ambra, condivisa fra giornata e griglia. */
export function AttendanceLine({ training, compact = false }: { training: TrainingSession; compact?: boolean }) {
  const tone = sessionAttendanceTone(training);
  const summary = sessionAttendanceSummary(training);
  const phase = sessionPhase(training);
  if (tone === "recorded") {
    const absent = Math.max(summary.recorded - summary.present, 0);
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-2.5">
        <span className={cn("egw-num font-brand font-bold text-egw-green", compact ? "text-[12.5px]" : "text-[13px]")}>
          {summary.present}/{summary.total || summary.recorded} presenti
        </span>
        {absent > 0 ? (
          <span className="font-brand text-[12px] text-egw-ink-62">
            {absent} {absent === 1 ? "assente" : "assenti"}
          </span>
        ) : null}
      </span>
    );
  }
  if (tone === "missing") {
    return (
      <span className={cn("font-brand text-egw-amber-ink", compact ? "text-[12px]" : "text-[12.5px]")}>
        {summary.total > 0 ? `${summary.total} attesi in squadra` : "Nessun atleta atteso"}
        {phase === "in_progress" ? " · la seduta è in corso" : phase === "concluded" ? " · presenze da registrare" : ""}
      </span>
    );
  }
  return (
    <span className={cn("egw-num font-brand text-egw-ink-62", compact ? "text-[12px]" : "text-[12.5px]")}>
      {summary.total > 0 ? `${summary.total} attesi in squadra` : "—"}
    </span>
  );
}

function SessionAside({ training, actions, mobile }: { training: TrainingSession; actions: SessionActions; mobile?: boolean }) {
  const phase = sessionPhase(training);
  const statusSpec = sessionStatusSpec(phase);
  const attendanceSpec = attendanceStatusSpec(sessionAttendanceTone(training));
  const verb = attendanceVerb(training);
  /*
    Una pillola per ciclo di vita: la seduta e «in corso»/«completata»/
    «annullata»; le presenze sono «registrate»/«non registrate». Qui la
    pillola che conta e quella delle presenze, e quella della seduta compare
    solo quando dice qualcosa che l'ora non dice gia (in corso, annullata).
  */
  const showPhasePill = phase === "annullato" || phase === "in_progress";
  return (
    <div className={cn("flex items-center gap-2", mobile ? "flex-wrap" : "flex-col items-end")}>
      <div className="flex flex-wrap items-center gap-1.5">
        {showPhasePill ? <StatusPill status={statusSpec} size="sm" /> : null}
        {attendanceSpec && phase !== "annullato" ? <StatusPill status={attendanceSpec} size="sm" /> : null}
      </div>
      <div className="flex items-center gap-1.5">
        {verb ? (
          <Button
            variant={verb === "Rivedi presenze" ? "secondary" : "neutral"}
            size="sm"
            onClick={() => actions.onAttendance(training)}
            aria-label={`${verb} di ${training.title}`}
          >
            {verb}
          </Button>
        ) : null}
        <SessionActionsMenu training={training} actions={actions} />
      </div>
    </div>
  );
}

export function SessionCard({ training, actions }: { training: TrainingSession; actions: SessionActions }) {
  const phase = sessionPhase(training);
  const cancelled = phase === "annullato";
  const duration = sessionDurationMinutes(training);
  const missing = !cancelled && sessionAttendanceTone(training) === "missing";
  return (
    <Panel
      as="article"
      aria-label={training.title}
      className={cn("px-5 py-2 sm:px-6", missing && "border-egw-tint-amber-bd")}
      data-test="training-session"
    >
      <TimelineRow
        className="border-0"
        stripe={phase === "in_progress" ? "action" : null}
        time={<span className={cn(cancelled && "text-egw-ink-42 line-through")}>{training.time ? formatTime(training.time) : "—"}</span>}
        duration={duration ? `${duration} min` : training.endTime ? `fino alle ${formatTime(training.endTime)}` : undefined}
        title={
          <span className={cn("flex flex-wrap items-center gap-2", cancelled && "text-egw-ink-62 line-through")}>
            <span className="min-w-0 text-[15px] font-bold">{training.title}</span>
            <DataChip tone="blue" size="sm" title={training.category}>
              {training.category}
            </DataChip>
          </span>
        }
        meta={
          <>
            <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px]">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-egw-ink-42" aria-hidden />
                <span className="egw-ellipsis" title={training.location}>{training.location}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 shrink-0 text-egw-ink-42" aria-hidden />
                <span className="egw-ellipsis" title={training.trainer}>{training.trainer}</span>
              </span>
            </span>
            {!cancelled ? (
              <span className="mt-2 block">
                <AttendanceLine training={training} />
              </span>
            ) : null}
            <span className="mt-3 block sm:hidden">
              <SessionAside training={training} actions={actions} mobile />
            </span>
          </>
        }
        aside={
          <span className="hidden sm:block">
            <SessionAside training={training} actions={actions} />
          </span>
        }
      />
    </Panel>
  );
}

export function DaySessions({
  trainings,
  loading,
  actions,
  onCreate,
  filtered,
}: {
  trainings: TrainingSession[];
  loading: boolean;
  actions: SessionActions;
  onCreate?: () => void;
  /** Vero quando un contesto (la sede) sta restringendo l'elenco. */
  filtered?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3.5" aria-busy="true" aria-label="Caricamento delle sedute">
        {[0, 1, 2].map((index) => (
          <Panel key={index} className="px-6 py-4">
            <div className="flex gap-4">
              <Skeleton className="h-10 w-14" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-8 w-28" />
            </div>
          </Panel>
        ))}
      </div>
    );
  }

  if (!trainings.length) {
    return (
      <EmptyStateCard
        icon={<CalendarDays />}
        title="Nessun allenamento programmato per questa data"
        description={
          filtered
            ? "Con la sede scelta non c'è nessuna seduta in questo giorno: prova a cambiare il contesto."
            : "Scegli un altro giorno dal rail, oppure aggiungi una seduta."
        }
        primary={
          onCreate ? (
            <Button variant="neutral" onClick={onCreate}>
              Nuovo allenamento
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3.5" data-test="training-day-sessions">
      {trainings.map((training) => (
        <SessionCard key={getTrainingStableKey(training)} training={training} actions={actions} />
      ))}
    </div>
  );
}
