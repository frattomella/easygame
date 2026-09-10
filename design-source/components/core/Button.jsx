import React from "react";
import { Icon } from "./Icon.jsx";

const HEIGHTS = { sm: 40, md: 52, lg: 60 };

/* EasyGame Action Surface: gradient fill, inner highlight, glow, optional trailing arrow chip. */
function look(variant, disabled) {
  if (disabled) return { bg: "rgba(11,26,58,0.06)", fg: "var(--eg-ink-faint)", border: "1px solid var(--eg-hairline)", shadow: "none" };
  switch (variant) {
    case "secondary": return { bg: "var(--eg-glass-bg-strong)", fg: "var(--eg-ink)", border: "1px solid var(--eg-glass-border)", shadow: "var(--eg-highlight-top), var(--eg-shadow-glass)" };
    case "outline": return { bg: "rgba(255,255,255,0.35)", fg: "var(--eg-primary)", border: "1.5px solid rgba(37,99,235,0.45)", shadow: "var(--eg-highlight-top)" };
    case "ghost": return { bg: "transparent", fg: "var(--eg-primary)", border: "1px solid transparent", shadow: "none" };
    case "destructive": return { bg: "var(--eg-grad-destructive)", fg: "#fff", border: "1px solid rgba(255,255,255,0.25)", shadow: "var(--eg-highlight-top-dark), var(--eg-glow-destructive)" };
    case "success": return { bg: "var(--eg-grad-success)", fg: "#fff", border: "1px solid rgba(255,255,255,0.25)", shadow: "var(--eg-highlight-top-dark), var(--eg-glow-success)" };
    case "onDark": return { bg: "rgba(255,255,255,0.12)", fg: "#fff", border: "1px solid rgba(255,255,255,0.22)", shadow: "var(--eg-highlight-top-dark)" };
    default: return { bg: "var(--eg-grad-action)", fg: "#fff", border: "1px solid rgba(255,255,255,0.28)", shadow: "var(--eg-highlight-top-dark), var(--eg-glow-primary)" };
  }
}

export function Button({ children, variant = "primary", size = "md", disabled = false, loading = false, fullWidth = false, icon, trailingIcon, onClick, style, ...rest }) {
  const [pressed, setPressed] = React.useState(false);
  const l = look(variant, disabled);
  const inert = disabled || loading;
  const h = HEIGHTS[size] || HEIGHTS.md;
  const small = size === "sm";
  return (
    <button
      type="button"
      disabled={inert}
      onClick={onClick}
      onPointerDown={() => !inert && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        position: "relative",
        fontFamily: "var(--eg-font-brand)",
        fontSize: small ? 13 : 15,
        lineHeight: 1,
        fontWeight: 700,
        letterSpacing: "0.01em",
        height: h,
        padding: small ? "0 14px" : "0 20px",
        borderRadius: small ? "var(--eg-corner-xs)" : "var(--eg-corner-sm)",
        background: l.bg,
        color: l.fg,
        border: l.border,
        boxShadow: pressed ? "var(--eg-highlight-top-dark)" : l.shadow,
        width: fullWidth ? "100%" : "auto",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        cursor: inert ? "default" : "pointer",
        transform: pressed ? "scale(0.97) translateY(1px)" : "scale(1)",
        filter: pressed && !disabled ? "brightness(1.08)" : "none",
        transition: "transform var(--eg-duration-press) var(--eg-ease-spring), box-shadow var(--eg-duration-fast), filter var(--eg-duration-fast)",
        WebkitTapHighlightColor: "transparent",
        backdropFilter: variant === "secondary" || variant === "onDark" ? "var(--eg-glass-blur)" : "none",
        ...style,
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} size={small ? 16 : 18} color={l.fg} /> : null}
      {loading ? <Spinner color={l.fg} /> : <span style={{ flex: fullWidth ? 1 : "0 1 auto", textAlign: fullWidth && trailingIcon ? "left" : "center" }}>{children}</span>}
      {trailingIcon ? (
        <span style={{ width: small ? 24 : 30, height: small ? 24 : 30, borderRadius: "var(--eg-corner-xs)", background: variant === "primary" || variant === "destructive" || variant === "success" ? "rgba(255,255,255,0.18)" : "rgba(37,99,235,0.1)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--eg-highlight-top-dark)" }}>
          <Icon name={trailingIcon} size={small ? 14 : 16} color={l.fg} />
        </span>
      ) : null}
    </button>
  );
}

function Spinner({ color }) {
  return (
    <span style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid " + color, borderTopColor: "transparent", display: "inline-block", animation: "eg-spin 700ms linear infinite" }}>
      <style>{"@keyframes eg-spin{to{transform:rotate(360deg)}}"}</style>
    </span>
  );
}
