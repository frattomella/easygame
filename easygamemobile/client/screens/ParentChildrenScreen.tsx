import React from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  GlassCard,
  SecondaryScreenLayout,
  SignatureText,
  StatusPill,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { groupChildrenByClub } from "@/lib/parent-children";
import { Spacing } from "@/constants/theme";

const STATUS_LABEL: Record<string, string> = {
  suspended: "Sospeso",
  loan: "In prestito",
  inactive: "Non attivo",
};

/**
 * "I miei figli" — la gestione multi-figlio richiesta dal WP4: un figlio
 * solo (nessuno switcher, solo la scheda), piu figli (elenco raggruppato
 * per club, tocco per cambiare il contesto attivo). Raggiunta solo quando
 * `ParentContext` e "ready" — l'assenza di figli ha il proprio schermo
 * dedicato in `ParentTabNavigator`, non qui.
 */
export default function ParentChildrenScreen() {
  const { children, selectedChildId, selectChild } = useParentContext();
  const groups = groupChildrenByClub(children);

  return (
    <SecondaryScreenLayout title="I miei figli" eyebrow="Famiglia">
      {groups.map((group) => (
        <View key={group.clubId} style={{ gap: Spacing.sm }}>
          <SignatureText variant="eyebrow" tone="faint">
            {group.clubName}
          </SignatureText>
          {group.children.map((child) => {
            const isSelected = child.id === selectedChildId;
            return (
              <Pressable
                key={child.id}
                onPress={() => selectChild(child.id)}
                disabled={children.length === 1}
              >
                <GlassCard>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: Spacing.md,
                    }}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <SignatureText variant="h4" tone="ink">
                        {child.name}
                      </SignatureText>
                      <SignatureText variant="small" tone="muted">
                        {[child.categoryName, child.birthYear]
                          .filter(Boolean)
                          .join(" · ") || "Categoria non assegnata"}
                      </SignatureText>
                      {child.status ? (
                        <StatusPill
                          label={STATUS_LABEL[child.status] || child.status}
                          variant="warning"
                          small
                        />
                      ) : null}
                    </View>
                    {children.length > 1 ? (
                      <Ionicons
                        name={
                          isSelected
                            ? "radio-button-on"
                            : "radio-button-off-outline"
                        }
                        size={22}
                        color={isSelected ? "#2563EB" : "#94A3B8"}
                      />
                    ) : null}
                  </View>
                </GlassCard>
              </Pressable>
            );
          })}
        </View>
      ))}
    </SecondaryScreenLayout>
  );
}
