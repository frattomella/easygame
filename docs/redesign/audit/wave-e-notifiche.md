# Wave E — Audit di parità: Notifiche (`/notifications`)

> Inventario funzionale dell'implementazione V1 sul branch `feat/web-redesign`,
> scritto **prima** della migrazione al Web V2. È il contratto di parità:
> niente sparisce. Nessuna proposta di design.
>
> Rotta coperta: `/notifications` (`src/app/notifications/page.tsx`, 377
> righe). Letto anche `src/components/web/shell/NotificationDrawer.tsx`
> (il cassetto del guscio V2, **non modificabile**) per riusare le stesse
> letture, e `src/lib/supabase.ts` (`channel`, `notifyRealtime`).

---

## Guscio

`Sidebar` + `Header title="Notifiche"` + `DashboardPageContainer` +
`SharedPageHeader title="Notifiche" subtitle="Consulta e gestisci le
notifiche del tuo club."`. Fondo `bg-gray-50 dark:bg-gray-900`.

## 1. Dati mostrati

Sorgente: `supabase.auth.getUser()` (→ `GET /api/v1/auth/user`) poi
`supabase.from("simplified_notifications").select("*").or("user_id.eq.{id},user_id.is.null").order("created_at", desc).limit(50)`
(adapter su `fetch`, risorsa generica). Riga → `Notification {id, title,
message, type ∈ certificate|training|registration|system, date =
created_at || now, read, created_at, user_id, data}`. **Filtro locale: solo
gli ultimi 6 giorni** (`sixDaysAgo`); le notifiche più vecchie non compaiono.
`localStorage.activeClub` viene letto e **non usato** (ramo vuoto).

Per riga: icona per tipo (`FileHeart` rosso certificato · `Calendar` blu
allenamento · `UserPlus` verde registrazione · `Settings` viola sistema ·
`Bell` grigio altro), titolo, data relativa (`Oggi, HH:MM` · `Ieri` · giorno
della settimana se < 7 giorni · `d mmm`), messaggio, sfondo blu chiaro se non
letta.

Aggiornamento in tempo reale: `supabase.channel("notifications").on(
"postgres_changes", {event: "INSERT", table: "simplified_notifications"},
loadNotifications).subscribe()` — nell'adapter è un bus **locale** alla
scheda (`notifyRealtime`), scatta quando la stessa pagina inserisce.

## 2. Azioni

- **Segna tutte come lette** (outline, `disabled={!notifications.some(n =>
  !n.read)}`): `update({read: true}).eq("user_id", user.id).eq("read",
  false)` → aggiorna lo stato locale. Errore → solo `console.error`.
- **Segna come letta** (ghost, per riga non letta): `update({read:
  true}).eq("id", id)` → riga aggiornata. Errore → `console.error`.

## 3. Moduli

Nessuno.

## 4. Filtri / ricerca / viste

- Ricerca (`Input placeholder="Cerca notifiche..."`, `w-80`): `title` o
  `message` contengono il testo (case-insensitive).
- Tab (`Tabs defaultValue="all"`): **Tutte** · **Non lette** (badge blu con
  il conteggio se > 0) · **Certificati** (`type === "certificate"`) ·
  **Allenamenti** (`training`) · **Registrazioni** (`registration`). Non
  esiste una tab «Sistema».
- Ordinamento fisso: `created_at` decrescente (server).

## 5. Azioni di massa

«Segna tutte come lette» (sull'intero elenco, non sulla selezione).

## 6. Esportazioni

Nessuna.

## 7. Permessi

Rotta in `MANAGEMENT_PATHS` (`/notifications`), non admin-only: tutti i ruoli
di gestione. Nessun predicato client; la lettura è filtrata per utente
(`user_id = me OR user_id IS NULL`).

## 8. Stati

- Caricamento: spinner + «Caricamento notifiche...».
- Vuoto / nessun risultato (stesso blocco): `Bell`, «Nessuna notifica
  trovata», «Non ci sono notifiche che corrispondono ai tuoi filtri».
- Errore: solo `console.error`, elenco vuoto.
- Riga letta / non letta (sfondo + pulsante «Segna come letta»).

## 9. Flussi distruttivi

Nessuno.

## 10. Navigazione e parametri

Nessun parametro in entrata; nessun link in uscita. Il cassetto del guscio
(`NotificationDrawer`) porta qui con «Vedi tutte le notifiche».

## 11. Schede/sezioni

Le cinque tab del punto 4.

## 12. Test collegati

Nessun test legge `app/notifications/page.tsx` (grep su `tests/`). I test
che citano `notifications` riguardano l'area famiglia/allenatore e le
primitive dei tutori.

## 13. Inventario componenti

`Sidebar, Header, DashboardPageContainer, dashboardMainClassName,
SharedPageHeader, Card*, Button, Input, Badge, Tabs*`; lucide `Search, Bell,
Calendar, FileHeart, UserPlus, Settings, CheckCircle2`; `supabase`;
`useToast` da `@/components/ui/use-toast` (**importato e mai usato**).
Nessun componente specifico della rotta da rimuovere oltre al codice inline.

## Cosa non esiste in V1

Nessuna azione per notifica («Vedi», deep link su `data`), nessuna
eliminazione, nessuna paginazione oltre le 50 righe, nessun raggruppamento
per giorno (lo fa solo il cassetto V2).

## Sintesi

Una lista di sole lettura con ricerca locale, cinque tab per tipo/lettura,
«segna come letta» per riga e per tutte, finestra fissa di sei giorni, stessa
sorgente del cassetto del guscio (`simplified_notifications` via adapter).
