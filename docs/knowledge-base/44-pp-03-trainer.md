# 44 — PP-03: Trainer production ready

> Verbale della lane **PP-03**, base `0d66921` (tip di PP-01), branch
> `feat/pp-03-trainer`. Stile di [42 — PP-01](42-pp-01-club-atleti-allenamenti.md):
> cosa e stato riprodotto, la causa, cosa e cambiato, come e stato verificato.
>
> Le prove che questo verbale cita vivono in due posti e non sono
> intercambiabili:
>
> - `tests/**/*.test.mjs` — entrano in `npm test`, girano su un doppio di
>   Prisma, e sono la rete che impedisce il ritorno del difetto;
> - `scripts/pp-03-*.mjs` — girano contro **PostgreSQL vero**
>   (`easygame_dev_pp03`) e, dove possibile, contro i **route handler veri**.
>   Sono la misura: un doppio di Prisma diverge dal database su array,
>   `hasSome`, unicita e transazioni, e un test di dominio verde non dice
>   niente sulla rotta.

---

## §1 — L'evento ammesso non ammette le persone dell'evento

**Riprodotto.** Un club, due sedi, tre categorie, due allenatori di una
categoria ciascuno. Un allenamento **congiunto** su due categorie (A e B).

[ADR-0111](18-decision-log.md) fa passare un evento se **almeno una** delle sue
categorie sta nel perimetro di chi guarda: la scelta e giusta, e un allenamento
congiunto appartiene a entrambi gli allenatori. Da li discendeva pero un caso
che nessuno guardava: dall'evento ammesso usciva **tutto il resto**.

**La causa, una sola per quattro difetti.** `assertAtletiDentroIlPerimetro` si
accendeva unicamente se `buildAthleteAccessScopeConditions(scope)` trovava
qualcosa, cioe se l'operatore aveva righe in `club_access_scopes`. **Un
allenatore ordinario non ne ha nessuna**: il suo recinto vive nella scheda
dentro `clubs.trainers`, non in quella tabella. Per quella guardia il suo
perimetro era assente, e «assente» vale «tutto il club»
([ADR-0103](18-decision-log.md)). La guardia c'era e su di lui non si accendeva
mai.

Misurato dalle rotte vere:

- `GET /events/:id/participants` e `GET /events/:id` restituivano **tutti** i
  partecipanti, cioe i minori della categoria A che il suo stesso elenco atleti
  non gli mostra;
- `POST action:"attendance"` su un minore della categoria A rispondeva **200**;
- `POST action:"convoke"` con un elenco **vuoto** cancellava la convocazione di
  quei minori: la ripulitura agisce su cio che l'elenco *non* nomina, quindi non
  passava dal vaglio, e `notIn: []` in SQL non esclude niente.

Inoltre `GET /secretariat_notes` serviva all'allenatore **tutte** le note del
club, compresa quella interna della segreteria e quella indirizzata per nome a
un altro allenatore. Il vaglio esisteva e viveva **solo nel browser**: un filtro
che sta dopo la rete non e un confine, il dato e gia uscito.

**Cosa e cambiato.**

- `src/lib/server/resources.ts` esporta `athleteIdsWithinTrainerPerimeter`, che
  risponde passando le righe vere per lo **stesso** filtro che compone l'elenco
  atleti — una seconda implementazione della stessa regola sarebbe la prossima
  divergenza. Torna `null` per chi non e allenatore: «nessun recinto» non e
  «recinto vuoto».
- `src/lib/server/events.ts`: i due recinti si sommano in
  `assertAtletiDentroIlPerimetro`; `listEventParticipants` **filtra le righe**
  invece di negare l'evento, come fa gia `listClubEvents`; la ripulitura delle
  convocazioni si limita alle persone che chi agisce potrebbe convocare.
- `secretariat_notes` entra in `TRAINER_DASHBOARD_FILTERED_RESOURCES` e il
  vaglio riusa `isReminderVisibleToTrainer`, la stessa funzione pura del
  browser, applicata dove decide.

**Conseguenza dichiarata.** L'allenatore non registra piu da solo la presenza di
un atleta fuori dal proprio perimetro. La convocazione fuori categoria resta
possibile a chi vede tutto il club.

**Verificato.** `scripts/pp-03-security-probe.mjs`, 36/36 contro
`easygame_dev_pp03` e le rotte vere. Verifica per mutazione: spenta la guardia
tornano rosse esattamente A-02, A-04, A-05, A-07; tolto `secretariat_notes`
dall'insieme, C-01 e C-02. In `npm test`:
`tests/server/pp-03-perimetro-persone.test.mjs`, e
`tests/server/perimetro-allenatore.test.mjs` corretto — il suo caso legittimo di
§6 usava un atleta di **un'altra** categoria e passava solo grazie alla falla.

---

## §2 — La lettura dell'allenatore filtra il club dopo, non nella query

**Riprodotto.** Due club, e nei due lo **stesso** identificativo logico di
allenatore. La direzione del primo club apre la propria scheda allenatore e
preme «Scollega account»: risposta «Accesso negato», su un allenatore proprio,
esistente e legittimo.

**La causa.** `caricaAllenatoreDelClubAttivo` — la lettura dietro
`DELETE /api/v1/trainer-accounts/:trainerId` — cercava la scheda in **tutto**
l'archivio e chiedeva il club solo dopo, ad `assertActiveClub`, su cio che aveva
gia trovato.

`payload.path=["id"]` **non e unico**: l'identificativo logico
(`trainer-<istante>-<casuale>`) puo ripetersi fra due club, e `findFirst` senza
filtro ne sceglie uno qualsiasi, nell'ordine dell'archivio. Quando sceglieva la
scheda dell'altro club, la funzione negava. Non una perdita di dato: una
funzione che smette di funzionare, in un modo che nessuno sa spiegare.

