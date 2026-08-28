"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest, readStoredActiveClub } from "@/lib/api/client";
import { hasSportWorkPermission } from "@/lib/sport-work/permissions";
import { summarizePlanProgress } from "@/lib/sport-work/plan";
import { PersonPositionCard } from "./PersonPositionCard";
import { SportWorkStat } from "./SportWorkShell";
import {
  formatCurrency,
  formatDate,
  relationshipStatusBadge,
  relationshipTypeLabel,
  roleLabel,
  statusBadgeOf,
} from "./sport-work-format";

/**
 * La sezione **«Lavoro e compensi»** dentro la scheda di una persona.
 *
 * Vive dentro le schede di atleta, allenatore e staff, che sono anagrafiche
 * diverse e per il modulo compensi sono la stessa cosa: una persona con un
 * rapporto. Il collegamento passa da `origin_type` + `origin_id`, che e
 * **debole** di proposito — allenatori e staff non sono righe di tabella ma
 * elementi di colonne JSON del club, e un vincolo di integrita verso un
 * elemento di array non esiste.
 *
 * **Quando la persona non e ancora censita, la schermata lo dice e offre di
 * farlo**, invece di mostrare una sezione vuota. Il caso e frequente: il
 * modulo compensi nasce dopo le anagrafiche, e nessuno migra a mano
 * quattrocento allenatori.
 */

export type PersonCompensationTabProps = {
  originType: "athlete" | "trainer" | "staff_member" | "member";
  originId: string;
  /** Nome e cognome dall'anagrafica di origine: servono a censire la persona. */
  firstName?: string;
  lastName?: string;
  fiscalCode?: string;
  email?: string;
  phone?: string;
};

export function PersonCompensationTab({
  originType,
  originId,
  firstName,
  lastName,
  fiscalCode,
  email,
  phone,
}: PersonCompensationTabProps) {
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clubId = searchParams?.get("clubId") || null;

  const [person, setPerson] = React.useState<any | null>(null);
  const [relationships, setRelationships] = React.useState<any[]>([]);
  const [installments, setInstallments] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [denied, setDenied] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [role, setRole] = React.useState<string | null>(null);

  React.useEffect(() => {
    setRole(readStoredActiveClub()?.role || null);
  }, []);

  const canManage = hasSportWorkPermission(role, "sport_work.manage");

  const load = React.useCallback(async () => {
    setLoading(true);
    const peopleResult = await apiRequest<any[]>("/api/v1/sport-work/people");

    if (peopleResult.error) {
      setLoading(false);
      setDenied(true);
      return;
    }

    const match = (Array.isArray(peopleResult.data) ? peopleResult.data : []).find(
      (row: any) =>
        String(row.origin_type) === originType &&
        String(row.origin_id) === String(originId),
    );

    if (!match) {
      setPerson(null);
      setRelationships([]);
      setInstallments([]);
      setLoading(false);
      return;
    }

    const [relationshipsResult, installmentsResult] = await Promise.all([
      apiRequest<any[]>(
        `/api/v1/sport-work/relationships?person_id=${encodeURIComponent(match.id)}`,
      ),
      apiRequest<any[]>("/api/v1/sport-work/installments"),
    ]);

    setPerson(match);
    setRelationships(
      Array.isArray(relationshipsResult.data) ? relationshipsResult.data : [],
    );
    setInstallments(
      Array.isArray(installmentsResult.data) ? installmentsResult.data : [],
    );
    setLoading(false);
  }, [originType, originId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const relationshipIds = React.useMemo(
    () => new Set(relationships.map((row) => String(row.id))),
    [relationships],
  );

  const personInstallments = React.useMemo(
    () =>
      installments.filter((row) =>
        relationshipIds.has(String(row.relationship_id)),
      ),
    [installments, relationshipIds],
  );

  const progress = summarizePlanProgress(personInstallments);

  const handleCreatePerson = async () => {
    setCreating(true);
    const { data, error } = await apiRequest<any>("/api/v1/sport-work/people", {
      method: "POST",
      body: {
        originType,
        originId,
        firstName: firstName || "Nome",
        lastName: lastName || "Cognome",
        fiscalCode,
        email,
        phone,
      },
    });
    setCreating(false);

    if (error || !data) {
      showToast("error", error?.message || "Censimento non riuscito");
      return;
    }

    showToast("success", "Persona censita nel modulo compensi");
    await load();
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  }

  if (denied) {
    return (
      <Card>
        <CardContent className="space-y-1 p-6">
          <p className="text-sm font-medium">
            I compensi non sono visibili con il ruolo attivo
          </p>
          <p className="text-sm text-muted-foreground">
            Questa sezione la vedono il proprietario e il club manager.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!person) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <div>
            <p className="text-sm font-medium">
              Questa persona non e ancora censita nel modulo compensi
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Il modulo tiene un&apos;anagrafica propria — codice fiscale,
              regime, copertura previdenziale, coordinate bancarie — perche un
              contratto firmato non deve sparire insieme a una scheda. Il
              collegamento all&apos;anagrafica di origine resta.
            </p>
          </div>
          {canManage ? (
            <Button onClick={handleCreatePerson} disabled={creating}>
              <Plus className="mr-2 h-4 w-4" />
              {creating ? "Censimento…" : "Censisci nel modulo compensi"}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SportWorkStat
          label="Programmato"
          value={formatCurrency(progress.scheduled)}
        />
        <SportWorkStat label="Maturato" value={formatCurrency(progress.accrued)} />
        <SportWorkStat
          label="Erogato"
          value={formatCurrency(progress.paid)}
          tone="positive"
        />
        <SportWorkStat
          label="Maturato non erogato"
          value={formatCurrency(progress.accruedUnpaid)}
          tone={progress.accruedUnpaid > 0 ? "warning" : "default"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rapporti</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {relationships.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Nessun rapporto di lavoro sportivo per questa persona.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-gray-700">
              {relationships.map((relationship) => {
                const badge = statusBadgeOf(
                  relationshipStatusBadge,
                  relationship.status,
                  "DRAFT",
                );
                return (
                  <li key={relationship.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-6 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-gray-800"
                      onClick={() =>
                        router.push(
                          clubId
                            ? `/sport-work/relationships/${relationship.id}?clubId=${encodeURIComponent(clubId)}`
                            : `/sport-work/relationships/${relationship.id}`,
                        )
                      }
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {roleLabel(relationship.role)} ·{" "}
                          {relationshipTypeLabel(relationship.relationship_type)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(relationship.start_date)}
                          {relationship.end_date
                            ? ` — ${formatDate(relationship.end_date)}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className={badge.className}>
                          {badge.label}
                        </Badge>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <PersonPositionCard personId={person.id} canManage={canManage} />
    </div>
  );
}
