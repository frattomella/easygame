"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
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
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/providers/AuthProvider";
import { apiRequest } from "@/lib/api/client";
import { getMedicalCertificateStatus } from "@/lib/medical-certificates";
import { getAthleteDisplayName } from "@/lib/athlete-name-utils";
import { athleteMatchesAnyCategory } from "@/lib/category-utils";
import { getClubCategories } from "@/lib/simplified-db";
import {
  downloadAttachment,
  downloadClientFileUrl,
  openClientFileUrl,
} from "@/lib/client-files";
import { EntityIcon } from "@/components/ui/entity-icon";

interface Certificate {
  id: string;
  athleteId: string;
  athleteName: string;
  certificateType: string;
  issueDate: string;
  expiryDate: string;
  status: "valid" | "expiring" | "expired" | "missing";
  fileUrl?: string;
  avatar?: string;
}

type MedicalAthleteRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  profile_image?: string | null;
  data?: ({
    avatar?: string | null;
    medicalCertExpiry?: string | null;
  } & Record<string, unknown>) | null;
  [key: string]: unknown;
};

type MedicalCertificateRow = {
  id: string;
  athlete_id: string;
  notes?: string | null;
  type?: string | null;
  issue_date: string;
  expiry_date: string;
  file_url?: string | null;
  document_url?: string | null;
};

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
  const [athletes, setAthletes] = useState<MedicalAthleteRow[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<
    { id: string; name: string }[]
  >([]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [remindingAthleteId, setRemindingAthleteId] = useState<string | null>(
    null,
  );
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
        const categoriesData = await getClubCategories(clubId);
        setCategoryOptions(categoriesData);

        // Fetch medical certificates - only if we have athletes
        let certificatesData = null;
        if (athletesData && athletesData.length > 0) {
          const athleteIds = athletesData
            .map((athlete: MedicalAthleteRow) => athlete.id)
            .filter((id: string) => id.trim() !== "");

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
          for (const cert of certificatesData as MedicalCertificateRow[]) {
            // Find athlete for this certificate
            const athlete = athletesData?.find(
              (row: MedicalAthleteRow) => row.id === cert.athlete_id,
            );
            if (!athlete) continue;

            const athleteName =
              getAthleteDisplayName(athlete) || "Atleta Sconosciuto";
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
                "",
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

        // Add athletes without certificates as missing
        if (athletesData) {
          const athletesWithCertificates = new Set(
            certificatesData?.map(
              (cert: MedicalCertificateRow) => cert.athlete_id,
            ) || [],
          );

          const athletesWithoutCertificates = athletesData.filter(
            (athlete: MedicalAthleteRow) =>
              !athletesWithCertificates.has(athlete.id),
          );

          for (const athlete of athletesWithoutCertificates) {
            const athleteName =
              getAthleteDisplayName(athlete) || "Atleta Sconosciuto";
            certificatesByAthlete.set(athlete.id, {
              id: `missing-${athlete.id}`,
              athleteId: athlete.id,
              athleteName,
              certificateType: "Certificato Medico Mancante",
              issueDate: "",
              expiryDate: "",
              status: "missing",
              avatar:
                athlete.profile_image ||
                athlete.data?.avatar ||
                "",
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
            ? getAthleteDisplayName(athlete)
            : certificateData.athleteName,
          certificateType: certificateData.certificateType,
          issueDate: certificateData.issueDate,
          expiryDate: certificateData.expiryDate,
          status: getMedicalCertificateStatus(certificateData.expiryDate),
          fileUrl: certificateData.fileUrl || "",
          avatar:
            athlete?.profile_image ||
            athlete?.data?.avatar ||
            "",
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
      case "missing":
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
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
      case "missing":
        return <Badge variant="secondary">Mancante</Badge>;
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/D";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "N/D";
    return date.toLocaleDateString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const athletesById = React.useMemo(() => {
    return new Map(athletes.map((athlete) => [athlete.id, athlete]));
  }, [athletes]);

  const selectedCategoryOption = React.useMemo(
    () =>
      categoryOptions.find((category) => category.id === categoryFilter) ||
      null,
    [categoryFilter, categoryOptions],
  );

  const handleSendReminder = async (certificate: Certificate) => {
    if (!clubId) {
      showToast("error", "Club non selezionato");
      return;
    }

    setRemindingAthleteId(certificate.athleteId);
    try {
      const response = await apiRequest<{
        created: number;
        skipped: number;
        recipients: number;
      }>("/api/medical-certificate-reminders", {
        method: "POST",
        body: {
          athleteId: certificate.athleteId,
          certificateId: certificate.id.startsWith("missing-")
            ? undefined
            : certificate.id,
          organizationId: clubId,
        },
      });

      if (response.error) {
        showToast("error", response.error.message);
        return;
      }

      const created = response.data?.created || 0;
      const skipped = response.data?.skipped || 0;
      showToast(
        created > 0 ? "success" : "info",
        created > 0
          ? `Promemoria inviato a ${certificate.athleteName}`
          : skipped > 0
            ? "Promemoria gia presente per questo certificato"
            : "Nessun parent collegato a questo atleta",
      );
    } finally {
      setRemindingAthleteId(null);
    }
  };

  const filteredCertificates = certificates
    .filter((certificate) =>
      certificate.athleteName.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .filter((certificate) => {
      if (activeTab === "all") return true;
      return certificate.status === activeTab;
    })
    .filter((certificate) => {
      if (!selectedCategoryOption) return true;
      const athlete = athletesById.get(certificate.athleteId);
      return athleteMatchesAnyCategory(athlete, [selectedCategoryOption]);
    });

  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Certificati Medici" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <SharedPageHeader
              title="Certificati medici"
              subtitle="Controlla e aggiorna lo stato dei certificati medici degli atleti."
            />
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
              <div className="flex flex-col gap-2 w-full sm:w-auto sm:flex-row">
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-56"
                >
                  <option value="all">Tutte le categorie</option>
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
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
                    <TabsTrigger value="missing">Mancanti</TabsTrigger>
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
                    {filteredCertificates.map((certificate) => {
                      const hasCertificateFile =
                        certificate.status !== "missing" &&
                        typeof certificate.fileUrl === "string" &&
                        certificate.fileUrl.trim().length > 0;

                      return (
                        <div
                          key={certificate.id}
                          className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg gap-4"
                        >
                        <div className="flex items-center gap-4">
                          <Avatar>
                            {certificate.avatar ? (
                              <AvatarImage
                                src={certificate.avatar}
                                alt={certificate.athleteName}
                              />
                            ) : null}
                            <AvatarFallback className="bg-transparent p-0">
                              <EntityIcon
                                type="athlete"
                                label={certificate.athleteName}
                                className="h-full w-full border-0"
                              />
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h4 className="font-medium">
                              <Link
                                href={`/athletes/${certificate.athleteId}${clubId ? `?clubId=${encodeURIComponent(clubId)}&tab=sanitari` : "?tab=sanitari"}#sanitari`}
                                className="text-blue-700 hover:underline"
                              >
                              {certificate.athleteName}
                              </Link>
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
                            {hasCertificateFile ? (
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
                                      !downloadAttachment(certificate.fileUrl, {
                                        documentType: `Certificato ${certificate.certificateType || "medico"}`,
                                        fullName: certificate.athleteName,
                                        date:
                                          certificate.expiryDate ||
                                          certificate.issueDate,
                                      })
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
                            ) : null}
                          {(certificate.status === "expiring" ||
                            certificate.status === "expired" ||
                            certificate.status === "missing") && (
                            <Button
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700"
                              disabled={
                                remindingAthleteId === certificate.athleteId
                              }
                              onClick={() => handleSendReminder(certificate)}
                            >
                              <Send className="h-3.5 w-3.5 mr-1" />
                              {remindingAthleteId === certificate.athleteId
                                ? "Invio..."
                                : "Invia Promemoria"}
                            </Button>
                          )}
                          </div>
                        </div>
                      );
                    })}

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
          </DashboardPageContainer>
        </main>
      </div>

      <AddCertificateForm
        isOpen={showAddCertificateModal}
        onClose={() => setShowAddCertificateModal(false)}
        onSubmit={handleAddCertificate}
        athletes={athletes.map((athlete) => ({
          id: athlete.id,
          name: getAthleteDisplayName(athlete) || "Atleta",
        }))}
        clubId={clubId}
      />
    </div>
  );
}
