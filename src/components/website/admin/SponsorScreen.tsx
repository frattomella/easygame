"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronRight, ExternalLink, Handshake, Plus, Star, Trash2 } from "lucide-react";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { AlertBlock } from "@/components/web/page/Alerts";
import { EmptyStateCard, InfoCard } from "@/components/web/page/Cards";
import { DateInput, Field, Select, TextInput, Textarea } from "@/components/web/forms/Field";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { useToast } from "@/components/ui/toast-notification";
import { spec } from "@/lib/web/status";
import type { SponsorShowcase } from "@/lib/sponsors/model";
import type { SponsorTier } from "@/lib/website/site-config";
import { isConflict, websiteApi, type SponsorShowcaseDto } from "@/lib/website/client";
import { useWebsiteArea } from "./WebsiteAreaShell";
import { MediaField } from "./MediaPicker";
import { todayLocalDateOnly } from "@/lib/date-only";
import { CharCount, ListSkeleton, ToggleRow, slugify, thumbUrl, websiteMediaUrl } from "./admin-ui";

/**
 * **La vetrina sponsor del sito** (ADR-0200 §9). Lo sponsor nasce e vive in
 * `/sponsors`: qui si decide solo se e come compare sul sito.
 */

type SponsorRow = SponsorShowcaseDto["sponsors"][number];

const VISIBLE = spec("IN VETRINA", "solid", "green");
const HIDDEN = spec("NASCOSTO", "quiet", "neutral");

const todayIso = () => todayLocalDateOnly();

const periodLabel = (showcase: SponsorShowcase) => {
  if (showcase.visibleFrom && showcase.visibleTo) return `dal ${showcase.visibleFrom} al ${showcase.visibleTo}`;
  if (showcase.visibleFrom) return `dal ${showcase.visibleFrom}`;
  if (showcase.visibleTo) return `fino al ${showcase.visibleTo}`;
  return "";
};

