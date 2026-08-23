"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api/client";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast-notification";
import {
  ArrowRight,
  Briefcase,
  Building2,
  Chrome,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";
import {
  EasyGameLogo,
  EasyGameWordmark,
} from "@/components/brand/easygame-logo";

type AuthMode = "login" | "register";

type AuthProvider = {
  id: string;
  label: string;
};

type AuthCapabilities = {
  providers: AuthProvider[];
  emailVerification: boolean;
  phoneVerification: boolean;
  emailProviderConfigured: boolean;
  phoneProviderConfigured: boolean;
  testCodesEnabled: boolean;
};

type PendingVerification = {
  userId: string;
  email: string;
  phone?: string | null;
  emailRequired: boolean;
  phoneRequired: boolean;
  emailPreviewCode?: string | null;
  phonePreviewCode?: string | null;
};

const defaultCapabilities: AuthCapabilities = {
  providers: [],
  emailVerification: true,
  phoneVerification: false,
  emailProviderConfigured: false,
  phoneProviderConfigured: false,
  testCodesEnabled: false,
};

export function AuthShell({
  defaultMode = "login",
}: {
  defaultMode?: AuthMode;
}) {
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [mode, setMode] = useState<AuthMode>(defaultMode);
  const [capabilities, setCapabilities] =
    useState<AuthCapabilities>(defaultCapabilities);
  const [loadingProviders, setLoadingProviders] = useState(true);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerData, setRegisterData] = useState({
    firstName: "",
    lastName: "",
    organizationName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [registerRole, setRegisterRole] = useState<"user" | "club_creator">(
    "user",
  );

  const [pendingVerification, setPendingVerification] =
    useState<PendingVerification | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  useEffect(() => {
    const oauthError = searchParams?.get("oauthError");
    if (oauthError) {
      setError(decodeURIComponent(oauthError));
    }
  }, [searchParams]);

  useEffect(() => {
    const emailFromSearch = searchParams?.get("email");
    if (emailFromSearch) {
      setLoginEmail(emailFromSearch);
      setRegisterData((prev) => ({ ...prev, email: emailFromSearch }));
    }
  }, [searchParams]);

  useEffect(() => {
    const checkSession = async () => {
      const response = await supabase.auth.getSession();
      if (response.data?.session) {
        window.location.href = "/auth/complete";
      }
    };

    checkSession();
  }, []);

  useEffect(() => {
    const loadProviders = async () => {
      setLoadingProviders(true);
      const response = await apiRequest<AuthCapabilities>(
        "/api/v1/auth/providers",
      );
      if (response.data) {
        setCapabilities({
          providers: response.data.providers || [],
          emailVerification: Boolean(response.data.emailVerification),
          phoneVerification: Boolean(response.data.phoneVerification),
          phoneProviderConfigured: Boolean(
            response.data.phoneProviderConfigured,
          ),
          emailProviderConfigured: Boolean(
            response.data.emailProviderConfigured,
          ),
          testCodesEnabled: Boolean(response.data.testCodesEnabled),
        });
      }
      setLoadingProviders(false);
    };

    loadProviders();
  }, []);

  const handleRegisterChange = (name: string, value: string) => {
    setRegisterData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleVerificationSuccess = () => {
    showToast("success", "Accesso completato con successo");
    window.location.href = "/auth/complete";
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginLoading(true);
    setError(null);

    try {
      const response: any = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (response.error) {
        if (response.error?.verification || response.data?.verification) {
          setPendingVerification(
            response.error?.verification || response.data?.verification,
          );
          setMode("login");
          setError(response.error.message || "Verifica richiesta");
          return;
        }

        throw new Error(response.error.message || "Login non riuscito");
      }

      if (response.data?.session) {
        window.location.href = "/auth/complete";
        return;
      }

      throw new Error("Sessione non disponibile");
    } catch (authError: any) {
      setError(authError?.message || "Errore durante il login");
      showToast("error", authError?.message || "Errore durante il login");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setRegisterLoading(true);
    setError(null);

    try {
      if (registerData.password !== registerData.confirmPassword) {
        throw new Error("Le password non coincidono");
      }

      if (
        registerRole === "club_creator" &&
        !registerData.organizationName.trim()
      ) {
        throw new Error("Il nome del club è obbligatorio");
      }

      const response: any = await supabase.auth.signUp({
        email: registerData.email,
        password: registerData.password,
        options: {
          data: {
            firstName: registerData.firstName,
            lastName: registerData.lastName,
            name: `${registerData.firstName} ${registerData.lastName}`.trim(),
            phone: registerData.phone,
            role: registerRole,
            createClub: registerRole === "club_creator",
            organizationName:
              registerRole === "club_creator"
                ? registerData.organizationName
                : undefined,
          },
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Registrazione non riuscita");
      }

      if (response.data?.verification) {
        setPendingVerification(response.data.verification);
        setMode("register");
        showToast(
          "success",
          capabilities.emailProviderConfigured
            ? "Account creato. Completa la verifica per accedere."
            : "Account creato. La verifica email è temporaneamente non disponibile.",
        );
        return;
      }

      if (response.data?.session) {
        handleVerificationSuccess();
        return;
      }

      throw new Error("Flusso di registrazione incompleto");
    } catch (registerError: any) {
      setError(registerError?.message || "Errore durante la registrazione");
      showToast(
        "error",
        registerError?.message || "Errore durante la registrazione",
      );
    } finally {
      setRegisterLoading(false);
    }
  };

  const submitEmailVerification = async () => {
    if (!pendingVerification?.userId || !emailCode.trim()) {
      setError("Inserisci il codice email");
      return;
    }

    setVerificationLoading(true);
    setError(null);

    try {
      const response = await apiRequest<any>(
        "/api/v1/auth/verify/email/confirm",
        {
          method: "POST",
          body: {
            userId: pendingVerification.userId,
            code: emailCode.trim(),
          },
        },
      );

      if (response.error) {
        throw new Error(
          response.error.message || "Verifica email non riuscita",
        );
      }

      if (response.data?.session) {
        handleVerificationSuccess();
        return;
      }

      if (response.data?.verification) {
        setPendingVerification({
          ...pendingVerification,
          ...response.data.verification,
        });
        setEmailCode("");
        showToast("success", "Email verificata");
      }
    } catch (verificationError: any) {
      setError(verificationError?.message || "Errore verifica email");
      showToast("error", verificationError?.message || "Errore verifica email");
    } finally {
      setVerificationLoading(false);
    }
  };

  const submitPhoneVerification = async () => {
    if (!pendingVerification?.userId || !phoneCode.trim()) {
      setError("Inserisci il codice SMS");
      return;
    }

    setVerificationLoading(true);
    setError(null);

    try {
      const response = await apiRequest<any>(
        "/api/v1/auth/verify/phone/confirm",
        {
          method: "POST",
          body: {
            userId: pendingVerification.userId,
            code: phoneCode.trim(),
          },
        },
      );

      if (response.error) {
        throw new Error(
          response.error.message || "Verifica telefono non riuscita",
        );
      }

      if (response.data?.session) {
        handleVerificationSuccess();
        return;
      }

      if (response.data?.verification) {
        setPendingVerification({
          ...pendingVerification,
          ...response.data.verification,
        });
        setPhoneCode("");
      }
    } catch (verificationError: any) {
      setError(verificationError?.message || "Errore verifica telefono");
      showToast(
        "error",
        verificationError?.message || "Errore verifica telefono",
      );
    } finally {
      setVerificationLoading(false);
    }
  };

  const resendVerification = async (channel: "email" | "phone") => {
    if (!pendingVerification?.userId) {
      return;
    }

    const response = await apiRequest<any>(
      `/api/v1/auth/verify/${channel}/send`,
      {
        method: "POST",
        body: {
          userId: pendingVerification.userId,
        },
      },
    );

    if (response.error) {
      setError(response.error.message || "Impossibile reinviare il codice");
      showToast(
        "error",
        response.error.message || "Impossibile reinviare il codice",
      );
      return;
    }

    setPendingVerification((prev) =>
      prev
        ? {
            ...prev,
            ...(channel === "email"
              ? { emailPreviewCode: response.data?.previewCode || null }
              : { phonePreviewCode: response.data?.previewCode || null }),
          }
        : prev,
    );
    showToast(
      "success",
      `Codice ${channel === "email" ? "email" : "SMS"} inviato`,
    );
  };

  const providerButtons = (
    <div className="grid gap-2">
      {loadingProviders ? (
        <div className="flex items-center justify-center py-3 text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Caricamento provider...
        </div>
      ) : capabilities.providers.length > 0 ? (
        capabilities.providers.map((provider) => (
          <Button
            key={provider.id}
            type="button"
            variant="outline"
            className="justify-start border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            onClick={() => {
              window.location.href = `/api/v1/auth/oauth/${provider.id}/start`;
            }}
          >
            {provider.id === "google" ? (
              <Chrome className="mr-2 h-4 w-4" />
            ) : (
              <Briefcase className="mr-2 h-4 w-4" />
            )}
            Continua con {provider.label}
          </Button>
        ))
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          Google e Microsoft si abilitano inserendo le credenziali OAuth nelle
          env.
        </div>
      )}
    </div>
  );

  return (
    <div className="eg-auth min-h-screen bg-[var(--eg-paper)] px-4 py-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1fr_460px] lg:gap-8">
          {/*
            Il pannello non vende: mostra l'oggetto che il prodotto amministra.
            Una griglia settimanale e la targa della stagione — le due cose che
            in EasyGame delimitano tutto il resto.
          */}
          <aside className="hidden rounded-2xl bg-[var(--eg-navy)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div className="space-y-6">
              <span className="flex items-center gap-3">
                <EasyGameLogo tone="light" className="h-10 w-10" />
                <span className="font-display text-xl font-semibold tracking-tight">
                  EasyGame
                </span>
              </span>

              <h1 className="font-display text-3xl font-semibold leading-[1.15] tracking-tight">
                Il registro della tua
                <br />
                societa sportiva.
              </h1>
              <p className="max-w-sm text-sm leading-relaxed text-slate-300">
                Atleti, certificati medici, quote e programma settimanale.
                Una stagione per volta, senza mescolare gli anni.
              </p>
            </div>

            <div
              aria-hidden
              className="mt-10 rounded-xl border border-white/10 bg-white/[0.04] p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="eg-eyebrow text-slate-400">
                  Programma settimanale
                </span>
                <span className="eg-tabular rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-xs font-semibold text-amber-300">
                  2026/2027
                </span>
              </div>
              <div className="grid grid-cols-6 gap-1">
                {Array.from({ length: 24 }).map((_, index) => (
                  <span
                    key={index}
                    className={
                      [4, 9, 10, 15, 20].includes(index)
                        ? "h-5 rounded bg-blue-500/80"
                        : "h-5 rounded bg-white/[0.06]"
                    }
                  />
                ))}
              </div>
            </div>
          </aside>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="space-y-3 pb-3">
              <EasyGameWordmark className="lg:hidden" />
              <CardTitle className="text-2xl text-slate-900">Accedi</CardTitle>
              <p className="text-sm text-slate-500">
                Entra nella gestione della tua societa sportiva.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {providerButtons}

              <div className="relative text-center text-xs uppercase tracking-[0.24em] text-slate-400">
                <span className="bg-white px-3">oppure</span>
                <div className="absolute left-0 top-1/2 -z-10 h-px w-full -translate-y-1/2 bg-slate-200" />
              </div>

              {pendingVerification ? (
                <div className="space-y-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-slate-900">
                      Verifica account
                    </h3>
                    <p className="text-sm text-slate-600">
                      Completa i passaggi richiesti per attivare l’accesso.
                    </p>
                  </div>

                  {pendingVerification.emailRequired && (
                    <div className="space-y-3 rounded-xl border border-white bg-white p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        <Mail className="h-4 w-4 text-blue-600" />
                        Verifica email
                      </div>
                      <p className="text-sm text-slate-500">
                        {capabilities.emailProviderConfigured
                          ? `Abbiamo inviato un codice a ${pendingVerification.email}.`
                          : "Il tuo account è stato creato, ma l’invio del codice non è ancora disponibile. Riprova il login quando il servizio email sarà configurato."}
                      </p>
                      <Input
                        value={emailCode}
                        onChange={(event) => setEmailCode(event.target.value)}
                        placeholder="Inserisci il codice email"
                      />
                      {pendingVerification.emailPreviewCode && (
                        <p className="text-xs text-amber-700">
                          Codice test email:{" "}
                          {pendingVerification.emailPreviewCode}
                        </p>
                      )}
                      {!capabilities.emailProviderConfigured &&
                        !capabilities.testCodesEnabled && (
                          <p className="text-xs text-red-600">
                            Servizio email non configurato. Contatta
                            l’assistenza.
                          </p>
                        )}
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          onClick={submitEmailVerification}
                          disabled={
                            verificationLoading ||
                            !capabilities.emailProviderConfigured
                          }
                        >
                          {verificationLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <ShieldCheck className="mr-2 h-4 w-4" />
                          )}
                          Conferma email
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => resendVerification("email")}
                          disabled={!capabilities.emailProviderConfigured}
                        >
                          Reinvia codice
                        </Button>
                      </div>
                    </div>
                  )}

                  {pendingVerification.phoneRequired && (
                    <div className="space-y-3 rounded-xl border border-white bg-white p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        <Smartphone className="h-4 w-4 text-blue-600" />
                        Verifica telefono
                      </div>
                      <p className="text-sm text-slate-500">
                        Inserisci il codice inviato a `
                        {pendingVerification.phone}`.
                      </p>
                      <Input
                        value={phoneCode}
                        onChange={(event) => setPhoneCode(event.target.value)}
                        placeholder="Inserisci il codice SMS"
                      />
                      {pendingVerification.phonePreviewCode && (
                        <p className="text-xs text-amber-700">
                          Codice test SMS:{" "}
                          {pendingVerification.phonePreviewCode}
                        </p>
                      )}
                      {!capabilities.phoneProviderConfigured &&
                        capabilities.testCodesEnabled && (
                          <p className="text-xs text-slate-500">
                            Nessun provider SMS configurato: in testing il
                            codice viene mostrato qui.
                          </p>
                        )}
                      {!capabilities.phoneProviderConfigured &&
                        !capabilities.testCodesEnabled && (
                          <p className="text-xs text-red-600">
                            Servizio SMS non configurato. Contatta l’assistenza.
                          </p>
                        )}
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          onClick={submitPhoneVerification}
                          disabled={verificationLoading}
                        >
                          {verificationLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <ShieldCheck className="mr-2 h-4 w-4" />
                          )}
                          Conferma telefono
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => resendVerification("phone")}
                        >
                          Reinvia SMS
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Tabs
                  value={mode}
                  onValueChange={(value) => setMode(value as AuthMode)}
                  className="space-y-5"
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="login">Login</TabsTrigger>
                    <TabsTrigger value="register">Registrazione</TabsTrigger>
                  </TabsList>

                  <TabsContent value="login" className="space-y-4">
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="login-email">Email</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                          <Input
                            id="login-email"
                            type="email"
                            className="pl-10"
                            value={loginEmail}
                            onChange={(event) =>
                              setLoginEmail(event.target.value)
                            }
                            placeholder="nome@esempio.com"
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="login-password">Password</Label>
                        <div className="relative">
                          <LockKeyhole className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                          <Input
                            id="login-password"
                            type="password"
                            className="pl-10"
                            value={loginPassword}
                            onChange={(event) =>
                              setLoginPassword(event.target.value)
                            }
                            placeholder="Password"
                            required
                          />
                        </div>
                        <div className="flex justify-end">
                          <Link
                            href="/auth/forgot-password"
                            className="text-sm font-medium text-blue-600 hover:underline"
                          >
                            Password dimenticata?
                          </Link>
                        </div>
                      </div>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={loginLoading}
                      >
                        {loginLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowRight className="mr-2 h-4 w-4" />
                        )}
                        Entra nell&apos;app
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="register" className="space-y-4">
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Button
                          type="button"
                          variant={
                            registerRole === "user" ? "default" : "outline"
                          }
                          className="justify-start"
                          onClick={() => setRegisterRole("user")}
                        >
                          <UserRound className="mr-2 h-4 w-4" />
                          Utente
                        </Button>
                        <Button
                          type="button"
                          variant={
                            registerRole === "club_creator"
                              ? "default"
                              : "outline"
                          }
                          className="justify-start"
                          onClick={() => setRegisterRole("club_creator")}
                        >
                          <Building2 className="mr-2 h-4 w-4" />
                          Club
                        </Button>
                      </div>

                      {registerRole === "club_creator" && (
                        <div className="space-y-2">
                          <Label htmlFor="organizationName">Nome club</Label>
                          <div className="relative">
                            <Building2 className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                            <Input
                              id="organizationName"
                              className="pl-10"
                              value={registerData.organizationName}
                              onChange={(event) =>
                                handleRegisterChange(
                                  "organizationName",
                                  event.target.value,
                                )
                              }
                              placeholder="Es. EasyGame FC"
                              required
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="firstName">Nome</Label>
                          <Input
                            id="firstName"
                            value={registerData.firstName}
                            onChange={(event) =>
                              handleRegisterChange(
                                "firstName",
                                event.target.value,
                              )
                            }
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lastName">Cognome</Label>
                          <Input
                            id="lastName"
                            value={registerData.lastName}
                            onChange={(event) =>
                              handleRegisterChange(
                                "lastName",
                                event.target.value,
                              )
                            }
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="register-email">Email</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                          <Input
                            id="register-email"
                            type="email"
                            className="pl-10"
                            value={registerData.email}
                            onChange={(event) =>
                              handleRegisterChange("email", event.target.value)
                            }
                            required
                          />
                        </div>
                      </div>

                      {capabilities.phoneVerification && (
                        <div className="space-y-2">
                          <Label htmlFor="phone">Cellulare</Label>
                          <div className="relative">
                            <Smartphone className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                            <Input
                              id="phone"
                              type="tel"
                              className="pl-10"
                              value={registerData.phone}
                              onChange={(event) =>
                                handleRegisterChange(
                                  "phone",
                                  event.target.value,
                                )
                              }
                              placeholder="+39 3xx xxx xxxx"
                              required
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="register-password">Password</Label>
                          <Input
                            id="register-password"
                            type="password"
                            minLength={12}
                            value={registerData.password}
                            onChange={(event) =>
                              handleRegisterChange(
                                "password",
                                event.target.value,
                              )
                            }
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="confirmPassword">
                            Conferma password
                          </Label>
                          <Input
                            id="confirmPassword"
                            type="password"
                            minLength={12}
                            value={registerData.confirmPassword}
                            onChange={(event) =>
                              handleRegisterChange(
                                "confirmPassword",
                                event.target.value,
                              )
                            }
                            required
                          />
                        </div>
                      </div>

                      <Button
                        type="submit"
                        className="w-full"
                        disabled={registerLoading}
                      >
                        {registerLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : registerRole === "club_creator" ? (
                          <Building2 className="mr-2 h-4 w-4" />
                        ) : (
                          <UserRound className="mr-2 h-4 w-4" />
                        )}
                        Crea account
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              )}

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
