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
 * WP4: identita account, gestione multi-figlio, cambio contesto, logout —
 * l'essenziale che ogni area deve avere fin da subito (istruzione "ACCOUNT /
 * SWITCH CONTEXT"). L'hub delle sezioni secondarie (`ParentMoreScreen`) e
 * l'accesso reskin (`AccountAccessCard`) arrivano nel WP6.
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
