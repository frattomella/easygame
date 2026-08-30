"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Info, RefreshCw, Scale } from "lucide-react";
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
import AccountingExportButton from "./accounting-export-button";

/**
 * Il **Riepilogo gestionale** dentro `/reports`.
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
 * Cassa e competenza sono due griglie distinte, con due intestazioni proprie e
 * un separatore in mezzo. Non e una scelta grafica: e il §28 applicato al
 * markup — «cassa da una parte, crediti e debiti dall'altra, mai nella stessa
 * riga di totali». Ogni riquadro dichiara il proprio proprietario e la propria
 * grandezza, che arrivano da `DASHBOARD_KPIS` e non da stringhe scritte qui.
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
 * A 375 px i filtri sono una colonna sola e le tabelle scorrono dentro il loro
 * contenitore; a 768 px i filtri diventano due colonne e i riquadri due; a
 * 1280 px i riquadri sono quattro. Nessun contenitore fa scorrere la pagina in
 * orizzontale: cio che deborda scorre dentro di se.
 */

/* ========================================================================== */
/* Formati                                                                     */
/* ========================================================================== */

const currency = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});

const euro = (cents: number) => currency.format((Number(cents) || 0) / 100);

const percent = (value: number) =>
  `${Math.round((Number(value) || 0) * 1000) / 10}%`;

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

const dalSelect = (value: string) => (value === TUTTI ? "" : value);
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
 * Un riquadro che porta con se **chi possiede il numero**.
 *
 * Il proprietario non e un dettaglio da sviluppatori: e la risposta alla
 * domanda «perche questo numero e diverso da quello dell'altra pagina», che
 * senza di esso resta senza risposta e produce una segnalazione.
 */
function KpiCard({
  kpi,
  value,
  note,
}: {
  kpi: KpiDefinition;
  value: string;
  note?: string;
}) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {kpi.label}
        </p>
        <p className="mt-1 break-words text-xl font-semibold text-slate-950 sm:text-2xl">
          {value}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {note || kpi.definition}
        </p>
        <p className="mt-2 font-mono text-[10px] leading-tight text-slate-400">
          {kpi.owner}
        </p>
      </CardContent>
    </Card>
  );
}