Il secondo verso e piu ordinario: la coppia di risposte «non trovato» /
«accesso negato» diceva a chi provava se un identificativo esiste in **qualche**
club. E l'oracolo di esistenza che [CLAUDE.md §8](../../CLAUDE.md) chiude
chiedendo il filtro `organization_id` in ogni query club-scoped. La regola non e
«controlla il club»: e «**filtra** il club».

**Cosa e cambiato.** Le due letture portano
`organization_id: scope.activeOrganizationId`, e l'assenza di un club attivo e
un errore prima della query. `assertActiveClub` resta dov'era: e la seconda
cintura, non la prima.

**Verificato.** `tests/server/pp-03-scollegamento-allenatore.test.mjs`, tre
prove: l'omonimo di un altro club messo **per primo** nell'archivio non nasconde
piu la scheda propria; un identificativo che vive solo altrove risponde «non
trovato» esattamente come uno inventato; la **forma** delle due `findFirst`
porta il filtro, perche altrimenti le prime due prove potrebbero restare verdi
per fortuna. Verifica per mutazione: rimossa la guardia, tutte e tre rosse.

---

## §3 — La revoca che non slega, quando il ruolo e personalizzato

Dependency registrata da **PP-04** verso PP-03 e chiusa qui.

**Riprodotto.** Un club concede a un allenatore una tessera di **ruolo
personalizzato** basato su `trainer` — `custom:trainer:preparatori`
([ADR-0102](18-decision-log.md)). Il proprietario poi la revoca dalla Gestione
Accessi. Dopo la revoca la persona non ha **nessuna** tessera nel club, e la sua
scheda continua a mostrare «Account collegato»: `clubs.trainers[].linkedUserId`
e `club_resource_items.payload.linkedUserId` puntano ancora a lei. Con
`athletes.user_id` succede lo stesso, e con `athletes.data.guardians[]` pure.

**La causa.** `revokeClubAccess` cancella la tessera e poi chiama i quattro
sweep di `src/lib/server/profile-account-links.ts`, perche nessun riferimento
all'utenza sopravviva nel club ([ADR-0110](18-decision-log.md)). I quattro
decidevano se toccare qualcosa confrontando `organization_users.role` con
insiemi di stringhe scritti nel file:

```ts
const TRAINER_ROLES = new Set(["trainer", "allenatore", "coach"]);
```

Quel confronto ignorava due cose.

1. **Un ruolo personalizzato porta uno slug.** In colonna c'e
   `custom:trainer:preparatori`, non `trainer`, e nessuno dei quattro insiemi lo
   conteneva. Per lo sweep quella tessera non era di nessun ruolo, quindi
   revocarla non slegava **niente**.
2. **Gli alias canonici vivono in un elenco solo**, `src/lib/access-roles.ts`.
   Le copie locali ne avevano perse per strada — `allenatrice`, `tutor`,
   `giocatore`, `amministratore`, `segreteria`, `membro` — e ne avevano una
   (`socio`) che il dizionario canonico non riconosce affatto. Ogni alias
   mancante e una revoca che lascia un riferimento vivo; l'alias di troppo e
   una stringa che apre lo sweep senza corrispondere a nessun ruolo.

**Cosa e cambiato.** I quattro insiemi spariscono. Il ruolo di una tessera si
risolve con `normalizeAccessRole`, che e la sola funzione che conosce gli alias
e che, davanti a uno slug, ne estrae la **base**: la base sta nello slug per
costruzione (`buildCustomRoleValue`), e `club-roles.ts` scrive slug e
`custom_role_id` insieme, quindi risolvere dallo slug non chiede una seconda
lettura e da la stessa risposta di `club_roles.base_role`. La firma delle
quattro funzioni non cambia, e nessuno dei due chiamanti
(`revokeClubAccess`, `POST /api/v1/auth/memberships/delete`) ha dovuto adeguarsi.

**Una differenza voluta:** `owner` entra fra i ruoli gestionali. Non c'era, e
non per una ragione: un secondo proprietario si puo revocare — solo il
**fondatore** e protetto, e lo e per la sua `clubs.creator_id`, non per la
tessera — e la sua scheda in `staff_members` restava collegata come tutte le
altre.

**Verificato.**

- `scripts/pp-03-revoca-sweep-probe.mjs`, 9/9 contro `easygame_dev_pp03`
  passando dal dominio vero (`createClubRole`, `assignClubRole`,
  `revokeClubAccess`) e leggendo le colonne dopo. Verifica per mutazione:
  rimessi gli insiemi, 7 prove su 9 tornano rosse — restano verdi solo quella
  che descrive la tessera e quella che verifica che la scheda **dell'altro**
  allenatore non venga toccata.
- `tests/server/pp-03-revoca-sweep-ruolo.test.mjs` in `npm test`, che misura i
  due versi: gli slug e gli alias slegano, e un ruolo estraneo al profilo — o
  sconosciuto al dizionario — **non** slega. Allargare il riconoscimento non
  deve trasformare lo sweep in una scopa che passa ovunque.

**Cosa resta.** Con §3 la produzione di **nuove** righe dangling si ferma. Le
righe gia dangling in archivio restano dove sono: ripulirle e una bonifica dei
dati, non una modifica di codice, ed e annotata come debito `PP03-D1` in
[16 — Debito tecnico](16-technical-debt.md). PP-04 ha registrato lo stesso
difetto dal proprio lato (debito `PP04-D1` nel suo worktree) e lo ha chiuso a
valle: `findAthleteProfileForUser` onora il legame solo finche la persona
appartiene ancora al club, quindi l'area atleta era gia al sicuro a prescindere
da questo sweep.
