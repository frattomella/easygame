# Wave E — Audit di parità: Registro attività (`/audit`)

> Inventario funzionale dell'implementazione V1 sul branch `feat/web-redesign`,
> scritto **prima** della migrazione al Web V2. È il contratto di parità:
> niente sparisce. Nessuna proposta di design.
>
> Rotta coperta: `/audit` (`src/app/audit/page.tsx`, 396 righe; voce di menu
> «Registro attività», gruppo Impostazioni). Rotta server letta per il
> contratto: `src/app/api/v1/audit/route.ts`; `src/lib/server/audit.ts`
> (`assertAuditReadPermission`, `listAuditEvents`, `listAuditAreas`,
> `listAuditActions`, `AuditEventView`).

---

## Guscio

**Difetto V1**: la pagina monta `DashboardPageContainer` e `SharedPageHeader
title="Registro delle operazioni" subtitle="Chi ha fatto cosa in questo
club, e cosa e stato negato." eyebrow="Sicurezza"` **senza `Sidebar` né
`Header`**: è l'unica pagina di gestione senza guscio (il layout
`management-area-layout` monta solo la guardia). La V2 monta il guscio come
ogni altra pagina.

## 1. Dati mostrati

`GET /api/v1/audit?{query}` → `{items: EventoAudit[], total, areas[],
actions[]}`. `EventoAudit`: `id, created_at, action, outcome
(success|failure|denied), actor_email, actor_role, resource, resource_id,
ip, metadata (Record chiuso di chiavi descrittive: nessun nome, importo o
testo libero)`. `actions[]` arriva e **non è usato**.

Per riga (`data-testid="audit-row"`): badge esito (`ETICHETTE_ESITO`:
success «Riuscita» `secondary` · failure «Fallita» `outline` · denied
«Negata» `destructive`; altrimenti il valore grezzo), `action` in
monospazio, istante `toLocaleString("it-IT", {dateStyle: "short",
timeStyle: "medium"})`, riga meta `actor_email || "—" · getAccessRoleLabel
(actor_role) · resource · resource_id · ip`, poi un badge outline per ogni
coppia `chiave: valore` dei metadati (`JSON.stringify` se oggetto).

Intestazione dell'elenco: «{totale} operazioni».

## 2. Azioni

- **Applica** (`setOffset(0); setApplicati(filtri)`): i filtri si applicano
  **solo al clic** (stato `filtri` in bozza, `applicati` in query).
- **Solo dinieghi** (toggle: `default` se attivo, altrimenti `outline`):
  applica subito `denied = !applicati.denied` insieme alla bozza corrente.
- **Azzera**: bozza e applicati a `FILTRI_VUOTI`, offset 0.
- **Precedenti** (`disabled={offset === 0}`) / **Successive**
  (`disabled={offset + PAGINA >= totale}`), `PAGINA` = 50.

## 3. Moduli (banda filtri, card «Filtri» con `ScrollText`)

| Campo | Tipo | Iniziale | Parametro |
|---|---|---|---|
| Area (`area`) | `select`: «Tutte» + `aree` dal server (prefisso di `AUDIT_ACTIONS`: `auth`, `payment`, `announcement`, …) | `""` | `area` |
| Esito (`esito`) | `select`: «Tutti» · «Riuscite» (`success`) · «Fallite» (`failure`) · «Negate» (`denied`) | `""` | `outcome` |
| Chi (indirizzo) (`attore`) | `Input`, placeholder «parte dell'indirizzo» | `""` | `actor_email` (substring) |
| Risorsa (`risorsa`) | `Input`, placeholder «athletes, payments…» | `""` | `resource` |
| Dal (`dal`) | `date` | `""` | `from` |
| Al (`al`) | `date` | `""` | `to` = `{al}T23:59:59` |
| Solo dinieghi | pulsante toggle | `false` | `denied=1` |

Sempre: `limit=50`, `offset`. La rotta accetta anche `actor_user_id`,
`action`, `resource_id` (non offerti dalla schermata: **non si inventano**).

## 4. Filtri / viste

I sette filtri del punto 3, tutti **server-side**. Nessuna vista salvata,
nessuna ricerca locale, ordinamento fisso (server, `created_at` desc).

## 5–6. Azioni di massa, export

Nessuna. (Nessuna esportazione in V1: la griglia V2 non la aggiunge.)

## 7. Permessi

- Rotta in `MANAGEMENT_PATHS` (`/audit`), **non** admin-only: decide la
  chiave `audit.read` (catalogo, concedibile a un ruolo personalizzato su
  `club_manager`). Nessun predicato client: la pagina chiama la rotta e
  interpreta `error.status === 403` (`negato`).
- Server: `assertAuditReadPermission(scope)` (`roleHasPermission(role,
  "audit.read")`), registra il diniego e risponde «Accesso negato: il ruolo
  attivo non puo consultare il registro del club».

## 8. Stati

- **Negato** (403): card con `ShieldAlert`, «Il ruolo attivo non puo leggere
  il registro», «Serve il permesso `audit.read`. Lo concede il proprietario
  dalla gestione accessi.» (sostituisce tutta la pagina, filtri compresi).
- **Errore** (altro): `errore` in rosso dentro la card dell'elenco.
- **Caricamento**: `Loader2` + «Carico il registro…».
- **Vuoto**: «Nessuna operazione con questi filtri.»
- Esito per riga: Riuscita · Fallita · Negata.

## 9. Flussi distruttivi

Nessuno (registro in sola lettura).

## 10. Navigazione e parametri

Nessun parametro in entrata (la pagina non legge `?area=`). Nessun link in
uscita. `access-management` linka qui con la chiave visibile
(`wave6-superfici-6g`).

## 11. Schede/sezioni

Nessuna: banda filtri + elenco.

## 12. Test collegati

- `tests/ui/wave6-superfici-6g.test.mjs` — legge `app/audit/page.tsx`:
  contiene `audit.read`, `/api/v1/audit`, `status === 403`; contiene le
  stringhe `"area"`, `"outcome"`, `"actor_email"`, `"resource"`, `"from"`,
  `"to"`, `"denied"` (i parametri mandati al server); nessun
  `grid-cols-N` senza breakpoint; nessun `w-[NNNpx]`/`min-w-[NNNpx]` con tre
  cifre.
- `tests/lib/*audit*` — dominio server (non toccato).

## 13. Inventario componenti

`DashboardPageContainer, SharedPageHeader, Badge, Button, Card*, Input,
Label`; lucide `Loader2, ScrollText, ShieldAlert`; lib `apiRequest,
getAccessRoleLabel`. Tutto inline.

## Cosa non esiste in V1

Nessuna esportazione, nessun dettaglio di riga oltre ai badge dei metadati,
nessun filtro per `action`/`resource_id`/`actor_user_id`, nessun deep link.

## Sintesi

Elenco paginato server-side (50) con sette filtri applicati al clic, tre
esiti, metadati a chip, permesso `audit.read` raccontato con un 403. La V2
lo rende un `DataGrid` con i filtri della griglia mappati sugli stessi
parametri, lo stesso pager server, un ispettore per i metadati, e monta il
guscio che alla V1 mancava.
