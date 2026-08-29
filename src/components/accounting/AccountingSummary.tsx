"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Landmark, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatCents,
  type AccountingReportView,
  type FinancialAccountView,
} from "./accounting-view";

/**
 * I riquadri in testa alla prima nota.
 *
 * ---
 *
 * ## La regola del §28, applicata alla lettera
 *
 * Ogni riquadro dichiara la sua grandezza, e **cassa e crediti non stanno mai
 * nella stessa riga di totali**. La pagina precedente li mescolava — «Entrate»
 * con sotto «Previste» — e produceva un numero che nessuno sapeva se fosse
 * denaro incassato o denaro atteso; il rendiconto chiamava «Pagato» lo stesso
 * numero con un perimetro diverso, senza che nessuna delle due pagine
 * dichiarasse il rapporto fra i due.
 *
 * Qui ci sono due fasce, separate da un titolo e da un bordo:
 *
 * 1. **finanziaria** — la liquidita per conto e i movimenti per cassa del
 *    periodo;
 * 2. **economica** — crediti e debiti: residuo delle rate, contributi attesi,
 *    compensi maturati e non pagati.
 *
 * ## Nessun numero nasce qui
 *
 * **Tutti** arrivano da `GET /api/v1/accounting/reports`, che li somma sulle
 * righe gia filtrate dal server e prende crediti e debiti dai loro
 * proprietari: il registro delle rate, i bandi, il lavoro sportivo. Questo
 * componente non ha una sola addizione, e non deve averne: sommare la pagina
 * che l'elenco mostra darebbe il totale di cento righe spacciato per totale
 * del periodo.
 *
 * ## Nessun saldo a zero per chi non puo vederlo
 *
 * Chi non ha `accounting.accounts_read` riceve `accountBalances: null` e legge
 * una frase che dice perche, non un `0,00` che sembra un club senza soldi. E
 * il difetto misurato al §30: la pagina inghiottiva il 403 e mostrava tutto a
 * zero.
 */

