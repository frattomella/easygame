import React from "react";
import { Icon } from "../core/Icon.jsx";

/* EasyGame Floating Dock — dark glass pill with an inner highlight; the active tab is a raised
   action-gradient "puck" that shows icon + label, inactive tabs show the icon only. */
export function TabBar({ items = [], activeKey, onChange, style }) {
  return (
    <div
      style={{
        height: 68,
        borderRadius: 999,
        background: "var(--eg-glass-dark-bg)",
        backdropFilter: "var(--eg-glass-blur)",
        WebkitBackdropFilter: "var(--eg-glass-blur)",
        border: "1px solid var(--eg-glass-dark-border)",
        boxShadow: "var(--eg-shadow-dock)",
        display: "flex",
        alignItems: "center",
        padding: 8,
        gap: 4,
        ...style,
      }}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange && onChange(item.key)}
            aria-label={item.label}
            style={{
              flex: active ? "0 0 auto" : 1,
              minWidth: 44,
              height: 52,
              padding: active ? "0 18px 0 14px" : 0,
              borderRadius: 999,
              border: active ? "1px solid rgba(255,255,255,0.3)" : "1px solid transparent",
              background: active ? "var(--eg-grad-action)" : "transparent",
              boxShadow: active ? "var(--eg-highlight-top-dark), var(--eg-glow-primary)" : "none",
              color: active ? "#fff" : "rgba(255,255,255,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: "pointer",
              transition: "flex var(--eg-duration-fast) var(--eg-ease-spring), background var(--eg-duration-fast), color var(--eg-duration-fast)",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <Icon name={active ? item.icon : item.icon + "-outline"} size={22} color={active ? "#fff" : "rgba(255,255,255,0.6)"} />
            {active ? <span style={{ fontFamily: "var(--eg-font-brand)", fontSize: 12, fontWeight: 700, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>{item.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
