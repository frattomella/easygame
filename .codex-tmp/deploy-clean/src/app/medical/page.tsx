"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Filter,
  FileHeart,
  AlertCircle,
  CheckCircle,
  Clock,
  Upload,
  Send,
  Download,
  Eye,
} from "lucide-react";
import { AddCertificateForm } from "@/components/forms/AddCertificateForm";
import { useToast } from "@/components/ui/toast-notification";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/providers/AuthProvider";
import { getMedicalCertificateStatus } from "@/lib/medical-certificates";
import {
  downloadClientFileUrl,
  openClientFileUrl,
} from "@/lib/client-files";

interface Certificate {
  id: string;
  athleteId: string;
  athleteName: string;
  certificateType: string;
  issueDate: string;
  expiryDate: string;
  status: "valid" | "expiring" | "expired";
  fileUrl?: string;
  avatar?: string;
}

const getCertificateSortTime = (certificate: Pick<Certificate, "expiryDate" | "issueDate">) => {
  const expiryTime = certificate.expiryDate
    ? new Date(certificate.expiryDate).getTime()
    : 0;
  const issueTime = certificate.issueDate
    ? new Date(certificate.issueDate).getTime()
    : 0;

  return Math.max(expiryTime, issueTime, 0);
};

const upsertCertificateByAthlete = (
  currentCertificates: Certificate[],
  nextCertificate: Certificate,
) => {
  const remainingCertificates = currentCertificates.filter(
    (certificate) => certificate.athleteId !== nextCertificate.athleteId,
  );

  return [...remainingCertificates, nextCertificate];
};

