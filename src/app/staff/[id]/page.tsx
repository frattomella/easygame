"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PersonCompensationTab } from "@/components/sport-work/PersonCompensationTab";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClubPersonDetailHeader } from "@/components/club/ClubPersonDetailHeader";
import {
  Calendar,
  Mail,
  Phone,
  User,
  MapPin,
  Edit,
  Trash2,
  Share2,
  ArrowLeft,
  Briefcase,
  GraduationCap,
  Globe,
  IdCard,
  CalendarDays,
  Shirt,
  X,
} from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast-notification";
import { supabase } from "@/lib/supabase";
import { deleteStaffMember } from "@/lib/simplified-db";
import { CapitalizedInput } from "@/components/forms/capitalized-input";
import {
  ClothingSizesFields,
  ClothingSizesSummary,
} from "@/components/forms/clothing-sizes-fields";
import { PhoneField } from "@/components/forms/phone-field";
import { PersonResidenceFields } from "@/components/forms/assisted-anagrafica";
import { PersonIdentityFields } from "@/components/forms/person-identity-fields";
import {
  LEGACY_PERSON_NAME_KEYS,
  readPersonIdentity,
  writePersonIdentity,
} from "@/lib/person-identity";
import {
  CUSTOM_OPTION_VALUE,
  collectStaffRoles,
  normalizeDepartmentName,
  type StaffDepartment,
} from "@/lib/staff-directory";
import {
  ensureStaffDepartment,
  resolveStaffDepartments,
} from "@/lib/api/staff-departments";

const getStaffIdentity = (staffData: Record<string, any>) => {
  const firstName = String(
    staffData?.firstName ?? staffData?.name ?? "",
  ).trim();
  const lastName = String(
    staffData?.surname ?? staffData?.lastName ?? "",
  ).trim();
  const fullName =
    String(staffData?.fullName ?? "").trim() ||
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    String(staffData?.name ?? "").trim();

  return {
    firstName,
    lastName,
    fullName: fullName || "Nome non disponibile",
  };
};





