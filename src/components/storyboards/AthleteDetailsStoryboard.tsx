import React from "react";
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
  Share2,
  Edit,
  Trash2,
} from "lucide-react";

export default function AthleteDetailsStoryboard() {
  // Mock data for the athlete
  const athlete = {
    id: "athlete-123",
    name: "Mario Rossi",
    category: "Under 14",
    age: 13,
    status: "active",
    medicalCertExpiry: "2024-12-31",
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=MarioRossi`,
    email: "genitore@esempio.it",
    phone: "+39 123 456 7890",
    address: "Via Roma 123, Milano",
    birthDate: "2011-05-15",
    registrationDate: "2023-09-01",
    notes:
      "Allergia ai frutti di mare. Preferisce giocare come centrocampista.",
    parentName: "Giuseppe Rossi",
  };

  // Mock data for attendance
  const attendance = [
    {
      id: "1",
      date: "2024-04-15",
      time: "18:00",
      present: true,
      notes: "",
    },
    {
      id: "2",
      date: "2024-04-12",
      time: "18:00",
      present: false,
      notes: "Malattia",
    },
  ];

  // Mock data for certificates
  const certificates = [
    {
      id: "1",
      type: "Certificato Agonistico",
      issueDate: "2024-01-15",
      expiryDate: "2024-12-31",
      status: "valid",
      fileUrl: "#",
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500">Attivo</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inattivo</Badge>;
      case "suspended":
        return <Badge variant="destructive">Sospeso</Badge>;
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

  const isCertificateExpired = (dateString: string) => {
    const expiryDate = new Date(dateString);
    const today = new Date();
    return expiryDate < today;
  };

  const getAttendanceRate = () => {
    const presentCount = attendance.filter((a) => a.present).length;
    return Math.round((presentCount / attendance.length) * 100);
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-white shadow-md">
              <AvatarImage src={athlete.avatar} alt={athlete.name} />
              <AvatarFallback>{athlete.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold">{athlete.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge className="bg-blue-500 text-white">
                  {athlete.category}
                </Badge>
                {getStatusBadge(athlete.status)}
              </div>
            </div>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Button variant="outline" className="flex-1 md:flex-none">
              <Share2 className="h-4 w-4 mr-2" />
              Condividi con Genitore
            </Button>
            <Button variant="outline" className="flex-1 md:flex-none">
              <Edit className="h-4 w-4 mr-2" />
              Modifica
            </Button>
            <Button variant="destructive" className="flex-1 md:flex-none">
              <Trash2 className="h-4 w-4 mr-2" />
              Elimina
            </Button>
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
                    <p>{athlete.age} anni</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">
                      Data di Nascita
                    </h3>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      <p>{formatDate(athlete.birthDate)}</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">
                      Data di Iscrizione
                    </h3>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <p>{formatDate(athlete.registrationDate)}</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">
                      Indirizzo
                    </h3>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <p>{athlete.address}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">
                      Genitore/Tutore
                    </h3>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <p>{athlete.parentName}</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">
                      Email
                    </h3>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <p>{athlete.email}</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">
                      Telefono
                    </h3>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <p>{athlete.phone}</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">
                      Note
                    </h3>
                    <p className="text-sm">{athlete.notes}</p>
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
                <div className="pt-2">
                  <Button className="w-full bg-blue-600 hover:bg-blue-700">
                    Carica Nuovo Certificato
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="attendance">
          <TabsList>
            <TabsTrigger value="attendance" className="flex items-center gap-2">
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
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">
                          Data
                        </th>
                        <th className="text-left py-3 px-4 font-medium">Ora</th>
                        <th className="text-left py-3 px-4 font-medium">
                          Presenza
                        </th>
                        <th className="text-left py-3 px-4 font-medium">
                          Note
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map((record) => (
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
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="certificates" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Storico Certificati Medici</CardTitle>
              </CardHeader>
              <CardContent>
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
                        <th className="text-left py-3 px-4 font-medium">
                          Azioni
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {certificates.map((cert) => (
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
                          <td className="py-3 px-4">
                            <Button variant="outline" size="sm" asChild>
                              <a href={cert.fileUrl} target="_blank">
                                Visualizza
                              </a>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
