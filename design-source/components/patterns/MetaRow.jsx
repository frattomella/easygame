import React from "react";
import { Icon } from "../core/Icon.jsx";

export function MetaRow({ icon, children, color = "var(--eg-text-secondary)", style }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--eg-space-sm)", marginTop: "var(--eg-space-sm)", ...style }}>
      <Icon name={icon} size={16} color={color} />
      <span style={{ font: "var(--eg-text-small)", color: "var(--eg-text-secondary)" }}>{children}</span>
    </div>
  );
}
