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
  Table as TableIcon,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { MobileTopBar } from "@/components/layout/MobileTopBar";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  comparePeopleByLastName,
  formatPersonNameLastFirst,
} from "@/lib/athlete-name-utils";
import { EntityIcon } from "@/components/ui/entity-icon";

interface Socio {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  membership_date?: string;
  membership_start?: string;
  is_active?: boolean;
  status?: string;
  role?: string;
}

const getSocioIdentity = (member: Record<string, any>) => {
  const sanitizeText = (value: any) => {
    const trimmed = String(value ?? "").trim();
    return trimmed.toLowerCase() === "undefined undefined" ? "" : trimmed;
  };
  const firstName = String(
    member?.firstName ?? member?.first_name ?? "",
  ).trim();
  const lastName = String(
    member?.lastName ?? member?.last_name ?? member?.surname ?? "",
  ).trim();
  const explicitFullName = sanitizeText(
    member?.fullName ?? member?.full_name ?? member?.name,
  );
  const fullName =
    formatPersonNameLastFirst({
      first_name: firstName,
      last_name: lastName,
      name: explicitFullName,
      fullName: explicitFullName,
    }) || explicitFullName;

  return {
    firstName,
    lastName,
    fullName,
  };
};

const isRegisteredSocio = (member: Record<string, any>) => {
  const identity = getSocioIdentity(member);

  return Boolean(
    identity.fullName ||
      member?.membershipDate ||
      member?.registrationDate ||
      member?.email ||
      member?.phone ||
      member?.fiscalCode,
  );
};

