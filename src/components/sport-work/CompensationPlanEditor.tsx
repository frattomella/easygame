"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import {
  COMPENSATION_PLAN_KINDS,
  COMPENSATION_PLAN_KIND_LABELS,
  type CompensationPlanKind,
} from "@/lib/sport-work/model";
import {
  generatePlanItems,
  planTotal,
  splitPlanByScheduledYear,
} from "@/lib/sport-work/plan";
import { formatCurrency, formatDate } from "./sport-work-format";

/**
 * L'editor del **piano compensi**.
 *
 * **L'anteprima si calcola nel browser con lo stesso modulo del server.**
 * `generatePlanItems` e puro e non tocca Prisma: importarlo qui significa che
 * cio che la segreteria vede prima di salvare e, riga per riga, cio che il
 * server scrivera. Riscrivere la stessa aritmetica in TypeScript di interfaccia
 * avrebbe prodotto due verita che divergono al primo arrotondamento.
 *
 * **Il riepilogo per anno solare non e un dettaglio.** Dodicimila euro di
 * stagione 2026/27 non sono dodicimila euro del 2026: le rate ricadono su due
 * anni, su due franchigie intere e su due rule set diversi. Una schermata che
 * non lo dice lascia credere il contrario, e il contrario e la fonte piu
 * frequente di calcoli sbagliati in questo dominio.
 */

type PlanForm = {
  kind: CompensationPlanKind;
  totalAmount: string;
  installmentCount: string;
  firstDueDate: string;
  monthlyAmount: string;
  startMonth: string;
  endMonth: string;
  dueDayOfMonth: string;
};

const emptyForm = (): PlanForm => ({
  kind: "EQUAL_INSTALMENTS",
  totalAmount: "",
  installmentCount: "10",
  firstDueDate: "",
  monthlyAmount: "",
  startMonth: "",
  endMonth: "",
  dueDayOfMonth: "",
});

const toConfig = (form: PlanForm) => {
  if (form.kind === "MONTHLY") {
    return {
      kind: "MONTHLY" as const,
      monthlyAmount: Number(String(form.monthlyAmount).replace(",", ".")),
      startMonth: form.startMonth,
      endMonth: form.endMonth,
      dueDayOfMonth: form.dueDayOfMonth ? Number(form.dueDayOfMonth) : null,
    };
  }

  return {
    kind: "EQUAL_INSTALMENTS" as const,
    totalAmount: Number(String(form.totalAmount).replace(",", ".")),
    installmentCount: Number(form.installmentCount),
    firstDueDate: form.firstDueDate,
  };
};

