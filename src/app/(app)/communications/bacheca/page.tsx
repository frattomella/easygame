"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Megaphone, Plus, Send, Undo2 } from "lucide-react";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { type AudienceCriterionKind } from "@/lib/audience/criteria";
import { HeaderStat, PageHeader } from "@/components/web/page/PageHeader";
import { Button } from "@/components/web/primitives/Button";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { formatDateShort, formatInteger } from "@/lib/web/format";
import { CommunicationsNav } from "@/components/communications/v2/communications-nav";
import { useAudienceOptions } from "@/components/communications/v2/audience-picker";
import { AnnouncementDrawer, type AnnouncementDraft } from "@/components/communications/v2/announcement-drawer";
import { AnnouncementInspector } from "@/components/communications/v2/announcement-inspector";
import { SHELF_LABELS, SHELF_ORDER, shelfStatusSpec } from "@/components/communications/v2/communication-status";
import {
  canPublishAnnouncement,
  canWithdrawAnnouncement,
  countByShelf,
  describeAudience,
  describeReads,
  type Announcement,
} from "@/components/communications/v2/announcement-model";

/**
 * La bacheca del club (W2-D, G-08) — Web V2, pattern 1: intestazione +
 * griglia a tutta larghezza.
 *
 * **Cosa distingue questa schermata da un elenco di notifiche.** Quattro
 * scaffali, non uno: **bozze**, **programmati**, **in bacheca**, **scaduti**.
 * Un avviso scaduto non sparisce — resta consultabile, perche la prova di
 * averlo pubblicato e proprio cio per cui una bacheca esiste — ma non occupa
 * lo spazio di quelli validi. Nella V1 erano quattro card; qui sono le viste
 * della griglia, con il loro conteggio.
 *
 * **Perche accanto a ogni annuncio ci sono due numeri.** «Lo vedono in venti,
 * lo hanno aperto in tre» e l'unica informazione che dice a una segreteria se
 * un canale funziona. Un conteggio solo non lo direbbe.
 */

/**
 * I criteri che la bacheca offre, **nell'ordine in cui si scelgono**.
 *
 * Un elenco solo, e non un elenco piu un tipo scritto a parte: era proprio la
 * distanza fra i due a tenere «Convocati a un evento» e «Senza risposta a un
 * evento» fuori da questa schermata mentre il motore del pubblico gia li
 * risolveva. `satisfies` fa fallire la compilazione se qui compare un criterio
 * che il dominio non conosce.
 *
 * **Perche la bacheca ne offre meno delle comunicazioni.** Non e una svista:
 * un avviso in bacheca lo legge chi ha un account, e i criteri economici o
 * sanitari — «con quote da versare», «certificato in scadenza» — appenderebbero
 * a una bacheca condivisa una selezione che dice qualcosa di privato su chi la
 * legge. Un evento no: essere convocati non e un dato riservato.
 */
const CRITERI_OFFERTI = [
  "all_families",
  "category_ids",
  "group_ids",
  "site_ids",
  "event_convocated",
  "event_no_rsvp",
] as const satisfies readonly AudienceCriterionKind[];

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

const SHELF_VIEWS: ViewDef[] = SHELF_ORDER.map((shelf) => ({
  id: shelf,
  label: SHELF_LABELS[shelf],
  filters: { shelf },
  builtIn: true,
}));

