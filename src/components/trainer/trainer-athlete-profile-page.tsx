"use client";

import React from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import {
  Award,
  BarChart3,
  CalendarDays,
  Download,
  DollarSign,
  Eye,
  FileHeart,
  FileText,
  Globe,
  Heart,
  Mail,
  MapPin,
  Phone,
  Shirt,
  User,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import {
  SectionBlockedState,
  SectionEmptyState,
  formatDate,
  getAthleteDisplayName,
  getAthleteMedicalExpiry,
} from "@/components/trainer/trainer-dashboard-shared";
import { downloadClientFileUrl, openClientFileUrl } from "@/lib/client-files";
import { getRecordDisplayCategory } from "@/lib/trainer-dashboard-helpers";
import userDefaultImage from "@/../public/images/user.png";

type ReadOnlyAttachment = {
  id?: string | null;
  name?: string | null;
  type?: string | null;
  notes?: string | null;
  fileName?: string | null;
  fileUrl?: string | null;
  url?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  status?: string | null;
};

const getTextValue = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) {
      return text;
    }
  }

  return "";
};

const getArrayValue = (value: unknown) => (Array.isArray(value) ? value : []);

const calculateAge = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return 0;
  }

  const birthDate = new Date(raw);
  if (Number.isNaN(birthDate.getTime())) {
    return 0;
  }

  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDifference = now.getMonth() - birthDate.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && now.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return Math.max(age, 0);
};

const resolveAttachmentUrl = (attachment: ReadOnlyAttachment) =>
  getTextValue(attachment.fileUrl, attachment.url);

