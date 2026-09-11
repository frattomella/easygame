import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import {
  bookableFields,
  computeBookingEnd,
  lowestFieldPrice,
} from "@/lib/parent-structures";
import { formatParentCurrency } from "@/lib/parent-payments";
import { formatItalianDate } from "@/lib/mobile-ui";
import { classifyFetchError, fetchErrorMessage } from "@/lib/fetch-error";
import { Spacing } from "@/constants/theme";
import type { ParentStructure } from "@/services/api";

interface FieldSelection {
  structure: ParentStructure;
  field: ParentStructure["fields"][number];
}

/**
 * Strutture (WP8) — `data.structures` del cruscotto aggregato. Nessun
 * annullamento: ne il dominio lo offre (solo `POST` sotto `.../structures`),
 * ne il Web lo permette — questa schermata non inventa un'azione che il
 * server rifiuterebbe. L'atleta deriva sempre da `ParentContext`, mai da un
 * valore scelto qui: la richiesta lo passa via `selectedChildId`, non c'e
 * modo di sovrascriverlo dall'interfaccia.
 */
export default function ParentStructuresScreen() {
  const { selectedChildId, selectedChild } = useParentContext();
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<FieldSelection | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const dashboardQuery = useQuery({
    queryKey: ["parent-dashboard", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentDashboard(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });
  const { status, errorMessage } = useParentSectionStatus(
    dashboardQuery,
    (data) => data.structures.items.length === 0,
  );

  const structures = dashboardQuery.data?.structures.items || [];
  const bookings = dashboardQuery.data?.structures.bookings || [];

  const openBookingSheet = (
    structure: ParentStructure,
    field: ParentStructure["fields"][number],
  ) => {
    setSelection({ structure, field });
    setDate("");
    setTime("");
    setDurationMinutes(field.pricing[0]?.durationMinutes || 60);
    setNotes("");
    setFormError("");
  };

  const handleSubmit = async () => {
    if (
      !selectedChildId ||
      !selection ||
      !date.trim() ||
      !time.trim() ||
      !durationMinutes
    ) {
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const start = new Date(`${date.trim()}T${time.trim()}:00`);
      if (Number.isNaN(start.getTime())) {
        setFormError("Data o ora non valide.");
        setSubmitting(false);
        return;
      }
      const startIso = start.toISOString();
      await mobileBackendStorage.bookParentStructure(selectedChildId, {
        structureId: selection.structure.id,
        fieldId: selection.field.id,
        start: startIso,
        end: computeBookingEnd(startIso, durationMinutes),
        notes: notes.trim() || undefined,
      });
      setSelection(null);
      await queryClient.invalidateQueries({
        queryKey: ["parent-dashboard", selectedChildId],
      });
    } catch (error) {
      const kind = classifyFetchError(error);
      setFormError(
        fetchErrorMessage(
          error,
          kind === "forbidden"
            ? "Accesso non consentito."
            : "Prenotazione non riuscita. Riprova.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const bookableCount = structures.reduce(
    (sum, structure) => sum + bookableFields(structure).length,
    0,
  );
  const timeOf = (iso: string) => {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return "--:--";
    return parsed.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  const bookingLook = (
    booking: (typeof bookings)[number],
  ): {
    tier: StatusPillTier;
    tone: StatusPillTone;
    color: string;
    label: string;
  } =>
    booking.status === "confirmed"
      ? { tier: "solid", tone: "info", color: "#2563EB", label: "Confermata" }
      : booking.status === "cancelled"
        ? {
            tier: "quiet",
            tone: "neutral",
            color: "#64748B",
            label: "Annullata",
          }
        : {
            tier: "outline",
            tone: "warning",
            color: "#F59E0B",
            label: "Richiesta",
          };

  return (
    <SecondaryScreenLayout
      title="Strutture"
      eyebrow={`Prenotazioni · ${selectedChild?.clubName || "Club"}`}
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
        <StateMessage kind="loading" tone="dark" title="Carico le strutture…" />
      ) : status === "forbidden" ? (
        <StateMessage
          kind="forbidden"
          tone="dark"
          message="Il club non ti ha dato accesso alle strutture."
        />
      ) : status === "network" || status === "error" ? (
        <StateMessage
          kind="error"
          tone="dark"
          message={errorMessage}
          actionLabel="Riprova"
          onAction={() => void dashboardQuery.refetch()}
        />
      ) : status === "empty" ? (
        <StateMessage
          kind="empty"
          tone="dark"
          title="Nessuna struttura"
          message="Il club non ha strutture prenotabili dalle famiglie."
        />
      ) : (
        <>
          <SummaryCard
            icon="business-outline"
            eyebrow="Disponibili"
            title={
              structures.length === 1
                ? structures[0].name
                : `${structures.length} strutture del club`
            }
            value={String(bookableCount)}
          />

          {bookings.length > 0 ? (
            <SectionLabel
              label="Le tue prenotazioni"
              trailing={String(bookings.length)}
              style={{ paddingTop: 4 }}
            />
          ) : null}
          {bookings.map((booking) => {
            const look = bookingLook(booking);
            return (
              <GlassRow
                key={booking.id}
                icon={
                  booking.status === "cancelled"
                    ? "close-circle-outline"
                    : "business-outline"
                }
                iconColor={look.color}
                title={`${booking.fieldName} · ${formatItalianDate(booking.start.slice(0, 10), "EEE d")} · ${timeOf(booking.start)} – ${timeOf(booking.end)}`}
                meta={[
                  booking.structureName,
                  typeof booking.amount === "number"
                    ? formatParentCurrency(booking.amount)
                    : "",
                  booking.paymentStatus === "paid"
                    ? "pagata"
                    : booking.paymentStatus === "unpaid"
                      ? "da pagare"
                      : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                dimmed={booking.status === "cancelled"}
                trailing={
                  <StatusPill
                    label={look.label}
                    tier={look.tier}
                    tone={look.tone}
                    small
                  />
                }
              />
            );
          })}

          <SectionLabel
            label="Campi prenotabili"
            trailing={String(bookableCount)}
            style={{ paddingTop: 6 }}
          />
          {structures.flatMap((structure) =>
            bookableFields(structure).map((field) => {
              const price = lowestFieldPrice(field);
              return (
                <GlassRow
                  key={`${structure.id}-${field.id}`}
                  icon="business-outline"
                  iconColor="#2563EB"
                  title={field.name}
                  meta={[
                    structure.name,
                    [structure.address, structure.city]
                      .filter(Boolean)
                      .join(", "),
                    price !== null ? `da ${formatParentCurrency(price)}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  trailing={
                    <StatusPill
                      label="Prenotabile"
                      tier="solid"
                      tone="info"
                      small
                    />
                  }
                  actions={
                    <ActionBarButton
                      label="Prenota"
                      icon="calendar-outline"
                      variant="primary"
                      onPress={() => openBookingSheet(structure, field)}
                    />
                  }
                />
              );
            }),
          )}
        </>
      )}

      <BottomSheet
        visible={Boolean(selection)}
        onClose={() => setSelection(null)}
        eyebrow={selection?.structure.name}
        title={selection ? `Prenota ${selection.field.name}` : "Prenota"}
        actions={
          <>
            <ActionButton
              variant="secondary"
              onPress={() => setSelection(null)}
              style={{ width: 100 }}
            >
              Annulla
            </ActionButton>
            <ActionButton
              disabled={!date.trim() || !time.trim() || !durationMinutes}
              loading={submitting}
              trailingIcon="arrow-forward"
              onPress={() => void handleSubmit()}
              style={{ flex: 1 }}
            >
              Invia richiesta
            </ActionButton>
          </>
        }
      >
        <View style={{ gap: Spacing.md }}>
          {selection && selection.field.pricing.length > 0 ? (
            <View>
              <SignatureText
                variant="eyebrow"
                tone="faint"
                style={{ marginBottom: 6 }}
              >
                Durata
              </SignatureText>
              <View style={styles.chipRow}>
                {selection.field.pricing.map((tariff) => {
                  const selected = durationMinutes === tariff.durationMinutes;
                  return (
                    <Pressable
                      key={tariff.id}
                      onPress={() => setDurationMinutes(tariff.durationMinutes)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={[styles.chip, selected ? styles.chipOn : null]}
                    >
                      <SignatureText
                        style={[
                          styles.chipLabel,
                          selected ? styles.chipLabelOn : null,
                        ]}
                      >
                        {tariff.durationMinutes} min ·{" "}
                        {formatParentCurrency(tariff.price)}
                      </SignatureText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
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
          <SignatureInput
            label="Note (facoltative)"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Eventuali dettagli utili al club"
            error={formError || undefined}
          />
        </View>
      </BottomSheet>
    </SecondaryScreenLayout>
  );
}

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
