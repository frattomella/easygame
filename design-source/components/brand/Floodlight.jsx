import React from "react";

/* EasyGame layered background: navy "night sky" with two floodlight pools and faint pitch lines
   over the top zone, fading into the light "pitch" ground. Fixed behind every screen. */
export function Floodlight({ skyHeight = 300, children, style }) {
  return (
    <div style={{ position: "relative", background: "var(--eg-mist-50)", overflow: "hidden", ...style }}>
      <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 0, height: skyHeight, background: "var(--eg-grad-sky)" }} />
      <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 0, height: skyHeight, background: "var(--eg-floodlight-a), var(--eg-floodlight-b)" }} />
      <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 0, height: skyHeight, background: "var(--eg-pitch-lines)", maskImage: "linear-gradient(180deg, rgba(0,0,0,0.9), transparent)", WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,0.9), transparent)" }} />
      <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: skyHeight - 1, height: 120, background: "linear-gradient(180deg, var(--eg-navy-800) 0%, rgba(18,38,90,0) 100%)", opacity: 0.35 }} />
      <div aria-hidden="true" style={{ position: "absolute", left: "-20%", right: "-20%", top: skyHeight + 40, height: 260, background: "radial-gradient(50% 60% at 50% 0%, rgba(59,130,246,0.18), transparent 70%)" }} />
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}
