"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Un carosello accessibile, costruito sopra lo scorrimento nativo.
 *
 * Senza JavaScript e una fila scorrevole con l'aggancio (`scroll-snap`): si
 * usa con il dito, con la rotella, con la tastiera. Con JavaScript arrivano i
 * bottoni precedente/successivo e, se il club lo chiede, lo scorrimento
 * automatico — che si ferma al passaggio del mouse, al focus, con un bottone
 * di pausa e con `prefers-reduced-motion` (WCAG 2.2.2).
 */
export function Carousel({
  children,
  label,
  autoplay = false,
  interval = 6,
  itemWidth,
}: {
  children: ReactNode;
  label: string;
  autoplay?: boolean;
  interval?: number;
  itemWidth?: { base: string; md: string; lg: string };
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const step = useCallback((direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const first = track.firstElementChild as HTMLElement | null;
    const width = first ? first.getBoundingClientRect().width + 16 : track.clientWidth;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    if (direction === 1 && atEnd) track.scrollTo({ left: 0, behavior: "smooth" });
    else track.scrollBy({ left: direction * width, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!autoplay || paused || reduced) return;
    const timer = window.setInterval(() => step(1), Math.max(3, interval) * 1000);
    return () => window.clearInterval(timer);
  }, [autoplay, paused, reduced, interval, step]);

  const style = itemWidth
    ? ({ "--ws-carousel-item": itemWidth.base, "--ws-carousel-item-md": itemWidth.md, "--ws-carousel-item-lg": itemWidth.lg } as React.CSSProperties)
    : undefined;

  return (
    <div
      className="relative"
      role="region"
      aria-roledescription="carosello"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div ref={trackRef} className="ws-carousel-track" style={style} tabIndex={0}>
        {children}
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        {autoplay && !reduced ? (
          <button type="button" onClick={() => setPaused((value) => !value)} className="ws-btn ws-btn-outline ws-btn-sm" aria-pressed={paused}>
            {paused ? "Riprendi" : "Pausa"}
          </button>
        ) : null}
        <button type="button" onClick={() => step(-1)} className="ws-btn ws-btn-outline ws-btn-sm" aria-label="Precedente">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <button type="button" onClick={() => step(1)} className="ws-btn ws-btn-outline ws-btn-sm" aria-label="Successivo">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>
    </div>
  );
}
