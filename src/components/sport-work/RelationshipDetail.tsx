"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest, readStoredActiveClub } from "@/lib/api/client";
import { hasSportWorkPermission } from "@/lib/sport-work/permissions";
import {
  listRelationshipTransitions,
  RELATIONSHIP_STATUS_LABELS,
  type RelationshipStatus,
} from "@/lib/sport-work/model";
import { summarizePlanProgress } from "@/lib/sport-work/plan";
import { CompensationPlanEditor } from "./CompensationPlanEditor";
import { PayoutDialog } from "./PayoutDialog";
import { PersonPositionCard } from "./PersonPositionCard";
import { SportWorkStat } from "./SportWorkShell";
import {
  dueLabel,
  formatCurrency,
  formatDate,
  installmentStatusBadge,
  relationshipStatusBadge,
  relationshipTypeLabel,
  roleLabel,
  statusBadgeOf,
} from "./sport-work-format";

/**
 * La scheda di un rapporto di lavoro sportivo.
 *
 * Quattro schede, una per domanda:
 *
 * - **Rapporto** — chi, cosa, per quanto, e cosa manca per attivarlo;
 * - **Compensi** — il piano e le sue scadenze, con programmato, maturato e
 *   pagato in tre colonne diverse;
 * - **Posizione** — dove sta la persona rispetto alle soglie dell'anno;
 * - **Registro** — le uscite gia registrate, storni compresi.
 *
 * **Cosa manca per attivare si dice, non si nasconde.** Il pulsante «Attiva»
 * resta visibile e la lista dei blocchi sta accanto: una segreteria che vede
 * «manca il contratto» risolve in due minuti, una che vede un pulsante grigio
 * chiama l'assistenza.
 */

type Detail = {
  relationship: any;
  person: any;
  plan: any | null;
  installments: any[];
  transactions: any[];
  activationBlockers: string[];
};

