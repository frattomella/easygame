"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { openClientFileUrl } from "@/lib/client-files";
import { cn } from "@/lib/utils";
import {
  REVIEW_QUEUE_FILTERS,
  countReviewQueue,
  filterReviewQueue,
  getReviewQueueStateClassName,
  getReviewQueueStateLabel,
  reviewQueueActions,
  searchReviewQueue,
  type DocumentReviewRow,
  type ReviewQueueFilter,
} from "@/lib/documents/review-queue";

/**
 * **La coda «documenti da verificare» del club** (Wave 6, lane 6E, §5.2, W6-39).
 *
 * ---
 *
 * ## Perche questa schermata non esisteva
 *
 * Il servizio sa rispondere a «cosa c'e da verificare in questo club» dalla
 * Wave 5 — `listPendingDocumentSubmissions` accetta anche l'assenza di
 * `subject_id` — e nessun componente glielo chiedeva. La segreteria doveva
 * aprire la scheda di un atleta per volta: e il modo in cui un lavoro
 * quotidiano diventa un lavoro che nessuno fa.
 *
 * ## Cio che un pulsante non fa, non si mostra
 *
 * «Approva», «Rifiuta» e «Chiedi integrazione» compaiono solo su un deposito
 * che aspetta una decisione. Su una richiesta senza file non c'e niente da
 * decidere; su una gia decisa la tabella e append-only e il server risponde
 * «una decisione presa non si riscrive». La regola la dice
 * `reviewQueueActions`, che e la stessa che il test interroga.
 *
 * ## Il motivo del rifiuto e obbligatorio, e lo si chiede prima
 *
 * Il server lo pretende (`explainDocumentDecisionNoteDenial`). Chiederlo dopo
 * l'errore vorrebbe dire far scoprire la regola con un messaggio rosso: qui il
 * pulsante apre un campo, e finche il campo e vuoto l'invio non parte.
 */

type Props = {
  /** Vero quando il ruolo porta `documents.review`. Lo decide chi monta. */
  canReview: boolean;
  /** Per aprire la coda di un solo atleta, dalla sua scheda. */
  subjectId?: string | null;
};

type Decisione = {
  row: DocumentReviewRow;
  decision: "approved" | "rejected";
};

