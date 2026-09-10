import React from "react";

/** The EasyGame brand surface: 135° royal-blue gradient with a slate scrim.
 *  Used behind app bars, the floating tab bar and brand headers. */
export function BrandGradient({ radius = 0, overlayOpacity = 0.08, children, style }) {
  return (
    <div style={{ position: "relative", borderRadius: radius, overflow: "hidden", background: "var(--eg-brand-gradient)", ...style }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(15,23,42," + overlayOpacity + ")", borderRadius: radius, pointerEvents: "none" }} />
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}
