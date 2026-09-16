"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Check,
  History,
  Loader2,
  MessageSquareWarning,
  Paperclip,
  ShieldCheck,
  UserPlus,
  UserRoundSearch,
  X,
} from "lucide-react";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { Checkbox } from "@/components/ui/checkbox";
import { SUBMISSION_STATUS } from "@/components/modulistica/v2/modulistica-model";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  fieldCollectsAnswer,
  FORM_LEGAL_KIND_LABELS,
  FORM_SUBMISSION_SOURCE_LABELS,
  formatAnswer,
  resolveSubmissionFileUrl,
  submissionIsOpen,
} from "@/lib/forms/model";
import {
  DUPLICATE_MATCH_LABELS,
  type FormFieldChange,
  type FormSubjectChange,
} from "@/lib/forms/changes";
import {
  MissingDocumentsField,
  collectMissingDocuments,
  type MissingDocumentDraft,
} from "./missing-documents-field";
import * as formsApi from "@/lib/api/forms";

/**
 * Cosa cambia se approvo.
 *
 * E la schermata che decide se la coda serve a qualcosa. Una compilazione
 * approvata modifica l'anagrafica del club a partire da cio che ha digitato
 * qualcuno che aveva un link: la segreteria deve vedere, **prima**, quale
 * scheda viene toccata, quale valore c'e adesso e quale ci sarebbe dopo.
 *
 * Tre cose che questa finestra non fa mai:
 * - non decide al posto della segreteria quando trova un omonimo: lo mostra,
 *   dice perche somiglia, e lascia scegliere;
 * - non nasconde le risposte che non aggiornano nulla: «cosa ha risposto» e
 *   una domanda legittima anche per una domanda libera;
 * - non promette. L'elenco che si legge qui e calcolato dalla stessa funzione
 *   che poi scrive.
 *
 * Da questa finestra si chiedono anche i **documenti che mancano**, e si
 * chiedono **approvando**: e il punto in cui l'iscrizione e il fascicolo
 * documentale si saldano. Prima l'unica risposta a «manca il certificato» era
 * il rifiuto — e il rifiuto rimanda indietro un'iscrizione buona.
 */

type SubmissionReviewDialogProps = {
  submissionId: string;
  onClose: () => void;
  onReviewed: () => void;
};

const CHANGE_TONES: Record<FormFieldChange["kind"], string> = {
  add: "border-egw-tint-green-bd bg-egw-tint-green text-egw-green",
  replace: "border-egw-tint-amber-bd bg-egw-tint-amber text-egw-amber-ink",
  unchanged: "border-egw-hairline bg-white text-egw-ink-62",
  empty: "border-egw-hairline bg-white text-egw-ink-42",
};

const CHANGE_LABELS: Record<FormFieldChange["kind"], string> = {
  add: "Nuovo",
  replace: "Sostituito",
  unchanged: "Identico",
  empty: "Non risposto",
};

