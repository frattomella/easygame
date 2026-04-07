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
  Briefcase,
  IdCard,
  CalendarDays,
  CreditCard,
  X,
} from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast-notification";
import { supabase } from "@/lib/supabase";
import { deleteClubDataItem } from "@/lib/simplified-db";

const getMemberIdentity = (memberData: Record<string, any>) => {
  const sanitizeText = (value: any) => {
    const trimmed = String(value ?? "").trim();
    return trimmed.toLowerCase() === "undefined undefined" ? "" : trimmed;
  };
  const firstName = String(
    memberData?.firstName ?? memberData?.first_name ?? "",
  ).trim();
  const lastName = String(
    memberData?.lastName ?? memberData?.last_name ?? memberData?.surname ?? "",
  ).trim();
  const explicitFullName = sanitizeText(
    memberData?.fullName ?? memberData?.full_name ?? memberData?.name,
  );
  const fullName =
    explicitFullName ||
    [firstName, lastName].filter(Boolean).join(" ").trim();

  return {
    firstName: firstName || (fullName ? fullName.split(/\s+/)[0] || "" : ""),
    lastName:
      lastName ||
      (fullName ? fullName.split(/\s+/).slice(1).join(" ").trim() : ""),
    fullName: fullName || "Nome non disponibile",
  };
};

