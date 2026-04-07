"use client";

import React, { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Save, UserPlus } from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { useAuth } from "@/components/providers/AuthProvider";

function NewSocioPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { activeClub } = useAuth();
  const clubIdFromUrl = searchParams?.get("clubId");
  const [clubId, setClubId] = useState<string | null>(clubIdFromUrl);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    fiscalCode: "",
    birthDate: "",
    address: "",
    city: "",
    postalCode: "",
    membershipDate: new Date().toISOString().split("T")[0],
    notes: "",
  });

  // Get clubId from URL or localStorage
  useEffect(() => {
    if (clubIdFromUrl && clubIdFromUrl !== "null") {
      setClubId(clubIdFromUrl);
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
          }
        } catch (e) {
          console.error("Error parsing activeClub from localStorage", e);
        }
      }
    }
  }, [clubIdFromUrl, activeClub]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.firstName || !formData.lastName) {
      showToast("error", "Nome e cognome sono obbligatori");
      return;
    }

    if (!clubId) {
      showToast("error", "ID del club mancante");
      return;
    }

    setIsSubmitting(true);

    try {
      // First get the current club data
      const { data: clubData, error: clubFetchError } = await supabase
        .from("clubs")
        .select("members")
        .eq("id", clubId)
        .single();

      if (clubFetchError) {
        console.error("Error fetching club:", clubFetchError);
        showToast("error", `Errore nel recupero del club: ${clubFetchError.message}`);
        setIsSubmitting(false);
        return;
      }

      // Create new member object
      const fullName = `${formData.firstName} ${formData.lastName}`.trim();
      const newMember = {
        id: crypto.randomUUID(),
        firstName: formData.firstName,
        lastName: formData.lastName,
        name: fullName,
        fullName,
        email: formData.email || null,
        phone: formData.phone || null,
        fiscalCode: formData.fiscalCode || null,
        birthDate: formData.birthDate || null,
        address: formData.address || null,
        city: formData.city || null,
        postalCode: formData.postalCode || null,
        membershipDate: formData.membershipDate,
        notes: formData.notes || null,
        role: "socio",
        status: "active",
        createdAt: new Date().toISOString(),
      };

      // Add member to the club's members array
      const currentMembers = clubData?.members || [];
      const updatedMembers = [...currentMembers, newMember];

      const { error: updateError } = await supabase
        .from("clubs")
        .update({ members: updatedMembers })
        .eq("id", clubId);

      if (updateError) {
        console.error("Error updating club members:", updateError);
        showToast("error", `Errore nell'aggiunta del socio: ${updateError.message}`);
        setIsSubmitting(false);
        return;
      }

      showToast("success", "Socio aggiunto con successo!");
      router.push(`/soci?clubId=${clubId}`);
    } catch (error: any) {
      console.error("Error:", error);
      showToast("error", `Errore: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.back()}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Indietro
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Nuovo Socio
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  Aggiungi un nuovo socio all'associazione
                </p>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Dati del Socio
                </CardTitle>
                <CardDescription>
                  Compila i campi per registrare un nuovo socio
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Dati Anagrafici */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Dati Anagrafici</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">Nome *</Label>
                        <Input
                          id="firstName"
                          name="firstName"
                          value={formData.firstName}
                          onChange={handleChange}
                          placeholder="Es. Mario"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Cognome *</Label>
                        <Input
                          id="lastName"
                          name="lastName"
                          value={formData.lastName}
                          onChange={handleChange}
                          placeholder="Es. Rossi"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          value={formData.email}
                          onChange={handleChange}
                          placeholder="mario.rossi@email.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Telefono</Label>
                        <Input
                          id="phone"
                          name="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={handleChange}
                          placeholder="+39 333 1234567"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="fiscalCode">Codice Fiscale</Label>
                        <Input
                          id="fiscalCode"
                          name="fiscalCode"
                          value={formData.fiscalCode}
                          onChange={handleChange}
                          placeholder="RSSMRA80A01H501U"
                          className="uppercase"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="birthDate">Data di Nascita</Label>
                        <Input
                          id="birthDate"
                          name="birthDate"
                          type="date"
                          value={formData.birthDate}
                          onChange={handleChange}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Indirizzo */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Indirizzo</h3>
                    <div className="space-y-2">
                      <Label htmlFor="address">Via/Piazza</Label>
                      <Input
                        id="address"
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        placeholder="Via Roma, 1"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="city">Città</Label>
                        <Input
                          id="city"
                          name="city"
                          value={formData.city}
                          onChange={handleChange}
                          placeholder="Roma"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="postalCode">CAP</Label>
                        <Input
                          id="postalCode"
                          name="postalCode"
                          value={formData.postalCode}
                          onChange={handleChange}
                          placeholder="00100"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dati Associazione */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Dati Associazione</h3>
                    <div className="space-y-2">
                      <Label htmlFor="membershipDate">Data Iscrizione</Label>
                      <Input
                        id="membershipDate"
                        name="membershipDate"
                        type="date"
                        value={formData.membershipDate}
                        onChange={handleChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Note</Label>
                      <textarea
                        id="notes"
                        name="notes"
                        value={formData.notes}
                        onChange={handleChange}
                        placeholder="Note aggiuntive..."
                        className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="flex justify-end gap-4 pt-4 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.back()}
                    >
                      Annulla
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {isSubmitting ? (
                        <>
                          <span className="animate-spin mr-2">⏳</span>
                          Salvataggio...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Salva Socio
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function NewSocioPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Caricamento...</div>}>
      <NewSocioPageContent />
    </Suspense>
  );
}
