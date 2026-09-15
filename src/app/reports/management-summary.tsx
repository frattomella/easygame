"use client";

import React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/web/primitives/Button";
import { Eyebrow, Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { InfoCard, KpiBar, KpiCard, SummaryCard, type SummaryRow } from "@/components/web/page/Cards";
import { AlertBlock } from "@/components/web/page/Alerts";
import {
  DateInput,
  Field,
  FieldSizeProvider,
  SearchableSelect,
  Select,
  type SelectOption,
} from "@/components/web/forms/Field";
import { apiRequest } from "@/lib/api/client";
import {
  ACTIVITY_SCOPES,
  ACTIVITY_SCOPE_LABELS,
  type ActivityScope,
} from "@/lib/accounting/model";
import { canOpenAccounting } from "@/lib/accounting/permissions";
import {
  MANAGEMENT_REPORT_DISCLAIMER,
  MANAGEMENT_REPORT_TITLE,
  findKpi,
  type KpiDefinition,
  type ManagementReport,
  type ReportGroup,
} from "@/lib/accounting/reporting";
import {
  isMultiSiteClub,
  normalizeClubSites,
  type ClubSite,
} from "@/lib/club-sites";
import { normalizeClubSeasons } from "@/lib/club-seasons";
import { formatInteger } from "@/lib/web/format";
import {
  ManagementGroupGrid,
  euroFromCents,
} from "@/components/reports/v2/management-group-grid";
import {
  ReportStatGrid,
  ReportStatTile,
} from "@/components/reports/v2/report-stat-tile";
import AccountingExportButton from "./accounting-export-button";

/**
 * Il **Riepilogo gestionale** dentro `/reports`, nel Web V2 (pattern 4
 * «Analytics / report»: banda dei filtri → riga KPI → pannelli tabellari).
 *
 * ---
 *
 * ## Cosa questa superficie promette, e cosa no
 *
 * Promette somme e raggruppamenti sui dati registrati. **Non** promette un
 * documento: nessuna intestazione, nessun titolo e nessuna etichetta di questo
 * file usa «ufficiale», «conforme», «a norma» o «per il deposito» (§13 del
 * piano), e la riga che lo dichiara sta **sopra i numeri**, non in fondo alla
 * pagina dove nessuno la legge.
 *
 * ## La separazione che disegna il layout
 *
 * Cassa e competenza sono due blocchi distinti, con due intestazioni proprie:
 * la cassa in una barra di KPI card a piano 1, i crediti e i debiti in un
 * contenitore **tratteggiato** a piano 0 che non si puo leggere come cassa
 * (guideline 09 §9.1, «Finance summary»: cassa e competenza mai nella stessa
 * card). Non e una scelta grafica: e il §28 applicato al markup. Ogni riquadro
 * dichiara il proprio proprietario e la propria grandezza, che arrivano da
 * `DASHBOARD_KPIS` e non da stringhe scritte qui.
 *
 * ## I permessi
 *
 * La sezione compare solo a chi ha `accounting.read`, e la matrice e la stessa
 * della rotta: un pulsante che si vede e poi risponde 403 e un difetto quanto
 * una porta aperta (lezione W3-14). I saldi hanno un permesso a parte, e chi
 * non ce l'ha vede una frase che lo dice — **non uno zero**.
 *
 * ## Le tre larghezze
 *
 * A 375 px i filtri sono una colonna sola e le tabelle scorrono dentro la
 * griglia; a 768 px i filtri diventano due colonne e i riquadri due; a 1280 px
 * i riquadri sono quattro. Nessun contenitore fa scorrere la pagina in
 * orizzontale: cio che deborda scorre dentro di se.
 */

/* ========================================================================== */
/* Formati                                                                     */
/* ========================================================================== */

/** `12,5%` — la quota con un decimale, come la stampava la V1, con la virgola. */
const quota = (value: number) =>
  `${String(Math.round((Number(value) || 0) * 1000) / 10).replace(".", ",")}%`;

const MESI = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

/**
 * Il riquadro si cerca **per chiave**, non per posizione nell'elenco.
 *
 * Un indice in `DASHBOARD_KPIS` legherebbe questa pagina all'ordine di una
 * costante che sta in un altro file: il giorno in cui qualcuno vi inserisce
 * una voce in mezzo, ogni riquadro mostrerebbe la definizione di quello
 * accanto senza che nessun test rosso lo dica.
 */
const kpi = (key: string): KpiDefinition =>
  findKpi(key) || {
    key,
    label: key,
    quantity: "finanziaria",
    owner: "sconosciuto",
    definition: "Definizione non trovata nel catalogo dei riquadri.",
  };

const meseLeggibile = (key: string) => {
  const [anno, mese] = String(key || "").split("-");
  const indice = Number(mese) - 1;
  return MESI[indice] ? `${MESI[indice]} ${anno}` : key || "Senza data";
};

/** Stabile a livello di modulo: la griglia memorizza le colonne su di essa. */
const meseDelGruppo = (gruppo: ReportGroup) => meseLeggibile(gruppo.key);

/* ========================================================================== */
/* Lo stato dei filtri                                                         */
/* ========================================================================== */

type Filtri = {
  from: string;
  to: string;
  fiscalYear: string;
  seasonId: string;
  financialAccountId: string;
  operationTypeCode: string;
  siteId: string;
  direction: string;
  activityScope: string;
  compareFiscalYear: string;
};

const FILTRI_VUOTI: Filtri = {
  from: "",
  to: "",
  fiscalYear: "",
  seasonId: "",
  financialAccountId: "",
  operationTypeCode: "",
  siteId: "",
  direction: "",
  activityScope: "",
  compareFiscalYear: "",
};

/** Il valore che i `Select` usano per «nessun filtro»: non puo essere `""`. */
const TUTTI = "__tutti__";

const dalSelect = (value: string | null) =>
  !value || value === TUTTI ? "" : value;
const alSelect = (value: string) => value || TUTTI;

/**
 * Gli anni fiscali proponibili.
 *
 * Sono anni solari, non stagioni, ed e il punto del §14: la stagione 2026/27
 * contiene movimenti del 2026 e del 2027, e chiedere «il 2026» e una domanda
 * diversa da «la stagione 2026/27».
 */
const anniProponibili = (oggi = new Date()) => {
  const corrente = oggi.getUTCFullYear();
  return [corrente + 1, corrente, corrente - 1, corrente - 2, corrente - 3];
};

const costruisciQuery = (filtri: Filtri, organizationId: string) => {
  const query = new URLSearchParams();
  if (organizationId) query.set("organization_id", organizationId);
  if (filtri.from) query.set("from", filtri.from);
  if (filtri.to) query.set("to", filtri.to);
  /*
    Un filtro assente **non si scrive**. Scriverlo vuoto vorrebbe dire mandare
    `fiscal_year=`, che il server legge come stringa vuota: e la porta da cui
    rientra il difetto di `Number(null) === 0`, questa volta dal lato del
    client. Cio che non e stato scelto non viaggia.
  */
  if (filtri.fiscalYear) query.set("fiscal_year", filtri.fiscalYear);
  if (filtri.seasonId) query.set("season_id", filtri.seasonId);
  if (filtri.financialAccountId) {
    query.set("financial_account_id", filtri.financialAccountId);
  }
  if (filtri.operationTypeCode) {
    query.set("operation_type_code", filtri.operationTypeCode);
  }
  if (filtri.siteId) query.set("site_id", filtri.siteId);
  if (filtri.direction) query.set("direction", filtri.direction);
  if (filtri.activityScope) query.set("activity_scope", filtri.activityScope);
  if (filtri.compareFiscalYear) {
    query.set("compare_fiscal_year", filtri.compareFiscalYear);
  }
  return query.toString();
};

/* ========================================================================== */
/* I mattoni visivi                                                            */
/* ========================================================================== */

/**
 * Un filtro a scelta singola. Fino a otto opzioni e un `Select`; oltre, il
 * `SearchableSelect` con la ricerca (guideline 08 §8.2): le causali di un club
 * superano facilmente la soglia, i conti a volte.
 */
function FilterSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  options: readonly SelectOption[];
  placeholder: string;
  ariaLabel: string;
}) {
  const tutte: SelectOption[] = [{ value: TUTTI, label: placeholder }, ...options];
  if (tutte.length > 8) {
    return (
      <SearchableSelect
        id={id}
        value={alSelect(value)}
        onValueChange={(next) => onChange(dalSelect(next))}
        options={tutte}
        placeholder={placeholder}
      />
    );
  }
  return (
    <Select
      id={id}
      value={alSelect(value)}
      onValueChange={(next) => onChange(dalSelect(next))}
      options={tutte}
      placeholder={placeholder}
      aria-label={ariaLabel}
    />
  );
}

