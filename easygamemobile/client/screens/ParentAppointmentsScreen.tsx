import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ActionBarButton,
  ActionButton,
  BottomSheet,
  GlassRow,
  InfoNote,
  SecondaryScreenLayout,
  SectionLabel,
  SignatureInput,
  SignatureText,
  StateMessage,
  StatusPill,
  SummaryCard,
} from "@/components/signature";
import type { StatusPillTier, StatusPillTone } from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import {
  canSubmitAppointmentRequest,
  splitParentAppointments,
} from "@/lib/parent-appointments";
import { classifyFetchError, fetchErrorMessage } from "@/lib/fetch-error";
import { formatItalianDate } from "@/lib/mobile-ui";
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
  const { selectedChildId, selectedChild } = useParentContext();
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

  const nextOpen =
    [...open]
      .filter((item) => item.date)
      .sort((a, b) =>
        `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
      )[0] || null;
  const waiting = open.filter((item) => item.status === "requested").length;

  const renderRow = (appointment: ParentAppointment, canAct: boolean) => {
    const look = STATUS_LOOK[appointment.status] || STATUS_LOOK.rescheduled;
    const showReschedule = canAct && appointment.can_reschedule;
    const showCancel = canAct && appointment.can_cancel;
    return (
      <GlassRow
        key={appointment.id}
        icon={look.icon}
        iconColor={look.color}
        title={appointment.title || appointment.reason || "Appuntamento"}
        meta={[
          `${formatItalianDate(appointment.date, "EEE d MMM")} · ${appointment.time || "orario da definire"}`,
          appointment.person,
          appointment.decision_note
            ? `Motivo: ${appointment.decision_note}`
            : "",
        ]
          .filter(Boolean)
          .join(" · ")}
        trailing={
          <StatusPill
            label={SHORT_STATUS[appointment.status] || appointment.status_label}
            tier={look.tier}
            tone={look.tone}
            small
          />
        }
        actions={
          showReschedule || showCancel ? (
            <>
              {showReschedule ? (
                <ActionBarButton
                  label="Riprogramma"
                  icon="time-outline"
                  disabled={busyId === appointment.id}
                  onPress={() => openRescheduleSheet(appointment)}
                />
              ) : null}
              {showCancel ? (
                <ActionBarButton
                  label="Disdici"
                  icon="close-circle-outline"
                  loading={busyId === appointment.id}
                  onPress={() => void handleCancel(appointment)}
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
      eyebrow={`Segreteria · ${selectedChild?.name || "Atleta"}`}
      skyHeight={300}
      contentGap={10}
      club={
        selectedChild
          ? {
              name: selectedChild.clubName,
              avatarUrl: selectedChild.clubLogoUrl,
            }
          : undefined
      }
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
          onAction={() => void dashboardQuery.refetch()}
        />
      ) : (
        <>
          <SummaryCard
            icon="calendar-outline"
            eyebrow={
              waiting > 0 ? "In attesa" : nextOpen ? "Prossimo" : "Segreteria"
            }
            title={
              waiting > 0
                ? `${waiting} ${waiting === 1 ? "richiesta" : "richieste"}`
                : nextOpen
                  ? `${capitalize(formatItalianDate(nextOpen.date, "EEE d"))} · ${nextOpen.time || "orario da definire"}`
                  : "Nessun appuntamento aperto"
            }
            value={String(open.length)}
          >
            {appointments?.config.familyBookingEnabled ? (
              <View style={{ alignSelf: "flex-start", marginTop: 2 }}>
                <ActionButton
                  variant="onDark"
                  size="sm"
                  trailingIcon="arrow-forward"
                  onPress={openCreateSheet}
                >
                  Richiedi un appuntamento
                </ActionButton>
              </View>
            ) : null}
          </SummaryCard>

          {formError && !sheet ? (
            <InfoNote tone="danger">{formError}</InfoNote>
          ) : null}

          {status === "empty" ? (
            <StateMessage
              kind="empty"
              title="Nessun appuntamento"
              message="Non ci sono appuntamenti per questo figlio al momento."
            />
          ) : (
            <>
              {open.length > 0 ? (
                <SectionLabel
                  label="Da gestire"
                  trailing={String(open.length)}
                  style={{ paddingTop: 4 }}
                />
              ) : null}
              {open.map((appointment) => renderRow(appointment, true))}
              {history.length > 0 ? (
                <SectionLabel
                  label="Storico"
                  trailing={String(history.length)}
                  style={{ paddingTop: 6 }}
                />
              ) : null}
              {history.map((appointment) => renderRow(appointment, false))}
            </>
          )}
        </>
      )}

      <BottomSheet
        visible={Boolean(sheet)}
        onClose={() => setSheet(null)}
        eyebrow="Segreteria"
        title={
          sheet?.kind === "reschedule"
            ? "Proponi un nuovo orario"
            : "Richiedi un appuntamento"
        }
        actions={
          <>
            <ActionButton
              variant="secondary"
              onPress={() => setSheet(null)}
              style={{ width: 100 }}
            >
              Annulla
            </ActionButton>
            <ActionButton
              disabled={!canSubmit}
              loading={submitting}
              trailingIcon="arrow-forward"
              onPress={() => void handleSubmit()}
              style={{ flex: 1 }}
            >
              {sheet?.kind === "reschedule" ? "Riprogramma" : "Invia richiesta"}
            </ActionButton>
          </>
        }
      >
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
                <View style={styles.chipRow}>
                  {appointments.config.types.map((type) => (
                    <Chip
                      key={type.id}
                      label={type.name}
                      selected={typeId === type.id}
                      onPress={() => setTypeId(type.id)}
                    />
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
              <View style={styles.chipRow}>
                {appointments.availableSlots.slice(0, 12).map((slot) => {
                  const key = slot.slotId || slot.startsAt;
                  return (
                    <Chip
                      key={key}
                      label={`${formatItalianDate(slot.day, "EEE d MMM")} · ${slot.time}`}
                      selected={slotId === key}
                      onPress={() => setSlotId(key)}
                    />
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
                leftIcon="calendar-outline"
              />
              <SignatureInput
                label="Ora (HH:MM)"
                value={time}
                onChangeText={setTime}
                placeholder="18:00"
                leftIcon="time-outline"
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
        </View>
      </BottomSheet>
    </SecondaryScreenLayout>
  );
}

/** Pillola di scelta (motivo, orario): #1D4ED8 con etichetta bianca da scelta, bianco 70% con inchiostro a riposo. */
function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, selected ? styles.chipOn : null]}
    >
      <SignatureText
        style={[styles.chipLabel, selected ? styles.chipLabelOn : null]}
      >
        {label}
      </SignatureText>
    </Pressable>
  );
}

const capitalize = (value: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

/** Quattro livelli del design (§5c) per gli stati del dominio appuntamenti, lato famiglia. */
/** La pillola del prototipo e una parola ("In attesa", "Confermato"): l'etichetta lunga del server resta nel dettaglio. */
const SHORT_STATUS: Record<string, string> = {
  requested: "In attesa",
  confirmed: "Confermato",
  rescheduled: "Riprogrammato",
  completed: "Svolto",
  rejected: "Rifiutato",
  cancelled_by_family: "Annullato",
  cancelled_by_club: "Annullato",
};

const STATUS_LOOK: Record<
  string,
  {
    tier: StatusPillTier;
    tone: StatusPillTone;
    color: string;
    icon:
      | "people-outline"
      | "time-outline"
      | "close-circle-outline"
      | "checkmark-circle"
      | "document-text-outline";
  }
> = {
  confirmed: {
    tier: "solid",
    tone: "info",
    color: "#2563EB",
    icon: "people-outline",
  },
  requested: {
    tier: "outline",
    tone: "warning",
    color: "#F59E0B",
    icon: "document-text-outline",
  },
  rescheduled: {
    tier: "quiet",
    tone: "neutral",
    color: "#3533CD",
    icon: "time-outline",
  },
  completed: {
    tier: "quiet",
    tone: "success",
    color: "#10B981",
    icon: "checkmark-circle",
  },
  rejected: {
    tier: "solid",
    tone: "danger",
    color: "#EF4444",
    icon: "close-circle-outline",
  },
  cancelled_by_family: {
    tier: "quiet",
    tone: "neutral",
    color: "#64748B",
    icon: "close-circle-outline",
  },
  cancelled_by_club: {
    tier: "solid",
    tone: "danger",
    color: "#EF4444",
    icon: "close-circle-outline",
  },
  no_show: {
    tier: "quiet",
    tone: "neutral",
    color: "#64748B",
    icon: "close-circle-outline",
  },
};

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(11,26,58,0.14)",
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: {
    backgroundColor: "#1D4ED8",
    borderColor: "rgba(255,255,255,0.3)",
  },
  chipLabel: {
    color: "#0B1A3A",
    fontSize: 11.5,
    lineHeight: 14,
    fontWeight: "700",
  },
  chipLabelOn: {
    color: "#FFFFFF",
  },
});