export default function StaffMemberDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const staffId = params?.id as string;
  const clubIdFromParams = searchParams?.get("clubId");
  const [clubId, setClubId] = useState<string | null>(clubIdFromParams || null);
  const [isLoading, setIsLoading] = useState(true);
  const [staffMember, setStaffMember] = useState<any>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});
  const [allStaffMembers, setAllStaffMembers] = useState<any[]>([]);
  const [staffDepartments, setStaffDepartments] = useState<StaffDepartment[]>([]);
  /** Vero mentre si digita un ruolo fuori elenco. */
  const [showCustomRole, setShowCustomRole] = useState(false);
  const [isSavingDepartment, setIsSavingDepartment] = useState(false);

  // Get clubId from localStorage if not in URL params
  useEffect(() => {
    if (!clubId || clubId === "null") {
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
    }
  }, [clubIdFromParams]);

  // Fetch staff member data from database
  useEffect(() => {
    const fetchStaffData = async (retryCount = 0) => {
      // Validate clubId - check if it's null, "null", or empty
      if (!clubId || clubId === "null" || clubId.trim() === "") {
        // Don't show error immediately, wait for localStorage to be checked
        setIsLoading(false);
        return;
      }

      if (!staffId) {
        console.error("Missing staffId parameter");
        showToast("error", "ID del membro dello staff mancante");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        
        const { data: clubData, error: clubError } = await supabase
          .from("clubs")
          .select("staff_members, settings")
          .eq("id", clubId)
          .maybeSingle();

        if (clubError) {
          // Handle network errors with retry
          if (clubError.message?.includes("Failed to fetch") && retryCount < 3) {
            setTimeout(() => fetchStaffData(retryCount + 1), 1000 * (retryCount + 1));
            return;
          }
          console.error("Error fetching club data:", clubError);
          showToast("error", `Errore nel caricamento dei dati del club: ${clubError.message}`);
          setIsLoading(false);
          return;
        }

        if (!clubData) {
          console.error("Club data not found for clubId:", clubId);
          showToast("error", "Club non trovato. Verifica l'ID del club.");
          setIsLoading(false);
          return;
        }


        // Find staff member in staff_members array
        const members = Array.isArray(clubData?.staff_members)
          ? clubData.staff_members
          : [];
        const settings =
          clubData?.settings && typeof clubData.settings === "object"
            ? clubData.settings
            : {};
        setAllStaffMembers(members);
        // Stessa funzione dell'elenco: i reparti orfani rimasti sui membri
        // compaiono anche qui, invece di sparire dalla tendina.
        setStaffDepartments(resolveStaffDepartments(settings, members));

        let staffData = null;
        staffData = members.find((staff: any) => staff.id === staffId);

        if (!staffData) {
          console.error("Staff member not found in club data. StaffId:", staffId);
          showToast("error", "Membro dello staff non trovato");
          setIsLoading(false);
          return;
        }

        const identity = getStaffIdentity(staffData);

        setStaffMember({
          id: staffData.id,
          // Anagrafica
          name: identity.firstName || staffData.name || "Nome non disponibile",
          surname: identity.lastName,
          fullName: identity.fullName,
          age: staffData.age || "",
          birthDate: staffData.birthDate || "",
          nationality: staffData.nationality || "Italiana",
          birthPlace: staffData.birthPlace || "",
          gender: staffData.gender || "",
          education: staffData.education || "",
          notes: staffData.notes || "",
          
          // Documento di identità
          documentType: staffData.documentType || "",
          documentNumber: staffData.documentNumber || "",
          documentExpiry: staffData.documentExpiry || "",
          documentIssueDate: staffData.documentIssueDate || "",
          residencePermitExpiry: staffData.residencePermitExpiry || "",
          
          // Contatti
          email: staffData.email || "",
          phone: staffData.phone || "",
          address: staffData.address || "",
          city: staffData.city || "",
          postalCode: staffData.postalCode || "",
          
          // Dati societari
          role: staffData.role || "Staff",
          department: staffData.department || "",
          status: staffData.status || "active",
          hireDate: staffData.hireDate || "",
          
          // Existing fields
          avatar: staffData.avatar || null,
          fiscalCode: staffData.fiscalCode || "",
        });
      } catch (error) {
        console.error("Error fetching staff data:", error);
        showToast("error", "Errore nel caricamento dei dati del membro dello staff");
      } finally {
        setIsLoading(false);
      }
    };

    fetchStaffData();
  }, [clubId, staffId, showToast]);

  const handleEditSection = (section: string) => {
    setEditingSection(section);
    setEditFormData({ ...staffMember });
  };

  const handleSaveSection = async () => {
    if (!clubId || !staffId) return;

    try {
      const { updateClubDataItem } = await import("@/lib/simplified-db");
      const fullName = [editFormData.name, editFormData.surname]
        .filter(Boolean)
        .join(" ")
        .trim();
      const payload = {
        ...editFormData,
        fullName: fullName || editFormData.fullName || undefined,
      };
      
      await updateClubDataItem(clubId, "staff_members", staffId, payload);
      await ensureStaffDepartment(clubId, payload.department);

      setStaffMember(payload);
      setAllStaffMembers((current) =>
        current.map((member) =>
          member.id === staffId ? { ...member, ...payload } : member,
        ),
      );
      setEditingSection(null);
      showToast("success", "Modifiche salvate con successo");
    } catch (error) {
      console.error("Error updating staff member:", error);
      showToast("error", "Errore nel salvataggio delle modifiche");
    }
  };

  const handleDepartmentChange = async (departmentName: string) => {
    if (!clubId || !staffId || isSavingDepartment) return;

    const nextDepartment =
      departmentName === "__none__" ? "" : normalizeDepartmentName(departmentName);
    const previousDepartment = staffMember?.department || "";
    const previousStaffMembers = allStaffMembers;
    const nextStaffMembers = previousStaffMembers.map((member) =>
      member.id === staffId ? { ...member, department: nextDepartment } : member,
    );

    if (!nextStaffMembers.some((member) => member.id === staffId)) {
      showToast("error", "Membro dello staff non trovato");
      return;
    }

    setAllStaffMembers(nextStaffMembers);
    setStaffMember((current: any) =>
      current ? { ...current, department: nextDepartment } : current,
    );
    setIsSavingDepartment(true);

    try {
      const { error } = await supabase
        .from("clubs")
        .update({ staff_members: nextStaffMembers })
        .eq("id", clubId);

      if (error) throw error;

      /*
        Qui non si riscrive piu `settings`.

        Prima si rimandava indietro lo snapshot letto al montaggio della
        pagina: `settings` e una colonna JSON sola, quindi assegnare un
        reparto riportava `seasons` e `activeSeasonId` a com'erano allora.
        Il reparto, se e nuovo, si persiste con la funzione che rilegge.
      */
      await ensureStaffDepartment(clubId, nextDepartment);

      showToast("success", "Reparto aggiornato con successo");
    } catch (error) {
      console.error("Error assigning staff department:", error);
      setAllStaffMembers(previousStaffMembers);
      setStaffMember((current: any) =>
        current ? { ...current, department: previousDepartment } : current,
      );
      showToast("error", "Errore nell'aggiornamento del reparto");
    } finally {
      setIsSavingDepartment(false);
    }
  };

  const handleDeleteStaffMember = async () => {
    if (!clubId || !staffId) return;

    if (confirm("Sei sicuro di voler eliminare questo membro dello staff?")) {
      try {
        await deleteStaffMember(clubId, staffId);
        showToast("success", "Membro dello staff eliminato con successo");
        router.push(`/staff?clubId=${clubId}`);
      } catch (error) {
        console.error("Error deleting staff member:", error);
        showToast("error", "Errore nell'eliminazione del membro dello staff");
      }
    }
  };

  /**
   * **Un messaggio verde che dice una cosa che non e successa.**
   *
   * Questo gestore non chiama niente: nessuna email parte, nessuna credenziale
   * viene generata. La segreteria leggeva «Credenziali inviate», chiudeva la
   * scheda, e il membro dello staff restava senza accesso senza che nessuno lo sapesse.
   *
   * La stessa correzione e gia stata fatta sulla scheda di un socio. Finche
   * l'invito non esiste come funzione del prodotto, il pulsante lo dichiara:
   * un'assenza dichiarata si puo pianificare, una promessa falsa no.
   */
  const handleShareCredentials = () => {
    showToast(
      "error",
      "L'invio delle credenziali non e ancora disponibile: si consegnano dall'area riservata della persona, dove l'accesso viene creato davvero.",
    );
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Dettaglio Membro Staff" />
          <main className={dashboardMainClassName}>
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Show error state if staff member not found
  if (!staffMember) {
    return (
      <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Membro Staff Non Trovato" />
          <main className={dashboardMainClassName}>
            <div className="flex flex-col items-center justify-center py-8">
              <h2 className="text-xl font-semibold mb-4">
                Membro dello staff non trovato
              </h2>
              <Button onClick={() => router.push(`/staff?clubId=${clubId}`)}>
                Torna alla lista staff
              </Button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const currentDepartment = normalizeDepartmentName(staffMember.department);
  const savedDepartmentOptions = staffDepartments.filter((department) =>
    normalizeDepartmentName(department.name),
  );
  const departmentOptions =
    currentDepartment &&
    !savedDepartmentOptions.some(
      (department) =>
        normalizeDepartmentName(department.name).toLowerCase() ===
        currentDepartment.toLowerCase(),
    )
      ? [
          ...savedDepartmentOptions,
          { id: `current-${currentDepartment}`, name: currentDepartment },
        ]
      : savedDepartmentOptions;

  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Dettaglio Membro Staff" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-7xl">
            <ClubPersonDetailHeader
              title={
                staffMember.fullName ||
                `${staffMember.name} ${staffMember.surname}`.trim()
              }
              iconType="staff"
              badges={[
                {
                  label: staffMember.role,
                  className: "bg-blue-500 text-white",
                },
                ...(staffMember.department
                  ? [{ label: staffMember.department, variant: "outline" as const }]
                  : []),
              ]}
              actions={
                <>
                  <Button
                    variant="outline"
                    className="flex-1 md:flex-none"
                    onClick={handleShareCredentials}
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    Invia Credenziali
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1 md:flex-none"
                    onClick={handleDeleteStaffMember}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Elimina
                  </Button>
                </>
              }
            />

            {/* Tabs for different sections */}
            <Tabs defaultValue="anagrafica">
              <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
                <TabsTrigger value="anagrafica">
                  <User className="h-4 w-4 mr-2" />
                  Anagrafica
                </TabsTrigger>
                <TabsTrigger value="societari">
                  <Briefcase className="h-4 w-4 mr-2" />
                  Dati Societari
                </TabsTrigger>
                <TabsTrigger value="documenti">
                  <IdCard className="h-4 w-4 mr-2" />
                  Documenti
                </TabsTrigger>
                <TabsTrigger value="lavoro">
                  <Briefcase className="h-4 w-4 mr-2" />
                  Lavoro e compensi
                </TabsTrigger>
              </TabsList>

              <TabsContent value="lavoro" className="mt-4 space-y-6">
                <PersonCompensationTab
                  originType="staff_member"
                  originId={staffId}
                  firstName={staffMember.name}
                  lastName={staffMember.surname}
                  fiscalCode={staffMember.fiscalCode || staffMember.fiscal_code}
                  email={staffMember.email}
                  phone={staffMember.phone}
                />
              </TabsContent>

              {/* ANAGRAFICA TAB */}
              <TabsContent value="anagrafica" className="mt-4 space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Informazioni Personali
                    </CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEditSection('personal')}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Nome</h3>
                        <p className="mt-1">{staffMember.name}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Cognome</h3>
                        <p className="mt-1">{staffMember.surname || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Età</h3>
                        <p className="mt-1">{staffMember.age || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Data di Nascita</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <CalendarDays className="h-4 w-4 text-muted-foreground" />
                          <p>{formatDate(staffMember.birthDate) || "-"}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Nazionalità</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          <p>{staffMember.nationality}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Luogo di Nascita</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <p>{staffMember.birthPlace || "-"}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Sesso</h3>
                        <p className="mt-1">{staffMember.gender || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Formazione Scolastica</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <GraduationCap className="h-4 w-4 text-muted-foreground" />
                          <p>{staffMember.education || "-"}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Codice Fiscale</h3>
                        <p className="mt-1">{staffMember.fiscalCode || "-"}</p>
                      </div>
                      <div className="md:col-span-3">
                        <h3 className="text-sm font-medium text-muted-foreground">Note</h3>
                        <p className="mt-1 text-sm">{staffMember.notes || "-"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Contatti e Residenza</CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEditSection('contacts')}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Email</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <p>{staffMember.email}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Telefono</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <p>{staffMember.phone}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Indirizzo</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <p>{staffMember.address}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Città</h3>
                        <p className="mt-1">{staffMember.city}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">CAP</h3>
                        <p className="mt-1">{staffMember.postalCode}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* DATI SOCIETARI TAB */}
              <TabsContent value="societari" className="mt-4 space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="h-5 w-5" />
                      Informazioni Societarie
                    </CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEditSection('company')}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Ruolo</h3>
                        <p className="mt-1">{staffMember.role}</p>
                      </div>
                      <div className="md:col-span-2">
                        <h3 className="text-sm font-medium text-muted-foreground">Reparto</h3>
                        <div className="mt-2 max-w-sm space-y-2">
                          <Select
                            value={staffMember.department || "__none__"}
                            onValueChange={handleDepartmentChange}
                            disabled={isSavingDepartment}
                          >
                            <SelectTrigger className="h-10">
                              <SelectValue placeholder="Seleziona reparto" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Non assegnato</SelectItem>
                              {departmentOptions.map((department) => (
                                <SelectItem
                                  key={department.id || department.name}
                                  value={department.name}
                                >
                                  {department.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            I reparti disponibili arrivano dalla gestione reparti dello staff.
                          </p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Stato</h3>
                        <Badge className={staffMember.status === "active" ? "bg-green-500" : "bg-gray-500"}>
                          {staffMember.status === "active" ? "Attivo" : "Inattivo"}
                        </Badge>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Data di Assunzione</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <p>{formatDate(staffMember.hireDate)}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/*
                  Le taglie si raccoglievano alla creazione e poi sparivano:
                  nessuna scheda di dettaglio le mostrava, quindi non si
                  potevano ne leggere ne correggere (Blocco A, punto 13).
                  Nessun numero di maglia qui: appartiene a chi scende in campo.
                */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Shirt className="h-5 w-5" />
                      Taglie vestiario
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditSection("clothing")}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <ClothingSizesSummary
                      value={staffMember.clothingSizes}
                      person={{
                        gender: staffMember.gender,
                        birthDate: staffMember.birthDate,
                      }}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* DOCUMENTI TAB */}
              <TabsContent value="documenti" className="mt-4 space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <IdCard className="h-5 w-5" />
                      Documento di Identità
                    </CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEditSection('document')}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Tipo di Documento</h3>
                        <p className="mt-1">{staffMember.documentType || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Numero Documento</h3>
                        <p className="mt-1">{staffMember.documentNumber || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Data di Rilascio</h3>
                        <p className="mt-1">{formatDate(staffMember.documentIssueDate) || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Scadenza del Documento</h3>
                        <p className="mt-1">{formatDate(staffMember.documentExpiry) || "-"}</p>
                      </div>
                      <div className="md:col-span-2">
                        <h3 className="text-sm font-medium text-muted-foreground">Scadenza Permesso di Soggiorno</h3>
                        <p className="mt-1">{formatDate(staffMember.residencePermitExpiry) || "-"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </DashboardPageContainer>
        </main>
      </div>

      {/* Edit Section Modal */}
      {editingSection && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setEditingSection(null)}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Modifica Informazioni</h3>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setEditingSection(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6 overflow-auto max-h-[calc(90vh-140px)]">
              {editingSection === 'personal' && (
                <div className="space-y-4">
                  {/*
                    I sei campi di identita, nell'ordine condiviso (RC Fix 2,
                    punto 1). Qui nome e cognome erano ancora due `<Input>`
                    nudi — senza la maiuscola automatica che il resto delle
                    anagrafiche ha da RC Fix 1 — e il luogo di nascita
                    esisteva due volte: come campo libero e come ricerca
                    dentro il codice fiscale.
                  */}
                  <PersonIdentityFields
                    idPrefix="staff-edit"
                    values={readPersonIdentity(editFormData, LEGACY_PERSON_NAME_KEYS)}
                    onChange={(patch) =>
                      setEditFormData((current: any) => ({
                        ...current,
                        ...writePersonIdentity(patch, LEGACY_PERSON_NAME_KEYS),
                      }))
                    }
                  />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Età</Label>
                      <Input
                        type="number"
                        value={editFormData.age || ''}
                        onChange={(e) => setEditFormData({...editFormData, age: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Nazionalità</Label>
                      <CapitalizedInput
                        value={editFormData.nationality || ''}
                        onChange={(e) => setEditFormData({...editFormData, nationality: e.target.value})}
                        onValueChange={(value) => setEditFormData({...editFormData, nationality: value})}
                      />
                    </div>
                    <div>
                      <Label>Formazione Scolastica</Label>
                      <CapitalizedInput
                        value={editFormData.education || ''}
                        onChange={(e) => setEditFormData({...editFormData, education: e.target.value})}
                        onValueChange={(value) => setEditFormData({...editFormData, education: value})}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Note</Label>
                      <Textarea
                        value={editFormData.notes || ''}
                        onChange={(e) => setEditFormData({...editFormData, notes: e.target.value})}
                        rows={3}
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingSection === 'contacts' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Email</Label>
                      <Input 
                        type="email"
                        value={editFormData.email || ''} 
                        onChange={(e) => setEditFormData({...editFormData, email: e.target.value})}
                      />
                    </div>
                    <div>
                      <PhoneField
                        label="Telefono"
                        value={editFormData.phone || ''}
                        onChange={(value) => setEditFormData({...editFormData, phone: value})}
                      />
                    </div>
                    {/*
                      Via, comune e CAP dal componente condiviso: il comune si
                      cerca nell'archivio ISTAT e porta con se il CAP quando ne
                      ha uno solo (Blocco A, punti 9 e 10).
                    */}
                    <div className="col-span-2">
                      <PersonResidenceFields
                        idPrefix="staff-edit"
                        values={editFormData}
                        onChange={(patch) =>
                          setEditFormData({ ...editFormData, ...patch })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingSection === 'company' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Ruolo</Label>
                      {/*
                        Era un campo libero: lo stesso ruolo finiva scritto in
                        tre modi diversi nello stesso club. Ora e l'elenco
                        condiviso (`STAFF_ROLES`, che dal Blocco 7 contiene
                        anche Presidente, Vicepresidente e Dirigente) piu i
                        ruoli davvero in uso, e «Altro» resta per i casi veri.
                      */}
                      <Select
                        value={
                          showCustomRole
                            ? CUSTOM_OPTION_VALUE
                            : editFormData.role || ""
                        }
                        onValueChange={(value) => {
                          if (value === CUSTOM_OPTION_VALUE) {
                            setShowCustomRole(true);
                            setEditFormData({ ...editFormData, role: "" });
                            return;
                          }
                          setShowCustomRole(false);
                          setEditFormData({ ...editFormData, role: value });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona ruolo" />
                        </SelectTrigger>
                        <SelectContent>
                          {collectStaffRoles(allStaffMembers).map((role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ))}
                          <SelectItem value={CUSTOM_OPTION_VALUE}>
                            Altro...
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {showCustomRole ? (
                        <Input
                          className="mt-2"
                          placeholder="Inserisci il ruolo"
                          value={editFormData.role || ""}
                          onChange={(e) =>
                            setEditFormData({
                              ...editFormData,
                              role: e.target.value,
                            })
                          }
                        />
                      ) : null}
                    </div>
                    <div>
                      <Label>Reparto</Label>
                      <Select
                        value={editFormData.department || "__none__"}
                        onValueChange={(value) =>
                          setEditFormData({
                            ...editFormData,
                            department: value === "__none__" ? "" : value,
                          })
                        }
                      >
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Seleziona reparto" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Non assegnato</SelectItem>
                          {departmentOptions.map((department) => (
                            <SelectItem
                              key={department.id || department.name}
                              value={department.name}
                            >
                              {department.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Stato</Label>
                      <select 
                        className="w-full h-10 rounded-md border border-input bg-background px-3"
                        value={editFormData.status || 'active'}
                        onChange={(e) => setEditFormData({...editFormData, status: e.target.value})}
                      >
                        <option value="active">Attivo</option>
                        <option value="inactive">Inattivo</option>
                      </select>
                    </div>
                    <div>
                      <Label>Data di Assunzione</Label>
                      <Input 
                        type="date"
                        value={editFormData.hireDate || ''} 
                        onChange={(e) => setEditFormData({...editFormData, hireDate: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingSection === "clothing" && (
                <ClothingSizesFields
                  idPrefix="staff-clothing"
                  value={editFormData.clothingSizes}
                  person={{
                    gender: editFormData.gender,
                    birthDate: editFormData.birthDate,
                  }}
                  onChange={(next) =>
                    setEditFormData({ ...editFormData, clothingSizes: next })
                  }
                />
              )}

              {editingSection === 'document' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Tipo di Documento</Label>
                      <Input 
                        value={editFormData.documentType || ''} 
                        onChange={(e) => setEditFormData({...editFormData, documentType: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Numero Documento</Label>
                      <Input 
                        value={editFormData.documentNumber || ''} 
                        onChange={(e) => setEditFormData({...editFormData, documentNumber: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Data di Rilascio</Label>
                      <Input 
                        type="date"
                        value={editFormData.documentIssueDate || ''} 
                        onChange={(e) => setEditFormData({...editFormData, documentIssueDate: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Scadenza del Documento</Label>
                      <Input 
                        type="date"
                        value={editFormData.documentExpiry || ''} 
                        onChange={(e) => setEditFormData({...editFormData, documentExpiry: e.target.value})}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Scadenza Permesso di Soggiorno</Label>
                      <Input 
                        type="date"
                        value={editFormData.residencePermitExpiry || ''} 
                        onChange={(e) => setEditFormData({...editFormData, residencePermitExpiry: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => setEditingSection(null)}>
                Annulla
              </Button>
              <Button onClick={handleSaveSection} className="bg-blue-600 hover:bg-blue-700">
                Salva Modifiche
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
