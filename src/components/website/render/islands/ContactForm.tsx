"use client";

import { useRef, useState } from "react";
import { sendWebsiteInquiry } from "@/lib/website/public-client";

/**
 * Il modulo contatti del sito. Scrive nella casella del sito (nel
 * gestionale) passando da `/api/public/website/inquiries`, sullo stesso
 * dominio del club: e il server a sapere di quale club e il sito, non questo
 * componente. Il campo `website` e un'esca per i robot: una persona non lo
 * vede e non lo compila.
 */
export function ContactForm({
  topics,
  askPhone,
  privacyText,
  successMessage,
  buttonLabel,
  sourcePath,
  disabled,
}: {
  topics: string[];
  askPhone: boolean;
  privacyText: string;
  successMessage: string;
  buttonLabel: string;
  sourcePath: string;
  disabled?: boolean;
}) {
  const startedAt = useRef(Date.now());
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    const form = new FormData(event.currentTarget);
    setState("sending");
    setError("");
    const result = await sendWebsiteInquiry({
      name: form.get("name"),
      email: form.get("email"),
      phone: form.get("phone"),
      topic: form.get("topic"),
      message: form.get("message"),
      consent: form.get("consent") === "on",
      consentText: privacyText,
      website: form.get("website"),
      startedAt: startedAt.current,
      sourcePath,
    });
    if (result.ok) {
      setState("sent");
    } else {
      setState("error");
      setError(result.message);
    }
  };

  if (state === "sent") {
    return (
      <div role="status" className="rounded-ws bg-ws-muted p-6 text-center">
        <p className="font-semibold">{successMessage}</p>
      </div>
    );
  }

  const field = "mt-1 w-full rounded-ws border border-ws-border bg-ws-bg px-3 py-2.5 text-ws-fg";
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate={false}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium">
          Nome e cognome
          <input name="name" required minLength={2} maxLength={120} autoComplete="name" className={field} />
        </label>
        <label className="block text-sm font-medium">
          Email
          <input name="email" type="email" required maxLength={200} autoComplete="email" className={field} />
        </label>
      </div>
      {askPhone || topics.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {askPhone ? (
            <label className="block text-sm font-medium">
              Telefono (facoltativo)
              <input name="phone" type="tel" maxLength={40} autoComplete="tel" className={field} />
            </label>
          ) : null}
          {topics.length ? (
            <label className="block text-sm font-medium">
              Argomento
              <select name="topic" className={field} defaultValue={topics[0]}>
                {topics.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
      <label className="block text-sm font-medium">
        Messaggio
        <textarea name="message" required minLength={5} maxLength={4000} rows={5} className={field} />
      </label>
      <div aria-hidden="true" className="absolute left-[-10000px] h-px w-px overflow-hidden">
        <label>
          Lascia vuoto questo campo
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input name="consent" type="checkbox" required className="mt-1 h-4 w-4" />
        <span>{privacyText}</span>
      </label>
      {state === "error" ? (
        <p role="alert" className="text-sm text-ws-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" className="ws-btn ws-btn-primary" disabled={state === "sending" || disabled}>
        {state === "sending" ? "Invio in corso…" : buttonLabel}
      </button>
      {disabled ? <p className="text-xs text-ws-muted-fg">Anteprima: l&apos;invio e disattivato.</p> : null}
    </form>
  );
}
