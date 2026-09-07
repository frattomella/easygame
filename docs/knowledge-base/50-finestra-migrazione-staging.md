# 50 — La finestra di migrazione su staging/pilota

> **Nessun deploy e stato eseguito.** Questo documento e il piano, scritto
> prima e da eseguire con un'autorizzazione esplicita. Il ramo integrato non e
> mai stato spedito ne su staging ne in produzione.
>
> Ramo: `integration/final-production-readiness`.

---

## 1. Perche non e un deploy normale

Staging e **il pilota**: e il database di Fortitudo Scauri, con dati veri di
persone vere. Il primo deploy che porta PP-02 esegue `prisma migrate deploy`, e
quelle migrazioni **creano una tabella e vi travasano dentro l'autorita** su
chi puo aprire il fascicolo di un minore.

Fino a oggi niente di PP-02 e stato provato su dati veri: `athlete_guardians`
**non esiste** su staging, e il pilota gira ancora sul percorso pre-PP-02
(`D-PP02-E`). Il travaso girera su **520 schede in una volta sola**.

Un deploy normale sostituisce del codice. Questo sposta un'autorita.

---

## 2. Che cosa applica, esattamente

**Cinque** migrazioni, non quattro. La quinta e di PP-05 e va nominata, perche
il piano scritto prima dell'integrazione ne contava quattro:

| # | Migrazione | Lane | Cosa fa |
|---|-----------|------|---------|
| 1 | `20260904120000_pp05_una_challenge_viva_per_canale` | PP-05 | Chiude le challenge OTP vive in eccesso (tenendo la piu recente per gruppo) e crea **due indici unici parziali** su `auth_verification_challenges` |
| 2 | `20260905120000_pp02_tutore_e_una_riga` | PP-02 | Crea `athlete_guardians`, aggiunge `athletes.anonymized_at`, e travasa `athletes.data.guardians[]` in righe |
| 3 | `20260906090000_pp02_il_tutore_ha_un_solo_scrittore` | PP-02 | Il vaglio d'archivio: rifiuta ogni `INSERT`/`UPDATE`/`DELETE` fuori da una transazione che dichiari `SET LOCAL "easygame.guardian_writer"` |
| 4 | `20260906100000_pp02_il_travaso_perdeva_e_inventava` | PP-02 | Correzione del travaso: quattro identita perse e quattro inventate |
| 5 | `20260906180000_pp02_il_travaso_fondeva_due_persone` | PP-02 | Porta i due registri di scheda dentro le righe, e non fonde piu madre e padre che condividono un indirizzo |

PP-03 e PP-04 non portano migrazioni.

**Quale delle cinque puo fallire davvero, e non e la prima.** Questo documento
diceva che la 1 e «l'unica delle cinque che puo far fallire `migrate deploy`
per lo stato dei dati». E il contrario, ed e stato verificato leggendo il
sorgente delle cinque e poi eseguendole (§9): la `UPDATE` forward-safe della 1
si bonifica **da sola** prima di vincolare, con un tie-break sull'identificativo
che toglie il non-determinismo, quindi e la meglio protetta. Il suo unico verso
di fallimento e il **traffico concorrente** — una challenge nata durante la
finestra.

Il rischio sta sulle **2, 4 e 5**, su tre fronti che questo documento non
nominava:

* `(g ->> 'contactOnly')::boolean` **senza guardia**, in tutte e tre. E l'unico
  cast del travaso a cui non sta davanti una regex: una stringa vuota o una
  parola non booleana aborta `migrate deploy` a meta;
* i dieci cast a `timestamptz`, protetti da una regex che accetta `9999-99-99`;
* la **chiave di ripiego della quinta**, che e l'unica il cui `INSERT` non e
  protetto da un `GROUP BY` sulla chiave dell'indice unico.

Il preflight di §9 le misura tutte e tre, e la prima e stata verificata per
mutazione: avvelenato un `contactOnly`, il controllo diventa rosso **e** la
migrazione fallisce davvero.

---

## 3. Cio che si sa gia dei dati (misurato, in sola lettura)

Da `pp-02-diagnosi-travaso.mjs`, eseguito sul `neondb` di staging con la sola
lettura imposta dal server:

