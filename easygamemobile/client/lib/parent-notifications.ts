import type { NotificationCategory } from "@/components/signature/NotificationRow";
import type { ParentNotification } from "@/services/api";

export type { ParentNotification };

export interface ParentNotificationGroup {
  label: string;
  items: ParentNotification[];
}

/** Ordina dal piu recente, come su ogni lista di notifiche. */
export function sortNotificationsNewestFirst(
  notifications: ParentNotification[],
): ParentNotification[] {
  return [...notifications].sort((left, right) =>
    right.created_at.localeCompare(left.created_at),
  );
}

export function countUnreadNotifications(
  notifications: ParentNotification[],
): number {
  return notifications.filter((item) => !item.read).length;
}

/**
 * Non c'e un vocabolario di `type` documentato per le notifiche Parent —
 * il payload non lo specifica in dettaglio. Un riconoscimento tollerante
 * per parole chiave, non una tabella chiusa: qualunque valore non
 * riconosciuto ricade su `operational`, mai su un errore.
 */
export function resolveNotificationCategory(
  type: string | undefined,
): NotificationCategory {
  const value = String(type || "").toLowerCase();
  if (/pay|pagament|quota|rata/.test(value)) return "payment";
  if (/doc|certificat/.test(value)) return "document";
  if (/urgent|priorit|alert/.test(value)) return "priority";
  return "operational";
}

const dayKey = (iso: string) => iso.slice(0, 10);

/** Raggruppa per giorno (OGGI / IERI / data), spec C6 — l'ordine dei gruppi segue l'ordine dei dati in ingresso, gia ordinati dal piu recente dal chiamante. */
export function groupNotificationsByDay(
  notifications: ParentNotification[],
  now: Date = new Date(),
): ParentNotificationGroup[] {
  const todayKey = now.toISOString().slice(0, 10);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  const groups: ParentNotificationGroup[] = [];

  for (const item of notifications) {
    const key = dayKey(item.created_at);
    const label =
      key === todayKey ? "Oggi" : key === yesterdayKey ? "Ieri" : key;
    const existing = groups.find((group) => group.label === label);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }

  return groups;
}
