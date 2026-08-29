"use client";

import React, { useMemo, useState } from "react";
import { Loader2, Printer, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  SelectAllCheckbox,
  SelectRowCheckbox,
  useListSelection,
} from "@/components/ui/list-selection";
import { describeSelection } from "@/lib/list-selection";
import { useToast } from "@/components/ui/use-toast";
import {
  generateDocuments,
  previewFilledDocument,
  type DocumentTemplateSummary,
} from "@/lib/api/documents";
import {
  applySliceOutcome,
  batchProgress,
  clearStoredBatch,
  pendingSubjects,
  retryFailures,
  sliceCount,
  sliceSubjects,
  startBatch,
  BULK_GENERATION_SLICE,
  writeStoredBatch,
  type BulkBatchState,
} from "./bulk-generation";
import {
  BUNDLE_HTML_LIMIT_BYTES,
  buildDocumentBundleHtml,
  openBundleWindow,
  openPrintableBundle,
  planBundleParts,
  readGeneratedDocumentHtml,
  renderBundleInto,
  type BundleDocument,
} from "./document-bundle";

/**
 * Generare lo stesso documento per molti atleti in una volta sola.
 *
 * **Cosa risolve.** «Seleziono venti atleti, genero venti attestazioni, le
 * stampo» erano venti aperture di scheda (G-43). Qui sono una selezione, un
 * lotto e un fascicolo.
 *
 * **Le tre cose che questo dialogo deve fare bene**, e sono le uniche tre che
 * in un lotto si rompono davvero:
 *
 * 1. **arrivare in fondo a fette**, perche il server ne accetta cinquanta per
 *    chiamata: cento atleti sono due chiamate con lo **stesso** `batch_id`;
 * 2. **riprendere**, perche una segreteria ricarica la pagina: l'identificativo
 *    e cio che e gia stato servito vivono in `sessionStorage`, e rieseguire una
 *    fetta gia andata non produce doppioni — lo impedisce l'indice unico del
 *    database, non un controllo in memoria;
 * 3. **dire chi non e passato, e perche**: un conteggio ottimista consegna
 *    novantasette documenti dicendo che sono cento.
 *
 * Le regole del lotto stanno in `./bulk-generation`, il fascicolo in
 * `./document-bundle`: qui c'e solo cio che React deve fare.
 */

export type BulkGenerationAthlete = {
  id: string;
  label: string;
};

type Stage = "select" | "preview" | "running" | "done";

/** L'anteprima misurata su un atleta solo. Vedi `avviaAnteprima`. */
type SamplePreview = {
  count: number;
  sampleLabel: string;
  missing: string[];
  unresolved: string[];
  warnings: string[];
  error: string | null;
};

