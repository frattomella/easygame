# 27 — RC Fix 3: i tre residui che stavano fra il collaudo e la produzione

**Data:** 2026-08-28 · **Branch:** `integration/web-v1` · **Staging:**
distribuito, deployment `dpl_4V5bQUSQCFPBgbmKcaJdNeUTpYox` **READY**, alias
`easygame-staging-pi.vercel.app`

Il [Full Club UAT](26-full-club-uat.md) e chiuso e resta **PASS**. Questo
documento non lo tocca e non lo rilegge: prende i tre residui che quel collaudo
aveva lasciato aperti — uno bloccante e due medi — e risponde alla sola domanda
che serve prima della produzione. **Cosa era rotto, perche, e come si sa che
adesso funziona.**

RC Fix 3 determina esclusivamente la **prontezza per la produzione**. Non
riapre il verdetto del collaudo.

## La lezione di questo giro

RC Fix 1 aveva imparato che i difetti veri si vedono aprendo la pagina. RC Fix
2 lo aveva confermato due volte. RC Fix 3 aggiunge una cosa diversa, e piu
scomoda: **due dei tre difetti erano gia stati registrati, con la causa
sbagliata.**

- Il debito tecnico diceva che le date di nascita «implausibili» passavano
  dall'API. Passavano anche quelle **inesistenti**, e non venivano rifiutate ne
  accettate: venivano **cambiate**. `2026-02-31` diventava il 3 marzo 2026,
  perche in JavaScript `new Date` di una data impossibile non fallisce, riporta.
  Chi aveva misurato il difetto aveva provato `2030-05-05` e `1890-05-05`, che
  sono date vere; la classe peggiore non era stata provata.
- Il debito tecnico diceva che `clubs.settings` si riscrive per intero e che
  due scritture concorrenti se ne perdono una. Era vero, ma la correzione
  proposta — transazione piu blocco di riga — non avrebbe chiuso il caso
  reale: la copia vecchia arriva dal **client**, e resta vecchia anche se la
  sua scrittura aspetta il proprio turno.

La regola che ne discende: **un difetto registrato non e un difetto capito.**
Prima di correggerlo va riprodotto, e la riproduzione va scritta come test —
perche e li che si scopre che la causa era un'altra.

## 1. Le Entrate di `/movements` non erano il denaro incassato — BLOCCANTE

### La causa

`summarizeClubMovements` calcolava Entrate e Uscite da `status`: se la riga
risultava saldata sommava il suo **importo dovuto**, altrimenti zero.

La regola aveva senso finche una rata e un incasso erano la stessa riga di
`payments`. Dal registro incassi ([ADR-0036](18-decision-log.md)) non lo sono
piu: la rata e il **dovuto**, ogni incasso e un movimento a parte, e fra il
primo incasso e l'ultimo la rata non e ne pagata ne scoperta.

Da qui i due errori opposti che il Full Club UAT ha misurato sulle **stesse**
rate:

| Stato delle rate | Entrate mostrate | Denaro realmente incassato |
|------------------|------------------|----------------------------|
| Saldate | 329,80 € | — |
| Parzialmente pagate | 0,00 € | 250,00 € |

Mai la cifra giusta. Non era un errore di somma: era la domanda sbagliata.

### La correzione

Prima il test. `tests/lib/movements-cash-ledger.test.mjs` riproduce il caso
esatto — due rate da 179,80 e 150,00, incassate per 179,80 e 70,20 — e sul
codice di allora **falliva dichiarando 179,80 invece di 250,00**. Cinque degli
undici test fallivano.

