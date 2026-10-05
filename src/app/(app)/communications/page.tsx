"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Plus } from "lucide-react";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest, readStoredActiveClub } from "@/lib/api/client";
import { type AudienceCriterionKind } from "@/lib/audience/criteria";
import { PageHeader } from "@/components/web/page/PageHeader";
import { Button } from "@/components/web/primitives/Button";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { Field, TextInput, Textarea, ValidationSummary } from "@/components/web/forms/Field";
import { useConfirm } from "@/components/web/overlays/useConfirm";
import { formatInteger } from "@/lib/web/format";
import { CommunicationsNav } from "@/components/communications/v2/communications-nav";
import {
  AudiencePicker,
  audienceCriteriaPayload,
  audienceSelectionError,
  useAudienceOptions,
} from "@/components/communications/v2/audience-picker";
import {
  CommunicationOutcomePanel,
  CommunicationPreviewPanel,
  CommunicationRecipientsGrid,
  type CommunicationOutcome,
  type CommunicationPreview,
} from "@/components/communications/v2/communication-preview";

/**
 * Un punto di partenza per chi non sa da dove cominciare.
 *
 * **Non e un modello del dominio**: i modelli veri sono quelli delle
 * automazioni (`src/lib/messages/defaults.ts`) e usano segnaposto economici e
 * di evento, che in una comunicazione massiva non si risolvono — parlano di
 * **una** posizione, e un messaggio a una famiglia con due figli ne ha due.
 * Questo e testo dell'interfaccia, e resta qui.
 */
/** Dove vive l'identificativo della comunicazione in corso, per questa scheda. */
const COMMUNICATION_ID_KEY = "easygame_communication_id";

const TESTO_DI_PARTENZA = {
  subject: "Comunicazione da {{club.name}}",
  body: ["Gentile {{recipient.name}},", "", "", "", "Un saluto,", "{{club.name}}"].join("\n"),
};

/**
 * La comunicazione massiva alle famiglie (W2-C, G-07) — Web V2.
 *
 * **Perche l'anteprima non e facoltativa.** Un invio massivo e irreversibile e
 * raggiunge persone reali fuori dal prodotto: l'unico momento in cui si puo
 * correggere e **prima**. La schermata quindi non ha un pulsante «manda» finche
 * non si e visto chi si raggiunge, chi no e con che motivo, e il messaggio
 * **come lo leggera il primo destinatario** — non un esempio con dati finti.
 *
 * **Perche i motivi si mostrano tutti.** Il difetto che questa Wave chiude e
 * un invio che si dichiara riuscito senza aver raggiunto nessuno. Qui ogni
 * famiglia che resta fuori compare, con il motivo, e il conteggio degli esclusi
 * sta accanto a quello dei raggiunti invece che in fondo alla pagina.
 */

/**
 * I criteri che questa schermata offre, **nell'ordine in cui si scelgono**.
 *
 * E un elenco solo — non un elenco piu un tipo scritto a parte — perche era
 * proprio la divergenza fra i due a rendere «Convocati a un evento» e «Senza
 * risposta a un evento» irraggiungibili: il dominio li dichiarava, il tipo
 * della pagina ne conosceva sette, e nessuno si accorgeva della differenza.
 * `satisfies` fa fallire la compilazione se qui compare un criterio che il
 * motore del pubblico non sa risolvere.
 *
 * **Nessuno di questi criteri e nascosto per ruolo, e non e una dimenticanza.**
 * L'unico criterio protetto e `overdue_payments`
 * (`ECONOMIC_AUDIENCE_CRITERIA` + `communications.audience_economic`); i due
 * criteri di evento non lo sono, perche «chi e stato convocato» non dice nulla
 * sui soldi di nessuno. E `/communications` e gia riservato a proprietario e
 * gestore da `access-roles.ts`, cioe agli unici ruoli che hanno l'intera
 * matrice: nessuna voce di questa tendina porta a un rifiuto del server.
 */
const CRITERI_OFFERTI = [
  "all_families",
  "category_ids",
  "group_ids",
  "site_ids",
  "event_convocated",
  "event_no_rsvp",
  "overdue_payments",
  "certificate_missing_or_expiring",
  "no_account",
] as const satisfies readonly AudienceCriterionKind[];

type AudienceKind = (typeof CRITERI_OFFERTI)[number];

const newCommunicationId = () =>
  typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : String(Date.now());

