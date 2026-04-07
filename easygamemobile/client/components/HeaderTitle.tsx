import React from "react";
import { View, StyleSheet, Image } from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { EASYGAME_APP_NAME, EASYGAME_LOGO } from "@/constants/branding";
import { Spacing } from "@/constants/theme";

interface HeaderTitleProps {
  title?: string;
}

export function HeaderTitle(_: HeaderTitleProps) {
  return (
    <View style={styles.container}>
      <Image
        source={{ uri: EASYGAME_LOGO }}
        style={styles.icon}
        resizeMode="contain"
      />
      <ThemedText style={styles.title}>{EASYGAME_APP_NAME}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  icon: {
    width: 34,
    height: 34,
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
