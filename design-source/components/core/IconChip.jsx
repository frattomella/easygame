import React from "react";
import { Icon } from "./Icon.jsx";

/* EasyGame Icon Chip — every icon that is not inline metadata sits on a small tinted tile
   with a hairline border and inner highlight. Same cut corner as the cards. */
export function IconChip({ name, color = "#2563eb", size = 32, tone = "tint", style }) {
  const dark = tone === "dark";
  const glass = tone === "glass";
  const bg = dark ? "rgba(255,255,255,0.12)" : glass ? "rgba(255,255,255,0.55)" : color + "1f";
  const bd = dark ? "rgba(255,255,255,0.22)" : glass ? "var(--eg-glass-border)" : color + "40";
  const fg = dark ? "#fff" : color;
  return (
    <span style={{ width: size, height: size, flex: "0 0 auto", borderRadius: size >= 40 ? "var(--eg-corner-sm)" : "var(--eg-corner-xs)", background: bg, border: "1px solid " + bd, boxShadow: dark ? "var(--eg-highlight-top-dark)" : "var(--eg-highlight-top)", display: "inline-flex", alignItems: "center", justifyContent: "center", backdropFilter: glass || dark ? "var(--eg-glass-blur)" : "none", ...style }}>
      <Icon name={name} size={Math.round(size * 0.55)} color={fg} />
    </span>
  );
}
