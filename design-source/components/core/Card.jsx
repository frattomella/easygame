import React from "react";

/* EasyGame glass panel: frosted white, signature cut corner, inner top highlight, layered shadow.
   tone="dark" gives navy glass for the sky zone. `stripe` paints the 3px module stripe along the top edge. */
export function Card({ children, title, eyebrow, description, stripe, tone = "glass", noPadding = false, elevated = false, onClick, style }) {
  const [pressed, setPressed] = React.useState(false);
  const interactive = Boolean(onClick);
  const dark = tone === "dark";
  const solid = tone === "solid";
  return (
    <div
      onClick={onClick}
      onPointerDown={() => interactive && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        position: "relative",
        background: dark ? "var(--eg-glass-dark-bg)" : solid ? "#ffffff" : "var(--eg-glass-bg)",
        backdropFilter: solid ? "none" : "var(--eg-glass-blur)",
        WebkitBackdropFilter: solid ? "none" : "var(--eg-glass-blur)",
        border: "1px solid " + (dark ? "var(--eg-glass-dark-border)" : "var(--eg-glass-border)"),
        borderRadius: "var(--eg-corner)",
        padding: noPadding ? 0 : "var(--eg-space-lg)",
        boxShadow: (dark ? "var(--eg-highlight-top-dark), " : "var(--eg-highlight-top), ") + (elevated ? "var(--eg-shadow-glass-raised)" : "var(--eg-shadow-glass)"),
        color: dark ? "var(--eg-ink-on-dark)" : "var(--eg-ink)",
        cursor: interactive ? "pointer" : "default",
        transform: pressed ? "scale(0.985)" : "scale(1)",
        filter: pressed ? "brightness(1.03)" : "none",
        transition: "transform var(--eg-duration-press) var(--eg-ease-spring), filter var(--eg-duration-fast)",
        overflow: "hidden",
        ...style,
      }}
    >
      {stripe ? <div style={{ position: "absolute", top: 0, left: 22, right: 22, height: 3, borderRadius: "0 0 3px 3px", background: stripe }} /> : null}
      {eyebrow ? <div style={{ font: "var(--eg-text-eyebrow)", letterSpacing: "var(--eg-tracking-eyebrow)", textTransform: "uppercase", color: dark ? "var(--eg-ink-on-dark-muted)" : "var(--eg-ink-faint)", marginBottom: 6 }}>{eyebrow}</div> : null}
      {title ? <div style={{ font: "var(--eg-text-h4)", letterSpacing: "var(--eg-tracking-display)", marginBottom: description ? 2 : "var(--eg-space-sm)" }}>{title}</div> : null}
      {description ? <div style={{ font: "var(--eg-text-small)", color: dark ? "var(--eg-ink-on-dark-muted)" : "var(--eg-ink-muted)", marginBottom: "var(--eg-space-sm)" }}>{description}</div> : null}
      {children}
    </div>
  );
}
