"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Landmark, Wallet } from "lucide-react";
import { KpiBar, KpiCard, InfoCard, SummaryCard } from "@/components/web/page/Cards";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Button } from "@/components/web/primitives/Button";
import { Skeleton } from "@/components/web/primitives/Controls";
import { Eyebrow } from "@/components/web/primitives/Surface";
import {
  formatCents,
  type AccountingReportView,
  type FinancialAccountView,
} from "./accounting-view";

/**
 * I riquadri in testa alla prima nota (Web V2, guideline 09 §9.1 pattern 10 e
 * §9.3 «Finance summary»).
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
 * 1. **finanziaria** — una barra di KPI: la liquidita per conto e i movimenti
 *    per cassa del periodo;
 * 2. **economica** — una `SummaryCard` **tratteggiata** (piano 0): crediti e
 *    debiti, residuo delle rate, contributi attesi, compensi maturati e non
 *    pagati. Il tratteggio non e decorazione: e la separazione fra le due
 *    grandezze, perche un credito verso una famiglia non e denaro in cassa.
 *
 * ## Nessun numero nasce qui
 *
 * **Tutti** arrivano da `GET /api/v1/accounting/reports`, che li somma sulle
 * righe gia filtrate dal server e prende crediti e debiti dai loro
 * proprietari: il registro delle rate, i bandi, il lavoro sportivo. Questo
 * componente non ha una sola addizione, e non deve averne: sommare la pagina
 * che l'elenco mostra darebbe il totale di cento righe spacciato per totale
 * del periodo. L'unica somma ammessa e quella dei saldi gia calcolati dal
 * server, e si vede perche e sola.
 *
 * ## Nessun saldo a zero per chi non puo vederlo
 *
 * Chi non ha `accounting.accounts_read` riceve `accountBalances: null` e legge
 * una frase che dice perche, non un `0,00` che sembra un club senza soldi. E
 * il difetto misurato al §30: la pagina inghiottiva il 403 e mostrava tutto a
 * zero.
 */

const SummarySkeleton = () => (
  <section className="flex flex-col gap-4" aria-busy aria-label="Calcolo del riepilogo...">
    <Skeleton className="h-3 w-40" />
    <KpiBar>
      {Array.from({ length: 4 }).map((_, index) => (
        <KpiCard key={index} label={<Skeleton className="h-2.5 w-24" />} value={null} loading />
      ))}
    </KpiBar>
    <Skeleton className="h-[168px] w-full rounded-egw-panel" />
    <span className="sr-only">Calcolo del riepilogo...</span>
  </section>
);

