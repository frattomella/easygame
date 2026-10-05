"use client";

import { useEffect, useId, useRef, useState } from "react";

export type MobileMenuItem = { label: string; href: string | null; external?: boolean; children?: MobileMenuItem[] };

/**
 * Il menu del telefono: un bottone che apre un pannello. Si chiude con Esc,
 * con un clic su una voce e tornando al bottone; il focus va al primo
 * elemento quando si apre. Su tablet e desktop non esiste: il menu e quello
 * dell'intestazione, senza JavaScript.
 */
export function MobileMenu({ items, cta, tone }: { items: MobileMenuItem[]; cta?: { label: string; href: string } | null; tone: "light" | "dark" }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const first = panelRef.current?.querySelector<HTMLElement>("a,button");
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const linkClass = "block rounded-ws px-3 py-3 text-lg font-semibold hover:bg-ws-muted";

  /* Sotto i 1024 px: a 768 sei voci e un bottone schiacciavano il nome della societa. */
  return (
    <div className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-ws ${tone === "dark" ? "text-white" : "text-ws-fg"}`}
      >
        <span className="sr-only">{open ? "Chiudi il menu" : "Apri il menu"}</span>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          {open ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
        </svg>
      </button>
      {open ? (
        <div ref={panelRef} id={panelId} className="fixed inset-x-0 bottom-0 top-16 z-50 md:top-20 overflow-y-auto bg-ws-bg p-4 text-ws-fg shadow-xl">
          <nav aria-label="Menu principale">
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={`${item.label}-${item.href}`}>
                  {item.href ? (
                    <a href={item.href} className={linkClass} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined} onClick={() => setOpen(false)}>
                      {item.label}
                    </a>
                  ) : (
                    <p className="px-3 pt-4 text-sm font-semibold uppercase tracking-wider text-ws-muted-fg">{item.label}</p>
                  )}
                  {item.children?.length ? (
                    <ul className="ml-3 border-l border-ws-border pl-3">
                      {item.children.map((child) => (
                        <li key={`${child.label}-${child.href}`}>
                          {child.href ? (
                            <a href={child.href} className="block rounded-ws px-3 py-2 hover:bg-ws-muted" target={child.external ? "_blank" : undefined} rel={child.external ? "noopener noreferrer" : undefined} onClick={() => setOpen(false)}>
                              {child.label}
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
            {cta ? (
              <a href={cta.href} className="ws-btn ws-btn-primary mt-6 w-full" onClick={() => setOpen(false)}>
                {cta.label}
              </a>
            ) : null}
          </nav>
        </div>
      ) : null}
    </div>
  );
}
