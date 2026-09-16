"use client";

import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Button as WebButton } from "@/components/web/primitives/Button";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OutsideShell, OutsideStatus } from "@/components/web/shell/OutsideShell";
import { FormRenderer } from "./form-renderer";
import { normalizeFormField, type FormField } from "@/lib/forms/model";
import { buildEnrollmentReceiptPath } from "@/lib/forms/enrollment-receipt";
import {
  clearFormDraft,
  formDraftKey,
  readFormDraft,
  saveFormDraft,
  type FormDraft,
} from "@/lib/forms/draft-storage";

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
 *
 * **Salva e riprendi** (W6-48). Premere F5 a meta compilazione perdeva tutto,
 * e su un telefono a meta iscrizione non si ricomincia: si abbandona. La
 * bozza vive nel **browser di chi compila** — regole, limiti e scadenza in
 * `src/lib/forms/draft-storage.ts` — e non viene mai ripristinata di
 * nascosto: chi torna vede un avviso e sceglie se riprendere o ricominciare.
 * Un modulo che si presenta pieno senza dire perche sembra gia inviato.
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
  /*
    La bozza ritrovata, finche chi compila non ha deciso cosa farne. Non entra
    nei valori da sola: vedi il commento in testa al file.
  */
  const [foundDraft, setFoundDraft] = useState<FormDraft | null>(null);
  /*
    **Si salva solo dopo che qualcuno ha scritto qualcosa.**

    Senza questa guardia il primo salvataggio partirebbe al montaggio con il
    modulo ancora vuoto e **cancellerebbe** la bozza appena ritrovata, prima
    ancora che chi legge l'avviso possa dire «riprendi». Sul rinnovo, dove il
    server precompila, salverebbe per giunta una bozza che nessuno ha scritto.
  */
  const [touched, setTouched] = useState(false);

  const draftKey = formDraftKey(publicSlug);

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

  /*
    Si cerca una bozza **una volta**, al montaggio: rileggerla a ogni render
    riproporrebbe l'avviso a chi lo ha appena scartato.
  */
  useEffect(() => {
    setFoundDraft(readFormDraft(draftKey));
  }, [draftKey]);

  /*
    **Si salva a ogni modifica**, non a intervalli: chi chiude la scheda non
    avvisa, e una bozza salvata «fra dieci secondi» e una bozza che non c'e.
    La scrittura e locale e su un oggetto piccolo — non c'e niente da
    ammortizzare, e un `debounce` sarebbe la finestra in cui si perde tutto.
  */
  useEffect(() => {
    if (!payload || success || !touched) return;
    saveFormDraft(draftKey, payload.form.fields, {
      answers: values,
      respondentName,
      respondentEmail,
    });
  }, [
    draftKey,
    payload,
    success,
    touched,
    values,
    respondentName,
    respondentEmail,
  ]);

  const resumeDraft = () => {
    if (!foundDraft) return;
    setValues((current) => ({ ...current, ...foundDraft.answers }));
    setRespondentName(foundDraft.respondentName);
    setRespondentEmail(foundDraft.respondentEmail);
    setFoundDraft(null);
  };

  const discardDraft = () => {
    clearFormDraft(draftKey);
    setFoundDraft(null);
  };

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

      /*
        **La bozza si cancella all'invio riuscito**, e solo li: un invio
        rifiutato per un campo sbagliato deve poter essere corretto e
        rimandato, e cancellare la bozza a quel punto sarebbe il modo peggiore
        di dire «controlla i campi segnalati».
      */
      clearFormDraft(draftKey);
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
      <OutsideShell width="form">
        <OutsideStatus icon={<Send />} title="Modulo" description="Un momento: carico il modulo." busy busyLabel="Carico il modulo…" />
      </OutsideShell>
    );
  }

  if (!payload) {
    return (
      <OutsideShell width="form">
        <OutsideStatus
          icon={<Send />}
          tone="amber"
          title="Modulo non disponibile"
          description={failure || "Il link non e piu valido. Chiedi alla societa un link aggiornato."}
        />
      </OutsideShell>
    );
  }

  if (success) {
    return (
      <OutsideShell width="form">
        <OutsideStatus icon={<CheckCircle2 />} tone="green" title="Inviato" description={success} />
        <div className="text-center">
          {receiptPath ? (
            <div className="mt-4 rounded-egw-control border border-egw-hairline bg-egw-page-100 p-4 text-left">
              <p className="text-sm font-semibold text-egw-ink">
                Segui la tua domanda da qui
              </p>
              <p className="mt-1 text-xs text-egw-ink-72">
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
                className="mt-3 block break-all rounded-egw-control bg-white px-3 py-2 text-sm font-medium text-egw-blue-800 underline decoration-sky-300 underline-offset-2"
              >
                {receiptPath}
              </a>
            </div>
          ) : null}

          {payload.club.contactEmail ? (
            <p className="mt-4 text-xs text-egw-ink-62">
              Per modifiche scrivi a {payload.club.contactEmail}.
            </p>
          ) : null}
        </div>
      </OutsideShell>
    );
  }

  return (
    <OutsideShell width="wide" bare>
      {/* Una colonna sola a ogni larghezza: e un modulo, non un cruscotto. */}
      <div className="w-full">
        <header className="rounded-t-egw-panel border border-b-0 border-white/60 bg-white p-5 shadow-egw-plane-2">
          <div className="flex items-center gap-3">
            {payload.club.logoUrl ? (
              <Image
                src={payload.club.logoUrl}
                alt=""
                width={44}
                height={44}
                unoptimized
                className="h-11 w-11 rounded-egw-control object-contain"
              />
            ) : null}
            <p className="font-brand text-sm font-semibold text-egw-ink-72">
              {payload.club.name}
            </p>
          </div>

          <h1 className="mt-4 font-brand text-xl font-semibold text-egw-ink sm:text-2xl">
            {payload.form.title}
          </h1>
          {payload.form.description ? (
            <p className="mt-2 whitespace-pre-line text-sm text-egw-ink-72">
              {payload.form.description}
            </p>
          ) : null}
        </header>

        <form
          onSubmit={submit}
          className="space-y-6 rounded-b-egw-panel border border-t-0 border-white/60 bg-white p-5 shadow-egw-plane-2"
        >
          {/*
            **Si propone, non si ripristina.** Chi torna deve sapere che quello
            che vede lo ha scritto lui prima, e deve poter ricominciare: un
            modulo che si presenta pieno senza dire perche sembra gia inviato.
            I due limiti si dicono qui, non in una nota a fondo pagina.
          */}
          {foundDraft ? (
            <div className="space-y-3 rounded-egw-control border border-egw-tint-blue-bd bg-egw-tint-blue p-4">
              <p className="text-sm font-semibold text-egw-blue-800">
                Abbiamo ritrovato quello che avevi iniziato a compilare
              </p>
              <p className="text-sm text-egw-blue-800">
                E rimasto su questo telefono e non e stato inviato. Allegati e
                consensi vanno rifatti.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  className="min-h-[44px] w-full sm:w-auto"
                  onClick={resumeDraft}
                >
                  Riprendi
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px] w-full bg-white sm:w-auto"
                  onClick={discardDraft}
                >
                  Ricomincia
                </Button>
              </div>
            </div>
          ) : null}

          {payload.form.collectRespondentEmail ? (
            <div className="space-y-4 rounded-egw-control border border-egw-hairline bg-egw-page-100 p-4">
              <div className="space-y-2">
                <Label htmlFor="respondent-name">Chi sta compilando</Label>
                <Input
                  id="respondent-name"
                  className="min-h-[44px] bg-white"
                  value={respondentName}
                  onChange={(event) => {
                    setTouched(true);
                    setRespondentName(event.target.value);
                  }}
                  placeholder="Nome e cognome"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="respondent-email">
                  Email <span className="text-egw-red">*</span>
                </Label>
                <Input
                  id="respondent-email"
                  type="email"
                  className="min-h-[44px] bg-white"
                  value={respondentEmail}
                  onChange={(event) => {
                    setTouched(true);
                    setRespondentEmail(event.target.value);
                  }}
                  placeholder="per essere ricontattati"
                />
                {errors.respondentEmail ? (
                  <p role="alert" className="text-sm font-medium text-egw-red">
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
              setTouched(true);
              setValues((current) => ({ ...current, [fieldId]: value }));
              setErrors((current) => ({ ...current, [fieldId]: "" }));
            }}
            onFileChange={(fieldId, file) => {
              setFiles((current) => ({ ...current, [fieldId]: file }));
              setErrors((current) => ({ ...current, [fieldId]: "" }));
            }}
          />

          {failure ? <AlertBlock severity="danger" role="alert" title={failure} /> : null}

          <WebButton type="submit" variant="primary" loading={sending} icon={<Send />} className="min-h-[44px] w-full">
            Invia
          </WebButton>
        </form>

        <p className="py-4 text-center text-[11.5px] text-white/70">Modulo gestito con EasyGame</p>
      </div>
    </OutsideShell>
  );
}
