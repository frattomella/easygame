import React from "react";
import { Badge } from "../core/Badge.jsx";
import { IconChip } from "../core/IconChip.jsx";
import { Button } from "../core/Button.jsx";

/* Dashboard module block: glass panel, module stripe, icon chip + eyebrow/title, count pill,
   up to two preview rows on a soft inset surface, one secondary action. */
export function HighlightCard({ title, eyebrow, count, icon, color = "#2563eb", stripe, items = [], emptyLabel, actionLabel, onAction, style }) {
  return (
    <div style={{ position: "relative", background: "var(--eg-glass-bg)", backdropFilter: "var(--eg-glass-blur)", WebkitBackdropFilter: "var(--eg-glass-blur)", border: "1px solid var(--eg-glass-border)", borderRadius: "var(--eg-corner)", boxShadow: "var(--eg-highlight-top), var(--eg-shadow-glass)", padding: 16, overflow: "hidden", ...style }}>
      <div style={{ position: "absolute", top: 0, left: 22, right: 22, height: 3, borderRadius: "0 0 3px 3px", background: stripe || color }} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        {icon ? <IconChip name={icon} color={color} size={36} /> : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          {eyebrow ? <div style={{ font: "var(--eg-text-eyebrow)", letterSpacing: "var(--eg-tracking-eyebrow)", textTransform: "uppercase", color: "var(--eg-ink-faint)" }}>{eyebrow}</div> : null}
          <div style={{ font: "700 16px/22px var(--eg-font-brand)", letterSpacing: "-0.01em", color: "var(--eg-ink)" }}>{title}</div>
        </div>
        {count !== undefined ? <span style={{ font: "800 22px/24px var(--eg-font-brand)", letterSpacing: "-0.03em", color, fontVariantNumeric: "tabular-nums" }}>{count}</span> : null}
      </div>
      {items.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(11,26,58,0.04)", border: "1px solid var(--eg-hairline)", borderRadius: "var(--eg-corner-xs)", padding: "10px 12px" }}>
              {item.time ? <span style={{ font: "800 15px/18px var(--eg-font-brand)", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", color, minWidth: 44 }}>{item.time}</span> : null}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ font: "600 14px/18px var(--eg-font-brand)", color: "var(--eg-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</div>
                {item.meta ? <div style={{ font: "500 12px/16px var(--eg-font-brand)", color: "var(--eg-ink-faint)" }}>{item.meta}</div> : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ font: "var(--eg-text-small)", color: "var(--eg-ink-muted)", padding: "6px 0" }}>{emptyLabel}</div>
      )}
      {actionLabel ? <Button variant="secondary" size="sm" trailingIcon="arrow-forward" onClick={onAction} style={{ marginTop: 12, width: "100%" }}>{actionLabel}</Button> : null}
    </div>
  );
}
