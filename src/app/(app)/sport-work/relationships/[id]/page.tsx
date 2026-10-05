"use client";

import * as React from "react";
import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Ban, CheckCircle2, PauseCircle } from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { useBreadcrumbLabel } from "@/components/web/shell/ShellProvider";
import { RecordAlertStrip, RecordAreaSwitcher, RecordHeader, type RecordAction } from "@/components/web/record/Record";
import { DetailCard, EmptyStateCard, KpiBar, KpiCard, type DetailField } from "@/components/web/page/Cards";
import { Button } from "@/components/web/primitives/Button";
import { Skeleton } from "@/components/web/primitives/Controls";
import { Panel } from "@/components/web/primitives/Surface";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { formatDateShort, formatMoney, joinMeta, MISSING, orMissing } from "@/lib/web/format";
import { listRelationshipTransitions, RELATIONSHIP_STATUS_LABELS, type RelationshipStatus } from "@/lib/sport-work/model";
import { summarizePlanProgress } from "@/lib/sport-work/plan";
import { SportWorkShell } from "@/components/sport-work/v2/sport-work-shell";
import { useSportWorkRole } from "@/components/sport-work/v2/use-sport-work-role";
import { InstallmentsGrid } from "@/components/sport-work/v2/installments-grid";
import { PayoutsGrid } from "@/components/sport-work/v2/payouts-grid";
import { PayoutDrawer } from "@/components/sport-work/v2/payout-drawer";
import { PlanDrawer } from "@/components/sport-work/v2/plan-drawer";
import { PlanSection } from "@/components/sport-work/v2/plan-section";
import { PositionSection } from "@/components/sport-work/v2/position-section";
import { DocumentsSection } from "@/components/sport-work/v2/documents-section";
import { ReasonDialog } from "@/components/sport-work/v2/reason-dialog";
import { RASD_STATUS_SPEC, RELATIONSHIP_STATUS_SPEC, specOf } from "@/components/sport-work/v2/sport-work-status";
import {
  relationshipTypeLabel,
  roleLabel,
  TRANSITION_VERBS,
  withClubId,
  type InstallmentRow,
  type PayoutRow,
  type RelationshipRow,
} from "@/components/sport-work/v2/sport-work-model";

/**
 * `/sport-work/relationships/[id]` — la scheda di un rapporto (Web V2,
 * pattern 2: intestazione di scheda, aree, pannelli a sezioni).
 *
 * Le cinque tab della V1 confluiscono in quattro aree: **Compensi** (piano e
 * scadenze), **Posizione** (le soglie dell'anno), **Registro** (le uscite,
 * storni compresi), **Documenti e anagrafica**. `?tab=` accetta anche i
 * vecchi nomi (`documenti`, `anagrafica`).
 *
 * **Cosa manca per attivare si dice, non si nasconde.** «Attiva» resta
 * visibile e la striscia di avvisi elenca i blocchi: una segreteria che vede
 * «manca il contratto» risolve in due minuti. La cessazione chiede il motivo
 * in una conferma del sistema, non in un `window.prompt`.
 */
type Detail = {
  relationship: RelationshipRow & Record<string, any>;
  person: Record<string, any>;
  plan: any | null;
  installments: InstallmentRow[];
  transactions: PayoutRow[];
  activationBlockers: string[];
};

type Area = "compensi" | "posizione" | "registro" | "documenti";

const AREAS: Array<{ value: Area; label: string }> = [
  { value: "compensi", label: "Compensi" },
  { value: "posizione", label: "Posizione" },
  { value: "registro", label: "Registro" },
  { value: "documenti", label: "Documenti e anagrafica" },
];

const resolveArea = (value: string | null): Area => {
  if (value === "posizione" || value === "registro") return value;
  if (value === "documenti" || value === "anagrafica") return "documenti";
  return "compensi";
};

function RelationshipDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { canManage, canPay } = useSportWorkRole();
  const relationshipId = String(params?.id || "");
  const clubId = searchParams?.get("clubId") || null;
  const area = resolveArea(searchParams?.get("tab") || null);

  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [payoutTarget, setPayoutTarget] = React.useState<string | null>(null);
  const [planOpen, setPlanOpen] = React.useState(false);
  const [reversing, setReversing] = React.useState<PayoutRow | null>(null);
  const [terminating, setTerminating] = React.useState(false);

  const personName = detail ? `${detail.person.first_name || ""} ${detail.person.last_name || ""}`.trim() : null;
  useBreadcrumbLabel(personName);

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await apiRequest<Detail>(`/api/v1/sport-work/relationships/${encodeURIComponent(relationshipId)}?view=detail`);
    setLoading(false);
    if (error || !data) {
      showToast("error", error?.message || "Rapporto non trovato");
      setDetail(null);
      return;
    }
    setDetail(data);
  }, [relationshipId, showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const setArea = (next: Area) => {
    const query = new URLSearchParams();
    if (clubId) query.set("clubId", clubId);
    query.set("tab", next);
    router.replace(`/sport-work/relationships/${encodeURIComponent(relationshipId)}?${query.toString()}`, { scroll: false });
  };

  /* ── Scritture (le stesse della V1) ───────────────────────────────────── */
  const changeStatus = async (status: RelationshipStatus, reason = "") => {
    setBusy(true);
    const { error } = await apiRequest(`/api/v1/sport-work/relationships/${encodeURIComponent(relationshipId)}/status`, { method: "POST", body: { status, reason } });
    setBusy(false);
    if (error) {
      showToast("error", error.message || "Cambio di stato non riuscito");
      return false;
    }
    showToast("success", `Rapporto ${RELATIONSHIP_STATUS_LABELS[status].toLowerCase()}`);
    await load();
    return true;
  };

  const handleReverse = async (reason: string) => {
    if (!reversing) return;
    setBusy(true);
    const { error } = await apiRequest(`/api/v1/sport-work/payouts/${encodeURIComponent(reversing.id)}/reverse`, { method: "POST", body: { reason } });
    setBusy(false);
    if (error) {
      showToast("error", error.message || "Storno non riuscito");
      return;
    }
    showToast("success", "Erogazione stornata");
    setReversing(null);
    await load();
  };

  /* ── Derivati ─────────────────────────────────────────────────────────── */
  const relationship = detail?.relationship;
  const status = String(relationship?.status || "DRAFT") as RelationshipStatus;
  const progress = React.useMemo(() => summarizePlanProgress(detail?.installments || []), [detail?.installments]);
  const transitions = relationship ? listRelationshipTransitions(status) : [];

  const headerActions: RecordAction[] = transitions.map((next) => ({
    id: next,
    label: TRANSITION_VERBS[next] || RELATIONSHIP_STATUS_LABELS[next],
    icon: next === "ACTIVE" ? <CheckCircle2 /> : next === "SUSPENDED" ? <PauseCircle /> : <Ban />,
    tone: next === "TERMINATED" ? "danger" : "default",
    overflow: next === "TERMINATED",
    hidden: !canManage,
    onClick: () => {
      if (next === "TERMINATED") setTerminating(true);
      else void changeStatus(next);
    },
  }));

  const blockers = status === "DRAFT" ? detail?.activationBlockers || [] : [];

  const personFields: DetailField[] = detail
    ? [
        { label: "Codice fiscale", value: <span className="egw-num uppercase">{orMissing(detail.person.fiscal_code)}</span> },
        { label: "Email", value: orMissing(detail.person.email) },
        { label: "Telefono", value: <span className="egw-num">{orMissing(detail.person.phone)}</span> },
        { label: "Data di nascita", value: detail.person.birth_date ? formatDateShort(detail.person.birth_date) : MISSING },
        { label: "Partita IVA", value: <span className="egw-num">{orMissing(detail.person.vat_number)}</span> },
        { label: "IBAN", value: <span className="egw-num uppercase">{orMissing(detail.person.iban)}</span> },
      ]
    : [];

  const relationshipFields: DetailField[] = relationship
    ? [
        { label: "Ruolo", value: roleLabel(relationship.role) },
        { label: "Tipo di rapporto", value: relationshipTypeLabel(relationship.relationship_type) },
        { label: "Inizio", value: relationship.start_date ? formatDateShort(relationship.start_date) : MISSING },
        { label: "Fine", value: relationship.end_date ? formatDateShort(relationship.end_date) : MISSING },
        { label: "Importo pattuito", value: relationship.contract_amount ? <span className="egw-num">{formatMoney(relationship.contract_amount)}</span> : MISSING },
        { label: "Ore settimanali", value: relationship.weekly_hours ? <span className="egw-num">{String(relationship.weekly_hours)}</span> : MISSING },
        { label: "Stato RASD", value: <StatusPill status={specOf(RASD_STATUS_SPEC, relationship.rasd_status)} size="sm" /> },
        ...(relationship.termination_reason ? [{ label: "Motivo della cessazione", value: relationship.termination_reason, wide: true }] : []),
        ...(relationship.notes ? [{ label: "Note", value: relationship.notes, wide: true }] : []),
      ]
    : [];

  return (
    <SportWorkShell title="Rapporto" hideSections>
      {loading ? (
        <>
          <Panel className="flex items-center gap-5">
            <Skeleton className="h-[72px] w-[72px] rounded-full" />
            <div className="flex-1">
              <Skeleton className="mb-3 h-7 w-56" />
              <Skeleton className="h-4 w-40" />
            </div>
          </Panel>
          <DetailCard title="Piano compensi" loading />
        </>
      ) : !detail || !relationship ? (
        <EmptyStateCard
          iconTone="neutral"
          title="Rapporto non trovato"
          description="La scheda che cerchi non è in questo club, oppure il ruolo attivo non può vederla."
          primary={
            <Button variant="primary" onClick={() => router.push(withClubId("/sport-work/relationships", clubId))}>
              Tutti i rapporti
            </Button>
          }
        />
      ) : (
        <>
          <RecordHeader
            eyebrow="Rapporto di lavoro sportivo"
            name={personName || "Rapporto"}
            identity={{ name: personName || "Rapporto", round: true }}
            chips={
              <>
                <DataChip>{roleLabel(relationship.role)}</DataChip>
                <DataChip tone="blue">{relationshipTypeLabel(relationship.relationship_type)}</DataChip>
              </>
            }
            status={<StatusPill status={specOf(RELATIONSHIP_STATUS_SPEC, status)} />}
            meta={
              relationship.start_date
                ? joinMeta(`dal ${formatDateShort(relationship.start_date)}`, relationship.end_date ? `al ${formatDateShort(relationship.end_date)}` : null)
                : null
            }
            actions={headerActions}
            areas={<RecordAreaSwitcher value={area} onChange={setArea} areas={AREAS.map((item) => ({ ...item, problems: item.value === "documenti" ? blockers.length : 0 }))} />}
          >
            <RecordAlertStrip
              items={blockers.map((blocker, index) => ({
                id: `blocker-${index}`,
                severity: "warning",
                text: `Per attivare questo rapporto: ${blocker.charAt(0).toLowerCase()}${blocker.slice(1)}`,
                action:
                  blocker.toLowerCase().includes("contratto") && canManage ? (
                    <Button variant="secondary" size="xs" onClick={() => setArea("documenti")}>
                      Allega il contratto
                    </Button>
                  ) : undefined,
              }))}
            />
          </RecordHeader>

          <KpiBar>
            <KpiCard label="Programmato" value={formatMoney(progress.scheduled)} qualifier="Quanto il piano prevede" />
            <KpiCard label="Maturato" value={formatMoney(progress.accrued)} qualifier="Periodo trascorso: dovuto" />
            <KpiCard label="Erogato" value={formatMoney(progress.paid)} qualifier="Denaro uscito davvero" iconTone="green" />
            <KpiCard
              label="Maturato non erogato"
              value={formatMoney(progress.accruedUnpaid)}
              qualifier="Il debito della società verso questa persona"
              iconTone={progress.accruedUnpaid > 0 ? "amber" : "neutral"}
            />
          </KpiBar>

          {area === "compensi" ? (
            <>
              <PlanSection plan={detail.plan} installments={detail.installments} canManage={canManage} onEdit={() => setPlanOpen(true)} />
              <InstallmentsGrid
                module="sport-work-relationship-installments"
                rows={detail.installments}
                state="ready"
                canPay={canPay}
                onPay={(id) => setPayoutTarget(id)}
                compact
                emptyTitle="Nessuna scadenza"
                emptyDescription="Le scadenze nascono dal piano compensi qui sopra."
              />
            </>
          ) : null}

          {area === "posizione" ? <PositionSection personId={String(detail.person.id)} canManage={canManage} /> : null}

          {area === "registro" ? (
            <PayoutsGrid
              module="sport-work-relationship-payouts"
              rows={detail.transactions}
              state="ready"
              canPay={canPay}
              onReverse={(row) => setReversing(row)}
              compact
            />
          ) : null}

          {area === "documenti" ? (
            <>
              <DocumentsSection relationshipId={relationshipId} personId={String(detail.person.id)} canManage={canManage} onContractAttached={() => void load()} />
              <DetailCard eyebrow="Anagrafica" title="Persona" fields={personFields} />
              <DetailCard eyebrow="Rapporto" title="Condizioni del rapporto" fields={relationshipFields} />
            </>
          ) : null}
        </>
      )}

      <PayoutDrawer open={Boolean(payoutTarget)} onOpenChange={(open) => !open && setPayoutTarget(null)} installmentId={payoutTarget} onDone={() => void load()} />

      <PlanDrawer open={planOpen} onOpenChange={setPlanOpen} relationshipId={relationshipId} hasPlan={Boolean(detail?.plan)} onSaved={() => void load()} />

      <ReasonDialog
        open={Boolean(reversing)}
        onOpenChange={(open) => !open && !busy && setReversing(null)}
        title="Stornare l'erogazione?"
        description={
          reversing
            ? `${formatMoney(reversing.gross_amount)} del ${formatDateShort(reversing.paid_at)}. La riga originale resta nel registro, marcata, con il motivo. Una riga di segno opposto la compensa.`
            : undefined
        }
        confirmLabel="Storna"
        placeholder="Erogazione registrata per errore"
        emptyError="Lo storno richiede un motivo"
        loading={busy}
        onConfirm={handleReverse}
      />

      <ReasonDialog
        open={terminating}
        onOpenChange={(open) => !open && !busy && setTerminating(false)}
        title={`Cessare il rapporto di ${personName || "questa persona"}?`}
        description="La cessazione è un atto, non uno stato di lavorazione: il rapporto non si modifica più e non riceve nuove scadenze."
        confirmLabel="Cessa"
        reasonLabel="Motivo della cessazione"
        emptyError="La cessazione richiede un motivo"
        tone="danger"
        loading={busy}
        onConfirm={async (reason) => {
          const ok = await changeStatus("TERMINATED", reason);
          if (ok) setTerminating(false);
        }}
      />
    </SportWorkShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RelationshipDetailPage />
    </Suspense>
  );
}