export default function BachecaPage() {
  const { showToast } = useToast();
  const { optionsFor } = useAudienceOptions();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [inspecting, setInspecting] = useState<Announcement | null>(null);
  const [requestedViewId, setRequestedViewId] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    const response = await apiRequest<Announcement[]>("/api/v1/announcements");
    setLoading(false);

    if (response.error) {
      setLoadError(response.error.message || "Bacheca non leggibile");
      showToast("error", response.error.message || "Bacheca non leggibile");
      return;
    }
    setLoadError(null);
    const rows = asArray(response.data) as Announcement[];
    setAnnouncements(rows);
    setInspecting((current) => (current ? rows.find((row) => row.id === current.id) || null : null));
  }, [showToast]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const crea = async (draft: AnnouncementDraft): Promise<boolean> => {
    setBusy(true);
    const response = await apiRequest<Announcement>("/api/v1/announcements", {
      method: "POST",
      body: {
        title: draft.title,
        body: draft.body,
        criteria: draft.criteria,
        publishAt: draft.publishAt,
        expiresAt: draft.expiresAt,
      },
    });
    setBusy(false);

    if (response.error || !response.data) {
      showToast("error", response.error?.message || "Annuncio non creato");
      return false;
    }

    showToast("success", "Bozza salvata: pubblicala quando vuoi");
    setRequestedViewId("draft");
    void carica();
    return true;
  };

  const azione = async (announcementId: string, action: "publish" | "withdraw") => {
    setBusy(true);
    const response = await apiRequest<any>(`/api/v1/announcements/${announcementId}`, { method: "POST", body: { action } });
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

    void carica();
  };

  const counts = useMemo(() => countByShelf(announcements), [announcements]);

  const columns = useMemo<ColumnDef<Announcement>[]>(
    () => [
      {
        id: "title",
        header: "Avviso",
        kind: "identity",
        locked: true,
        width: 2.2,
        cell: (row) => (
          <span className="min-w-0">
            <button
              type="button"
              onClick={() => setInspecting(row)}
              className="egw-ellipsis block max-w-full text-left font-brand text-[12.5px] font-semibold text-egw-ink hover:text-egw-blue-700 hover:underline focus-visible:outline-none focus-visible:underline"
            >
              {row.title}
            </button>
            <span className="egw-ellipsis block font-brand text-[10px] text-[rgba(11,26,58,.5)]">{row.body}</span>
          </span>
        ),
        sortValue: (row) => row.title.toLowerCase(),
        exportValue: (row) => row.title,
        title: (row) => row.title,
      },
      {
        id: "shelf",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={shelfStatusSpec(row.shelf)} />,
        sortValue: (row) => SHELF_ORDER.indexOf(row.shelf),
        exportValue: (row) => shelfStatusSpec(row.shelf).label,
      },
      {
        id: "audience",
        header: "Chi lo legge",
        kind: "classification",
        width: 1.3,
        cell: (row) => describeAudience(row.criteria),
        sortValue: (row) => describeAudience(row.criteria).toLowerCase(),
        title: (row) => describeAudience(row.criteria),
      },
      {
        id: "publishAt",
        header: "Esce il",
        kind: "date",
        cell: (row) => (row.publishAt ? formatDateShort(row.publishAt) : null),
        sortValue: (row) => row.publishAt || null,
        exportValue: (row) => row.publishAt,
      },
      {
        id: "expiresAt",
        header: "Scade il",
        kind: "date",
        cell: (row) => (row.expiresAt ? formatDateShort(row.expiresAt) : null),
        sortValue: (row) => row.expiresAt || null,
        exportValue: (row) => row.expiresAt,
      },
      {
        id: "reads",
        header: "Letto da",
        kind: "number",
        align: "right",
        width: 0.8,
        cell: (row) => {
          const reads = describeReads(row);
          return reads ? <span className="egw-num">{reads}</span> : null;
        },
        sortValue: (row) => (row.status === "published" ? row.readCount : null),
        exportValue: (row) => describeReads(row),
      },
      {
        id: "publishedAt",
        header: "Pubblicato il",
        kind: "date",
        hidden: true,
        cell: (row) => (row.publishedAt ? formatDateShort(row.publishedAt) : null),
        sortValue: (row) => row.publishedAt || null,
      },
    ],
    [],
  );

  const filters = useMemo<FilterDef<Announcement>[]>(
    () => [
      {
        id: "shelf",
        label: "Scaffale",
        type: "select",
        pinned: true,
        options: SHELF_ORDER.map((shelf) => ({ value: shelf, label: SHELF_LABELS[shelf], count: counts[shelf] })),
        apply: (row, value) => (typeof value === "string" && value ? row.shelf === value : true),
      },
    ],
    [counts],
  );

  const rowActions = useMemo<RowActionDef<Announcement>[]>(
    () => [
      { id: "open", label: "Apri", icon: <ChevronRight />, primary: true, onClick: (row) => setInspecting(row) },
      { id: "publish", label: "Pubblica", icon: <Send />, hidden: (row) => !canPublishAnnouncement(row), onClick: (row) => void azione(row.id, "publish") },
      { id: "withdraw", label: "Ritira", icon: <Undo2 />, hidden: (row) => !canWithdrawAnnouncement(row), onClick: (row) => void azione(row.id, "withdraw") },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const search = useMemo(
    () => ({
      placeholder: "Cerca per titolo o testo",
      match: (row: Announcement, query: string) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return [row.title, row.body].some((value) => String(value || "").toLowerCase().includes(q));
      },
    }),
    [],
  );

  const gridState = loading ? "loading" : loadError ? "error" : "ready";

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Bacheca" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Segreteria"
              title="Bacheca"
              description="Gli avvisi che restano: chi li legge lo decidi tu, e vedi quanti li hanno aperti."
              stats={
                <>
                  <HeaderStat value={formatInteger(counts.current)} label="in bacheca" tone={counts.current ? "green" : "ink"} onClick={() => setRequestedViewId("current")} />
                  <HeaderStat value={formatInteger(counts.draft)} label="bozze" tone={counts.draft ? "amber" : "ink"} onClick={() => setRequestedViewId("draft")} />
                </>
              }
              actions={
                <Button variant="primary" icon={<Plus />} onClick={() => setDrawerOpen(true)}>
                  Nuovo avviso
                </Button>
              }
            >
              <CommunicationsNav />
            </PageHeader>

            <DataGrid<Announcement>
              module="bacheca"
              aria-label="Avvisi in bacheca"
              rows={announcements}
              getRowId={(row) => row.id}
              rowLabel={(row) => row.title}
              columns={columns}
              filters={filters}
              views={SHELF_VIEWS}
              requestedViewId={requestedViewId}
              search={search}
              defaultSort={{ columnId: "shelf", direction: "asc" }}
              rowActions={rowActions}
              onOpenRow={(row) => setInspecting(row)}
              activeRowId={inspecting?.id || null}
              canSelect={false}
              state={gridState}
              errorMessage={loadError}
              onRetry={() => void carica()}
              noun={{ singular: "avviso", plural: "avvisi" }}
              empty={{
                icon: <Megaphone />,
                title: "Nessun avviso",
                description: "Il primo che scrivi resta in bacheca finche non scade, e chi arriva dopo lo trova.",
                primary: (
                  <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setDrawerOpen(true)}>
                    Nuovo avviso
                  </Button>
                ),
              }}
            />
          </DashboardPageContainer>
        </main>
      </div>

      <AnnouncementDrawer open={drawerOpen} onOpenChange={setDrawerOpen} criteria={CRITERI_OFFERTI} optionsFor={optionsFor} onSave={crea} />

      <AnnouncementInspector
        announcement={inspecting}
        onOpenChange={(open) => !open && setInspecting(null)}
        busy={busy}
        onPublish={(row) => void azione(row.id, "publish")}
        onWithdraw={(row) => void azione(row.id, "withdraw")}
      />
    </div>
  );
}
