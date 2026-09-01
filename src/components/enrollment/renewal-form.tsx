"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormRenderer } from "@/components/forms/form-renderer";
import { normalizeFormField } from "@/lib/forms/model";
import {
  clearFormDraft,
  formDraftKey,
  readFormDraft,
  saveFormDraft,
  type FormDraft,
} from "@/lib/forms/draft-storage";
import * as formsApi from "@/lib/api/forms";

/**
 * **Il rinnovo, dalla parte della famiglia.**
 *
 * Il dominio, la rotta e i test del rinnovo esistevano da una Wave e nessuna
 * schermata sapeva accenderli: `buildRenewalDraft` preparava un modulo che
 * nessuno apriva. E la stessa forma di difetto dell'RSVP e del checkout online
 * (CLAUDE.md §11.8) — non codice mancante, codice **irraggiungibile**.
 *
 * Tre regole che questo componente non deve perdere:
 *
 * - **non e un secondo motore.** Il modulo lo disegna `FormRenderer`, lo
 *   stesso del modulo pubblico e dell'anteprima del builder. Un terzo
 *   rendering sarebbe una terza occasione di mostrare alla famiglia qualcosa
 *   di diverso da cio che poi viene inviato;
 * - **la stagione la decide il server.** Non c'e nessun selettore: arriva
 *   nella bozza e si mostra soltanto, perche chi compila deve sapere per
 *   quale annata sta rinnovando;
 * - **cio che e gia in archivio si dichiara, non si nasconde.**
 *   `prefilledFieldIds` accende l'etichetta «Dato gia in archivio» su ogni
 *   campo che il club ha riempito da solo: un modulo che si presenta pieno
 *   senza dire perche sembra un modulo gia inviato.
 *
 * **Perche qui non si consegna il riferimento della ricevuta.** Il modulo
 * pubblico lo mostra perche chi lo compila non ha un account: quel
 * riferimento e l'unico modo che ha di rileggere lo stato della domanda, e non
 * si puo ristampare. Qui c'e una sessione, e la pratica compare nell'elenco
 * della pagina appena sopra. Mostrarlo lo trasformerebbe in una seconda copia
 * di una credenziale al portatore, consegnata a chi non ne ha bisogno.
 *
 * **Una colonna a ogni larghezza**, comandi alti almeno 44 px: e un modulo che
 * si compila dal telefono, come quello pubblico.
 *
 * **Salva e riprendi** (W6-48), con la stessa forma del modulo pubblico e lo
 * stesso archivio locale — regole e limiti in
 * `src/lib/forms/draft-storage.ts`. La chiave porta anche l'atleta: due figli
 * sullo stesso modulo sono due pratiche diverse, e ripescare la bozza del
 * fratello sarebbe peggio di non averne nessuna.
 */

type RenewalFormProps = {
  athleteId: string;
  publicSlug: string;
  onClose: () => void;
  /** Chiamata a invio riuscito: l'elenco delle pratiche va riletto. */
  onSent: (message: string) => void;
};

/**
 * Lo slug dentro la scorciatoia `?modulo=…`.
 *
 * La strada normale e la **scelta fra i moduli pubblicati**, che la pagina
 * legge dal server. Questa resta per il link che una societa manda per posta o
 * in bacheca: e l'indirizzo pubblico del modulo (`/forms/<slug>`), e chi lo
 * gira lo copia per intero, spesso con una query di tracciamento in fondo. Si
 * accetta l'indirizzo completo **e** il solo codice — ritagliarlo a mano
 * sarebbe far fare a chi apre il link il lavoro del programma.
 */