function SponsorDrawer({
  sponsor,
  tiers,
  disabled,
  onClose,
  onSaved,
}: {
  sponsor: SponsorRow | null;
  tiers: SponsorShowcaseDto["tiers"];
  disabled: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [form, setForm] = React.useState<SponsorShowcase | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setForm(sponsor ? { ...sponsor.showcase } : null);
    setError(null);
  }, [sponsor]);

  const set = <K extends keyof SponsorShowcase>(key: K, value: SponsorShowcase[K]) => setForm((current) => (current ? { ...current, [key]: value } : current));
  const dirty = Boolean(sponsor && form && JSON.stringify(form) !== JSON.stringify(sponsor.showcase));
  const periodInvalid = Boolean(form?.visibleFrom && form?.visibleTo && form.visibleFrom > form.visibleTo);

  const save = async () => {
    if (!sponsor || !form) return;
    setSaving(true);
    setError(null);
    const result = await websiteApi.saveSponsorShowcase(sponsor.id, { ...form, websiteUrl: form.websiteUrl?.trim() || null });
    if (result.error) {
      setSaving(false);
      setError(result.error.message);
      return;
    }
    await onSaved();
    setSaving(false);
    showToast("success", `Vetrina di ${sponsor.name} salvata`);
    onClose();
  };

  return (
    <Drawer
      open={Boolean(sponsor)}
      onOpenChange={(open) => !open && onClose()}
      title={sponsor?.name ?? "Sponsor"}
      eyebrow="Vetrina sul sito"
      dirty={dirty && !saving}
      locked={saving}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Chiudi</Button>
          {!disabled ? <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!dirty || periodInvalid}>Salva</Button> : null}
        </div>
      }
    >
      {sponsor && form ? (
        <>
          <DrawerSection eyebrow="Visibilita">
            <div className="space-y-3">
              <ToggleRow label="Mostra sul sito" description="Compare nella pagina Sponsor e nei blocchi che mostrano gli sponsor." checked={form.visible} onChange={(value) => set("visible", value)} disabled={disabled} />
              <ToggleRow label="In evidenza" description="Mostrato con piu risalto dentro il suo livello." checked={form.featured} onChange={(value) => set("featured", value)} disabled={disabled} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Visibile dal" htmlFor="sp-from" optional>
                  <DateInput id="sp-from" value={form.visibleFrom ?? ""} onChange={(event) => set("visibleFrom", event.target.value || null)} disabled={disabled} />
                </Field>
                <Field label="Visibile fino al" htmlFor="sp-to" optional error={periodInvalid ? "La fine viene prima dell'inizio" : undefined}>
                  <DateInput id="sp-to" value={form.visibleTo ?? ""} onChange={(event) => set("visibleTo", event.target.value || null)} disabled={disabled} />
                </Field>
              </div>
              <p className="text-[11.5px] text-egw-ink-62">Senza date resta visibile finche la spunta e attiva.</p>
            </div>
          </DrawerSection>
          <DrawerSection eyebrow="Posizione">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Livello" htmlFor="sp-tier">
                <Select id="sp-tier" value={form.tierKey} onValueChange={(value) => set("tierKey", value)} options={tiers.map((tier) => ({ value: tier.key, label: tier.label }))} disabled={disabled} />
              </Field>
              <Field label="Ordine" htmlFor="sp-order" helper="I numeri piu bassi vengono prima.">
                <TextInput id="sp-order" type="number" min={0} max={9999} numeric value={form.order} onChange={(event) => set("order", Math.max(0, Math.min(9999, Number(event.target.value) || 0)))} disabled={disabled} />
              </Field>
            </div>
          </DrawerSection>
          <DrawerSection eyebrow="Contenuto">
            <div className="space-y-4">
              <MediaField label="Logo" category="sponsor-logo" value={form.logoMediaId ? { mediaId: form.logoMediaId } : null} onChange={(value) => set("logoMediaId", value?.mediaId ?? null)} disabled={disabled} />
              {sponsor.hasLegacyLogo && !form.logoMediaId ? (
                <InfoCard>Nessun logo caricato qui: il sito usa il logo della scheda sponsor. Caricane uno per una qualita migliore.</InfoCard>
              ) : null}
              <Field label="Sito web dello sponsor" htmlFor="sp-url" optional>
                <TextInput id="sp-url" type="url" value={form.websiteUrl ?? ""} onChange={(event) => set("websiteUrl", event.target.value)} disabled={disabled} placeholder="https://" />
              </Field>
              <Field label="Descrizione" htmlFor="sp-desc" optional helper={<CharCount value={form.description} max={600} />}>
                <Textarea id="sp-desc" value={form.description} maxLength={600} onChange={(event) => set("description", event.target.value)} disabled={disabled} />
              </Field>
            </div>
          </DrawerSection>
          {error ? <AlertBlock severity="danger" title="Il salvataggio non e riuscito">{error}</AlertBlock> : null}
        </>
      ) : null}
    </Drawer>
  );
}

