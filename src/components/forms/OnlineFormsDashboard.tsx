"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Archive,
  CheckCircle2,
  ClipboardCopy,
  Copy,
  Download,
  Eye,
  FileText,
  GripVertical,
  Link as LinkIcon,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
  Save,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { FormShareDialog } from "@/components/forms/FormShareDialog";
import { apiRequest } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  ONLINE_FORM_FIELD_OPTIONS,
  ONLINE_FORM_STATUS_LABELS,
  ONLINE_FORM_SUBMISSION_STATUS_LABELS,
  buildUniquePublicSlug,
  createClientId,
  firstText,
  formatAnswerValue,
  getFieldTypeLabel,
  getStatusBadgeClassName,
  getSubmissionStatusClassName,
  isChoiceField,
  isFileField,
  isReadOnlyField,
  normalizeOnlineForm,
  type OnlineForm,
  type OnlineFormBundle,
  type OnlineFormField,
  type OnlineFormFieldType,
  type OnlineFormSubmission,
  type OnlineFormSubmissionStatus,
  type OnlineFormStatus,
} from "@/lib/online-forms";

type OnlineFormsDashboardProps = {
  clubId: string;
  athletes?: Array<{ id: string; first_name?: string; last_name?: string }>;
  mode?: "forms" | "responses" | "archive";
};

const EMPTY_BUNDLE: OnlineFormBundle = {
  forms: [],
  submissions: [],
};

const choiceOptionsToText = (field: OnlineFormField) =>
  (field.options || []).join("\n");

const parseChoiceOptions = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((option) => option.trim())
    .filter(Boolean);

const createField = (type: OnlineFormFieldType = "short_text"): OnlineFormField => ({
  id: createClientId("field"),
  type,
  label:
    type === "section"
      ? "Nuova sezione"
      : type === "divider"
        ? "Divisore"
        : "Nuova domanda",
  description: "",
  required: false,
  options: isChoiceField(type) ? ["Opzione 1", "Opzione 2"] : undefined,
  placeholder: "",
  validation: isFileField(type)
    ? {
        acceptedFileTypes:
          type === "image"
            ? ["image/jpeg", "image/png", "image/heic"]
            : ["application/pdf", "image/jpeg", "image/png", "image/heic"],
        maxFileSizeMb: 10,
      }
    : {},
});

const getPublicLink = (form: OnlineForm) => {
  if (typeof window === "undefined") return `/forms/${form.publicSlug}`;
  return `${window.location.origin}/forms/${form.publicSlug}`;
};

const formatFormDate = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("it-IT");
};

const writeClipboardText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
};

