import React from "react";

/* EasyGame Number Tile — jersey number on a gradient tile with the signature cut corner.
   Replaces the generic circle avatar wherever an athlete is identified by number. */
const TONES = {
  navy: { bg: "var(--eg-grad-navy)", glow: "none" },
  action: { bg: "var(--eg-grad-action)", glow: "var(--eg-glow-primary)" },
  success: { bg: "var(--eg-grad-success)", glow: "var(--eg-glow-success)" },
  match: { bg: "var(--eg-grad-match)", glow: "none" },
  muted: { bg: "rgba(11,26,58,0.08)", glow: "none" },
};

export function NumberTile({ number, size = 44, tone = "navy", label, style }) {
  const t = TONES[tone] || TONES.navy;
  const muted = tone === "muted";
  return (
    <div
      style={{
        width: size,
        height: size,
        flex: "0 0 auto",
        borderRadius: size >= 56 ? "var(--eg-corner)" : "var(--eg-corner-sm)",
        background: t.bg,
        border: "1px solid " + (muted ? "var(--eg-hairline)" : "rgba(255,255,255,0.28)"),
        boxShadow: (muted ? "var(--eg-highlight-top)" : "var(--eg-highlight-top-dark)") + (t.glow !== "none" ? ", " + t.glow : ""),
        color: muted ? "var(--eg-ink-faint)" : "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--eg-font-brand)",
        fontWeight: 800,
        fontSize: Math.round(size * 0.42),
        lineHeight: 1,
        letterSpacing: "-0.03em",
        fontVariantNumeric: "tabular-nums",
        transition: "background var(--eg-duration-fast), box-shadow var(--eg-duration-fast)",
        ...style,
      }}
    >
      {number}
      {label ? <span style={{ fontSize: Math.max(8, Math.round(size * 0.18)), fontWeight: 700, letterSpacing: "0.1em", opacity: 0.75, marginTop: 2 }}>{label}</span> : null}
    </div>
  );
}
