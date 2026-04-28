"use client";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast-notification";

export function RegisterForm() {
  return <AuthShell defaultMode="register" />;

  const [registrationType, setRegistrationType] = useState("user");
  const [userType, setUserType] = useState("user");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    phone: "",
    accessCode: "",
    address: "",
    city: "",
    region: "",
    province: "",
    postalCode: "",
  });
  const router = useRouter();
  const { showToast } = useToast();
  const searchParams = useSearchParams();

  useEffect(() => {
    const emailFromSearch = searchParams?.get("email");
    if (emailFromSearch) {
      setFormData((prev) => ({ ...prev, email: emailFromSearch }));
    }

    const typeFromSearch = searchParams?.get("type");
    if (typeFromSearch === "club" || typeFromSearch === "user") {
      setRegistrationType(typeFromSearch);
    }

    const userTypeFromSearch = searchParams?.get("userType");
    if (userTypeFromSearch) {
      setUserType(userTypeFromSearch);
    }

    const accessCodeFromSearch = searchParams?.get("accessCode");
    if (accessCodeFromSearch) {
      setFormData((prev) => ({ ...prev, accessCode: accessCodeFromSearch }));
    }
  }, [searchParams]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      setError("Le password non corrispondono");
      showToast("error", "Le password non corrispondono");
      return;
    }

    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      console.log(
        `Attempting to ${registrationType === "club" ? "create club" : "register user"}:`,
        formData.email,
      );

      let userRole = "user";
      let additionalMetadata = {};

      if (registrationType === "club") {
        userRole = "club_creator";
        additionalMetadata = {
          createClub: true,
          organizationName:
            `${formData.firstName} ${formData.lastName}`.trim() || "Nuovo Club",
          clubName: formData.firstName + " " + formData.lastName,
          clubAddress: formData.address,
          clubCity: formData.city,
          clubRegion: formData.region,
          clubProvince: formData.province,
          clubPostalCode: formData.postalCode,
          clubPhone: formData.phone,
        };
      } else {
        if (userType === "manager") {
          userRole = "club_manager";
        } else {
          userRole = userType;
        }
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            name: `${formData.firstName} ${formData.lastName}`,
            firstName: formData.firstName,
            lastName: formData.lastName,
            role: userRole,
            phone: formData.phone,
            accessCode: formData.accessCode || undefined,
            ...additionalMetadata,
          },
        },
      });

      if (signUpError) {
        console.error("Supabase signup error:", signUpError);
        throw signUpError;
      }

      console.log("Supabase auth response:", data);

      if (data.user) {
        console.log("User created successfully");

        if (registrationType === "club") {
          const { data: initialSignInData } =
            await supabase.auth.signInWithPassword({
            email: formData.email,
            password: formData.password,
          });

          if (initialSignInData.session) {
            showToast("success", "Club creato con successo!");
            router.push("/dashboard");
            return;
          }

          try {
            const { data: orgData, error: orgError } = await supabase
              .from("organizations")
              .insert([
                {
                  name: formData.firstName + " " + formData.lastName,
                  contact_email: formData.email,
                  contact_phone: formData.phone,
                  address: formData.address,
                  city: formData.city,
                  postal_code: formData.postalCode,
                  country: "Italy",
                },
              ])
              .select();

            if (orgError) {
              console.error("Error creating organization:", orgError);
              showToast(
                "error",
                "Errore nella creazione del club. Riprova più tardi.",
              );
            } else if (orgData && orgData.length > 0) {
              const { error: relError } = await supabase
                .from("organization_users")
                .insert([
                  {
                    organization_id: orgData[0].id,
                    user_id: data.user.id,
                    role: "admin",
                    is_primary: true,
                  },
                ]);

              if (relError) {
                console.error(
                  "Error creating organization user relationship:",
                  relError,
                );
              }
            }
          } catch (orgCreateError) {
            console.error("Error creating organization:", orgCreateError);
          }

          const { data: signInData, error: signInError } =
            await supabase.auth.signInWithPassword({
              email: formData.email,
              password: formData.password,
            });

          if (signInData.session) {
            showToast("success", "Club creato con successo!");
            router.push("/dashboard");
            return;
          }
        }

        setError(null);
        setLoading(false);

        if (registrationType === "club") {
          showToast("success", "Club creato con successo!");
          const { data: signInData, error: signInError } =
            await supabase.auth.signInWithPassword({
              email: formData.email,
              password: formData.password,
            });

          if (signInData.session) {
            router.push("/dashboard");
          } else {
            setTimeout(() => {
              router.push("/login");
            }, 2000);
          }
        } else {
          showToast("success", "Registrazione completata!");
          // Store user ID in localStorage for immediate access
          localStorage.setItem("userId", data.user.id);
          // Redirect directly to the user-specific token verification page
          router.push(`/token-verification/${data.user.id}`);
        }

        setFormData({
          email: "",
          password: "",
          confirmPassword: "",
          firstName: "",
          lastName: "",
          phone: "",
          accessCode: "",
          address: "",
          city: "",
          region: "",
          province: "",
          postalCode: "",
        });

        return;
      } else {
        console.warn("No user data returned from Supabase");
      }
    } catch (err: any) {
      console.error("Registration error:", err);
      let errorMessage = "Errore durante la registrazione. Riprova.";

      if (err.message) {
        console.error("Error message:", err.message);
      }
      if (err.details) {
        console.error("Error details:", err.details);
      }

      if (err.message?.includes("Password should be at least")) {
        errorMessage = "La password deve essere di almeno 6 caratteri.";
      } else if (err.message?.includes("User already registered")) {
        errorMessage = "Email già registrata. Prova ad accedere.";
      } else if (err.message?.includes("fetch")) {
        errorMessage =
          "Errore di connessione al server. Verifica la tua connessione internet.";
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      showToast("error", `Errore: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h2 className="text-xl font-semibold">EasyGame</h2>
        <p className="text-sm text-muted-foreground">
          {registrationType === "club"
            ? "Crea una dashboard per il tuo club"
            : "Crea un profilo utente"}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Registrazione collegata al backend SQL dell'app.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Nome</Label>
              <Input
                id="firstName"
                name="firstName"
                placeholder="Mario"
                value={formData.firstName}
                onChange={handleChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Cognome</Label>
              <Input
                id="lastName"
                name="lastName"
                placeholder="Rossi"
                value={formData.lastName}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="nome@esempio.com"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Conferma Password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefono</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+39 123 456 7890"
              value={formData.phone}
              onChange={handleChange}
              required
            />
          </div>

          {formData.accessCode && (
            <div className="space-y-2">
              <Label htmlFor="accessCode">Codice di Accesso</Label>
              <Input
                id="accessCode"
                name="accessCode"
                value={formData.accessCode}
                onChange={handleChange}
                readOnly
                className="bg-gray-50"
              />
            </div>
          )}
        </>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <div className="flex items-center">
              <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-opacity-50 border-t-transparent rounded-full" />
              Elaborazione...
            </div>
          ) : (
            "Registrati"
          )}
        </Button>
      </form>

      <div className="text-center text-sm">
        <span className="text-muted-foreground">Hai già un account? </span>
        <a href="/login" className="text-blue-600 hover:underline">
          Accedi
        </a>
      </div>
    </div>
  );
}
