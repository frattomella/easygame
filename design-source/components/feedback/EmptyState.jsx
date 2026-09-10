import React from "react";
import { Button } from "../core/Button.jsx";

export function EmptyState({ illustration, title, message, actionLabel, onAction, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "var(--eg-space-3xl)", ...style }}>
      {illustration ? <img src={illustration} alt="" style={{ width: 180, height: 180, objectFit: "contain", borderRadius: "var(--eg-radius-lg)", marginBottom: "var(--eg-space-2xl)" }} /> : null}
      <div style={{ font: "var(--eg-text-h4)", color: "var(--eg-text-primary)", marginBottom: "var(--eg-space-sm)" }}>{title}</div>
      {message ? <div style={{ font: "var(--eg-text-body)", color: "var(--eg-text-secondary)", marginBottom: "var(--eg-space-2xl)", maxWidth: 320 }}>{message}</div> : null}
      {actionLabel && onAction ? <Button onClick={onAction} style={{ padding: "0 var(--eg-space-3xl)" }}>{actionLabel}</Button> : null}
    </div>
  );
}
