"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  Paperclip,
  UserPlus,
  X,
} from "lucide-react";
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
  FORM_SUBMISSION_SOURCE_LABELS,
  formatAnswer,
  resolveSubmissionFileUrl,
} from "@/lib/forms/model";
import {
  DUPLICATE_MATCH_LABELS,
  type FormFieldChange,
  type FormSubjectChange,
} from "@/lib/forms/changes";
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
 */

type SubmissionReviewDialogProps = {
  submissionId: string;
  onClose: () => void;
  onReviewed: () => void;
};

const CHANGE_TONES: Record<FormFieldChange["kind"], string> = {
  add: "border-emerald-200 bg-emerald-50 text-emerald-800",
  replace: "border-amber-200 bg-amber-50 text-amber-900",
  unchanged: "border-slate-200 bg-white text-slate-500",
  empty: "border-slate-200 bg-white text-slate-400",
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

  const decide = async (action: "approve" | "reject") => {
    if (!review) return;
    setBusy(true);
    try {
      const outcome = await formsApi.decideSubmission(submissionId, {
        action,
        note,
        subjects: review.submission.subjects,
      });
      showToast(
        "success",
        action === "approve"
          ? outcome.applied.join(" · ") || "Compilazione approvata"
          : "Compilazione rifiutata",
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
          <DialogTitle>Cosa cambia se approvo</DialogTitle>
          <DialogDescription>
            {review
              ? `${review.submission.templateTitle} · versione ${review.submission.version} · ${FORM_SUBMISSION_SOURCE_LABELS[review.submission.source]}`
              : "Carico la compilazione…"}
          </DialogDescription>
        </DialogHeader>

        {issues.length ? (
          <section
            role="alert"
            className="space-y-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900"
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
            className="flex items-center gap-2 py-10 text-sm text-slate-600"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Calcolo la proposta…
          </p>
        ) : (
          <div className="space-y-6">
            {review.duplicates.length ? (
              <section className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                  <AlertTriangle className="h-4 w-4" />
                  Potrebbe essere una scheda che esiste gia
                </h3>
                {review.duplicates.map((duplicate) => (
                  <div
                    key={`${duplicate.subject}-${duplicate.recordId}`}
                    className="flex flex-col gap-2 rounded-md border border-amber-200 bg-white p-3 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">
                        {duplicate.label}
                      </p>
                      <p className="text-xs text-slate-600">
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
              <p className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Nessun campo di questo modulo e collegato a un dato EasyGame:
                approvando non cambia niente in anagrafica, la compilazione
                resta archiviata com&apos;e.
              </p>
            ) : null}

            {review.changeSet.unmappedAnswers.length ? (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Altre risposte
                </h3>
                <dl className="divide-y divide-slate-100 rounded-md border border-slate-200">
                  {review.changeSet.unmappedAnswers.map((answer) => (
                    <div
                      key={answer.fieldId}
                      className="grid grid-cols-1 gap-1 p-3 text-sm sm:grid-cols-3"
                    >
                      <dt className="text-slate-600">{answer.label}</dt>
                      <dd className="text-slate-900 sm:col-span-2">
                        {answer.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            {review.submission.files.length ? (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">Allegati</h3>
                <ul className="space-y-1">
                  {review.submission.files.map((file) => (
                    <li key={`${file.fieldId}-${file.reference}`}>
                      <a
                        href={resolveSubmissionFileUrl(file.reference)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-md border border-slate-200 p-2 text-sm text-sky-700 hover:bg-slate-50"
                      >
                        <Paperclip className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 truncate">
                          {file.fieldLabel || file.fileName}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-slate-500">
                  Approvando, gli allegati vengono collegati ai documenti di
                  iscrizione della persona.
                </p>
              </section>
            ) : null}

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

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => decide("reject")}
              >
                <X className="mr-2 h-4 w-4" />
                Rifiuta
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() => decide("approve")}
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Approva e aggiorna
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SubjectChanges({ subject }: { subject: FormSubjectChange }) {
  return (
    <section className="space-y-2">
      <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        {subject.mode === "create" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
            <UserPlus className="h-3 w-3" />
            Nuovo
          </span>
        ) : null}
        {subject.subjectLabel}: {subject.recordLabel}
      </h3>

      <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {subject.changes.map((change) => (
          <div
            key={change.fieldId}
            className="grid grid-cols-1 gap-2 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-center"
          >
            <div className="min-w-0">
              <p className="text-slate-700">{change.label}</p>
              <span
                className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] ${CHANGE_TONES[change.kind]}`}
              >
                {CHANGE_LABELS[change.kind]}
              </span>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {change.currentValue ? (
                <span className="min-w-0 truncate text-slate-400 line-through">
                  {change.currentValue}
                </span>
              ) : null}
              {change.kind === "add" || change.kind === "replace" ? (
                <>
                  {change.currentValue ? (
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  ) : null}
                  <span className="min-w-0 truncate font-medium text-slate-900">
                    {formatAnswer(change.proposedValue)}
                  </span>
                </>
              ) : (
                <span className="min-w-0 truncate text-slate-500">
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
