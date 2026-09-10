import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ActionButton,
  BookingCard,
  BottomSheet,
  GlassCard,
  IconChip,
  SecondaryScreenLayout,
  SignatureInput,
  SignatureText,
  StateMessage,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import {
  bookableFields,
  computeBookingEnd,
  lowestFieldPrice,
} from "@/lib/parent-structures";
import { formatParentCurrency } from "@/lib/parent-payments";
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
  const { selectedChildId } = useParentContext();
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

  return (
    <SecondaryScreenLayout title="Strutture" eyebrow="Segreteria">
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
          message="Il club non ha ancora reso disponibili strutture prenotabili."
        />
      ) : (
        <>
          {bookings.length > 0 ? (
            <View style={{ gap: Spacing.sm, marginBottom: Spacing.lg }}>
              <SignatureText variant="eyebrow" tone="faint">
                Le tue prenotazioni
              </SignatureText>
              {bookings.map((booking) => (
                <BookingCard key={booking.id} booking={booking} />
              ))}
            </View>
          ) : null}

          <SignatureText
            variant="eyebrow"
            tone="faint"
            style={{ marginBottom: Spacing.sm }}
          >
            Strutture disponibili
          </SignatureText>
          {structures.map((structure) => (
            <GlassCard
              key={structure.id}
              eyebrow={structure.type}
              title={structure.name}
              description={[structure.address, structure.city]
                .filter(Boolean)
                .join(", ")}
              style={{ gap: Spacing.sm, marginBottom: Spacing.md }}
            >
              {bookableFields(structure).map((field) => {
                const price = lowestFieldPrice(field);
                return (
                  <Pressable
                    key={field.id}
                    onPress={() => openBookingSheet(structure, field)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: Spacing.sm,
                      paddingVertical: Spacing.sm,
                    }}
                  >
                    <IconChip name="football-outline" tone="tint" size={32} />
                    <View style={{ flex: 1 }}>
                      <SignatureText variant="body" tone="ink">
                        {field.name}
                      </SignatureText>
                      {price !== null ? (
                        <SignatureText variant="small" tone="muted">
                          Da {formatParentCurrency(price)}
                        </SignatureText>
                      ) : null}
                    </View>
                    <SignatureText
                      variant="small"
                      style={{ color: "#2563EB", fontWeight: "700" }}
                    >
                      Prenota
                    </SignatureText>
                  </Pressable>
                );
              })}
            </GlassCard>
          ))}
        </>
      )}

      <BottomSheet
        visible={Boolean(selection)}
        onClose={() => setSelection(null)}
        accessibilityLabel="Prenota struttura"
      >
        <SignatureText
          variant="eyebrow"
          tone="faint"
          style={{ marginBottom: 4 }}
        >
          {selection?.structure.name}
        </SignatureText>
        <SignatureText
          variant="h3"
          tone="ink"
          style={{ marginBottom: Spacing.md }}
        >
          Prenota {selection?.field.name}
        </SignatureText>
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
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: Spacing.sm,
                }}
              >
                {selection.field.pricing.map((tariff) => {
                  const selected = durationMinutes === tariff.durationMinutes;
                  return (
                    <Pressable
                      key={tariff.id}
                      onPress={() => setDurationMinutes(tariff.durationMinutes)}
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
          />
          <SignatureInput
            label="Ora (HH:MM)"
            value={time}
            onChangeText={setTime}
            placeholder="18:00"
          />
          <SignatureInput
            label="Note (facoltative)"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Eventuali richieste particolari"
            error={formError || undefined}
          />
          <View style={{ flexDirection: "row", gap: Spacing.sm }}>
            <ActionButton
              disabled={!date.trim() || !time.trim() || !durationMinutes}
              loading={submitting}
              trailingIcon="arrow-forward"
              onPress={() => void handleSubmit()}
            >
              Invia richiesta
            </ActionButton>
            <ActionButton variant="ghost" onPress={() => setSelection(null)}>
              Annulla
            </ActionButton>
          </View>
        </View>
      </BottomSheet>

      <View style={{ height: Spacing.lg }} />
    </SecondaryScreenLayout>
  );
}
