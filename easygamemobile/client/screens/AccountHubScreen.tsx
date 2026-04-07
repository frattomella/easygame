import React, { useEffect, useMemo, useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { getClubInitials, getRoleLabel } from "@/lib/mobile-ui";
import { Club, Access } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { BorderRadius, Colors, Spacing } from "@/constants/theme";

export default function AccountHubScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user, logout, refresh, setContext, updateUserProfile } =
    useAuthContext();

  const [ownedClubs, setOwnedClubs] = useState<Club[]>([]);
  const [accesses, setAccesses] = useState<Access[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showCreateClubModal, setShowCreateClubModal] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
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
    const url = "mailto:support@easygame.it";
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
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
      setShowProfileModal(false);
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
      setShowCreateClubModal(false);
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
      setShowTokenModal(false);
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
    <Card
      key={club.id}
      style={styles.accountCard}
      onPress={() => handleSelectOwnedClub(club)}
    >
      <View style={styles.accountCardHeader}>
        <Avatar name={club.name} size={52} />
        <View style={styles.accountCardInfo}>
          <ThemedText type="body" style={styles.accountCardTitle}>
            {club.name}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {club.city || "Citta"} {club.province ? `· ${club.province}` : ""}
          </ThemedText>
        </View>
        <Badge label="Proprietario" variant="primary" small />
      </View>
      <View style={styles.metaRow}>
        <Badge
          label={
            club.categoryItems?.length
              ? `${club.categoryItems.length} categorie`
              : "Nuovo club"
          }
          small
        />
        <Badge label={slotLabel} variant="default" small />
      </View>
    </Card>
  );

  const renderAccessCard = (access: Access) => (
    <Card
      key={access.id}
      style={styles.accountCard}
      onPress={() => handleSelectAccess(access)}
    >
      <View style={styles.accountCardHeader}>
        <View
          style={[
            styles.logoBadge,
            {
              backgroundColor:
                access.role === "trainer" ? "#EEF2FF" : "#ECFDF5",
            },
          ]}
        >
          <ThemedText
            style={{
              color: access.role === "trainer" ? "#4338CA" : "#047857",
              fontWeight: "800",
            }}
          >
            {getClubInitials(access.clubName)}
          </ThemedText>
        </View>
        <View style={styles.accountCardInfo}>
          <ThemedText type="body" style={styles.accountCardTitle}>
            {access.clubName}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {access.summary || "Accesso collegato al tuo account"}
          </ThemedText>
        </View>
        <Badge
          label={getRoleLabel(access.role)}
          variant={access.status === "active" ? "success" : "warning"}
          small
        />
      </View>
      {access.assignedCategories?.length ? (
        <View style={styles.metaRow}>
          {access.assignedCategories.slice(0, 3).map((category) => (
            <Badge key={category} label={category} small />
          ))}
        </View>
      ) : null}
    </Card>
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.lg,
          paddingBottom: insets.bottom + Spacing["4xl"],
          paddingHorizontal: Spacing.lg,
        }}
      >
        <Animated.View entering={FadeInDown.duration(350)}>
          <View style={styles.heroShell}>
            <View
              style={[
                styles.heroCard,
                { backgroundColor: Colors.light.primary },
              ]}
            >
              <View style={styles.heroTopRow}>
                <View style={styles.brandRow}>
                  <View style={styles.brandBadge}>
                    <Ionicons
                      name="sparkles"
                      size={22}
                      color={Colors.light.primary}
                    />
                  </View>
                  <View>
                    <ThemedText type="small" style={styles.heroEyebrow}>
                      Home Account
                    </ThemedText>
                    <ThemedText type="h3" style={styles.heroTitle}>
                      Bentornato, {accountName}
                    </ThemedText>
                  </View>
                </View>
                <Pressable
                  onPress={() => void logout()}
                  style={styles.iconButton}
                >
                  <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
                </Pressable>
              </View>

              <ThemedText type="small" style={styles.heroSubtitle}>
                Gestisci profilo, club di proprieta e accessi ricevuti prima di
                entrare in una dashboard.
              </ThemedText>

              <View style={styles.heroActions}>
                <Button
                  variant="outline"
                  size="sm"
                  style={styles.heroGhostButton}
                  onPress={() => setShowProfileModal(true)}
                >
                  Profilo
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  style={styles.heroWhiteButton}
                  onPress={handleOpenSupport}
                >
                  Assistenza
                </Button>
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(80).duration(350)}
          style={styles.section}
        >
          <View style={styles.sectionHeader}>
            <View>
              <ThemedText type="h4">Club di proprieta</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                I club creati dal tuo account e pronti da aprire.
              </ThemedText>
            </View>
            <Button size="sm" onPress={() => setShowCreateClubModal(true)}>
              Nuovo club
            </Button>
          </View>
          {loading ? null : ownedClubs.length > 0 ? (
            ownedClubs.map(renderClubCard)
          ) : (
            <Card style={styles.emptyCard}>
              <ThemedText type="body" style={styles.emptyTitle}>
                Nessun club creato
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Crea il tuo primo club per iniziare a lavorare anche lato
                mobile.
              </ThemedText>
            </Card>
          )}
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(140).duration(350)}
          style={styles.section}
        >
          <View style={styles.sectionHeader}>
            <View>
              <ThemedText type="h4">Accessi assegnati</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Token ricevuti dai club e ruoli collegati al tuo account.
              </ThemedText>
            </View>
            <Button
              size="sm"
              variant="outline"
              onPress={() => setShowTokenModal(true)}
            >
              Inserisci token
            </Button>
          </View>
          {loading ? null : accesses.length > 0 ? (
            accesses.map(renderAccessCard)
          ) : (
            <Card style={styles.emptyCard}>
              <ThemedText type="body" style={styles.emptyTitle}>
                Nessun accesso collegato
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Quando un club ti condivide un token, lo inserisci qui e
                aggiungi il ruolo al tuo account.
              </ThemedText>
            </Card>
          )}
        </Animated.View>
      </ScrollView>

      <Modal
        visible={showProfileModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProfileModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowProfileModal(false)}
        >
          <KeyboardAwareScrollViewCompat
            contentContainerStyle={styles.modalScrollWrap}
          >
            <Pressable
              style={[
                styles.modalCard,
                { backgroundColor: theme.backgroundDefault },
              ]}
              onPress={(event) => event.stopPropagation()}
            >
              <ThemedText type="h4" style={styles.modalTitle}>
                Profilo account
              </ThemedText>
              <Input
                label="Nome completo"
                value={profileForm.name}
                onChangeText={(value) => {
                  setProfileForm((current) => ({ ...current, name: value }));
                  setProfileError("");
                }}
              />
              <Input
                label="Email"
                value={profileForm.email}
                keyboardType="email-address"
                autoCapitalize="none"
                onChangeText={(value) => {
                  setProfileForm((current) => ({ ...current, email: value }));
                  setProfileError("");
                }}
              />
              <Input
                label="Telefono"
                value={profileForm.phone}
                keyboardType="phone-pad"
                onChangeText={(value) =>
                  setProfileForm((current) => ({ ...current, phone: value }))
                }
              />
              <Input
                label="Citta"
                value={profileForm.city}
                onChangeText={(value) =>
                  setProfileForm((current) => ({ ...current, city: value }))
                }
                error={profileError || undefined}
              />
              <View style={styles.modalButtons}>
                <Button
                  variant="ghost"
                  onPress={() => setShowProfileModal(false)}
                >
                  Annulla
                </Button>
                <Button onPress={handleSaveProfile} loading={savingProfile}>
                  Salva
                </Button>
              </View>
            </Pressable>
          </KeyboardAwareScrollViewCompat>
        </Pressable>
      </Modal>

      <Modal
        visible={showCreateClubModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateClubModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowCreateClubModal(false)}
        >
          <KeyboardAwareScrollViewCompat
            contentContainerStyle={styles.modalScrollWrap}
          >
            <Pressable
              style={[
                styles.modalCard,
                { backgroundColor: theme.backgroundDefault },
              ]}
              onPress={(event) => event.stopPropagation()}
            >
              <ThemedText type="h4" style={styles.modalTitle}>
                Nuovo club
              </ThemedText>
              <Input
                label="Nome club"
                value={clubForm.name}
                onChangeText={(value) => {
                  setClubForm((current) => ({ ...current, name: value }));
                  setClubError("");
                }}
              />
              <Input
                label="Citta"
                value={clubForm.city}
                onChangeText={(value) =>
                  setClubForm((current) => ({ ...current, city: value }))
                }
              />
              <Input
                label="Provincia"
                value={clubForm.province}
                onChangeText={(value) =>
                  setClubForm((current) => ({ ...current, province: value }))
                }
              />
              <Input
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
              <Input
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
              <Input
                label="Logo URL (opzionale)"
                value={clubForm.logoUrl}
                autoCapitalize="none"
                onChangeText={(value) =>
                  setClubForm((current) => ({ ...current, logoUrl: value }))
                }
                error={clubError || undefined}
              />
              <View style={styles.modalButtons}>
                <Button
                  variant="ghost"
                  onPress={() => setShowCreateClubModal(false)}
                >
                  Annulla
                </Button>
                <Button onPress={handleCreateClub} loading={creatingClub}>
                  Crea club
                </Button>
              </View>
            </Pressable>
          </KeyboardAwareScrollViewCompat>
        </Pressable>
      </Modal>

      <Modal
        visible={showTokenModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTokenModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowTokenModal(false)}
        >
          <KeyboardAwareScrollViewCompat
            contentContainerStyle={styles.modalScrollWrap}
          >
            <Pressable
              style={[
                styles.modalCard,
                { backgroundColor: theme.backgroundDefault },
              ]}
              onPress={(event) => event.stopPropagation()}
            >
              <ThemedText type="h4" style={styles.modalTitle}>
                Collega accesso
              </ThemedText>
              <Input
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
              <View style={styles.modalButtons}>
                <Button
                  variant="ghost"
                  onPress={() => setShowTokenModal(false)}
                >
                  Annulla
                </Button>
                <Button onPress={handleRedeemToken} loading={redeemingToken}>
                  Aggiungi
                </Button>
              </View>
            </Pressable>
          </KeyboardAwareScrollViewCompat>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  heroShell: { marginBottom: Spacing.lg },
  heroCard: {
    borderRadius: BorderRadius["2xl"],
    padding: Spacing["2xl"],
    overflow: "hidden",
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  brandRow: { flexDirection: "row", gap: Spacing.md, flex: 1 },
  brandBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  heroEyebrow: {
    color: "rgba(255,255,255,0.78)",
    marginBottom: 2,
    fontWeight: "700",
  },
  heroTitle: { color: "#FFFFFF" },
  heroSubtitle: {
    color: "rgba(255,255,255,0.82)",
    marginTop: Spacing.md,
    lineHeight: 20,
  },
  heroActions: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.lg },
  heroGhostButton: {
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  heroWhiteButton: { backgroundColor: "#FFFFFF" },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: Spacing.md,
  },
  section: { marginTop: Spacing.lg },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  accountCard: { marginBottom: Spacing.md },
  accountCardHeader: { flexDirection: "row", alignItems: "center" },
  accountCardInfo: { flex: 1, marginLeft: Spacing.md },
  accountCardTitle: { fontWeight: "700", marginBottom: 2 },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  logoBadge: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCard: { gap: Spacing.sm },
  emptyTitle: { fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)" },
  modalScrollWrap: {
    flexGrow: 1,
    justifyContent: "center",
    padding: Spacing.lg,
  },
  modalCard: { borderRadius: BorderRadius["2xl"], padding: Spacing["2xl"] },
  modalTitle: { marginBottom: Spacing.lg },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
  },
});
