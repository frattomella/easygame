"use client";

import React, { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { FormRenderer } from "./form-renderer";
import { SubmissionReviewDialog } from "./submission-review-dialog";
import type {
  FormSubjectSelection,
  FormTemplateSummary,
} from "@/lib/forms/model";
import * as formsApi from "@/lib/api/forms";

/**
 * «Compila modulo» dalla scheda di un atleta.
 *
 * Il percorso e quello che la segreteria fa davvero: si e gia dentro la
 * scheda di Mario Rossi, quindi **l'atleta non si sceglie**. Si sceglie il
 * modulo; se il modulo nomina anche un genitore e l'atleta ne ha piu di uno,
 * si sceglie quale — esplicitamente, perche prendere il primo dell'elenco
 * significa stampare il numero di telefono sbagliato su un modulo firmato.
 *
 * Cio che EasyGame sa gia arriva precompilato e marcato «dato gia in
 * archivio»: chi compila deve poter distinguere cosa sta confermando da cosa
 * sta dichiarando.
 *
 * L'invio non scrive: apre la stessa finestra di revisione della coda
 * pubblica. Un solo percorso di scrittura, anche quando chi compila e la
 * segreteria stessa.
 */

type CompileFormDialogProps = {
  athleteId: string;
  athleteName: string;
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
};

export function CompileFormDialog({
  athleteId,
  athleteName,
  open,
  onClose,
  onCompleted,
}: CompileFormDialogProps) {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<FormTemplateSummary[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [guardianId, setGuardianId] = useState("");
  const [context, setContext] = useState<formsApi.CompileContext | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [reviewing, setReviewing] = useState("");

  useEffect(() => {
    if (!open) return;

    let active = true;
    setLoading(true);
    formsApi
      .fetchFormTemplates()
      .then((all) => {
        if (!active) return;
        /*
          Solo i moduli pubblicati: e la pubblicazione a congelare il
          significato delle domande, e una compilazione deve poter citare la
          versione con cui e stata fatta.
        */
        setTemplates(all.filter((template) => template.status === "published"));
      })
      .catch((error: any) =>
        showToast("error", error?.message || "Non riesco a leggere i moduli"),
      )
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, showToast]);

  const buildSelections = useCallback(
    (guardian: string): FormSubjectSelection[] => {
      const selections: FormSubjectSelection[] = [
        { subject: "athlete", recordId: athleteId, label: athleteName },
      ];
      if (guardian) {
        selections.push({
          subject: "guardian",
          recordId: guardian,
          label: "",
        });
      }
      return selections;
    },
    [athleteId, athleteName],
  );

  const loadContext = useCallback(
    async (nextTemplateId: string, guardian: string) => {
      if (!nextTemplateId) return;
      setLoading(true);
      try {
        const next = await formsApi.fetchCompileContext(
          nextTemplateId,
          buildSelections(guardian),
        );
        setContext(next);
        setValues(next.answers);
        setFiles({});
        setErrors({});
      } catch (error: any) {
        showToast("error", error?.message || "Non riesco a preparare il modulo");
        setContext(null);
      } finally {
        setLoading(false);
      }
    },
    [buildSelections, showToast],
  );

  const guardianOptions = context?.options?.guardian || [];

  const submit = async () => {
    if (!context) return;
    setSending(true);
    setErrors({});

    try {
      const selections = buildSelections(guardianId).map((selection) =>
        selection.subject === "guardian"
          ? {
              ...selection,
              label:
                guardianOptions.find(
                  (option) => option.recordId === selection.recordId,
                )?.label || "",
            }
          : selection,
      );

      const result = await formsApi.submitInternalForm({
        templateId: context.templateId,
        subjects: selections,
        answers: values,
        files,
        respondentName: athleteName,
      });

      setReviewing(result.submissionId);
    } catch (error: any) {
      showToast("error", error?.message || "Invio non riuscito");
    } finally {
      setSending(false);
    }
  };

  if (reviewing) {
    return (
      <SubmissionReviewDialog
        submissionId={reviewing}
        onClose={() => {
          setReviewing("");
          onClose();
        }}
        onReviewed={onCompleted}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compila modulo</DialogTitle>
          <DialogDescription>
            Per {athleteName}. Cio che EasyGame sa gia e precompilato.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="compile-template">Modulo</Label>
            <Select
              value={templateId}
              onValueChange={(next) => {
                setTemplateId(next);
                setGuardianId("");
                void loadContext(next, "");
              }}
            >
              <SelectTrigger id="compile-template">
                <SelectValue placeholder="Scegli un modulo pubblicato" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {!loading && templates.length === 0 ? (
              <p className="text-sm text-slate-600">
                Nessun modulo pubblicato. Creane uno da Modulistica: solo un
                modulo pubblicato si puo compilare.
              </p>
            ) : null}
          </div>

          {context ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <UserCheck className="h-4 w-4 text-emerald-600" />
              <span className="font-medium">{athleteName}</span>
              <span className="text-slate-500">
                atleta gia selezionato · versione {context.version}
              </span>
            </div>
          ) : null}

          {guardianOptions.length ? (
            <div className="space-y-2">
              <Label htmlFor="compile-guardian">Genitore o tutore</Label>
              <Select
                value={guardianId}
                onValueChange={(next) => {
                  setGuardianId(next);
                  void loadContext(templateId, next);
                }}
              >
                <SelectTrigger id="compile-guardian">
                  <SelectValue placeholder="Scegli chi firma" />
                </SelectTrigger>
                <SelectContent>
                  {guardianOptions.map((option) => (
                    <SelectItem key={option.recordId} value={option.recordId}>
                      {option.label}
                      {option.hint ? ` — ${option.hint}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                Il modulo chiede dati del genitore: scegli quale, cosi le
                risposte tornano sulla persona giusta.
              </p>
            </div>
          ) : null}

          {loading ? (
            <p
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 py-8 text-sm text-slate-600"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparo il modulo…
            </p>
          ) : null}

          {context && !loading ? (
            <>
              <div className="rounded-lg border border-slate-200 p-4">
                <FormRenderer
                  fields={context.schema.fields}
                  values={values}
                  files={files}
                  errors={errors}
                  prefilledFieldIds={context.prefilledFieldIds}
                  onChange={(fieldId, value) => {
                    setValues((current) => ({ ...current, [fieldId]: value }));
                    setErrors((current) => ({ ...current, [fieldId]: "" }));
                  }}
                  onFileChange={(fieldId, file) =>
                    setFiles((current) => ({ ...current, [fieldId]: file }))
                  }
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={onClose}>
                  Annulla
                </Button>
                <Button type="button" onClick={submit} disabled={sending}>
                  {sending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" />
                  )}
                  Salva e rivedi
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