const Riquadro = ({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "in" | "out" | "neutral";
  icon?: React.ReactNode;
}) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {icon}
      </div>
      <p
        className={cn(
          "mt-1 text-xl font-bold",
          tone === "in"
            ? "text-green-600"
            : tone === "out"
              ? "text-red-600"
              : "text-slate-900",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </CardContent>
  </Card>
);

export function AccountingSummary({
  accounts,
  report,
  loading,
  filtersBeyondSummary,
}: {
  accounts: readonly FinancialAccountView[];
  report: AccountingReportView | null;
  loading: boolean;
  /** Vero se l'elenco e ristretto da un filtro che il riepilogo non applica. */
  filtersBeyondSummary: boolean;
}) {
  if (loading || !report) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        {loading
          ? "Calcolo del riepilogo..."
          : "Riepilogo non disponibile: la lettura non e riuscita."}
      </div>
    );
  }

  const saldi = report.accountBalances;
  const nomePerConto = new Map(
    accounts.map((account) => [account.id, account]),
  );
  const liquiditaCents = (saldi || []).reduce(
    (somma, saldo) => somma + (Number(saldo.balanceCents) || 0),
    0,
  );

  return (
    <section className="space-y-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Situazione finanziaria
          </h2>
          <span className="text-xs text-slate-500">
            denaro davvero movimentato, per cassa
          </span>
        </div>

        {saldi ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-blue-200 bg-blue-50/60">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-blue-700">
                  Liquidita totale
                </p>
                <p className="mt-1 text-2xl font-bold text-blue-700">
                  {formatCents(liquiditaCents)}
                </p>
                <p className="mt-1 text-xs text-blue-700/80">
                  Saldo derivato dai movimenti, mai digitato.
                </p>
              </CardContent>
            </Card>

            {saldi.map((saldo) => (
              <Card key={saldo.accountId}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">
                        {nomePerConto.get(saldo.accountId)?.name || "Conto"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {nomePerConto.get(saldo.accountId)?.kindLabel || ""}
                      </p>
                    </div>
                    <Landmark
                      className="h-4 w-4 shrink-0 text-slate-400"
                      aria-hidden
                    />
                  </div>
                  <p
                    className={cn(
                      "mt-2 text-xl font-bold",
                      Number(saldo.balanceCents) < 0
                        ? "text-red-600"
                        : "text-slate-900",
                    )}
                  >
                    {formatCents(saldo.balanceCents)}
                  </p>
                </CardContent>
              </Card>
            ))}

            {saldi.length === 0 ? (
              <Card className="sm:col-span-2 xl:col-span-3">
                <CardContent className="p-4 text-sm text-slate-600">
                  Nessun conto finanziario configurato. Senza un conto un
                  movimento non puo dire dove il denaro si e mosso.
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : (
          <Card className="border-slate-200 bg-slate-50">
            <CardContent className="flex items-start gap-3 p-4">
              <Lock
                className="mt-0.5 h-4 w-4 shrink-0 text-slate-500"
                aria-hidden
              />
              <div className="text-sm text-slate-700">
                <p className="font-medium">I saldi dei conti non sono visibili</p>
                <p className="mt-1 text-slate-600">
                  Vedere i conti correnti e i loro saldi e riservato a
                  proprietario e gestore, come gli estremi bancari. La prima
                  nota qui sotto resta completa: quello che manca e il saldo,
                  non i movimenti.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Riquadro
            label="Entrate del periodo"
            value={formatCents(report.cash.collectedCents)}
            tone="in"
            icon={<ArrowUp className="h-4 w-4 shrink-0 text-green-600" aria-hidden />}
          />
          <Riquadro
            label="Uscite del periodo"
            value={formatCents(report.cash.paidCents)}
            tone="out"
            icon={<ArrowDown className="h-4 w-4 shrink-0 text-red-600" aria-hidden />}
          />
          <Riquadro
            label="Differenza di cassa"
            value={formatCents(report.cash.netCents)}
            hint={
              report.cash.transferCount
                ? `${report.cash.transferCount} gambe di giroconto escluse: cambiano conto, non cassa.`
                : "Giroconti e storni esclusi."
            }
          />
        </div>

        {filtersBeyondSummary ? (
          <p className="text-xs text-amber-700">
            L&apos;elenco e ristretto anche per origine, stato di
            riconciliazione o ricerca: i totali qui sopra seguono solo il
            periodo, il conto, la causale, la sede e il verso.
          </p>
        ) : null}

        {report.truncated ? (
          <p className="text-xs text-amber-700">
            La lettura si e fermata prima della fine dell&apos;insieme: restringi
            il periodo perche i totali lo coprano tutto.
          </p>
        ) : null}
      </div>

      {/*
        Il bordo non e decorazione: e la separazione fra le due grandezze. Un
        credito verso una famiglia non e denaro in cassa, e affiancarlo a un
        saldo su una riga di totali e cio che fa credere a un club di avere
        soldi che non ha ancora incassato.
      */}
      <div className="space-y-3 rounded-lg border border-dashed border-slate-300 bg-white p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Situazione economica
          </h2>
          <span className="text-xs text-slate-500">
            crediti e debiti: maturati, non ancora denaro — e riguardano il club
            intero, non il periodo filtrato
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Riquadro
            label="Crediti verso le famiglie"
            value={formatCents(report.accrual.familyReceivablesCents)}
            hint={
              report.accrual.overdueCount
                ? `Di cui scaduti ${formatCents(
                    report.accrual.overdueReceivablesCents,
                  )} su ${report.accrual.overdueCount} rate. Fonte: il registro delle rate.`
                : "Fonte: il registro delle rate."
            }
          />
          <Riquadro
            label="Contributi da ricevere"
            value={formatCents(report.accrual.fundingPendingCents)}
            hint="Maturato e non ancora liquidato dagli enti. Fonte: i bandi."
          />
          <Riquadro
            label="Compensi da pagare"
            value={formatCents(report.accrual.sportWorkAccruedUnpaidCents)}
            hint="Maturato e non ancora erogato. Fonte: il lavoro sportivo."
          />
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            className="font-medium text-blue-600 underline-offset-2 hover:underline"
            href="/reports"
          >
            Riepilogo gestionale completo
          </Link>
          <Link
            className="font-medium text-blue-600 underline-offset-2 hover:underline"
            href="/sport-work/compensations"
          >
            Compensi
          </Link>
        </div>
      </div>

      {/*
        Il disclaimer viaggia con i numeri, e non e formalita: una superficie
        che li mostra senza la riga che li qualifica trasforma un promemoria
        interno in cio che il committente ha vietato di far credere.
      */}
      <p className="text-xs text-slate-500">{report.disclaimer}</p>
    </section>
  );
}
