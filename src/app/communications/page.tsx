"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest, readStoredActiveClub } from "@/lib/api/client";
import { AUDIENCE_EXCLUSION_LABELS } from "@/lib/audience/recipients";
import { AUDIENCE_CRITERION_LABELS } from "@/lib/audience/criteria";
import { AlertTriangle, Eye, Mail, Send, Users } from "lucide-react";

/**
 * Un punto di partenza per chi non sa da dove cominciare.
 *
 * **Non e un modello del dominio**: i modelli veri sono quelli delle
 * automazioni (`src/lib/messages/defaults.ts`) e usano segnaposto economici e
 * di evento, che in una comunicazione massiva non si risolvono — parlano di
 * **una** posizione, e un messaggio a una famiglia con due figli ne ha due.
 * Questo e testo dell'interfaccia, e resta qui.
 */
const TESTO_DI_PARTENZA = {
  subject: "Comunicazione da {{club.name}}",
  body: [
    "Gentile {{recipient.name}},",
    "",
    "",
    "",
    "Un saluto,",
    "{{club.name}}",
  ].join("\n"),
};

/**
 * La comunicazione massiva alle famiglie (W2-C, G-07).
 *
 * **Perche l'anteprima non e facoltativa.** Un invio massivo e irreversibile e
 * raggiunge persone reali fuori dal prodotto: l'unico momento in cui si puo
 * correggere e **prima**. La schermata quindi non ha un pulsante «manda» finche
 * non si e visto chi si raggiunge, chi no e con che motivo, e il messaggio
 * **come lo leggera il primo destinatario** — non un esempio con dati finti.
 *
 * **Perche i motivi si mostrano tutti.** Il difetto che questa Wave chiude e
 * un invio che si dichiara riuscito senza aver raggiunto nessuno. Qui ogni
 * famiglia che resta fuori compare, con il motivo, e il conteggio degli esclusi
 * sta accanto a quello dei raggiunti invece che in fondo alla pagina.
 */

type AudienceKind =
  | "all_families"
  | "category_ids"
  | "group_ids"
  | "site_ids"
  | "overdue_payments"
  | "certificate_missing_or_expiring"
  | "no_account";

type Preview = {
  clubName: string;
  communicationId: string;
  criteriaLabel: string;
  reachable: Array<{
    email: string;
    name: string;
    athleteNames: string[];
    hasAccount: boolean;
  }>;
  excluded: Array<{
    athleteName: string;
    guardianName: string | null;
    email: string | null;
    reason: keyof typeof AUDIENCE_EXCLUSION_LABELS;
  }>;
  counts: { recipients: number; positions: number; excluded: number };
  sample: {
    to: string;
    subject: string;
    text: string;
    unresolved: string[];
  } | null;
  invalidPlaceholders: string[];
  emailConfigured: boolean;
  canSend: boolean;
  blockedReason: string | null;
};

type Outcome = {
  totals: { sent: number; skipped: number; failed: number };
  remaining: number;
  deliveries: Array<{
    email: string;
    name: string;
    status: "sent" | "skipped" | "failed";
    reason: string | null;
  }>;
};

type Option = { id: string; label: string };

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

const optionLabel = (record: any) =>
  String(record?.name || record?.label || record?.title || record?.id || "");

