"use client";

import React from "react";
import { CheckCircle2, Download, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest, readStoredActiveClub } from "@/lib/api/client";
import { downloadCsv, toCsv } from "@/lib/csv";
import { hasSportWorkPermission } from "@/lib/sport-work/permissions";
import { CONFIGURED_RULE_YEARS } from "@/lib/sport-work/rules";
import {
  dueLabel,
  formatCurrency,
  formatDate,
  obligationKindLabel,
  obligationStatusBadge,
  statusBadgeOf,
} from "./sport-work-format";

/**
 * L'agenda degli adempimenti e i dataset che il consulente si porta via.
 *
 * **La frase che questa pagina deve dire, e dice, e una sola**: EasyGame
 * prepara l'input dell'adempimento, non l'adempimento. Non trasmette al RASD,
 * non compila l'F24, non predispone la CU. Sa che l'adempimento esiste, entro
 * quando, con quali dati, e se qualcuno lo ha marcato fatto.
 *
 * Un gestionale che lasciasse credere il contrario produrrebbe adempimenti
 * sbagliati **con l'aria della competenza**, che e il modo peggiore di
 * sbagliarli.
 */

/**
 * Scarica una tabella come CSV.
 *
 * Il tracciato lo decide `src/lib/csv.ts`, non questo file. Fino all'audit di
 * fine Wave 1 qui viveva una copia — stesso separatore, stesso BOM, stesso
 * nome di funzione — che pero **non virgolettava il ritorno a capo isolato**:
 * una nota incollata da un programma di posta spezzava la riga, e chi apriva
 * il file trovava un adempimento in piu che nessuno aveva censito. E il difetto
 * per cui il modulo condiviso esiste.
 */
const downloadObligationsCsv = (
  filename: string,
  rows: Array<Record<string, unknown>>,
) => {
  if (rows.length === 0) return;

  const columns = Object.keys(rows[0]).map((key) => ({ key, label: key }));
  downloadCsv(filename, toCsv(columns, rows));
};

