import React, { useState } from "react";
import {
  RefreshControlProps,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";

import { Floodlight } from "@/components/signature/Floodlight";
import { AppBar } from "@/components/signature/AppBar";
import { BrandLine, BrandLineClub } from "@/components/signature/BrandLine";
import { useAuthContext } from "@/contexts/AuthContext";
import { resolveMobileRoleGate } from "@/lib/mobile-role-gate";
import { Spacing } from "@/constants/theme";

/** La barra di stato disegnata nel prototipo (9:41): le sue altezze del cielo la includono. */
export const PROTOTYPE_STATUS_BAR = 32;

interface SecondaryScreenLayoutProps {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  /** Default: `navigation.goBack()`. Passa `false` per non mostrare il pulsante indietro (tab primarie). */
  onBack?: (() => void) | false;
  scrollable?: boolean;
  /**
   * Altezza del cielo del `Floodlight`. Prototipo v3: 360 per le tab Trainer
   * con `SectionHero` (Home/Allenamenti/Gare), 300 per scheda atleta e
   * Profilo, 160 per le schermate secondarie a lista (default qui). Le
   * misure del prototipo includono i suoi 32px di barra di stato: qui si
   * tolgono e si aggiunge l'inset reale del dispositivo, e il cielo non scende mai sotto
   * il bordo del chrome (riga di marchio + AppBar), cosi il titolo bianco
   * non cavalca mai l'orizzonte.
   */
  skyHeight?: number;
  /**
   * Campanello nel trailing slot dell'AppBar. Il prototipo lo tiene su
   * **ogni** schermata (anche con la pillola "‹ Indietro"): se non e passato,
   * apre le notifiche del ruolo — `Notifications` nello stack corrente per
   * il Trainer, la Bacheca/Notifiche nella tab Servizi per il Parent. Passa
   * `null` per toglierlo (la schermata Notifiche stessa).
   */
  onNotifications?: (() => void) | null;
  notificationCount?: number;
  /** Passed straight through to the scrollable content's `refreshControl` — ignored when `scrollable` is `false`. */
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /**
   * Il club nel chip della riga di marchio. Default: il club attivo del
   * contesto (`useAuthContext().currentClub`). L'area Parent lo passa dal
   * figlio selezionato (design §2b: "club derived from the selected child").
   * `null` esplicito nasconde il chip.
   */
  club?: BrandLineClub | null;
  /** Default: `clearContext()` — il chip "riporta sempre ad Accessi e club". */
  onPressClub?: () => void;
  /** Spazio fra i figli diretti del contenuto: 12 per le schede, 8 per le liste a righe (prototipo). */
  contentGap?: number;
  /** Spazio sotto il contenuto: 118 dove c'e il Dock (tab primarie), 40 altrove. Default: dedotto da `onBack`. */
  dockClearance?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Contenuto fisso sopra lo scroll, dentro il cielo (es. il campo di ricerca di Atleti). */
  aboveContent?: React.ReactNode;
  /**
   * Blocco a tutta larghezza in testa allo scroll, prima del contenuto
   * marginato (il `SectionHero` delle tab Trainer): scorre col resto, ma
   * porta i propri margini (20px) e il contenuto sotto parte a 6px.
   */
  hero?: React.ReactNode;
}

/**
 * Il guscio di ogni schermata operativa (prototipo v3): `Floodlight` +
 * `BrandLine` (scritta EasyGame · chip del club) + `AppBar` (pillola
 * "‹ Indietro" sulla propria riga dove serve, eyebrow + titolo, campanello)
 * + contenuto scorrevole con i margini del prototipo (14px sopra, 16px ai
 * lati, 118px sotto quando c'e il Dock).
 */
export function SecondaryScreenLayout({
  title,
  eyebrow,
  children,
  onBack,
  scrollable = true,
  skyHeight = 160,
  onNotifications,
  notificationCount = 0,
  refreshControl,
  club,
  onPressClub,
  contentGap = Spacing.md,
  dockClearance,
  contentStyle,
  aboveContent,
  hero,
}: SecondaryScreenLayoutProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { currentClub, clearContext, currentRole } = useAuthContext();
  const isNotificationsScreen =
    route.name === "Notifications" || route.name === "ParentBoard";
  const resolvedOnNotifications =
    onNotifications === null || isNotificationsScreen
      ? undefined
      : onNotifications ||
        (() => {
          if (resolveMobileRoleGate(currentRole) === "parent") {
            (
              navigation as {
                navigate: (name: string, params?: object) => void;
              }
            ).navigate("ParentServicesTab", {
              screen: "ParentBoard",
              params: { initialSection: "notifications" },
              initial: false,
            });
            return;
          }
          (navigation as { navigate: (name: string) => void }).navigate(
            "Notifications",
          );
        });
  const [chromeHeight, setChromeHeight] = useState(0);
  const resolvedSkyHeight = Math.max(
    skyHeight - PROTOTYPE_STATUS_BAR + insets.top,
    chromeHeight + Spacing.sm,
  );

  const handleBack =
    onBack === false ? undefined : onBack || (() => navigation.goBack());
  const hasDock = dockClearance ?? onBack === false;
  const resolvedClub =
    club === undefined
      ? currentClub
        ? { name: currentClub.name, avatarUrl: currentClub.avatar }
        : null
      : club;

  return (
    <Floodlight skyHeight={resolvedSkyHeight}>
      <View
        style={{ paddingTop: insets.top + Spacing.sm }}
        onLayout={(event) =>
          setChromeHeight(Math.round(event.nativeEvent.layout.height))
        }
      >
        <BrandLine
          club={resolvedClub}
          onPressClub={onPressClub || (() => void clearContext())}
        />
        <AppBar
          title={title}
          eyebrow={eyebrow}
          onNotifications={resolvedOnNotifications}
          notificationCount={notificationCount}
          onBack={handleBack}
        />
        {aboveContent}
      </View>
      {scrollable ? (
        <ScrollView
          style={styles.content}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        >
          {hero}
          <View
            style={[
              styles.contentContainer,
              {
                gap: contentGap,
                paddingTop: hero ? 6 : 14,
                paddingBottom: insets.bottom + (hasDock ? 118 : 40),
              },
              contentStyle,
            ]}
          >
            {children}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.content}>
          {hero}
          <View
            style={[
              styles.contentContainer,
              styles.fixed,
              { gap: contentGap, paddingTop: hero ? 6 : 14 },
              contentStyle,
            ]}
          >
            {children}
          </View>
        </View>
      )}
    </Floodlight>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: Spacing.lg,
  },
  fixed: {
    flex: 1,
  },
});