export function CompensationPlanEditor({
  relationshipId,
  plan,
  installments,
  canManage,
  onSaved,
}: {
  relationshipId: string;
  plan: any | null;
  installments: any[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [editing, setEditing] = React.useState(!plan);
  const [form, setForm] = React.useState<PlanForm>(emptyForm);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setEditing(!plan);
  }, [plan]);

  const setField = (field: keyof PlanForm, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const preview = React.useMemo(() => {
    try {
      const items = generatePlanItems(toConfig(form) as any);
      return { items, error: null as string | null };
    } catch (error: any) {
      return { items: [] as any[], error: String(error?.message || "") };
    }
  }, [form]);

  const perYear = React.useMemo(
    () => splitPlanByScheduledYear(preview.items),
    [preview.items],
  );

  const paidSomething = installments.some(
    (row) => Number(row.paid_amount) > 0,
  );

  const handleSave = async () => {
    if (preview.error) {
      showToast("error", preview.error);
      return;
    }

    setSaving(true);
    const { error } = await apiRequest(
      `/api/v1/sport-work/relationships/${encodeURIComponent(relationshipId)}/plan`,
      { method: "PUT", body: { ...form, ...toConfig(form) } },
    );
    setSaving(false);

    if (error) {
      showToast("error", error.message || "Salvataggio del piano non riuscito");
      return;
    }

    showToast("success", "Piano compensi salvato");
    setEditing(false);
    onSaved();
  };

  if (!editing && plan) {
    return (
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Piano compensi</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {COMPENSATION_PLAN_KIND_LABELS[
                  plan.kind as CompensationPlanKind
                ] || plan.kind}{" "}
                · {installments.length} scadenze ·{" "}
                {formatCurrency(plan.total_amount)}
              </p>
            </div>
            {canManage ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
                disabled={paidSomething}
                title={
                  paidSomething
                    ? "Alcune scadenze hanno gia ricevuto denaro: il piano non si rifa"
                    : undefined
                }
              >
                Rifai il piano
              </Button>
            ) : null}
          </div>
        </CardHeader>
        {paidSomething ? (
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Alcune scadenze hanno gia ricevuto denaro: rifare il piano
              cancellerebbe righe collegate a movimenti del registro. Per
              correggere, annulla le rate residue e aggiungine di nuove.
            </p>
          </CardContent>
        ) : null}
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{plan ? "Rifai il piano compensi" : "Piano compensi"}</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Le scadenze nascono programmate. Maturano quando il loro periodo e
          trascorso, non quando qualcuno lo dice.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Forma del piano</Label>
          <Select
            value={form.kind}
            onValueChange={(value) => setField("kind", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPENSATION_PLAN_KINDS.filter((kind) => kind !== "CUSTOM").map(
                (kind) => (
                  <SelectItem key={kind} value={kind}>
                    {COMPENSATION_PLAN_KIND_LABELS[kind]}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>

        {form.kind === "EQUAL_INSTALMENTS" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="plan-total">Importo complessivo</Label>
              <Input
                id="plan-total"
                inputMode="decimal"
                value={form.totalAmount}
                onChange={(event) => setField("totalAmount", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-count">Numero di rate</Label>
              <Input
                id="plan-count"
                inputMode="numeric"
                value={form.installmentCount}
                onChange={(event) =>
                  setField("installmentCount", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-first">Prima scadenza</Label>
              <Input
                id="plan-first"
                type="date"
                value={form.firstDueDate}
                onChange={(event) => setField("firstDueDate", event.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="plan-monthly">Importo mensile</Label>
              <Input
                id="plan-monthly"
                inputMode="decimal"
                value={form.monthlyAmount}
                onChange={(event) =>
                  setField("monthlyAmount", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-start">Da</Label>
              <Input
                id="plan-start"
                type="month"
                value={form.startMonth}
                onChange={(event) => setField("startMonth", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-end">A</Label>
              <Input
                id="plan-end"
                type="month"
                value={form.endMonth}
                onChange={(event) => setField("endMonth", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-day">Giorno di scadenza</Label>
              <Input
                id="plan-day"
                inputMode="numeric"
                placeholder="fine mese"
                value={form.dueDayOfMonth}
                onChange={(event) =>
                  setField("dueDayOfMonth", event.target.value)
                }
              />
            </div>
          </div>
        )}

        {preview.error ? (
          <p className="text-sm text-rose-600">{preview.error}</p>
        ) : preview.items.length > 0 ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 dark:border-gray-700">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-sm font-medium dark:border-gray-700">
                <span>Anteprima</span>
                <span className="tabular-nums">
                  {formatCurrency(planTotal(preview.items))}
                </span>
              </div>
              <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto dark:divide-gray-700">
                {preview.items.map((item) => (
                  <li
                    key={item.sequence}
                    className="flex items-center justify-between px-4 py-2 text-sm"
                  >
                    <span className="truncate">
                      {item.label} · {formatDate(item.dueDate)}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatCurrency(item.grossAmount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {perYear.length > 1 ? (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                <p className="font-medium">
                  Questo piano attraversa {perYear.length} anni solari
                </p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {perYear.map((year) => (
                    <li key={year.year}>
                      {year.year}: {year.count} rate per{" "}
                      {formatCurrency(year.total)}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs">
                  Ogni anno ha franchigie proprie e regole proprie: il calcolo
                  dei contributi usa quelle dell&apos;anno in cui il denaro
                  esce, non quelle della stagione.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {plan ? (
            <Button
              variant="outline"
              onClick={() => setEditing(false)}
              className="w-full sm:w-auto"
            >
              Annulla
            </Button>
          ) : null}
          <Button
            onClick={handleSave}
            disabled={saving || !canManage || preview.items.length === 0}
            className="w-full sm:w-auto"
          >
            {saving ? "Salvataggio…" : "Salva piano"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
