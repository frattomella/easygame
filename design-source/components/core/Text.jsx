import React from "react";

const STYLES = {
  display: { font: "var(--eg-text-display)", letterSpacing: "var(--eg-tracking-display)" },
  h1: { font: "var(--eg-text-h1)", letterSpacing: "var(--eg-tracking-display)" },
  h2: { font: "var(--eg-text-h2)", letterSpacing: "var(--eg-tracking-display)" },
  h3: { font: "var(--eg-text-h3)", letterSpacing: "var(--eg-tracking-display)" },
  h4: { font: "var(--eg-text-h4)", letterSpacing: "-0.01em" },
  body: { font: "var(--eg-text-body)" },
  small: { font: "var(--eg-text-small)" },
  caption: { font: "var(--eg-text-caption)" },
  eyebrow: { font: "var(--eg-text-eyebrow)", letterSpacing: "var(--eg-tracking-eyebrow)", textTransform: "uppercase" },
  numeral: { font: "800 22px/24px var(--eg-font-brand)", letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" },
};

const TONES = {
  primary: "var(--eg-ink)",
  secondary: "var(--eg-ink-muted)",
  faint: "var(--eg-ink-faint)",
  link: "var(--eg-text-link)",
  onBrand: "var(--eg-ink-on-dark)",
  onBrandMuted: "var(--eg-ink-on-dark-muted)",
  onBrandFaint: "var(--eg-ink-on-dark-faint)",
};

export function Text({ children, type = "body", tone = "primary", weight, as = "div", style, ...rest }) {
  return React.createElement(as, { style: { ...STYLES[type], color: TONES[tone] || TONES.primary, ...(weight ? { fontWeight: weight } : null), margin: 0, ...style }, ...rest }, children);
}
