"use client";

import * as React from "react";
import { ImagePlus, Search, Trash2, Upload, X } from "lucide-react";
import { Drawer } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { TextInput } from "@/components/web/forms/Field";
import { websiteApi, type MediaItemDto } from "@/lib/website/client";
import type { MediaRef } from "@/lib/website/document/types";
import { WEBSITE_MEDIA_ENDPOINT } from "@/lib/rich-text/sanitize";
import { ATTACHMENT_ENDPOINT } from "@/lib/attachments";

/**
 * **Il selettore di immagini del sito**, condiviso da editor e schermate.
 *
 * Un'immagine si sceglie dalla libreria del sito (allegati `owner_type =
 * website`) o si carica al momento. La categoria decide dove finisce: le foto
 * delle persone sono `person-photo` e restano fuori dalla libreria comune,
 * perche il pubblico le vede solo se la policy lo consente.
 *
 * `MediaField` e il campo dell'inspector: anteprima, testo alternativo per
 * questo uso, punto focale con un clic sull'anteprima.
 */

/**
 * L'anteprima di un'immagine nel gestionale. Una foto di persona passa dalla
 * rotta autenticata e non dall'ottimizzatore, che la chiederebbe senza
 * sessione.
 */
export const mediaPreviewSrc = (item: { url: string; previewUrl?: string }, width = 384) =>
  item.previewUrl && item.previewUrl !== item.url ? item.previewUrl : `/_next/image?url=${encodeURIComponent(item.url)}&w=${width}&q=70`;
const thumb = mediaPreviewSrc;

/** Le categorie con una propria cartella: chi sceglie un logo puo allargare a tutta la libreria. */
const CATEGORY_LABELS: Record<string, string> = {
  "sponsor-logo": "Loghi sponsor",
  "team-photo": "Foto squadre",
  "opponent-logo": "Loghi avversari",
};

const refPreview = (mediaId: string, category: string) =>
  category === "person-photo"
    ? { url: `${WEBSITE_MEDIA_ENDPOINT}/${mediaId}`, previewUrl: `${ATTACHMENT_ENDPOINT}/${mediaId}` }
    : { url: `${WEBSITE_MEDIA_ENDPOINT}/${mediaId}` };

export function MediaPickerDialog({
  open,
  onClose,
  onSelect,
  category = "website-media",
  title = "Scegli un'immagine",
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (item: MediaItemDto) => void;
  category?: string;
  title?: string;
}) {
  const [items, setItems] = React.useState<MediaItemDto[]>([]);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  /*
    Un logo sponsor puo essere qualunque immagine del club (il server non lo
    lega alla cartella): la cartella e il punto di partenza, non un recinto.
    Le foto delle persone restano un recinto, per la loro policy.
  */
  const categoryLabel = CATEGORY_LABELS[category];
  const [wholeLibrary, setWholeLibrary] = React.useState(false);
  React.useEffect(() => {
    if (open) setWholeLibrary(false);
  }, [open]);
  const listCategory = category === "website-media" || (categoryLabel && wholeLibrary) ? undefined : category;

  const load = React.useCallback(
    async (reset: boolean, after?: string | null) => {
      setLoading(true);
      const result = await websiteApi.media({ q: query || undefined, category: listCategory, cursor: after || undefined });
      setLoading(false);
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setItems((current) => (reset ? result.data.items : [...current, ...result.data.items]));
      setCursor(result.data.nextCursor);
    },
    [query, listCategory],
  );

  React.useEffect(() => {
    if (open) void load(true);
  }, [open, load]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    for (const file of Array.from(files).slice(0, 12)) {
      const result = await websiteApi.uploadMedia(file, { category, title: file.name.replace(/\.[^.]+$/, "") });
      if (result.error) {
        setError(result.error.message);
        break;
      }
      setItems((current) => [result.data, ...current]);
      if (files.length === 1) onSelect(result.data);
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <Drawer open={open} onOpenChange={(next) => !next && onClose()} title={title} width="wide" eyebrow="Libreria del sito">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-egw-ink-42" />
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void load(true)}
            placeholder="Cerca per nome o testo alternativo"
            className="pl-9"
            aria-label="Cerca nella libreria"
          />
        </div>
        <Button variant="secondary" onClick={() => void load(true)} loading={loading}>Cerca</Button>
        <Button variant="primary" icon={<Upload className="h-4 w-4" />} loading={uploading} onClick={() => inputRef.current?.click()}>
          Carica
        </Button>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={(event) => void onFiles(event.target.files)} />
      </div>
      {categoryLabel ? (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Dove cercare">
          <Button size="sm" variant={wholeLibrary ? "secondary" : "neutral"} onClick={() => setWholeLibrary(false)} aria-pressed={!wholeLibrary}>
            {categoryLabel}
          </Button>
          <Button size="sm" variant={wholeLibrary ? "neutral" : "secondary"} onClick={() => setWholeLibrary(true)} aria-pressed={wholeLibrary}>
            Tutta la libreria
          </Button>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-[12.5px] text-egw-red">{error}</p> : null}
      <ul className="mt-4 grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="group block w-full overflow-hidden rounded-lg border border-egw-hairline text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-egw-blue"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumb(item)} alt={item.alt || item.title} className="aspect-square w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
              <span className="block truncate px-2 py-1.5 text-[11.5px] text-egw-ink-62">{item.title || item.fileName}</span>
              {!item.alt ? <span className="block px-2 pb-1.5 text-[11px] font-semibold text-egw-amber-ink">Senza testo alternativo</span> : null}
            </button>
          </li>
        ))}
        {!items.length && !loading ? (
          <li className="col-span-full rounded-lg border border-dashed border-egw-hairline p-8 text-center text-[13px] text-egw-ink-62">
            {categoryLabel && !wholeLibrary ? (
              <>
                Nessuna immagine in «{categoryLabel}».{" "}
                <button type="button" className="font-semibold text-egw-blue-700 underline" onClick={() => setWholeLibrary(true)}>
                  Cerca in tutta la libreria
                </button>{" "}
                o caricane una.
              </>
            ) : (
              "La libreria e vuota: carica la prima immagine."
            )}
          </li>
        ) : null}
      </ul>
      {cursor ? (
        <div className="mt-3 flex justify-center">
          <Button variant="text" onClick={() => void load(false, cursor)} loading={loading}>Mostra altre</Button>
        </div>
      ) : null}
    </Drawer>
  );
}