export function RelationshipDetail({
  relationshipId,
  clubId,
}: {
  relationshipId: string;
  clubId: string | null;
}) {
  const { showToast } = useToast();
  const router = useRouter();
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [role, setRole] = React.useState<string | null>(null);
  const [payoutTarget, setPayoutTarget] = React.useState<string | null>(null);
  const [reversing, setReversing] = React.useState<any | null>(null);
  const [reverseReason, setReverseReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setRole(readStoredActiveClub()?.role || null);
  }, []);

  const canManage = hasSportWorkPermission(role, "sport_work.manage");
  const canPay = hasSportWorkPermission(role, "sport_work.pay");

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await apiRequest<Detail>(
      `/api/v1/sport-work/relationships/${encodeURIComponent(relationshipId)}?view=detail`,
    );
    setLoading(false);

    if (error || !data) {
      showToast("error", error?.message || "Rapporto non trovato");
      return;
    }
    setDetail(data);
  }, [relationshipId, showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async (status: RelationshipStatus) => {
    const reason =
      status === "TERMINATED"
        ? window.prompt("Motivo della cessazione") || ""
        : "";

    if (status === "TERMINATED" && !reason.trim()) {
      showToast("error", "La cessazione richiede un motivo");
      return;
    }

    setBusy(true);
    const { error } = await apiRequest(
      `/api/v1/sport-work/relationships/${encodeURIComponent(relationshipId)}/status`,
      { method: "POST", body: { status, reason } },
    );
    setBusy(false);

    if (error) {
      showToast("error", error.message || "Cambio di stato non riuscito");
      return;
    }

    showToast("success", `Rapporto ${RELATIONSHIP_STATUS_LABELS[status].toLowerCase()}`);
    await load();
  };

  const handleReverse = async () => {
    if (!reversing) return;
    if (!reverseReason.trim()) {
      showToast("error", "Lo storno richiede un motivo");
      return;
    }

    setBusy(true);
    const { error } = await apiRequest(
      `/api/v1/sport-work/payouts/${encodeURIComponent(reversing.id)}/reverse`,
      { method: "POST", body: { reason: reverseReason } },
    );
    setBusy(false);

    if (error) {
      showToast("error", error.message || "Storno non riuscito");
      return;
    }

    showToast("success", "Erogazione stornata");
    setReversing(null);
    setReverseReason("");
    await load();
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  }

  if (!detail) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Rapporto non trovato.
        </CardContent>
      </Card>
    );
  }

  const { relationship, person, plan, installments, transactions } = detail;
  const status = String(relationship.status) as RelationshipStatus;
  const badge = statusBadgeOf(relationshipStatusBadge, status, "DRAFT");
  const progress = summarizePlanProgress(installments);
  const transitions = listRelationshipTransitions(status);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start sm:w-auto"
          onClick={() =>
            router.push(
              clubId
                ? `/sport-work/relationships?clubId=${encodeURIComponent(clubId)}`
                : "/sport-work/relationships",
            )
          }
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tutti i rapporti
        </Button>

        <div className="flex flex-wrap gap-2">
          {canManage
            ? transitions.map((next) => (
                <Button
                  key={next}
                  size="sm"
                  variant={next === "ACTIVE" ? "default" : "outline"}
                  disabled={busy}
                  onClick={() => changeStatus(next)}
                >
                  {next === "ACTIVE"
                    ? "Attiva"
                    : next === "SUSPENDED"
                      ? "Sospendi"
                      : "Cessa"}
                </Button>
              ))
            : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="truncate">
                {person.first_name} {person.last_name}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {roleLabel(relationship.role)} ·{" "}
                {relationshipTypeLabel(relationship.relationship_type)} ·{" "}
                {formatDate(relationship.start_date)}
                {relationship.end_date
                  ? ` — ${formatDate(relationship.end_date)}`
                  : ""}
              </p>
            </div>
            <Badge variant="outline" className={badge.className}>
              {badge.label}
            </Badge>
          </div>
        </CardHeader>

        {detail.activationBlockers.length > 0 && status === "DRAFT" ? (
          <CardContent>
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Per attivare questo rapporto manca:</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {detail.activationBlockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SportWorkStat
          label="Programmato"
          value={formatCurrency(progress.scheduled)}
        />
        <SportWorkStat
          label="Maturato"
          value={formatCurrency(progress.accrued)}
        />
        <SportWorkStat
          label="Erogato"
          value={formatCurrency(progress.paid)}
          tone="positive"
        />
        <SportWorkStat
          label="Maturato non erogato"
          value={formatCurrency(progress.accruedUnpaid)}
          hint="Il debito della societa verso questa persona"
          tone={progress.accruedUnpaid > 0 ? "warning" : "default"}
        />
      </div>

      <Tabs defaultValue="compensi">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="compensi">Compensi</TabsTrigger>
          <TabsTrigger value="posizione">Posizione</TabsTrigger>
          <TabsTrigger value="registro">Registro</TabsTrigger>
          <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
        </TabsList>

        <TabsContent value="compensi" className="space-y-4">
          <CompensationPlanEditor
            relationshipId={relationshipId}
            plan={plan}
            installments={installments}
            canManage={canManage}
            onSaved={() => void load()}
          />

          {installments.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Scadenze</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-slate-100 dark:divide-gray-700">
                  {installments.map((installment) => {
                    const installmentBadge = statusBadgeOf(
                      installmentStatusBadge,
                      installment.status,
                      "SCHEDULED",
                    );
                    const residual = Number(installment.remaining_amount) || 0;

                    return (
                      <li
                        key={installment.id}
                        className="flex flex-col gap-2 px-6 py-3 lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {installment.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(installment.due_date)} ·{" "}
                            {dueLabel(installment.due_date)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <div className="text-xs text-muted-foreground">
                            <span className="tabular-nums">
                              {formatCurrency(installment.gross_amount)}
                            </span>
                            {" lordo · "}
                            <span className="tabular-nums">
                              {formatCurrency(installment.paid_amount)}
                            </span>
                            {" erogato · "}
                            <span className="tabular-nums">
                              {formatCurrency(residual)}
                            </span>
                            {" residuo"}
                          </div>
                          <Badge
                            variant="outline"
                            className={installmentBadge.className}
                          >
                            {installmentBadge.label}
                          </Badge>
                          {canPay && residual > 0 && !installment.cancelled ? (
                            <Button
                              size="sm"
                              onClick={() => setPayoutTarget(installment.id)}
                            >
                              <Wallet className="mr-2 h-4 w-4" />
                              Eroga
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="posizione">
          <PersonPositionCard personId={person.id} canManage={canManage} />
        </TabsContent>

        <TabsContent value="registro">
          <Card>
            <CardHeader>
              <CardTitle>Registro in uscita</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Append-only: correggere significa stornare, e lo storno resta
                accanto all&apos;originale.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {transactions.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Nessuna erogazione registrata.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-gray-700">
                  {transactions.map((transaction) => (
                    <li
                      key={transaction.id}
                      className="flex flex-col gap-2 px-6 py-3 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {formatCurrency(transaction.gross_amount)}
                          {transaction.reversed_at ? (
                            <span className="ml-2 text-xs font-normal text-rose-600">
                              stornata
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(transaction.paid_at)} · anno fiscale{" "}
                          {transaction.fiscal_year}
                          {transaction.rules_version
                            ? ` · regole ${transaction.rules_version}`
                            : ""}
                          {transaction.reversal_reason
                            ? ` · ${transaction.reversal_reason}`
                            : ""}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          lavoratore{" "}
                          {formatCurrency(transaction.employee_contribution)} ·
                          club {formatCurrency(transaction.employer_contribution)}
                        </span>
                        {transaction.fiscal_treatment === "TO_VERIFY" ? (
                          <Badge
                            variant="outline"
                            className="border-amber-200 bg-amber-50 text-amber-700"
                          >
                            Fiscale da verificare
                          </Badge>
                        ) : null}
                        {canPay &&
                        !transaction.reversed_at &&
                        transaction.transaction_type ===
                          "COMPENSATION_PAYMENT" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReversing(transaction)}
                          >
                            <RotateCcw className="mr-2 h-3.5 w-3.5" />
                            Storna
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="anagrafica">
          <Card>
            <CardHeader>
              <CardTitle>Anagrafica</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {[
                ["Codice fiscale", person.fiscal_code || "—"],
                ["Email", person.email || "—"],
                ["Telefono", person.phone || "—"],
                ["Data di nascita", formatDate(person.birth_date)],
                ["Partita IVA", person.vat_number || "—"],
                ["IBAN", person.iban || "—"],
                [
                  "Importo pattuito",
                  relationship.contract_amount
                    ? formatCurrency(relationship.contract_amount)
                    : "—",
                ],
                [
                  "Ore settimanali",
                  relationship.weekly_hours
                    ? String(relationship.weekly_hours)
                    : "—",
                ],
                ["Stato RASD", relationship.rasd_status || "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PayoutDialog
        open={Boolean(payoutTarget)}
        onOpenChange={(open) => !open && setPayoutTarget(null)}
        installmentId={payoutTarget}
        onDone={() => void load()}
      />

      <Dialog
        open={Boolean(reversing)}
        onOpenChange={(open) => !open && setReversing(null)}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Storna l&apos;erogazione</DialogTitle>
            <DialogDescription>
              La riga originale resta nel registro, marcata, con il motivo. Una
              riga di segno opposto la compensa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="reverse-reason">Motivo</Label>
            <Input
              id="reverse-reason"
              value={reverseReason}
              onChange={(event) => setReverseReason(event.target.value)}
              placeholder="Erogazione registrata per errore"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setReversing(null)}
              className="w-full sm:w-auto"
            >
              Annulla
            </Button>
            <Button
              onClick={handleReverse}
              disabled={busy}
              className="w-full sm:w-auto"
            >
              Storna
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
