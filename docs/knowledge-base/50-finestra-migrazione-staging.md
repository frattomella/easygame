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

**La quinta merita attenzione a se.** I due indici unici parziali di PP-05
falliscono se dopo la sua `UPDATE` forward-safe restasse piu di una challenge
viva per `(user_id, channel)`. La `UPDATE` e scritta per non lasciarne, ma e
l'unica delle cinque che puo far **fallire** `migrate deploy` per lo stato dei
dati, ed e la prima a girare.

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
SELECT count(*) AS audit FROM audit_events;
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

**Non si prosegue se** la query 4 restituisce anche una sola riga: la
migrazione 1 fallirebbe sull'indice unico. Va capito perche prima, non dopo.

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
SELECT count(*) FROM audit_events;
SELECT count(*) FROM organization_users;
```

**Le tre soglie:**

* **A** deve dare il numero di voci contate dal PRECHECK (atteso: **6**). Piu
  righe che voci significa che il travaso ha inventato; meno, che ha perso. Sono
  i due difetti che le migrazioni 4 e 5 esistono per chiudere, ed e qui che si
  verifica che li abbiano chiusi davvero;
* **B** e **C** devono dare **zero righe**. Non sono soglie di qualita: sono le
  invarianti del contratto (49 §B, §C);
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

### Passo 6 — UAT Fortitudo, a schermo

Il flusso end-to-end dei ruoli che PP-02 tocca, percorso **dal clic**:

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

* **Il ripristino non e mai stato provato.** Il piano esiste, la prova no. Un
  piano di rollback che non e stato eseguito almeno una volta e un'ipotesi
  (`D-INT-4`).
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
| Runbook | **scritto** |
| Snapshot | non creato |
| PRECHECK | non eseguito su staging con il ramo integrato |
| `migrate deploy` | **non eseguito** |
| POSTCHECK | non eseguito |
| Riconciliazione | non eseguita |
| Smoke test | non eseguito |
| UAT Fortitudo | non eseguita |
| Prova di ripristino | **mai eseguita** (`D-INT-4`) |

**Nessun passo di questa finestra puo essere eseguito senza un'autorizzazione
esplicita** (CLAUDE.md §9).