export function ObligationsPanel() {
  const { showToast } = useToast();
  const [obligations, setObligations] = React.useState<any[]>([]);
  const [f24, setF24] = React.useState<any[]>([]);
  const [cu, setCu] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [role, setRole] = React.useState<string | null>(null);
  const [year, setYear] = React.useState(() => {
    const current = new Date().getUTCFullYear();
    return CONFIGURED_RULE_YEARS.includes(current)
      ? current
      : CONFIGURED_RULE_YEARS[0];
  });

  React.useEffect(() => {
    setRole(readStoredActiveClub()?.role || null);
  }, []);

  const canManage = hasSportWorkPermission(role, "sport_work.manage");
  const canFiscal = hasSportWorkPermission(role, "sport_work.fiscal");

  const load = React.useCallback(async () => {
    setLoading(true);
    const [obligationsResult, f24Result, cuResult] = await Promise.all([
      apiRequest<any[]>("/api/v1/sport-work/obligations"),
      apiRequest<any>(`/api/v1/sport-work/datasets?kind=f24&year=${year}`),
      apiRequest<any>(`/api/v1/sport-work/datasets?kind=cu&year=${year}`),
    ]);
    setLoading(false);

    if (obligationsResult.error) {
      showToast(
        "error",
        obligationsResult.error.message || "Errore nella lettura dell'agenda",
      );
      return;
    }

    setObligations(
      Array.isArray(obligationsResult.data) ? obligationsResult.data : [],
    );
    setF24(Array.isArray(f24Result.data?.rows) ? f24Result.data.rows : []);
    setCu(Array.isArray(cuResult.data?.rows) ? cuResult.data.rows : []);
  }, [year, showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const sync = async () => {
    setBusy(true);
    const { data, error } = await apiRequest<any>(
      "/api/v1/sport-work/obligations/sync",
      { method: "POST" },
    );
    setBusy(false);

    if (error) {
      showToast("error", error.message || "Aggiornamento non riuscito");
      return;
    }

    showToast(
      "success",
      `Agenda riallineata: ${data?.created ?? 0} nuovi, ${data?.updated ?? 0} aggiornati, ${data?.closed ?? 0} non piu dovuti.`,
    );
    await load();
  };

  const complete = async (id: string) => {
    setBusy(true);
    const { error } = await apiRequest(
      `/api/v1/sport-work/obligations/${encodeURIComponent(id)}/complete`,
      { method: "POST", body: {} },
    );
    setBusy(false);

    if (error) {
      showToast("error", error.message || "Aggiornamento non riuscito");
      return;
    }

    showToast("success", "Adempimento marcato come assolto");
    await load();
  };

  const aperti = obligations.filter((row) => row.status === "DUE");
  const chiusi = obligations.filter((row) => row.status !== "DUE");

  const renderList = (rows: any[], showAction: boolean) =>
    rows.length === 0 ? (
      <p className="px-6 pb-6 text-sm text-muted-foreground">
        Nessun adempimento in questa vista.
      </p>
    ) : (
      <ul className="divide-y divide-slate-100 dark:divide-gray-700">
        {rows.map((obligation) => {
          const badge = statusBadgeOf(
            obligationStatusBadge,
            obligation.status,
            "DUE",
          );
          return (
            <li
              key={obligation.id}
              className="flex flex-col gap-2 px-6 py-3 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{obligation.title}</p>
                <p className="text-xs text-muted-foreground">
                  {obligationKindLabel(obligation.kind)} ·{" "}
                  {formatDate(obligation.due_date)} ·{" "}
                  {dueLabel(obligation.due_date)}
                </p>
                {obligation.description ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {obligation.description}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {obligation.amount ? (
                  <span className="text-sm tabular-nums">
                    {formatCurrency(obligation.amount)}
                  </span>
                ) : null}
                <Badge variant="outline" className={badge.className}>
                  {badge.label}
                </Badge>
                {showAction && canManage ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => complete(obligation.id)}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Assolto
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    );

  if (loading) {
    return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-300">
        EasyGame prepara i dati dell&apos;adempimento e ricorda la scadenza.{" "}
        <strong>Non trasmette niente</strong>: non al RASD, non a UNILAV, non
        all&apos;INPS, non all&apos;Agenzia delle Entrate. «Assolto» significa
        che una persona lo ha fatto e lo ha dichiarato qui.
      </div>

      <Tabs defaultValue="agenda">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="f24">Dati F24</TabsTrigger>
          <TabsTrigger value="cu">Dati CU</TabsTrigger>
          <TabsTrigger value="storico">Storico</TabsTrigger>
        </TabsList>

        <TabsContent value="agenda">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Adempimenti dovuti</CardTitle>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={sync}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Riallinea agenda
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="p-0">{renderList(aperti, true)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="f24">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Dati per l&apos;F24</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Importi e causali calcolati sulle erogazioni registrate.
                    EasyGame non compila e non invia l&apos;F24.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={String(year)}
                    onValueChange={(value) => setYear(Number(value))}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONFIGURED_RULE_YEARS.map((configured) => (
                        <SelectItem key={configured} value={String(configured)}>
                          {configured}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={f24.length === 0}
                    onClick={() => downloadObligationsCsv(`f24-${year}.csv`, f24)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {!canFiscal ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Questa vista richiede il permesso sui dati fiscali.
                </p>
              ) : f24.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Nessun contributo maturato nel {year}.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="border-b border-slate-200 text-left text-xs uppercase text-muted-foreground dark:border-gray-700">
                      <tr>
                        <th className="px-6 py-2">Periodo</th>
                        <th className="px-6 py-2">Causale</th>
                        <th className="px-6 py-2 text-right">Lavoratore</th>
                        <th className="px-6 py-2 text-right">Club</th>
                        <th className="px-6 py-2 text-right">Totale</th>
                        <th className="px-6 py-2">Versamento entro</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-gray-700">
                      {f24.map((row) => (
                        <tr key={`${row.period}-${row.causale}`}>
                          <td className="px-6 py-2">{row.period}</td>
                          <td className="px-6 py-2 font-mono text-xs">
                            {row.causale}
                          </td>
                          <td className="px-6 py-2 text-right tabular-nums">
                            {formatCurrency(row.employeeContribution)}
                          </td>
                          <td className="px-6 py-2 text-right tabular-nums">
                            {formatCurrency(row.employerContribution)}
                          </td>
                          <td className="px-6 py-2 text-right font-semibold tabular-nums">
                            {formatCurrency(row.total)}
                          </td>
                          <td className="px-6 py-2">{formatDate(row.dueDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cu">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Dati per la Certificazione Unica</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Dataset di appoggio. EasyGame non predispone e non trasmette
                    la CU.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={cu.length === 0}
                  onClick={() => downloadObligationsCsv(`cu-${year}.csv`, cu)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {!canFiscal ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Questa vista richiede il permesso sui dati fiscali.
                </p>
              ) : cu.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Nessun compenso erogato nel {year}.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="border-b border-slate-200 text-left text-xs uppercase text-muted-foreground dark:border-gray-700">
                      <tr>
                        <th className="px-6 py-2">Persona</th>
                        <th className="px-6 py-2">Codice fiscale</th>
                        <th className="px-6 py-2 text-right">Lordo</th>
                        <th className="px-6 py-2 text-right">Esterni</th>
                        <th className="px-6 py-2 text-right">Progressivo</th>
                        <th className="px-6 py-2 text-right">Imponibile fisc.</th>
                        <th className="px-6 py-2">Nota</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-gray-700">
                      {cu.map((row) => (
                        <tr key={row.personId}>
                          <td className="px-6 py-2">{row.personName}</td>
                          <td className="px-6 py-2 font-mono text-xs">
                            {row.fiscalCode || "—"}
                          </td>
                          <td className="px-6 py-2 text-right tabular-nums">
                            {formatCurrency(row.grossPaid)}
                          </td>
                          <td className="px-6 py-2 text-right tabular-nums">
                            {formatCurrency(row.externalDeclared)}
                          </td>
                          <td className="px-6 py-2 text-right tabular-nums">
                            {formatCurrency(row.progressive)}
                          </td>
                          <td className="px-6 py-2 text-right tabular-nums">
                            {formatCurrency(row.taxableFiscal)}
                          </td>
                          <td className="px-6 py-2 text-xs text-amber-700">
                            {row.attentionReason || ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storico">
          <Card>
            <CardHeader>
              <CardTitle>Assolti e non piu dovuti</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Un adempimento non si cancella: e stato dovuto, e la sua storia
                serve a spiegare perche.
              </p>
            </CardHeader>
            <CardContent className="p-0">{renderList(chiusi, false)}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
