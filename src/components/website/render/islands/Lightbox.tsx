"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type LightboxImage = { src: string; alt: string };

/**
 * L'ingrandimento di una galleria, con il `<dialog>` nativo: focus
 * intrappolato, Esc per chiudere, frecce per scorrere. Le miniature arrivano
 * gia renderizzate dal server (`children`): l'isola aggiunge solo il clic.
 */
export function Lightbox({ images, children }: { images: LightboxImage[]; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState<number | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (index !== null && !dialog.open) dialog.showModal();
    if (index === null && dialog.open) dialog.close();
  }, [index]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") setIndex((value) => (value === null ? null : (value + 1) % images.length));
      if (event.key === "ArrowLeft") setIndex((value) => (value === null ? null : (value - 1 + images.length) % images.length));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, images.length]);

  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-lightbox-index]");
    if (!target) return;
    event.preventDefault();
    setIndex(Number(target.dataset.lightboxIndex));
  };

  const current = index === null ? null : images[index];

  return (
    <>
      <div onClick={onClick}>{children}</div>
      <dialog
        ref={dialogRef}
        onClose={() => setIndex(null)}
        className="max-h-[95vh] max-w-[95vw] bg-transparent p-0 backdrop:bg-black/85"
        aria-label="Immagine ingrandita"
      >
        {current ? (
          <figure className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/_next/image?url=${encodeURIComponent(current.src)}&w=1920&q=80`} alt={current.alt} className="max-h-[85vh] max-w-[95vw] object-contain" />
            {current.alt ? <figcaption className="mt-2 text-center text-sm text-white">{current.alt}</figcaption> : null}
            <div className="mt-3 flex justify-center gap-2">
              <button type="button" className="ws-btn ws-btn-secondary ws-btn-sm" onClick={() => setIndex((value) => (value === null ? null : (value - 1 + images.length) % images.length))}>
                Precedente
              </button>
              <button type="button" className="ws-btn ws-btn-secondary ws-btn-sm" onClick={() => setIndex(null)}>
                Chiudi
              </button>
              <button type="button" className="ws-btn ws-btn-secondary ws-btn-sm" onClick={() => setIndex((value) => (value === null ? null : (value + 1) % images.length))}>
                Successiva
              </button>
            </div>
          </figure>
        ) : null}
      </dialog>
    </>
  );
}
