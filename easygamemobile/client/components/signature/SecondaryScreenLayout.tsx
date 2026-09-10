import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  RefreshControlProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";

import { Floodlight } from "@/components/signature/Floodlight";
import { AppBar } from "@/components/signature/AppBar";
import { IconChip } from "@/components/signature/IconChip";
import { Spacing } from "@/constants/theme";

interface SecondaryScreenLayoutProps {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  /** Default: `navigation.goBack()`. Passa `false` per non mostrare il pulsante indietro. */
  onBack?: (() => void) | false;
  scrollable?: boolean;
  /**
   * Altezza del cielo del `Floodlight`. Default 300 (schermate senza hero).
   * Le quattro tab Trainer primarie (WP10) aprono un `SectionHero` sotto
   * l'AppBar e chiedono 330–360px — vedi
   * `design-source/guidelines/trainer-migration.md`.
   */
  skyHeight?: number;
  /**
   * Notification bell in the AppBar's right slot, alongside — not instead
   * of — the back arrow (`AppBar` renders both). WP10: the four Trainer
   * primary tabs have no back arrow but keep the bell the old native
   * header gave them.
   */
  onNotifications?: () => void;
  notificationCount?: number;
  /** Passed straight through to the scrollable content's `refreshControl` — ignored when `scrollable` is `false`. */
  refreshControl?: React.ReactElement<RefreshControlProps>;
}

/**
 * Il guscio comune delle cinque sezioni nuove (Bacheca, Documenti,
 * Appuntamenti, Compensi, Squadre) e, da WP10, delle quattro tab Trainer
 * primarie: `Floodlight` + `AppBar` (con freccia indietro solo dove serve),
 * contenuto scorrevole sotto.
 */
export function SecondaryScreenLayout({
  title,
  eyebrow,
  children,
  onBack,
  scrollable = true,
  skyHeight = 300,
  onNotifications,
  notificationCount = 0,
  refreshControl,
}: SecondaryScreenLayoutProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const handleBack =
    onBack === false ? undefined : onBack || (() => navigation.goBack());

  const Content = scrollable ? ScrollView : View;

  return (
    <Floodlight skyHeight={skyHeight}>
      <View style={{ paddingTop: insets.top + Spacing.sm }}>
        <AppBar
          title={title}
          eyebrow={eyebrow}
          onNotifications={onNotifications}
          notificationCount={notificationCount}
          right={
            handleBack ? (
              <Pressable onPress={handleBack}>
                <IconChip name="arrow-back-outline" tone="dark" size={40} />
              </Pressable>
            ) : undefined
          }
        />
      </View>
      <Content
        style={styles.content}
        contentContainerStyle={
          scrollable
            ? [
                styles.contentContainer,
                { paddingBottom: insets.bottom + Spacing["4xl"] },
              ]
            : undefined
        }
        refreshControl={scrollable ? refreshControl : undefined}
      >
        {children}
      </Content>
    </Floodlight>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.md,
  },
});