export default function CommunicationsPage() {
  const { showToast } = useToast();
  const [confirm, confirmDialog] = useConfirm();

  const [clubName, setClubName] = useState("");
  const [kind, setKind] = useState<AudienceKind>("all_families");
  const [selected, setSelected] = useState<string[]>([]);
  const { optionsFor } = useAudienceOptions();

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<Array<{ id?: string; label: string }>>([]);

  const [preview, setPreview] = useState<CommunicationPreview | null>(null);
  const [outcome, setOutcome] = useState<CommunicationOutcome | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "send">("");

  /*
    L'identificativo nasce quando si apre la finestra di composizione, non
    quando si preme: e cio che rende due clic sullo stesso pulsante **lo stesso
    gesto**. Un reinvio deliberato passa da «Nuova comunicazione», che ne
    genera uno nuovo.
  */
  const [communicationId, setCommunicationId] = useState("");

  useEffect(() => {
    /*
      **L'identificativo sopravvive al ricaricamento della pagina.**

      Nasceva a ogni montaggio, quindi viveva dentro uno stato di React: chi
      ricaricava a meta di un invio a lotti — «Continua: restano N» — ripartiva
      con un identificativo nuovo, cioe con una **comunicazione nuova**, e i
      primi duecento destinatari ricevevano il messaggio una seconda volta. La
      difesa contro il doppio invio non puo dipendere da uno stato che un F5
      cancella.

      `sessionStorage` e la durata giusta: la comunicazione che sto scrivendo
      appartiene a questa scheda, e chiuderla significa davvero ricominciare.
    */
    setClubName(readStoredActiveClub()?.name || "");

    try {
      const conservato = window.sessionStorage.getItem(COMMUNICATION_ID_KEY);
      if (conservato) {
        setCommunicationId(conservato);
        return;
      }
    } catch {
      /* Sessione senza storage: si ripiega su un identificativo volatile. */
    }

    const nuovo = newCommunicationId();
    setCommunicationId(nuovo);
    try {
      window.sessionStorage.setItem(COMMUNICATION_ID_KEY, nuovo);
    } catch {
      /* Come sopra: la protezione degrada, non sparisce. */
    }
  }, []);

  const opzioni = useMemo(() => optionsFor(kind), [kind, optionsFor]);

  const criteria = useMemo(() => audienceCriteriaPayload(kind, selected), [kind, selected]);

  /** Ogni modifica al modulo invalida l'anteprima: si manda cio che si e visto. */
  const invalidatePreview = () => setPreview(null);

  const richiedi = useCallback(
    async (modalita: "preview" | "send") => {
      const trovati: Array<{ id?: string; label: string }> = [];
      if (!subject.trim() || !body.trim()) {
        trovati.push({ id: !subject.trim() ? "comunicazione-oggetto" : "comunicazione-testo", label: "Oggetto e testo del messaggio sono obbligatori" });
      }
      /*
        Il controllo guarda **il criterio**, non quante opzioni sono arrivate:
        legato all'elenco, un criterio con zero opzioni — «Convocati a un
        evento» senza eventi in programma — passava il controllo e finiva in
        un errore del server che non spiega cosa fare.
      */
      const erroreSelezione = audienceSelectionError(kind, selected, opzioni);
      if (erroreSelezione) trovati.push({ id: "comunicazione-opzioni", label: erroreSelezione });
      setErrors(trovati);
      if (trovati.length) {
        showToast("error", trovati[0].label);
        return;
      }

      if (modalita === "send" && preview) {
        const quanti = outcome && outcome.remaining > 0 ? outcome.remaining : preview.counts.recipients;
        const ok = await confirm({
          title: `Mandare a ${formatInteger(quanti)} ${quanti === 1 ? "destinatario" : "destinatari"}?`,
          description: "L'email parte subito e non si puo richiamare. Chi e gia stato raggiunto con questa comunicazione non la riceve una seconda volta.",
          confirmLabel: "Manda",
        });
        if (!ok) return;
      }

      setBusy(modalita);
      const response = await apiRequest<any>("/api/v1/communications", {
        method: "POST",
        body: {
          criteria,
          template: { subject, body },
          communication_id: communicationId,
          ...(modalita === "preview" ? { preview: true } : {}),
        },
      });
      setBusy("");

      if (response.error || !response.data) {
        showToast("error", response.error?.message || "Operazione non riuscita");
        return;
      }

      if (modalita === "preview") {
        setPreview(response.data as CommunicationPreview);
        setOutcome(null);
        return;
      }

      const esito = response.data as CommunicationOutcome;
      setOutcome(esito);
      showToast(
        esito.totals.sent > 0 ? "success" : "error",
        esito.totals.sent > 0 ? `Inviato a ${esito.totals.sent} destinatari` : "Nessun messaggio inviato: leggi l'esito per destinatario",
      );
    },
    [subject, body, criteria, communicationId, opzioni, kind, selected, showToast, preview, outcome, confirm],
  );

  const nuovaComunicazione = () => {
    setPreview(null);
    setOutcome(null);
    setSubject("");
    setBody("");
    setSelected([]);
    setErrors([]);

    /*
      **Questo** e il gesto che dichiara una comunicazione nuova, ed e l'unico:
      il ricaricamento della pagina non lo e.
    */
    const nuovo = newCommunicationId();
    setCommunicationId(nuovo);
    try {
      window.sessionStorage.setItem(COMMUNICATION_ID_KEY, nuovo);
    } catch {
      /* La protezione degrada, non sparisce. */
    }
  };

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Comunicazioni" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Segreteria"
              title="Comunicazioni"
              description={`Scrivi alle famiglie ${clubName ? `di ${clubName}` : "del club"} e vedi chi raggiungi prima di mandare.`}
              actions={
                <Button variant="secondary" icon={<Plus />} onClick={nuovaComunicazione}>
                  Nuova comunicazione
                </Button>
              }
            >
              <CommunicationsNav />
            </PageHeader>

            <div className="grid gap-[18px] lg:grid-cols-2">
              <Panel as="section" data-test="communication-compose">
                <PanelHeader eyebrow="Passo 1" title="Destinatari e messaggio" description="Scegli chi raggiungere e cosa scrivere; l'anteprima ti dice chi legge davvero." />
                <form
                  className="flex flex-col gap-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void richiedi("preview");
                  }}
                >
                  <ValidationSummary errors={errors} />

                  <AudiencePicker
                    idPrefix="comunicazione"
                    criteria={CRITERI_OFFERTI}
                    kind={kind}
                    onKindChange={(next) => {
                      setKind(next);
                      setSelected([]);
                      invalidatePreview();
                    }}
                    selected={selected}
                    onSelectedChange={(next) => {
                      setSelected(next);
                      invalidatePreview();
                    }}
                    options={opzioni}
                    error={errors.find((e) => e.id === "comunicazione-opzioni")?.label}
                  />

                  <Field label="Oggetto" htmlFor="comunicazione-oggetto" required error={errors.find((e) => e.id === "comunicazione-oggetto")?.label}>
                    <TextInput
                      id="comunicazione-oggetto"
                      value={subject}
                      onChange={(event) => {
                        setSubject(event.target.value);
                        invalidatePreview();
                      }}
                      placeholder="Comunicazione da {{club.name}}"
                    />
                  </Field>

                  <Field
                    label="Messaggio"
                    htmlFor="comunicazione-testo"
                    required
                    error={errors.find((e) => e.id === "comunicazione-testo")?.label}
                    helper={
                      <>
                        Segnaposto disponibili: <code>{"{{club.name}}"}</code>, <code>{"{{recipient.name}}"}</code>, <code>{"{{athlete.first_name}}"}</code>.
                      </>
                    }
                  >
                    <Textarea
                      id="comunicazione-testo"
                      rows={8}
                      value={body}
                      onChange={(event) => {
                        setBody(event.target.value);
                        invalidatePreview();
                      }}
                      placeholder="Gentile {{recipient.name}}, ..."
                    />
                  </Field>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="text"
                      size="sm"
                      onClick={() => {
                        setSubject(TESTO_DI_PARTENZA.subject);
                        setBody(TESTO_DI_PARTENZA.body);
                        invalidatePreview();
                      }}
                    >
                      Parti da un testo
                    </Button>
                    {/*
                      Navy pieno e non gradiente (guideline 05 C6): il
                      gradiente della pagina e «Manda», che compare
                      nell'anteprima; due gradienti sullo stesso schermo
                      direbbero che si puo mandare senza aver guardato.
                    */}
                    <Button type="submit" variant="neutral" icon={<Eye />} loading={busy === "preview"} disabled={busy === "send"}>
                      Vedi chi raggiungo
                    </Button>
                  </div>
                </form>
              </Panel>

              <CommunicationPreviewPanel preview={preview} busy={busy === "send"} onSend={() => void richiedi("send")} />
            </div>

            {preview ? <CommunicationRecipientsGrid preview={preview} /> : null}

            {outcome ? <CommunicationOutcomePanel outcome={outcome} busy={busy === "send"} onContinue={() => void richiedi("send")} /> : null}
          </DashboardPageContainer>
        </main>
      </div>
      {confirmDialog}
    </div>
  );
}
