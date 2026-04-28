"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast-notification";
import { Upload, Save, ArrowLeft, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { updateStaffMember } from "@/lib/simplified-db";
import {
  getTrainerCategoryIds,
  getTrainerDisplayName,
} from "@/lib/trainer-utils";

export default function EditTrainerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const trainerId = params?.id ? (params.id as string) : "demo-trainer-1";
  const clubId = searchParams?.get("clubId");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);

  // Real trainer data from database
  const [trainerData, setTrainerData] = useState<any>(null);

  // Fetch trainer data from database
  useEffect(() => {
    const fetchTrainerData = async () => {
      if (!clubId || !trainerId) return;

      setIsLoading(true);
      try {
        // Import the simplified database functions
        const { getClub, getClubData } = await import("@/lib/simplified-db");

        // Get club data including categories and trainers
        const clubData = await getClub(clubId);
        const clubCategories = clubData?.categories || [];
        setCategories(clubCategories);

        // Get trainers data from the club
        const trainersData = await getClubData(clubId, "trainers");
        const staffMembersData = await getClubData(clubId, "staff_members");

        console.log("Trainers data:", trainersData);
        console.log("Staff members data:", staffMembersData);
        console.log("Looking for trainer ID:", trainerId);

        // First try to find trainer in trainers array
        let trainerFound = trainersData?.find(
          (trainer: any) => trainer.id === trainerId,
        );

        // If not found in trainers, try staff_members
        if (!trainerFound) {
          trainerFound = staffMembersData?.find(
            (staff: any) => staff.id === trainerId,
          );
        }

        console.log("Trainer found:", trainerFound);

        if (trainerFound) {
          const normalizedCategoryIds = getTrainerCategoryIds(
            trainerFound.categories,
            clubCategories,
          );

          setTrainerData({
            id: trainerFound.id,
            name: getTrainerDisplayName(trainerFound),
            email: trainerFound.email,
            phone: trainerFound.phone || "",
            address: trainerFound.address || "",
            city: trainerFound.city || "",
            postalCode: trainerFound.postalCode || "",
            birthDate: trainerFound.birthYear
              ? `${trainerFound.birthYear}-01-01`
              : trainerFound.birthDate || "",
            startDate: trainerFound.hireDate || trainerFound.startDate || "",
            bio: trainerFound.bio || "",
            avatar:
              trainerFound.avatar ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(getTrainerDisplayName(trainerFound).replace(/\s+/g, ""))}`,
            categories: normalizedCategoryIds,
            salary: trainerFound.salary?.toString() || "0",
            fiscalCode: trainerFound.fiscalCode || "",
            password: "",
            confirmPassword: "",
          });
        } else {
          showToast("error", "Allenatore non trovato");
          router.push(`/trainers?clubId=${clubId}`);
        }
      } catch (error) {
        console.error("Error fetching trainer data:", error);
        showToast("error", "Errore nel caricamento dei dati dell'allenatore");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrainerData();
  }, [clubId, trainerId, router, showToast]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setTrainerData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setAvatarPreview(e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCategoryChange = (categoryId: string) => {
    setTrainerData((prev) => {
      const categories = [...prev.categories];
      if (categories.includes(categoryId)) {
        return {
          ...prev,
          categories: categories.filter((id) => id !== categoryId),
        };
      } else {
        return {
          ...prev,
          categories: [...categories, categoryId],
        };
      }
    });
  };

  const handleSave = async () => {
    if (!clubId || !trainerId || !trainerData) return;

    // Validate passwords if they are provided
    if (
      trainerData.password &&
      trainerData.password !== trainerData.confirmPassword
    ) {
      showToast("error", "Le password non coincidono");
      return;
    }

    try {
      // Prepare update data
      const updateData = {
        name: trainerData.name,
        email: trainerData.email,
        phone: trainerData.phone,
        address: trainerData.address,
        city: trainerData.city,
        postalCode: trainerData.postalCode,
        birthYear: trainerData.birthDate
          ? new Date(trainerData.birthDate).getFullYear()
          : null,
        hireDate: trainerData.startDate,
        bio: trainerData.bio,
        avatar: avatarPreview || trainerData.avatar,
        categories: trainerData.categories,
        salary: parseFloat(trainerData.salary) || 0,
        fiscalCode: trainerData.fiscalCode,
      };

      // Use the generic updateClubDataItem function to update trainer data
      const { updateClubDataItem } = await import("@/lib/simplified-db");

      // Try to update in trainers array first
      try {
        await updateClubDataItem(clubId, "trainers", trainerId, updateData);
      } catch (error) {
        // If not found in trainers, try staff_members
        await updateClubDataItem(
          clubId,
          "staff_members",
          trainerId,
          updateData,
        );
      }
      showToast("success", "Modifiche salvate con successo");
      router.push(`/trainers/${trainerId}?clubId=${clubId}`);
    } catch (error) {
      console.error("Error updating trainer:", error);
      showToast("error", "Errore nel salvataggio delle modifiche");
    }
  };

  const handleCancel = () => {
    router.push(`/trainers/${trainerId}?clubId=${clubId}`);
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Modifica Allenatore" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Show error state if trainer not found
  if (!trainerData) {
    return (
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Allenatore Non Trovato" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="flex flex-col items-center justify-center py-8">
              <h2 className="text-xl font-semibold mb-4">
                Allenatore non trovato
              </h2>
              <Button onClick={() => router.push(`/trainers?clubId=${clubId}`)}>
                Torna alla lista allenatori
              </Button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Modifica Allenatore" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="flex justify-between items-center">
              <Button
                variant="outline"
                onClick={handleCancel}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Torna al Profilo
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
                onClick={handleSave}
              >
                <Save className="h-4 w-4" />
                Salva Modifiche
              </Button>
            </div>

            <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-6 rounded-lg border">
              <div className="relative">
                <div className="h-32 w-32 rounded-full overflow-hidden border-4 border-gray-200">
                  {avatarPreview ? (
                    <Image
                      src={avatarPreview}
                      alt="Anteprima avatar"
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <Image
                      src={trainerData.avatar}
                      alt={trainerData.name}
                      fill
                      className="object-cover"
                    />
                  )}
                </div>
                <Label
                  htmlFor="avatar-upload"
                  className="absolute bottom-0 right-0 cursor-pointer bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full"
                >
                  <Upload className="h-4 w-4" />
                </Label>
                <Input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>
              <div className="flex-1 space-y-2 text-center md:text-left">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo</Label>
                  <Input
                    id="name"
                    name="name"
                    value={trainerData.name}
                    onChange={handleChange}
                    className="max-w-md"
                  />
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {categories.map((category) => (
                    <Badge
                      key={category.id}
                      className={`${trainerData.categories.includes(category.id) ? "bg-blue-500" : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"} cursor-pointer`}
                      onClick={() => handleCategoryChange(category.id)}
                    >
                      {category.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <Tabs defaultValue="personal">
              <TabsList className="grid grid-cols-3">
                <TabsTrigger value="personal">Dati Personali</TabsTrigger>
                <TabsTrigger value="account">Account</TabsTrigger>
                <TabsTrigger value="payment">Pagamento</TabsTrigger>
              </TabsList>

              <TabsContent value="personal" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Informazioni Personali</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="birthDate">Data di Nascita</Label>
                          <Input
                            id="birthDate"
                            name="birthDate"
                            type="date"
                            value={trainerData.birthDate}
                            onChange={handleChange}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="startDate">Data di Inizio</Label>
                          <Input
                            id="startDate"
                            name="startDate"
                            type="date"
                            value={trainerData.startDate}
                            onChange={handleChange}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="fiscalCode">Codice Fiscale</Label>
                          <Input
                            id="fiscalCode"
                            name="fiscalCode"
                            value={trainerData.fiscalCode}
                            onChange={handleChange}
                          />
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="address">Indirizzo</Label>
                          <Input
                            id="address"
                            name="address"
                            value={trainerData.address}
                            onChange={handleChange}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="city">Città</Label>
                            <Input
                              id="city"
                              name="city"
                              value={trainerData.city}
                              onChange={handleChange}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="postalCode">CAP</Label>
                            <Input
                              id="postalCode"
                              name="postalCode"
                              value={trainerData.postalCode}
                              onChange={handleChange}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="bio">Biografia</Label>
                          <Textarea
                            id="bio"
                            name="bio"
                            value={trainerData.bio}
                            onChange={handleChange}
                            rows={3}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="account" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Informazioni Account</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          value={trainerData.email}
                          onChange={handleChange}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Telefono</Label>
                        <Input
                          id="phone"
                          name="phone"
                          value={trainerData.phone}
                          onChange={handleChange}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">
                          Nuova Password (opzionale)
                        </Label>
                        <Input
                          id="password"
                          name="password"
                          type="password"
                          value={trainerData.password}
                          onChange={handleChange}
                          placeholder="Lascia vuoto per non modificare"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">
                          Conferma Password
                        </Label>
                        <Input
                          id="confirmPassword"
                          name="confirmPassword"
                          type="password"
                          value={trainerData.confirmPassword}
                          onChange={handleChange}
                          placeholder="Conferma la nuova password"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="payment" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Informazioni Pagamento</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="salary">Stipendio Mensile (€)</Label>
                        <Input
                          id="salary"
                          name="salary"
                          type="number"
                          value={trainerData.salary}
                          onChange={handleChange}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="paymentMethod">
                          Metodo di Pagamento
                        </Label>
                        <select
                          id="paymentMethod"
                          name="paymentMethod"
                          className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                        >
                          <option value="bank_transfer">
                            Bonifico Bancario
                          </option>
                          <option value="cash">Contanti</option>
                          <option value="check">Assegno</option>
                        </select>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="paymentNotes">Note Pagamento</Label>
                        <Textarea
                          id="paymentNotes"
                          name="paymentNotes"
                          placeholder="Inserisci eventuali note sul pagamento..."
                          rows={3}
                        />
                      </div>
                    </div>
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
