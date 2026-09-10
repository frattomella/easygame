import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Spacing } from "@/constants/theme";
import { GradientFill } from "@/components/signature/GradientFill";
import { SignatureText } from "@/components/signature/SignatureText";
import { StatusPill } from "@/components/signature/StatusPill";
import type { RsvpControlView } from "@/lib/parent-rsvp";

interface RSVPControlProps {
  view: RsvpControlView;
  /** `true` while the answer is in flight — never optimistic, the segment only changes when the server confirms. */
  updating?: boolean;
  errorMessage?: string;
  onAnswer: (status: "yes" | "no") => void;
  onRetry?: () => void;
}

/**
 * design-source `guidelines/component-specs.md` §C2. Renders the
 * transitions the server has already decided (`view`) — never invents a
 * third state. `view.kind === "none"` means the event carries no RSVP
 * invitation at all (no answer to render), so the control draws nothing.
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
        {view.lastState ? (
          <StatusPill
            label={
              view.lastState === "yes"
                ? "Presente confermato"
                : "Assenza comunicata"
            }
            variant={view.lastState === "yes" ? "success" : "destructive"}
            style={styles.lastStatePill}
          />
        ) : null}
        <View style={[styles.track, styles.trackDisabled]}>
          <SignatureText
            variant="small"
            tone="faint"
            style={styles.disabledLabel}
          >
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
      {view.kind === "pending" ? (
        <View style={styles.pendingHeader}>
          <SignatureText variant="eyebrow" style={styles.pendingEyebrow}>
            RISPOSTA RICHIESTA
          </SignatureText>
          {view.deadlineLabel ? (
            <SignatureText variant="small" tone="muted">
              Entro {view.deadlineLabel}
            </SignatureText>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.track, updating ? styles.trackUpdating : null]}>
        <Segment
          label="Ci sarà"
          icon="checkmark-circle"
          selected={attending}
          gradient="action"
          updating={updating}
          disabled={updating}
          onPress={() => onAnswer("yes")}
        />
        <Segment
          label="Non ci sarà"
          icon="close-circle"
          selected={notAttending}
          gradient="destructive"
          updating={updating}
          disabled={updating}
          onPress={() => onAnswer("no")}
        />
      </View>

      {errorMessage ? (
        <View style={styles.errorRow}>
          <SignatureText variant="small" style={styles.errorText}>
            {errorMessage}
          </SignatureText>
          {onRetry ? (
            <Pressable onPress={onRetry}>
              <SignatureText variant="small" style={styles.retry}>
                Riprova
              </SignatureText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Segment({
  label,
  icon,
  selected,
  gradient,
  updating,
  disabled,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  gradient: "action" | "destructive";
  updating: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={styles.segment}>
      {selected ? (
        <GradientFill
          gradient={gradient}
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}
      {selected && updating ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <>
          {selected ? <Ionicons name={icon} size={18} color="#FFFFFF" /> : null}
          <SignatureText
            style={{
              fontSize: 14,
              lineHeight: 20,
              fontWeight: "700",
              color: selected ? "#FFFFFF" : "rgba(11,26,58,0.62)",
            }}
          >
            {label}
          </SignatureText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.xs,
  },
  pendingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  pendingEyebrow: {
    color: "#B45309",
  },
  lastStatePill: {
    marginBottom: 4,
  },
  track: {
    flexDirection: "row",
    height: 52,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 5,
    borderBottomLeftRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(11,26,58,0.14)",
    backgroundColor: "rgba(255,255,255,0.88)",
    overflow: "hidden",
  },
  trackUpdating: {
    opacity: 0.7,
  },
  trackDisabled: {
    backgroundColor: "rgba(11,26,58,0.06)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
  },
  disabledLabel: {
    textAlign: "center",
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  errorText: {
    color: "#B91C1C",
    fontWeight: "600",
  },
  retry: {
    color: "#2563EB",
    fontWeight: "700",
  },
});
