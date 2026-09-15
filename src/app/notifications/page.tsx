"use client";

import React from "react";
import { CheckCheck } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useToast } from "@/components/ui/toast-notification";
import { HeaderStat, PageHeader } from "@/components/web/page/PageHeader";
import { Button } from "@/components/web/primitives/Button";
import { formatInteger } from "@/lib/web/format";
import { NotificationGrid } from "@/components/notifications/v2/notification-grid";
import {
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotificationInserts,
  NOTIFICATION_WINDOW_DAYS,
  type NotificationRow,
} from "@/components/notifications/v2/notification-data";

/**
 * `/notifications` — la vista completa delle notifiche (Web V2, pattern 1).
 *
 * Il guscio ha gia un cassetto da 392 (`NotificationDrawer`) con le ultime
 * trenta raggruppate per giorno: questa pagina e l'elenco intero, con la
 * griglia — viste per tipo e lettura, ricerca, «segna come letta» per riga,
 * per selezione e per tutte. Le letture e le scritture sono le stesse del
 * cassetto (`notification-data.ts`), non una seconda logica.
 */
export default function NotificationsPage() {
  const { showToast } = useToast();
  const [rows, setRows] = React.useState<NotificationRow[]>([]);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [requestedViewId, setRequestedViewId] = React.useState<string | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadNotifications();
      setRows(result.rows);
      setUserId(result.userId);
      setLoadError(result.error);
    } catch (error) {
      console.error("Error loading notifications:", error);
      setLoadError("Non è stato possibile leggere le notifiche.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    // Lo stesso bus locale della V1: una notifica inserita da questa scheda ricarica l'elenco.
    return subscribeToNotificationInserts(() => void load());
  }, [load]);

  const markRead = React.useCallback(
    async (row: NotificationRow) => {
      if (row.read) return;
      setRows((current) => current.map((r) => (r.id === row.id ? { ...r, read: true } : r)));
      const ok = await markNotificationRead(row.id);
      if (!ok) {
        setRows((current) => current.map((r) => (r.id === row.id ? { ...r, read: false } : r)));
        showToast("error", "La notifica non è stata segnata come letta");
      }
    },
    [showToast],
  );

  const markRows = React.useCallback(
    async (selected: NotificationRow[]) => {
      if (!selected.length) return;
      setBusy(true);
      try {
        const esiti = await Promise.all(selected.map((row) => markNotificationRead(row.id)));
        const riuscite = selected.filter((_, index) => esiti[index]);
        const riusciteIds = new Set(riuscite.map((row) => row.id));
        setRows((current) => current.map((r) => (riusciteIds.has(r.id) ? { ...r, read: true } : r)));
        setSelectedIds(new Set());
        if (riuscite.length < selected.length) {
          showToast("error", `${selected.length - riuscite.length} notifiche su ${selected.length} non sono state segnate come lette`);
        } else {
          showToast("success", `${riuscite.length} ${riuscite.length === 1 ? "notifica segnata" : "notifiche segnate"} come ${riuscite.length === 1 ? "letta" : "lette"}`);
        }
      } finally {
        setBusy(false);
      }
    },
    [showToast],
  );

  const markAll = React.useCallback(async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const ok = await markAllNotificationsRead(userId);
      if (!ok) {
        showToast("error", "Le notifiche non sono state segnate come lette");
        return;
      }
      setRows((current) => current.map((r) => ({ ...r, read: true })));
      showToast("success", "Tutte le notifiche sono segnate come lette");
    } finally {
      setBusy(false);
    }
  }, [showToast, userId]);

  const unreadCount = rows.filter((r) => !r.read).length;
  const gridState = loading ? "loading" : loadError ? "error" : "ready";

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Notifiche" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Segreteria"
              title="Notifiche"
              description={`Consulta e gestisci le notifiche del tuo club degli ultimi ${NOTIFICATION_WINDOW_DAYS} giorni.`}
              stats={
                <>
                  <HeaderStat value={formatInteger(rows.length)} label={rows.length === 1 ? "notifica" : "notifiche"} />
                  <HeaderStat value={formatInteger(unreadCount)} label="da leggere" tone={unreadCount ? "blue" : "ink"} onClick={() => setRequestedViewId("unread")} />
                </>
              }
              actions={
                unreadCount > 0 ? (
                  <Button variant="secondary" icon={<CheckCheck />} loading={busy} onClick={() => void markAll()}>
                    Segna tutte come lette
                  </Button>
                ) : null
              }
            />

            <NotificationGrid
              rows={rows}
              state={gridState}
              errorMessage={loadError}
              onRetry={() => void load()}
              onMarkRead={(row) => void markRead(row)}
              onMarkRows={markRows}
              requestedViewId={requestedViewId}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
            />
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