export function SubmissionReviewDialog({
  submissionId,
  onClose,
  onReviewed,
}: SubmissionReviewDialogProps) {
  const { showToast } = useToast();
  const [review, setReview] = useState<formsApi.SubmissionReviewPayload | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  /*
    Cio che la decisione **non** e riuscita a fare. Non e un errore
    dell'operazione — l'anagrafica e stata scritta — ed e per questo che finiva
    in un avviso passeggero invece che qui.
  */
  const [issues, setIssues] = useState<string[]>([]);

  /* I documenti che mancano, da chiedere approvando. Vuoto: non si chiede nulla. */
  const [missingDocuments, setMissingDocuments] = useState<
    MissingDocumentDraft[]
  >([]);

  /*
    ADR-0189/0193: la persona in prova che questa pratica riconosce (nessuna
    scelta automatica), i campi da chiedere in integrazione, e il pannello
    dell'integrazione aperto o chiuso.
  */
  const [trialToUse, setTrialToUse] = useState<string | null>(null);
  const [dismissedTrials, setDismissedTrials] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestedFieldIds, setRequestedFieldIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReview(await formsApi.fetchSubmissionReview(submissionId));
    } catch (error: any) {
      showToast("error", error?.message || "Non riesco a leggere la compilazione");
      onClose();
    } finally {
      setLoading(false);
    }
  }, [submissionId, showToast, onClose]);

  useEffect(() => {
    void load();
  }, [load]);

  const linkToExisting = async (subject: string, recordId: string, label: string) => {
    if (!review) return;
    setBusy(true);
    try {
      const subjects = review.submission.subjects.some(
        (selection) => selection.subject === subject,
      )
        ? review.submission.subjects.map((selection) =>
            selection.subject === subject
              ? { ...selection, recordId, label }
              : selection,
          )
        : [
            ...review.submission.subjects,
            { subject: subject as any, recordId, label },
          ];

      setReview(await formsApi.previewSubmissionReview(submissionId, subjects));
    } catch (error: any) {
      showToast("error", error?.message || "Non riesco a ricalcolare l'anteprima");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (action: "approve" | "reject" | "request_changes" | "archive") => {
    if (!review) return;
    if (action === "request_changes" && !requestedFieldIds.length && !note.trim()) {
      showToast("error", "Indica almeno un campo da correggere o una nota per la famiglia.");
      return;
    }
    setBusy(true);
    try {
      const outcome = await formsApi.decideSubmission(submissionId, {
        action,
        note,
        subjects: review.submission.subjects,
        fieldIds: action === "request_changes" ? requestedFieldIds : undefined,
        trialAthleteId: action === "approve" ? trialToUse : undefined,
        /*
          Solo approvando. Un documento si chiede a una pratica che va avanti:
          allegarlo a un rifiuto vorrebbe dire chiedere un certificato a chi si
          e appena sentito dire di no — e il server, che ricava l'atleta
          dall'approvazione, non avrebbe comunque nessuno a cui intestarlo.
        */
        documentRequests:
          action === "approve"
            ? collectMissingDocuments(missingDocuments)
            : undefined,
      });
      showToast(
        "success",
        action === "approve"
          ? outcome.applied.join(" · ") || "Pratica approvata"
          : action === "reject"
            ? "Pratica rifiutata"
            : action === "archive"
              ? "Pratica archiviata"
              : outcome.applied.join(" · ") || "Integrazione richiesta alla famiglia",
      );

      /* La coda si rilegge comunque: la decisione e stata presa. */
      onReviewed();

      /*
        **Cio che non e riuscito tiene aperta la finestra.**

        Prima era un avviso passeggero per ognuno, e la pila degli avvisi ne
        tiene **uno** (`TOAST_LIMIT` in `use-toast.ts`): approvando una
        compilazione con tre consensi falliti se ne vedeva uno, per cinque
        secondi, su un dialogo gia chiuso. Gli altri due — ognuno un consenso
        che il club crede di aver raccolto e non ha — sparivano senza lasciare
        traccia da nessuna parte.

        Un avviso passeggero e per una cosa che si puo perdere. Questi no: sono
        lavoro che qualcuno deve rifare a mano, e vanno letti prima di chiudere
        — come nel dialogo «Questo modello non si puo pubblicare», che elenca
        le ragioni una per una invece di riassumerle.
      */
      const problemi = (outcome.issues || []).filter(Boolean);
      if (problemi.length) {
        setIssues(problemi);
        return;
      }

      onClose();
    } catch (error: any) {
      showToast("error", error?.message || "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>Pratica di iscrizione</span>
            {review ? <StatusPill size="sm" status={SUBMISSION_STATUS[review.submission.status] || SUBMISSION_STATUS.pending} /> : null}
            {review && review.submission.revision > 1 ? (
              <span className="text-xs font-normal text-egw-ink-62">revisione {review.submission.revision}</span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {review
              ? `${review.submission.templateTitle} · versione ${review.submission.version} · ${FORM_SUBMISSION_SOURCE_LABELS[review.submission.source]}`
              : "Carico la compilazione…"}
          </DialogDescription>
        </DialogHeader>

        {issues.length ? (
          <section
            role="alert"
            className="space-y-3 rounded-egw-control border border-egw-tint-red-bd bg-egw-tint-red p-4 text-sm text-egw-red"
          >
            <h3 className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              La compilazione e stata registrata, ma queste cose non sono
              riuscite
            </h3>
            <ul className="list-disc space-y-1 pl-5">
              {issues.map((issue) => (
                <li key={issue} className="break-words">
                  {issue}
                </li>
              ))}
            </ul>
            <p className="text-xs">
              Ognuna e da rifare a mano: qui non c&apos;e un secondo tentativo
              automatico, e nessuno le ripropone. Segnale prima di chiudere.
            </p>
            <div className="flex justify-end">
              <Button type="button" onClick={onClose}>
                Ho capito
              </Button>
            </div>
          </section>
        ) : loading || !review ? (
          <p
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 py-10 text-sm text-egw-ink-72"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Calcolo la proposta…
          </p>
        ) : (
          <div className="space-y-6">
            {review.submission.status === "changes_requested" && review.submission.changesRequested ? (
              <section className="rounded-egw-control border border-egw-tint-orange-bd bg-egw-tint-orange p-4 text-sm">
                <h3 className="flex items-center gap-2 font-semibold text-egw-ink">
                  <MessageSquareWarning className="h-4 w-4" aria-hidden />
                  In attesa dell&apos;integrazione della famiglia
                </h3>
                <p className="mt-1 text-egw-ink-72">
                  Campi chiesti: {review.submission.changesRequested.fieldIds
                    .map((id) => review.submission.schema.fields.find((f) => f.id === id)?.label || id)
                    .join(", ") || "nessuno"}
                  {review.submission.changesRequested.note ? ` · «${review.submission.changesRequested.note}»` : ""}
                </p>
              </section>
            ) : null}

            {review.trialCandidates.length && !dismissedTrials && submissionIsOpen(review.submission.status) ? (
              /*
                **Possibile corrispondenza con una persona in prova** (ADR-0193).
                Si mostra, si spiega, si lascia scegliere: «Converti» usa la
                conversione canonica di ADR-0188 e poi completa la scheda con la
                pratica; «E un'altra persona» va avanti con una scheda nuova.
              */
              <section className="space-y-2 rounded-egw-control border border-egw-tint-amber-bd bg-egw-tint-amber p-4" data-test="trial-candidates">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-egw-amber-ink">
                  <UserRoundSearch className="h-4 w-4" />
                  Possibile corrispondenza con una persona in prova
                </h3>
                {review.trialCandidates.map((trial) => (
                  <div
                    key={trial.id}
                    className={`flex flex-col gap-2 rounded-egw-control border bg-white p-3 sm:flex-row sm:items-center ${trialToUse === trial.id ? "border-egw-green" : "border-egw-tint-amber-bd"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-egw-ink">{trial.name}</p>
                      <p className="text-xs text-egw-ink-72">
                        Atleta in prova · {trial.trialsCount} {trial.trialsCount === 1 ? "presenza" : "presenze"}
                        {trial.lastTrialAt ? ` · ultima prova ${new Date(trial.lastTrialAt).toLocaleDateString("it-IT")}` : ""}
                        {" · "}
                        {trial.sameBirthDate ? "stessa data di nascita" : "data di nascita diversa"}
                        {trial.categoryLabel ? ` · ${trial.categoryLabel}` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={trialToUse === trial.id ? "default" : "outline"}
                      disabled={busy}
                      onClick={() => setTrialToUse(trialToUse === trial.id ? null : trial.id)}
                    >
                      {trialToUse === trial.id ? "Verra convertita approvando" : "Collega / Converti"}
                    </Button>
                  </div>
                ))}
                <div>
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setDismissedTrials(true); setTrialToUse(null); }}>
                    E un&apos;altra persona
                  </Button>
                </div>
              </section>
            ) : null}

            {review.duplicates.length ? (
              <section className="space-y-2 rounded-egw-control border border-egw-tint-amber-bd bg-egw-tint-amber p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-egw-amber-ink">
                  <AlertTriangle className="h-4 w-4" />
                  Potrebbe essere una scheda che esiste gia
                </h3>
                {review.duplicates.map((duplicate) => (
                  <div
                    key={`${duplicate.subject}-${duplicate.recordId}`}
                    className="flex flex-col gap-2 rounded-egw-control border border-egw-tint-amber-bd bg-white p-3 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-egw-ink">
                        {duplicate.label}
                      </p>
                      <p className="text-xs text-egw-ink-72">
                        {duplicate.reasons
                          .map((reason) => DUPLICATE_MATCH_LABELS[reason])
                          .join(" · ")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        linkToExisting(
                          duplicate.subject,
                          duplicate.recordId,
                          duplicate.label,
                        )
                      }
                    >
                      Aggiorna questa scheda
                    </Button>
                  </div>
                ))}
              </section>
            ) : null}

            {review.changeSet.subjects.map((subject) => (
              <SubjectChanges key={subject.subject} subject={subject} />
            ))}

            {review.changeSet.subjects.length === 0 ? (
              <p className="rounded-egw-control border border-egw-hairline bg-egw-page-100 p-4 text-sm text-egw-ink-72">
                Nessun campo di questo modulo e collegato a un dato EasyGame:
                approvando non cambia niente in anagrafica, la compilazione
                resta archiviata com&apos;e.
              </p>
            ) : null}

            {review.changeSet.unmappedAnswers.length ? (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-egw-ink">
                  Altre risposte
                </h3>
                <dl className="divide-y divide-egw-rule rounded-egw-control border border-egw-hairline">
                  {review.changeSet.unmappedAnswers.map((answer) => (
                    <div
                      key={answer.fieldId}
                      className="grid grid-cols-1 gap-1 p-3 text-sm sm:grid-cols-3"
                    >
                      <dt className="text-egw-ink-72">{answer.label}</dt>
                      <dd className="text-egw-ink sm:col-span-2">
                        {answer.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            {review.submission.files.length ? (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-egw-ink">Allegati</h3>
                <ul className="space-y-1">
                  {review.submission.files.map((file) => (
                    <li key={`${file.fieldId}-${file.reference}`}>
                      <a
                        href={resolveSubmissionFileUrl(file.reference)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-egw-control border border-egw-hairline p-2 text-sm text-egw-blue-800 hover:bg-egw-page-050"
                      >
                        <Paperclip className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 truncate">
                          {file.fieldLabel || file.fileName}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-egw-ink-62">
                  Approvando, gli allegati vengono collegati ai documenti di
                  iscrizione della persona.
                </p>
              </section>
            ) : null}

            {review.submission.declarations.length ? (
              /*
                **Consensi e autorizzazioni** (ADR-0192): per ogni dichiarazione
                la semantica, la risposta, l'ora e — per chi ha
                `forms.evidence.read` — il testo mostrato con la sua impronta.
              */
              <section className="space-y-2" data-test="declarations">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-egw-ink">
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                  Consensi e autorizzazioni
                </h3>
                <ul className="divide-y divide-egw-rule rounded-egw-control border border-egw-hairline">
                  {review.submission.declarations.map((d) => (
                    <li key={d.fieldId} className="space-y-1 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-brand text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-62">
                          {FORM_LEGAL_KIND_LABELS[d.legalKind]}
                        </span>
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${d.answer ? "border-egw-tint-green-bd bg-egw-tint-green text-egw-green" : "border-egw-hairline bg-white text-egw-ink-62"}`}>
                          {d.answer ? "Accettato" : "Non accettato"}
                        </span>
                        <span className="text-xs text-egw-ink-62">
                          {d.at ? new Date(d.at).toLocaleString("it-IT") : ""} · casella web
                        </span>
                      </div>
                      <p className="font-medium text-egw-ink">{d.label}</p>
                      {d.text ? (
                        <details className="text-xs text-egw-ink-72">
                          <summary className="cursor-pointer">Testo mostrato · impronta {d.textHash.slice(0, 12)}…</summary>
                          <p className="mt-1 whitespace-pre-line">{d.text}</p>
                        </details>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {review.submission.revisions.length ? (
              <section className="space-y-2" data-test="revisions">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-egw-ink">
                  <History className="h-4 w-4" aria-hidden />
                  Versioni precedenti
                </h3>
                {review.submission.revisions.map((r) => (
                  <details key={r.id} className="rounded-egw-control border border-egw-hairline p-3 text-sm">
                    <summary className="cursor-pointer text-egw-ink-72">
                      Revisione {r.revision} · inviata il {new Date(r.submittedAt).toLocaleString("it-IT")}
                      {r.reason?.fieldIds.length ? ` · corretti: ${r.reason.fieldIds.map((id) => review.submission.schema.fields.find((f) => f.id === id)?.label || id).join(", ")}` : ""}
                    </summary>
                    <dl className="mt-2 divide-y divide-egw-rule">
                      {review.submission.schema.fields.filter((f) => fieldCollectsAnswer(f.type)).map((f) => (
                        <div key={f.id} className="grid grid-cols-1 gap-1 py-1 sm:grid-cols-3">
                          <dt className="text-egw-ink-62">{f.label}</dt>
                          <dd className="sm:col-span-2">{formatAnswer(r.answers[f.id])}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ))}
              </section>
            ) : null}

            <MissingDocumentsField
              value={missingDocuments}
              onChange={setMissingDocuments}
              disabled={busy}
              /*
                L'atleta c'e se la compilazione ne indica gia uno o se
                l'approvazione lo scrive: sono le stesse due strade da cui
                `decideFormSubmission` ricava il soggetto della richiesta.
              */
              canRequest={
                review.submission.subjects.some(
                  (selection) => selection.subject === "athlete",
                ) ||
                review.changeSet.subjects.some(
                  (subject) => subject.subject === "athlete",
                )
              }
            />

            <div className="space-y-2">
              <Label htmlFor="review-note">Nota interna</Label>
              <Textarea
                id="review-note"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Perche l'hai approvata o rifiutata. Resta in EasyGame."
              />
            </div>

            {requestOpen && review.submission.status === "pending" ? (
              /*
                **Richiedi integrazione** (ADR-0189 §4): si scelgono i campi
                da correggere; la nota va alla famiglia con l'email e la
                ricevuta. Gli altri campi non si potranno cambiare.
              */
              <section className="space-y-2 rounded-egw-control border border-egw-tint-orange-bd bg-egw-tint-orange p-4" data-test="request-changes">
                <h3 className="text-sm font-semibold text-egw-ink">Cosa deve correggere la famiglia</h3>
                <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {review.submission.schema.fields.filter((f) => fieldCollectsAnswer(f.type)).map((f) => (
                    <li key={f.id}>
                      <label className="flex items-start gap-2 rounded-egw-control bg-white p-2 text-sm">
                        <Checkbox
                          checked={requestedFieldIds.includes(f.id)}
                          onCheckedChange={(checked) =>
                            setRequestedFieldIds((current) =>
                              checked ? [...current, f.id] : current.filter((id) => id !== f.id),
                            )
                          }
                        />
                        <span>{f.label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-egw-ink-62">La nota qui sotto viene inviata alla famiglia insieme all&apos;elenco.</p>
              </section>
            ) : null}

            {submissionIsOpen(review.submission.status) ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <Button type="button" variant="ghost" disabled={busy} onClick={() => decide("archive")}>
                  <Archive className="mr-2 h-4 w-4" />
                  Archivia
                </Button>
                {review.submission.status === "pending" ? (
                  <>
                    {requestOpen ? (
                      <Button type="button" variant="outline" disabled={busy} onClick={() => decide("request_changes")}>
                        <MessageSquareWarning className="mr-2 h-4 w-4" />
                        Invia la richiesta di integrazione
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" disabled={busy} onClick={() => setRequestOpen(true)}>
                        <MessageSquareWarning className="mr-2 h-4 w-4" />
                        Richiedi integrazione
                      </Button>
                    )}
                    <Button type="button" variant="outline" disabled={busy} onClick={() => decide("reject")}>
                      <X className="mr-2 h-4 w-4" />
                      Rifiuta
                    </Button>
                    <Button type="button" disabled={busy} onClick={() => decide("approve")}>
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                      {trialToUse
                        ? "Approva e converti la persona in prova"
                        : review.submission.subjects.some((sel) => sel.subject === "athlete" && sel.recordId)
                          ? "Approva e collega ad atleta esistente"
                          : review.changeSet.subjects.some((subject) => subject.subject === "athlete")
                            ? "Approva e crea atleta"
                            : "Approva e aggiorna"}
                    </Button>
                  </>
                ) : null}
              </div>
            ) : (
              <p className="rounded-egw-control border border-egw-hairline bg-egw-page-100 p-3 text-sm text-egw-ink-72">
                Pratica chiusa{review.submission.athleteId ? " · scheda atleta collegata" : ""}
                {review.submission.reviewNote ? ` · «${review.submission.reviewNote}»` : ""}.
                {review.submission.status !== "converted" && review.submission.status !== "archived" ? (
                  <Button type="button" size="sm" variant="ghost" className="ml-2" disabled={busy} onClick={() => decide("archive")}>
                    <Archive className="mr-1 h-3.5 w-3.5" /> Archivia
                  </Button>
                ) : null}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SubjectChanges({ subject }: { subject: FormSubjectChange }) {
  return (
    <section className="space-y-2">
      <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-egw-ink">
        {subject.mode === "create" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-egw-tint-green-bd bg-egw-tint-green px-2 py-0.5 text-xs text-egw-green">
            <UserPlus className="h-3 w-3" />
            Nuovo
          </span>
        ) : null}
        {subject.subjectLabel}: {subject.recordLabel}
      </h3>

      <div className="divide-y divide-egw-rule rounded-egw-control border border-egw-hairline">
        {subject.changes.map((change) => (
          <div
            key={change.fieldId}
            className="grid grid-cols-1 gap-2 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-center"
          >
            <div className="min-w-0">
              <p className="text-egw-ink-72">{change.label}</p>
              <span
                className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] ${CHANGE_TONES[change.kind]}`}
              >
                {CHANGE_LABELS[change.kind]}
              </span>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {change.currentValue ? (
                <span className="min-w-0 truncate text-egw-ink-42 line-through">
                  {change.currentValue}
                </span>
              ) : null}
              {change.kind === "add" || change.kind === "replace" ? (
                <>
                  {change.currentValue ? (
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-egw-ink-42" />
                  ) : null}
                  <span className="min-w-0 truncate font-medium text-egw-ink">
                    {formatAnswer(change.proposedValue)}
                  </span>
                </>
              ) : (
                <span className="min-w-0 truncate text-egw-ink-62">
                  {formatAnswer(change.proposedValue)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
