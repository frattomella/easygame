"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArrowLeft, CalendarClock, Eye, Rocket, Save, Trash2, Undo2 } from "lucide-react";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { Button } from "@/components/web/primitives/Button";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Field, Select, TextInput, Textarea } from "@/components/web/forms/Field";
import { DangerConfirmDialog, Modal } from "@/components/web/overlays/Modal";
import { RichTextEditor } from "@/components/rich-text/RichTextEditor";
import { sanitizeWebsiteRichHtml } from "@/lib/rich-text/sanitize";
import { useToast } from "@/components/ui/toast-notification";
import { formatDateTime } from "@/lib/web/format";
import type { MediaRef } from "@/lib/website/document/types";
import type { PageSeo } from "@/lib/website/publishing/snapshot";
import { isConflict, previewPath, uploadWebsiteInlineImage, websiteApi, type ArticleDto } from "@/lib/website/client";
import { useWebsiteArea } from "./WebsiteAreaShell";
import { MediaField, MediaListField } from "./MediaPicker";
import { ARTICLE_STATUS, CharCount, ConflictDialog, ListSkeleton, ToggleRow, fromDateTimeLocal, slugify, toDateTimeLocal } from "./admin-ui";

/**
 * **L'editor di una news del sito** (`/website/news/[id]`).
 *
 * Salva con la versione letta: un 409 apre il dialogo «Ricarica /
 * Sovrascrivi». Le azioni di stato (pubblica, programma, bozza, archivia)
 * salvano prima le modifiche aperte, cosi non si pubblica una versione
 * diversa da quella che si vede.
 */

type ArticleForm = {
  title: string;
  slug: string;
  excerpt: string;
  bodyHtml: string;
  cover: MediaRef | null;
  gallery: MediaRef[];
  categorySlug: string;
  authorLabel: string;
  featured: boolean;
  relatedEventId: string;
  seo: PageSeo;
};

const toForm = (article: ArticleDto): ArticleForm => ({
  title: article.title,
  slug: article.slug,
  excerpt: article.excerpt,
  bodyHtml: article.bodyHtml,
  cover: article.cover,
  gallery: article.gallery,
  categorySlug: article.categorySlug ?? "",
  authorLabel: article.authorLabel,
  featured: article.featured,
  relatedEventId: article.relatedEventId ?? "",
  seo: article.seo,
});

const toPatch = (form: ArticleForm) => ({
  title: form.title,
  slug: form.slug,
  excerpt: form.excerpt,
  bodyHtml: form.bodyHtml,
  cover: form.cover,
  gallery: form.gallery,
  categorySlug: form.categorySlug || null,
  authorLabel: form.authorLabel,
  featured: form.featured,
  relatedEventId: form.relatedEventId.trim() || null,
  seo: { ...form.seo, canonical: form.seo.canonical?.trim() || null },
});

const NO_CATEGORY = "__none__";

