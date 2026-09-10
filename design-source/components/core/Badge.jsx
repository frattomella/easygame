import React from "react";

/* EasyGame Status Pill: ring-dot (the "e" ring) + tracked uppercase label on a tinted glass pill. */
const V = {
  default: { fg: "var(--eg-ink-muted)", ring: "rgba(11,26,58,0.35)", bg: "rgba(11,26,58,0.06)", bd: "rgba(11,26,58,0.1)" },
  primary: { fg: "#1d4ed8", ring: "#2563eb", bg: "rgba(37,99,235,0.1)", bd: "rgba(37,99,235,0.28)" },
  success: { fg: "#15803d", ring: "#22c55e", bg: "rgba(34,197,94,0.12)", bd: "rgba(34,197,94,0.3)" },
  warning: { fg: "#b45309", ring: "#f59e0b", bg: "rgba(245,158,11,0.13)", bd: "rgba(245,158,11,0.32)" },
  destructive: { fg: "#b91c1c", ring: "#ef4444", bg: "rgba(239,68,68,0.12)", bd: "rgba(239,68,68,0.3)" },
  match: { fg: "#c2410c", ring: "#f97316", bg: "rgba(249,115,22,0.12)", bd: "rgba(249,115,22,0.3)" },
  onDark: { fg: "#fff", ring: "rgba(255,255,255,0.9)", bg: "rgba(255,255,255,0.12)", bd: "rgba(255,255,255,0.22)" },
};

export function Badge({ label, variant = "default", small = false, dot = true, filled, style }) {
  const c = V[variant] || V.default;
  const isFilled = filled !== undefined ? filled : variant !== "default";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: small ? 5 : 6,
        background: c.bg,
        color: c.fg,
        border: "1px solid " + c.bd,
        fontFamily: "var(--eg-font-brand)",
        fontSize: small ? 10 : 11,
        lineHeight: 1,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        padding: small ? "4px 8px 4px 7px" : "6px 10px 6px 8px",
        borderRadius: "var(--eg-corner-pill)",
        boxShadow: "var(--eg-highlight-top)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {dot ? <span style={{ width: small ? 7 : 8, height: small ? 7 : 8, borderRadius: "50%", border: "2px solid " + c.ring, background: isFilled ? c.ring : "transparent", boxSizing: "border-box", flex: "0 0 auto" }} /> : null}
      {label}
    </span>
  );
}
