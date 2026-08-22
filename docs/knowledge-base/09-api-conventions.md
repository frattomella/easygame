# 09 — Convenzioni API

Codice: `src/app/api/**/route.ts`, `src/lib/server/resources.ts`,
`src/lib/api/client.ts`, `src/lib/api/registry.ts`.
Elenco leggibile: [`docs/api-registry.md`](../api-registry.md).
Elenco macchina: `GET /api/v1/registry`.

## Envelope

**Ogni** risposta, successo o errore, ha questa forma:

```jsonc
{ "data": <payload | null | []>, "error": null }
{ "data": null, "error": { "message": "...", "code": "..." } }
```

Regole:

- `data` non e mai omesso; per le liste il fallback e `[]`, per i dettagli
  `null`;
- `error.message` e **in italiano**, destinato all'utente finale;
- `error.code` e presente solo dove il client deve ramificare
  (`EMAIL_NOT_VERIFIED`, `PHONE_NOT_VERIFIED`, `VERIFICATION_REQUIRED`,
  `RATE_LIMITED`, `SMTP_*`, `REQUEST_ABORTED`, `NETWORK_ERROR`);
- lo `status` HTTP viene aggiunto a `error.status` dal client, non dal server.

## Codici di stato usati

| Status | Quando |
|--------|--------|
| 200 | Successo (anche per create/update) |
| 400 | Input non valido, risorsa sconosciuta, errore generico di dominio |
| 401 | Sessione assente o non valida → `"Sessione non valida"` |
| 403 | Ruolo non autorizzato (`"Accesso negato..."`), verifica account mancante |
| 404 | Entita non trovata |
| 429 | Rate limit, con header `Retry-After` / `X-RateLimit-*` |
| 500 | Errore inatteso |
| 501 | Funzione non implementata (checkout pagamenti) |
| 503 | Provider esterno non disponibile (SMTP) |

**Convenzione interna:** nei route handler generici l'errore viene mappato con
`String(error.message).includes("Accesso negato") ? 403 : 400`. Se aggiungi un
errore di autorizzazione, il messaggio **deve** contenere `Accesso negato`,
altrimenti diventa un 400.

## Header di contesto

Impostati automaticamente da `apiRequest` (web) e da `services/api.ts` (mobile):

| Header | Significato | Letto dal server? |
|--------|-------------|-------------------|
| `x-active-club-id` | Club attivo proposto dal client | **Si**, validato contro `allowedOrganizationIds` |
| `x-active-access-role` | Ruolo con cui operare | **Si**, validato contro le membership |
| `x-active-season-id` | Stagione attiva | **No** — nessun endpoint lo legge oggi |
| `Authorization: Bearer` | Token di sessione (mobile) | Si |

Il cookie `easygame_session` e l'alternativa usata dal Web.

## Due famiglie di endpoint

### 1. API versionata `/api/v1` — la superficie ufficiale

| Gruppo | Path |
|--------|------|
| Auth | `/api/v1/auth/**` (vedi [07](07-authentication.md)) |
| Risorse generiche | `/api/v1/[resource]` e `/api/v1/[resource]/[id]` |
| Admin piattaforma | `/api/v1/admin/overview`, `/admin/clubs/[id]`, `/admin/users/[id]`, `/admin/email`, `/admin/email/test` |
| Registro | `/api/v1/registry` |
| Trainer | `/api/v1/trainer/operational-alerts` |
| Automazioni | `/api/v1/training-automation` |

### 2. API di dominio non versionate — retaggio

`/api/athlete-payments/[paymentId]`, `/api/athletes/[athleteId]/documents/**`,
`/api/clothing/assignments`, `/api/forms/assets/[assetId]`,
`/api/medical-certificate-reminders`, `/api/online-forms`,
`/api/parent-dashboard/**`, `/api/payments/**`,
`/api/public/forms/[publicSlug]`.

Sono nate per casi che il CRUD generico non copre. **Convenzione per il nuovo
codice: crea endpoint sotto `/api/v1/`.** Non spostare quelli esistenti senza un
WP dedicato: il client mobile e le pagine web li referenziano.

## Il CRUD generico `/api/v1/[resource]`

`RESOURCE_CONFIG` (in `src/lib/server/resources.ts`) mappa il nome di risorsa a:

- `kind: "model"` → un delegate Prisma (`athletes` → `prisma.athlete`);
- `kind: "club_resource"` → riga di `club_resource_items` con quel
  `resource_type`.

| Metodo | Path | Note |
|--------|------|------|
| GET | `/api/v1/<resource>` | Lista. Filtri via query string |
| POST | `/api/v1/<resource>` | Create. Accetta un oggetto **o un array**. `{ mode: "upsert" }` per l'upsert. Body puo essere wrappato in `{ data, mode, meta }` |
| GET | `/api/v1/<resource>/<id>` | Dettaglio |
| PATCH | `/api/v1/<resource>/<id>` | Update parziale |
| DELETE | `/api/v1/<resource>/<id>` | Delete |

### Filtri supportati in query string

Solo una whitelist, confronto di uguaglianza esatta:

`id`, `email`, `user_id`, `organization_id`, `athlete_id`, `payment_id`,
`invoice_id`, `bucket`, `path`, `status`, `type`, `role`, `resource_type`.

`club_id` e accettato come alias di `organization_id`.

**Non esiste** paginazione, ordinamento configurabile, ricerca testuale o
filtro per intervallo. Le liste tornano complete. Vedi
[16 — Debito tecnico](16-technical-debt.md).

### Effetti collaterali da conoscere

- `POST /api/v1/notifications` e `/api/v1/simplified_notifications` inviano
  anche **email** ai destinatari (`sendNotificationEmails`).
- Scrivere una `club_resource` risincronizza la colonna JSON su `clubs`;
  scrivere quella colonna ricrea le righe. Vedi
  [06 — Modello dati](06-data-model.md).

## Sequenza obbligatoria in un route handler

Ogni nuovo endpoint autenticato deve seguire questo ordine:

```ts
const session = await requireAuthenticatedUser(request);
if (!session) return NextResponse.json(
  { data: null, error: { message: "Sessione non valida" } }, { status: 401 });

const scope = await resolveOrganizationScopeForUser(
  session.db.user_id,
  request.headers.get("x-active-club-id"),
  request.headers.get("x-active-access-role"),
);

assertClubResourceAccess(scope.activeRole, "<resource>", "<action>");
// oppure canManageClubConfiguration(scope.activeRole) per la configurazione
// oppure requirePlatformAdmin(request) per /api/v1/admin/*
```

Poi filtrare **sempre** per `scope.activeOrganizationId` o verificare che
l'`organization_id` del record sia in `scope.allowedOrganizationIds`.

## Validazione input

Oggi la validazione e **manuale** e disomogenea: coercizione con
`String(x || "").trim()`, controlli espliciti, `zod` usato in un solo punto
(`src/lib/email/smtp-config.ts`).

`zod` e gia una dipendenza: preferiscilo per gli endpoint nuovi. Uniformare
l'esistente e [WP-05](20-work-packages.md).

## Registro API

Quando aggiungi o rimuovi un endpoint pubblico aggiorna, nello stesso commit:

1. `src/lib/api/registry.ts` (e/o `API_REGISTRY` in `resources.ts`);
2. `src/lib/api-docs/internal-api-registry.ts` se compare in `/private/api-docs`;
3. [`docs/api-registry.md`](../api-registry.md).