```
club                                        6   (Fortitudo Scauri: 307 atleti)
atleti                                    520
voci di tutore in tutto il blob             6
con `revokedGuardianIdentities` array       0
con `contactOnlyIdentities` array           0
indirizzi condivisi sulla stessa scheda     0
righe che la §3 marcherebbe                 0   (exposure R4 = 0)
```

**Sei voci di tutore su 520 schede.** Da qui due conseguenze, e la seconda
conta piu della prima:

1. il travaso e **piccolo**: sei righe attese, e l'equivalenza e verificabile a
   mano, riga per riga;
2. l'exposure zero di R4 **non e una proprieta del codice**: e una proprieta di
   un archivio in cui l'anagrafica dei tutori non e mai stata compilata. Non
   sopravvivera al primo club che la compili davvero. La si registra come
   misura di **oggi**, non come garanzia.

---

## 4. La finestra

L'ordine non e negoziabile, e ogni passo ha un esito che decide se si prosegue.

### Passo 0 — Snapshot

```bash
# Neon: snapshot del branch di staging, PRIMA di qualunque altra cosa.
# Va creato e verificato esistente: uno snapshot che non si e visto non esiste.
```

Lo snapshot e **il piano di rollback**. Non ci sono migrazioni `down`: il
rimedio a un travaso sbagliato e il ripristino, non una migrazione di rimedio
(§7).

### Passo 1 — PRECHECK (sola lettura)

Si esegue **prima** e si conserva l'esito: e il termine di paragone di tutto
cio che viene dopo. Nessuna di queste query scrive.

```sql
-- 1. il perimetro
SELECT count(*) AS club FROM clubs;
SELECT organization_id, count(*) AS atleti FROM athletes GROUP BY 1 ORDER BY 2 DESC;

-- 2. il blob dei tutori: quante voci, e di che forma
SELECT count(*) AS schede_con_tutori
FROM athletes
WHERE jsonb_typeof(data -> 'guardians') = 'array'
  AND jsonb_array_length(data -> 'guardians') > 0;

SELECT sum(jsonb_array_length(data -> 'guardians')) AS voci_totali
FROM athletes
WHERE jsonb_typeof(data -> 'guardians') = 'array';

-- 3. i due registri di scheda (la §3 si accende solo su questi)
SELECT count(*) FROM athletes WHERE data ? 'revokedGuardianIdentities';
SELECT count(*) FROM athletes WHERE data ? 'contactOnlyIdentities';

-- 4. le challenge vive per canale: e cio che puo far fallire la migrazione 1
SELECT user_id, channel, purpose <> 'reset_password' AS otp, count(*)
FROM auth_verification_challenges
WHERE consumed_at IS NULL
GROUP BY 1, 2, 3
HAVING count(*) > 1;

-- 5. tessere, account, profili
SELECT role, count(*) FROM organization_users GROUP BY 1 ORDER BY 2 DESC;
SELECT count(*) AS atleti_con_account FROM athletes WHERE user_id IS NOT NULL;
SELECT count(*) AS utenti FROM users;

-- 6. cio che non deve muoversi
SELECT count(*) AS documenti FROM document_requests;
SELECT count(*) AS incassi, coalesce(sum(amount), 0) AS totale FROM payment_transactions;
SELECT count(*) AS eventi FROM club_events;
SELECT count(*) AS partecipazioni FROM club_event_participants;
SELECT count(*) AS audit FROM audit_logs;
```

E la diagnosi completa, che sa gia leggere tutto questo e lo ripartisce per
club:

```bash
EASYGAME_DB_ENV=development node --experimental-strip-types \
  --import ./tests/helpers/register-hooks.mjs scripts/pp-02-diagnosi-travaso.mjs
```

> La sonda dichiara **su quale database** ha girato e **come** la sola lettura e
> garantita: tenta `transaction_read_only = on` sull'endpoint diretto e, se il
> pooler lo rifiuta, ripiega **dicendolo**. Un ripiego in silenzio su una
> garanzia piu debole e la forma di difetto che PP-02 ha passato quindici
> tornate a togliere.

