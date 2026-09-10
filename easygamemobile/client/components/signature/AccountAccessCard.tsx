import React, { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { Spacing } from "@/constants/theme";
import { GlassCard } from "@/components/signature/GlassCard";
import { SignatureText } from "@/components/signature/SignatureText";
import { StatusPill } from "@/components/signature/StatusPill";

interface AccountAccessCardProps {
  clubName: string;
  clubAvatarUrl?: string | null;
  roleLabel: string;
  /** e.g. "Stagione 2026/27", "2 figli · Marco, Giulia" — one optional secondary line. */
  detailLine?: string;
  /** `false` when this role has no mobile area yet — shown, never hidden (spec C10). */
  supported?: boolean;
  activating?: boolean;
  onPress?: () => void;
}

const initialsOf = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";

/**
 * design-source `guidelines/component-specs.md` §C10. Never auto-selects
 * when more than one membership exists (the caller — `AccountHubScreen` —
 * always requires an explicit tap); never hides a membership the app
 * cannot open, it explains why instead.
 */
export function AccountAccessCard({
  clubName,
  clubAvatarUrl,
  roleLabel,
  detailLine,
  supported = true,
  activating = false,
  onPress,
}: AccountAccessCardProps) {
  const [pressed, setPressed] = useState(false);
  const interactive = supported && Boolean(onPress) && !activating;

  const inner = (
    <GlassCard
      style={[
        styles.card,
        pressed ? styles.pressed : null,
        !supported ? styles.unsupported : null,
      ]}
    >
      <View style={styles.row}>
        <View style={styles.avatar}>
          {clubAvatarUrl ? (
            <Image
              source={{ uri: clubAvatarUrl }}
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <SignatureText style={styles.avatarLabel}>
              {initialsOf(clubName)}
            </SignatureText>
          )}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <SignatureText variant="h4" tone="ink" numberOfLines={1}>
            {clubName}
          </SignatureText>
          <StatusPill label={roleLabel} variant="primary" small />
          {detailLine ? (
            <SignatureText variant="small" tone="muted">
              {detailLine}
            </SignatureText>
          ) : null}
          {!supported ? (
            <SignatureText variant="small" tone="faint" style={styles.reason}>
              Ruolo non ancora disponibile su mobile
            </SignatureText>
          ) : null}
        </View>
        <View
          style={[styles.ring, activating ? styles.ringActivating : null]}
        />
      </View>
    </GlassCard>
  );

  if (!interactive) {
    return inner;
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.md,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  unsupported: {
    opacity: 0.55,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(11,26,58,0.14)",
    backgroundColor: "rgba(37,99,235,0.12)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarLabel: {
    color: "#2563EB",
    fontWeight: "800",
  },
  reason: {
    marginTop: 2,
  },
  ring: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(11,26,58,0.22)",
  },
  ringActivating: {
    borderColor: "#2563EB",
  },
});