export default function MedicalPage() {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeTab, setActiveTab] = React.useState("all");
  const [certificates, setCertificates] = React.useState<Certificate[]>([]);
  const [showAddCertificateModal, setShowAddCertificateModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [clubId, setClubId] = useState<string | null>(null);
  const { showToast } = useToast();
  const { activeClub } = useAuth();

  // Fetch club ID from URL or active club
  useEffect(() => {
    const getClubId = async () => {
      try {
        // First check URL query parameter
        const searchParams = new URLSearchParams(window.location.search);
      const urlClubId = searchParams?.get("clubId");

        if (urlClubId) {
          setClubId(urlClubId);
          return;
        }

        // Then check active club from context
        if (activeClub?.id) {
          setClubId(activeClub.id);
          return;
        }

        // Then check localStorage for active club
        const storedActiveClub = localStorage.getItem("activeClub");
        if (storedActiveClub) {
          try {
            const parsedClub = JSON.parse(storedActiveClub);
            if (parsedClub.id) {
              setClubId(parsedClub.id);
              return;
            }
          } catch (e) {
            console.error("Error parsing active club:", e);
          }
        }
      } catch (error) {
        console.error("Error getting club ID:", error);
      }
    };

    getClubId();
  }, [activeClub]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    if (!action) {
      return;
    }

    if (action === "new") {
      setShowAddCertificateModal(true);
    }

    params.delete("action");
    const nextQuery = params.toString();
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, []);

  // Fetch medical certificates and athletes
  useEffect(() => {
    const fetchData = async () => {
      if (!clubId) return;

      setIsLoading(true);
      try {
        // Try to fetch from simplified_athletes first (new structure)
        let { data: athletesData, error: athletesError } = await supabase
          .from("simplified_athletes")
          .select("*")
          .eq("club_id", clubId);

        // If not found, try the athletes table (legacy structure)
        if (!athletesData || athletesData.length === 0) {
          const { data: legacyAthletes, error: legacyError } = await supabase
            .from("athletes")
            .select("*")
            .eq("organization_id", clubId);

          if (!legacyError && legacyAthletes) {
            athletesData = legacyAthletes;
            athletesError = null;
          }
        }

        if (athletesError) throw athletesError;
        setAthletes(athletesData || []);

        // Fetch medical certificates - only if we have athletes
        let certificatesData = null;
        if (athletesData && athletesData.length > 0) {
          const athleteIds = athletesData
            .map((a) => a.id)
            .filter((id) => id && id.trim() !== "");

          if (athleteIds.length > 0) {
            const { data, error: certificatesError } = await supabase
              .from("medical_certificates")
              .select("*")
              .in("athlete_id", athleteIds);

            if (certificatesError) throw certificatesError;
            certificatesData = data;
          }
        }

        // Process certificates data and keep only the most recent certificate per athlete.
        const certificatesByAthlete = new Map<string, Certificate>();

        if (certificatesData) {
          for (const cert of certificatesData) {
            // Find athlete for this certificate
            const athlete = athletesData?.find((a) => a.id === cert.athlete_id);
            if (!athlete) continue;

            const athleteName =
              athlete.first_name && athlete.last_name
                ? `${athlete.first_name} ${athlete.last_name}`.trim()
                : athlete.name || "Atleta Sconosciuto";
            const candidateCertificate: Certificate = {
              id: cert.id,
              athleteId: cert.athlete_id,
              athleteName,
              certificateType: cert.notes || cert.type || "Certificato Medico",
              issueDate: cert.issue_date,
              expiryDate: cert.expiry_date,
              status: getMedicalCertificateStatus(cert.expiry_date),
              fileUrl: cert.file_url || cert.document_url || "",
              avatar:
                athlete.profile_image ||
                athlete.data?.avatar ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${athleteName.replace(/\s+/g, "")}`,
            };
            const currentCertificate = certificatesByAthlete.get(athlete.id);

            if (
              !currentCertificate ||
              getCertificateSortTime(candidateCertificate) >=
                getCertificateSortTime(currentCertificate)
            ) {
              certificatesByAthlete.set(athlete.id, candidateCertificate);
            }
          }
        }

        // Add athletes without certificates as expired
        if (athletesData) {
          const athletesWithCertificates = new Set(
            certificatesData?.map((cert) => cert.athlete_id) || [],
          );

          const athletesWithoutCertificates = athletesData.filter(
            (athlete) => !athletesWithCertificates.has(athlete.id),
          );

          for (const athlete of athletesWithoutCertificates) {
            const athleteName =
              athlete.first_name && athlete.last_name
                ? `${athlete.first_name} ${athlete.last_name}`.trim()
                : athlete.name || "Atleta Sconosciuto";
            certificatesByAthlete.set(athlete.id, {
              id: `missing-${athlete.id}`,
              athleteId: athlete.id,
              athleteName,
              certificateType: "Certificato Medico Mancante",
              issueDate: "",
              expiryDate: new Date().toISOString().split("T")[0], // Today's date
              status: "expired",
              avatar:
                athlete.profile_image ||
                athlete.data?.avatar ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${athleteName.replace(/\s+/g, "")}`,
            });
          }
        }

        setCertificates(Array.from(certificatesByAthlete.values()));
      } catch (error) {
        console.error("Error fetching data:", error);
        showToast("error", "Errore nel caricamento dei dati");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [clubId, showToast]);

  const handleAddCertificate = async (certificateData: any) => {
    try {
      // Validate required data
      if (!certificateData.athleteId || !certificateData.organizationId) {
        showToast("error", "Dati mancanti per il salvataggio");
        return false;
      }

      // Validate athlete ID is a valid UUID
      if (
        !certificateData.athleteId ||
        certificateData.athleteId.trim() === ""
      ) {
        showToast("error", "ID atleta non valido");
        return false;
      }

      // Validate file upload
      if (!certificateData.fileUrl || certificateData.fileUrl.trim() === "") {
        showToast("error", "Il caricamento del file è obbligatorio");
        return false;
      }

      // Insert the new certificate into Supabase
      const { data, error } = await supabase
        .from("medical_certificates")
        .insert({
          organization_id: certificateData.organizationId,
          athlete_id: certificateData.athleteId,
          type: certificateData.certificateType,
          issue_date: certificateData.issueDate,
          expiry_date: certificateData.expiryDate,
          file_url: certificateData.fileUrl || null,
          status: getMedicalCertificateStatus(certificateData.expiryDate),
          notes: certificateData.certificateType,
          data: {
            source: "medical-page",
            uploaded_file_name: certificateData.fileName || null,
          },
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        // Find the athlete
        const athlete = athletes.find(
          (a) => a.id === certificateData.athleteId,
        );

        // Create the new certificate object
        const newCertificate: Certificate = {
          id: data.id,
          athleteId: certificateData.athleteId,
          athleteName: athlete
            ? `${athlete.first_name} ${athlete.last_name}`.trim()
            : certificateData.athleteName,
          certificateType: certificateData.certificateType,
          issueDate: certificateData.issueDate,
          expiryDate: certificateData.expiryDate,
          status: getMedicalCertificateStatus(certificateData.expiryDate),
          fileUrl: certificateData.fileUrl || "",
          avatar:
            athlete?.profile_image ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${athlete ? athlete.first_name + athlete.last_name : certificateData.athleteName.replace(/ /g, "")}`,
        };

        setCertificates((currentCertificates) =>
          upsertCertificateByAthlete(currentCertificates, newCertificate),
        );

        setAthletes((currentAthletes) =>
          currentAthletes.map((currentAthlete) => {
            if (currentAthlete.id !== certificateData.athleteId) {
              return currentAthlete;
            }

            const currentExpiry = currentAthlete.data?.medicalCertExpiry;
            const nextExpiry =
              currentExpiry &&
              new Date(currentExpiry).getTime() > new Date(certificateData.expiryDate).getTime()
                ? currentExpiry
                : certificateData.expiryDate;

            return {
              ...currentAthlete,
              data: {
                ...(currentAthlete.data || {}),
                medicalCertExpiry: nextExpiry,
              },
            };
          }),
        );

        try {
          const { updateAthlete } = await import("@/lib/simplified-db");
          const currentExpiry = athlete?.data?.medicalCertExpiry;
          const nextExpiry =
            currentExpiry &&
            new Date(currentExpiry).getTime() > new Date(certificateData.expiryDate).getTime()
              ? currentExpiry
              : certificateData.expiryDate;

          await updateAthlete(certificateData.athleteId, {
            data: {
              medicalCertExpiry: nextExpiry,
            },
          });
        } catch (syncError) {
          console.warn("Unable to sync athlete medical certificate summary:", syncError);
        }

        showToast(
          "success",
          `Certificato per ${newCertificate.athleteName} aggiunto con successo`,
        );

        return true;
      }

      return false;
    } catch (error) {
      console.error("Error adding certificate:", error);
      showToast("error", "Errore nell'aggiunta del certificato");
      return false;
    }
  };

  const getStatusIcon = (status: Certificate["status"]) => {
    switch (status) {
      case "valid":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "expiring":
        return <Clock className="h-5 w-5 text-amber-500" />;
      case "expired":
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: Certificate["status"]) => {
    switch (status) {
      case "valid":
        return <Badge className="bg-green-500 text-white">Valido</Badge>;
      case "expiring":
        return <Badge className="bg-amber-500 text-white">In Scadenza</Badge>;
      case "expired":
        return <Badge variant="destructive">Scaduto</Badge>;
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const filteredCertificates = certificates
    .filter((certificate) =>
      certificate.athleteName.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .filter((certificate) => {
      if (activeTab === "all") return true;
      return certificate.status === activeTab;
    });

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Certificati Medici" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-9xl space-y-6">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Certificati medici
              </h1>
              <p className="text-gray-600 mt-2">
                Controlla e aggiorna lo stato dei certificati medici degli
                atleti.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-white">
                <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                  <div className="rounded-full bg-green-100 p-3 mb-4">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </div>
                  <CardTitle className="text-xl mb-1">Validi</CardTitle>
                  <p className="text-3xl font-bold">
                    {certificates.filter((c) => c.status === "valid").length}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-white">
                <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                  <div className="rounded-full bg-amber-100 p-3 mb-4">
                    <Clock className="h-6 w-6 text-amber-600" />
                  </div>
                  <CardTitle className="text-xl mb-1">In Scadenza</CardTitle>
                  <p className="text-3xl font-bold">
                    {certificates.filter((c) => c.status === "expiring").length}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-white">
                <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                  <div className="rounded-full bg-red-100 p-3 mb-4">
                    <AlertCircle className="h-6 w-6 text-red-600" />
                  </div>
                  <CardTitle className="text-xl mb-1">Scaduti</CardTitle>
                  <p className="text-3xl font-bold">
                    {certificates.filter((c) => c.status === "expired").length}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="relative w-full sm:w-auto">
                <Input
                  placeholder="Cerca atleti..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-full sm:w-80"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="flex-1 sm:flex-none">
                      <Filter className="h-4 w-4 mr-2" />
                      Filtri
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      onClick={() =>
                        showToast("info", "Filtro per stato applicato")
                      }
                    >
                      Per Stato
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        showToast(
                          "info",
                          "Filtro per tipo certificato applicato",
                        )
                      }
                    >
                      Per Tipo Certificato
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        showToast("info", "Filtro per data scadenza applicato")
                      }
                    >
                      Per Data Scadenza
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => showToast("info", "Filtri resettati")}
                    >
                      Resetta Filtri
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700"
                  onClick={() => setShowAddCertificateModal(true)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Carica Certificato
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader className="pb-0">
                <Tabs defaultValue="all" onValueChange={setActiveTab}>
                  <TabsList>
                    <TabsTrigger value="all">Tutti</TabsTrigger>
                    <TabsTrigger value="valid">Validi</TabsTrigger>
                    <TabsTrigger value="expiring">In Scadenza</TabsTrigger>
                    <TabsTrigger value="expired">Scaduti</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent className="pt-6">
                {isLoading ? (
                  <div className="flex justify-center items-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredCertificates.map((certificate) => (
                      <div
                        key={certificate.id}
                        className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg gap-4"
                      >
                        <div className="flex items-center gap-4">
                          <Avatar>
                            <AvatarImage
                              src={certificate.avatar}
                              alt={certificate.athleteName}
                            />
                            <AvatarFallback>
                              {certificate.athleteName.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h4 className="font-medium">
                              {certificate.athleteName}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {certificate.certificateType}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-sm">
                            <p className="text-muted-foreground">Emesso il:</p>
                            <p>{formatDate(certificate.issueDate)}</p>
                          </div>
                          <div className="text-sm">
                            <p className="text-muted-foreground">Scade il:</p>
                            <p
                              className={
                                certificate.status === "expired"
                                  ? "text-red-500 font-medium"
                                  : ""
                              }
                            >
                              {formatDate(certificate.expiryDate)}
                            </p>
                          </div>
                          <div>{getStatusBadge(certificate.status)}</div>
                        </div>
                        <div className="flex gap-2 ml-auto">
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (!openClientFileUrl(certificate.fileUrl)) {
                                  showToast(
                                    "error",
                                    "File del certificato non disponibile",
                                  );
                                }
                              }}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Visualizza
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-green-600 border-green-600 hover:bg-green-50"
                              onClick={() => {
                                if (
                                  !downloadClientFileUrl(
                                    certificate.fileUrl,
                                    `certificato-${certificate.athleteName}-${certificate.certificateType}`,
                                  )
                                ) {
                                  showToast(
                                    "error",
                                    "File del certificato non disponibile",
                                  );
                                }
                              }}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Scarica
                            </Button>
                          </div>
                          {(certificate.status === "expiring" ||
                            certificate.status === "expired") && (
                            <Button
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700"
                            >
                              <Send className="h-3.5 w-3.5 mr-1" />
                              Invia Promemoria
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}

                    {filteredCertificates.length === 0 && !isLoading && (
                      <div className="text-center py-8">
                        <FileHeart className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-4" />
                        <h3 className="text-lg font-medium">
                          Nessun certificato trovato
                        </h3>
                        <p className="text-muted-foreground">
                          Prova a modificare i filtri di ricerca
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      <AddCertificateForm
        isOpen={showAddCertificateModal}
        onClose={() => setShowAddCertificateModal(false)}
        onSubmit={handleAddCertificate}
        athletes={athletes.map((athlete) => ({
          id: athlete.id,
          name: `${athlete.first_name} ${athlete.last_name}`.trim(),
        }))}
        clubId={clubId}
      />
    </div>
  );
}
