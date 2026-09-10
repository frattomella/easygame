import React from "react";
import { Badge } from "../core/Badge.jsx";
import { Icon } from "../core/Icon.jsx";

/* EasyGame Event Card — the schedule unit for trainings and matches.
   Glass panel · 3px module stripe on the top edge · left TIME RAIL (big tabular start time,
   end time beneath, hairline divider) · title + status pill · metadata rows · action row. */
export function EventCard({ time, endTime, dateLabel, title, pill, pillVariant = "default", stripe = "var(--eg-grad-action)", meta = [], status, cancelled = false, actions, onClick, style }) {
  const [pressed, setPressed] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onPointerDown={() => onClick && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        position: "relative",
        display: "flex",
        background: cancelled ? "rgba(255,255,255,0.5)" : "var(--eg-glass-bg)",
        backdropFilter: "var(--eg-glass-blur)",
        WebkitBackdropFilter: "var(--eg-glass-blur)",
        border: cancelled ? "1px dashed var(--eg-hairline-strong)" : "1px solid var(--eg-glass-border)",
        borderRadius: "var(--eg-corner)",
        boxShadow: cancelled ? "none" : "var(--eg-highlight-top), var(--eg-shadow-glass)",
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        transform: pressed ? "scale(0.985)" : "scale(1)",
        transition: "transform var(--eg-duration-press) var(--eg-ease-spring)",
        opacity: cancelled ? 0.82 : 1,
        ...style,
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 22, right: 22, height: 3, borderRadius: "0 0 3px 3px", background: cancelled ? "var(--eg-hairline-strong)" : stripe }} />
      <div style={{ width: 76, flex: "0 0 auto", padding: "18px 0 16px 16px", borderRight: "1px solid var(--eg-hairline)", display: "flex", flexDirection: "column", justifyContent: "flex-start", gap: 2 }}>
        {dateLabel ? <div style={{ font: "var(--eg-text-eyebrow)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--eg-ink-faint)", marginBottom: 4 }}>{dateLabel}</div> : null}
        <div style={{ font: "800 22px/24px var(--eg-font-brand)", letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", color: cancelled ? "var(--eg-ink-faint)" : "var(--eg-ink)", textDecoration: cancelled ? "line-through" : "none" }}>{time}</div>
        {endTime ? <div style={{ font: "600 12px/16px var(--eg-font-brand)", fontVariantNumeric: "tabular-nums", color: "var(--eg-ink-faint)" }}>{endTime}</div> : null}
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: "16px 16px 16px 14px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ font: "700 16px/22px var(--eg-font-brand)", letterSpacing: "-0.01em", color: cancelled ? "var(--eg-ink-muted)" : "var(--eg-ink)", minWidth: 0 }}>{title}</div>
          {pill ? <Badge label={pill} variant={pillVariant} small /> : null}
        </div>
        {meta.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {meta.map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name={m.icon} size={15} color={m.color || "var(--eg-ink-faint)"} />
                <span style={{ font: "500 13px/18px var(--eg-font-brand)", color: "var(--eg-ink-muted)" }}>{m.text}</span>
              </div>
            ))}
          </div>
        ) : null}
        {status ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: cancelled ? "#ef4444" : "#22c55e", boxShadow: cancelled ? "0 0 0 3px rgba(239,68,68,0.18)" : "0 0 0 3px rgba(34,197,94,0.18)" }} />
            <span style={{ font: "600 12px/16px var(--eg-font-brand)", color: cancelled ? "#b91c1c" : "#15803d" }}>{status}</span>
          </div>
        ) : null}
        {actions ? <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>{actions}</div> : null}
      </div>
    </div>
  );
}