export default function SociPage() {
  const router = useRouter();
  const { activeClub } = useAuth();
  const [soci, setSoci] = useState<Socio[]>([]);
  const [loading, setLoading] = useState(true);
  const [clubId, setClubId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [visibleColumns, setVisibleColumns] = useState({
    name: true,
    email: true,
    phone: true,
    membershipDate: true,
    status: true,
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
    const fetchSoci = async () => {
      // Don't query if clubId is not set or is invalid
      if (!clubId || clubId === "null" || clubId === "undefined") {
        setLoading(false);
        setSoci([]);
        return;
      }

      setLoading(true);

      try {
        // Fetch soci data from clubs.members JSONB column
        const { data, error } = await supabase
          .from("clubs")
          .select("members")
          .eq("id", clubId)
          .single();

        if (error) {
          console.error("Error fetching soci:", error);
          setSoci([]);
          return;
        }

        // Extract members array from the JSONB column
        const members = data?.members || [];

        // Transform data to match expected format
        const transformedData = members
          .filter((member: any) => isRegisteredSocio(member))
          .map((member: any) => {
            const identity = getSocioIdentity(member);

            return {
              id: member.id,
              name: identity.fullName || "Socio",
              firstName: identity.firstName,
              lastName: identity.lastName,
              email: member.email || "",
              phone: member.phone || "",
              role: member.role || "socio",
              status: member.status || "active",
              is_active: member.status === "active",
              membership_start:
                member.membershipDate || member.registrationDate || "",
              membership_date:
                member.membershipDate || member.registrationDate || "",
              club_id: clubId,
            };
          })
          .sort(comparePeopleByLastName);

        setSoci(transformedData);
      } catch (error) {
        console.error("Error fetching soci:", error);
        setSoci([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSoci();
  }, [clubId]);

  const handleDelete = async (socioId: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo socio?")) return;

    try {
      // Get current club data
      const { data: clubData, error: fetchError } = await supabase
        .from("clubs")
        .select("members")
        .eq("id", clubId)
        .single();

      if (fetchError) throw fetchError;

      // Filter out the member to delete
      const currentMembers = clubData?.members || [];
      const updatedMembers = currentMembers.filter(
        (member: any) => member.id !== socioId,
      );

      // Update the club with the new members array
      const { error: updateError } = await supabase
        .from("clubs")
        .update({ members: updatedMembers })
        .eq("id", clubId);

      if (updateError) throw updateError;

      setSoci(soci.filter((socio) => socio.id !== socioId));
    } catch (error) {
      console.error("Error deleting socio:", error);
    }
  };

  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="hidden lg:block">
          <Header title="Soci" />
        </div>
        <div className="lg:hidden">
          <MobileTopBar />
        </div>

        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            {/* Header */}
            <SharedPageHeader
              title="Soci"
              subtitle="Gestisci i soci dell'associazione"
              actions={
              <div className="flex gap-2">
                <Button
                  variant={viewMode === "table" ? "default" : "outline"}
                  size="icon"
                  onClick={() => setViewMode("table")}
                  title="Visualizzazione Tabella"
                >
                  <TableIcon className="h-4 w-4" />
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
                        checked={visibleColumns.membershipDate}
                        onCheckedChange={(checked) =>
                          setVisibleColumns((prev) => ({
                            ...prev,
                            membershipDate: checked,
                          }))
                        }
                      >
                        Data Iscrizione
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
                            router.push(`/soci/new?clubId=${parsed.id}`);
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
                    router.push("/soci/new");
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Aggiungi Socio
                </Button>
              </div>
              }
            />

            {/* Content */}
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Caricamento soci...</p>
              </div>
            ) : viewMode === "table" ? (
              <Card>
                <CardContent className="p-6">
                  <div className="rounded-md border overflow-x-auto">
                    <Table className="min-w-full">
                      <TableHeader>
                        <TableRow>
                          {visibleColumns.name && (
                            <TableHead key="name">Nome</TableHead>
                          )}
                          {visibleColumns.email && (
                            <TableHead
                              key="email"
                              className="hidden md:table-cell"
                            >
                              Email
                            </TableHead>
                          )}
                          {visibleColumns.phone && (
                            <TableHead
                              key="phone"
                              className="hidden md:table-cell"
                            >
                              Telefono
                            </TableHead>
                          )}
                          {visibleColumns.membershipDate && (
                            <TableHead
                              key="membershipDate"
                              className="hidden md:table-cell"
                            >
                              Data Iscrizione
                            </TableHead>
                          )}
                          {visibleColumns.status && (
                            <TableHead
                              key="status"
                              className="hidden md:table-cell"
                            >
                              Stato
                            </TableHead>
                          )}
                          <TableHead key="actions" className="text-right">
                            Azioni
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {soci.map((socio) => (
                          <TableRow
                            key={socio.id}
                            className="cursor-pointer hover:bg-muted/50"
                          >
                            {visibleColumns.name && (
                              <TableCell
                                key={`${socio.id}-name`}
                                className="font-medium"
                              >
                                <div className="flex items-center gap-2">
                                  <EntityIcon
                                    type="member"
                                    size="sm"
                                    label={socio.name}
                                  />
                                  {socio.name}
                                </div>
                              </TableCell>
                            )}
                            {visibleColumns.email && (
                              <TableCell
                                key={`${socio.id}-email`}
                                className="hidden md:table-cell"
                              >
                                {socio.email || "N/A"}
                              </TableCell>
                            )}
                            {visibleColumns.phone && (
                              <TableCell
                                key={`${socio.id}-phone`}
                                className="hidden md:table-cell"
                              >
                                {socio.phone || "N/A"}
                              </TableCell>
                            )}
                            {visibleColumns.membershipDate && (
                              <TableCell
                                key={`${socio.id}-membershipDate`}
                                className="hidden md:table-cell"
                              >
                                {socio.membership_date || socio.membership_start
                                  ? new Date(
                                      socio.membership_date ||
                                        socio.membership_start ||
                                        "",
                                    ).toLocaleDateString("it-IT")
                                  : "N/A"}
                              </TableCell>
                            )}
                            {visibleColumns.status && (
                              <TableCell
                                key={`${socio.id}-status`}
                                className="hidden md:table-cell"
                              >
                                <Badge
                                  variant={
                                    socio.is_active || socio.status === "active"
                                      ? "default"
                                      : "outline"
                                  }
                                  className={
                                    socio.is_active || socio.status === "active"
                                      ? "bg-green-100 text-green-800 border-green-200"
                                      : "bg-gray-100 text-gray-800 border-gray-200"
                                  }
                                >
                                  {socio.is_active || socio.status === "active"
                                    ? "Attivo"
                                    : "Non Attivo"}
                                </Badge>
                              </TableCell>
                            )}
                            <TableCell
                              key={`${socio.id}-actions`}
                              className="text-right"
                            >
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(
                                      `/soci/${socio.id}?clubId=${clubId}`,
                                    );
                                  }}
                                  title="Modifica"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 text-red-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (
                                      confirm(
                                        "Sei sicuro di voler eliminare questo socio?",
                                      )
                                    ) {
                                      handleDelete(socio.id);
                                    }
                                  }}
                                  title="Elimina"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {soci.map((socio) => (
                  <Card
                    key={socio.id}
                    className="hover:shadow-lg transition-shadow duration-200 cursor-pointer"
                    onClick={() =>
                      router.push(`/soci/${socio.id}?clubId=${clubId}`)
                    }
                  >
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <div className="flex items-center gap-3">
                        <EntityIcon
                          type="member"
                          size="sm"
                          label={socio.name}
                        />
                        <div>
                          <CardTitle className="text-lg">
                            {socio.name}
                          </CardTitle>
                        </div>
                      </div>
                      <Badge
                        variant={
                          socio.is_active || socio.status === "active"
                            ? "default"
                            : "outline"
                        }
                        className={
                          socio.is_active || socio.status === "active"
                            ? "bg-green-100 text-green-800 border-green-200"
                            : "bg-gray-100 text-gray-800 border-gray-200"
                        }
                      >
                        {socio.is_active || socio.status === "active"
                          ? "Attivo"
                          : "Non Attivo"}
                      </Badge>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center text-sm text-gray-600">
                        <Mail className="h-4 w-4 mr-2" />
                        {socio.email || "Email non disponibile"}
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <Phone className="h-4 w-4 mr-2" />
                        {socio.phone || "Telefono non disponibile"}
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="h-4 w-4 mr-2" />
                        {socio.membership_date || socio.membership_start
                          ? `Iscritto il ${new Date(socio.membership_date || socio.membership_start || "").toLocaleDateString("it-IT")}`
                          : "Data iscrizione non disponibile"}
                      </div>
                      <div className="flex justify-end gap-2 mt-4">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/soci/${socio.id}?clubId=${clubId}`);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(socio.id);
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

            {soci.length === 0 && !loading && (
              <Card className="text-center py-12">
                <CardContent>
                  <Users className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-xl font-semibold mb-2">Nessun socio</h3>
                  <p className="text-gray-600 mb-4">
                    Inizia aggiungendo il primo socio della tua associazione
                  </p>
                  <Button
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        const storedClub = localStorage.getItem("activeClub");
                        if (storedClub) {
                          try {
                            const parsed = JSON.parse(storedClub);
                            if (parsed?.id) {
                              router.push(`/soci/new?clubId=${parsed.id}`);
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
                      router.push("/soci/new");
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Aggiungi Socio
                  </Button>
                </CardContent>
              </Card>
            )}
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
