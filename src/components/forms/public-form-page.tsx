"use client";

import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EasyGameLogo } from "@/components/brand/easygame-logo";
import { FormRenderer } from "./form-renderer";
import { normalizeFormField, type FormField } from "@/lib/forms/model";
import { buildEnrollmentReceiptPath } from "@/lib/forms/enrollment-receipt";

/**
 * Il modulo pubblico.
 *
 * **Priorita al telefono.** Nove iscrizioni su dieci si compilano dal
 * telefono, con una mano sola, spesso in piedi: una colonna sola a qualunque
 * larghezza, comandi alti almeno 44 px, e il pulsante di invio in fondo al
 * flusso e non in una barra che copre l'ultimo campo.
 *
 * **Non e una pagina dell'applicazione.** Non monta la chrome del club, non
 * ha sidebar, non chiede una sessione. Chi la apre non e nessuno: vede il
 * modulo, il nome della societa e nient'altro dell'archivio.
 */

type PublicFormPayload = {
  form: {
    title: string;
    description: string;
    fields: FormField[];
    collectRespondentEmail: boolean;
  };
  club: {
    name: string;
    logoUrl: string;
    contactEmail: string;
  };
};

type PublicFormPageProps = {
  publicSlug: string;
};

export function PublicFormPage({ publicSlug }: PublicFormPageProps) {
  const [payload, setPayload] = useState<PublicFormPayload | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [respondentName, setRespondentName] = useState("");
  const [respondentEmail, setRespondentEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState("");
  const [success, setSuccess] = useState("");
  /*
    **Il riferimento della ricevuta esce una volta sola**, qui, nella risposta
    all'invio: in archivio ne resta l'impronta (ADR-0085) e nessuno puo
    ristamparlo. Percio va **consegnato adesso**, e non basta averlo ricevuto:
    va messo in una schermata da cui si possa aprire e copiare, o e come non
    averlo dato.
  */
  const [receiptPath, setReceiptPath] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/public/forms/${publicSlug}`);
      const body = await response.json().catch(() => null);

      if (!response.ok || body?.error) {
        setFailure(body?.error?.message || "Modulo non disponibile");
        setPayload(null);
      } else {
        setPayload({
          ...body.data,
          form: {
            ...body.data.form,
            fields: (body.data.form.fields || []).map((field: unknown) =>
              normalizeFormField(field),
            ),
          },
        });
        setFailure("");
      }
    } catch {
      setFailure("Non riesco a caricare il modulo. Controlla la connessione.");
    } finally {
      setLoading(false);
    }
  }, [publicSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!payload || sending) return;

    setSending(true);
    setErrors({});
    setFailure("");

    try {
      /*
        `multipart/form-data`: le risposte in una parte JSON, ogni file nella
        sua. Un certificato medico in base64 dentro il JSON costerebbe un
        terzo in piu e andrebbe tenuto in memoria per intero.
      */
      const body = new FormData();
      body.append(
        "payload",
        JSON.stringify({
          answers: values,
          respondentName,
          respondentEmail,
        }),
      );
      for (const [fieldId, file] of Object.entries(files)) {
        if (file) body.append(`file:${fieldId}`, file, file.name);
      }

      const response = await fetch(`/api/public/forms/${publicSlug}`, {
        method: "POST",
        body,
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || result?.error) {
        setErrors(result?.data?.errors || {});
        setFailure(result?.error?.message || "Invio non riuscito.");
        return;
      }

      setSuccess(result.data.successMessage);
      setReceiptPath(
        result.data.receiptReference
          ? buildEnrollmentReceiptPath(result.data.receiptReference)
          : "",
      );
    } catch {
      setFailure("Invio non riuscito. Controlla la connessione e riprova.");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-slate-600"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Carico il modulo…
        </p>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center">
          <h1 className="font-display text-lg font-semibold text-slate-900">
            Modulo non disponibile
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {failure ||
              "Il link non e piu valido. Chiedi alla societa un link aggiornato."}
          </p>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-lg border border-emerald-200 bg-white p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <h1 className="mt-3 font-display text-lg font-semibold text-slate-900">
            Inviato
          </h1>
          <p className="mt-2 text-sm text-slate-600">{success}</p>

          {receiptPath ? (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-left">
              <p className="text-sm font-semibold text-slate-900">
                Segui la tua domanda da qui
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Salva questo link: e l&#8217;unico modo per rileggere lo stato della
                domanda, e non puo essere ristampato.
              </p>
              {/*
                `break-all` e non `truncate`: un link accorciato con i puntini
                non si puo copiare a mano, e chi apre il modulo dal telefono di
                un altro deve poterselo trascrivere.
              */}
              <a
                href={receiptPath}
                className="mt-3 block break-all rounded-md bg-white px-3 py-2 text-sm font-medium text-sky-700 underline decoration-sky-300 underline-offset-2"
              >
                {receiptPath}
              </a>
            </div>
          ) : null}

          {payload.club.contactEmail ? (
            <p className="mt-4 text-xs text-slate-500">
              Per modifiche scrivi a {payload.club.contactEmail}.
            </p>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-slate-50 py-6">
      {/* Una colonna sola a ogni larghezza: e un modulo, non un cruscotto. */}
      <div className="mx-auto w-full max-w-2xl px-4">
        <header className="rounded-t-lg border border-b-0 border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3">
            {payload.club.logoUrl ? (
              <Image
                src={payload.club.logoUrl}
                alt=""
                width={44}
                height={44}
                unoptimized
                className="h-11 w-11 rounded-md object-contain"
              />
            ) : null}
            <p className="font-display text-sm font-semibold text-slate-700">
              {payload.club.name}
            </p>
          </div>

          <h1 className="mt-4 font-display text-xl font-semibold text-slate-900 sm:text-2xl">
            {payload.form.title}
          </h1>
          {payload.form.description ? (
            <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
              {payload.form.description}
            </p>
          ) : null}
        </header>

        <form
          onSubmit={submit}
          className="space-y-6 rounded-b-lg border border-slate-200 bg-white p-5"
        >
          {payload.form.collectRespondentEmail ? (
            <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="space-y-2">
                <Label htmlFor="respondent-name">Chi sta compilando</Label>
                <Input
                  id="respondent-name"
                  className="min-h-[44px] bg-white"
                  value={respondentName}
                  onChange={(event) => setRespondentName(event.target.value)}
                  placeholder="Nome e cognome"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="respondent-email">
                  Email <span className="text-red-600">*</span>
                </Label>
                <Input
                  id="respondent-email"
                  type="email"
                  className="min-h-[44px] bg-white"
                  value={respondentEmail}
                  onChange={(event) => setRespondentEmail(event.target.value)}
                  placeholder="per essere ricontattati"
                />
                {errors.respondentEmail ? (
                  <p role="alert" className="text-sm font-medium text-red-600">
                    {errors.respondentEmail}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <FormRenderer
            fields={payload.form.fields}
            values={values}
            files={files}
            errors={errors}
            onChange={(fieldId, value) => {
              setValues((current) => ({ ...current, [fieldId]: value }));
              setErrors((current) => ({ ...current, [fieldId]: "" }));
            }}
            onFileChange={(fieldId, file) => {
              setFiles((current) => ({ ...current, [fieldId]: file }));
              setErrors((current) => ({ ...current, [fieldId]: "" }));
            }}
          />

          {failure ? (
            <p
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {failure}
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={sending}
            className="min-h-[44px] w-full"
          >
            {sending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Invia
          </Button>
        </form>

        <footer className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500">
          <span>Modulo gestito con</span>
          <EasyGameLogo className="h-4 w-4" tone="dark" />
          <span className="font-display font-semibold">EasyGame</span>
        </footer>
      </div>
    </main>
  );
}
