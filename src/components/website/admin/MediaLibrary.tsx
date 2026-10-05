"use client";

import * as React from "react";
import { ImageIcon, Search, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/web/primitives/Button";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { DataChip } from "@/components/web/primitives/StatusPill";
import { AlertBlock } from "@/components/web/page/Alerts";
import { EmptyStateCard, InfoCard } from "@/components/web/page/Cards";
import { Field, TextInput } from "@/components/web/forms/Field";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { DangerConfirmDialog } from "@/components/web/overlays/Modal";
import { useToast } from "@/components/ui/toast-notification";
import { formatDateShort } from "@/lib/web/format";
import { websiteApi, type MediaItemDto } from "@/lib/website/client";
import { useWebsiteArea } from "./WebsiteAreaShell";
import { ListSkeleton, formatBytes } from "./admin-ui";
import { mediaPreviewSrc } from "./MediaPicker";

/** La libreria immagini del sito: carica, descrivi, scegli il punto focale, vedi dove e usata. */

const CATEGORIES = [
  { value: "website-media", label: "Libreria" },
  { value: "person-photo", label: "Foto persone" },
  { value: "sponsor-logo", label: "Loghi sponsor" },
  { value: "team-photo", label: "Foto squadre" },
  { value: "opponent-logo", label: "Loghi avversari" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

function MediaDetailDrawer({
  item,
  canWrite,
  onClose,
  onUpdated,
  onDeleted,
}: {
  item: MediaItemDto | null;
  canWrite: boolean;
  onClose: () => void;
  onUpdated: (item: MediaItemDto) => void;
  onDeleted: (id: string) => void;
}) {
  const { showToast } = useToast();
  const [alt, setAlt] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [focal, setFocal] = React.useState({ x: 50, y: 50 });
  const [usages, setUsages] = React.useState<string[] | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const itemId = item?.id;

  React.useEffect(() => {
    if (!item) return;
    setAlt(item.alt);
    setTitle(item.title);
    setFocal({ x: item.focalX, y: item.focalY });
    setError(null);
    setUsages(null);
    setDeleteError(null);
    let cancelled = false;
    void websiteApi.mediaUsages(item.id).then((result) => {
      if (!cancelled) setUsages(result.error ? [] : result.data.usages);
    });
    return () => {
      cancelled = true;
    };
    // Si ricarica solo cambiando immagine, non dopo un salvataggio della stessa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  if (!item) {
    return (
      <Drawer open={false} onOpenChange={() => onClose()} title="Immagine">
        <span />
      </Drawer>
    );
  }

  const dirty = alt !== item.alt || title !== item.title || focal.x !== item.focalX || focal.y !== item.focalY;

  const pickFocal = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!canWrite) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setFocal({
      x: Math.min(100, Math.max(0, Math.round(((event.clientX - rect.left) / rect.width) * 100))),
      y: Math.min(100, Math.max(0, Math.round(((event.clientY - rect.top) / rect.height) * 100))),
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await websiteApi.updateMedia(item.id, { alt: alt.trim(), title: title.trim(), focalX: focal.x, focalY: focal.y });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    onUpdated(result.data);
    showToast("success", "Immagine aggiornata");
  };

  const remove = async () => {
    setDeleting(true);
    const result = await websiteApi.deleteMedia(item.id);
    setDeleting(false);
    setDeleteOpen(false);
    if (result.error) {
      const list: unknown = result.error.usages;
      if (Array.isArray(list)) setUsages(list.map(String));
      setDeleteError(result.error.message);
      return;
    }
    showToast("success", "Immagine eliminata");
    onDeleted(item.id);
  };

  return (
    <Drawer
      open
      onOpenChange={(open) => !open && onClose()}
      width="wide"
      title={item.title || item.fileName}
      eyebrow="Immagine"
      dirty={dirty && !saving}
      locked={saving || deleting}
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          {canWrite ? (
            <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteOpen(true)} disabled={saving || (usages?.length ?? 0) > 0}>
              Elimina
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Chiudi</Button>
            {canWrite ? <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!dirty}>Salva</Button> : null}
          </div>
        </div>
      }
    >
      <DrawerSection eyebrow="Anteprima e punto focale">
        <button
          type="button"
          onClick={pickFocal}
          disabled={!canWrite}
          aria-label={`Punto focale: ${focal.x}% orizzontale, ${focal.y}% verticale. Clicca sull'immagine per spostarlo.`}
          className="relative block w-full cursor-crosshair overflow-hidden rounded-egw-field border border-egw-hairline bg-egw-page-100 disabled:cursor-default"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaPreviewSrc(item, 1080)} alt={item.alt || ""} className="block max-h-[420px] w-full object-contain" />
          <span
            aria-hidden
            className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-egw-blue shadow"
            style={{ left: `${focal.x}%`, top: `${focal.y}%` }}
          />
        </button>
        <p className="mt-2 text-[11.5px] text-egw-ink-62">
          Clicca sul soggetto principale: quando l&apos;immagine viene ritagliata (copertine, card) resta visibile. Punto attuale: {focal.x}% · {focal.y}%.
        </p>
      </DrawerSection>

      <DrawerSection eyebrow="Descrizione">
        <div className="space-y-4">
          <Field
            label="Testo alternativo"
            htmlFor="media-alt"
            helper="Il testo alternativo descrive l'immagine a chi non la vede (lettori di schermo, immagini non caricate)."
            warning={!alt.trim() ? "Manca il testo alternativo" : undefined}
          >
            <TextInput id="media-alt" value={alt} maxLength={250} onChange={(event) => setAlt(event.target.value)} disabled={!canWrite} placeholder="Es. La prima squadra festeggia la promozione" />
          </Field>
          <Field label="Titolo" htmlFor="media-title" optional helper="Serve per ritrovarla nella libreria.">
            <TextInput id="media-title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} disabled={!canWrite} />
          </Field>
        </div>
      </DrawerSection>

      <DrawerSection eyebrow="File">
        <dl className="grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-4">
          <div><dt className="text-egw-ink-62">Dimensioni</dt><dd className="egw-num font-semibold text-egw-ink">{item.width && item.height ? `${item.width} × ${item.height}` : "—"}</dd></div>
          <div><dt className="text-egw-ink-62">Peso</dt><dd className="egw-num font-semibold text-egw-ink">{formatBytes(item.sizeBytes)}</dd></div>
          <div><dt className="text-egw-ink-62">Tipo</dt><dd className="font-semibold text-egw-ink">{item.mimeType.replace("image/", "").toUpperCase()}</dd></div>
          <div><dt className="text-egw-ink-62">Caricata</dt><dd className="font-semibold text-egw-ink">{formatDateShort(item.createdAt)}</dd></div>
        </dl>
        <p className="mt-2 break-all text-[11.5px] text-egw-ink-42">{item.fileName}</p>
      </DrawerSection>

      <DrawerSection eyebrow="Dove e usata">
        {usages === null ? (
          <ListSkeleton rows={1} />
        ) : usages.length ? (
          <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-egw-ink-72">
            {usages.map((usage) => (
              <li key={usage}>{usage}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-egw-ink-62">Non e usata da nessuna parte: puoi eliminarla.</p>
        )}
        {usages && usages.length && canWrite ? (
          <p className="mt-2 text-[11.5px] text-egw-ink-62">Per eliminarla, toglila prima da dove e usata.</p>
        ) : null}
      </DrawerSection>

      {error ? <AlertBlock severity="danger" title="Il salvataggio non e riuscito">{error}</AlertBlock> : null}
      {deleteError ? <AlertBlock severity="danger" title="L'immagine non e stata eliminata">{deleteError}</AlertBlock> : null}

      <DangerConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Eliminare l'immagine?"
        description={`«${item.title || item.fileName}» viene tolta dalla libreria del sito.`}
        confirmLabel="Elimina l'immagine"
        onConfirm={remove}
        loading={deleting}
      />
    </Drawer>
  );
}

export function MediaLibrary() {
  const { can, canEdit } = useWebsiteArea();
  const { showToast } = useToast();
  const canWrite = can("website.media.manage") && canEdit;
  const [category, setCategory] = React.useState<Category>("website-media");
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [items, setItems] = React.useState<MediaItemDto[] | null>(null);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<MediaItemDto | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  React.useEffect(() => {
    let cancelled = false;
    setItems(null);
    void websiteApi.media({ q: debounced || undefined, category }).then((result) => {
      if (cancelled) return;
      if (result.error) setError(result.error.message);
      else {
        setError(null);
        setItems(result.data.items);
        setCursor(result.data.nextCursor);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [category, debounced]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    const result = await websiteApi.media({ q: debounced || undefined, category, cursor });
    setLoadingMore(false);
    if (result.error) {
      showToast("error", result.error.message);
      return;
    }
    setItems((current) => [...(current ?? []), ...result.data.items]);
    setCursor(result.data.nextCursor);
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setUploadError(null);
    let uploaded = 0;
    for (const file of Array.from(files)) {
      const result = await websiteApi.uploadMedia(file, { category, title: file.name.replace(/\.[^.]+$/, "") });
      if (result.error) {
        setUploadError(`${file.name}: ${result.error.message}`);
        break;
      }
      uploaded += 1;
      setItems((current) => [result.data, ...(current ?? [])]);
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (uploaded) showToast("success", uploaded === 1 ? "Immagine caricata: aggiungi il testo alternativo" : `${uploaded} immagini caricate`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <SegmentedControl value={category} onChange={setCategory} options={CATEGORIES} wrap aria-label="Categoria" />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 sm:w-72">
            <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca per nome o testo alternativo" aria-label="Cerca immagini" leading={<Search />} />
          </div>
          {canWrite ? (
            <>
              <Button variant="primary" icon={<Upload className="h-4 w-4" />} onClick={() => inputRef.current?.click()} loading={uploading}>
                Carica immagini
              </Button>
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" aria-label="Scegli le immagini da caricare" onChange={(event) => void upload(event.target.files)} />
            </>
          ) : null}
        </div>
      </div>
      {category === "person-photo" ? (
        <InfoCard>Le foto delle persone sono pubbliche solo se la persona e pubblicata e il consenso lo consente.</InfoCard>
      ) : null}
      {uploadError ? <AlertBlock severity="danger" title="Il caricamento si e interrotto">{uploadError}</AlertBlock> : null}

      {error ? (
        <AlertBlock severity="danger" title="La libreria non si puo caricare">{error}</AlertBlock>
      ) : !items ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="egw-skeleton aspect-square rounded-egw-field" aria-hidden />
          ))}
        </div>
      ) : !items.length ? (
        <EmptyStateCard
          icon={<ImageIcon className="h-6 w-6" />}
          title={debounced ? "Nessuna immagine corrisponde alla ricerca" : "Nessuna immagine in questa categoria"}
          description="Formati ammessi: JPEG, PNG, WebP, GIF fino a 8 MB."
          primary={canWrite && !debounced ? <Button variant="primary" icon={<Upload className="h-4 w-4" />} onClick={() => inputRef.current?.click()}>Carica la prima</Button> : undefined}
        />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelected(item)}
                  className="group block w-full overflow-hidden rounded-egw-field border border-egw-hairline bg-white text-left focus-visible:outline-none focus-visible:shadow-egw-focus"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaPreviewSrc(item)}
                    alt={item.alt || ""}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
                    style={{ objectPosition: `${item.focalX}% ${item.focalY}%` }}
                  />
                  <span className="block truncate px-2.5 pt-2 text-[12px] font-medium text-egw-ink">{item.title || item.fileName}</span>
                  <span className="block px-2.5 pb-2 pt-1">
                    {!item.alt ? <DataChip size="sm" tone="amber">Senza testo alternativo</DataChip> : <span className="text-[11px] text-egw-ink-42">{formatBytes(item.sizeBytes)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {cursor ? (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={() => void loadMore()} loading={loadingMore}>Mostra altre</Button>
            </div>
          ) : null}
        </>
      )}

      <MediaDetailDrawer
        item={selected}
        canWrite={canWrite}
        onClose={() => setSelected(null)}
        onUpdated={(updated) => {
          setSelected(updated);
          setItems((current) => current?.map((item) => (item.id === updated.id ? updated : item)) ?? current);
        }}
        onDeleted={(id) => {
          setSelected(null);
          setItems((current) => current?.filter((item) => item.id !== id) ?? current);
        }}
      />
    </div>
  );
}
