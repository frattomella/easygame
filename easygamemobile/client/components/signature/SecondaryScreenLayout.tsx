import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
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
}

/**
 * Il guscio comune delle cinque sezioni nuove (Bacheca, Documenti,
 * Appuntamenti, Compensi, Squadre): `Floodlight` + `AppBar` con freccia
 * indietro, contenuto scorrevole sotto. Non e usato dalle quattro tab
 * primarie — vedi la nota in `docs/knowledge-base/05-mobile-architecture.md`
 * sul perche il reskin si e fermato qui in questo giro.
 */
export function SecondaryScreenLayout({
  title,
  eyebrow,
  children,
  onBack,
  scrollable = true,
}: SecondaryScreenLayoutProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const handleBack =
    onBack === false ? undefined : onBack || (() => navigation.goBack());

  const Content = scrollable ? ScrollView : View;

  return (
    <Floodlight>
      <View style={{ paddingTop: insets.top + Spacing.sm }}>
        <AppBar
          title={title}
          eyebrow={eyebrow}
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