const formatDate = (value?: string | null) => {
  const testo = String(value || "").trim();
  if (!testo) return "";
  const data = new Date(testo);
  if (Number.isNaN(data.getTime())) return testo;

  return data.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const ETICHETTA_SORGENTE: Record<string, string> = {
  parent: "Famiglia",
  club: "Segreteria",
  public_form: "Modulo pubblico",
};

export function DocumentReviewInbox({ canReview, subjectId = null }: Props) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<DocumentReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  /*
    W6-44 vale anche qui: un elenco vuoto e un elenco che non si e caricato
    sono due cose diverse, e per una segreteria la differenza fra «nessuno ha
    caricato niente» e «non lo so» e tutta.
  */
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<ReviewQueueFilter>("new");
  const [query, setQuery] = useState("");
  const [decisione, setDecisione] = useState<Decisione | null>(null);
  const [motivo, setMotivo] = useState("");
  const [inCorso, setInCorso] = useState(false);

  const carica = useCallback(async () => {
    if (!canReview) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");

    const parametri = new URLSearchParams({ view: "queue" });
    if (subjectId) {
      parametri.set("subject_kind", "athlete");
      parametri.set("subject_id", subjectId);
    }

    const payload = await apiRequest<DocumentReviewRow[]>(
      `/api/v1/document-submissions?${parametri.toString()}`,
    );

    if (payload?.error) {
      setRows([]);
      setLoadError(
        payload.error.message || "Impossibile leggere la coda dei documenti",
      );
    } else {
      setRows(Array.isArray(payload?.data) ? payload.data : []);
    }

    setLoading(false);
  }, [canReview, subjectId]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const conteggi = useMemo(() => countReviewQueue(rows), [rows]);
  const visibili = useMemo(
    () => searchReviewQueue(filterReviewQueue(rows, filter), query),
    [rows, filter, query],
  );

  const decidi = useCallback(async () => {
    if (!decisione) return;
    const { row, decision } = decisione;
    if (decision === "rejected" && !motivo.trim()) {
      showToast("error", "Il motivo del rifiuto e obbligatorio");
      return;
    }

    setInCorso(true);
    const payload = await apiRequest<unknown>(
      `/api/v1/document-submissions/${row.submissionId || row.id}`,
      { method: "POST", body: { decision, note: motivo.trim() || null } },
    );
    setInCorso(false);

    if (payload?.error) {
      showToast("error", payload.error.message || "Decisione non riuscita");
      return;
    }

    showToast(
      "success",
      decision === "approved" ? "Documento approvato" : "Documento rifiutato",
    );
    setDecisione(null);
    setMotivo("");
    await carica();
  }, [carica, decisione, motivo, showToast]);

  if (!canReview) {
    return (
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-6 text-sm text-slate-600">
          Accesso negato: la coda dei documenti da verificare la vede chi li
          verifica.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Le pastiglie scorrono in orizzontale a 375 px invece di andare a capo. */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {REVIEW_QUEUE_FILTERS.map((voce) => (
            <button
              key={voce.key}
              type="button"
              onClick={() => setFilter(voce.key)}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition",
                filter === voce.key
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
              )}
            >
              {voce.label}
              <span
                className={cn(
                  "ml-2 rounded-full px-1.5 text-xs",
                  filter === voce.key
                    ? "bg-white/20"
                    : "bg-slate-100 text-slate-500",
                )}
              >
                {conteggi[voce.key] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 lg:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Atleta, documento, genitore"
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => void carica()}>
            <RefreshCw className="h-4 w-4" />
            <span className="sr-only">Ricarica</span>
          </Button>
        </div>
      </div>

      {loadError ? (
        <Card className="border-red-200 bg-red-50 shadow-sm">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">
                La coda non e stata caricata.
              </p>
              <p className="mt-1">{loadError}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">
            {loading
              ? "Caricamento..."
              : `${visibili.length} document${visibili.length === 1 ? "o" : "i"}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!loading && !loadError && visibili.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              Nessun documento in questa vista.
            </p>
          ) : null}

          {visibili.map((row) => {
            const azioni = reviewQueueActions(row);

            return (
              <div
                key={`${row.id}:${row.submissionId || "vuoto"}`}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-950">
                      {row.subjectName || "Atleta"}
                    </p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "border",
                        getReviewQueueStateClassName(row.state),
                      )}
                    >
                      {getReviewQueueStateLabel(row.state)}
                    </Badge>
                    {row.overdue ? (
                      <Badge
                        variant="outline"
                        className="border border-red-200 bg-red-50 text-red-700"
                      >
                        Scaduto
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-700">
                    {row.title}
                    <span className="text-slate-400"> · </span>
                    <span className="text-slate-500">
                      {row.documentKindLabel}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.submittedAt
                      ? `Caricato il ${formatDate(row.submittedAt)}`
                      : "Nessun file consegnato"}
                    {row.submittedByName ? ` da ${row.submittedByName}` : ""}
                    {row.source
                      ? ` (${ETICHETTA_SORGENTE[row.source] || row.source})`
                      : ""}
                    {row.dueDate ? ` · Scadenza ${formatDate(row.dueDate)}` : ""}
                  </p>
                  {row.state === "rejected" && row.decisionNote ? (
                    <p className="mt-1 text-xs font-medium text-amber-700">
                      Motivo: {row.decisionNote}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {azioni.canOpen ? (
                    /*
                      `openClientFileUrl` e non un `<a href>`: un allegato puo
                      arrivare come `data:` URL, e su ogni browser recente un
                      link diretto a un data URL non apre niente. Il presidio e
                      in `tests/lib/attachment-names.test.mjs`.
                    */
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openClientFileUrl(row.fileUrl)}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Apri
                    </Button>
                  ) : null}
                  {azioni.canDecide ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          setMotivo("");
                          setDecisione({ row, decision: "approved" });
                        }}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Approva
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setMotivo("");
                          setDecisione({ row, decision: "rejected" });
                        }}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Rifiuta
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {decisione ? (
        <Card className="border-slate-300 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              {decisione.decision === "approved"
                ? `Approvi «${decisione.row.title}»?`
                : `Chiedi di rifare «${decisione.row.title}»`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {decisione.decision === "rejected" ? (
              <label className="block text-sm font-medium text-slate-700">
                Motivo, obbligatorio
                <Textarea
                  value={motivo}
                  onChange={(event) => setMotivo(event.target.value)}
                  placeholder="Cosa deve rifare la famiglia: senza questo, ricarica lo stesso file."
                  className="mt-2"
                  rows={3}
                />
              </label>
            ) : (
              <label className="block text-sm font-medium text-slate-700">
                Nota, facoltativa
                <Textarea
                  value={motivo}
                  onChange={(event) => setMotivo(event.target.value)}
                  className="mt-2"
                  rows={2}
                />
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void decidi()}
                disabled={
                  inCorso ||
                  (decisione.decision === "rejected" && !motivo.trim())
                }
              >
                {inCorso ? "Invio..." : "Conferma"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDecisione(null);
                  setMotivo("");
                }}
              >
                Annulla
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export default DocumentReviewInbox;
