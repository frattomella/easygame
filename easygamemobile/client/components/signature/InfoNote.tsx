import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { EGCorner } from "@/constants/theme";
import { SignatureText } from "@/components/signature/SignatureText";

interface InfoNoteProps {
  children: React.ReactNode;
  /** `danger`: testo rosso su tinta rossa (errori inline); default: tinta blu. */
  tone?: "info" | "danger" | "warning";
  style?: StyleProp<ViewStyle>;
}

const TONES = {
  info: {
    bg: "rgba(37,99,235,0.08)",
    border: "rgba(37,99,235,0.22)",
    fg: "rgba(11,26,58,0.62)",
  },
  danger: {
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.3)",
    fg: "#B91C1C",
  },
  warning: {
    bg: "rgba(245,158,11,0.1)",
    border: "rgba(180,83,9,0.3)",
    fg: "#8A4708",
  },
};

/**
 * La nota di contesto del prototipo (Documenti: "Formati accettati: PDF,
 * JPG, PNG · massimo 10 MB per file."; foglio di caricamento): tinta blu
 * 8%, bordo blu 22%, testo 12.5/500 inchiostro 62%, angolo 14/5.
 */
export function InfoNote({ children, tone = "info", style }: InfoNoteProps) {
  const t = TONES[tone];
  return (
    <View
      style={[
        styles.box,
        { backgroundColor: t.bg, borderColor: t.border },
        style,
      ]}
    >
      <SignatureText style={[styles.text, { color: t.fg }]}>
        {children}
      </SignatureText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    ...EGCorner.control,
  },
  text: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "500",
  },
});
