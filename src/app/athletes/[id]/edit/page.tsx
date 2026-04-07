"use client";

import React, { useState } from "react";
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
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-notification";
import { Upload, Save, ArrowLeft, Plus, Trash2 } from "lucide-react";
import Image from "next/image";

export default function EditAthletePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const athleteId = params?.id as string;
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Mock data for the athlete
  const [athleteData, setAthleteData] = useState({
    id: athleteId,
    name: "Mario Rossi",
    categories: [{ id: "3", name: "Under 14" }],
    age: "13",
    status: "active",
    medicalCertExpiry: "2024-12-31",
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=MarioRossi`,
    email: "genitore@esempio.it",
    phone: "+39 123 456 7890",
    address: "Via Roma 123",
    city: "Milano",
    postalCode: "20100",
    birthDate: "2011-05-15",
    registrationDate: "2023-09-01",
    notes:
      "Allergia ai frutti di mare. Preferisce giocare come centrocampista.",
    parent1: {
      name: "Giuseppe Rossi",
      email: "giuseppe.rossi@esempio.it",
      phone: "+39 333 1234567",
      fiscalCode: "RSSGPP80A01H501Z",
    },
    parent2: {
      name: "Maria Rossi",
      email: "maria.rossi@esempio.it",
      phone: "+39 333 7654321",
      fiscalCode: "RSSMRA82B02H501Y",
    },
    payment: {
      registrationFee: "250",
      paid: "150",
      dueDate: "2024-06-30",
      paymentMethod: "Bonifico",
      notes: "Pagamento rateizzato in 3 rate",
    },
  });

  // Mock categories for the form
  const mockCategories = [
    { id: "1", name: "Under 10" },
    { id: "2", name: "Under 12" },
    { id: "3", name: "Under 14" },
    { id: "4", name: "Under 16" },
    { id: "5", name: "Under 18" },
  ];

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
    section?: string,
    field?: string,
  ) => {
    const { name, value } = e.target;

    if (section && field) {
      setAthleteData((prev) => ({
        ...prev,
        [section]: {
          ...((prev[section as keyof typeof prev] as Record<string, any>) ||
            {}),
          [field]: value,
        },
      }));
    } else {
      setAthleteData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
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

  const handleAddCategory = () => {
    // Find the selected category from mockCategories
    const selectedCategorySelect = document.getElementById(
      "category-select",
    ) as HTMLSelectElement;
    if (selectedCategorySelect && selectedCategorySelect.value) {
      const selectedCategoryId = selectedCategorySelect.value;
      const selectedCategory = mockCategories.find(
        (cat) => cat.id === selectedCategoryId,
      );

      if (selectedCategory) {
        // Check if category already exists
        const categoryExists = athleteData.categories.some(
          (cat) => cat.id === selectedCategory.id,
        );

        if (!categoryExists) {
          setAthleteData((prev) => ({
            ...prev,
            categories: [
              ...prev.categories,
              { id: selectedCategory.id, name: selectedCategory.name },
            ],
          }));
          showToast(
            "success",
            `Categoria ${selectedCategory.name} aggiunta all'atleta`,
          );
        } else {
          showToast(
            "error",
            "Questa categoria è già stata assegnata all'atleta",
          );
        }
      }
    } else {
      showToast("error", "Seleziona una categoria prima di aggiungerla");
    }
  };

  const handleRemoveCategory = (categoryId: string) => {
    setAthleteData((prev) => ({
      ...prev,
      categories: prev.categories.filter((cat) => cat.id !== categoryId),
    }));
    showToast("success", "Categoria rimossa dall'atleta");
  };

  const handleSave = () => {
    showToast("success", "Modifiche salvate con successo");
    router.push(`/athletes/${athleteId}`);
  };

  const handleCancel = () => {
    router.push(`/athletes/${athleteId}`);
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Modifica Atleta" />
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
                      src={athleteData.avatar}
                      alt={athleteData.name}
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
                    value={athleteData.name}
                    onChange={handleChange}
                    className="max-w-md"
                  />
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {athleteData.categories.map((category) => (
                    <Badge
                      key={category.id}
                      className="bg-blue-500 flex items-center gap-1 p-1.5"
                    >
                      {category.name}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 rounded-full bg-blue-600 hover:bg-blue-700 p-0"
                        onClick={() => handleRemoveCategory(category.id)}
                      >
                        <Trash2 className="h-3 w-3 text-white" />
                      </Button>
                    </Badge>
                  ))}
                  <div className="flex items-center gap-2">
                    <select
                      id="category-select"
                      className="h-8 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background"
                    >
                      {mockCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1"
                      onClick={handleAddCategory}
                    >
                      <Plus className="h-3 w-3" />
                      Aggiungi
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <Tabs defaultValue="personal">
              <TabsList className="grid grid-cols-4">
                <TabsTrigger value="personal">Dati Personali</TabsTrigger>
                <TabsTrigger value="parents">Genitori</TabsTrigger>
                <TabsTrigger value="payment">Pagamenti</TabsTrigger>
                <TabsTrigger value="medical">Certificato Medico</TabsTrigger>
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
                          <Label htmlFor="age">Età</Label>
                          <Input
                            id="age"
                            name="age"
                            type="number"
                            value={athleteData.age}
                            onChange={handleChange}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="birthDate">Data di Nascita</Label>
                          <Input
                            id="birthDate"
                            name="birthDate"
                            type="date"
                            value={athleteData.birthDate}
                            onChange={handleChange}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="status">Stato</Label>
                          <select
                            id="status"
                            name="status"
                            value={athleteData.status}
                            onChange={handleChange}
                            className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                          >
                            <option value="active">Attivo</option>
                            <option value="inactive">Inattivo</option>
                            <option value="suspended">Sospeso</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="address">Indirizzo</Label>
                          <Input
                            id="address"
                            name="address"
                            value={athleteData.address}
                            onChange={handleChange}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="city">Città</Label>
                            <Input
                              id="city"
                              name="city"
                              value={athleteData.city}
                              onChange={handleChange}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="postalCode">CAP</Label>
                            <Input
                              id="postalCode"
                              name="postalCode"
                              value={athleteData.postalCode}
                              onChange={handleChange}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="notes">Note</Label>
                          <Textarea
                            id="notes"
                            name="notes"
                            value={athleteData.notes}
                            onChange={handleChange}
                            rows={3}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="parents" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Genitore 1</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="parent1-name">Nome Completo</Label>
                        <Input
                          id="parent1-name"
                          value={athleteData.parent1.name}
                          onChange={(e) => handleChange(e, "parent1", "name")}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="parent1-fiscalCode">
                          Codice Fiscale
                        </Label>
                        <Input
                          id="parent1-fiscalCode"
                          value={athleteData.parent1.fiscalCode}
                          onChange={(e) =>
                            handleChange(e, "parent1", "fiscalCode")
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="parent1-email">Email</Label>
                        <Input
                          id="parent1-email"
                          type="email"
                          value={athleteData.parent1.email}
                          onChange={(e) => handleChange(e, "parent1", "email")}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="parent1-phone">Telefono</Label>
                        <Input
                          id="parent1-phone"
                          value={athleteData.parent1.phone}
                          onChange={(e) => handleChange(e, "parent1", "phone")}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Genitore 2</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="parent2-name">Nome Completo</Label>
                        <Input
                          id="parent2-name"
                          value={athleteData.parent2.name}
                          onChange={(e) => handleChange(e, "parent2", "name")}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="parent2-fiscalCode">
                          Codice Fiscale
                        </Label>
                        <Input
                          id="parent2-fiscalCode"
                          value={athleteData.parent2.fiscalCode}
                          onChange={(e) =>
                            handleChange(e, "parent2", "fiscalCode")
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="parent2-email">Email</Label>
                        <Input
                          id="parent2-email"
                          type="email"
                          value={athleteData.parent2.email}
                          onChange={(e) => handleChange(e, "parent2", "email")}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="parent2-phone">Telefono</Label>
                        <Input
                          id="parent2-phone"
                          value={athleteData.parent2.phone}
                          onChange={(e) => handleChange(e, "parent2", "phone")}
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
                        <Label htmlFor="payment-registrationFee">
                          Quota Iscrizione (€)
                        </Label>
                        <Input
                          id="payment-registrationFee"
                          type="number"
                          value={athleteData.payment.registrationFee}
                          onChange={(e) =>
                            handleChange(e, "payment", "registrationFee")
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="payment-paid">Importo Pagato (€)</Label>
                        <Input
                          id="payment-paid"
                          type="number"
                          value={athleteData.payment.paid}
                          onChange={(e) => handleChange(e, "payment", "paid")}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="payment-dueDate">
                          Scadenza Pagamento
                        </Label>
                        <Input
                          id="payment-dueDate"
                          type="date"
                          value={athleteData.payment.dueDate}
                          onChange={(e) =>
                            handleChange(e, "payment", "dueDate")
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="payment-paymentMethod">
                          Metodo di Pagamento
                        </Label>
                        <select
                          id="payment-paymentMethod"
                          value={athleteData.payment.paymentMethod}
                          onChange={(e) =>
                            handleChange(e, "payment", "paymentMethod")
                          }
                          className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                        >
                          <option value="Bonifico">Bonifico</option>
                          <option value="Contanti">Contanti</option>
                          <option value="Carta">Carta</option>
                          <option value="Altro">Altro</option>
                        </select>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="payment-notes">Note Pagamento</Label>
                        <Textarea
                          id="payment-notes"
                          value={athleteData.payment.notes}
                          onChange={(e) => handleChange(e, "payment", "notes")}
                          rows={3}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="medical" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Certificato Medico</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium">
                          Certificato Medico
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label htmlFor="medicalCertExpiry">
                            Data Scadenza Certificato
                          </Label>
                          <Input
                            id="medicalCertExpiry"
                            name="medicalCertExpiry"
                            type="date"
                            value={athleteData.medicalCertExpiry}
                            onChange={handleChange}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="certificateType">
                            Tipo Certificato
                          </Label>
                          <select
                            id="certificateType"
                            name="certificateType"
                            className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                          >
                            <option value="agonistico">Agonistico</option>
                            <option value="nonAgonistico">
                              Non Agonistico
                            </option>
                            <option value="base">Base</option>
                          </select>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <p className="text-sm text-muted-foreground">
                            Per caricare un nuovo certificato medico, utilizzare
                            la funzione nella pagina di dettaglio dell'atleta.
                          </p>
                        </div>
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
