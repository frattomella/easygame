"use client";

import * as React from "react";
import { Field, SearchableSelect, Select } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { DataChip } from "@/components/web/primitives/StatusPill";
import {
  buildMembershipTargetIndex,
  describeMembershipPlacement,
  explainUnresolvedPlacement,
  type MembershipTargetIndex,
  type PlacementCategoryLike,
  type PlacementGroupLike,
} from "@/lib/categories/placement";
import {
  planMembershipChange,
  type PlannedMembership,
  type PreviousPrimaryPolicy,
} from "@/lib/categories/membership-change";
import type { SiteDisplayEntry } from "@/lib/categories/display";

/**
 * **L'editor delle appartenenze di un atleta** (ADR-0194 §26): uno solo, per
 * la scheda e per la creazione.
 *
 * Si sceglie una **squadra** — «Pulcini · S. Cosma» — non una categoria e
 * poi una sede: la sede e derivata dalla squadra e si legge, non si edita.
 * Le azioni sono esplicite: «Imposta come primaria», «Rimuovi», «Aggiungi
 * categoria». Quando una secondaria diventa primaria (o la primaria cambia)
 * l'editor chiede cosa fare della primaria precedente — default «Rimuovi»,
 * alternativa «Mantieni come secondaria» — e la scelta resta visibile e
 * ritoccabile finche non si salva. Nessuna mutazione nascosta.
 *
 * Il piano e lo stesso del server (`planMembershipChange`): cio che si vede
 * qui e cio che il salvataggio scrive. Il componente non possiede lo stato:
 * riceve le appartenenze, restituisce le appartenenze.
 */

export type EditorMembership = {
  categoryId: string;
  categoryName: string;
  storedCategoryName?: string;
  isPrimary: boolean;
  siteId: string;
};

const toPlanned = (rows: readonly EditorMembership[]): PlannedMembership[] =>
  rows.map((r) => ({
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    storedCategoryName: r.storedCategoryName,
    isPrimary: r.isPrimary,
    siteId: r.siteId || "",
    rowId: null,
  }));

const fromPlanned = (rows: readonly PlannedMembership[]): EditorMembership[] =>
  rows.map((r) => ({
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    ...(r.storedCategoryName ? { storedCategoryName: r.storedCategoryName } : {}),
    isPrimary: r.isPrimary,
    siteId: r.siteId || "",
  }));

export function useMembershipTargetIndex({
  categories,
  groups,
  sites,
}: {
  categories: readonly PlacementCategoryLike[];
  groups: readonly PlacementGroupLike[];
  sites: readonly SiteDisplayEntry[];
}) {
  return React.useMemo(
    () => buildMembershipTargetIndex({ categories, groups: groups.filter((g) => !(g as any).implicit), sites }),
    [categories, groups, sites],
  );
}

function MembershipRow({
  membership,
  index,
  onPromote,
  onRemove,
  disabled,
}: {
  membership: EditorMembership;
  index: MembershipTargetIndex;
  onPromote?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const placement = index.place(membership);
  const descrizione = describeMembershipPlacement(placement);
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-2 rounded-egw-control border border-egw-hairline bg-white px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-brand text-[13px] font-semibold text-egw-ink">{descrizione.label}</span>
        <span className="font-brand text-[11.5px] text-egw-ink-62">
          {placement.status === "resolved"
            ? `Sede: ${placement.target.siteName}`
            : placement.status === "no_site_configured"
              ? "Nessuna sede configurata per questa categoria"
              : explainUnresolvedPlacement(placement)}
        </span>
      </div>
      {!descrizione.valid ? (
        <DataChip size="sm" tone="amber">
          Squadra da confermare
        </DataChip>
      ) : null}
      {onPromote ? (
        <Button variant="text" size="sm" onClick={onPromote} disabled={disabled}>
          Imposta come primaria
        </Button>
      ) : null}
      {onRemove ? (
        <Button variant="text" size="sm" onClick={onRemove} disabled={disabled} aria-label={`Rimuovi ${descrizione.label}`}>
          Rimuovi
        </Button>
      ) : null}
    </li>
  );
}