export function ArticleEditor({ articleId }: { articleId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { overview, can, canEdit } = useWebsiteArea();
  const canWrite = can("website.blog.manage") && canEdit;
  const categories = overview.site?.settings.articleCategories ?? [];

  const [article, setArticle] = React.useState<ArticleDto | null>(null);
  const [form, setForm] = React.useState<ArticleForm | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<{ currentVersion: number | null } | null>(null);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [scheduleAt, setScheduleAt] = React.useState("");
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async () => {
    const result = await websiteApi.article(articleId);
    if (result.error) {
      setLoadError(result.error.message);
      return;
    }
    setLoadError(null);
    setArticle(result.data);
    setForm(toForm(result.data));
  }, [articleId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const dirty = React.useMemo(
    () => Boolean(article && form && JSON.stringify(toPatch(form)) !== JSON.stringify(toPatch(toForm(article)))),
    [article, form],
  );

  React.useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const set = <K extends keyof ArticleForm>(key: K, value: ArticleForm[K]) => setForm((current) => (current ? { ...current, [key]: value } : current));
  const setSeo = <K extends keyof PageSeo>(key: K, value: PageSeo[K]) => setForm((current) => (current ? { ...current, seo: { ...current.seo, [key]: value } } : current));

  /** Salva; restituisce l'articolo aggiornato, o null se non e riuscito (o c'e un conflitto). */
  const save = async (expectedVersion?: number): Promise<ArticleDto | null> => {
    if (!form || !article) return null;
    setSaving(true);
    setSaveError(null);
    const result = await websiteApi.updateArticle(article.id, { ...toPatch(form), expectedVersion: expectedVersion ?? article.version });
    setSaving(false);
    if (result.error) {
      if (isConflict(result)) {
        setConflict({ currentVersion: typeof result.error.currentVersion === "number" ? result.error.currentVersion : null });
      } else {
        setSaveError(result.error.message);
      }
      return null;
    }
    setArticle(result.data);
    setForm(toForm(result.data));
    return result.data;
  };

  const onSave = async () => {
    const saved = await save();
    if (saved) showToast("success", "News salvata");
  };

  const overwrite = async () => {
    let version = conflict?.currentVersion ?? null;
    if (version === null) {
      const fresh = await websiteApi.article(articleId);
      if (fresh.error) {
        setSaveError(fresh.error.message);
        setConflict(null);
        return;
      }
      version = fresh.data.version;
    }
    setConflict(null);
    const saved = await save(version);
    if (saved) showToast("success", "News salvata: la tua versione ha sostituito quella precedente");
  };

  const changeStatus = async (status: ArticleDto["status"], publishAt?: string) => {
    if (!article) return;
    let current: ArticleDto | null = article;
    if (dirty) current = await save();
    if (!current) return;
    setSaving(true);
    const result = await websiteApi.setArticleStatus(current.id, status, current.version, publishAt);
    setSaving(false);
    if (result.error) {
      if (isConflict(result)) setConflict({ currentVersion: typeof result.error.currentVersion === "number" ? result.error.currentVersion : null });
      else showToast("error", result.error.message);
      return;
    }
    setArticle(result.data);
    setForm(toForm(result.data));
    const messages: Record<ArticleDto["status"], string> = {
      published: "News pubblicata",
      scheduled: `News programmata per il ${formatDateTime(result.data.publishAt)}`,
      draft: "News riportata in bozza",
      archived: "News archiviata",
    };
    showToast("success", messages[status]);
  };

  const confirmSchedule = async () => {
    const iso = fromDateTimeLocal(scheduleAt);
    if (!iso) return;
    setScheduleOpen(false);
    await changeStatus("scheduled", iso);
  };

  const remove = async () => {
    if (!article) return;
    setDeleting(true);
    const result = await websiteApi.deleteArticle(article.id);
    setDeleting(false);
    if (result.error) {
      showToast("error", result.error.message);
      return;
    }
    setDeleteOpen(false);
    showToast("success", "News eliminata");
    router.push("/website/news");
  };

  if (loadError) {
    return (
      <div className="space-y-3">
        <AlertBlock severity="danger" title="La news non si puo aprire">{loadError}</AlertBlock>
        <Button asChild variant="secondary"><Link href="/website/news"><ArrowLeft className="h-4 w-4" aria-hidden />Torna alle news</Link></Button>
      </div>
    );
  }
  if (!article || !form) return <ListSkeleton rows={6} />;

  const scheduleIso = fromDateTimeLocal(scheduleAt);
  const scheduleInPast = scheduleIso ? new Date(scheduleIso).getTime() <= Date.now() : false;
  const disabled = !canWrite || saving;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="text" size="sm">
          <Link href="/website/news"><ArrowLeft className="h-4 w-4" aria-hidden />Tutte le news</Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? <span className="text-[12px] font-semibold text-egw-amber-ink" role="status">Modifiche non salvate</span> : null}
          {overview.site ? (
            <Button asChild variant="secondary" size="sm">
              <a href={previewPath(overview.site.id, `/news/${article.slug}`)} target="_blank" rel="noopener noreferrer"><Eye className="h-4 w-4" aria-hidden />Anteprima</a>
            </Button>
          ) : null}
          {canWrite ? (
            <Button variant="primary" size="sm" icon={<Save className="h-4 w-4" />} onClick={() => void onSave()} loading={saving} disabled={!dirty}>
              Salva
            </Button>
          ) : null}
        </div>
      </div>

      {!canWrite ? (
        <AlertBlock severity="info" title="Sola lettura">
          {canEdit ? "Il tuo ruolo non puo modificare le news del sito." : "Il servizio e sospeso: le news si possono solo consultare."}
        </AlertBlock>
      ) : null}
      {saveError ? <AlertBlock severity="danger" title="Il salvataggio non e riuscito">{saveError}</AlertBlock> : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Panel as="section" className="space-y-5">
            <Field label="Titolo" htmlFor="article-title" required helper={<CharCount value={form.title} max={200} />}>
              <TextInput id="article-title" value={form.title} maxLength={200} onChange={(event) => set("title", event.target.value)} disabled={disabled} />
            </Field>
            <Field
              label="Indirizzo"
              htmlFor="article-slug"
              helper={<>Indirizzo pubblico: <strong className="break-all">/news/{form.slug || "…"}</strong>. Cambiarlo dopo la pubblicazione rompe i link gia condivisi.</>}
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <TextInput id="article-slug" value={form.slug} maxLength={80} onChange={(event) => set("slug", slugify(event.target.value))} disabled={disabled} />
                <Button variant="secondary" onClick={() => set("slug", slugify(form.title))} disabled={disabled}>Dal titolo</Button>
              </div>
            </Field>
            <Field label="Sommario" htmlFor="article-excerpt" optional helper={<>Compare negli elenchi e nelle anteprime social. <CharCount value={form.excerpt} max={400} /></>}>
              <Textarea id="article-excerpt" value={form.excerpt} maxLength={400} onChange={(event) => set("excerpt", event.target.value)} disabled={disabled} />
            </Field>
            <div>
              <p id="article-body-label" className="mb-2 text-[12px] font-semibold text-egw-ink-62">Testo</p>
              {canWrite ? (
                <RichTextEditor
                  value={form.bodyHtml}
                  onChange={(html) => set("bodyHtml", html)}
                  minHeight={320}
                  aria-label="Testo della news"
                  placeholder="Scrivi la news…"
                  sanitize={sanitizeWebsiteRichHtml}
                  onUploadImage={uploadWebsiteInlineImage}
                />
              ) : (
                <div
                  className="egw-rich-content rounded-egw-control border border-egw-hairline bg-white p-4"
                  aria-labelledby="article-body-label"
                  dangerouslySetInnerHTML={{ __html: sanitizeWebsiteRichHtml(form.bodyHtml) }}
                />
              )}
              <p className="mt-2 text-[11.5px] text-egw-ink-62">Le immagini si aggiungono come copertina o galleria qui a fianco.</p>
            </div>
          </Panel>

          <Panel as="section" className="space-y-4">
            <PanelHeader eyebrow="Immagini" title="Copertina e galleria" className="mb-0" />
            <MediaField label="Copertina" value={form.cover} onChange={(value) => set("cover", value)} disabled={disabled} help="Usata in cima alla news, negli elenchi e come immagine social se non ne scegli un'altra." />
            {canWrite ? (
              <MediaListField label="Galleria" value={form.gallery} onChange={(value) => set("gallery", value)} max={60} />
            ) : (
              <p className="text-[12.5px] text-egw-ink-62">Galleria: {form.gallery.length} immagini.</p>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel as="section">
            <PanelHeader eyebrow="Pubblicazione" title="Stato" />
            <StatusPill status={ARTICLE_STATUS[article.status]} />
            <p className="mt-2 text-[12.5px] text-egw-ink-72">
              {article.status === "published" && article.publishedAt
                ? `Pubblicata il ${formatDateTime(article.publishedAt)}.`
                : article.status === "scheduled" && article.publishAt
                  ? `Uscira automaticamente il ${formatDateTime(article.publishAt)}.`
                  : article.status === "archived"
                    ? "Non compare piu sul sito."
                    : "Visibile solo nel gestionale e in anteprima."}
            </p>
            {canWrite ? (
              <div className="mt-4 flex flex-col gap-2">
                {article.status !== "published" ? (
                  <Button variant="neutral" icon={<Rocket className="h-4 w-4" />} onClick={() => void changeStatus("published")} disabled={saving}>Pubblica ora</Button>
                ) : null}
                {article.status !== "published" ? (
                  <Button
                    variant="secondary"
                    icon={<CalendarClock className="h-4 w-4" />}
                    onClick={() => {
                      setScheduleAt(toDateTimeLocal(article.publishAt));
                      setScheduleOpen(true);
                    }}
                    disabled={saving}
                  >
                    {article.status === "scheduled" ? "Cambia data" : "Programma"}
                  </Button>
                ) : null}
                {article.status !== "draft" ? (
                  <Button variant="secondary" icon={<Undo2 className="h-4 w-4" />} onClick={() => void changeStatus("draft")} disabled={saving}>Riporta in bozza</Button>
                ) : null}
                {article.status !== "archived" ? (
                  <Button variant="secondary" icon={<Archive className="h-4 w-4" />} onClick={() => void changeStatus("archived")} disabled={saving}>Archivia</Button>
                ) : null}
                <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteOpen(true)} disabled={saving}>Elimina</Button>
              </div>
            ) : null}
          </Panel>

          <Panel as="section" className="space-y-4">
            <PanelHeader eyebrow="Dettagli" title="Classificazione" className="mb-0" />
            <Field label="Categoria" htmlFor="article-category" helper={categories.length ? undefined : <>Nessuna categoria: aggiungile dalle <Link href="/website/impostazioni" className="underline">impostazioni</Link>.</>}>
              <Select
                id="article-category"
                value={form.categorySlug || NO_CATEGORY}
                onValueChange={(value) => set("categorySlug", value === NO_CATEGORY ? "" : value)}
                options={[{ value: NO_CATEGORY, label: "Nessuna categoria" }, ...categories.map((category) => ({ value: category.slug, label: category.label }))]}
                disabled={disabled}
              />
            </Field>
            <Field label="Autore" htmlFor="article-author" optional helper="Come compare la firma, es. «Ufficio stampa».">
              <TextInput id="article-author" value={form.authorLabel} maxLength={80} onChange={(event) => set("authorLabel", event.target.value)} disabled={disabled} />
            </Field>
            <ToggleRow label="In evidenza" description="Le news in evidenza vengono mostrate per prime nei blocchi che lo prevedono." checked={form.featured} onChange={(value) => set("featured", value)} disabled={disabled} />
            <Field label="Gara collegata" htmlFor="article-event" optional helper="L'identificativo della gara di cui parla la news (facoltativo).">
              <TextInput id="article-event" value={form.relatedEventId} maxLength={64} onChange={(event) => set("relatedEventId", event.target.value)} disabled={disabled} placeholder="Identificativo della gara" />
            </Field>
          </Panel>

          <Panel as="section" className="space-y-4">
            <PanelHeader eyebrow="Motori di ricerca" title="SEO e condivisione" className="mb-0" />
            <Field label="Titolo SEO" htmlFor="article-seo-title" optional helper={<>Vuoto = il titolo della news. <CharCount value={form.seo.title} max={70} /></>}>
              <TextInput id="article-seo-title" value={form.seo.title} maxLength={70} onChange={(event) => setSeo("title", event.target.value)} disabled={disabled} />
            </Field>
            <Field label="Descrizione SEO" htmlFor="article-seo-description" optional helper={<>Vuoto = il sommario. <CharCount value={form.seo.description} max={320} /></>}>
              <Textarea id="article-seo-description" value={form.seo.description} maxLength={320} onChange={(event) => setSeo("description", event.target.value)} disabled={disabled} />
            </Field>
            <MediaField label="Immagine social" value={form.seo.socialImage} onChange={(value) => setSeo("socialImage", value)} disabled={disabled} help="Vuoto = la copertina." />
            <ToggleRow label="Escludi dai motori di ricerca" description="La news resta visibile sul sito ma non viene indicizzata." checked={form.seo.noindex} onChange={(value) => setSeo("noindex", value)} disabled={disabled} />
            <Field label="URL canonico" htmlFor="article-canonical" optional helper="Solo se la news e pubblicata anche altrove ed e quello l'originale.">
              <TextInput id="article-canonical" type="url" value={form.seo.canonical ?? ""} onChange={(event) => setSeo("canonical", event.target.value)} disabled={disabled} placeholder="https://" />
            </Field>
          </Panel>
        </div>
      </div>

      <ConflictDialog
        open={Boolean(conflict)}
        subject="la news"
        busy={saving}
        onCancel={() => setConflict(null)}
        onReload={() => {
          setConflict(null);
          void load();
        }}
        onOverwrite={() => void overwrite()}
      />

      <Modal
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        title="Programma la pubblicazione"
        description="La news esce da sola alla data e all'ora scelte."
        footer={
          <>
            <Button variant="secondary" onClick={() => setScheduleOpen(false)}>Annulla</Button>
            <Button variant="primary" onClick={() => void confirmSchedule()} disabled={!scheduleIso || scheduleInPast}>Programma</Button>
          </>
        }
      >
        <Field label="Data e ora" htmlFor="article-schedule" error={scheduleInPast ? "Scegli una data futura" : undefined}>
          <TextInput id="article-schedule" type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} />
        </Field>
      </Modal>

      <DangerConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Eliminare la news?"
        description={`«${article.title}» sparisce dal gestionale e dal sito.`}
        consequences={["Il suo indirizzo pubblico smettera di funzionare", "Le immagini restano nella libreria"]}
        confirmLabel="Elimina la news"
        onConfirm={remove}
        loading={deleting}
      />
    </div>
  );
}
