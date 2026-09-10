import React from "react";
import { Icon } from "./Icon.jsx";

/* Glass field: frosted white, cut corner, hairline that turns into the action gradient ring on focus. */
export function Input({ label, error, value, placeholder, leftIcon, rightIcon, onRightIconPress, onChange, type = "text", style }) {
  const [focused, setFocused] = React.useState(false);
  const ring = error ? "0 0 0 2px rgba(239,68,68,0.35)" : focused ? "0 0 0 2px rgba(37,99,235,0.35), var(--eg-glow-primary)" : "none";
  const border = error ? "1px solid #ef4444" : focused ? "1px solid #2563eb" : "1px solid var(--eg-hairline-strong)";
  return (
    <div style={{ marginBottom: "var(--eg-space-lg)", ...style }}>
      {label ? (
        <div style={{ font: "var(--eg-text-eyebrow)", letterSpacing: "var(--eg-tracking-eyebrow)", textTransform: "uppercase", color: "var(--eg-ink-faint)", marginBottom: 6 }}>{label}</div>
      ) : null}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 52,
          background: "var(--eg-glass-bg-strong)",
          backdropFilter: "var(--eg-glass-blur)",
          border,
          borderRadius: "var(--eg-corner-sm)",
          boxShadow: "var(--eg-highlight-top), " + ring,
          transition: "border-color var(--eg-duration-fast), box-shadow var(--eg-duration-fast)",
        }}
      >
        {leftIcon ? <span style={{ margin: "0 10px 0 14px", display: "flex" }}><Icon name={leftIcon} size={20} color={focused ? "#2563eb" : "var(--eg-ink-faint)"} /></span> : null}
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ flex: 1, minWidth: 0, height: "100%", border: "none", outline: "none", background: "transparent", fontFamily: "var(--eg-font-brand)", fontSize: 16, fontWeight: 500, color: "var(--eg-ink)", paddingLeft: leftIcon ? 0 : 16, paddingRight: 16 }}
        />
        {rightIcon ? (
          <button type="button" onClick={onRightIconPress} style={{ border: "none", background: "transparent", padding: "0 14px", height: "100%", cursor: "pointer", display: "flex", alignItems: "center" }}>
            <Icon name={rightIcon} size={20} color="var(--eg-ink-faint)" />
          </button>
        ) : null}
      </div>
      {error ? <div style={{ font: "var(--eg-text-small)", fontWeight: 600, color: "#b91c1c", marginTop: 6 }}>{error}</div> : null}
    </div>
  );
}
