# 08 — Ruoli e permessi

**Unica fonte di verita: [`src/lib/access-roles.ts`](../../src/lib/access-roles.ts).**
Non duplicare logiche di ruolo altrove: estendi quel file.

## Ruoli canonici (7)

`owner` · `club_manager` · `collaborator` · `staff` · `trainer` · `parent` ·
`athlete`

`normalizeAccessRole()` normalizza da un dizionario di alias che include
sinonimi inglesi e italiani (anche flessi al femminile): `proprietario`,
`amministratore`, `gestore`, `collaboratrice`, `segreteria`, `allenatrice`,
`genitore`, `tutore`, `atleta`, `giocatrice`, ...

Un valore non riconosciuto restituisce `""` → nessun accesso alle aree
protette.

> Nota: `admin` e alias di **`club_manager`**, non di `owner`. `owner` deriva da
> `clubs.creator_id` oppure da una membership con ruolo owner.

## Aree di accesso

`getAccessArea(role)` → `management` | `trainer` | `parent` | `athlete` |
`account` | `public`

| Area | Ruoli | Redirect post-login (`getAccessRedirectPath`) |
|------|-------|-----------------------------------------------|
| `management` | owner, club_manager, collaborator, staff | `/dashboard?clubId=<id>` |
| `trainer` | trainer | `/trainer-dashboard` |
| `parent` | parent | `/parent-view/<athleteId>` |
| `athlete` | athlete | `/athletes/<athleteId>/profile` |
| `account` | qualsiasi utente autenticato | `/account` |

## Permessi di navigazione — `canAccessPath`

`getPathAccessArea(pathname)` classifica il percorso, poi:

- `public` e `account` → **sempre consentiti** a un utente autenticato;
- `management` → richiede un ruolo management. Alcuni prefissi sono
  **solo owner / club_manager**:
  `/create-club`, `/dashboard/access-management`, `/organization`,
  `/permissions`, `/settings`;
- `trainer` → solo `trainer`;
- `parent` → solo `parent`, **e** il path deve essere
  `/parent-view/<linkedAthleteId>` dell'atleta effettivamente collegato;
- `athlete` → i ruoli management passano; l'atleta passa solo sul proprio
  `/athletes/<linkedAthleteId>/profile`.

Prefissi management riconosciuti: `/dashboard`, `/athletes`, `/categories`,
`/clothing`, `/hub`, `/matches`, `/medical`, `/modulistica`, `/movements`,
`/notifications`, `/organization`, `/payments`, `/permissions`, `/procura`,
`/registration-management`, `/reports`, `/secretariat`, `/settings`, `/soci`,
`/sponsors`, `/staff`, `/structures`, `/trainers`, `/training`.

> Dal 2026-08-22 `canAccessPath` e applicato da `AccessAreaGuard` su **tutte**
> le aree, tramite `src/components/auth/management-area-layout.tsx` montato in
> ogni `layout.tsx` di area. A monte, `src/middleware.ts` reindirizza a
> `/login` chi non ha il cookie di sessione.
>
> Nessuno dei due e il presidio principale: il middleware non valida la
> sessione (niente Prisma su edge) e il guard e client-side. **L'autorizzazione
> vera resta server-side nelle API.** Vedi [14 — Sicurezza](14-security.md).

## Permessi sulle risorse API — `canAccessClubResource`

Applicato **server-side** in `src/app/api/v1/[resource]/route.ts` e
`.../[id]/route.ts` tramite `assertClubResourceAccess(role, resource, action)`.
Azioni: `read` | `create` | `update` | `delete`.

| Ruolo | Regola |
|-------|--------|
| `owner`, `club_manager` | **tutto** |
| `collaborator`, `staff` | tutto **tranne** le risorse admin-only |
| `trainer` | whitelist esplicita, separata per lettura e scrittura |
| `parent`, `athlete` | **nessun accesso** alle API generiche di club |

Risorse admin-only (`MANAGEMENT_ADMIN_ONLY_RESOURCES`):
`access_tokens`, `bank_accounts`, `clubs`, `organizations`,
`organization_users`, `payment_methods`, `users`.

### Trainer — lettura

`athlete_category_memberships`, `athletes`, `categories`,
`club_resource_items`, `matches`, `medical_certificates`, `notifications`,
`secretariat_notes`, `simplified_athletes`, `simplified_certificates`,
`simplified_notifications`, `staff_members`, `trainers`,
`training_attendance`, `trainings`

### Trainer — scrittura

`matches`, `notifications`, `simplified_notifications`, `training_attendance`,
`trainings`

### Parent e athlete

Non possono enumerare le risorse del club. Usano endpoint dedicati:

- `/api/v1/auth/athlete-profile/[athleteId]`
- `/api/parent-dashboard/[athleteId]` e sottorotte
  (`appointments`, `documents`, `structures`)

