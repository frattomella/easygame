"use client";

import React, { Suspense, useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Save,
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Calendar,
  IdCard,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast-notification";
import { addStaffMember } from "@/lib/simplified-db";
import { AssistedFiscalCodeField } from "@/components/forms/assisted-anagrafica";
import { PhoneField } from "@/components/forms/phone-field";
import { CapitalizedInput } from "@/components/forms/capitalized-input";
import {
  CUSTOM_OPTION_VALUE,
  collectStaffRoles,
  type StaffDepartment as Department,
} from "@/lib/staff-directory";
import {
  ensureStaffDepartment,
  resolveStaffDepartments,
} from "@/lib/api/staff-departments";
import { useAuth } from "@/components/providers/AuthProvider";
import { supabase } from "@/lib/supabase";

interface StaffFormData {
  name: string;
  surname: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  status: string;
  hireDate: string;
  birthDate: string;
  nationality: string;
  birthPlace: string;
  /** Codice catastale del comune di nascita: lo compila la ricerca ISTAT. */
  birthPlaceCode: string;
  gender: string;
  address: string;
  city: string;
  postalCode: string;
  fiscalCode: string;
  documentType: string;
  documentNumber: string;
  documentExpiry: string;
  notes: string;
}

const initialFormData: StaffFormData = {
  name: "",
  surname: "",
  email: "",
  phone: "",
  role: "",
  department: "",
  status: "active",
  hireDate: "",
  birthDate: "",
  nationality: "Italiana",
  birthPlace: "",
  birthPlaceCode: "",
  gender: "",
  address: "",
  city: "",
  postalCode: "",
  fiscalCode: "",
  documentType: "",
  documentNumber: "",
  documentExpiry: "",
  notes: "",
};


function NewStaffMemberPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { activeClub } = useAuth();
  const clubIdFromParams = searchParams?.get("clubId");
  const [clubId, setClubId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<StaffFormData>(initialFormData);
  const [showCustomRole, setShowCustomRole] = useState(false);
  const [customRole, setCustomRole] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<string[]>(() => collectStaffRoles());
  const [showCustomDepartment, setShowCustomDepartment] = useState(false);
  const [customDepartment, setCustomDepartment] = useState("");

  // Get clubId from multiple sources: URL params, auth context, or localStorage
  useEffect(() => {
    // First try URL params
    if (clubIdFromParams && clubIdFromParams !== "null") {
      setClubId(clubIdFromParams);
      return;
    }
    
    // Then try auth context activeClub
    if (activeClub?.id) {
      setClubId(activeClub.id);
      return;
    }
    
    // Then try localStorage
    if (typeof window !== "undefined") {
      const storedClub = localStorage.getItem("activeClub");
      if (storedClub) {
        try {
          const parsed = JSON.parse(storedClub);
          if (parsed?.id) {
            setClubId(parsed.id);
            return;
          }
        } catch (e) {
          console.error("Error parsing activeClub from localStorage", e);
        }
      }
      
      // Also try user-specific activeClub
      const userId = localStorage.getItem("userId");
      if (userId) {
        const userClub = localStorage.getItem(`activeClub_${userId}`);
        if (userClub) {
          try {
            const parsed = JSON.parse(userClub);
            if (parsed?.id) {
              setClubId(parsed.id);
              return;
            }
          } catch (e) {
            console.error("Error parsing user activeClub from localStorage", e);
          }
        }
      }
    }
  }, [clubIdFromParams, activeClub]);

  // Fetch departments from club
  useEffect(() => {
    const fetchDepartments = async () => {
      if (!clubId) return;
      
      try {
        const { data: clubData, error } = await supabase
          .from("clubs")
          .select("settings, staff_members")
          .eq("id", clubId)
          .single();

        if (error) {
          console.error("Error fetching departments:", error);
          return;
        }

        const settings =
          clubData?.settings && typeof clubData.settings === "object"
            ? clubData.settings
            : {};
        const members = Array.isArray(clubData?.staff_members)
          ? clubData.staff_members
          : [];

        setDepartments(resolveStaffDepartments(settings, members));
        // Un ruolo scritto a mano su un membro esistente deve ricomparire in
        // tendina, altrimenti la scelta «Altro» andrebbe rifatta ogni volta.
        setRoles(collectStaffRoles(members));
      } catch (error) {
        console.error("Error fetching departments:", error);
      }
    };
    
    fetchDepartments();
  }, [clubId]);

  const handleInputChange = (field: keyof StaffFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clubId) {
      showToast("error", "ID del club mancante. Impossibile salvare.");
      return;
    }

    if (!formData.name.trim()) {
      showToast("error", "Il nome è obbligatorio");
      return;
    }

    if (!formData.surname.trim()) {
      showToast("error", "Il cognome è obbligatorio");
      return;
    }

    if (!formData.phone.trim() && !formData.email.trim()) {
      showToast("error", "È necessario inserire almeno un contatto (email o telefono)");
      return;
    }

    if (!formData.role.trim()) {
      showToast("error", "Il ruolo è obbligatorio");
      return;
    }

    setIsLoading(true);

    try {
      const fullName = [formData.name.trim(), formData.surname.trim()]
        .filter(Boolean)
        .join(" ");
      const newStaffMember = {
        ...formData,
        fullName,
        firstName: formData.name.trim(),
        lastName: formData.surname.trim(),
        avatar: null,
      };

      await addStaffMember(clubId, newStaffMember);

      /*
        Il reparto si persiste **qui**, non nella dialog di gestione.

        Era il difetto: un reparto creato con «Altro» restava una stringa sul
        membro. L'elenco staff lo mostrava lo stesso perche lo deduceva dai
        membri, quindi sembrava salvato, ma questo form e quello di modifica
        leggono `settings.staffDepartments`, dove non c'era mai arrivato.
      */
      await ensureStaffDepartment(clubId, formData.department);

      showToast("success", "Membro dello staff aggiunto con successo");
      router.push(`/staff?clubId=${clubId}`);
    } catch (error) {
      console.error("Error adding staff member:", error);
      showToast(
        "error",
        error instanceof Error
          ? error.message
          : "Errore durante l'aggiunta del membro dello staff",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-4xl">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.back()}
                className="rounded-full"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <SharedPageHeader
                title="Nuovo Membro dello Staff"
                subtitle="Compila i dati per aggiungere un nuovo membro"
                className="flex-1"
              />
            </div>

            <form onSubmit={handleSubmit}>
              {/* Anagrafica */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Anagrafica
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Nome *</Label>
                    <CapitalizedInput
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                      onValueChange={(value) => handleInputChange("name", value)}
                      placeholder="Inserisci il nome"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="surname">Cognome *</Label>
                    <CapitalizedInput
                      id="surname"
                      name="surname"
                      value={formData.surname}
                      onChange={(e) => handleInputChange("surname", e.target.value)}
                      onValueChange={(value) => handleInputChange("surname", value)}
                      placeholder="Inserisci il cognome"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="birthDate">Data di Nascita</Label>
                    <Input
                      id="birthDate"
                      type="date"
                      value={formData.birthDate}
                      onChange={(e) => handleInputChange("birthDate", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="nationality">Nazionalità</Label>
                    <Input
                      id="nationality"
                      value={formData.nationality}
                      onChange={(e) => handleInputChange("nationality", e.target.value)}
                      placeholder="Inserisci la nazionalità"
                    />
                  </div>
                  <div>
                    <Label htmlFor="gender">Genere</Label>
                    <Select
                      value={formData.gender}
                      onValueChange={(value) => handleInputChange("gender", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona genere" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">Maschio</SelectItem>
                        <SelectItem value="F">Femmina</SelectItem>
                        <SelectItem value="altro">Altro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/*
                    Il codice fiscale chiude il blocco anagrafico perche da
                    quel blocco si calcola, e porta con se il comune di
                    nascita: e da li che arriva il codice catastale.
                  */}
                  <AssistedFiscalCodeField
                    id="fiscalCode"
                    label="Codice Fiscale"
                    className="md:col-span-2"
                    value={formData.fiscalCode}
                    onChange={(value) => handleInputChange("fiscalCode", value)}
                    person={{
                      firstName: formData.name,
                      lastName: formData.surname,
                      birthDate: formData.birthDate,
                      gender: formData.gender,
                    }}
                    belfioreCode={formData.birthPlaceCode}
                    onBelfioreCodeChange={(value) =>
                      handleInputChange("birthPlaceCode", value)
                    }
                    birthPlace={formData.birthPlace}
                    onBirthPlaceChange={(value) =>
                      handleInputChange("birthPlace", value)
                    }
                  />
                </CardContent>
              </Card>

              {/* Contatti */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Contatti
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      placeholder="email@esempio.com"
                    />
                  </div>
                  <div>
                    <PhoneField
                      id="phone"
                      label="Telefono *"
                      value={formData.phone}
                      onChange={(value) => handleInputChange("phone", value)}
                    />
                    <p className="text-xs text-gray-500 mt-1">* Almeno un contatto è obbligatorio</p>
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="address">Indirizzo</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => handleInputChange("address", e.target.value)}
                      placeholder="Via, numero civico"
                    />
                  </div>
                  <div>
                    <Label htmlFor="city">Città</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => handleInputChange("city", e.target.value)}
                      placeholder="Inserisci la città"
                    />
                  </div>
                  <div>
                    <Label htmlFor="postalCode">CAP</Label>
                    <Input
                      id="postalCode"
                      value={formData.postalCode}
                      onChange={(e) => handleInputChange("postalCode", e.target.value)}
                      placeholder="00000"
                      maxLength={5}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Documento */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <IdCard className="h-5 w-5" />
                    Documento di Identità
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="documentType">Tipo Documento</Label>
                    <Select
                      value={formData.documentType}
                      onValueChange={(value) => handleInputChange("documentType", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="carta_identita">Carta d&apos;Identità</SelectItem>
                        <SelectItem value="patente">Patente</SelectItem>
                        <SelectItem value="passaporto">Passaporto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="documentNumber">Numero Documento</Label>
                    <Input
                      id="documentNumber"
                      value={formData.documentNumber}
                      onChange={(e) => handleInputChange("documentNumber", e.target.value)}
                      placeholder="Inserisci il numero"
                    />
                  </div>
                  <div>
                    <Label htmlFor="documentExpiry">Scadenza Documento</Label>
                    <Input
                      id="documentExpiry"
                      type="date"
                      value={formData.documentExpiry}
                      onChange={(e) => handleInputChange("documentExpiry", e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Dati Societari */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5" />
                    Dati Societari
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="role">Ruolo *</Label>
                    <Select
                      value={showCustomRole ? CUSTOM_OPTION_VALUE : formData.role}
                      onValueChange={(value) => {
                        if (value === CUSTOM_OPTION_VALUE) {
                          setShowCustomRole(true);
                          setCustomRole("");
                          handleInputChange("role", "");
                        } else {
                          setShowCustomRole(false);
                          setCustomRole("");
                          handleInputChange("role", value);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona ruolo" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_OPTION_VALUE}>
                          Altro...
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {showCustomRole && (
                      <div className="mt-2">
                        <Input
                          id="customRole"
                          placeholder="Inserisci ruolo personalizzato"
                          value={customRole}
                          onChange={(e) => {
                            setCustomRole(e.target.value);
                            handleInputChange("role", e.target.value);
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="department">Dipartimento</Label>
                    <Select
                      value={showCustomDepartment ? CUSTOM_OPTION_VALUE : formData.department}
                      onValueChange={(value) => {
                        if (value === CUSTOM_OPTION_VALUE) {
                          setShowCustomDepartment(true);
                          setCustomDepartment("");
                          handleInputChange("department", "");
                        } else {
                          setShowCustomDepartment(false);
                          setCustomDepartment("");
                          handleInputChange("department", value);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona dipartimento" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((dept) => (
                          <SelectItem key={dept.id} value={dept.name}>
                            {dept.name}
                          </SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_OPTION_VALUE}>
                          Altro...
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {showCustomDepartment && (
                      <div className="mt-2">
                        <Input
                          id="customDepartment"
                          placeholder="Inserisci dipartimento personalizzato"
                          value={customDepartment}
                          onChange={(e) => {
                            setCustomDepartment(e.target.value);
                            handleInputChange("department", e.target.value);
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="hireDate">Data Assunzione</Label>
                    <Input
                      id="hireDate"
                      type="date"
                      value={formData.hireDate}
                      onChange={(e) => handleInputChange("hireDate", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="status">Stato</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) => handleInputChange("status", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona stato" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Attivo</SelectItem>
                        <SelectItem value="inactive">Inattivo</SelectItem>
                        <SelectItem value="on_leave">In congedo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Note */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Note</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => handleInputChange("notes", e.target.value)}
                    placeholder="Inserisci eventuali note..."
                    rows={4}
                  />
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                >
                  Annulla
                </Button>
                <Button type="submit" disabled={isLoading}>
                  <Save className="mr-2 h-4 w-4" />
                  {isLoading ? "Salvataggio..." : "Salva Membro"}
                </Button>
              </div>
            </form>
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}

export default function NewStaffMemberPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Caricamento...</div>}>
      <NewStaffMemberPageContent />
    </Suspense>
  );
}
