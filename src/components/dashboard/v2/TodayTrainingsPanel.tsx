"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, ChevronUp, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel, PanelHeader, InsetBlock } from "@/components/web/primitives/Surface";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { Skeleton } from "@/components/web/primitives/Controls";
import { EmptyStateCard, TimelineRow } from "@/components/web/page/Cards";
import { AlertBlock } from "@/components/web/page/Alerts";
import { ACTIVITY_STATUS, CALLUP_STATUS, STATUS_UNKNOWN } from "@/lib/web/status";
import { formatTime, joinMeta } from "@/lib/web/format";
import {
  buildAttendanceHref,
  loadSavedAttendance,
  type SavedAttendanceRow,
  type TodayTraining,
  type TodayTrainingsState,
} from "@/components/dashboard/v2/today-trainings";

/**
 * «Oggi in palestra» (guideline 09 §9.7): la timeline degli allenamenti di
 * oggi, ognuno con lo stato delle presenze e il verbo `Presenze`, che porta
 * al flusso di registrazione di `/training` con gli stessi parametri della V1.
 * Gli allenamenti degli altri giorni non compaiono: lo dice lo stato vuoto.
 */
const TRAININGS_HREF = "/training";

const isCancelled = (status: string) => status === "cancelled" || status === "annullato";
const isConcluded = (status: string) => status === "completed" || status === "concluded";

function AttendanceState({ training }: { training: TodayTraining }) {
  if (training.attendanceStatus === "saved") {
    const total = training.expectedAttendees > 0 ? training.expectedAttendees : null;
    return (
      <div className="text-right" title="Presenze salvate">
        <div className="egw-num font-brand text-[15px] font-extrabold leading-none text-egw-green">
          {training.attendees}/{total ?? "—"}
        </div>
        <div className="mt-1 font-brand text-[10px] font-medium text-egw-ink-42">presenti</div>
      </div>
    );
  }
  if (training.attendanceStatus === "pending") {
    return <StatusPill status={ACTIVITY_STATUS.in_progress} size="sm" title="Presenze in corso" />;
  }
  return <StatusPill status={STATUS_UNKNOWN} size="sm" title="Presenze non registrate" />;
}

function SavedAttendanceList({
  training,
  clubId,
}: {
  training: TodayTraining;
  clubId: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState<SavedAttendanceRow[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open || rows !== null) return;
    let cancelled = false;
    setLoading(true);
    loadSavedAttendance(training.id, clubId)
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((cause) => {
        console.error("Error fetching attendance data:", cause);
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, rows, training.id, clubId]);

  const present = rows ? rows.filter((row) => row.present).length : 0;
  /* Il denominatore e la rosa attesa e non si allarga (ADR-0198 §6). */
  const total = training.expectedAttendees || 0;

  return (
    <div className="pb-3 pl-[72px]">
      <Button
        variant="text"
        size="xs"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        trailingIcon={open ? <ChevronUp /> : <ChevronDown />}
      >
        {open ? "Nascondi elenco" : "Elenco presenze"}
      </Button>
      {open ? (
        <InsetBlock className="mt-2 p-3">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3.5 w-1/3" />
            </div>
          ) : rows && rows.length > 0 ? (
            <>
              <p className="egw-num mb-2 font-brand text-[12px] font-semibold text-egw-ink">
                Presenze: {present}/{total || "—"}
              </p>
              <ul className="divide-y divide-egw-rule">
                {rows.map((row, index) => (
                  <li key={`${row.name}-${index}`} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="egw-ellipsis font-brand text-[12.5px] text-egw-ink">{row.name}</span>
                    <StatusPill status={row.present ? CALLUP_STATUS.present : CALLUP_STATUS.absent} size="sm" />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="font-brand text-[12.5px] text-egw-ink-62">Nessun dato di presenza disponibile</p>
          )}
        </InsetBlock>
      ) : null}
    </div>
  );
}

export function TodayTrainingsPanel({
  state,
  clubId,
}: {
  state: TodayTrainingsState;
  clubId: string | null;
}) {
  const router = useRouter();
  const { trainings, loading, error, reload } = state;

  return (
    <Panel as="section" aria-labelledby="egw-today-trainings" className="p-5">
      <PanelHeader
        eyebrow="Oggi in palestra"
        title={<span id="egw-today-trainings">Allenamenti di oggi</span>}
        actions={
          <Button variant="text" size="sm" onClick={() => router.push(TRAININGS_HREF)}>
            Vai agli allenamenti
          </Button>
        }
      />
      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex gap-4 py-2">
              <Skeleton className="h-10 w-14" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
      ) : error ? (
        <AlertBlock
          severity="danger"
          title="Impossibile leggere gli allenamenti di oggi"
          actions={
            <Button variant="secondary" size="sm" onClick={reload}>
              Riprova
            </Button>
          }
        >
          Controlla la connessione e riprova.
        </AlertBlock>
      ) : trainings.length === 0 ? (
        <EmptyStateCard
          flat
          icon={<CalendarDays />}
          title="Nessun allenamento programmato per oggi"
          description="Gli allenamenti di altri giorni non compaiono qui."
          primary={
            <Button variant="secondary" size="sm" onClick={() => router.push(TRAININGS_HREF)}>
              Vai agli allenamenti
            </Button>
          }
        />
      ) : (
        <div>
          {trainings.map((training) => {
            const cancelled = isCancelled(String(training.status));
            const concluded = isConcluded(String(training.status));
            return (
              <React.Fragment key={training.key}>
                <TimelineRow
                  time={training.startTime ? formatTime(training.startTime) : "—"}
                  duration={training.durationMinutes ? `${training.durationMinutes} min` : undefined}
                  stripe={!cancelled && !concluded && training.attendanceStatus === "pending" ? "action" : null}
                  title={
                    <span className={cn("flex flex-wrap items-center gap-2", cancelled && "text-egw-ink-62 line-through")}>
                      <span className="egw-ellipsis min-w-0">{training.title}</span>
                      <DataChip tone="blue" size="sm">
                        {training.category}
                      </DataChip>
                      {cancelled ? <StatusPill status={ACTIVITY_STATUS.cancelled} size="sm" /> : null}
                      {concluded ? <StatusPill status={ACTIVITY_STATUS.completed} size="sm" /> : null}
                    </span>
                  }
                  meta={
                    <span className="inline-flex flex-wrap items-center gap-x-1.5">
                      <MapPin className="h-3 w-3 shrink-0 text-egw-ink-42" aria-hidden />
                      {joinMeta(training.location, training.trainer)}
                    </span>
                  }
                  aside={
                    <>
                      <AttendanceState training={training} />
                      {!cancelled ? (
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => router.push(buildAttendanceHref(training, clubId))}
                          aria-label={`Presenze di ${training.title}`}
                        >
                          Presenze
                        </Button>
                      ) : null}
                    </>
                  }
                />
                {training.attendanceStatus === "saved" ? (
                  <SavedAttendanceList training={training} clubId={clubId} />
                ) : null}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
