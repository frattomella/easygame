import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useAuthContext } from "@/contexts/AuthContext";
import { Spacing } from "@/constants/theme";
import {
  ActionButton,
  BrandStateLayout,
  SignatureText,
} from "@/components/signature";

/**
 * Il gate per i ruoli non ancora supportati dalla V1 mobile (solo Trainer e
 * Parent). Owner, Club Manager, Collaborator, Staff non-Trainer, Athlete e
 * ruoli di club personalizzati diversi da Trainer arrivano tutti qui,
 * intercettati centralmente da `RootStackNavigator` — non da questa
 * schermata, che si limita a mostrare l'avviso e le due uscite possibili.
 *
 * v3.0 (`migration-v3.md` passo 7): su `BrandStateLayout` — cielo pieno,
 * nessun orizzonte — con le due uscite sempre visibili, mai una sola. Il
 * titolo non dice piu "EasyGame Mobile" (stringa vietata da CLAUDE.md
 * §brand — "EasyGame Mobile" e ritirata come linea di prodotto).
 */
export default function UnsupportedRoleScreen() {
  const { clearContext, logout } = useAuthContext();

  return (
    <BrandStateLayout scrollable={false}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="construct-outline" size={40} color="#FFFFFF" />
        </View>

        <SignatureText variant="h2" tone="onDark" style={styles.centeredText}>
          EasyGame è in aggiornamento
        </SignatureText>
        <SignatureText
          variant="body"
          tone="onDarkMuted"
          style={[styles.centeredText, styles.message]}
        >
          Questa area non è ancora disponibile nell&apos;app mobile. Stiamo
          lavorando per renderla disponibile presto.
        </SignatureText>

        <View style={styles.actions}>
          <ActionButton
            variant="primary"
            onSky
            fullWidth
            onPress={() => void clearContext()}
          >
            Torna alla selezione
          </ActionButton>
          <ActionButton
            variant="secondary"
            onSky
            fullWidth
            onPress={() => void logout()}
          >
            Esci
          </ActionButton>
        </View>
      </View>
    </BrandStateLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  centeredText: { textAlign: "center" },
  message: { marginBottom: Spacing["2xl"] },
  actions: { width: "100%", gap: Spacing.sm },
});
