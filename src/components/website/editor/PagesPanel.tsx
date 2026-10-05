"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Copy, FileText, Home, LayoutTemplate, Plus, Settings2, Trash2 } from "lucide-react";
import { websiteApi, type PageDto, type PageSummaryDto } from "@/lib/website/client";
import { slugify, validatePageSlug } from "@/lib/website/slug";
import { Field, Select, TextInput } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { Modal, DangerConfirmDialog } from "@/components/web/overlays/Modal";

/**
 * **Le pagine del sito.** Le pagine normali stanno nel menu e si riordinano;
 * i modelli di dettaglio (una news, una squadra, una gara) sono una pagina
 * ciascuno e il sito li riempie con l'elemento richiesto.
 */

const KIND_LABELS: Record<string, string> = {
  home: "Home",
  standard: "Pagina",
  legal: "Pagina legale",
  news_index: "Elenco news",
  article_detail: "Dettaglio news",
  team_detail: "Dettaglio squadra",
  match_detail: "Dettaglio gara",
  player_detail: "Dettaglio persona",
  event_detail: "Dettaglio evento",
};

const isDetail = (page: PageSummaryDto) => page.path.includes("*");

export function PagesPanel({
  pages,
  currentPageId,
  dirtyPageIds,
  canManage,
  onOpen,
  onSettings,
  onCreated,
  onDeleted,
  onReordered,
}: {
  pages: PageSummaryDto[];
  currentPageId: string | null;
  dirtyPageIds: string[];
  canManage: boolean;
  onOpen: (pageId: string) => void;
  onSettings: (pageId: string) => void;
  onCreated: (page: PageDto) => void;
  onDeleted: (pageId: string) => void;
  onReordered: (pages: PageSummaryDto[]) => void;
}) {
  const [creating, setCreating] = React.useState<{ duplicateOf?: string } | null>(null);
  const [title, setTitle] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [kind, setKind] = React.useState<"standard" | "legal">("standard");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<PageSummaryDto | null>(null);

  const regular = pages.filter((page) => !isDetail(page));
  const details = pages.filter(isDetail);
  const slugValue = slug || slugify(title);
  const slugCheck = validatePageSlug(slugValue);

  const startCreate = (duplicateOf?: string) => {
    const source = duplicateOf ? pages.find((page) => page.id === duplicateOf) : null;
    setCreating({ duplicateOf });
    setTitle(source ? `${source.title} (copia)` : "");
    setSlug("");
    setKind("standard");
    setError(null);
  };

  const create = async () => {
    if (!title.trim() || !slugCheck.ok) return;
    setBusy(true);
    const result = await websiteApi.createPage({ title: title.trim(), slug: slugCheck.slug, kind: creating?.duplicateOf ? undefined : kind, duplicateOf: creating?.duplicateOf });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setCreating(null);
    onCreated(result.data);
  };

  const move = async (pageId: string, delta: -1 | 1) => {
    const index = regular.findIndex((page) => page.id === pageId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= regular.length) return;
    const next = regular.slice();
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    const ordered = [...next, ...details];
    onReordered(ordered);
    const result = await websiteApi.reorderPages(ordered.map((page) => page.id));
    if (result.error) setError(result.error.message);
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    const result = await websiteApi.deletePage(deleting.id);
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    const id = deleting.id;
    setDeleting(null);
    onDeleted(id);
  };

  const row = (page: PageSummaryDto, index: number, list: PageSummaryDto[]) => {
    const active = page.id === currentPageId;
    const Icon = page.kind === "home" ? Home : isDetail(page) ? LayoutTemplate : FileText;
    return (
      <li key={page.id}>
        <div className={`group flex items-center gap-1.5 rounded-md px-2 py-1.5 ${active ? "bg-egw-tint-blue" : "hover:bg-egw-page-100"}`}>
          <button type="button" onClick={() => onOpen(page.id)} aria-current={active ? "page" : undefined} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <Icon className={`h-4 w-4 shrink-0 ${active ? "text-egw-blue-700" : "text-egw-ink-42"}`} aria-hidden="true" />
            <span className="min-w-0">
              <span className={`block truncate text-[12.5px] font-semibold ${active ? "text-egw-blue-700" : "text-egw-ink"}`}>
                {page.title}
                {dirtyPageIds.includes(page.id) ? <span className="ml-1 text-egw-amber-ink" title="Modifiche in salvataggio">•</span> : null}
              </span>
              <span className="block truncate text-[11px] text-egw-ink-42">
                {page.path} · {KIND_LABELS[page.kind] || page.kind}
              </span>
            </span>
          </button>
          <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <IconAction label={`Impostazioni di ${page.title}`} onClick={() => onSettings(page.id)}>
              <Settings2 />
            </IconAction>
            {canManage && !isDetail(page) ? (
              <>
                <IconAction label={`Sposta su ${page.title}`} onClick={() => void move(page.id, -1)} disabled={index === 0}>
                  <ArrowUp />
                </IconAction>
                <IconAction label={`Sposta giu ${page.title}`} onClick={() => void move(page.id, 1)} disabled={index === list.length - 1}>
                  <ArrowDown />
                </IconAction>
                <IconAction label={`Duplica ${page.title}`} onClick={() => startCreate(page.id)}>
                  <Copy />
                </IconAction>
              </>
            ) : null}
            {canManage && page.kind !== "home" ? (
              <IconAction label={`Elimina ${page.title}`} onClick={() => setDeleting(page)}>
                <Trash2 />
              </IconAction>
            ) : null}
          </span>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-4 p-3">
      {error ? (
        <p role="alert" className="rounded-md bg-egw-tint-red px-2 py-1.5 text-[12px] text-egw-red">
          {error}
        </p>
      ) : null}
      <section>
        <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-egw-ink-42">Pagine</h3>
        <ul className="space-y-0.5">{regular.map((page, index) => row(page, index, regular))}</ul>
        {canManage ? (
          <Button size="sm" variant="secondary" className="mt-2" icon={<Plus className="h-4 w-4" />} onClick={() => startCreate()}>
            Nuova pagina
          </Button>
        ) : null}
      </section>
      {details.length ? (
        <section>
          <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-egw-ink-42">Modelli di dettaglio</h3>
          <p className="mb-1.5 text-[11px] text-egw-ink-62">L&apos;anteprima li riempie con un elemento vero del club.</p>
          <ul className="space-y-0.5">{details.map((page, index) => row(page, index, details))}</ul>
        </section>
      ) : null}

      <Modal
        open={Boolean(creating)}
        onOpenChange={(next) => !next && setCreating(null)}
        title={creating?.duplicateOf ? "Duplica la pagina" : "Nuova pagina"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(null)}>
              Annulla
            </Button>
            <Button variant="primary" loading={busy} disabled={!title.trim() || !slugCheck.ok} onClick={() => void create()}>
              Crea
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {error ? (
            <p role="alert" className="text-[12px] text-egw-red">
              {error}
            </p>
          ) : null}
          <Field label="Titolo">
            <TextInput value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} autoFocus aria-label="Titolo della nuova pagina" />
          </Field>
          <Field label="Indirizzo" error={title && !slugCheck.ok ? slugCheck.message : undefined} helper={slugCheck.ok ? `/${slugCheck.slug}` : undefined}>
            <TextInput value={slug} placeholder={slugify(title)} maxLength={80} onChange={(event) => setSlug(event.target.value)} aria-label="Indirizzo della nuova pagina" />
          </Field>
          {!creating?.duplicateOf ? (
            <Field label="Tipo">
              <Select
                value={kind}
                onValueChange={(value) => setKind(value as "standard" | "legal")}
                options={[
                  { value: "standard", label: "Pagina", description: "Testi, immagini, dati del club" },
                  { value: "legal", label: "Pagina legale", description: "Privacy, cookie, note legali" },
                ]}
                aria-label="Tipo di pagina"
              />
            </Field>
          ) : null}
        </div>
      </Modal>

      <DangerConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => !next && setDeleting(null)}
        title={`Eliminare «${deleting?.title || ""}»?`}
        description="La pagina sparisce dalla bozza e dai menu. Il sito pubblicato non cambia finche non pubblichi di nuovo."
        confirmLabel="Elimina la pagina"
        onConfirm={() => void remove()}
        loading={busy}
      />
    </div>
  );
}

function IconAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactElement }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded p-1 text-egw-ink-62 hover:bg-white hover:text-egw-ink disabled:opacity-30 [&>svg]:h-3.5 [&>svg]:w-3.5"
    >
      {children}
    </button>
  );
}
