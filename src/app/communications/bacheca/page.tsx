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
import { apiRequest } from "@/lib/api/client";
import { AUDIENCE_CRITERION_LABELS } from "@/lib/audience/criteria";
import { CalendarClock, Eye, Megaphone, Send, Undo2 } from "lucide-react";

/**
 * La bacheca del club (W2-D, G-08).
 *
 * **Cosa distingue questa schermata da un elenco di notifiche.** Tre scaffali,
 * non uno: **programmati**, **in bacheca**, **scaduti**. Un avviso scaduto non
 * sparisce — resta consultabile, perche la prova di averlo pubblicato e proprio
 * cio per cui una bacheca esiste — ma non occupa lo spazio di quelli validi.
 *
 * **Perche accanto a ogni annuncio ci sono due numeri.** «Lo vedono in venti,
 * lo hanno aperto in tre» e l'unica informazione che dice a una segreteria se
 * un canale funziona. Un conteggio solo non lo direbbe.
 */

type Shelf = "draft" | "scheduled" | "current" | "expired";

type Announcement = {
  id: string;
  title: string;
  body: string;
  status: "draft" | "published";
  publishAt: string | null;
  expiresAt: string | null;
  publishedAt: string | null;
  criteria: Array<{ kind: string; values?: string[] }>;
  shelf: Shelf;
  audienceCount: number;
  readCount: number;
};

type CriterionKind =
  | "all_families"
  | "category_ids"
  | "group_ids"
  | "site_ids";

const SCAFFALI: Array<{ key: Shelf; label: string }> = [
  { key: "draft", label: "Bozze" },
  { key: "scheduled", label: "Programmati" },
  { key: "current", label: "In bacheca" },
  { key: "expired", label: "Scaduti" },
];

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

const formatDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
};

