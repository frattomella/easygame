"use client";

import React from "react";
import {
  ArrowLeft,
  HandCoins,
  Loader2,
  RefreshCw,
  Search,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  fundingAccrualSourceLabel,
  requirementUnitLabel,
  type FundingAccrualSource,
} from "@/lib/funding/funding-model";
import { EnrollAthletesDialog } from "./EnrollAthletesDialog";
import { cn } from "@/lib/utils";

/**
 * La **scheda di un programma** di contributo: cosa prevede, chi c'e dentro, a
 * che punto e ognuno.
 *
 * **Il buco che chiude.** Il pannello dei programmi elencava e creava, e si
 * fermava li: `funding_enrollments` esisteva nel modello e nessuna schermata
 * lo sapeva scrivere. Un bando caricato restava senza beneficiari, e il
 * maturato — che si calcola per beneficiario — non aveva su cosa girare.
 *
 * **I cinque importi per riga, non un totale.** Assegnato, maturato,
 * rendicontato, liquidato, residuo sono cinque cose diverse e diventano
 * diverse in momenti diversi: fra «assegnato» e «arrivato» ci sono la
 * frequenza, la rendicontazione e il versamento dell'ente, e ognuno dei tre
 * puo non essere ancora successo ([ADR-0037](../../../docs/knowledge-base/18-decision-log.md)).
 *
 * **Cosa non si puo fare da qui, di proposito.** Scrivere un maturato. Il
 * maturato si ricava dalle presenze secondo le regole del programma; un campo
 * che lo accettasse trasformerebbe un calcolo verificabile in una
 * dichiarazione.
 */

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDate = (value?: unknown) => {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const PROGRAM_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "BOZZA", className: "border-slate-200 bg-slate-100 text-slate-600" },
  active: { label: "ATTIVO", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  closed: { label: "CHIUSO", className: "border-slate-200 bg-slate-100 text-slate-600" },
};

