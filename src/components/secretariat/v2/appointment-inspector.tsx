"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, Check, UserX, X } from "lucide-react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { DateInput, Field, FieldSizeProvider, Textarea, TimeInput } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { InsetBlock } from "@/components/web/primitives/Surface";
import type { ClubAppointment } from "@/lib/api/appointments-client";
import { MISSING, formatDateShort, formatTime } from "@/lib/web/format";
import { appointmentPersonName, appointmentStatusSpec, formatDayLong, appointmentDay } from "@/components/secretariat/v2/secretariat-model";

/**
 * L'ispettore di un appuntamento (guideline 06 §6.7, 09 §9.3): il cassetto da
 * 480 che sostituisce il dialogo «Dettagli Appuntamento» della V1. Legge la
 * riga, e offre **solo** le mosse che il dominio ammette (`actions`, W6-51):
 * conferma, rifiuto, spostamento, chiusura (concluso · assente), annullo.
 *
 * Una nota sola, come nella V1, che va in due posti diversi secondo la mossa:
 * `decision_note` (la famiglia la legge) su rifiuto, annullo e spostamento;
 * `internal_notes` su concluso e assente. Lo spostamento sostituisce il corpo
 * con il suo modulo e una freccia «indietro» (un cassetto non ne apre un
 * secondo); rifiuto e annullo passano da una conferma che apre la pagina.
 */
export type AppointmentDecision = "confirm" | "reject" | "complete" | "no-show" | "cancel";

type Mode = { kind: "view" } | { kind: "reschedule" };

const can = (appointment: ClubAppointment | null, action: string) => Boolean(appointment && (appointment.actions || []).includes(action));

