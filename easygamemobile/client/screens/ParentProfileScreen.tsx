import React from "react";
import { Linking, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import {
  ActionButton,
  GlassRow,
  ParentPrimaryScreenLayout,
  SignatureText,
} from "@/components/signature";
import { useAuthContext } from "@/contexts/AuthContext";
import { useParentContext } from "@/contexts/ParentContext";
import { SUPPORT_MAILTO_URL } from "@/constants/external-links";
import type { ParentProfileStackParamList } from "@/navigation/ParentProfileStackNavigator";

type Navigation = NativeStackNavigationProp<
  ParentProfileStackParamList,
  "ParentProfile"
>;

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";

/**
 * Il Profilo Parent del prototipo v3 (`isProfile`, ruolo Genitore): avatar
 * con le iniziali, nome 22/800 e "Genitore · Club" nel cielo; la riga
 * evidenziata "Accessi e club" (torna all'Account Hub); le righe I miei
 * figli, Notifiche, Privacy e consensi, Assistenza; "Esci" distruttivo.
 * Identita account, multi-figlio, cambio contesto e logout: le stesse
 * funzioni di WP4, sulla composizione del design.
 */
export default function ParentProfileScreen() {
  const navigation = useNavigation<Navigation>();
  const { user, clearContext, logout } = useAuthContext();
  const { children, selectedChildId, selectedChild, switching, selectChild } =
    useParentContext();

  const name = user?.name || "Il tuo account";
  const tabs = navigation.getParent() as
    | { navigate: (...args: unknown[]) => void }
    | undefined;
  const openSupport = async () => {
    if (await Linking.canOpenURL(SUPPORT_MAILTO_URL)) {
      await Linking.openURL(SUPPORT_MAILTO_URL);
    }
  };

  return (
    <ParentPrimaryScreenLayout
      title="Profilo"
      eyebrow="Account EasyGame · Genitore"
      linkedChildren={children}
      selectedChildId={selectedChildId}
      childrenSwitching={switching}
      onSelectChild={selectChild}
      skyHeight={300}
      content={
        <>
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
                {`Genitore · ${selectedChild?.clubName || "Club"}`}
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
            icon="people-outline"
            iconColor="#2563EB"
            title="I miei figli"
            meta={
              children.length === 1
                ? children[0]?.name
                : `${children.length} figli collegati`
            }
            onPress={() => navigation.navigate("ParentChildren")}
          />
          <GlassRow
            icon="notifications-outline"
            iconColor="#3533CD"
            title="Notifiche"
            onPress={() =>
              tabs?.navigate("ParentServicesTab", {
                screen: "ParentBoard",
                params: { initialSection: "notifications" },
              })
            }
          />
          <GlassRow
            icon="shield-checkmark-outline"
            iconColor="#10B981"
            title="Privacy e consensi"
            onPress={() =>
              tabs?.navigate("ParentServicesTab", { screen: "ParentConsents" })
            }
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
        </>
      }
    />
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
