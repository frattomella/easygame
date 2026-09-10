import React from "react";
import { Pressable, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import {
  GlassCard,
  IconChip,
  SecondaryScreenLayout,
  SignatureText,
} from "@/components/signature";
import { useAuthContext } from "@/contexts/AuthContext";
import { Spacing } from "@/constants/theme";
import type { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";
import type { TrainerNavigationPermissionKey } from "@/lib/trainer-permissions";

type Navigation = NativeStackNavigationProp<ProfileStackParamList, "More">;

type MoreItem = {
  key: TrainerNavigationPermissionKey;
  screen: keyof ProfileStackParamList;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
};

const ITEMS: MoreItem[] = [
  {
    key: "board",
    screen: "Board",
    icon: "megaphone-outline",
    title: "Bacheca",
    subtitle: "Gli avvisi del club",
  },
  {
    key: "documents",
    screen: "Documents",
    icon: "document-text-outline",
    title: "Documenti",
    subtitle: "I tuoi documenti",
  },
  {
    key: "appointments",
    screen: "Appointments",
    icon: "calendar-outline",
    title: "Appuntamenti",
    subtitle: "Colloqui con le famiglie",
  },
  {
    key: "compensation",
    screen: "Compensation",
    icon: "cash-outline",
    title: "I miei compensi",
    subtitle: "Rapporti, rate, posizione annuale",
  },
  {
    key: "categories",
    screen: "Categories",
    icon: "shield-outline",
    title: "Squadre",
    subtitle: "Le tue categorie",
  },
];

/**
 * Navigazione secondaria: le sezioni meno frequenti non hanno una tab
 * permanente (WP3, "Navigation Trainer") — si raggiungono da qui, un tocco
 * dal Profilo. Ogni voce e gated dal permesso reale del club
 * (`trainerPermissions.navigation.*`, allineato al Web in questo stesso WP):
 * una voce spenta dal club sparisce dall'elenco invece di aprire una
 * schermata che il server rifiuterebbe.
 */
export default function TrainerMoreScreen() {
  const navigation = useNavigation<Navigation>();
  const { trainerPermissions } = useAuthContext();

  const items = ITEMS.filter(
    (item) => trainerPermissions?.navigation[item.key] !== false,
  );

  return (
    <SecondaryScreenLayout title="Altre sezioni" eyebrow="Personale">
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => navigation.navigate(item.screen as never)}
        >
          <GlassCard>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: Spacing.md,
              }}
            >
              <IconChip name={item.icon} size={40} />
              <View style={{ flex: 1 }}>
                <SignatureText variant="h4" tone="ink">
                  {item.title}
                </SignatureText>
                <SignatureText variant="small" tone="muted">
                  {item.subtitle}
                </SignatureText>
              </View>
              <Ionicons
                name="chevron-forward-outline"
                size={20}
                color="#94A3B8"
              />
            </View>
          </GlassCard>
        </Pressable>
      ))}
    </SecondaryScreenLayout>
  );
}