**La query 4 non e un cancello**, e questo documento diceva il contrario. I
duplicati non fanno fallire la migrazione 1: e la sua `UPDATE` a bonificarli, e
li ha misurati la prova generale (§9) — quattordici gruppi prima, zero dopo. La
si legge per sapere **quanto lavoro** fara la bonifica.

Il cancello e un altro, e la query 4 non lo misura: una challenge **nata
durante la finestra** puo comparire fra la bonifica e l'indice. Percio:

```sql
SELECT count(*) FROM auth_verification_challenges
WHERE consumed_at IS NULL AND created_at > now() - interval '15 minutes';
```

**Non si prosegue se > 0**: c'e traffico OTP vivo, e la finestra va aperta
quando non ce n'e.

Tutti i controlli di questo passo, piu i cinque che il documento non aveva, li
esegue `scripts/migrazione-finestra-check.mjs --pre` (§9). Una query che si
copia e si incolla e una query che si sbaglia — due di quelle qui sopra
interrogavano una tabella che non esiste, e nessuno se n'era accorto perche
nessuno le aveva eseguite.

### Passo 2 — `prisma migrate deploy`

```bash
npx prisma migrate status   # deve elencare esattamente le cinque, e nessun'altra
npx prisma migrate deploy
```

Il deploy Vercel lo esegue da se (`vercel-build`). Se lo si esegue a mano,
**prima** del deploy dell'applicazione: un'applicazione nuova su uno schema
vecchio e la finestra in cui il prodotto legge una tabella che non c'e.

### Passo 3 — POSTCHECK

```sql
-- A. il travaso ha prodotto righe, e quante
SELECT count(*) AS righe FROM athlete_guardians;
SELECT count(*) FILTER (WHERE user_id IS NOT NULL) AS con_utenza,
       count(*) FILTER (WHERE contact_only)        AS solo_recapito,
       count(*) FILTER (WHERE revoked_at IS NOT NULL) AS revocate
FROM athlete_guardians;

-- B. la chiave e unica, e la posizione non si ripete sulla stessa scheda
SELECT athlete_id, identity_key, count(*) FROM athlete_guardians
GROUP BY 1, 2 HAVING count(*) > 1;

-- C. nessuna riga esclusa conserva l'utenza (49 §C)
SELECT count(*) FROM athlete_guardians
WHERE user_id IS NOT NULL AND (contact_only OR revoked_at IS NOT NULL);

-- D. cio che non doveva muoversi non si e mosso: si confrontano con il PRECHECK
SELECT count(*) FROM document_requests;
SELECT count(*), coalesce(sum(amount), 0) FROM payment_transactions;
SELECT count(*) FROM club_events;
SELECT count(*) FROM club_event_participants;
SELECT count(*) FROM audit_logs;
SELECT count(*) FROM organization_users;
```

**Le tre soglie:**

* **A** deve dare il numero di voci contate dal PRECHECK (atteso: **6**). Piu
  righe che voci significa che il travaso ha inventato; meno, che ha perso. Sono
  i due difetti che le migrazioni 4 e 5 esistono per chiudere, ed e qui che si
  verifica che li abbiano chiusi davvero;
* **B** deve dare **zero righe**: e l invariante del contratto (49 §B). **C non
  e una soglia**: la coppia «esclusa che conserva l utenza» la produce il
  travaso stesso — 49 §C la dichiara attesa e risolve l invariante nel
  **predicato di lettura**, non nei dati — e pretendere zero avrebbe fatto
  ripristinare uno snapshot per un esito normale. Si legge, non si sbarra;
* **D** deve dare **esattamente** i numeri del PRECHECK. Denaro, documenti,
  eventi e audit non sono nel perimetro di queste migrazioni: se un numero si
  muove, si e mosso qualcosa che nessuno aveva chiesto.

### Passo 4 — Riconciliazione: l'equivalenza, non il conteggio

Il conteggio dice che nessuna riga e sparita. **Non e la proprieta che conta.**

La proprieta che conta e un'equivalenza fra due predicati: chi apriva il
fascicolo di un minore leggendo il blob deve aprirlo anche leggendo la tabella,
e — nell'altro verso, che e quello che nessuno guarda — **chi il blob teneva
fuori deve restare fuori**.

