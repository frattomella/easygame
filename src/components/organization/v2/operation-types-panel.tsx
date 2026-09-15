"use client";

import * as React from "react";
import { Pencil, Plus, Power, Tags, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { Drawer } from "@/components/web/overlays/Drawer";
import { useConfirm } from "@/components/web/overlays/useConfirm";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { AlertBlock } from "@/components/web/page/Alerts";
import { InfoCard } from "@/components/web/page/Cards";
import { Field, FieldSizeProvider, FormGrid, Select, TextInput, ValidationSummary } from "@/components/web/forms/Field";
import { PERSON_STATUS } from "@/lib/web/status";
import { formatDateShort, MISSING, orMissing } from "@/lib/web/format";
import { OPERATION_TYPE_STATUS } from "@/components/organization/v2/club-model";

/**
 * Le **causali** di una societa (Web V2): la griglia del sistema al posto
 * delle schede chiudibili della V1, un cassetto a 720 per modificare e uno a
 * 480 per aggiungere. Stesso endpoint, stesse regole:
 *
 * 1. **«Non dichiarato» si vede.** Un flag vuoto ha un suo stato e una vista
 *    con la sua tinta; finche resta cosi, il rendiconto lo conta a parte.
 * 2. **Chi non puo modificare non vede i comandi.** Il permesso arriva dalla
 *    rotta — `permissions.canManage` — e non si deduce dal ruolo qui.
 * 3. **Una voce di sistema non si cancella.** L'azione non c'e; al suo posto
 *    c'e «Disattiva».
 */
type OperationType = {
  code: string;
  label: string;
  documentRoute: string;
  vatRate: number | null;
  vatNature: string | null;
  activityScope: string;
  directionHint: string | null;
  reportingBucket: string | null;
  defaultDescription: string | null;
  deductible: boolean | null;
  isMembershipFee: boolean | null;
  classifiedBy: string | null;
  classifiedAt: string | null;
  isActive: boolean;
  isSystem: boolean;
  notes: string | null;
};

type Vocabolario = Array<{ key: string; label: string }>;

type Vista = {
  operationTypes: OperationType[];
  permissions: { canManage: boolean };
  vocabularies: { documentRoutes: Vocabolario; activityScopes: Vocabolario; directionHints: Vocabolario };
};

/** `null` non e `false`: e la terza opzione, e ha una sua etichetta. */
const TRI_STATO = [
  { value: "null", label: "Non dichiarato" },
  { value: "true", label: "Si" },
  { value: "false", label: "No" },
] as const;

const daTriStato = (value: string): boolean | null => (value === "true" ? true : value === "false" ? false : null);
const aTriStato = (value: boolean | null | undefined) => (value === true ? "true" : value === false ? "false" : "null");
const triStatoLabel = (value: boolean | null | undefined) => TRI_STATO.find((stato) => stato.value === aTriStato(value))?.label || "Non dichiarato";

const dichiarata = (voce: OperationType) => voce.activityScope !== "unspecified" || voce.deductible !== null || voce.isMembershipFee !== null;

const NO_DIRECTION = "none";

const VIEWS: ViewDef[] = [
  { id: "attive", label: "Attive", filters: { stato: "attive" }, builtIn: true, isDefault: true },
  { id: "da_classificare", label: "Da classificare", filters: { classificazione: "da_classificare" }, tone: "amber", builtIn: true },
  { id: "disattivate", label: "Disattivate", filters: { stato: "disattivate" }, builtIn: true },
];

const labelOf = (list: Vocabolario, key: string | null | undefined) => list.find((item) => item.key === key)?.label;

/**
 * Il codice si deriva dall'etichetta e non si chiede: e una chiave tecnica
 * che i movimenti citeranno per sempre.
 */
const codeFromLabel = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

export function OperationTypesPanel({ organizationId }: { organizationId?: string | null }) {
  const { showToast } = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [vista, setVista] = React.useState<Vista | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState<string>("");

  const [editing, setEditing] = React.useState<OperationType | null>(null);
  const [bozza, setBozza] = React.useState<OperationType | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [nuovaLabel, setNuovaLabel] = React.useState("");
  const [nuovoVerso, setNuovoVerso] = React.useState("IN");
  const [errors, setErrors] = React.useState<Array<{ id?: string; label: string }>>([]);

  const query = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";

  const carica = React.useCallback(async () => {
    setLoading(true);
    const response = await apiRequest<Vista>(`/api/v1/fiscal/operation-types${query}`);
    setLoading(false);
    if (response.error || !response.data) {
      const message = response.error?.message || "Errore nella lettura delle causali";
      setLoadError(message);
      showToast("error", message);
      return null;
    }
    setLoadError(null);
    setVista(response.data);
    return response.data;
  }, [query, showToast]);

  React.useEffect(() => {
    void carica();
  }, [carica]);

  const voci = React.useMemo(() => vista?.operationTypes || [], [vista]);
  const daClassificare = React.useMemo(() => voci.filter((voce) => !dichiarata(voce)), [voci]);
  const canManage = Boolean(vista?.permissions?.canManage);

  const openEdit = (voce: OperationType) => {
    setEditing(voce);
    setBozza({ ...voce });
    setDirty(false);
    setErrors([]);
  };

  const modifica = (patch: Partial<OperationType>) => {
    setBozza((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
    if (errors.length) setErrors([]);
  };

  const salva = async (voce: OperationType, patch: Partial<OperationType> = {}) => {
    const payload = { ...voce, ...patch };
    setSalvando(voce.code);
    const response = await apiRequest("/api/v1/fiscal/operation-types", {
      method: "PUT",
      body: {
        organization_id: organizationId,
        code: voce.code,
        label: payload.label,
        documentRoute: payload.documentRoute,
        activityScope: payload.activityScope,
        directionHint: payload.directionHint,
        reportingBucket: payload.reportingBucket,
        defaultDescription: payload.defaultDescription,
        deductible: payload.deductible,
        isMembershipFee: payload.isMembershipFee,
        vatRate: payload.vatRate,
        vatNature: payload.vatNature,
        isActive: payload.isActive,
        notes: payload.notes,
      },
    });
    setSalvando("");
    if (response.error) {
      showToast("error", response.error.message || "Salvataggio non riuscito");
      return false;
    }
    showToast("success", `Causale «${payload.label}» aggiornata`);
    await carica();
    return true;
  };

  const salvaBozza = async () => {
    if (!editing || !bozza) return;
    if (!dirty) {
      setEditing(null);
      return;
    }
    if (!String(bozza.label || "").trim()) {
      setErrors([{ id: "causale-label", label: "Nome" }]);
      return;
    }
    const ok = await salva(editing, bozza);
    if (ok) {
      setDirty(false);
      setEditing(null);
    }
  };

  const toggleActive = async (voce: OperationType) => {
    await salva(voce, { isActive: !voce.isActive });
  };

  const crea = async () => {
    const label = nuovaLabel.trim();
    if (!label) {
      setErrors([{ id: "nuova-causale", label: "Nome" }]);
      return;
    }
    const code = codeFromLabel(label);
    if (!code) {
      showToast("error", "Il nome della causale deve contenere delle lettere");
      return;
    }
    setSalvando("__nuova__");
    const response = await apiRequest("/api/v1/fiscal/operation-types", {
      method: "PUT",
      body: { organization_id: organizationId, code, label, directionHint: nuovoVerso },
    });
    setSalvando("");
    if (response.error) {
      showToast("error", response.error.message || "Creazione non riuscita");
      return;
    }
    setNuovaLabel("");
    setCreating(false);
    showToast("success", `Causale «${label}» creata: ora va classificata`);
    const refreshed = await carica();
    const nuova = refreshed?.operationTypes.find((voce) => voce.code === code);
    if (nuova) openEdit(nuova);
  };

  const elimina = async (voce: OperationType) => {
    const ok = await confirm({
      tone: "danger",
      title: `Eliminare la causale «${voce.label}»?`,
      description: "Se qualche movimento la cita, il server la disattiva invece di cancellarla: i movimenti gia registrati non perdono la loro classificazione.",
      confirmLabel: "Elimina",
      consequences: ["La causale sparisce dalle scelte di prima nota e di incasso", "I rendiconti futuri non la contano piu"],
    });
    if (!ok) return;

    setSalvando(voce.code);
    const response = await apiRequest<{ deleted: boolean; message: string }>(
      `/api/v1/fiscal/operation-types?code=${encodeURIComponent(voce.code)}&action=delete${organizationId ? `&organization_id=${encodeURIComponent(organizationId)}` : ""}`,
      { method: "DELETE" },
    );
    setSalvando("");
    if (response.error) {
      showToast("error", response.error.message || "Operazione non riuscita");
      return;
    }
    showToast(response.data?.deleted ? "success" : "info", response.data?.message || "Operazione eseguita");
    await carica();
  };

  /* ── La griglia ────────────────────────────────────────────────────────── */
  const vocab = vista?.vocabularies;

  const columns: ColumnDef<OperationType>[] = [
    {
      id: "label",
      header: "Causale",
      kind: "identity",
      locked: true,
      cell: (voce) => (
        <span className="flex min-w-0 flex-col">
          <span className="egw-ellipsis font-brand text-[12.5px] font-semibold text-egw-ink">{voce.label}</span>
          <span className="egw-ellipsis font-brand text-[10.5px] text-[rgba(11,26,58,.55)]">{voce.code}</span>
        </span>
      ),
      sortValue: (voce) => voce.label,
      title: (voce) => `${voce.label} · ${voce.code}`,
    },
    {
      id: "verso",
      header: "Verso",
      kind: "classification",
      cell: (voce) => (voce.directionHint ? labelOf(vocab?.directionHints || [], voce.directionHint) || (voce.directionHint === "IN" ? "Entrata" : "Uscita") : "Entrambi i versi"),
      sortValue: (voce) => voce.directionHint || "",
    },
    {
      id: "documento",
      header: "Documento",
      kind: "classification",
      cell: (voce) => labelOf(vocab?.documentRoutes || [], voce.documentRoute) || orMissing(voce.documentRoute),
      sortValue: (voce) => voce.documentRoute,
    },
    {
      id: "classificazione",
      header: "Classificazione",
      kind: "status",
      cell: (voce) => <StatusPill status={dichiarata(voce) ? OPERATION_TYPE_STATUS.classified : OPERATION_TYPE_STATUS.unclassified} />,
      sortValue: (voce) => (dichiarata(voce) ? 1 : 0),
    },
    {
      id: "stato",
      header: "Stato",
      kind: "status",
      cell: (voce) => <StatusPill status={voce.isActive ? PERSON_STATUS.active : PERSON_STATUS.inactive} />,
      sortValue: (voce) => (voce.isActive ? 1 : 0),
    },
    {
      id: "origine",
      header: "Origine",
      kind: "chips",
      cell: (voce) => (voce.isSystem ? <DataChip size="sm">Predefinita</DataChip> : <DataChip size="sm" tone="blue">Del club</DataChip>),
      sortValue: (voce) => (voce.isSystem ? 0 : 1),
      hidden: true,
    },
  ];

  const filters: FilterDef<OperationType>[] = [
    {
      id: "stato",
      label: "Stato",
      type: "select",
      pinned: true,
      options: [
        { value: "attive", label: "Attive" },
        { value: "disattivate", label: "Disattivate" },
      ],
      apply: (voce, value) => (value === "attive" ? voce.isActive : value === "disattivate" ? !voce.isActive : true),
    },
    {
      id: "classificazione",
      label: "Classificazione",
      type: "select",
      options: [
        { value: "classificate", label: "Classificate" },
        { value: "da_classificare", label: "Da classificare", tone: "amber" },
      ],
      apply: (voce, value) => (value === "classificate" ? dichiarata(voce) : value === "da_classificare" ? !dichiarata(voce) : true),
    },
    {
      id: "verso",
      label: "Verso",
      type: "select",
      options: (vocab?.directionHints || []).map((item) => ({ value: item.key, label: item.label })),
      apply: (voce, value) => !value || voce.directionHint === value,
    },
  ];

  const rowActions: RowActionDef<OperationType>[] = [
    { id: "edit", label: canManage ? "Modifica" : "Dettagli", icon: <Pencil />, primary: true, onClick: openEdit },
    { id: "toggle", label: "Disattiva", icon: <Power />, hidden: (voce) => !canManage || !voce.isActive, onClick: (voce) => void toggleActive(voce) },
    { id: "reactivate", label: "Riattiva", icon: <Power />, hidden: (voce) => !canManage || voce.isActive, onClick: (voce) => void toggleActive(voce) },
    /* Una voce predefinita non ha l'eliminazione: non e nascosta per prudenza, e che non esiste il gesto. */
    { id: "delete", label: "Elimina", icon: <Trash2 />, tone: "danger", hidden: (voce) => !canManage || voce.isSystem, onClick: (voce) => void elimina(voce) },
  ];

  const directionOptions = [{ value: NO_DIRECTION, label: "Entrambi i versi" }, ...(vocab?.directionHints || []).map((item) => ({ value: item.key, label: item.label }))];

  return (
    <section id="club-section-causali" aria-label="Causali" className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 font-brand text-[15px] font-bold leading-5 text-egw-ink">
            <Tags className="h-4 w-4" aria-hidden />
            Causali
          </h2>
          <p className="mt-1 max-w-[80ch] font-brand text-[12.5px] leading-[1.5] text-egw-ink-62">
            La causale dice <strong>cosa</strong> e un movimento. E il mattone su cui poggiano la prima nota, il rendiconto per voce e il riepilogo fiscale: nessuno di quei tre puo dire piu di quanto la causale dichiara.
          </p>
        </div>
        {canManage ? (
          <Button
            variant="neutral"
            icon={<Plus />}
            onClick={() => {
              setNuovaLabel("");
              setNuovoVerso("IN");
              setErrors([]);
              setCreating(true);
            }}
          >
            Nuova causale
          </Button>
        ) : null}
      </div>

      {daClassificare.length ? (
        <AlertBlock
          severity="warning"
          title={
            <>
              <span className="egw-num">{daClassificare.length}</span> causali su <span className="egw-num">{voci.length}</span> non sono classificate
            </>
          }
        >
          EasyGame non le classifica al posto vostro, e non e una limitazione: la natura di un&apos;entrata dipende dal regime della societa, e un valore indovinato sembrerebbe configurato. Finche restano cosi, il rendiconto le conta a parte e lo dichiara.
        </AlertBlock>
      ) : null}

      {vista && !canManage ? (
        <InfoCard eyebrow="Sola lettura">
          Modificare una causale cambia la natura fiscale di tutto cio che verra registrato dopo: e configurazione societaria, e la possono cambiare il proprietario e il gestore.
        </InfoCard>
      ) : null}

      <DataGrid<OperationType>
        module="club-causali"
        aria-label="Elenco delle causali"
        rows={voci}
        getRowId={(voce) => voce.code}
        rowLabel={(voce) => voce.label}
        columns={columns}
        filters={filters}
        views={VIEWS}
        search={{ placeholder: "Cerca una causale", match: (voce, term) => `${voce.label} ${voce.code}`.toLowerCase().includes(term.toLowerCase()) }}
        defaultSort={{ columnId: "label", direction: "asc" }}
        rowActions={rowActions}
        onOpenRow={openEdit}
        activeRowId={editing?.code || null}
        state={loading && !vista ? "loading" : loadError && !vista ? "error" : "ready"}
        errorMessage={loadError}
        onRetry={() => void carica()}
        noun={{ singular: "causale", plural: "causali" }}
        defaultPageSize={50}
        empty={{
          icon: <Tags />,
          title: "Nessuna causale configurata",
          description: "Il catalogo delle causali e vuoto: senza, i movimenti non hanno una natura fiscale.",
          primary: canManage ? (
            <Button variant="neutral" size="sm" icon={<Plus />} onClick={() => setCreating(true)}>
              Nuova causale
            </Button>
          ) : null,
        }}
      />

      {/* ── Modifica (o lettura) di una causale ── */}
      <Drawer
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        width="wide"
        eyebrow={editing?.code}
        title={editing ? (canManage ? `Modifica «${editing.label}»` : editing.label) : "Causale"}
        description={editing?.classifiedAt ? `Classificazione dichiarata il ${formatDateShort(editing.classifiedAt)}.` : "Nessuna classificazione dichiarata: chi la dichiara resta scritto sulla causale."}
        dirty={dirty}
        locked={salvando === editing?.code}
        data-test="operation-type-drawer"
        headerAside={
          editing ? (
            <span className="flex items-center gap-1.5">
              {editing.isSystem ? <DataChip size="sm">Predefinita</DataChip> : null}
              <StatusPill size="sm" status={editing.isActive ? PERSON_STATUS.active : PERSON_STATUS.inactive} />
            </span>
          ) : null
        }
        footer={
          canManage ? (
            <>
              <Button variant="primary" onClick={() => void salvaBozza()} loading={salvando === editing?.code}>
                Salva
              </Button>
              <Button variant="secondary" onClick={() => setEditing(null)} disabled={salvando === editing?.code}>
                Annulla
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Chiudi
            </Button>
          )
        }
      >
        {editing && bozza ? (
          canManage ? (
            <FieldSizeProvider size="sm">
              <div className="flex flex-col gap-5">
                <ValidationSummary errors={errors} />
                <FormGrid>
                  <Field label="Nome" htmlFor="causale-label" required error={errors.find((e) => e.id === "causale-label") ? "Il nome e obbligatorio" : undefined}>
                    <TextInput id="causale-label" value={bozza.label || ""} onChange={(event) => modifica({ label: event.target.value })} />
                  </Field>
                  <Field label="Verso suggerito" htmlFor="causale-verso" helper="E una proposta: il verso lo decide il movimento.">
                    <Select id="causale-verso" value={bozza.directionHint || NO_DIRECTION} onValueChange={(value) => modifica({ directionHint: value === NO_DIRECTION ? null : value })} options={directionOptions} />
                  </Field>
                  <Field label="Documento da emettere" htmlFor="causale-doc">
                    <Select id="causale-doc" value={bozza.documentRoute || "receipt"} onValueChange={(value) => modifica({ documentRoute: value })} options={(vocab?.documentRoutes || []).map((item) => ({ value: item.key, label: item.label }))} />
                  </Field>
                  <Field label="Ambito di attivita" htmlFor="causale-scope">
                    <Select id="causale-scope" value={bozza.activityScope || "unspecified"} onValueChange={(value) => modifica({ activityScope: value })} options={(vocab?.activityScopes || []).map((item) => ({ value: item.key, label: item.label }))} />
                  </Field>
                  <Field label="Detraibile (730)" htmlFor="causale-detr">
                    <Select id="causale-detr" value={aTriStato(bozza.deductible)} onValueChange={(value) => modifica({ deductible: daTriStato(value) })} options={TRI_STATO.map((stato) => ({ value: stato.value, label: stato.label }))} />
                  </Field>
                  <Field label="Quota associativa" htmlFor="causale-quota" helper="Distingue la quota associativa da quella sportiva.">
                    <Select id="causale-quota" value={aTriStato(bozza.isMembershipFee)} onValueChange={(value) => modifica({ isMembershipFee: daTriStato(value) })} options={TRI_STATO.map((stato) => ({ value: stato.value, label: stato.label }))} />
                  </Field>
                  <Field label="Voce di rendiconto" htmlFor="causale-bucket" helper="Il nome lo decidete voi: EasyGame non impone un piano dei conti.">
                    <TextInput id="causale-bucket" value={bozza.reportingBucket || ""} placeholder="Es. Quote atleti" onChange={(event) => modifica({ reportingBucket: event.target.value || null })} />
                  </Field>
                  <Field label="Descrizione predefinita" htmlFor="causale-descr" helper="Quella che il movimento eredita se non ne scrivete una.">
                    <TextInput id="causale-descr" value={bozza.defaultDescription || ""} onChange={(event) => modifica({ defaultDescription: event.target.value || null })} />
                  </Field>
                </FormGrid>
              </div>
            </FieldSizeProvider>
          ) : (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              {[
                ["Nome", bozza.label],
                ["Verso suggerito", bozza.directionHint ? labelOf(vocab?.directionHints || [], bozza.directionHint) : "Entrambi i versi"],
                ["Documento da emettere", labelOf(vocab?.documentRoutes || [], bozza.documentRoute)],
                ["Ambito di attivita", labelOf(vocab?.activityScopes || [], bozza.activityScope)],
                ["Detraibile (730)", triStatoLabel(bozza.deductible)],
                ["Quota associativa", triStatoLabel(bozza.isMembershipFee)],
                ["Voce di rendiconto", bozza.reportingBucket],
                ["Descrizione predefinita", bozza.defaultDescription],
              ].map(([label, value]) => (
                <div key={String(label)} className="min-w-0">
                  <dt className="font-brand text-[12px] text-[rgba(11,26,58,.55)]">{label}</dt>
                  <dd className="mt-1 font-brand text-[13.5px] text-egw-ink">{value || MISSING}</dd>
                </div>
              ))}
            </dl>
          )
        ) : null}
      </Drawer>

      {/* ── Nuova causale ── */}
      <Drawer
        open={creating}
        onOpenChange={(open) => !open && setCreating(false)}
        eyebrow="Causali"
        title="Nuova causale"
        description="Nasce senza classificazione, e va dichiarata: EasyGame non ne indovina nessuna."
        dirty={Boolean(nuovaLabel.trim())}
        locked={salvando === "__nuova__"}
        data-test="operation-type-create-drawer"
        footer={
          <>
            <Button variant="primary" onClick={() => void crea()} loading={salvando === "__nuova__"}>
              Crea causale
            </Button>
            <Button variant="secondary" onClick={() => setCreating(false)} disabled={salvando === "__nuova__"}>
              Annulla
            </Button>
          </>
        }
      >
        <FieldSizeProvider size="sm">
          <div className="flex flex-col gap-5">
            <ValidationSummary errors={errors} />
            <Field label="Nome" htmlFor="nuova-causale" required error={errors.find((e) => e.id === "nuova-causale") ? "Il nome e obbligatorio" : undefined} helper="Il codice tecnico si ricava da qui e non cambia piu.">
              <TextInput
                id="nuova-causale"
                value={nuovaLabel}
                placeholder="Es. Affitto della palestra"
                onChange={(event) => {
                  setNuovaLabel(event.target.value);
                  if (errors.length) setErrors([]);
                }}
              />
            </Field>
            <Field label="Verso" htmlFor="nuovo-verso">
              <Select id="nuovo-verso" value={nuovoVerso} onValueChange={setNuovoVerso} options={(vocab?.directionHints || []).map((item) => ({ value: item.key, label: item.label }))} />
            </Field>
          </div>
        </FieldSizeProvider>
      </Drawer>

      {confirmDialog}
    </section>
  );
}