## Configurazione del club — `canManageClubConfiguration`

`true` solo per `owner` e `club_manager`. Usato ad esempio da
`/api/v1/training-automation`.

## Ruolo attivo: come viene deciso

`resolveOrganizationScopeForUser(userId, preferredOrganizationId, preferredRole)`
in `src/lib/server/auth.ts`:

1. carica tutte le membership (`organization_users`) ordinate per `is_primary`
   desc, poi `created_at` asc;
2. carica i club di cui l'utente e `creator_id` (**ownership implicita**);
3. `allowedOrganizationIds` = unione dei due insiemi;
4. `activeOrganizationId` = il valore richiesto **se e in allowed**, altrimenti
   la membership primaria, altrimenti il primo club posseduto, altrimenti il
   primo consentito;
5. `activeRole`:
   - `owner` se il ruolo richiesto e `owner` **e** l'utente possiede il club;
   - `null` se e stato richiesto un ruolo che non corrisponde ad alcuna
     membership del club attivo (**scelta voluta: non si degrada a un ruolo
     piu alto**);
   - altrimenti il ruolo della membership preferita / primaria / prima
     disponibile, oppure `owner` per ownership implicita.

Il client propone il contesto con gli header `x-active-club-id` e
`x-active-access-role`; il server **non si fida** e li valida contro
`allowedOrganizationIds`.

## Platform admin

E un ruolo **ortogonale** ai 7 ruoli di club: non compare in
`access-roles.ts`. Vedi [07 — Autenticazione](07-authentication.md).

## Test

`tests/auth/role-authorization.test.mjs` e
`tests/auth/active-club-access.test.mjs` coprono la matrice. **Ogni modifica a
`access-roles.ts` deve aggiornare questi test.**


---

## Lavoro sportivo: cinque permessi, nessun ruolo nuovo (2026-08-28)

Un rapporto di lavoro dice quanto guadagna una persona. In un club e il dato
che circola per pettegolezzo prima che per necessita, e i sette ruoli canonici
non bastano a governarlo: dicono **chi e** una persona, non **cosa puo fare**
sul dato economico piu riservato che la societa possiede.

Da qui cinque permessi di dominio, in `src/lib/sport-work/permissions.ts`, e
nessun ottavo ruolo — che CLAUDE.md vieta, e a ragione: aggiungere un ruolo
avrebbe costretto a duplicare l'intera gerarchia alla capability successiva.

| Permesso | Cosa consente |
|----------|---------------|
| `sport_work.manage` | creare e modificare rapporti, piani, premi, rimborsi, adempimenti |
| `sport_work.read` | vedere rapporti e compensi **di tutto il club** |
| `sport_work.read_own` | vedere i propri compensi |
| `sport_work.pay` | registrare e stornare erogazioni |
| `sport_work.fiscal` | vedere e preparare i dati contributivi e fiscali (F24, CU) |

| Ruolo | Permessi |
|-------|----------|
| `owner` | tutti |
| `club_manager` | tutti |
| `collaborator` | `read_own` |
| `staff` | `read_own` |
| `trainer` | `read_own` |
| `athlete` | `read_own` |
| `parent` | nessuno |

**Perche il perimetro si ferma a proprietario e club manager.** Perche e lo
stesso che gia protegge conti correnti, metodi di pagamento e configurazione
societaria (`MANAGEMENT_ADMIN_ONLY_RESOURCES`), e i compensi non sono meno
sensibili di quelli. Allargarlo a segreteria e collaboratori e una decisione di
prodotto: va presa esplicitamente, non per omissione.

**`read_own` esiste ma in V1 nessuna superficie lo consuma.** Non c'e ancora
una dashboard personale del collaboratore. Concederlo ora significa che il
giorno in cui quella dashboard esistera non si dovra riaprire il modello dei
permessi; **non** significa che un allenatore possa elencare i rapporti del
club, perche gli endpoint di elenco richiedono `sport_work.read`.

**Ogni diniego si traccia.** `sportWorkRoute` scrive `resource.access.denied`
con il permesso mancante, il percorso e il metodo: un tentativo di leggere i
compensi altrui e un evento di sicurezza, non un errore di navigazione.

**La conseguenza da dichiarare in schermata.** Chi non ha `sport_work.read`
vede Movimenti **senza le uscite dei compensi**, quindi con un totale Uscite
piu basso. E voluto — mostrare il totale senza le righe sarebbe una fuga a
meta — e resta fra le voci aperte di [16](16-technical-debt.md).

`tests/lib/sport-work-permissions.test.mjs` e
`tests/server/sport-work-routes.test.mjs` coprono la matrice, ruolo per ruolo,
sul dominio e sulle rotte.