```bash
node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
  scripts/pp-02-travaso-equivalente.mjs
```

Un travaso puo conservare tutte le righe e sbagliare comunque in due modi
opposti: perdere un'identita (la riga arriva, ma la chiave con cui quella
persona apriva non c'e piu) o inventarne una. Il conteggio non vede nessuno dei
due.

### Passo 5 — Smoke test

```bash
node scripts/staging-smoke.mjs --base=https://<staging>.vercel.app
```

Verifica le tre superfici che CLAUDE.md §9 elenca (`/`, `/login`,
`/api/v1/registry`) e che le **quattro porte periodiche** rispondano `401`
senza `Bearer`. E la verifica che conta di piu su un ambiente vero: una di
quelle porte cancella righe, un'altra manda email a tutte le famiglie.

### Passo 6 — UAT Fortitudo

Le cinque frasi qui sotto erano una lista da percorrere **a mano** dopo una
migrazione, cioe nel momento in cui si ha meno tempo e piu fretta. Adesso
girano:

```bash
EASYGAME_DB_ENV=development node --experimental-strip-types   --import ./tests/helpers/register-hooks.mjs scripts/migrazione-smoke-dominio.mjs
```

Costruisce due famiglie con un minore per parte e un atleta con accesso
proprio, interroga le **rotte vere**, e cancella tutto. Se il travaso ha
spostato l'autorita nel modo sbagliato — fondendo due identita, o perdendone
una — e qui che si vede, e non nei conteggi. Otto prove, che sono le cinque
frasi piu i loro controspecchi.

A schermo resta cio che una sonda non puo guardare: che le stesse cinque cose
si vedano **con gli occhi di chi le usa**, sul club vero, dopo il deploy.

1. un genitore apre l'area famiglia e vede i propri figli, e **solo** quelli;
2. lo stesso genitore non vede la scheda di un minore di un'altra famiglia;
3. un atleta con accesso proprio apre la propria area, e **non** il cruscotto
   della famiglia;
4. «Scollega account» su un tutore chiude l'accesso, e la scheda lo dice;
5. un invito a un tutore si riscatta e il legame compare **subito**.

---

## 5. Quando fermarsi e ripristinare

Si ripristina lo snapshot, senza discutere, se:

* il POSTCHECK **A** non torna (righe inventate o perse);
* il POSTCHECK **B** o **C** restituisce anche una riga sola;
* un qualunque numero del POSTCHECK **D** e diverso dal PRECHECK;
* `pp-02-travaso-equivalente.mjs` trova anche una sola identita che ha cambiato
  lato;
* `migrate deploy` fallisce a meta: le cinque non sono in una transazione sola,
  quindi un fallimento sulla terza lascia lo schema **fra due stati**.

Non si «corregge in avanti» un travaso sbagliato con una `UPDATE` a mano: la
tabella e sotto il vaglio d'archivio della migrazione 3, e ogni scrittura fuori
dal modulo proprietario viene rifiutata — che e esattamente cio che deve
succedere, e che rende il ripristino l'unica strada.

---

## 6. Cosa questa finestra **non** copre

* ~~**Il ripristino non e mai stato provato.**~~ **Provato il 2026-09-08**, su
  un clone locale con la forma misurata su staging: snapshot, cinque
  migrazioni, postcheck 22/22, ripristino, e ogni numero tornato identico —
  incluse le challenge che una migrazione aveva bonificato. Vedi §9. Cio che
  resta non provato e il comportamento di uno **snapshot Neon**, che e
  un'operazione di ramo e non un `pg_restore`: i tempi di §9 sono un ordine di
  grandezza del lavoro, non il numero di Neon.
* **Produzione.** Nello scope Vercel corrente non esiste un progetto di
  produzione. Se ne comparisse uno: fermarsi e chiedere (CLAUDE.md §9).
* **La bonifica di R4.** Exposure zero misurata oggi: nessuna riga su cui il
  difetto possa manifestarsi, quindi nessuna bonifica. Va rimisurata il giorno
  in cui un club compili davvero l'anagrafica dei tutori.

---

## 7. Rollback

