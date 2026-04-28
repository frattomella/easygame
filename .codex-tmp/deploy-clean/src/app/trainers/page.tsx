"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Users,
  Mail,
  Phone,
  Calendar,
  Edit,
  Trash2,
  Search,
  Settings2,
  Eye,
  EyeOff,
  UserCheck,
  UserX,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { getClubTrainers } from "@/lib/simplified-db";
import Image from "next/image";
import userDefaultImage from "@/../public/images/user.png";

interface Trainer {
  id: string;
  name: string;
  email: string;
  phone: string;
  categories: { id: string; name: string }[];
  salary: string;
  avatar?: string;
  status?: string;
  specialization?: string;
  hire_date?: string;
}

export default function TrainersPage() {
  const router = useRouter();
  const { activeClub } = useAuth();
  const { showToast } = useToast();
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [clubId, setClubId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "active" | "suspended" | "all"
  >("active");
  const [visibleColumns, setVisibleColumns] = useState({
    name: true,
    email: true,
    phone: true,
    categories: true,
    status: true,
  });

  useEffect(() => {
    // Get clubId from auth context first, then localStorage as fallback
    if (activeClub?.id) {
      setClubId(activeClub.id);
      return;
    }

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
  }, [activeClub]);

  // Fetch trainers
  useEffect(() => {
    const fetchData = async () => {
      // Don't query if clubId is not set or is invalid
      if (!clubId || clubId === "null" || clubId === "undefined") {
        setLoading(false);
        setTrainers([]);
        return;
      }

      setLoading(true);
      try {
        const trainersData = await getClubTrainers(clubId);
        setTrainers(Array.isArray(trainersData) ? trainersData : []);
      } catch (error) {
        console.error("Error fetching data:", error);
        showToast("error", "Errore nel caricamento degli allenatori");
        setTrainers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [clubId, showToast]);

  const handleDelete = async (trainerId: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo allenatore?")) return;

    try {
      // Update logic here
      setTrainers((current) => current.filter((trainer) => trainer.id !== trainerId));
    } catch (error) {
      console.error("Error deleting trainer:", error);
    }
  };

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredTrainers = trainers.filter((trainer) => {
    const trainerCategories = Array.isArray(trainer?.categories)
      ? trainer.categories
      : [];
    const matchesSearch =
      !normalizedSearchQuery ||
      String(trainer?.name || "")
        .toLowerCase()
        .includes(normalizedSearchQuery) ||
      String(trainer?.email || "")
        .toLowerCase()
        .includes(normalizedSearchQuery) ||
      String(trainer?.phone || "")
        .toLowerCase()
        .includes(normalizedSearchQuery) ||
      trainerCategories
        .map((category) => category.name)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearchQuery);

    const matchesStatus =
      statusFilter === "all" || (trainer.status || "active") === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        <Header title="Allenatori" />

        <main className="flex-1 p-6">
          <div className="max-w-9xl mx-auto space-y-6">
            <div className="flex flex-col gap-4 rounded-3xl border border-blue-100 bg-white/80 p-6 shadow-sm backdrop-blur-sm xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Allenatori
                </h1>
                <p className="text-gray-600 mt-2">
                  Gestisci staff tecnico, categorie assegnate e stato operativo degli allenatori del club.
                </p>
              </div>

              <div className="flex flex-1 flex-col gap-3 xl:max-w-4xl xl:flex-row xl:items-center xl:justify-end">
                <div className="relative flex-1 xl:max-w-sm">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Cerca per nome, email, telefono o categoria..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="h-11 rounded-xl border-blue-200 bg-white pl-11"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={statusFilter === "active" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setStatusFilter("active")}
                    className={statusFilter === "active" ? "bg-green-600 hover:bg-green-700" : ""}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Attivi
                  </Button>
                  <Button
                    variant={statusFilter === "suspended" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setStatusFilter("suspended")}
                    className={statusFilter === "suspended" ? "bg-amber-600 hover:bg-amber-700" : ""}
                  >
                    <UserX className="h-4 w-4 mr-1" />
                    Sospesi
                  </Button>
                  <Button
                    variant={statusFilter === "all" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setStatusFilter("all")}
                    className={statusFilter === "all" ? "bg-blue-600 hover:bg-blue-700" : ""}
                  >
                    <EyeOff className="h-4 w-4 mr-1" />
                    Tutti
                  </Button>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-11 rounded-xl">
                      <Settings2 className="h-4 w-4 mr-2" />
                      Personalizza Colonne
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Colonne Visibili</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={visibleColumns.name}
                      onCheckedChange={(checked) =>
                        setVisibleColumns((prev) => ({
                          ...prev,
                          name: Boolean(checked),
                        }))
                      }
                    >
                      Nome
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={visibleColumns.email}
                      onCheckedChange={(checked) =>
                        setVisibleColumns((prev) => ({
                          ...prev,
                          email: Boolean(checked),
                        }))
                      }
                    >
                      Email
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={visibleColumns.phone}
                      onCheckedChange={(checked) =>
                        setVisibleColumns((prev) => ({
                          ...prev,
                          phone: Boolean(checked),
                        }))
                      }
                    >
                      Telefono
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={visibleColumns.categories}
                      onCheckedChange={(checked) =>
                        setVisibleColumns((prev) => ({
                          ...prev,
                          categories: Boolean(checked),
                        }))
                      }
                    >
                      Categorie
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={visibleColumns.status}
                      onCheckedChange={(checked) =>
                        setVisibleColumns((prev) => ({
                          ...prev,
                          status: Boolean(checked),
                        }))
                      }
                    >
                      Stato
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  onClick={() =>
                    router.push(
                      clubId ? `/trainers/new?clubId=${clubId}` : "/trainers/new",
                    )
                  }
                  className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nuovo Allenatore
                </Button>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                <CardHeader className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-3">
                    <Users className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-2xl font-bold">
                    {trainers.length}
                  </CardTitle>
                  <p className="text-blue-100">Allenatori</p>
                </CardHeader>
              </Card>

              <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
                <CardHeader className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-3">
                    <UserCheck className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-2xl font-bold">
                    {trainers.filter((t) => t.status === "active").length}
                  </CardTitle>
                  <p className="text-green-100">Attivi</p>
                </CardHeader>
              </Card>

              <Card className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white">
                <CardHeader className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-3">
                    <UserX className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-2xl font-bold">
                    {trainers.filter((t) => t.status === "suspended").length}
                  </CardTitle>
                  <p className="text-yellow-100">Sospesi</p>
                </CardHeader>
              </Card>

              <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
                <CardHeader className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-3">
                    <Calendar className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-2xl font-bold">
                    {trainers.length}
                  </CardTitle>
                  <p className="text-purple-100">Allenamenti</p>
                </CardHeader>
              </Card>
            </div>

            <Card className="overflow-hidden border-blue-100 bg-white/90 shadow-sm">
              <CardContent className="p-0">
                {loading ? (
                  <div className="py-8">
                    <AppLoadingScreen
                      compact
                      title="EasyGame"
                      subtitle="Caricamento lista allenatori..."
                      className="mx-auto max-w-md"
                    />
                  </div>
                ) : filteredTrainers.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Nessun allenatore trovato
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Modifica i filtri oppure aggiungi un nuovo allenatore.
                    </p>
                    <Button
                      onClick={() =>
                        router.push(
                          clubId ? `/trainers/new?clubId=${clubId}` : "/trainers/new",
                        )
                      }
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Aggiungi Allenatore
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          {visibleColumns.name && (
                            <th className="text-left py-3 px-4 font-medium">
                              Allenatore
                            </th>
                          )}
                          {visibleColumns.email && (
                            <th className="text-left py-3 px-4 font-medium">
                              Email
                            </th>
                          )}
                          {visibleColumns.phone && (
                            <th className="text-left py-3 px-4 font-medium">
                              Telefono
                            </th>
                          )}
                          {visibleColumns.categories && (
                            <th className="text-left py-3 px-4 font-medium">
                              Categorie
                            </th>
                          )}
                          {visibleColumns.status && (
                            <th className="text-left py-3 px-4 font-medium">
                              Stato
                            </th>
                          )}
                          <th className="text-left py-3 px-4 font-medium">
                            Azioni
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTrainers.map((trainer) => (
                          <tr
                            key={trainer.id}
                            className="border-b hover:bg-gray-50"
                          >
                            {visibleColumns.name && (
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-3">
                                  <Avatar>
                                    {trainer.avatar ? (
                                      <AvatarImage
                                        src={trainer.avatar}
                                        alt={trainer.name}
                                      />
                                    ) : (
                                      <AvatarFallback className="bg-white p-0.5">
                                        <Image
                                          src={userDefaultImage}
                                          alt={trainer.name}
                                          className="object-contain w-full h-full"
                                          width={40}
                                          height={40}
                                        />
                                      </AvatarFallback>
                                    )}
                                  </Avatar>
                                  <div>
                                    <p className="font-medium text-slate-900">
                                      {trainer.name}
                                    </p>
                                    {trainer.email ? (
                                      <p className="text-xs text-slate-500">
                                        {trainer.email}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              </td>
                            )}
                            {visibleColumns.email && (
                              <td className="py-3 px-4">{trainer.email || "-"}</td>
                            )}
                            {visibleColumns.phone && (
                              <td className="py-3 px-4">{trainer.phone || "-"}</td>
                            )}
                            {visibleColumns.categories && (
                              <td className="py-3 px-4">
                                {Array.isArray(trainer.categories) &&
                                trainer.categories.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {trainer.categories.map((cat, index) => (
                                      <Badge
                                        key={cat.id || `cat-${index}`}
                                        variant="outline"
                                        className="border-blue-100 bg-blue-50 text-blue-700"
                                      >
                                        {cat.name}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  "-"
                                )}
                              </td>
                            )}
                            {visibleColumns.status && (
                              <td className="py-3 px-4">
                                <Badge
                                  className={
                                    trainer.status === "active"
                                      ? "bg-green-100 text-green-700 hover:bg-green-100"
                                      : "bg-amber-100 text-amber-700 hover:bg-amber-100"
                                  }
                                >
                                  {trainer.status === "active"
                                    ? "Attivo"
                                    : "Sospeso"}
                                </Badge>
                              </td>
                            )}
                            <td className="py-3 px-4">
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    router.push(
                                      `/trainers/${trainer.id}?clubId=${clubId}`,
                                    )
                                  }
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDelete(trainer.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
