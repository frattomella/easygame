"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Copy,
  FileText,
  Inbox,
  MoreVertical,
  Plus,
  RefreshCw,
  Sparkles,
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
import { DISTRIBUTABLE_FORM_CATALOG, FORM_CATALOG } from "@/lib/forms/catalog";
import * as formsApi from "@/lib/api/forms";

/**
 * Modulistica: i moduli del club, la coda della segreteria, i modelli.
 *
 * Le prime due schede sono le due domande che si fanno aprendo questa pagina:
 * «che moduli ho?» e «cosa e arrivato?». Il secondo numero e quello che conta
 * ed e sull'etichetta della scheda: una compilazione che resta in coda per tre
 * settimane e un'iscrizione persa.
 *
 * **La terza scheda risponde a una domanda diversa** (W6-45): «cosa potrei
 * prendere?». I modelli consigliati erano voci di un menu a tendina sotto
 * «Nuovo modulo», e un modulo nato da «Iscrizione online» era poi
 * indistinguibile da uno scritto a mano. Adesso sono un **catalogo**, con la
 * stessa forma di quello dei modelli di documento (ADR-0092): si vede di che
 * classe e una voce, chi ne risponde e quando e stata riletta, e la copia che
 * il club adotta dice da quale modello viene.
 *
 * **Tre stati, non due** (W6-44). Il fallimento della lettura mostrava un
 * toast e lasciava l'elenco vuoto: chi arrivava leggeva «Nessun modulo, per
 * ora», che e la stessa frase di un club che davvero non ne ha. Un errore di
 * rete e un 403 diventavano «non c'e niente», cioe una bugia. Caricamento,
 * errore ed elenco vuoto sono adesso tre schermate distinte, e l'errore ha un
 * «Riprova» perche l'unica azione utile e quella.
 */

const STATUS_TONES: Record<string, string> = {
  published: "border-emerald-200 bg-emerald-50 text-emerald-700",
  draft: "border-amber-200 bg-amber-50 text-amber-700",
  archived: "border-slate-200 bg-slate-100 text-slate-600",
};

/**
 * La classe redazionale di una voce, detta a chi la adotta.
 *
 * Non e una sigla da nascondere: dice **chi puo mantenere quel contenuto**.
 * Oggi escono solo le `A`; le altre due sono qui perche il giorno in cui una
 * `B` o una `C` venisse validata l'elenco non debba imparare una parola nuova.
 */
const FORM_CATALOG_CLASS_LABELS: Record<string, string> = {
  A: "Classe A — campi che EasyGame sa gia leggere e scrivere",
  B: "Classe B — modulo di un ente terzo",
  C: "Classe C — contenuto legale o fiscale",
};

/** I titoli delle voci, per dire da quale modello viene un modulo del club. */
const catalogTitleByKey = new Map(
  FORM_CATALOG.map((entry) => [entry.key, entry.title]),
);

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

/**
 * Lo stato di una lettura: **tre valori, non un booleano**.
 *
 * Un `loading` piu una lista vuota non sa dire «ho provato e non ci sono
 * riuscito», ed e esattamente cio che serve dire.
 */
type LoadState = { status: "loading" | "ready" | "error"; error: string };

const LOADING: LoadState = { status: "loading", error: "" };
const READY: LoadState = { status: "ready", error: "" };

/**
 * Errore ed elenco vuoto sono due schermate diverse: questa e la prima.
 *
 * L'unica azione che ha senso offrire e riprovare — la lettura e fallita, non
 * ha risposto «non hai il permesso di vedere un pulsante».
 */
const LoadFailure = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) => (
  <Card className="border-red-200 bg-red-50">
    <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
      <AlertTriangle className="h-8 w-8 text-red-500" aria-hidden />
      <p role="alert" className="font-medium text-red-900">
        {message}
      </p>
      <Button
        type="button"
        variant="outline"
        className="min-h-[44px] bg-white"
        onClick={onRetry}
      >
        <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
        Riprova
      </Button>
    </CardContent>
  </Card>
);

