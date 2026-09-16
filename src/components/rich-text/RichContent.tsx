"use client";

import * as React from "react";
import { sanitizeRichHtml } from "@/lib/rich-text/sanitize";
import { ATTACHMENT_ENDPOINT } from "@/lib/attachments";
import { cn } from "@/lib/utils";

/**
 * Il testo formattato reso in pagina (ADR-0190 §3).
 *
 * L'HTML arriva gia sanificato dal server; qui lo si sanifica **di nuovo**
 * con la stessa funzione prima di `dangerouslySetInnerHTML`, cosi nessun
 * percorso — un'anteprima dal builder, una bozza locale — lo rende crudo.
 * La stessa funzione, non una seconda.
 */
/**
 * Riscrive gli URL delle immagini per il pubblico: `ATTACHMENT_ENDPOINT/<id>`
 * (che vuole una sessione) diventa `<assetBase>/<id>`, la rotta pubblica che
 * serve solo le immagini di contenuto di quel modulo.
 */
export const rewriteAssetUrls = (html: string, assetBase: string) =>
  assetBase
    ? html.replace(
        new RegExp(`src="${ATTACHMENT_ENDPOINT.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}/([0-9a-f-]{36})[^"]*"`, "gi"),
        (_m, id) => `src="${assetBase}/${id}"`,
      )
    : html;

export function RichContent({ html, className, assetBase = "" }: { html: string; className?: string; assetBase?: string }) {
  const safe = React.useMemo(() => rewriteAssetUrls(sanitizeRichHtml(html), assetBase), [assetBase, html]);
  if (!safe) return null;
  return (
    <div
      className={cn("egw-rich-content", className)}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