export function BulkGenerationDialog({
  template,
  athletes,
  seasonId,
  resume,
  onClose,
  onCompleted,
}: {
  template: DocumentTemplateSummary;
  athletes: readonly BulkGenerationAthlete[];
  seasonId: string | null;
  /** Il lotto lasciato a meta da un ricaricamento della pagina. */
  resume: BulkBatchState | null;
  onClose: () => void;
  /** Chiamata quando il lotto ha finito: l'elenco dei generati va riletto. */
  onCompleted: () => void;
}) {
  const { showToast } = useToast();
  const selection = useListSelection();

  const [stage, setStage] = useState<Stage>(resume ? "running" : "select");
  const [batch, setBatch] = useState<BulkBatchState | null>(resume);
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<SamplePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);
  const [interrupted, setInterrupted] = useState<string | null>(
    resume ? "Il lotto era stato interrotto: riprende da dove si era fermato." : null,
  );
  const [bundleParts, setBundleParts] = useState<BundleDocument[][] | null>(null);
  const [bundling, setBundling] = useState(false);

  /*
    I documenti prodotti che non si sono potuti **rileggere**. Non e la stessa
    cosa di un fallimento di generazione: quelli il lotto li conosce e li
    elenca. Questi sono documenti che esistono e che il fascicolo non e
    riuscito a prendere — rete, sessione, un permesso cambiato nel frattempo.
  */
  const [bundleGap, setBundleGap] = useState<{
    documenti: BundleDocument[];
    mancanti: number;
  } | null>(null);
  /** Quanti ne mancano al fascicolo gia diviso in parti. */
  const [bundleMissing, setBundleMissing] = useState(0);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return athletes;
    return athletes.filter((athlete) =>
      athlete.label.toLowerCase().includes(term),
    );
  }, [athletes, search]);

  const filteredIds = useMemo(
    () => filtered.map((athlete) => athlete.id),
    [filtered],
  );

  const progress = batch ? batchProgress(batch) : null;

  /**
   * L'anteprima, prima di produrre cento fogli.
   *
   * Si misura su **un** atleta, il primo selezionato, e lo dice: e la stessa
   * scelta del `sample` dell'anteprima delle comunicazioni di Wave 2. Chiedere
   * al server la risoluzione di tutti e cento vorrebbe dire fare il lavoro due
   * volte — e le letture di cassa e presenze sono il pezzo caro — mentre un
   * segnaposto che manca manca quasi sempre per come e scritto il **modello**,
   * non per quel singolo atleta.
   */
  const avviaAnteprima = async () => {
    const scelti = athletes.filter((athlete) => selection.isSelected(athlete.id));
    if (!scelti.length) {
      showToast("error", "Seleziona almeno un atleta");
      return;
    }

    setPreviewing(true);

    const { preview: campione, error } = await previewFilledDocument({
      templateId: template.id,
      athleteId: scelti[0].id,
      seasonId,
    });

    setPreviewing(false);

    setPreview({
      count: scelti.length,
      sampleLabel: scelti[0].label,
      missing: campione?.missing || [],
      unresolved: campione?.unresolved || [],
      warnings: campione?.warnings || [],
      error: campione ? null : error || "Anteprima non disponibile",
    });
    setStage("preview");
  };

  /**
   * Il lotto, fetta per fetta.
   *
   * Dopo **ogni** fetta lo stato si scrive: e il momento in cui un
   * ricaricamento smette di costare qualcosa. La fetta successiva parte da cio
   * che resta, non dall'indice di un ciclo che un F5 avrebbe cancellato.
   */
  const eseguiLotto = async (partenza: BulkBatchState) => {
    setRunning(true);
    setInterrupted(null);
    setStage("running");

    let stato = partenza;
    let restanti = pendingSubjects(stato);

    while (restanti.length) {
      const fetta = sliceSubjects(restanti)[0];

      const { outcome, error } = await generateDocuments({
        templateId: stato.templateId,
        subjects: fetta.map((soggetto) => ({
          kind: stato.subjectKind,
          id: soggetto.id,
        })),
        seasonId: stato.seasonId,
        batchId: stato.batchId,
      });

      if (!outcome) {
        /*
          La chiamata non e arrivata: rete caduta, sessione scaduta, permesso
          negato. Non e un fallimento per soggetto — nessuno di questi
          cinquanta e stato servito — quindi non finisce fra i falliti: il
          lotto si ferma e resta ripartibile.
        */
        setBatch(stato);
        writeStoredBatch(stato);
        setInterrupted(error || "Il lotto si e fermato: puoi riprenderlo");
        setRunning(false);
        return;
      }

      stato = applySliceOutcome(stato, {
        produced: outcome.produced.map((document) => ({
          id: document.id,
          subjectId: document.subjectId,
          label: document.subjectLabel || "",
          missing: document.missing || [],
        })),
        failed: outcome.failed.map((failure) => ({
          subjectId: failure.subject.id,
          reason: failure.reason,
        })),
      });

      setBatch(stato);
      writeStoredBatch(stato);

      const prima = restanti.length;
      restanti = pendingSubjects(stato);

      if (restanti.length >= prima) {
        /*
          Il server ha risposto senza dire niente di questi soggetti: senza
          questa uscita il ciclo rispedirebbe la stessa fetta per sempre.
        */
        setInterrupted(
          "Il server ha risposto senza dire cosa e successo a questi atleti: il lotto si ferma qui",
        );
        setRunning(false);
        return;
      }
    }

    setRunning(false);
    setStage("done");
    onCompleted();
  };

  const avviaLotto = () => {
    const scelti = athletes.filter((athlete) => selection.isSelected(athlete.id));
    if (!scelti.length) return;

    /*
      L'identificativo nasce **qui**, una volta sola per tutto il lotto: e cio
      che rende due chiamate lo stesso gesto, e la terza — quella dopo il
      ricaricamento — innocua.
    */
    void eseguiLotto(
      startBatch({
        templateId: template.id,
        templateTitle: template.title,
        subjectKind: template.subjectKind,
        seasonId,
        subjects: scelti,
      }),
    );
  };

  const riprovaFalliti = () => {
    if (!batch) return;
    void eseguiLotto(retryFailures(batch));
  };

  /**
   * Compone il fascicolo con cio che si e riusciti a leggere, e lo dice.
   *
   * `mancanti` viaggia fino all'intestazione della pagina: un fascicolo a cui
   * manca qualcosa deve **dichiararlo sul foglio**, non solo in un dialogo che
   * si chiude. Chi lo stampa e chi lo ritrova fra un mese sono due persone
   * diverse.
   */
  const componiFascicolo = (
    documenti: BundleDocument[],
    mancanti: number,
    finestra?: Window | null,
  ) => {
    if (!batch) return;

    const parti = planBundleParts(documenti);

    if (parti.length > 1) {
      /*
        Sopra la soglia non si tronca in silenzio: si dice, e si propone la
        divisione. Un fascicolo incompleto che sembra completo e peggio di due
        fascicoli.
      */
      finestra?.close();
      setBundleMissing(mancanti);
      setBundleParts(parti);
      return;
    }

    setBundleParts(null);
    const html = buildDocumentBundleHtml({
      title: batch.templateTitle,
      documents: parti[0],
      missingCount: mancanti,
    });

    if (finestra) {
      renderBundleInto(finestra, html);
      return;
    }

    if (!openPrintableBundle(html)) {
      showToast("error", "Il browser ha bloccato la finestra del fascicolo");
    }
  };

  /**
   * Il fascicolo: si legge il conservato, non si rigenera niente.
   *
   * L'HTML arriva dalla rotta del singolo documento perche i riepiloghi che
   * tornano dalla generazione non lo portano — il perche sta in
   * `./document-bundle`.
   *
   * **Cosa succede a un documento che non si rilegge.** Prima veniva saltato e
   * basta: `readGeneratedDocumentHtml` restituisce anche `error`, e quel ramo
   * lo buttava via. Il fascicolo usciva con novantasette fogli e
   * un'intestazione che diceva «97 documenti» — un fascicolo incompleto che
   * sembra completo, cioe l'errore contro cui il modulo accanto e scritto. Ora
   * le letture fallite si contano, si dicono **prima** di aprire, e chi guarda
   * sceglie: stampare i novantasette dichiarandolo, o riprovare.
   */
  const apriFascicolo = async (parte?: BundleDocument[]) => {
    if (!batch) return;

    if (parte) {
      const aperto = openPrintableBundle(
        buildDocumentBundleHtml({
          title: batch.templateTitle,
          documents: parte,
          partLabel: `parte ${(bundleParts || []).indexOf(parte) + 1} di ${(bundleParts || []).length}`,
          missingCount: bundleMissing,
        }),
      );
      if (!aperto) {
        showToast("error", "Il browser ha bloccato la finestra del fascicolo");
      }
      return;
    }

    /*
      La finestra si apre **prima** delle letture: aperta dopo, il browser non
      la collega piu al clic e la blocca come una finestra pubblicitaria.
    */
    const finestra = openBundleWindow();
    if (!finestra) {
      showToast("error", "Il browser ha bloccato la finestra del fascicolo");
      return;
    }

    setBundling(true);
    setBundleGap(null);

    const documenti: BundleDocument[] = [];
    let mancanti = 0;

    for (const id of batch.producedIds) {
      const { html } = await readGeneratedDocumentHtml(id);
      if (html) {
        documenti.push({ id, title: batch.templateTitle, html });
      } else {
        /*
          Il motivo della singola lettura non si mostra: sono cento righe e il
          motivo e lo stesso per tutte — quello che conta e **quanti** non ci
          sono, perche e cio che rende il fascicolo incompleto.
        */
        mancanti += 1;
      }
    }

    setBundling(false);

    if (!documenti.length) {
      finestra.close();
      showToast("error", "Nessun documento leggibile per il fascicolo");
      return;
    }

    if (mancanti) {
      finestra.close();
      setBundleGap({ documenti, mancanti });
      return;
    }

    setBundleMissing(0);
    componiFascicolo(documenti, 0, finestra);
  };

  /** Chiudere a lotto finito butta via lo stato: quel lotto non si riprende. */
  const chiudi = (concluso: boolean) => {
    if (concluso) clearStoredBatch();
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open) return;
        /*
          Chiudere a meta **non** cancella il lotto: e proprio la chiusura
          accidentale il caso in cui la ripresa serve.
        */
        chiudi(stage === "done" && !batch?.failures.length);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-words">
            Genera «{template.title}» per piu atleti
          </DialogTitle>
        </DialogHeader>

        {stage === "select" ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Un documento per atleta, con la versione pubblicata del modello.
              Si procede a fette da {BULK_GENERATION_SLICE}: se ricarichi la
              pagina il lotto riprende da dove era, e i documenti gia prodotti
              non si duplicano.
            </p>

            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                className="pl-10"
                placeholder="Cerca per nome o cognome..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <SelectAllCheckbox
                selection={selection}
                ids={filteredIds}
                label="gli atleti in elenco"
              />
              <span>
                Seleziona i {filtered.length}{" "}
                {filtered.length === 1 ? "atleta filtrato" : "atleti filtrati"}
              </span>
              <span className="ml-auto font-medium" aria-live="polite">
                {describeSelection(selection.count, {
                  one: "atleta",
                  many: "atleti",
                })}
              </span>
            </div>

            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
              {filtered.length ? (
                filtered.map((athlete) => (
                  <label
                    key={athlete.id}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
                  >
                    <SelectRowCheckbox
                      selection={selection}
                      id={athlete.id}
                      label={athlete.label}
                    />
                    <span className="min-w-0 break-words">{athlete.label}</span>
                  </label>
                ))
              ) : (
                <p className="px-2 py-6 text-center text-sm text-slate-500">
                  Nessun atleta trovato.
                </p>
              )}
            </div>
          </div>
        ) : null}

        {stage === "preview" && preview ? (
          <div className="space-y-3 py-2 text-sm">
            <p className="font-medium text-slate-900">
              Stai per generare {preview.count}{" "}
              {preview.count === 1 ? "documento" : "documenti"}, in{" "}
              {sliceCount(preview.count)}{" "}
              {sliceCount(preview.count) === 1 ? "chiamata" : "chiamate"} da al
              piu {BULK_GENERATION_SLICE}.
            </p>

            {preview.error ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                Non si e potuta calcolare l&apos;anteprima su «
                {preview.sampleLabel}»: {preview.error}
              </p>
            ) : null}

            {preview.warnings.length ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <ul className="list-disc space-y-1 pl-4">
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {preview.missing.length || preview.unresolved.length ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <p className="font-medium">
                  Su «{preview.sampleLabel}» questi campi restano bianchi
                </p>
                <p className="mt-1 break-words">
                  {[...preview.missing, ...preview.unresolved].join(", ")}
                </p>
                <p className="mt-2 text-xs">
                  L&apos;anteprima e misurata su un atleta solo. Un segnaposto
                  che manca qui manca quasi sempre per come e scritto il
                  modello, quindi mancherebbe su tutti: correggi il modello
                  prima di stampare {preview.count} fogli.
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">
                Su «{preview.sampleLabel}» il modello si compila per intero.
              </p>
            )}
          </div>
        ) : null}

        {stage === "running" || stage === "done" ? (
          <div className="space-y-4 py-2 text-sm">
            {/*
              L'avanzamento si **annuncia**: per chi non vede la barra, un
              lotto da cento atleti era due minuti di silenzio assoluto — nessun
              modo di sapere se stava andando avanti, se era finito o se si era
              fermato. `polite` e non `assertive` perche non interrompe cio che
              si sta leggendo: arriva fra una fetta e l'altra.
            */}
            {progress ? (
              <div className="space-y-2" role="status" aria-live="polite">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">
                    {progress.served} di {progress.total} serviti
                  </span>
                  <span className="text-muted-foreground">
                    {batch?.producedIds.length || 0} prodotti,{" "}
                    {batch?.failures.length || 0} falliti
                  </span>
                </div>
                <Progress
                  value={progress.percent}
                  aria-label="Avanzamento del lotto"
                />
                {stage === "done" ? (
                  <p className="text-muted-foreground">
                    Lotto concluso: {batch?.producedIds.length || 0}{" "}
                    {batch?.producedIds.length === 1 ? "documento" : "documenti"}{" "}
                    prodotti
                    {batch?.failures.length
                      ? `, ${batch.failures.length} non generati`
                      : ""}
                    .
                  </p>
                ) : null}
              </div>
            ) : null}

            {/*
              L'interruzione e un `alert`: e la sola cosa che chiede un gesto
              subito — riprendere, o lasciar perdere — e aspettare la fine
              della frase in corso vorrebbe dire scoprirla dopo aver chiuso.
            */}
            {interrupted ? (
              <p
                role="alert"
                className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900"
              >
                {interrupted}
              </p>
            ) : null}

            {/*
              Le letture mancate: si dicono **prima** di aprire il fascicolo, e
              con le due strade aperte. Chiuderlo qui e ammettere di non sapere
              cosa ci sia dentro.
            */}
            {bundleGap ? (
              <div
                role="alert"
                className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900"
              >
                <p className="font-medium">
                  {bundleGap.mancanti}{" "}
                  {bundleGap.mancanti === 1
                    ? "documento non si e potuto leggere"
                    : "documenti non si sono potuti leggere"}
                </p>
                <p className="mt-1 text-xs">
                  Sono stati prodotti e restano in «Documenti generati»: e la
                  rilettura per il fascicolo che non e riuscita. Il fascicolo
                  puo uscire lo stesso con {bundleGap.documenti.length}, e lo
                  dichiara in intestazione.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const gap = bundleGap;
                      setBundleGap(null);
                      setBundleMissing(gap.mancanti);
                      componiFascicolo(gap.documenti, gap.mancanti);
                    }}
                  >
                    <Printer className="mr-2 h-4 w-4" aria-hidden />
                    Continua con {bundleGap.documenti.length}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setBundleGap(null);
                      void apriFascicolo();
                    }}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                    Riprova la lettura
                  </Button>
                </div>
              </div>
            ) : null}

            {batch?.failures.length ? (
              <div>
                <p className="font-medium text-slate-900">
                  Non generati, e il motivo
                </p>
                {/*
                  Una tabella non si restringe: senza contenitore scrollabile a
                  375 px allargherebbe tutto il dialogo.
                */}
                <div className="mt-2 overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs uppercase text-slate-500">
                        <th className="px-3 py-2">Atleta</th>
                        <th className="px-3 py-2">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batch.failures.map((failure) => (
                        <tr
                          key={`${failure.id}-${failure.reason}`}
                          className="border-b last:border-0"
                        >
                          <td className="px-3 py-2 font-medium text-slate-900">
                            {failure.label}
                          </td>
                          <td className="px-3 py-2 break-words text-slate-600">
                            {failure.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {batch?.blanks.length ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <p className="font-medium">
                  Prodotti, ma con campi rimasti bianchi
                </p>
                <p className="mt-1 text-xs">
                  Non e un fallimento: il documento esiste. Chi lo consegna deve
                  saperlo prima, non dopo.
                </p>
                <ul className="mt-2 space-y-1">
                  {batch.blanks.map((blank) => (
                    <li key={blank.id} className="break-words">
                      <span className="font-medium">{blank.label}</span>:{" "}
                      {blank.keys.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {bundleParts && bundleParts.length > 1 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <p className="font-medium">
                  Il fascicolo supera{" "}
                  {Math.round(BUNDLE_HTML_LIMIT_BYTES / (1024 * 1024))} MB
                </p>
                <p className="mt-1 text-xs">
                  Una pagina cosi grande la finestra di stampa la macina per
                  minuti. Si divide in {bundleParts.length} parti, e si stampano
                  una per una.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {bundleParts.map((parte, indice) => (
                    <Button
                      key={parte[0]?.id || indice}
                      size="sm"
                      variant="outline"
                      onClick={() => void apriFascicolo(parte)}
                    >
                      <Printer className="mr-2 h-4 w-4" aria-hidden />
                      Parte {indice + 1} di {bundleParts.length} (
                      {parte.length} documenti)
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* In colonna sotto i 640 px: tre azioni affiancate a 375 px si tagliano */}
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {stage === "select" ? (
            <>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => chiudi(false)}
              >
                Annulla
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => void avviaAnteprima()}
                disabled={previewing || !selection.count}
              >
                {previewing ? "Calcolo..." : "Vedi cosa verra generato"}
              </Button>
            </>
          ) : null}

          {stage === "preview" ? (
            <>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setStage("select")}
              >
                Torna alla selezione
              </Button>
              <Button className="w-full sm:w-auto" onClick={avviaLotto}>
                Genera {preview?.count}{" "}
                {preview?.count === 1 ? "documento" : "documenti"}
              </Button>
            </>
          ) : null}

          {stage === "running" || stage === "done" ? (
            <>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => chiudi(stage === "done" && !batch?.failures.length)}
                disabled={running}
              >
                Chiudi
              </Button>

              {/*
                «Riprendi» solo se resta davvero qualcosa da servire: su un
                lotto interrotto in cui tutti sono passati, il gesto giusto e
                «riprova i falliti», qui sotto.
              */}
              {interrupted && batch && !running && pendingSubjects(batch).length ? (
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => void eseguiLotto(batch)}
                >
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                  Riprendi il lotto
                </Button>
              ) : null}

              {batch?.failures.length && !running ? (
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={riprovaFalliti}
                >
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                  Riprova i {batch.failures.length} falliti
                </Button>
              ) : null}

              <Button
                className="w-full sm:w-auto"
                onClick={() => void apriFascicolo()}
                disabled={running || bundling || !batch?.producedIds.length}
              >
                {bundling ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Printer className="mr-2 h-4 w-4" aria-hidden />
                )}
                {bundling ? "Preparazione..." : "Apri il fascicolo da stampare"}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BulkGenerationDialog;
