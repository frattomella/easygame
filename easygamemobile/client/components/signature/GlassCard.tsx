import React, { useState } from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

import { EGGradients, Spacing } from "@/constants/theme";
import { GlassSurface, GlassTone } from "@/components/signature/GlassSurface";
import { SignatureText } from "@/components/signature/SignatureText";
import { GradientFill } from "@/components/signature/GradientFill";

interface GlassCardProps {
  eyebrow?: string;
  title?: string;
  description?: string;
  /** A key into `EGGradients`, painted as a 3px stripe inset 22px on the top edge. */
  stripe?: keyof typeof EGGradients;
  tone?: GlassTone;
  elevated?: boolean;
  noPadding?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The EasyGame glass panel (design-source `components/core/Card.jsx`):
 * frosted surface, signature cut corner, optional module stripe. This is the
 * card for screens built against the new visual identity — see
 * `client/components/Card.tsx` for the flat card existing screens keep.
 */
export function GlassCard({
  eyebrow,
  title,
  description,
  stripe,
  tone = "light",
  elevated = false,
  noPadding = false,
  onPress,
  children,
  style,
}: GlassCardProps) {
  const [pressed, setPressed] = useState(false);
  const dark = tone === "dark";
  const interactive = Boolean(onPress);

  const inner = (
    <GlassSurface
      tone={tone}
      elevated={elevated}
      style={[pressed ? styles.pressed : null, style]}
    >
      {stripe ? (
        <View style={styles.stripeWrap}>
          <GradientFill gradient={stripe} style={styles.stripe} />
        </View>
      ) : null}
      <View style={noPadding ? undefined : styles.padding}>
        {eyebrow ? (
          <SignatureText
            variant="eyebrow"
            tone={dark ? "onDarkMuted" : "faint"}
            style={styles.eyebrow}
          >
            {eyebrow}
          </SignatureText>
        ) : null}
        {title ? (
          <SignatureText
            variant="h4"
            tone={dark ? "onDark" : "ink"}
            style={description ? styles.titleWithDescription : styles.title}
          >
            {title}
          </SignatureText>
        ) : null}
        {description ? (
          <SignatureText
            variant="small"
            tone={dark ? "onDarkMuted" : "muted"}
            style={styles.description}
          >
            {description}
          </SignatureText>
        ) : null}
        {children}
      </View>
    </GlassSurface>
  );

  if (!interactive) {
    return inner;
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  padding: {
    padding: Spacing.lg,
  },
  stripeWrap: {
    position: "absolute",
    top: 0,
    left: 22,
    right: 22,
    height: 3,
  },
  stripe: {
    flex: 1,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  eyebrow: {
    marginBottom: 6,
  },
  title: {
    marginBottom: Spacing.sm,
  },
  titleWithDescription: {
    marginBottom: 2,
  },
  description: {
    marginBottom: Spacing.sm,
  },
});
