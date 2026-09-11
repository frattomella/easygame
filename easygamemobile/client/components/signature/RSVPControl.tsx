import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ActionButton } from "@/components/signature/ActionButton";
import { SignatureText } from "@/components/signature/SignatureText";
import { StatusPill } from "@/components/signature/StatusPill";
import type { RsvpControlView } from "@/lib/parent-rsvp";

interface RSVPControlProps {
  view: RsvpControlView;
  /** `true` while the answer is in flight — never optimistic, the buttons only change when the server confirms. */
  updating?: boolean;
  errorMessage?: string;
  onAnswer: (status: "yes" | "no") => void;
  onRetry?: () => void;
}

/**
 * La risposta della famiglia sulla scheda evento (prototipo `actionsRsvp`):
 * due bottoni affiancati, "Ci sarà" (successo) e "Non ci sarà"
 * (secondario), 40px, a meta larghezza ciascuno. Lo stato lo decide il
 * server (`view`, spec C2): la risposta data resta piena, l'altra torna
 * secondaria; un invito chiuso mostra la pill dell'esito e il motivo, mai un
 * terzo stato inventato. `view.kind === "none"` = nessun invito: niente.
 */
export function RSVPControl({
  view,
  updating = false,
  errorMessage,
  onAnswer,
  onRetry,
}: RSVPControlProps) {
  if (view.kind === "none") {
    return null;
  }

  if (view.kind === "disabled") {
    return (
      <View style={styles.wrap}>
        <View style={styles.closedRow}>
          {view.lastState ? (
            <StatusPill
              label={view.lastState === "yes" ? "Ci sarà" : "Non ci sarà"}
              tier={view.lastState === "yes" ? "solid" : "quiet"}
              tone={view.lastState === "yes" ? "success" : "neutral"}
              small
            />
          ) : null}
          <SignatureText style={styles.reason} numberOfLines={2}>
            {view.reason}
          </SignatureText>
        </View>
      </View>
    );
  }

  const attending = view.kind === "attending";
  const notAttending = view.kind === "not_attending";

  return (
    <View style={styles.wrap}>
      {view.kind === "pending" && view.deadlineLabel ? (
        <SignatureText style={styles.deadline}>
          {`Rispondi entro ${view.deadlineLabel}`}
        </SignatureText>
      ) : null}
      <View style={styles.row}>
        <ActionButton
          size="sm"
          variant={
            attending || view.kind === "pending" ? "success" : "secondary"
          }
          icon={attending ? "checkmark-circle" : undefined}
          loading={updating && !notAttending}
          disabled={updating}
          onPress={() => onAnswer("yes")}
          style={styles.button}
        >
          Ci sarà
        </ActionButton>
        <ActionButton
          size="sm"
          variant={notAttending ? "destructive" : "secondary"}
          icon={notAttending ? "close-circle" : undefined}
          loading={updating && notAttending}
          disabled={updating}
          onPress={() => onAnswer("no")}
          style={styles.button}
        >
          Non ci sarà
        </ActionButton>
      </View>
      {errorMessage ? (
        <View style={styles.errorRow}>
          <SignatureText style={styles.errorText}>{errorMessage}</SignatureText>
          {onRetry ? (
            <Pressable onPress={onRetry} hitSlop={6}>
              <SignatureText style={styles.retry}>Riprova</SignatureText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  deadline: {
    color: "rgba(11,26,58,0.62)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  button: {
    flex: 1,
  },
  closedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reason: {
    flex: 1,
    color: "rgba(11,26,58,0.42)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: "#B91C1C",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  retry: {
    color: "#1D4ED8",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
});
