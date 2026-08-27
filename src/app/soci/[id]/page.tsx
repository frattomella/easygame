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
  Briefcase,
  IdCard,
  CalendarDays,
  CreditCard,
  Shirt,
  X,
} from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast-notification";
import { supabase } from "@/lib/supabase";
import { deleteClubDataItem } from "@/lib/simplified-db";
import { formatPersonNameLastFirst } from "@/lib/athlete-name-utils";
import { PhoneField } from "@/components/forms/phone-field";
import { PersonResidenceFields } from "@/components/forms/assisted-anagrafica";
import { PersonIdentityFields } from "@/components/forms/person-identity-fields";
import type { PersonIdentityPatch } from "@/lib/person-identity";
import { genderLabel } from "@/lib/italian-registry";
import {
  ClothingSizesFields,
  ClothingSizesSummary,
} from "@/components/forms/clothing-sizes-fields";
import {
  DEFAULT_MEMBER_TYPE,
  MEMBER_TYPES,
  normalizeMemberType,
} from "@/lib/member-types";

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
    formatPersonNameLastFirst({
      first_name: firstName,
      last_name: lastName,
      name: explicitFullName,
      fullName: explicitFullName,
    }) || explicitFullName;

  return {
    firstName,
    lastName,
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
  const [clubId, setClubId] = useState<string | null>(clubIdFromUrl || null);
  const [isLoading, setIsLoading] = useState(true);
  const [member, setMember] = useState<any>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});

  /**
   * Nome e cognome del socio, tenendo allineato il nome composto.
   *
   * Esisteva gia, scritto due volte dentro gli `onChange`. Con la
   * capitalizzazione al blur i punti di scrittura diventavano quattro: se
   * restassero in linea, la prossima modifica ne allineerebbe tre su quattro.
   */
  /**
   * Scrive una modifica dell'anagrafica tenendo allineato `name`.
   *
   * Il nome per esteso e un campo derivato che l'elenco soci mostra: se si
   * scrive solo `firstName` resta quello vecchio, e nell'elenco il socio
   * continua a chiamarsi come prima. Accetta l'intera modifica del blocco di
   * identita, non solo nome e cognome, cosi c'e un solo modo di scrivere in
   * questa scheda.
   */
  const applyMemberName = (patch: PersonIdentityPatch) => {
    setEditFormData((current: any) => {
      const next = { ...current, ...patch };
      return {
        ...next,
        name: formatPersonNameLastFirst({
          firstName: next.firstName,
          lastName: next.lastName,
          name: current.name,
        }),
      };
    });
  };

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
          
          /*
            Questi nove campi il modulo di creazione li scriveva gia, e questa
            funzione li buttava via: costruiva un elenco chiuso di dodici
            chiavi, e cio che non era nell'elenco non arrivava alla scheda
            (Blocco A, punti 10 e 13).

            Il dato non si perdeva — `updateClubDataItem` fonde l'elemento
            invece di sostituirlo, quindi restava in archivio — ma nessuno
            poteva vederlo ne correggerlo. Un elenco chiuso di campi in un
            punto di lettura e un modo silenzioso di rendere invisibile meta
            di un'anagrafica: chi aggiunge un campo al modulo di creazione non
            ha nessun motivo di sospettare che esista anche qui.
          */
          birthDate: memberData.birthDate || "",
          gender: memberData.gender || "",
          birthPlace: memberData.birthPlace || "",
          birthPlaceCode: memberData.birthPlaceCode || "",
          fiscalCode: memberData.fiscalCode || "",
          address: memberData.address || "",
          city: memberData.city || "",
          postalCode: memberData.postalCode || "",
          clothingSizes: memberData.clothingSizes || null,

          // Contatti
          email: memberData.email || "",
          phone: memberData.phone || "",
          
          // Dati associativi
          type: normalizeMemberType(memberData.type),
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
      const fullName = formatPersonNameLastFirst({
        firstName: editFormData.firstName,
        lastName: editFormData.lastName,
        name: editFormData.name,
        fullName: editFormData.fullName,
      });
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
      <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Dettaglio Socio" />
          <main className={dashboardMainClassName}>
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
      <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Socio Non Trovato" />
          <main className={dashboardMainClassName}>
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
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Dettaglio Socio" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-7xl">
            <ClubPersonDetailHeader
              title={member.name}
              iconType="member"
              badges={[
                { label: member.type, className: "bg-blue-500 text-white" },
                {
                  label: member.status === "active" ? "Attivo" : "Inattivo",
                  className:
                    member.status === "active" ? "bg-green-500" : "bg-gray-500",
                },
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
                    onClick={handleDeleteMember}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Elimina
                  </Button>
                </>
              }
            />

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
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Data di Nascita</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <CalendarDays className="h-4 w-4 text-muted-foreground" />
                          <p>{formatDate(member.birthDate) || "-"}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Sesso</h3>
                        <p className="mt-1">{genderLabel(member.gender)}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Luogo di Nascita</h3>
                        <p className="mt-1">{member.birthPlace || "-"}</p>
                      </div>
                      {/*
                        Il codice fiscale sta dopo i dati anagrafici perche da
                        quelli si ricava: metterlo prima chiede di digitare a
                        mano cio che il campo sa calcolare (Blocco A, punto 1).
                      */}
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Codice Fiscale</h3>
                        <p className="mt-1 eg-tabular">{member.fiscalCode || "-"}</p>
                      </div>
                      <div className="md:col-span-2">
                        <h3 className="text-sm font-medium text-muted-foreground">Note</h3>
                        <p className="mt-1 text-sm">{member.notes || "-"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/*
                  Residenza e taglie si raccoglievano alla creazione e da li in
                  poi non esistevano piu: la scheda non le mostrava e non le
                  modificava, quindi un indirizzo sbagliato era definitivo
                  (Blocco A, punti 10 e 13).
                */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Contatti e Residenza
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditSection("contacts")}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="md:col-span-2">
                        <h3 className="text-sm font-medium text-muted-foreground">Indirizzo</h3>
                        <p className="mt-1">{member.address || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Citta</h3>
                        <p className="mt-1">{member.city || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">CAP</h3>
                        <p className="mt-1 eg-tabular">{member.postalCode || "-"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

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
                      value={member.clothingSizes}
                      person={{
                        gender: member.gender,
                        birthDate: member.birthDate,
                      }}
                    />
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
                    I sei campi di identita, nell'ordine condiviso. Qui email e
                    telefono stavano fra il cognome e la data di nascita, e il
                    luogo di nascita non c'era proprio: era la ricerca nascosta
                    dentro il codice fiscale.
                  */}
                  <PersonIdentityFields
                    idPrefix="member-edit"
                    values={editFormData}
                    onChange={applyMemberName}
                  />

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
                    <div className="sm:col-span-2">
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

              {/*
                Via, comune e CAP dal componente condiviso: il comune si cerca
                nell'archivio ISTAT e porta con se il CAP quando ne ha uno solo
                (Blocco A, punti 9 e 10).
              */}
              {editingSection === "contacts" && (
                <PersonResidenceFields
                  idPrefix="member-edit"
                  values={editFormData}
                  onChange={(patch) =>
                    setEditFormData({ ...editFormData, ...patch })
                  }
                />
              )}

              {editingSection === "clothing" && (
                <ClothingSizesFields
                  idPrefix="member-clothing"
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

              {editingSection === 'membership' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Tipo Socio</Label>
                      <select 
                        className="w-full h-10 rounded-md border border-input bg-background px-3"
                        value={editFormData.type || DEFAULT_MEMBER_TYPE}
                        onChange={(e) => setEditFormData({...editFormData, type: e.target.value})}
                      >
                        {/* L'elenco vive in lib/member-types.ts: lo usa anche
                            il form di creazione, che prima non lo conosceva. */}
                        {MEMBER_TYPES.map((memberType) => (
                          <option key={memberType} value={memberType}>
                            {memberType}
                          </option>
                        ))}
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
