"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Plus, Wallet } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest, readStoredActiveClub } from "@/lib/api/client";
import { hasSportWorkPermission } from "@/lib/sport-work/permissions";
import {
  BONUS_FISCAL_TREATMENTS,
  BONUS_FISCAL_TREATMENT_LABELS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  OUTBOUND_TRANSACTION_TYPE_LABELS,
  REIMBURSEMENT_STATUS_LABELS,
} from "@/lib/sport-work/model";
import { PayoutDialog } from "./PayoutDialog";
import {
  dueLabel,
  formatCurrency,
  formatDate,
  installmentStatusBadge,
  statusBadgeOf,
  todayInput,
} from "./sport-work-format";

/**
 * La pagina «Compensi»: cinque elenchi che il dominio tiene apposta separati.
 *
 * Scadenze, registro, premi, rimborsi e fatture dei professionisti non sono
 * cinque filtri della stessa tabella: sono cinque cose con regimi diversi. Un
 * premio ha un trattamento fiscale proprio e non validato; un rimborso non e
 * reddito; una fattura la calcola chi la emette. Metterle nella stessa lista
 * con un enum accanto sarebbe il primo passo per sommarle, e sommarle rende
 * falso — in eccesso — il progressivo verso le soglie.
 */

type Person = { id: string; full_name: string };

