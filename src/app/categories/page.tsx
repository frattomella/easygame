"use client";

import React, { useState } from "react";
import { CategoryAthletesDialog } from "@/components/dialogs/CategoryAthletesDialog";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Plus,
  Filter,
  Users,
  Calendar,
  MoreVertical,
  ChevronDown,
} from "lucide-react";
import { CategoryEditorDialog } from "@/components/forms/CategoryEditorDialog";
import { CategoryDetailsDialog } from "@/components/categories/CategoryDetailsDialog";
import { useToast } from "@/components/ui/toast-notification";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  formatCategoryBirthYears,
  normalizeCategoryBirthYears,
} from "@/lib/category-utils";
import {
  getTrainerCategoryIds,
  getTrainerDisplayName,
  trainerHasCategory,
} from "@/lib/trainer-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/dialog";

interface Category {
  id: string;
  name: string;
  sport: string;
  ageRange: string;
  birthYearFrom?: number;
  birthYearTo?: number;
  birthYearsLabel: string;
  athletesCount: number;
  trainersCount: number;
  trainingsPerWeek: number;
  color: string;
}

type CategoryDialogAthlete = {
  id: string;
  name: string;
  avatar?: string;
  status: "active" | "inactive" | "suspended";
};

type ClubTrainer = {
  id: string;
  name?: string;
  categories?: any[];
  [key: string]: any;
};

const normalizeCategoryReference = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const athleteBelongsToCategory = (athlete: any, category: any) => {
  const athleteReferences = [
    athlete.category_id,
    athlete.category_name,
    athlete.data?.category,
    athlete.data?.category_id,
    athlete.data?.categoryId,
    athlete.data?.category_name,
    athlete.data?.categoryName,
  ]
    .map(normalizeCategoryReference)
    .filter(Boolean);

  const categoryReferences = [category?.id, category?.name]
    .map(normalizeCategoryReference)
    .filter(Boolean);

  return athleteReferences.some((reference) =>
    categoryReferences.includes(reference),
  );
};

const buildCategoryViewModel = (
  rawCategory: any,
  athletes: any[],
  trainers: any[],
  trainings: any[],
): Category => {
  const { birthYearFrom, birthYearTo } = normalizeCategoryBirthYears(rawCategory);
  const categoryName =
    rawCategory.name ||
    rawCategory.title ||
    rawCategory.payload?.name ||
    "Categoria";

  const categoryAthletes = athletes.filter((athlete: any) => {
    const athleteStatus = athlete.status || athlete.data?.status || "active";
    return athleteBelongsToCategory(athlete, rawCategory) && athleteStatus === "active";
  });

  const categoryTrainers = trainers.filter((trainer: any) => {
    return trainerHasCategory(trainer, rawCategory);
  });

  const categoryTrainings = trainings.filter((training: any) => {
    return (
      training.categoryId === rawCategory.id ||
      (training.categories && training.categories.includes(rawCategory.id)) ||
      (training.category && training.category.includes(categoryName))
    );
  });

  return {
    id: rawCategory.id || `category-${Date.now()}-${Math.random()}`,
    name: categoryName,
    sport: rawCategory.description || rawCategory.sport || "Sport",
    ageRange: formatCategoryBirthYears({ ...rawCategory, birthYearFrom, birthYearTo }),
    birthYearFrom,
    birthYearTo,
    birthYearsLabel: formatCategoryBirthYears({
      ...rawCategory,
      birthYearFrom,
      birthYearTo,
    }),
    athletesCount: categoryAthletes.length,
    trainersCount: categoryTrainers.length,
    trainingsPerWeek:
      categoryTrainings.length > 0
        ? Math.max(1, Math.round(categoryTrainings.length / 4))
        : 0,
    color: rawCategory.color || "bg-blue-500 text-white",
  };
};

