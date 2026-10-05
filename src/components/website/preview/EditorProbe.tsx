"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  EDITOR_ACTIONS,
  parseEditorMessage,
  type EditorAction,
  type EditorTarget,
  type FromPreviewMessage,
} from "@/lib/website/editor-protocol";

/**
 * **Il probe dell'anteprima** (ADR-0200 §5).
 *
 * Gira solo dentro l'iframe dell'editor, sullo stesso origine. Fa quattro
 * cose, ispirate a `editor-probe.tsx` del Website Builder GPW e riscritte per
 * sezioni e blocchi:
 *
 * 1. **seleziona**: un clic su un blocco (o con Alt su una sezione) lo
 *    seleziona nell'editor invece di seguire i link;
 * 2. **evidenzia**: contorno al passaggio, contorno e barra degli strumenti
 *    sull'elemento selezionato (su/giu, duplica, nascondi, elimina);
 * 3. **naviga**: un link interno chiede all'editor di aprire quella pagina;
 * 4. **si aggiorna**: quando l'editor ha salvato, `router.refresh()` ridisegna
 *    la bozza dal server senza perdere lo scorrimento.
 *
 * Ogni messaggio passa da `parseEditorMessage` e dal controllo dell'origine:
 * un messaggio da un'altra finestra non fa niente.
 */

const STYLE = `
[data-ws-section],[data-ws-block]{cursor:pointer}
[data-ws-hidden="true"]{opacity:.35;outline:2px dashed #94a3b8;outline-offset:-2px}
.eg-probe-hover{outline:2px solid rgba(59,130,246,.55)!important;outline-offset:-2px}
.eg-probe-selected{outline:2px solid #2563eb!important;outline-offset:-2px;position:relative}
.eg-probe-bar{position:absolute;z-index:2147483646;display:flex;gap:2px;align-items:center;background:#1e3a8a;color:#fff;border-radius:6px;padding:2px;font:600 12px/1 system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.25)}
.eg-probe-bar span{padding:6px 8px;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis}
.eg-probe-bar button{all:unset;cursor:pointer;padding:6px 7px;border-radius:4px}
.eg-probe-bar button:hover,.eg-probe-bar button:focus-visible{background:rgba(255,255,255,.18)}
`;

const ACTION_LABELS: Record<EditorAction, string> = {
  up: "↑",
  down: "↓",
  duplicate: "⧉",
  toggle: "👁",
  delete: "✕",
  "add-after": "+",
};

const ACTION_TITLES: Record<EditorAction, string> = {
  up: "Sposta su",
  down: "Sposta giu",
  duplicate: "Duplica",
  toggle: "Nascondi o mostra",
  delete: "Elimina",
  "add-after": "Aggiungi dopo",
};

const selectorFor = (target: EditorTarget) =>
  target.kind === "block" ? `[data-ws-block="${CSS.escape(target.id)}"]` : `[data-ws-section="${CSS.escape(target.id)}"]`;

