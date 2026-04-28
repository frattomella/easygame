"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileHeart,
  Calendar,
  Clock,
  MapPin,
  Mail,
  Phone,
  User,
  CalendarDays,
  Shirt,
} from "lucide-react";
import { useParams } from "next/navigation";
import {
  getLatestMedicalCertificateExpiry,
  getMedicalCertificateStatus,
} from "@/lib/medical-certificates";

export default function AthleteProfilePage() {
  const params = useParams<{ id: string }>();
  const athleteId = params?.id as string;
  const calculateAge = (birthDate: string) => {
    if (!birthDate) return 0;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      age -= 1;
    }
    return age;
  };

  // Athlete data will be fetched from the database
  const [athlete, setAthlete] = useState({
    jerseyNumber: undefined,
    id: athleteId,
    name: "",
    categories: [],
    age: 0,
    status: "",
    medicalCertExpiry: "",
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${athleteId}`,
    email: "",
    phone: "",
    address: "",
    birthDate: "",
    registrationDate: "",
    notes: "",
  });

  // Fetch athlete data from Supabase
  useEffect(() => {
    const fetchAthleteData = async () => {
      if (!athleteId) {
        return;
      }

      try {
        const { getAthlete, getAthleteCertificates } = await import(
          "@/lib/simplified-db"
        );
        const [athleteRecord, certificateRecords] = await Promise.all([
          getAthlete(athleteId),
          getAthleteCertificates(athleteId).catch(() => []),
        ]);

        if (!athleteRecord) {
          return;
        }

        const athleteData = {
          id: athleteRecord.id,
          firstName: athleteRecord.first_name,
          lastName: athleteRecord.last_name,
          birthDate: athleteRecord.birth_date,
          ...(athleteRecord.data || {}),
        };
        const categoryValues = Array.isArray(athleteData.categories)
          ? athleteData.categories
          : athleteRecord.category_name
            ? [athleteRecord.category_name]
            : athleteData.categoryName
              ? [athleteData.categoryName]
              : [];
        const normalizedCertificates = (certificateRecords || [])
          .map((certificate: any) => ({
            id: certificate.id,
            type: certificate.type || certificate.notes || "Certificato Medico",
            issueDate: certificate.issue_date,
            expiryDate: certificate.expiry_date,
            status: getMedicalCertificateStatus(certificate.expiry_date),
            fileUrl: certificate.file_url || certificate.document_url || "#",
          }))
          .sort((left: any, right: any) => {
            const leftTime = left.expiryDate
              ? new Date(left.expiryDate).getTime()
              : 0;
            const rightTime = right.expiryDate
              ? new Date(right.expiryDate).getTime()
              : 0;
            return rightTime - leftTime;
          });
        const latestExpiry =
          getLatestMedicalCertificateExpiry(normalizedCertificates) ||
          athleteData.medicalCertExpiry ||
          "";

        setAthlete({
          jerseyNumber:
            athleteRecord.jersey_number ?? athleteData.jerseyNumber ?? undefined,
          id: athleteRecord.id,
          name: `${athleteRecord.first_name || ""} ${athleteRecord.last_name || ""}`.trim(),
          categories: categoryValues,
          age: calculateAge(String(athleteRecord.birth_date || "")),
          status: athleteRecord.status || athleteData.status || "active",
          medicalCertExpiry: latestExpiry,
          avatar:
            athleteRecord.avatar_url ||
            athleteData.avatar ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${athleteRecord.id}`,
          email: athleteData.email || "",
          phone: athleteData.phone || "",
          address: [athleteData.address, athleteData.city].filter(Boolean).join(", "),
          birthDate: athleteRecord.birth_date || "",
          registrationDate: athleteData.registrationDate || athleteRecord.created_at || "",
          notes: athleteData.notes || "",
        });
        setCertificates(normalizedCertificates);
      } catch (error) {
        console.error("Error fetching athlete profile:", error);
      }
    };

    fetchAthleteData();
  }, [athleteId]);

  // Attendance data will be fetched from the database
  const [attendance, setAttendance] = React.useState([]);

  // Fetch attendance data
  useEffect(() => {
    // Example of how you would fetch real data
    // const fetchAttendance = async () => {
    //   if (athleteId) {
    //     const { data, error } = await supabase
    //       .from('attendance')
    //       .select('*, trainings(start_time)')
    //       .eq('athlete_id', athleteId)
    //       .order('created_at', { ascending: false })
    //       .limit(5);
    //
    //     if (data && !error) {
    //       setAttendance(data.map(record => ({
    //         id: record.id,
    //         date: new Date(record.trainings.start_time).toISOString().split('T')[0],
    //         time: new Date(record.trainings.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
    //         present: record.status === 'present',
    //         notes: record.notes || ""
    //       })));
    //     }
    //   }
    // };
    //
    // fetchAttendance();
  }, [athleteId]);

  // Certificate data will be fetched from the database
  const [certificates, setCertificates] = React.useState([]);

  // Fetch certificates data
  useEffect(() => {
    // Example of how you would fetch real data
    // const fetchCertificates = async () => {
    //   if (athleteId) {
    //     const { data, error } = await supabase
    //       .from('medical_certificates')
    //       .select('*')
    //       .eq('athlete_id', athleteId);
    //
    //     if (data && !error) {
    //       setCertificates(data.map(cert => ({
    //         id: cert.id,
    //         type: cert.type || "Certificato Medico",
    //         issueDate: cert.issue_date,
    //         expiryDate: cert.expiry_date,
    //         status: cert.status,
    //         fileUrl: cert.document_url || "#"
    //       })));
    //     }
    //   }
    // };
    //
    // fetchCertificates();
  }, [athleteId]);

  // Kit components data will be fetched from the database
  const [kitComponents, setKitComponents] = useState([]);

  // Fetch kit components data
  useEffect(() => {
    // Example of how you would fetch real data
    // const fetchKitComponents = async () => {
    //   if (athleteId) {
    //     const { data, error } = await supabase
    //       .from('athlete_kit_items')
    //       .select('*, kit_items(*)')
    //       .eq('athlete_id', athleteId);
    //
    //     if (data && !error) {
    //       setKitComponents(data.map(item => ({
    //         id: item.id,
    //         name: item.kit_items.name,
    //         selected: true,
    //         jerseyNumber: item.jersey_number,
    //         size: item.size,
    //         delivered: item.delivered,
    //         deliveryDate: item.delivery_date
    //       })));
    //     }
    //   }
    // };
    //
    // fetchKitComponents();
  }, [athleteId]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const isCertificateExpired = (dateString: string) => {
    const expiryDate = new Date(dateString);
    const today = new Date();
    return expiryDate < today;
  };

  const getAttendanceRate = () => {
    const presentCount = attendance.filter((a: any) => a.present).length;
    return attendance.length > 0
      ? Math.round((presentCount / attendance.length) * 100)
      : 0;
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Il Mio Profilo" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 border-2 border-white shadow-md">
                  <AvatarImage src={athlete.avatar} alt={athlete.name} />
                  <AvatarFallback>
                    {athlete.name ? athlete.name.charAt(0) : "A"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h1 className="text-2xl font-bold">
                    {athlete.name || "Caricamento..."}
                  </h1>
                  <div className="flex items-center gap-2 mt-1">
                    {athlete.categories.map((category, index) => (
                      <Badge
                        key={index}
                        className="bg-blue-500 text-white mr-1"
                      >
                        {category}
                      </Badge>
                    ))}
                    {athlete.jerseyNumber && (
                      <Badge
                        variant="outline"
                        className="border-green-500 text-green-500 flex items-center gap-1"
                      >
                        <Shirt className="h-3 w-3" />
                        {athlete.jerseyNumber}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Informazioni Personali</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Età
                        </h3>
                        <p>{athlete.age ? `${athlete.age} anni` : "--"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Data di Nascita
                        </h3>
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-muted-foreground" />
                          <p>
                            {athlete.birthDate
                              ? formatDate(athlete.birthDate)
                              : "--"}
                          </p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Data di Iscrizione
                        </h3>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <p>
                            {athlete.registrationDate
                              ? formatDate(athlete.registrationDate)
                              : "--"}
                          </p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Indirizzo
                        </h3>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <p>{athlete.address || "--"}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Email
                        </h3>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <p>{athlete.email || "--"}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Telefono
                        </h3>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <p>{athlete.phone || "--"}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Note
                        </h3>
                        <p className="text-sm">{athlete.notes || "--"}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Certificato Medico</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {athlete.medicalCertExpiry ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileHeart
                            className={`h-5 w-5 ${isCertificateExpired(athlete.medicalCertExpiry) ? "text-red-500" : "text-green-500"}`}
                          />
                          <span
                            className={
                              isCertificateExpired(athlete.medicalCertExpiry)
                                ? "text-red-500 font-medium"
                                : "font-medium"
                            }
                          >
                            {isCertificateExpired(athlete.medicalCertExpiry)
                              ? "Certificato Scaduto"
                              : "Certificato Valido"}
                          </span>
                        </div>
                        <Badge
                          className={
                            isCertificateExpired(athlete.medicalCertExpiry)
                              ? "bg-red-500 text-white"
                              : "bg-green-500 text-white"
                          }
                        >
                          {formatDate(athlete.medicalCertExpiry)}
                        </Badge>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">
                        Nessun certificato medico registrato
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="attendance">
              <TabsList>
                <TabsTrigger
                  value="attendance"
                  className="flex items-center gap-2"
                >
                  <Calendar className="h-4 w-4" />
                  Presenze
                </TabsTrigger>
                <TabsTrigger
                  value="certificates"
                  className="flex items-center gap-2"
                >
                  <FileHeart className="h-4 w-4" />
                  Storico Certificati
                </TabsTrigger>
                <TabsTrigger value="kit" className="flex items-center gap-2">
                  <Shirt className="h-4 w-4" />
                  Abbigliamento
                </TabsTrigger>
              </TabsList>
              <TabsContent value="attendance" className="mt-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Registro Presenze</CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        Tasso di Presenza:
                      </span>
                      <Badge
                        className={
                          getAttendanceRate() > 80
                            ? "bg-green-500 text-white"
                            : getAttendanceRate() > 60
                              ? "bg-amber-500 text-white"
                              : "bg-red-500 text-white"
                        }
                      >
                        {getAttendanceRate()}%
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {attendance.length === 0 ? (
                      <p className="text-muted-foreground">
                        Nessun dato di presenza disponibile
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-3 px-4 font-medium">
                                Data
                              </th>
                              <th className="text-left py-3 px-4 font-medium">
                                Ora
                              </th>
                              <th className="text-left py-3 px-4 font-medium">
                                Presenza
                              </th>
                              <th className="text-left py-3 px-4 font-medium">
                                Note
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {attendance.map((record: any) => (
                              <tr
                                key={record.id}
                                className="border-b hover:bg-gray-50 dark:hover:bg-gray-800"
                              >
                                <td className="py-3 px-4">
                                  {formatDate(record.date)}
                                </td>
                                <td className="py-3 px-4">{record.time}</td>
                                <td className="py-3 px-4">
                                  {record.present ? (
                                    <Badge className="bg-green-500 text-white">
                                      Presente
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary">Assente</Badge>
                                  )}
                                </td>
                                <td className="py-3 px-4">{record.notes}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="certificates" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Storico Certificati Medici</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {certificates.length === 0 ? (
                      <p className="text-muted-foreground">
                        Nessun certificato medico registrato
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-3 px-4 font-medium">
                                Tipo
                              </th>
                              <th className="text-left py-3 px-4 font-medium">
                                Data Emissione
                              </th>
                              <th className="text-left py-3 px-4 font-medium">
                                Data Scadenza
                              </th>
                              <th className="text-left py-3 px-4 font-medium">
                                Stato
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {certificates.map((cert: any) => (
                              <tr
                                key={cert.id}
                                className="border-b hover:bg-gray-50 dark:hover:bg-gray-800"
                              >
                                <td className="py-3 px-4">{cert.type}</td>
                                <td className="py-3 px-4">
                                  {formatDate(cert.issueDate)}
                                </td>
                                <td className="py-3 px-4">
                                  {formatDate(cert.expiryDate)}
                                </td>
                                <td className="py-3 px-4">
                                  {cert.status === "valid" ? (
                                    <Badge className="bg-green-500 text-white">
                                      Valido
                                    </Badge>
                                  ) : (
                                    <Badge variant="destructive">Scaduto</Badge>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="kit" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shirt className="h-5 w-5 text-blue-500" />
                      Kit Abbigliamento
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {kitComponents.length === 0 ? (
                      <p className="text-muted-foreground">
                        Nessun articolo di abbigliamento registrato
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-3 px-4 font-medium">
                                Articolo
                              </th>
                              <th className="text-left py-3 px-4 font-medium">
                                Taglia
                              </th>
                              <th className="text-left py-3 px-4 font-medium">
                                Stato
                              </th>
                              <th className="text-left py-3 px-4 font-medium">
                                Data Consegna
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {kitComponents
                              .filter((comp: any) => comp.selected)
                              .map((component: any) => (
                                <tr
                                  key={component.id}
                                  className="border-b hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                  <td className="py-3 px-4">
                                    {component.name}
                                    {component.jerseyNumber && (
                                      <span className="text-sm font-medium ml-1">
                                        #{component.jerseyNumber}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4">
                                    {component.size || "N/A"}
                                  </td>
                                  <td className="py-3 px-4">
                                    {component.delivered ? (
                                      <Badge className="bg-green-500 text-white">
                                        Consegnato
                                      </Badge>
                                    ) : (
                                      <Badge
                                        variant="outline"
                                        className="border-amber-500 text-amber-500"
                                      >
                                        In attesa
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="py-3 px-4">
                                    {component.deliveryDate
                                      ? formatDate(component.deliveryDate)
                                      : "N/A"}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}
