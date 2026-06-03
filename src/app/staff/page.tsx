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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StaffTable } from "@/components/staff/StaffTable";
import { DepartmentManagement } from "@/components/staff/DepartmentManagement";
import { MobileTopBar } from "@/components/layout/MobileTopBar";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { useAuth } from "@/components/providers/AuthProvider";
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

interface Department {
  id: string;
  name: string;
  description?: string;
  color?: string;
}

const DEPARTMENT_COLOR_CLASSES: Record<string, string> = {
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  green: "border-green-200 bg-green-50 text-green-700",
  red: "border-red-200 bg-red-50 text-red-700",
  yellow: "border-yellow-200 bg-yellow-50 text-yellow-700",
  purple: "border-purple-200 bg-purple-50 text-purple-700",
};

const getStaffDisplayName = (member: StaffMember) =>
  member.fullName ||
  [member.name, member.surname].filter(Boolean).join(" ").trim() ||
  member.name;

const normalizeDepartmentName = (value?: string | null) =>
  String(value || "").trim();

const makeDepartmentFromName = (name: string): Department => ({
  id: `dept-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || Date.now()}`,
  name,
  color: "blue",
});

const mergeDepartments = (
  savedDepartments: Department[],
  staffMembers: StaffMember[],
) => {
  const byName = new Map<string, Department>();

  savedDepartments.forEach((department) => {
    const name = normalizeDepartmentName(department.name);
    if (name) byName.set(name.toLowerCase(), { ...department, name });
  });

  staffMembers.forEach((member) => {
    const name = normalizeDepartmentName(member.department);
    if (name && !byName.has(name.toLowerCase())) {
      byName.set(name.toLowerCase(), makeDepartmentFromName(name));
    }
  });

  return Array.from(byName.values()).sort((left, right) =>
    left.name.localeCompare(right.name, "it", { sensitivity: "base" }),
  );
};

const getDepartmentBadgeClassName = (department?: Department) =>
  department?.color
    ? DEPARTMENT_COLOR_CLASSES[department.color] ||
      "border-slate-200 bg-slate-50 text-slate-700"
    : "border-slate-200 bg-slate-50 text-slate-700";

export default function StaffPage() {
  const router = useRouter();
  const { activeClub } = useAuth();
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [clubId, setClubId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [clubSettings, setClubSettings] = useState<Record<string, any>>({});
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
          const savedDepartments = Array.isArray(settings.staffDepartments)
            ? (settings.staffDepartments as Department[])
            : [];

          setClubSettings(settings);
          setStaffMembers(members);
          setDepartments(mergeDepartments(savedDepartments, members));
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

  const persistStaffState = async (
    nextStaffMembers: StaffMember[],
    nextDepartments = departments,
  ) => {
    if (!clubId) return;

    const nextSettings = {
      ...clubSettings,
      staffDepartments: nextDepartments,
    };

    const { error } = await supabase
      .from("clubs")
      .update({
        staff_members: nextStaffMembers,
        settings: nextSettings,
      })
      .eq("id", clubId);

    if (error) throw error;

    setClubSettings(nextSettings);
  };

  const handleAssignDepartment = async (
    memberId: string,
    departmentName: string,
  ) => {
    const normalizedDepartment =
      departmentName === "__none__" ? "" : departmentName;
    const nextStaffMembers = staffMembers.map((member) =>
      member.id === memberId
        ? { ...member, department: normalizedDepartment }
        : member,
    );

    setStaffMembers(nextStaffMembers);

    try {
      await persistStaffState(nextStaffMembers);
    } catch (error) {
      console.error("Error assigning department:", error);
    }
  };

  const handleSaveDepartment = async (department: Department) => {
    const normalizedDepartment = {
      ...department,
      name: normalizeDepartmentName(department.name),
    };

    if (!normalizedDepartment.name) return;

    const nextDepartments = departments
      .filter((item) => item.id !== normalizedDepartment.id)
      .concat(normalizedDepartment)
      .sort((left, right) =>
        left.name.localeCompare(right.name, "it", { sensitivity: "base" }),
      );

    setDepartments(nextDepartments);

    try {
      await persistStaffState(staffMembers, nextDepartments);
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
      await persistStaffState(nextStaffMembers, nextDepartments);
    } catch (error) {
      console.error("Error deleting department:", error);
    }
  };

  const filteredStaffMembers =
    departmentFilter === "all"
      ? staffMembers
      : staffMembers.filter(
          (member) =>
            normalizeDepartmentName(member.department).toLowerCase() ===
            departmentFilter.toLowerCase(),
        );
  const staffCountsByDepartment = staffMembers.reduce<Record<string, number>>(
    (counts, member) => {
      const key = normalizeDepartmentName(member.department).toLowerCase();
      if (key) counts[key] = (counts[key] || 0) + 1;
      return counts;
    },
    {},
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

        {/* Staff List */}
        {viewMode === "table" ? (
          <Card>
            <CardContent className="p-6">
              <StaffTable
                staffMembers={filteredStaffMembers}
                departments={departments}
                onEdit={(member) =>
                  router.push(`/staff/${member.id}?clubId=${clubId}`)
                }
                onDelete={(id) => handleDelete(id)}
                onAssignDepartment={handleAssignDepartment}
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
                    <Select
                      value={member.department || "__none__"}
                      onValueChange={(value) =>
                        handleAssignDepartment(member.id, value)
                      }
                    >
                      <SelectTrigger
                        className="h-8 w-[150px]"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <SelectValue placeholder="Reparto" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Non assegnato</SelectItem>
                        {departments.map((item) => (
                          <SelectItem key={item.id} value={item.name}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
        )}

        {filteredStaffMembers.length === 0 && !loading && (
          <Card className="text-center py-12">
            <CardContent>
              <Users className="h-16 w-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-xl font-semibold mb-2">
                Nessun membro dello staff
              </h3>
              <p className="text-gray-600 mb-4">
                Inizia aggiungendo il primo membro del tuo staff
              </p>
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
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Desktop layout */}
      <div className="hidden lg:flex w-full">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Staff" />
          {renderStaffMainContent()}
        </div>
      </div>

      {/* Mobile layout */}
      <div className="flex flex-1 flex-col lg:hidden">
        <MobileTopBar />
        {renderStaffMainContent()}
      </div>
    </div>
  );
}
