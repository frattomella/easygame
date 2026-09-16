"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/api/client";
import { PASSWORD_POLICY, validatePassword } from "@/lib/auth/password-policy";
import { Button } from "@/components/web/primitives/Button";
import { Field, FieldSizeProvider, TextInput } from "@/components/web/forms/Field";
import { AlertBlock } from "@/components/web/page/Alerts";
import { OutsideHeading, OutsideShell } from "@/components/web/shell/OutsideShell";

type Status = "idle" | "loading" | "done" | "error";

/**
 * Le due schermate del recupero password, sullo stesso guscio dell'accesso
 * (ambiente 3, `OutsideShell`): stesso cielo, stesso pannello di 440px,
 * stesso ritorno all'accesso sotto il pannello. Le chiamate — `forgot`,
 * `reset` — e la regola della password sono quelle di prima.
 */
const Shell = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) => (
  <OutsideShell
    width="form"
    below={
      <Link href="/login" className="rounded-egw-micro focus-visible:outline-none focus-visible:shadow-egw-focus-dark">
        Torna all&apos;accesso
      </Link>
    }
  >
    <FieldSizeProvider size="sm">
      <OutsideHeading title={title} description={description} />
      {children}
    </FieldSizeProvider>
  </OutsideShell>
);

/**
 * Esito di un'operazione. Stessa forma in tutte le schermate di accesso:
 * un blocco di avviso del sistema, che dice cosa e successo.
 */
const Feedback = ({
  tone,
  children,
}: {
  tone: "ok" | "ko";
  children: React.ReactNode;
}) => (
  <AlertBlock severity={tone === "ok" ? "success" : "danger"} role={tone === "ok" ? "status" : "alert"} title={children} />
);

/** Richiesta del link di reset. */
export function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    const { data, error } = await apiRequest<{ message?: string }>(
      "/api/v1/auth/password/forgot",
      { method: "POST", body: { email } },
    );

    if (error) {
      setStatus("error");
      setMessage(error.message || "Richiesta non riuscita");
      return;
    }

    setStatus("done");
    setMessage(
      data?.message ||
        "Se l'indirizzo è associato a un account, ti abbiamo inviato le istruzioni.",
    );
  };

  return (
    <Shell
      title="Password dimenticata"
      description="Inserisci l'email del tuo account: ti inviamo un link per scegliere una nuova password."
    >
      {status === "done" ? (
        <Feedback tone="ok">{message}</Feedback>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Email" htmlFor="reset-email" required>
            <TextInput
              id="reset-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nome@esempio.it"
            />
          </Field>

          {status === "error" && <Feedback tone="ko">{message}</Feedback>}

          <Button type="submit" variant="primary" className="w-full" loading={status === "loading"}>
            Invia il link
          </Button>
        </form>
      )}
    </Shell>
  );
}

/** Scelta della nuova password, a partire dal link ricevuto via email. */
export function ResetPasswordScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams?.get("uid") || "";
  const token = searchParams?.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const policy = useMemo(() => validatePassword(password, ""), [password]);
  const linkIsPresent = Boolean(userId && token);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (password !== confirmation) {
      setStatus("error");
      setMessage("Le due password non coincidono");
      return;
    }

    if (!policy.valid) {
      setStatus("error");
      setMessage(policy.errors[0] || "Password non conforme");
      return;
    }

    setStatus("loading");
    setMessage("");

    const { data, error } = await apiRequest<{ message?: string }>(
      "/api/v1/auth/password/reset",
      { method: "POST", body: { userId, token, password } },
    );

    if (error) {
      setStatus("error");
      setMessage(error.message || "Reset non riuscito");
      return;
    }

    setStatus("done");
    setMessage(data?.message || "Password aggiornata.");
    setTimeout(() => router.replace("/login"), 2500);
  };

  if (!linkIsPresent) {
    return (
      <Shell
        title="Link non valido"
        description="Il link di reset è incompleto o è stato modificato."
      >
        <Feedback tone="ko">
          Richiedi un nuovo link dalla pagina{" "}
          <Link href="/auth/forgot-password" className="font-semibold underline">
            password dimenticata
          </Link>
          .
        </Feedback>
      </Shell>
    );
  }

  /*
    Passaggio di consegna verso l'app mobile (WP11 mobile,
    `easygamemobile/client/screens/ResetPasswordScreen.tsx`). Non e un
    Universal Link: senza un dominio associato reale (serve il Team ID
    Apple, non ancora disponibile — vedi WP12) l'unico modo onesto di
    aprire l'app da questa pagina e un link con lo schema personalizzato,
    che l'utente tocca lui stesso — mai un redirect automatico, che
    fallirebbe silenziosamente per chi l'app non ce l'ha. Il dominio
    identita (token, endpoint, regola della password) resta lo stesso:
    questo e solo un secondo modo di raggiungere la stessa pagina.
  */
  const mobileAppUrl = `easygame://reset-password?uid=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`;

  return (
    <Shell
      title="Scegli una nuova password"
      description={`Almeno ${PASSWORD_POLICY.minLength} caratteri. Il link è valido una sola volta.`}
    >
      {status !== "done" ? (
        <p className="mb-4 text-[12.5px] leading-[1.5] text-egw-ink-62">
          Hai l&apos;app EasyGame?{" "}
          <a href={mobileAppUrl} className="font-semibold text-egw-blue-700 underline-offset-4 hover:underline">
            Aprila qui
          </a>{" "}
          per completare piu comodamente.
        </p>
      ) : null}
      {status === "done" ? (
        <Feedback tone="ok">{message}</Feedback>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Nuova password" htmlFor="new-password" required>
            <TextInput
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          <Field label="Conferma password" htmlFor="confirm-password" required>
            <TextInput
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </Field>

          {password && !policy.valid && (
            <ul className="flex flex-col gap-1 text-[11.5px] font-medium text-egw-ink-62" aria-label="Requisiti della password">
              {policy.errors.map((requisito) => (
                <li key={requisito}>• {requisito}</li>
              ))}
            </ul>
          )}

          {status === "error" && <Feedback tone="ko">{message}</Feedback>}

          <Button type="submit" variant="primary" className="w-full" loading={status === "loading"}>
            Imposta la nuova password
          </Button>
        </form>
      )}
    </Shell>
  );
}
