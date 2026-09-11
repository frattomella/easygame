import React from "react";
import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import {
  GlassRow,
  SecondaryScreenLayout,
  SectionLabel,
  SelectionRing,
  StatusPill,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { groupChildrenByClub } from "@/lib/parent-children";
import type { ParentProfileStackParamList } from "@/navigation/ParentProfileStackNavigator";

type Navigation = NativeStackNavigationProp<
  ParentProfileStackParamList,
  "ParentChildren"
>;

// Stato di tesseramento come lo legge la famiglia; lo stato regolare e
// quieto/verde, gli altri outline/warning (quattro livelli, EGDS v3).
const STATUS_LABEL: Record<string, string> = {
  active: "Attivo",
  attivo: "Attivo",
  suspended: "Sospeso",
  loan: "In prestito",
  inactive: "Non attivo",
};
const REGULAR_STATUS = new Set(["active", "attivo"]);

/**
 * "I miei figli" — la gestione multi-figlio del WP4 sulla riga di vetro del
 * prototipo (`children`): raggruppati per club, l'anello segna il figlio
 * attivo; il tocco lo rende attivo e apre la sua scheda. Raggiunta solo
 * quando `ParentContext` e "ready" — l'assenza di figli ha il proprio
 * schermo in `ParentTabNavigator`, non qui.
 */
export default function ParentChildrenScreen() {
  const navigation = useNavigation<Navigation>();
  const { children, selectedChildId, selectChild } = useParentContext();
  const groups = groupChildrenByClub(children);
  const selected = children.find((child) => child.id === selectedChildId);

  return (
    <SecondaryScreenLayout
      title="I miei figli"
      eyebrow="Account EasyGame · Genitore"
      contentGap={8}
      club={
        selected
          ? { name: selected.clubName, avatarUrl: selected.clubLogoUrl }
          : undefined
      }
    >
      {groups.map((group) => (
        <View key={group.clubId} style={{ gap: 8 }}>
          <SectionLabel
            label={group.clubName}
            trailing={String(group.children.length)}
          />
          {group.children.map((child) => {
            const isSelected = child.id === selectedChildId;
            return (
              <GlassRow
                key={child.id}
                icon="person-outline"
                iconColor={isSelected ? "#2563EB" : "#64748B"}
                title={child.name}
                meta={
                  [child.categoryName, child.birthYear]
                    .filter(Boolean)
                    .join(" · ") || "Categoria non assegnata"
                }
                emphasis={isSelected ? "strong" : "default"}
                borderColor={isSelected ? "rgba(37,99,235,0.4)" : undefined}
                trailing={
                  <>
                    {child.status ? (
                      <StatusPill
                        label={STATUS_LABEL[child.status] || child.status}
                        tier={
                          REGULAR_STATUS.has(child.status) ? "quiet" : "outline"
                        }
                        tone={
                          REGULAR_STATUS.has(child.status)
                            ? "success"
                            : "warning"
                        }
                        small
                      />
                    ) : null}
                    <SelectionRing on={isSelected} check />
                  </>
                }
                chevron={false}
                onPress={() => {
                  if (!isSelected) selectChild(child.id);
                  navigation.navigate("ParentAthleteProfile");
                }}
                accessibilityLabel={`${child.name}${isSelected ? ", atleta attivo" : ""}. Apri la scheda`}
              />
            );
          })}
        </View>
      ))}
    </SecondaryScreenLayout>
  );
}
