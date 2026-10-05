"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { parseEditorMessage, type EditorAction, type EditorTarget, type ToPreviewMessage } from "@/lib/website/editor-protocol";
import type { WebsiteDevice } from "@/lib/website/document/types";

/**
 * **L'anteprima dentro l'editor** (ADR-0200 §5).
 *
 * Un iframe dello stesso origine sull'anteprima privata, largo quanto il
 * dispositivo scelto: le media query del sito funzionano come sul telefono
 * vero. Se lo spazio non basta, l'iframe si rimpicciolisce con una scala e
 * resta largo 1280, 768 o 375 pixel.
 *
 * Parla con il probe solo attraverso `editor-protocol`: controlla origine,
 * finestra e forma di ogni messaggio.
 */

export const DEVICE_WIDTHS: Record<WebsiteDevice, number> = { desktop: 1280, tablet: 768, mobile: 375 };

export function PreviewFrame({
  src,
  device,
  selection,
  selectionFromPreview,
  hover,
  revision,
  onSelect,
  onAction,
  onNavigate,
}: {
  src: string;
  device: WebsiteDevice;
  selection: EditorTarget | null;
  /** Vero quando la selezione e nata da un clic nell'anteprima: non serve rimandarla. */
  selectionFromPreview: React.MutableRefObject<boolean>;
  hover: EditorTarget | null;
  revision: number;
  onSelect: (target: EditorTarget | null) => void;
  onAction: (action: EditorAction, target: EditorTarget) => void;
  onNavigate: (path: string) => void;
}) {
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = React.useState({ width: 0, height: 0 });
  const [loading, setLoading] = React.useState(true);
  const ready = React.useRef(false);
  const handlers = React.useRef({ onSelect, onAction, onNavigate });
  handlers.current = { onSelect, onAction, onNavigate };

  const post = React.useCallback((message: ToPreviewMessage) => {
    const target = frameRef.current?.contentWindow;
    if (target && ready.current) target.postMessage(message, window.location.origin);
  }, []);

  React.useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      const message = parseEditorMessage(event.data);
      if (!message) return;
      switch (message.type) {
        case "eg-website:ready":
          ready.current = true;
          setLoading(false);
          break;
        case "eg-website:rendered":
          setLoading(false);
          break;
        case "eg-website:select":
          handlers.current.onSelect(message.target);
          break;
        case "eg-website:action":
          handlers.current.onAction(message.action, message.target);
          break;
        case "eg-website:navigate":
          handlers.current.onNavigate(message.path);
          break;
        default:
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  /* Un indirizzo nuovo: si aspetta di nuovo il «pronto» del probe. */
  React.useEffect(() => {
    ready.current = false;
    setLoading(true);
  }, [src]);

  React.useEffect(() => {
    if (revision > 0 && ready.current) {
      setLoading(true);
      post({ type: "eg-website:refresh" });
    }
  }, [revision, post]);

  React.useEffect(() => {
    if (selectionFromPreview.current) {
      selectionFromPreview.current = false;
      return;
    }
    if (selection) post({ type: "eg-website:scroll-to", target: selection });
    else post({ type: "eg-website:select", target: null });
  }, [selection, post, selectionFromPreview]);

  React.useEffect(() => {
    post({ type: "eg-website:hover", target: hover });
  }, [hover, post]);

  const width = DEVICE_WIDTHS[device];
  const available = Math.max(0, box.width - 32);
  const scale = available > 0 && available < width ? available / width : 1;
  const height = box.height > 0 ? (box.height - 32) / scale : 800;

  return (
    <div ref={boxRef} className="relative h-full w-full overflow-hidden bg-[#e9edf5]">
      <div
        className="absolute left-1/2 top-4 origin-top overflow-hidden rounded-lg bg-white shadow-[0_8px_30px_rgba(11,26,58,.18)]"
        style={{ width, height, transform: `translateX(-50%) scale(${scale})` }}
      >
        <iframe
          ref={frameRef}
          src={src}
          title="Anteprima della pagina"
          className="h-full w-full border-0"
          onLoad={() => window.setTimeout(() => setLoading(false), 1500)}
        />
      </div>
      {loading ? (
        <div className="pointer-events-none absolute right-4 top-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-egw-ink-62 shadow" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Aggiorno l&apos;anteprima
        </div>
      ) : null}
      {scale < 1 ? (
        <span className="absolute bottom-3 right-4 rounded bg-white/80 px-2 py-0.5 text-[11px] text-egw-ink-62">
          {width}px · {Math.round(scale * 100)}%
        </span>
      ) : null}
    </div>
  );
}
