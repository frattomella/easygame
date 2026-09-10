import React from "react";

const CDN = "https://cdn.jsdelivr.net/npm/ionicons@7.4.0/dist/ionicons/svg/";

/** Ionicons glyph (the app uses @expo/vector-icons/Ionicons). The SVG is masked so it
 *  takes `color` directly — no web component or icon font needed.
 *  Set `window.EG_ICON_BASE` to the relative path of a local copy of the glyphs
 *  (this system ships them in `assets/icons/`); otherwise they load from the CDN. */
export function Icon({ name, size = 20, color = "var(--eg-icon-default)", style }) {
  const base = (typeof window !== "undefined" && window.EG_ICON_BASE) || CDN;
  const url = "url(" + base + name + ".svg)";
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        flex: "0 0 auto",
        background: color,
        WebkitMaskImage: url,
        maskImage: url,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        ...style,
      }}
    />
  );
}
