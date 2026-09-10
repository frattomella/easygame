import React, { useState } from "react";
import { View } from "react-native";

import {
  ActionButton,
  GlassCard,
  MetaRow,
  SecondaryScreenLayout,
  SignatureInput,
  SignatureText,
  StateMessage,
  StatusPill,
} from "@/components/signature";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { useAsyncSection } from "@/hooks/useAsyncSection";
import { fetchErrorMessage } from "@/lib/fetch-error";
import { formatItalianDate } from "@/lib/mobile-ui";
import { Spacing } from "@/constants/theme";
import type { Athlete, ClubAppointment } from "@/services/api";

const OPEN_STATUSES = new Set(["requested", "confirmed", "rescheduled"]);

type AppointmentsData = {
  appointments: ClubAppointment[];
  athletes: Athlete[];
};

/**
 * I propri appuntamenti — stesso dominio del Web
 * (`trainer-appointments-dashboard-page.tsx`, `src/lib/server/appointments.ts`).
 * I pulsanti li detta `transitions`, la macchina a stati del dominio: mai tre
 * azioni fisse che il server potrebbe rifiutare.
 *
 * Il rifiuto raccoglie sempre un motivo prima di inviarlo — stesso contratto
 * corretto in WP1 lato Web (`rejectAppointment` lo pretende: la famiglia lo
 * legge nel messaggio che chiude la richiesta).
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

  const athleteName = (athleteId: string | null) => {
    if (!athleteId) return "Appuntamento di segreteria";
    const athlete = data?.athletes.find((entry) => entry.id === athleteId);
    return athlete?.name || "Atleta";
  };

  const open = (data?.appointments || []).filter((entry) =>
    OPEN_STATUSES.has(entry.status),
  );
  const closed = (data?.appointments || []).filter(
    (entry) => !OPEN_STATUSES.has(entry.status),
  );

  return (
    <SecondaryScreenLayout title="Appuntamenti" eyebrow="Personale">
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
          <SignatureText variant="eyebrow" tone="onDarkMuted">
            Da gestire
          </SignatureText>
          {open.length === 0 ? (
            <StateMessage
              kind="empty"
              tone="dark"
              title="Nessun appuntamento aperto"
            />
          ) : (
            open.map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                athleteLabel={athleteName(appointment.athlete_id)}
                onChanged={reload}
              />
            ))
          )}

          {closed.length > 0 ? (
            <>
              <SignatureText
                variant="eyebrow"
                tone="onDarkMuted"
                style={{ marginTop: Spacing.md }}
              >
                Storico
              </SignatureText>
              {closed.map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  athleteLabel={athleteName(appointment.athlete_id)}
                  onChanged={reload}
                />
              ))}
            </>
          ) : null}
        </>
      )}
      <View style={{ height: Spacing.lg }} />
    </SecondaryScreenLayout>
  );
}

function AppointmentCard({
  appointment,
  athleteLabel,
  onChanged,
}: {
  appointment: ClubAppointment;
  athleteLabel: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"idle" | "reject" | "reschedule">("idle");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(appointment.date || "");
  const [time, setTime] = useState(appointment.time || "");

  const canConfirm = appointment.transitions.includes("confirmed");
  const canReject = appointment.transitions.includes("rejected");
  const canReschedule = appointment.transitions.includes("rescheduled");

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      setMode("idle");
      onChanged();
    } catch (actionError) {
      setError(fetchErrorMessage(actionError, "Operazione non riuscita."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard style={{ gap: Spacing.xs }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: Spacing.sm,
        }}
      >
        <SignatureText variant="h4" tone="ink" style={{ flex: 1 }}>
          {appointment.reason || "Colloquio"}
        </SignatureText>
        <StatusPill label={appointment.status_label} variant="primary" small />
      </View>
      <MetaRow icon="person-outline">{athleteLabel}</MetaRow>
      <MetaRow icon="calendar-outline">
        {formatItalianDate(appointment.date)} · {appointment.time}
      </MetaRow>
      {appointment.notes ? (
        <SignatureText variant="small" tone="muted">
          {appointment.notes}
        </SignatureText>
      ) : null}
      {appointment.decision_note ? (
        <SignatureText variant="small" tone="muted">
          Motivo: {appointment.decision_note}
        </SignatureText>
      ) : null}

      {mode === "reject" ? (
        <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
          <SignatureInput
            label="Motivo del rifiuto (obbligatorio, la famiglia lo legge)"
            value={reason}
            onChangeText={setReason}
            multiline
            placeholder="Es. orario non disponibile"
            error={error || undefined}
          />
          <View style={{ flexDirection: "row", gap: Spacing.sm }}>
            <ActionButton
              variant="destructive"
              size="sm"
              disabled={!reason.trim()}
              loading={busy}
              onPress={() =>
                run(() =>
                  mobileBackendStorage.updateAppointment(
                    appointment.id,
                    "reject",
                    {
                      note: reason.trim(),
                      version: appointment.version,
                    },
                  ),
                )
              }
            >
              Conferma rifiuto
            </ActionButton>
            <ActionButton
              variant="ghost"
              size="sm"
              onPress={() => setMode("idle")}
            >
              Annulla
            </ActionButton>
          </View>
        </View>
      ) : mode === "reschedule" ? (
        <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
          <SignatureInput
            label="Nuova data (AAAA-MM-GG)"
            value={date}
            onChangeText={setDate}
            placeholder="2026-10-01"
          />
          <SignatureInput
            label="Nuovo orario (HH:MM)"
            value={time}
            onChangeText={setTime}
            placeholder="18:00"
            error={error || undefined}
          />
          <View style={{ flexDirection: "row", gap: Spacing.sm }}>
            <ActionButton
              size="sm"
              disabled={!date.trim() || !time.trim()}
              loading={busy}
              onPress={() =>
                run(() =>
                  mobileBackendStorage.updateAppointment(
                    appointment.id,
                    "reschedule",
                    {
                      date: date.trim(),
                      time: time.trim(),
                      version: appointment.version,
                    },
                  ),
                )
              }
            >
              Conferma spostamento
            </ActionButton>
            <ActionButton
              variant="ghost"
              size="sm"
              onPress={() => setMode("idle")}
            >
              Annulla
            </ActionButton>
          </View>
        </View>
      ) : canConfirm || canReject || canReschedule ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: Spacing.sm,
            marginTop: Spacing.sm,
          }}
        >
          {canConfirm ? (
            <ActionButton
              variant="success"
              size="sm"
              loading={busy}
              onPress={() =>
                run(() =>
                  mobileBackendStorage.updateAppointment(
                    appointment.id,
                    "confirm",
                    {
                      version: appointment.version,
                    },
                  ),
                )
              }
            >
              Conferma
            </ActionButton>
          ) : null}
          {canReschedule ? (
            <ActionButton
              variant="secondary"
              size="sm"
              onPress={() => setMode("reschedule")}
            >
              Riprogramma
            </ActionButton>
          ) : null}
          {canReject ? (
            <ActionButton
              variant="destructive"
              size="sm"
              onPress={() => setMode("reject")}
            >
              Rifiuta
            </ActionButton>
          ) : null}
        </View>
      ) : null}
      {error && mode === "idle" ? (
        <SignatureText variant="small" style={{ color: "#B91C1C" }}>
          {error}
        </SignatureText>
      ) : null}
    </GlassCard>
  );
}
