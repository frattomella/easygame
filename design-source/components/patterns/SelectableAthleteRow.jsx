import React from "react";
import { NumberTile } from "../core/NumberTile.jsx";
import { Icon } from "../core/Icon.jsx";

/* EasyGame Athlete Row — number tile, name, role/state, trailing ring toggle.
   Selection is shown four ways at once: tile tone, ring fill, glass border colour, label. */
export function SelectableAthleteRow({ name, number, role, selected = false, selectedLabel = "Presente", unselectedLabel = "Assente", accent = "success", disabled = false, onToggle, style }) {
  const [pressed, setPressed] = React.useState(false);
  const hex = accent === "primary" ? "#2563eb" : "#22c55e";
  const tone = disabled ? "muted" : selected ? (accent === "primary" ? "action" : "success") : "navy";
  return (
    <div
      onClick={disabled ? undefined : onToggle}
      onPointerDown={() => !disabled && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      role="button"
      aria-pressed={selected}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px 10px 10px",
        minHeight: 64,
        background: selected ? "var(--eg-glass-bg-strong)" : "var(--eg-glass-bg)",
        backdropFilter: "var(--eg-glass-blur)",
        WebkitBackdropFilter: "var(--eg-glass-blur)",
        border: "1px solid " + (selected ? hex + "66" : "var(--eg-glass-border)"),
        borderRadius: "var(--eg-corner-sm)",
        boxShadow: "var(--eg-highlight-top)" + (selected ? ", 0 8px 22px -10px " + hex + "80" : ", 0 2px 8px rgba(11,26,58,0.06)"),
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "default" : "pointer",
        transform: pressed ? "scale(0.985)" : "scale(1)",
        transition: "transform var(--eg-duration-press) var(--eg-ease-spring), border-color var(--eg-duration-fast), box-shadow var(--eg-duration-fast)",
        ...style,
      }}
    >
      <NumberTile number={number} size={44} tone={tone} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "700 15px/20px var(--eg-font-brand)", letterSpacing: "-0.01em", color: "var(--eg-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          {role ? <span style={{ font: "500 12px/16px var(--eg-font-brand)", color: "var(--eg-ink-faint)" }}>{role}</span> : null}
          {role ? <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--eg-ink-faint)" }} /> : null}
          <span style={{ font: "600 12px/16px var(--eg-font-brand)", color: selected ? (accent === "primary" ? "#1d4ed8" : "#15803d") : "var(--eg-ink-muted)" }}>{selected ? selectedLabel : unselectedLabel}</span>
        </div>
      </div>
      <span style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid " + (selected ? hex : "rgba(11,26,58,0.22)"), background: selected ? hex : "rgba(255,255,255,0.6)", boxShadow: selected ? "0 0 0 4px " + hex + "26" : "var(--eg-highlight-top)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", transition: "background var(--eg-duration-fast), border-color var(--eg-duration-fast), box-shadow var(--eg-duration-fast)" }}>
        {selected ? <Icon name="checkmark" size={16} color="#fff" /> : null}
      </span>
    </div>
  );
}
