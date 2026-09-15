import { supabase } from "@/lib/supabase";
import type { StatusSpec } from "@/lib/web/status";

/**
 * Le letture e le scritture della pagina delle notifiche (Web V2).
 *
 * Sono **le stesse chiamate** del cassetto del guscio
 * (`src/components/web/shell/NotificationDrawer.tsx`): la risorsa
 * `simplified_notifications` letta con l'adapter su `fetch`, filtrata su
 * «mie o di tutti», ordinata per data. Il cassetto non le esporta — le
 * fondamenta non si toccano in questa ondata — e quindi vivono qui, con la
 * richiesta al lead di promuoverle perche il cassetto le importi da un posto
 * solo.
 *
 * La pagina e la vista **completa**: legge fino a cinquanta righe, il
 * cassetto trenta.
 */
export type NotificationType = "certificate" | "training" | "registration" | "system";

export type NotificationRow = {
  id: string;
  title: string;
  message: string;
  type: NotificationType | string;
  createdAt: string;
  read: boolean;
  userId: string | null;
  data: unknown;
};

export const NOTIFICATION_TYPE_LABELS: Readonly<Record<NotificationType, string>> = Object.freeze({
  certificate: "Certificati",
  training: "Allenamenti",
  registration: "Registrazioni",
  system: "Sistema",
});

export const notificationTypeLabel = (type: string): string =>
  (NOTIFICATION_TYPE_LABELS as Record<string, string>)[type] || "Altro";

/** LETTA / DA LEGGERE — lo stato di una notifica; da promuovere in `status.ts`. */
export const NOTIFICATION_STATUS = Object.freeze({
  read: Object.freeze({ label: "LETTA", weight: "quiet", hue: "neutral" }) as StatusSpec,
  unread: Object.freeze({ label: "DA LEGGERE", weight: "solid", hue: "blue" }) as StatusSpec,
});

export const notificationStatusSpec = (read: boolean): StatusSpec => (read ? NOTIFICATION_STATUS.read : NOTIFICATION_STATUS.unread);

/** Quanti giorni indietro guarda la pagina: gli ultimi sei, come la V1. */
export const NOTIFICATION_WINDOW_DAYS = 6;

export const PAGE_LIMIT = 50;

const toRow = (record: any): NotificationRow => ({
  id: String(record?.id || ""),
  title: String(record?.title || "Notifica"),
  message: String(record?.message || ""),
  type: String(record?.type || "system"),
  createdAt: String(record?.created_at || new Date().toISOString()),
  read: Boolean(record?.read),
  userId: record?.user_id ? String(record.user_id) : null,
  data: record?.data,
});

/**
 * Le notifiche di chi guarda: le sue e quelle di tutti (`user_id` nullo),
 * le piu recenti prima, entro la finestra di sei giorni della V1.
 */
export const loadNotifications = async (now: Date = new Date()): Promise<{ rows: NotificationRow[]; userId: string | null; error: string | null }> => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { rows: [], userId: null, error: "Sessione non disponibile." };
  }

  const { data, error } = await supabase
    .from("simplified_notifications")
    .select("*")
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(PAGE_LIMIT);

  if (error) {
    return { rows: [], userId: user.id, error: "Non è stato possibile leggere le notifiche." };
  }

  const since = new Date(now);
  since.setDate(since.getDate() - NOTIFICATION_WINDOW_DAYS);
  const rows = (Array.isArray(data) ? data : []).map(toRow).filter((row) => new Date(row.createdAt) >= since);
  return { rows, userId: user.id, error: null };
};

export const markNotificationRead = async (id: string): Promise<boolean> => {
  const { error } = await supabase.from("simplified_notifications").update({ read: true }).eq("id", id);
  return !error;
};

/** «Segna tutte come lette»: una scrittura sola, sulle mie non lette (come la V1). */
export const markAllNotificationsRead = async (userId: string): Promise<boolean> => {
  const { error } = await supabase.from("simplified_notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
  return !error;
};

/**
 * Il bus locale dell'adapter: scatta quando questa scheda inserisce una
 * notifica. E la stessa sottoscrizione della V1.
 */
export const subscribeToNotificationInserts = (onInsert: () => void): (() => void) => {
  const subscription = supabase
    .channel("notifications")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "simplified_notifications" }, () => onInsert())
    .subscribe();
  return () => subscription.unsubscribe();
};
