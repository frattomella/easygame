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
import type { ParentProfileStackParamList } from "@/navigation/ParentProfileStackNavigator";

type Navigation = NativeStackNavigationProp<
  ParentProfileStackParamList,
  "ParentMore"
>;

type Item =
  | {
      key: string;
      icon: keyof typeof Ionicons.glyphMap;
      title: string;
      subtitle: string;
      kind: "children";
    }
  | {
      key: string;
      icon: keyof typeof Ionicons.glyphMap;
      title: string;
      subtitle: string;
      kind: "access";
    }
  | {
      key: string;
      icon: keyof typeof Ionicons.glyphMap;
      title: string;
      subtitle: string;
      kind: "soon";
    };

/**
 * L'hub Parent (`guidelines/navigation.md`, Livello 2): le sezioni meno
 * frequenti, una tocco dal Profilo — "I miei figli" e "Accessi e club" sono
 * reali, le altre predispongono lo slot senza fingere di funzionare
 * (WP6, ADR-0163: pagamenti/documenti/consensi/iscrizione/appuntamenti/
 * strutture/contatti sono fuori perimetro di questo batch).
 */
const ITEMS: Item[] = [
  {
    key: "children",
    icon: "people-outline",
    title: "I miei figli",
    subtitle: "Gestisci e cambia figlio attivo",
    kind: "children",
  },
  {
    key: "access",
    icon: "swap-horizontal-outline",
    title: "Accessi e club",
    subtitle: "Cambia club o ruolo",
    kind: "access",
  },
  {
    key: "payments",
    icon: "card-outline",
    title: "Pagamenti",
    subtitle: "Rate, ricevute, «Paga ora»",
    kind: "soon",
  },
  {
    key: "documents",
    icon: "document-text-outline",
    title: "Documenti",
    subtitle: "Certificati e moduli richiesti",
    kind: "soon",
  },
  {
    key: "consents",
    icon: "shield-checkmark-outline",
    title: "Consensi",
    subtitle: "Autorizzazioni e privacy",
    kind: "soon",
  },
  {
    key: "enrollment",
    icon: "clipboard-outline",
    title: "Iscrizione",
    subtitle: "Stato di iscrizione e rinnovo",
    kind: "soon",
  },
  {
    key: "appointments",
    icon: "calendar-outline",
    title: "Appuntamenti",
    subtitle: "Colloqui con la segreteria",
    kind: "soon",
  },
  {
    key: "structures",
    icon: "business-outline",
    title: "Prenotazioni strutture",
    subtitle: "Campi e sale del club",
    kind: "soon",
  },
  {
    key: "contacts",
    icon: "call-outline",
    title: "Contatti club",
    subtitle: "Segreteria e recapiti",
    kind: "soon",
  },
  {
    key: "settings",
    icon: "settings-outline",
    title: "Impostazioni",
    subtitle: "Preferenze dell'app",
    kind: "soon",
  },
];

export default function ParentMoreScreen() {
  const navigation = useNavigation<Navigation>();
  const { clearContext } = useAuthContext();

  const handlePress = (item: Item) => {
    if (item.kind === "children") {
      navigation.navigate("ParentChildren");
      return;
    }
    if (item.kind === "access") {
      void clearContext();
      return;
    }
    navigation.navigate("ParentComingSoon", { title: item.title });
  };

  return (
    <SecondaryScreenLayout title="Altre sezioni" eyebrow="Famiglia">
      {ITEMS.map((item) => (
        <Pressable key={item.key} onPress={() => handlePress(item)}>
          <GlassCard
            style={item.kind === "soon" ? { opacity: 0.7 } : undefined}
          >
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