export function FormsDashboard() {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<FormTemplateSummary[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmissionRecord[]>([]);
  const [openTemplate, setOpenTemplate] = useState<FormTemplateDetail | null>(
    null,
  );
  const [reviewing, setReviewing] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [templatesState, setTemplatesState] = useState<LoadState>(LOADING);
  const [submissionsState, setSubmissionsState] = useState<LoadState>(LOADING);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [adoptingKey, setAdoptingKey] = useState("");

  const loadTemplates = useCallback(async () => {
    setTemplatesState(LOADING);
    try {
      setTemplates(await formsApi.fetchFormTemplates({ includeArchived }));
      setTemplatesState(READY);
    } catch (error: any) {
      /*
        L'elenco precedente si **butta**: tenerlo accanto a un messaggio di
        errore direbbe «questi sono i tuoi moduli» di una lista che potrebbe
        essere di dieci minuti fa.
      */
      setTemplates([]);
      setTemplatesState({
        status: "error",
        error: error?.message || "Non riesco a leggere i moduli",
      });
    }
  }, [includeArchived]);

  const loadSubmissions = useCallback(async () => {
    setSubmissionsState(LOADING);
    try {
      const result = await formsApi.fetchFormSubmissions({
        status: statusFilter,
        limit: 50,
      });
      setSubmissions(result.items);
      setSubmissionsState(READY);
    } catch (error: any) {
      setSubmissions([]);
      setSubmissionsState({
        status: "error",
        error: error?.message || "Non riesco a leggere la coda",
      });
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  const pendingTotal = useMemo(
    () => templates.reduce((total, template) => total + template.pendingCount, 0),
    [templates],
  );

  /*
    Creare un modulo vuoto e adottare un modello sono lo **stesso** gesto e la
    stessa rotta: cambia solo cosa si cita. Due strade per creare un modulo
    sarebbero due modi di finire con impostazioni diverse.
  */
  const create = async (starter: string) => {
    setAdoptingKey(starter);
    try {
      const created = await formsApi.createFormTemplate(starter);
      await loadTemplates();
      setOpenTemplate(created);
    } catch (error: any) {
      showToast("error", error?.message || "Non riesco a creare il modulo");
    } finally {
      setAdoptingKey("");
    }
  };

  /*
    Cio che il club ha gia preso. Le voci adottate restano in elenco, dette
    come tali: sparire vorrebbe dire lasciare chi cerca «l'iscrizione online»
    davanti a un catalogo che non la nomina piu.
  */
  const adoptedCatalogKeys = useMemo(
    () =>
      new Set(
        templates
          .map((template) => template.catalogKey)
          .filter((key): key is string => Boolean(key)),
      ),
    [templates],
  );

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
        {/* Tre etichette che vanno a capo: a 375 px non stanno su una riga. */}
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="moduli">Moduli</TabsTrigger>
          <TabsTrigger value="coda">
            Da esaminare{pendingTotal ? ` (${pendingTotal})` : ""}
          </TabsTrigger>
          <TabsTrigger value="modelli">Modelli consigliati</TabsTrigger>
        </TabsList>

        <TabsContent value="moduli" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/*
              **Un pulsante solo, e fa una cosa sola**: apre un modulo vuoto.
              I due modelli scritti da EasyGame non sono voci di questo menu —
              stanno in «Modelli consigliati», che e dove si sceglie cosa
              prendere. Mescolare le due domande e cio che rendeva un modulo
              adottato indistinguibile da uno scritto a mano (W6-45).
            */}
            <Button
              type="button"
              onClick={() => void create("blank")}
              disabled={Boolean(adoptingKey)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nuovo modulo
            </Button>

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

          {templatesState.status === "loading" ? (
            <ListSkeleton rows={3} />
          ) : templatesState.status === "error" ? (
            <LoadFailure
              message={templatesState.error}
              onRetry={() => void loadTemplates()}
            />
          ) : templates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <FileText className="h-8 w-8 text-slate-400" />
                <p className="font-medium text-slate-900">
                  Nessun modulo, per ora
                </p>
                <p className="max-w-sm text-sm text-slate-600">
                  «Iscrizione online» e gia scritto: lo trovi in{" "}
                  <strong>Modelli consigliati</strong>, con link pubblico, dati
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
                      {/*
                        **Da dove viene**, quando viene da qualche parte. Un
                        modulo adottato resta del club e si modifica
                        liberamente: questa riga non e una proprieta del
                        catalogo sul modulo, e la risposta alla domanda «da
                        quale modello e nato?», che prima non aveva risposta.
                      */}
                      {catalogTitleByKey.get(template.catalogKey) ? (
                        <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                          <Sparkles className="h-3 w-3" aria-hidden />
                          Da modello EasyGame:{" "}
                          {catalogTitleByKey.get(template.catalogKey)}
                        </p>
                      ) : null}
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

          {submissionsState.status === "loading" ? (
            <ListSkeleton rows={3} />
          ) : submissionsState.status === "error" ? (
            <LoadFailure
              message={submissionsState.error}
              onRetry={() => void loadSubmissions()}
            />
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

        {/*
          **Modelli consigliati EasyGame.**

          Non e un elenco di moduli del club: e cio che il club **puo**
          prendere, con la sua provenienza. Di ogni voce si dicono le tre cose
          che il catalogo dei documenti esiste per non tacere (ADR-0092): di
          che classe e, chi risponde del contenuto, quando e stato riletto
          l'ultima volta. Adottarne uno ne crea una **copia del club**, che da
          quel momento si modifica liberamente.
        */}
        <TabsContent value="modelli" className="space-y-4">
          <Card>
            <CardContent className="space-y-4 py-5">
              <div>
                <p className="font-display font-semibold text-slate-900">
                  Modelli consigliati EasyGame
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Moduli gia scritti che il club puo adottare. Adottarne uno ne
                  crea una <strong>copia del club</strong>: da quel momento si
                  modifica liberamente e il catalogo non la tocca piu.
                </p>
              </div>

              <div className="space-y-3">
                {DISTRIBUTABLE_FORM_CATALOG.map((entry) => {
                  const adottato = adoptedCatalogKeys.has(entry.key);

                  return (
                    <div
                      key={entry.key}
                      className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="break-words font-semibold text-slate-900">
                          {entry.title}
                        </p>
                        <p className="break-words text-sm text-slate-600">
                          {entry.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                            {FORM_CATALOG_CLASS_LABELS[entry.catalogClass] ||
                              `Classe ${entry.catalogClass}`}
                          </span>
                          {entry.purpose === "enrollment" ? (
                            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                              Iscrizione e rinnovo
                            </span>
                          ) : null}
                        </div>
                        <p className="break-words text-xs text-slate-500">
                          Del contenuto risponde {entry.editorialOwner} —
                          riletto il {formatDate(entry.lastReviewedAt)}
                        </p>
                      </div>
                      <div className="shrink-0">
                        {adottato ? (
                          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                            Gia fra i moduli del club
                          </span>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            className="min-h-[44px]"
                            onClick={() => void create(entry.key)}
                            disabled={Boolean(adoptingKey)}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            {adoptingKey === entry.key ? "Adozione..." : "Adotta"}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
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
