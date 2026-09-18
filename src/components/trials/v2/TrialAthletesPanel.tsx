"use client";

import { natoIl } from "@/components/trials/v2/TrialHomonymsNotice";
import * as React from "react";
import { Pencil, Plus, UserCheck, UserRound, UserX, Users } from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { Drawer } from "@/components/web/overlays/Drawer";
import { useConfirm } from "@/components/web/overlays/useConfirm";
import { formatDateShort, formatInteger, joinMeta, MISSING } from "@/lib/web/format";
import {
  convertTrialAthlete,
  createTrialAthlete,
  listTrialAthletes,
  readTrialAthlete,
  setTrialAthleteStatus,
  updateTrialAthlete,
  type TrialAthlete,
  type TrialAttendanceRow,
} from "@/lib/trials/client";
import { TrialFormDrawer } from "@/components/trials/v2/TrialFormDrawer";
import { TrialConvertDrawer } from "@/components/trials/v2/TrialConvertDrawer";
import { TrialProfile } from "@/components/trials/v2/TrialProfile";
import { useTrialCatalog } from "@/components/trials/v2/use-trial-catalog";
import {
  TRIAL_STATUS_LABEL,
  TRIAL_VIEWS,
  ageFromBirthDate,
  trialFormDiff,
  trialFormToInput,
  trialStatusSpec,
  type TrialFormState,
} from "@/components/trials/v2/trial-model";

/**
 * **La vista «Atleti in prova»** (ADR-0188): l'elenco, il modulo, lo stato,
 * la conversione. Un pezzo solo, montato dalla pagina del club
 * (`/athletes/in-prova`) e dall'area dell'allenatore, che differiscono per
 * cio che il ruolo puo fare — e lo dicono le prop, che la pagina ricava dal
 * catalogo dei permessi — non per il codice.
 *
 * Non e una categoria «In prova»: e uno stato di persona. Lo dicono le
 * viste (In prova · Tutte · Iscritti · Non proseguono) e la pillola.
 */
export type TrialAthletesPanelProps = {
  clubId: string | null | undefined;
  canManage: boolean;
  canConvert: boolean;
  canReadContacts: boolean;
  /** `page`: la riga apre la scheda a pagina intera; `drawer`: la apre in un cassetto (area allenatore). */
  profileMode: "page" | "drawer";
  profileHref?: (id: string) => string;
  athleteHref?: (athleteId: string) => string;
  /** Intestazione sopra la griglia (la pagina del club ha la sua `PageHeader`). */
  header?: (context: { count: number; openCreate: () => void }) => React.ReactNode;
  onNavigate?: (href: string) => void;
};

