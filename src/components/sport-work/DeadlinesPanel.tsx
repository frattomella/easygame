"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest, readStoredActiveClub } from "@/lib/api/client";
import { hasSportWorkPermission } from "@/lib/sport-work/permissions";
import { PayoutDialog } from "./PayoutDialog";
import { SportWorkStat } from "./SportWorkShell";
import {
  daysUntil,
  dueLabel,
  formatCurrency,
  formatDate,
  installmentStatusBadge,
  obligationKindLabel,
  statusBadgeOf,
} from "./sport-work-format";

/**
 * «Scadenze»: cosa e in ritardo, cosa scade adesso, cosa arriva.
 *
 * **Non e un filtro dell'elenco compensi.** L'elenco compensi risponde a «cosa
 * ho pattuito»; questa pagina risponde a «cosa devo fare questa settimana», ed
 * e la domanda che una segreteria si pone il lunedi mattina. Per questo mette
 * insieme due cose che il dominio tiene separate — scadenze di compenso e
 * adempimenti — e le ordina per data invece che per tipo.
 */

const GROUPS = [
  {
    id: "overdue",
    title: "In ritardo",
    empty: "Niente in ritardo.",
    match: (days: number | null) => days !== null && days < 0,
  },
  {
    id: "week",
    title: "Entro sette giorni",
    empty: "Niente in scadenza questa settimana.",
    match: (days: number | null) => days !== null && days >= 0 && days <= 7,
  },
  {
    id: "month",
    title: "Entro trenta giorni",
    empty: "Niente in scadenza nel mese.",
    match: (days: number | null) => days !== null && days > 7 && days <= 30,
  },
] as const;

type Entry = {
  id: string;
  kind: "installment" | "obligation";
  title: string;
  subtitle: string;
  dueDate: string;
  amount: number | null;
  status: string;
  relationshipId?: string;
  installmentId?: string;
  payable: boolean;
};

export function DeadlinesPanel({ clubId }: { clubId: string | null }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [role, setRole] = React.useState<string | null>(null);
  const [payoutTarget, setPayoutTarget] = React.useState<string | null>(null);

  React.useEffect(() => {
    setRole(readStoredActiveClub()?.role || null);
  }, []);

  const canPay = hasSportWorkPermission(role, "sport_work.pay");

  const load = React.useCallback(async () => {
    setLoading(true);
    const [installmentsResult, obligationsResult, peopleResult] =
      await Promise.all([
        apiRequest<any[]>("/api/v1/sport-work/installments"),
        apiRequest<any[]>("/api/v1/sport-work/obligations?status=DUE"),
        apiRequest<any[]>("/api/v1/sport-work/people"),
      ]);
    setLoading(false);

    if (installmentsResult.error) {
      showToast(
        "error",
        installmentsResult.error.message || "Errore nella lettura delle scadenze",
      );
      return;
    }

    const relationshipsResult = await apiRequest<any[]>(
      "/api/v1/sport-work/relationships",
    );

    const people = new Map<string, string>(
      (Array.isArray(peopleResult.data) ? peopleResult.data : []).map(
        (person: any) => [String(person.id), String(person.full_name)],
      ),
    );
    const personOfRelationship = new Map<string, string>(
      (Array.isArray(relationshipsResult.data)
        ? relationshipsResult.data
        : []
      ).map((row: any) => [String(row.id), String(row.person_id)]),
    );

    const installmentEntries: Entry[] = (
      Array.isArray(installmentsResult.data) ? installmentsResult.data : []
    )
      .filter(
        (row: any) =>
          !row.cancelled && Number(row.remaining_amount) > 0,
      )
      .map((row: any) => ({
        id: `installment-${row.id}`,
        kind: "installment" as const,
        title:
          people.get(personOfRelationship.get(String(row.relationship_id)) || "") ||
          "Compenso",
        subtitle: `${row.label} · residuo ${formatCurrency(row.remaining_amount)}`,
        dueDate: String(row.due_date),
        amount: Number(row.remaining_amount) || 0,
        status: String(row.status),
        relationshipId: String(row.relationship_id),
        installmentId: String(row.id),
        payable: true,
      }));

    const obligationEntries: Entry[] = (
      Array.isArray(obligationsResult.data) ? obligationsResult.data : []
    ).map((row: any) => ({
      id: `obligation-${row.id}`,
      kind: "obligation" as const,
      title: row.title,
      subtitle: obligationKindLabel(row.kind),
      dueDate: String(row.due_date),
      amount: row.amount === null ? null : Number(row.amount),
      status: String(row.status),
      payable: false,
    }));

    setEntries(
      [...installmentEntries, ...obligationEntries].sort((left, right) =>
        left.dueDate.localeCompare(right.dueDate),
      ),
    );
  }, [showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const grouped = React.useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        rows: entries.filter((entry) => group.match(daysUntil(entry.dueDate))),
      })),
    [entries],
  );

  const overdueTotal = grouped[0].rows.reduce(
    (total, entry) => total + (entry.amount || 0),
    0,
  );
  const weekTotal = grouped[1].rows.reduce(
    (total, entry) => total + (entry.amount || 0),
    0,
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SportWorkStat
          label="In ritardo"
          value={formatCurrency(overdueTotal)}
          hint={`${grouped[0].rows.length} voci`}
          tone={grouped[0].rows.length > 0 ? "danger" : "default"}
        />
        <SportWorkStat
          label="Entro sette giorni"
          value={formatCurrency(weekTotal)}
          hint={`${grouped[1].rows.length} voci`}
          tone={grouped[1].rows.length > 0 ? "warning" : "default"}
        />
        <SportWorkStat
          label="Entro trenta giorni"
          value={String(grouped[2].rows.length)}
          hint="Voci in arrivo"
        />
      </div>

      {grouped.map((group) => (
        <Card key={group.id}>
          <CardHeader>
            <CardTitle>{group.title}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {group.rows.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                {group.empty}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-gray-700">
                {group.rows.map((entry) => {
                  const badge =
                    entry.kind === "installment"
                      ? statusBadgeOf(
                          installmentStatusBadge,
                          entry.status,
                          "SCHEDULED",
                        )
                      : null;

                  return (
                    <li
                      key={entry.id}
                      className="flex flex-col gap-2 px-6 py-3 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={() => {
                          if (!entry.relationshipId) return;
                          router.push(
                            clubId
                              ? `/sport-work/relationships/${entry.relationshipId}?clubId=${encodeURIComponent(clubId)}`
                              : `/sport-work/relationships/${entry.relationshipId}`,
                          );
                        }}
                      >
                        <p className="truncate text-sm font-medium">
                          {entry.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.subtitle} · {formatDate(entry.dueDate)} ·{" "}
                          {dueLabel(entry.dueDate)}
                        </p>
                      </button>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {entry.amount !== null ? (
                          <span className="text-sm tabular-nums">
                            {formatCurrency(entry.amount)}
                          </span>
                        ) : null}
                        {badge ? (
                          <Badge variant="outline" className={badge.className}>
                            {badge.label}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-slate-200 bg-slate-100 text-slate-600"
                          >
                            Adempimento
                          </Badge>
                        )}
                        {canPay && entry.payable && entry.installmentId ? (
                          <Button
                            size="sm"
                            onClick={() => setPayoutTarget(entry.installmentId!)}
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
      ))}

      <PayoutDialog
        open={Boolean(payoutTarget)}
        onOpenChange={(open) => !open && setPayoutTarget(null)}
        installmentId={payoutTarget}
        onDone={() => void load()}
      />
    </div>
  );
}
