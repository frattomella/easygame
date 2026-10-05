"use client";

import { useState } from "react";

/**
 * **Un contenuto esterno che si carica solo dopo un clic** (ADR-0200 §7).
 *
 * Prima del clic non parte nessuna richiesta verso il servizio — niente
 * cookie di terze parti, niente tracciamento — e il visitatore vede cosa sta
 * per caricare e da chi. L'`src` e gia stato costruito sul server da un
 * servizio dell'allowlist (`parseEmbedUrl`): qui non si compone niente.
 */
export function ConsentFrame({
  src,
  title,
  provider,
  allow,
  aspect,
  height,
  thumbnail,
}: {
  src: string;
  title: string;
  provider: string;
  allow: string;
  aspect?: string;
  height?: number;
  thumbnail?: string | null;
}) {
  const [loaded, setLoaded] = useState(false);
  const style = aspect ? { aspectRatio: aspect } : { height: `${height || 420}px` };
  if (loaded) {
    return (
      <div className="overflow-hidden rounded-ws" style={style}>
        <iframe
          src={src}
          title={title}
          allow={allow}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
          className="h-full w-full border-0"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <div className="relative flex items-center justify-center overflow-hidden rounded-ws bg-ws-dark text-ws-dark-fg" style={style}>
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" loading="lazy" referrerPolicy="no-referrer" />
      ) : null}
      <div className="relative z-10 max-w-md p-6 text-center">
        <p className="font-semibold">{title}</p>
        <p className="mt-2 text-sm opacity-90">Il contenuto e ospitato da {provider}. Caricandolo accetti che {provider} riceva i dati della tua visita.</p>
        <button type="button" className="ws-btn ws-btn-primary mt-4" onClick={() => setLoaded(true)}>
          Carica il contenuto
        </button>
      </div>
    </div>
  );
}
