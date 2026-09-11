import React from "react";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import {
  GlassRow,
  SecondaryScreenLayout,
  SectionLabel,
} from "@/components/signature";
import { useAuthContext } from "@/contexts/AuthContext";
import type { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";
import type { TrainerNavigationPermissionKey } from "@/lib/trainer-permissions";

type Navigation = NativeStackNavigationProp<ProfileStackParamList, "More">;

type MoreItem = {
  key: TrainerNavigationPermissionKey;
  screen: keyof ProfileStackParamList;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  meta: string;
};

const ITEMS: MoreItem[] = [
  {
    key: "categories",
    screen: "Categories",
    icon: "shield-outline",
    color: "#3533CD",
    title: "Squadre e categorie",
    meta: "Le tue categorie, atleti e calendario",
  },
  {
    key: "board",
    screen: "Board",
    icon: "megaphone-outline",
    color: "#2563EB",
    title: "Bacheca",
    meta: "Gli avvisi del club",
  },
  {
    key: "documents",
    screen: "Documents",
    icon: "document-text-outline",
    color: "#F59E0B",
    title: "Documenti",
    meta: "I tuoi documenti e le scadenze",
  },
  {
    key: "appointments",
    screen: "Appointments",
    icon: "calendar-outline",
    color: "#2563EB",
    title: "Appuntamenti",
    meta: "Colloqui con le famiglie",
  },
  {
    key: "compensation",
    screen: "Compensation",
    icon: "cash-outline",
    color: "#10B981",
    title: "Compensi",
    meta: "Rapporti, rate, posizione annuale",
  },
  {
    key: "notifications",
    screen: "Notifications",
    icon: "notifications-outline",
    color: "#3533CD",
    title: "Notifiche",
    meta: "Promemoria e avvisi",
  },
];

/**
 * L'hub delle sezioni secondarie (prototipo `isTServices`, "Tutte le
 * sezioni"): l'elenco completo, gated dal permesso reale del club
 * (`trainerPermissions.navigation.*`) — una voce spenta sparisce, non si
 * ingrigisce. Righe di vetro con chevron: navigano, non agiscono.
 */
export default function TrainerMoreScreen() {
  const navigation = useNavigation<Navigation>();
  const { trainerPermissions } = useAuthContext();

  const items = ITEMS.filter(
    (item) => trainerPermissions?.navigation[item.key] !== false,
  );

  return (
    <SecondaryScreenLayout
      title="Servizi"
      eyebrow="Allenatore · Tutte le sezioni"
      contentGap={8}
    >
      <SectionLabel label="Tutte le sezioni" trailing={String(items.length)} />
      {items.map((item) => (
        <GlassRow
          key={item.key}
          icon={item.icon}
          iconColor={item.color}
          title={item.title}
          meta={item.meta}
          onPress={() => navigation.navigate(item.screen as never)}
        />
      ))}
    </SecondaryScreenLayout>
  );
}