const ENROLLMENT_STATUS: Record<string, { label: string; className: string }> = {
  active: { label: "ATTIVA", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  suspended: { label: "SOSPESA", className: "border-amber-200 bg-amber-50 text-amber-700" },
  closed: { label: "CHIUSA", className: "border-slate-200 bg-slate-100 text-slate-600" },
};

type EnrollmentRow = {
  enrollment: Record<string, any>;
  athlete: { id: string; firstName: string; lastName: string } | null;
  summary: {
    assignedAmount: number;
    accruedAmount: number;
    reportedAmount: number;
    settledAmount: number;
    residualAmount: number;
  };
  hasSettledHistory: boolean;
};

type ProgramDetail = {
  program: Record<string, any>;
  enrollments: EnrollmentRow[];
  totals: {
    enrolledCount: number;
    activeCount: number;
    assignedAmount: number;
    accruedAmount: number;
    reportedAmount: number;
    settledAmount: number;
    residualAmount: number;
  };
  enrollableAthletes: Array<{ id: string; firstName: string; lastName: string }>;
};

const Amount = ({ label, value }: { label: string; value: number }) => (
  <div className="min-w-0">
    <p className="truncate text-xs text-muted-foreground">{label}</p>
    <p className="truncate text-sm font-semibold">{formatCurrency(value)}</p>
  </div>
);

export function FundingProgramDetail({
  programId,
  canManage,
  onBack,
}: {
  programId: string;
  canManage: boolean;
  onBack?: () => void;
}) {
  const { showToast } = useToast();
  const [detail, setDetail] = React.useState<ProgramDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await apiRequest<ProgramDetail>(
      `/api/v1/funding/programs/${encodeURIComponent(programId)}?view=detail`,
    );

    if (error || !data) {
      showToast("error", error?.message || "Errore nella lettura del programma");
      setLoading(false);
      return;
    }

    setDetail(data);
    setLoading(false);
  }, [programId, showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const visible = React.useMemo(() => {
    if (!detail) return [];
    const needle = query.trim().toLowerCase();

    return detail.enrollments.filter((row) => {
      if (statusFilter !== "all" && row.enrollment.status !== statusFilter) {
        return false;
      }
      if (!needle) return true;

      const name = `${row.athlete?.lastName || ""} ${row.athlete?.firstName || ""}`;
      return (
        name.toLowerCase().includes(needle) ||
        String(row.enrollment.voucher_code || "")
          .toLowerCase()
          .includes(needle)
      );
    });
  }, [detail, query, statusFilter]);

  const remove = async (row: EnrollmentRow) => {
    /*
      Due messaggi diversi perche sono due operazioni diverse, e chi conferma
      deve sapere quale sta confermando: una toglie, l'altra chiude e conserva.
    */
    const conferma = row.hasSettledHistory
      ? "Questa iscrizione ha gia prodotto importi rendicontati o liquidati: non verra cancellata, ma revocata. Lo storico resta. Procedere?"
      : "Togliere questo atleta dal programma?";

    if (!window.confirm(conferma)) return;

    setBusyId(row.enrollment.id);
    const { data, error } = await apiRequest<{ outcome: string }>(
      `/api/v1/funding/enrollments/${encodeURIComponent(row.enrollment.id)}`,
      { method: "DELETE" },
    );
    setBusyId(null);

    if (error) {
      showToast("error", error.message || "Operazione non riuscita");
      return;
    }

    showToast(
      "success",
      data?.outcome === "revoked"
        ? "Iscrizione revocata: lo storico maturato resta"
        : "Atleta tolto dal programma",
    );
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Caricamento programma…
      </div>
    );
  }

  if (!detail) return null;

  const program = detail.program;
  const status = PROGRAM_STATUS[String(program.status)] || PROGRAM_STATUS.draft;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {onBack ? (
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Programmi
            </Button>
          ) : null}
          <h3 className="min-w-0 truncate text-lg font-semibold">
            {program.name}
          </h3>
          <Badge variant="outline" className={status.className}>
            {status.label}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => void load()} className="gap-1">
            <RefreshCw className="h-4 w-4" />
            Aggiorna
          </Button>
          {canManage ? (
            <Button
              size="sm"
              className="gap-1"
              onClick={() => setDialogOpen(true)}
              disabled={String(program.status) === "closed"}
              title={
                String(program.status) === "closed"
                  ? "Un programma chiuso non ammette nuovi beneficiari"
                  : undefined
              }
            >
              <UserPlus className="h-4 w-4" />
              Iscrivi atleti
            </Button>
          ) : null}
        </div>
      </div>

      {/* ------------------------------------------------ configurazione */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <HandCoins className="h-5 w-5" />
            Regole del programma
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Ente finanziatore</p>
            <p className="truncate text-sm font-medium">{program.funder_name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Validita</p>
            <p className="text-sm font-medium">
              {formatDate(program.valid_from)} — {formatDate(program.valid_to)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Massimale programma</p>
            <p className="text-sm font-medium">
              {formatCurrency(program.athlete_plafond)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Importo per periodo</p>
            <p className="text-sm font-medium">
              {formatCurrency(program.period_amount)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Requisito minimo</p>
            <p className="text-sm font-medium">
              {program.requirement_min}{" "}
              {requirementUnitLabel(program.requirement_unit)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Sotto soglia</p>
            <p className="text-sm font-medium">
              {program.unmet_behavior === "prorata"
                ? "Pro-rata"
                : program.unmet_behavior === "full"
                  ? "Riconosciuto per intero"
                  : "Nessun riconoscimento"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tetto complessivo</p>
            <p className="text-sm font-medium">
              {program.max_total_amount
                ? formatCurrency(program.max_total_amount)
                : "Nessuno"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Beneficiari</p>
            <p className="text-sm font-medium">
              {detail.totals.enrolledCount} ({detail.totals.activeCount} attivi)
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Fonte della maturazione
            </p>
            <p className="text-sm font-medium">
              {fundingAccrualSourceLabel(
                (program.accrual_source ||
                  "easygame_attendance") as FundingAccrualSource,
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------- i totali */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
          <Amount label="Assegnato al club" value={detail.totals.assignedAmount} />
          <Amount label="Maturato" value={detail.totals.accruedAmount} />
          <Amount label="Rendicontato" value={detail.totals.reportedAmount} />
          <Amount label="Liquidato" value={detail.totals.settledAmount} />
          <Amount label="Residuo" value={detail.totals.residualAmount} />
        </CardContent>
      </Card>

      {/* --------------------------------------------------- i beneficiari */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Atleti iscritti</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cerca per cognome o codice voucher"
                aria-label="Cerca fra gli iscritti"
              />
            </div>
            <div className="sm:w-48">
              <Label htmlFor="enrollment-status" className="sr-only">
                Stato dell&apos;iscrizione
              </Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="enrollment-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli stati</SelectItem>
                  <SelectItem value="active">Attive</SelectItem>
                  <SelectItem value="suspended">Sospese</SelectItem>
                  <SelectItem value="closed">Chiuse</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              {detail.enrollments.length === 0
                ? "Nessun atleta iscritto. Usa «Iscrivi atleti» per ammettere i beneficiari: senza iscritti il programma non matura niente."
                : "Nessun iscritto corrisponde ai filtri."}
            </p>
          ) : (
            <div className="space-y-2">
              {visible.map((row) => {
                const state =
                  ENROLLMENT_STATUS[String(row.enrollment.status)] ||
                  ENROLLMENT_STATUS.active;

                return (
                  <div
                    key={row.enrollment.id}
                    className="rounded-md border p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {row.athlete
                            ? `${row.athlete.lastName} ${row.athlete.firstName}`
                            : "Atleta non piu in anagrafica"}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={state.className}>
                            {state.label}
                          </Badge>
                          {row.enrollment.voucher_code ? (
                            <Badge variant="outline" className="font-mono text-xs">
                              {row.enrollment.voucher_code}
                            </Badge>
                          ) : null}
                          <span className="text-xs text-muted-foreground">
                            dal {formatDate(row.enrollment.enrolled_at)}
                          </span>
                        </div>
                      </div>

                      {canManage ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          disabled={busyId === row.enrollment.id}
                          onClick={() => void remove(row)}
                        >
                          {busyId === row.enrollment.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserMinus className="h-3.5 w-3.5" />
                          )}
                          {row.hasSettledHistory ? "Revoca" : "Togli"}
                        </Button>
                      ) : null}
                    </div>

                    {/*
                      I cinque importi scorrono orizzontalmente sotto i 640 px
                      invece di comprimersi in colonne illeggibili: sono numeri,
                      e un numero troncato e peggio di un numero da raggiungere
                      con un dito.
                    */}
                    <div
                      className={cn(
                        "mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5",
                      )}
                    >
                      <Amount label="Assegnato al club" value={row.summary.assignedAmount} />
                      <Amount label="Maturato" value={row.summary.accruedAmount} />
                      <Amount label="Rendicontato" value={row.summary.reportedAmount} />
                      <Amount label="Liquidato" value={row.summary.settledAmount} />
                      <Amount label="Residuo" value={row.summary.residualAmount} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <EnrollAthletesDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onEnrolled={() => void load()}
        mode="program"
        programId={programId}
        programName={String(program.name || "")}
        defaultAmount={Number(program.athlete_plafond || 0)}
        athletes={detail.enrollableAthletes}
      />
    </div>
  );
}
