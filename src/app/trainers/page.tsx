"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Users,
  Mail,
  Phone,
  Edit,
  Trash2,
  Search,
  Settings2,
  Eye,
  EyeOff,
  UserX,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  BulkSelectionToolbar,
  SelectAllCheckbox,
  SelectRowCheckbox,
  useListSelection,
} from "@/components/ui/list-selection";
import {
  availableExportScopes,
  exportScopeLabel,
  resolveScopeRows,
  type SelectionScope,
} from "@/lib/list-selection";
import {
  buildCategoryGroups,
  compareCategoryGroups,
  getActiveCategoryGroups,
  normalizeClubSites,
  type CategoryGroup,
} from "@/lib/club-sites";
import {
  getTrainerCategoryIds,
  getTrainerGroupIds,
} from "@/lib/trainer-utils";
import { supabase } from "@/lib/supabase";
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
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { deleteClubTrainer, getClubTrainers } from "@/lib/simplified-db";
import { sortPeopleByLastName } from "@/lib/athlete-name-utils";
import { EntityIcon } from "@/components/ui/entity-icon";
import { exportPeopleCsv, exportPeoplePdf } from "@/lib/person-export";
import { FileDown, FileSpreadsheet } from "lucide-react";

interface Trainer {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone: string;
  categories: { id: string; name: string }[];
  /** I gruppi operativi dichiarati: e cio che scrive l'assegnazione di massa. */
  groupIds?: string[];
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
  /**
   * Categorie e gruppi operativi del club.
   *
   * Servono all'assegnazione di massa, ed e la ragione per cui questo elenco
   * ora li legge: assegnare per categoria su un club multi-sede vorrebbe dire
   * mettere l'allenatore su **tutte** le squadre di quella categoria, Roma e
   * Aprilia insieme. Su un club con una sede sola i gruppi non esistono e la
   * categoria e l'unica cosa da assegnare (ADR-0038, ADR-0055).
   */
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const selection = useListSelection();

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
        const [trainersData, clubResponse] = await Promise.all([
          getClubTrainers(clubId),
          supabase
            .from("clubs")
            .select("categories, club_sites, category_groups")
            .eq("id", clubId)
            .maybeSingle(),
        ]);

        const nextTrainers = Array.isArray(trainersData) ? trainersData : [];
        setTrainers(nextTrainers);
        // Una selezione che tiene l'id di un allenatore sparito mostra un
        // conteggio che non corrisponde a niente.
        selection.prune(nextTrainers.map((trainer) => String(trainer.id)));

