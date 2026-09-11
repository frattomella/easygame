import React from "react";
import {
  RefreshControlProps,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Floodlight } from "@/components/signature/Floodlight";
import { AppBar } from "@/components/signature/AppBar";
import { PROTOTYPE_STATUS_BAR } from "@/components/signature/SecondaryScreenLayout";
import { BrandLine } from "@/components/signature/BrandLine";
import { ChildSwitcher } from "@/components/signature/ChildSwitcher";
import { useAuthContext } from "@/contexts/AuthContext";
import { Spacing } from "@/constants/theme";
import type { ParentChild } from "@/services/api";

interface ParentPrimaryScreenLayoutProps {
  title: string;
  eyebrow?: string;
  linkedChildren: ParentChild[];
  selectedChildId: string | null;
  childrenSwitching?: boolean;
  onSelectChild: (childId: string) => void;
  onNotifications?: () => void;
  notificationCount?: number;
  content: React.ReactNode;
  scrollable?: boolean;
  /** Prototipo v3: Home 430, Calendario/Pagamenti 250, Profilo 300, Servizi 160 (misure con la barra di stato del prototipo: l'inset reale si somma). */
  skyHeight?: number;
  /** 12 per le schede (Home, Calendario, Pagamenti), 8 per le liste a righe (Servizi). */
  contentGap?: number;
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}

/**
 * Il guscio delle cinque tab Parent (design `IA e Home` §2b, prototipo v3):
 * "Parent screens stack three scopes without repeating a word: product
 * (wordmark), club (chip — derived from the selected child), child
 * (switcher pill)". `Floodlight` + `BrandLine` + `AppBar` + `ChildSwitcher`
 * nel cielo, sotto l'AppBar, su ogni schermata primaria — la regola vive
 * qui una volta sola. Le schermate secondarie (`SecondaryScreenLayout`)
 * ereditano il figlio e non hanno lo switcher.
 */
export function ParentPrimaryScreenLayout({
  title,
  eyebrow,
  linkedChildren,
  selectedChildId,
  childrenSwitching = false,
  onSelectChild,
  onNotifications,
  notificationCount = 0,
  content,
  scrollable = true,
  skyHeight = 250,
  contentGap = Spacing.md,
  contentStyle,
  refreshControl,
}: ParentPrimaryScreenLayoutProps) {
  const insets = useSafeAreaInsets();
  const { currentClub, clearContext } = useAuthContext();
  const selected =
    linkedChildren.find((child) => child.id === selectedChildId) || null;
  const club = selected
    ? { name: selected.clubName, avatarUrl: selected.clubLogoUrl }
    : currentClub
      ? { name: currentClub.name, avatarUrl: currentClub.avatar }
      : null;

  const header = (
    <View style={{ paddingTop: insets.top + Spacing.sm }}>
      <BrandLine club={club} onPressClub={() => void clearContext()} />
      <AppBar
        title={title}
        eyebrow={eyebrow}
        notificationCount={notificationCount}
        onNotifications={onNotifications}
      />
      <ChildSwitcher
        linkedChildren={linkedChildren}
        selectedChildId={selectedChildId}
        switching={childrenSwitching}
        onSelect={onSelectChild}
      />
    </View>
  );

  return (
    <Floodlight skyHeight={skyHeight - PROTOTYPE_STATUS_BAR + insets.top}>
      {header}
      {scrollable ? (
        <ScrollView
          style={styles.content}
          contentContainerStyle={[
            styles.contentContainer,
            { gap: contentGap, paddingBottom: insets.bottom + 118 },
            contentStyle,
          ]}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fixed, contentStyle]}>
          {content}
        </View>
      )}
    </Floodlight>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  fixed: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
  },
  contentContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 12,
  },
});
