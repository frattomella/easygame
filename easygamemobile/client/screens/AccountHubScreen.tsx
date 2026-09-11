import React, { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useAuthContext } from "@/contexts/AuthContext";
import { getRoleLabel } from "@/lib/mobile-ui";
import { normalizeMobileAccessRole } from "@/lib/mobile-role-gate";
import { Club, Access } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { Spacing } from "@/constants/theme";
import { SUPPORT_MAILTO_URL } from "@/constants/external-links";
import {
  AccountAccessCard,
  ActionButton,
  BrandStateLayout,
  BottomSheet,
  SignatureInput,
  SignatureText,
  StateMessage,
} from "@/components/signature";

/**
 * Il punto dove chi ha piu di un accesso sceglie con quale entrare — o crea
 * il primo club, o collega un token. Stessi dati e stessa logica di sempre
 * (`mobileBackendStorage.*`, `setContext`/`clearContext`): questo passo
 * cambia solo la veste.
 *
 * v3.0 (`migration-v3.md` passo 7 — "Account Hub" e nel perimetro esplicito
 * dell'eccezione, ADR-0168 §4c): su `BrandStateLayout` come le altre
 * schermate auth/sistema — "The base band ... is gone from login,
 * registration, recovery and the account hub" (design-source, artboard 4c).
 * I tre moduli che prima erano `Modal` HTML-style diventano `BottomSheet`
 * (stesso componente delle altre schermate con moduli, passo 6): scrim-tap,
 * drag-to-dismiss, gesto indietro — nessuno screen scrive piu il proprio
 * modale. Restano "Annulla" + azione primaria perche sono moduli con piu
 * campi, non fogli di selezione (la regola "niente Annulla" del passo 6
 * riguarda i fogli-opzione, dove la scelta stessa chiude il foglio).
 *
 * Il blocco di servizio (nome · versione) che il mockup mostra su questo
 * artboard **non** compare qui: `BrandStateLayout`'s `footer` e riservato
 * alle schermate di manutenzione/offline/errore/supporto/stato-servizio
 * (`migration-v3.md` passo 7) — Account Hub non lo e. "Esci" resta
 * un'azione in testata, non nel blocco di servizio.
 */