        const clubData = clubResponse?.data;
        const clubCategories = Array.isArray(clubData?.categories)
          ? clubData.categories
          : [];
        setCategories(clubCategories);
        setCategoryGroups(
          buildCategoryGroups({
            categories: clubCategories,
            sites: normalizeClubSites(clubData?.club_sites),
            groups: clubData?.category_groups,
          }),
        );
      } catch (error) {
        console.error("Error fetching data:", error);
        showToast("error", "Errore nel caricamento degli allenatori");
        setTrainers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // `selection` cambia a ogni spunta: metterlo fra le dipendenze
    // rileggerebbe l'elenco a ogni casella premuta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, showToast]);

  const [deletingTrainerId, setDeletingTrainerId] = useState<string | null>(null);

  const handleDelete = async (trainerId: string) => {
    if (!clubId || deletingTrainerId) return;
    if (!confirm("Sei sicuro di voler eliminare questo allenatore?")) return;

    setDeletingTrainerId(trainerId);
    try {
      const result = await deleteClubTrainer(clubId, trainerId);

      if (!result.removed) {
        showToast("error", "Allenatore non trovato tra i dati del club");
        return;
      }

      // Si rilegge dal server invece di filtrare lo stato locale: e la lettura
      // a unire le tre origini dell'allenatore, e solo lei sa cosa resta.
      const trainersData = await getClubTrainers(clubId);
      setTrainers(Array.isArray(trainersData) ? trainersData : []);
      showToast("success", "Allenatore eliminato");
    } catch (error) {
      console.error("Error deleting trainer:", error);
      showToast("error", "Impossibile eliminare l'allenatore");
    } finally {
      setDeletingTrainerId(null);
    }
  };

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredTrainers = sortPeopleByLastName(trainers).filter((trainer) => {
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

  const filteredTrainerIds = filteredTrainers.map((trainer) =>
    String(trainer.id),
  );

  /**
   * Gli ambiti di export che hanno senso adesso.
   *
   * Con una selezione attiva il primo e «selezionati», e il menu propone
   * quello: chi ha spuntato quattro allenatori non vuole un PDF di
   * quaranta pagine (RC Fix 2, punto 10).
   */
  const exportScopes = availableExportScopes({
    selectedCount: selection.count,
    filteredCount: filteredTrainers.length,
    totalCount: trainers.length,
  });

  const rowsForScope = (scope: SelectionScope) =>
    resolveScopeRows({
      scope,
      rows: trainers,
      filteredRows: filteredTrainers,
      selectedIds: selection.selectedIds,
      idOf: (trainer) => String(trainer.id),
    });

  const groupNameById = new Map(
    categoryGroups.map((group) => [String(group.id), group.name]),
  );

  /**
   * Le squadre che un allenatore segue, come si leggono in tabella e nel PDF.
   *
   * **Un'assegnazione che non si vede e un'assegnazione che non e successa.**
   * L'azione di massa scrive `groupIds`, ma la colonna leggeva solo
   * `categories`: chi assegnava due allenatori a «Pulcini · Roma» vedeva la
   * barra dire «fatto» e la tabella restare identica (RC Fix 2, punto 9).
   *
   * I gruppi vincono sulle categorie quando ci sono, perche sono l'unita piu
   * precisa: dire «Pulcini» a chi segue solo Roma direbbe una cosa in piu di
   * quella vera.
   */
  const trainerAssignmentLabels = (trainer: Trainer): string[] => {
    const groupLabels = getTrainerGroupIds(trainer as any)
      .map((groupId) => groupNameById.get(groupId))
      .filter((name): name is string => Boolean(name));

    if (groupLabels.length) return groupLabels;

    return (Array.isArray(trainer.categories) ? trainer.categories : [])
      .map((category) => category?.name)
      .filter((name): name is string => Boolean(name));
  };

  /**
   * Export PDF, con lo stesso motore dell'elenco Atleti.
   *
   * Non e una seconda implementazione: `printPeoplePdf` prende colonne e
   * righe e non sa di che entita si tratti (Blocco 7, punto 13).
   */
  /**
   * Le righe come le vuole l'export, per PDF e CSV.
   *
   * La colonna deve dire cio che dice la tabella: i gruppi, quando ci sono,
   * altrimenti le categorie. Sta in una funzione sola perche i due formati
   * non possano divergere sul contenuto di quella colonna.
   */
  const peopleForExport = (scope: SelectionScope) =>
    rowsForScope(scope).map((trainer) => ({
      ...trainer,
      categories: trainerAssignmentLabels(trainer).map((name) => ({
        id: name,
        name,
      })),
    })) as unknown as Record<string, any>[];

  const handleExportPdf = (scope: SelectionScope) => {
    const result = exportPeoplePdf({
      entity: "trainers",
      people: peopleForExport(scope),
      clubName: activeClub?.name || "EasyGame",
      visibleColumns: null,
      scope,
    });

    if (!result.ok) {
      showToast(
        "error",
        result.reason === "empty"
          ? "Nessun elemento da esportare"
          : "Consenti i popup per generare il PDF",
      );
      return;
    }

    showToast("success", "PDF pronto: si apre la finestra di stampa");
  };

  /**
   * Lo stesso elenco in CSV, con le stesse colonne del PDF.
   *
   * `visibleColumns: null` e cio che questa pagina passa gia al PDF: qui il
   * CSV lo ripete per non far divergere i due file. Che l'elenco Allenatori
   * non filtri le colonne come fanno Staff e Soci e un'incoerenza vera, ma e
   * fuori dallo scope di questa lane.
   */
  const handleExportCsv = (scope: SelectionScope) => {
    const result = exportPeopleCsv({
      entity: "trainers",
      people: peopleForExport(scope),
      clubName: activeClub?.name || "EasyGame",
      visibleColumns: null,
      scope,
    });

    if (!result.ok) {
      showToast("error", "Nessun elemento da esportare");
      return;
    }

    showToast("success", "CSV scaricato");
  };

  /**
   * Scrive la stessa modifica su ogni allenatore selezionato.
   *
   * Una riga per volta e non una scrittura sola perche l'allenatore vive in
   * due collezioni diverse (`trainers` e, per i piu vecchi, `staff_members`) e
   * `updateClubDataItem` sa gia trovarlo in entrambe. Chi fallisce viene
   * contato e detto: un'operazione di massa che dice «fatto» avendone scritti
   * sette su dieci e peggio di una che fallisce.
   */
  const applyToSelection = async (
    updatesFor: (trainer: Trainer) => Record<string, any>,
    successMessage: (count: number) => string,
  ) => {
    if (!clubId || bulkBusy) return;

    const targets = rowsForScope("selected");
    if (!targets.length) return;

    setBulkBusy(true);
    try {
      const { updateClubDataItem } = await import("@/lib/simplified-db");
      let failed = 0;

      for (const trainer of targets) {
        const updates = updatesFor(trainer);
        try {
          await updateClubDataItem(
            clubId,
            "trainers",
            String(trainer.id),
            updates,
          );
        } catch {
          try {
            await updateClubDataItem(
              clubId,
              "staff_members",
              String(trainer.id),
              updates,
            );
          } catch {
            failed += 1;
          }
        }
      }

      const trainersData = await getClubTrainers(clubId);
      const nextTrainers = Array.isArray(trainersData) ? trainersData : [];
      setTrainers(nextTrainers);
      selection.prune(nextTrainers.map((trainer) => String(trainer.id)));

      if (failed) {
        showToast(
          "error",
          `${failed} allenatori su ${targets.length} non sono stati aggiornati`,
        );
        return;
      }

      showToast("success", successMessage(targets.length));
    } catch (error) {
      console.error("Error running bulk trainer action:", error);
      showToast("error", "Operazione non riuscita");
    } finally {
      setBulkBusy(false);
    }
  };

  const setSelectionStatus = (status: "active" | "suspended") =>
    applyToSelection(
      () => ({ status }),
      (count) =>
        `${count} allenatori ${status === "active" ? "attivati" : "sospesi"}`,
    );

  /**
   * Aggiunge un gruppo operativo (o una categoria) alla selezione.
   *
   * **Si aggiunge, non si sostituisce.** Rimpiazzare l'elenco toglierebbe in
   * silenzio a un allenatore le squadre che gia segue, e chi preme «assegna a
   * Pulcini · Roma» sta dicendo una cosa in piu, non una cosa al posto di
   * un'altra.
   */
  const assignGroupToSelection = (group: CategoryGroup) =>
    applyToSelection(
      (trainer) => ({
        groupIds: Array.from(
          new Set([...getTrainerGroupIds(trainer as any), group.id]),
        ),
      }),
      (count) => `${count} allenatori assegnati a ${group.name}`,
    );

  const assignCategoryToSelection = (category: { id: string; name: string }) =>
    applyToSelection(
      (trainer) => ({
        categories: Array.from(
          new Set([
            ...getTrainerCategoryIds(trainer.categories, categories),
            category.id,
          ]),
        ),
      }),
      (count) => `${count} allenatori assegnati a ${category.name}`,
    );

  /**
   * Cosa si puo assegnare: i gruppi dove esistono, le categorie altrimenti.
   *
   * Su un club multi-sede assegnare per categoria metterebbe l'allenatore su
   * tutte le squadre di quella categoria — Roma **e** Aprilia — che e
   * esattamente cio che il modello dei gruppi esiste per evitare
   * (RC Fix 2, punto 15).
   */
  const assignableGroups = getActiveCategoryGroups(categoryGroups)
    // Un gruppo «implicito» e una categoria con un altro nome: offrirlo come
    // gruppo sarebbe una spunta in piu che dice la stessa cosa (ADR-0055).
    .filter((group) => !group.implicit)
    .slice()
    .sort(compareCategoryGroups);
  const assignByGroup = assignableGroups.length > 0;

  return (
    // Altezza fissa + colonna che puo restringersi: cosi lo scorrimento
    // avviene dentro <main>, non su tutto il documento.
    <div className="flex h-[100dvh] overflow-hidden bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="hidden md:block">
        <Sidebar />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header title="Allenatori" />

        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <SharedPageHeader
              title="Allenatori"
              subtitle="Gestisci staff tecnico, categorie assegnate e stato operativo degli allenatori del club."
            />
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="relative w-full sm:w-auto">
                <Input
                  placeholder="Cerca allenatori..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="pl-10 w-full sm:w-80"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>

              <div className="flex gap-2 w-full sm:w-auto flex-wrap">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!exportScopes.length}
                    >
                      <FileDown className="h-4 w-4 mr-1" />
                      Esporta PDF
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {exportScopes.map((scope) => (
                      <DropdownMenuItem
                        key={scope}
                        onClick={() => handleExportPdf(scope)}
                      >
                        {exportScopeLabel(scope, rowsForScope(scope).length)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!exportScopes.length}
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-1" />
                      Esporta CSV
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {exportScopes.map((scope) => (
                      <DropdownMenuItem
                        key={scope}
                        onClick={() => handleExportCsv(scope)}
                      >
                        {exportScopeLabel(scope, rowsForScope(scope).length)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex gap-1 border rounded-lg p-1 bg-white dark:bg-gray-800">
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
                    <Button variant="outline" className="flex-1 sm:flex-none">
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
                  className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nuovo Allenatore
                </Button>
              </div>
            </div>

            <BulkSelectionToolbar
              selection={selection}
              nouns={{ one: "allenatore", many: "allenatori" }}
              className="mb-4"
            >
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={bulkBusy}
                onClick={() => void setSelectionStatus("active")}
              >
                <Eye className="mr-1.5 h-3.5 w-3.5 text-green-600" aria-hidden />
                Attiva
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={bulkBusy}
                onClick={() => void setSelectionStatus("suspended")}
              >
                <UserX className="mr-1.5 h-3.5 w-3.5 text-amber-600" aria-hidden />
                Sospendi
              </Button>

              {/*
                Assegnazione: per gruppo operativo dove i gruppi esistono, per
                categoria dove non esistono. Non c'e una terza possibilita, e
                non c'e un cambio di categoria «alla atleta»: un allenatore
                puo seguirne piu d'una, quindi si aggiunge, non si sostituisce.
              */}
              {(assignByGroup ? assignableGroups.length : categories.length) ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={bulkBusy}
                    >
                      <Users className="mr-1.5 h-3.5 w-3.5 text-blue-600" aria-hidden />
                      {assignByGroup ? "Assegna a un gruppo" : "Assegna a una categoria"}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                    <DropdownMenuLabel>
                      {assignByGroup
                        ? "Si aggiunge ai gruppi gia seguiti"
                        : "Si aggiunge alle categorie gia assegnate"}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {assignByGroup
                      ? assignableGroups.map((group) => (
                          <DropdownMenuItem
                            key={group.id}
                            onClick={() => void assignGroupToSelection(group)}
                          >
                            {group.name}
                          </DropdownMenuItem>
                        ))
                      : categories.map((category) => (
                          <DropdownMenuItem
                            key={category.id}
                            onClick={() => void assignCategoryToSelection(category)}
                          >
                            {category.name}
                          </DropdownMenuItem>
                        ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}

              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={bulkBusy}
                onClick={() => handleExportPdf("selected")}
              >
                <FileDown className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Esporta PDF
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={bulkBusy}
                onClick={() => handleExportCsv("selected")}
              >
                <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Esporta CSV
              </Button>
            </BulkSelectionToolbar>

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
                          <th className="w-12 py-3 px-4">
                            <SelectAllCheckbox
                              selection={selection}
                              ids={filteredTrainerIds}
                              label="gli allenatori in elenco"
                            />
                          </th>
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
                            <td className="py-3 px-4">
                              <SelectRowCheckbox
                                selection={selection}
                                id={String(trainer.id)}
                                label={trainer.name}
                              />
                            </td>
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
                                      <AvatarFallback className="bg-transparent p-0">
                                        <EntityIcon
                                          type="trainer"
                                          label={trainer.name}
                                          className="h-full w-full border-0"
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
                                {(() => {
                                  const labels =
                                    trainerAssignmentLabels(trainer);
                                  if (!labels.length) return "-";

                                  return (
                                    <div className="flex flex-wrap gap-1.5">
                                      {labels.map((label, index) => (
                                        <Badge
                                          key={`${label}-${index}`}
                                          variant="outline"
                                          className="border-blue-100 bg-blue-50 text-blue-700"
                                        >
                                          {label}
                                        </Badge>
                                      ))}
                                    </div>
                                  );
                                })()}
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
                                  disabled={deletingTrainerId === trainer.id}
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
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
