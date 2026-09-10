import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ActionButton,
  AppointmentCard,
  BottomSheet,
  SecondaryScreenLayout,
  SignatureInput,
  SignatureText,
  StateMessage,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import {
  canSubmitAppointmentRequest,
  splitParentAppointments,
} from "@/lib/parent-appointments";
import { classifyFetchError, fetchErrorMessage } from "@/lib/fetch-error";
import { Spacing } from "@/constants/theme";
import type { ParentAppointment } from "@/services/api";

type SheetMode =
  | { kind: "create" }
  | { kind: "reschedule"; appointment: ParentAppointment }
  | null;

/**
 * Segreteria/Appuntamenti (WP8) — `data.appointments` del cruscotto
 * aggregato (stessa query key di Home/Calendario/Pagamenti/Documenti:
 * nessuna fetch in piu). La faccia famiglia non porta un elenco di
 * transizioni come quella del club: solo `can_reschedule`/`can_cancel`
 * (`client/lib/parent-appointments.ts`). Riprogrammare crea una riga nuova
 * e chiude la vecchia — stesso comportamento del Web, mai una modifica in
 * luogo.
 */
export default function ParentAppointmentsScreen() {
  const { selectedChildId } = useParentContext();
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<SheetMode>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [typeId, setTypeId] = useState("");
  const [reason, setReason] = useState("");
  const [slotId, setSlotId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");

  const dashboardQuery = useQuery({
    queryKey: ["parent-dashboard", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentDashboard(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });
  const { status, errorMessage } = useParentSectionStatus(
    dashboardQuery,
    (data) => data.appointments.items.length === 0,
  );

  const appointments = dashboardQuery.data?.appointments;
  const { open, history } = appointments
    ? splitParentAppointments(appointments.items)
    : { open: [], history: [] };

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["parent-dashboard", selectedChildId],
    });

  const resetForm = () => {
    setTypeId("");
    setReason("");
    setSlotId("");
    setDate("");
    setTime("");
    setNotes("");
    setFormError("");
  };

  const openCreateSheet = () => {
    resetForm();
    setSheet({ kind: "create" });
  };

  const openRescheduleSheet = (appointment: ParentAppointment) => {
    resetForm();
    setDate(appointment.date || "");
    setTime(appointment.time || "");
    setSheet({ kind: "reschedule", appointment });
  };

  const handleCancel = async (appointment: ParentAppointment) => {
    if (!selectedChildId) return;
    setBusyId(appointment.id);
    try {
      await mobileBackendStorage.cancelParentAppointment(
        selectedChildId,
        appointment.id,
        appointment.version,
      );
      await invalidate();
    } catch (error) {
      setFormError(fetchErrorMessage(error, "Non è stato possibile disdire."));
    } finally {
      setBusyId(null);
    }
  };

  const handleSubmit = async () => {
    if (!selectedChildId || !sheet) return;
    setSubmitting(true);
    setFormError("");
    try {
      if (sheet.kind === "create") {
        await mobileBackendStorage.requestParentAppointment(selectedChildId, {
          reason: reason.trim() || undefined,
          typeId: typeId || undefined,
          slotId: slotId || undefined,
          date: slotId ? undefined : date.trim() || undefined,
          time: slotId ? undefined : time.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      } else {
        await mobileBackendStorage.rescheduleParentAppointment(
          selectedChildId,
          sheet.appointment.id,
          {
            slotId: slotId || undefined,
            date: slotId ? undefined : date.trim() || undefined,
            time: slotId ? undefined : time.trim() || undefined,
            notes: notes.trim() || undefined,
            version: sheet.appointment.version,
          },
        );
      }
      setSheet(null);
      await invalidate();
    } catch (error) {
      const kind = classifyFetchError(error);
      setFormError(
        fetchErrorMessage(
          error,
          kind === "forbidden"
            ? "Accesso non consentito."
            : "Operazione non riuscita. Riprova.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = canSubmitAppointmentRequest({
    reason,
    typeId,
    slotId,
    date,
    time,
  });

  return (
    <SecondaryScreenLayout title="Appuntamenti" eyebrow="Segreteria">
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
          onAction={() => void dashboardQuery.refetch()}
        />
      ) : (
        <>
          {appointments?.config.familyBookingEnabled ? (
            <ActionButton
              fullWidth
              icon="add-circle-outline"
              onPress={openCreateSheet}
              style={{ marginBottom: Spacing.md }}
            >
              Richiedi un appuntamento
            </ActionButton>
          ) : null}

          {status === "empty" ? (
            <StateMessage
              kind="empty"
              tone="dark"
              title="Nessun appuntamento"
              message="Non ci sono appuntamenti per questo figlio al momento."
            />
          ) : (
            <>
              {open.length > 0 ? (
                <View style={{ gap: Spacing.sm, marginBottom: Spacing.lg }}>
                  <SignatureText variant="eyebrow" tone="faint">
                    Da gestire
                  </SignatureText>
                  {open.map((appointment) => (
                    <AppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                      busy={busyId === appointment.id}
                      onReschedule={
                        appointment.can_reschedule
                          ? () => openRescheduleSheet(appointment)
                          : undefined
                      }
                      onCancel={
                        appointment.can_cancel
                          ? () => void handleCancel(appointment)
                          : undefined
                      }
                    />
                  ))}
                </View>
              ) : null}
              {history.length > 0 ? (
                <View style={{ gap: Spacing.sm }}>
                  <SignatureText variant="eyebrow" tone="faint">
                    Storico
                  </SignatureText>
                  {history.map((appointment) => (
                    <AppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                    />
                  ))}
                </View>
              ) : null}
            </>
          )}
        </>
      )}

      <BottomSheet
        visible={Boolean(sheet)}
        onClose={() => setSheet(null)}
        accessibilityLabel={
          sheet?.kind === "reschedule"
            ? "Riprogramma appuntamento"
            : "Richiedi appuntamento"
        }
      >
        <SignatureText
          variant="eyebrow"
          tone="faint"
          style={{ marginBottom: 4 }}
        >
          Segreteria
        </SignatureText>
        <SignatureText
          variant="h3"
          tone="ink"
          style={{ marginBottom: Spacing.md }}
        >
          {sheet?.kind === "reschedule"
            ? "Riprogramma"
            : "Richiedi un appuntamento"}
        </SignatureText>

        <View style={{ gap: Spacing.md }}>
          {sheet?.kind === "create" ? (
            appointments && appointments.config.types.length > 0 ? (
              <View>
                <SignatureText
                  variant="eyebrow"
                  tone="faint"
                  style={{ marginBottom: 6 }}
                >
                  Motivo
                </SignatureText>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: Spacing.sm,
                  }}
                >
                  {appointments.config.types.map((type) => (
                    <Pressable
                      key={type.id}
                      onPress={() => setTypeId(type.id)}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 14,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor:
                          typeId === type.id
                            ? "#2563EB"
                            : "rgba(11,26,58,0.14)",
                        backgroundColor:
                          typeId === type.id
                            ? "#2563EB"
                            : "rgba(255,255,255,0.6)",
                      }}
                    >
                      <SignatureText
                        variant="small"
                        style={{
                          fontWeight: "700",
                          color:
                            typeId === type.id
                              ? "#FFFFFF"
                              : "rgba(11,26,58,0.62)",
                        }}
                      >
                        {type.name}
                      </SignatureText>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <SignatureInput
                label="Motivo"
                value={reason}
                onChangeText={setReason}
                placeholder="Es. colloquio tecnico"
              />
            )
          ) : null}

          {appointments && appointments.availableSlots.length > 0 ? (
            <View>
              <SignatureText
                variant="eyebrow"
                tone="faint"
                style={{ marginBottom: 6 }}
              >
                Scegli un orario
              </SignatureText>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: Spacing.sm,
                }}
              >
                {appointments.availableSlots.slice(0, 12).map((slot) => {
                  const key = slot.slotId || slot.startsAt;
                  const selected = slotId === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => setSlotId(key)}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 14,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: selected
                          ? "#2563EB"
                          : "rgba(11,26,58,0.14)",
                        backgroundColor: selected
                          ? "#2563EB"
                          : "rgba(255,255,255,0.6)",
                      }}
                    >
                      <SignatureText
                        variant="small"
                        style={{
                          fontWeight: "700",
                          color: selected ? "#FFFFFF" : "rgba(11,26,58,0.62)",
                        }}
                      >
                        {slot.day} {slot.time}
                      </SignatureText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <>
              <SignatureInput
                label="Data (AAAA-MM-GG)"
                value={date}
                onChangeText={setDate}
                placeholder="2026-10-01"
              />
              <SignatureInput
                label="Ora (HH:MM)"
                value={time}
                onChangeText={setTime}
                placeholder="18:00"
              />
            </>
          )}

          <SignatureInput
            label="Note (facoltative)"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Eventuali dettagli utili alla segreteria"
            error={formError || undefined}
          />

          <View style={{ flexDirection: "row", gap: Spacing.sm }}>
            <ActionButton
              disabled={!canSubmit}
              loading={submitting}
              trailingIcon="arrow-forward"
              onPress={() => void handleSubmit()}
            >
              {sheet?.kind === "reschedule"
                ? "Conferma nuovo orario"
                : "Invia richiesta"}
            </ActionButton>
            <ActionButton variant="ghost" onPress={() => setSheet(null)}>
              Annulla
            </ActionButton>
          </View>
        </View>
      </BottomSheet>

      <View style={{ height: Spacing.lg }} />
    </SecondaryScreenLayout>
  );
}