export default function AccountHubScreen() {
  const { user, logout, refresh, setContext, updateUserProfile } =
    useAuthContext();

  const [ownedClubs, setOwnedClubs] = useState<Club[]>([]);
  const [accesses, setAccesses] = useState<Access[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [showCreateClubSheet, setShowCreateClubSheet] = useState(false);
  const [showTokenSheet, setShowTokenSheet] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [clubError, setClubError] = useState("");
  const [tokenError, setTokenError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [creatingClub, setCreatingClub] = useState(false);
  const [redeemingToken, setRedeemingToken] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    city: user?.city || "",
  });
  const [clubForm, setClubForm] = useState({
    name: "",
    city: "",
    province: "",
    contactEmail: user?.email || "",
    contactPhone: user?.phone || "",
    logoUrl: "",
  });
  const [token, setToken] = useState("");

  const accountName = user?.name || "Utente EasyGame";
  const ownedCount = ownedClubs.length;
  const slotLabel = useMemo(() => `${ownedCount}/5 club`, [ownedCount]);
  const totalAccessCount = ownedClubs.length + accesses.length;

  useEffect(() => {
    setProfileForm({
      name: user?.name || "",
      email: user?.email || "",
      phone: user?.phone || "",
      city: user?.city || "",
    });
  }, [user?.city, user?.email, user?.name, user?.phone]);

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [clubs, nextAccesses] = await Promise.all([
        mobileBackendStorage.getOwnedClubs(),
        mobileBackendStorage.getAccesses(),
      ]);
      setOwnedClubs(clubs);
      setAccesses(nextAccesses);
    } catch (error) {
      setClubError(
        error instanceof Error
          ? error.message
          : "Errore nel caricamento dei club",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSupport = async () => {
    if (await Linking.canOpenURL(SUPPORT_MAILTO_URL)) {
      await Linking.openURL(SUPPORT_MAILTO_URL);
    }
  };

  const handleSelectOwnedClub = async (club: Club) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setContext(club.id, "owner", null, "owned");
  };

  const handleSelectAccess = async (access: Access) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setContext(access.clubId, access.role, access.id, "assigned");
  };

  const handleSaveProfile = async () => {
    if (!profileForm.name.trim() || !profileForm.email.trim()) {
      setProfileError("Compila almeno nome ed email.");
      return;
    }

    setSavingProfile(true);
    setProfileError("");
    try {
      await updateUserProfile(profileForm);
      await refresh();
      setShowProfileSheet(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setProfileError(
        error instanceof Error
          ? error.message
          : "Errore nel salvataggio del profilo",
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCreateClub = async () => {
    if (
      !clubForm.name.trim() ||
      !clubForm.city.trim() ||
      !clubForm.province.trim()
    ) {
      setClubError("Compila nome club, citta e provincia.");
      return;
    }

    setCreatingClub(true);
    setClubError("");
    try {
      await mobileBackendStorage.createOwnedClub(clubForm);
      await loadData();
      setShowCreateClubSheet(false);
      setClubForm({
        name: "",
        city: "",
        province: "",
        contactEmail: user?.email || "",
        contactPhone: user?.phone || "",
        logoUrl: "",
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setClubError(
        error instanceof Error
          ? error.message
          : "Errore nella creazione del club",
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setCreatingClub(false);
    }
  };

  const handleRedeemToken = async () => {
    if (!token.trim()) {
      setTokenError("Inserisci un token valido.");
      return;
    }

    setRedeemingToken(true);
    try {
      const access = await mobileBackendStorage.addAccess(token);
      if (!access) {
        setTokenError("Token non valido o gia utilizzato.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      await loadData();
      setShowTokenSheet(false);
      setToken("");
      setTokenError("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setTokenError(
        error instanceof Error
          ? error.message
          : "Errore nel collegamento del token",
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setRedeemingToken(false);
    }
  };

  const renderClubCard = (club: Club) => (
    <AccountAccessCard
      key={club.id}
      clubName={club.name}
      clubAvatarUrl={club.avatar}
      roleLabel="Proprietario"
      detailLine={
        club.categoryItems?.length
          ? `${club.categoryItems.length} categorie · ${slotLabel}`
          : `Nuovo club · ${slotLabel}`
      }
      supported={false}
      onPress={() => handleSelectOwnedClub(club)}
    />
  );

  const renderAccessCard = (access: Access) => (
    <AccountAccessCard
      key={access.id}
      clubName={access.clubName}
      clubAvatarUrl={access.clubAvatar}
      roleLabel={getRoleLabel(access.role)}
      detailLine={access.summary || "Accesso collegato al tuo account"}
      supported={Boolean(normalizeMobileAccessRole(access.role))}
      onPress={() => handleSelectAccess(access)}
    />
  );

  return (
    <BrandStateLayout>
      <Animated.View entering={FadeInDown.delay(80).duration(500)}>
        <View style={styles.headerTopRow}>
          <SignatureText variant="eyebrow" tone="onDarkMuted">
            Accessi
          </SignatureText>
          <Pressable
            onPress={() => void logout()}
            style={styles.logoutButton}
            accessibilityRole="button"
            accessibilityLabel="Esci"
          >
            <Ionicons name="log-out-outline" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
        <SignatureText variant="display" tone="onDark" style={styles.title}>
          Bentornato, {accountName}
        </SignatureText>
        <SignatureText variant="body" tone="onDarkMuted">
          {totalAccessCount > 0
            ? `${totalAccessCount} access${totalAccessCount === 1 ? "o collegato" : "i collegati"} a questa email.`
            : "Gestisci profilo, club di proprieta e accessi ricevuti prima di entrare in una dashboard."}
        </SignatureText>
        <View style={styles.headerActions}>
          <ActionButton
            variant="secondary"
            onSky
            size="sm"
            onPress={() => setShowProfileSheet(true)}
          >
            Profilo
          </ActionButton>
          <ActionButton
            variant="secondary"
            onSky
            size="sm"
            onPress={() => void handleOpenSupport()}
          >
            Assistenza
          </ActionButton>
        </View>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(140).duration(500)}
        style={styles.section}
      >
        <View style={styles.sectionHeader}>
          <SignatureText variant="h4" tone="onDark">
            Club di proprieta
          </SignatureText>
          <ActionButton
            variant="secondary"
            onSky
            size="sm"
            onPress={() => setShowCreateClubSheet(true)}
          >
            Nuovo club
          </ActionButton>
        </View>
        {loading ? null : ownedClubs.length > 0 ? (
          ownedClubs.map(renderClubCard)
        ) : (
          <StateMessage
            kind="empty"
            tone="dark"
            title="Nessun club creato"
            message="Crea il tuo primo club per iniziare a lavorare anche lato mobile."
          />
        )}
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(200).duration(500)}
        style={styles.section}
      >
        <View style={styles.sectionHeader}>
          <SignatureText variant="h4" tone="onDark">
            Accessi assegnati
          </SignatureText>
          <ActionButton
            variant="secondary"
            onSky
            size="sm"
            onPress={() => setShowTokenSheet(true)}
          >
            Inserisci token
          </ActionButton>
        </View>
        {loading ? null : accesses.length > 0 ? (
          accesses.map(renderAccessCard)
        ) : (
          <StateMessage
            kind="empty"
            tone="dark"
            title="Nessun accesso collegato"
            message="Quando un club ti condivide un token, lo inserisci qui e aggiungi il ruolo al tuo account."
          />
        )}
        {clubError && !loading ? (
          <SignatureText variant="small" style={styles.loadErrorText}>
            {clubError}
          </SignatureText>
        ) : null}
      </Animated.View>

      <BottomSheet
        visible={showProfileSheet}
        onClose={() => setShowProfileSheet(false)}
        accessibilityLabel="Profilo account"
      >
        <SignatureText
          variant="eyebrow"
          tone="faint"
          style={styles.sheetEyebrow}
        >
          Account
        </SignatureText>
        <SignatureText variant="h3" tone="ink" style={styles.sheetTitle}>
          Profilo account
        </SignatureText>
        <View style={styles.sheetFields}>
          <SignatureInput
            label="Nome completo"
            value={profileForm.name}
            onChangeText={(value) => {
              setProfileForm((current) => ({ ...current, name: value }));
              setProfileError("");
            }}
          />
          <SignatureInput
            label="Email"
            value={profileForm.email}
            keyboardType="email-address"
            autoCapitalize="none"
            onChangeText={(value) => {
              setProfileForm((current) => ({ ...current, email: value }));
              setProfileError("");
            }}
          />
          <SignatureInput
            label="Telefono"
            value={profileForm.phone}
            keyboardType="phone-pad"
            onChangeText={(value) =>
              setProfileForm((current) => ({ ...current, phone: value }))
            }
          />
          <SignatureInput
            label="Citta"
            value={profileForm.city}
            onChangeText={(value) =>
              setProfileForm((current) => ({ ...current, city: value }))
            }
            error={profileError || undefined}
          />
          <View style={styles.sheetActions}>
            <ActionButton
              loading={savingProfile}
              onPress={() => void handleSaveProfile()}
            >
              Salva
            </ActionButton>
            <ActionButton
              variant="ghost"
              onPress={() => setShowProfileSheet(false)}
            >
              Annulla
            </ActionButton>
          </View>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={showCreateClubSheet}
        onClose={() => setShowCreateClubSheet(false)}
        accessibilityLabel="Nuovo club"
      >
        <SignatureText
          variant="eyebrow"
          tone="faint"
          style={styles.sheetEyebrow}
        >
          Club di proprieta
        </SignatureText>
        <SignatureText variant="h3" tone="ink" style={styles.sheetTitle}>
          Nuovo club
        </SignatureText>
        <View style={styles.sheetFields}>
          <SignatureInput
            label="Nome club"
            value={clubForm.name}
            onChangeText={(value) => {
              setClubForm((current) => ({ ...current, name: value }));
              setClubError("");
            }}
          />
          <SignatureInput
            label="Citta"
            value={clubForm.city}
            onChangeText={(value) =>
              setClubForm((current) => ({ ...current, city: value }))
            }
          />
          <SignatureInput
            label="Provincia"
            value={clubForm.province}
            onChangeText={(value) =>
              setClubForm((current) => ({ ...current, province: value }))
            }
          />
          <SignatureInput
            label="Email contatto"
            value={clubForm.contactEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            onChangeText={(value) =>
              setClubForm((current) => ({
                ...current,
                contactEmail: value,
              }))
            }
          />
          <SignatureInput
            label="Telefono contatto"
            value={clubForm.contactPhone}
            keyboardType="phone-pad"
            onChangeText={(value) =>
              setClubForm((current) => ({
                ...current,
                contactPhone: value,
              }))
            }
          />
          <SignatureInput
            label="Logo URL (opzionale)"
            value={clubForm.logoUrl}
            autoCapitalize="none"
            onChangeText={(value) =>
              setClubForm((current) => ({ ...current, logoUrl: value }))
            }
            error={clubError || undefined}
          />
          <View style={styles.sheetActions}>
            <ActionButton
              loading={creatingClub}
              onPress={() => void handleCreateClub()}
            >
              Crea club
            </ActionButton>
            <ActionButton
              variant="ghost"
              onPress={() => setShowCreateClubSheet(false)}
            >
              Annulla
            </ActionButton>
          </View>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={showTokenSheet}
        onClose={() => setShowTokenSheet(false)}
        accessibilityLabel="Collega accesso"
      >
        <SignatureText
          variant="eyebrow"
          tone="faint"
          style={styles.sheetEyebrow}
        >
          Accessi assegnati
        </SignatureText>
        <SignatureText variant="h3" tone="ink" style={styles.sheetTitle}>
          Collega accesso
        </SignatureText>
        <View style={styles.sheetFields}>
          <SignatureInput
            label="Token club"
            value={token}
            autoCapitalize="characters"
            onChangeText={(value) => {
              setToken(value.toUpperCase().replace(/\s+/g, ""));
              setTokenError("");
            }}
            placeholder="TRN9CFGBNKED"
            error={tokenError || undefined}
          />
          <View style={styles.sheetActions}>
            <ActionButton
              loading={redeemingToken}
              onPress={() => void handleRedeemToken()}
            >
              Aggiungi
            </ActionButton>
            <ActionButton
              variant="ghost"
              onPress={() => setShowTokenSheet(false)}
            >
              Annulla
            </ActionButton>
          </View>
        </View>
      </BottomSheet>
    </BrandStateLayout>
  );
}

const styles = StyleSheet.create({
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logoutButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginTop: 4,
    marginBottom: 6,
  },
  headerActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  section: {
    marginTop: Spacing["2xl"],
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  loadErrorText: {
    color: "#FCA5A5",
    marginTop: Spacing.sm,
  },
  sheetEyebrow: {
    marginBottom: 4,
  },
  sheetTitle: {
    marginBottom: Spacing.md,
  },
  sheetFields: {
    gap: Spacing.md,
  },
  sheetActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
});
