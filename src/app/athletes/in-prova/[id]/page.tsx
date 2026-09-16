"use client";

import * as React from "react";
import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { Pencil, UserCheck, UserRound, UserX } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { RecordHeader, type RecordAction } from "@/components/web/record/Record";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Button } from "@/components/web/primitives/Button";
import { useConfirm } from "@/components/web/overlays/useConfirm";
import { useBreadcrumbLabel } from "@/components/web/shell/ShellProvider";
import { useRouteClubId, withClubId } from "@/components/web/hooks/use-route-club-id";
import { roleHasPermission } from "@/lib/permissions/catalog";
import { formatDateShort, joinMeta } from "@/lib/web/format";
import {
  convertTrialAthlete,
  readTrialAthlete,
  setTrialAthleteStatus,
  updateTrialAthlete,
  type TrialAthlete,
  type TrialAttendanceRow,
} from "@/lib/trials/client";
import { TrialProfile } from "@/components/trials/v2/TrialProfile";
import { TrialFormDrawer } from "@/components/trials/v2/TrialFormDrawer";
import { TrialConvertDrawer } from "@/components/trials/v2/TrialConvertDrawer";
import { useTrialCatalog } from "@/components/trials/v2/use-trial-catalog";
import { TRIAL_STATUS_LABEL, ageFromBirthDate, trialFormDiff, trialStatusSpec, type TrialFormState } from "@/components/trials/v2/trial-model";

/**
 * `/athletes/in-prova/[id]` — la scheda di una persona in prova (ADR-0188):
 * pattern 2 «scheda» del Web V2, con l'intestazione del record, i dati, i
 * recapiti per chi puo leggerli, lo storico delle prove, e le tre azioni —
 * modifica, non prosegue / riporta in prova, converti in atleta — secondo il
 * catalogo dei permessi.
 */
function TrialAthleteRecordContent() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id || "");
  const router = useRouter();
  const { showToast } = useToast();
  const { activeClub } = useAuth();
  const { clubId } = useRouteClubId(activeClub?.id ? String(activeClub.id) : null);
  const role = activeClub?.role || null;
  const catalog = useTrialCatalog(clubId);
  const [confirm, confirmDialog] = useConfirm();

  const canManage = roleHasPermission(role, "trials.manage");
  const canConvert = roleHasPermission(role, "trials.convert");
  const canReadContacts = roleHasPermission(role, "trials.contacts_read");

  const [trial, setTrial] = React.useState<TrialAthlete | null>(null);
  const [attendances, setAttendances] = React.useState<TrialAttendanceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [convertOpen, setConvertOpen] = React.useState(false);
  const [convertSaving, setConvertSaving] = React.useState(false);

  useBreadcrumbLabel(trial?.name || null);

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await readTrialAthlete(id);
      setTrial(data.trial);
      setAttendances(data.attendances);
    } catch (caught: any) {
      setError(caught?.message || "Persona in prova non trovata");
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const submitEdit = async (form: TrialFormState) => {
    if (!trial) return;
    setSaving(true);
    try {
      const diff = trialFormDiff(form, trial);
      if (Object.keys(diff).length) setTrial(await updateTrialAthlete(trial.id, diff));
      setEditOpen(false);
      showToast("success", "Persona in prova aggiornata");
    } catch (caught: any) {
      showToast("error", caught?.message || "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: "in_trial" | "declined") => {
    if (!trial) return;
    const ok = await confirm(
      status === "declined"
        ? { title: `Segnare ${trial.name} come «non prosegue»?`, description: "Lo storico delle prove resta consultabile.", confirmLabel: "Segna «non prosegue»" }
        : { title: `Riportare ${trial.name} in prova?`, description: "Tornera fra le persone che si possono segnare presenti.", confirmLabel: "Riporta in prova" },
    );
    if (!ok) return;
    try {
      setTrial(await setTrialAthleteStatus(trial.id, status));
      showToast("success", status === "declined" ? "Segnata come «non prosegue»" : "Riportata in prova");
    } catch (caught: any) {
      showToast("error", caught?.message || "Cambio di stato non riuscito");
    }
  };

  const submitConvert = async (input: { athleteId?: string; create?: { categoryId?: string | null; siteId?: string | null } }) => {
    if (!trial) return;
    setConvertSaving(true);
    try {
      const result = await convertTrialAthlete(trial.id, input);
      setTrial(result.trial);
      setConvertOpen(false);
      showToast("success", result.created ? "Scheda atleta creata" : "Collegata alla scheda esistente");
    } catch (caught: any) {
      showToast("error", caught?.message || "Conversione non riuscita");
    } finally {
      setConvertSaving(false);
    }
  };

  const actions: RecordAction[] = trial
    ? [
        { id: "convert", label: "Converti in atleta", icon: <UserCheck />, onClick: () => setConvertOpen(true), hidden: !canConvert || trial.status === "enrolled" },
        { id: "edit", label: "Modifica", icon: <Pencil />, onClick: () => setEditOpen(true), hidden: !canManage || trial.status === "enrolled" },
        { id: "decline", label: "Non prosegue", icon: <UserX />, onClick: () => void changeStatus("declined"), hidden: !canManage || trial.status !== "in_trial", overflow: true },
        { id: "resume", label: "Riporta in prova", icon: <UserRound />, onClick: () => void changeStatus("in_trial"), hidden: !canManage || trial.status !== "declined", overflow: true },
      ]
    : [];

  const eta = trial ? ageFromBirthDate(trial.birthDate) : null;

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title={trial?.name || "Persona in prova"} />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            {error ? (
              <AlertBlock
                severity="danger"
                title={error}
                actions={
                  <Button variant="secondary" size="sm" onClick={() => router.push(withClubId("/athletes/in-prova", clubId))}>
                    Torna alle persone in prova
                  </Button>
                }
              />
            ) : null}

            {trial ? (
              <RecordHeader
                eyebrow="Persona in prova"
                name={trial.name}
                identity={{ name: trial.name, round: true }}
                chips={trial.categoryLabel ? <DataChip>{trial.categoryLabel}</DataChip> : null}
                status={<StatusPill status={trialStatusSpec(trial.status)} />}
                meta={joinMeta(`nato il ${formatDateShort(trial.birthDate)}`, eta !== null ? `${eta} anni` : null, trial.siteName, TRIAL_STATUS_LABEL[trial.status])}
                actions={actions}
              />
            ) : null}

            <TrialProfile
              trial={trial}
              attendances={attendances}
              loading={loading}
              canReadContacts={canReadContacts}
              onEdit={canManage && trial && trial.status !== "enrolled" ? () => setEditOpen(true) : undefined}
              athleteHref={(athleteId) => withClubId(`/athletes/${athleteId}`, clubId)}
            />
          </DashboardPageContainer>
        </main>
      </div>

      <TrialFormDrawer
        open={editOpen}
        onOpenChange={setEditOpen}
        trial={trial}
        existing={[]}
        categoryOptions={catalog.categoryOptions}
        groupOptions={catalog.groupOptions}
        siteOptions={catalog.siteOptions}
        canEditContacts={canReadContacts}
        saving={saving}
        onSubmit={submitEdit}
      />

      {canConvert ? (
        <TrialConvertDrawer open={convertOpen} onOpenChange={setConvertOpen} trial={trial} categoryOptions={catalog.categoryOptions} saving={convertSaving} onConvert={submitConvert} />
      ) : null}

      {confirmDialog}
    </div>
  );
}

export default function TrialAthleteRecordPage() {
  return (
    <Suspense fallback={null}>
      <TrialAthleteRecordContent />
    </Suspense>
  );
}