export function TrialAthletesPanel({
  clubId,
  canManage,
  canConvert,
  canReadContacts,
  profileMode,
  profileHref,
  athleteHref,
  header,
  onNavigate,
}: TrialAthletesPanelProps) {
  const { showToast } = useToast();
  const catalog = useTrialCatalog(clubId);
  const [rows, setRows] = React.useState<TrialAthlete[]>([]);
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TrialAthlete | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [converting, setConverting] = React.useState<TrialAthlete | null>(null);
  const [convertSaving, setConvertSaving] = React.useState(false);
  const [profile, setProfile] = React.useState<{ trial: TrialAthlete; attendances: TrialAttendanceRow[] } | null>(null);
  const [profileLoading, setProfileLoading] = React.useState(false);
  const [confirm, confirmDialog] = useConfirm();

  const reload = React.useCallback(async () => {
    if (!clubId) return;
    try {
      setState("loading");
      setError(null);
      setRows(await listTrialAthletes());
      setState("ready");
    } catch (caught: any) {
      setError(caught?.message || "Impossibile leggere le persone in prova");
      setState("error");
    }
  }, [clubId]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (trial: TrialAthlete) => {
    setEditing(trial);
    setFormOpen(true);
  };

  const openProfile = async (trial: TrialAthlete) => {
    if (profileMode === "page") {
      const href = profileHref ? profileHref(trial.id) : `/athletes/in-prova/${trial.id}`;
      if (onNavigate) onNavigate(href);
      else window.location.assign(href);
      return;
    }
    setProfileLoading(true);
    setProfile({ trial, attendances: [] });
    try {
      setProfile(await readTrialAthlete(trial.id));
    } catch (caught: any) {
      showToast("error", caught?.message || "Impossibile leggere la scheda");
    } finally {
      setProfileLoading(false);
    }
  };

  const submitForm = async (form: TrialFormState) => {
    setSaving(true);
    try {
      if (editing) {
        const diff = trialFormDiff(form, editing);
        const updated = Object.keys(diff).length ? await updateTrialAthlete(editing.id, diff) : editing;
        setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
        if (profile?.trial.id === updated.id) setProfile((current) => (current ? { ...current, trial: updated } : current));
        showToast("success", "Persona in prova aggiornata");
      } else {
        const created = await createTrialAthlete(trialFormToInput(form));
        setRows((current) => [created, ...current]);
        showToast("success", `${created.name} registrata in prova`);
      }
      setFormOpen(false);
      setEditing(null);
    } catch (caught: any) {
      showToast("error", caught?.message || "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (trial: TrialAthlete, status: "in_trial" | "declined") => {
    const ok = await confirm(
      status === "declined"
        ? {
            title: `Segnare ${trial.name} come «non prosegue»?`,
            description: "Lo storico delle prove resta consultabile. La persona non comparira piu nel registro presenze.",
            confirmLabel: "Segna «non prosegue»",
          }
        : {
            title: `Riportare ${trial.name} in prova?`,
            description: "Tornera fra le persone che si possono segnare presenti.",
            confirmLabel: "Riporta in prova",
          },
    );
    if (!ok) return;
    try {
      const updated = await setTrialAthleteStatus(trial.id, status);
      setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      if (profile?.trial.id === updated.id) setProfile((current) => (current ? { ...current, trial: updated } : current));
      showToast("success", status === "declined" ? "Segnata come «non prosegue»" : "Riportata in prova");
    } catch (caught: any) {
      showToast("error", caught?.message || "Cambio di stato non riuscito");
    }
  };

  const submitConvert = async (input: { athleteId?: string; create?: { categoryId?: string | null; siteId?: string | null; birthDate?: string | null } }) => {
    if (!converting) return;
    setConvertSaving(true);
    try {
      const result = await convertTrialAthlete(converting.id, input);
      setRows((current) => current.map((row) => (row.id === result.trial.id ? result.trial : row)));
      if (profile?.trial.id === result.trial.id) setProfile((current) => (current ? { ...current, trial: result.trial } : current));
      showToast("success", result.created ? `Scheda atleta creata per ${result.trial.name}` : `${result.trial.name} collegata alla scheda esistente`);
      setConverting(null);
    } catch (caught: any) {
      showToast("error", caught?.message || "Conversione non riuscita");
    } finally {
      setConvertSaving(false);
    }
  };

  const columns = React.useMemo<ColumnDef<TrialAthlete>[]>(
    () => [
      {
        id: "identity",
        header: "Persona",
        kind: "identity",
        locked: true,
        width: 2,
        minWidth: 200,
        cell: (row) => {
          const eta = ageFromBirthDate(row.birthDate);
          return (
            <IdentityCell
              name={row.name}
              meta={joinMeta(natoIl(row.birthDate), eta !== null ? `${eta} anni` : null)}
              onClick={() => void openProfile(row)}
            />
          );
        },
        sortValue: (row) => `${row.lastName} ${row.firstName}`.toLowerCase(),
        exportValue: (row) => row.name,
      },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        width: "128px",
        cell: (row) => <StatusPill status={trialStatusSpec(row.status)} size="sm" />,
        sortValue: (row) => row.status,
        exportValue: (row) => TRIAL_STATUS_LABEL[row.status],
      },
      {
        id: "category",
        header: "Categoria",
        kind: "classification",
        cell: (row) => (row.categoryLabel ? <DataChip>{row.categoryLabel}</DataChip> : <span className="text-egw-ink-42">{MISSING}</span>),
        sortValue: (row) => row.categoryLabel || "",
        exportValue: (row) => row.categoryLabel || "",
      },
      {
        id: "site",
        header: "Sede",
        kind: "text",
        hidden: catalog.sites.length <= 1,
        cell: (row) => row.siteName || <span className="text-egw-ink-42">{MISSING}</span>,
        sortValue: (row) => row.siteName || "",
      },
      {
        id: "trials",
        header: "Prove",
        kind: "number",
        align: "right",
        width: "84px",
        cell: (row) => <span className="egw-num font-bold">{formatInteger(row.trialsCount)}</span>,
        sortValue: (row) => row.trialsCount,
      },
      {
        id: "first",
        header: "Prima prova",
        kind: "date",
        width: "128px",
        cell: (row) => (row.firstTrialAt ? <span className="egw-num">{formatDateShort(row.firstTrialAt)}</span> : <span className="text-egw-ink-42">{MISSING}</span>),
        sortValue: (row) => row.firstTrialAt || "",
      },
      {
        id: "last",
        header: "Ultima prova",
        kind: "date",
        width: "128px",
        cell: (row) => (row.lastTrialAt ? <span className="egw-num">{formatDateShort(row.lastTrialAt)}</span> : <span className="text-egw-ink-42">{MISSING}</span>),
        sortValue: (row) => row.lastTrialAt || "",
      },
      ...(canReadContacts
        ? [
            {
              id: "contact",
              header: "Contatto",
              kind: "text" as const,
              cell: (row: TrialAthlete) => joinMeta(row.phone, row.guardianPhone ? `tutore ${row.guardianPhone}` : null) || <span className="text-egw-ink-42">{MISSING}</span>,
              exportValue: (row: TrialAthlete) => joinMeta(row.phone, row.email, row.guardianName, row.guardianPhone),
            },
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canReadContacts, catalog.sites.length, profileMode],
  );

  const filters = React.useMemo<FilterDef<TrialAthlete>[]>(
    () => [
      {
        id: "stato",
        label: "Stato",
        type: "select",
        pinned: true,
        options: (Object.keys(TRIAL_STATUS_LABEL) as Array<keyof typeof TRIAL_STATUS_LABEL>).map((key) => ({
          value: key,
          label: TRIAL_STATUS_LABEL[key],
          count: rows.filter((row) => row.status === key).length,
        })),
        apply: (row, value) => !value || row.status === value,
      },
      {
        id: "categoria",
        label: "Categoria",
        type: "select",
        options: catalog.categoryOptions.map((option) => ({ value: option.id, label: option.label })),
        apply: (row, value) => !value || row.categoryId === value,
      },
    ],
    [catalog.categoryOptions, rows],
  );

  const rowActions = React.useMemo<RowActionDef<TrialAthlete>[]>(
    () => [
      { id: "open", label: "Apri scheda", icon: <UserRound />, onClick: (row) => void openProfile(row), primary: true },
      ...(canManage
        ? [
            { id: "edit", label: "Modifica", icon: <Pencil />, onClick: (row: TrialAthlete) => openEdit(row), hidden: (row: TrialAthlete) => row.status === "enrolled" },
            { id: "decline", label: "Non prosegue", icon: <UserX />, onClick: (row: TrialAthlete) => void changeStatus(row, "declined"), hidden: (row: TrialAthlete) => row.status !== "in_trial" },
            { id: "resume", label: "Riporta in prova", icon: <UserRound />, onClick: (row: TrialAthlete) => void changeStatus(row, "in_trial"), hidden: (row: TrialAthlete) => row.status !== "declined" },
          ]
        : []),
      ...(canConvert
        ? [{ id: "convert", label: "Converti in atleta", icon: <UserCheck />, onClick: (row: TrialAthlete) => setConverting(row), hidden: (row: TrialAthlete) => row.status === "enrolled" }]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canConvert, canManage, profileMode],
  );

  const views = TRIAL_VIEWS as unknown as ViewDef[];
  const inProva = rows.filter((row) => row.status === "in_trial").length;

  return (
    <>
      {header ? header({ count: inProva, openCreate }) : null}
      <DataGrid<TrialAthlete>
        module="trial-athletes"
        aria-label="Persone in prova"
        rows={rows}
        getRowId={(row) => row.id}
        columns={columns}
        filters={filters}
        views={views}
        search={{
          placeholder: "Cerca per nome o data di nascita",
          match: (row, query) => `${row.name} ${row.lastName} ${row.firstName} ${row.birthDate || ""}`.toLowerCase().includes(query.toLowerCase()),
        }}
        defaultSort={{ columnId: "last", direction: "desc" }}
        rowActions={rowActions}
        onOpenRow={(row) => void openProfile(row)}
        state={state}
        errorMessage={error}
        onRetry={reload}
        canSelect={false}
        noun={{ singular: "persona in prova", plural: "persone in prova", gender: "f" }}
        rowLabel={(row) => row.name}
        empty={{
          icon: <Users />,
          title: "Nessuna persona in prova",
          description: "Chi viene ad allenarsi prima di iscriversi si registra qui, o dal registro presenze dell'allenamento con «Atleta in prova».",
          primary: canManage ? (
            <Button variant="primary" size="sm" icon={<Plus />} onClick={openCreate}>
              Registra una persona in prova
            </Button>
          ) : undefined,
        }}
      />

      <TrialFormDrawer
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        trial={editing}
        existing={rows}
        categoryOptions={catalog.categoryOptions}
        targetOptions={catalog.targetOptions}
        canEditContacts={canReadContacts}
        saving={saving}
        onSubmit={submitForm}
        onPickExisting={(trial) => {
          setFormOpen(false);
          void openProfile(trial);
        }}
      />

      {canConvert ? (
        <TrialConvertDrawer
          open={Boolean(converting)}
          onOpenChange={(open) => {
            if (!open) setConverting(null);
          }}
          trial={converting}
          targetOptions={catalog.targetOptions}
          saving={convertSaving}
          onConvert={submitConvert}
        />
      ) : null}

      {profileMode === "drawer" ? (
        <Drawer
          open={Boolean(profile)}
          onOpenChange={(open) => {
            if (!open) setProfile(null);
          }}
          width="wide"
          eyebrow="Persona in prova"
          title={profile?.trial.name || "Scheda"}
          description={profile ? joinMeta(TRIAL_STATUS_LABEL[profile.trial.status], profile.trial.categoryLabel) : undefined}
          bodyClassName="bg-egw-page"
          footer={
            profile && canManage && profile.trial.status !== "enrolled" ? (
              <>
                <Button variant="secondary" icon={<Pencil />} onClick={() => openEdit(profile.trial)}>
                  Modifica
                </Button>
                {profile.trial.status === "in_trial" ? (
                  <Button variant="text" icon={<UserX />} onClick={() => void changeStatus(profile.trial, "declined")}>
                    Non prosegue
                  </Button>
                ) : (
                  <Button variant="text" icon={<UserRound />} onClick={() => void changeStatus(profile.trial, "in_trial")}>
                    Riporta in prova
                  </Button>
                )}
              </>
            ) : undefined
          }
        >
          <TrialProfile trial={profile?.trial || null} attendances={profile?.attendances || []} loading={profileLoading} canReadContacts={canReadContacts} athleteHref={athleteHref} />
        </Drawer>
      ) : null}

      {confirmDialog}
    </>
  );
}
