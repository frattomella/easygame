import React from "react";
import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import {
  ActionButton,
  GlassCard,
  ParentPrimaryScreenLayout,
  SignatureText,
} from "@/components/signature";
import { useAuthContext } from "@/contexts/AuthContext";
import { useParentContext } from "@/contexts/ParentContext";
import { Spacing } from "@/constants/theme";
import type { ParentProfileStackParamList } from "@/navigation/ParentProfileStackNavigator";

type Navigation = NativeStackNavigationProp<
  ParentProfileStackParamList,
  "ParentProfile"
>;

/**
 * Identita account, gestione multi-figlio, cambio contesto, logout (WP4).
 *
 * v3.0 (`migration-v3.md` passo 8): l'hub `ParentMoreScreen` ("Altre
 * sezioni") e rimosso — le sue sezioni reali (Appuntamenti, Prenotazioni
 * strutture, Contatti) sono confluite nel tab Servizi insieme a
 * Documenti/Consensi/Iscrizione/Bacheca (ADR-0168 §4c2, nessuna di quelle
 * perde la propria schermata). L'unica voce senza una sezione reale dietro,
 * "Impostazioni", resta raggiungibile direttamente da qui.
 */
export default function ParentProfileScreen() {
  const navigation = useNavigation<Navigation>();
  const { user, clearContext, logout } = useAuthContext();
  const { children, selectedChildId, selectedChild, switching, selectChild } =
    useParentContext();

  return (
    <ParentPrimaryScreenLayout
      title="Profilo"
      eyebrow="Il tuo account"
      linkedChildren={children}
      selectedChildId={selectedChildId}
      childrenSwitching={switching}
      onSelectChild={selectChild}
      content={
        <>
          <GlassCard eyebrow="Account" title={user?.name || "Il tuo account"}>
            <SignatureText variant="small" tone="muted">
              {user?.email}
            </SignatureText>
          </GlassCard>

          <GlassCard
            eyebrow="Famiglia"
            title={
              children.length === 1
                ? "Un figlio collegato"
                : `${children.length} figli collegati`
            }
            description={
              selectedChild
                ? `Attivo: ${selectedChild.name} · ${selectedChild.clubName}`
                : undefined
            }
          >
            <View style={{ marginTop: Spacing.sm }}>
              <ActionButton
                variant="secondary"
                size="sm"
                onPress={() => navigation.navigate("ParentChildren")}
              >
                I miei figli
              </ActionButton>
            </View>
          </GlassCard>

          <GlassCard
            eyebrow="Altro"
            title="Impostazioni"
            description="Preferenze dell'app."
          >
            <View style={{ marginTop: Spacing.sm }}>
              <ActionButton
                variant="secondary"
                size="sm"
                onPress={() =>
                  navigation.navigate("ParentComingSoon", {
                    title: "Impostazioni",
                  })
                }
              >
                Apri impostazioni
              </ActionButton>
            </View>
          </GlassCard>

          <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
            <ActionButton
              variant="secondary"
              fullWidth
              onPress={() => void clearContext()}
            >
              Cambia club o accesso
            </ActionButton>
            <ActionButton
              variant="destructive"
              fullWidth
              onPress={() => void logout()}
            >
              Esci
            </ActionButton>
          </View>
        </>
      }
    />
  );
}
