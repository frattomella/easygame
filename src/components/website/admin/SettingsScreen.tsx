"use client";

import * as React from "react";
import { Palette, Plus, Save, Trash2 } from "lucide-react";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { DataChip } from "@/components/web/primitives/StatusPill";
import { AlertBlock } from "@/components/web/page/Alerts";
import { InfoCard } from "@/components/web/page/Cards";
import { Field, TextInput, Textarea } from "@/components/web/forms/Field";
import { ConfirmDialog } from "@/components/web/overlays/Modal";
import { useToast } from "@/components/ui/toast-notification";
import { cn } from "@/lib/utils";
import { SOCIAL_LABELS, SOCIAL_NETWORKS, type SiteIdentity, type SiteSeo, type SiteSettings, type SocialNetwork } from "@/lib/website/site-config";
import { isConflict, websiteApi, type TemplateSummaryDto } from "@/lib/website/client";
import { useWebsiteArea } from "./WebsiteAreaShell";
import { MediaField } from "./MediaPicker";
import { CharCount, ConflictDialog, ListSkeleton, ToggleRow, slugify } from "./admin-ui";

/**
 * **Le impostazioni generali del sito** (ADR-0200 §3): identita, SEO
 * globale, categorie delle news, stile. Un campo vuoto vuol dire «usa il dato
 * dell'anagrafica del club»: il sito non copia, legge.
 */

const SOCIAL_PLACEHOLDERS: Record<SocialNetwork, string> = {
  facebook: "https://facebook.com/…",
  instagram: "https://instagram.com/…",
  youtube: "https://youtube.com/@…",
  tiktok: "https://tiktok.com/@…",
  x: "https://x.com/…",
  linkedin: "https://linkedin.com/company/…",
  whatsapp: "https://wa.me/39…",
  telegram: "https://t.me/…",
};