/** La riga «chi possiede il numero» sotto la definizione di un riquadro. */
function KpiQualifier({ kpi: definition, note }: { kpi: KpiDefinition; note?: string }) {
  return (
    <>
      {note || definition.definition}
      <span className="egw-num mt-1 block break-all text-[10px] text-egw-ink-42">
        {definition.owner}
      </span>
    </>
  );
}

/** L'etichetta di una riga economica: nome, definizione e proprietario. */
function AccrualRowLabel({ kpi: definition, note }: { kpi: KpiDefinition; note?: string }) {
  return (
    <span className="block min-w-0 pr-2">
      <span className="block text-[13px] font-semibold text-egw-ink">{definition.label}</span>
      <span className="mt-0.5 block text-[11.5px] leading-[1.45] text-egw-ink-62">
        {note || definition.definition}
      </span>
      <span className="egw-num mt-1 block break-all text-[10px] text-egw-ink-42">
        {definition.owner}
      </span>
    </span>
  );
}

/* ========================================================================== */
/* La sezione                                                                  */
/* ========================================================================== */

type ContoOpzione = { id: string; name: string };
type CausaleOpzione = { code: string; label: string };

export default function ManagementSummary({
  clubId,
  club,
  role,
}: {
  clubId: string;
  club: { settings?: unknown; club_sites?: unknown } | null;
  role: string | null;
}) {
  const [filtri, setFiltri] = React.useState<Filtri>(FILTRI_VUOTI);
  /*
    `truncated` fa parte della risposta e non del tipo di dominio: e una
    proprieta della **lettura**, non del riepilogo. Sta qui perche la pagina
    debba dichiararla, che e la cosa che non faceva.
  */
  const [report, setReport] = React.useState<
    | (ManagementReport & {
        truncated?: boolean;
        lineCountRaw?: number;
        truncatedConfronto?: boolean;
      })
    | null
  >(null);
  const [balances, setBalances] = React.useState<
    Array<{ accountId: string; balanceCents: number }> | null | undefined
  >(undefined);
  const [conti, setConti] = React.useState<ContoOpzione[]>([]);
  const [causali, setCausali] = React.useState<CausaleOpzione[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [errore, setErrore] = React.useState<string | null>(null);
  const fieldId = React.useId();

  const puoLeggere = canOpenAccounting(role);

  const sites: ClubSite[] = React.useMemo(
    () => normalizeClubSites(club?.club_sites),
    [club?.club_sites],
  );
  /*
    ADR-0038: il club mono-sede non paga niente. Con zero o una sede
    configurata il filtro non compare, e nessun movimento senza sede sparisce
    da un elenco — un elemento senza sede appartiene a tutte le sedi, non a
    nessuna.
  */
  const multiSede = isMultiSiteClub(sites);

  const stagioni = React.useMemo(
    () => normalizeClubSeasons((club as any)?.settings).seasons,
    [club],
  );

  /* --- i vocabolari dei filtri: una lettura sola, all'apertura ------------- */
  React.useEffect(() => {
    if (!clubId || !puoLeggere) return;
    let vivo = true;

    (async () => {
      const [rispostaConti, rispostaCausali] = await Promise.all([
        apiRequest<{ accounts: Array<{ id: string; name: string }> }>(
          `/api/v1/accounting/accounts?organization_id=${encodeURIComponent(clubId)}`,
        ),
        apiRequest<{ operationTypes: Array<{ code: string; label: string }> }>(
          `/api/v1/fiscal/operation-types?organization_id=${encodeURIComponent(clubId)}`,
        ),
      ]);

      if (!vivo) return;
      setConti(
        (rispostaConti.data?.accounts || []).map((conto) => ({
          id: String(conto.id),
          name: String(conto.name),
        })),
      );
      setCausali(
        (rispostaCausali.data?.operationTypes || []).map((causale) => ({
          code: String(causale.code),
          label: String(causale.label || causale.code),
        })),
      );
    })();

    return () => {
      vivo = false;
    };
  }, [clubId, puoLeggere]);

  /* --- il riepilogo, a ogni cambio di filtro ------------------------------- */
  React.useEffect(() => {
    if (!clubId || !puoLeggere) return;
    let vivo = true;

    (async () => {
      setLoading(true);
      setErrore(null);

      const risposta = await apiRequest<{
        report: ManagementReport & {
          accountBalances:
            | Array<{ accountId: string; balanceCents: number }>
            | null;
          truncated: boolean;
        };
      }>(`/api/v1/accounting/reports?${costruisciQuery(filtri, clubId)}`);

      if (!vivo) return;

      if (risposta.error) {
        setErrore(risposta.error.message || "Riepilogo non disponibile");
        setReport(null);
      } else {
        setReport(risposta.data?.report || null);
        setBalances(risposta.data?.report?.accountBalances ?? null);
      }
      setLoading(false);
    })();

    return () => {
      vivo = false;
    };
  }, [clubId, puoLeggere, filtri]);

  if (!puoLeggere) {
    /*
      Chi non ha `accounting.read` non vede la sezione, e non vede nemmeno una
      sezione vuota: un riquadro che dice «0,00 EUR» a chi non ha il diritto di
      saperlo e un numero sbagliato al posto di un diniego.
    */
    return null;
  }

  const cash = report?.cash;
  const accrual = report?.accrual;
  const scope = report?.breakdown.byActivityScope;
  const saldoTotale =
    balances === null || balances === undefined
      ? null
      : balances.reduce((somma, riga) => somma + (riga.balanceCents || 0), 0);

  const cambia = (patch: Partial<Filtri>) =>
    setFiltri((precedenti) => ({ ...precedenti, ...patch }));

  const anni: SelectOption[] = anniProponibili().map((anno) => ({
    value: String(anno),
    label: String(anno),
  }));

  const righeEconomiche: SummaryRow[] = accrual
    ? [
        {
          label: <AccrualRowLabel kpi={kpi("familyReceivables")} />,
          value: euroFromCents(accrual.familyReceivablesCents),
        },
        /*
          **Il denaro incassato in piu, che prima non aveva un nome.**

          Il residuo non puo essere negativo, quindi una rata da 300 pagata
          500 lasciava duecento euro fuori da ogni numero del rendiconto:
          incassato piu residuo superava il dovuto, e l identita di chiusura
          si rompeva senza che niente lo dicesse. La riga compare solo quando
          c e qualcosa da dire.
        */
        ...(accrual.familyCreditCents > 0
          ? [
              {
                label: (
                  <AccrualRowLabel
                    kpi={{
                      key: "familyCredit",
                      label: "Versato in piu dalle famiglie",
                      quantity: "economica",
                      owner: "src/lib/server/accounting-reports.ts",
                      definition:
                        "Denaro che il club tiene per conto delle famiglie: non e un ricavo e non e un credito. Va rimborsato o portato a conto della rata successiva.",
                    }}
                  />
                ),
                value: euroFromCents(accrual.familyCreditCents),
              } satisfies SummaryRow,
            ]
          : []),
        {
          label: (
            <AccrualRowLabel
              kpi={kpi("overdueReceivables")}
              note={`${formatInteger(accrual.overdueCount)} rate scadute e non saldate. Sono un sottoinsieme dei crediti, non una voce che vi si aggiunge.`}
            />
          ),
          value: euroFromCents(accrual.overdueReceivablesCents),
          tone: accrual.overdueReceivablesCents > 0 ? "red" : "ink",
        },
        {
          label: <AccrualRowLabel kpi={kpi("fundingPending")} />,
          value: euroFromCents(accrual.fundingPendingCents),
        },
        {
          label: <AccrualRowLabel kpi={kpi("sportWorkAccruedUnpaid")} />,
          value: euroFromCents(accrual.sportWorkAccruedUnpaidCents),
        },
      ]
    : [];

  return (
    <section
      className="flex flex-col gap-[18px]"
      aria-labelledby="riepilogo-gestionale-title"
      data-test="riepilogo-gestionale"
    >
      {/* --- il nome, la riga che dice cosa non e, e i filtri ------------ */}
      <Panel>
        <PanelHeader
          eyebrow="Cassa e competenza"
          title={<span id="riepilogo-gestionale-title">{MANAGEMENT_REPORT_TITLE}</span>}
        />
        <InfoCard>{MANAGEMENT_REPORT_DISCLAIMER}</InfoCard>

        <FieldSizeProvider size="sm">
          <div className="mt-5 grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Dal" htmlFor={`${fieldId}-dal`}>
              <DateInput
                id={`${fieldId}-dal`}
                value={filtri.from}
                onChange={(event) => cambia({ from: event.target.value })}
              />
            </Field>
            <Field label="Al" htmlFor={`${fieldId}-al`}>
              <DateInput
                id={`${fieldId}-al`}
                value={filtri.to}
                onChange={(event) => cambia({ to: event.target.value })}
              />
            </Field>
            <Field label="Anno fiscale" htmlFor={`${fieldId}-anno`}>
              <FilterSelect
                id={`${fieldId}-anno`}
                ariaLabel="Anno fiscale"
                value={filtri.fiscalYear}
                onChange={(fiscalYear) => cambia({ fiscalYear })}
                options={anni}
                placeholder="Tutti gli anni"
              />
            </Field>
            <Field label="Stagione sportiva" htmlFor={`${fieldId}-stagione`}>
              <FilterSelect
                id={`${fieldId}-stagione`}
                ariaLabel="Stagione sportiva"
                value={filtri.seasonId}
                onChange={(seasonId) => cambia({ seasonId })}
                options={stagioni.map((stagione) => ({
                  value: stagione.id,
                  label: stagione.label,
                }))}
                placeholder="Tutte le stagioni"
              />
            </Field>
            <Field label="Conto" htmlFor={`${fieldId}-conto`}>
              <FilterSelect
                id={`${fieldId}-conto`}
                ariaLabel="Conto"
                value={filtri.financialAccountId}
                onChange={(financialAccountId) => cambia({ financialAccountId })}
                options={conti.map((conto) => ({ value: conto.id, label: conto.name }))}
                placeholder="Tutti i conti"
              />
            </Field>
            <Field label="Causale" htmlFor={`${fieldId}-causale`}>
              <FilterSelect
                id={`${fieldId}-causale`}
                ariaLabel="Causale"
                value={filtri.operationTypeCode}
                onChange={(operationTypeCode) => cambia({ operationTypeCode })}
                options={causali.map((causale) => ({
                  value: causale.code,
                  label: causale.label,
                }))}
                placeholder="Tutte le causali"
              />
            </Field>
            {multiSede ? (
              <Field label="Sede" htmlFor={`${fieldId}-sede`}>
                <FilterSelect
                  id={`${fieldId}-sede`}
                  ariaLabel="Sede"
                  value={filtri.siteId}
                  onChange={(siteId) => cambia({ siteId })}
                  options={sites.map((sede) => ({ value: sede.id, label: sede.name }))}
                  placeholder="Tutte le sedi"
                />
              </Field>
            ) : null}
            <Field label="Verso" htmlFor={`${fieldId}-verso`}>
              <FilterSelect
                id={`${fieldId}-verso`}
                ariaLabel="Verso"
                value={filtri.direction}
                onChange={(direction) => cambia({ direction })}
                options={[
                  { value: "IN", label: "Solo entrate" },
                  { value: "OUT", label: "Solo uscite" },
                ]}
                placeholder="Entrate e uscite"
              />
            </Field>
            <Field label="Classificazione" htmlFor={`${fieldId}-classificazione`}>
              <FilterSelect
                id={`${fieldId}-classificazione`}
                ariaLabel="Classificazione"
                value={filtri.activityScope}
                onChange={(activityScope) => cambia({ activityScope })}
                options={ACTIVITY_SCOPES.map((valore: ActivityScope) => ({
                  value: valore,
                  label: ACTIVITY_SCOPE_LABELS[valore],
                }))}
                placeholder="Tutte"
              />
            </Field>
            <Field label="Confronta con l'anno" htmlFor={`${fieldId}-confronto`}>
              <FilterSelect
                id={`${fieldId}-confronto`}
                ariaLabel="Confronta con l'anno"
                value={filtri.compareFiscalYear}
                onChange={(compareFiscalYear) => cambia({ compareFiscalYear })}
                options={anni}
                placeholder="Nessun confronto"
              />
            </Field>
          </div>
        </FieldSizeProvider>

        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<RefreshCw />}
            onClick={() => setFiltri(FILTRI_VUOTI)}
          >
            Azzera i filtri
          </Button>
          {/*
            L'export esce con **gli stessi filtri** che stanno sopra, meno il
            confronto: un secondo periodo e una domanda del riepilogo, non
            una riga in piu nel file.
          */}
          <AccountingExportButton
            clubId={clubId}
            role={role}
            query={costruisciQuery({ ...filtri, compareFiscalYear: "" }, clubId)}
          />
          {loading ? (
            <span role="status" className="font-brand text-[12px] text-egw-ink-62">
              Ricalcolo del riepilogo...
            </span>
          ) : null}
          {report ? (
            <span className="egw-num font-brand text-[12px] text-egw-ink-62">
              {formatInteger(cash?.lineCount || 0)} movimenti considerati
              {cash?.neutralizedCount
                ? ` · ${formatInteger(cash.neutralizedCount)} esclusi perche stornati`
                : ""}
            </span>
          ) : null}
        </div>

        {/*
          **Il troncamento si dichiara, e questa era la pagina che taceva.**

          Il server calcola `truncated` e lo restituisce; questa schermata lo
          dichiarava nel tipo della risposta e non lo leggeva in nessuna riga.
          Una revisione ostile ha misurato un club da 42.000 righe: la pagina
          stampava sedici riquadri in euro, cinque tabelle e il confronto con
          l'anno prima sulle **quarantamila piu recenti**, e sotto il titolo
          diceva «40000 movimenti considerati» senza un solo segnale.
          Mancavano 434.520 euro di incassato e 418.520 di pagato.

          La pagina dei movimenti l'avviso ce l'aveva; l'export rifiuta
          proprio per non consegnare un file incompleto. La superficie con cui
          si chiudono i conti era l'unica muta.
        */}
        {report?.truncated ? (
          report?.truncatedConfronto ? (
            /*
              **A fermarsi puo essere il periodo di confronto**, e allora le
              variazioni sono calcolate su una parte del periodo di prima e
              su tutto quello di adesso. Il numero di righe raccolte e quello
              della lettura principale: qui non dice dove ci si e fermati, e
              dirlo confonderebbe piu del silenzio.
            */
            <AlertBlock
              severity="warning"
              className="mt-4"
              title="Il confronto non copre tutto il periodo precedente."
            >
              La lettura del periodo di confronto si e fermata prima della fine:
              le variazioni qui sotto sono calcolate su una parte di quel periodo
              e su tutto quello corrente. Restringi il confronto o scegli un anno
              fiscale.
            </AlertBlock>
          ) : (
            <AlertBlock
              severity="warning"
              className="mt-4"
              title="Questi totali non coprono tutto il periodo."
            >
              La lettura si e fermata a{" "}
              {formatInteger(report?.lineCountRaw ?? cash?.lineCount ?? 0)} movimenti,
              dai piu recenti: cio che viene prima non e in nessuno dei numeri qui
              sotto. Restringi il periodo o scegli un anno fiscale, e i totali
              torneranno a coprire l&apos;insieme intero.
            </AlertBlock>
          )
        ) : null}

        {errore ? (
          <AlertBlock severity="warning" className="mt-4" title={errore} />
        ) : null}
      </Panel>

      {report && cash && accrual && scope ? (
        <>
          {/* --- cassa: grandezze finanziarie ---------------------------- */}
          <section aria-labelledby="riepilogo-cassa-title" className="flex flex-col gap-3">
            <div>
              <Eyebrow className="mb-1.5">Grandezze finanziarie</Eyebrow>
              <h3 id="riepilogo-cassa-title" className="font-brand text-[15px] font-bold leading-5 text-egw-ink">
                Cassa e banca
              </h3>
            </div>
            <KpiBar className="md:grid-cols-2 laptop:grid-cols-4">
              <KpiCard
                label={kpi("accountBalances").label}
                value={saldoTotale === null ? "Non visibile" : euroFromCents(saldoTotale)}
                qualifier={
                  <KpiQualifier
                    kpi={kpi("accountBalances")}
                    note={
                      saldoTotale === null
                        ? "I saldi dei conti richiedono un permesso che il ruolo attivo non ha. Nessun numero al posto del diniego."
                        : undefined
                    }
                  />
                }
              />
              <KpiCard
                label={kpi("collected").label}
                value={euroFromCents(cash.collectedCents)}
                qualifier={<KpiQualifier kpi={kpi("collected")} />}
              />
              <KpiCard
                label={kpi("paid").label}
                value={euroFromCents(cash.paidCents)}
                qualifier={<KpiQualifier kpi={kpi("paid")} />}
              />
              <KpiCard
                label="Giroconti nel periodo"
                value={euroFromCents(cash.transferOutCents)}
                qualifier={
                  <KpiQualifier
                    kpi={{
                      key: "transfers",
                      label: "Giroconti nel periodo",
                      quantity: "finanziaria",
                      owner: "src/lib/server/accounting.ts",
                      definition: `Denaro spostato fra conti della societa, su ${formatInteger(cash.transferCount)} righe. Non e ne un incasso ne un pagamento: la liquidita totale non cambia, e per questo resta fuori dalle due voci accanto.`,
                    }}
                  />
                }
              />
            </KpiBar>
          </section>

          {/* --- competenza: crediti e debiti ---------------------------- */}
          <section aria-labelledby="riepilogo-competenza-title" className="flex flex-col gap-3">
            <div>
              <Eyebrow className="mb-1.5">Grandezze economiche</Eyebrow>
              <h3 id="riepilogo-competenza-title" className="font-brand text-[15px] font-bold leading-5 text-egw-ink">
                Crediti e debiti
              </h3>
              <p className="mt-1 max-w-[88ch] font-brand text-[12.5px] leading-[1.5] text-egw-ink-62">
                Non si sommano ai numeri di cassa e non dipendono dal periodo
                scelto: un credito aperto e cio che resta dovuto oggi, non cio
                che e successo in un intervallo.
              </p>
            </div>
            <SummaryCard dashed rows={righeEconomiche} className="[&_dd]:shrink-0" />
          </section>

          {/* --- la classificazione, con il non classificato dichiarato --- */}
          <Panel as="section" aria-labelledby="riepilogo-classificazione-title">
            <PanelHeader
              title={<span id="riepilogo-classificazione-title">Istituzionale e commerciale</span>}
              description="La classificazione arriva dalla causale ed e congelata sul movimento. Cio che nessuno ha classificato viene contato a parte, non nascosto in un totale."
            />
            <ReportStatGrid>
              {scope.groups.map((gruppo) => (
                <ReportStatTile
                  key={gruppo.scope}
                  label={gruppo.label}
                  value={euroFromCents(gruppo.inCents)}
                  qualifier={`in entrata · ${euroFromCents(gruppo.outCents)} in uscita · ${formatInteger(gruppo.lineCount)} righe`}
                  tone={gruppo.scope === "unspecified" ? "amber" : "neutral"}
                />
              ))}
            </ReportStatGrid>

            {scope.hasUnclassified ? (
              /*
                **Due percentuali, perche sono due domande.**

                La frase diceva «6 movimenti su 195» e accanto stampava la
                quota del **denaro**: chi legge la interpreta come la frazione
                di quelle 195 righe, e 6 su 195 non fa 65,6%. La percentuale
                delle righe dice quante correzioni servono; quella del denaro
                dice quanto bilancio non e attribuito, ed e la piu importante
                delle due — ma solo se e detto che parla di euro.

                **Il rimedio non esiste per tutte le righe, e dirlo e piu
                onesto che promettere.** Le liquidazioni dei bandi e le uscite
                del lavoro sportivo non hanno una causale, e non possono
                averla: il loro dominio non ne conosce una.
              */
              <AlertBlock
                severity="warning"
                className="mt-4"
                title={
                  <>
                    <strong className="egw-num">{formatInteger(scope.unspecifiedLineCount)}</strong>{" "}
                    movimenti su{" "}
                    <span className="egw-num">
                      {formatInteger(scope.unspecifiedLineCount + scope.classifiedLineCount)}
                    </span>{" "}
                    (<span className="egw-num">{quota(scope.unspecifiedLineShare)}</span>) non hanno una
                    classificazione, e valgono il{" "}
                    <strong className="egw-num">{quota(scope.unspecifiedShare)} del denaro</strong>{" "}
                    che si e mosso nel periodo.
                  </>
                }
              >
                Finche restano cosi, la ripartizione fra istituzionale e
                commerciale non descrive l&apos;attivita della societa.
                <br />
                Le entrate e le uscite registrate a mano e gli incassi delle
                famiglie si classificano configurando le causali; i contributi
                degli enti e i compensi del lavoro sportivo restano «non
                dichiarati» perche il loro dominio non porta una causale, e non
                e qualcosa che si possa configurare.
              </AlertBlock>
            ) : (
              <AlertBlock
                severity="success"
                className="mt-4"
                title="Tutti i movimenti del filtro hanno una classificazione."
              />
            )}
          </Panel>

          {/* --- il confronto, solo fra grandezze omogenee ---------------- */}
          {report.comparison ? (
            <Panel as="section" aria-labelledby="riepilogo-confronto-title">
              <PanelHeader
                title={
                  <span id="riepilogo-confronto-title">
                    Confronto con l&apos;anno {filtri.compareFiscalYear}
                  </span>
                }
                description="Cassa contro cassa. Crediti e debiti non entrano in questo confronto: sono un'altra grandezza, e la differenza fra le due non sarebbe una variazione."
              />
              <ReportStatGrid>
                {(
                  [
                    ["Incassato", report.comparison.collected],
                    ["Pagato", report.comparison.paid],
                    ["Saldo dei movimenti", report.comparison.net],
                  ] as const
                ).map(([etichetta, valore]) => (
                  <ReportStatTile
                    key={etichetta}
                    label={etichetta}
                    value={euroFromCents(valore.currentCents)}
                    qualifier={
                      <>
                        <span className="egw-num">{euroFromCents(valore.previousCents)}</span>{" "}
                        nel periodo di confronto ·{" "}
                        <span className="egw-num">
                          {valore.deltaCents >= 0 ? "+" : ""}
                          {euroFromCents(valore.deltaCents)}
                        </span>{" "}
                        {valore.share === null
                          ? "(nessuna base di confronto)"
                          : `(${valore.share >= 0 ? "+" : ""}${quota(valore.share)})`}
                      </>
                    }
                  />
                ))}
              </ReportStatGrid>
            </Panel>
          ) : null}

          {/* --- i raggruppamenti ---------------------------------------- */}
          <div className="grid min-w-0 grid-cols-1 gap-[18px] xl:grid-cols-2">
            <ManagementGroupGrid
              module="riepilogo-causale"
              title="Per causale"
              description="Giroconti esclusi: non hanno causale, e attribuirgliene una li farebbe comparire in una voce di rendiconto."
              labelHeader="Causale"
              groups={report.breakdown.byOperationType}
            />
            <ManagementGroupGrid
              module="riepilogo-voce"
              title="Per voce di rendiconto"
              description="La voce e configurata sulla causale. Le causali senza voce finiscono in «Senza voce di rendiconto», che e la verita e non un residuo."
              labelHeader="Voce"
              groups={report.breakdown.byReportingBucket}
            />
            <ManagementGroupGrid
              module="riepilogo-conto"
              title="Per conto — movimento del periodo"
              description="E il flusso del periodo, non il saldo: il saldo parte dall'apertura e somma tutta la storia del conto. Qui i giroconti entrano, perche sul singolo conto il denaro si e mosso davvero."
              labelHeader="Conto"
              groups={report.breakdown.byAccount}
            />
            <ManagementGroupGrid
              module="riepilogo-mese"
              title="Per mese"
              description="La data e quella del movimento, non quella di registrazione."
              labelHeader="Mese"
              groups={report.breakdown.byMonth}
              formatLabel={meseDelGruppo}
            />
            <ManagementGroupGrid
              module="riepilogo-origine"
              title="Per origine"
              description="Quanto viene dalla prima nota e quanto dai domini che possiedono il denaro: incassi, compensi, contributi."
              labelHeader="Origine"
              groups={report.breakdown.bySourceDomain}
            />
          </div>

          <InfoCard eyebrow="Promemoria">{MANAGEMENT_REPORT_DISCLAIMER}</InfoCard>
        </>
      ) : null}
    </section>
  );
}
