import React, { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  ActionBarButton,
  ActionButton,
  BottomSheet,
  GlassRow,
  SecondaryScreenLayout,
  SectionLabel,
  SignatureInput,
  SignatureText,
  StateMessage,
  StatusPill,
  SummaryCard,
} from "@/components/signature";
import type { StatusPillTier, StatusPillTone } from "@/components/signature";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { useAsyncSection } from "@/hooks/useAsyncSection";
import { fetchErrorMessage } from "@/lib/fetch-error";
import { formatItalianDate } from "@/lib/mobile-ui";
import { Spacing } from "@/constants/theme";
import type { Athlete, ClubAppointment } from "@/services/api";

const OPEN_STATUSES = new Set(["requested", "confirmed", "rescheduled"]);

/** Quattro livelli del design (§5c) per gli stati del dominio appuntamenti. */
const STATUS_LOOK: Record<
  string,
  { tier: StatusPillTier; tone: StatusPillTone; color: string }
> = {
  confirmed: { tier: "solid", tone: "info", color: "#2563EB" },
  requested: { tier: "outline", tone: "warning", color: "#F59E0B" },
  rescheduled: { tier: "quiet", tone: "neutral", color: "#3533CD" },
  completed: { tier: "quiet", tone: "success", color: "#10B981" },
  rejected: { tier: "solid", tone: "danger", color: "#EF4444" },
  cancelled: { tier: "solid", tone: "danger", color: "#EF4444" },
};

type AppointmentsData = {
  appointments: ClubAppointment[];
  athletes: Athlete[];
};

type SheetMode =
  | { kind: "reject"; appointment: ClubAppointment }
  | { kind: "reschedule"; appointment: ClubAppointment }
  | null;

/**
 * I propri appuntamenti — stesso dominio del Web
 * (`trainer-appointments-dashboard-page.tsx`, `src/lib/server/appointments.ts`).
 * I pulsanti li detta `transitions`, la macchina a stati del dominio: mai tre
 * azioni fisse che il server potrebbe rifiutare. Il rifiuto raccoglie
 * sempre un motivo prima di inviarlo (la famiglia lo legge nel messaggio
 * che chiude la richiesta).
 *
 * Composizione: design `IA e Home` §3c ("Appuntamenti") — scheda scura
 * "Prossimo · Gio 19 · 17:00 · N" nel cielo, righe di vetro (icona,
 * motivo, "data · ora · atleta", pill a quattro livelli) con la barra
 * azioni etichettata sotto (Conferma / Riprogramma / Rifiuta); motivo del
 * rifiuto e nuova data si raccolgono in un foglio, non in un modulo in
 * linea.
 */
