"use client";

import { useCallback, useRef, useState } from "react";
import { downloadClientFileUrl } from "@/lib/client-files";
import { AlertTriangle, Download, Eye, Trash2 } from "lucide-react";

import { Modal } from "@/components/web/overlays/Modal";
import { Button } from "@/components/web/primitives/Button";
import { Checkbox } from "@/components/web/primitives/Controls";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { Eyebrow, InsetBlock } from "@/components/web/primitives/Surface";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Field, TextInput, Textarea } from "@/components/web/forms/Field";
import type { StatusSpec } from "@/lib/web/status";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import { apiRequest } from "@/lib/api/client";
import { roleHasPermission } from "@/lib/permissions/catalog";

/**
 * **«Dati personali», cioe la strada che il messaggio d'errore gia indicava e
 * che nessuna schermata apriva.**
 *
 * `assertPersonalDataDisposed` (`src/lib/server/data-subject.ts`, innestata in
 * `resources.ts` sulla cancellazione) impedisce di cancellare l'anagrafica di
 * una persona che abbia anche **una sola** riga fra allegati, consensi,
 * richieste documentali e depositi, e chiude dicendo: «Usa la cancellazione dei
 * dati personali, che li percorre uno per uno».
 *
 * Quella cancellazione esisteva davvero — tre rotte sotto `/api/v1/data-subject`
 * — e **non aveva nessun chiamante nel client**: zero occorrenze in `src/app` e
 * in `src/components`. E la forma esatta del difetto descritto in CLAUDE.md
 * §11.8: non codice mancante, codice **irraggiungibile**. Con l'iscrizione
 * online che crea richieste documentali e i moduli che registrano consensi,
 * praticamente ogni atleta reale era incancellabile, e chi ci provava leggeva
 * «Errore nell'eliminazione dell'atleta».
 *
 * **Cosa fa questa sezione, e in quest'ordine.** Mostra l'**inventario** prima
 * di chiedere qualsiasi cosa (`previewDataSubjectErasure`), dice riga per riga
 * cosa sparisce, cosa resta senza piu nominare nessuno e cosa la societa e
 * **tenuta** a conservare con il motivo scritto, e solo dopo offre i due atti:
 * portare via i dati, e distruggerli.
 *
 * **Il gettone.** L'inventario porta con se `confirmationToken`, che ne e
 * l'impronta: se qualcosa cambia fra la lettura e la conferma — un certificato
 * caricato nel frattempo, una fattura emessa — il server rifiuta. Questa
 * schermata non lo aggira e non lo rigenera di nascosto: quando il server dice
 * che il riepilogo e cambiato, ricarica l'inventario e lo rimostra, perche il
 * punto del gettone e rendere **impossibile cancellare senza aver visto**.
 *
 * **L'inventario si chiede, non si carica da solo.** `previewDataSubjectErasure`
 * legge tutte le compilazioni del club e le filtra in memoria — `form_submissions.subjects`
 * e un JSON e Postgres non ha un indice che risponda a «quali citano questa
 * persona» — e il dominio dichiara che quel costo si paga «qualche volta
 * l'anno, non a ogni richiesta». Caricarlo all'apertura di ogni scheda atleta
 * lo avrebbe reso il costo di ogni visita.
 */

type Disposal = "delete" | "anonymize" | "retain";

type Slice = {
  table: string;
  label: string;
  index: string;
  count: number;
  disposal: Disposal;
  reason?: string;
};

type Inventory = {
  organizationId: string;
  subjectKind: string;
  subjectId: string;
  subjectLabel: string;
  isMinor: boolean;
  slices: Slice[];
  totals: {
    rows: number;
    toDelete: number;
    toAnonymize: number;
    retained: number;
  };
  confirmationToken: string;
};

type ErasureReport = {
  subjectId: string;
  erasedAt: string;
  deleted: Record<string, number>;
  anonymized: Record<string, number>;
  retained: Slice[];
  manualReview: Array<{ table: string; id: string; why: string }>;
};

type ExportPayload = {
  generatedAt: string;
  clinicalContentOmitted: boolean;
  subject: { kind: string; id: string; label: string };
};

/** Le tre classi in parole, perche «anonymize» non e una parola italiana. */
const ETICHETTA_CLASSE: Record<Disposal, string> = {
  delete: "Viene cancellato",
  anonymize: "Resta, senza piu nominare la persona",
  retain: "Resta intero: obbligo di conservazione",
};

