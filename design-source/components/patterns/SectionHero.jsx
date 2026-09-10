import React from "react";
import { IconChip } from "../core/IconChip.jsx";

/* Sky headline block: sits in the navy zone under the AppBar. Eyebrow + display line + supporting text,
   optional icon chip and a row of glass "stat chips". Transparent — the Floodlight is the surface. */
export function SectionHero({ eyebrow, title, subtitle, icon, iconColor = "#3b82f6", stats = [], children, style }) {
  return (
    <div style={{ padding: "18px 20px 8px", color: "#fff", ...style }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        {icon ? <IconChip name={icon} tone="dark" size={44} color={iconColor} /> : null}
        <div style={{ minWidth: 0, flex: 1 }}>
          {eyebrow ? <div style={{ font: "var(--eg-text-eyebrow)", letterSpacing: "var(--eg-tracking-eyebrow)", textTransform: "uppercase", color: "var(--eg-ink-on-dark-muted)", marginBottom: 4 }}>{eyebrow}</div> : null}
          <div style={{ font: "800 24px/28px var(--eg-font-brand)", letterSpacing: "var(--eg-tracking-display)" }}>{title}</div>
          {subtitle ? <div style={{ font: "var(--eg-text-small)", color: "var(--eg-ink-on-dark-muted)", marginTop: 6, maxWidth: 300 }}>{subtitle}</div> : null}
        </div>
      </div>
      {stats.length ? (
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {stats.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "8px 12px", borderRadius: "var(--eg-corner-xs)", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", boxShadow: "var(--eg-highlight-top-dark)", backdropFilter: "var(--eg-glass-blur)" }}>
              <span style={{ font: "800 18px/20px var(--eg-font-brand)", letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{s.value}</span>
              <span style={{ font: "600 11px/14px var(--eg-font-brand)", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--eg-ink-on-dark-muted)" }}>{s.label}</span>
            </div>
          ))}
        </div>
      ) : null}
      {children}
    </div>
  );
}