export default function TrainerAppointmentsScreen() {
  const { status, data, errorMessage, reload } =
    useAsyncSection<AppointmentsData>(
      async () => {
        const [appointments, athletes] = await Promise.all([
          mobileBackendStorage.getMyAppointments(),
          mobileBackendStorage.getAthletes(),
        ]);
        return { appointments, athletes };
      },
      (result) => result.appointments.length === 0,
    );

  const [sheet, setSheet] = useState<SheetMode>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const athleteName = (athleteId: string | null) => {
    if (!athleteId) return "Segreteria";
    const athlete = data?.athletes.find((entry) => entry.id === athleteId);
    return athlete?.name || "Atleta";
  };

  const open = (data?.appointments || []).filter((entry) =>
    OPEN_STATUSES.has(entry.status),
  );
  const closed = (data?.appointments || []).filter(
    (entry) => !OPEN_STATUSES.has(entry.status),
  );
  const next =
    [...open]
      .filter((entry) => entry.date)
      .sort((a, b) =>
        `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
      )[0] || null;

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError("");
    try {
      await action();
      setSheet(null);
      setReason("");
      reload();
    } catch (actionError) {
      setError(fetchErrorMessage(actionError, "Operazione non riuscita."));
    } finally {
      setBusyId(null);
    }
  };

  const openSheet = (mode: SheetMode) => {
    setError("");
    if (mode?.kind === "reschedule") {
      setDate(mode.appointment.date || "");
      setTime(mode.appointment.time || "");
    }
    setSheet(mode);
  };

  const renderRow = (appointment: ClubAppointment) => {
    const look = STATUS_LOOK[appointment.status] || STATUS_LOOK.rescheduled;
    const canConfirm = appointment.transitions.includes("confirmed");
    const canReject = appointment.transitions.includes("rejected");
    const canReschedule = appointment.transitions.includes("rescheduled");
    const hasActions = canConfirm || canReject || canReschedule;
    const busy = busyId === appointment.id;
    return (
      <GlassRow
        key={appointment.id}
        icon={
          appointment.status === "rejected" ||
          appointment.status === "cancelled"
            ? "close-circle-outline"
            : appointment.status === "completed"
              ? "checkmark-circle"
              : "people-outline"
        }
        iconColor={look.color}
        title={appointment.reason || "Colloquio"}
        meta={[
          `${formatItalianDate(appointment.date, "EEE d MMM")} · ${appointment.time || "orario da definire"}`,
          athleteName(appointment.athlete_id),
          appointment.decision_note
            ? `Motivo: ${appointment.decision_note}`
            : "",
        ]
          .filter(Boolean)
          .join(" · ")}
        trailing={
          <StatusPill
            label={appointment.status_label}
            tier={look.tier}
            tone={look.tone}
            small
          />
        }
        actions={
          hasActions ? (
            <>
              {canConfirm ? (
                <ActionBarButton
                  label="Conferma"
                  icon="checkmark"
                  variant="primary"
                  loading={busy}
                  onPress={() =>
                    void run(appointment.id, () =>
                      mobileBackendStorage.updateAppointment(
                        appointment.id,
                        "confirm",
                        { version: appointment.version },
                      ),
                    )
                  }
                />
              ) : null}
              {canReschedule ? (
                <ActionBarButton
                  label="Riprogramma"
                  icon="time-outline"
                  disabled={busy}
                  onPress={() => openSheet({ kind: "reschedule", appointment })}
                />
              ) : null}
              {canReject ? (
                <ActionBarButton
                  label="Rifiuta"
                  icon="close-circle-outline"
                  disabled={busy}
                  onPress={() => openSheet({ kind: "reject", appointment })}
                />
              ) : null}
            </>
          ) : undefined
        }
      />
    );
  };

  return (
    <SecondaryScreenLayout
      title="Appuntamenti"
      eyebrow="Allenatore · Segreteria"
      skyHeight={300}
      contentGap={10}
    >
      {status === "loading" ? (
        <StateMessage
          kind="loading"
          tone="dark"
          title="Carico gli appuntamenti…"
        />
      ) : status === "forbidden" ? (
        <StateMessage
          kind="forbidden"
          tone="dark"
          message="Il club non ti ha dato accesso agli appuntamenti."
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
          title="Nessun appuntamento"
          message="Non hai appuntamenti assegnati al momento."
        />
      ) : (
        <>
          <SummaryCard
            icon="calendar-outline"
            eyebrow={next ? "Prossimo" : "Da gestire"}
            title={
              next
                ? `${capitalize(formatItalianDate(next.date, "EEE d"))} · ${next.time || "orario da definire"}`
                : "Nessun appuntamento aperto"
            }
            value={String(open.length)}
          />
          {error && !sheet ? (
            <SignatureText style={styles.error}>{error}</SignatureText>
          ) : null}
          {open.length > 0 ? (
            <SectionLabel
              label="Da gestire"
              trailing={String(open.length)}
              style={{ paddingTop: 4 }}
            />
          ) : null}
          {open.map(renderRow)}
          {closed.length > 0 ? (
            <SectionLabel
              label="Conclusi"
              trailing={String(closed.length)}
              style={{ paddingTop: 6 }}
            />
          ) : null}
          {closed.map(renderRow)}
        </>
      )}

      <BottomSheet
        visible={sheet?.kind === "reject"}
        onClose={() => setSheet(null)}
        eyebrow={sheet ? sheet.appointment.reason || "Colloquio" : ""}
        title="Rifiuta la richiesta"
        actions={
          sheet?.kind === "reject" ? (
            <>
              <ActionButton
                variant="secondary"
                onPress={() => setSheet(null)}
                style={styles.cancel}
              >
                Annulla
              </ActionButton>
              <ActionButton
                variant="destructive"
                disabled={!reason.trim()}
                loading={busyId === sheet.appointment.id}
                trailingIcon="arrow-forward"
                style={styles.confirm}
                onPress={() =>
                  void run(sheet.appointment.id, () =>
                    mobileBackendStorage.updateAppointment(
                      sheet.appointment.id,
                      "reject",
                      {
                        note: reason.trim(),
                        version: sheet.appointment.version,
                      },
                    ),
                  )
                }
              >
                Conferma rifiuto
              </ActionButton>
            </>
          ) : undefined
        }
      >
        <SignatureInput
          label="Motivo (la famiglia lo legge)"
          value={reason}
          onChangeText={setReason}
          multiline
          placeholder="Es. orario non disponibile"
          error={error || undefined}
        />
      </BottomSheet>

      <BottomSheet
        visible={sheet?.kind === "reschedule"}
        onClose={() => setSheet(null)}
        eyebrow={sheet ? sheet.appointment.reason || "Colloquio" : ""}
        title="Proponi un nuovo orario"
        actions={
          sheet?.kind === "reschedule" ? (
            <>
              <ActionButton
                variant="secondary"
                onPress={() => setSheet(null)}
                style={styles.cancel}
              >
                Annulla
              </ActionButton>
              <ActionButton
                disabled={!date.trim() || !time.trim()}
                loading={busyId === sheet.appointment.id}
                trailingIcon="arrow-forward"
                style={styles.confirm}
                onPress={() =>
                  void run(sheet.appointment.id, () =>
                    mobileBackendStorage.updateAppointment(
                      sheet.appointment.id,
                      "reschedule",
                      {
                        date: date.trim(),
                        time: time.trim(),
                        version: sheet.appointment.version,
                      },
                    ),
                  )
                }
              >
                Riprogramma
              </ActionButton>
            </>
          ) : undefined
        }
      >
        <View style={{ gap: Spacing.md }}>
          <SignatureInput
            label="Nuova data (AAAA-MM-GG)"
            value={date}
            onChangeText={setDate}
            placeholder="2026-10-01"
            leftIcon="calendar-outline"
          />
          <SignatureInput
            label="Nuovo orario (HH:MM)"
            value={time}
            onChangeText={setTime}
            placeholder="18:00"
            leftIcon="time-outline"
            error={error || undefined}
          />
        </View>
      </BottomSheet>
    </SecondaryScreenLayout>
  );
}

const capitalize = (value: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

const styles = StyleSheet.create({
  error: {
    color: "#B91C1C",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    paddingHorizontal: 4,
  },
  cancel: { width: 100 },
  confirm: { flex: 1 },
});
