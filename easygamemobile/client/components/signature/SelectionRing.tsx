import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { GradientFill } from "@/components/signature/GradientFill";

interface SelectionRingProps {
  on: boolean;
  /** Mostra un segno di spunta bianco dentro l'anello acceso (prototipo Accessi: la scheda attiva). */
  check?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * L'anello di scelta del prototipo (`ring(on)`): a riposo bianco 60% con
 * bordo 2px navy 22%; acceso gradiente-azione con bordo bianco 40% e alone
 * di 4px blu 26%. Usato dalle righe di scelta nei fogli (figlio, metodo di
 * pagamento) e dalle schede di accesso.
 */
export function SelectionRing({
  on,
  check = false,
  size = 28,
  style,
}: SelectionRingProps) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          borderWidth: on ? 1 : 2,
          borderColor: on ? "rgba(255,255,255,0.4)" : "rgba(11,26,58,0.22)",
          backgroundColor: on ? "transparent" : "rgba(255,255,255,0.6)",
        },
        on ? styles.halo : null,
        style,
      ]}
    >
      {on ? (
        <GradientFill gradient="action" style={StyleSheet.absoluteFillObject} />
      ) : null}
      {on && check ? (
        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.26,
    shadowRadius: 4,
  },
});
