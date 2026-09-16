"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api/client";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast-notification";
import { Button } from "@/components/web/primitives/Button";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { IconChip } from "@/components/web/primitives/StatusPill";
import { Field, FieldSizeProvider, TextInput } from "@/components/web/forms/Field";
import { AlertBlock } from "@/components/web/page/Alerts";
import { OutsideHeading, OutsideShell } from "@/components/web/shell/OutsideShell";
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

type AuthMode = "login" | "register";

type AuthProvider = {
  id: string;
  label: string;
};

type AuthCapabilities = {
  providers: AuthProvider[];
  emailVerification: boolean;
  phoneVerification: boolean;
  /** Se la verifica del numero blocca l'accesso su questa installazione. */
  phoneVerificationRequired: boolean;
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
  phoneVerificationRequired: false,
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
          phoneVerificationRequired: Boolean(
            response.data.phoneVerificationRequired,
          ),
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

  /*
    Quando nessun provider OAuth e configurato la pagina non dice niente. Un
    riquadro che spiega come popolare le variabili d'ambiente e un'istruzione
    per chi installa il prodotto, non per la segreteria che sta accedendo. Se
    non c'e niente da scegliere sparisce anche il separatore «oppure», che
    senza alternative separerebbe una cosa sola.
  */
  const hasProviderChoice =
    loadingProviders || capabilities.providers.length > 0;

  const providerButtons = hasProviderChoice ? (
    <div className="grid gap-2">
      {loadingProviders ? (
        <div className="flex items-center justify-center py-3 text-[12.5px] text-egw-ink-62" role="status">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Caricamento provider…
        </div>
      ) : (
        capabilities.providers.map((provider) => (
          <Button
            key={provider.id}
            type="button"
            variant="secondary"
            className="w-full justify-start"
            icon={provider.id === "google" ? <Chrome /> : <Briefcase />}
            onClick={() => {
              window.location.href = `/api/v1/auth/oauth/${provider.id}/start`;
            }}
          >
            Continua con {provider.label}
          </Button>
        ))
      )}
    </div>
  ) : null;

  /*
    **Un codice, un campo, due azioni.** La verifica di un recapito e la stessa
    per email e telefono: cambia il canale, non la forma. Il pulsante che
    conferma e il primario del pannello — l'unico gradiente — perche in questo
    stato e l'unica cosa da fare.
  */
  const verificationStep = ({
    channel,
    icon,
    title,
    hint,
    code,
    onCode,
    onSubmit,
    onResend,
    submitLabel,
    resendLabel,
    previewCode,
    previewLabel,
    unavailable,
    note,
    submitDisabled,
    resendDisabled,
  }: {
    channel: "email" | "phone";
    icon: React.ReactNode;
    title: string;
    hint: React.ReactNode;
    code: string;
    onCode: (value: string) => void;
    onSubmit: () => void;
    onResend: () => void;
    submitLabel: string;
    resendLabel: string;
    previewCode?: string | null;
    previewLabel: string;
    unavailable?: React.ReactNode;
    note?: React.ReactNode;
    submitDisabled?: boolean;
    resendDisabled?: boolean;
  }) => (
    <InsetBlock className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <IconChip tone="blue" size={34}>
          {icon}
        </IconChip>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-egw-ink">{title}</p>
          <p className="mt-0.5 text-[12.5px] leading-[1.5] text-egw-ink-62">{hint}</p>
        </div>
      </div>
      <Field
        label={channel === "email" ? "Codice ricevuto via email" : "Codice ricevuto via SMS"}
        htmlFor={`verify-${channel}`}
        helper={
          previewCode ? (
            <span className="text-egw-amber-ink">
              {previewLabel} <span className="egw-num font-bold">{previewCode}</span>
            </span>
          ) : (
            note
          )
        }
        error={unavailable}
      >
        <TextInput
          id={`verify-${channel}`}
          value={code}
          onChange={(event) => onCode(event.target.value)}
          placeholder={channel === "email" ? "Inserisci il codice email" : "Inserisci il codice SMS"}
          inputMode="numeric"
          autoComplete="one-time-code"
          className="egw-num tracking-[0.18em]"
        />
      </Field>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="primary" className="sm:flex-1" icon={<ShieldCheck />} loading={verificationLoading} disabled={submitDisabled} onClick={onSubmit}>
          {submitLabel}
        </Button>
        <Button type="button" variant="secondary" disabled={resendDisabled} onClick={onResend}>
          {resendLabel}
        </Button>
      </div>
    </InsetBlock>
  );

  return (
    /*
      Ambiente 3 — «fuori dal club» (EGDS v3.1.0, guideline 05 §5.1): cielo
      pieno senza orizzonte, filigrana del marchio al 5%, un solo pannello
      bianco centrato di 440px. Il guscio e `OutsideShell`, lo stesso di
      recupero password, verifica e conferma: una pagina di accesso e una
      di conferma sono la stessa EasyGame.
    */
    <OutsideShell width="form">
      <FieldSizeProvider size="sm">
        {/*
          Il titolo segue la scheda aperta: `/register` monta questo stesso
          guscio con la scheda «Registrazione» gia scelta, e intitolarlo
          «Accedi» diceva a chi arriva da un invito che ha sbagliato pagina.
        */}
        <OutsideHeading
          title={mode === "register" ? "Crea il tuo account" : "Accedi"}
          description={
            mode === "register"
              ? "Bastano nome, email e password: il club lo configuri dopo."
              : "Entra nella gestione della tua società sportiva."
          }
        />

        <div className="flex flex-col gap-5">
          {pendingVerification ? (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-[15px] font-bold text-egw-ink">Verifica account</h2>
                <p className="mt-0.5 text-[12.5px] leading-[1.5] text-egw-ink-62">Completa i passaggi richiesti per attivare l’accesso.</p>
              </div>

              {pendingVerification.emailRequired
                ? verificationStep({
                    channel: "email",
                    icon: <Mail />,
                    title: "Verifica email",
                    hint: capabilities.emailProviderConfigured
                      ? `Abbiamo inviato un codice a ${pendingVerification.email}.`
                      : "Il tuo account è stato creato, ma l’invio del codice non è ancora disponibile. Riprova il login quando il servizio email sarà configurato.",
                    code: emailCode,
                    onCode: setEmailCode,
                    onSubmit: submitEmailVerification,
                    onResend: () => resendVerification("email"),
                    submitLabel: "Conferma email",
                    resendLabel: "Reinvia codice",
                    previewCode: pendingVerification.emailPreviewCode,
                    previewLabel: "Codice test email:",
                    unavailable:
                      !capabilities.emailProviderConfigured && !capabilities.testCodesEnabled
                        ? "Servizio email non configurato. Contatta l’assistenza."
                        : undefined,
                    submitDisabled: !capabilities.emailProviderConfigured,
                    resendDisabled: !capabilities.emailProviderConfigured,
                  })
                : null}

              {pendingVerification.phoneRequired
                ? verificationStep({
                    channel: "phone",
                    icon: <Smartphone />,
                    title: "Verifica telefono",
                    hint: `Inserisci il codice inviato a ${pendingVerification.phone}.`,
                    code: phoneCode,
                    onCode: setPhoneCode,
                    onSubmit: submitPhoneVerification,
                    onResend: () => resendVerification("phone"),
                    submitLabel: "Conferma telefono",
                    resendLabel: "Reinvia SMS",
                    previewCode: pendingVerification.phonePreviewCode,
                    previewLabel: "Codice test SMS:",
                    note:
                      !capabilities.phoneProviderConfigured && capabilities.testCodesEnabled
                        ? "Nessun provider SMS configurato: in testing il codice viene mostrato qui."
                        : undefined,
                    unavailable:
                      !capabilities.phoneProviderConfigured && !capabilities.testCodesEnabled
                        ? "Servizio SMS non configurato. Contatta l’assistenza."
                        : undefined,
                  })
                : null}
            </div>
          ) : (
            <>
              {/*
                Accesso e registrazione sono due schede dello stesso pannello,
                come prima: cambia il controllo — quello segmentato del sistema
                — non la strada.
              */}
              <SegmentedControl
                aria-label="Accedi o registrati"
                value={mode}
                onChange={(value) => setMode(value)}
                options={[
                  { value: "login", label: "Accedi" },
                  { value: "register", label: "Registrazione" },
                ]}
                className="w-full [&>button]:flex-1 [&>button]:justify-center"
              />

              {providerButtons}

              {hasProviderChoice ? (
                <div className="relative text-center text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">
                  <span className="relative z-10 bg-white px-3">oppure</span>
                  <div aria-hidden className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-egw-hairline" />
                </div>
              ) : null}

              {mode === "login" ? (
                <form onSubmit={handleLogin} className="flex flex-col gap-4" aria-label="Accedi">
                  <Field label="Email" htmlFor="login-email" required>
                    <TextInput
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      leading={<Mail />}
                      value={loginEmail}
                      onChange={(event) => setLoginEmail(event.target.value)}
                      placeholder="nome@esempio.com"
                      required
                    />
                  </Field>
                  <Field label="Password" htmlFor="login-password" required>
                    <TextInput
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      leading={<LockKeyhole />}
                      value={loginPassword}
                      onChange={(event) => setLoginPassword(event.target.value)}
                      placeholder="Password"
                      required
                    />
                  </Field>
                  <div className="-mt-1 flex justify-end">
                    <Link
                      href="/auth/forgot-password"
                      className="rounded-egw-micro text-[12.5px] font-semibold text-egw-blue-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:shadow-egw-focus"
                    >
                      Password dimenticata?
                    </Link>
                  </div>
                  <Button type="submit" variant="primary" className="w-full" loading={loginLoading} trailingIcon={<ArrowRight />}>
                    Entra nell&apos;app
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="flex flex-col gap-4" aria-label="Crea il tuo account">
                  {/*
                    Utente o club: la stessa scelta di prima, come controllo
                    segmentato invece di due pulsanti che si scambiavano il
                    riempimento.
                  */}
                  <Field label="Ti registri come" htmlFor="register-role">
                    <SegmentedControl
                      aria-label="Ti registri come"
                      value={registerRole}
                      onChange={(value) => setRegisterRole(value)}
                      options={[
                        {
                          value: "user",
                          label: (
                            <span className="inline-flex items-center gap-1.5">
                              <UserRound className="h-3.5 w-3.5" aria-hidden />
                              Utente
                            </span>
                          ),
                        },
                        {
                          value: "club_creator",
                          label: (
                            <span className="inline-flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5" aria-hidden />
                              Club
                            </span>
                          ),
                        },
                      ]}
                      className="w-full [&>button]:flex-1 [&>button]:justify-center"
                    />
                  </Field>

                  {registerRole === "club_creator" && (
                    <Field label="Nome club" htmlFor="organizationName" required>
                      <TextInput
                        id="organizationName"
                        leading={<Building2 />}
                        value={registerData.organizationName}
                        onChange={(event) => handleRegisterChange("organizationName", event.target.value)}
                        placeholder="Es. EasyGame FC"
                        autoComplete="organization"
                        required
                      />
                    </Field>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Nome" htmlFor="firstName" required>
                      <TextInput
                        id="firstName"
                        autoComplete="given-name"
                        value={registerData.firstName}
                        onChange={(event) => handleRegisterChange("firstName", event.target.value)}
                        required
                      />
                    </Field>
                    <Field label="Cognome" htmlFor="lastName" required>
                      <TextInput
                        id="lastName"
                        autoComplete="family-name"
                        value={registerData.lastName}
                        onChange={(event) => handleRegisterChange("lastName", event.target.value)}
                        required
                      />
                    </Field>
                  </div>

                  <Field label="Email" htmlFor="register-email" required>
                    <TextInput
                      id="register-email"
                      type="email"
                      autoComplete="email"
                      leading={<Mail />}
                      value={registerData.email}
                      onChange={(event) => handleRegisterChange("email", event.target.value)}
                      required
                    />
                  </Field>

                  {/*
                    **Il campo c'e sempre (ADR-0132).** Prima era dentro un
                    `capabilities.phoneVerification &&`, cioe compariva solo
                    dove un fornitore SMS era configurato: su ogni
                    installazione reale il numero non veniva chiesto, la
                    colonna restava vuota e tutto il flusso di verifica —
                    rotte, challenge, contatori — era codice che nessuno
                    poteva raggiungere. Il numero e obbligatorio per regola
                    di prodotto, quindi si chiede sempre; cio che dipende
                    dall'installazione e solo se la verifica **blocchi**
                    l'accesso, e lo dice la nota qui sotto.
                  */}
                  <Field
                    label="Cellulare"
                    htmlFor="phone"
                    required
                    helper={
                      capabilities.phoneVerificationRequired
                        ? "Ti invieremo un codice via SMS per verificarlo: senza verifica l'account non è attivo."
                        : "Serve per contattarti. Su questa installazione la verifica via SMS non è attiva."
                    }
                  >
                    <TextInput
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      leading={<Smartphone />}
                      value={registerData.phone}
                      onChange={(event) => handleRegisterChange("phone", event.target.value)}
                      placeholder="+39 3xx xxx xxxx"
                      required
                    />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Password" htmlFor="register-password" required helper="Almeno 12 caratteri.">
                      <TextInput
                        id="register-password"
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        value={registerData.password}
                        onChange={(event) => handleRegisterChange("password", event.target.value)}
                        required
                      />
                    </Field>
                    <Field label="Conferma password" htmlFor="confirmPassword" required>
                      <TextInput
                        id="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        value={registerData.confirmPassword}
                        onChange={(event) => handleRegisterChange("confirmPassword", event.target.value)}
                        required
                      />
                    </Field>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full"
                    loading={registerLoading}
                    icon={registerRole === "club_creator" ? <Building2 /> : <UserRound />}
                  >
                    Crea account
                  </Button>
                </form>
              )}
            </>
          )}

          {/*
            `role="alert"` perche l'errore compare dopo l'invio, lontano dal
            fuoco che e rimasto sul pulsante: senza, chi usa un lettore di
            schermo preme «Entra» e non sente niente.
          */}
          {error && (
            <AlertBlock severity="danger" role="alert" title={error} />
          )}
        </div>
      </FieldSizeProvider>
    </OutsideShell>
  );
}
