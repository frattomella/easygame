import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Floodlight } from "@/components/signature/Floodlight";
import { AppBar } from "@/components/signature/AppBar";
import { ChildSwitcher } from "@/components/signature/ChildSwitcher";
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
}

/**
 * Local composition, not a new design-system component: `Floodlight` +
 * `AppBar` + `ChildSwitcher`, wired to the rule in
 * `design-source/guidelines/navigation.md` ("Child switcher placement" —
 * navy sky, directly under the AppBar, on all five Parent primary screens).
 * Centralising it here means that rule lives in one place instead of being
 * repeated in five tab screens. Sibling to `SecondaryScreenLayout` (which
 * has no switcher — secondary screens inherit the child, per the same doc).
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
}: ParentPrimaryScreenLayoutProps) {
  const insets = useSafeAreaInsets();
  const Content = scrollable ? ScrollView : View;

  return (
    <Floodlight>
      <View style={{ paddingTop: insets.top + Spacing.sm }}>
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
      <Content
        style={scrollable ? styles.content : [styles.content, styles.fixed]}
        contentContainerStyle={
          scrollable
            ? [styles.contentContainer, { paddingBottom: insets.bottom + 112 }]
            : undefined
        }
      >
        {content}
      </Content>
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
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
});
