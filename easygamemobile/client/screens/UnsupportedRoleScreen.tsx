import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useAuthContext } from "@/contexts/AuthContext";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { getRoleLabel } from "@/lib/mobile-ui";
import { normalizeMobileAccessRole } from "@/lib/mobile-role-gate";
import { EGCorner } from "@/constants/theme";
import {
  BrandStateLayout,
  GhostButton,
  SignatureText,
} from "@/components/signature";
import type { Access } from "@/services/api";

/**
 * Il gate per i ruoli non ancora supportati dalla V1 mobile (solo Trainer e
 * Parent). Owner, Club Manager, Collaborator, Staff non-Trainer, Athlete e
 * ruoli di club personalizzati diversi da Trainer arrivano tutti qui,
 * intercettati centralmente da `RootStackNavigator` — non da questa
 * schermata, che si limita a mostrare l'avviso e le due uscite possibili.
 *
 * Composizione: design `IA e Home` §5b (secondo artboard, "Ruolo non
 * supportato"): pill bianca "Accesso non disponibile", titolo 30/36, corpo,
 * il riquadro "Da qui puoi già" con gli accessi reali che funzionano su
 * mobile, poi "Cambia accesso" (bianco su navy, 14.5:1) ed "Esci" in
 * contorno — "a blocking state that lists your working options stops
 * being an error page".
 */
export default function UnsupportedRoleScreen() {
  const { clearContext, logout, currentRole } = useAuthContext();
  const [usable, setUsable] = useState<Access[]>([]);

  useEffect(() => {
    let cancelled = false;
    void mobileBackendStorage
      .getAccesses()
      .then((accesses) => {
        if (cancelled) return;
        setUsable(
          accesses.filter((access) =>
            Boolean(normalizeMobileAccessRole(access.role)),
          ),
        );
      })
      .catch(() => {
        /* la lista e un aiuto, non un requisito: senza rete si mostrano solo le due uscite */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const roleLabel = getRoleLabel(currentRole);

  return (
    <BrandStateLayout>
      <View style={styles.pill}>
        <View style={styles.pillDot} />
        <SignatureText style={styles.pillLabel}>
          Accesso non disponibile
        </SignatureText>
      </View>
      <SignatureText style={styles.title}>
        {`Il ruolo ${roleLabel} non è ancora su EasyGame per mobile`}
      </SignatureText>
      <SignatureText style={styles.body}>
        Le funzioni di questo ruolo restano disponibili dal gestionale web del
        club.
      </SignatureText>

      {usable.length > 0 ? (
        <View style={styles.box}>
          <SignatureText style={styles.boxEyebrow}>
            Da qui puoi già
          </SignatureText>
          {usable.slice(0, 4).map((access) => {
            const kind = normalizeMobileAccessRole(access.role);
            return (
              <View key={access.id} style={styles.boxRow}>
                <Ionicons
                  name={kind === "parent" ? "people" : "fitness"}
                  size={20}
                  color="#FFFFFF"
                />
                <SignatureText style={styles.boxRowLabel} numberOfLines={1}>
                  {`Entrare come ${getRoleLabel(access.role).toLowerCase()} · ${access.clubName}`}
                </SignatureText>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={() => void clearContext()}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.primary,
            pressed ? { transform: [{ scale: 0.97 }] } : null,
          ]}
        >
          <SignatureText style={styles.primaryLabel}>
            Cambia accesso
          </SignatureText>
          <View style={styles.primaryChip}>
            <Ionicons name="arrow-forward" size={16} color="#12265A" />
          </View>
        </Pressable>
        <GhostButton label="Esci" onPress={() => void logout()} />
      </View>
    </BrandStateLayout>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 24,
    paddingLeft: 9,
    paddingRight: 10,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    marginBottom: 2,
  },
  pillDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#2563EB",
  },
  pillLabel: {
    color: "#12265A",
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  body: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "500",
    maxWidth: 310,
  },
  box: {
    marginTop: 8,
    padding: 16,
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    ...EGCorner.card,
  },
  boxEyebrow: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  boxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  boxRowLabel: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600",
  },
  actions: {
    gap: 10,
    marginTop: 10,
  },
  primary: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    shadowColor: "#07122B",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 13,
    ...EGCorner.control,
  },
  primaryLabel: {
    color: "#12265A",
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "700",
  },
  primaryChip: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: "rgba(18,38,90,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
});
