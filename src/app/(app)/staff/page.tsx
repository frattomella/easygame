"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, FileDown, FileSpreadsheet, MoreHorizontal, Pencil, Plus, Trash2, UserCheck, UserX, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { HeaderStat, PageHeader } from "@/components/web/page/PageHeader";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/web/primitives/Overlays";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { BulkActionDef, ColumnDef, ExportRequest, FilterDef, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { certificateStatusFromExpiry } from "@/lib/web/status";
import { daysUntil, formatDateShort, formatInteger, joinMeta } from "@/lib/web/format";
import { exportPeopleCsv, exportPeoplePdf } from "@/lib/person-export";
import type { SelectionScope } from "@/lib/list-selection";
import {
  countStaffByDepartment,
  findStaffDepartment,
  normalizeDepartmentName,
  upsertStaffDepartment,
  type StaffDepartment,
} from "@/lib/staff-directory";
import { deleteStaffDepartment, resolveStaffDepartments, saveStaffDepartments } from "@/lib/api/staff-departments";
import { DepartmentsDrawer } from "@/components/staff/v2/departments-drawer";
import { MoveDepartmentDrawer } from "@/components/staff/v2/move-department-drawer";
import { DeleteStaffDialog } from "@/components/staff/v2/delete-staff-dialog";
import { useStaffAccessEmails } from "@/components/staff/v2/use-staff-access-emails";
import { useRouteClubId, withClubId } from "@/components/web/hooks/use-route-club-id";
import {
  departmentChipTone,
  getStaffDisplayName,
  getStaffIdentity,
  isStaffActive,
  staffHireDate,
  staffStatusSpec,
  type StaffMember,
} from "@/components/staff/v2/staff-model";

/**
 * `/staff` — elenco dello staff (Web V2, pattern 1: intestazione di pagina +
 * DataGrid a tutta larghezza).
 *
 * La griglia unica sostituisce sia la tabella sia la vista a card della V1:
 * cio che la card mostrava (ruolo come sottotitolo, stato, reparto, email,
 * telefono, data di assunzione) sono colonne o la riga meta dell'identita.
 * I dati e le scritture sono quelli della V1: `clubs.staff_members` letto e
 * riscritto in **una** UPDATE per l'intero lotto, i reparti tramite
 * `saveStaffDepartments`/`deleteStaffDepartment` (mai il blob `settings`).
 */
const NO_DEPARTMENT = "__none__";

const STATUS_FILTER_OPTIONS = [
  { value: "active", label: "Attivo" },
  { value: "inactive", label: "Inattivo" },
  { value: "on_leave", label: "In congedo" },
];

const STAFF_VIEWS: ViewDef[] = [
  { id: "active", label: "Attivi", filters: { status: "active" }, builtIn: true },
  { id: "inactive", label: "Non attivi", filters: { status: "inactive" }, builtIn: true },
  { id: "no-department", label: "Senza reparto", filters: { department: NO_DEPARTMENT }, builtIn: true, tone: "amber" },
];

const statusKey = (member: StaffMember) => {
  const key = String(member.status || "").trim().toLowerCase();
  if (!key || key === "active" || key === "attivo") return key ? "active" : "";
  if (key === "on_leave" || key === "in congedo") return "on_leave";
  return "inactive";
};

export default function StaffPage() {
  const router = useRouter();
  const { activeClub } = useAuth();
  const { showToast } = useToast();
  const { clubId, resolved } = useRouteClubId(null);
  const access = useStaffAccessEmails();

  const [staffMembers, setStaffMembers] = React.useState<StaffMember[]>([]);
  const [departments, setDepartments] = React.useState<StaffDepartment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [departmentsOpen, setDepartmentsOpen] = React.useState(false);
  const [moveRows, setMoveRows] = React.useState<StaffMember[] | null>(null);
  const [deleting, setDeleting] = React.useState<StaffMember | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => {
    if (!resolved) return;
    if (!clubId) {
      setLoading(false);
      setStaffMembers([]);
      setDepartments([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data: clubData, error } = await supabase
          .from("clubs")
          .select("staff_members, settings")
          .eq("id", clubId)
          .single();
        if (cancelled) return;
        if (error) throw error;
        const members: StaffMember[] = Array.isArray(clubData?.staff_members) ? clubData.staff_members : [];
        const settings = clubData?.settings && typeof clubData.settings === "object" ? clubData.settings : {};
        setStaffMembers(members);
        setDepartments(resolveStaffDepartments(settings, members));
        setLoadError(null);
        // Un id selezionato che non esiste piu mostrerebbe un conteggio che
        // non corrisponde a niente.
        setSelectedIds((current) => new Set(Array.from(current).filter((id) => members.some((m) => String(m.id) === id))));
      } catch (error) {
        if (cancelled) return;
        if (process.env.NODE_ENV === "development") console.error("Error loading staff:", error);
        setStaffMembers([]);
        setDepartments([]);
        setLoadError(error instanceof Error ? error.message : null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [clubId, resolved, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  /* ── Scritture ─────────────────────────────────────────────────────────── */

  /**
   * Membri e reparti si salvano separatamente, e non per pigrizia: `settings`
   * e una colonna JSON sola, e `saveStaffDepartments` la rilegge prima di
   * riscriverla, cosi una stagione cambiata nel frattempo non torna indietro.
   */
  const writeStaffMembers = async (next: StaffMember[]) => {
    if (!clubId) throw new Error("ID del club mancante");
    const { error } = await supabase.from("clubs").update({ staff_members: next }).eq("id", clubId);
    if (error) throw error;
  };

  const handleSaveDepartment = async (department: StaffDepartment) => {
    const normalized = { ...department, name: normalizeDepartmentName(department.name) };
    if (!normalized.name) return;
    const next = upsertStaffDepartment(departments, normalized);
    setDepartments(next);
    try {
      if (clubId) await saveStaffDepartments(clubId, next);
    } catch (error) {
      console.error("Error saving department:", error);
      showToast("error", "Operazione non riuscita");
    }
  };

  const handleDeleteDepartment = async (departmentId: string) => {
    const removed = departments.find((d) => d.id === departmentId);
    const removedName = normalizeDepartmentName(removed?.name);
    const nextDepartments = departments.filter((d) => d.id !== departmentId);
    const nextMembers = removedName
      ? staffMembers.map((member) =>
          normalizeDepartmentName(member.department).toLowerCase() === removedName.toLowerCase() ? { ...member, department: "" } : member,
        )
      : staffMembers;
    setDepartments(nextDepartments);
    setStaffMembers(nextMembers);
    try {
      if (clubId) {
        await writeStaffMembers(nextMembers);
        await deleteStaffDepartment(clubId, departmentId);
      }
    } catch (error) {
      console.error("Error deleting department:", error);
      showToast("error", "Operazione non riuscita");
    }
  };

  const confirmDelete = async () => {
    if (!deleting || !clubId) return;
    const memberId = deleting.id;
    setDeleteBusy(true);
    const previous = staffMembers;
    const next = staffMembers.filter((member) => member.id !== memberId);
    setStaffMembers(next);
    try {
      await writeStaffMembers(next);
      setSelectedIds((current) => {
        const copy = new Set(current);
        copy.delete(String(memberId));
        return copy;
      });
      showToast("success", "Membro dello staff eliminato con successo");
      setDeleting(null);
    } catch (error) {
      console.error("Error deleting staff member:", error);
      setStaffMembers(previous);
      showToast("error", "Errore nell'eliminazione del membro dello staff");
      reload();
    } finally {
      setDeleteBusy(false);
    }
  };

  /**
   * Scrive la stessa modifica su ogni membro selezionato, in **una sola**
   * scrittura: lo staff vive in un unico array JSONB, e dieci scritture
   * separate possono fermarsi alla settima e lasciare l'elenco a meta.
   */
  const applyToRows = async (rows: StaffMember[], updatesFor: (member: StaffMember) => Record<string, any>, successMessage: (count: number) => string) => {
    if (!clubId || bulkBusy) return;
    const targetIds = new Set(rows.map((m) => String(m.id)));
    if (!targetIds.size) return;
    setBulkBusy(true);
    const previous = staffMembers;
    const updated = staffMembers.map((member) => (targetIds.has(String(member.id)) ? { ...member, ...updatesFor(member) } : member));
    try {
      setStaffMembers(updated);
      await writeStaffMembers(updated);
      showToast("success", successMessage(targetIds.size));
    } catch (error) {
      console.error("Error running bulk staff action:", error);
      setStaffMembers(previous);
      showToast("error", "Operazione non riuscita");
    } finally {
      setBulkBusy(false);
    }
  };

  const setRowsStatus = (rows: StaffMember[], status: "active" | "inactive") =>
    applyToRows(rows, () => ({ status }), (count) => `${count} membri dello staff ${status === "active" ? "attivati" : "disattivati"}`);

  /* ── Esportazione (stesso motore della V1: person-export) ──────────────── */
  const runExport = (kind: "csv" | "pdf", rows: StaffMember[], columnIds: string[], requestScope: "filtered" | "selected") => {
    const visibleColumns = {
      name: true,
      role: columnIds.includes("role"),
      department: columnIds.includes("department"),
      email: columnIds.includes("email"),
      phone: columnIds.includes("phone"),
      status: columnIds.includes("status"),
      hireDate: columnIds.includes("hireDate"),
    };
    const scope: SelectionScope = requestScope === "selected" ? "selected" : rows.length === staffMembers.length ? "all" : "filtered";
    const people = rows as unknown as Record<string, any>[];
    const clubName = activeClub?.name || "EasyGame";
    if (kind === "pdf") {
      const result = exportPeoplePdf({
        entity: "staff",
        people,
        clubName,
        visibleColumns,
        scope,
      });
      if (!result.ok) {
        showToast("error", result.reason === "empty" ? "Nessun elemento da esportare" : "Consenti i popup per generare il PDF");
        return;
      }
      showToast("success", "PDF pronto: si apre la finestra di stampa");
      return;
    }
    const result = exportPeopleCsv({
      entity: "staff",
      people,
      clubName,
      visibleColumns,
      scope,
    });
    if (!result.ok) {
      showToast("error", "Nessun elemento da esportare");
      return;
    }
    showToast("success", "CSV scaricato");
  };

  const defaultExportColumnIds = ["role", "department", "email", "phone", "status", "hireDate"];

  /* ── Griglia ───────────────────────────────────────────────────────────── */
  const recordHref = (member: StaffMember) => withClubId(`/staff/${member.id}`, clubId);

  const columns = React.useMemo<ColumnDef<StaffMember>[]>(() => {
    const base: ColumnDef<StaffMember>[] = [
      {
        id: "identity",
        header: "Nome",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => (
          <IdentityCell
            name={getStaffDisplayName(row)}
            round
            href={recordHref(row)}
            onClick={() => router.push(recordHref(row))}
            meta={joinMeta(row.role, normalizeDepartmentName(row.department) || "Non assegnato")}
          />
        ),
        sortValue: (row) => {
          const identity = getStaffIdentity(row);
          return `${identity.lastName} ${identity.firstName}`.trim().toLowerCase();
        },
        exportValue: (row) => getStaffDisplayName(row),
        title: (row) => getStaffDisplayName(row),
      },
      {
        id: "department",
        header: "Reparto",
        kind: "classification",
        cell: (row) => {
          const name = normalizeDepartmentName(row.department);
          if (!name) return <DataChip size="sm">Non assegnato</DataChip>;
          return (
            <DataChip size="sm" tone={departmentChipTone(findStaffDepartment(departments, name))} title={name}>
              {name}
            </DataChip>
          );
        },
        sortValue: (row) => normalizeDepartmentName(row.department).toLowerCase() || null,
        exportValue: (row) => normalizeDepartmentName(row.department),
        title: (row) => normalizeDepartmentName(row.department) || "Non assegnato",
      },
      {
        id: "role",
        header: "Ruolo",
        kind: "classification",
        cell: (row) => String(row.role || "").trim(),
        sortValue: (row) => String(row.role || "").trim().toLowerCase() || null,
      },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={staffStatusSpec(row.status)} />,
        sortValue: (row) => statusKey(row),
        exportValue: (row) => staffStatusSpec(row.status).label,
      },
    ];
    if (access.enabled) {
      base.push({
        id: "access",
        header: "Accesso EasyGame",
        kind: "status",
        cell: (row) => {
          const spec = access.statusFor(row.email);
          return spec ? <StatusPill status={spec} /> : null;
        },
        sortValue: (row) => access.statusFor(row.email)?.label ?? null,
        exportValue: (row) => access.statusFor(row.email)?.label ?? "",
      });
    }
    base.push(
      {
        id: "email",
        header: "Email",
        kind: "text",
        minWidth: 160,
        cell: (row) => String(row.email || "").trim(),
        sortValue: (row) => String(row.email || "").trim().toLowerCase() || null,
      },
      {
        id: "phone",
        header: "Telefono",
        kind: "text",
        cell: (row) => <span className="egw-num">{String(row.phone || "").trim()}</span>,
        sortValue: (row) => String(row.phone || "").trim() || null,
        exportValue: (row) => String(row.phone || "").trim(),
        title: (row) => String(row.phone || "").trim() || undefined,
      },
      {
        id: "hireDate",
        header: "Data assunzione",
        kind: "date",
        cell: (row) => (staffHireDate(row) ? formatDateShort(staffHireDate(row)) : null),
        sortValue: (row) => staffHireDate(row) || null,
        exportValue: (row) => staffHireDate(row),
      },
      {
        id: "documentExpiry",
        header: "Scadenza documento",
        kind: "status",
        hidden: true,
        cell: (row) => {
          const expiry = String(row.documentExpiry || "").trim();
          if (!expiry) return null;
          const days = daysUntil(expiry);
          return <StatusPill status={certificateStatusFromExpiry(days)} detail={formatDateShort(expiry)} />;
        },
        sortValue: (row) => String(row.documentExpiry || "").trim() || null,
        exportValue: (row) => String(row.documentExpiry || "").trim(),
        title: (row) => (row.documentExpiry ? formatDateShort(row.documentExpiry) : undefined),
      },
      {
        id: "fiscalCode",
        header: "Codice fiscale",
        kind: "text",
        hidden: true,
        cell: (row) => <span className="egw-num uppercase">{String(row.fiscalCode || row.fiscal_code || "").trim()}</span>,
        sortValue: (row) => String(row.fiscalCode || row.fiscal_code || "").trim() || null,
        exportValue: (row) => String(row.fiscalCode || row.fiscal_code || "").trim(),
      },
      {
        id: "city",
        header: "Comune di residenza",
        kind: "text",
        hidden: true,
        cell: (row) => String(row.city || "").trim(),
        sortValue: (row) => String(row.city || "").trim().toLowerCase() || null,
      },
    );
    return base;
    // `access.statusFor` cambia identita a ogni render: le dipendenze vere sono
    // il permesso, le email caricate e i reparti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departments, access.enabled, access.loading, access.error, clubId]);

  const rolesInUse = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const member of staffMembers) {
      const role = String(member.role || "").trim();
      if (role && !seen.has(role.toLowerCase())) seen.set(role.toLowerCase(), role);
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
  }, [staffMembers]);

  const filters = React.useMemo<FilterDef<StaffMember>[]>(() => {
    const counts = countStaffByDepartment(staffMembers);
    const list: FilterDef<StaffMember>[] = [
      {
        id: "department",
        label: "Reparto",
        type: "select",
        pinned: true,
        options: [
          ...departments.map((d) => ({ value: d.name, label: d.name, count: counts[d.name.toLowerCase()] || 0 })),
          { value: NO_DEPARTMENT, label: "Senza reparto", count: staffMembers.filter((m) => !normalizeDepartmentName(m.department)).length },
        ],
        apply: (row, value) => {
          if (typeof value !== "string" || !value) return true;
          const name = normalizeDepartmentName(row.department);
          if (value === NO_DEPARTMENT) return !name;
          return name.toLowerCase() === value.toLowerCase();
        },
      },
      {
        id: "status",
        label: "Stato",
        type: "select",
        options: STATUS_FILTER_OPTIONS,
        apply: (row, value) => (typeof value === "string" && value ? statusKey(row) === value : true),
      },
      {
        id: "role",
        label: "Ruolo",
        type: "select",
        options: rolesInUse.map((role) => ({ value: role, label: role })),
        apply: (row, value) => (typeof value === "string" && value ? String(row.role || "").trim().toLowerCase() === value.toLowerCase() : true),
      },
    ];
    if (access.enabled) {
      list.push({
        id: "access",
        label: "Accesso EasyGame",
        type: "select",
        options: [
          { value: "linked", label: "Collegato" },
          { value: "none", label: "Senza accesso" },
        ],
        apply: (row, value) => {
          if (typeof value !== "string" || !value) return true;
          const spec = access.statusFor(row.email);
          if (!spec) return true;
          return value === "linked" ? spec.label === "COLLEGATO" : spec.label !== "COLLEGATO";
        },
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departments, staffMembers, rolesInUse, access.enabled, access.loading]);

  const rowActions = React.useMemo<RowActionDef<StaffMember>[]>(
    () => [
      { id: "open", label: "Apri scheda", icon: <ChevronRight />, primary: true, onClick: (row) => router.push(recordHref(row)) },
      { id: "edit", label: "Modifica", icon: <Pencil />, onClick: (row) => router.push(withClubId(`/staff/${row.id}/edit`, clubId)) },
      { id: "delete", label: "Elimina", icon: <Trash2 />, tone: "danger", onClick: (row) => setDeleting(row) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clubId],
  );

  const bulkActions = React.useMemo<BulkActionDef<StaffMember>[]>(
    () => [
      { id: "activate", label: "Attiva", icon: <UserCheck />, onRun: (rows) => setRowsStatus(rows, "active"), disabled: () => bulkBusy },
      { id: "deactivate", label: "Disattiva", icon: <UserX />, onRun: (rows) => setRowsStatus(rows, "inactive"), disabled: () => bulkBusy },
      { id: "move", label: "Sposta in un reparto", icon: <Building2 />, hidden: !departments.length, onRun: (rows) => setMoveRows(rows), disabled: () => bulkBusy },
      { id: "export-pdf", label: "Esporta PDF", icon: <FileDown />, onRun: (rows) => runExport("pdf", rows, defaultExportColumnIds, "selected"), disabled: () => bulkBusy },
      { id: "export-csv", label: "Esporta CSV", icon: <FileSpreadsheet />, onRun: (rows) => runExport("csv", rows, defaultExportColumnIds, "selected"), disabled: () => bulkBusy },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [departments.length, bulkBusy, staffMembers, clubId, activeClub?.name],
  );

  const onExport = (request: ExportRequest<StaffMember>) =>
    runExport(request.kind === "pdf" ? "pdf" : "csv", request.rows, request.columns.map((c) => c.id), request.scope);

  const search = React.useMemo(
    () => ({
      placeholder: "Cerca per nome, email, ruolo",
      match: (row: StaffMember, query: string) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return [getStaffDisplayName(row), row.email, row.phone, row.role, row.department]
          .map((v) => String(v || "").toLowerCase())
          .some((v) => v.includes(q));
      },
    }),
    [],
  );

  const goToNew = () => router.push(withClubId("/staff/new", clubId));

  const activeCount = staffMembers.filter((m) => isStaffActive(m.status)).length;
  const gridState = loading ? "loading" : loadError ? "error" : "ready";

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Staff" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Persone"
              title="Staff"
              description="Gestisci il personale amministrativo e tecnico del club."
              stats={
                <>
                  <HeaderStat value={formatInteger(staffMembers.length)} label={staffMembers.length === 1 ? "membro" : "membri"} />
                  <HeaderStat value={formatInteger(activeCount)} label="attivi" tone="green" />
                  <HeaderStat value={formatInteger(departments.length)} label={departments.length === 1 ? "reparto" : "reparti"} />
                </>
              }
              actions={
                <>
                  <Menu>
                    <MenuTrigger asChild>
                      <IconButton aria-label="Altre azioni" variant="secondary" size="md">
                        <MoreHorizontal />
                      </IconButton>
                    </MenuTrigger>
                    <MenuContent align="end" width={240}>
                      <MenuItem onSelect={() => setDepartmentsOpen(true)}>
                        <Building2 />
                        Gestisci reparti
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                  <Button variant="primary" icon={<Plus />} onClick={goToNew}>
                    Nuovo membro dello staff
                  </Button>
                </>
              }
            />

            <DataGrid<StaffMember>
              module="staff"
              aria-label="Elenco dello staff"
              rows={staffMembers}
              getRowId={(row) => String(row.id)}
              columns={columns}
              filters={filters}
              views={STAFF_VIEWS}
              search={search}
              defaultSort={{ columnId: "identity", direction: "asc" }}
              rowActions={rowActions}
              bulkActions={bulkActions}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onOpenRow={(row) => router.push(recordHref(row))}
              state={gridState}
              errorMessage={loadError}
              onRetry={reload}
              noun={{ singular: "membro dello staff", plural: "membri dello staff" }}
              export={{ onExport, kinds: ["csv", "pdf"] }}
              empty={{
                icon: <Users />,
                title: "Nessun membro dello staff",
                description: "Inizia aggiungendo il primo membro del tuo staff.",
                primary: (
                  <Button variant="primary" size="sm" icon={<Plus />} onClick={goToNew}>
                    Nuovo membro dello staff
                  </Button>
                ),
              }}
            />
          </DashboardPageContainer>
        </main>
      </div>

      <DepartmentsDrawer
        open={departmentsOpen}
        onOpenChange={setDepartmentsOpen}
        departments={departments}
        staffCountsByDepartment={countStaffByDepartment(staffMembers)}
        onSave={handleSaveDepartment}
        onDelete={handleDeleteDepartment}
      />

      <MoveDepartmentDrawer
        open={Boolean(moveRows)}
        onOpenChange={(open) => !open && setMoveRows(null)}
        rows={moveRows || []}
        departments={departments}
        onConfirm={(department) =>
          applyToRows(moveRows || [], () => ({ department: department.name }), (count) => `${count} membri dello staff spostati in ${department.name}`)
        }
      />

      <DeleteStaffDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && !deleteBusy && setDeleting(null)}
        name={deleting ? getStaffDisplayName(deleting) : ""}
        onConfirm={confirmDelete}
        loading={deleteBusy}
      />
    </div>
  );
}
