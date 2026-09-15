"use client";

import * as React from "react";
import { apiRequest } from "@/lib/api/client";
import { AUDIENCE_CRITERION_LABELS, type AudienceCriterionKind } from "@/lib/audience/criteria";
import {
  audienceCriterionNeedsSelection,
  eventAudienceOptions,
  isEventAudienceKind,
  loadSelectableEvents,
  type AudienceOption,
  type SelectableEvent,
} from "@/components/communications/audience-events";
import { emptyOptionsMessage } from "@/components/communications/v2/audience-model";
import { Field, Select } from "@/components/web/forms/Field";
import { Checkbox } from "@/components/web/primitives/Controls";
import { InsetBlock } from "@/components/web/primitives/Surface";

export { audienceCriteriaPayload, audienceSelectionError, emptyOptionsMessage } from "@/components/communications/v2/audience-model";

/**
 * **Chi riceve** — il selettore del pubblico condiviso da comunicazione
 * massiva e bacheca (Web V2).
 *
 * Nella V1 le due schermate riscrivevano lo stesso blocco: la tendina dei
 * criteri, l'elenco di caselle, i tre testi per «non c'e niente da
 * scegliere». Qui vive una volta sola; **l'elenco dei criteri offerti resta
 * pero in ogni pagina** (`CRITERI_OFFERTI`), perche e una decisione di
 * prodotto diversa per ciascuna: la bacheca non offre i criteri economici e
 * sanitari, che direbbero qualcosa di privato su chi legge.
 *
 * Quali eventi si possono offrire lo decide `audience-events.ts`, e se un
 * criterio pretende una selezione lo dice il dominio
 * (`audienceCriterionNeedsSelection`), non questa tendina.
 */

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

const optionLabel = (record: any) => String(record?.name || record?.label || record?.title || record?.id || "");

const mapOptions = (response: { data?: any }): AudienceOption[] =>
  asArray(response?.data).map((record) => ({ id: String(record?.id || ""), label: optionLabel(record) }));

/**
 * Le opzioni con cui si riempie un criterio: categorie, gruppi operativi,
 * sedi ed eventi, letti **una volta** all'apertura dalla stessa strada della
 * V1 (`apiRequest` sulle rotte di lettura del dominio; gli eventi da
 * `loadSelectableEvents`).
 */
export function useAudienceOptions() {
  const [categories, setCategories] = React.useState<AudienceOption[]>([]);
  const [groups, setGroups] = React.useState<AudienceOption[]>([]);
  const [sites, setSites] = React.useState<AudienceOption[]>([]);
  const [events, setEvents] = React.useState<SelectableEvent[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [categorie, gruppi, sedi, eventi] = await Promise.all([
        apiRequest<any[]>("/api/v1/categories"),
        apiRequest<any[]>("/api/v1/category_groups"),
        apiRequest<any[]>("/api/v1/club_sites"),
        loadSelectableEvents(),
      ]);
      if (cancelled) return;
      setCategories(mapOptions(categorie));
      setGroups(mapOptions(gruppi));
      setSites(mapOptions(sedi));
      setEvents(eventi);
    };
    load()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const optionsFor = React.useCallback(
    (kind: AudienceCriterionKind): AudienceOption[] => {
      if (kind === "category_ids") return categories;
      if (kind === "group_ids") return groups;
      if (kind === "site_ids") return sites;
      if (isEventAudienceKind(kind)) return eventAudienceOptions(events, kind);
      return [];
    },
    [categories, groups, sites, events],
  );

  return { optionsFor, loading };
}

export function AudiencePicker<K extends AudienceCriterionKind>({
  idPrefix,
  label = "Criterio",
  criteria,
  kind,
  onKindChange,
  selected,
  onSelectedChange,
  options,
  error,
}: {
  idPrefix: string;
  label?: string;
  /** L'elenco chiuso dei criteri che questa schermata offre. */
  criteria: readonly K[];
  kind: K;
  onKindChange: (kind: K) => void;
  selected: readonly string[];
  onSelectedChange: (next: string[]) => void;
  options: readonly AudienceOption[];
  error?: React.ReactNode;
}) {
  const needsSelection = audienceCriterionNeedsSelection(kind);
  const toggle = (id: string, checked: boolean) =>
    onSelectedChange(checked ? [...selected, id] : selected.filter((value) => value !== id));

  return (
    <>
      <Field label={label} htmlFor={`${idPrefix}-criterio`} error={!needsSelection ? error : undefined}>
        <Select
          id={`${idPrefix}-criterio`}
          value={kind}
          onValueChange={(value) => onKindChange(value as K)}
          options={criteria.map((value) => ({ value, label: AUDIENCE_CRITERION_LABELS[value] }))}
        />
      </Field>

      {needsSelection ? (
        <Field
          label="Seleziona"
          htmlFor={`${idPrefix}-opzioni`}
          error={error}
          helper={selected.length ? `${selected.length} ${selected.length === 1 ? "selezionata" : "selezionate"}` : undefined}
        >
          {options.length > 0 ? (
            <InsetBlock id={`${idPrefix}-opzioni`} tabIndex={-1} className="egw-scroll max-h-[240px] overflow-y-auto p-1.5 focus-visible:outline-none focus-visible:shadow-egw-focus">
              <ul className="flex flex-col">
                {options.map((option) => {
                  const checked = selected.includes(option.id);
                  return (
                    <li key={option.id}>
                      <label className="flex min-h-10 cursor-pointer items-start gap-2.5 rounded-egw-chip px-2 py-1.5 font-brand text-[13px] text-egw-ink hover:bg-white">
                        <Checkbox
                          size={16}
                          className="mt-0.5"
                          checked={checked}
                          onChange={(event) => toggle(option.id, event.target.checked)}
                        />
                        {/*
                          A 375 px l'etichetta di un evento — data, ora, nome,
                          categoria — e piu larga della colonna: senza `min-w-0`
                          il testo non va a capo, allarga il riquadro e con lui
                          la pagina.
                        */}
                        <span className="min-w-0 flex-1 break-words leading-[1.4]">{option.label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </InsetBlock>
          ) : (
            /*
              Vuoto e diverso da «non ancora scelto»: senza questa riga la
              schermata mostrava un criterio, nessuna opzione e nessuna
              spiegazione.
            */
            <InsetBlock dashed id={`${idPrefix}-opzioni`} tabIndex={-1}>
              <p className="font-brand text-[12.5px] leading-[1.5] text-egw-ink-62">{emptyOptionsMessage(kind)}</p>
            </InsetBlock>
          )}
        </Field>
      ) : null}
    </>
  );
}
