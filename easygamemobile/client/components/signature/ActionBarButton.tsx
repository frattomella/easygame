import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EGCorner } from "@/constants/theme";
import { SignatureText } from "@/components/signature/SignatureText";

interface ActionBarButtonProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** `primary`: pieno #1D4ED8, etichetta bianca. `secondary`: inchiostro 5%, etichetta #1E40AF. */
  variant?: "primary" | "secondary";
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Il bottone della barra azioni sotto una riga (prototipo `act(...)`,
 * design turno 6 §1-3): 36px, icona 16 + parola, angolo 10/4 — "icon +
 * word, never icon alone": Carica documento, Visualizza, Scarica,
 * Sostituisci, Paga ora, Ricevuta, Fattura, Dettaglio.
 */
export function ActionBarButton({
  label,
  icon,
  variant = "secondary",
  onPress,
  disabled = false,
  loading = false,
  style,
}: ActionBarButtonProps) {
  const primary = variant === "primary";
  const fg = primary ? "#FFFFFF" : "#1E40AF";
  const inert = disabled || loading;
  return (
    <Pressable
      onPress={inert ? undefined : onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inert }}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        inert ? styles.inert : null,
        pressed ? styles.pressed : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <Ionicons name={icon} size={16} color={fg} />
      )}
      <SignatureText style={[styles.label, { color: fg }]}>
        {label}
      </SignatureText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 36,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    ...EGCorner.chip,
  },
  primary: {
    backgroundColor: "#1D4ED8",
    borderColor: "#1D4ED8",
  },
  secondary: {
    backgroundColor: "rgba(11,26,58,0.05)",
    borderColor: "rgba(11,26,58,0.14)",
  },
  inert: {
    opacity: 0.55,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  label: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "700",
  },
});
