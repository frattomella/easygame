"use client";

import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { ConfirmDialog } from "@/components/web/overlays/Modal";
import { Field, FieldSizeProvider, FormGrid, TextInput } from "@/components/web/forms/Field";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { Toggle } from "@/components/web/primitives/Controls";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { InfoCard } from "@/components/web/page/Cards";
import { useToast } from "@/components/ui/toast-notification";
import { PERSON_STATUS } from "@/lib/web/status";
import { joinMeta } from "@/lib/web/format";
import { normalizeClubSites, serializeClubSite, type ClubSite } from "@/lib/club-sites";
import { pluralize } from "@/components/structures/v2/structure-model";

/**
 * «Gestisci sedi» in un cassetto da 480 (guideline 06 §6.7, 08 §8.5).
 *
 * E `ClubSitesSection` della V1 (ADR-0038) con gli stessi campi (nome
 * obbligatorio e unico, citta, indirizzo, note, attiva), la stessa regola —
 * una sede con strutture collegate **non si elimina**, si disattiva — e gli
 * stessi messaggi. Cambia una cosa sola, di proposito: eliminare una sede
 * ora **chiede** (§8.9, notevole) invece di agire al primo clic.
 *
 * Sta nella pagina Strutture perche una sede e il contenitore degli
 * impianti: chi apre «Strutture» sta gia pensando ai luoghi.
 */
type SiteForm = {
  id: string;
  name: string;
  city: string;
  address: string;
  notes: string;
  active: boolean;
};

const emptyForm = (): SiteForm => ({ id: "", name: "", city: "", address: "", notes: "", active: true });

