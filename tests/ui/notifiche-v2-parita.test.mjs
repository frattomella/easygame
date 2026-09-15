import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  NOTIFICATION_STATUS,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_WINDOW_DAYS,
  PAGE_LIMIT,
  notificationStatusSpec,
  notificationTypeLabel,
} from "@/components/notifications/v2/notification-data";

/**
 * Parita della pagina Notifiche V2 con l'audit V1
 * (`docs/redesign/audit/wave-e-notifiche.md`).
 *
 * La pagina resta la vista completa accanto al cassetto del guscio: stessa
 * sorgente (`simplified_notifications` via adapter), stesse scritture, le
 * cinque tab della V1 come viste della griglia, la ricerca in griglia.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const sources = {
  page: read("src/app/notifications/page.tsx"),
  data: read("src/components/notifications/v2/notification-data.ts"),
  grid: read("src/components/notifications/v2/notification-grid.tsx"),
  drawer: read("src/components/web/shell/NotificationDrawer.tsx"),
};
const everything = Object.values(sources).join("\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("/notifications: guscio, intestazione, griglia unica", () => {
  assert.match(sources.page, /<Sidebar \/>/);
  assert.match(sources.page, /<Header title="Notifiche" \/>/);
  assert.match(sources.page, /<PageHeader/);
  assert.match(sources.page, /title="Notifiche"/);
  assert.match(sources.page, /<NotificationGrid/);
  assert.match(sources.grid, /module="notifiche"/);
  assert.doesNotMatch(senzaCommenti(sources.page + sources.grid), /@\/components\/ui\/(card|badge|button|input|tabs)/, "solo le fondamenta del Web V2");
  assert.doesNotMatch(senzaCommenti(everything), /window\.confirm|[^\w]fetch\(/);
});

test("/notifications: le stesse letture e scritture del cassetto del guscio", () => {
  // La stessa risorsa, lo stesso filtro «mie o di tutti», lo stesso ordine
  for (const source of [sources.data, sources.drawer]) {
    assert.match(source, /\.from\("simplified_notifications"\)/);
    assert.ok(source.includes(".or(`user_id.eq.${user.id},user_id.is.null`)"));
    assert.match(source, /\.order\("created_at", \{ ascending: false \}\)/);
    assert.match(source, /\.update\(\{ read: true \}\)\.eq\("id", id\)/);
  }
  assert.equal(PAGE_LIMIT, 50, "la pagina e la vista completa: cinquanta righe come la V1");
  assert.equal(NOTIFICATION_WINDOW_DAYS, 6, "la finestra di sei giorni della V1 resta, e la pagina la dichiara");
  assert.match(sources.data, /\.eq\("user_id", userId\)\.eq\("read", false\)/, "«Segna tutte come lette» e una scrittura sola");
  assert.match(sources.data, /supabase\s*\.channel\("notifications"\)/, "la sottoscrizione locale della V1 resta");
  assert.match(sources.page, /subscribeToNotificationInserts/);
  assert.match(sources.page, /NOTIFICATION_WINDOW_DAYS/);
});

test("/notifications: le cinque tab della V1 sono viste, la ricerca cerca in titolo e messaggio", () => {
  for (const view of ['label: "Non lette"', 'label: "Certificati"', 'label: "Allenamenti"', 'label: "Registrazioni"']) {
    assert.ok(sources.grid.includes(view), `manca la vista ${view}`);
  }
  assert.match(sources.grid, /filters: \{ read: "unread" \}/);
  assert.match(sources.grid, /filters: \{ type: "certificate" \}/);
  assert.match(sources.grid, /placeholder: "Cerca notifiche"/);
  assert.match(sources.grid, /row\.title\.toLowerCase\(\)\.includes\(q\) \|\| row\.message\.toLowerCase\(\)\.includes\(q\)/);
  assert.deepEqual(Object.keys(NOTIFICATION_TYPE_LABELS), ["certificate", "training", "registration", "system"]);
  assert.equal(notificationTypeLabel("certificate"), "Certificati");
  assert.equal(notificationTypeLabel("altro"), "Altro");
});

test("/notifications: segna come letta per riga, per selezione e per tutte; lo stato e una parola", () => {
  assert.match(sources.grid, /label: "Segna come letta", icon: <Check \/>, primary: true, hidden: \(row\) => row\.read/);
  assert.match(sources.grid, /label: "Segna come lette"/);
  assert.match(sources.page, /Segna tutte come lette/);
  assert.match(sources.page, /unreadCount > 0 \? \(/, "senza niente da leggere il pulsante e assente, non disabilitato");
  assert.match(sources.page, /markAllNotificationsRead\(userId\)/);
  assert.match(sources.page, /markNotificationRead\(row\.id\)/);
  assert.equal(notificationStatusSpec(true), NOTIFICATION_STATUS.read);
  assert.equal(notificationStatusSpec(false).label, "DA LEGGERE");
  assert.match(sources.grid, /<StatusPill status=\{notificationStatusSpec\(row\.read\)\}/);
  assert.match(sources.grid, /title: "Nessuna notifica"/);
});

test("/notifications: le icone per tipo sono quelle del cassetto", () => {
  for (const icon of ["FileHeart", "CalendarDays", "UserPlus", "Settings"]) {
    assert.ok(sources.grid.includes(`<${icon} />`), `manca l'icona ${icon}`);
    assert.ok(sources.drawer.includes(`<${icon} />`));
  }
});
