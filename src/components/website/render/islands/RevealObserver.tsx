"use client";

import { useEffect } from "react";

/**
 * Le animazioni di ingresso, in un'isola sola per tutta la pagina.
 *
 * Senza JavaScript il contenuto e visibile e fermo; con JavaScript la classe
 * `ws-js` nasconde gli elementi animati finche non entrano nella finestra.
 * Con `prefers-reduced-motion` non si anima niente (il CSS lo garantisce
 * anche se questo componente non girasse).
 */
export function RevealObserver() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-ws-anim]"));
    if (reduced || !("IntersectionObserver" in window) || !elements.length) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }
    root.classList.add("ws-js");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  return null;
}