function StyleSwitcher() {
  const { overview, reload, can, canEdit } = useWebsiteArea();
  const { showToast } = useToast();
  const [templates, setTemplates] = React.useState<TemplateSummaryDto[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [target, setTarget] = React.useState<TemplateSummaryDto | null>(null);
  const [busy, setBusy] = React.useState(false);
  const site = overview.site;
  const editable = can("website.theme.manage") && canEdit;

  React.useEffect(() => {
    void websiteApi.templates().then((result) => {
      if (result.error) setError(result.error.message);
      else setTemplates(result.data);
    });
  }, []);

  if (!site) return null;

  const apply = async () => {
    if (!target) return;
    setBusy(true);
    const result = await websiteApi.applyTemplateStyle(target.key, site.draftVersion);
    setBusy(false);
    if (result.error) {
      showToast("error", isConflict(result) ? "Il sito e stato modificato nel frattempo: ho ricaricato, riprova" : result.error.message);
      if (isConflict(result)) await reload();
      return;
    }
    setTarget(null);
    showToast("success", `Applicato lo stile «${target.label}». Pubblica per renderlo visibile.`);
    await reload();
  };

  return (
    <Panel as="section">
      <PanelHeader eyebrow="Stile" title="Cambia stile" description="Applica colori, caratteri, intestazione e piede di un altro template. Pagine, contenuti e menu non vengono toccati." />
      {error ? (
        <AlertBlock severity="danger" title="I template non si possono caricare">{error}</AlertBlock>
      ) : !templates ? (
        <ListSkeleton rows={2} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {templates.map((template) => {
            const current = template.key === site.templateKey;
            return (
              <li key={template.key} className={cn("flex flex-col rounded-egw-field border bg-white p-3", current ? "border-egw-blue" : "border-egw-hairline")}>
                <div className="mb-2 flex h-10 overflow-hidden rounded" aria-hidden>
                  {template.preview.colors.map((color) => (
                    <span key={color} className="flex-1" style={{ background: color }} />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-egw-ink">{template.label}</span>
                  {current ? <DataChip size="sm" tone="blue">Di partenza</DataChip> : null}
                </div>
                <span className="mt-0.5 flex-1 text-[11.5px] text-egw-ink-62">{template.description}</span>
                {editable ? (
                  <Button size="xs" variant="secondary" icon={<Palette className="h-3.5 w-3.5" />} className="mt-3 self-start" onClick={() => setTarget(template)}>
                    Applica questo stile
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {!editable ? <p className="mt-3 text-[11.5px] text-egw-ink-62">Lo stile si cambia con il permesso sul tema del sito.</p> : null}
      <ConfirmDialog
        open={Boolean(target)}
        onOpenChange={(next) => !next && setTarget(null)}
        title={`Applicare lo stile «${target?.label ?? ""}»?`}
        description="Cambiano colori, caratteri, intestazione e piede della bozza. Pagine, contenuti e menu restano come sono. Le personalizzazioni del tema fatte finora vengono sostituite."
        confirmLabel="Applica lo stile"
        onConfirm={apply}
        loading={busy}
      />
    </Panel>
  );
}

function CategoriesEditor({ categories, onChange, disabled }: { categories: SiteSettings["articleCategories"]; onChange: (next: SiteSettings["articleCategories"]) => void; disabled: boolean }) {
  const [label, setLabel] = React.useState("");
  const slug = slugify(label);
  const duplicate = categories.some((category) => category.slug === slug);
  const add = () => {
    if (!label.trim() || !slug || duplicate) return;
    onChange([...categories, { slug, label: label.trim().slice(0, 40) }]);
    setLabel("");
  };
  return (
    <div>
      {categories.length ? (
        <ul className="space-y-2">
          {categories.map((category, index) => (
            <li key={category.slug} className="flex items-center gap-2">
              <TextInput
                aria-label={`Nome della categoria ${index + 1}`}
                value={category.label}
                maxLength={40}
                onChange={(event) => onChange(categories.map((item) => (item.slug === category.slug ? { ...item, label: event.target.value } : item)))}
                disabled={disabled}
              />
              <code className="hidden shrink-0 text-[11.5px] text-egw-ink-42 sm:block">/{category.slug}</code>
              {!disabled ? (
                <IconButton aria-label={`Togli la categoria ${category.label}`} size="xs" variant="danger" onClick={() => onChange(categories.filter((item) => item.slug !== category.slug))}>
                  <Trash2 />
                </IconButton>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-egw-ink-62">Nessuna categoria: le news non sono classificate.</p>
      )}
      {!disabled ? (
        <div className="mt-3">
          <div className="flex gap-2">
            <TextInput aria-label="Nuova categoria" value={label} maxLength={40} onChange={(event) => setLabel(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} placeholder="Es. Prima squadra" />
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={add} disabled={!slug || duplicate || categories.length >= 30}>Aggiungi</Button>
          </div>
          <p className="mt-1.5 text-[11.5px] text-egw-ink-62">
            {duplicate ? "Esiste gia una categoria con questo indirizzo." : slug ? `Indirizzo: /${slug}` : "L'indirizzo si ricava dal nome. Togliere una categoria lascia le sue news senza categoria."}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function SettingsScreen() {
  const { overview, reload, can, canEdit } = useWebsiteArea();
  const { showToast } = useToast();
  const site = overview.site;
  const canSettings = can("website.settings.manage") && canEdit;
  const canSeo = can("website.seo.manage") && canEdit;

  const [settings, setSettings] = React.useState<SiteSettings | null>(site?.settings ?? null);
  const [seo, setSeo] = React.useState<SiteSeo | null>(site?.seo ?? null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false);

  const settingsDirty = Boolean(site && settings && JSON.stringify(settings) !== JSON.stringify(site.settings));
  const seoDirty = Boolean(site && seo && JSON.stringify(seo) !== JSON.stringify(site.seo));
  const dirty = settingsDirty || seoDirty;

  /* Una bozza nuova (salvataggio, cambio di stile, altra scheda) rientra nel modulo se non ci sono modifiche aperte. */
  const draftVersion = site?.draftVersion;
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty;
  const forceResetRef = React.useRef(false);
  const [resetToken, setResetToken] = React.useState(0);
  React.useEffect(() => {
    if (!site || (dirtyRef.current && !forceResetRef.current)) return;
    forceResetRef.current = false;
    setSettings(site.settings);
    setSeo(site.seo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftVersion, resetToken]);

  if (!site || !settings || !seo) return null;

  const setIdentity = <K extends keyof SiteIdentity>(key: K, value: SiteIdentity[K]) =>
    setSettings((current) => (current ? { ...current, identity: { ...current.identity, [key]: value } } : current));
  const setSocial = (network: SocialNetwork, value: string) =>
    setSettings((current) => (current ? { ...current, identity: { ...current.identity, social: { ...current.identity.social, [network]: value } } } : current));
  const setSeoField = <K extends keyof SiteSeo>(key: K, value: SiteSeo[K]) => setSeo((current) => (current ? { ...current, [key]: value } : current));

  const templateInvalid = !seo.titleTemplate.includes("%s");

  const save = async () => {
    setSaving(true);
    setError(null);
    const cleanedSettings: SiteSettings = {
      ...settings,
      identity: {
        ...settings.identity,
        social: Object.fromEntries(Object.entries(settings.identity.social).filter(([, value]) => value && value.trim())) as SiteIdentity["social"],
      },
      articleCategories: settings.articleCategories.filter((category) => category.label.trim()),
    };
    const result = await websiteApi.updateConfig({
      ...(settingsDirty && canSettings ? { settings: cleanedSettings } : {}),
      ...(seoDirty && canSeo ? { seo } : {}),
      expectedVersion: site.draftVersion,
    });
    setSaving(false);
    if (result.error) {
      if (isConflict(result)) setConflict(true);
      else setError(result.error.message);
      return;
    }
    setSettings(result.data.settings);
    setSeo(result.data.seo);
    showToast("success", "Impostazioni salvate. Pubblica per aggiornare il sito.");
    await reload();
  };

  const identity = settings.identity;

  return (
    <div className="space-y-5">
      {!canEdit ? <AlertBlock severity="info" title="Sola lettura">Il servizio e sospeso: le impostazioni si possono solo consultare.</AlertBlock> : null}

      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-2 bg-egw-page px-1 py-2">
        {dirty ? <span role="status" className="text-[12px] font-semibold text-egw-amber-ink">Modifiche non salvate</span> : null}
        {dirty ? (
          <Button variant="text" size="sm" onClick={() => { setSettings(site.settings); setSeo(site.seo); }} disabled={saving}>Annulla</Button>
        ) : null}
        {canSettings || canSeo ? (
          <Button variant="primary" size="sm" icon={<Save className="h-4 w-4" />} onClick={() => void save()} loading={saving} disabled={!dirty || (seoDirty && templateInvalid)}>
            Salva le impostazioni
          </Button>
        ) : null}
      </div>
      {error ? <AlertBlock severity="danger" title="Il salvataggio non e riuscito">{error}</AlertBlock> : null}

      <Panel as="section">
        <PanelHeader eyebrow="Identita" title="Nome, logo e contatti" description="Ogni campo vuoto usa i dati dell'anagrafica del club: un cambio di indirizzo o di logo arriva al sito da solo." />
        {!canSettings && canEdit ? <InfoCard className="mb-4">Il tuo ruolo non puo modificare l&apos;identita del sito.</InfoCard> : null}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <Field label="Nome del sito" htmlFor="set-name" optional helper="Vuoto = la denominazione del club.">
              <TextInput id="set-name" value={identity.displayName} maxLength={120} onChange={(event) => setIdentity("displayName", event.target.value)} disabled={!canSettings} />
            </Field>
            <Field label="Slogan" htmlFor="set-tagline" optional>
              <TextInput id="set-tagline" value={identity.tagline} maxLength={160} onChange={(event) => setIdentity("tagline", event.target.value)} disabled={!canSettings} />
            </Field>
            <Field label="Descrizione" htmlFor="set-description" optional helper={<>Mostrata nel piede del sito. <CharCount value={identity.description} max={600} /></>}>
              <Textarea id="set-description" value={identity.description} maxLength={600} onChange={(event) => setIdentity("description", event.target.value)} disabled={!canSettings} />
            </Field>
            <Field label="Email" htmlFor="set-email" optional helper="Vuoto = l'email del club.">
              <TextInput id="set-email" type="email" value={identity.email} maxLength={200} onChange={(event) => setIdentity("email", event.target.value)} disabled={!canSettings} />
            </Field>
            <Field label="Telefono" htmlFor="set-phone" optional helper="Vuoto = il telefono del club.">
              <TextInput id="set-phone" type="tel" value={identity.phone} maxLength={40} onChange={(event) => setIdentity("phone", event.target.value)} disabled={!canSettings} />
            </Field>
            <Field label="Indirizzo" htmlFor="set-address" optional helper="Vuoto = la sede del club.">
              <TextInput id="set-address" value={identity.address} maxLength={240} onChange={(event) => setIdentity("address", event.target.value)} disabled={!canSettings} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Lingua del sito" htmlFor="set-language">
                <SegmentedControl
                  id="set-language"
                  mode="radio"
                  value={identity.language}
                  onChange={(value) => setIdentity("language", value)}
                  options={[{ value: "it", label: "Italiano", disabled: !canSettings }, { value: "en", label: "English", disabled: !canSettings }]}
                  aria-label="Lingua del sito"
                />
              </Field>
              <Field label="Copyright" htmlFor="set-copyright" optional helper="Vuoto = «© anno nome».">
                <TextInput id="set-copyright" value={identity.copyright} maxLength={200} onChange={(event) => setIdentity("copyright", event.target.value)} disabled={!canSettings} />
              </Field>
            </div>
          </div>
          <div className="space-y-4">
            <MediaField label="Logo" value={identity.logo} onChange={(value) => setIdentity("logo", value)} disabled={!canSettings} help="Vuoto = il logo del club." />
            <MediaField label="Logo per fondi scuri" value={identity.logoOnDark} onChange={(value) => setIdentity("logoOnDark", value)} disabled={!canSettings} help="Usato su intestazioni trasparenti e piede scuro. Vuoto = il logo normale." />
            <MediaField label="Favicon" value={identity.favicon} onChange={(value) => setIdentity("favicon", value)} disabled={!canSettings} help="L'icona della scheda del browser: un'immagine quadrata, almeno 512 px." />
          </div>
        </div>
        <fieldset className="mt-6">
          <legend className="mb-1 text-[13px] font-bold text-egw-ink">Social</legend>
          <p className="mb-3 text-[12px] text-egw-ink-62">Vuoto = usa i dati dell&apos;anagrafica del club.</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {SOCIAL_NETWORKS.map((network) => (
              <Field key={network} label={SOCIAL_LABELS[network]} htmlFor={`set-social-${network}`} optional>
                <TextInput
                  id={`set-social-${network}`}
                  type="url"
                  value={identity.social[network] ?? ""}
                  onChange={(event) => setSocial(network, event.target.value)}
                  placeholder={SOCIAL_PLACEHOLDERS[network]}
                  disabled={!canSettings}
                />
              </Field>
            ))}
          </div>
        </fieldset>
      </Panel>

      <Panel as="section">
        <PanelHeader eyebrow="Motori di ricerca" title="SEO del sito" description="Valori predefiniti: ogni pagina e ogni news puo avere i suoi." />
        {!canSeo && canEdit ? <InfoCard className="mb-4">Il tuo ruolo non puo modificare la SEO del sito.</InfoCard> : null}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <Field
              label="Modello del titolo"
              htmlFor="set-title-template"
              error={templateInvalid ? "Il modello deve contenere %s (il titolo della pagina)" : undefined}
              helper={<>%s = il titolo della pagina, {"{site}"} = il nome del sito. Es. «%s · {"{site}"}» diventa «Chi siamo · {identity.displayName || "Nome del club"}».</>}
            >
              <TextInput id="set-title-template" value={seo.titleTemplate} maxLength={80} onChange={(event) => setSeoField("titleTemplate", event.target.value)} disabled={!canSeo} />
            </Field>
            <Field label="Descrizione predefinita" htmlFor="set-seo-description" optional helper={<>Usata dalle pagine senza descrizione. <CharCount value={seo.defaultDescription} max={320} /></>}>
              <Textarea id="set-seo-description" value={seo.defaultDescription} maxLength={320} onChange={(event) => setSeoField("defaultDescription", event.target.value)} disabled={!canSeo} />
            </Field>
            <ToggleRow
              label="Nascondi tutto il sito ai motori di ricerca"
              description="Utile mentre il sito e in costruzione. Il sito resta visibile a chi ha l'indirizzo."
              checked={seo.noindex}
              onChange={(value) => setSeoField("noindex", value)}
              disabled={!canSeo}
            />
          </div>
          <MediaField label="Immagine social predefinita" value={seo.socialImage} onChange={(value) => setSeoField("socialImage", value)} disabled={!canSeo} help="Compare quando una pagina viene condivisa su social e chat. Ideale 1200 × 630 px." />
        </div>
      </Panel>

      <Panel as="section">
        <PanelHeader eyebrow="News" title="Categorie delle news" description="Per raggruppare le news e filtrarle sul sito." />
        <CategoriesEditor categories={settings.articleCategories} onChange={(next) => setSettings((current) => (current ? { ...current, articleCategories: next } : current))} disabled={!canSettings} />
      </Panel>

      <StyleSwitcher />

      <ConflictDialog
        open={conflict}
        subject="le impostazioni del sito"
        onCancel={() => setConflict(false)}
        onReload={() => {
          setConflict(false);
          void reload().then(() => {
            forceResetRef.current = true;
            setResetToken((token) => token + 1);
          });
        }}
      />
    </div>
  );
}
