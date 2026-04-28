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
import { StaffTable } from "@/components/staff/StaffTable";
import { MobileTopBar } from "@/components/layout/MobileTopBar";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { useAuth } from "@/components/providers/AuthProvider";

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
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [clubId, setClubId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [visibleColumns, setVisibleColumns] = useState({
    name: true,
    role: true,
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
        return;
      }

      try {
        // Get staff members from clubs.staff_members JSONB column
        const { data: clubData, error } = await supabase
          .from("clubs")
          .select("staff_members")
          .eq("id", clubId)
          .single();

        if (error) {
          if (process.env.NODE_ENV === "development") {
            console.error("Error loading staff:", error);
          }
          setStaffMembers([]);
        } else {
          setStaffMembers(clubData?.staff_members || []);
        }
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("Error loading staff:", error);
        }
        setStaffMembers([]);
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

  const renderStaffMainContent = () => (
    <main className="flex-1 p-4 md:p-6">
      <div className="max-w-9xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Staff
            </h1>
            <p className="text-gray-600 mt-2">
              Gestisci il personale amministrativo e tecnico
            </p>
          </div>
          <div className="flex gap-2">
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
                staffMembers={staffMembers}
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
            {staffMembers.map((member) => (
              <Card
                key={member.id}
                className="hover:shadow-lg transition-shadow duration-200 cursor-pointer"
                onClick={() =>
                  router.push(`/staff/${member.id}?clubId=${clubId}`)
                }
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-lg">
                      {getStaffDisplayName(member)}
                    </CardTitle>
                    <p className="text-sm text-gray-500">{member.role}</p>
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
            ))}
          </div>
        )}

        {staffMembers.length === 0 && !loading && (
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
      </div>
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