export function CompensationsPanel({ clubId }: { clubId: string | null }) {
  const { showToast } = useToast();
  const router = useRouter();

  const [installments, setInstallments] = React.useState<any[]>([]);
  const [payouts, setPayouts] = React.useState<any[]>([]);
  const [bonuses, setBonuses] = React.useState<any[]>([]);
  const [reimbursements, setReimbursements] = React.useState<any[]>([]);
  const [invoices, setInvoices] = React.useState<any[]>([]);
  const [people, setPeople] = React.useState<Person[]>([]);
  const [relationships, setRelationships] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [role, setRole] = React.useState<string | null>(null);
  const [payoutTarget, setPayoutTarget] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [bonusOpen, setBonusOpen] = React.useState(false);
  const [bonusForm, setBonusForm] = React.useState({
    personId: "",
    relationshipId: "",
    reason: "",
    competition: "",
    amount: "",
    awardDate: todayInput(),
    fiscalTreatment: "TO_VERIFY",
  });

  const [expenseOpen, setExpenseOpen] = React.useState(false);
  const [expenseForm, setExpenseForm] = React.useState({
    personId: "",
    category: "TRAVEL",
    description: "",
    expenseDate: todayInput(),
    amount: "",
  });

  const [invoiceOpen, setInvoiceOpen] = React.useState(false);
  const [invoiceForm, setInvoiceForm] = React.useState({
    relationshipId: "",
    documentNumber: "",
    documentDate: todayInput(),
    taxableAmount: "",
    vatAmount: "",
    withholdingAmount: "",
    totalAmount: "",
    dueDate: "",
  });

  React.useEffect(() => {
    setRole(readStoredActiveClub()?.role || null);
  }, []);

  const canManage = hasSportWorkPermission(role, "sport_work.manage");
  const canPay = hasSportWorkPermission(role, "sport_work.pay");

  const load = React.useCallback(async () => {
    setLoading(true);
    const [
      installmentsResult,
      payoutsResult,
      bonusesResult,
      reimbursementsResult,
      invoicesResult,
      peopleResult,
      relationshipsResult,
    ] = await Promise.all([
      apiRequest<any[]>("/api/v1/sport-work/installments"),
      apiRequest<any[]>("/api/v1/sport-work/payouts"),
      apiRequest<any[]>("/api/v1/sport-work/bonuses"),
      apiRequest<any[]>("/api/v1/sport-work/reimbursements"),
      apiRequest<any[]>("/api/v1/sport-work/vat-invoices"),
      apiRequest<Person[]>("/api/v1/sport-work/people"),
      apiRequest<any[]>("/api/v1/sport-work/relationships"),
    ]);
    setLoading(false);

    if (installmentsResult.error) {
      showToast(
        "error",
        installmentsResult.error.message || "Errore nella lettura dei compensi",
      );
      return;
    }

    const asArray = (value: unknown) => (Array.isArray(value) ? value : []);
    setInstallments(asArray(installmentsResult.data));
    setPayouts(asArray(payoutsResult.data));
    setBonuses(asArray(bonusesResult.data));
    setReimbursements(asArray(reimbursementsResult.data));
    setInvoices(asArray(invoicesResult.data));
    setPeople(asArray(peopleResult.data) as Person[]);
    setRelationships(asArray(relationshipsResult.data));
  }, [showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const nameById = React.useMemo(
    () => new Map(people.map((person) => [person.id, person.full_name])),
    [people],
  );

  const relationshipLabel = React.useCallback(
    (id: string) => {
      const relationship = relationships.find((row) => row.id === id);
      if (!relationship) return "";
      return nameById.get(relationship.person_id) || "";
    },
    [relationships, nameById],
  );

  const vatRelationships = React.useMemo(
    () =>
      relationships.filter(
        (row) => row.relationship_type === "SELF_EMPLOYED_VAT",
      ),
    [relationships],
  );

  const post = async (path: string, body: unknown, success: string) => {
    setBusy(true);
    const { error } = await apiRequest(path, { method: "POST", body });
    setBusy(false);
    if (error) {
      showToast("error", error.message || "Operazione non riuscita");
      return false;
    }
    showToast("success", success);
    await load();
    return true;
  };

  const openRelationship = (id: string) =>
    router.push(
      clubId
        ? `/sport-work/relationships/${id}?clubId=${encodeURIComponent(clubId)}`
        : `/sport-work/relationships/${id}`,
    );

  if (loading) {
    return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="scadenze">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="scadenze">Scadenze compenso</TabsTrigger>
          <TabsTrigger value="registro">Registro uscite</TabsTrigger>
          <TabsTrigger value="premi">Premi</TabsTrigger>
          <TabsTrigger value="rimborsi">Rimborsi</TabsTrigger>
          <TabsTrigger value="fatture">Fatture P.IVA</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------ scadenze */}
        <TabsContent value="scadenze">
          <Card>
            <CardHeader>
              <CardTitle>Scadenze compenso</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Programmato, maturato ed erogato sono tre numeri diversi: la
                riga li mostra tutti e tre.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {installments.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Nessuna scadenza. Nascono dal piano compensi di un rapporto.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-gray-700">
                  {installments.map((installment) => {
                    const badge = statusBadgeOf(
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
                        <button
                          type="button"
                          className="min-w-0 text-left"
                          onClick={() =>
                            openRelationship(installment.relationship_id)
                          }
                        >
                          <p className="truncate text-sm font-medium">
                            {relationshipLabel(installment.relationship_id) ||
                              installment.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {installment.label} ·{" "}
                            {formatDate(installment.due_date)} ·{" "}
                            {dueLabel(installment.due_date)}
                          </p>
                        </button>

                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            <span className="tabular-nums">
                              {formatCurrency(installment.gross_amount)}
                            </span>
                            {" / "}
                            <span className="tabular-nums">
                              {formatCurrency(installment.accrued_amount)}
                            </span>
                            {" / "}
                            <span className="tabular-nums">
                              {formatCurrency(installment.paid_amount)}
                            </span>
                          </span>
                          <Badge variant="outline" className={badge.className}>
                            {badge.label}
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------ registro */}
        <TabsContent value="registro">
          <Card>
            <CardHeader>
              <CardTitle>Registro delle uscite</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                La fonte canonica del denaro uscito. Movimenti lo aggrega, non
                lo duplica.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {payouts.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Nessuna uscita registrata.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-gray-700">
                  {payouts.map((payout) => (
                    <li
                      key={payout.id}
                      className="flex flex-col gap-1 px-6 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {nameById.get(payout.person_id) || "Persona"} ·{" "}
                          {OUTBOUND_TRANSACTION_TYPE_LABELS[
                            payout.transaction_type as keyof typeof OUTBOUND_TRANSACTION_TYPE_LABELS
                          ] || payout.transaction_type}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(payout.paid_at)} · anno {payout.fiscal_year}
                          {payout.reversed_at ? " · stornata" : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums">
                        {formatCurrency(payout.gross_amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --------------------------------------------------------- premi */}
        <TabsContent value="premi">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Premi</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Somme per un risultato, non per la prestazione. Il
                    trattamento fiscale lo dichiara il contratto, non
                    l&apos;etichetta.
                  </p>
                </div>
                {canManage ? (
                  <Button size="sm" onClick={() => setBonusOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nuovo premio
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {bonuses.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Nessun premio registrato.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-gray-700">
                  {bonuses.map((bonus) => (
                    <li
                      key={bonus.id}
                      className="flex flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {nameById.get(bonus.person_id) || "Persona"} ·{" "}
                          {bonus.reason}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(bonus.award_date)} ·{" "}
                          {BONUS_FISCAL_TREATMENT_LABELS[
                            bonus.fiscal_treatment as keyof typeof BONUS_FISCAL_TREATMENT_LABELS
                          ] || bonus.fiscal_treatment}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm tabular-nums">
                          {formatCurrency(bonus.amount)}
                        </span>
                        {bonus.status === "PAID" ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-200 bg-emerald-50 text-emerald-700"
                          >
                            Erogato
                          </Badge>
                        ) : canPay ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              post(
                                `/api/v1/sport-work/bonuses/${bonus.id}/pay`,
                                {},
                                "Premio erogato",
                              )
                            }
                          >
                            Eroga
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

        {/* ------------------------------------------------------ rimborsi */}
        <TabsContent value="rimborsi">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Rimborsi spese</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Non sono compensi: non concorrono a nessuna soglia e non
                    entrano nel progressivo.
                  </p>
                </div>
                {canManage ? (
                  <Button size="sm" onClick={() => setExpenseOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nuovo rimborso
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {reimbursements.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Nessun rimborso registrato.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-gray-700">
                  {reimbursements.map((reimbursement) => (
                    <li
                      key={reimbursement.id}
                      className="flex flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {nameById.get(reimbursement.person_id) || "Persona"} ·{" "}
                          {reimbursement.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {EXPENSE_CATEGORY_LABELS[
                            reimbursement.category as keyof typeof EXPENSE_CATEGORY_LABELS
                          ] || reimbursement.category}{" "}
                          · {formatDate(reimbursement.expense_date)} ·{" "}
                          {REIMBURSEMENT_STATUS_LABELS[
                            reimbursement.status as keyof typeof REIMBURSEMENT_STATUS_LABELS
                          ] || reimbursement.status}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm tabular-nums">
                          {formatCurrency(reimbursement.amount)}
                        </span>
                        {canManage && reimbursement.status === "DRAFT" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              post(
                                `/api/v1/sport-work/reimbursements/${reimbursement.id}`,
                                { status: "SUBMITTED" },
                                "Rimborso presentato",
                              )
                            }
                          >
                            Presenta
                          </Button>
                        ) : null}
                        {canManage && reimbursement.status === "SUBMITTED" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              post(
                                `/api/v1/sport-work/reimbursements/${reimbursement.id}`,
                                { status: "APPROVED" },
                                "Rimborso approvato",
                              )
                            }
                          >
                            Approva
                          </Button>
                        ) : null}
                        {canPay && reimbursement.status === "APPROVED" ? (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              post(
                                `/api/v1/sport-work/reimbursements/${reimbursement.id}/pay`,
                                {},
                                "Rimborso liquidato",
                              )
                            }
                          >
                            Liquida
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

        {/* ------------------------------------------------------- fatture */}
        <TabsContent value="fatture">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Fatture dei professionisti</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Gli importi si trascrivono dal documento: il calcolo lo ha
                    fatto chi l&apos;ha emesso.
                  </p>
                </div>
                {canManage && vatRelationships.length > 0 ? (
                  <Button size="sm" onClick={() => setInvoiceOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nuova fattura
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {invoices.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  {vatRelationships.length === 0
                    ? "Nessun rapporto con partita IVA: le fatture si registrano su quelli."
                    : "Nessuna fattura registrata."}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-gray-700">
                  {invoices.map((invoice) => (
                    <li
                      key={invoice.id}
                      className="flex flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {nameById.get(invoice.person_id) || "Persona"} ·{" "}
                          {invoice.document_number}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(invoice.document_date)}
                          {invoice.due_date
                            ? ` · scadenza ${formatDate(invoice.due_date)}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm tabular-nums">
                          {formatCurrency(invoice.total_amount)}
                        </span>
                        {invoice.status === "PAID" ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-200 bg-emerald-50 text-emerald-700"
                          >
                            Pagata
                          </Badge>
                        ) : canPay ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              post(
                                `/api/v1/sport-work/vat-invoices/${invoice.id}/pay`,
                                {},
                                "Fattura pagata",
                              )
                            }
                          >
                            Paga
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
      </Tabs>

      <PayoutDialog
        open={Boolean(payoutTarget)}
        onOpenChange={(open) => !open && setPayoutTarget(null)}
        installmentId={payoutTarget}
        onDone={() => void load()}
      />

      {/* ------------------------------------------------- dialogo premio */}
      <Dialog open={bonusOpen} onOpenChange={setBonusOpen}>
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuovo premio</DialogTitle>
            <DialogDescription>
              Il trattamento fiscale si dichiara. La distinzione fra premio e
              retribuzione variabile la fa il contratto.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Persona</Label>
              <Select
                value={bonusForm.personId}
                onValueChange={(value) =>
                  setBonusForm((current) => ({ ...current, personId: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona" />
                </SelectTrigger>
                <SelectContent>
                  {people.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bonus-reason">Causale</Label>
              <Input
                id="bonus-reason"
                value={bonusForm.reason}
                onChange={(event) =>
                  setBonusForm((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                placeholder="Premio playoff"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bonus-competition">Competizione</Label>
              <Input
                id="bonus-competition"
                value={bonusForm.competition}
                onChange={(event) =>
                  setBonusForm((current) => ({
                    ...current,
                    competition: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bonus-amount">Importo</Label>
              <Input
                id="bonus-amount"
                inputMode="decimal"
                value={bonusForm.amount}
                onChange={(event) =>
                  setBonusForm((current) => ({
                    ...current,
                    amount: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bonus-date">Data di assegnazione</Label>
              <Input
                id="bonus-date"
                type="date"
                value={bonusForm.awardDate}
                onChange={(event) =>
                  setBonusForm((current) => ({
                    ...current,
                    awardDate: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Trattamento fiscale</Label>
              <Select
                value={bonusForm.fiscalTreatment}
                onValueChange={(value) =>
                  setBonusForm((current) => ({
                    ...current,
                    fiscalTreatment: value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BONUS_FISCAL_TREATMENTS.map((treatment) => (
                    <SelectItem key={treatment} value={treatment}>
                      {BONUS_FISCAL_TREATMENT_LABELS[treatment]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setBonusOpen(false)}
              className="w-full sm:w-auto"
            >
              Annulla
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={async () => {
                const done = await post(
                  "/api/v1/sport-work/bonuses",
                  bonusForm,
                  "Premio registrato",
                );
                if (done) setBonusOpen(false);
              }}
            >
              Registra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------- dialogo rimborso */}
      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuovo rimborso spese</DialogTitle>
            <DialogDescription>
              Nasce in bozza. Si liquida solo dopo l&apos;approvazione.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Persona</Label>
              <Select
                value={expenseForm.personId}
                onValueChange={(value) =>
                  setExpenseForm((current) => ({ ...current, personId: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona" />
                </SelectTrigger>
                <SelectContent>
                  {people.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select
                value={expenseForm.category}
                onValueChange={(value) =>
                  setExpenseForm((current) => ({ ...current, category: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {EXPENSE_CATEGORY_LABELS[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-amount">Importo</Label>
              <Input
                id="exp-amount"
                inputMode="decimal"
                value={expenseForm.amount}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    amount: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="exp-description">Causale</Label>
              <Input
                id="exp-description"
                value={expenseForm.description}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Trasferta Bologna"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-date">Data della spesa</Label>
              <Input
                id="exp-date"
                type="date"
                value={expenseForm.expenseDate}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    expenseDate: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setExpenseOpen(false)}
              className="w-full sm:w-auto"
            >
              Annulla
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={async () => {
                const done = await post(
                  "/api/v1/sport-work/reimbursements",
                  expenseForm,
                  "Rimborso registrato",
                );
                if (done) setExpenseOpen(false);
              }}
            >
              Registra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------ dialogo fattura */}
      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuova fattura ricevuta</DialogTitle>
            <DialogDescription>
              Trascrivi gli importi dal documento: EasyGame non li ricalcola.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Rapporto con partita IVA</Label>
              <Select
                value={invoiceForm.relationshipId}
                onValueChange={(value) =>
                  setInvoiceForm((current) => ({
                    ...current,
                    relationshipId: value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona" />
                </SelectTrigger>
                <SelectContent>
                  {vatRelationships.map((relationship) => (
                    <SelectItem key={relationship.id} value={relationship.id}>
                      {nameById.get(relationship.person_id) || relationship.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-number">Numero documento</Label>
              <Input
                id="inv-number"
                value={invoiceForm.documentNumber}
                onChange={(event) =>
                  setInvoiceForm((current) => ({
                    ...current,
                    documentNumber: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-date">Data documento</Label>
              <Input
                id="inv-date"
                type="date"
                value={invoiceForm.documentDate}
                onChange={(event) =>
                  setInvoiceForm((current) => ({
                    ...current,
                    documentDate: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-taxable">Imponibile</Label>
              <Input
                id="inv-taxable"
                inputMode="decimal"
                value={invoiceForm.taxableAmount}
                onChange={(event) =>
                  setInvoiceForm((current) => ({
                    ...current,
                    taxableAmount: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-vat">IVA</Label>
              <Input
                id="inv-vat"
                inputMode="decimal"
                value={invoiceForm.vatAmount}
                onChange={(event) =>
                  setInvoiceForm((current) => ({
                    ...current,
                    vatAmount: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-withholding">Ritenuta in fattura</Label>
              <Input
                id="inv-withholding"
                inputMode="decimal"
                value={invoiceForm.withholdingAmount}
                onChange={(event) =>
                  setInvoiceForm((current) => ({
                    ...current,
                    withholdingAmount: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-total">Totale documento</Label>
              <Input
                id="inv-total"
                inputMode="decimal"
                value={invoiceForm.totalAmount}
                onChange={(event) =>
                  setInvoiceForm((current) => ({
                    ...current,
                    totalAmount: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="inv-due">Scadenza</Label>
              <Input
                id="inv-due"
                type="date"
                value={invoiceForm.dueDate}
                onChange={(event) =>
                  setInvoiceForm((current) => ({
                    ...current,
                    dueDate: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setInvoiceOpen(false)}
              className="w-full sm:w-auto"
            >
              Annulla
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={async () => {
                const done = await post(
                  "/api/v1/sport-work/vat-invoices",
                  invoiceForm,
                  "Fattura registrata",
                );
                if (done) setInvoiceOpen(false);
              }}
            >
              Registra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
