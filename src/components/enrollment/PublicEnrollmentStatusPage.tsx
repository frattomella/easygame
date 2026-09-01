"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { EasyGameLogo } from "@/components/brand/easygame-logo";

/**
 * **La pagina pubblica di una domanda di iscrizione** (`/iscrizione/[reference]`).
 *
 * ---
 *
 * ## Il difetto che chiude
 *
 * La lane 5G aveva costruito tutto il riscontro alla famiglia — la ricevuta
 * come credenziale, lo stato derivato, la vista pubblica a elenco chiuso di
 * campi, la rotta `GET /api/public/enrollment-status/:reference` e il suo
 * limite di frequenza — e **nessuna pagina che li usasse**. Il riferimento
 * usciva una volta sola nella risposta all'invio, e non c'era nessun posto in
 * cui portarlo: `buildEnrollmentReceiptPath` dichiarava il percorso
 * `/iscrizione/:reference` e non lo chiamava nessuno.
 *
 * Cioe l'iscrizione online era tornata a esistere per il club e non per la
 * famiglia, che e esattamente il vuoto che 5G doveva chiudere. Il backend
 * completo non e la funzione: la funzione e cio che una persona riesce a fare.
 *
 * ## Non e una pagina dell'applicazione
 *
 * Nessuna chrome, nessuna barra laterale, nessuna sessione: chi la apre non e
 * nessuno, e ha in mano soltanto un riferimento. Stessa forma della pagina
 * pubblica del link di pagamento, e per la stessa ragione — si apre da un
 * messaggio, con una mano sola, su un telefono.
 *
 * **Una colonna sola a ogni larghezza.** Non e un cruscotto: e la risposta a
 * una domanda («a che punto e la mia iscrizione?»), e una risposta si legge
 * dall'alto in basso.
 *
 * ## Cosa mostra, e cosa non puo mostrare
 *
 * Cio che l'API restituisce, e nient'altro: stato, societa, modulo, stagione,
 * data di invio, l'eventuale nota della segreteria e i documenti che il club
 * aspetta. **Le risposte del modulo non arrivano fin qui** — non escono
 * dall'API — e non e una limitazione di questa schermata: chi ha la ricevuta
 * ha diritto di sapere a che punto e la pratica, non di rileggersi
 * l'anagrafica di un minore dalla rete.
 *
 * **Sola lettura.** Da qui non si carica un documento e non si annulla niente:
 * il riferimento e anonimo, e un canale pubblico di scrittura si progetta, non
 * lo si aggiunge a una schermata di lettura perche era comodo.
 */

type PendingDocument = {
  title: string;
  dueDate: string | null;
  required: boolean;
};

type PublicEnrollmentView = {
  kind: string;
  kindLabel: string;
  state: "sent" | "in_review" | "approved" | "rejected";
  stateLabel: string;
  clubName: string;
  templateTitle: string;
  seasonLabel: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string;
  pendingDocuments: PendingDocument[];
};

const giorno = (value: string | null | undefined) => {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
};

/**
 * Il colore e l'icona di ogni stato.
 *
 * `sent` e `in_review` **non** sono un avviso: una pratica in coda e una
 * pratica che sta funzionando, e vestirla di giallo direbbe alla famiglia che
 * c'e qualcosa che non va quando non c'e niente che non va.
 */
const VESTITO: Record<
  PublicEnrollmentView["state"],
  { icona: React.ComponentType<{ className?: string }>; classe: string }
> = {
  sent: { icona: Clock, classe: "bg-slate-100 text-slate-700" },
  in_review: { icona: CalendarClock, classe: "bg-sky-100 text-sky-800" },
  approved: { icona: CheckCircle2, classe: "bg-emerald-100 text-emerald-800" },
  rejected: { icona: XCircle, classe: "bg-rose-100 text-rose-800" },
};

/**
 * Cosa deve fare adesso la famiglia, per ogni stato.
 *
 * Uno stato senza una frase e una schermata che informa e non aiuta: «Inviata»
 * non dice se ci si deve muovere, e nel dubbio la famiglia telefona — che e
 * proprio la telefonata che questa pagina esiste per evitare.
 */
const COSA_FARE: Record<PublicEnrollmentView["state"], string> = {
  sent: "La societa l'ha ricevuta. Non devi fare altro: ti faremo sapere.",
  in_review:
    "La societa la sta lavorando e aspetta i documenti qui sotto. Portali o caricali dalla tua area personale.",
  approved: "L'iscrizione e stata accettata.",
  rejected:
    "L'iscrizione non e stata accettata. Il motivo e qui sotto, se la societa lo ha scritto.",
};

