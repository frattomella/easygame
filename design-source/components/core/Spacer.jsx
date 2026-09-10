import React from "react";

const SIZES = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, "2xl": 24, "3xl": 32, "4xl": 40, "5xl": 48 };

export function Spacer({ size = "lg", horizontal = false }) {
  const px = SIZES[size] || SIZES.lg;
  return <span style={{ display: "block", width: horizontal ? px : "100%", height: horizontal ? "100%" : px, flex: "0 0 auto" }} />;
}