export default function CategoriesPage() {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { user, activeClub, loading: authLoading } = useAuth();
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [showAthletesDialog, setShowAthletesDialog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null,
  );
  const [editingCategory, setEditingCategory] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(
    null,
  );
  const [showCategoryDetails, setShowCategoryDetails] = useState(false);

  // Real data for athletes in a category - loaded from database
  const [categoryAthletes, setCategoryAthletes] = useState<
    CategoryDialogAthlete[]
  >([]);
  const [clubAthletes, setClubAthletes] = useState<any[]>([]);
  const [clubTrainers, setClubTrainers] = useState<ClubTrainer[]>([]);
  const { showToast } = useToast();
  const router = useRouter();

  // Load categories from database
  React.useEffect(() => {
    const loadCategories = async () => {
      if (authLoading) {
        return;
      }

      if (!user || !activeClub) {
        console.log("Categories page - missing user or activeClub:", {
          user: !!user,
          activeClub: !!activeClub,
          authLoading,
        });
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        console.log("Loading categories for club:", activeClub.id);

        const [{ data: categoriesData, error: categoriesError }, { data: athletesData }, { data: clubData }] =
          await Promise.all([
            supabase
              .from("categories")
              .select("*")
              .eq("club_id", activeClub.id)
              .order("created_at", { ascending: true }),
            supabase
              .from("simplified_athletes")
              .select("*")
              .eq("club_id", activeClub.id),
            supabase
              .from("clubs")
              .select("trainers, trainings")
              .eq("id", activeClub.id)
              .single(),
          ]);

        console.log("Categories loaded from resource:", {
          categoriesData,
          categoriesError,
        });

        if (categoriesError) {
          throw categoriesError;
        }

        const athletes = athletesData || [];
        const trainers = clubData?.trainers || [];
        const trainings = clubData?.trainings || [];
        const transformedCategories: Category[] = (categoriesData || []).map(
          (cat: any) => buildCategoryViewModel(cat, athletes, trainers, trainings),
        );

        setClubAthletes(athletes);
        setClubTrainers(trainers);
        setCategories(transformedCategories);
      } catch (error) {
        console.error("Error loading categories:", error);
        showToast("error", "Errore durante il caricamento delle categorie");
        setCategories([]);
        setClubAthletes([]);
        setClubTrainers([]);
      } finally {
        setLoading(false);
      }
    };

    loadCategories();
  }, [user, activeClub, showToast, authLoading]);

  const refetchCategories = async () => {
    if (!activeClub) {
      return;
    }

    const [{ data: categoriesData, error: categoriesError }, { data: athletesData }, { data: clubData }] =
      await Promise.all([
        supabase
          .from("categories")
          .select("*")
          .eq("club_id", activeClub.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("simplified_athletes")
          .select("*")
          .eq("club_id", activeClub.id),
        supabase
          .from("clubs")
          .select("trainers, trainings")
          .eq("id", activeClub.id)
          .single(),
      ]);

    if (categoriesError) {
      throw categoriesError;
    }

    const athletes = athletesData || [];
    const trainers = clubData?.trainers || [];
    const trainings = clubData?.trainings || [];

    setClubAthletes(athletes);
    setClubTrainers(trainers);
    setCategories(
      (categoriesData || []).map((category: any) =>
        buildCategoryViewModel(category, athletes, trainers, trainings),
      ),
    );
  };

  const buildDialogAthletesForCategory = (category: Category) =>
    clubAthletes
      .filter((athlete: any) => athleteBelongsToCategory(athlete, category))
      .map((athlete: any) => ({
        id: athlete.id,
        name:
          `${athlete.first_name || ""} ${athlete.last_name || ""}`.trim() ||
          "Atleta",
        avatar: athlete.avatar_url || athlete.data?.avatar || undefined,
        status: (athlete.status || athlete.data?.status || "active") as
          | "active"
          | "inactive"
          | "suspended",
      }));

  const handleAddCategory = async (categoryData: any) => {
    try {
      console.log("handleAddCategory called with:", {
        user: user ? { id: user.id, email: user.email } : null,
        activeClub: activeClub
          ? { id: activeClub.id, name: activeClub.name }
          : null,
        categoryData,
      });

      if (!user || !activeClub) {
        console.error("Missing user or activeClub:", {
          user: !!user,
          userDetails: user ? { id: user.id, email: user.email } : null,
          activeClub: !!activeClub,
          activeClubDetails: activeClub
            ? { id: activeClub.id, name: activeClub.name }
            : null,
        });
        showToast(
          "error",
          "Utente o club non trovato. Assicurati di aver selezionato un club.",
        );
        return false;
      }

      // Validate required fields
      if (
        !categoryData.name ||
        !Number.isInteger(Number(categoryData.birthYearFrom)) ||
        !Number.isInteger(Number(categoryData.birthYearTo))
      ) {
        console.error("Missing required fields:", categoryData);
        showToast("error", "Nome categoria e anni di nascita sono obbligatori");
        return false;
      }

      console.log("Starting category operation:", {
        editingCategory,
        categoryData,
        activeClub: activeClub.id,
      });
      const payload = {
        id:
          editingCategory && selectedCategory
            ? selectedCategory.id
            : `category-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        club_id: activeClub.id,
        name: categoryData.name.trim(),
        description: categoryData.description?.trim() || "Sport",
        sport: categoryData.description?.trim() || "Sport",
        ageRange: categoryData.ageRange.trim(),
        birthYearFrom: Number(categoryData.birthYearFrom),
        birthYearTo: Number(categoryData.birthYearTo),
        color: categoryData.color || "bg-blue-500 text-white",
      };

      const { data, error } = await supabase.from("categories").upsert(payload);

      if (error) {
        throw error;
      }

      const savedCategory = Array.isArray(data) ? data[0] : data;
      const savedCategoryId = savedCategory?.id || payload.id;
      const assignedTrainerIds = Array.isArray(categoryData.assignedTrainerIds)
        ? categoryData.assignedTrainerIds
        : [];

      if (clubTrainers.length > 0) {
        const assignedTrainerIdSet = new Set(assignedTrainerIds);
        const updatedTrainers = clubTrainers.map((trainer) => {
          const currentCategoryIds = getTrainerCategoryIds(
            trainer.categories,
            categories,
          ).filter(
            (categoryId) =>
              categoryId !== savedCategoryId && categoryId !== payload.name,
          );

          return {
            ...trainer,
            categories: assignedTrainerIdSet.has(trainer.id)
              ? Array.from(new Set([...currentCategoryIds, savedCategoryId]))
              : currentCategoryIds,
          };
        });

        const { error: trainersUpdateError } = await supabase
          .from("clubs")
          .update({
            trainers: updatedTrainers,
          })
          .eq("id", activeClub.id);

        if (trainersUpdateError) {
          throw trainersUpdateError;
        }
      }

      showToast(
        "success",
        editingCategory
          ? `Categoria ${categoryData.name} modificata con successo`
          : `Categoria ${categoryData.name} aggiunta con successo`,
      );

      await refetchCategories();
      setEditingCategory(false);
      setSelectedCategory(null);
      return true;
    } catch (error: any) {
      console.error("Unexpected error in handleAddCategory:", error);

      // Provide more specific error messages based on error type
      let errorMessage = "Errore imprevisto durante il salvataggio";

      if (error.message?.includes("Impossibile connettersi")) {
        errorMessage =
          "Problema di connessione al database. Verifica la configurazione di Supabase.";
      } else if (error.message?.includes("Risorse insufficienti")) {
        errorMessage = "Server sovraccarico. Riprova tra qualche secondo.";
      } else if (error.message?.includes("Failed to fetch")) {
        errorMessage =
          "Errore di connessione. Verifica la tua connessione internet e riprova.";
      } else if (error.message?.includes("ERR_INSUFFICIENT_RESOURCES")) {
        errorMessage = "Risorse insufficienti. Riprova tra qualche secondo.";
      } else if (error.message?.includes("Database")) {
        errorMessage = `Errore database: ${error.message}`;
      } else if (error.message) {
        errorMessage = error.message;
      }

      showToast("error", errorMessage);
      return false;
    }
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete || !user || !activeClub) return;

    try {
      console.log("Deleting category:", categoryToDelete.id);
      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", categoryToDelete.id);

      if (error) {
        throw error;
      }

      await refetchCategories();
      showToast("success", "Categoria eliminata con successo");
      setCategoryToDelete(null);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error("Error deleting category:", error);
      showToast("error", "Errore durante l'eliminazione della categoria");
    }
  };

  const filteredCategories = categories.filter(
    (category) =>
      category.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      category.sport.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Categorie" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-9xl space-y-6">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Categorie
              </h1>
              <p className="text-gray-600 mt-2">
                Organizza le categorie e i gruppi sportivi del club.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="relative w-full sm:w-auto">
                <Input
                  placeholder="Cerca categorie..."
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
                        showToast("info", "Filtro per sport applicato")
                      }
                    >
                      Per Sport
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        showToast("info", "Filtro per età applicato")
                      }
                    >
                      Per Età
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        showToast("info", "Filtro per numero atleti applicato")
                      }
                    >
                      Per Numero Atleti
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
                  onClick={() => setShowAddCategoryModal(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nuova Categoria
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {loading || authLoading ? (
                <div className="col-span-full flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : !user || !activeClub ? (
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                    <Users className="h-8 w-8 text-red-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Club non selezionato
                  </h3>
                  <p className="text-gray-500 mb-4">
                    Seleziona un club per visualizzare e gestire le categorie
                  </p>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => (window.location.href = "/dashboard")}
                  >
                    Vai alla Dashboard
                  </Button>
                </div>
              ) : filteredCategories.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <Users className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Nessuna categoria presente
                  </h3>
                  <p className="text-gray-500 mb-4">
                    Inizia creando la prima categoria per il tuo club
                  </p>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => setShowAddCategoryModal(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Crea Prima Categoria
                  </Button>
                </div>
              ) : (
                filteredCategories.map((category) => (
                  <Card key={category.id} className="overflow-hidden">
                    <div
                      className={`h-2 ${category.color.split(" ")[0]}`}
                    ></div>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg">
                          {category.name}
                        </CardTitle>
                        <Badge className={category.color}>
                          {category.sport}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Anni di nascita: {category.birthYearsLabel}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              {category.athletesCount} atleti
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              {category.trainersCount} allenatori
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            {category.trainingsPerWeek} allenamenti a settimana
                          </span>
                        </div>
                        <div className="flex justify-between pt-2">
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedCategory(category);
                                setCategoryAthletes(
                                  buildDialogAthletesForCategory(category),
                                );
                                setShowAthletesDialog(true);
                              }}
                            >
                              Visualizza Atleti
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-blue-600 border-blue-600"
                              onClick={() => {
                                setSelectedCategory(category);
                                setShowCategoryDetails(true);
                              }}
                            >
                              Info
                            </Button>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedCategory(category);
                                  setShowCategoryDetails(true);
                                }}
                              >
                                Visualizza Dettagli
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => {
                                  setCategoryToDelete(category);
                                  setShowDeleteConfirm(true);
                                }}
                              >
                                Elimina
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </main>
      </div>

      <CategoryEditorDialog
        isOpen={showAddCategoryModal}
        onClose={() => {
          setShowAddCategoryModal(false);
          setEditingCategory(false);
        }}
        onSubmit={handleAddCategory}
        initialData={editingCategory ? selectedCategory : undefined}
        isEditing={editingCategory}
        availableTrainers={clubTrainers.map((trainer) => ({
          id: trainer.id,
          name: getTrainerDisplayName(trainer),
        }))}
        initialAssignedTrainerIds={
          editingCategory && selectedCategory
            ? clubTrainers
                .filter((trainer) =>
                  trainerHasCategory(trainer, selectedCategory, categories),
                )
                .map((trainer) => trainer.id)
            : []
        }
      />

      {selectedCategory && (
        <CategoryAthletesDialog
          isOpen={showAthletesDialog}
          onClose={() => setShowAthletesDialog(false)}
          categoryName={selectedCategory.name}
          athletes={categoryAthletes}
          onAddAthlete={() => {
            setShowAthletesDialog(false);
            router.push(`/athletes?category=${selectedCategory.id}`);
            showToast(
              "info",
              "Reindirizzamento alla pagina atleti per aggiungere nuovi atleti",
            );
          }}
        />
      )}

      <CategoryDetailsDialog
        open={showCategoryDetails}
        onOpenChange={setShowCategoryDetails}
        category={selectedCategory}
        onEdit={() => {
          setShowCategoryDetails(false);
          setEditingCategory(true);
          setShowAddCategoryModal(true);
        }}
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteCategory}
        title="Conferma eliminazione"
        description={`Sei sicuro di voler eliminare la categoria ${categoryToDelete?.name}?`}
        confirmText="Elimina"
        cancelText="Annulla"
        type="warning"
      />
    </div>
  );
}
