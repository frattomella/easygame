"use client";

import * as React from "react";
import { FileText } from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { Button } from "@/components/web/primitives/Button";
import { Skeleton } from "@/components/web/primitives/Controls";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { Select } from "@/components/web/forms/Field";
import { AlertBlock } from "@/components/web/page/Alerts";
import { InfoCard, type SummaryRow } from "@/components/web/page/Cards";
import { formatDateShort, formatInteger, formatMoney, MISSING } from "@/lib/web/format";
import { CONFIGURED_RULE_YEARS } from "@/lib/sport-work/rules";
import { DeclarationDrawer } from "@/components/sport-work/v2/declaration-drawer";
import { defaultRuleYear } from "@/components/sport-work/v2/sport-work-model";
import { cn } from "@/lib/utils";

/**
 * La **posizione annua** di una persona verso le soglie (Web V2).
 *
 * Tre cose la schermata deve dire, e le dice separate: quanto il club ha
 * erogato (lo sa EasyGame), quanto il lavoratore ha dichiarato di aver
 * percepito altrove (glielo hanno detto, con la data accanto), e lo
 * scostamento fra i contributi calcolati allora e quelli che si
 * calcolerebbero oggi — che non e un errore da correggere in automatico, e
 * una differenza che qualcuno deve sanare.
 *
 * Stessa lettura della V1: `GET /api/v1/sport-work/people/{id}/position?year=`.
 */
type PositionDetail = {
  position: {
    year: number;
    clubGross: number;
    externalDeclared: number;
    progressive: number;
    socialFranchise: number;
    socialFranchiseRemaining: number;
    socialTaxable: number;
    employeeContribution: number;
    employerContribution: number;
    fiscalFranchise: number;
    fiscalFranchiseRemaining: number;
    fiscalTaxable: number;
    paymentCount: number;
    lastPaymentAt: string | null;
    lastDeclarationAt: string | null;
    hasCurrentDeclaration: boolean;
    declarationArrivedAfterPayment: boolean;
  };
  drift: {
    hasDrift: boolean;
    employeeDelta: number;
    employerDelta: number;
    frozenEmployeeContribution: number;
    frozenEmployerContribution: number;
    recomputedEmployeeContribution: number;
    recomputedEmployerContribution: number;
    reason: string | null;
  } | null;
};

type PositionRow = SummaryRow & { hint?: React.ReactNode };

const signed = (value: number) => `${value >= 0 ? "+" : ""}${formatMoney(value)}`;

