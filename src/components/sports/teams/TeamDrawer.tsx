"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { Toggle } from "@/components/web/primitives/Controls";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { AlertBlock } from "@/components/web/page/Alerts";
import { InfoCard } from "@/components/web/page/Cards";
import { Field, FormGrid, Select, Textarea, TextInput } from "@/components/web/forms/Field";
import { MediaField } from "@/components/website/admin/MediaPicker";
import { useToast } from "@/components/ui/toast-notification";
import { listSportAdapters } from "@/lib/sports/adapters";
import { sportsApi, type ClubTeamDto } from "@/lib/sports/client";
import type { WebsiteMediaAvailability } from "@/components/sports/useWebsiteMediaAvailability";
import type { TeamEditorOptions } from "@/components/sports/teams/team-options";

/**
 * **Crea o modifica una squadra stabile** (ADR-0200 §8). Scrive solo da
 * `/api/v1/club-teams` (unico scrittore `src/lib/server/club-teams.ts`): il
 * server vaglia slug, stagioni, categorie della stagione e gruppi, e il suo
 * messaggio si mostra com'e.
 */

const NONE = "__none__";

type LinkDraft = { key: string; seasonId: string; categoryId: string; groupId: string };

type TeamDraft = {
  name: string;
  shortName: string;
  slug: string;
  sport: string;
  description: string;
  photoMediaId: string | null;
  active: boolean;
  sortOrder: string;
  links: LinkDraft[];
};

let linkSequence = 0;
const nextLinkKey = () => `link-${++linkSequence}`;

const draftFromTeam = (team: ClubTeamDto | null): TeamDraft => ({
  name: team?.name || "",
  shortName: team?.shortName || "",
  slug: team?.slug || "",
  sport: team?.sport || "",
  description: team?.description || "",
  photoMediaId: team?.photoMediaId || null,
  active: team ? team.active : true,
  sortOrder: team ? String(team.sortOrder ?? 0) : "0",
  links: (team?.seasonLinks || []).map((link) => ({
    key: nextLinkKey(),
    seasonId: link.seasonId,
    categoryId: link.categoryId,
    groupId: link.groupId || "",
  })),
});

/** Lo stesso calco dello slug del server, solo per l'anteprima dell'indirizzo. */
const previewSlug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const comparable = (draft: TeamDraft) =>
  JSON.stringify({ ...draft, links: draft.links.map((link) => [link.seasonId, link.categoryId, link.groupId]) });

export type TeamDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = nuova squadra. */
  team: ClubTeamDto | null;
  options: TeamEditorOptions | null;
  media: WebsiteMediaAvailability;
  onSaved: (team: ClubTeamDto) => void;
};

