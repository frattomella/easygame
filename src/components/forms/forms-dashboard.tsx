"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Copy,
  FileText,
  Inbox,
  MoreVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { ListSkeleton } from "@/components/ui/app-loading-screen";
import { FormBuilder } from "./form-builder";
import { SubmissionReviewDialog } from "./submission-review-dialog";
import {
  FORM_STATUS_LABELS,
  FORM_SUBMISSION_STATUS_LABELS,
  type FormSubmissionRecord,
  type FormTemplateDetail,
  type FormTemplateSummary,
} from "@/lib/forms/model";
import { FORM_SUBJECTS } from "@/lib/forms/dynamic-fields";
import { STARTER_TEMPLATES } from "@/lib/forms/starter-templates";
import * as formsApi from "@/lib/api/forms";

/**
 * Modulistica: i moduli del club e la coda della segreteria.
 *
 * Due schede e nient'altro, perche sono le due domande che si fanno aprendo
 * questa pagina: «che moduli ho?» e «cosa e arrivato?». Il secondo numero e
 * quello che conta ed e sull'etichetta della scheda: una compilazione che
 * resta in coda per tre settimane e un'iscrizione persa.
 */

const STATUS_TONES: Record<string, string> = {
  published: "border-emerald-200 bg-emerald-50 text-emerald-700",
  draft: "border-amber-200 bg-amber-50 text-amber-700",
  archived: "border-slate-200 bg-slate-100 text-slate-600",
};

const SUBMISSION_TONES: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
};

const formatDate = (value: string) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
};