export default function CommunicationsPage() {
  const { showToast } = useToast();

  const [clubName, setClubName] = useState("");
  const [kind, setKind] = useState<AudienceKind>("all_families");
  const [selected, setSelected] = useState<string[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [groups, setGroups] = useState<Option[]>([]);
  const [sites, setSites] = useState<Option[]>([]);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [preview, setPreview] = useState<Preview | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "send">("");

  /*
    L'identificativo nasce quando si apre la finestra di composizione, non
    quando si preme: e cio che rende due clic sullo stesso pulsante **lo stesso
    gesto**. Un reinvio deliberato passa da «Nuova comunicazione», che ne
    genera uno nuovo.
  */
  const [communicationId, setCommunicationId] = useState("");

  useEffect(() => {
    setCommunicationId(
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : String(Date.now()),
    );
    setClubName(readStoredActiveClub()?.name || "");
  }, []);

  useEffect(() => {
    let annullato = false;

    const carica = async () => {
      const [categorie, gruppi, sedi] = await Promise.all([
        apiRequest<any[]>("/api/v1/categories"),
        apiRequest<any[]>("/api/v1/category_groups"),
        apiRequest<any[]>("/api/v1/club_sites"),
      ]);

      if (annullato) return;

      const mappa = (response: { data?: any }): Option[] =>
        asArray(response?.data).map((record) => ({
          id: String(record?.id || ""),
          label: optionLabel(record),
        }));

      setCategories(mappa(categorie));
      setGroups(mappa(gruppi));
      setSites(mappa(sedi));
    };

    carica().catch(() => undefined);

    return () => {
      annullato = true;
    };
  }, []);

  const opzioni = useMemo(() => {
    if (kind === "category_ids") return categories;
    if (kind === "group_ids") return groups;
    if (kind === "site_ids") return sites;
    return [];
  }, [kind, categories, groups, sites]);

  const criteria = useMemo(() => {
    if (
      kind === "category_ids" ||
      kind === "group_ids" ||
      kind === "site_ids"
    ) {
      return [{ kind, values: selected }];
    }
    return [{ kind }];
  }, [kind, selected]);

  const richiedi = useCallback(
    async (modalita: "preview" | "send") => {
      if (!subject.trim() || !body.trim()) {
        showToast("error", "Oggetto e testo del messaggio sono obbligatori");
        return;
      }
      if (opzioni.length > 0 && selected.length === 0) {
        showToast("error", "Seleziona almeno una voce per questo criterio");
        return;
      }

      setBusy(modalita);
      const response = await apiRequest<any>("/api/v1/communications", {
        method: "POST",
        body: {
          criteria,
          template: { subject, body },
          communication_id: communicationId,
          ...(modalita === "preview" ? { preview: true } : {}),
        },
      });
      setBusy("");

      if (response.error || !response.data) {
        showToast(
          "error",
          response.error?.message || "Operazione non riuscita",
        );
        return;
      }

      if (modalita === "preview") {
        setPreview(response.data as Preview);
        setOutcome(null);
        return;
      }

      const esito = response.data as Outcome;
      setOutcome(esito);
      showToast(
        esito.totals.sent > 0 ? "success" : "error",
        esito.totals.sent > 0
          ? `Inviato a ${esito.totals.sent} destinatari`
          : "Nessun messaggio inviato: leggi l'esito per destinatario",
      );
    },
    [subject, body, criteria, communicationId, opzioni, selected, showToast],
  );

  const nuovaComunicazione = () => {
    setPreview(null);
    setOutcome(null);
    setSubject("");
    setBody("");
    setSelected([]);
    setCommunicationId(
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : String(Date.now()),
    );
  };

  return (
    <div className="flex h-[100dvh] bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Comunicazioni" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-6xl">
            <SharedPageHeader
              title="Comunicazioni"
              subtitle={`Scrivi alle famiglie ${clubName ? `di ${clubName}` : "del club"} e vedi chi raggiungi prima di mandare.`}
              actions={
                <Button variant="outline" onClick={nuovaComunicazione}>
                  Nuova comunicazione
                </Button>
              }
            />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-4 w-4" aria-hidden="true" />
                    Destinatari
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="criterio">Criterio</Label>
                    <select
                      id="criterio"
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                      value={kind}
                      onChange={(event) => {
                        setKind(event.target.value as AudienceKind);
                        setSelected([]);
                        setPreview(null);
                      }}
                    >
                      {(
                        [
                          "all_families",
                          "category_ids",
                          "group_ids",
                          "site_ids",
                          "overdue_payments",
                          "certificate_missing_or_expiring",
                          "no_account",
                        ] as AudienceKind[]
                      ).map((value) => (
                        <option key={value} value={value}>
                          {AUDIENCE_CRITERION_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {opzioni.length > 0 ? (
                    <div className="space-y-2">
                      <Label>Seleziona</Label>
                      <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                        {opzioni.map((opzione) => (
                          <label
                            key={opzione.id}
                            className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50"
                          >
                            <input
                              type="checkbox"
                              checked={selected.includes(opzione.id)}
                              onChange={(event) => {
                                setPreview(null);
                                setSelected((current) =>
                                  event.target.checked
                                    ? [...current, opzione.id]
                                    : current.filter((id) => id !== opzione.id),
                                );
                              }}
                            />
                            <span>{opzione.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor="oggetto">Oggetto</Label>
                    <Input
                      id="oggetto"
                      value={subject}
                      onChange={(event) => {
                        setSubject(event.target.value);
                        setPreview(null);
                      }}
                      placeholder="Comunicazione da {{club.name}}"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="testo">Messaggio</Label>
                    <Textarea
                      id="testo"
                      className="h-40"
                      value={body}
                      onChange={(event) => {
                        setBody(event.target.value);
                        setPreview(null);
                      }}
                      placeholder="Gentile {{recipient.name}}, ..."
                    />
                    <p className="text-xs text-slate-500">
                      Segnaposto disponibili: <code>{"{{club.name}}"}</code>,{" "}
                      <code>{"{{recipient.name}}"}</code>,{" "}
                      <code>{"{{athlete.first_name}}"}</code>.
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      onClick={() => {
                        setSubject(TESTO_DI_PARTENZA.subject);
                        setBody(TESTO_DI_PARTENZA.body);
                        setPreview(null);
                      }}
                    >
                      Parti da un testo
                    </Button>
                  </div>

                  <Button
                    className="w-full"
                    disabled={busy !== ""}
                    onClick={() => richiedi("preview")}
                  >
                    <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                    {busy === "preview" ? "Calcolo…" : "Vedi chi raggiungo"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    Anteprima
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!preview ? (
                    <p className="text-sm text-slate-500">
                      Scrivi il messaggio e premi «Vedi chi raggiungo»: nessun
                      invio parte prima di questo passaggio.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                          {preview.counts.recipients} raggiungibili
                        </Badge>
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                          {preview.counts.excluded} esclusi
                        </Badge>
                        <Badge variant="outline">{preview.criteriaLabel}</Badge>
                      </div>

                      {preview.blockedReason ? (
                        <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                          <AlertTriangle
                            className="mt-0.5 h-4 w-4 shrink-0"
                            aria-hidden="true"
                          />
                          <span>{preview.blockedReason}</span>
                        </div>
                      ) : null}

                      {preview.sample ? (
                        <div className="rounded-md border border-slate-200 bg-white p-3">
                          <p className="text-xs uppercase text-slate-500">
                            Come lo leggera {preview.sample.to}
                          </p>
                          <p className="mt-1 font-medium text-slate-900">
                            {preview.sample.subject}
                          </p>
                          <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">
                            {preview.sample.text}
                          </pre>
                          {preview.sample.unresolved.length > 0 ? (
                            <p className="mt-2 text-xs text-amber-700">
                              Senza valore:{" "}
                              {preview.sample.unresolved.join(", ")}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {preview.excluded.length > 0 ? (
                        <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200">
                          <table className="w-full text-left text-sm">
                            <tbody>
                              {preview.excluded.map((row, index) => (
                                <tr
                                  key={`${row.athleteName}-${row.email || index}`}
                                  className="border-b last:border-0"
                                >
                                  <td className="px-3 py-2">
                                    {row.athleteName}
                                  </td>
                                  <td className="px-3 py-2 text-slate-500">
                                    {AUDIENCE_EXCLUSION_LABELS[row.reason] ||
                                      row.reason}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}

                      <Button
                        className="w-full bg-blue-600 hover:bg-blue-700"
                        disabled={!preview.canSend || busy !== ""}
                        onClick={() => richiedi("send")}
                      >
                        <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                        {busy === "send"
                          ? "Invio…"
                          : `Manda a ${preview.counts.recipients}`}
                      </Button>
                    </>
                  )}

                  {outcome ? (
                    <div className="space-y-2 rounded-md bg-slate-50 p-3">
                      <p className="text-sm font-medium text-slate-900">
                        Inviati {outcome.totals.sent} · saltati{" "}
                        {outcome.totals.skipped} · falliti{" "}
                        {outcome.totals.failed}
                      </p>
                      {outcome.remaining > 0 ? (
                        <Button
                          variant="outline"
                          className="w-full"
                          disabled={busy !== ""}
                          onClick={() => richiedi("send")}
                        >
                          Continua: restano {outcome.remaining}
                        </Button>
                      ) : null}
                      <div className="max-h-40 overflow-y-auto text-sm">
                        {outcome.deliveries.map((row, index) => (
                          <p
                            key={`${row.email}-${index}`}
                            className="flex justify-between gap-2 border-b py-1 last:border-0"
                          >
                            <span className="truncate">
                              {row.email || row.name || "—"}
                            </span>
                            <span
                              className={
                                row.status === "sent"
                                  ? "text-emerald-700"
                                  : row.status === "failed"
                                    ? "text-red-700"
                                    : "text-slate-500"
                              }
                            >
                              {row.status}
                              {row.reason ? ` · ${row.reason}` : ""}
                            </span>
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
