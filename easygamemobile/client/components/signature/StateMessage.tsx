import React from "react";
import { ActivityIndicator, StyleProp, View, ViewStyle } from "react-native";

import { Spacing } from "@/constants/theme";
import { IconChip } from "@/components/signature/IconChip";
import { SignatureText } from "@/components/signature/SignatureText";
import { ActionButton } from "@/components/signature/ActionButton";

export type StateMessageKind = "loading" | "empty" | "forbidden" | "error";

interface StateMessageProps {
  kind: StateMessageKind;
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "light" | "dark";
  style?: StyleProp<ViewStyle>;
}

const DEFAULTS: Record<
  StateMessageKind,
  { icon: string; title: string; color: string }
> = {
  loading: {
    icon: "hourglass-outline",
    title: "Caricamento…",
    color: "#2563EB",
  },
  empty: {
    icon: "file-tray-outline",
    title: "Nessun elemento",
    color: "#64748B",
  },
  forbidden: {
    icon: "lock-closed-outline",
    title: "Accesso non consentito",
    color: "#EF4444",
  },
  error: {
    icon: "cloud-offline-outline",
    title: "Errore di connessione",
    color: "#EF4444",
  },
};

/**
 * Loading / real-empty / forbidden / recoverable-error, drawn distinctly —
 * not the web dashboard's difect of folding a 403 into an empty list (see
 * `docs/knowledge-base/05-mobile-architecture.md`, "Error Handling"). Every
 * new Trainer section built against the new visual identity renders one of
 * these four instead of inventing its own empty/error copy.
 *
 * Not in the design-source export: the system ships a plain `EmptyState`
 * with an illustration slot (unused here — "no illustrations" is a hard
 * requirement for this app) and no forbidden/error/loading vocabulary at
 * all. This is a same-language extension (icon chip, eyebrow-weight title,
 * muted body, one optional action) documented as such rather than invented
 * from nothing.
 */
export function StateMessage({
  kind,
  title,
  message,
  actionLabel,
  onAction,
  tone = "light",
  style,
}: StateMessageProps) {
  const fallback = DEFAULTS[kind];
  const dark = tone === "dark";

  if (kind === "loading") {
    return (
      <View style={[styles.container, style]}>
        <ActivityIndicator size="large" color={dark ? "#FFFFFF" : "#2563EB"} />
        {title || message ? (
          <SignatureText
            variant="small"
            tone={dark ? "onDarkMuted" : "muted"}
            style={styles.loadingCaption}
          >
            {title || message}
          </SignatureText>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <IconChip
        name={fallback.icon as never}
        color={fallback.color}
        size={52}
        tone={dark ? "dark" : "tint"}
        style={styles.icon}
      />
      <SignatureText
        variant="h4"
        tone={dark ? "onDark" : "ink"}
        style={styles.title}
      >
        {title || fallback.title}
      </SignatureText>
      {message ? (
        <SignatureText
          variant="body"
          tone={dark ? "onDarkMuted" : "muted"}
          style={styles.message}
        >
          {message}
        </SignatureText>
      ) : null}
      {actionLabel && onAction ? (
        <ActionButton
          variant={kind === "error" ? "primary" : "secondary"}
          size="sm"
          onPress={onAction}
        >
          {actionLabel}
        </ActionButton>
      ) : null}
    </View>
  );
}

const styles = {
  container: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: Spacing["3xl"],
    paddingHorizontal: Spacing["2xl"],
    gap: Spacing.sm,
  },
  icon: {
    marginBottom: Spacing.sm,
  },
  title: {
    textAlign: "center" as const,
  },
  message: {
    textAlign: "center" as const,
    maxWidth: 280,
    marginBottom: Spacing.sm,
  },
  loadingCaption: {
    marginTop: Spacing.sm,
  },
};