export function FormsDashboard() {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<FormTemplateSummary[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmissionRecord[]>([]);
  const [openTemplate, setOpenTemplate] = useState<FormTemplateDetail | null>(
    null,
  );
  const [reviewing, setReviewing] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [includeArchived, setIncludeArchived] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      setTemplates(await formsApi.fetchFormTemplates({ includeArchived }));
    } catch (error: any) {
      showToast("error", error?.message || "Non riesco a leggere i moduli");
    }
  }, [includeArchived, showToast]);

  const loadSubmissions = useCallback(async () => {
    try {
      const result = await formsApi.fetchFormSubmissions({
        status: statusFilter,
        limit: 50,
      });
      setSubmissions(result.items);
    } catch (error: any) {
      showToast("error", error?.message || "Non riesco a leggere la coda");
    }
  }, [statusFilter, showToast]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([loadTemplates(), loadSubmissions()]).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [loadTemplates, loadSubmissions]);

  const pendingTotal = useMemo(
    () => templates.reduce((total, template) => total + template.pendingCount, 0),
    [templates],
  );

  const create = async (starter: string) => {
    try {
      const created = await formsApi.createFormTemplate(starter);
      await loadTemplates();
      setOpenTemplate(created);
    } catch (error: any) {
      showToast("error", error?.message || "Non riesco a creare il modulo");
    }
  };

  const open = async (id: string) => {
    try {
      setOpenTemplate(await formsApi.fetchFormTemplate(id));
    } catch (error: any) {
      showToast("error", error?.message || "Non riesco ad aprire il modulo");
    }
  };

  const runOnTemplate = async (
    operation: () => Promise<unknown>,
    message: string,
  ) => {
    try {
      await operation();
      await loadTemplates();
      showToast("success", message);
    } catch (error: any) {
      showToast("error", error?.message || "Operazione non riuscita");
    }
  };

  if (openTemplate) {
    return (
      <FormBuilder
        template={openTemplate}
        onTemplateChange={(next) => {
          setOpenTemplate(next);
          void loadTemplates();
        }}
        onBack={() => {
          setOpenTemplate(null);
          void loadTemplates();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="moduli" className="space-y-4">
        {/* Due etichette affiancate stanno anche a 375 px. */}
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
          <TabsTrigger value="moduli">Moduli</TabsTrigger>
          <TabsTrigger value="coda">
            Da esaminare{pendingTotal ? ` (${pendingTotal})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="moduli" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button">
                  <Plus className="mr-2 h-4 w-4" />
                  Nuovo modulo
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                {STARTER_TEMPLATES.map((starter) => (
                  <DropdownMenuItem
                    key={starter.key}
                    onSelect={() => void create(starter.key)}
                    className="flex-col items-start gap-0.5"
                  >
                    <span className="font-medium">{starter.label}</span>
                    <span className="text-xs text-slate-500">
                      {starter.description}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="sm:ml-auto"
              onClick={() => setIncludeArchived((current) => !current)}
            >
              {includeArchived ? "Nascondi archiviati" : "Mostra archiviati"}
            </Button>
          </div>

          {loading ? (
            <ListSkeleton rows={3} />
          ) : templates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <FileText className="h-8 w-8 text-slate-400" />
                <p className="font-medium text-slate-900">
                  Nessun modulo, per ora
                </p>
                <p className="max-w-sm text-sm text-slate-600">
                  «Iscrizione online» e gia scritto: link pubblico, dati
                  dell&apos;atleta, contatti del genitore, documenti e consenso.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => (
                <Card key={template.id}>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => void open(template.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="font-display font-semibold text-slate-900">
                        {template.title}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                        <span>{template.fieldCount} campi</span>
                        {template.publishedVersion ? (
                          <span className="eg-tabular">
                            versione {template.publishedVersion}
                          </span>
                        ) : null}
                        {template.subjects.length ? (
                          <span>
                            {template.subjects
                              .map((subject) => FORM_SUBJECTS[subject].label)
                              .join(", ")}
                          </span>
                        ) : null}
                        <span>aggiornato il {formatDate(template.updatedAt)}</span>
                      </p>
                    </button>

                    <div className="flex flex-wrap items-center gap-2">
                      {template.pendingCount ? (
                        <Badge
                          variant="outline"
                          className="border-amber-200 bg-amber-50 text-amber-700"
                        >
                          {template.pendingCount} da esaminare
                        </Badge>
                      ) : null}

                      {template.hasUnpublishedChanges ? (
                        <Badge
                          variant="outline"
                          className="border-sky-200 bg-sky-50 text-sky-700"
                        >
                          Modifiche non pubblicate
                        </Badge>
                      ) : null}

                      <Badge
                        variant="outline"
                        className={STATUS_TONES[template.status]}
                      >
                        {FORM_STATUS_LABELS[template.status]}
                      </Badge>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Azioni su ${template.title}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() =>
                              void runOnTemplate(
                                () => formsApi.duplicateForm(template.id),
                                "Modulo duplicato",
                              )
                            }
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Duplica
                          </DropdownMenuItem>

                          {template.status === "archived" ? (
                            <DropdownMenuItem
                              onSelect={() =>
                                void runOnTemplate(
                                  () => formsApi.restoreForm(template.id),
                                  "Modulo ripristinato come bozza",
                                )
                              }
                            >
                              <ArchiveRestore className="mr-2 h-4 w-4" />
                              Ripristina
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onSelect={() =>
                                void runOnTemplate(
                                  () => formsApi.archiveForm(template.id),
                                  "Modulo archiviato",
                                )
                              }
                            >
                              <Archive className="mr-2 h-4 w-4" />
                              Archivia
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuItem
                            onSelect={() =>
                              void runOnTemplate(async () => {
                                const result = await formsApi.deleteForm(
                                  template.id,
                                );
                                if (result.archived) {
                                  showToast(
                                    "info",
                                    "Il modulo ha gia delle compilazioni: e stato archiviato invece che cancellato.",
                                  );
                                }
                              }, "Modulo eliminato")
                            }
                          >
                            <Trash2 className="mr-2 h-4 w-4 text-red-600" />
                            Elimina
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="coda" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["pending", "Da esaminare"],
                ["approved", "Approvate"],
                ["rejected", "Rifiutate"],
                ["all", "Tutte"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={statusFilter === value ? "default" : "outline"}
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>

          {loading ? (
            <ListSkeleton rows={3} />
          ) : submissions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <Inbox className="h-8 w-8 text-slate-400" />
                <p className="font-medium text-slate-900">Niente in coda</p>
                <p className="text-sm text-slate-600">
                  Le compilazioni arrivate compaiono qui prima di toccare
                  l&apos;anagrafica.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {submissions.map((submission) => (
                <Card key={submission.id}>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => setReviewing(submission.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="font-medium text-slate-900">
                        {submission.subjects.find(
                          (selection) => selection.label,
                        )?.label ||
                          submission.respondentName ||
                          submission.respondentEmail ||
                          "Compilazione senza nome"}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-600">
                        <span>{submission.templateTitle}</span>
                        <span className="eg-tabular">
                          versione {submission.version}
                        </span>
                        <span className="eg-tabular">
                          {formatDate(submission.submittedAt)}
                        </span>
                      </p>
                    </button>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={SUBMISSION_TONES[submission.status]}
                      >
                        {FORM_SUBMISSION_STATUS_LABELS[submission.status]}
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setReviewing(submission.id)}
                      >
                        Esamina
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {reviewing ? (
        <SubmissionReviewDialog
          submissionId={reviewing}
          onClose={() => setReviewing("")}
          onReviewed={() => {
            void loadSubmissions();
            void loadTemplates();
          }}
        />
      ) : null}
    </div>
  );
}
