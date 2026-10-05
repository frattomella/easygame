"use client";

import * as React from "react";
import { Modal } from "@/components/web/overlays/Modal";
import { Button } from "@/components/web/primitives/Button";
import { websiteApi } from "@/lib/website/client";
import type { WebsitePageDocument } from "@/lib/website/document/types";
import type { EditorConflict, SiteEditableConfig } from "./useWebsiteEditor";
import { sectionLabel } from "./LayersPanel";

/**
 * **Qualcun altro ha salvato prima.** Il salvataggio si e fermato invece di
 * sovrascrivere: l'operatore sceglie se ricaricare (perde le sue modifiche
 * non salvate), confrontare le due versioni, o sovrascrivere consapevolmente.
 */

type Diff = { label: string; change: "solo tua" | "solo sul server" | "diversa" }[];

const diffDocuments = (local: WebsitePageDocument, server: WebsitePageDocument): Diff => {
  const out: Diff = [];
  const serverById = new Map(server.sections.map((section, index) => [section.id, { section, index }]));
  const localIds = new Set(local.sections.map((section) => section.id));
  local.sections.forEach((section, index) => {
    const other = serverById.get(section.id);
    if (!other) out.push({ label: sectionLabel(section, index), change: "solo tua" });
    else if (JSON.stringify(other.section) !== JSON.stringify(section)) out.push({ label: sectionLabel(section, index), change: "diversa" });
  });
  server.sections.forEach((section, index) => {
    if (!localIds.has(section.id)) out.push({ label: sectionLabel(section, index), change: "solo sul server" });
  });
  return out;
};

const CONFIG_LABELS: Record<keyof SiteEditableConfig, string> = { theme: "Tema", header: "Intestazione", footer: "Piede", navigation: "Menu" };

export function ConflictDialog({
  conflict,
  localDoc,
  localConfig,
  pageTitle,
  onReload,
  onForce,
}: {
  conflict: EditorConflict | null;
  localDoc: WebsitePageDocument | null;
  localConfig: SiteEditableConfig;
  pageTitle: string;
  onReload: () => Promise<void>;
  onForce: () => Promise<void>;
}) {
  const [diff, setDiff] = React.useState<Diff | null>(null);
  const [busy, setBusy] = React.useState<"reload" | "force" | "compare" | null>(null);
  /* Durante l'animazione di chiusura il conflitto e gia azzerato: si mostra l'ultimo. */
  const last = React.useRef<EditorConflict | null>(conflict);
  if (conflict) last.current = conflict;
  const shown = conflict || last.current;

  React.useEffect(() => setDiff(null), [conflict]);

  const compare = async () => {
    if (!conflict) return;
    setBusy("compare");
    if (conflict.scope === "page") {
      const result = await websiteApi.page(conflict.pageId);
      if (result.data && localDoc) setDiff(diffDocuments(localDoc, result.data.document));
    } else {
      const result = await websiteApi.overview();
      const site = result.data?.site;
      if (site) {
        setDiff(
          (Object.keys(CONFIG_LABELS) as Array<keyof SiteEditableConfig>)
            .filter((key) => JSON.stringify(site[key]) !== JSON.stringify(localConfig[key]))
            .map((key) => ({ label: CONFIG_LABELS[key], change: "diversa" as const })),
        );
      }
    }
    setBusy(null);
  };

  const run = async (kind: "reload" | "force", fn: () => Promise<void>) => {
    setBusy(kind);
    await fn();
    setBusy(null);
  };

  return (
    <Modal
      open={Boolean(conflict)}
      onOpenChange={() => undefined}
      strict
      hideClose
      width={560}
      title="Qualcun altro ha salvato prima di te"
      description={
        shown?.scope === "page"
          ? `La pagina «${pageTitle}» e stata modificata da un'altra sessione. Le tue ultime modifiche non sono state salvate.`
          : "Tema, menu o intestazione sono stati modificati da un'altra sessione. Le tue ultime modifiche non sono state salvate."
      }
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" loading={busy === "compare"} onClick={() => void compare()}>
            Confronta
          </Button>
          <Button variant="secondary" loading={busy === "reload"} onClick={() => void run("reload", onReload)}>
            Ricarica la loro versione
          </Button>
          <Button variant="danger" loading={busy === "force"} onClick={() => void run("force", onForce)}>
            Sovrascrivi con la mia
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-[12.5px] text-egw-ink-72">
        <p>
          <strong>Ricarica</strong> mostra la versione salvata e scarta le tue modifiche non salvate (puoi ancora annullare passo per passo).{" "}
          <strong>Sovrascrivi</strong> salva la tua versione sopra la loro.
        </p>
        {diff ? (
          diff.length ? (
            <div className="rounded-md border border-egw-hairline">
              <p className="border-b border-egw-hairline px-3 py-2 font-semibold">Cosa cambia fra le due versioni</p>
              <ul className="max-h-56 divide-y divide-egw-hairline overflow-y-auto">
                {diff.map((item, index) => (
                  <li key={`${item.label}-${index}`} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <span className="truncate">{item.label}</span>
                    <span className={`shrink-0 text-[11.5px] font-semibold ${item.change === "solo sul server" ? "text-egw-amber-ink" : "text-egw-blue-700"}`}>{item.change}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-md bg-egw-page-100 px-3 py-2">Le due versioni coincidono: puoi sovrascrivere senza perdere niente.</p>
          )
        ) : null}
      </div>
    </Modal>
  );
}
