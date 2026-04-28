"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-notification";
import { supabase } from "@/lib/supabase";
import { InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ClubCreationFormProps {
  userId: string;
  onSuccess: (clubData: any) => void;
  onCancel: () => void;
}

export function ClubCreationForm({
  userId,
  onSuccess,
  onCancel,
}: ClubCreationFormProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    pin: "",
    phone: "",
    address: "",
    country: "Italia",
    region: "",
    province: "",
    city: "",
    postalCode: "",
    logo: null as File | null,
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData((prev) => ({ ...prev, logo: e.target.files?.[0] || null }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!userId) {
        showToast("error", "ID utente non disponibile. Riprova più tardi.");
        setLoading(false);
        return;
      }

      // Validate required fields
      if (!formData.name) {
        showToast("error", "Il nome del club è obbligatorio");
        setLoading(false);
        return;
      }

      if (!formData.email) {
        showToast("error", "L'email aziendale è obbligatoria");
        setLoading(false);
        return;
      }

      if (!formData.address) {
        showToast("error", "L'indirizzo è obbligatorio");
        setLoading(false);
        return;
      }

      if (!formData.region) {
        showToast("error", "La regione è obbligatoria");
        setLoading(false);
        return;
      }

      if (!formData.province) {
        showToast("error", "La provincia è obbligatoria");
        setLoading(false);
        return;
      }

      if (!formData.city) {
        showToast("error", "La città è obbligatoria");
        setLoading(false);
        return;
      }

      if (!formData.postalCode) {
        showToast("error", "Il CAP è obbligatorio");
        setLoading(false);
        return;
      }

      if (formData.pin && formData.pin.length !== 4) {
        showToast("error", "Il PIN deve essere di 4 cifre");
        setLoading(false);
        return;
      }

      console.log("Creating club with data:", {
        name: formData.name,
        email: formData.email,
        userId: userId,
      });

      // Create the club in database
      const { data: clubData, error: clubError } = await supabase
        .from("clubs")
        .insert([
          {
            name: formData.name,
            contact_email: formData.email,
            contact_phone: formData.phone,
            address: formData.address,
            country: formData.country,
            region: formData.region,
            province: formData.province,
            city: formData.city,
            postal_code: formData.postalCode,
            payment_pin: formData.pin,
            created_at: new Date().toISOString(),
            creator_id: userId,
            slug: `club-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`,
            members: [
              {
                user_id: userId,
                role: "club_creator",
                is_primary: true,
                created_at: new Date().toISOString(),
              },
            ],
            dashboard_data: {
              settings: {
                theme: "default",
                layout: "standard",
                widgets: [
                  "metrics",
                  "activities",
                  "trainings",
                  "certifications",
                ],
              },
            },
          },
        ])
        .select();

      if (clubError) {
        console.error("Error creating club:", clubError);
        showToast(
          "error",
          `Errore nella creazione del club: ${clubError.message}`,
        );
        setLoading(false);
        return;
      }

      if (clubData && clubData[0]) {
        console.log("Club created successfully:", clubData[0]);

        // Update user's club_access in the users table
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("club_access")
          .eq("id", userId)
          .single();

        if (userError && userError.code !== "PGRST116") {
          console.error("Error fetching user club access:", userError);
        }

        const clubAccess = userData?.club_access || [];
        clubAccess.push({
          club_id: clubData[0].id,
          role: "club_creator",
          is_primary: true,
        });

        const { error: updateUserError } = await supabase
          .from("users")
          .update({ club_access: clubAccess })
          .eq("id", userId);

        if (updateUserError) {
          console.error("Error updating user club access:", updateUserError);
        }

        // Create a dashboard for the club (for backward compatibility)
        const { data: dashboardData, error: dashboardError } = await supabase
          .from("dashboards")
          .insert([
            {
              organization_id: clubData[0].id,
              created_at: new Date().toISOString(),
              creator_id: userId,
              settings: JSON.stringify({
                theme: "default",
                layout: "standard",
                widgets: [
                  "metrics",
                  "activities",
                  "trainings",
                  "certifications",
                ],
              }),
            },
          ])
          .select();

        if (dashboardError) {
          console.error("Error creating dashboard:", dashboardError);
        } else {
          console.log("Dashboard created successfully:", dashboardData);
        }

        // Upload logo if provided
        let logoUrl = null;
        if (formData.logo) {
          const fileExt = formData.logo.name.split(".").pop();
          const fileName = `${clubData[0].id}-logo.${fileExt}`;
          const { data: uploadData, error: uploadError } =
            await supabase.storage
              .from("club-logos")
              .upload(fileName, formData.logo);

          if (uploadError) {
            console.error("Error uploading logo:", uploadError);
          } else if (uploadData) {
            const {
              data: { publicUrl },
            } = supabase.storage.from("club-logos").getPublicUrl(fileName);
            logoUrl = publicUrl;

            // Update club with logo URL
            await supabase
              .from("clubs")
              .update({ logo_url: logoUrl })
              .eq("id", clubData[0].id);
          }
        }

        // Create club object for state and localStorage
        const clubDataForUI = {
          id: clubData[0].id,
          name: formData.name,
          role: "club_creator",
          roleLabel: "Creatore",
          color: "#3b82f6",
          logo_url: logoUrl,
          addedAt: clubData[0].created_at,
          userRole: "club_creator",
          isPrimary: true,
        };

        console.log(
          "Club creation complete, calling onSuccess with:",
          clubDataForUI,
        );
        showToast("success", "Club creato con successo!");
        onSuccess(clubDataForUI);
      }
    } catch (err) {
      console.error("Error creating club:", err);
      showToast(
        "error",
        `Errore nella creazione del club: ${err instanceof Error ? err.message : "Errore sconosciuto"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-lg max-w-md mx-auto max-h-[80vh] overflow-y-auto">
      <h2 className="text-lg font-semibold text-center mb-4">
        Crea Nuovo Club
      </h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="name" className="text-sm">
            Nome del Club*
          </Label>
          <Input
            id="name"
            name="name"
            placeholder="Es. Polisportiva Roma"
            value={formData.name}
            onChange={handleChange}
            required
            className="h-9"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="email" className="text-sm">
            Email Aziendale*
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="info@tuoclub.it"
            value={formData.email}
            onChange={handleChange}
            required
            className="h-9"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Label htmlFor="pin" className="text-sm">
              PIN di 4 cifre
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="h-3 w-3 text-blue-500 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="bg-white text-gray-800 p-2 rounded shadow-lg text-xs max-w-xs">
                  Il PIN viene utilizzato per autorizzare i pagamenti e le
                  operazioni sensibili all'interno dell'app.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            id="pin"
            name="pin"
            type="text"
            maxLength={4}
            pattern="[0-9]{4}"
            placeholder="1234"
            value={formData.pin}
            onChange={handleChange}
            className="h-9"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Telefono Aziendale (opzionale)</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            placeholder="+39 123 456 7890"
            value={formData.phone}
            onChange={handleChange}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Indirizzo*</Label>
          <Input
            id="address"
            name="address"
            placeholder="Via Roma 123"
            value={formData.address}
            onChange={handleChange}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="country">Paese*</Label>
          <Input
            id="country"
            name="country"
            placeholder="Italia"
            value={formData.country}
            onChange={handleChange}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="region" className="text-sm">
              Regione*
            </Label>
            <Input
              id="region"
              name="region"
              placeholder="Lazio"
              value={formData.region}
              onChange={handleChange}
              required
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="province" className="text-sm">
              Provincia*
            </Label>
            <Input
              id="province"
              name="province"
              placeholder="RM"
              value={formData.province}
              onChange={handleChange}
              required
              className="h-9"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="city" className="text-sm">
              Città*
            </Label>
            <Input
              id="city"
              name="city"
              placeholder="Roma"
              value={formData.city}
              onChange={handleChange}
              required
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="postalCode" className="text-sm">
              CAP*
            </Label>
            <Input
              id="postalCode"
              name="postalCode"
              placeholder="00100"
              value={formData.postalCode}
              onChange={handleChange}
              required
              className="h-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="logo">Logo del Club</Label>
          <div className="border-2 border-dashed border-gray-300 rounded-md p-4 text-center">
            {formData.logo ? (
              <div className="flex flex-col items-center">
                <img
                  src={URL.createObjectURL(formData.logo)}
                  alt="Logo Preview"
                  className="max-h-32 mb-2"
                />
                <p className="text-sm text-gray-500">{formData.logo.name}</p>
                <button
                  type="button"
                  className="text-xs text-red-500 mt-2"
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, logo: null }))
                  }
                >
                  Rimuovi
                </button>
              </div>
            ) : (
              <div className="py-4">
                <label htmlFor="logo-upload" className="cursor-pointer">
                  <div className="flex flex-col items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-10 w-10 text-gray-400 mb-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                    <p className="text-sm text-gray-500">
                      Clicca per caricare un logo
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      PNG, JPG, GIF fino a 5MB
                    </p>
                  </div>
                </label>
                <input
                  id="logo-upload"
                  name="logo"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between space-x-2 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="h-9"
          >
            Annulla
          </Button>
          <Button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 h-9"
            disabled={loading}
          >
            {loading ? (
              <div className="flex items-center">
                <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-opacity-50 border-t-transparent rounded-full" />
                Creazione in corso...
              </div>
            ) : (
              "Crea Club"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