function DetailField({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: typeof User;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
      <div className="mt-1 flex items-start gap-2">
        {Icon ? <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" /> : null}
        <div className="min-w-0 text-sm text-slate-900">{value}</div>
      </div>
    </div>
  );
}

function ReadOnlyAttachmentList({
  title,
  description,
  documents,
}: {
  title: string;
  description?: string;
  documents: ReadOnlyAttachment[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <SectionEmptyState
            title="Nessun file disponibile"
            description="Il club non ha ancora caricato allegati in questa sezione."
          />
        ) : (
          <div className="space-y-3">
            {documents.map((document, index) => {
              const fileUrl = resolveAttachmentUrl(document);
              const fileName = getTextValue(
                document.name,
                document.fileName,
                `${title}-${index + 1}`,
              );

              return (
                <div
                  key={document.id || `${fileName}-${index}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{fileName}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {getTextValue(document.type) ? <span>{document.type}</span> : null}
                        {getTextValue(document.status) ? (
                          <span>Stato: {document.status}</span>
                        ) : null}
                        {getTextValue(document.issueDate) ? (
                          <span>Emissione: {formatDate(document.issueDate)}</span>
                        ) : null}
                        {getTextValue(document.expiryDate) ? (
                          <span>Scadenza: {formatDate(document.expiryDate)}</span>
                        ) : null}
                      </div>
                      {getTextValue(document.notes) ? (
                        <p className="mt-2 text-sm text-slate-600">{document.notes}</p>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!fileUrl}
                        onClick={() => openClientFileUrl(fileUrl)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Visualizza
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!fileUrl}
                        onClick={() => downloadClientFileUrl(fileUrl, fileName)}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Scarica
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TrainerAthleteProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { assignedAthletes, categories, permissions } = useTrainerDashboard();
  const athleteId = String(params?.id || "").trim();

  if (!permissions.navigation.athletes) {
    return <SectionBlockedState section="athletes" />;
  }

  const athlete = assignedAthletes.find(
    (entry: any) => String(entry?.id || "").trim() === athleteId,
  );

  if (!athlete) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <h2 className="mb-4 text-xl font-semibold">Atleta non trovato</h2>
        <Button onClick={() => router.push("/trainer-dashboard/athletes")}>
          Torna alla lista atleti
        </Button>
      </div>
    );
  }

  const data =
    athlete?.data && typeof athlete.data === "object" ? athlete.data : {};
  const displayName = getAthleteDisplayName(athlete);
  const firstName = getTextValue(
    athlete?.first_name,
    data?.name,
    athlete?.name,
    displayName,
  );
  const lastName = getTextValue(
    athlete?.last_name,
    data?.surname,
    athlete?.surname,
  );
  const birthDate = getTextValue(
    athlete?.birth_date,
    data?.birthDate,
    athlete?.birthDate,
  );
  const age = calculateAge(birthDate);
  const categoryLabel = getRecordDisplayCategory(athlete, categories);
  const medicalCertExpiry = getAthleteMedicalExpiry(athlete);
  const guardians = getArrayValue(data?.guardians);
  const registrations = getArrayValue(data?.registrations);
  const medicalVisits = getArrayValue(data?.medicalVisits);
  const identityDocuments = getArrayValue(data?.identityDocuments);
  const enrollmentDocuments = getArrayValue(data?.enrollmentDocuments);
  const documents = getArrayValue(data?.documents);
  const payments = getArrayValue(data?.payments);
  const kitAssignments = getArrayValue(
    data?.kitAssignments || data?.kit_assignments,
  );
  const clothingSizes =
    data?.clothingSizes && typeof data.clothingSizes === "object"
      ? data.clothingSizes
      : {
          profile: data?.clothingProfile || "",
          shirtSize: data?.shirtSize || "",
          pantsSize: data?.pantsSize || "",
          shoeSize: data?.shoeSize || "",
        };

  const rawCategories = Array.isArray(data?.categories) ? data.categories : [];
  const normalizedCategoryBadges = rawCategories
    .map((entry: any) =>
      typeof entry === "string"
        ? entry
        : getTextValue(entry?.name, entry?.id),
    )
    .filter(Boolean);
  const categoryBadges =
    normalizedCategoryBadges.length > 0
      ? normalizedCategoryBadges
      : [categoryLabel];

  const visibleTabs = [
    { value: "generale", label: "Generale", icon: User, visible: true },
    {
      value: "contatti",
      label: "Contatti",
      icon: Phone,
      visible: permissions.actions.viewAthleteContacts,
    },
    {
      value: "sanitari",
      label: "Dati Sanitari",
      icon: Heart,
      visible: permissions.actions.viewMedicalStatus,
    },
    {
      value: "pagamenti",
      label: "Iscrizione",
      icon: DollarSign,
      visible: permissions.actions.viewEnrollmentAndPayments,
    },
    {
      value: "abbigliamento",
      label: "Abbigliamento",
      icon: Shirt,
      visible: permissions.actions.viewAthleteTechnicalSheet,
    },
    {
      value: "documenti",
      label: "Documenti",
      icon: FileText,
      visible: permissions.actions.viewAthleteDetails,
    },
    {
      value: "analitiche",
      label: "Analitiche",
      icon: BarChart3,
      visible:
        permissions.actions.viewAthleteTechnicalSheet ||
        permissions.actions.viewAthleteDetails,
    },
  ].filter((tab) => tab.visible);

  const defaultTab = visibleTabs[0]?.value || "generale";

  return (
    <div className="space-y-6 pb-2">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20 rounded-3xl">
            {getTextValue(athlete?.avatar_url, data?.avatar, athlete?.avatar) ? (
              <AvatarImage
                src={getTextValue(athlete?.avatar_url, data?.avatar, athlete?.avatar)}
                alt={displayName}
              />
            ) : (
              <AvatarFallback className="rounded-3xl bg-white p-1">
                <Image
                  src={userDefaultImage}
                  alt={displayName}
                  width={72}
                  height={72}
                  className="h-full w-full object-contain"
                />
              </AvatarFallback>
            )}
          </Avatar>

          <div>
            <h1 className="text-2xl font-bold">{displayName}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {categoryBadges.map((badgeLabel) => (
                <Badge
                  key={badgeLabel}
                  className="bg-blue-500 text-white hover:bg-blue-500"
                >
                  {badgeLabel}
                </Badge>
              ))}
              {medicalCertExpiry && permissions.actions.viewMedicalStatus ? (
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                  Certificato: {formatDate(medicalCertExpiry)}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex w-full gap-2 md:w-auto">
          <Button
            variant="outline"
            className="flex-1 md:flex-none"
            onClick={() => router.push("/trainer-dashboard/athletes")}
          >
            Torna agli atleti
          </Button>
          <Badge className="justify-center border-slate-200 bg-slate-100 px-4 text-slate-700 hover:bg-slate-100">
            Consultazione Allenatore
          </Badge>
        </div>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 sm:grid-cols-3 md:grid-cols-6">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;

            return (
              <TabsTrigger key={tab.value} value={tab.value}>
                <Icon className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(" ")[0]}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="generale" className="mt-4 space-y-6">
          {permissions.actions.viewAthleteDetails ? (
            <Card>
              <CardHeader>
                <CardTitle>Informazioni Generali</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <DetailField label="Nome" value={firstName || "-"} />
                  <DetailField label="Cognome" value={lastName || "-"} />
                  <DetailField
                    label="Categoria"
                    value={categoryLabel || "Senza categoria"}
                    icon={Award}
                  />
                  <DetailField
                    label="Data di nascita"
                    value={birthDate ? formatDate(birthDate) : "-"}
                    icon={CalendarDays}
                  />
                  <DetailField
                    label="Età"
                    value={age > 0 ? `${age} anni` : "-"}
                    icon={CalendarDays}
                  />
                  <DetailField
                    label="Nazionalità"
                    value={getTextValue(data?.nationality) || "-"}
                    icon={Globe}
                  />
                  <DetailField
                    label="Luogo di nascita"
                    value={getTextValue(data?.birthPlace) || "-"}
                    icon={MapPin}
                  />
                  <DetailField
                    label="Comune"
                    value={getTextValue(data?.city) || "-"}
                    icon={MapPin}
                  />
                  <DetailField
                    label="Codice fiscale"
                    value={getTextValue(data?.fiscalCode) || "-"}
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Il club ha limitato i dati anagrafici dettagliati per questa
                scheda.
              </CardContent>
            </Card>
          )}

          {permissions.actions.viewAthleteTechnicalSheet ? (
            <Card>
              <CardHeader>
                <CardTitle>Riepilogo Tecnico</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <DetailField
                    label="Numero maglia"
                    value={
                      getTextValue(athlete?.jersey_number, data?.jerseyNumber) ||
                      "-"
                    }
                  />
                  <DetailField
                    label="Profilo taglie"
                    value={getTextValue(clothingSizes?.profile) || "-"}
                  />
                  <DetailField
                    label="Note tecniche"
                    value={getTextValue(data?.notes) || "-"}
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {permissions.actions.viewAthleteContacts ? (
          <TabsContent value="contatti" className="mt-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Contatto Atleta</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <DetailField
                    label="Telefono"
                    value={getTextValue(data?.phone, athlete?.phone) || "-"}
                    icon={Phone}
                  />
                  <DetailField
                    label="Email"
                    value={getTextValue(data?.email, athlete?.email) || "-"}
                    icon={Mail}
                  />
                  <DetailField
                    label="Contatto emergenza"
                    value={
                      getTextValue(
                        data?.emergencyPhone,
                        data?.emergencyContact,
                      ) || "-"
                    }
                    icon={Phone}
                  />
                  <DetailField
                    label="Indirizzo"
                    value={getTextValue(data?.address) || "-"}
                    icon={MapPin}
                  />
                  <DetailField
                    label="Numero civico"
                    value={getTextValue(data?.streetNumber) || "-"}
                    icon={MapPin}
                  />
                  <DetailField
                    label="CAP"
                    value={getTextValue(data?.postalCode) || "-"}
                    icon={MapPin}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tutori e Genitori</CardTitle>
              </CardHeader>
              <CardContent>
                {guardians.length === 0 ? (
                  <SectionEmptyState
                    title="Nessun tutore registrato"
                    description="Il club non ha ancora inserito genitori o tutori per questo atleta."
                  />
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {guardians.map((guardian: any, index: number) => (
                      <div
                        key={guardian?.id || `${guardian?.name}-${index}`}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <p className="font-medium text-slate-900">
                          {getTextValue(guardian?.name, guardian?.nome)}{" "}
                          {getTextValue(guardian?.surname, guardian?.cognome)}
                        </p>
                        <div className="mt-2 space-y-1 text-sm text-slate-600">
                          <p>
                            Ruolo: {getTextValue(guardian?.relationship) || "-"}
                          </p>
                          <p>Telefono: {getTextValue(guardian?.phone) || "-"}</p>
                          <p>Email: {getTextValue(guardian?.email) || "-"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        {permissions.actions.viewMedicalStatus ? (
          <TabsContent value="sanitari" className="mt-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Certificato Medico</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <DetailField
                    label="Scadenza certificato"
                    value={
                      medicalCertExpiry
                        ? formatDate(medicalCertExpiry)
                        : "Non registrato"
                    }
                    icon={FileHeart}
                  />
                  <DetailField
                    label="Gruppo sanguigno"
                    value={getTextValue(data?.bloodType) || "-"}
                  />
                  <DetailField
                    label="Allergie"
                    value={getTextValue(data?.allergies) || "-"}
                  />
                  <DetailField
                    label="Patologie"
                    value={getTextValue(data?.chronicDiseases) || "-"}
                  />
                  <DetailField
                    label="Farmaci"
                    value={getTextValue(data?.medications) || "-"}
                  />
                  <DetailField
                    label="BLSD / Primo Soccorso"
                    value={
                      [
                        data?.blsd ? "BLSD" : "",
                        data?.firstAid ? "Primo soccorso" : "",
                        data?.fireSafety ? "Antincendio" : "",
                      ]
                        .filter(Boolean)
                        .join(" / ") || "-"
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <ReadOnlyAttachmentList
              title="Visite Mediche"
              description="Storico delle visite e relativi allegati caricati dal club."
              documents={medicalVisits.map((visit: any) => ({
                id: visit?.id,
                name: getTextValue(
                  visit?.title,
                  visit?.name,
                  "Visita medica",
                ),
                type: visit?.type,
                notes: getTextValue(visit?.description, visit?.outcome),
                fileName: visit?.fileName,
                fileUrl: visit?.fileUrl,
                issueDate: visit?.date,
              }))}
            />
          </TabsContent>
        ) : null}

        {permissions.actions.viewEnrollmentAndPayments ? (
          <TabsContent value="pagamenti" className="mt-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Status Iscrizione</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <DetailField
                    label="Stato iscrizione"
                    value={data?.enrollmentStatus ? "Attiva" : "Non definita"}
                  />
                  <DetailField
                    label="Piano selezionato"
                    value={getTextValue(data?.selectedPlan) || "-"}
                  />
                  <DetailField
                    label="Sconto"
                    value={getTextValue(data?.discount) || "-"}
                  />
                  <DetailField
                    label="Note iscrizione"
                    value={getTextValue(data?.enrollmentNotes) || "-"}
                  />
                  <DetailField
                    label="Pagamenti registrati"
                    value={String(payments.length)}
                    icon={DollarSign}
                  />
                  <DetailField
                    label="Tesseramenti"
                    value={String(registrations.length)}
                    icon={Award}
                  />
                </div>
              </CardContent>
            </Card>

            <ReadOnlyAttachmentList
              title="Tesseramenti Federazione / Ente"
              documents={registrations.map((registration: any) => ({
                id: registration?.id,
                name: getTextValue(
                  registration?.federation,
                  registration?.number,
                  "Tesseramento",
                ),
                type: registration?.status,
                notes: registration?.notes,
                fileName: registration?.fileName,
                fileUrl: registration?.fileUrl,
                issueDate: registration?.issueDate,
                expiryDate: registration?.expiryDate,
                status: registration?.status,
              }))}
            />

            <ReadOnlyAttachmentList
              title="Documenti Iscrizione"
              documents={enrollmentDocuments}
            />

            <Card>
              <CardHeader>
                <CardTitle>Storico Pagamenti</CardTitle>
              </CardHeader>
              <CardContent>
                {payments.length === 0 ? (
                  <SectionEmptyState
                    title="Nessun pagamento registrato"
                    description="Il club non ha ancora associato pagamenti a questo atleta."
                  />
                ) : (
                  <div className="space-y-3">
                    {payments.map((payment: any, index: number) => (
                      <div
                        key={payment?.id || `${payment?.description}-${index}`}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-medium text-slate-900">
                              {getTextValue(
                                payment?.description,
                                payment?.type,
                                "Pagamento",
                              )}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {payment?.date ? formatDate(payment.date) : "-"} •{" "}
                              {getTextValue(payment?.status) ||
                                "Stato non definito"}
                            </p>
                          </div>
                          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                            {getTextValue(payment?.amount) || "0"} €
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        {permissions.actions.viewAthleteTechnicalSheet ? (
          <TabsContent value="abbigliamento" className="mt-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Taglie</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                  <DetailField
                    label="Profilo"
                    value={getTextValue(clothingSizes?.profile) || "-"}
                  />
                  <DetailField
                    label="Taglia maglia"
                    value={getTextValue(clothingSizes?.shirtSize) || "-"}
                  />
                  <DetailField
                    label="Taglia pantaloni"
                    value={getTextValue(clothingSizes?.pantsSize) || "-"}
                  />
                  <DetailField
                    label="Taglia scarpe"
                    value={getTextValue(clothingSizes?.shoeSize) || "-"}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Kit e Dotazioni</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <DetailField
                    label="Numero maglia"
                    value={
                      getTextValue(athlete?.jersey_number, data?.jerseyNumber) ||
                      "-"
                    }
                  />
                  <DetailField
                    label="Kit assegnati"
                    value={String(kitAssignments.length)}
                  />
                  <DetailField
                    label="Componenti consegnati"
                    value={String(
                      kitAssignments.reduce((total: number, assignment: any) => {
                        const items = Array.isArray(assignment?.components)
                          ? assignment.components
                          : Array.isArray(assignment?.items)
                            ? assignment.items
                            : [];
                        return total + items.length;
                      }, 0),
                    )}
                  />
                </div>

                {kitAssignments.length > 0 ? (
                  <div className="mt-6 space-y-3">
                    {kitAssignments.map((assignment: any, index: number) => (
                      <div
                        key={assignment?.id || `${assignment?.kitName}-${index}`}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <p className="font-medium text-slate-900">
                          {getTextValue(
                            assignment?.kitName,
                            assignment?.name,
                            "Kit assegnato",
                          )}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {Array.isArray(assignment?.components)
                            ? assignment.components
                                .map((component: any) =>
                                  typeof component === "string"
                                    ? component
                                    : getTextValue(component?.name),
                                )
                                .filter(Boolean)
                                .join(", ")
                            : "Nessun componente dettagliato"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        {permissions.actions.viewAthleteDetails ? (
          <TabsContent value="documenti" className="mt-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Documento di Identità</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <DetailField
                    label="Tipologia"
                    value={getTextValue(data?.documentType) || "-"}
                  />
                  <DetailField
                    label="Numero"
                    value={getTextValue(data?.documentNumber) || "-"}
                  />
                  <DetailField
                    label="Emissione"
                    value={
                      getTextValue(data?.documentIssue)
                        ? formatDate(data.documentIssue)
                        : "-"
                    }
                  />
                  <DetailField
                    label="Scadenza"
                    value={
                      getTextValue(data?.documentExpiry)
                        ? formatDate(data.documentExpiry)
                        : "-"
                    }
                  />
                  <DetailField
                    label="Permesso di soggiorno"
                    value={
                      getTextValue(data?.residencePermitExpiry)
                        ? formatDate(data.residencePermitExpiry)
                        : "-"
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <ReadOnlyAttachmentList
              title="Allegati Documento di Identità"
              documents={identityDocuments}
            />

            <ReadOnlyAttachmentList
              title="Altri Documenti"
              documents={documents}
            />
          </TabsContent>
        ) : null}

        {permissions.actions.viewAthleteTechnicalSheet ||
        permissions.actions.viewAthleteDetails ? (
          <TabsContent value="analitiche" className="mt-4 space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Età atleta</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">
                    {age > 0 ? age : "-"}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Pagamenti</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">
                    {payments.length}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Visite mediche</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">
                    {medicalVisits.length}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Documenti</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">
                    {identityDocuments.length +
                      enrollmentDocuments.length +
                      documents.length}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