function TiersPanel({ sponsors, onSaved }: { sponsors: SponsorRow[]; onSaved: () => Promise<void> }) {
  const { overview, reload, can, canEdit } = useWebsiteArea();
  const { showToast } = useToast();
  const site = overview.site;
  const original = React.useMemo(() => site?.settings.sponsorTiers ?? [], [site]);
  const [tiers, setTiers] = React.useState<SponsorTier[]>(original);
  const [newLabel, setNewLabel] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const editable = can("website.settings.manage") && canEdit;

  React.useEffect(() => setTiers(original), [original]);

  if (!site) return null;
  const dirty = JSON.stringify(tiers) !== JSON.stringify(original);
  const usedKeys = new Set(sponsors.map((sponsor) => sponsor.showcase.tierKey));

  const move = (index: number, delta: number) => {
    setTiers((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next.map((tier, position) => ({ ...tier, order: position + 1 }));
    });
  };

  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    let key = slugify(label).slice(0, 40) || "livello";
    let suffix = 2;
    while (tiers.some((tier) => tier.key === key)) key = `${slugify(label).slice(0, 36)}-${suffix++}`;
    setTiers((current) => [...current, { key, label: label.slice(0, 40), order: current.length + 1 }]);
    setNewLabel("");
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const sponsorTiers = tiers.map((tier, index) => ({ ...tier, label: tier.label.trim(), order: index + 1 })).filter((tier) => tier.label);
    const result = await websiteApi.updateConfig({ settings: { ...site.settings, sponsorTiers }, expectedVersion: site.draftVersion });
    if (result.error) {
      setSaving(false);
      if (isConflict(result)) {
        setError("Le impostazioni sono state modificate nel frattempo: ho ricaricato i livelli, ripeti la modifica.");
        await reload();
      } else setError(result.error.message);
      return;
    }
    await reload();
    await onSaved();
    setSaving(false);
    showToast("success", "Livelli sponsor salvati");
  };

  return (
    <Panel as="section">
      <PanelHeader eyebrow="Livelli" title="Livelli della vetrina" description="I gruppi in cui il sito ordina gli sponsor." />
      <ul className="space-y-2">
        {tiers.map((tier, index) => (
          <li key={tier.key} className="flex items-center gap-2">
            <span className="egw-num w-5 shrink-0 text-right text-[12px] text-egw-ink-42">{index + 1}</span>
            <TextInput
              aria-label={`Nome del livello ${index + 1}`}
              value={tier.label}
              maxLength={40}
              onChange={(event) => setTiers((current) => current.map((item) => (item.key === tier.key ? { ...item, label: event.target.value } : item)))}
              disabled={!editable}
            />
            {editable ? (
              <div className="flex shrink-0 gap-1">
                <IconButton aria-label={`Sposta su ${tier.label}`} size="xs" onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp /></IconButton>
                <IconButton aria-label={`Sposta giu ${tier.label}`} size="xs" onClick={() => move(index, 1)} disabled={index === tiers.length - 1}><ArrowDown /></IconButton>
                <IconButton
                  aria-label={`Togli ${tier.label}`}
                  size="xs"
                  variant="danger"
                  onClick={() => setTiers((current) => current.filter((item) => item.key !== tier.key))}
                  disabled={tiers.length <= 1}
                  title={usedKeys.has(tier.key) ? "Alcuni sponsor usano questo livello: verranno mostrati nel livello predefinito" : undefined}
                >
                  <Trash2 />
                </IconButton>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {editable ? (
        <>
          <div className="mt-3 flex gap-2">
            <TextInput aria-label="Nuovo livello" value={newLabel} maxLength={40} onChange={(event) => setNewLabel(event.target.value)} onKeyDown={(event) => event.key === "Enter" && add()} placeholder="Nuovo livello" />
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={add} disabled={!newLabel.trim() || tiers.length >= 12}>Aggiungi</Button>
          </div>
          {original.some((tier) => !tiers.some((item) => item.key === tier.key) && usedKeys.has(tier.key)) ? (
            <p className="mt-2 text-[11.5px] text-egw-amber-ink">Gli sponsor di un livello tolto vanno riassegnati a un altro livello.</p>
          ) : null}
          {error ? <p role="alert" className="mt-2 text-[12px] font-medium text-egw-red">{error}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            {dirty ? <Button variant="text" onClick={() => setTiers(original)} disabled={saving}>Annulla</Button> : null}
            <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!dirty}>Salva i livelli</Button>
          </div>
        </>
      ) : (
        <p className="mt-3 text-[11.5px] text-egw-ink-62">I livelli si modificano con il permesso sulle impostazioni del sito.</p>
      )}
    </Panel>
  );
}

export function SponsorScreen() {
  const { can, canEdit } = useWebsiteArea();
  const [data, setData] = React.useState<SponsorShowcaseDto | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const canWrite = can("website.sponsors.manage") && canEdit;

  const load = React.useCallback(async () => {
    const result = await websiteApi.sponsors();
    if (result.error) setError(result.error.message);
    else {
      setError(null);
      setData(result.data);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const today = todayIso();
  const groups = React.useMemo(() => {
    if (!data) return [];
    const tierKeys = new Set(data.tiers.map((tier) => tier.key));
    const byTier = data.tiers.map((tier) => ({
      key: tier.key,
      label: tier.label,
      sponsors: data.sponsors.filter((sponsor) => sponsor.showcase.tierKey === tier.key).sort((a, b) => a.showcase.order - b.showcase.order || a.name.localeCompare(b.name)),
    }));
    const orphans = data.sponsors.filter((sponsor) => !tierKeys.has(sponsor.showcase.tierKey));
    if (orphans.length) byTier.push({ key: "__other", label: "Livello non piu esistente", sponsors: orphans });
    return byTier.filter((group) => group.sponsors.length);
  }, [data]);

  const selected = data?.sponsors.find((sponsor) => sponsor.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12.5px] text-egw-ink-62">Gli sponsor si creano e si modificano nell&apos;anagrafica del gestionale.</p>
          <Button asChild variant="secondary" size="sm">
            <Link href="/sponsors"><ExternalLink className="h-4 w-4" aria-hidden />Gestisci l&apos;anagrafica sponsor</Link>
          </Button>
        </div>
        {!canWrite ? (
          <InfoCard>{canEdit ? "Il tuo ruolo puo vedere la vetrina ma non modificarla." : "Il servizio e sospeso: la vetrina e in sola lettura."}</InfoCard>
        ) : null}
        {error ? (
          <AlertBlock severity="danger" title="Gli sponsor non si possono caricare">{error}</AlertBlock>
        ) : !data ? (
          <ListSkeleton />
        ) : !data.sponsors.length ? (
          <EmptyStateCard
            icon={<Handshake className="h-6 w-6" />}
            title="Nessuno sponsor in anagrafica"
            description="Aggiungi gli sponsor nel gestionale: poi scegli qui quali mostrare sul sito."
            primary={<Button asChild variant="primary"><Link href="/sponsors">Vai agli sponsor</Link></Button>}
          />
        ) : (
          groups.map((group) => (
            <Panel key={group.key} flush as="section">
              <h2 className="border-b border-egw-hairline px-5 py-3 text-[13.5px] font-bold text-egw-ink">
                {group.label} <span className="font-normal text-egw-ink-42">({group.sponsors.length})</span>
              </h2>
              <ul className="divide-y divide-egw-hairline">
                {group.sponsors.map((sponsor) => {
                  const active = sponsor.showcase.visible && (!sponsor.showcase.visibleFrom || today >= sponsor.showcase.visibleFrom) && (!sponsor.showcase.visibleTo || today <= sponsor.showcase.visibleTo);
                  return (
                    <li key={sponsor.id}>
                      <button type="button" onClick={() => setSelectedId(sponsor.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-egw-page-050 focus-visible:outline-none focus-visible:shadow-egw-focus sm:px-5">
                        <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-egw-hairline bg-white">
                          {sponsor.showcase.logoMediaId ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumbUrl(websiteMediaUrl(sponsor.showcase.logoMediaId), 128)} alt="" className="max-h-full max-w-full object-contain" />
                          ) : (
                            <span className="text-[10px] text-egw-ink-42">{sponsor.hasLegacyLogo ? "Logo scheda" : "Nessun logo"}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13.5px] font-semibold text-egw-ink">{sponsor.name}</span>
                            {sponsor.showcase.featured ? <Star className="h-3.5 w-3.5 fill-egw-amber text-egw-amber" aria-label="In evidenza" /> : null}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <StatusPill status={active ? VISIBLE : HIDDEN} size="sm" />
                            {sponsor.showcase.visible && !active ? <DataChip size="sm" tone="amber">Fuori periodo</DataChip> : null}
                            {periodLabel(sponsor.showcase) ? <span className="text-[11.5px] text-egw-ink-62">{periodLabel(sponsor.showcase)}</span> : null}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-egw-ink-42" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ))
        )}
      </div>
      <div className="min-w-0">
        <TiersPanel sponsors={data?.sponsors ?? []} onSaved={load} />
      </div>
      <SponsorDrawer sponsor={selected} tiers={data?.tiers ?? []} disabled={!canWrite} onClose={() => setSelectedId(null)} onSaved={load} />
    </div>
  );
}
