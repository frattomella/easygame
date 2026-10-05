"use client";

import { useState } from "react";

/**
 * Il bottone di pausa dei loghi scorrevoli (WCAG 2.2.2: un contenuto che si
 * muove per piu di cinque secondi deve poter essere fermato). Agisce sul
 * contenitore indicato, con un attributo che il CSS legge: lo scorrimento
 * resta tutto CSS.
 */
export function MarqueePause({ targetId }: { targetId: string }) {
  const [paused, setPaused] = useState(false);
  const toggle = () => {
    const next = !paused;
    setPaused(next);
    document.getElementById(targetId)?.setAttribute("data-paused", next ? "true" : "false");
  };
  return (
    <button type="button" onClick={toggle} aria-pressed={paused} aria-controls={targetId} className="ws-btn ws-btn-ghost ws-btn-sm">
      {paused ? "Riprendi lo scorrimento" : "Ferma lo scorrimento"}
    </button>
  );
}
