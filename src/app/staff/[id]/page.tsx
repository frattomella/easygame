"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Building,
  X,
} from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast-notification";
import { supabase } from "@/lib/supabase";
import { deleteStaffMember } from "@/lib/simplified-db";

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
  const [clubId, setClubId] = useState<string | null>(clubIdFromParams);
  const [isLoading, setIsLoading] = useState(true);
  const [staffMember, setStaffMember] = useState<any>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});

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
        console.log("Fetching club data for clubId:", clubId);
        
        const { data: clubData, error: clubError } = await supabase
          .from("clubs")
          .select("staff_members")
          .eq("id", clubId)
          .maybeSingle();

        if (clubError) {
          // Handle network errors with retry
          if (clubError.message?.includes("Failed to fetch") && retryCount < 3) {
            console.log(`Retry attempt ${retryCount + 1} for fetching club data...`);
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

        console.log("Club data loaded successfully:", clubData);

        // Find staff member in staff_members array
        let staffData = null;
        if (clubData?.staff_members && Array.isArray(clubData.staff_members)) {
          staffData = clubData.staff_members.find(
            (staff: any) => staff.id === staffId
          );
        }

        if (!staffData) {
          console.error("Staff member not found in club data. StaffId:", staffId);
          console.log("Available staff members:", clubData?.staff_members);
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
          avatar: staffData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent((staffData.name || "staff").replace(/\s+/g, ""))}`,
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
      
      setStaffMember(payload);
      setEditingSection(null);
      showToast("success", "Modifiche salvate con successo");
    } catch (error) {
      console.error("Error updating staff member:", error);
      showToast("error", "Errore nel salvataggio delle modifiche");
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

  const handleShareCredentials = () => {
    showToast("success", "Credenziali inviate al membro dello staff via email");
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
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Dettaglio Membro Staff" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
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
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Membro Staff Non Trovato" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
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

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Dettaglio Membro Staff" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            {/* Header with avatar and actions */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                <AvatarUpload
                  currentImage={staffMember.avatar}
                  onImageChange={async (imageData) => {
                    const newAvatar = imageData || null;
                    setStaffMember({ ...staffMember, avatar: newAvatar });
                    
                    // Save to database immediately
                    if (clubId && staffId) {
                      try {
                        const { updateClubDataItem } = await import("@/lib/simplified-db");
                        await updateClubDataItem(clubId, "staff_members", staffId, { avatar: newAvatar });
                        showToast("success", "Foto profilo aggiornata");
                      } catch (error) {
                        console.error("Error saving avatar:", error);
                        showToast("error", "Errore nel salvataggio della foto");
                      }
                    }
                  }}
                  name={
                    staffMember.fullName ||
                    `${staffMember.name} ${staffMember.surname || ""}`.trim()
                  }
                  size="lg"
                  type="user"
                />
                <div>
                  <h1 className="text-2xl font-bold">
                    {staffMember.fullName ||
                      `${staffMember.name} ${staffMember.surname}`.trim()}
                  </h1>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className="bg-blue-500 text-white">
                      {staffMember.role}
                    </Badge>
                    {staffMember.department && (
                      <Badge variant="outline">
                        {staffMember.department}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <Button variant="outline" className="flex-1 md:flex-none" onClick={handleShareCredentials}>
                  <Share2 className="h-4 w-4 mr-2" />
                  Invia Credenziali
                </Button>
                <Button variant="destructive" className="flex-1 md:flex-none" onClick={handleDeleteStaffMember}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Elimina
                </Button>
              </div>
            </div>

            {/* Tabs for different sections */}
            <Tabs defaultValue="anagrafica">
              <TabsList className="grid w-full grid-cols-2 md:grid-cols-3">
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
              </TabsList>

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
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Dipartimento</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Building className="h-4 w-4 text-muted-foreground" />
                          <p>{staffMember.department || "-"}</p>
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
          </div>
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
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Nome</Label>
                      <Input 
                        value={editFormData.name || ''} 
                        onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Cognome</Label>
                      <Input 
                        value={editFormData.surname || ''} 
                        onChange={(e) => setEditFormData({...editFormData, surname: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Età</Label>
                      <Input 
                        type="number"
                        value={editFormData.age || ''} 
                        onChange={(e) => setEditFormData({...editFormData, age: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Data di Nascita</Label>
                      <Input 
                        type="date"
                        value={editFormData.birthDate || ''} 
                        onChange={(e) => setEditFormData({...editFormData, birthDate: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Nazionalità</Label>
                      <Input 
                        value={editFormData.nationality || ''} 
                        onChange={(e) => setEditFormData({...editFormData, nationality: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Luogo di Nascita</Label>
                      <Input 
                        value={editFormData.birthPlace || ''} 
                        onChange={(e) => setEditFormData({...editFormData, birthPlace: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Sesso</Label>
                      <Input 
                        value={editFormData.gender || ''} 
                        onChange={(e) => setEditFormData({...editFormData, gender: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Formazione Scolastica</Label>
                      <Input 
                        value={editFormData.education || ''} 
                        onChange={(e) => setEditFormData({...editFormData, education: e.target.value})}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Codice Fiscale</Label>
                      <Input 
                        value={editFormData.fiscalCode || ''} 
                        onChange={(e) => setEditFormData({...editFormData, fiscalCode: e.target.value})}
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
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Email</Label>
                      <Input 
                        type="email"
                        value={editFormData.email || ''} 
                        onChange={(e) => setEditFormData({...editFormData, email: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Telefono</Label>
                      <Input 
                        value={editFormData.phone || ''} 
                        onChange={(e) => setEditFormData({...editFormData, phone: e.target.value})}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Indirizzo</Label>
                      <Input 
                        value={editFormData.address || ''} 
                        onChange={(e) => setEditFormData({...editFormData, address: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Città</Label>
                      <Input 
                        value={editFormData.city || ''} 
                        onChange={(e) => setEditFormData({...editFormData, city: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>CAP</Label>
                      <Input 
                        value={editFormData.postalCode || ''} 
                        onChange={(e) => setEditFormData({...editFormData, postalCode: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingSection === 'company' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Ruolo</Label>
                      <Input 
                        value={editFormData.role || ''} 
                        onChange={(e) => setEditFormData({...editFormData, role: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Dipartimento</Label>
                      <Input 
                        value={editFormData.department || ''} 
                        onChange={(e) => setEditFormData({...editFormData, department: e.target.value})}
                      />
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

              {editingSection === 'document' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
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
