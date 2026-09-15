"use client";

import * as React from "react";
import { Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, RowActionDef } from "@/components/web/datagrid/types";
import { Drawer } from "@/components/web/overlays/Drawer";
import { useConfirm } from "@/components/web/overlays/useConfirm";
import { Button } from "@/components/web/primitives/Button";
import { DateInput, Field, FieldSizeProvider, SearchableSelect, TextInput, ValidationSummary } from "@/components/web/forms/Field";
import { formatDateShort, MISSING, orMissing } from "@/lib/web/format";
import { todayLocalDateOnly } from "@/lib/date-only";
import type { ClubFederationEntry } from "@/lib/club-profile";
import { CLUB_SECTIONS, ITALIAN_FEDERATIONS, OTHER_OPTION, isKnownFederation } from "@/components/organization/v2/club-model";

/**
 * Le affiliazioni del club (sezione «Federazione»): la tabella modificabile
 * in linea della V1 diventa la griglia del sistema piu un cassetto per
 * aggiungere e modificare (guideline 07 §7.1, 08 §8.5). La persistenza non
 * cambia: la sezione `federazione` dell'autosave scrive
 * `settings.federations` quando l'elenco cambia.
 *
 * Togliere un'affiliazione chiede una conferma «notevole» (08 §8.9): nella
 * V1 il cestino scriveva subito, e un'affiliazione tolta orfana i
 * tesseramenti che la citano.
 */
type DraftState = { id: string | null; name: string; customName: string; registrationNumber: string; affiliationDate: string };

const emptyDraft = (): DraftState => ({ id: null, name: "", customName: "", registrationNumber: "", affiliationDate: todayLocalDateOnly() });

const draftFrom = (entry: ClubFederationEntry): DraftState => {
  const name = String(entry.name || "");
  const known = isKnownFederation(name);
  return {
    id: String(entry.id || ""),
    name: known ? name : name ? OTHER_OPTION : "",
    customName: known ? "" : name,
    registrationNumber: String(entry.registrationNumber || ""),
    affiliationDate: String(entry.affiliationDate || ""),
  };
};

const FEDERATION_OPTIONS = ITALIAN_FEDERATIONS.map((name) => ({ value: name, label: name }));

const federationName = (draft: DraftState) => (draft.name === OTHER_OPTION ? draft.customName.trim() : draft.name);

