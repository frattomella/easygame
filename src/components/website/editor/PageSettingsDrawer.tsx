"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Field, TextInput, Textarea } from "@/components/web/forms/Field";
import { Toggle } from "@/components/web/primitives/Controls";
import { Button } from "@/components/web/primitives/Button";
import { AlertBlock } from "@/components/web/page/Alerts";
import { MediaField } from "@/components/website/admin/MediaPicker";
import { websiteApi, isConflict, type PageDto } from "@/lib/website/client";
import { slugify, validatePageSlug } from "@/lib/website/slug";
import type { PageSeo } from "@/lib/website/publishing/snapshot";

/**
 * **Titolo, indirizzo e SEO di una pagina.**
 *
 * Cambiare lo slug di una pagina gia pubblicata lascia un reindirizzamento dal
 * vecchio indirizzo (lo scrive il server): chi aveva salvato il link non trova
 * una pagina vuota. La home non ha slug.
 */

const DETAIL_KINDS = new Set(["article_detail", "team_detail", "match_detail", "player_detail", "event_detail"]);

export function PageSettingsDrawer({
  page,
  open,
  onClose,
  beforeSave,
  getVersion,
  onSaved,
  readOnly,
}: {
  page: PageDto | null;
  open: boolean;
  onClose: () => void;
  /** Salva prima il documento: titolo e contenuto condividono la versione della pagina. */
  beforeSave: () => Promise<boolean>;
  getVersion: (pageId: string) => number | null;
  onSaved: (page: PageDto) => void;
  readOnly: boolean;
}) {
  const [title, setTitle] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [seo, setSeo] = React.useState<PageSeo>({ title: "", description: "", socialImage: null, canonical: null, noindex: false });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!page || !open) return;
    setTitle(page.title);
    setSlug(page.slug);
    setSeo(page.seo);
    setError(null);
  }, [page, open]);

  if (!page) return null;
  const isHome = page.kind === "home";
  const isDetail = DETAIL_KINDS.has(page.kind);
  const slugCheck = isHome ? ({ ok: true, slug: "" } as const) : validatePageSlug(slug);
  const path = isHome ? "/" : isDetail ? `/${slug}/…` : `/${slug}`;

  const save = async () => {
    if (!slugCheck.ok) return;
    setSaving(true);
    setError(null);
    await beforeSave();
    const version = getVersion(page.id) ?? page.version;
    const result = await websiteApi.updatePageMeta(page.id, {
      expectedVersion: version,
      title: title.trim(),
      ...(isHome ? {} : { slug: slugCheck.slug }),
      seo,
    });
    setSaving(false);
    if (result.error) {
      setError(isConflict(result) ? "Qualcun altro ha modificato la pagina: chiudi, ricarica e riprova." : result.error.message);
      return;
    }
    onSaved(result.data);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Impostazioni della pagina"
      eyebrow={page.title}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={readOnly || !slugCheck.ok || !title.trim()}>
            Salva
          </Button>
        </div>
      }
    >
      {error ? (
        <AlertBlock severity="danger" title="Non salvato" className="mb-4">
          {error}
        </AlertBlock>
      ) : null}
      <DrawerSection title="Pagina">
        <div className="space-y-3">
          <Field label="Titolo" helper="Compare nel menu (se la scegli) e nella scheda del browser.">
            <TextInput value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} disabled={readOnly} aria-label="Titolo della pagina" />
          </Field>
          {!isHome ? (
            <Field
              label="Indirizzo"
              error={slugCheck.ok ? undefined : slugCheck.message}
              helper={slugCheck.ok ? `Il sito la mostra in ${path}. Se cambi un indirizzo gia pubblicato, il vecchio porta al nuovo.` : undefined}
            >
              <div className="flex gap-2">
                <TextInput value={slug} maxLength={80} onChange={(event) => setSlug(event.target.value)} disabled={readOnly} aria-label="Indirizzo della pagina" />
                <Button variant="secondary" size="sm" onClick={() => setSlug(slugify(title))} disabled={readOnly}>
                  Dal titolo
                </Button>
              </div>
            </Field>
          ) : (
            <p className="text-[12px] text-egw-ink-62">La home e la pagina principale del sito: il suo indirizzo e sempre «/».</p>
          )}
        </div>
      </DrawerSection>
      <DrawerSection title="Motori di ricerca e social">
        <div className="space-y-3">
          {isDetail ? (
            <p className="text-[12px] text-egw-ink-62">
              In un modello di dettaglio titolo e descrizione si ricavano dall&apos;elemento mostrato (la news, la squadra…). Qui scrivi solo il ripiego.
            </p>
          ) : null}
          <Field label="Titolo per i motori di ricerca" helper={`${seo.title.length}/70 · vuoto = il titolo della pagina`}>
            <TextInput value={seo.title} maxLength={70} onChange={(event) => setSeo({ ...seo, title: event.target.value })} disabled={readOnly} aria-label="Titolo SEO" />
          </Field>
          <Field label="Descrizione" helper={`${seo.description.length}/320 · le prime 150 lettere sono quelle che si vedono su Google`}>
            <Textarea value={seo.description} maxLength={320} rows={3} onChange={(event) => setSeo({ ...seo, description: event.target.value })} disabled={readOnly} aria-label="Descrizione SEO" />
          </Field>
          <MediaField label="Immagine per i social" value={seo.socialImage} onChange={(socialImage) => setSeo({ ...seo, socialImage })} help="1200×630 e la misura ideale. Vuota = quella del sito." disabled={readOnly} />
          <Field label="Indirizzo canonico" helper="Solo se la stessa pagina vive anche altrove. Di solito resta vuoto.">
            <TextInput
              value={seo.canonical || ""}
              inputMode="url"
              placeholder="https://"
              onChange={(event) => setSeo({ ...seo, canonical: event.target.value || null })}
              disabled={readOnly}
              aria-label="Indirizzo canonico"
            />
          </Field>
          <div className="flex items-start justify-between gap-3">
            <span className="text-[12.5px] font-semibold text-egw-ink-72">
              Nascondi ai motori di ricerca
              <span className="block text-[11.5px] font-normal text-egw-ink-62">La pagina resta raggiungibile, ma non compare nei risultati ne nella mappa del sito.</span>
            </span>
            <Toggle checked={seo.noindex} onCheckedChange={(noindex) => setSeo({ ...seo, noindex })} disabled={readOnly} aria-label="Nascondi ai motori di ricerca" />
          </div>
        </div>
      </DrawerSection>
    </Drawer>
  );
}