export function TeamDrawer({ open, onOpenChange, team, options, media, onSaved }: TeamDrawerProps) {
  const { showToast } = useToast();
  const [draft, setDraft] = React.useState<TeamDraft>(() => draftFromTeam(team));
  const [initial, setInitial] = React.useState(() => comparable(draftFromTeam(team)));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [linkErrors, setLinkErrors] = React.useState<Record<string, string>>({});
  const [nameError, setNameError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const next = draftFromTeam(team);
    setDraft(next);
    setInitial(comparable(next));
    setError(null);
    setLinkErrors({});
    setNameError(null);
  }, [open, team]);

  const update = (patch: Partial<TeamDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const updateLink = (key: string, patch: Partial<LinkDraft>) =>
    setDraft((current) => ({
      ...current,
      links: current.links.map((link) => (link.key === key ? { ...link, ...patch } : link)),
    }));

  const seasons = options?.seasons || [];
  const usedSeasons = new Set(draft.links.map((link) => link.seasonId).filter(Boolean));
  const freeSeason = seasons.find((season) => !usedSeasons.has(season.id));

  const addLink = () => {
    const season = seasons.find((candidate) => candidate.active && !usedSeasons.has(candidate.id)) || freeSeason;
    if (!season) return;
    setDraft((current) => ({
      ...current,
      links: [...current.links, { key: nextLinkKey(), seasonId: season.id, categoryId: "", groupId: "" }],
    }));
  };

  const dirty = comparable(draft) !== initial;
  const slugPreview = previewSlug(draft.slug || draft.name);

  const handleSave = async () => {
    if (saving) return;
    const name = draft.name.trim();
    const errors: Record<string, string> = {};
    for (const link of draft.links) {
      if (!link.seasonId) errors[link.key] = "Scegli la stagione";
      else if (!link.categoryId) errors[link.key] = "Scegli la categoria di questa stagione";
    }
    setNameError(name ? null : "Dai un nome alla squadra");
    setLinkErrors(errors);
    if (!name || Object.keys(errors).length) return;

    const sortOrder = Math.round(Number(draft.sortOrder));
    const payload = {
      name,
      shortName: draft.shortName.trim(),
      sport: draft.sport || null,
      description: draft.description.trim(),
      photoMediaId: draft.photoMediaId,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      seasonLinks: draft.links.map((link) => ({
        seasonId: link.seasonId,
        categoryId: link.categoryId,
        groupId: link.groupId || null,
      })),
    };

    setSaving(true);
    setError(null);
    try {
      let saved: ClubTeamDto;
      if (team) {
        const response = await sportsApi.updateTeam(team.id, {
          ...payload,
          active: draft.active,
          ...(draft.slug.trim() && draft.slug.trim() !== team.slug ? { slug: draft.slug.trim() } : {}),
          expectedVersion: team.version,
        });
        if (response.error || !response.data) throw new Error(response.error?.message || "Impossibile salvare la squadra");
        saved = response.data;
      } else {
        const response = await sportsApi.createTeam({ ...payload, ...(draft.slug.trim() ? { slug: draft.slug.trim() } : {}) });
        if (response.error || !response.data) throw new Error(response.error?.message || "Impossibile creare la squadra");
        saved = response.data;
        /* La creazione nasce attiva: se la si vuole spenta, e un secondo gesto. */
        if (!draft.active) {
          const spenta = await sportsApi.updateTeam(saved.id, { active: false, expectedVersion: saved.version });
          if (spenta.error || !spenta.data) throw new Error(spenta.error?.message || "Squadra creata, ma non è stato possibile disattivarla");
          saved = spenta.data;
        }
      }
      showToast("success", team ? `Squadra «${saved.name}» salvata` : `Squadra «${saved.name}» creata`);
      setInitial(comparable(draft));
      onSaved(saved);
      onOpenChange(false);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Impossibile salvare la squadra";
      setError(message);
      showToast("error", message);
    } finally {
      setSaving(false);
    }
  };

  const sportOptions = [
    { value: NONE, label: options ? `Come il club (${options.clubSportLabel})` : "Come il club" },
    ...listSportAdapters()
      .filter((adapter) => adapter.key !== "generic")
      .map((adapter) => ({ value: adapter.key, label: adapter.label })),
    { value: "generic", label: "Altro sport (generico)" },
  ];

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      eyebrow="Squadra stabile"
      title={team ? `Modifica «${team.name}»` : "Nuova squadra"}
      description="Un'identità che resta fra le stagioni: ogni stagione la collega alla sua categoria."
      dirty={dirty && !saving}
      locked={saving}
      footer={
        <>
          <Button variant="primary" onClick={() => void handleSave()} loading={saving}>
            {team ? "Salva" : "Crea squadra"}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      {error ? (
        <AlertBlock severity="danger" title="Il salvataggio non è riuscito" className="mb-5">
          {error}
        </AlertBlock>
      ) : null}

      <DrawerSection eyebrow="Identità">
        <FormGrid>
          <Field label="Nome" htmlFor="team-name" required error={nameError}>
            <TextInput
              id="team-name"
              value={draft.name}
              onChange={(event) => update({ name: event.target.value.slice(0, 80) })}
              placeholder="Serie C"
              disabled={saving}
            />
          </Field>
          <Field label="Nome breve" htmlFor="team-short-name" optional helper="Per tabelloni e risultati: «Serie C», «U15».">
            <TextInput
              id="team-short-name"
              value={draft.shortName}
              onChange={(event) => update({ shortName: event.target.value.slice(0, 30) })}
              disabled={saving}
            />
          </Field>
          <Field
            label="Indirizzo (slug)"
            htmlFor="team-slug"
            optional={!team}
            helper={
              <>
                Indirizzo pubblico: <span className="egw-num font-semibold">/squadre/{slugPreview || "…"}</span>.
                {team ? " Se lo cambi, i vecchi indirizzi continuano a reindirizzare qui." : " Vuoto = ricavato dal nome."}
                {team?.previousSlugs.length ? ` Indirizzi precedenti: ${team.previousSlugs.join(", ")}.` : ""}
              </>
            }
          >
            <TextInput
              id="team-slug"
              value={draft.slug}
              onChange={(event) => update({ slug: event.target.value.slice(0, 80) })}
              placeholder={previewSlug(draft.name) || "serie-c"}
              disabled={saving}
            />
          </Field>
          <Field label="Sport" htmlFor="team-sport" helper="Decide quarti, tempi o set e le statistiche delle gare di questa squadra.">
            <Select
              id="team-sport"
              value={draft.sport || NONE}
              onValueChange={(value) => update({ sport: value === NONE ? "" : value })}
              options={sportOptions}
              disabled={saving}
            />
          </Field>
        </FormGrid>
        <Field label="Descrizione" htmlFor="team-description" optional className="mt-4">
          <Textarea
            id="team-description"
            value={draft.description}
            onChange={(event) => update({ description: event.target.value.slice(0, 2000) })}
            rows={3}
            disabled={saving}
          />
        </Field>
      </DrawerSection>

      <DrawerSection eyebrow="Sito e ordine">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_200px]">
          <div>
            <MediaField
              label="Foto della squadra"
              value={draft.photoMediaId ? { mediaId: draft.photoMediaId } : null}
              onChange={(value) => update({ photoMediaId: value?.mediaId || null })}
              category="team-photo"
              disabled={saving || !media.available}
              help={
                media.checking
                  ? "Verifica della libreria del sito…"
                  : media.reason || "La foto viene dalla libreria del sito e compare nella pagina pubblica della squadra."
              }
            />
          </div>
          <div className="space-y-4">
            <Field label="Ordine" htmlFor="team-sort" helper="Le squadre si elencano dal numero più basso.">
              <TextInput
                id="team-sort"
                type="number"
                inputMode="numeric"
                numeric
                value={draft.sortOrder}
                onChange={(event) => update({ sortOrder: event.target.value })}
                disabled={saving}
              />
            </Field>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="team-active" className="font-brand text-[12px] font-semibold text-egw-ink-62">
                Squadra attiva
              </label>
              <Toggle id="team-active" checked={draft.active} onCheckedChange={(next) => update({ active: next })} disabled={saving} />
            </div>
            <p className="text-[11.5px] text-egw-ink-62">Una squadra non attiva sparisce dal sito ma resta collegata alle sue gare.</p>
          </div>
        </div>
      </DrawerSection>

      <DrawerSection eyebrow="Stagioni">
        <p className="mb-3 text-[12.5px] text-egw-ink-62">
          In ogni stagione la squadra corrisponde a una categoria del club e, se il club ha più sedi, a un gruppo operativo.
        </p>
        {options?.seasonsMissing ? (
          <InfoCard>
            Il club non ha ancora stagioni salvate: crea la prima stagione da Club → Stagioni, poi collega qui la squadra alle categorie.
          </InfoCard>
        ) : (
          <>
            {draft.links.length ? (
              <ul className="space-y-3">
                {draft.links.map((link) => {
                  const seasonOptions = seasons
                    .filter((season) => season.id === link.seasonId || !usedSeasons.has(season.id))
                    .map((season) => ({ value: season.id, label: season.active ? `${season.label} (attiva)` : season.label }));
                  const categoryOptions = (options?.categories || [])
                    .filter((category) => category.seasonId === link.seasonId)
                    .map((category) => ({ value: category.id, label: category.name }));
                  const groupOptions = [
                    { value: NONE, label: "Nessun gruppo" },
                    ...(options?.groups || [])
                      .filter((group) => group.seasonId === link.seasonId && group.categoryId === link.categoryId)
                      .map((group) => ({ value: group.id, label: group.label })),
                  ];
                  return (
                    <li key={link.key}>
                      <InsetBlock className="p-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end">
                          <Field label="Stagione" htmlFor={`${link.key}-season`}>
                            <Select
                              id={`${link.key}-season`}
                              value={link.seasonId}
                              onValueChange={(value) => updateLink(link.key, { seasonId: value, categoryId: "", groupId: "" })}
                              options={seasonOptions}
                              disabled={saving}
                            />
                          </Field>
                          <Field label="Categoria" htmlFor={`${link.key}-category`}>
                            <Select
                              id={`${link.key}-category`}
                              value={link.categoryId || null}
                              onValueChange={(value) => updateLink(link.key, { categoryId: value, groupId: "" })}
                              options={categoryOptions}
                              placeholder={categoryOptions.length ? "Scegli la categoria" : "Nessuna categoria in questa stagione"}
                              disabled={saving || !categoryOptions.length}
                            />
                          </Field>
                          <Field label="Gruppo" htmlFor={`${link.key}-group`} optional>
                            <Select
                              id={`${link.key}-group`}
                              value={link.groupId || NONE}
                              onValueChange={(value) => updateLink(link.key, { groupId: value === NONE ? "" : value })}
                              options={groupOptions}
                              disabled={saving || !link.categoryId || groupOptions.length <= 1}
                            />
                          </Field>
                          <Button
                            variant="text"
                            size="sm"
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            onClick={() => setDraft((current) => ({ ...current, links: current.links.filter((item) => item.key !== link.key) }))}
                            disabled={saving}
                            aria-label="Togli il collegamento di questa stagione"
                          >
                            <span className="sm:hidden">Togli</span>
                          </Button>
                        </div>
                        {linkErrors[link.key] ? (
                          <p role="alert" className="mt-2 text-[11.5px] font-medium text-egw-red">
                            {linkErrors[link.key]}
                          </p>
                        ) : null}
                      </InsetBlock>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[12.5px] text-egw-ink-62">Nessuna stagione collegata.</p>
            )}
            {freeSeason ? (
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={addLink}
                disabled={saving || !options}
              >
                Collega una stagione
              </Button>
            ) : null}
          </>
        )}
      </DrawerSection>
    </Drawer>
  );
}
