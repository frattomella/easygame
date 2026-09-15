"use client";

import * as React from "react";
import {
  Copy,
  MapPin,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
  Trophy,
  Users,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/web/primitives/Surface";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { Skeleton } from "@/components/web/primitives/Controls";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/web/primitives/Overlays";
import { EmptyStateCard, TimelineRow } from "@/components/web/page/Cards";
import { formatTime } from "@/lib/web/format";
import { formatMatchLocationLabel } from "@/lib/match-location";
import { MatchCertificateWarningBadge } from "@/components/matches/MatchCertificateWarningBadge";
import type { MatchCertificateWarningResult } from "@/lib/match-certificate-warnings";
import {
  convocatedCountOf,
  convocationTone,
  convocationVerb,
  getEffectiveMatchStatus,
  isHomeMatch,
  matchEndTime,
  matchStartTime,
  matchStatusSpec,
  type MatchRecord,
} from "@/components/matches/v2/match-page-model";

/**
 * Le gare della giornata (guideline 09 §9.3 «Timeline card», §9.7 «Prossime
 * gare» con il filo arancio del modulo): un pannello per gara, il rail
 * dell'ora a sinistra, «vs {avversario}» + chip casa/trasferta + chip
 * categoria, sede · campo · allenatori, la riga delle convocazioni
 * (`n convocati · n senza risposta`, o la conseguenza in ambra), l'avviso sui
 * certificati, a destra la pillola e **il** verbo delle convocazioni; tutto il
 * resto — Modifica, Duplica, Annulla, Ripristina, Elimina — sta nel `···`.
 *
 * Le azioni che non si possono fare non compaiono: gli stessi predicati
 * della V1 (`canManageMatch` = stato derivato «in programma»).
 */
export type MatchActions = {
  onConvocations: (match: MatchRecord) => void;
  onEdit: (match: MatchRecord) => void;
  onDuplicate: (match: MatchRecord) => void;
  onCancel: (match: MatchRecord) => void;
  onRestore: (match: MatchRecord) => void;
  onDelete: (match: MatchRecord) => void;
};

/** Le risposte delle famiglie, per gara, lette dalla rotta RSVP (`null` = non richieste). */
export type RsvpCounts = { yes: number; no: number; noResponse: number } | null;

export function MatchActionsMenu({
  match,
  actions,
  size = "sm",
}: {
  match: MatchRecord;
  actions: MatchActions;
  size?: "sm" | "xs";
}) {
  const status = getEffectiveMatchStatus(match);
  const manageable = status === "upcoming";
  const cancelled = status === "cancelled";
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton aria-label={`Altre azioni per ${match.title}`} variant="row" size={size}>
          <MoreHorizontal />
        </IconButton>
      </MenuTrigger>
      <MenuContent align="end" width={220}>
        {!cancelled ? (
          <MenuItem onSelect={() => actions.onEdit(match)}>
            <Pencil />
            {manageable ? "Modifica" : "Apri"}
          </MenuItem>
        ) : null}
        <MenuItem onSelect={() => actions.onDuplicate(match)}>
          <Copy />
          Duplica
        </MenuItem>
        {manageable ? (
          <MenuItem onSelect={() => actions.onCancel(match)}>
            <XCircle />
            Annulla gara
          </MenuItem>
        ) : null}
        {cancelled ? (
          <MenuItem onSelect={() => actions.onRestore(match)}>
            <RotateCcw />
            Ripristina
          </MenuItem>
        ) : null}
        <MenuSeparator />
        <MenuItem tone="danger" onSelect={() => actions.onDelete(match)}>
          <Trash2 />
          Elimina
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** La riga «n convocati · n senza risposta», o la conseguenza in ambra. */
export function ConvocationLine({
  match,
  rsvp,
  compact = false,
}: {
  match: MatchRecord;
  rsvp?: RsvpCounts;
  compact?: boolean;
}) {
  const tone = convocationTone(match);
  const count = convocatedCountOf(match);
  const size = compact ? "text-[12px]" : "text-[12.5px]";
  if (tone === "missing") {
    return (
      <span className={cn("font-brand text-egw-amber-ink", size)}>Convocazioni mancanti</span>
    );
  }
  if (tone === "none" && count === 0) {
    return <span className={cn("egw-num font-brand text-egw-ink-62", size)}>—</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2.5">
      <span className={cn("egw-num font-brand font-bold text-egw-green", size)}>
        {count} {count === 1 ? "convocato" : "convocati"}
      </span>
      {tone === "pending" ? <span className={cn("font-brand text-egw-amber-ink", size)}>in corso</span> : null}
      {rsvp && rsvp.noResponse > 0 ? (
        <span className={cn("egw-num font-brand text-egw-amber-ink", size)}>
          {rsvp.noResponse} senza risposta
        </span>
      ) : rsvp ? (
        <span className={cn("egw-num font-brand text-egw-ink-62", size)}>
          {rsvp.yes} ci saranno · {rsvp.no} non ci saranno
        </span>
      ) : null}
    </span>
  );
}

function MatchAside({
  match,
  actions,
  mobile,
}: {
  match: MatchRecord;
  actions: MatchActions;
  mobile?: boolean;
}) {
  const status = getEffectiveMatchStatus(match);
  const verb = convocationVerb(match);
  /*
    Una pillola per ciclo di vita: la gara e «programmata»/«completata»/
    «annullata». In programma la pillola non dice niente che la data non dica
    gia, e resta il verbo.
  */
  const showStatusPill = status !== "upcoming";
  return (
    <div className={cn("flex items-center gap-2", mobile ? "flex-wrap" : "flex-col items-end")}>
      {showStatusPill ? <StatusPill status={matchStatusSpec(status)} size="sm" /> : null}
      <div className="flex items-center gap-1.5">
        {verb ? (
          <Button
            variant={verb === "Apri convocazioni" ? "secondary" : "neutral"}
            size="sm"
            icon={<Users />}
            onClick={() => actions.onConvocations(match)}
            aria-label={`${verb} di ${match.title}`}
          >
            {verb}
          </Button>
        ) : null}
        <MatchActionsMenu match={match} actions={actions} />
      </div>
    </div>
  );
}

export function MatchCard({
  match,
  actions,
  warning,
  rsvp,
  siteName,
}: {
  match: MatchRecord;
  actions: MatchActions;
  warning: MatchCertificateWarningResult;
  rsvp?: RsvpCounts;
  siteName?: string;
}) {
  const status = getEffectiveMatchStatus(match);
  const cancelled = status === "cancelled";
  const missing = !cancelled && convocationTone(match) === "missing";
  const start = matchStartTime(match);
  const end = matchEndTime(match);
  const home = isHomeMatch(match);
  const location = formatMatchLocationLabel(match);
  return (
    <Panel
      as="article"
      aria-label={match.title}
      className={cn("px-5 py-2 sm:px-6", missing && "border-egw-tint-amber-bd")}
      data-test="match-card"
    >
      <TimelineRow
        className="border-0"
        stripe={cancelled ? null : "match"}
        time={<span className={cn(cancelled && "text-egw-ink-42 line-through")}>{start ? formatTime(start) : "—"}</span>}
        duration={end ? `fino alle ${formatTime(end)}` : undefined}
        title={
          <span className={cn("flex flex-wrap items-center gap-2", cancelled && "text-egw-ink-62 line-through")}>
            <Trophy className="h-3.5 w-3.5 shrink-0 text-egw-orange" aria-hidden />
            <span className="min-w-0 text-[15px] font-bold">
              {match.opponent ? `vs ${match.opponent}` : match.title}
            </span>
            <DataChip tone={home ? "green" : "amber"} size="sm">
              {home ? "In casa" : "Trasferta"}
            </DataChip>
            <DataChip tone="blue" size="sm" title={match.category}>
              {match.category || "Categoria"}
            </DataChip>
            {match.matchNumber ? (
              <DataChip tone="neutral" size="sm" title={`Numero di gara ${match.matchNumber}`}>
                N. {match.matchNumber}
              </DataChip>
            ) : null}
          </span>
        }
        meta={
          <>
            {match.title && match.opponent && match.title !== `vs ${match.opponent}` ? (
              <span className="egw-ellipsis block text-[12px] text-egw-ink-62" title={match.title}>
                {match.title}
              </span>
            ) : null}
            <span className="mt-0.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px]">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-egw-ink-42" aria-hidden />
                <span className="egw-ellipsis" title={[siteName, location].filter(Boolean).join(" · ")}>
                  {[siteName, location].filter(Boolean).join(" · ")}
                </span>
              </span>
              {match.trainers?.length ? (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 shrink-0 text-egw-ink-42" aria-hidden />
                  <span className="egw-ellipsis" title={match.trainers.join(", ")}>
                    {match.trainers.join(", ")}
                  </span>
                </span>
              ) : null}
            </span>
            {match.notes ? (
              <span className="mt-1.5 block whitespace-pre-line text-[12px] text-egw-ink-62">{match.notes}</span>
            ) : null}
            {!cancelled ? (
              <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <ConvocationLine match={match} rsvp={rsvp} />
                {warning.hasInvalidCertificates ? <MatchCertificateWarningBadge warning={warning} /> : null}
              </span>
            ) : null}
            <span className="mt-3 block sm:hidden">
              <MatchAside match={match} actions={actions} mobile />
            </span>
          </>
        }
        aside={
          <span className="hidden sm:block">
            <MatchAside match={match} actions={actions} />
          </span>
        }
      />
    </Panel>
  );
}

export function DayMatches({
  matches,
  loading,
  actions,
  onCreate,
  filtered,
  warningOf,
  rsvpOf,
  siteNameOf,
}: {
  matches: MatchRecord[];
  loading: boolean;
  actions: MatchActions;
  onCreate?: () => void;
  /** Vero quando un contesto (la categoria) sta restringendo l'elenco. */
  filtered?: boolean;
  warningOf: (match: MatchRecord) => MatchCertificateWarningResult;
  rsvpOf?: (match: MatchRecord) => RsvpCounts;
  siteNameOf?: (match: MatchRecord) => string;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3.5" aria-busy="true" aria-label="Caricamento delle gare">
        {[0, 1].map((index) => (
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

  if (!matches.length) {
    return (
      <EmptyStateCard
        icon={<Trophy />}
        title="Nessuna gara programmata per questa data"
        description={
          filtered
            ? "Con la categoria scelta non c'è nessuna gara in questo giorno: prova a cambiare il contesto."
            : "Seleziona un'altra data dal rail o aggiungi una nuova gara."
        }
        primary={
          onCreate ? (
            <Button variant="neutral" onClick={onCreate}>
              Nuova gara
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3.5" data-test="match-day-list">
      {matches.map((match) => (
        <MatchCard
          key={match.eventId || match.id}
          match={match}
          actions={actions}
          warning={warningOf(match)}
          rsvp={rsvpOf?.(match)}
          siteName={siteNameOf?.(match)}
        />
      ))}
    </div>
  );
}
