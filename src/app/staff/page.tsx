"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Users,
  Mail,
  Phone,
  Calendar,
  Building,
  Edit,
  Trash2,
  LayoutGrid,
  Table,
  Settings2,
  UserCheck,
  UserX,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  BulkSelectionToolbar,
  SelectRowCheckbox,
  useListSelection,
} from "@/components/ui/list-selection";
import {
  availableExportScopes,
  exportScopeLabel,
  resolveScopeRows,
  type SelectionScope,
} from "@/lib/list-selection";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StaffTable } from "@/components/staff/StaffTable";
import { DepartmentManagement } from "@/components/staff/DepartmentManagement";
import { exportPeoplePdf } from "@/lib/person-export";
import { useToast } from "@/components/ui/toast-notification";
import { FileDown } from "lucide-react";
import {
  countStaffByDepartment,
  getDepartmentBadgeClassName,
  normalizeDepartmentName,
  upsertStaffDepartment,
  type StaffDepartment as Department,
} from "@/lib/staff-directory";
import {
  deleteStaffDepartment,
  resolveStaffDepartments,
  saveStaffDepartments,
} from "@/lib/api/staff-departments";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { useAuth } from "@/components/providers/AuthProvider";
import { sortPeopleByLastName } from "@/lib/athlete-name-utils";
import { EntityIcon } from "@/components/ui/entity-icon";

interface StaffMember {
  id: string;
  name: string;
  fullName?: string;
  surname?: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  status: string;
  hire_date?: string;
  hireDate?: string;
  avatar: string;
}

const getStaffDisplayName = (member: StaffMember) =>
  member.fullName ||
  [member.name, member.surname].filter(Boolean).join(" ").trim() ||
  member.name;

