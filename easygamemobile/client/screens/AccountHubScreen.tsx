import React, { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";

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
  GhostButton,
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
 * Composizione: design `IA e Home` §5b / prototipo `isAccounts` — riga
 * marchio con passo "Accessi", nome della persona in eyebrow, "Scegli come
 * entrare", una scheda per accesso (crest, club, riga, pill di ruolo,
 * anello), "Esci" in contorno bianco in fondo. Le azioni di servizio
 * (profilo, nuovo club, token, assistenza) restano come rimandi testuali
 * sotto l'elenco: funzioni reali, non chrome.
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
  const [activatingId, setActivatingId] = useState<string | null>(null);
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
      active={activatingId === access.id}
      onPress={() => {
        setActivatingId(access.id);
        void handleSelectAccess(access).finally(() => setActivatingId(null));
      }}
    />
  );

  const sheetActions = (
    onCancel: () => void,
    label: string,
    onConfirm: () => void,
    loading: boolean,
  ) => (
    <>
      <ActionButton
        variant="secondary"
        onPress={onCancel}
        style={styles.cancel}
      >
        Annulla
      </ActionButton>
      <ActionButton
        trailingIcon="arrow-forward"
        loading={loading}
        onPress={onConfirm}
        style={styles.confirm}
      >
        {label}
      </ActionButton>
    </>
  );

  return (
    <BrandStateLayout step="Accessi" centered={false}>
      <View style={styles.head}>
        <SignatureText style={styles.eyebrow} numberOfLines={1}>
          {accountName}
        </SignatureText>
        <SignatureText style={styles.title}>Scegli come entrare</SignatureText>
        <SignatureText style={styles.body}>
          {totalAccessCount > 0
            ? `${
                totalAccessCount === 1
                  ? "Un accesso collegato"
                  : `${totalAccessCount} accessi collegati`
              } a questa email.`
            : "Nessun accesso collegato a questa email: crea un club o inserisci il token che il club ti ha dato."}
        </SignatureText>
      </View>

      <View style={styles.list}>
        {loading ? (
          <StateMessage kind="loading" tone="dark" />
        ) : (
          <>
            {accesses.map(renderAccessCard)}
            {ownedClubs.map(renderClubCard)}
            {accesses.length === 0 && ownedClubs.length === 0 ? (
              <StateMessage
                kind="empty"
                tone="dark"
                title="Nessun accesso"
                message="Quando un club ti condivide un token, lo inserisci qui e aggiungi il ruolo al tuo account."
              />
            ) : null}
          </>
        )}
        {clubError && !loading ? (
          <SignatureText style={styles.loadErrorText}>
            {clubError}
          </SignatureText>
        ) : null}
      </View>

      <View style={styles.linksRow}>
        <TextLink label="Profilo" onPress={() => setShowProfileSheet(true)} />
        <TextLink
          label="Nuovo club"
          onPress={() => setShowCreateClubSheet(true)}
        />
        <TextLink
          label="Collega un token"
          onPress={() => setShowTokenSheet(true)}
        />
        <TextLink label="Assistenza" onPress={() => void handleOpenSupport()} />
      </View>

      <View style={{ flex: 1 }} />
      <GhostButton
        label="Esci"
        onPress={() => void logout()}
        style={styles.logout}
      />

      <BottomSheet
        visible={showProfileSheet}
        onClose={() => setShowProfileSheet(false)}
        eyebrow="Account"
        title="Profilo account"
        actions={sheetActions(
          () => setShowProfileSheet(false),
          "Salva",
          () => void handleSaveProfile(),
          savingProfile,
        )}
      >
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
        </View>
      </BottomSheet>

      <BottomSheet
        visible={showCreateClubSheet}
        onClose={() => setShowCreateClubSheet(false)}
        eyebrow="Club di proprieta"
        title="Nuovo club"
        actions={sheetActions(
          () => setShowCreateClubSheet(false),
          "Crea club",
          () => void handleCreateClub(),
          creatingClub,
        )}
      >
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
        </View>
      </BottomSheet>

      <BottomSheet
        visible={showTokenSheet}
        onClose={() => setShowTokenSheet(false)}
        eyebrow="Accessi assegnati"
        title="Collega accesso"
        actions={sheetActions(
          () => setShowTokenSheet(false),
          "Aggiungi",
          () => void handleRedeemToken(),
          redeemingToken,
        )}
      >
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
        </View>
      </BottomSheet>
    </BrandStateLayout>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button">
      <SignatureText style={styles.link}>{label}</SignatureText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: {
    paddingTop: 12,
  },
  eyebrow: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 1.32,
    textTransform: "uppercase",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "800",
    letterSpacing: -0.56,
    marginTop: 3,
  },
  body: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "500",
    marginTop: 6,
  },
  list: {
    gap: 10,
    marginTop: 8,
  },
  loadErrorText: {
    color: "#FCA5A5",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  linksRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 18,
    marginTop: 14,
  },
  link: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  logout: {
    marginTop: 24,
  },
  sheetFields: {
    gap: Spacing.md,
  },
  cancel: {
    width: 100,
  },
  confirm: {
    flex: 1,
  },
});
