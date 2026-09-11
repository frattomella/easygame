import React from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

import { SignatureText } from "@/components/signature/SignatureText";

interface SectionLabelProps {
  label: string;
  /** Un contatore o una nota a destra (prototipo: "8", "Segreteria", "3"). */
  trailing?: string;
  /** Un'azione testuale a destra, in blu (prototipo Notifiche: "Segna tutte come lette"). */
  action?: { label: string; onPress: () => void };
  /** Sul cielo (bianco 72%) invece che sulla nebbia (inchiostro 42%). */
  onSky?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * L'intestazione di sezione del prototipo: eyebrow 11/700 tracciato a
 * sinistra, contatore 11/600 (o azione 12/700 blu) a destra, allineati alla
 * base, con 4px di rientro laterale rispetto alle schede sotto.
 */
export function SectionLabel({
  label,
  trailing,
  action,
  onSky = false,
  style,
}: SectionLabelProps) {
  return (
    <View style={[styles.row, style]}>
      <SignatureText
        variant="eyebrow"
        tone={onSky ? "onDarkMuted" : "faint"}
        numberOfLines={1}
        style={{ flexShrink: 1 }}
      >
        {label}
      </SignatureText>
      {action ? (
        <Pressable
          onPress={action.onPress}
          hitSlop={8}
          accessibilityRole="button"
        >
          <SignatureText style={styles.action}>{action.label}</SignatureText>
        </Pressable>
      ) : trailing ? (
        <SignatureText
          style={[
            styles.trailing,
            onSky ? { color: "rgba(255,255,255,0.72)" } : null,
          ]}
        >
          {trailing}
        </SignatureText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 4,
    paddingBottom: 2,
  },
  trailing: {
    color: "rgba(11,26,58,0.42)",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
  action: {
    color: "#1D4ED8",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
});