export function AthleteCategoryMembershipEditor({
  index,
  memberships,
  onChange,
  disabled,
  idPrefix = "athlete-membership",
}: {
  index: MembershipTargetIndex;
  memberships: readonly EditorMembership[];
  onChange: (next: EditorMembership[]) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const primaria = memberships.find((m) => m.isPrimary) || null;
  const secondarie = memberships.filter((m) => !m.isPrimary);

  /*
    La primaria che questo giro di modifiche ha spostato: finche non si
    salva, il club puo cambiare idea su cosa farne. E lo stato **del solo
    editor**: la scelta si applica subito alle appartenenze (che il
    genitore vede), non resta in sospeso.
  */
  const [precedente, setPrecedente] = React.useState<EditorMembership | null>(null);
  const [politica, setPolitica] = React.useState<PreviousPrimaryPolicy>("remove");
  const [aggiunta, setAggiunta] = React.useState("");

  React.useEffect(() => {
    if (!primaria && precedente) setPrecedente(null);
  }, [primaria, precedente]);

  const presenti = new Set(memberships.map((m) => m.categoryId.toLowerCase()));
  const opzioniTutte = index.targets.map((t) => ({ value: t.id, label: t.label }));
  const primariaCorrente = primaria ? index.place(primaria) : null;
  const primariaTargetId = primariaCorrente?.status === "resolved"
    ? primariaCorrente.target.id
    : primariaCorrente?.status === "no_site_configured"
      ? index.forCategory(primaria!.categoryId)[0]?.id || ""
      : "";
  const opzioniPrimaria = React.useMemo(() => {
    const base = [...opzioniTutte];
    if (primaria && !primariaTargetId) {
      /* La primaria che il club non ha piu fra le squadre configurate si vede e non si risceglie. */
      base.unshift({ value: `__corrente__`, label: `${describeMembershipPlacement(index.place(primaria)).label} (da confermare)` });
    }
    return base;
  }, [opzioniTutte, primaria, primariaTargetId, index]);
  const opzioniAggiunta = opzioniTutte.filter((o) => {
    const t = index.byId(o.value);
    return t && !presenti.has(t.categoryId.toLowerCase());
  });

  const applica = (targetId: string, role: "primary" | "secondary", previousPrimaryPolicy: PreviousPrimaryPolicy = politica) => {
    const target = index.byId(targetId);
    if (!target) return;
    const plan = planMembershipChange(toPlanned(memberships), {
      kind: "assign",
      target: { categoryId: target.categoryId, categoryName: target.categoryName, siteId: target.siteId },
      role,
      previousPrimaryPolicy,
      otherSecondariesPolicy: "keep",
    });
    if (plan.blocked) return;
    if (role === "primary" && primaria && primaria.categoryId.toLowerCase() !== target.categoryId.toLowerCase()) {
      /* La domanda riguarda la primaria che esce **adesso**; una scelta gia fatta su una precedente resta com'e. */
      setPrecedente(primaria);
      setPolitica("remove");
    }
    onChange(fromPlanned(plan.after));
  };

  const cambiaPolitica = (next: PreviousPrimaryPolicy) => {
    setPolitica(next);
    if (!precedente || !primaria) return;
    const chiave = precedente.categoryId.toLowerCase();
    const senza = memberships.filter((m) => m.categoryId.toLowerCase() !== chiave);
    onChange(next === "keep_as_secondary" ? [...senza, { ...precedente, isPrimary: false }] : senza);
  };

  const rimuovi = (categoryId: string) => {
    const plan = planMembershipChange(toPlanned(memberships), { kind: "remove", categoryId });
    if (plan.blocked) return;
    onChange(fromPlanned(plan.after));
  };

  const SelectComponent = opzioniPrimaria.length > 8 ? SearchableSelect : Select;

  return (
    <div className="flex flex-col gap-4" data-test="athlete-membership-editor">
      <Field label="Categoria primaria" htmlFor={`${idPrefix}-primary`} helper={primaria ? undefined : "Scegli la squadra: la sede e quella della squadra."}>
        <SelectComponent
          id={`${idPrefix}-primary`}
          value={primariaTargetId || (primaria ? "__corrente__" : "")}
          onValueChange={(next) => {
            if (!next || next === "__corrente__") return;
            applica(next, "primary", "remove");
          }}
          options={opzioniPrimaria}
          placeholder="Seleziona la squadra"
          disabled={disabled}
        />
      </Field>
      {primaria ? (
        <ul className="flex flex-col gap-2" aria-label="Categoria primaria">
          <MembershipRow membership={primaria} index={index} disabled={disabled} />
        </ul>
      ) : null}

      {precedente && primaria && precedente.categoryId.toLowerCase() !== primaria.categoryId.toLowerCase() ? (
        <fieldset className="rounded-egw-control border border-egw-hairline bg-egw-page-100 p-3" data-test="previous-primary-policy">
          <legend className="px-1 font-brand text-[12px] font-semibold text-egw-ink-62">
            Cosa fare di «{describeMembershipPlacement(index.place(precedente)).label}», la categoria primaria precedente?
          </legend>
          <div className="mt-2 flex flex-col gap-2">
            {(
              [
                ["remove", "Rimuovila"],
                ["keep_as_secondary", "Mantienila come categoria secondaria"],
              ] as const
            ).map(([valore, etichetta]) => (
              <label key={valore} className="flex items-center gap-2 font-brand text-[13px] text-egw-ink">
                <input
                  type="radio"
                  name={`${idPrefix}-previous-primary`}
                  className="h-4 w-4"
                  checked={politica === valore}
                  disabled={disabled}
                  onChange={() => cambiaPolitica(valore)}
                />
                {etichetta}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="font-brand text-[12px] font-semibold leading-none text-egw-ink-62">Altre categorie</span>
        {secondarie.length ? (
          <ul className="flex flex-col gap-2" aria-label="Categorie secondarie">
            {secondarie.map((m) => {
              const placement = index.place(m);
              const promuovibile = placement.status === "resolved" || placement.status === "no_site_configured";
              const targetId = placement.status === "resolved" ? placement.target.id : placement.status === "no_site_configured" ? index.forCategory(m.categoryId)[0]?.id : "";
              return (
                <MembershipRow
                  key={m.categoryId}
                  membership={m}
                  index={index}
                  disabled={disabled}
                  onPromote={promuovibile && targetId ? () => applica(targetId, "primary", "remove") : undefined}
                  onRemove={() => rimuovi(m.categoryId)}
                />
              );
            })}
          </ul>
        ) : (
          <p className="font-brand text-[12.5px] text-egw-ink-62">Nessuna categoria secondaria.</p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Aggiungi categoria" htmlFor={`${idPrefix}-add`} className="min-w-[220px] flex-1">
            <Select
              id={`${idPrefix}-add`}
              value={aggiunta}
              onValueChange={setAggiunta}
              options={opzioniAggiunta}
              placeholder={opzioniAggiunta.length ? "Seleziona la squadra" : "Nessun'altra squadra"}
              disabled={disabled || !opzioniAggiunta.length}
            />
          </Field>
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled || !aggiunta}
            onClick={() => {
              if (!aggiunta) return;
              applica(aggiunta, primaria ? "secondary" : "primary");
              setAggiunta("");
            }}
          >
            + Aggiungi
          </Button>
        </div>
      </div>
    </div>
  );
}
