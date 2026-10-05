"use client";

import * as React from "react";
import { Check, FileCheck2, FilePlus2, Plus, RotateCcw, Search, ShieldCheck, Undo2, X } from "lucide-react";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { HeaderStat, PageHeader } from "@/components/web/page/PageHeader";
import { DetailCard, EmptyStateCard, InfoCard } from "@/components/web/page/Cards";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, IconChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { Eyebrow, InsetBlock, Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { Field, FormGrid, Select, TextInput } from "@/components/web/forms/Field";
import { useConfirm } from "@/components/web/overlays/useConfirm";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, RowActionDef } from "@/components/web/datagrid/types";
import { formatDateShort, formatInteger, joinMeta, MISSING } from "@/lib/web/format";
import { canManageConsentDefinitions, canReadConsentRecords, canRecordConsentDecision } from "@/lib/consents/permissions";
import { NewConsentDrawer, PublishConsentTextDrawer, type NewConsentValues } from "@/components/consensi/v2/consent-drawers";
import {
  DECISION_STATUS_LABELS,
  DECISION_VIEWS,
  DEFINITION_STATUS_LABELS,
  DEFINITION_VIEWS,
  SUBJECT_KIND_OPTIONS,
  decisionStatusLabel,
  decisionStatusSpec,
  definitionStatusLabel,
  definitionStatusSpec,
  describePublishedText,
  sourceLabel,
  statoSoggettoId,
  subjectKindLabel,
  type Decisione,
  type Definizione,
  type StatoSoggetto,
} from "@/components/consensi/v2/consensi-model";

/**
 * `/consensi` — i consensi del club (Web V2, pattern 10: griglia + dettaglio
 * sotto). Audit: `docs/redesign/audit/wave-e-consensi.md`.
 *
 * **Una schermata sola con due mestieri dentro.** La direzione **configura**
 * — decide cosa si chiede e pubblica il testo — e la segreteria **registra**
 * cosa ha deciso una famiglia. Sono due permessi diversi ma la stessa
 * domanda: «questa persona cosa ha firmato, e quando».
 *
 * **Lo stato non si sceglie da un menu.** Non c'e nessun controllo per
 * «impostare» un consenso ad accettato: si registra una decisione, e lo
 * stato lo ricava il server dallo storico. Una revoca aggiunge una riga —
 * l'elenco delle decisioni resta li, e non c'e nessun pulsante per
 * cancellarne una.
 *
 * Le tre letture e le quattro scritture sono quelle della V1
 * (`/api/v1/consents/**`), con i predicati di `lib/consents/permissions.ts`:
 * a chi non puo, l'azione e **assente**.
 */
const formatDate = (value: string | null) => (value ? formatDateShort(value) : MISSING);

const PageShell = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-[100dvh] bg-egw-page">
    <Sidebar />
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <Header title="Consensi" />
      <main className={dashboardMainClassName}>
        <DashboardPageContainer>{children}</DashboardPageContainer>
      </main>
    </div>
  </div>
);

const PAGE_DESCRIPTION = "Cosa il club chiede di acconsentire, con quale testo, e chi ha detto di sì. Una revoca non cancella niente: aggiunge una riga.";

