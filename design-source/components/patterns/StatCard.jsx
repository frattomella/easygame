import React from "react";
import { IconChip } from "../core/IconChip.jsx";

/* Counter tile: glass, cut corner, icon chip, tracked label, big tabular number. */
export function StatCard({ label, value, icon, color = "#2563eb", style }) {
  return (
    <div style={{ background: "var(--eg-glass-bg)", backdropFilter: "var(--eg-glass-blur)", WebkitBackdropFilter: "var(--eg-glass-blur)", border: "1px solid var(--eg-glass-border)", borderRadius: "var(--eg-corner)", boxShadow: "var(--eg-highlight-top), var(--eg-shadow-glass)", padding: 14, display: "flex", flexDirection: "column", gap: 10, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <IconChip name={icon} color={color} size={34} />
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: "0 0 0 3px " + color + "26", marginTop: 4 }} />
      </div>
      <div>
        <div style={{ font: "800 28px/30px var(--eg-font-brand)", letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", color: "var(--eg-ink)" }}>{value}</div>
        <div style={{ font: "var(--eg-text-eyebrow)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--eg-ink-faint)", marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}
