"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/api/client";
import { PASSWORD_POLICY, validatePassword } from "@/lib/auth/password-policy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

type Status = "idle" | "loading" | "done" | "error";

const Shell = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <div className="mt-6">{children}</div>
      <p className="mt-6 text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-blue-600 hover:underline">
          Torna all&apos;accesso
        </Link>
      </p>
    </div>
  </div>
);

const Feedback = ({ tone, children }: { tone: "ok" | "ko"; children: React.ReactNode }) => (
  <p
    role="status"
    className={
      tone === "ok"
        ? "rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        : "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
    }
  >
    {children}
  </p>
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
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nome@esempio.it"
            />
          </div>

          {status === "error" && <Feedback tone="ko">{message}</Feedback>}

          <Button type="submit" className="w-full" disabled={status === "loading"}>
            {status === "loading" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
          <Link href="/auth/forgot-password" className="font-medium underline">
            password dimenticata
          </Link>
          .
        </Feedback>
      </Shell>
    );
  }

  return (
    <Shell
      title="Scegli una nuova password"
      description={`Almeno ${PASSWORD_POLICY.minLength} caratteri. Il link è valido una sola volta.`}
    >
      {status === "done" ? (
        <Feedback tone="ok">{message}</Feedback>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nuova password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Conferma password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>

          {password && !policy.valid && (
            <ul className="space-y-1 text-xs text-slate-500">
              {policy.errors.map((requisito) => (
                <li key={requisito}>• {requisito}</li>
              ))}
            </ul>
          )}

          {status === "error" && <Feedback tone="ko">{message}</Feedback>}

          <Button type="submit" className="w-full" disabled={status === "loading"}>
            {status === "loading" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Imposta la nuova password
          </Button>
        </form>
      )}
    </Shell>
  );
}
