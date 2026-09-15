"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarDays, FileHeart, Settings, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Drawer } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { IconChip } from "@/components/web/primitives/StatusPill";
import { Eyebrow } from "@/components/web/primitives/Surface";
import { Skeleton } from "@/components/web/primitives/Controls";
import { EmptyStateCard } from "@/components/web/page/Cards";
import { formatDayMonth, parseDateInput } from "@/lib/web/format";

/**
 * Il pannello delle notifiche (guideline 06 §6.3): cassetto da 392px, righe
 * raggruppate `Oggi` / `Questa settimana` / `Prima`, non lette con un punto
 * blu sul bordo, `Segna tutte come lette`. Il conteggio vive qui, non sul
 * campanello.
 *
 * La sorgente e la stessa del pannello V1: `simplified_notifications` del club
 * — oppure le righe che chi monta il guscio ha gia (area famiglia e atleta,
 * dove il registro generico e chiuso), con il loro `onMarkRead`.
 */
export type NotificationItem = {
  id: string;
  title?: string | null;
  message?: string | null;
  type?: string | null;
  read?: boolean | null;
  created_at?: string | null;
};

type Row = {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
};

const toRow = (n: NotificationItem): Row => ({
  id: n.id,
  title: n.title || "Notifica",
  message: n.message || "",
  type: n.type || "system",
  read: Boolean(n.read),
  createdAt: n.created_at || new Date().toISOString(),
});

const iconFor = (type: string) => {
  switch (type) {
    case "certificate":
      return { icon: <FileHeart />, tone: "red" as const };
    case "training":
      return { icon: <CalendarDays />, tone: "blue" as const };
    case "registration":
      return { icon: <UserPlus />, tone: "green" as const };
    case "system":
      return { icon: <Settings />, tone: "neutral" as const };
    default:
      return { icon: <Bell />, tone: "blue" as const };
  }
};

const relativeTime = (iso: string) => {
  const date = parseDateInput(iso);
  if (!date) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 1) return "adesso";
  if (minutes < 60) return `${minutes} min fa`;
  if (hours < 24) return `${hours} h fa`;
  if (days === 1) return "ieri";
  if (days < 7) return `${days} g fa`;
  return formatDayMonth(date);
};

const groupOf = (iso: string): "today" | "week" | "before" => {
  const date = parseDateInput(iso);
  if (!date) return "before";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() >= startOfToday) return "today";
  if (date.getTime() >= startOfToday - 6 * 86_400_000) return "week";
  return "before";
};

const GROUP_LABELS = { today: "Oggi", week: "Questa settimana", before: "Prima" } as const;

export function NotificationDrawer({
  open,
  onOpenChange,
  items,
  onMarkRead,
  allNotificationsHref,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items?: NotificationItem[] | null;
  onMarkRead?: (id: string) => void;
  allNotificationsHref: string;
}) {
  const router = useRouter();
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error: readError } = await supabase
        .from("simplified_notifications")
        .select("*")
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(30);
      if (readError) {
        setError("Non è stato possibile leggere le notifiche.");
        return;
      }
      setRows(((data || []) as NotificationItem[]).map(toRow));
    } catch {
      setError("Non è stato possibile leggere le notifiche.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (items) {
      setRows(items.map(toRow));
      return;
    }
    if (open) void load();
  }, [items, load, open]);

  const markRead = React.useCallback(
    async (id: string) => {
      setRows((current) => current.map((r) => (r.id === id ? { ...r, read: true } : r)));
      if (onMarkRead) {
        onMarkRead(id);
        return;
      }
      try {
        await supabase.from("simplified_notifications").update({ read: true }).eq("id", id);
      } catch {
        /* la riga resta segnata a schermo; al prossimo caricamento si rilegge */
      }
    },
    [onMarkRead],
  );

  const markAll = React.useCallback(async () => {
    const unread = rows.filter((r) => !r.read);
    for (const row of unread) {
      // eslint-disable-next-line no-await-in-loop
      await markRead(row.id);
    }
  }, [markRead, rows]);

  const unreadCount = rows.filter((r) => !r.read).length;
  const grouped = React.useMemo(() => {
    const map: Record<"today" | "week" | "before", Row[]> = { today: [], week: [], before: [] };
    rows.forEach((row) => map[groupOf(row.createdAt)].push(row));
    return map;
  }, [rows]);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="narrow"
      eyebrow="Notifiche"
      title={unreadCount > 0 ? `${unreadCount} da leggere` : "Tutto letto"}
      blurScrim
      headerAside={
        unreadCount > 0 ? (
          <Button variant="text" size="xs" onClick={() => void markAll()}>
            Segna tutte come lette
          </Button>
        ) : null
      }
      footer={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            onOpenChange(false);
            router.push(allNotificationsHref);
          }}
        >
          Vedi tutte le notifiche
        </Button>
      }
      bodyClassName="px-4 py-4"
    >
      {loading && rows.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-egw-field bg-white px-3 py-3">
              <Skeleton className="h-[34px] w-[34px] rounded-egw-chip" />
              <div className="flex-1">
                <Skeleton className="mb-2 h-3 w-2/3" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyStateCard
          flat
          iconTone="red"
          icon={<Bell />}
          title={error}
          primary={
            <Button variant="primary" size="sm" onClick={() => void load()}>
              Riprova
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyStateCard flat icon={<Bell />} title="Nessuna notifica" description="Quando succede qualcosa che ti riguarda, lo trovi qui." />
      ) : (
        (["today", "week", "before"] as const).map((key) =>
          grouped[key].length ? (
            <section key={key} className="mb-5 last:mb-0">
              <Eyebrow className="mb-2 px-1">{GROUP_LABELS[key]}</Eyebrow>
              <ul className="overflow-hidden rounded-egw-field border border-egw-hairline bg-white">
                {grouped[key].map((row) => {
                  const { icon, tone } = iconFor(row.type);
                  return (
                    <li
                      key={row.id}
                      className={cn(
                        "relative flex min-h-[56px] items-start gap-3 border-b border-egw-rule px-3 py-2.5 last:border-0",
                        !row.read && "bg-egw-page-050",
                      )}
                    >
                      {!row.read ? (
                        <span aria-hidden className="absolute left-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-egw-blue" />
                      ) : null}
                      <IconChip tone={tone} size={34}>
                        {icon}
                      </IconChip>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-semibold leading-[1.35] text-egw-ink">{row.title}</p>
                        {row.message ? (
                          <p className="mt-0.5 text-[11.5px] leading-[1.4] text-egw-ink-62">{row.message}</p>
                        ) : null}
                        <p className="egw-num mt-1 text-[10.5px] text-[rgba(11,26,58,.5)]">{relativeTime(row.createdAt)}</p>
                      </div>
                      {!row.read ? (
                        <Button variant="text" size="xs" onClick={() => void markRead(row.id)} className="shrink-0">
                          Letta
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null,
        )
      )}
    </Drawer>
  );
}