const Guscio = ({ children }: { children: React.ReactNode }) => (
  <main className="min-h-[100dvh] bg-slate-50 py-6">
    {/* Una colonna sola a ogni larghezza: e una risposta, non un cruscotto. */}
    <div className="mx-auto w-full max-w-lg px-4">{children}</div>
  </main>
);

const Piede = () => (
  <footer className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500">
    <span>Iscrizione gestita con</span>
    <EasyGameLogo className="h-4 w-4" tone="dark" />
    <span className="font-display font-semibold">EasyGame</span>
  </footer>
);

const Riga = ({ etichetta, valore }: { etichetta: string; valore: string }) => {
  if (!valore) return null;

  return (
    /*
      `flex-wrap` e `min-w-0`: a 375 px il nome di una societa sportiva e piu
      lungo dello spazio che avanza accanto all'etichetta, e senza il ritorno a
      capo verrebbe tagliato dal contenitore.
    */
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
      <span className="text-xs uppercase tracking-wide text-slate-500">
        {etichetta}
      </span>
      <span className="min-w-0 break-words text-sm font-medium text-slate-900">
        {valore}
      </span>
    </div>
  );
};

export function PublicEnrollmentStatusPage({ reference }: { reference: string }) {
  const [view, setView] = useState<PublicEnrollmentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/public/enrollment-status/${encodeURIComponent(reference)}`,
      );
      const body = await response.json().catch(() => null);

      if (!response.ok || body?.error) {
        setFailure(body?.error?.message || "Domanda non disponibile");
        setView(null);
      } else {
        setView(body.data as PublicEnrollmentView);
        setFailure("");
      }
    } catch {
      setFailure("Non riesco a leggere la domanda. Controlla la connessione.");
    } finally {
      setLoading(false);
    }
  }, [reference]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-slate-600"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Cerco la domanda…
        </p>
      </main>
    );
  }

  if (!view) {
    return (
      <Guscio>
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
          <h1 className="font-display text-lg font-semibold text-slate-900">
            Domanda non disponibile
          </h1>
          {/*
            Un solo messaggio per ogni esito negativo — riferimento vuoto,
            sconosciuto, o che punta a una pratica sparita — perche e cosi che
            risponde l'API: distinguerli direbbe a chi prova riferimenti a caso
            quando ne ha indovinato uno.
          */}
          <p className="mt-2 text-sm text-slate-600">
            {failure ||
              "Il riferimento non risulta. Controlla il link che hai ricevuto, oppure chiedi alla societa."}
          </p>
        </div>
        <Piede />
      </Guscio>
    );
  }

  const vestito = VESTITO[view.state] || VESTITO.sent;
  const Icona = vestito.icona;

  return (
    <Guscio>
      <header className="rounded-t-lg border border-b-0 border-slate-200 bg-white p-5">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {view.kindLabel}
        </p>
        <h1 className="mt-1 font-display text-lg font-semibold text-slate-900">
          {view.clubName}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{view.templateTitle}</p>
      </header>

      <section className="border border-b-0 border-slate-200 bg-white px-5 py-4">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${vestito.classe}`}
        >
          <Icona className="h-4 w-4" />
          {view.stateLabel}
        </span>
        <p className="mt-3 text-sm text-slate-700">{COSA_FARE[view.state]}</p>

        {view.reviewNote ? (
          /*
            La nota si mostra su **entrambe** le decisioni e non solo sul
            rifiuto: una nota scritta dalla segreteria e scritta per la
            famiglia, e tenerla nascosta su un'approvazione con riserva
            obbligherebbe a telefonare.
          */
          <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            {view.reviewNote}
          </p>
        ) : null}
      </section>

      {view.pendingDocuments.length ? (
        <section className="border border-b-0 border-slate-200 bg-white px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Documenti che la societa aspetta
          </h2>
          <ul className="mt-2 space-y-2">
            {view.pendingDocuments.map((documento, indice) => (
              <li
                key={`${documento.title}-${indice}`}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-md bg-slate-50 px-3 py-2"
              >
                <span className="min-w-0 break-words text-sm text-slate-800">
                  {documento.title}
                  {documento.required ? (
                    <span className="ml-1 text-rose-600">*</span>
                  ) : null}
                </span>
                {documento.dueDate ? (
                  <span className="text-xs text-slate-500">
                    entro il {giorno(documento.dueDate)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-b-lg border border-slate-200 bg-white px-5 py-2">
        <Riga etichetta="Stagione" valore={view.seasonLabel} />
        <Riga etichetta="Inviata il" valore={giorno(view.submittedAt)} />
        <Riga etichetta="Esaminata il" valore={giorno(view.reviewedAt)} />
      </section>

      <p className="mt-4 text-center text-xs text-slate-500">
        Conserva questo link: e l&#8217;unico modo per rileggere lo stato della
        domanda, e non puo essere ristampato.
      </p>

      <Piede />
    </Guscio>
  );
}