export function ClubFederationsSection({
  federations,
  onChange,
}: {
  federations: ClubFederationEntry[];
  onChange: (next: ClubFederationEntry[]) => void;
}) {
  const meta = CLUB_SECTIONS.find((section) => section.id === "federazione");
  const [confirm, confirmDialog] = useConfirm();
  const [draft, setDraft] = React.useState<DraftState | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [errors, setErrors] = React.useState<Array<{ id?: string; label: string }>>([]);

  const rows = React.useMemo(
    () => federations.map((entry, index) => ({ ...entry, id: String(entry.id || `fed-${index}`) })),
    [federations],
  );

  const open = (entry?: ClubFederationEntry) => {
    setDraft(entry ? draftFrom(entry) : emptyDraft());
    setDirty(false);
    setErrors([]);
  };

  const update = (patch: Partial<DraftState>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
    if (errors.length) setErrors([]);
  };

  const save = () => {
    if (!draft) return;
    const name = federationName(draft);
    const found: Array<{ id?: string; label: string }> = [];
    if (!name) found.push({ id: draft.name === OTHER_OPTION ? "federation-custom-name" : "federation-name", label: "Federazione o ente" });
    setErrors(found);
    if (found.length) return;

    const entry: ClubFederationEntry = {
      id: draft.id || `fed-${Date.now()}`,
      name,
      registrationNumber: draft.registrationNumber.trim(),
      affiliationDate: draft.affiliationDate,
    };
    const exists = draft.id && federations.some((item) => String(item.id) === draft.id);
    onChange(exists ? federations.map((item) => (String(item.id) === draft.id ? entry : item)) : [...federations, entry]);
    setDirty(false);
    setDraft(null);
  };

  const remove = async (entry: ClubFederationEntry) => {
    const ok = await confirm({
      title: `Togliere l'affiliazione a ${entry.name || "questo ente"}?`,
      description: "I tesseramenti che la citano restano nelle schede degli atleti, senza piu un ente a cui riferirsi.",
      confirmLabel: "Togli affiliazione",
    });
    if (!ok) return;
    onChange(federations.filter((item) => String(item.id) !== String(entry.id)));
  };

  const columns: ColumnDef<ClubFederationEntry>[] = [
    {
      id: "name",
      header: "Federazione / ente",
      kind: "identity",
      locked: true,
      cell: (row) => <span className="font-brand text-[12.5px] font-semibold text-egw-ink">{orMissing(row.name)}</span>,
      sortValue: (row) => row.name || "",
      title: (row) => row.name || undefined,
    },
    {
      id: "registrationNumber",
      header: "Codice affiliazione",
      kind: "number",
      cell: (row) => orMissing(row.registrationNumber),
      sortValue: (row) => row.registrationNumber || "",
    },
    {
      id: "affiliationDate",
      header: "Data affiliazione",
      kind: "date",
      cell: (row) => (row.affiliationDate ? formatDateShort(row.affiliationDate) : MISSING),
      sortValue: (row) => row.affiliationDate || "",
    },
  ];

  const rowActions: RowActionDef<ClubFederationEntry>[] = [
    { id: "edit", label: "Modifica", icon: <Pencil />, primary: true, onClick: (row) => open(row) },
    { id: "remove", label: "Togli affiliazione", icon: <Trash2 />, tone: "danger", onClick: (row) => void remove(row) },
  ];

  return (
    <section id="club-section-federazione" aria-label="Federazioni e affiliazioni" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-brand text-[15px] font-bold leading-5 text-egw-ink">Federazioni e affiliazioni</h2>
          <p className="mt-1 font-brand text-[12.5px] text-egw-ink-62">{meta?.description}</p>
        </div>
        <Button variant="primary" icon={<Plus />} onClick={() => open()}>
          Nuova affiliazione
        </Button>
      </div>

      <DataGrid<ClubFederationEntry>
        module="club-federazioni"
        aria-label="Elenco delle affiliazioni"
        rows={rows}
        getRowId={(row) => String(row.id)}
        rowLabel={(row) => row.name || "affiliazione"}
        columns={columns}
        rowActions={rowActions}
        onOpenRow={(row) => open(row)}
        defaultSort={{ columnId: "affiliationDate", direction: "desc" }}
        noun={{ singular: "affiliazione", plural: "affiliazioni" }}
        hideViews
        hideFooter={rows.length <= 25}
        persist={false}
        empty={{
          icon: <Landmark />,
          title: "Nessuna affiliazione registrata",
          description: "Aggiungi la federazione o l'ente a cui il club e affiliato: il codice e la data compaiono sui tesseramenti.",
          primary: (
            <Button variant="primary" size="sm" icon={<Plus />} onClick={() => open()}>
              Nuova affiliazione
            </Button>
          ),
        }}
      />

      <Drawer
        open={Boolean(draft)}
        onOpenChange={(next) => !next && setDraft(null)}
        eyebrow="Federazione"
        title={draft?.id ? "Modifica affiliazione" : "Nuova affiliazione"}
        dirty={dirty}
        data-test="club-federation-drawer"
        footer={
          <>
            <Button variant="primary" onClick={save}>
              Salva
            </Button>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Annulla
            </Button>
          </>
        }
      >
        {draft ? (
          <FieldSizeProvider size="sm">
            <div className="flex flex-col gap-5">
              <ValidationSummary errors={errors} />
              <Field label="Federazione o ente" htmlFor="federation-name" required error={errors.find((e) => e.id === "federation-name")?.label ? "Scegli la federazione o l'ente" : undefined}>
                <SearchableSelect id="federation-name" value={draft.name || null} onValueChange={(value) => update({ name: value || "" })} options={FEDERATION_OPTIONS} placeholder="Seleziona federazione" searchPlaceholder="Cerca per sigla o nome" />
              </Field>
              {draft.name === OTHER_OPTION ? (
                <Field label="Nome dell'ente" htmlFor="federation-custom-name" required error={errors.find((e) => e.id === "federation-custom-name")?.label ? "Scrivi il nome dell'ente" : undefined}>
                  <TextInput id="federation-custom-name" value={draft.customName} onChange={(event) => update({ customName: event.target.value })} placeholder="Inserisci nome manualmente" />
                </Field>
              ) : null}
              <Field label="Codice affiliazione" htmlFor="federation-code" width="20ch">
                <TextInput id="federation-code" value={draft.registrationNumber} onChange={(event) => update({ registrationNumber: event.target.value })} placeholder="Es. 123456" className="egw-num" />
              </Field>
              <Field label="Data affiliazione" htmlFor="federation-date" width="14ch">
                <DateInput id="federation-date" value={draft.affiliationDate} onChange={(event) => update({ affiliationDate: event.target.value })} />
              </Field>
            </div>
          </FieldSizeProvider>
        ) : null}
      </Drawer>
      {confirmDialog}
    </section>
  );
}
