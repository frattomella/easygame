"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Un modulo online di EasyGame dentro la pagina del sito. Il modulo resta
 * quello del gestionale (stesso rate limit, stessa validazione, stessa coda
 * delle pratiche): qui c'e solo la finestra che lo mostra e che si allunga
 * quando il modulo comunica la sua altezza — un messaggio accettato **solo**
 * dall'origine del gestionale.
 */
export function FormEmbed({ src, origin, title, initialHeight }: { src: string; origin: string; title: string; initialHeight: number }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(initialHeight);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!origin || event.origin !== origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: string; height?: number };
      if (data?.type === "eg-form:height" && typeof data.height === "number" && data.height > 200 && data.height < 10000) {
        setHeight(Math.ceil(data.height));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin]);
  return (
    <iframe
      ref={frameRef}
      src={src}
      title={title}
      className="w-full rounded-ws border border-ws-border bg-white"
      style={{ height: `${height}px` }}
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