export default function ConsensiPage() {
  const { showToast } = useToast();
  const { activeClub, userRole } = useAuth();
  const [confirm, confirmDialog] = useConfirm();

  const ruolo = String(activeClub?.role || userRole || "");
  const puoConfigurare = canManageConsentDefinitions(ruolo);
  const puoRegistrare = canRecordConsentDecision(ruolo);
  const puoLeggere = canReadConsentRecords(ruolo);

  const [definizioni, setDefinizioni] = React.useState<Definizione[]>([]);
  const [selezionata, setSelezionata] = React.useState<string>("");
  const [decisioni, setDecisioni] = React.useState<Decisione[]>([]);
  const [erroreDecisioni, setErroreDecisioni] = React.useState<string | null>(null);
  const [caricamentoDecisioni, setCaricamentoDecisioni] = React.useState(false);
  const [stati, setStati] = React.useState<StatoSoggetto[]>([]);
  const [caricamento, setCaricamento] = React.useState(true);
  const [erroreDefinizioni, setErroreDefinizioni] = React.useState<string | null>(null);
  const [occupato, setOccupato] = React.useState("");

  const [nuovoConsenso, setNuovoConsenso] = React.useState(false);
  const [pubblicaTestoAperto, setPubblicaTestoAperto] = React.useState(false);

  const [soggettoTipo, setSoggettoTipo] = React.useState<string>("athlete");
  const [soggettoId, setSoggettoId] = React.useState("");
  const [soggettoNome, setSoggettoNome] = React.useState("");
  const [nota, setNota] = React.useState("");
  const tipoId = React.useId();
  const idId = React.useId();
  const nomeId = React.useId();
  const notaId = React.useId();

  const definizione = React.useMemo(() => definizioni.find((riga) => riga.id === selezionata) || null, [definizioni, selezionata]);

  /* ── Le letture ─────────────────────────────────────────────────────── */
  const caricaDefinizioni = React.useCallback(async () => {
    setCaricamento(true);
    const risposta = await apiRequest<Definizione[]>("/api/v1/consents?include_retired=1");
    setCaricamento(false);
    if (risposta.error || !Array.isArray(risposta.data)) {
      setErroreDefinizioni(risposta.error?.message || "Non sono riuscito a leggere i consensi");
      return;
    }
    setErroreDefinizioni(null);
    setDefinizioni(risposta.data);
    setSelezionata((corrente) => (corrente && risposta.data.some((riga) => riga.id === corrente) ? corrente : risposta.data[0]?.id || ""));
  }, []);

  React.useEffect(() => {
    if (!puoLeggere) {
      setCaricamento(false);
      return;
    }
    caricaDefinizioni().catch(() => setCaricamento(false));
  }, [puoLeggere, caricaDefinizioni]);

  /*
    «Non ha firmato nessuno» e «non sono riuscito a chiedere» non sono la
    stessa risposta: la prima si legge e si va avanti, la seconda va
    riprovata.
  */
  const caricaDecisioni = React.useCallback(async (definitionId: string) => {
    if (!definitionId) {
      setDecisioni([]);
      setErroreDecisioni(null);
      return;
    }
    setCaricamentoDecisioni(true);
    const risposta = await apiRequest<Decisione[]>(`/api/v1/consents/${definitionId}/records?limit=50`);
    setCaricamentoDecisioni(false);
    if (risposta.error || !Array.isArray(risposta.data)) {
      setDecisioni([]);
      setErroreDecisioni(risposta.error?.message || "Non sono riuscito a leggere le decisioni");
      return;
    }
    setErroreDecisioni(null);
    setDecisioni(risposta.data);
  }, []);

  React.useEffect(() => {
    if (!puoLeggere) return;
    caricaDecisioni(selezionata).catch(() => undefined);
  }, [puoLeggere, selezionata, caricaDecisioni]);

  /** La vista per soggetto: e quella che dice **cosa manca**. */
  const cercaSoggetto = React.useCallback(async () => {
    const id = soggettoId.trim();
    if (!id) {
      showToast("error", "Indica il soggetto da cercare");
      return;
    }
    setOccupato("ricerca");
    const risposta = await apiRequest<StatoSoggetto[]>(`/api/v1/consents/states?subject_kind=${encodeURIComponent(soggettoTipo)}&subject_id=${encodeURIComponent(id)}`);
    setOccupato("");
    if (risposta.error || !Array.isArray(risposta.data)) {
      showToast("error", risposta.error?.message || "Ricerca non riuscita");
      return;
    }
    setStati(risposta.data);
  }, [soggettoTipo, soggettoId, showToast]);

  /* ── Le scritture ───────────────────────────────────────────────────── */
  const creaDefinizione = async (values: NewConsentValues) => {
    setOccupato("crea");
    const risposta = await apiRequest<Definizione>("/api/v1/consents", { method: "POST", body: values });
    setOccupato("");
    if (risposta.error || !risposta.data) {
      showToast("error", risposta.error?.message || "Creazione non riuscita");
      return;
    }
    setNuovoConsenso(false);
    showToast("success", "Consenso creato: ora pubblica il testo");
    await caricaDefinizioni();
    setSelezionata(risposta.data.id);
  };

  const pubblicaTesto = async (testo: string) => {
    if (!definizione) return;
    setOccupato("pubblica");
    const risposta = await apiRequest(`/api/v1/consents/${definizione.id}/versions`, { method: "POST", body: { body_text: testo } });
    setOccupato("");
    if (risposta.error) {
      showToast("error", risposta.error.message);
      return;
    }
    setPubblicaTestoAperto(false);
    showToast("success", "Testo pubblicato. I consensi già raccolti restano validi e vengono segnalati come dati su una versione precedente");
    await caricaDefinizioni();
  };

  /** Ritirare o riattivare e notevole e reversibile: una conferma, nessuna parola da scrivere. */
  const cambiaStato = async (stato: "active" | "retired") => {
    if (!definizione) return;
    const ok = await confirm(
      stato === "retired"
        ? {
            title: `Ritirare «${definizione.title}»?`,
            description: "Non si raccolgono più decisioni su questo consenso; quelle già registrate restano nello storico. Si può riattivare.",
            confirmLabel: "Ritira",
          }
        : {
            title: `Riattivare «${definizione.title}»?`,
            description: "Torna fra i consensi in uso, con l'ultimo testo pubblicato.",
            confirmLabel: "Riattiva",
          },
    );
    if (!ok) return;
    setOccupato("stato");
    const risposta = await apiRequest(`/api/v1/consents/${definizione.id}`, { method: "PATCH", body: { status: stato } });
    setOccupato("");
    if (risposta.error) {
      showToast("error", risposta.error.message);
      return;
    }
    showToast("success", stato === "retired" ? "Consenso ritirato" : "Consenso riattivato");
    await caricaDefinizioni();
  };

  const registra = async (stato: "accepted" | "rejected" | "revoked") => {
    if (!definizione) return;
    if (!soggettoId.trim()) {
      showToast("error", "Indica il soggetto della decisione");
      return;
    }
    if (stato === "revoked") {
      const ok = await confirm({
        title: `Revocare il consenso di ${soggettoNome.trim() || soggettoId.trim()}?`,
        description: "La revoca aggiunge una riga: l'accettazione precedente resta nello storico e non si cancella.",
        confirmLabel: "Revoca",
      });
      if (!ok) return;
    }
    setOccupato(stato);
    const risposta = await apiRequest(`/api/v1/consents/${definizione.id}/records`, {
      method: "POST",
      body: {
        subject_kind: soggettoTipo,
        subject_id: soggettoId.trim(),
        subject_label: soggettoNome.trim(),
        status: stato,
        source: "manual",
        note: nota.trim(),
      },
    });
    setOccupato("");
    if (risposta.error) {
      showToast("error", risposta.error.message);
      return;
    }
    setNota("");
    showToast("success", stato === "revoked" ? "Revoca registrata. L'accettazione precedente resta nello storico" : "Decisione registrata");
    await caricaDecisioni(definizione.id);
    if (stati.length) await cercaSoggetto();
  };

  /* ── La griglia delle definizioni ───────────────────────────────────── */
  const definitionColumns = React.useMemo<ColumnDef<Definizione>[]>(
    () => [
      {
        id: "identity",
        header: "Consenso",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-2.5">
            <IconChip tone={row.required ? "amber" : "blue"} size={32} className="[&>svg]:h-4 [&>svg]:w-4">
              <ShieldCheck />
            </IconChip>
            <span className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setSelezionata(row.id)}
                className="egw-ellipsis block max-w-full text-left font-brand text-[12.5px] font-semibold text-egw-ink hover:text-egw-blue-700 hover:underline focus-visible:outline-none focus-visible:underline"
              >
                {row.title}
              </button>
              <span className="egw-ellipsis egw-num block font-brand text-[10px] leading-[1.4] text-[rgba(11,26,58,.5)]">{row.key}</span>
            </span>
          </span>
        ),
        sortValue: (row) => row.title.toLowerCase(),
        exportValue: (row) => row.title,
        title: (row) => row.title,
      },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={definitionStatusSpec(row.status)} />,
        sortValue: (row) => definitionStatusLabel(row.status),
        exportValue: (row) => definitionStatusLabel(row.status),
      },
      {
        id: "version",
        header: "Testo in vigore",
        kind: "number",
        cell: (row) =>
          row.publishedVersion > 0 ? (
            <span className="egw-num">
              versione {formatInteger(row.publishedVersion)}
              <span className="ml-1.5 font-normal text-egw-ink-62">del {formatDate(row.publishedAt)}</span>
            </span>
          ) : (
            <span className="text-egw-ink-62">Nessun testo pubblicato</span>
          ),
        sortValue: (row) => row.publishedVersion,
        exportValue: (row) => (row.publishedVersion > 0 ? row.publishedVersion : "Nessun testo pubblicato"),
      },
      {
        id: "required",
        header: "Obbligatorio",
        kind: "chips",
        cell: (row) =>
          row.required ? (
            <DataChip size="sm" tone="amber">
              Segnala chi non lo ha dato
            </DataChip>
          ) : null,
        sortValue: (row) => (row.required ? 1 : 0),
        exportValue: (row) => (row.required ? "Sì" : "No"),
      },
      {
        id: "description",
        header: "Descrizione",
        kind: "text",
        hidden: true,
        width: 1.6,
        cell: (row) => row.description,
        sortValue: (row) => row.description.toLowerCase() || null,
        title: (row) => row.description || undefined,
      },
      {
        id: "key",
        header: "Chiave",
        kind: "text",
        hidden: true,
        cell: (row) => <span className="egw-num">{row.key}</span>,
        sortValue: (row) => row.key,
        exportValue: (row) => row.key,
      },
    ],
    [],
  );

  const definitionFilters = React.useMemo<FilterDef<Definizione>[]>(
    () => [
      {
        id: "status",
        label: "Stato",
        type: "multi",
        pinned: true,
        options: (["active", "draft", "retired"] as const).map((status) => ({
          value: status,
          label: DEFINITION_STATUS_LABELS[status],
          count: definizioni.filter((row) => row.status === status).length,
          tone: status === "retired" ? "amber" : "neutral",
        })),
        apply: (row, value) => (Array.isArray(value) && value.length ? value.includes(row.status) : true),
      },
      { id: "required", label: "Obbligatorio", type: "boolean", apply: (row, value) => (value === true ? row.required : true) },
      {
        id: "published",
        label: "Testo pubblicato",
        type: "select",
        options: [
          { value: "yes", label: "Con testo in vigore" },
          { value: "no", label: "Senza testo pubblicato", tone: "amber" },
        ],
        apply: (row, value) => (value === "yes" ? row.publishedVersion > 0 : value === "no" ? row.publishedVersion === 0 : true),
      },
    ],
    [definizioni],
  );

  const definitionActions = React.useMemo<RowActionDef<Definizione>[]>(
    () => [
      { id: "open", label: "Apri", icon: <FileCheck2 />, primary: true, onClick: (row) => setSelezionata(row.id) },
      {
        id: "publish",
        label: "Pubblica un testo nuovo",
        icon: <FilePlus2 />,
        hidden: () => !puoConfigurare,
        onClick: (row) => {
          setSelezionata(row.id);
          setPubblicaTestoAperto(true);
        },
      },
    ],
    [puoConfigurare],
  );

  const definitionSearch = React.useMemo(
    () => ({
      placeholder: "Cerca per titolo, chiave o descrizione",
      match: (row: Definizione, query: string) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return [row.title, row.key, row.description].some((v) => String(v || "").toLowerCase().includes(q));
      },
    }),
    [],
  );

  /* ── La griglia delle decisioni ─────────────────────────────────────── */
  const decisionColumns = React.useMemo<ColumnDef<Decisione>[]>(
    () => [
      {
        id: "decidedAt",
        header: "Data",
        kind: "date",
        width: 0.9,
        minWidth: 110,
        cell: (row) => <span className="egw-num">{formatDate(row.decidedAt)}</span>,
        sortValue: (row) => row.decidedAt || null,
        exportValue: (row) => row.decidedAt,
      },
      {
        id: "subject",
        header: "Soggetto",
        kind: "identity",
        locked: true,
        width: 1.8,
        cell: (row) => (
          <span className="min-w-0">
            <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink" title={row.subjectLabel || row.subjectId}>
              {row.subjectLabel || row.subjectId}
            </span>
            <span className="egw-ellipsis block font-brand text-[10px] leading-[1.4] text-[rgba(11,26,58,.5)]">{joinMeta(subjectKindLabel(row.subjectKind), row.subjectLabel ? row.subjectId : null)}</span>
          </span>
        ),
        sortValue: (row) => (row.subjectLabel || row.subjectId).toLowerCase(),
        exportValue: (row) => row.subjectLabel || row.subjectId,
      },
      {
        id: "status",
        header: "Decisione",
        kind: "status",
        cell: (row) => <StatusPill status={decisionStatusSpec(row.status)} />,
        sortValue: (row) => decisionStatusLabel(row.status),
        exportValue: (row) => decisionStatusLabel(row.status),
      },
      {
        id: "version",
        header: "Versione",
        kind: "number",
        cell: (row) => <span className="egw-num">{row.version ?? null}</span>,
        sortValue: (row) => row.version ?? null,
        exportValue: (row) => row.version,
      },
      {
        id: "source",
        header: "Provenienza",
        kind: "classification",
        cell: (row) => <DataChip size="sm">{sourceLabel(row.source)}</DataChip>,
        sortValue: (row) => sourceLabel(row.source),
        exportValue: (row) => sourceLabel(row.source),
      },
      {
        id: "note",
        header: "Nota",
        kind: "text",
        width: 1.4,
        cell: (row) => row.note,
        sortValue: (row) => row.note.toLowerCase() || null,
        title: (row) => row.note || undefined,
      },
      {
        id: "subjectKind",
        header: "Tipo di soggetto",
        kind: "classification",
        hidden: true,
        cell: (row) => subjectKindLabel(row.subjectKind),
        sortValue: (row) => subjectKindLabel(row.subjectKind),
        exportValue: (row) => subjectKindLabel(row.subjectKind),
      },
    ],
    [],
  );

  const decisionFilters = React.useMemo<FilterDef<Decisione>[]>(
    () => [
      {
        id: "status",
        label: "Decisione",
        type: "multi",
        pinned: true,
        options: (["accepted", "rejected", "revoked"] as const).map((status) => ({
          value: status,
          label: DECISION_STATUS_LABELS[status],
          count: decisioni.filter((row) => row.status === status).length,
          tone: status === "revoked" ? "red" : status === "rejected" ? "amber" : "green",
        })),
        apply: (row, value) => (Array.isArray(value) && value.length ? value.includes(row.status) : true),
      },
      {
        id: "subjectKind",
        label: "Tipo di soggetto",
        type: "select",
        options: SUBJECT_KIND_OPTIONS,
        apply: (row, value) => (typeof value === "string" && value ? row.subjectKind === value : true),
      },
      {
        id: "source",
        label: "Provenienza",
        type: "select",
        options: Array.from(new Set(decisioni.map((row) => row.source))).map((source) => ({ value: source, label: sourceLabel(source) })),
        apply: (row, value) => (typeof value === "string" && value ? row.source === value : true),
      },
    ],
    [decisioni],
  );

  const decisionSearch = React.useMemo(
    () => ({
      placeholder: "Cerca per soggetto o nota",
      match: (row: Decisione, query: string) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return [row.subjectLabel, row.subjectId, row.note].some((v) => String(v || "").toLowerCase().includes(q));
      },
    }),
    [],
  );

  const definizioniState = caricamento ? "loading" : erroreDefinizioni ? "error" : "ready";
  const decisioniState = caricamentoDecisioni ? "loading" : erroreDecisioni ? "error" : "ready";
  const attivi = definizioni.filter((riga) => riga.status === "active").length;
  const senzaTesto = definizioni.filter((riga) => riga.publishedVersion === 0).length;

  /* ── Senza permesso ─────────────────────────────────────────────────── */
  if (!puoLeggere) {
    return (
      <PageShell>
        <PageHeader eyebrow="Segreteria" title="Consensi" description={PAGE_DESCRIPTION} />
        <EmptyStateCard icon={<ShieldCheck />} iconTone="neutral" title="Non hai accesso ai consensi" description="Accesso negato: i consensi del club li legge chi ci lavora dentro." />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Segreteria"
        title="Consensi"
        description={PAGE_DESCRIPTION}
        stats={
          !caricamento && !erroreDefinizioni ? (
            <>
              <HeaderStat value={formatInteger(definizioni.length)} label={definizioni.length === 1 ? "consenso" : "consensi"} />
              <HeaderStat value={formatInteger(attivi)} label="attivi" tone="green" />
              <HeaderStat value={formatInteger(senzaTesto)} label="senza testo" tone={senzaTesto ? "amber" : "ink"} />
            </>
          ) : null
        }
        actions={
          puoConfigurare ? (
            <Button variant="primary" icon={<Plus />} onClick={() => setNuovoConsenso(true)}>
              Nuovo consenso
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-[18px]">
        <DataGrid<Definizione>
          module="consensi"
          aria-label="I consensi del club"
          rows={definizioni}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.title}
          columns={definitionColumns}
          filters={definitionFilters}
          views={DEFINITION_VIEWS}
          search={definitionSearch}
          defaultSort={{ columnId: "identity", direction: "asc" }}
          rowActions={definitionActions}
          onOpenRow={(row) => setSelezionata(row.id)}
          activeRowId={selezionata || null}
          canSelect={false}
          state={definizioniState}
          errorMessage={erroreDefinizioni}
          onRetry={() => void caricaDefinizioni()}
          noun={{ singular: "consenso", plural: "consensi" }}
          hideFooter={definizioni.length <= 25}
          empty={{
            icon: <ShieldCheck />,
            title: "Nessun consenso definito",
            description: puoConfigurare ? "Definisci il primo consenso: nasce in bozza, e vale quando pubblichi il testo." : "La direzione del club non ne ha ancora definiti.",
            primary: puoConfigurare ? (
              <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setNuovoConsenso(true)}>
                Nuovo consenso
              </Button>
            ) : null,
          }}
        />

        {/* ── Il dettaglio del consenso selezionato ─────────────────── */}
        {!definizione ? (
          definizioni.length ? (
            <InfoCard eyebrow="Dettaglio">Seleziona un consenso per vederne il testo e le decisioni.</InfoCard>
          ) : null
        ) : (
          <>
            <DetailCard
              eyebrow="Consenso"
              title={
                <span className="flex flex-wrap items-center gap-2.5">
                  <span className="min-w-0 break-words">{definizione.title}</span>
                  <StatusPill status={definitionStatusSpec(definizione.status)} />
                </span>
              }
              fields={[
                { label: "Chiave", value: <span className="egw-num">{definizione.key}</span> },
                { label: "Testo in vigore", value: describePublishedText(definizione, formatDate) },
                { label: "Obbligatorio", value: definizione.required ? "Sì: si segnala chi non lo ha dato" : "No" },
                { label: "Descrizione", value: definizione.description || "Nessuna descrizione.", wide: true },
              ]}
              actions={
                puoConfigurare ? (
                  <>
                    <Button variant="secondary" size="sm" icon={<FilePlus2 />} onClick={() => setPubblicaTestoAperto(true)}>
                      Pubblica versione {definizione.publishedVersion + 1}
                    </Button>
                    {definizione.status === "active" ? (
                      <Button variant="secondary" size="sm" icon={<RotateCcw />} onClick={() => void cambiaStato("retired")} loading={occupato === "stato"}>
                        Ritira
                      </Button>
                    ) : null}
                    {definizione.status === "retired" ? (
                      <Button variant="secondary" size="sm" icon={<RotateCcw />} onClick={() => void cambiaStato("active")} loading={occupato === "stato"}>
                        Riattiva
                      </Button>
                    ) : null}
                  </>
                ) : null
              }
            />

            {/* ── Il soggetto ───────────────────────────────────────── */}
            <Panel as="section">
              <PanelHeader
                eyebrow="Il soggetto"
                title="Cosa ha firmato, e cosa decide"
                description={
                  puoRegistrare
                    ? "Indica la persona, cerca cosa ha già firmato, e registra la decisione: lo stato lo ricava il server dallo storico."
                    : "Indica la persona e cerca cosa ha già firmato."
                }
              />
              {definizione.publishedVersion === 0 && puoRegistrare ? (
                <AlertBlock severity="warning" title="Nessun testo pubblicato" className="mb-4">
                  Non si possono raccogliere decisioni finché il consenso non ha un testo in vigore.
                </AlertBlock>
              ) : null}
              <FormGrid columns={2}>
                <Field label="Tipo" htmlFor={tipoId}>
                  <Select id={tipoId} value={soggettoTipo} onValueChange={setSoggettoTipo} options={SUBJECT_KIND_OPTIONS} />
                </Field>
                <Field label="Identificativo" htmlFor={idId} helper="L'identificativo del record nell'anagrafica.">
                  <TextInput id={idId} value={soggettoId} onChange={(event) => setSoggettoId(event.target.value)} className="egw-num" />
                </Field>
                <Field label="Nome" htmlFor={nomeId}>
                  <TextInput id={nomeId} value={soggettoNome} onChange={(event) => setSoggettoNome(event.target.value)} placeholder="Rossi Mario" />
                </Field>
                {puoRegistrare ? (
                  <Field label="Nota" htmlFor={notaId} optional>
                    <TextInput id={notaId} value={nota} onChange={(event) => setNota(event.target.value)} placeholder="Modulo cartaceo consegnato in segreteria" />
                  </Field>
                ) : null}
              </FormGrid>
              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <Button variant="secondary" icon={<Search />} onClick={() => void cercaSoggetto()} loading={occupato === "ricerca"}>
                  Cosa ha firmato
                </Button>
                {puoRegistrare ? (
                  <>
                    <Button variant="neutral" icon={<Check />} onClick={() => void registra("accepted")} loading={occupato === "accepted"}>
                      Accetta
                    </Button>
                    <Button variant="secondary" icon={<X />} onClick={() => void registra("rejected")} loading={occupato === "rejected"}>
                      Rifiuta
                    </Button>
                    <Button variant="danger" icon={<Undo2 />} onClick={() => void registra("revoked")} loading={occupato === "revoked"}>
                      Revoca
                    </Button>
                  </>
                ) : null}
              </div>

              {stati.length ? (
                <InsetBlock className="mt-5 p-0">
                  <Eyebrow as="p" className="px-4 pt-3">
                    Cosa ha firmato {stati[0]?.subjectLabel || soggettoNome.trim() || soggettoId.trim()}
                  </Eyebrow>
                  <ul className="mt-2 flex flex-col">
                    {stati.map((stato) => (
                      <li key={statoSoggettoId(stato)} className="flex min-h-11 flex-wrap items-center gap-3 border-t border-egw-rule px-4 py-2">
                        <span className="egw-ellipsis min-w-0 flex-1 font-brand text-[12.5px] font-semibold text-egw-ink" title={stato.definitionTitle}>
                          {stato.definitionTitle}
                        </span>
                        <StatusPill status={decisionStatusSpec(stato.status)} />
                        {stato.onOutdatedVersion ? (
                          <DataChip size="sm" tone="amber">
                            Versione precedente
                          </DataChip>
                        ) : null}
                        <span className="egw-num font-brand text-[11.5px] text-egw-ink-62">{formatDate(stato.decidedAt)}</span>
                      </li>
                    ))}
                  </ul>
                </InsetBlock>
              ) : null}
            </Panel>

            {/* ── Le decisioni registrate ───────────────────────────── */}
            <DataGrid<Decisione>
              module="consensi-decisioni"
              aria-label={`Le decisioni registrate su ${definizione.title}`}
              rows={decisioni}
              getRowId={(row) => row.id}
              rowLabel={(row) => row.subjectLabel || row.subjectId}
              columns={decisionColumns}
              filters={decisionFilters}
              views={DECISION_VIEWS}
              search={decisionSearch}
              defaultSort={{ columnId: "decidedAt", direction: "desc" }}
              canSelect={false}
              state={decisioniState}
              errorMessage={erroreDecisioni}
              onRetry={() => void caricaDecisioni(selezionata)}
              noun={{ singular: "decisione", plural: "decisioni" }}
              banner={
                <div className="border-b border-egw-hairline bg-white px-4 py-3">
                  <Eyebrow as="p">Le decisioni registrate</Eyebrow>
                  <p className="mt-1 font-brand text-[12.5px] text-egw-ink-62">Le ultime 50 su «{definizione.title}». Una revoca aggiunge una riga: nessuna decisione si cancella.</p>
                </div>
              }
              empty={{
                icon: <FileCheck2 />,
                title: "Nessuna decisione registrata per questo consenso",
                description: "Le decisioni delle famiglie e quelle registrate in segreteria compaiono qui.",
              }}
            />
          </>
        )}
      </div>

      <NewConsentDrawer open={nuovoConsenso} onOpenChange={setNuovoConsenso} onCreate={creaDefinizione} creating={occupato === "crea"} />

      <PublishConsentTextDrawer
        open={pubblicaTestoAperto && Boolean(definizione)}
        onOpenChange={setPubblicaTestoAperto}
        definizione={definizione}
        onPublish={pubblicaTesto}
        publishing={occupato === "pubblica"}
      />

      {confirmDialog}
    </PageShell>
  );
}