export default function StaffPage() {
  const router = useRouter();
  const { activeClub } = useAuth();
  const { showToast } = useToast();
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [clubId, setClubId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [isDepartmentManagementOpen, setIsDepartmentManagementOpen] =
    useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    name: true,
    role: true,
    department: true,
    email: true,
    phone: true,
    status: true,
    hireDate: true,
  });
  const [bulkBusy, setBulkBusy] = useState(false);
  const selection = useListSelection();

  useEffect(() => {
    // Get clubId from auth context first, then localStorage as fallback
    if (activeClub?.id) {
      setClubId(activeClub.id);
      return;
    }

    if (typeof window !== "undefined") {
      const storedClub = localStorage.getItem("activeClub");
      if (storedClub) {
        try {
          const parsed = JSON.parse(storedClub);
          if (parsed?.id) {
            setClubId(parsed.id);
          }
        } catch (e) {
          console.error("Error parsing activeClub from localStorage", e);
        }
      }
    }
  }, [activeClub]);

  useEffect(() => {
    const loadData = async () => {
      // Don't query if clubId is not set or is invalid
      if (!clubId || clubId === "null" || clubId === "undefined") {
        setLoading(false);
        setStaffMembers([]);
        setDepartments([]);
        return;
      }

      try {
        // Get staff members from clubs.staff_members JSONB column
        const { data: clubData, error } = await supabase
          .from("clubs")
          .select("staff_members, settings")
          .eq("id", clubId)
          .single();

        if (error) {
          if (process.env.NODE_ENV === "development") {
            console.error("Error loading staff:", error);
          }
          setStaffMembers([]);
        } else {
          const members = clubData?.staff_members || [];
          const settings =
            clubData?.settings && typeof clubData.settings === "object"
              ? clubData.settings
              : {};
          setStaffMembers(members);
          setDepartments(resolveStaffDepartments(settings, members));
          // Un id selezionato che non esiste piu mostrerebbe un conteggio che
          // non corrisponde a niente.
          selection.prune(members.map((member: any) => String(member.id)));
        }
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("Error loading staff:", error);
        }
      setStaffMembers([]);
      setDepartments([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    // `selection` cambia a ogni spunta: fra le dipendenze rileggerebbe
    // l'elenco a ogni casella premuta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const handleDelete = async (memberId: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo membro dello staff?"))
      return;
    if (!clubId) return;

    try {
      // Remove from local state first
      const updatedStaff = staffMembers.filter(
        (member) => member.id !== memberId,
      );
      setStaffMembers(updatedStaff);

      // Update the clubs table
      const { error } = await supabase
        .from("clubs")
        .update({ staff_members: updatedStaff })
        .eq("id", clubId);

      if (error) throw error;
    } catch (error) {
      console.error("Error deleting staff member:", error);
      // Reload data on error
      const { data: clubData } = await supabase
        .from("clubs")
        .select("staff_members")
        .eq("id", clubId)
        .single();
      setStaffMembers(clubData?.staff_members || []);
    }
  };

  /**
   * Membri e reparti si salvano separatamente, e non per pigrizia.
   *
   * `settings` e una colonna JSON sola: riscriverla dallo snapshot letto al
   * montaggio della pagina significava riportare indietro `seasons`,
   * `activeSeasonId` e tutto il resto a com'erano allora. Bastava che qualcuno
   * cambiasse stagione mentre questa pagina era aperta perche il salvataggio
   * di un reparto la annullasse. `saveStaffDepartments` rilegge la colonna
   * prima di riscriverla.
   */
  const persistStaffState = async (
    nextStaffMembers: StaffMember[],
    nextDepartments: Department[] | null = null,
  ) => {
    if (!clubId) return;

    const { error } = await supabase
      .from("clubs")
      .update({ staff_members: nextStaffMembers })
      .eq("id", clubId);

    if (error) throw error;

    if (nextDepartments) {
      await saveStaffDepartments(clubId, nextDepartments);
    }
  };

  const handleSaveDepartment = async (department: Department) => {
    const normalizedDepartment = {
      ...department,
      name: normalizeDepartmentName(department.name),
    };

    if (!normalizedDepartment.name) return;

    const nextDepartments = upsertStaffDepartment(
      departments,
      normalizedDepartment,
    );

    setDepartments(nextDepartments);

    try {
      if (clubId) await saveStaffDepartments(clubId, nextDepartments);
    } catch (error) {
      console.error("Error saving department:", error);
    }
  };

  const handleDeleteDepartment = async (departmentId: string) => {
    const removedDepartment = departments.find(
      (department) => department.id === departmentId,
    );
    const nextDepartments = departments.filter(
      (department) => department.id !== departmentId,
    );
    const removedName = normalizeDepartmentName(removedDepartment?.name);
    const nextStaffMembers = removedName
      ? staffMembers.map((member) =>
          normalizeDepartmentName(member.department).toLowerCase() ===
          removedName.toLowerCase()
            ? { ...member, department: "" }
            : member,
        )
      : staffMembers;

    setDepartments(nextDepartments);
    setStaffMembers(nextStaffMembers);
    if (departmentFilter === removedName) setDepartmentFilter("all");

    try {
      if (clubId) {
        await persistStaffState(nextStaffMembers);
        await deleteStaffDepartment(clubId, departmentId);
      }
    } catch (error) {
      console.error("Error deleting department:", error);
    }
  };

  const filteredStaffMembers = sortPeopleByLastName(
    departmentFilter === "all"
      ? staffMembers
      : staffMembers.filter(
          (member) =>
            normalizeDepartmentName(member.department).toLowerCase() ===
            departmentFilter.toLowerCase(),
        ),
  );
  const staffCountsByDepartment = countStaffByDepartment(staffMembers);

  /**
   * Gli ambiti di export che hanno senso adesso (RC Fix 2, punto 10).
   *
   * Con una selezione attiva il primo e «selezionati»: chi ne ha scelti
   * quattro non vuole un PDF di tutto il reparto.
   */
  const exportScopes = availableExportScopes({
    selectedCount: selection.count,
    filteredCount: filteredStaffMembers.length,
    totalCount: staffMembers.length,
  });

  const rowsForScope = (scope: SelectionScope) =>
    resolveScopeRows({
      scope,
      rows: staffMembers,
      filteredRows: filteredStaffMembers,
      selectedIds: selection.selectedIds,
      idOf: (member) => String(member.id),
    });

  /**
   * Export PDF, con lo stesso motore dell'elenco Atleti.
   *
   * Non e una seconda implementazione: `printPeoplePdf` prende colonne e
   * righe e non sa di che entita si tratti (Blocco 7, punto 13).
   */
  const handleExportPdf = (scope: SelectionScope) => {
    const people = rowsForScope(scope);
    const result = exportPeoplePdf({
      entity: "staff",
      people: people as unknown as Record<string, any>[],
      clubName: activeClub?.name || "EasyGame",
      visibleColumns: visibleColumns,
      scopeLabel:
        scope === "selected"
          ? `${people.length} membri dello staff selezionati`
          : scope === "filtered"
            ? `${people.length} membri dello staff nel risultato filtrato`
            : `${people.length} membri dello staff in elenco`,
    });

    if (!result.ok) {
      showToast(
        "error",
        result.reason === "empty"
          ? "Nessun elemento da esportare"
          : "Consenti i popup per generare il PDF",
      );
      return;
    }

    showToast("success", "PDF pronto: si apre la finestra di stampa");
  };

  /**
   * Scrive la stessa modifica su ogni membro selezionato.
   *
   * Lo staff vive in un unico array JSONB (`clubs.staff_members`): la
   * modifica di massa e **una sola scrittura**, non una per riga. Non e
   * un'ottimizzazione, e cio che rende l'operazione indivisibile — dieci
   * scritture separate possono fermarsi alla settima e lasciare l'elenco a
   * meta.
   */
  const applyToSelection = async (
    updatesFor: (member: StaffMember) => Record<string, any>,
    successMessage: (count: number) => string,
  ) => {
    if (!clubId || bulkBusy) return;

    const targetIds = new Set(rowsForScope("selected").map((m) => String(m.id)));
    if (!targetIds.size) return;

    setBulkBusy(true);
    const previous = staffMembers;
    const updated = staffMembers.map((member) =>
      targetIds.has(String(member.id))
        ? { ...member, ...updatesFor(member) }
        : member,
    );

    try {
      setStaffMembers(updated);
      const { error } = await supabase
        .from("clubs")
        .update({ staff_members: updated })
        .eq("id", clubId);

      if (error) throw error;
      showToast("success", successMessage(targetIds.size));
    } catch (error) {
      console.error("Error running bulk staff action:", error);
      // Si torna a com'era: un elenco che mostra una modifica non salvata e
      // peggio di uno che non l'ha mai mostrata.
      setStaffMembers(previous);
      showToast("error", "Operazione non riuscita");
    } finally {
      setBulkBusy(false);
    }
  };

  const setSelectionStatus = (status: "active" | "inactive") =>
    applyToSelection(
      () => ({ status }),
      (count) =>
        `${count} membri dello staff ${status === "active" ? "attivati" : "disattivati"}`,
    );

  /**
   * Il reparto e **uno solo** per persona: qui si sostituisce, non si aggiunge.
   * E la differenza con l'assegnazione degli allenatori, che di categorie ne
   * hanno piu d'una.
   */
  const setSelectionDepartment = (department: Department) =>
    applyToSelection(
      () => ({ department: department.name }),
      (count) => `${count} membri dello staff spostati in ${department.name}`,
    );

  const renderStaffMainContent = () => (
    <main className={dashboardMainClassName}>
      <DashboardPageContainer>
        {/* Header */}
        <div className="flex justify-between items-center">
          <SharedPageHeader
            title="Staff"
            subtitle="Gestisci il personale amministrativo e tecnico"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Select
              value={departmentFilter}
              onValueChange={setDepartmentFilter}
            >
              <SelectTrigger className="h-9 w-[170px]">
                <SelectValue placeholder="Filtra reparto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i reparti</SelectItem>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={department.name}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => setIsDepartmentManagementOpen(true)}
            >
              <Building className="mr-2 h-4 w-4" />
              Reparti
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={!exportScopes.length}>
                  <FileDown className="mr-2 h-4 w-4" />
                  Esporta PDF
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {exportScopes.map((scope) => (
                  <DropdownMenuItem
                    key={scope}
                    onClick={() => handleExportPdf(scope)}
                  >
                    {exportScopeLabel(scope, rowsForScope(scope).length)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant={viewMode === "table" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("table")}
              title="Visualizzazione Tabella"
            >
              <Table className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "cards" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("cards")}
              title="Visualizzazione Card"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>

            {viewMode === "table" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Personalizza Colonne"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Colonne Visibili</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={visibleColumns.name}
                    onCheckedChange={(checked) =>
                      setVisibleColumns((prev) => ({
                        ...prev,
                        name: checked,
                      }))
                    }
                  >
                    Nome
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={visibleColumns.role}
                    onCheckedChange={(checked) =>
                      setVisibleColumns((prev) => ({
                        ...prev,
                        role: checked,
                      }))
                    }
                  >
                    Ruolo
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={visibleColumns.department}
                    onCheckedChange={(checked) =>
                      setVisibleColumns((prev) => ({
                        ...prev,
                        department: checked,
                      }))
                    }
                  >
                    Reparto
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={visibleColumns.email}
                    onCheckedChange={(checked) =>
                      setVisibleColumns((prev) => ({
                        ...prev,
                        email: checked,
                      }))
                    }
                  >
                    Email
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={visibleColumns.phone}
                    onCheckedChange={(checked) =>
                      setVisibleColumns((prev) => ({
                        ...prev,
                        phone: checked,
                      }))
                    }
                  >
                    Telefono
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={visibleColumns.status}
                    onCheckedChange={(checked) =>
                      setVisibleColumns((prev) => ({
                        ...prev,
                        status: checked,
                      }))
                    }
                  >
                    Stato
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={visibleColumns.hireDate}
                    onCheckedChange={(checked) =>
                      setVisibleColumns((prev) => ({
                        ...prev,
                        hireDate: checked,
                      }))
                    }
                  >
                    Data Assunzione
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              onClick={() => {
                if (typeof window !== "undefined") {
                  const storedClub = localStorage.getItem("activeClub");
                  if (storedClub) {
                    try {
                      const parsed = JSON.parse(storedClub);
                      if (parsed?.id) {
                        router.push(`/staff/new?clubId=${parsed.id}`);
                        return;
                      }
                    } catch (e) {
                      console.error(
                        "Errore nel parsing di activeClub da localStorage",
                        e,
                      );
                    }
                  }
                }
                router.push("/staff/new");
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Aggiungi Membro
            </Button>
          </div>
        </div>

        <BulkSelectionToolbar
          selection={selection}
          nouns={{ one: "membro dello staff", many: "membri dello staff" }}
          className="mb-4"
        >
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={bulkBusy}
            onClick={() => void setSelectionStatus("active")}
          >
            <UserCheck className="mr-1.5 h-3.5 w-3.5 text-green-600" aria-hidden />
            Attiva
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={bulkBusy}
            onClick={() => void setSelectionStatus("inactive")}
          >
            <UserX className="mr-1.5 h-3.5 w-3.5 text-amber-600" aria-hidden />
            Disattiva
          </Button>

          {departments.length ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={bulkBusy}
                >
                  <Building className="mr-1.5 h-3.5 w-3.5 text-blue-600" aria-hidden />
                  Sposta in un reparto
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                <DropdownMenuLabel>Il reparto e uno solo: sostituisce</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {departments.map((department) => (
                  <DropdownMenuItem
                    key={department.id}
                    onClick={() => void setSelectionDepartment(department)}
                  >
                    {department.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={bulkBusy}
            onClick={() => handleExportPdf("selected")}
          >
            <FileDown className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Esporta PDF
          </Button>
        </BulkSelectionToolbar>

        {/* Staff List */}
        {filteredStaffMembers.length > 0 ? (
          viewMode === "table" ? (
            <Card>
              <CardContent className="p-6">
                <StaffTable
                  staffMembers={filteredStaffMembers}
                  selection={selection}
                  departments={departments}
                  onEdit={(member) =>
                    router.push(`/staff/${member.id}?clubId=${clubId}`)
                  }
                  onDelete={(id) => handleDelete(id)}
                  onToggleStatus={(id) => console.log("Toggle status:", id)}
                  formatDate={(date) => {
                    if (!date) return "N/A";
                    try {
                      return new Date(date).toLocaleDateString("it-IT", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      });
                    } catch {
                      return "N/A";
                    }
                  }}
                  visibleColumns={visibleColumns}
                />
              </CardContent>
            </Card>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStaffMembers.map((member) => {
              const department = departments.find(
                (item) =>
                  normalizeDepartmentName(item.name).toLowerCase() ===
                  normalizeDepartmentName(member.department).toLowerCase(),
              );

              return (
              <Card
                key={member.id}
                className="hover:shadow-lg transition-shadow duration-200 cursor-pointer"
                onClick={() =>
                  router.push(`/staff/${member.id}?clubId=${clubId}`)
                }
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-3">
                    {/*
                      La scheda si apre al clic: spuntare non deve aprirla, o
                      selezionare dieci persone vorrebbe dire aprire dieci
                      pagine.
                    */}
                    <span onClick={(event) => event.stopPropagation()}>
                      <SelectRowCheckbox
                        selection={selection}
                        id={String(member.id)}
                        label={getStaffDisplayName(member)}
                      />
                    </span>
                    <EntityIcon
                      type="staff"
                      size="sm"
                      label={getStaffDisplayName(member)}
                    />
                    <div>
                      <CardTitle className="text-lg">
                        {getStaffDisplayName(member)}
                      </CardTitle>
                      <p className="text-sm text-gray-500">{member.role}</p>
                    </div>
                  </div>
                  <Badge
                    variant={member.status === "active" ? "default" : "outline"}
                    className={
                      member.status === "active"
                        ? "bg-green-100 text-green-800 border-green-200"
                        : "bg-gray-100 text-gray-800 border-gray-200"
                    }
                  >
                    {member.status === "active" ? "Attivo" : "Non Attivo"}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant="outline"
                      className={getDepartmentBadgeClassName(department)}
                    >
                      {member.department || "Non assegnato"}
                    </Badge>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Mail className="h-4 w-4 mr-2" />
                    {member.email || "Email non disponibile"}
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Phone className="h-4 w-4 mr-2" />
                    {member.phone || "Telefono non disponibile"}
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Calendar className="h-4 w-4 mr-2" />
                    {member.hire_date || member.hireDate
                      ? `Assunto il ${new Date(member.hire_date || member.hireDate || "").toLocaleDateString("it-IT")}`
                      : "Data assunzione non disponibile"}
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/staff/${member.id}?clubId=${clubId}`);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(member.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
          )
        ) : null}

        {filteredStaffMembers.length === 0 && !loading && (
          <Card className="text-center py-12">
            <CardContent>
              <Users className="h-16 w-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-xl font-semibold mb-2">
                {staffMembers.length === 0
                  ? "Nessun membro dello staff"
                  : "Nessun risultato trovato"}
              </h3>
              <p className="text-gray-600 mb-4">
                {staffMembers.length === 0
                  ? "Inizia aggiungendo il primo membro del tuo staff"
                  : "Prova a modificare i filtri di ricerca"}
              </p>
              {staffMembers.length === 0 ? (
                <Button
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      const storedClub = localStorage.getItem("activeClub");
                      if (storedClub) {
                        try {
                          const parsed = JSON.parse(storedClub);
                          if (parsed?.id) {
                            router.push(`/staff/new?clubId=${parsed.id}`);
                            return;
                          }
                        } catch (e) {
                          console.error(
                            "Errore nel parsing di activeClub da localStorage",
                            e,
                          );
                        }
                      }
                    }
                    router.push("/staff/new");
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Aggiungi Membro
                </Button>
              ) : null}
            </CardContent>
          </Card>
        )}
        <DepartmentManagement
          isOpen={isDepartmentManagementOpen}
          onClose={() => setIsDepartmentManagementOpen(false)}
          onSave={handleSaveDepartment}
          departments={departments}
          onDelete={handleDeleteDepartment}
          staffCountsByDepartment={staffCountsByDepartment}
        />
      </DashboardPageContainer>
    </main>
  );

  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
      {/*
        Una sola chrome, e il contenuto montato **una volta**.

        Qui c'erano due rami — uno `hidden lg:flex`, uno `lg:hidden` — che
        montavano entrambi la pagina: nascosta con il CSS, ma viva nel DOM.
        React eseguiva due volte ogni effetto, quindi ogni lettura partiva due
        volte e ogni autosave rischiava due PATCH sovrapposte sulla stessa
        colonna. `Header` monta gia da se la barra mobile e quella desktop
        (RC Fix 1, punto 11).
      */}
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Staff" />
        {renderStaffMainContent()}
      </div>
    </div>
  );
}