const STATO_CLASSE: Record<Disposal, StatusSpec> = {
  delete: { label: ETICHETTA_CLASSE.delete.toUpperCase(), weight: "urgent", hue: "red" },
  anonymize: { label: ETICHETTA_CLASSE.anonymize.toUpperCase(), weight: "outline", hue: "amber" },
  retain: { label: ETICHETTA_CLASSE.retain.toUpperCase(), weight: "quiet", hue: "neutral" },
};

/** La parola da scrivere per confermare (guideline 08 §8.9). */
const PAROLA_DI_CONFERMA = "ELIMINA";

/**
 * Il messaggio della guardia, riconosciuto.
 *
 * La guardia dice gia perche non si puo cancellare; il difetto era che le tre
 * schermate lo sostituivano con «Errore nell'eliminazione dell'atleta». Questa
 * funzione vive qui e non nelle pagine perche la stessa domanda se la fanno in
 * tre, e una risposta sola e piu facile da tenere vera.
 */
export const eDatiPersonaliDaSmaltire = (messaggio: unknown) =>
  /dati personali|non spariscono cancellando l'anagrafica/i.test(
    String(messaggio ?? ""),
  );

/**
 * Il messaggio da mostrare quando la cancellazione di un'anagrafica e stata
 * fermata dalla guardia: quello del server — che dice **quali** dati restano —
 * piu dove si va a smaltirli.
 *
 * `nome` e assente quando si e gia sulla scheda di quella persona: li la
 * sezione e nella stessa pagina, e mandare qualcuno «alla scheda» dove si trova
 * gia e un'indicazione che fa perdere tempo.
 */
export const messaggioDatiPersonali = (
  messaggio: unknown,
  nome?: string | null,
) =>
  `${String(messaggio ?? "").trim()} ${
    nome?.trim()
      ? `Aprila dalla scheda di ${nome.trim()}, sezione «Dati personali».`
      : "La trovi nella sezione «Dati personali» di questa scheda."
  }`;

/**
 * **Le stesse due chiavi, chieste una volta sola.**
 *
 * La scheda atleta monta la riga «Dati personali» solo a chi puo esportare o
 * cancellare: senza questo gancio le chiavi finirebbero scritte due volte —
 * qui e nella pagina — e una riga vuota comparirebbe a chi non ha niente da
 * farci. La sezione si difende comunque da se (`return null` qui sotto):
 * nascondere non e proteggere.
 */
export function usePuoTrattareDatiPersonali() {
  const { activeClub } = useAuth();
  return (
    roleHasPermission(activeClub?.role, "data_subject.export") ||
    roleHasPermission(activeClub?.role, "data_subject.erase")
  );
}

