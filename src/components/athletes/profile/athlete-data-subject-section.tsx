"use client";

import { useCallback, useState } from "react";
import { downloadClientFileUrl } from "@/lib/client-files";
import {
  AlertTriangle,
  Download,
  Eye,
  FileWarning,
  Loader2,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const VARIANTE_CLASSE: Record<Disposal, "destructive" | "secondary" | "outline"> =
  {
    delete: "destructive",
    anonymize: "secondary",
    retain: "outline",
  };

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

  return (
    <Card id="dati-personali" className="border-red-200 dark:border-red-900/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4" />
          Dati personali
        </CardTitle>
        <CardDescription>
          I dati di una persona non stanno tutti nella sua scheda: vivono anche
          su file, consensi, richieste e moduli che cancellare l&apos;anagrafica
          non tocca. Da qui si vede l&apos;elenco completo, lo si porta via, e lo
          si distrugge — una volta sola e senza tornare indietro.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => void caricaInventario()}
            disabled={caricamento}
          >
            {caricamento ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Eye className="mr-2 h-4 w-4" />
            )}
            {inventario ? "Aggiorna il riepilogo" : "Mostra cosa contiene"}
          </Button>

          {puoEsportare ? (
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => void esporta()}
              disabled={inCorso}
            >
              <Download className="mr-2 h-4 w-4" />
              Esporta i dati
            </Button>
          ) : null}

          {puoCancellare ? (
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
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
              <Trash2 className="mr-2 h-4 w-4" />
              Cancella i dati personali
            </Button>
          ) : null}
        </div>

        {errore ? (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {errore}
          </p>
        ) : null}

        {clinicoOmesso ? (
          <p className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
            {/*
              L'export lo dichiara (`clinicalContentOmitted`) e la schermata non
              lo tace: chi riceve un export che non dice cosa non contiene lo
              crede completo.
            */}
            Il file scaricato <strong>non contiene il contenuto clinico</strong>
            {" "}
            (note, patologie, farmaci): serve il permesso di lettura del dato
            sanitario.
          </p>
        ) : null}

        {inventario ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">
                {inventario.subjectLabel}
              </span>
              {inventario.isMinor ? (
                <Badge variant="destructive">Minorenne</Badge>
              ) : null}
              <Badge variant="outline">
                {inventario.totals.rows} righe in tutto
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Cancellate</p>
                <p className="text-lg font-semibold">
                  {inventario.totals.toDelete}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Anonimizzate</p>
                <p className="text-lg font-semibold">
                  {inventario.totals.toAnonymize}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Conservate</p>
                <p className="text-lg font-semibold">
                  {inventario.totals.retained}
                </p>
              </div>
            </div>

            {/*
              Una lista di schede e non una tabella: a 375 px una tabella a
              quattro colonne o si taglia o si comprime fino a diventare
              illeggibile, e questa e la schermata in cui la riga che non si
              legge e quella che dice cosa non torna indietro.
            */}
            <ul className="space-y-2">
              {inventario.slices
                .filter((slice) => slice.count > 0)
                .map((slice) => (
                  <li
                    key={slice.table}
                    className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{slice.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {slice.table}
                        {slice.reason ? ` — ${slice.reason}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm tabular-nums">
                        {slice.count}
                      </span>
                      <Badge variant={VARIANTE_CLASSE[slice.disposal]}>
                        {ETICHETTA_CLASSE[slice.disposal]}
                      </Badge>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        {rapporto ? (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Cancellazione eseguita</p>
            <p className="text-xs text-muted-foreground">
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
              <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {rapporto.manualReview.length} righe riguardano anche altre
                persone e vanno rilette a mano:{" "}
                {rapporto.manualReview
                  .map((riga) => `${riga.table} ${riga.id}`)
                  .join(", ")}
                .
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>

      {/*
        `AlertDialog` e la primitiva di conferma che il prodotto gia possiede —
        la stessa di `/dashboard/access-management` e `/appuntamenti` — e non
        `window.confirm`, che il browser puo sopprimere dopo il primo uso e che
        dentro una webview puo non comparire affatto: l'operazione irreversibile
        partirebbe senza che nessuno abbia confermato niente.
      */}
      <AlertDialog
        open={dialogoAperto}
        onOpenChange={(aperto) => {
          setDialogoAperto(aperto);
          if (!aperto) setRiconosceMinore(false);
        }}
      >
        <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cancellare i dati di{" "}
              {inventario?.subjectLabel || athleteName || "questa persona"}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>
                  <strong>L&apos;operazione non si annulla.</strong>{" "}
                  {inventario?.totals.toDelete ?? 0} righe vengono cancellate e{" "}
                  {inventario?.totals.toAnonymize ?? 0} restano senza piu
                  nominare nessuno — l&apos;anagrafica compresa, che resta come
                  segnaposto finche esistono movimenti di denaro che la citano.
                </p>
                <p>
                  {inventario?.totals.retained ?? 0} righe{" "}
                  <strong>non</strong> vengono toccate: sono documenti fiscali,
                  incassi e contributi che la societa e tenuta a conservare.
                </p>
                <p>
                  I file depositati vengono rimossi anche dall&apos;archivio dei
                  byte, e questo passo non e in una transazione: se si
                  interrompe lascia meno dati, mai di piu, e ripetere
                  l&apos;operazione la completa.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            {minoreDaRiconoscere ? (
              /*
                Il server pretende `acknowledgeMinor` quando l'inventario dice
                `isMinor` — e un'anagrafica **senza data di nascita** si tratta
                come minore. La casella e qui perche la conferma la deve dare
                una persona, non il codice che compone la richiesta.
              */
              <label className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900/60 dark:bg-red-950/30">
                <Checkbox
                  checked={riconosceMinore}
                  onCheckedChange={(valore) =>
                    setRiconosceMinore(valore === true)
                  }
                  aria-label="Confermo di aver letto cosa verra distrutto"
                />
                <span>
                  Questa persona risulta <strong>minorenne</strong> (o non ha
                  una data di nascita in archivio). Confermo di aver letto il
                  riepilogo di cio che verra distrutto.
                </span>
              </label>
            ) : null}

            <div className="space-y-1">
              <Label htmlFor="motivo-cancellazione">
                Motivo (facoltativo, resta nel registro)
              </Label>
              <Textarea
                id="motivo-cancellazione"
                value={motivo}
                onChange={(evento) => setMotivo(evento.target.value)}
                placeholder="Es. richiesta della famiglia del 12/03"
                rows={2}
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={!confermaAbilitata || inCorso}
              onClick={(evento) => {
                /*
                  Il dialogo non si chiude da solo: la chiusura la decide
                  l'esito. Chiudere prima della risposta lascerebbe l'operatore
                  senza sapere se il gettone e stato accettato.
                */
                evento.preventDefault();
                void cancella();
              }}
            >
              Cancella definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
