import React from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EGCorner, EGGlass, EGShadow } from "@/constants/theme";
import { BrandStateLayout } from "@/components/signature/BrandStateLayout";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { SignatureText } from "@/components/signature/SignatureText";

interface AuthFrameProps {
  /** Maiuscoletto a destra della scritta: "1 di 3", "Nuovo account", "Recupero". */
  step?: string;
  eyebrow: string;
  title: string;
  body?: string;
  /** Il contenuto della scheda di vetro (campi + CTA primario). Senza scheda, i figli vanno direttamente sul cielo. */
  card?: React.ReactNode;
  /** Il secondario "ghost" bianco sotto la scheda (48px, bordo bianco 45%): "Password dimenticata?", "Torna al login". */
  secondary?: { label: string; onPress: () => void; disabled?: boolean };
  /** Una seconda azione ghost (es. "Non hai un account? Crea account"), sotto la prima. */
  tertiary?: { label: string; onPress: () => void };
  /** Errore inline sopra il CTA, dentro la scheda. */
  error?: string;
  /** Nota positiva (spunta verde) dentro la scheda — "Codice inviato…", "Almeno 8 caratteri". */
  note?: string;
  /** Avviso ambrato in cima al blocco (sessione scaduta). */
  notice?: string;
  children?: React.ReactNode;
  cardStyle?: StyleProp<ViewStyle>;
}

/**
 * La composizione comune delle schermate di accesso (design `IA e Home`
 * §5a, prototipo `isLogin`/`isOtp`): riga marchio con passo, poi — centrati
 * in verticale — eyebrow 11/700, titolo 32/37 800, corpo 15/23 bianco
 * 82%; una scheda di vetro forte (padding 18, gap 14) con i campi e il CTA
 * primario a gradiente; sotto, il secondario bianco in contorno. Niente
 * striscia di servizio in fondo.
 */
export function AuthFrame({
  step,
  eyebrow,
  title,
  body,
  card,
  secondary,
  tertiary,
  error,
  note,
  notice,
  children,
  cardStyle,
}: AuthFrameProps) {
  return (
    <BrandStateLayout step={step}>
      {notice ? (
        <View style={styles.notice}>
          <Ionicons name="time-outline" size={16} color="#FCD34D" />
          <SignatureText style={styles.noticeText}>{notice}</SignatureText>
        </View>
      ) : null}
      <SignatureText style={styles.eyebrow}>{eyebrow}</SignatureText>
      <SignatureText style={styles.title}>{title}</SignatureText>
      {body ? <SignatureText style={styles.body}>{body}</SignatureText> : null}

      {card ? (
        <GlassSurface
          tone="strong"
          corner="card"
          elevated
          style={[styles.card, EGShadow.glassRaised, cardStyle]}
        >
          <View style={styles.cardInner}>
            {card}
            {note ? (
              <View style={styles.noteRow}>
                <Ionicons name="checkmark-circle" size={14} color="#15803D" />
                <SignatureText style={styles.noteText}>{note}</SignatureText>
              </View>
            ) : null}
            {error ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={14} color="#B91C1C" />
                <SignatureText style={styles.errorText}>{error}</SignatureText>
              </View>
            ) : null}
          </View>
        </GlassSurface>
      ) : null}

      {secondary ? (
        <GhostButton
          label={secondary.label}
          onPress={secondary.onPress}
          disabled={secondary.disabled}
          style={{ marginTop: 10 }}
        />
      ) : null}
      {tertiary ? (
        <Pressable
          onPress={tertiary.onPress}
          hitSlop={8}
          accessibilityRole="button"
          style={styles.tertiary}
        >
          <SignatureText style={styles.tertiaryText}>
            {tertiary.label}
          </SignatureText>
        </Pressable>
      ) : null}

      {children}
    </BrandStateLayout>
  );
}

/** Il secondario sul cielo (design §4/5: "white-outlined ghost with a white label", 6.6:1): bianco 8%, bordo 1.5px bianco 45%, 48px. */
export function GhostButton({
  label,
  onPress,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.ghost,
        disabled ? { opacity: 0.55 } : null,
        pressed ? { transform: [{ scale: 0.97 }] } : null,
        style,
      ]}
    >
      <SignatureText style={styles.ghostLabel}>{label}</SignatureText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(252,211,77,0.12)",
    borderWidth: 1,
    borderColor: "rgba(252,211,77,0.35)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 4,
    ...EGCorner.chip,
  },
  noticeText: {
    flex: 1,
    color: "#FCD34D",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
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
    fontSize: 32,
    lineHeight: 37,
    fontWeight: "800",
    letterSpacing: -0.64,
  },
  body: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "500",
    maxWidth: 300,
  },
  card: {
    marginTop: 12,
    borderColor: EGGlass.border,
  },
  cardInner: {
    padding: 18,
    gap: 14,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  noteText: {
    flex: 1,
    color: "rgba(11,26,58,0.62)",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "500",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: "#B91C1C",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  ghost: {
    height: 48,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.45)",
    ...EGCorner.control,
  },
  ghostLabel: {
    color: "#FFFFFF",
    fontSize: 14.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  tertiary: {
    alignSelf: "center",
    paddingVertical: 10,
    marginTop: 4,
  },
  tertiaryText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    textAlign: "center",
  },
});