**Non esistono migrazioni `down`.** Il rimedio e il ripristino dello snapshot
del Passo 0.

Le due conseguenze da avere chiare prima di cominciare, non dopo:

1. **si perde tutto cio che e stato scritto dentro la finestra.** La finestra va
   quindi tenuta corta, e va aperta quando il pilota non sta lavorando;
2. **il ripristino riporta anche lo schema**, cioe `athlete_guardians`
   sparisce. L'applicazione distribuita, che quella tabella la legge, va
   riportata alla versione precedente **insieme** al database: ripristinare il
   database e lasciare su il codice nuovo e la stessa finestra di prima, al
   contrario.

Percio l'ordine del rollback e: **prima** il ripristino del deploy precedente
su Vercel, **poi** il ripristino dello snapshot.

---

## 8. Stato

| | |
|---|---|
| Runbook | **scritto**, e corretto in sette punti dalla prova generale (§9) |
| Prova generale su clone | **eseguita** il 2026-09-08: snapshot, cinque migrazioni, postcheck 22/22, ripristino verificato |
| Snapshot di staging | non creato |
| PRECHECK su staging | non eseguito |
| `migrate deploy` su staging | **non eseguito** |
| POSTCHECK su staging | non eseguito |
| Riconciliazione | non eseguita su staging |
| Smoke test HTTP | non eseguito su staging |
| Smoke di dominio | **eseguito su clone**, 8/8 (`scripts/migrazione-smoke-dominio.mjs`) |
| UAT Fortitudo a schermo | non eseguita |
| Prova di ripristino | **eseguita su clone** (`D-INT-4` chiuso per la meccanica; resta non provato lo snapshot Neon) |

**Nessun passo di questa finestra puo essere eseguito senza un'autorizzazione
esplicita** (CLAUDE.md §9).

---

## 9. La prova generale, e le sette correzioni che ha prodotto (2026-09-08)

> **La prova e stata eseguita.** §6 diceva «il ripristino non e mai stato
> provato: un piano di rollback che non e stato eseguito almeno una volta e
> un'ipotesi». Adesso lo e stato, su un clone locale con la **forma misurata
> su staging** — 6 club, 520 atleti, 6 voci di tutore nel blob — costruito
> applicando le 54 migrazioni precedenti alla finestra.
>
> Nessuna scrittura su staging. Nessun deploy.

### Il giro, e i tempi

