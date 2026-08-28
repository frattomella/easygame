"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { CONFIGURED_RULE_YEARS } from "@/lib/sport-work/rules";
import { formatCurrency, formatDate } from "./sport-work-format";
import { DeclarationDialog } from "./DeclarationDialog";

/**
 * La **posizione annua** di una persona verso le soglie.
 *
 * Tre cose la schermata deve dire, e le dice separate.
 *
 * 1. **Quanto il club ha erogato** — questo EasyGame lo sa.
 * 2. **Quanto il lavoratore ha dichiarato di aver percepito altrove** — questo
 *    glielo hanno detto, e la data della dichiarazione sta accanto al numero.
 *    Senza dichiarazione il riquadro lo dice a chiare lettere, perche il
 *    progressivo e strutturalmente parziale e un totale che sembra completo e
 *    peggio di un totale mancante.
 * 3. **Lo scostamento**, quando c'e: quanto i contributi cambierebbero se il
 *    conto si rifacesse oggi. Non e un errore da correggere in automatico —
 *    quei contributi sono gia stati versati su quei numeri — e una differenza
 *    che qualcuno deve sanare.
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

const Row = ({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) => (
  <div className="flex flex-col gap-1 py-2 sm:flex-row sm:items-baseline sm:justify-between">
    <div className="min-w-0">
      <p
        className={
          strong
            ? "text-sm font-semibold text-slate-900 dark:text-slate-100"
            : "text-sm text-slate-600 dark:text-slate-300"
        }
      >
        {label}
      </p>
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
    <p
      className={
        strong
          ? "shrink-0 text-sm font-semibold tabular-nums"
          : "shrink-0 text-sm tabular-nums"
      }
    >
      {value}
    </p>
  </div>
);

export function PersonPositionCard({
  personId,
  canManage = true,
}: {
  personId: string;
  canManage?: boolean;
}) {
  const { showToast } = useToast();
  const [year, setYear] = React.useState(() => {
    const current = new Date().getUTCFullYear();
    return CONFIGURED_RULE_YEARS.includes(current)
      ? current
      : CONFIGURED_RULE_YEARS[0];
  });
  const [detail, setDetail] = React.useState<PositionDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [declarationOpen, setDeclarationOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await apiRequest<PositionDetail>(
      `/api/v1/sport-work/people/${encodeURIComponent(personId)}/position?year=${year}`,
    );
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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Posizione verso le soglie</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Anno solare, per cassa. Non la stagione sportiva.
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
            {canManage ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeclarationOpen(true)}
              >
                Autocertificazione
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : !position ? (
          <p className="text-sm text-muted-foreground">
            Nessuna posizione per questo anno.
          </p>
        ) : (
          <>
            {!position.hasCurrentDeclaration ? (
              <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">
                    Nessuna autocertificazione per il {position.year}
                  </p>
                  <p className="mt-1 text-xs">
                    Le soglie sono del lavoratore, non del committente: questo
                    progressivo comprende solo cio che ha erogato questa
                    societa.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="divide-y divide-slate-100 dark:divide-gray-700">
              <Row
                label="Compensi erogati dal club"
                value={formatCurrency(position.clubGross)}
                hint={`${position.paymentCount} erogazioni${
                  position.lastPaymentAt
                    ? `, ultima il ${formatDate(position.lastPaymentAt)}`
                    : ""
                }`}
              />
              <Row
                label="Compensi esterni dichiarati"
                value={formatCurrency(position.externalDeclared)}
                hint={
                  position.lastDeclarationAt
                    ? `Autocertificazione del ${formatDate(position.lastDeclarationAt)}`
                    : "Nessuna dichiarazione acquisita"
                }
              />
              <Row
                label="Progressivo"
                value={formatCurrency(position.progressive)}
                strong
              />
              <Row
                label="Soglia previdenziale"
                value={formatCurrency(position.socialFranchise)}
                hint={
                  position.socialFranchiseRemaining > 0
                    ? `Residua: ${formatCurrency(position.socialFranchiseRemaining)}`
                    : "Superata"
                }
              />
              <Row
                label="Imponibile previdenziale"
                value={formatCurrency(position.socialTaxable)}
              />
              <Row
                label="Contributi a carico del lavoratore"
                value={formatCurrency(position.employeeContribution)}
              />
              <Row
                label="Contributi a carico del club"
                value={formatCurrency(position.employerContribution)}
              />
              <Row
                label="Soglia fiscale"
                value={formatCurrency(position.fiscalFranchise)}
                hint={
                  position.fiscalFranchiseRemaining > 0
                    ? `Residua: ${formatCurrency(position.fiscalFranchiseRemaining)}`
                    : "Superata"
                }
              />
              <Row
                label="Imponibile fiscale eccedente"
                value={formatCurrency(position.fiscalTaxable)}
                hint={
                  position.fiscalTaxable > 0
                    ? "Trattamento fiscale da verificare: EasyGame non calcola la ritenuta"
                    : undefined
                }
                strong={position.fiscalTaxable > 0}
              />
            </div>

            {drift?.hasDrift ? (
              <div className="space-y-2 rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <p className="font-medium">
                    I contributi calcolati non coincidono con quelli che si
                    calcolerebbero oggi
                  </p>
                </div>
                <p className="text-xs">{drift.reason}</p>
                <div className="grid gap-1 text-xs sm:grid-cols-2">
                  <p>
                    Lavoratore: {formatCurrency(drift.frozenEmployeeContribution)}{" "}
                    → {formatCurrency(drift.recomputedEmployeeContribution)} (
                    {drift.employeeDelta >= 0 ? "+" : ""}
                    {formatCurrency(drift.employeeDelta)})
                  </p>
                  <p>
                    Club: {formatCurrency(drift.frozenEmployerContribution)} →{" "}
                    {formatCurrency(drift.recomputedEmployerContribution)} (
                    {drift.employerDelta >= 0 ? "+" : ""}
                    {formatCurrency(drift.employerDelta)})
                  </p>
                </div>
                <p className="text-xs">
                  EasyGame non riscrive le erogazioni gia registrate: quei
                  contributi sono stati calcolati con cio che il club sapeva
                  allora. La differenza va portata al consulente.
                </p>
              </div>
            ) : null}

            {position.declarationArrivedAfterPayment && !drift?.hasDrift ? (
              <Badge
                variant="outline"
                className="border-blue-200 bg-blue-50 text-blue-700"
              >
                Dichiarazione ricevuta dopo alcune erogazioni
              </Badge>
            ) : null}
          </>
        )}
      </CardContent>

      <DeclarationDialog
        open={declarationOpen}
        onOpenChange={setDeclarationOpen}
        personId={personId}
        defaultYear={year}
        onDone={() => void load()}
      />
    </Card>
  );
}