/** Il campo immagine dell'inspector, con alt e punto focale. */
export function MediaField({
  label,
  value,
  onChange,
  category = "website-media",
  help,
  disabled,
}: {
  label: string;
  value: MediaRef | null | undefined;
  onChange: (value: MediaRef | null) => void;
  category?: string;
  help?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [info, setInfo] = React.useState<{ url: string; previewUrl?: string; alt: string } | null>(null);

  React.useEffect(() => {
    if (!value?.mediaId) {
      setInfo(null);
      return;
    }
    setInfo((current) => (current && current.url.endsWith(value.mediaId as string) ? current : { ...refPreview(value.mediaId as string, category), alt: "" }));
  }, [value?.mediaId, category]);

  const setFocal = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!value?.mediaId || disabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const focalX = Math.round(((event.clientX - rect.left) / rect.width) * 100);
    const focalY = Math.round(((event.clientY - rect.top) / rect.height) * 100);
    onChange({ ...value, focalX, focalY });
  };

  return (
    <div className="space-y-2">
      <p className="text-[12px] font-semibold text-egw-ink-72">{label}</p>
      {value?.mediaId && info ? (
        <div className="space-y-2">
          <div
            className="relative cursor-crosshair overflow-hidden rounded-lg border border-egw-hairline"
            onClick={setFocal}
            title="Clicca per scegliere il punto di interesse (resta visibile quando l'immagine si ritaglia)"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb(info, 640)} alt="" className="aspect-video w-full object-cover" style={{ objectPosition: `${value.focalX ?? 50}% ${value.focalY ?? 50}%` }} />
            <span
              className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-egw-blue shadow"
              style={{ left: `${value.focalX ?? 50}%`, top: `${value.focalY ?? 50}%` }}
              aria-hidden="true"
            />
          </div>
          <TextInput
            value={value.alt || ""}
            onChange={(event) => onChange({ ...value, alt: event.target.value.slice(0, 250) })}
            placeholder="Testo alternativo (vuoto = quello della libreria)"
            aria-label={`Testo alternativo di ${label}`}
            disabled={disabled}
          />
          <div className="flex gap-2">
            <Button size="xs" variant="secondary" icon={<ImagePlus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)} disabled={disabled}>Cambia</Button>
            <Button size="xs" variant="text" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => onChange(null)} disabled={disabled}>Togli</Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-egw-hairline px-4 py-6 text-[12.5px] text-egw-ink-62 hover:border-egw-blue hover:text-egw-blue-700"
        >
          <ImagePlus className="h-5 w-5" />
          Scegli o carica un&apos;immagine
        </button>
      )}
      {help ? <p className="text-[11.5px] text-egw-ink-62">{help}</p> : null}
      <MediaPickerDialog
        open={open}
        onClose={() => setOpen(false)}
        category={category}
        onSelect={(item) => {
          setInfo({ url: item.url, previewUrl: item.previewUrl, alt: item.alt });
          onChange({ mediaId: item.id, focalX: item.focalX, focalY: item.focalY });
          setOpen(false);
        }}
      />
    </div>
  );
}

export function MediaListField({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: MediaRef[];
  onChange: (value: MediaRef[]) => void;
  max: number;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="space-y-2">
      <p className="text-[12px] font-semibold text-egw-ink-72">{label} <span className="font-normal text-egw-ink-42">({value.length}/{max})</span></p>
      <ul className="grid grid-cols-3 gap-2">
        {value.map((ref, index) => (
          <li key={`${ref.mediaId}-${index}`} className="group relative overflow-hidden rounded-md border border-egw-hairline">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb({ url: `/api/public/website/media/${ref.mediaId}` }, 384)} alt="" className="aspect-square w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, position) => position !== index))}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 focus:opacity-100"
              aria-label="Togli l'immagine"
            >
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
      {value.length < max ? (
        <Button size="xs" variant="secondary" icon={<ImagePlus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>Aggiungi immagini</Button>
      ) : null}
      <MediaPickerDialog
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(item) => {
          onChange([...value, { mediaId: item.id }].slice(0, max));
        }}
        title="Aggiungi alla galleria (clic su piu immagini)"
      />
    </div>
  );
}