| Passo | Esito | Tempo |
|-------|-------|-------|
| Costruzione del clone pre-finestra (54 migrazioni) | 54/54 | 15 s |
| PRECHECK + preflight | 5/6 (l'unico rosso e la sonda che fa il suo lavoro, sotto) | < 1 s |
| Snapshot (`pg_dump -Fc`) | 415 KB | **0,5 s** |
| Le cinque migrazioni, in ordine | 5/5 | **1,5 s** (290+277+290+313+301 ms) |
| POSTCHECK con confronto | **22/22** | < 1 s |
| **Ripristino dallo snapshot** | schema e dati tornati identici | **1,9 s** |

**Sui tempi, e su cosa non dicono.** Sono di `pg_dump`/`pg_restore` su un
Postgres locale: valgono come **ordine di grandezza del lavoro**, non come il
numero di Neon. Uno snapshot Neon e un'operazione di ramo e si comporta in modo
diverso — di solito piu veloce, perche non ricopia le righe. Il numero che
conta per la finestra e un altro, ed e questo: **il travaso e piccolo** (sei
righe da 520 schede), quindi ne la migrazione ne il ripristino sono
un'operazione lunga. La finestra e corta perche i dati lo sono.

### Il ripristino ha davvero riportato indietro tutto

Dopo `pg_restore` sul database migrato:

* `athlete_guardians` — **assente**;
* `athletes.anonymized_at` — **assente**;
* ogni numero del PRECHECK identico, **incluse le 14 challenge duplicate** che
  la migrazione 1 aveva bonificato. Cioe: e tornato indietro anche cio che una
  migrazione aveva *corretto*, che e la prova che il ripristino non e selettivo.

**Il rollback e atomico: snapshot piu commit.** Il codice di questa passata
legge `athlete_guardians`; sullo schema ripristinato quella tabella non c'e.
Ripristinare il database senza riportare indietro il deploy lascerebbe
l'applicazione a leggere una tabella che non esiste — che e la stessa finestra
di §2, al contrario.

> **Prima di aprire la finestra, si registra il commit attualmente
> distribuito.** Non lo si deduce: lo si legge dal deployment (`vercel inspect`,
> o la SHA sulla dashboard) e lo si scrive accanto all'identificativo dello
> snapshot. Il candidato calcolato dal repository e `97d26e2` — l'ultimo commit
> prima che entrasse la prima delle cinque migrazioni — e **non nomina
> `athlete_guardians` in nessun punto di `src/`**, quindi gira sullo schema
> ripristinato. Ma «l'ultimo prima delle migrazioni» e un calcolo; «cio che e
> distribuito adesso» e un fatto, e i due possono non coincidere.

### Le sette correzioni

**1. `audit_events` non esiste.** Il PRECHECK §1 e il POSTCHECK §3 la
interrogavano: la tabella e `audit_logs` (`AuditLog`, `prisma/schema.prisma`).
Erano l'**ultima riga di entrambi**, cioe l'unico controllo sull'audit da tutte
e due le parti, e un `psql` avrebbe risposto `relation "audit_events" does not
exist` proprio mentre §5 chiede di confrontare due numeri.

**2. La migrazione a rischio non e la 1.** Il documento diceva che la prima e
«l'unica delle cinque che puo far fallire `migrate deploy` per lo stato dei
dati». E il contrario: la sua `UPDATE` forward-safe si bonifica da sola prima
di vincolare, ed e la meglio protetta. Il rischio sta sulle **2, 4 e 5**, e su
tre fronti che il documento non nominava — il cast booleano, i cast temporali e
la chiave di ripiego della quinta.

**3. Il POSTCHECK C imponeva un ripristino non dovuto.** Pretendeva **zero**
righe escluse che conservano l'utenza. Ma
[49](49-pp-02-invarianti-tutori.md) dichiara quella coppia **prodotta dal
travaso stesso** — che marca per identita senza azzerare l'utenza — e risolve
l'invariante §C nel **predicato di lettura**, non nei dati. La soglia e
diventata una misura da leggere, non un cancello.

**4. Il POSTCHECK B non controllava cio che dichiarava.** Il commento diceva «e
la posizione non si ripete sulla stessa scheda»; la query raggruppava solo su
`(athlete_id, identity_key)`. La posizione non era controllata da nessuna
parte, proprio mentre [49](49-pp-02-invarianti-tutori.md) la dichiara una
chiave e la migrazione 5 puo duplicarla.

**5. Il PRECHECK non misurava due cose che la soglia A presuppone.** «Righe
attese: 6» vale solo se nessuna scheda usa la coppia storica `parent1`/`parent2`
e nessuna voce dichiara due identificativi. Nessuna delle due era misurata.

**6. `SET LOCAL` fuori da una transazione e un avviso, non un errore.** Le
migrazioni 4 e 5 dichiarano `SET LOCAL "easygame.guardian_writer" = 'on'` per
farsi accettare dal vaglio della 3. `prisma migrate deploy` avvolge ogni file
in una transazione, quindi il percorso nominale regge — ma il Passo 2 ammette
l'esecuzione a mano, e `psql -f` gira in autocommit: la GUC resta spenta, il
vaglio rifiuta la `DELETE`, e l'errore parla di permessi invece che di
transazioni. **Se le si esegue a mano, vanno avvolte in `BEGIN; … COMMIT;`
espliciti.** La prova generale lo ha fatto, ed e anche la ragione per cui il
fallimento simulato (sotto) non ha lasciato niente a meta.

**7. Fra la 3 e la 5 c'e uno stato in cui una funzione di prodotto e rotta.**
La 3 introduce il vaglio senza la deroga per `ON DELETE SET NULL`; la deroga
arriva con la 5. Se `migrate deploy` si ferma sulla 4, cancellare un utente che
sia tutore fallisce. Non e una migrazione a meta: e **il prodotto** a meta.

### Il preflight non e teorico: predice un fallimento vero

`scripts/migrazione-finestra-check.mjs` esegue i controlli invece di
consegnarli da copiare. Verificato per mutazione sul clone: messo un
`"contactOnly": "vero"` su una voce del blob,

* `F2` diventa rosso — «voci non convertibili: 1»;
* la migrazione 2, eseguita davvero, **fallisce**: `invalid input syntax for
  type boolean: "vero"`;
* e con il `BEGIN; … COMMIT;` intorno, lo schema resta **intatto**:
  `athlete_guardians` non nasce.

Tolto il dato avvelenato, le cinque passano e il POSTCHECK torna 22/22. E la
differenza fra una query scritta in un documento e un controllo che qualcuno
ha visto fallire.

### Come si usa

```bash
# prima — misura, salva il termine di paragone, e dice se procedere
node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
  scripts/migrazione-finestra-check.mjs --pre --out=.migrazione-pre.json

# dopo — rimisura e confronta, numero per numero
node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
  scripts/migrazione-finestra-check.mjs --post --in=.migrazione-pre.json
```

**Non scrive niente**, e lo dichiara: tenta
`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` e, se il pooler lo
rifiuta, **lo dice** invece di ripiegare in silenzio su una garanzia piu
debole. E l'unico script del repository che non pretende
`EASYGAME_DB_ENV=development`, ed e deliberato: serve a girare su staging, e
per questo dichiara la sola lettura invece di fidarsi di un'etichetta.

Il postcheck copre i domini che la finestra non deve toccare, uno per uno:
club, utenti, tessere, atleti, atleti con account, documenti, rate e importo
dovuto, incassi e totale, eventi e annullati, partecipazioni, presenze,
convocazioni, audit.

### La guardia che protegge la finestra si e rivelata cieca

Preparare questa prova ha richiesto cio che la finestra richiedera davvero: una
connection string non locale in `DATABASE_URL`. Ed e li che si e visto il
difetto.

`scripts/db-guard.mjs` autorizzava guardando **solo** `EASYGAME_DB_ENV`.
`describeTarget()` sapeva gia estrarre l'host — e lo stampava — ma quel valore
non entrava in nessuna decisione: veniva passato all'operatore perche lo
guardasse lui. Tre mosse ordinarie:

1. serve leggere un dato su staging, e la stringa Neon finisce in `DATABASE_URL`;
2. `EASYGAME_DB_ENV` resta `"development"`, perche per **leggere** nessuno
   chiede di cambiarla;
3. il giorno dopo, `npm run db:push` per allineare uno schema locale. La
   guardia legge `development`, **stampa l'host di Neon nella riga di
   conferma**, ed esce zero.

Adesso l'etichetta e l'host devono dire la stessa cosa: `development` vale solo
se il database e locale, e ogni altro host passa solo dall'override esplicito.

Nello stesso giro sono state chiuse altre due porte trovate cercando questa:
diciassette sonde che scrivevano su Postgres **senza nessun vaglio** — bastava
lanciarle copiando la riga dalla loro docstring — e
`migrate-document-templates.mjs`, l'unico script del repository che ammetteva
`EASYGAME_DB_ENV=staging` come autorizzazione a scrivere.

---

## 10. I cinque Medium, classificati per la finestra (2026-09-08)

La domanda non e «e un difetto?» — lo sono tutti e cinque — ma **questa
finestra li rende piu probabili, o li peggiora?** E, se accadessero durante il
pilota, che cosa vedrebbe Fortitudo.

| # | Classificazione | Perche, in termini di pilota |
|---|-----------------|------------------------------|
| **D-AUD-21** — due generatori, due nomi per la stessa fascia | **SAFE TO DEFER** | Fuori dal perimetro delle cinque: nessuna tocca `club_events`. Perche accada serve una sequenza precisa — il cron genera una fascia, qualcuno la **annulla**, e poi qualcuno rigenera dal programma settimanale — e produce un allenamento **attivo** accanto a quello annullato. Cio che Fortitudo vedrebbe: due righe nello stesso slot in calendario, e un denominatore di presenze gonfiato per quella squadra. Nessun dato perso, nessun accesso aperto, e la correzione e visibile a occhio nudo (due righe uguali) invece che silenziosa. **Condizione**: se durante il pilota si annulla una fascia generata, non rigenerare il programma settimanale finche `D-AUD-21` non e chiusa |
| **D-AUD-24** — la durata che scavalca la mezzanotte | **SAFE TO DEFER** | Fuori perimetro. Richiede un allenamento che finisca **dopo** la mezzanotte (22:00 → 00:30): `getTrainingDurationHours` sottrae minuti d'orologio, ottiene un numero negativo e restituisce `null`. Su una societa di calcio giovanile non esiste: gli allenamenti finiscono entro le 22. Se esistesse, l'effetto sarebbe **zero ore** in un rendiconto verso un ente — grave, ma su un caso che il pilota non produce. **Condizione**: se Fortitudo inserisce una sessione che scavalca la mezzanotte, `D-AUD-24` diventa bloccante per il **rendiconto**, non per la migrazione |
| **Il rollover blocca le schede dopo le righe figlie** | **SAFE TO DEFER** | Fuori perimetro: `athlete_category_memberships` non e toccata dalle cinque. E una violazione **dichiarata** dell'ordine di `athlete-lock-order.ts` — le righe figlie prima delle schede — ma il ciclo completo non si chiude oggi, perche gli altri due percorsi che toccano le membership scrivono in autocommit. Resta la corsa rollover-contro-rollover, che richiede **due passaggi di stagione simultanei sullo stesso club**: un gesto che una segreteria fa una volta l'anno, da una postazione sola. Cio che Fortitudo vedrebbe nel caso peggiore: «passaggio di stagione non riuscito», da ritentare |
| **La cancellazione dell'interessato non e una transazione** | **SAFE TO DEFER, con una condizione operativa** | E l'unico dei cinque che **la finestra peggiora**, e va detto invece di lasciarlo dedurre: `data-subject.ts` cancella una decina di tabelle figlie in autocommit, e dopo la migrazione ne ha **una in piu** — `eraseGuardiansForAthlete` su `athlete_guardians`. Un errore a meta lascia l'interessato parzialmente cancellato: righe figlie sparite, nome e indirizzo ancora sulla scheda, `anonymized_at` non scritto. Su una richiesta GDPR, «cancellato a meta» e indistinguibile da «non cancellato» per chi non va a guardare. **Condizione, e non e negoziabile**: nessuna cancellazione di interessato durante la finestra, e dopo ogni cancellazione si verifica `anonymized_at` sulla scheda prima di rispondere alla persona. Non blocca la migrazione perche richiede **due** cose insieme — una richiesta di cancellazione e un errore a meta — e la prima e un evento raro e programmabile |
| **W4-R14** — 500 invece di 403, e l'interno di Prisma nel corpo | **SAFE TO DEFER** | Fuori perimetro. Restano due rotte (`athletes/[id]/documents/[documentId]/file`, `forms/assets/[assetId]`): un identificativo malformato fa uscire nome del modello, invocazione e codice PostgreSQL verso **chi ha gia una tessera nel club**. La porta si chiude comunque — non e un bypass — e cio che esce e struttura, non dati di persone. Il terzo caso della stessa classe, quello sugli eventi, e stato chiuso nell'audit precedente. Cio che Fortitudo vedrebbe: un errore illeggibile invece di «Accesso negato», e un monitoraggio che conta un guasto del server dove c'era un rifiuto |

**Nessuno dei cinque e BLOCKER STAGING.** Tre sono fuori dal perimetro delle
migrazioni e non diventano piu probabili; uno (D-AUD-24) richiede un dato che
il pilota non produce; uno (GDPR) e peggiorato dalla finestra e si governa con
una condizione operativa invece che con codice.

**Cio che li accomuna, e vale piu della classificazione**: nessuno dei cinque
puo essere innescato **dalla migrazione stessa**. La finestra e un travaso di
sei righe e un vaglio d'archivio; questi cinque vivono su eventi, stagioni,
cancellazioni e messaggi d'errore. Se qualcosa andra storto durante la
finestra, non sara nessuno di loro — e questa e la ragione per cui differirli
non sposta il rischio della finestra, ma solo quello delle settimane dopo.