function GroupTable({
  title,
  description,
  groups,
  labelHeader,
  formatLabel,
}: {
  title: string;
  description: string;
  groups: ReportGroup[];
  labelHeader: string;
  formatLabel?: (group: ReportGroup) => string;
}) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-slate-500">{description}</p>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Nessun movimento nel filtro selezionato.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">{labelHeader}</th>
                  <th className="px-3 py-2 text-right font-semibold">Entrate</th>
                  <th className="px-3 py-2 text-right font-semibold">Uscite</th>
                  <th className="px-3 py-2 text-right font-semibold">Saldo</th>
                  <th className="px-3 py-2 text-right font-semibold">Righe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groups.map((group) => (
                  <tr key={group.key || "__vuoto__"}>
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {formatLabel ? formatLabel(group) : group.label}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                      {euro(group.inCents)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-700">
                      {euro(group.outCents)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                      {euro(group.netCents)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {group.lineCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
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
    (ManagementReport & { truncated?: boolean; lineCountRaw?: number }) | null
  >(null);
  const [balances, setBalances] = React.useState<
    Array<{ accountId: string; balanceCents: number }> | null | undefined
  >(undefined);
  const [conti, setConti] = React.useState<ContoOpzione[]>([]);
  const [causali, setCausali] = React.useState<CausaleOpzione[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [errore, setErrore] = React.useState<string | null>(null);

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

  return (
    <section className="space-y-4">
      {/* --- il nome, e la riga che dice cosa non e --------------------- */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Scale className="h-5 w-5 text-slate-700" />
            {MANAGEMENT_REPORT_TITLE}
          </CardTitle>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <span>{MANAGEMENT_REPORT_DISCLAIMER}</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase text-slate-500">
                Dal
              </span>
              <Input
                type="date"
                value={filtri.from}
                onChange={(event) => cambia({ from: event.target.value })}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase text-slate-500">
                Al
              </span>
              <Input
                type="date"
                value={filtri.to}
                onChange={(event) => cambia({ to: event.target.value })}
              />
            </label>

            <div className="space-y-1.5">
              <span className="text-xs font-medium uppercase text-slate-500">
                Anno fiscale
              </span>
              <Select
                value={alSelect(filtri.fiscalYear)}
                onValueChange={(value) =>
                  cambia({ fiscalYear: dalSelect(value) })
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Tutti gli anni" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTI}>Tutti gli anni</SelectItem>
                  {anniProponibili().map((anno) => (
                    <SelectItem key={anno} value={String(anno)}>
                      {anno}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium uppercase text-slate-500">
                Stagione sportiva
              </span>
              <Select
                value={alSelect(filtri.seasonId)}
                onValueChange={(value) => cambia({ seasonId: dalSelect(value) })}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Tutte le stagioni" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTI}>Tutte le stagioni</SelectItem>
                  {stagioni.map((stagione) => (
                    <SelectItem key={stagione.id} value={stagione.id}>
                      {stagione.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium uppercase text-slate-500">
                Conto
              </span>
              <Select
                value={alSelect(filtri.financialAccountId)}
                onValueChange={(value) =>
                  cambia({ financialAccountId: dalSelect(value) })
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Tutti i conti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTI}>Tutti i conti</SelectItem>
                  {conti.map((conto) => (
                    <SelectItem key={conto.id} value={conto.id}>
                      {conto.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium uppercase text-slate-500">
                Causale
              </span>
              <Select
                value={alSelect(filtri.operationTypeCode)}
                onValueChange={(value) =>
                  cambia({ operationTypeCode: dalSelect(value) })
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Tutte le causali" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTI}>Tutte le causali</SelectItem>
                  {causali.map((causale) => (
                    <SelectItem key={causale.code} value={causale.code}>
                      {causale.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {multiSede ? (
              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase text-slate-500">
                  Sede
                </span>
                <Select
                  value={alSelect(filtri.siteId)}
                  onValueChange={(value) => cambia({ siteId: dalSelect(value) })}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Tutte le sedi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TUTTI}>Tutte le sedi</SelectItem>
                    {sites.map((sede) => (
                      <SelectItem key={sede.id} value={sede.id}>
                        {sede.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <span className="text-xs font-medium uppercase text-slate-500">
                Verso
              </span>
              <Select
                value={alSelect(filtri.direction)}
                onValueChange={(value) =>
                  cambia({ direction: dalSelect(value) })
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Entrate e uscite" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTI}>Entrate e uscite</SelectItem>
                  <SelectItem value="IN">Solo entrate</SelectItem>
                  <SelectItem value="OUT">Solo uscite</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium uppercase text-slate-500">
                Classificazione
              </span>
              <Select
                value={alSelect(filtri.activityScope)}
                onValueChange={(value) =>
                  cambia({ activityScope: dalSelect(value) })
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Tutte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTI}>Tutte</SelectItem>
                  {ACTIVITY_SCOPES.map((valore: ActivityScope) => (
                    <SelectItem key={valore} value={valore}>
                      {ACTIVITY_SCOPE_LABELS[valore]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium uppercase text-slate-500">
                Confronta con l&apos;anno
              </span>
              <Select
                value={alSelect(filtri.compareFiscalYear)}
                onValueChange={(value) =>
                  cambia({ compareFiscalYear: dalSelect(value) })
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Nessun confronto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTI}>Nessun confronto</SelectItem>
                  {anniProponibili().map((anno) => (
                    <SelectItem key={anno} value={String(anno)}>
                      {anno}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFiltri(FILTRI_VUOTI)}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
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
              <span className="text-xs text-slate-500">
                Ricalcolo del riepilogo...
              </span>
            ) : null}
            {report ? (
              <span className="text-xs text-slate-500">
                {cash?.lineCount || 0} movimenti considerati
                {cash?.neutralizedCount
                  ? ` · ${cash.neutralizedCount} esclusi perche stornati`
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
            <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>Questi totali non coprono tutto il periodo.</strong> La
                lettura si e fermata a {report?.lineCountRaw ?? cash?.lineCount ?? 0} movimenti, dai piu
                recenti: cio che viene prima non e in nessuno dei numeri qui
                sotto. Restringi il periodo o scegli un anno fiscale, e i totali
                torneranno a coprire l&apos;insieme intero.
              </span>
            </p>
          ) : null}

          {errore ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errore}</span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      {report && cash && accrual && scope ? (
        <>
          {/* --- cassa: grandezze finanziarie ---------------------------- */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Cassa e banca — grandezze finanziarie
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                kpi={kpi("accountBalances")}
                value={saldoTotale === null ? "Non visibile" : euro(saldoTotale)}
                note={
                  saldoTotale === null
                    ? "I saldi dei conti richiedono un permesso che il ruolo attivo non ha. Nessun numero al posto del diniego."
                    : undefined
                }
              />
              <KpiCard kpi={kpi("collected")} value={euro(cash.collectedCents)} />
              <KpiCard kpi={kpi("paid")} value={euro(cash.paidCents)} />
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-4 sm:p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Giroconti nel periodo
                  </p>
                  <p className="mt-1 break-words text-xl font-semibold text-slate-950 sm:text-2xl">
                    {euro(cash.transferOutCents)}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    Denaro spostato fra conti della societa, su{" "}
                    {cash.transferCount} righe. Non e ne un incasso ne un
                    pagamento: la liquidita totale non cambia, e per questo
                    resta fuori dalle due voci accanto.
                  </p>
                  <p className="mt-2 font-mono text-[10px] leading-tight text-slate-400">
                    src/lib/server/accounting.ts
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* --- competenza: crediti e debiti ---------------------------- */}
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Crediti e debiti — grandezze economiche
            </h3>
            <p className="text-xs text-slate-500">
              Non si sommano ai numeri di cassa e non dipendono dal periodo
              scelto: un credito aperto e cio che resta dovuto oggi, non cio che
              e successo in un intervallo.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                kpi={kpi("familyReceivables")}
                value={euro(accrual.familyReceivablesCents)}
              />
              <KpiCard
                kpi={kpi("overdueReceivables")}
                value={euro(accrual.overdueReceivablesCents)}
                note={`${accrual.overdueCount} rate scadute e non saldate. Sono un sottoinsieme dei crediti, non una voce che vi si aggiunge.`}
              />
              <KpiCard
                kpi={kpi("fundingPending")}
                value={euro(accrual.fundingPendingCents)}
              />
              <KpiCard
                kpi={kpi("sportWorkAccruedUnpaid")}
                value={euro(accrual.sportWorkAccruedUnpaidCents)}
              />
            </div>
          </div>

          {/* --- la classificazione, con il non classificato dichiarato --- */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Istituzionale e commerciale
              </CardTitle>
              <p className="text-xs text-slate-500">
                La classificazione arriva dalla causale ed e congelata sul
                movimento. Cio che nessuno ha classificato viene contato a
                parte, non nascosto in un totale.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                {scope.groups.map((gruppo) => (
                  <div
                    key={gruppo.scope}
                    className={`rounded-lg border p-4 ${
                      gruppo.scope === "unspecified"
                        ? "border-amber-200 bg-amber-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <p className="text-xs font-medium uppercase text-slate-500">
                      {gruppo.label}
                    </p>
                    <p className="mt-1 break-words text-xl font-semibold text-slate-950">
                      {euro(gruppo.inCents)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      in entrata · {euro(gruppo.outCents)} in uscita ·{" "}
                      {gruppo.lineCount} righe
                    </p>
                  </div>
                ))}
              </div>

              {scope.hasUnclassified ? (
                <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <strong>{scope.unspecifiedLineCount}</strong> movimenti su{" "}
                    {scope.unspecifiedLineCount + scope.classifiedLineCount} (
                    {percent(scope.unspecifiedShare)}) non hanno una
                    classificazione. Finche restano cosi, la ripartizione fra
                    istituzionale e commerciale non descrive l&apos;attivita
                    della societa.
                    <br />
                    {/*
                      **Il rimedio non esiste per tutte le righe, e dirlo e piu
                      onesto che promettere.**

                      Le liquidazioni dei bandi e le uscite del lavoro sportivo
                      non hanno una causale, e non possono averla: il loro
                      dominio non ne conosce una. Quelle righe restano «non
                      dichiarate» per sempre, e un club che riceve contributi o
                      paga compensi non vedra mai questa quota scendere a zero.
                      Mandarlo a configurare le causali era una risposta che per
                      quelle righe non funziona.
                    */}
                    Le entrate e le uscite registrate a mano e gli incassi delle
                    famiglie si classificano configurando le causali; i
                    contributi degli enti e i compensi del lavoro sportivo
                    restano «non dichiarati» perche il loro dominio non porta
                    una causale, e non e qualcosa che si possa configurare.
                  </span>
                </p>
              ) : (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  Tutti i movimenti del filtro hanno una classificazione.
                </p>
              )}
            </CardContent>
          </Card>

          {/* --- il confronto, solo fra grandezze omogenee ---------------- */}
          {report.comparison ? (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Confronto con l&apos;anno {filtri.compareFiscalYear}
                </CardTitle>
                <p className="text-xs text-slate-500">
                  Cassa contro cassa. Crediti e debiti non entrano in questo
                  confronto: sono un&apos;altra grandezza, e la differenza fra
                  le due non sarebbe una variazione.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      ["Incassato", report.comparison.collected],
                      ["Pagato", report.comparison.paid],
                      ["Saldo dei movimenti", report.comparison.net],
                    ] as const
                  ).map(([etichetta, valore]) => (
                    <div
                      key={etichetta}
                      className="rounded-lg border border-slate-200 p-4"
                    >
                      <p className="text-xs font-medium uppercase text-slate-500">
                        {etichetta}
                      </p>
                      <p className="mt-1 break-words text-lg font-semibold text-slate-950">
                        {euro(valore.currentCents)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {euro(valore.previousCents)} nel periodo di confronto ·{" "}
                        {valore.deltaCents >= 0 ? "+" : ""}
                        {euro(valore.deltaCents)}{" "}
                        {valore.share === null
                          ? "(nessuna base di confronto)"
                          : `(${valore.share >= 0 ? "+" : ""}${percent(valore.share)})`}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* --- i raggruppamenti ---------------------------------------- */}
          <div className="grid gap-4 xl:grid-cols-2">
            <GroupTable
              title="Per causale"
              description="Giroconti esclusi: non hanno causale, e attribuirgliene una li farebbe comparire in una voce di rendiconto."
              labelHeader="Causale"
              groups={report.breakdown.byOperationType}
            />
            <GroupTable
              title="Per voce di rendiconto"
              description="La voce e configurata sulla causale. Le causali senza voce finiscono in «Senza voce di rendiconto», che e la verita e non un residuo."
              labelHeader="Voce"
              groups={report.breakdown.byReportingBucket}
            />
            <GroupTable
              title="Per conto — movimento del periodo"
              description="E il flusso del periodo, non il saldo: il saldo parte dall'apertura e somma tutta la storia del conto. Qui i giroconti entrano, perche sul singolo conto il denaro si e mosso davvero."
              labelHeader="Conto"
              groups={report.breakdown.byAccount}
            />
            <GroupTable
              title="Per mese"
              description="La data e quella del movimento, non quella di registrazione."
              labelHeader="Mese"
              groups={report.breakdown.byMonth}
              formatLabel={(gruppo) => meseLeggibile(gruppo.key)}
            />
            <GroupTable
              title="Per origine"
              description="Quanto viene dalla prima nota e quanto dai domini che possiedono il denaro: incassi, compensi, contributi."
              labelHeader="Origine"
              groups={report.breakdown.bySourceDomain}
            />
          </div>

          <p className="text-xs text-slate-500">
            <Badge variant="outline" className="mr-2">
              Promemoria
            </Badge>
            {MANAGEMENT_REPORT_DISCLAIMER}
          </p>
        </>
      ) : null}
    </section>
  );
}
