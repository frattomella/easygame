"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { ENROLMENT_REQUEST_STATUS } from "@/lib/web/status";
import { OutsideShell, OutsideStatus } from "@/components/web/shell/OutsideShell";

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
  state: "sent" | "in_review" | "changes_requested" | "approved" | "rejected" | "archived";
  stateLabel: string;
  changesRequested: { fields: Array<{ id: string; label: string }>; note: string } | null;
  revision: number;
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
  changes_requested:
    "La societa chiede di correggere o completare alcune cose. Puoi farlo da qui: si modificano solo i campi indicati, il resto resta com'era.",
  approved: "L'iscrizione e stata accettata.",
  rejected:
    "L'iscrizione non e stata accettata. Il motivo e qui sotto, se la societa lo ha scritto.",
  archived: "La pratica e stata archiviata dalla societa.",
};

/* Il guscio fuori dal club (ambiente 3): una colonna sola, e una risposta, non un cruscotto. */
const Guscio = ({ children }: { children: React.ReactNode }) => (
  <OutsideShell width="stepper" bare>
    <div className="w-full [&>header]:rounded-t-egw-panel [&>header]:border-white/60 [&>header]:shadow-egw-plane-2 [&>section]:border-white/60 [&>section:last-of-type]:rounded-b-egw-panel">{children}</div>
  </OutsideShell>
);

const Piede = () => <p className="py-4 text-center text-[11.5px] text-white/70">Iscrizione gestita con EasyGame</p>;

const Riga = ({ etichetta, valore }: { etichetta: string; valore: string }) => {
  if (!valore) return null;

  return (
    /*
      `flex-wrap` e `min-w-0`: a 375 px il nome di una societa sportiva e piu
      lungo dello spazio che avanza accanto all'etichetta, e senza il ritorno a
      capo verrebbe tagliato dal contenitore.
    */
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
      <span className="text-xs uppercase tracking-wide text-egw-ink-62">
        {etichetta}
      </span>
      <span className="min-w-0 break-words text-sm font-medium text-egw-ink">
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
      <OutsideShell width="form">
        <OutsideStatus icon={<Loader2 />} title="Domanda di iscrizione" description="Un momento: cerco la domanda." busy busyLabel="Cerco la domanda…" />
      </OutsideShell>
    );
  }

  if (!view) {
    return (
      <Guscio>
        <div className="rounded-egw-panel border border-white/60 bg-white p-6 text-center shadow-egw-plane-2">
          <h1 className="font-brand text-[20px] font-extrabold tracking-[var(--egw-track-display)] text-egw-ink">
            Domanda non disponibile
          </h1>
          {/*
            Un solo messaggio per ogni esito negativo — riferimento vuoto,
            sconosciuto, o che punta a una pratica sparita — perche e cosi che
            risponde l'API: distinguerli direbbe a chi prova riferimenti a caso
            quando ne ha indovinato uno.
          */}
          <p className="mt-2 text-sm text-egw-ink-72">
            {failure ||
              "Il riferimento non risulta. Controlla il link che hai ricevuto, oppure chiedi alla societa."}
          </p>
        </div>
        <Piede />
      </Guscio>
    );
  }


  return (
    <Guscio>
      <header className="rounded-t-egw-panel border border-b-0 border-egw-hairline bg-white p-5">
        <p className="text-xs uppercase tracking-wide text-egw-ink-62">
          {view.kindLabel}
        </p>
        <h1 className="mt-1 font-brand text-lg font-semibold text-egw-ink">
          {view.clubName}
        </h1>
        <p className="mt-1 text-sm text-egw-ink-72">{view.templateTitle}</p>
      </header>

      <section className="border border-b-0 border-egw-hairline bg-white px-5 py-4">
        {/* Lo stato e una parola in una pillola del sistema (ENROLMENT_REQUEST_STATUS), la stessa dell'area famiglia. */}
        <StatusPill status={ENROLMENT_REQUEST_STATUS[view.state] || ENROLMENT_REQUEST_STATUS.sent} />
        <p className="mt-3 text-sm text-egw-ink-72">{COSA_FARE[view.state]}</p>

        {view.reviewNote && view.state !== "changes_requested" ? (
          /*
            La nota si mostra su **entrambe** le decisioni e non solo sul
            rifiuto: una nota scritta dalla segreteria e scritta per la
            famiglia, e tenerla nascosta su un'approvazione con riserva
            obbligherebbe a telefonare.
          */
          <p className="mt-3 rounded-egw-control bg-egw-page-100 p-3 text-sm text-egw-ink-72">
            {view.reviewNote}
          </p>
        ) : null}

        {view.state === "changes_requested" && view.changesRequested ? (
          /*
            **Il club richiede queste integrazioni** (ADR-0189 §4): l'elenco
            dei campi, la nota, e la strada per correggerli con la stessa
            ricevuta. E l'unica scrittura pubblica oltre all'invio, e cambia
            solo cio che il club ha elencato.
          */
          <div className="mt-3 rounded-egw-control border border-egw-tint-orange-bd bg-egw-tint-orange p-4" data-test="changes-requested">
            <p className="text-sm font-semibold text-egw-ink">Il club richiede queste integrazioni</p>
            {view.changesRequested.fields.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-egw-ink">
                {view.changesRequested.fields.map((field) => (
                  <li key={field.id}>{field.label}</li>
                ))}
              </ul>
            ) : null}
            {view.changesRequested.note ? (
              <p className="mt-2 text-sm text-egw-ink-72">{view.changesRequested.note}</p>
            ) : null}
            <a
              href={`${typeof window === "undefined" ? "" : window.location.pathname}/integra`}
              className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-egw-control bg-egw-action px-4 text-sm font-bold text-white shadow-egw-glow"
            >
              Integra la pratica
            </a>
          </div>
        ) : null}
      </section>

      {view.pendingDocuments.length ? (
        <section className="border border-b-0 border-egw-hairline bg-white px-5 py-4">
          <h2 className="text-sm font-semibold text-egw-ink">
            Documenti che la societa aspetta
          </h2>
          <ul className="mt-2 space-y-2">
            {view.pendingDocuments.map((documento, indice) => (
              <li
                key={`${documento.title}-${indice}`}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-egw-control bg-egw-page-100 px-3 py-2"
              >
                <span className="min-w-0 break-words text-sm text-egw-ink">
                  {documento.title}
                  {documento.required ? (
                    <span className="ml-1 text-egw-red">*</span>
                  ) : null}
                </span>
                {documento.dueDate ? (
                  <span className="text-xs text-egw-ink-62">
                    entro il {giorno(documento.dueDate)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-b-egw-panel border border-egw-hairline bg-white px-5 py-2">
        <Riga etichetta="Stagione" valore={view.seasonLabel} />
        <Riga etichetta="Inviata il" valore={giorno(view.submittedAt)} />
        {view.revision > 1 ? <Riga etichetta="Reinvio" valore={`revisione ${view.revision}`} /> : null}
        <Riga etichetta="Esaminata il" valore={giorno(view.reviewedAt)} />
      </section>

      <p className="mt-4 text-center text-xs text-white/80">
        Conserva questo link: e l&#8217;unico modo per rileggere lo stato della
        domanda, e non puo essere ristampato.
      </p>

      <Piede />
    </Guscio>
  );
}