export default function BachecaPage() {
  const { showToast } = useToast();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [caricamento, setCaricamento] = useState(true);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<CriterionKind>("all_families");
  const [selected, setSelected] = useState<string[]>([]);
  const [publishAt, setPublishAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [opzioni, setOpzioni] = useState<
    Record<CriterionKind, Array<{ id: string; label: string }>>
  >({ all_families: [], category_ids: [], group_ids: [], site_ids: [] });
  const [busy, setBusy] = useState(false);

  const carica = useCallback(async () => {
    const response = await apiRequest<Announcement[]>("/api/v1/announcements");
    setCaricamento(false);

    if (response.error) {
      showToast("error", response.error.message || "Bacheca non leggibile");
      return;
    }
    setAnnouncements(asArray(response.data) as Announcement[]);
  }, [showToast]);

  useEffect(() => {
    carica();
  }, [carica]);

  useEffect(() => {
    const caricaOpzioni = async () => {
      const [categorie, gruppi, sedi] = await Promise.all([
        apiRequest<any[]>("/api/v1/categories"),
        apiRequest<any[]>("/api/v1/category_groups"),
        apiRequest<any[]>("/api/v1/club_sites"),
      ]);

      const mappa = (response: { data?: any }) =>
        asArray(response?.data).map((record) => ({
          id: String(record?.id || ""),
          label: String(record?.name || record?.label || record?.id || ""),
        }));

      setOpzioni({
        all_families: [],
        category_ids: mappa(categorie),
        group_ids: mappa(gruppi),
        site_ids: mappa(sedi),
      });
    };

    caricaOpzioni().catch(() => undefined);
  }, []);

  const perScaffale = useMemo(() => {
    const gruppi: Record<Shelf, Announcement[]> = {
      draft: [],
      scheduled: [],
      current: [],
      expired: [],
    };
    for (const annuncio of announcements) {
      gruppi[annuncio.shelf]?.push(annuncio);
    }
    return gruppi;
  }, [announcements]);

  const crea = async () => {
    if (opzioni[kind].length > 0 && selected.length === 0) {
      showToast("error", "Seleziona almeno una voce per questo criterio");
      return;
    }

    setBusy(true);
    const response = await apiRequest<Announcement>("/api/v1/announcements", {
      method: "POST",
      body: {
        title,
        body,
        criteria:
          kind === "all_families"
            ? [{ kind }]
            : [{ kind, values: selected }],
        publishAt: publishAt || null,
        expiresAt: expiresAt || null,
      },
    });
    setBusy(false);

    if (response.error || !response.data) {
      showToast("error", response.error?.message || "Annuncio non creato");
      return;
    }

    setTitle("");
    setBody("");
    setSelected([]);
    setPublishAt("");
    setExpiresAt("");
    showToast("success", "Bozza salvata: pubblicala quando vuoi");
    carica();
  };

  const azione = async (
    announcementId: string,
    action: "publish" | "withdraw",
  ) => {
    setBusy(true);
    const response = await apiRequest<any>(
      `/api/v1/announcements/${announcementId}`,
      { method: "POST", body: { action } },
    );
    setBusy(false);

    if (response.error) {
      showToast("error", response.error.message || "Operazione non riuscita");
      return;
    }

    if (action === "publish") {
      const esito = response.data || {};
      showToast(
        esito.delivered > 0 ? "success" : "error",
        esito.delivered > 0
          ? `In bacheca per ${esito.delivered} famiglie${esito.withoutAccount ? `, ${esito.withoutAccount} senza account` : ""}`
          : "Nessuna famiglia con un account puo leggerlo",
      );
    } else {
      showToast("success", "Annuncio ritirato dalla bacheca");
    }

    carica();
  };

  return (
    <div className="flex h-[100dvh] bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Bacheca" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-6xl">
            <SharedPageHeader
              title="Bacheca"
              subtitle="Gli avvisi che restano: chi li legge lo decidi tu, e vedi quanti li hanno aperti."
            />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Megaphone className="h-4 w-4" aria-hidden="true" />
                    Nuovo avviso
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="titolo">Titolo</Label>
                    <Input
                      id="titolo"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Domenica il campo e chiuso"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="corpo">Testo</Label>
                    <Textarea
                      id="corpo"
                      className="h-28"
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pubblico">Chi lo legge</Label>
                    <select
                      id="pubblico"
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                      value={kind}
                      onChange={(event) => {
                        setKind(event.target.value as CriterionKind);
                        setSelected([]);
                      }}
                    >
                      {(
                        [
                          "all_families",
                          "category_ids",
                          "group_ids",
                          "site_ids",
                        ] as CriterionKind[]
                      ).map((value) => (
                        <option key={value} value={value}>
                          {AUDIENCE_CRITERION_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {opzioni[kind].length > 0 ? (
                    <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                      {opzioni[kind].map((opzione) => (
                        <label
                          key={opzione.id}
                          className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={selected.includes(opzione.id)}
                            onChange={(event) =>
                              setSelected((current) =>
                                event.target.checked
                                  ? [...current, opzione.id]
                                  : current.filter((id) => id !== opzione.id),
                              )
                            }
                          />
                          <span>{opzione.label}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="dal">Esce il</Label>
                      <Input
                        id="dal"
                        type="date"
                        value={publishAt}
                        onChange={(event) => setPublishAt(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="al">Scade il</Label>
                      <Input
                        id="al"
                        type="date"
                        value={expiresAt}
                        onChange={(event) => setExpiresAt(event.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Senza data esce quando lo pubblichi. Un avviso scaduto non
                    viene cancellato: esce dalla bacheca e resta in archivio.
                  </p>

                  <Button
                    className="w-full"
                    disabled={busy || !title.trim() || !body.trim()}
                    onClick={crea}
                  >
                    Salva come bozza
                  </Button>
                </CardContent>
              </Card>

              <div className="space-y-6">
                {caricamento ? (
                  <Card>
                    <CardContent className="p-6 text-sm text-slate-500">
                      Carico la bacheca…
                    </CardContent>
                  </Card>
                ) : null}

                {SCAFFALI.map((scaffale) => {
                  const elenco = perScaffale[scaffale.key];
                  if (!elenco || elenco.length === 0) return null;

                  return (
                    <Card key={scaffale.key}>
                      <CardHeader>
                        <CardTitle className="text-base">
                          {scaffale.label}{" "}
                          <span className="text-slate-400">
                            ({elenco.length})
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {elenco.map((annuncio) => (
                          <div
                            key={annuncio.id}
                            className="rounded-lg border border-slate-200 p-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium text-slate-900">
                                  {annuncio.title}
                                </p>
                                <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                                  {annuncio.body}
                                </p>
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-2">
                                {annuncio.status === "published" ? (
                                  <Badge
                                    variant="outline"
                                    className="flex items-center gap-1"
                                  >
                                    <Eye className="h-3 w-3" aria-hidden="true" />
                                    {annuncio.readCount}/{annuncio.audienceCount}
                                  </Badge>
                                ) : null}
                                {annuncio.publishAt ? (
                                  <Badge
                                    variant="outline"
                                    className="flex items-center gap-1"
                                  >
                                    <CalendarClock
                                      className="h-3 w-3"
                                      aria-hidden="true"
                                    />
                                    {formatDate(annuncio.publishAt)}
                                  </Badge>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              {annuncio.status === "draft" ? (
                                <Button
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => azione(annuncio.id, "publish")}
                                >
                                  <Send
                                    className="mr-1.5 h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                  Pubblica
                                </Button>
                              ) : null}
                              {annuncio.shelf === "current" ||
                              annuncio.shelf === "scheduled" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => azione(annuncio.id, "withdraw")}
                                >
                                  <Undo2
                                    className="mr-1.5 h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                  Ritira
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  );
                })}

                {!caricamento && announcements.length === 0 ? (
                  <Card>
                    <CardContent className="p-6 text-sm text-slate-500">
                      Nessun avviso. Il primo che scrivi resta in bacheca finche
                      non scade, e chi arriva dopo lo trova.
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </div>
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
