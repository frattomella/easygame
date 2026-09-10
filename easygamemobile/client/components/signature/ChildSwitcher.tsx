import React, { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EGChildAccents, Spacing } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { SignatureText } from "@/components/signature/SignatureText";
import { BottomSheet } from "@/components/signature/BottomSheet";
import { IconChip } from "@/components/signature/IconChip";
import {
  groupChildrenByClub,
  resolveChildAccentIndex,
} from "@/lib/parent-children";
import type { ParentChild } from "@/services/api";

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";

/**
 * spec C1's "child NumberTile or 36px avatar with a `2px` child-accent
 * ring": a `NumberTile` needs a jersey number, which a linked child does not
 * carry in this payload (`ParentChild` has no `number`), so the switcher
 * always takes the avatar branch — photo when the club has one, initials on
 * the child's accent otherwise. Ring, never fill, is the accent: the name is
 * always the real identifier alongside it.
 */
function ChildGlyph({
  child,
  accent,
  size,
}: {
  child: ParentChild;
  accent: string;
  size: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: accent,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        backgroundColor: "rgba(11,26,58,0.75)",
      }}
    >
      {child.avatarUrl ? (
        <Image
          source={{ uri: child.avatarUrl }}
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <SignatureText
          style={{
            color: "#FFFFFF",
            fontSize: Math.round(size * 0.38),
            fontWeight: "800",
          }}
        >
          {initialsOf(child.name)}
        </SignatureText>
      )}
    </View>
  );
}

interface ChildSwitcherProps {
  linkedChildren: ParentChild[];
  selectedChildId: string | null;
  /** `true` while the dashboard is loading the incoming child's data. */
  switching?: boolean;
  onSelect: (childId: string) => void;
}

/**
 * design-source `guidelines/component-specs.md` §C1. Placement is fixed by
 * `guidelines/navigation.md`: in the navy sky, directly under the AppBar, on
 * every primary Parent screen — see `ParentPrimaryScreenLayout`, which is
 * the only place this component is mounted.
 */
export function ChildSwitcher({
  linkedChildren: allChildren,
  selectedChildId,
  switching = false,
  onSelect,
}: ChildSwitcherProps) {
  const [expanded, setExpanded] = useState(false);
  const selected =
    allChildren.find((child) => child.id === selectedChildId) || null;

  if (allChildren.length === 0 || !selected) {
    return null;
  }

  const accentIndex = resolveChildAccentIndex(allChildren, selected.id);
  const accent = EGChildAccents[accentIndex];
  const singleChild = allChildren.length === 1;
  const groups = groupChildrenByClub(allChildren);

  const handleSelect = (childId: string) => {
    setExpanded(false);
    if (childId !== selectedChildId) {
      onSelect(childId);
    }
  };

  return (
    <>
      <Pressable
        disabled={singleChild}
        onPress={() => setExpanded(true)}
        style={styles.wrap}
      >
        <GlassSurface tone="dark" corner="pill" style={styles.pill}>
          <View style={[styles.row, switching ? styles.rowSwitching : null]}>
            <ChildGlyph child={selected} accent={accent} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <SignatureText
                variant="body"
                tone="onDark"
                numberOfLines={1}
                style={styles.name}
              >
                {selected.name}
              </SignatureText>
              <SignatureText
                variant="eyebrow"
                tone="onDarkMuted"
                numberOfLines={1}
              >
                {selected.clubName}
              </SignatureText>
            </View>
            {!singleChild ? (
              <View style={styles.chevronChip}>
                <Ionicons
                  name="chevron-down-outline"
                  size={18}
                  color="rgba(255,255,255,0.72)"
                />
              </View>
            ) : null}
          </View>
        </GlassSurface>
      </Pressable>

      <BottomSheet visible={expanded} onClose={() => setExpanded(false)}>
        <SignatureText
          variant="eyebrow"
          tone="faint"
          style={styles.sheetEyebrow}
        >
          I TUOI FIGLI
        </SignatureText>
        {groups.map((group) => (
          <View key={group.clubId} style={styles.group}>
            <SignatureText
              variant="small"
              tone="muted"
              style={styles.groupLabel}
            >
              {group.clubName}
            </SignatureText>
            {group.children.map((child) => {
              const isSelected = child.id === selectedChildId;
              const childAccent =
                EGChildAccents[resolveChildAccentIndex(allChildren, child.id)];
              return (
                <Pressable
                  key={child.id}
                  onPress={() => handleSelect(child.id)}
                  style={styles.childRow}
                >
                  <ChildGlyph child={child} accent={childAccent} size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <SignatureText variant="body" tone="ink" numberOfLines={1}>
                      {child.name}
                    </SignatureText>
                    <SignatureText
                      variant="small"
                      tone="muted"
                      numberOfLines={1}
                    >
                      {[child.clubName, child.categoryName]
                        .filter(Boolean)
                        .join(" · ")}
                    </SignatureText>
                  </View>
                  <View
                    style={[
                      styles.ringToggle,
                      isSelected ? styles.ringToggleFilled : null,
                    ]}
                  >
                    {isSelected ? (
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
        <Pressable onPress={() => setExpanded(false)} style={styles.cancelRow}>
          <IconChip name="close-outline" tone="glass" size={36} />
          <SignatureText variant="body" tone="muted">
            Annulla
          </SignatureText>
        </Pressable>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
  },
  pill: {
    borderColor: "rgba(255,255,255,0.22)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    height: 56,
    paddingHorizontal: Spacing.sm,
  },
  rowSwitching: {
    opacity: 0.6,
  },
  name: {
    fontWeight: "700",
  },
  chevronChip: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetEyebrow: {
    marginBottom: Spacing.sm,
  },
  group: {
    marginBottom: Spacing.md,
  },
  groupLabel: {
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
  },
  childRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  ringToggle: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(11,26,58,0.22)",
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  ringToggleFilled: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  cancelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
});