export function AppointmentInspector({
  open,
  onOpenChange,
  appointment,
  busy,
  onDecide,
  onReschedule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: ClubAppointment | null;
  busy: boolean;
  /** Le cinque mosse che aggiornano la riga; la pagina chiede conferma dove serve. */
  onDecide: (appointment: ClubAppointment, decision: AppointmentDecision, note: string) => Promise<void>;
  /** ADR-0101: chiude questa riga e ne crea una nuova; la pagina rilegge tutto. Torna `true` se e andata. */
  onReschedule: (appointment: ClubAppointment, date: string, time: string, note: string) => Promise<boolean>;
}) {
  const [mode, setMode] = React.useState<Mode>({ kind: "view" });
  const [note, setNote] = React.useState("");
  const [noteError, setNoteError] = React.useState<string | null>(null);
  const [newDate, setNewDate] = React.useState("");
  const [newTime, setNewTime] = React.useState("");
  const [moveError, setMoveError] = React.useState<string | null>(null);

  const appointmentId = appointment?.id ?? null;
  React.useEffect(() => {
    /*
      I campi si azzerano all'apertura (V1): restando pieni, il giorno digitato
      per un appuntamento comparirebbe gia scritto sul successivo.
    */
    setMode({ kind: "view" });
    setNote("");
    setNoteError(null);
    setNewDate("");
    setNewTime("");
    setMoveError(null);
  }, [open, appointmentId]);

  const actions = appointment?.actions || [];
  const hasActions = actions.length > 0;
  const day = appointment ? appointmentDay(appointment) : null;
  const personName = appointment ? appointmentPersonName(appointment) : "";

  const decide = (decision: AppointmentDecision) => {
    if (!appointment) return;
    if (decision === "reject" && !note.trim()) {
      // Il server lo pretende («Il motivo del rifiuto e obbligatorio»): si dice prima.
      setNoteError("Il motivo del rifiuto e obbligatorio: la famiglia lo legge");
      return;
    }
    setNoteError(null);
    void onDecide(appointment, decision, note.trim());
  };

  const move = async () => {
    if (!appointment) return;
    if (!newDate || !newTime) {
      setMoveError("Indica il nuovo giorno e il nuovo orario");
      return;
    }
    setMoveError(null);
    const ok = await onReschedule(appointment, newDate, newTime, note.trim());
    if (ok) onOpenChange(false);
  };

  const dirty = mode.kind === "reschedule" ? Boolean(newDate || newTime) : false;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow={mode.kind === "reschedule" ? "Spostamento" : "Appuntamento"}
      title={mode.kind === "reschedule" ? "Sposta l'appuntamento" : appointment?.title || "Dettagli appuntamento"}
      description={appointment && day ? `${formatDayLong(day)} · ${formatTime(appointment.time)}` : undefined}
      onBack={mode.kind === "reschedule" ? () => setMode({ kind: "view" }) : undefined}
      dirty={dirty && !busy}
      locked={busy}
      footer={
        mode.kind === "reschedule" ? (
          <>
            <Button variant="primary" onClick={() => void move()} loading={busy} disabled={!newDate || !newTime}>
              Conferma lo spostamento
            </Button>
            <Button variant="secondary" onClick={() => setMode({ kind: "view" })} disabled={busy}>
              Indietro
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Chiudi
          </Button>
        )
      }
      data-test="appointment-inspector"
    >
      {!appointment ? null : mode.kind === "view" ? (
        <FieldSizeProvider size="sm">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <StatusPill status={appointmentStatusSpec(appointment.status)} title={appointment.status_label} />
            <span className="egw-num font-brand text-[12px] text-egw-ink-62">versione {appointment.version}</span>
          </div>

          <DrawerSection eyebrow="Dettagli">
            <InsetBlock className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
              <DetailRow label="Data" value={day ? formatDateShort(day) : MISSING} />
              <DetailRow label="Orario" value={formatTime(appointment.time)} />
              <DetailRow label="Stato" value={appointment.status_label} />
              <DetailRow label="Nominativo" value={personName || MISSING} />
              <DetailRow label="Note" value={appointment.notes || MISSING} wide />
              {appointment.internal_notes ? <DetailRow label="Note interne" value={String(appointment.internal_notes)} wide /> : null}
              {appointment.decision_note ? <DetailRow label="Nota della decisione" value={appointment.decision_note} wide /> : null}
            </InsetBlock>
          </DrawerSection>

          {hasActions ? (
            <DrawerSection eyebrow="Risposta" title="Cosa rispondi alla famiglia">
              <Field
                label="Nota"
                htmlFor="appointment-decision"
                error={noteError}
                helper="Su «Concluso» e «Assente» la nota resta interna: la famiglia non la vede e non riceve nessun avviso."
              >
                <Textarea
                  id="appointment-decision"
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                    if (noteError) setNoteError(null);
                  }}
                  placeholder="Il motivo, se rifiuti o annulli: la famiglia lo legge"
                  rows={3}
                />
              </Field>
              {/* Le mosse le dichiara il dominio (`actions`): un pulsante assente e una transizione non ammessa. */}
              <div className="mt-4 flex flex-wrap gap-2">
                {can(appointment, "confirm") ? (
                  <Button variant="primary" size="sm" icon={<Check />} onClick={() => decide("confirm")} disabled={busy}>
                    Conferma
                  </Button>
                ) : null}
                {can(appointment, "reschedule") ? (
                  <Button variant="secondary" size="sm" icon={<CalendarClock />} onClick={() => setMode({ kind: "reschedule" })} disabled={busy}>
                    Sposta
                  </Button>
                ) : null}
                {can(appointment, "complete") ? (
                  <Button variant="secondary" size="sm" onClick={() => decide("complete")} disabled={busy}>
                    Concluso
                  </Button>
                ) : null}
                {can(appointment, "no-show") ? (
                  <Button variant="secondary" size="sm" icon={<UserX />} onClick={() => decide("no-show")} disabled={busy}>
                    Assente
                  </Button>
                ) : null}
                {can(appointment, "reject") ? (
                  <Button variant="danger" size="sm" icon={<X />} onClick={() => decide("reject")} disabled={busy}>
                    Rifiuta
                  </Button>
                ) : null}
                {can(appointment, "cancel") ? (
                  <Button variant="danger" size="sm" onClick={() => decide("cancel")} disabled={busy}>
                    Annulla l&apos;appuntamento
                  </Button>
                ) : null}
              </div>
            </DrawerSection>
          ) : (
            <p className="font-brand text-[12.5px] text-egw-ink-62">Questo appuntamento e chiuso: non ammette altre mosse.</p>
          )}
        </FieldSizeProvider>
      ) : (
        <FieldSizeProvider size="sm">
          <div className="flex flex-col gap-4">
            <InsetBlock className="p-3.5 font-brand text-[12.5px] leading-[1.5] text-egw-ink-72">
              Lo spostamento chiude questa riga e ne crea una nuova collegata: la famiglia riceve il nuovo orario. L&apos;orario deve cadere su uno slot libero — le fasce si configurano dalla{" "}
              <Link href="/appuntamenti" className="font-semibold text-egw-blue-700 underline">
                disponibilita appuntamenti
              </Link>
              .
            </InsetBlock>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nuovo giorno" htmlFor="appointment-new-date" required error={moveError && !newDate ? "Obbligatorio" : undefined}>
                <DateInput id="appointment-new-date" value={newDate} onChange={(event) => setNewDate(event.target.value)} />
              </Field>
              <Field label="Nuovo orario" htmlFor="appointment-new-time" required error={moveError && !newTime ? "Obbligatorio" : undefined}>
                <TimeInput id="appointment-new-time" value={newTime} onChange={(event) => setNewTime(event.target.value)} />
              </Field>
            </div>
            <Field label="Nota per la famiglia" htmlFor="appointment-move-note" optional>
              <Textarea id="appointment-move-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Perche si sposta: la famiglia lo legge" rows={3} />
            </Field>
          </div>
        </FieldSizeProvider>
      )}
    </Drawer>
  );
}

function DetailRow({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <p className="font-brand text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">{label}</p>
      <p className="mt-1 whitespace-pre-wrap font-brand text-[13px] leading-[1.5] text-egw-ink">{value}</p>
    </div>
  );
}
