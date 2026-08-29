# 14 — Sicurezza

Stato al 2026-08-22. Questo documento elenca cosa **e** protetto, cosa **non
lo e**, e i rischi operativi da conoscere prima di toccare il codice.

## Cosa e gia solido

| Area | Implementazione |
|------|-----------------|
| Password | bcrypt cost 10, minimo 12 caratteri, blacklist password comuni |
| Enumerazione account | Login su email inesistente esegue comunque un `bcrypt.compare` fittizio e restituisce lo stesso messaggio |
| Sessioni | Token opachi random su DB, revocabili, scadenza 14 giorni, riletti a ogni richiesta |
| Cookie | `httpOnly`, `sameSite=lax`, `secure` in produzione, `path=/` |
| Rate limiting | Persistente su DB (funziona con piu istanze serverless), 8 policy — 6 di autenticazione piu 2 dei moduli pubblici — chiavi hashate SHA-256 con segreto |
| OTP | Codici salvati come hash, scadenza, massimo 5 tentativi, consumo one-shot |
| Isolamento tenant | Server-side: `x-active-club-id` validato contro `allowedOrganizationIds`; `listResource` impone `organization_id` |
| Autorizzazione risorse | `assertClubResourceAccess` su ogni chiamata al CRUD generico; parent e athlete esclusi dalle API di club |
| Segreti SMTP | AES-GCM autenticato; la password non e mai restituita dalle API (test dedicato) |
| Segreti IMAP | Stessa cifratura, **contesto crittografico separato** (`purpose: "imap"`): una credenziale non e decifrabile come l'altra. Password mai restituita |
| Trasporto IMAP | Sempre cifrato: SSL implicito, oppure STARTTLS con chiusura della sessione se l'upgrade fallisce. Mai `LOGIN` in chiaro |
| Iniezione di comandi IMAP | Username e password con CR o LF vengono rifiutati prima di toccare il socket; il resto e quotato secondo RFC 3501 |
| Errori provider | Normalizzati in codici (`SMTP_*`, `IMAP_*`), nessun leak di dettagli del server di posta |
| Segreti nel repository | **Nessuno**: scansione dei file tracciati negativa; `.env` e `.env.local` non sono mai stati committati |
| Modifica di un pagamento atleta | Sessione + appartenenza al club + **ruolo** (`owner` o `club_manager`) + regole di dominio (un pagamento pagato non si modifica) + audit con l'id di chi agisce. Dal Blocco 7 al posto del PIN di club, che non controllava nessuna di queste cose |
| Validazione anagrafica | `assertAnagraficaIsValid` su ogni creazione e aggiornamento: club, atleti e — dal Blocco 7 — allenatori, staff e soci. Stesso modulo puro del client, quindi non possono divergere. Un dato gia in archivio non ri-valida: introdurre una regola non deve rendere immodificabile una scheda che la violava |
| Moduli pubblici | Unico endpoint senza sessione che scrive: `/api/public/forms/:slug`. Slug con dodici caratteri esadecimali casuali (`randomBytes`), un solo esito negativo (404) per slug inesistente / bozza / link disabilitato / modulo chiuso, due contatori di rate limit distinti (60 aperture per IP ogni 15 min, 10 invii per IP all'ora) |
| Payload dei moduli | Limiti dichiarati in `FORM_LIMITS`: 120 campi, 8.000 caratteri per risposta, 10 allegati per invio, 256 kB di corpo JSON. Le risposte a campi che il modulo non contiene vengono scartate, non salvate |
| Allegati dei moduli pubblici | Whitelist piu stretta di quella autenticata: PDF, JPEG, PNG, WEBP, HEIC, fino a 8 MB. Un file per un campo che nel modulo non e un allegato non viene salvato — altrimenti il modulo pubblico sarebbe un servizio di hosting |
| Mapping dei moduli | Un campo porta una **chiave** di un catalogo chiuso server-side, mai un percorso. Una chiave inventata viene scartata in normalizzazione; i dati della societa sono di sola lettura. Un modulo pubblico non riceve mai una precompilazione |
| Scritture da una compilazione | Nessuna, finche non c'e un'approvazione autenticata; l'approvazione passa da `resources.ts` e finisce nell'audit log (`form.submission.approved` / `.rejected`) |
| TypeScript | `strict: true`, e `ignoreBuildErrors` **non** e attivo in `next.config.js` |

## Incidenti risolti

### I-01 — Credenziali demo pubblicate e funzionanti su staging (2026-08-22) — RISOLTO

**Cosa era esposto.** Il repository GitHub e **pubblico**. Il README elencava
`demo@easygame.it`, `trainer@easygame.it`, `athlete@easygame.it`,
`parent@easygame.it` con password `password123`. Gli stessi account
**esistevano davvero** sul database di staging, con email verificata e sessioni
attive, e lo staging e raggiungibile da internet. Verificato con un confronto
bcrypt in sola lettura: **la password pubblicata era valida su tutti e quattro**.
L'account `demo@easygame.it` ha ruolo `club_creator`, quindi dava accesso in
scrittura ai dati reali del club.

**Rimedio applicato.**

- Password ruotate su tutti e quattro gli account con valori casuali da 28
  caratteri, hash **bcrypt cost 12**.
- Revocate **37 sessioni** attive (24 + 5 + 4 + 4).
- Verificato che la vecchia password non funziona piu, sia con confronto bcrypt
  sia con una `POST /api/v1/auth/login` reale su staging → **401**.
- Credenziali nuove salvate solo in `.staging-credentials.local`, gitignored.
- Credenziali rimosse da `README.md` e da [06 — Modello dati](06-data-model.md).
- `prisma/seed.js` non ha piu una password predefinita: richiede
  `SEED_DEMO_PASSWORD` (minimo 16 caratteri) e usa bcrypt cost 12.

**Da fare comunque.** Non c'e modo di sapere se qualcuno ha usato quelle
credenziali prima della rotazione: i dati di staging vanno considerati
potenzialmente visti da terzi. Non e possibile verificarlo perche **non esiste
audit log** — vedi rischio aperto n. 7 e [ADR-0019](18-decision-log.md).

**Lezione registrata.** Nessuna credenziale reale, host di database, endpoint
Neon o URL di deployment nella documentazione di un repository pubblico.

### I-02 — Un incasso concorrente si registrava due volte (2026-08-28) — RISOLTO

**Cosa succedeva.** Il controllo di capienza di una rata leggeva il registro
degli incassi **prima** di aprire la transazione che scrive. Due richieste
simultanee sulla stessa rata vedevano entrambe il residuo com'era prima che
l'altra scrivesse, e passavano entrambe.

**Misurato sullo staging**, non dedotto. Sei richieste concorrenti da 50 € su
una rata con 99,80 € di residuo: **quattro accettate**. Stato finale del club
di collaudo:

| Rata | Dovuto | Incassato | Incassi | Stato salvato |
|---|---|---|---|---|
| Prima | 130,00 € | **150,00 €** | 3 | `partially_paid` |
| Seconda | 199,80 € | **300,00 €** | 5 | `paid` |

329,80 € dovuti, 450,00 € registrati come incassati: **120,20 € di entrate che
non esistono**. E la prima rata risultava `partially_paid` pur avendo incassato
piu del dovuto, perche anche il ricalcolo dello stato girava su una lettura
vecchia.

**Non serviva un trucco.** Due segretarie sullo stesso incasso, un telefono e
un computer, una richiesta ritentata dalla rete. Il pulsante si disabilita
durante l'invio, ma quella e una difesa del singolo browser: non vale fra due
client.

**Correzione.** Le tre operazioni che muovono denaro —
`createPaymentTransaction`, `reversePaymentTransaction`,
`recordRefundTransaction` — bloccano con `SELECT ... FOR UPDATE` la riga su cui
decidono (la rata, o l'incasso originale) **dentro** la transazione, e rifanno
li la verifica: capienza per l'incasso, «gia stornato?» per lo storno,
deduplica e capienza per il rimborso. Il blocco e sulla riga: rate diverse non
si ostacolano.

**Cosa resta da fare.** I dati di collaudo dello staging portano ancora
l'eccedenza registrata durante la prova: vanno stornati, non cancellati.

**Riapertura e chiusura definitiva (revisione indipendente, 2026-08-28).** La
revisione del changeset ha trovato che le operazioni che decidono sullo stato
economico di una rata erano **quattro**, non tre: `PATCH
/api/athlete-payments/:id` cambia l'importo di una rata — e cambiare l'importo
cambia il residuo, quindi cambia lo stato — leggendo la rata fuori da
qualunque transazione e chiamando `recomputeChargeFromLedger` fuori dal blocco.

Tre conseguenze, tutte riprodotte da test che falliscono sul codice
precedente:

- il guardiano «i pagamenti gia pagati non si modificano» girava sulla lettura
  vecchia: un incasso arrivato nel frattempo lasciava cambiare l'importo di una
  rata **appena saldata**, e una rata da 130 incassata per intero diventava una
  rata da 500 scoperta di 370 che nessuno doveva;
- i tre rami della rotta riscrivono `data` per intero a partire dalla copia
  letta fuori: il `data.ledger` scritto dal ricalcolo di un incasso appena
  committato spariva sotto di essa;
- la **capienza** di un nuovo incasso si calcolava sulla rata letta prima della
  transazione. Il residuo e una sottrazione fra due numeri, e ADR-0067 ne
  rileggeva dentro il blocco solo uno: con la rata portata da 130 a 40 mentre
  l'incasso e in volo, il controllo diceva ancora di si a 130.

La rotta ora si mette nella stessa fila — stesso blocco, stesso ordine — e
`createPaymentTransaction` rilegge anche la rata. Vedi
[ADR-0067](18-decision-log.md#adr-0067--il-denaro-si-arbitra-bloccando-la-riga-non-solo-con-un-indice).

### I-03 — Il messaggio del driver usciva dalle rotte di incassi e stagioni (2026-08-28) — RISOLTO

**Cosa succedeva.** `publicErrorMessage` esiste dal Blocco E proprio per
impedirlo, ed e usato dalle rotte generiche delle risorse; le rotte dedicate a
incassi, azioni sugli incassi, rate e stagioni inoltravano invece
`error.message` cosi com'era.

Lo schema del corpo non impone la forma di un UUID a `payment_id` — non e
compito suo — quindi un identificativo arbitrario arrivava fino a
`findUnique`, e l'envelope tornava con l'invocazione Prisma per intero: nome
del modello, operazione, codice d'errore Postgres.

**Portata.** Informazione, non dati: serve una sessione valida e il ruolo che
governa il club, e non esce nessun dato di nessuna societa. Ma a chi cerca una
superficie d'attacco racconta con che cosa e fatto il server, ed e
esattamente cio che quel modulo esiste per non dire.

**Correzione.** Le quattro rotte passano da `publicErrorMessage`, che lascia
passare i messaggi di dominio — «Accesso negato» compreso, perche e la stringa
su cui le rotte mappano il 403 — e sostituisce quelli che nominano Prisma,
Postgres o una query. Il dettaglio resta nei log del server.

## Rischi aperti

### 1. ~~Nessuna protezione di route~~ — RISOLTO (2026-08-22)

Protezione a due livelli: `src/middleware.ts` reindirizza a `/login` chi apre
un percorso protetto senza cookie di sessione, e `AccessAreaGuard` e montato
su **tutte** le aree. Nessuno dei due sostituisce l'autorizzazione server-side
delle API, che resta il presidio principale.

Limite dichiarato: il middleware verifica la **presenza** del cookie, non la
sua validita (il runtime edge non ha Prisma). Un cookie scaduto passa di li e
viene respinto dalle API con 401.

### 2. ~~`easygamemobile` puo distruggere il database reale~~ — RISOLTO (2026-08-22)

Lo schema Drizzle, lo scaffold Express, `drizzle.config.ts`, `.replit`, lo
script `db:push` e tutte le dipendenze di accesso al database sono stati
**rimossi** dal mobile ([ADR-0018](18-decision-log.md)).

Presidio permanente: il job `guardrails` della CI fallisce se `DATABASE_URL`
ricompare sotto `easygamemobile/`.

### 3. ~~`.env` locale punta al database di staging~~ — RISOLTO (2026-08-22)

L'ambiente locale usa un database di sviluppo dedicato
(`docker-compose.dev.yml`, porta 5434). In piu `scripts/db-guard.mjs` blocca
gli script npm di scrittura quando `EASYGAME_DB_ENV` non vale `development`.

Rischio residuo: la guardia protegge gli script npm, **non** un
`npx prisma db push` invocato a mano con un `.env` ripuntato su un ambiente
condiviso. Vedi [13 — Ambienti](13-environments.md).

### 4. Il deploy applica le migrazioni — MEDIO

`vercel-build` esegue `prisma migrate deploy`. Un deploy con una migrazione
distruttiva in `prisma/migrations/` la applica senza conferma.
Controllare sempre lo stato migrazioni prima di deployare.

### 5. Nessuna protezione CSRF esplicita — MEDIO

Il cookie e `sameSite=lax`, che blocca la maggior parte dei POST cross-site,
ma non esiste un token CSRF ne un controllo di `Origin`/`Referer` sulle
mutazioni. Le API accettano `Content-Type: application/json`, il che riduce
ulteriormente la superficie (una form cross-site non puo inviare JSON senza
preflight CORS).

### 6. Webhook pagamenti — PRESIDIATO (era MEDIO)

**Chiuso dal Blocco Finale B** ([ADR-0045](18-decision-log.md#adr-0045--cedipay-e-il-livello-di-prodotto-il-psp-sta-sotto-e-si-sostituisce)).

`POST /api/payments/webhook` e l'**unica superficie di EasyGame che puo far
comparire denaro**: non ha sessione, non ha ruolo, e chiunque puo mandarci una
richiesta. Quattro presidi, nell'ordine in cui agiscono:

1. **corpo grezzo.** La firma copre i byte esatti. Il corpo viene letto con
   `request.text()` prima di qualunque interpretazione: riserializzarlo la
   invaliderebbe sempre, e chi va a sistemare il problema e tentato di
   togliere la verifica;
2. **firma verificata prima di guardare dentro** — HMAC-SHA256 su
   `timestamp.corpo`, **solo** schema `v1` (accettare `v0` e un attacco di
   downgrade), confronto a tempo costante, tolleranza di cinque minuti contro
   il replay. Diciassette test con vettori costruiti a mano, in
   `tests/lib/cedipay-webhook-signature.test.mjs`;
3. **deduplica su `(provider, event_id)`.** La firma dice che l'evento viene
   dal provider; non dice che sia la prima volta che arriva. Stripe riprova la
   consegna per tre giorni e un rinvio manuale e a un clic di distanza: senza
   memoria, la seconda consegna incassa una seconda volta;
4. **niente segreto, niente fiducia.** Senza `STRIPE_WEBHOOK_SECRET`
   l'endpoint risponde **503** — non 200: un 2xx direbbe al provider «ricevuto,
   non riprovare», e l'evento andrebbe perso;
5. **sandbox e produzione non si toccano** (Blocco E,
   [ADR-0060](18-decision-log.md#adr-0060--la-firma-dice-chi-ha-parlato-non-da-quale-mondo-sandbox-e-produzione-si-separano-sullevento)).
   La firma dice **chi** ha parlato, non **da quale mondo**. Un endpoint di
   staging puo ricevere un evento live — endpoint registrato sull'account
   sbagliato, segreto copiato da un ambiente all'altro, rinvio manuale dalla
   dashboard di produzione — e quell'evento avrebbe una firma perfettamente
   valida. Il `livemode` dell'evento viene confrontato con l'ambiente dichiarato
   dalla **chiave segreta** (il prefisso `sk_` seguito da `test` o da `live`, con `PAYMENT_MODE` come
   ripiego); se non coincidono, l'evento non viene elaborato. Un evento che non
   dichiara l'ambiente viene **rifiutato**, non assunto «di prova»:
   `Boolean(undefined)` e falso, ed e il ripiego silenzioso che il controllo
   esiste per togliere.

   Il controllo agisce **prima della deduplica**, e l'ordine e sostanziale: una
   riga scritta per un evento dell'ambiente sbagliato renderebbe l'evento un
   duplicato quando arrivasse, con lo stesso identificativo, all'ambiente a cui
   appartiene davvero — e l'incasso non verrebbe registrato. Vale su **entrambi**
   i flussi, incassi e abbonamenti.

Le risposte negative non dicono **quale** controllo non e stato superato:
spiegarlo a chi ha mandato la richiesta e spiegarlo a chi sta provando. Nei
log finiscono provider e messaggio, mai il corpo — che contiene l'email di chi
paga e i riferimenti dell'account connesso.

`createPaymentTransaction` continua a rifiutare qualunque `source` diverso da
`MANUAL`, con **una sola eccezione**: `confirmedByProvider`, che nessuna rotta
HTTP puo impostare — le rotte costruiscono il loro input campo per campo — e
che solo `handleGatewayWebhookEvent` imposta, dopo aver verificato la firma.

### 6-bis. Chi puo registrare o stornare un incasso — PRESIDIATO

`POST /api/v1/payment-transactions` e lo storno richiedono
`canManageClubConfiguration` (proprietario o gestore del club), lo stesso
controllo che protegge `/api/athlete-payments/:id` da quando il PIN e stato
rimosso ([ADR-0033](18-decision-log.md)). La lettura resta a chi ha accesso al
club, perche i riepiloghi la usano ovunque.

Il confine di tenant e applicato in `src/lib/server/payment-transactions.ts`:
ogni operazione risolve `organization_id` dalla **rata**, non dal payload, e
un club diverso ottiene «Accesso negato» → 403. Ventitre test lo provano
operazione per operazione.

Un incasso **non si cancella**: si storna, e l'originale resta con
`reversed_at`, `reversed_by` e il motivo. Registrazione e storno finiscono
nell'audit log.

### 6-ter. Contributi pubblici: denaro di terzi su dati di minori — PRESIDIATO

Un voucher e denaro pubblico attribuito a un minore, e il maturato si ricava
dalle sue presenze: se il confine di tenant perde, un club vede la frequenza e
i contributi degli atleti di un altro. `src/lib/server/funding.ts` risolve
`organization_id` dal **programma o dal beneficiario**, mai dal payload, e
ventisette test provano ogni operazione dal club sbagliato.

Configurare un programma, ricalcolare un maturato, rendicontarlo e registrare
una liquidazione richiedono `canManageClubConfiguration`; ogni scrittura
finisce nell'audit log. La lettura resta a chi ha accesso al club, perche la
scheda atleta la usa.

Due invarianti che valgono anche come misura di integrita:

- **il maturato non si scrive a mano**, in nessun punto dell'interfaccia o
  dell'API: si ricalcola dalle presenze registrate. Un importo digitato
  sarebbe un'opinione da rendicontare a un ente pubblico;
- **non si liquida piu di quanto e maturato**, nemmeno in due versamenti: la
  ripartizione e obbligatoria e viene validata contro cio che ogni periodo ha
  gia ricevuto.

Vedi [ADR-0037](18-decision-log.md#adr-0037--un-contributo-non-e-un-pagamento-due-contabilita-separate-e-le-regole-del-bando-sono-dati).

### 6-quater. Il CRUD generico scriveva sui documenti fiscali — PRESIDIATO (2026-08-29, W4-E)

Due regole del dominio dei documenti esistevano **scritte e senza chiamanti**,
e la porta piu aperta del prodotto — `/api/v1/<resource>` — le ignorava
entrambe:

1. **il numero lo digitava il client.** `POST /api/v1/invoices` accettava
   `invoice_number` come una colonna qualunque. Con il vincolo di unicita per
   club, un numero scelto a mano poteva **occupare** quello che
   `document_number_sequences` avrebbe assegnato al documento successivo — e la
   sequenza, che e l'unica difesa contro due sportelli che emettono nello stesso
   secondo, veniva aggirata da fuori;
2. **un documento emesso si poteva riscrivere.** `assertDocumentMutable`
   implementava «un documento emesso non si modifica» dal Blocco D e nessuno la
   chiamava: da `PATCH /api/v1/receipts/:id` si cambiavano importo, data,
   intestatario e snapshot di un documento **gia consegnato**.

Ora `guardFiscalDocumentIntegrity` (`src/lib/server/resources.ts`) le applica su
creazione e modifica, per `invoices` e `receipts`. **Rifiuta** invece di
ignorare, al contrario della guardia sullo stato di una rata: chi cambia il
numero o l'importo di un documento emesso sta facendo una cosa che non deve
riuscire, e proseguire in silenzio gli lascerebbe credere di averla fatta.
Rimandare indietro lo **stesso** valore non e una modifica e passa.

Le due funzioni vivono nel modulo puro `src/lib/documents/document-snapshot.ts`
e sono riesportate da `fiscal-documents.ts`: importarle da li avrebbe chiuso un
anello `resources → fiscal-documents → sponsors → resources`.

### 7. ~~Nessun audit log~~ — IMPLEMENTATO (2026-08-22)

`src/lib/server/audit.ts` scrive su `audit_logs` chi ha fatto cosa, su quale
club, con quale esito ([ADR-0019](18-decision-log.md)).

Tracciate: login riuscito e fallito, logout, richiesta e completamento del
reset password, attivazione membership, creazione/modifica/cancellazione delle
risorse economiche e di accesso (`AUDITED_RESOURCES`), il ciclo di vita delle
stagioni (`season.created`, `season.activated`, `season.archived`,
`season.rollover` — Blocco 6), e **tutti** i dinieghi di autorizzazione su
qualunque risorsa.

**Dal Blocco Finale C** (R-07, che ADR-0019 dichiarava bloccante per la
produzione), con azioni **proprie** e non `resource.*`, perche la domanda che
si pone su ognuna e diversa e cercarla fra tutte le scritture di risorsa non
la trova:

| Azione | Cosa risponde |
|--------|---------------|
| `anagrafica.updated` | «Chi ha cambiato i dati di questa persona?» — atleti, allenatori, staff, soci, appartenenze e certificati (`AUDITED_ANAGRAFICA_RESOURCES`). Serve perche l'approvazione di una compilazione scrive in anagrafica **per conto di qualcun altro** |
| `payment.transaction.recorded` / `.reversed` | «Chi ha incassato questi cinquanta euro, e chi li ha stornati?» |
| `document.issued` | Quale ricevuta o fattura e stata emessa, e da chi |
| `funding.period.reported` / `.settled` | Gli atti verso un finanziatore. La **maturazione** no: e un calcolo, e tracciarla riempirebbe il log di righe che nessuno cerca |
| `platform.club_plan.changed`, `platform.club_service.changed`, `platform.entitlement.overridden` | Il commerciale della piattaforma. Un club non le puo compiere: se compaiono con un attore che non e `platform_admin`, e successo qualcosa |

**Cosa resta deliberatamente fuori.** Allenamenti, magazzino e programma
settimanale: non hanno un soggetto, e tracciarli porterebbe il volume al punto
in cui il log smette di essere leggibile — che e il modo piu comune in cui un
audit diventa inutile.

Registrati: azione, esito, actor (id, email, ruolo), organizzazione, risorsa e
id, IP, user agent, metadati filtrati, timestamp.

Garanzie:

- **nessun segreto**: i metadati passano da `sanitizeMetadata`, che censura le
  chiavi sensibili per sottostringa (password, token, hash, iban, ...) e per
  segmento (`iv`, `pin`, `otp`, `code`, ...), a qualunque profondita;
- **non fa fallire l'operazione tracciata**: un errore di scrittura viene
  registrato su console e basta;
- **non legge mai il corpo delle richieste** (verificato da un test).

Retention: `AUDIT_LOG_RETENTION_DAYS` piu `purgeExpiredAuditEvents()`. Se la
variabile non e impostata **non si cancella nulla**: il periodo e una decisione
di prodotto e compliance, non un default tecnico. Manca ancora lo scheduler che
invochi la purge, e manca una UI di consultazione: → [WP-16](20-work-packages.md).

### 8. Binari nel database — RIDOTTO (2026-08-25, Blocco 8)

Il difetto grave non era `Asset.data_base64` ma i data URL **dentro i record
di dominio**: un allegato non aveva autorizzazione propria — chi poteva
leggere il record aveva i byte, tutti insieme — ne un limite di dimensione ne
un controllo di tipo.

Dal Blocco 8 gli allegati passano da `src/lib/server/attachments.ts`
([ADR-0034](18-decision-log.md#adr-0034--gli-allegati-escono-dai-record-e-passano-da-un-servizio-con-driver)),
che applica:

- **scope organizzativo su ogni operazione** — leggere, elencare,
  sostituire, cancellare. 8 test lo verificano dal club sbagliato;
- **elenco chiuso di tipi MIME**: niente eseguibili, niente archivi;
- **limite di 10 MB** per file, controllato prima di leggere i byte;
- `X-Content-Type-Options: nosniff`, una `Content-Security-Policy`
  restrittiva e `Cache-Control: private` sulla risposta che serve il file;
- nome del download ripulito prima di finire in `Content-Disposition`: un
  nome con un ritorno a capo non puo aggiungere header.

**Correzione di RC Fix 1.** La politica era
`sandbox; default-src 'none'`, e spegneva il visualizzatore PDF del browser:
misurato leggendo la console, il browser scrive «Loading plugin data … has
been blocked» e, tolto solo `object-src`, «Framing … has been blocked»,
perche il visualizzatore disegna in un riquadro figlio. Le immagini si
vedevano lo stesso, i PDF no.

La politica ora vieta le stesse cose ma permette quelle due:
`default-src 'none'` (quindi niente script e nessuna richiesta di rete),
`object-src 'self'`, `frame-src 'self'`, `frame-ancestors 'none'`,
`base-uri 'none'`, `form-action 'none'`. Cio che rende innocuo servire
`inline` resta `nosniff` piu l'elenco chiuso dei tipi: **solo** PDF,
immagini e testo si aprono in scheda, tutto il resto arriva come allegato.

Le quattro rotte che servono un file — allegati, documenti dell'atleta,
allegati dei moduli, documenti del genitore — passano ora da
`src/lib/server/stored-file-response.ts`. Due di esse rispondevano sempre
`attachment` (quindi «Visualizza» scaricava) e due non mandavano `nosniff`.

**Resta aperto:** i data URL legacy gia in archivio, che continuano a
funzionare e migrano quando qualcuno li tocca; e la tabella `assets`, ancora
usata dal logo di club e dalle immagini dei form.

### 8-bis. Firma e timbro del presidente — PRESIDIATO (2026-08-28, W1-E)

Sono **un dato del club**, non un file pubblico e non un allegato come gli
altri. Due proprieta diverse, tenute separate:

- **la lettura e di chi appartiene al club.** `GET
  /api/v1/clubs/:id/signature` verifica la sessione e che il club sia fra
  quelli accessibili, poi serve i byte con `Cache-Control: private`,
  `nosniff` e la CSP di `stored-file-response.ts`. Non c'e nessun percorso
  pubblico, nessuna cache condivisa e nessun `data:` dentro un record letto
  da altri. E aperta a tutto il club di proposito: serve all'anteprima e al
  documento stampabile, che emette anche la segreteria;
- **la scrittura e solo del proprietario e del gestore.** `PUT` e `DELETE`
  passano da `canManageClubConfiguration`, e il diniego lascia una riga di
  audit `resource.access.denied` su `club_signature`. Non e stato introdotto
  un permesso dedicato: un secondo sistema di permessi per due immagini
  sarebbe una superficie in piu da tenere allineata ad `access-roles.ts`.

I byte passano per intero da Attachment Core (`owner_type: "club"`), con tipi
piu stretti (solo PNG, JPEG, WebP) e un limite di 2 MB invece di 10, perche
una firma finisce **dentro** un documento HTML come base64 e ne triplica il
peso. Il proprietario del dominio e `src/lib/server/club-signature.ts`: e
l'unico posto che scrive `clubs.settings.presidentSignature` e
`.presidentStamp`, e lo fa per chiavi (`settings_patch`), mai riscrivendo le
impostazioni intere.

### 8-ter. Il sollecito scrive a persone fuori dal prodotto — PRESIDIATO (2026-08-28, W1-F)

E l'unica operazione di EasyGame che, con un clic, manda posta a decine di
famiglie. Quattro presidi, e ognuno chiude un modo diverso di sbagliare.

- **Il perimetro e quello del denaro.** `POST /api/v1/payment-reminders`
  richiede `canManageClubConfiguration` — proprietario e gestore — lo stesso
  che protegge la registrazione di un incasso. Non e stato introdotto un
  permesso nuovo: un secondo sistema per un'azione sarebbe una superficie in
  piu da tenere allineata ad `access-roles.ts`.
- **Un identificativo che arriva dal client non e un lasciapassare.** Le rate
  si cercano gia filtrate per `organization_id`, e ogni riga ripassa da
  `ensureOrganizationAccess`. Un `charge_id` che non torna indietro viene
  rifiutato con «Accesso negato» **senza dire se esista altrove**: il messaggio
  non distingue «di un altro club» da «non esiste», perche la differenza sarebbe
  un oracolo. Coperto da `tests/server/payment-reminders.test.mjs`.
- **Nemmeno un account collegato lo e.** Un tutore che dichiara
  `linkedUserId` viene raggiunto in-app solo se quell'utente e **iscritto a
  questo club** (`organization_users`): la stessa email puo esistere in due
  societa, e l'anagrafica di una non e un titolo per scrivere dall'altra.
  Altrimenti compare fra i non raggiungibili come `no_account`.
- **Un doppio clic non raddoppia la posta.** La difesa non e un controllo prima
  della scrittura ma una **rivendicazione** scritta sotto blocco di riga
  ([ADR-0078](18-decision-log.md#adr-0078--il-sollecito-rivendica-il-destinatario-prima-di-scrivergli-e-la-traccia-vive-sulla-rata)),
  con finestra di sei ore. La lettura-poi-scrittura del sollecito sui documenti
  non regge due richieste ravvicinate; su un invio massivo significherebbe
  scrivere due volte a tutte le famiglie di un club.

**Nel messaggio non c'e niente di riservato oltre al minimo**: nome
dell'atleta, importo residuo, rate scadute, prossima scadenza. Nessun link di
pagamento, nessun identificativo, nessun allegato — un sollecito e posta in
chiaro, e cio che ci si mette dentro viaggia in chiaro. Il testo passa da
`escapeHtml` prima di finire nella parte HTML: i nomi arrivano da
un'anagrafica compilata da persone.

**Ogni invio lascia una riga di audit** `payment.reminder.sent` con attore,
club, conteggi ed esito — `failure` quando non e partito niente. E la sola
cosa che risponde a «il sollecito e partito davvero?» quando una famiglia dice
di non aver ricevuto nulla.

### 9. Path «segreto» del platform admin — BASSO

`/private/easygame-platform-admin-0c7a` e solo poco indovinabile. La sicurezza
reale e `requirePlatformAdmin` sulle API — che c'e. Non trattare il path come
una misura di sicurezza.

### 10. Fallback permissivo degli admin di piattaforma — BASSO

Se `EASYGAME_PLATFORM_ADMIN_EMAILS` e vuota, chiunque abbia
`users.role in ("platform_admin", "admin")` diventa admin di piattaforma.
`users.role` e una stringa libera senza vincoli. **Tenere sempre valorizzata la
lista email** negli ambienti condivisi.

### 11. Paginazione sulle liste — MITIGATO (2026-08-25, Blocco 8)

Il server sa impaginare, cercare e ordinare (`?limit=`, `?page=`, `?q=`,
`?order_by=`), con un tetto di 200 righe per pagina che il client non puo
alzare. La pagina piu pesante — la lista Atleti — e scesa da 23,7 MB a 140 kB
avendo tolto i binari dalla risposta. Resta che il **default** e ancora la
lista intera, quindi il rischio non e nullo: e ridotto di due ordini di
grandezza.

Testo originale, che resta valido per le liste non convertite:

`/api/v1/<resource>` restituisce tutti i record del club. Con club grandi
diventa un problema di memoria e latenza, non di riservatezza.

### 12. Nessun Row Level Security — informativo

L'isolamento multi-tenant e **solo applicativo**: un bug in `resources.ts`
diventerebbe direttamente una fuga cross-tenant.

Dal 2026-08-22 il presidio esiste: 29 test a runtime coprono lettura,
dettaglio, creazione, update e delete cross-tenant sulle funzioni vere, e sono
stati validati per mutazione (rimuovendo il filtro falliscono 8 test,
disattivando `ensureOrganizationAccess` ne falliscono 11). Vedi
[15 — Testing](15-testing.md).

## Regole per chi scrive codice

1. **Mai** interrogare Prisma da un route handler senza aver prima ottenuto lo
   `scope` e senza filtrare per `organization_id`.
2. **Mai** fidarsi di `organization_id` che arriva dal client: deve passare da
   `ensureOrganizationAccess`.
3. **Mai** importare `src/lib/server/**` da un componente client.
4. **Mai** restituire `password_hash`, `password_ciphertext`, token di sessione
   o codici OTP in una risposta.
5. Un messaggio di errore di autorizzazione **deve** contenere la stringa
   `Accesso negato` (il route handler generico la usa per mappare il 403).
6. Un'operazione sensibile nuova va tracciata con `recordAuditEvent`, e i suoi
   metadati non devono contenere segreti (`sanitizeMetadata` li censura, ma
   non passarglieli e meglio).
6. Nuovi segreti: solo variabili d'ambiente o colonne cifrate, mai nel
   repository, mai in `NEXT_PUBLIC_*`.
7. Ogni modifica ad `access-roles.ts` richiede l'aggiornamento di
   `tests/auth/role-authorization.test.mjs`.
8. Ogni **nuova rotta di pagina** va aggiunta sia a `PROTECTED_PREFIXES` in
   `src/middleware.ts` sia alla matrice di `access-roles.ts`: il middleware
   ferma chi non ha sessione, la matrice chi ha il ruolo sbagliato. Ne serve
   una senza l'altra. (`/onboarding` e l'ultima aggiunta, Blocco 4.)
9. Un valore che arriva da un form e finisce dentro un **protocollo testuale**
   (SMTP, IMAP, LDAP, CSV) va ripulito dai terminatori di riga prima di essere
   scritto sul canale: e la stessa classe di problema dell'iniezione SQL.

## Blocco D — cosa e stato chiuso, e cosa resta presidiato (2026-08-26)

### Tre buchi di ownership, chiusi

| # | Cosa permetteva | Come e chiuso |
|---|-----------------|---------------|
| 1 | **Un club poteva azzerarsi la commissione.** `platformFeePercent` viveva in `clubs.settings.paymentSettings`, fuori dalla guardia di ADR-0048, e il campo era nella pagina | La guardia lavora **campo per campo** dentro `paymentSettings`. L'interruttore degli incassi resta della segreteria, le condizioni commerciali no |
| 2 | **Un club poteva dirottare gli incassi delle famiglie.** La scheda Pagamenti aveva un campo di testo per l'account connesso e un menu a tendina per dichiararsi «attivo» | L'account passa in `club_payment_accounts`, che scrivono solo la console di piattaforma e gli eventi firmati. `PaymentProviderCard` e stato rimosso |
| 3 | **Un evento da un account connesso sconosciuto veniva assecondato.** Si ripiegava sui metadati, che li puo scrivere chiunque crei un pagamento su un proprio account Connect | L'account connesso vince sui metadati; se non risulta collegato a nessuna societa, l'evento viene **ignorato** |

### Cosa non e cambiato, e va ricordato

- **Nessun dato di carta** entra in EasyGame: il pagamento avviene sulla
  pagina del PSP;
- **nessuna chiave segreta nel database**: `platform_settings` conserva
  identificativi e scelte, non credenziali;
- **nessun corpo di webhook conservato**: contiene l'email di chi paga e i
  riferimenti dell'account connesso. Si conservano tipo, esito e ora;
- **nessun link di onboarding nell'audit**: e a tutti gli effetti una
  credenziale temporanea. Nell'audit finisce che e stato chiesto, non quale;
- **`window.open` passa da un proprietario unico**
  (`lib/navigation/external-link.ts`) che aggiunge `noopener` e rifiuta gli
  schemi diversi da http(s): l'indirizzo arriva dalla risposta di un PSP.

### Il confine fiscale

Un documento di una societa non si legge, non si emette e non si annulla da
un'altra: il controllo e in `fiscal-documents.ts` e ha tre test dedicati.
L'errore contiene «Accesso negato» perche il route handler lo mappi su 403,
come ogni altra risorsa di club.

---

## Lavoro sportivo: il dato economico piu riservato del prodotto (2026-08-28)

Quattro presidi, oltre a quelli comuni a ogni risorsa di club.

**1. Il perimetro e ristretto per definizione.** Cinque permessi di dominio,
default negato, e il confine coincide con quello che gia protegge conti
correnti e configurazione societaria: proprietario e club manager. Allenatore,
staff, collaboratore e atleta non leggono i compensi altrui
([ADR-0077](18-decision-log.md#adr-0077--i-compensi-hanno-permessi-propri-e-il-default-e-negato)).
Ogni diniego viene tracciato con il permesso mancante.

**2. L'IBAN non viaggia in un elenco.** La proiezione di lista di una persona
risponde `has_iban: true/false`; le coordinate bancarie si leggono aprendo la
scheda, una alla volta. Un elenco si carica per mostrare venti righe, e ogni
campo che ci sta dentro finisce nella cache del browser. L'audit gia rimuove
`iban` dai metadati per nome di chiave.

**3. Il confine di club regge anche sul denaro.** Provato a runtime dal club
sbagliato su rapporti, scadenze, erogazioni, storni, posizioni annue,
dichiarazioni, premi, rimborsi, fatture e adempimenti: tutti 403 con «Accesso
negato». Il collaudo `scripts/sport-work-uat.mjs` lo rifa a ogni esecuzione.

**4. La responsabilita di erogare al buio ha un nome.**
`sport_work.payment.without_current_self_declaration` registra chi ha deciso di
erogare sapendo che il calcolo contributivo poteva essere incompleto, con
attore, data, rapporto, erogazione e anno. Non e un log tecnico: se un giorno
arrivano contributi omessi e sanzioni, quella riga e il documento che dice come
sono andate le cose.

**Le tracce si scrivono nel servizio, non nelle rotte** — deviazione voluta
rispetto a incassi e contributi. Un audit dimenticato in una delle rotte
sarebbe un audit che manca proprio nel caso in cui serve.

