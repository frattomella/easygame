import { test } from "node:test";
import assert from "node:assert/strict";

import {
  countUnreadNotifications,
  groupNotificationsByDay,
  resolveNotificationCategory,
  sortNotificationsNewestFirst,
  type ParentNotification,
} from "../client/lib/parent-notifications";

const notification = (
  overrides: Partial<ParentNotification> = {},
): ParentNotification => ({
  id: "n1",
  title: "Titolo",
  message: "Messaggio",
  type: "operational",
  read: false,
  created_at: "2026-09-10T10:00:00.000Z",
  updated_at: "2026-09-10T10:00:00.000Z",
  ...overrides,
});

test("unread/read: conta solo le non lette", () => {
  const list = [
    notification({ id: "a", read: false }),
    notification({ id: "b", read: true }),
    notification({ id: "c", read: false }),
  ];
  assert.equal(countUnreadNotifications(list), 2);
});

test("ordina dal piu recente", () => {
  const list = [
    notification({ id: "old", created_at: "2026-09-01T10:00:00.000Z" }),
    notification({ id: "new", created_at: "2026-09-10T10:00:00.000Z" }),
  ];
  const sorted = sortNotificationsNewestFirst(list);
  assert.deepEqual(
    sorted.map((n) => n.id),
    ["new", "old"],
  );
});

test("scope corretto: ogni notifica appartiene esattamente a un gruppo giorno", () => {
  const now = new Date("2026-09-10T18:00:00.000Z");
  const list = [
    notification({ id: "today", created_at: "2026-09-10T09:00:00.000Z" }),
    notification({ id: "yesterday", created_at: "2026-09-09T09:00:00.000Z" }),
    notification({ id: "older", created_at: "2026-09-05T09:00:00.000Z" }),
  ];
  const groups = groupNotificationsByDay(list, now);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].label, "Oggi");
  assert.equal(groups[1].label, "Ieri");
  assert.equal(groups[2].label, "2026-09-05");
});

test("categoria: riconosce pagamenti/documenti/priorita per parola chiave, altrimenti operativo", () => {
  assert.equal(resolveNotificationCategory("payment_due"), "payment");
  assert.equal(resolveNotificationCategory("document_expiring"), "document");
  assert.equal(resolveNotificationCategory("urgent"), "priority");
  assert.equal(resolveNotificationCategory("club_announcement"), "operational");
  assert.equal(resolveNotificationCategory(undefined), "operational");
});