export default function MemberDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const memberId = params?.id as string;
  const clubIdFromUrl = searchParams?.get("clubId");
  const [clubId, setClubId] = useState<string | null>(clubIdFromUrl);
  const [isLoading, setIsLoading] = useState(true);
  const [member, setMember] = useState<any>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});

  // Get clubId from URL or localStorage
  useEffect(() => {
    if (clubIdFromUrl && clubIdFromUrl !== "null") {
      setClubId(clubIdFromUrl);
      return;
    }
    
    // Try to get from localStorage
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
  }, [clubIdFromUrl]);

  // Fetch member data from database
  useEffect(() => {
    const fetchMemberData = async () => {
      // Validate clubId - check if it's null, "null", or empty
      if (!clubId || clubId === "null" || clubId.trim() === "") {
        // Don't show error if we're still trying to get clubId from localStorage
        if (clubIdFromUrl === null && typeof window !== "undefined") {
          // Wait for localStorage check
          return;
        }
        console.error("Invalid or missing clubId parameter:", clubId);
        showToast("error", "ID del club mancante. Torna alla lista soci.");
        setIsLoading(false);
        return;
      }

      if (!memberId) {
        console.error("Missing memberId parameter");
        showToast("error", "ID del socio mancante");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        console.log("Fetching club data for clubId:", clubId);
        
        const { data: clubData, error: clubError } = await supabase
          .from("clubs")
          .select("members")
          .eq("id", clubId)
          .maybeSingle();

        if (clubError) {
          console.error("Error fetching club data:", clubError);
          // Handle network errors gracefully
          const errorMessage = clubError.message?.includes("Failed to fetch") 
            ? "Errore di connessione. Verifica la tua connessione internet e riprova."
            : `Errore nel caricamento dei dati del club: ${clubError.message}`;
          showToast("error", errorMessage);
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

        // Find member in members array
        let memberData = null;
        if (clubData?.members && Array.isArray(clubData.members)) {
          memberData = clubData.members.find(
            (m: any) => m.id === memberId
          );
        }

        if (!memberData) {
          console.error("Member not found in club data. MemberId:", memberId);
          console.log("Available members:", clubData?.members);
          showToast("error", "Socio non trovato");
          setIsLoading(false);
          return;
        }

        const identity = getMemberIdentity(memberData);

        setMember({
          id: memberData.id,
          // Anagrafica
          name: identity.fullName,
          firstName: identity.firstName,
          lastName: identity.lastName,
          
          // Contatti
          email: memberData.email || "",
          phone: memberData.phone || "",
          
          // Dati associativi
          type: memberData.type || "Socio Ordinario",
          status: memberData.status || "active",
          registrationDate:
            memberData.registrationDate || memberData.membershipDate || "",
          membershipExpiry: memberData.membershipExpiry || "",
          membershipNumber: memberData.membershipNumber || "",
          notes: memberData.notes || "",
          
          // Avatar
          avatar: memberData.avatar || null,
        });
      } catch (error: any) {
        console.error("Error fetching member data:", error);
        // Handle network errors gracefully
        const errorMessage = error?.message?.includes("Failed to fetch") 
          ? "Errore di connessione. Verifica la tua connessione internet e riprova."
          : "Errore nel caricamento dei dati del socio";
        showToast("error", errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMemberData();
  }, [clubId, clubIdFromUrl, memberId, showToast]);

  const handleEditSection = (section: string) => {
    setEditingSection(section);
    setEditFormData({ ...member });
  };

  const handleSaveSection = async () => {
    if (!clubId || !memberId) return;

    try {
      const { updateClubDataItem } = await import("@/lib/simplified-db");
      const fullName = [editFormData.firstName, editFormData.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      const payload = {
        ...editFormData,
        name: fullName || editFormData.name || undefined,
        fullName: fullName || editFormData.fullName || undefined,
      };
      
      await updateClubDataItem(clubId, "members", memberId, payload);
      
      setMember(payload);
      setEditingSection(null);
      showToast("success", "Modifiche salvate con successo");
    } catch (error) {
      console.error("Error updating member:", error);
      showToast("error", "Errore nel salvataggio delle modifiche");
    }
  };

  const handleDeleteMember = async () => {
    if (!clubId || !memberId) return;

    if (confirm("Sei sicuro di voler eliminare questo socio?")) {
      try {
        await deleteClubDataItem(clubId, "members", memberId);
        showToast("success", "Socio eliminato con successo");
        router.push(`/soci?clubId=${clubId}`);
      } catch (error) {
        console.error("Error deleting member:", error);
        showToast("error", "Errore nell'eliminazione del socio");
      }
    }
  };

  const handleShareCredentials = () => {
    showToast("success", "Credenziali inviate al socio via email");
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
          <Header title="Dettaglio Socio" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Show error state if member not found
  if (!member) {
    return (
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Socio Non Trovato" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="flex flex-col items-center justify-center py-8">
              <h2 className="text-xl font-semibold mb-4">
                Socio non trovato
              </h2>
              <Button onClick={() => router.push(`/soci?clubId=${clubId}`)}>
                Torna alla lista soci
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
        <Header title="Dettaglio Socio" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            {/* Header with avatar and actions */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                <AvatarUpload
                  currentImage={member.avatar}
                  onImageChange={async (imageData) => {
                    const newAvatar = imageData || null;
                    setMember({ ...member, avatar: newAvatar });
                    
                    // Save to database immediately
                    if (clubId && memberId) {
                      try {
                        const { updateClubDataItem } = await import("@/lib/simplified-db");
                        await updateClubDataItem(clubId, "members", memberId, { avatar: newAvatar });
                        showToast("success", "Foto profilo aggiornata");
                      } catch (error) {
                        console.error("Error saving avatar:", error);
                        showToast("error", "Errore nel salvataggio della foto");
                      }
                    }
                  }}
                  name={member.name}
                  size="lg"
                  type="user"
                />
                <div>
                  <h1 className="text-2xl font-bold">{member.name}</h1>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className="bg-blue-500 text-white">
                      {member.type}
                    </Badge>
                    <Badge className={member.status === "active" ? "bg-green-500" : "bg-gray-500"}>
                      {member.status === "active" ? "Attivo" : "Inattivo"}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <Button variant="outline" className="flex-1 md:flex-none" onClick={handleShareCredentials}>
                  <Share2 className="h-4 w-4 mr-2" />
                  Invia Credenziali
                </Button>
                <Button variant="destructive" className="flex-1 md:flex-none" onClick={handleDeleteMember}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Elimina
                </Button>
              </div>
            </div>

            {/* Tabs for different sections */}
            <Tabs defaultValue="anagrafica">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="anagrafica">
                  <User className="h-4 w-4 mr-2" />
                  Informazioni Personali
                </TabsTrigger>
                <TabsTrigger value="associativi">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Dati Associativi
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Nome</h3>
                        <p className="mt-1">{member.firstName}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Cognome</h3>
                        <p className="mt-1">{member.lastName}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Email</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <p>{member.email}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Telefono</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <p>{member.phone}</p>
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <h3 className="text-sm font-medium text-muted-foreground">Note</h3>
                        <p className="mt-1 text-sm">{member.notes || "-"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* DATI ASSOCIATIVI TAB */}
              <TabsContent value="associativi" className="mt-4 space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Dati Associativi
                    </CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEditSection('membership')}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Tipo Socio</h3>
                        <p className="mt-1">{member.type}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Numero Tessera</h3>
                        <p className="mt-1">{member.membershipNumber || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Data Iscrizione</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <CalendarDays className="h-4 w-4 text-muted-foreground" />
                          <p>{formatDate(member.registrationDate)}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Scadenza Iscrizione</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <p>{formatDate(member.membershipExpiry)}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Stato</h3>
                        <Badge className={member.status === "active" ? "bg-green-500" : "bg-gray-500"}>
                          {member.status === "active" ? "Attivo" : "Inattivo"}
                        </Badge>
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
                        value={editFormData.firstName || ''} 
                        onChange={(e) => setEditFormData({...editFormData, firstName: e.target.value, name: `${e.target.value} ${editFormData.lastName || ''}`})}
                      />
                    </div>
                    <div>
                      <Label>Cognome</Label>
                      <Input 
                        value={editFormData.lastName || ''} 
                        onChange={(e) => setEditFormData({...editFormData, lastName: e.target.value, name: `${editFormData.firstName || ''} ${e.target.value}`})}
                      />
                    </div>
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

              {editingSection === 'membership' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Tipo Socio</Label>
                      <select 
                        className="w-full h-10 rounded-md border border-input bg-background px-3"
                        value={editFormData.type || 'Socio Ordinario'}
                        onChange={(e) => setEditFormData({...editFormData, type: e.target.value})}
                      >
                        <option value="Socio Ordinario">Socio Ordinario</option>
                        <option value="Socio Sostenitore">Socio Sostenitore</option>
                        <option value="Socio Onorario">Socio Onorario</option>
                      </select>
                    </div>
                    <div>
                      <Label>Numero Tessera</Label>
                      <Input 
                        value={editFormData.membershipNumber || ''} 
                        onChange={(e) => setEditFormData({...editFormData, membershipNumber: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Data Iscrizione</Label>
                      <Input 
                        type="date"
                        value={editFormData.registrationDate || ''} 
                        onChange={(e) => setEditFormData({...editFormData, registrationDate: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Scadenza Iscrizione</Label>
                      <Input 
                        type="date"
                        value={editFormData.membershipExpiry || ''} 
                        onChange={(e) => setEditFormData({...editFormData, membershipExpiry: e.target.value})}
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