export const readRenewalSlug = (value: unknown) => {
  const testo = String(value ?? "").trim();
  if (!testo) return "";

  const dopoForms = /\/forms\/([^/?#\s]+)/i.exec(testo);
  const candidato = dopoForms ? dopoForms[1] : testo;

  /* Uno slug e cio che il server genera: lettere, cifre e trattini. */
  return /^[a-z0-9-]+$/i.test(candidato) ? candidato : "";
};

export function RenewalForm({
  athleteId,
  publicSlug,
  onClose,
  onSent,
}: RenewalFormProps) {
  const [draft, setDraft] = useState<formsApi.RenewalDraft | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [respondentName, setRespondentName] = useState("");
  const [respondentEmail, setRespondentEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState("");
  const [foundDraft, setFoundDraft] = useState<FormDraft | null>(null);
  /*
    Si salva solo dopo che il genitore ha scritto qualcosa: qui il modulo
    arriva **gia precompilato** dal server, e salvarlo al montaggio
    scriverebbe una bozza che nessuno ha compilato — e cancellerebbe quella
    vera prima che l'avviso qui sotto possa essere letto.
  */
  const [touched, setTouched] = useState(false);

  const draftKey = formDraftKey(publicSlug, athleteId);

  const load = useCallback(async () => {
    setLoading(true);
    setFailure("");
    try {
      const bozza = await formsApi.fetchRenewalDraft(athleteId, publicSlug);
      setDraft({
        ...bozza,
        form: {
          ...bozza.form,
          /*
            Gli stessi campi normalizzati del modulo pubblico: la bozza arriva
            come JSON, e un campo senza le sue impostazioni si disegna diverso
            da come il genitore lo vedrebbe dal link.
          */
          fields: (bozza.form?.fields || []).map((field: unknown) =>
            normalizeFormField(field),
          ),
        },
      });
      setValues(bozza.answers || {});
    } catch (errore: any) {
      setDraft(null);
      setFailure(errore?.message || "Modulo di rinnovo non disponibile");
    } finally {
      setLoading(false);
    }
  }, [athleteId, publicSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setFoundDraft(readFormDraft(draftKey));
  }, [draftKey]);

  /*
    Si salva a ogni modifica, mai prima che la bozza del server sia arrivata:
    scrivere in archivio locale un modulo ancora vuoto cancellerebbe cio che
    c'era, che e l'unica cosa che questa funzione esiste per non fare.
  */
  useEffect(() => {
    if (!draft || !touched) return;
    saveFormDraft(draftKey, draft.form.fields, {
      answers: values,
      respondentName,
      respondentEmail,
    });
  }, [draftKey, draft, touched, values, respondentName, respondentEmail]);

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
    if (!draft || sending) return;

    setSending(true);
    setErrors({});
    setFailure("");

    try {
      const esito = await formsApi.submitRenewal({
        athleteId,
        publicSlug,
        answers: values,
        files,
        respondentName,
        respondentEmail,
      });

      if (!esito.receipt) {
        setErrors(esito.fieldErrors);
        setFailure(esito.message);
        return;
      }

      /* Solo l'invio riuscito cancella la bozza: vedi il modulo pubblico. */
      clearFormDraft(draftKey);
      onSent(esito.receipt.successMessage || "Rinnovo inviato");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-slate-600"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparo il modulo di rinnovo…
        </p>
      </div>
    );
  }

  if (!draft) {
    /*
      Tre stati, non due (10 — UI/UX): un errore raccontato come «niente da
      rinnovare» farebbe credere a una famiglia che il club non le chiede piu
      niente. Qui si dice cosa ha risposto il server e si offre di riprovare.
    */
    return (
      <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-6">
        <p role="alert" className="text-sm text-red-800">
          {failure || "Modulo di rinnovo non disponibile"}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px] w-full sm:w-auto"
            onClick={() => void load()}
          >
            Riprova
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-[44px] w-full sm:w-auto"
            onClick={onClose}
          >
            Chiudi
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
        <div className="min-w-0">
          <p className="eg-eyebrow-sm text-slate-500">{draft.clubName}</p>
          <h2 className="mt-1 font-display text-lg font-semibold text-slate-950">
            {draft.form.title}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Rinnovo per {draft.athleteName}
            {draft.seasonLabel ? (
              <>
                {" · stagione "}
                <span className="eg-tabular font-medium text-slate-800">
                  {draft.seasonLabel}
                </span>
              </>
            ) : null}
          </p>
          {draft.form.description ? (
            <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
              {draft.form.description}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-[44px]"
          onClick={onClose}
        >
          <X className="mr-2 h-4 w-4" />
          Chiudi
        </Button>
      </header>

      <form onSubmit={submit} className="space-y-6 p-5">
        {/* Si propone, non si ripristina: come sul modulo pubblico. */}
        {foundDraft ? (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              Avevi gia iniziato a compilare questo rinnovo
            </p>
            <p className="text-sm text-amber-900">
              E rimasto su questo dispositivo e non e stato inviato. Allegati e
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

        <p className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Abbiamo gia compilato cio che il club sa di te: controlla, correggi
          quello che e cambiato e invia.
        </p>

        {draft.form.collectRespondentEmail ? (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="space-y-2">
              <Label htmlFor="renewal-respondent-name">Chi sta compilando</Label>
              <Input
                id="renewal-respondent-name"
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
              <Label htmlFor="renewal-respondent-email">
                Email <span className="text-red-600">*</span>
              </Label>
              <Input
                id="renewal-respondent-email"
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
                <p role="alert" className="text-sm font-medium text-red-600">
                  {errors.respondentEmail}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <FormRenderer
          fields={draft.form.fields}
          values={values}
          files={files}
          errors={errors}
          prefilledFieldIds={draft.prefilledFieldIds}
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

        {failure ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {failure}
          </p>
        ) : null}

        <Button type="submit" disabled={sending} className="min-h-[44px] w-full">
          {sending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Invia il rinnovo
        </Button>
      </form>
    </section>
  );
}