const EconomicLabel = ({ label, source }: { label: string; source: string }) => (
  <span className="flex flex-col gap-0.5">
    <span className="font-medium text-egw-ink">{label}</span>
    <span className="text-[11px] text-egw-ink-42">{source}</span>
  </span>
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
  if (loading) {
    return <SummarySkeleton />;
  }

  if (!report) {
    return (
      <AlertBlock severity="warning" title="Riepilogo non disponibile: la lettura non e riuscita.">
        La prima nota qui sotto resta leggibile; i totali del periodo e i saldi dei conti no.
      </AlertBlock>
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
    <section className="flex flex-col gap-4" data-test="accounting-summary">
      {/* ── Situazione finanziaria: denaro davvero movimentato, per cassa ── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <Eyebrow as="h2">Situazione finanziaria</Eyebrow>
          <span className="font-brand text-[11.5px] text-egw-ink-62">
            denaro davvero movimentato, per cassa
          </span>
        </div>

        {saldi ? (
          <KpiBar>
            <KpiCard
              label="Liquidità totale"
              value={formatCents(liquiditaCents)}
              qualifier={
                saldi.length
                  ? `${saldi.length === 1 ? "un conto" : `${saldi.length} conti`} · saldo derivato dai movimenti, mai digitato`
                  : "Saldo derivato dai movimenti, mai digitato."
              }
              icon={<Wallet />}
              iconTone="blue"
            />

            {saldi.map((saldo) => {
              const conto = nomePerConto.get(saldo.accountId);
              const negativo = Number(saldo.balanceCents) < 0;
              return (
                <KpiCard
                  key={saldo.accountId}
                  label={conto?.name || "Conto"}
                  value={
                    <span className={negativo ? "text-egw-red" : undefined}>
                      {formatCents(saldo.balanceCents)}
                    </span>
                  }
                  qualifier={conto?.kindLabel || "Conto finanziario"}
                  icon={<Landmark />}
                  iconTone="neutral"
                />
              );
            })}

            {saldi.length === 0 ? (
              <InfoCard eyebrow="Nessun conto finanziario configurato">
                Senza un conto un movimento non puo dire dove il denaro si e mosso.
              </InfoCard>
            ) : null}
          </KpiBar>
        ) : (
          <InfoCard eyebrow="I saldi dei conti non sono visibili">
            Vedere i conti correnti e i loro saldi e riservato a proprietario e
            gestore, come gli estremi bancari. La prima nota qui sotto resta
            completa: quello che manca e il saldo, non i movimenti.
          </InfoCard>
        )}

        <KpiBar>
          <KpiCard
            label="Entrate del periodo"
            value={<span className="text-egw-green">{formatCents(report.cash.collectedCents)}</span>}
            qualifier="Incassato per cassa nel periodo filtrato."
            icon={<ArrowUp />}
            iconTone="green"
          />
          <KpiCard
            label="Uscite del periodo"
            value={<span className="text-egw-red">{formatCents(report.cash.paidCents)}</span>}
            qualifier="Pagato per cassa nel periodo filtrato."
            icon={<ArrowDown />}
            iconTone="red"
          />
          <KpiCard
            label="Differenza di cassa"
            value={formatCents(report.cash.netCents)}
            qualifier={
              report.cash.transferCount
                ? `${report.cash.transferCount} gambe di giroconto escluse: cambiano conto, non cassa.`
                : "Giroconti e storni esclusi."
            }
          />
        </KpiBar>

        {filtersBeyondSummary ? (
          <AlertBlock severity="warning" title="I totali non seguono tutti i filtri dell'elenco">
            L&apos;elenco e ristretto anche per origine, stato di riconciliazione o
            ricerca: i totali qui sopra seguono solo il periodo, il conto, la
            causale, la sede e il verso.
          </AlertBlock>
        ) : null}

        {report.truncated ? (
          <AlertBlock severity="warning" title="La lettura si e fermata prima della fine dell'insieme">
            Restringi il periodo perche i totali lo coprano tutto.
          </AlertBlock>
        ) : null}
      </div>

      {/* ── Situazione economica: crediti e debiti, mai sommati alla cassa ── */}
      <SummaryCard
        dashed
        eyebrow="Situazione economica"
        title="Crediti e debiti: maturati, non ancora denaro — e riguardano il club intero, non il periodo filtrato"
        rows={[
          {
            label: (
              <EconomicLabel
                label="Crediti verso le famiglie"
                source={
                  report.accrual.overdueCount
                    ? `Di cui scaduti ${formatCents(report.accrual.overdueReceivablesCents)} su ${report.accrual.overdueCount} rate. Fonte: il registro delle rate.`
                    : "Fonte: il registro delle rate."
                }
              />
            ),
            value: formatCents(report.accrual.familyReceivablesCents),
            tone: report.accrual.overdueCount ? "amber" : "ink",
          },
          {
            label: (
              <EconomicLabel
                label="Contributi da ricevere"
                source="Maturato e non ancora liquidato dagli enti. Fonte: i bandi."
              />
            ),
            value: formatCents(report.accrual.fundingPendingCents),
          },
          {
            label: (
              <EconomicLabel
                label="Compensi da pagare"
                source="Maturato e non ancora erogato. Fonte: il lavoro sportivo."
              />
            ),
            value: formatCents(report.accrual.sportWorkAccruedUnpaidCents),
          },
        ]}
        footer={
          <>
            <Button variant="text" size="sm" asChild>
              <Link href="/reports">Riepilogo gestionale completo</Link>
            </Button>
            <Button variant="text" size="sm" asChild>
              <Link href="/sport-work/compensations">Compensi</Link>
            </Button>
          </>
        }
      />

      {/*
        Il disclaimer viaggia con i numeri, e non e formalita: una superficie
        che li mostra senza la riga che li qualifica trasforma un promemoria
        interno in cio che il committente ha vietato di far credere.
      */}
      <p className="font-brand text-[11.5px] leading-[1.5] text-egw-ink-62">{report.disclaimer}</p>
    </section>
  );
}