Poi la correzione ([ADR-0068](18-decision-log.md#adr-0068--le-entrate-sono-cassa-il-denaro-incassato-non-si-deduce-dallo-stato-della-rata)):
ogni movimento porta due numeri distinti.

| Campo | Significato |
|-------|-------------|
| `amount` | Il **dovuto**: quello che la riga dichiara |
| `collectedAmount` | Il **denaro entrato**, letto dal registro |

Entrate e Uscite sommano `collectedAmount`. «Previste» diventa il residuo
(`amount - collectedAmount`, mai negativo): incassato e residuo tornano sempre
al dovuto.

**Non e una seconda contabilita.** `collectedAmount` viene da
`readChargeCollectedAmount` (`src/lib/payments/installment-ledger.ts`), che
legge la fotografia `data.ledger` scritta da `recomputeChargeFromLedger`; dove
quella fotografia non c'e risponde `resolveInstallmentLedger`, cioe la funzione
che la produce. Una rata saldata **prima** del registro continua a valere per
intero: riscrivere denaro gia registrato e la cosa che si evita.

L'elenco mostra ora «Incassato X» sotto l'importo quando le due cifre non
coincidono, perche una riga che dice 100,00 € mentre contribuisce 40,00 € al
totale sarebbe un conto che non torna a chi lo legge.

### Cosa e stato verificato

`tests/lib/movements-cash-ledger.test.mjs` — 11 test, tutti passanti:

| Caso | Atteso |
|------|--------|
| Rata senza incassi | Entrate 0, Previste = dovuto |
| Rata incassata in parte (40 su 100) | Entrate 40, Previste 60 |
| Rata saldata | Entrate = dovuto, Previste 0 |
| Due incassi sulla stessa rata (40 + 60) | Entrate 100, contata una volta sola |
| Storno dell'unico incasso | Entrate 0, la rata torna fra le previste |
| Rimborso parziale (100 incassati, 30 resi) | Entrate 70, Previste 30 |
| Incasso, storno, nuovo incasso | Entrate 45, Previste 55 |
| **Il caso del Full Club UAT** | **Entrate 250,00, Previste 79,80, somma 329,80** |
| Rata annullata | Fuori da entrambe le colonne |
| Rata saldata prima del registro | Contata per intero |
| Uscite e saldo | Stessa regola; saldo = Entrate − Uscite |

I totali si sommano in **centesimi**: 179,80 piu 70,20 in virgola mobile fa
250.00000000000003.

## 2. Le date di nascita impossibili passavano dall'API — MEDIO

### La causa

L'anteprima dell'import rifiutava gia il 31 febbraio, il 29 febbraio di un anno
non bisestile e una nascita nel futuro. La stessa scheda salvata dalla pagina
Atleti — o da un modulo di iscrizione compilato da una famiglia, che finisce
nella stessa rotta — non passava di li: arrivava a `createResource`, che si
limitava a `new Date(valore)`.

**E `new Date` non e un giudice.**

    new Date("2026-02-31")  ->  3 marzo 2026
    new Date("2026-04-31")  ->  1 maggio 2026
    new Date("2025-02-29")  ->  1 marzo 2025

Il record veniva accettato con una data **diversa da quella scritta**, senza un
errore da nessuna parte. Da `birth_date` discendono eta, categoria per anno di
nascita e codice fiscale.

### I consumer, mappati prima di toccare il contratto

| Chi scrive una data di nascita | Come |
|--------------------------------|------|
| Pagina Atleti (creazione e modifica) | `src/lib/simplified-db.ts` → `POST/PATCH /api/v1/athletes` |
| Moduli pubblici di iscrizione | `src/lib/server/form-submissions.ts` → `createResource` / `updateResource` |
| Import da file | `src/lib/athlete-import.ts` (anteprima) → stessa rotta |
| **App mobile** | **Non scrive.** `easygamemobile/client/services/api.ts` e `mobile-backend-storage.ts` leggono `birthDate`; l'area allenatore e in sola lettura ([ADR-0025](18-decision-log.md)) |

Tutte le scritture passano da `normalizeModelInput` e da
`assertAnagraficaIsValid`: **un solo punto**, e nessun breaking change per il
mobile.

### La correzione

La regola vive ora in `src/lib/birth-date.ts`, modulo puro
([ADR-0070](18-decision-log.md#adr-0070--una-data-di-nascita-si-legge-come-testo-non-come-date)):
una data si legge **come testo** e le sue tre parti devono ricomporre lo stesso
giorno del calendario. L'import ne condivide la regola (`isRealCalendarDate`,
`MIN_PLAUSIBLE_BIRTH_YEAR`), non i messaggi: l'anteprima parla a chi guarda un
foglio di calcolo.

Due punti, di proposito:

- `normalizeDates` (`resources.ts`) smette di mentire: se il giorno non esiste,
  il valore resta come e stato scritto invece di diventarne un altro;
- `assertAnagraficaIsValid` lo rifiuta con un errore di dominio in italiano,
  **400** — ed e l'unico che ha in mano il record esistente, quindi puo
  applicare l'indulgenza gia propria di quel modulo: una scheda che porta
  **gia** quella data resta correggibile.

### Cosa e stato verificato

`tests/server/birth-date-api.test.mjs` — 15 test sul percorso vero
(`createResource` / `updateResource` con il doppio del client Prisma). Sul
codice di allora **ne fallivano 9**.

| Caso | Atteso |
|------|--------|
| `2026-02-31` | Rifiutata, e **nessuna scrittura** parte |
| `2026-04-31` | Rifiutata |
| `2025-02-29` | Rifiutata |
| `2024-02-29` (bisestile) | Accettata |
| `31/02/2026` | Rifiutata allo stesso modo |
| `2099-05-01` | «Data di nascita nel futuro» |
| `1500-01-01` | «Data di nascita non plausibile» |
| Testo non riconoscibile | «Data di nascita non riconosciuta» |
| `2012-03-12` | Salvata **esattamente** quel giorno |
| `2012-03-12T00:00:00.000Z` | Stesso giorno |
| Scheda senza data | Si crea come prima |
| PATCH con data impossibile | Rifiutata |
| Scheda in archivio con data nel futuro, salvata con altri campi | **Resta correggibile** |
| La stessa scheda verso una data ancora peggiore | Rifiutata |

## 3. Le scritture concorrenti su `clubs.settings` — MEDIO

### Prima la riproduzione

Il primo test di `tests/server/club-settings-concurrency.test.mjs` esercita
`updateResource` su `clubs` come lo usa il client: due letture, due scritture
che si accavallano. La scheda Contatti viene salvata, poi la scheda Pagamenti —
partita da una lettura precedente — la riporta al valore di prima. **Il lost
update e confermato**, e il test lo dimostra passando *prima* della correzione.

Ma la riproduzione ha corretto anche l'analisi. Dentro **una sola pagina** il
difetto era gia contenuto: `createCoalescingSaver` scrive le sezioni una dopo
l'altra (WP-36). Il caso reale sono **due finestre** o **due persone** della
stessa societa — e li la finestra non e di millisecondi, e di minuti. Il che
significa che la correzione proposta nel debito tecnico, transazione piu blocco
di riga, non sarebbe bastata: la copia vecchia arriva dal client, e resta
vecchia anche se la sua scrittura aspetta il proprio turno.

### La correzione

`PATCH /api/v1/clubs/:id` accetta ora **`settings_patch`**: le sole chiavi che
cambiano. Il server le fonde con il valore corrente, letto al momento della
scrittura, dentro una transazione con `SELECT … FOR UPDATE` sulla riga — lo
stesso rimedio, e lo stesso modo di scriverlo, gia usato dal registro incassi
([ADR-0067](18-decision-log.md)). `settings` intero resta accettato e continua
a **sostituire**: e cosi che si toglie una chiave, e ci sono percorsi che ne
hanno bisogno.

`saveClubProfileSection` manda ora la sola sezione. Non c'e piu una copia
vecchia da riportare indietro, e cade anche la rilettura che serviva a
costruirla: **una richiesta invece di due**.

Nessun framework nuovo, nessuno stato condiviso: un campo additivo e una
funzione di quaranta righe.

### Cosa e stato verificato

`tests/server/club-settings-concurrency.test.mjs` — 6 test:

| Caso | Atteso |
|------|--------|
| **Riproduzione** del lost update con il vecchio schema | La scrittura precedente sparisce (passa gia prima della correzione) |
| Contatti + Pagamenti da letture sfalsate | **Entrambi restano**; cio che nessuno ha toccato non si muove |
| Branding + dati fiscali | Entrambi restano |
| Due modifiche alla stessa chiave | Vince l'ultima, non un ibrido |
| Autosave con cinque sezioni sporche insieme | Nessuna persa |
| `settings` intero | Sostituisce ancora, come prima |

**Cosa questi test non provano.** Il doppio del client Prisma non ha isolamento
delle transazioni: non puo dimostrare che un `FOR UPDATE` funzioni. Prova
l'unica proprieta che qui conta davvero — che la scrittura di una sezione non
porti con se una copia vecchia delle altre — ed e questa a rendere il lost
update impossibile, perche toglie di mezzo la rilettura invece di metterla in
fila. La simultaneita al database si verifica a runtime.

## Gate

| Gate | Esito |
|------|-------|
| Test mirati | **32 nuovi**, tutti verdi — e ognuno dei tre gruppi fallisce sul codice di prima (5/11, 9/15, e la riproduzione del lost update) |
| `npm test` | **2.010 / 2.010** |
| `npm run typecheck` | Nessun output |
| `npm run lint` | 0 errori, **40 avvisi — invariati** rispetto a `HEAD` (verificato riportando `src/` allo stato precedente e ricontando) |
| `npm run build` | Completata |
| CI remota | **4 / 4 verdi su HEAD** (`bdd0bb2`): Web App, Mobile App, Guardrail di sicurezza, Vercel Preview Comments |

### Regressione mirata sui domini toccati

Rieseguiti e verdi dentro `npm test`: pagamenti e registro incassi
(`installment-ledger`, `payment-transactions`, `payment-partial-regressions`,
`payment-scenario-130`, `refunds`, `payment-gateway-refunds`), Stripe
(`stripe-connect-v2`, `stripe-settlement`, `stripe-webhook-signature`,
`connect-account`, `commission`), autosave del club (`club-profile-autosave`,
`coalescing-saver`, `club-write-requests`, `club-projection`), atleti
(`athlete-list-payload`, `athlete-list-pagination`, `athlete-scope-fallback`,
`anagrafica-validation`), import (`athlete-import`,
`athlete-import-hardcheck`, `athlete-import-plausibility`), autenticazione
(`auth-security`, `api-authorization`, `route-guards`, `password-reset`) e
isolamento multi-tenant (`multi-tenant-isolation`).

## Runtime su staging

Deployment `dpl_4V5bQUSQCFPBgbmKcaJdNeUTpYox`, **READY**, alias
`easygame-staging-pi.vercel.app`. Nessuna migrazione nuova in questo giro:
`prisma/migrations/` e invariato rispetto a `1f9b6f1`.

Smoke test: `/` 200, `/login` 200, `/api/v1/registry` 200 (325 voci).

Club di collaudo: `QA UAT Club` (`ae3d545b-…c09f7cbbf553`), lo stesso del Full
Club UAT.

### Movimenti — il caso del collaudo, aperto di nuovo

Prima ancora di creare dati nuovi, la pagina apre sui **dati che avevano
prodotto il difetto**:

| | Prima (Full Club UAT) | Ora |
|---|---|---|
| Entrate | **0,00 €** | **250,00 €** |
| Previste | 329,80 € | **79,80 €** |
| Saldo | 0,00 € | 250,00 € |

E le righe reggono il totale una per una, nella scheda «Previsti»:

    +199,80 €  Incassato 150,00 €   Quota annuale QA - Seconda rata
    +130,00 €  Incassato 100,00 €   Quota annuale QA - Prima rata

150,00 piu 100,00 fa 250,00; 49,80 piu 30,00 fa 79,80; e la somma delle due
colonne fa 329,80. Il conto torna in tutte e tre le direzioni.

### Movimenti — lo scenario chiesto, creato da zero

Atleta `Cassa Rc3` (nato il 2012-03-12), rata unica `RC3 QA - rata unica` da
100,00 €. I totali sotto sono quelli **del club**, che parte da 250,00 €.

| Operazione | Registro della rata | Entrate del club | Previste |
|---|---|---|---|
| Rata creata, nessun incasso | `pending`, incassato 0,00 | 250,00 € | 79,80 € |
| **Incasso 40,00 €** | `partial`, incassato 40,00, residuo 60,00 | **290,00 €** (+40,00) | 139,80 € (+60,00) |
| **Incasso 60,00 €** | `paid`, incassato 100,00, residuo 0,00 | **350,00 €** (+100,00) | 79,80 € |
| **Storno del secondo incasso** | `partial`, incassato 40,00, residuo 60,00 | **290,00 €** | 139,80 € |

Ogni riga della colonna «Entrate» e esattamente il denaro che il registro
dichiara incassato, e lo storno la riporta indietro senza lasciare residui.
Quando la rata e stata saldata, la sua riga si e spostata nella scheda
«Movimenti» come `+100,00 €` **senza** la dicitura «Incassato», perche li le
due cifre coincidono.

### Date di nascita — la stessa API che usa l'applicazione

`POST /api/v1/athletes` con la sessione e il club attivi, cioe la richiesta che
la pagina Atleti manda premendo «Salva»:

| Inviato | Risposta |
|---|---|
| `2026-02-31` | **400** — «Atleta: data di nascita inesistente (2026-02-31)» |
| `2026-04-31` | **400** — «… inesistente (2026-04-31)» |
| `2025-02-29` | **400** — «… inesistente (2025-02-29)» |
| `31/02/2026` | **400** — «… inesistente (31/02/2026)» |
| `2099-05-01` | **400** — «Atleta: data di nascita nel futuro (2099-05-01)» |
| `1500-01-01` | **400** — «Atleta: data di nascita non plausibile (1500-01-01)» |
| `2012-03-12` | **200**, salvata `2012-03-12T00:00:00.000Z` |

Nessuna delle sei rifiutate ha lasciato un record. Prima di questo giro la
prima riga della tabella avrebbe risposto **200** creando un atleta nato il **3
marzo 2026**.

### Impostazioni del club — quattro sezioni insieme

Quattro `PATCH /api/v1/clubs/:id` con `settings_patch`, lanciate **in
parallelo** su quattro sezioni diverse — Contatti, Social, Generale, Dati
fiscali. Tutte e quattro `200`, e rileggendo il club:

| Chiave | Sezione | Valore riletto |
|---|---|---|
| `companyEmail` | Contatti | scritto |
| `website` | Social | scritto |
| `foundingYear` | Generale | scritto |
| `tax_regime` | Dati fiscali | scritto |

**Nessuna delle quattro ha cancellato le altre**, e cio che nessuna aveva
citato non si e mosso: `seasons` (2 stagioni), `activeSeasonId`, `onboarding`,
`types` sono intatti. E la prova che il doppio del client Prisma non poteva
dare: qui il `SELECT … FOR UPDATE` gira su Postgres vero.

Poi l'autosave dalla pagina: `/organization`, scheda Generale, «Anno di
Fondazione» portato a 2011 e messa a fuoco altrove. Il valore e persistito, e
`seasons`, `activeSeasonId`, `onboarding` e `companyEmail` sono ancora li —
cioe il percorso che il difetto lo produceva.

I valori toccati dalla prova sono stati **riportati a quelli di partenza** a
fine ritest.

### Regressione a runtime

| Superficie | Esito |
|---|---|
| `/movements` | 200, totali coerenti, nessun errore in console |
| `/athletes` | 200, 211 atleti attivi, raggruppamento per categoria |
| `/organization` | 200, autosave funzionante |
| `GET /api/v1/athletes`, `payments`, `payment-transactions`, `categories`, `trainers`, `seasons`, `entitlements`, `registry` | tutte 200 |
| **Isolamento multi-tenant** | `?organization_id=` di un club non posseduto → **403 «Accesso negato alla risorsa del club»** |

Gli unici errori in console sono le sei risposte 400 delle date impossibili e
il 403 dell'isolamento, cioe le prove stesse.

### Dati QA lasciati su staging

Non rimossi di proposito, e vanno dichiarati: l'atleta `Cassa Rc3`, la rata
`RC3 QA - rata unica` (100,00 €, `partially_paid`, 40,00 € incassati) e i suoi
tre movimenti — incasso 40, incasso 60, storno del secondo. Gli incassi non si
cancellano: uno storno e esso stesso un movimento, e toglierlo riscriverebbe
denaro registrato. Restano quindi 290,00 € di Entrate sul club di collaudo
invece dei 250,00 € di partenza, ed e voluto.

## Cosa resta registrato e non corretto

Tre cose, tutte in [16 — Debito tecnico](16-technical-debt.md):

1. **Il report Pagamenti** (`/reports`) dice ancora «Incassato» contando le
   rate saldate. E lo stesso difetto del punto 1 su un'altra pagina, e la
   correzione e una riga — `collectedAmount` invece di `amount` — ma porta
   dentro categorie e soglie di scaduto che nessuno ha ricollaudato.
2. **`patchClubSettings` e `createClubSeason`** riscrivono ancora `settings`
   per intero, perche hanno bisogno dell'oggetto per poter **cancellare** una
   chiave. La ragione per cui la stagione non si sposta e ancora quella gia
   scritta: il riporto passa da `resources.ts`, che usa il client globale.
3. I residui non bloccanti gia registrati dal Full Club UAT — doppie letture
   di Atleti e Dashboard, categorie QA — restano dove stanno, per scelta
   esplicita di questo giro.

## Verdetto

| Voce | Esito |
|------|-------|
| Movimenti | **PASS** — riprodotto, corretto, riprovato a runtime |
| Date di nascita via API | **PASS** — sei classi di data impossibile respinte con 400 di dominio |
| Concorrenza su `clubs.settings` | **CONFERMATO e corretto** — riprodotto da test, quattro sezioni concorrenti sopravvivono a runtime |
| Test | 2.010 / 2.010 |
| CI | 4 / 4 verdi su HEAD |
| Staging | READY |
| Runtime | **PASS** |
| Blocker aperti prima della produzione | **0** |

**PRE-PRODUCTION READY = SI.**

Con una precisazione che fa parte del verdetto: pronto **non vuol dire
completo**. Restano i tre punti registrati qui sopra, e resta la scelta di
prodotto che il Full Club UAT aveva lasciato aperta — se la scheda «Movimenti»
debba elencare anche le rate incassate solo in parte, che oggi vivono in
«Previsti». I totali ora dicono il vero in tutte e due le schede; dove vada
letta la riga e una decisione, non un difetto.