export function OnlineFormsDashboard({
  clubId,
  athletes = [],
  mode = "forms",
}: OnlineFormsDashboardProps) {
  const { showToast } = useToast();
  const [bundle, setBundle] = useState<OnlineFormBundle>(EMPTY_BUNDLE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingForm, setEditingForm] = useState<OnlineForm | null>(null);
  const [selectedFieldType, setSelectedFieldType] =
    useState<OnlineFormFieldType>("short_text");
  const [responseFormFilter, setResponseFormFilter] = useState("all");
  const [responseStatusFilter, setResponseStatusFilter] = useState("all");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
  const [selectedResponsesFormId, setSelectedResponsesFormId] = useState("");
  const [sharingForm, setSharingForm] = useState<OnlineForm | null>(null);

  const forms = bundle.forms;
  const submissions = bundle.submissions;
  const effectiveResponseFormFilter =
    selectedResponsesFormId || responseFormFilter;

  const sortedForms = useMemo(
    () =>
      [...forms].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [forms],
  );
  const activeForms = useMemo(
    () => sortedForms.filter((form) => form.status !== "archived"),
    [sortedForms],
  );
  const archivedForms = useMemo(
    () => sortedForms.filter((form) => form.status === "archived"),
    [sortedForms],
  );
  const submissionCountByFormId = useMemo(
    () =>
      submissions.reduce<Record<string, number>>((counts, submission) => {
        counts[submission.formId] = (counts[submission.formId] || 0) + 1;
        return counts;
      }, {}),
    [submissions],
  );

  const filteredSubmissions = useMemo(
    () =>
      submissions
        .filter(
          (submission) =>
            effectiveResponseFormFilter === "all" ||
            submission.formId === effectiveResponseFormFilter,
        )
        .filter(
          (submission) =>
            responseStatusFilter === "all" ||
            submission.status === responseStatusFilter,
        )
        .sort(
          (a, b) =>
            new Date(b.submittedAt).getTime() -
            new Date(a.submittedAt).getTime(),
        ),
    [effectiveResponseFormFilter, responseStatusFilter, submissions],
  );

  const selectedSubmission =
    filteredSubmissions.find(
      (submission) => submission.id === selectedSubmissionId,
    ) ||
    filteredSubmissions[0] ||
    null;
  const selectedSubmissionForm = selectedSubmission
    ? forms.find((form) => form.id === selectedSubmission.formId) || null
    : null;

  const loadForms = async () => {
    if (!clubId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const response = await apiRequest<OnlineFormBundle>(
      `/api/online-forms?clubId=${encodeURIComponent(clubId)}`,
    );
    if (response.error) {
      showToast("error", response.error.message || "Errore caricamento moduli");
      setBundle(EMPTY_BUNDLE);
    } else {
      setBundle({
        forms: Array.isArray(response.data?.forms) ? response.data.forms : [],
        submissions: Array.isArray(response.data?.submissions)
          ? response.data.submissions
          : [],
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadForms();
  }, [clubId]);

  useEffect(() => {
    if (!selectedSubmissionId && filteredSubmissions[0]?.id) {
      setSelectedSubmissionId(filteredSubmissions[0].id);
    }
  }, [filteredSubmissions, selectedSubmissionId]);

  const applyApiResult = (data: any) => {
    const nextBundle = data?.bundle || data;
    if (Array.isArray(nextBundle?.forms)) {
      setBundle({
        forms: nextBundle.forms,
        submissions: Array.isArray(nextBundle.submissions)
          ? nextBundle.submissions
          : [],
      });
    }

    return data?.form || null;
  };

  const createNewForm = async (baseEnrollment = false) => {
    setSaving(true);
    const response = await apiRequest<any>("/api/online-forms", {
      method: "POST",
      body: {
        organizationId: clubId,
        action: baseEnrollment ? "create_base_enrollment" : "create",
      },
    });
    setSaving(false);

    if (response.error) {
      showToast("error", response.error.message || "Errore creazione modulo");
      return;
    }

    const created = applyApiResult(response.data);
    if (created) {
      setEditingForm(created);
    }
    showToast(
      "success",
      baseEnrollment
        ? "Modulo iscrizione base creato"
        : "Nuovo modulo creato",
    );
  };

  const saveEditingForm = async (nextForm = editingForm) => {
    if (!nextForm) return null;

    setSaving(true);
    const response = await apiRequest<any>("/api/online-forms", {
      method: "PATCH",
      body: {
        organizationId: clubId,
        form: {
          ...nextForm,
          publicSlug:
            nextForm.publicSlug ||
            buildUniquePublicSlug(nextForm.title, forms, nextForm.id),
        },
      },
    });
    setSaving(false);

    if (response.error) {
      showToast("error", response.error.message || "Errore salvataggio modulo");
      return null;
    }

    const saved = applyApiResult(response.data);
    if (saved) {
      setEditingForm(saved);
    }
    showToast("success", "Modulo salvato");
    return saved;
  };

  const updateFormStatus = async (
    form: OnlineForm,
    action: "publish" | "unpublish" | "archive",
  ) => {
    setSaving(true);
    const response = await apiRequest<any>("/api/online-forms", {
      method: "PATCH",
      body: {
        organizationId: clubId,
        formId: form.id,
        action,
      },
    });
    setSaving(false);

    if (response.error) {
      showToast("error", response.error.message || "Errore aggiornamento stato");
      return;
    }

    const updated = applyApiResult(response.data);
    if (updated && editingForm?.id === updated.id) {
      setEditingForm(updated);
    }
    showToast(
      "success",
      action === "publish"
        ? "Modulo pubblicato"
        : action === "archive"
          ? "Modulo archiviato"
          : "Modulo riportato in bozza",
    );
  };

  const duplicateForm = async (form: OnlineForm) => {
    setSaving(true);
    const response = await apiRequest<any>("/api/online-forms", {
      method: "POST",
      body: {
        organizationId: clubId,
        action: "duplicate",
        formId: form.id,
      },
    });
    setSaving(false);

    if (response.error) {
      showToast("error", response.error.message || "Errore duplicazione modulo");
      return;
    }

    const duplicated = applyApiResult(response.data);
    if (duplicated) setEditingForm(duplicated);
    showToast("success", "Modulo duplicato");
  };

  const copyPublicLink = async (form: OnlineForm) => {
    if (form.status !== "published") {
      showToast("warning", "Pubblica il modulo prima di copiare il link");
      return;
    }

    try {
      await writeClipboardText(getPublicLink(form));
      showToast("success", "Link pubblico copiato");
    } catch (error) {
      console.error("Copy public link error:", error);
      showToast("error", "Impossibile copiare il link pubblico");
    }
  };

  const updateEditingField = (
    fieldId: string,
    updates: Partial<OnlineFormField>,
  ) => {
    if (!editingForm) return;
    setEditingForm({
      ...editingForm,
      fields: editingForm.fields.map((field) =>
        field.id === fieldId ? { ...field, ...updates } : field,
      ),
    });
  };

  const addField = () => {
    if (!editingForm) return;
    setEditingForm({
      ...editingForm,
      fields: [...editingForm.fields, createField(selectedFieldType)],
    });
  };

  const duplicateField = (field: OnlineFormField) => {
    if (!editingForm) return;
    const index = editingForm.fields.findIndex((item) => item.id === field.id);
    const nextField = {
      ...field,
      id: createClientId("field"),
      label: `${field.label} copia`,
    };
    const nextFields = [...editingForm.fields];
    nextFields.splice(index + 1, 0, nextField);
    setEditingForm({ ...editingForm, fields: nextFields });
  };

  const removeField = (fieldId: string) => {
    if (!editingForm) return;
    setEditingForm({
      ...editingForm,
      fields: editingForm.fields.filter((field) => field.id !== fieldId),
    });
  };

  const moveField = (fieldId: string, direction: -1 | 1) => {
    if (!editingForm) return;
    const index = editingForm.fields.findIndex((field) => field.id === fieldId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= editingForm.fields.length) {
      return;
    }

    const nextFields = [...editingForm.fields];
    const [field] = nextFields.splice(index, 1);
    nextFields.splice(nextIndex, 0, field);
    setEditingForm({ ...editingForm, fields: nextFields });
  };

  const updateSubmissionStatus = async (
    submission: OnlineFormSubmission,
    status: OnlineFormSubmissionStatus,
  ) => {
    setSaving(true);
    const response = await apiRequest<any>("/api/online-forms", {
      method: "PATCH",
      body: {
        organizationId: clubId,
        kind: "submission",
        submissionId: submission.id,
        status,
      },
    });
    setSaving(false);

    if (response.error) {
      showToast("error", response.error.message || "Errore aggiornamento risposta");
      return;
    }

    applyApiResult(response.data);
    showToast("success", "Stato risposta aggiornato");
  };

  const exportCsv = () => {
    const targetForm =
      responseFormFilter === "all"
        ? null
        : forms.find((form) => form.id === responseFormFilter) || null;
    const rows = filteredSubmissions.map((submission) => {
      const form = forms.find((candidate) => candidate.id === submission.formId);
      const fields = targetForm?.fields || form?.fields || [];
      return [
        submission.submittedAt,
        form?.title || submission.formId,
        submission.respondentName || "",
        submission.respondentEmail || "",
        ONLINE_FORM_SUBMISSION_STATUS_LABELS[submission.status],
        ...fields
          .filter((field) => !isReadOnlyField(field.type))
          .map((field) => formatAnswerValue(submission.answers[field.id])),
      ];
    });
    const headers = [
      "Data invio",
      "Modulo",
      "Nome",
      "Email",
      "Stato",
      ...(targetForm?.fields || [])
        .filter((field) => !isReadOnlyField(field.type))
        .map((field) => field.label),
    ];
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "risposte-moduli-online.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Caricamento moduli online...
      </div>
    );
  }

  if (!clubId) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nessun club attivo trovato.
        </CardContent>
      </Card>
    );
  }

  if (mode === "archive") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Moduli online archiviati</CardTitle>
          <CardDescription>
            Moduli rimossi dalla lista attiva ma ancora ripristinabili.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {archivedForms.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[260px]">Nome modulo</TableHead>
                    <TableHead>Data archivio</TableHead>
                    <TableHead>Ultima modifica</TableHead>
                    <TableHead>Risposte</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {archivedForms.map((form) => (
                    <TableRow key={form.id}>
                      <TableCell>
                        <div className="font-medium text-slate-900">
                          {form.title}
                        </div>
                        <div className="text-xs text-slate-500">
                          {form.description || "Modulo online"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatFormDate(
                          (form as any).archivedAt ||
                            (form as any).archived_at ||
                            form.updatedAt,
                        )}
                      </TableCell>
                      <TableCell>{formatFormDate(form.updatedAt)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-0"
                          onClick={() => {
                            setSelectedResponsesFormId(form.id);
                            setSelectedSubmissionId("");
                          }}
                        >
                          <ListChecks className="mr-2 h-4 w-4" />
                          {submissionCountByFormId[form.id] || 0}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getStatusBadgeClassName(form.status)}
                        >
                          {ONLINE_FORM_STATUS_LABELS[form.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Azioni ${form.title}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => updateFormStatus(form, "unpublish")}
                              disabled={saving}
                            >
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Ripristina
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => duplicateForm(form)}
                              disabled={saving}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Duplica
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedResponsesFormId(form.id);
                                setSelectedSubmissionId("");
                              }}
                            >
                              <ListChecks className="mr-2 h-4 w-4" />
                              Risposte
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled>
                              <QrCode className="mr-2 h-4 w-4" />
                              Condivisione disabilitata
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
              Nessun modulo archiviato.
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (mode === "responses" || selectedResponsesFormId) {
    const selectedResponsesForm = selectedResponsesFormId
      ? forms.find((form) => form.id === selectedResponsesFormId)
      : null;
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row">
            {selectedResponsesForm ? (
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Risposte - {selectedResponsesForm.title}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 px-0 text-blue-700 hover:bg-transparent"
                  onClick={() => {
                    setSelectedResponsesFormId("");
                    setSelectedSubmissionId("");
                  }}
                >
                  Torna ai moduli
                </Button>
              </div>
            ) : (
              <Select
                value={responseFormFilter}
                onValueChange={(value) => {
                  setResponseFormFilter(value);
                  setSelectedSubmissionId("");
                }}
              >
                <SelectTrigger className="w-full sm:w-[240px]">
                  <SelectValue placeholder="Modulo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i moduli</SelectItem>
                  {forms.map((form) => (
                    <SelectItem key={form.id} value={form.id}>
                      {form.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={responseStatusFilter}
              onValueChange={(value) => {
                setResponseStatusFilter(value);
                setSelectedSubmissionId("");
              }}
            >
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                {Object.entries(ONLINE_FORM_SUBMISSION_STATUS_LABELS).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={filteredSubmissions.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Esporta CSV
          </Button>
        </div>

        {filteredSubmissions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex min-h-[260px] flex-col items-center justify-center text-center">
              <ListChecks className="mb-3 h-10 w-10 text-slate-400" />
              <h3 className="font-semibold text-slate-900">
                Nessuna risposta raccolta
              </h3>
              <p className="mt-1 max-w-lg text-sm text-slate-500">
                Le compilazioni dei moduli pubblicati appariranno qui.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <div className="space-y-3">
              {filteredSubmissions.map((submission) => {
                const form = forms.find(
                  (candidate) => candidate.id === submission.formId,
                );
                return (
                  <button
                    key={submission.id}
                    type="button"
                    onClick={() => setSelectedSubmissionId(submission.id)}
                    className={cn(
                      "w-full rounded-lg border bg-white p-4 text-left shadow-sm transition hover:border-blue-300",
                      selectedSubmission?.id === submission.id &&
                        "border-blue-400 ring-2 ring-blue-100",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {submission.respondentName ||
                            submission.respondentEmail ||
                            "Risposta senza nome"}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {form?.title || "Modulo"}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={getSubmissionStatusClassName(submission.status)}
                      >
                        {ONLINE_FORM_SUBMISSION_STATUS_LABELS[submission.status]}
                      </Badge>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      {new Date(submission.submittedAt).toLocaleString("it-IT")}
                    </p>
                  </button>
                );
              })}
            </div>

            {selectedSubmission && selectedSubmissionForm ? (
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <CardTitle>{selectedSubmissionForm.title}</CardTitle>
                      <CardDescription>
                        {selectedSubmission.respondentName || "Rispondente"}{" "}
                        {selectedSubmission.respondentEmail
                          ? `- ${selectedSubmission.respondentEmail}`
                          : ""}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateSubmissionStatus(selectedSubmission, "reviewed")
                        }
                        disabled={saving}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Esaminata
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          updateSubmissionStatus(selectedSubmission, "approved")
                        }
                        disabled={saving}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Approva
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateSubmissionStatus(selectedSubmission, "rejected")
                        }
                        disabled={saving}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Rifiuta
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedSubmissionForm.fields
                    .filter((field) => !isReadOnlyField(field.type))
                    .map((field) => {
                      const relatedFiles = (selectedSubmission.files || []).filter(
                        (file) => file.fieldId === field.id,
                      );
                      return (
                        <div key={field.id} className="rounded-lg border p-4">
                          <p className="text-sm font-semibold text-slate-900">
                            {field.label}
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                            {formatAnswerValue(selectedSubmission.answers[field.id])}
                          </p>
                          {relatedFiles.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {relatedFiles.map((file) => (
                                <a
                                  key={file.assetId || file.fileUrl}
                                  href={file.fileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50"
                                >
                                  <FileText className="mr-2 h-4 w-4" />
                                  {file.fileName || "File"}
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  if (editingForm) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={getStatusBadgeClassName(editingForm.status)}
            >
              {ONLINE_FORM_STATUS_LABELS[editingForm.status]}
            </Badge>
            <span className="text-sm text-slate-500">
              {editingForm.fields.length} domande
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditingForm(null)}>
              Torna ai moduli
            </Button>
            <Button
              variant="outline"
              onClick={() => copyPublicLink(editingForm)}
              disabled={editingForm.status !== "published"}
            >
              <ClipboardCopy className="mr-2 h-4 w-4" />
              Copia link
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                updateFormStatus(
                  editingForm,
                  editingForm.status === "published" ? "unpublish" : "publish",
                )
              }
              disabled={saving}
            >
              <Send className="mr-2 h-4 w-4" />
              {editingForm.status === "published" ? "Non pubblicare" : "Pubblica"}
            </Button>
            <Button onClick={() => saveEditingForm()} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              Salva
            </Button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Builder modulo</CardTitle>
                <CardDescription>
                  Modifica titolo, descrizione e domande senza codice.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Titolo modulo</Label>
                    <Input
                      value={editingForm.title}
                      onChange={(event) =>
                        setEditingForm({
                          ...editingForm,
                          title: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Link pubblico</Label>
                    <Input
                      value={editingForm.publicSlug}
                      onChange={(event) =>
                        setEditingForm({
                          ...editingForm,
                          publicSlug: event.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9-]+/g, "-"),
                        })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Descrizione</Label>
                  <Textarea
                    value={editingForm.description || ""}
                    onChange={(event) =>
                      setEditingForm({
                        ...editingForm,
                        description: event.target.value,
                      })
                    }
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select
                  value={selectedFieldType}
                  onValueChange={(value) =>
                    setSelectedFieldType(value as OnlineFormFieldType)
                  }
                >
                  <SelectTrigger className="w-full sm:w-[220px]">
                    <SelectValue placeholder="Tipo risposta" />
                  </SelectTrigger>
                  <SelectContent>
                    {ONLINE_FORM_FIELD_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={addField}>
                  <Plus className="mr-2 h-4 w-4" />
                  Aggiungi domanda
                </Button>
              </div>
              <p className="text-sm text-slate-500">
                Usa le frecce per ordinare le domande.
              </p>
            </div>

            {editingForm.fields.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center text-sm text-slate-500">
                  Aggiungi la prima domanda.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {editingForm.fields.map((field, index) => (
                  <Card key={field.id}>
                    <CardHeader className="pb-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-center gap-2">
                          <GripVertical className="h-4 w-4 shrink-0 text-slate-400" />
                          <div className="min-w-0">
                            <CardTitle className="text-base">
                              {field.label || "Domanda"}
                            </CardTitle>
                            <CardDescription>
                              {getFieldTypeLabel(field.type)}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => moveField(field.id, -1)}
                            disabled={index === 0}
                          >
                            Su
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => moveField(field.id, 1)}
                            disabled={index === editingForm.fields.length - 1}
                          >
                            Giu
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => duplicateField(field)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeField(field.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                        <div className="space-y-2">
                          <Label>Domanda</Label>
                          <Input
                            value={field.label}
                            onChange={(event) =>
                              updateEditingField(field.id, {
                                label: event.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Tipo risposta</Label>
                          <Select
                            value={field.type}
                            onValueChange={(value) => {
                              const nextType = value as OnlineFormFieldType;
                              updateEditingField(field.id, {
                                type: nextType,
                                options: isChoiceField(nextType)
                                  ? field.options?.length
                                    ? field.options
                                    : ["Opzione 1", "Opzione 2"]
                                  : undefined,
                                validation: isFileField(nextType)
                                  ? {
                                      acceptedFileTypes:
                                        nextType === "image"
                                          ? ["image/jpeg", "image/png"]
                                          : [
                                              "application/pdf",
                                              "image/jpeg",
                                              "image/png",
                                            ],
                                      maxFileSizeMb: 10,
                                    }
                                  : {},
                              });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Tipo risposta" />
                            </SelectTrigger>
                            <SelectContent>
                              {ONLINE_FORM_FIELD_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Descrizione opzionale</Label>
                        <Textarea
                          value={field.description || ""}
                          onChange={(event) =>
                            updateEditingField(field.id, {
                              description: event.target.value,
                            })
                          }
                          rows={2}
                        />
                      </div>

                      {!isReadOnlyField(field.type) && field.type !== "consent" ? (
                        <div className="space-y-2">
                          <Label>Placeholder</Label>
                          <Input
                            value={field.placeholder || ""}
                            onChange={(event) =>
                              updateEditingField(field.id, {
                                placeholder: event.target.value,
                              })
                            }
                          />
                        </div>
                      ) : null}

                      {isChoiceField(field.type) ? (
                        <div className="space-y-2">
                          <Label>Opzioni</Label>
                          <Textarea
                            value={choiceOptionsToText(field)}
                            onChange={(event) =>
                              updateEditingField(field.id, {
                                options: parseChoiceOptions(event.target.value),
                              })
                            }
                            rows={4}
                          />
                        </div>
                      ) : null}

                      {isFileField(field.type) ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Tipi file accettati</Label>
                            <Input
                              value={
                                field.validation?.acceptedFileTypes?.join(", ") ||
                                ""
                              }
                              onChange={(event) =>
                                updateEditingField(field.id, {
                                  validation: {
                                    ...(field.validation || {}),
                                    acceptedFileTypes: event.target.value
                                      .split(",")
                                      .map((item) => item.trim())
                                      .filter(Boolean),
                                  },
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Dimensione max MB</Label>
                            <Input
                              type="number"
                              min={1}
                              value={field.validation?.maxFileSizeMb || 10}
                              onChange={(event) =>
                                updateEditingField(field.id, {
                                  validation: {
                                    ...(field.validation || {}),
                                    maxFileSizeMb: Number(event.target.value) || 10,
                                  },
                                })
                              }
                            />
                          </div>
                        </div>
                      ) : null}

                      {field.type === "number" ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Min</Label>
                            <Input
                              type="number"
                              value={field.validation?.min ?? ""}
                              onChange={(event) =>
                                updateEditingField(field.id, {
                                  validation: {
                                    ...(field.validation || {}),
                                    min:
                                      event.target.value === ""
                                        ? undefined
                                        : Number(event.target.value),
                                  },
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Max</Label>
                            <Input
                              type="number"
                              value={field.validation?.max ?? ""}
                              onChange={(event) =>
                                updateEditingField(field.id, {
                                  validation: {
                                    ...(field.validation || {}),
                                    max:
                                      event.target.value === ""
                                        ? undefined
                                        : Number(event.target.value),
                                  },
                                })
                              }
                            />
                          </div>
                        </div>
                      ) : null}

                      {!isReadOnlyField(field.type) ? (
                        <div className="flex items-center justify-between rounded-lg border p-3">
                          <Label>Obbligatoria</Label>
                          <Switch
                            checked={field.required}
                            onCheckedChange={(checked) =>
                              updateEditingField(field.id, {
                                required: Boolean(checked),
                              })
                            }
                          />
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Impostazioni</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  ["collectEmail", "Raccogli email"],
                  ["requiresAuth", "Richiedi login"],
                  ["allowMultipleResponses", "Risposte multiple"],
                  ["requireParentSignature", "Firma genitore"],
                  ["notifyClubOnSubmit", "Notifica il club"],
                ].map(([key, label]) => {
                  const checked =
                    key === "requiresAuth"
                      ? editingForm.requiresAuth
                      : Boolean(
                          editingForm.settings[
                            key as keyof typeof editingForm.settings
                          ],
                        );
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <Label>{label}</Label>
                      <Switch
                        checked={checked}
                        onCheckedChange={(value) => {
                          if (key === "requiresAuth") {
                            setEditingForm({
                              ...editingForm,
                              requiresAuth: Boolean(value),
                              requires_auth: Boolean(value),
                            });
                            return;
                          }
                          setEditingForm({
                            ...editingForm,
                            settings: {
                              ...editingForm.settings,
                              [key]: Boolean(value),
                            },
                          });
                        }}
                      />
                    </div>
                  );
                })}
                <div className="space-y-2">
                  <Label>Chiusura modulo</Label>
                  <Input
                    type="date"
                    value={editingForm.settings.closeAt || ""}
                    onChange={(event) =>
                      setEditingForm({
                        ...editingForm,
                        settings: {
                          ...editingForm.settings,
                          closeAt: event.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Messaggio di successo</Label>
                  <Textarea
                    value={editingForm.settings.successMessage || ""}
                    onChange={(event) =>
                      setEditingForm({
                        ...editingForm,
                        settings: {
                          ...editingForm.settings,
                          successMessage: event.target.value,
                        },
                      })
                    }
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Anteprima</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {editingForm.title || "Titolo modulo"}
                  </h3>
                  {editingForm.description ? (
                    <p className="mt-1 text-sm text-slate-500">
                      {editingForm.description}
                    </p>
                  ) : null}
                </div>
                {editingForm.fields.slice(0, 6).map((field) => (
                  <div key={field.id} className="space-y-1 rounded-lg border p-3">
                    {field.type === "section" ? (
                      <p className="font-semibold">{field.label}</p>
                    ) : field.type === "divider" ? (
                      <div className="border-t" />
                    ) : (
                      <>
                        <Label>
                          {field.label}
                          {field.required ? " *" : ""}
                        </Label>
                        {field.type === "long_text" ? (
                          <Textarea disabled placeholder={field.placeholder} />
                        ) : field.type === "checkbox" ||
                          field.type === "consent" ? (
                          <div className="flex items-center gap-2 text-sm">
                            <Checkbox disabled />
                            <span>{field.description || field.label}</span>
                          </div>
                        ) : isChoiceField(field.type) ? (
                          <div className="space-y-1 text-sm text-slate-600">
                            {(field.options || ["Opzione"]).map((option) => (
                              <div key={option}>○ {option}</div>
                            ))}
                          </div>
                        ) : field.type === "file_upload" ||
                          field.type === "image" ? (
                          <Input disabled type="file" />
                        ) : field.type === "signature" ? (
                          <div className="h-20 rounded-md border border-dashed bg-slate-50" />
                        ) : (
                          <Input
                            disabled
                            type={
                              field.type === "email"
                                ? "email"
                                : field.type === "number"
                                  ? "number"
                                  : field.type === "date"
                                    ? "date"
                                    : "text"
                            }
                            placeholder={field.placeholder}
                          />
                        )}
                      </>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Moduli online</h2>
          <p className="text-sm text-slate-500">
            Crea moduli compilabili e raccogli risposte online.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => createNewForm(false)} disabled={saving}>
            <Plus className="mr-2 h-4 w-4" />
            Crea modulo
          </Button>
        </div>
      </div>

      {activeForms.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-slate-400" />
          <h3 className="font-semibold text-slate-900">
            Nessun modulo online attivo.
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
            Crea un modulo per iscrizioni, privacy, questionari o richieste
            documenti.
          </p>
          <Button className="mt-5" onClick={() => createNewForm(false)}>
            <Plus className="mr-2 h-4 w-4" />
            Crea modulo
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[280px]">Nome modulo</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Visibilità / Pubblicazione</TableHead>
                <TableHead>Risposte</TableHead>
                <TableHead>Ultima modifica</TableHead>
                <TableHead>Link / Condivisione</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeForms.map((form) => {
                const isPublished = form.status === "published";
                const responseCount = submissionCountByFormId[form.id] || 0;

                return (
                  <TableRow key={form.id}>
                    <TableCell>
                      <div className="font-medium text-slate-900">
                        {form.title}
                      </div>
                      <div className="max-w-md truncate text-xs text-slate-500">
                        {form.description || "Modulo online"}
                      </div>
                      <div className="mt-2">
                        <Badge
                          variant="outline"
                          className={getStatusBadgeClassName(form.status)}
                        >
                          {ONLINE_FORM_STATUS_LABELS[form.status]}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={getStatusBadgeClassName(form.status)}
                      >
                        {ONLINE_FORM_STATUS_LABELS[form.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={isPublished ? "default" : "outline"}
                        onClick={() =>
                          updateFormStatus(
                            form,
                            isPublished ? "unpublish" : "publish",
                          )
                        }
                        disabled={saving || form.status === "archived"}
                        className={
                          isPublished
                            ? "bg-green-600 text-white hover:bg-green-700"
                            : "border-blue-200 text-blue-700 hover:bg-blue-50"
                        }
                      >
                        {isPublished ? "Non pubblicare" : "Pubblica"}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-0"
                        onClick={() => {
                          setSelectedResponsesFormId(form.id);
                          setSelectedSubmissionId("");
                        }}
                      >
                        <ListChecks className="mr-2 h-4 w-4" />
                        {responseCount} Risposte
                      </Button>
                    </TableCell>
                    <TableCell>{formatFormDate(form.updatedAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => copyPublicLink(form)}
                          disabled={!isPublished}
                          aria-label={`Copia link ${form.title}`}
                          title={
                            isPublished
                              ? "Copia link"
                              : "Pubblica il modulo per condividerlo"
                          }
                        >
                          <LinkIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setSharingForm(form)}
                          disabled={!isPublished}
                          aria-label={`Condividi ${form.title}`}
                          title={
                            isPublished
                              ? "Condividi modulo"
                              : "Pubblica il modulo per condividerlo"
                          }
                        >
                          <QrCode className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Azioni ${form.title}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingForm(form)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Modifica
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => duplicateForm(form)}
                            disabled={saving}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Duplica
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedResponsesFormId(form.id);
                              setSelectedSubmissionId("");
                            }}
                          >
                            <ListChecks className="mr-2 h-4 w-4" />
                            Risposte
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => updateFormStatus(form, "archive")}
                            disabled={saving}
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            Archivia
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <FormShareDialog
        open={Boolean(sharingForm)}
        onOpenChange={(open) => {
          if (!open) setSharingForm(null);
        }}
        form={sharingForm}
        publicUrl={sharingForm ? getPublicLink(sharingForm) : ""}
      />
    </div>
  );
}
