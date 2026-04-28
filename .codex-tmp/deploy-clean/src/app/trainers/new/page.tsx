"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import { supabase } from "@/lib/supabase";
import { addClubData } from "@/lib/simplified-db";
import { ArrowLeft, Calendar, Euro, Mail, Phone, Save, User } from "lucide-react";

type TrainerFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthYear: string;
  fiscalCode: string;
  address: string;
  city: string;
  postalCode: string;
  salary: string;
  startDate: string;
  bio: string;
  selectedCategories: string[];
};

const initialFormState: TrainerFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  birthYear: "",
  fiscalCode: "",
  address: "",
  city: "",
  postalCode: "",
  salary: "",
  startDate: new Date().toISOString().split("T")[0],
  bio: "",
  selectedCategories: [],
};

function NewTrainerPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { activeClub } = useAuth();
  const [clubId, setClubId] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [formData, setFormData] = useState<TrainerFormState>(initialFormState);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);

  useEffect(() => {
    const clubIdFromParams = searchParams?.get("clubId");
    if (clubIdFromParams && clubIdFromParams !== "null") {
      setClubId(clubIdFromParams);
      return;
    }

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
            return;
          }
        } catch (error) {
          console.error("Error parsing activeClub from localStorage", error);
        }
      }
    }
  }, [activeClub, searchParams]);

  useEffect(() => {
    const loadCategories = async () => {
      if (!clubId) {
        setCategories([]);
        setIsLoadingCategories(false);
        return;
      }

      setIsLoadingCategories(true);
      try {
        const { data: clubData, error } = await supabase
          .from("clubs")
          .select("categories")
          .eq("id", clubId)
          .single();

        if (error) {
          throw error;
        }

        const nextCategories = Array.isArray(clubData?.categories)
          ? clubData.categories
              .map((category: any) => ({
                id: String(category?.id || "").trim(),
                name: String(category?.name || "").trim(),
              }))
              .filter((category) => category.id && category.name)
          : [];

        setCategories(nextCategories);
      } catch (error) {
        console.error("Error loading trainer categories:", error);
        setCategories([]);
        showToast("error", "Errore nel caricamento delle categorie del club");
      } finally {
        setIsLoadingCategories(false);
      }
    };

    loadCategories();
  }, [clubId, showToast]);

  const selectedCategoryNames = useMemo(
    () =>
      categories
        .filter((category) => formData.selectedCategories.includes(category.id))
        .map((category) => category.name),
    [categories, formData.selectedCategories],
  );

  const handleInputChange = (field: keyof TrainerFormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleCategory = (categoryId: string) => {
    setFormData((prev) => ({
      ...prev,
      selectedCategories: prev.selectedCategories.includes(categoryId)
        ? prev.selectedCategories.filter((id) => id !== categoryId)
        : [...prev.selectedCategories, categoryId],
    }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!clubId) {
      showToast("error", "Club attivo non trovato. Seleziona prima un club.");
      return;
    }

    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      showToast("error", "Nome e cognome sono obbligatori");
      return;
    }

    if (!formData.email.trim() && !formData.phone.trim()) {
      showToast("error", "Inserisci almeno un contatto tra email e telefono");
      return;
    }

    setIsSaving(true);

    try {
      const firstName = formData.firstName.trim();
      const lastName = formData.lastName.trim();
      const fullName = [firstName, lastName].filter(Boolean).join(" ");
      const trainerId = `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const newTrainer = {
        id: trainerId,
        name: fullName,
        fullName,
        firstName,
        lastName,
        surname: lastName,
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        birthYear: formData.birthYear ? Number(formData.birthYear) : null,
        fiscalCode: formData.fiscalCode.trim(),
        address: formData.address.trim(),
        city: formData.city.trim(),
        postalCode: formData.postalCode.trim(),
        salary: formData.salary ? Number(formData.salary) : 0,
        hireDate: formData.startDate,
        startDate: formData.startDate,
        bio: formData.bio.trim(),
        role: "trainer",
        status: "active",
        categories: formData.selectedCategories,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName.replace(/\s+/g, ""))}`,
        payments: [],
        contracts: [],
      };

      const savedTrainer = await addClubData(clubId, "trainers", newTrainer);

      showToast("success", "Allenatore creato con successo");
      router.push(`/trainers/${savedTrainer.id}?clubId=${clubId}`);
    } catch (error) {
      console.error("Error creating trainer:", error);
      showToast(
        "error",
        error instanceof Error
          ? error.message
          : "Errore durante la creazione dell'allenatore",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="hidden md:block">
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col">
        <Header title="Nuovo Allenatore" />

        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-5xl space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    router.push(clubId ? `/trainers?clubId=${clubId}` : "/trainers")
                  }
                  className="rounded-full"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">
                    Nuovo Allenatore
                  </h1>
                  <p className="text-slate-500">
                    Crea una nuova anagrafica allenatore per il club selezionato.
                  </p>
                </div>
              </div>

              <Button
                type="submit"
                form="new-trainer-form"
                disabled={isSaving || !clubId}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Salvataggio..." : "Salva Allenatore"}
              </Button>
            </div>

            {!clubId ? (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="py-6 text-amber-900">
                  Seleziona prima un club dalla tua area account, poi torna qui per
                  creare il nuovo allenatore.
                </CardContent>
              </Card>
            ) : null}

            <form id="new-trainer-form" onSubmit={handleSave} className="space-y-6">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5 text-blue-600" />
                    Anagrafica
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="firstName">Nome *</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(event) =>
                        handleInputChange("firstName", event.target.value)
                      }
                      placeholder="Es. Marco"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Cognome *</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(event) =>
                        handleInputChange("lastName", event.target.value)
                      }
                      placeholder="Es. Bianchi"
                    />
                  </div>
                  <div>
                    <Label htmlFor="birthYear">Anno di nascita</Label>
                    <Input
                      id="birthYear"
                      type="number"
                      min="1900"
                      max={new Date().getFullYear()}
                      value={formData.birthYear}
                      onChange={(event) =>
                        handleInputChange("birthYear", event.target.value)
                      }
                      placeholder="Es. 1988"
                    />
                  </div>
                  <div>
                    <Label htmlFor="fiscalCode">Codice fiscale</Label>
                    <Input
                      id="fiscalCode"
                      value={formData.fiscalCode}
                      onChange={(event) =>
                        handleInputChange("fiscalCode", event.target.value)
                      }
                      placeholder="Es. RSSMRA80A01H501Z"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-blue-600" />
                    Contatti
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(event) =>
                        handleInputChange("email", event.target.value)
                      }
                      placeholder="Es. marco.bianchi@easygame.it"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Telefono</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(event) =>
                        handleInputChange("phone", event.target.value)
                      }
                      placeholder="Es. +39 333 1234567"
                    />
                  </div>
                  <div>
                    <Label htmlFor="address">Indirizzo</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(event) =>
                        handleInputChange("address", event.target.value)
                      }
                      placeholder="Es. Via Roma 12"
                    />
                  </div>
                  <div>
                    <Label htmlFor="city">Città</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(event) =>
                        handleInputChange("city", event.target.value)
                      }
                      placeholder="Es. Milano"
                    />
                  </div>
                  <div>
                    <Label htmlFor="postalCode">CAP</Label>
                    <Input
                      id="postalCode"
                      value={formData.postalCode}
                      onChange={(event) =>
                        handleInputChange("postalCode", event.target.value)
                      }
                      placeholder="Es. 20100"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-blue-600" />
                    Inquadramento
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="startDate">Data inizio</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={(event) =>
                        handleInputChange("startDate", event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="salary">Compenso mensile</Label>
                    <div className="relative">
                      <Euro className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="salary"
                        type="number"
                        min="0"
                        step="0.01"
                        className="pl-9"
                        value={formData.salary}
                        onChange={(event) =>
                          handleInputChange("salary", event.target.value)
                        }
                        placeholder="Es. 1500"
                      />
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <Label>Categorie allenate</Label>
                    {isLoadingCategories ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                        Caricamento categorie...
                      </div>
                    ) : categories.length === 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        Nessuna categoria disponibile. Puoi comunque creare
                        l&apos;allenatore e assegnargli le categorie in un secondo
                        momento.
                      </div>
                    ) : (
                      <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap gap-2">
                          {categories.map((category) => {
                            const checked = formData.selectedCategories.includes(
                              category.id,
                            );

                            return (
                              <button
                                key={category.id}
                                type="button"
                                onClick={() => toggleCategory(category.id)}
                                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                                  checked
                                    ? "border-blue-600 bg-blue-600 text-white"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"
                                }`}
                              >
                                {category.name}
                              </button>
                            );
                          })}
                        </div>

                        {selectedCategoryNames.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {selectedCategoryNames.map((categoryName) => (
                              <Badge
                                key={categoryName}
                                variant="secondary"
                                className="bg-blue-100 text-blue-700"
                              >
                                {categoryName}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">
                            Nessuna categoria selezionata.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="bio">Note professionali</Label>
                    <Textarea
                      id="bio"
                      value={formData.bio}
                      onChange={(event) =>
                        handleInputChange("bio", event.target.value)
                      }
                      placeholder="Inserisci una breve presentazione o eventuali note sull'allenatore..."
                      rows={4}
                    />
                  </div>
                </CardContent>
              </Card>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function NewTrainerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          Caricamento...
        </div>
      }
    >
      <NewTrainerPageContent />
    </Suspense>
  );
}
