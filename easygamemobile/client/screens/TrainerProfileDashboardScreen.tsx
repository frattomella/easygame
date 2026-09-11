import React from "react";
import { Linking, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import {
  ActionButton,
  GlassRow,
  SecondaryScreenLayout,
  SignatureText,
} from "@/components/signature";
import { useAuthContext } from "@/contexts/AuthContext";
import { getRoleLabel } from "@/lib/mobile-ui";
import { SUPPORT_MAILTO_URL } from "@/constants/external-links";
import type { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";

type Navigation = NativeStackNavigationProp<ProfileStackParamList, "Profile">;

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";

/**
 * Il Profilo del prototipo v3 (`isProfile`): nel cielo l'avatar tondo con
 * le iniziali, nome 22/800 e "Ruolo · Club"; poi la riga evidenziata
 * "Accessi e club" (torna all'Account Hub — il cambio club/ruolo vive li),
 * le righe di navigazione (Dati personali, Notifiche, Altre sezioni,
 * Assistenza) e "Esci" distruttivo a tutta larghezza. Il modulo dei dati
 * personali si e spostato in `TrainerPersonalDataScreen`: stessi campi,
 * stessa funzione.
 */
export default function TrainerProfileDashboardScreen() {
  const navigation = useNavigation<Navigation>();
  const {
    user,
    currentClub,
    currentRole,
    trainerPermissions,
    clearContext,
    logout,
  } = useAuthContext();

  const name = user?.name || "Allenatore";
  const openSupport = async () => {
    if (await Linking.canOpenURL(SUPPORT_MAILTO_URL)) {
      await Linking.openURL(SUPPORT_MAILTO_URL);
    }
  };

  return (
    <SecondaryScreenLayout
      title="Profilo"
      eyebrow={`Account EasyGame · ${getRoleLabel(currentRole)}`}
      onBack={false}
      skyHeight={300}
      onNotifications={() => navigation.navigate("Notifications")}
    >
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <SignatureText style={styles.avatarLabel}>
            {initialsOf(name)}
          </SignatureText>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <SignatureText style={styles.name} numberOfLines={1}>
            {name}
          </SignatureText>
          <SignatureText style={styles.role} numberOfLines={1}>
            {`${getRoleLabel(currentRole)} · ${currentClub?.name || "Club"}`}
          </SignatureText>
        </View>
      </View>

      <GlassRow
        icon="swap-horizontal-outline"
        iconColor="#2563EB"
        title="Accessi e club"
        meta="Cambia club o ruolo"
        emphasis="strong"
        borderColor="rgba(37,99,235,0.4)"
        corner="card"
        onPress={() => void clearContext()}
      />
      <GlassRow
        icon="person-outline"
        iconColor="#2563EB"
        title="Dati personali"
        onPress={() => navigation.navigate("PersonalData")}
      />
      {trainerPermissions?.navigation.notifications !== false ? (
        <GlassRow
          icon="notifications-outline"
          iconColor="#3533CD"
          title="Notifiche"
          onPress={() => navigation.navigate("Notifications")}
        />
      ) : null}
      <GlassRow
        icon="grid-outline"
        iconColor="#3533CD"
        title="Tutte le sezioni"
        onPress={() => navigation.navigate("More")}
      />
      <GlassRow
        icon="help-circle-outline"
        iconColor="#F59E0B"
        title="Assistenza"
        onPress={() => void openSupport()}
      />

      <ActionButton
        variant="destructive"
        fullWidth
        icon="log-out-outline"
        onPress={() => void logout()}
        style={{ marginTop: 4 }}
      >
        Esci
      </ActionButton>
    </SecondaryScreenLayout>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLabel: {
    color: "#FFFFFF",
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  name: {
    color: "#FFFFFF",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.44,
  },
  role: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
});
