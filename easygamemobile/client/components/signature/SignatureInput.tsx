import React, { useState } from "react";
import {
  StyleProp,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EGCorner, EGGlass, EGInk } from "@/constants/theme";
import { SignatureText } from "@/components/signature/SignatureText";

interface SignatureInputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}

/**
 * The EasyGame glass field (design-source `components/core/Input.jsx`):
 * frosted surface, cut corner, hairline that turns into the action-blue ring
 * on focus. Sibling to `client/components/Input.tsx` — existing screens keep
 * using `Input`.
 */
export function SignatureInput({
  label,
  error,
  leftIcon,
  style,
  onFocus,
  onBlur,
  multiline,
  ...rest
}: SignatureInputProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = error
    ? "#EF4444"
    : focused
      ? "#2563EB"
      : EGGlass.hairlineStrong;

  return (
    <View style={style}>
      {label ? (
        <SignatureText
          variant="eyebrow"
          tone="faint"
          style={{ marginBottom: 6 }}
        >
          {label}
        </SignatureText>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: multiline ? "flex-start" : "center",
          minHeight: multiline ? 90 : 52,
          backgroundColor: EGGlass.bgStrong,
          borderWidth: 1,
          borderColor,
          paddingVertical: multiline ? 12 : 0,
          ...EGCorner.control,
        }}
      >
        {leftIcon ? (
          <Ionicons
            name={leftIcon}
            size={20}
            color={focused ? "#2563EB" : EGInk.onLightFaint}
            style={{ marginLeft: 14, marginRight: 10 }}
          />
        ) : null}
        <TextInput
          {...rest}
          multiline={multiline}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          placeholderTextColor={EGInk.onLightFaint}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: multiline ? 66 : undefined,
            paddingLeft: leftIcon ? 0 : 16,
            paddingRight: 16,
            fontSize: 16,
            fontWeight: "500",
            color: EGInk.onLight,
            textAlignVertical: multiline ? "top" : "center",
          }}
        />
      </View>
      {error ? (
        <SignatureText
          variant="small"
          style={{ color: "#B91C1C", fontWeight: "600", marginTop: 6 }}
        >
          {error}
        </SignatureText>
      ) : null}
    </View>
  );
}