const newSiteId = () => `site-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

export function SitesDrawer({
  open,
  onOpenChange,
  sites,
  structureCountBySiteId = {},
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sites: ClubSite[];
  structureCountBySiteId?: Record<string, number>;
  onChange: (nextSites: ClubSite[]) => void | Promise<void>;
}) {
  const { showToast } = useToast();
  const [form, setForm] = React.useState<SiteForm>(emptyForm);
  const [error, setError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<ClubSite | null>(null);
  const [busy, setBusy] = React.useState(false);

  const dirty = Boolean(form.id || form.name.trim() || form.city.trim() || form.address.trim() || form.notes.trim());

  React.useEffect(() => {
    if (!open) {
      setForm(emptyForm());
      setError(null);
    }
  }, [open]);

  const reset = () => {
    setForm(emptyForm());
    setError(null);
  };

  const patch = (next: Partial<SiteForm>) => {
    setForm((current) => ({ ...current, ...next }));
    if (error) setError(null);
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) {
      setError("Il nome della sede e obbligatorio");
      return;
    }
    const duplicated = sites.some((site) => site.id !== form.id && site.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicated) {
      setError("Esiste gia una sede con questo nome");
      return;
    }
    const nextSite: ClubSite = {
      id: form.id || newSiteId(),
      name,
      city: form.city.trim(),
      address: form.address.trim(),
      notes: form.notes.trim(),
      active: form.active,
    };
    const next = form.id ? sites.map((site) => (site.id === form.id ? nextSite : site)) : [...sites, nextSite];
    setBusy(true);
    try {
      await onChange(normalizeClubSites(next.map(serializeClubSite)));
      reset();
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    if (structureCountBySiteId[deleting.id]) {
      showToast("error", "Ha strutture collegate: disattivala invece di eliminarla");
      setDeleting(null);
      return;
    }
    setBusy(true);
    try {
      await onChange(normalizeClubSites(sites.filter((entry) => entry.id !== deleting.id).map(serializeClubSite)));
      if (form.id === deleting.id) reset();
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        width="default"
        eyebrow="Strutture"
        title="Gestisci sedi"
        description="Una sede è la città in cui il club opera. Con una sola sede configurata nessuna schermata mostra il filtro sede."
        dirty={dirty}
        locked={busy}
        data-test="sites-drawer"
        footer={
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Chiudi
          </Button>
        }
      >
        <FieldSizeProvider size="sm">
          <DrawerSection eyebrow={form.id ? "Modifica sede" : "Nuova sede"}>
            <div className="flex flex-col gap-4">
              <Field label="Nome sede" htmlFor="site-name" required error={error}>
                <TextInput id="site-name" value={form.name} onChange={(event) => patch({ name: event.target.value })} placeholder="Roma" autoComplete="off" />
              </Field>
              <FormGrid>
                <Field label="Città" htmlFor="site-city">
                  <TextInput id="site-city" value={form.city} onChange={(event) => patch({ city: event.target.value })} />
                </Field>
                <Field label="Indirizzo" htmlFor="site-address">
                  <TextInput id="site-address" value={form.address} onChange={(event) => patch({ address: event.target.value })} />
                </Field>
              </FormGrid>
              <Field label="Note" htmlFor="site-notes" optional>
                <TextInput id="site-notes" value={form.notes} onChange={(event) => patch({ notes: event.target.value })} />
              </Field>
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="site-active" className="font-brand text-[13px] font-semibold text-egw-ink">
                  Sede attiva
                </label>
                <Toggle id="site-active" checked={form.active} onCheckedChange={(checked) => patch({ active: checked })} aria-label="Sede attiva" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="neutral" size="sm" onClick={() => void save()} loading={busy}>
                  {form.id ? "Salva sede" : "Crea sede"}
                </Button>
                {form.id ? (
                  <Button variant="secondary" size="sm" onClick={reset} disabled={busy}>
                    Annulla modifica
                  </Button>
                ) : null}
              </div>
            </div>
          </DrawerSection>

          <DrawerSection eyebrow="Sedi operative">
            {sites.length === 0 ? (
              <InfoCard>Nessuna sede configurata: il club lavora come mono-sede.</InfoCard>
            ) : (
              <ul className="flex flex-col gap-2">
                {sites.map((site) => {
                  const structureCount = structureCountBySiteId[site.id] || 0;
                  return (
                    <li key={site.id}>
                      <InsetBlock className="flex items-start gap-3 p-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="egw-ellipsis font-brand text-[13px] font-semibold text-egw-ink">{site.name}</span>
                            {!site.active ? <StatusPill size="sm" status={PERSON_STATUS.inactive} /> : null}
                          </div>
                          <p className="mt-1 font-brand text-[12px] text-egw-ink-62">
                            {joinMeta(
                              joinMeta(site.city, site.address) || "Nessun indirizzo",
                              structureCount ? pluralize(structureCount, "struttura", "strutture") : null,
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <IconButton
                            aria-label={`Modifica ${site.name}`}
                            size="xs"
                            variant="row"
                            onClick={() =>
                              setForm({ id: site.id, name: site.name, city: site.city, address: site.address, notes: site.notes, active: site.active })
                            }
                          >
                            <Pencil />
                          </IconButton>
                          {/*
                            Una sede con strutture collegate non si elimina:
                            la struttura resterebbe con un riferimento a una
                            sede che non esiste. Il comando e **assente**, e
                            la riga dice perche.
                          */}
                          {structureCount > 0 ? null : (
                            <IconButton aria-label={`Elimina ${site.name}`} size="xs" variant="row" className="text-egw-red hover:text-egw-red" onClick={() => setDeleting(site)}>
                              <Trash2 />
                            </IconButton>
                          )}
                        </div>
                      </InsetBlock>
                      {structureCount > 0 ? (
                        <p className="mt-1 px-3 font-brand text-[11.5px] text-egw-ink-62">Ha strutture collegate: disattivala invece di eliminarla.</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </DrawerSection>
        </FieldSizeProvider>
      </Drawer>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => !next && setDeleting(null)}
        title={`Eliminare la sede ${deleting?.name ?? ""}?`}
        description="Nessuna struttura usa questa sede. Se preferisci conservarla in archivio, disattivala invece di eliminarla."
        confirmLabel="Elimina"
        tone="danger"
        loading={busy}
        onConfirm={confirmDelete}
      />
    </>
  );
}