export function EditorProbe({ pathPrefix, path, pageId, detail }: { pathPrefix: string; path: string; pageId: string; detail: string | null }) {
  const router = useRouter();
  const selected = useRef<EditorTarget | null>(null);
  const bar = useRef<HTMLDivElement | null>(null);
  /* Riposiziona la barra sull'elemento selezionato: serve anche dopo un ridisegno dal server. */
  const reposition = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (window.parent === window) return;
    const origin = window.location.origin;
    const post = (message: FromPreviewMessage) => window.parent.postMessage(message, origin);

    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    const clearClass = (name: string) => document.querySelectorAll(`.${name}`).forEach((element) => element.classList.remove(name));

    const removeBar = () => {
      bar.current?.remove();
      bar.current = null;
    };

    const placeBar = (element: HTMLElement, target: EditorTarget) => {
      removeBar();
      const rect = element.getBoundingClientRect();
      const node = document.createElement("div");
      node.className = "eg-probe-bar";
      node.setAttribute("role", "toolbar");
      node.setAttribute("aria-label", "Azioni sull'elemento selezionato");
      const label = document.createElement("span");
      label.textContent = element.getAttribute("data-ws-label") || (target.kind === "block" ? "Blocco" : "Sezione");
      node.appendChild(label);
      for (const action of EDITOR_ACTIONS) {
        if (action === "add-after" && target.kind === "block") continue;
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = ACTION_LABELS[action];
        button.title = ACTION_TITLES[action];
        button.setAttribute("aria-label", ACTION_TITLES[action]);
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          post({ type: "eg-website:action", action, target });
        });
        node.appendChild(button);
      }
      node.style.top = `${Math.max(0, rect.top + window.scrollY - 30)}px`;
      node.style.left = `${Math.max(4, rect.left + window.scrollX + 4)}px`;
      document.body.appendChild(node);
      bar.current = node;
    };

    const applySelection = (target: EditorTarget | null, scroll: boolean) => {
      selected.current = target;
      clearClass("eg-probe-selected");
      removeBar();
      if (!target) return;
      const element = document.querySelector<HTMLElement>(selectorFor(target));
      if (!element) return;
      element.classList.add("eg-probe-selected");
      placeBar(element, target);
      if (scroll) element.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const targetOf = (node: EventTarget | null, alt: boolean): { element: HTMLElement; target: EditorTarget } | null => {
      const element = node instanceof Element ? node : null;
      if (!element) return null;
      const block = alt ? null : element.closest<HTMLElement>("[data-ws-block]");
      if (block) return { element: block, target: { kind: "block", id: block.getAttribute("data-ws-block") || "" } };
      const section = element.closest<HTMLElement>("[data-ws-section]");
      if (section) return { element: section, target: { kind: "section", id: section.getAttribute("data-ws-section") || "" } };
      return null;
    };

    const onClick = (event: MouseEvent) => {
      if (bar.current?.contains(event.target as Node)) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      const hit = targetOf(event.target, event.altKey);
      if (anchor && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        const href = anchor.getAttribute("href") || "";
        if (href.startsWith(pathPrefix)) post({ type: "eg-website:navigate", path: href.slice(pathPrefix.length) || "/" });
        return;
      }
      if (hit) {
        event.preventDefault();
        event.stopPropagation();
        applySelection(hit.target, false);
        post({ type: "eg-website:select", target: hit.target });
        return;
      }
      if (anchor) {
        event.preventDefault();
        const href = anchor.getAttribute("href") || "";
        if (href.startsWith(pathPrefix)) post({ type: "eg-website:navigate", path: href.slice(pathPrefix.length) || "/" });
      }
    };

    const onSubmit = (event: Event) => event.preventDefault();

    let hovered: HTMLElement | null = null;
    const onOver = (event: MouseEvent) => {
      const hit = targetOf(event.target, event.altKey);
      if (hovered && hovered !== hit?.element) hovered.classList.remove("eg-probe-hover");
      hovered = hit?.element || null;
      hovered?.classList.add("eg-probe-hover");
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== window.parent) return;
      const message = parseEditorMessage(event.data);
      if (!message) return;
      if (message.type === "eg-website:select") applySelection(message.target, true);
      if (message.type === "eg-website:scroll-to") applySelection(message.target, true);
      if (message.type === "eg-website:hover") {
        clearClass("eg-probe-hover");
        if (message.target) document.querySelector(selectorFor(message.target))?.classList.add("eg-probe-hover");
      }
      if (message.type === "eg-website:refresh") router.refresh();
    };

    const onScrollOrResize = () => {
      if (selected.current) {
        const element = document.querySelector<HTMLElement>(selectorFor(selected.current));
        if (element) placeBar(element, selected.current);
        else removeBar();
      }
    };
    reposition.current = onScrollOrResize;

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("mouseover", onOver);
    window.addEventListener("message", onMessage);
    window.addEventListener("resize", onScrollOrResize);
    post({ type: "eg-website:ready", path });

    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("mouseover", onOver);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", onScrollOrResize);
      style.remove();
      removeBar();
    };
  }, [pathPrefix, path, router]);

  /* Dopo ogni ridisegno dal server: riapplica la selezione e lo dice all'editor. */
  useEffect(() => {
    if (window.parent === window) return;
    const target = selected.current;
    if (target) {
      const element = document.querySelector<HTMLElement>(selectorFor(target));
      if (element) element.classList.add("eg-probe-selected");
      /*
        Il ridisegno sposta gli elementi (una sezione aggiunta sopra, un testo
        piu lungo): la barra, posata con le coordinate di prima, resterebbe
        sospesa altrove.
      */
      reposition.current();
    }
    window.parent.postMessage({ type: "eg-website:rendered", path }, window.location.origin);
  });

  return <meta name="eg-preview-page" content={`${pageId}${detail ? `:${detail}` : ""}`} />;
}