export function AthleteDataSubjectSection({
  athleteId,
  athleteName,
  onErased,
}: {
  athleteId: string;
  athleteName?: string | null;
  /** L'elenco e la scheda devono sapere che l'anagrafica non e piu quella. */
  onErased?: () => void;
}) {
  const { activeClub } = useAuth();
  const { showToast } = useToast();

  const [inventario, setInventario] = useState<Inventory | null>(null);
  const [caricamento, setCaricamento] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [dialogoAperto, setDialogoAperto] = useState(false);
  const [riconosceMinore, setRiconosceMinore] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [rapporto, setRapporto] = useState<ErasureReport | null>(null);
  const [clinicoOmesso, setClinicoOmesso] = useState<boolean | null>(null);
  const [parolaScritta, setParolaScritta] = useState("");
  const annullaRef = useRef<HTMLButtonElement>(null);

  /*
    Le due chiavi che il server chiede davvero (`assertCanDispose`). Nasconderle
    a chi non le ha non e il presidio — quello e la guardia di dominio — ma
    mostrare a un allenatore un pulsante che risponde 403 e il difetto che
    questa Wave ha trovato dieci volte.

    Sono due chiavi distinte e si leggono separatamente: un club puo togliere
    la cancellazione lasciando l'export, e in quel caso la sezione deve
    mostrare mezzo pannello, non zero e non tutto.
  */
  const puoEsportare = roleHasPermission(
    activeClub?.role,
    "data_subject.export",
  );
  const puoCancellare = roleHasPermission(
    activeClub?.role,
    "data_subject.erase",
  );

  const caricaInventario = useCallback(async () => {
    if (!athleteId) return null;
    setCaricamento(true);
    setErrore(null);
    try {
      const risposta = await apiRequest<Inventory>(
        `/api/v1/data-subject/${athleteId}`,
      );
      if (risposta.error) {
        setErrore(risposta.error.message);
        setInventario(null);
        return null;
      }
      setInventario(risposta.data);
      return risposta.data;
    } finally {
      setCaricamento(false);
    }
  }, [athleteId]);

  const esporta = useCallback(async () => {
    setInCorso(true);
    try {
      const risposta = await apiRequest<ExportPayload>(
        `/api/v1/data-subject/${athleteId}/export`,
      );
      if (risposta.error) throw new Error(risposta.error.message);

      /*
        Il file si compone qui e non si chiede al server: la rotta risponde la
        busta JSON di sempre, e `apiDownload` serve alle rotte che rispondono
        gia un file. Nessun `fetch` diretto in nessuno dei due rami.
      */
      const contenuto = JSON.stringify(risposta.data, null, 2);
      const indirizzo = URL.createObjectURL(
        new Blob([contenuto], { type: "application/json" }),
      );

      /*
        Il salvataggio passa da `downloadClientFileUrl`, che e il proprietario
        del gesto: sanifica il nome, gestisce l'ancora e **revoca l'indirizzo
        temporaneo dopo** che il browser lo ha usato. La prima stesura
        costruiva l'ancora a mano e revocava subito dopo il clic — che su
        alcuni browser arriva prima che il download sia partito — ed e la
        ragione per cui esiste un presidio che vieta `link.download` scritto a
        mano.
      */
      downloadClientFileUrl(indirizzo, `dati-personali-${athleteId}.json`);

      setClinicoOmesso(Boolean(risposta.data?.clinicalContentOmitted));
      showToast("success", "Export dei dati personali scaricato");
    } catch (caught: any) {
      showToast("error", caught?.message || "Export non riuscito");
    } finally {
      setInCorso(false);
    }
  }, [athleteId, showToast]);

  const cancella = useCallback(async () => {
    if (!inventario) return;
    setInCorso(true);
    try {
      const risposta = await apiRequest<ErasureReport>(
        `/api/v1/data-subject/${athleteId}`,
        {
          method: "DELETE",
          body: {
            confirmation_token: inventario.confirmationToken,
            acknowledge_minor: riconosceMinore,
            reason: motivo.trim() || undefined,
          },
        },
      );

      if (risposta.error) {
        /*
          Il gettone non corrisponde piu: qualcosa e cambiato fra la lettura e
          la conferma. Non si riprova con un gettone nuovo preso di nascosto —
          sarebbe esattamente cio che il gettone esiste per impedire: si
          ricarica l'inventario e si chiede di rileggerlo.
        */
        if (/riepilogo/i.test(risposta.error.message)) {
          await caricaInventario();
        }
        throw new Error(risposta.error.message);
      }

      setRapporto(risposta.data);
      setInventario(null);
      setRiconosceMinore(false);
      setMotivo("");
      setParolaScritta("");
      showToast("success", "Dati personali trattati");
      onErased?.();
    } catch (caught: any) {
      showToast("error", caught?.message || "Cancellazione non riuscita");
    } finally {
      setInCorso(false);
      setDialogoAperto(false);
    }
  }, [
    athleteId,
    caricaInventario,
    inventario,
    motivo,
    onErased,
    riconosceMinore,
    showToast,
  ]);

  if (!puoEsportare && !puoCancellare) return null;

  const minoreDaRiconoscere = Boolean(inventario?.isMinor);
  const confermaAbilitata =
    Boolean(inventario) && (!minoreDaRiconoscere || riconosceMinore);
  /*
    La conferma scritta (guideline 08 §8.9): la cancellazione dei dati
    personali e irreversibile e larga — tocca file, consensi, richieste e
    moduli, non una riga sola — e in piu delle tre guardie della V1
    (inventario, gettone, minore) chiede di scrivere la parola.
  */
  const parolaCoincide = parolaScritta === PAROLA_DI_CONFERMA;

  return (
    <div id="dati-personali" className="flex flex-col gap-4 scroll-mt-24">
      <p className="font-brand text-[12.5px] leading-[1.55] text-egw-ink-62">
        I dati di una persona non stanno tutti nella sua scheda: vivono anche
        su file, consensi, richieste e moduli che cancellare l&apos;anagrafica
        non tocca. Da qui si vede l&apos;elenco completo, lo si porta via, e lo
        si distrugge — una volta sola e senza tornare indietro.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          variant="secondary"
          size="sm"
          className="w-full sm:w-auto"
          icon={<Eye />}
          loading={caricamento}
          onClick={() => void caricaInventario()}
        >
          {inventario ? "Aggiorna il riepilogo" : "Mostra cosa contiene"}
        </Button>

        {puoEsportare ? (
          <Button
            variant="secondary"
            size="sm"
            className="w-full sm:w-auto"
            icon={<Download />}
            onClick={() => void esporta()}
            disabled={inCorso}
          >
            Esporta i dati
          </Button>
        ) : null}

        {puoCancellare ? (
          <Button
            variant="danger"
            size="sm"
            className="w-full sm:w-auto"
            icon={<Trash2 />}
            onClick={() => setDialogoAperto(true)}
            /*
              Senza inventario il pulsante non si accende: il server
              rifiuterebbe comunque per mancanza di gettone, e un pulsante
              che porta a un errore prevedibile e un pulsante che mente.
            */
            disabled={!inventario || inCorso}
            title={
              inventario
                ? undefined
                : "Prima mostra cosa contiene il fascicolo"
            }
          >
            Cancella i dati personali
          </Button>
        ) : null}
      </div>

      {errore ? <AlertBlock severity="danger" title={errore} /> : null}

      {clinicoOmesso ? (
        /*
          L'export lo dichiara (`clinicalContentOmitted`) e la schermata non
          lo tace: chi riceve un export che non dice cosa non contiene lo
          crede completo.
        */
        <AlertBlock severity="warning" title="Il file scaricato non contiene il contenuto clinico">
          Note, patologie e farmaci restano fuori: serve il permesso di lettura del dato sanitario.
        </AlertBlock>
      ) : null}

      {inventario ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-brand text-[13px] font-semibold text-egw-ink">
              {inventario.subjectLabel}
            </span>
            {inventario.isMinor ? <DataChip tone="red" size="sm">Minorenne</DataChip> : null}
            <DataChip size="sm">
              <span className="egw-num">{inventario.totals.rows}</span> righe in tutto
            </DataChip>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <InsetBlock className="p-3">
              <Eyebrow>Cancellate</Eyebrow>
              <p className="egw-num mt-1 font-brand text-[20px] font-extrabold text-egw-ink">
                {inventario.totals.toDelete}
              </p>
            </InsetBlock>
            <InsetBlock className="p-3">
              <Eyebrow>Anonimizzate</Eyebrow>
              <p className="egw-num mt-1 font-brand text-[20px] font-extrabold text-egw-ink">
                {inventario.totals.toAnonymize}
              </p>
            </InsetBlock>
            <InsetBlock className="p-3">
              <Eyebrow>Conservate</Eyebrow>
              <p className="egw-num mt-1 font-brand text-[20px] font-extrabold text-egw-ink">
                {inventario.totals.retained}
              </p>
            </InsetBlock>
          </div>

          {/*
            Un elenco di righe e non una tabella: a 375 px una tabella a
            quattro colonne o si taglia o si comprime fino a diventare
            illeggibile, e questa e la schermata in cui la riga che non si
            legge e quella che dice cosa non torna indietro.
          */}
          <ul className="divide-y divide-egw-rule rounded-egw-field border border-egw-hairline bg-egw-page-100">
            {inventario.slices
              .filter((slice) => slice.count > 0)
              .map((slice) => (
                <li
                  key={slice.table}
                  className="flex flex-col gap-1 px-3.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="font-brand text-[13px] font-semibold text-egw-ink">{slice.label}</p>
                    <p className="font-brand text-[11.5px] text-egw-ink-62">
                      {slice.table}
                      {slice.reason ? ` — ${slice.reason}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="egw-num font-brand text-[13px] font-bold text-egw-ink">
                      {slice.count}
                    </span>
                    <StatusPill status={STATO_CLASSE[slice.disposal]} size="sm" />
                  </div>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {rapporto ? (
        <InsetBlock className="flex flex-col gap-1.5">
          <p className="font-brand text-[13px] font-semibold text-egw-ink">Cancellazione eseguita</p>
          <p className="font-brand text-[12px] text-egw-ink-62">
            Cancellate{" "}
            {Object.values(rapporto.deleted).reduce((a, b) => a + b, 0)} righe,
            anonimizzate{" "}
            {Object.values(rapporto.anonymized).reduce((a, b) => a + b, 0)}.
            {rapporto.retained.length
              ? ` Restano per obbligo di conservazione: ${rapporto.retained
                  .map((slice) => `${slice.label} (${slice.count})`)
                  .join(", ")}.`
              : ""}
          </p>
          {rapporto.manualReview.length ? (
            <p className="flex items-start gap-2 font-brand text-[12px] text-egw-amber-ink">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {rapporto.manualReview.length} righe riguardano anche altre
                persone e vanno rilette a mano:{" "}
                {rapporto.manualReview
                  .map((riga) => `${riga.table} ${riga.id}`)
                  .join(", ")}
                .
              </span>
            </p>
          ) : null}
        </InsetBlock>
      ) : null}

      {/*
        Il modale distruttivo del sistema (guideline 08 §8.9): niente chiusura
        sul velo, fuoco su «Annulla», il pulsante rosso a contorno — e non
        `window.confirm`, che il browser puo sopprimere dopo il primo uso e che
        dentro una webview puo non comparire affatto: l'operazione irreversibile
        partirebbe senza che nessuno abbia confermato niente.

        Il dialogo non si chiude da solo: la chiusura la decide l'esito.
        Chiudere prima della risposta lascerebbe l'operatore senza sapere se il
        gettone e stato accettato.
      */}
      <Modal
        open={dialogoAperto}
        onOpenChange={(aperto) => {
          if (inCorso) return;
          setDialogoAperto(aperto);
          if (!aperto) {
            setRiconosceMinore(false);
            setParolaScritta("");
          }
        }}
        tone="danger"
        strict
        icon={<AlertTriangle />}
        initialFocusRef={annullaRef}
        title={`Cancellare i dati di ${inventario?.subjectLabel || athleteName || "questa persona"}?`}
        footer={
          <>
            <Button ref={annullaRef} variant="secondary" onClick={() => setDialogoAperto(false)} disabled={inCorso}>
              Annulla
            </Button>
            <Button
              variant="danger"
              disabled={!confermaAbilitata || inCorso || !parolaCoincide}
              loading={inCorso}
              onClick={() => void cancella()}
            >
              Cancella definitivamente
            </Button>
          </>
        }
      >
        <div className="rounded-egw-field border border-egw-tint-red-bd bg-egw-tint-red px-4 py-3 font-brand text-[12.5px] leading-[1.55] text-egw-ink">
          <p>
            <strong>L&apos;operazione non si annulla.</strong>{" "}
            {inventario?.totals.toDelete ?? 0} righe vengono cancellate e{" "}
            {inventario?.totals.toAnonymize ?? 0} restano senza piu nominare
            nessuno — l&apos;anagrafica compresa, che resta come segnaposto
            finche esistono movimenti di denaro che la citano.
          </p>
          <p className="mt-2">
            {inventario?.totals.retained ?? 0} righe <strong>non</strong> vengono
            toccate: sono documenti fiscali, incassi e contributi che la societa
            e tenuta a conservare.
          </p>
          <p className="mt-2">
            I file depositati vengono rimossi anche dall&apos;archivio dei byte,
            e questo passo non e in una transazione: se si interrompe lascia
            meno dati, mai di piu, e ripetere l&apos;operazione la completa.
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {minoreDaRiconoscere ? (
            /*
              Il server pretende `acknowledgeMinor` quando l'inventario dice
              `isMinor` — e un'anagrafica **senza data di nascita** si tratta
              come minore. La casella e qui perche la conferma la deve dare
              una persona, non il codice che compone la richiesta.
            */
            <label className="flex items-start gap-2.5 rounded-egw-field border border-egw-tint-red-bd bg-egw-tint-red p-3 font-brand text-[12.5px] leading-[1.5] text-egw-ink">
              <Checkbox
                className="mt-0.5"
                checked={riconosceMinore}
                onChange={(evento) => setRiconosceMinore(evento.target.checked)}
                aria-label="Confermo di aver letto cosa verra distrutto"
              />
              <span>
                Questa persona risulta <strong>minorenne</strong> (o non ha
                una data di nascita in archivio). Confermo di aver letto il
                riepilogo di cio che verra distrutto.
              </span>
            </label>
          ) : null}

          <Field label="Motivo" optional htmlFor="motivo-cancellazione" helper="Resta nel registro.">
            <Textarea
              id="motivo-cancellazione"
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="Es. richiesta della famiglia del 12/03"
              rows={2}
            />
          </Field>

          <Field
            label={
              <>
                Scrivi <strong className="text-egw-ink">{PAROLA_DI_CONFERMA}</strong> per confermare
              </>
            }
            htmlFor="parola-cancellazione"
          >
            <TextInput
              id="parola-cancellazione"
              value={parolaScritta}
              onChange={(evento) => setParolaScritta(evento.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
