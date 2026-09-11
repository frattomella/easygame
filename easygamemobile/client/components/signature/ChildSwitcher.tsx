import React, { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { EGChildAccents, EGGlass, EGShadow, Spacing } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { GradientFill } from "@/components/signature/GradientFill";
import { SignatureText } from "@/components/signature/SignatureText";
import { BottomSheet } from "@/components/signature/BottomSheet";
import { IconChip } from "@/components/signature/IconChip";
import { ActionButton } from "@/components/signature/ActionButton";
import { SelectionRing } from "@/components/signature/SelectionRing";
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
 * Il glifo del figlio (prototipo `showChildBar`): un anello di 2px nel
 * colore-accento del figlio attorno a un tondo navy (il `NumberTile`
 * del prototipo, ritagliato a cerchio). `ParentChild` non porta il numero
 * di maglia, quindi il tondo mostra la foto del club quando c'e, altrimenti
 * le iniziali — l'anello, mai il riempimento, e l'accento; il nome resta
 * sempre accanto.
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
  const inner = size - 4;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        padding: 2,
        backgroundColor: accent,
      }}
    >
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: 999,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <GradientFill gradient="navy" style={StyleSheet.absoluteFillObject} />
        {child.avatarUrl ? (
          <Image
            source={{ uri: child.avatarUrl }}
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <SignatureText
            style={{
              color: "#FFFFFF",
              fontSize: Math.round(inner * 0.36),
              lineHeight: Math.round(inner * 0.44),
              fontWeight: "800",
              letterSpacing: -0.3,
            }}
          >
            {initialsOf(child.name)}
          </SignatureText>
        )}
      </View>
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
 * design `IA e Home` §2b + prototipo v3: la barra del figlio, "in the sky
 * under the AppBar on every Parent primary screen" — pillola dark-glass di
 * 56px (margine 10/20), glifo con anello-accento, nome 15/700 e squadra in
 * eyebrow, chip chevron a destra. Il tocco apre il foglio "Cambia atleta":
 * righe di scelta con anello, poi Annulla + Conferma (prototipo `child`).
 * Montata solo da `ParentPrimaryScreenLayout`.
 */
export function ChildSwitcher({
  linkedChildren: allChildren,
  selectedChildId,
  switching = false,
  onSelect,
}: ChildSwitcherProps) {
  const [expanded, setExpanded] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const selected =
    allChildren.find((child) => child.id === selectedChildId) || null;

  if (allChildren.length === 0 || !selected) {
    return null;
  }

  const accentIndex = resolveChildAccentIndex(allChildren, selected.id);
  const accent = EGChildAccents[accentIndex];
  const singleChild = allChildren.length === 1;
  const groups = groupChildrenByClub(allChildren);
  const teamLabel = selected.categoryName || selected.clubName;

  const open = () => {
    setPendingId(selected.id);
    setExpanded(true);
  };
  const confirm = () => {
    setExpanded(false);
    if (pendingId && pendingId !== selectedChildId) {
      onSelect(pendingId);
    }
  };

  return (
    <>
      <Pressable
        disabled={singleChild}
        onPress={open}
        style={styles.wrap}
        accessibilityRole="button"
        accessibilityLabel={
          singleChild
            ? `Atleta: ${selected.name}, ${teamLabel}`
            : `Atleta: ${selected.name}, ${teamLabel}. Cambia atleta`
        }
      >
        <GlassSurface
          tone="dark"
          corner="pill"
          style={[styles.pill, EGShadow.dock]}
        >
          <View style={[styles.row, switching ? styles.rowSwitching : null]}>
            <ChildGlyph child={selected} accent={accent} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <SignatureText numberOfLines={1} style={styles.name}>
                {selected.name}
              </SignatureText>
              <SignatureText numberOfLines={1} style={styles.team}>
                {teamLabel}
              </SignatureText>
            </View>
            {!singleChild ? (
              <IconChip name="chevron-down-outline" tone="dark" size={32} />
            ) : null}
          </View>
        </GlassSurface>
      </Pressable>

      <BottomSheet
        visible={expanded}
        onClose={() => setExpanded(false)}
        eyebrow="I tuoi figli"
        title="Cambia atleta"
        actions={
          <>
            <ActionButton
              variant="secondary"
              onPress={() => setExpanded(false)}
              style={{ width: 100 }}
            >
              Annulla
            </ActionButton>
            <ActionButton
              trailingIcon="arrow-forward"
              onPress={confirm}
              style={{ flex: 1 }}
            >
              Conferma
            </ActionButton>
          </>
        }
      >
        {groups.map((group) =>
          group.children.map((child) => {
            const isPending = child.id === pendingId;
            const childAccent =
              EGChildAccents[resolveChildAccentIndex(allChildren, child.id)];
            return (
              <Pressable
                key={child.id}
                onPress={() => setPendingId(child.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isPending }}
              >
                <GlassSurface
                  tone="light"
                  corner="control"
                  style={[
                    styles.pickRow,
                    EGShadow.row,
                    isPending ? styles.pickRowOn : null,
                  ]}
                >
                  <View style={styles.pickInner}>
                    <ChildGlyph child={child} accent={childAccent} size={44} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <SignatureText numberOfLines={1} style={styles.pickName}>
                        {child.name}
                      </SignatureText>
                      <SignatureText numberOfLines={1} style={styles.pickMeta}>
                        {[group.clubName, child.categoryName]
                          .filter(Boolean)
                          .join(" · ")}
                      </SignatureText>
                    </View>
                    <SelectionRing on={isPending} />
                  </View>
                </GlassSurface>
              </Pressable>
            );
          }),
        )}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 20,
    marginTop: 10,
  },
  pill: {
    borderColor: "rgba(255,255,255,0.24)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 56,
    paddingHorizontal: Spacing.sm,
  },
  rowSwitching: {
    opacity: 0.6,
  },
  name: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  team: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  pickRow: {
    minHeight: 64,
    borderColor: EGGlass.border,
  },
  pickRowOn: {
    backgroundColor: EGGlass.bgStrong,
    borderColor: "rgba(37,99,235,0.4)",
  },
  pickInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
  },
  pickName: {
    color: "#0B1A3A",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  pickMeta: {
    color: "rgba(11,26,58,0.42)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
});