export function PositionSection({ personId, canManage }: { personId: string; canManage: boolean }) {
  const { showToast } = useToast();
  const [year, setYear] = React.useState(() => defaultRuleYear());
  const [detail, setDetail] = React.useState<PositionDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [declarationOpen, setDeclarationOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await apiRequest<PositionDetail>(`/api/v1/sport-work/people/${encodeURIComponent(personId)}/position?year=${year}`);
    setLoading(false);
    if (error) {
      showToast("error", error.message || "Errore nella lettura della posizione");
      return;
    }
    setDetail(data);
  }, [personId, year, showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const position = detail?.position;
  const drift = detail?.drift;

  const rows: PositionRow[] = position
    ? [
        {
          label: "Compensi erogati dal club",
          value: formatMoney(position.clubGross),
          hint: `${formatInteger(position.paymentCount)} erogazioni${position.lastPaymentAt ? `, ultima il ${formatDateShort(position.lastPaymentAt)}` : ""}`,
        },
        {
          label: "Compensi esterni dichiarati",
          value: formatMoney(position.externalDeclared),
          hint: position.lastDeclarationAt ? `Autocertificazione del ${formatDateShort(position.lastDeclarationAt)}` : "Nessuna dichiarazione acquisita",
        },
        { label: "Progressivo", value: formatMoney(position.progressive), emphasis: true },
        {
          label: "Soglia previdenziale",
          value: formatMoney(position.socialFranchise),
          hint: position.socialFranchiseRemaining > 0 ? `Residua: ${formatMoney(position.socialFranchiseRemaining)}` : "Superata",
          tone: position.socialFranchiseRemaining > 0 ? "ink" : "amber",
        },
        { label: "Imponibile previdenziale", value: formatMoney(position.socialTaxable) },
        { label: "Contributi a carico del lavoratore", value: formatMoney(position.employeeContribution) },
        { label: "Contributi a carico del club", value: formatMoney(position.employerContribution) },
        {
          label: "Soglia fiscale",
          value: formatMoney(position.fiscalFranchise),
          hint: position.fiscalFranchiseRemaining > 0 ? `Residua: ${formatMoney(position.fiscalFranchiseRemaining)}` : "Superata",
          tone: position.fiscalFranchiseRemaining > 0 ? "ink" : "amber",
        },
        {
          label: "Imponibile fiscale eccedente",
          value: formatMoney(position.fiscalTaxable),
          hint: position.fiscalTaxable > 0 ? "Trattamento fiscale da verificare: EasyGame non calcola la ritenuta" : undefined,
          emphasis: position.fiscalTaxable > 0,
          tone: position.fiscalTaxable > 0 ? "amber" : "ink",
        },
      ]
    : [];

  return (
    <>
      <Panel as="section">
        <PanelHeader
          eyebrow="Posizione"
          title="Posizione verso le soglie"
          description="Anno solare, per cassa. Non la stagione sportiva."
          actions={
            <>
              <Select
                aria-label="Anno di regole"
                value={String(year)}
                onValueChange={(value) => setYear(Number(value))}
                options={CONFIGURED_RULE_YEARS.map((configured) => ({ value: String(configured), label: String(configured) }))}
                className="w-[104px]"
              />
              {canManage ? (
                <Button variant="secondary" size="sm" icon={<FileText />} onClick={() => setDeclarationOpen(true)}>
                  Autocertificazione
                </Button>
              ) : null}
            </>
          }
        />

        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-5 w-full" />
            ))}
          </div>
        ) : !position ? (
          <p className="font-brand text-[12.5px] text-egw-ink-62">Nessuna posizione per questo anno.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {!position.hasCurrentDeclaration ? (
              <AlertBlock
                severity="warning"
                title={`Nessuna autocertificazione per il ${position.year}`}
                actions={
                  canManage ? (
                    <Button variant="secondary" size="xs" onClick={() => setDeclarationOpen(true)}>
                      Registra autocertificazione
                    </Button>
                  ) : null
                }
              >
                Le soglie sono del lavoratore, non del committente: questo progressivo comprende solo ciò che ha erogato questa società.
              </AlertBlock>
            ) : null}

            <dl>
              {rows.map((row, index) => (
                <div key={index} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-dashed border-egw-hairline py-2.5 last:border-0">
                  <dt className="min-w-0 font-brand">
                    <span className={cn("block text-[12.5px]", row.emphasis ? "font-semibold text-egw-ink" : "text-egw-ink-72")}>{row.label}</span>
                    {row.hint ? <span className="block text-[11px] text-egw-ink-62">{row.hint}</span> : null}
                  </dt>
                  <dd
                    className={cn(
                      "egw-num shrink-0 font-brand",
                      row.emphasis ? "text-[15px] font-extrabold" : "text-[13px] font-bold",
                      row.tone === "amber" ? "text-egw-amber-ink" : row.tone === "green" ? "text-egw-green" : row.tone === "red" ? "text-egw-red" : "text-egw-ink",
                    )}
                  >
                    {row.value ?? MISSING}
                  </dd>
                </div>
              ))}
            </dl>

            {drift?.hasDrift ? (
              <AlertBlock severity="warning" title="I contributi calcolati non coincidono con quelli che si calcolerebbero oggi">
                {drift.reason ? <p>{drift.reason}</p> : null}
                <p className="egw-num mt-1">
                  Lavoratore: {formatMoney(drift.frozenEmployeeContribution)} → {formatMoney(drift.recomputedEmployeeContribution)} ({signed(drift.employeeDelta)})
                </p>
                <p className="egw-num">
                  Club: {formatMoney(drift.frozenEmployerContribution)} → {formatMoney(drift.recomputedEmployerContribution)} ({signed(drift.employerDelta)})
                </p>
                <p className="mt-1">EasyGame non riscrive le erogazioni già registrate: quei contributi sono stati calcolati con ciò che il club sapeva allora. La differenza va portata al consulente.</p>
              </AlertBlock>
            ) : null}

            {position.declarationArrivedAfterPayment && !drift?.hasDrift ? (
              <AlertBlock severity="info" title="Dichiarazione ricevuta dopo alcune erogazioni">
                Le erogazioni registrate prima della dichiarazione sono state calcolate senza i compensi esterni.
              </AlertBlock>
            ) : null}

            <InfoCard eyebrow="Come leggere">
              Erogato dal club e dichiarato esterno restano due numeri distinti: il progressivo li somma per confrontarli con le soglie dell&apos;anno.
            </InfoCard>
          </div>
        )}
      </Panel>

      <DeclarationDrawer open={declarationOpen} onOpenChange={setDeclarationOpen} personId={personId} defaultYear={year} onDone={() => void load()} />
    </>
  );
}
