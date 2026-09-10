import React from "react";

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ src, name, size = 48, number, showNumber = false, style }) {
  const label = name ? initials(name) : showNumber && number !== undefined ? String(number) : "?";
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "0 0 auto", ...style }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          overflow: "hidden",
          background: src ? "var(--eg-surface-secondary)" : "var(--eg-primary)",
          color: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--eg-font-brand)",
          fontWeight: "var(--eg-weight-semibold)",
          fontSize: Math.round(size * 0.35),
        }}
      >
        {src ? <img src={src} alt={name || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : label}
      </div>
      {showNumber && number !== undefined && src ? (
        <div style={{ position: "absolute", right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, background: "var(--eg-primary)", color: "#FFFFFF", fontSize: 10, fontWeight: "var(--eg-weight-bold)", fontFamily: "var(--eg-font-brand)", display: "flex", alignItems: "center", justifyContent: "center" }}>{number}</div>
      ) : null}
    </div>
  );
}
