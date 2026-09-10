import React from "react";
import { IconChip } from "../core/IconChip.jsx";

/* Screen header living in the navy sky: eyebrow + display title on the left, glass chips on the right.
   Transparent — the Floodlight behind provides the surface. */
export function AppBar({ title, eyebrow, notificationCount = 0, onNotifications, right, style }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, padding: "10px 20px 0", minHeight: 64, ...style }}>
      <div style={{ minWidth: 0 }}>
        {eyebrow ? <div style={{ font: "var(--eg-text-eyebrow)", letterSpacing: "var(--eg-tracking-eyebrow)", textTransform: "uppercase", color: "var(--eg-ink-on-dark-muted)", marginBottom: 4 }}>{eyebrow}</div> : null}
        <div style={{ font: "var(--eg-text-display)", letterSpacing: "var(--eg-tracking-display)", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "0 0 auto" }}>
        {right}
        {onNotifications ? (
          <button type="button" onClick={onNotifications} style={{ position: "relative", border: "none", background: "transparent", padding: 0, cursor: "pointer", display: "flex" }}>
            <IconChip name="notifications-outline" tone="dark" size={40} />
            {notificationCount > 0 ? (
              <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: "var(--eg-grad-match)", border: "1.5px solid rgba(255,255,255,0.7)", color: "#fff", fontSize: 10, fontWeight: 800, fontFamily: "var(--eg-font-brand)", display: "flex", alignItems: "center", justifyContent: "center" }}>{notificationCount}</span>
            ) : null}
          </button>
        ) : null}
      </div>
    </div>
  );
}
