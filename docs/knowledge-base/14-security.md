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

### 6-quinquies. Il confine multi-tenant era `allowedOrganizationIds` in quindici moduli — PRESIDIATO (2026-08-30, Wave 4 remediation)

Il difetto piu grave che le quattro Wave abbiano prodotto, e non e un difetto:
e una **forma**, copiata quindici volte.

**Come funzionava.** `resolveOrganizationScopeForUser`
(`src/lib/server/auth.ts`) restituisce due cose diverse:

| Campo | Cosa dice |
|---|---|
| `allowedOrganizationIds` | **tutti** i club a cui l'utente appartiene |
| `activeRole` | il ruolo dell'utente nel club **attivo**, e in nessun altro |

Ogni dominio si era scritto il proprio `ensureOrganizationAccess`, e quasi
tutti confrontavano l'`organization_id` della riga con il **primo** campo. Il
permesso pero si verifica sempre con il **secondo**. I due insiemi non
coincidono mai per chi ha piu di un club — e chiunque puo crearsi una societa
e diventarne proprietario in un minuto.

**L'attacco, in una riga.** Mandare `x-active-club-id: <la propria societa>`
insieme all'identificativo di una riga **di un'altra**. Il ruolo viene
risolto per la propria — `owner` — e il confine risponde «sei membro anche di
quel club, passa».

**Cosa ha ottenuto l'audit.** Un genitore, proprietario di una societa
qualunque creata da lui, ha letto l'IBAN e il saldo di un altro club,
rinominato un conto altrui, registrato un'uscita da 70.000 euro in casa
d'altri, stornato un movimento, letto il libro soci ed esportato la
contabilita.

**Perche non bastava correggere le sei rotte trovate.** Non bastava, e si e
visto: la stessa forma era gia stata trovata e chiusa una volta in
`document-templates.ts`, con il commento che la raccontava. Sei moduli nuovi
l'hanno reintrodotta comunque. La seconda lettura ne ha trovati **altri
dodici**, e fra questi:

| Modulo | Cosa proteggeva male |
|---|---|
| `sport-work.ts` (e per suo tramite `sport-work-agenda.ts`) | il denaro in uscita verso le persone |
| `payment-transactions.ts` | gli incassi delle famiglie, e i loro storni |
| `resources.ts` | il **motore CRUD generico**: una cinquantina di risorse |
| `fiscal-documents.ts` | l'annullamento di un documento fiscale numerato |
| `einvoice.ts` | la preparazione e la trasmissione di una fattura elettronica |
| `attachments.ts`, `consents.ts`, `forms.ts`, `form-submissions.ts`, `document-placeholders.ts` | allegati, consensi, moduli, compilazioni, segnaposto |

**La correzione.** Il confine adesso e **una funzione sola**, in
`src/lib/auth/active-club-boundary.ts`, e i moduli la importano:

> La riga deve appartenere al **club attivo**. Per lavorare su un altro club
> si cambia club, e il ruolo viene risolto di nuovo per quello.

La lezione non stava nel codice, stava in un commento — e i commenti non
falliscono. Il tredicesimo modulo non nascera perche non c'e piu niente da
copiare.

**L'unica eccezione, e perche e legittima.** La scheda di **un** club
(`resources.ts`, ramo `clubs`/`organizations`) resta sull'elenco: li la
risorsa **e** il club, e il selettore di societa deve poter leggere quella su
cui sta per spostarsi. Il confine del club attivo vale per tutto cio che sta
*dentro* un club, non per la scelta di quale club guardare.

**Cinque rotte non avevano alcun controllo di ruolo**, solo la sessione:

| Rotta | Cosa lasciava fare a chiunque appartenesse al club |
|---|---|
| `PUT /api/v1/fiscal/profile` | riscrivere partita IVA, forma giuridica e regime fiscale della societa — dati che finiscono sulle fatture emesse |
| `GET`/`POST /api/v1/einvoice/:id` | preparare e trasmettere una fattura elettronica; lo scope non portava nemmeno `activeRole` |
| `POST /api/v1/documents/:kind/:id/cancel` | annullare un documento fiscale numerato |
| `GET /api/v1/documents/:kind/:id` | stampare qualunque fattura o ricevuta, con il codice fiscale dell'intestatario |
| `POST /api/v1/payments/account` | generare il link di onboarding Stripe della societa |

Tutte e cinque adesso chiedono il permesso oltre alla sessione.

**Le prove.** `tests/auth/active-club-boundary.test.mjs` (la regola),
`tests/server/active-club-boundary-wide.test.mjs` (l'attacco su incassi,
documenti, lavoro sportivo e CRUD generico, piu il controllo inverso: con il
club giusto attivo lo stesso utente lavora), e
`tests/server/accounting-active-club-boundary.test.mjs` (i sei moduli della
prima tornata).

### 6-sexies. Un documento annullato si stampava come valido — PRESIDIATO (2026-08-30)

`GET /api/v1/documents/:kind/:id` non leggeva ne `cancelled_at` ne `status`:
una ricevuta ritirata usciva **identica** a una valida. Nessuna filigrana,
nessuna riga, nessun rifiuto. Chi la riceveva non aveva modo di distinguerla,
e il piede del foglio continuava a dire «Documento emesso da EasyGame».

Ora il foglio porta una fascia in testa, una filigrana che attraversa il
corpo, l'annullamento nel titolo della pagina e un piede che spiega perche il
numero resta assegnato (ADR-0044).

### 6-septies. La stampa leggeva l'anagrafica di oggi, non lo snapshot — PRESIDIATO (2026-08-30)

`invoices.snapshot` e `receipts.snapshot` esistono per congelare cio che un
documento diceva il giorno in cui e stato consegnato. `readDocumentSnapshot`
aveva **due soli chiamanti**, tutti e due dentro il tracciato FatturaPA: il
documento di carta — quello che la famiglia riceve davvero — era l'unico a non
esserne protetto.

La rotta di stampa ricostruiva intestazione e intestatario dai dati correnti.
Un documento consegnato a marzo e ristampato a settembre, dopo un cambio di
ragione sociale o la correzione di un codice fiscale, usciva **diverso**
dall'originale pur portando lo stesso numero.

Ora lo snapshot viene prima. La ricaduta sui dati correnti resta e serve — i
documenti emessi prima che lo snapshot esistesse non ne hanno uno — ma e una
ricaduta, non piu la regola. Il logo resta corrente per scelta: e
un'immagine servita dall'applicazione, non un dato fiscale.

### 6-octies. Tre classi di confine che la correzione precedente non poteva vedere — PRESIDIATO (2026-08-30, seconda revisione)

La correzione di [6-quinquies](#6-quinquies-il-confine-multi-tenant-era-allowedorganizationids-in-quindici-moduli--presidiato-2026-08-30-wave-4-remediation) ha inseguito **una firma**: autorizzare una riga con
`allowedOrganizationIds` mentre il permesso si verifica con `activeRole`. L'ha
chiusa in quindici moduli. Una revisione ostile indipendente ha poi mostrato
che fuori da quella firma c'erano tre classi, e due erano peggiori.

#### Classe 1 — risorse senza **nessun** confine

`users` e `assets` non avevano un controllo sbagliato: non ne avevano affatto.
Una ricerca dell'anti-pattern non poteva vederle, perche l'anti-pattern li non
c'era.

`ORGANIZATION_SCOPED_MODEL_RESOURCES` elencava venti risorse di modello e non
queste due. `listResourcePage` non applicava quindi nessun `where`, e
`resolveRecordOrganizationId` restituiva `null` — e `ensureOrganizationAccess`,
ricevendo `null`, **esce senza negare**. L'unico controllo rimasto era il
ruolo, e il ruolo lo si ottiene registrandosi con un club proprio.

Cosa la revisione ha eseguito:

```
GET    /api/v1/users            -> l'anagrafica di ogni utente della piattaforma
PATCH  /api/v1/users/<vittima>  {"password":"..."} -> 200, impronta riscritta
DELETE /api/v1/users/<vittima>  -> 200; Club.creator_id e ON DELETE CASCADE
GET    /api/v1/assets           -> carte d'identita e certificati medici,
                                   con il contenuto in data_base64
```

**La correzione non e un terzo elenco**, perche la sua **assenza** era il
difetto e un quarto dimenticato produrrebbe lo stesso buco. Ogni risorsa di
modello dichiara adesso il suo confine in `RESOURCE_BOUNDARIES`, e
`assertOgniRisorsaDichiaraIlConfine` — eseguita al caricamento del modulo —
**impedisce a `resources.ts` di caricarsi** se una ne resta senza. Vive nel
codice e non in un test perche un test si puo dimenticare di aggiornare.

Tre confini, e nessun altro:

| Confine | Cosa significa |
|---|---|
| `club` | la riga porta un `organization_id`, e si filtra per club |
| `persona` | la riga e di **chi la chiede**, e si filtra per `userId` |
| `chiuso` | non passa dal registro generico: ha rotte proprie |

`users` e `persona`: un utente non appartiene a un club, appartiene a se
stesso. `assets` e `chiuso`: non ha un `organization_id` — il club sta dentro
`path` — e dedurlo da una convenzione di denominazione per autorizzare un
documento di identita sarebbe un confine costruito su un nome di file. Le
quattro rotte che servono gli allegati verificano ognuna il suo, e nessun
client chiedeva `/api/v1/assets`.

#### Classe 2 — confine giusto, **permesso assente**

`active-club-boundary.ts` dichiara nella sua intestazione che decide **su quale
club**, non **cosa si puo fare**, e che i due controlli sono entrambi
obbligatori. Cinque moduli superavano il primo e non eseguivano mai il secondo:

| Dove | Cosa lasciava fare a chiunque appartenesse al club |
|---|---|
| `GET /api/v1/payment-transactions` | il **libro cassa** del club: ogni incasso di ogni famiglia, con importi, date, metodi, controparti e storni. La `POST` dello stesso file il permesso lo chiedeva |
| `/api/v1/forms/**` | elencare, creare, **pubblicare** un modulo a nome della societa, rigenerare lo slug pubblico invalidando il link vivo, cancellare, e leggere ogni compilazione con nomi, codici fiscali e file caricati |
| `GET /api/v1/funding/**` | quali famiglie sono iscritte a un voucher e per quanto — un'affermazione sulla loro situazione economica — compresa la riconciliazione di un bando e il suo export CSV |
| `/api/athletes/:id/documents` e `/file` | leggere, **scaricare**, approvare e archiviare carte d'identita e certificati di ogni atleta |
| `GET /api/payments/checkout-status` | lo storico completo degli incassi di una rata di chiunque |

`src/lib/server/forms.ts` dichiarava `activeRole` nel suo tipo di scope e non
lo leggeva in nessuna riga.

Il permesso e stato aggiunto **dove vive il dominio** — dentro
`ensureOrganizationAccess` di `funding.ts`, `forms.ts` e
`form-submissions.ts` — cosi che nessuna rotta nuova possa dimenticarlo.

#### Classe 3 — moduli che la ricognizione non ha raggiunto

Tre rotte sotto `/api/`, non sotto `/api/v1/`, portavano l'anti-pattern
verbatim. La ricognizione si era fermata al secondo prefisso.

`PATCH /api/athlete-payments/:id` era il caso peggiore: riscrivere, annullare o
**cancellare** una rata di un altro club — e `payment_transactions.payment_id`
e `ON DELETE CASCADE`, quindi la cancellazione porta via ogni incasso, storno e
rimborso collegato. Cioe D-3, l'invariante centrale della Wave, distrutta da un
club in cui l'attaccante e un genitore.

#### E, orthogonale a tutte e tre: il privilegio che si concedeva da se

`isPlatformAdminUser` leggeva il ruolo da tre posti, e il **primo** era
`user_metadata.role` — una colonna JSON che l'utente stesso scrive da
`PATCH /api/v1/auth/user`, che accettava qualunque chiave.

```
PATCH /api/v1/auth/user   {"user_metadata":{"role":"platform_admin"}}
```

Da qualunque account — un genitore, un atleta, uno appena registrato e senza
club — la richiesta successiva era gia amministratore della piattaforma: dati
di pagamento di ogni societa, piani e abbonamenti scrivibili, profilo fiscale e
conto Stripe di qualunque club. Comprese **due delle cinque rotte** a cui la
correzione precedente aveva appena aggiunto il gate di ruolo, perche
l'amministratore di piattaforma le scavalca entrambe.

E la seconda meta: con l'elenco di indirizzi **configurato**, l'ultima riga
concedeva comunque sul solo ruolo. L'elenco non era una condizione, era un ramo
alternativo.

La regola adesso:

| Quando | Cosa vale |
|---|---|
| l'elenco di indirizzi e configurato | **solo** l'indirizzo |
| l'elenco e vuoto (sviluppo) | la colonna `users.role` |

`user_metadata.role` non vale mai, e in piu `PROTECTED_USER_FIELDS` impedisce
di scriverlo: due difese per lo stesso privilegio, perche una sola prima o poi
si dimentica.

#### Il club non attivo, e quanto ne usciva

L'eccezione dichiarata — l'elenco dei club resta filtrato sui club dell'utente,
perche li la risorsa **e** il club e il selettore di societa deve poter leggere
quella su cui sta per spostarsi — era corretta nella ragione e tre ordini di
grandezza piu larga nell'effetto: «leggere» significava **la riga intera**.

Una revisione ha letto, da un club dove era soltanto genitore: IBAN, conti
correnti con i saldi, la prima nota storica, gli sponsor, i soci con il codice
fiscale, e il `payment_pin`.

Del club **non attivo** escono adesso le sole colonne che servono a sceglierlo.
E `payment_pin` non esce mai, da nessun club: era stato tolto dalle colonne
**proiettabili** — quelle che un client puo chiedere con `?fields=` — e una
prova lo presidiava, ma una lettura **senza** `?fields=` non passa da quella
lista. La prova passava e il segreto usciva. Adesso guarda la risposta.

**Le prove:** `tests/server/platform-boundary.test.mjs` (le tre classi, piu il
controllo inverso), `tests/auth/active-club-boundary.test.mjs` (il ruolo che si
concede da se, e l'elenco che e una condizione),
`tests/server/club-pin-removed.test.mjs` (il PIN e il club non attivo, guardati
sulla **risposta** invece che sul sorgente).

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

**2. L'IBAN non viaggia in un elenco, e non esce da chi non amministra.** La
proiezione di lista di una persona risponde `has_iban: true/false`; un elenco
si carica per mostrare venti righe, e ogni campo che ci sta dentro finisce
nella cache del browser. L'audit gia rimuove `iban` dai metadati per nome di
chiave.

Il commento accanto a quella proiezione diceva che «le coordinate si leggono
aprendo la scheda, e chi lo fa ha `sport_work.manage`». Non era vero: la
scheda (`GET /api/v1/sport-work/people/:id`) chiede `sport_work.read` e
restituiva la **riga intera**. La difesa non stava dove il commento la
collocava, ed e la forma di difetto che questa Wave ha incontrato piu spesso.

Adesso la redazione sta sull'**involucro** `sportWorkRoute`, sulla risposta e
non nelle due rotte che oggi montano una persona: la proprieta da tenere non
e «questa funzione proietta», e **«nessuna risposta di questo dominio porta
un IBAN a chi non amministra»**. Il campo non sparisce: al suo posto resta
`has_iban`, cosi chi prepara un bonifico senza poterlo disporre sa che le
coordinate ci sono. Prova: `U-66` nella sonda di sicurezza, misurata dalla
rotta con un ruolo di club vero — creato in archivio e assegnato a una
tessera, perche il gettone `custom:...#chiavi` lo compone lo scope dalla riga
e non l'intestazione della richiesta.

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


## Wave 4 — la terza tornata di revisione ostile (2026-08-30)

Tre revisioni indipendenti di conferma — sicurezza, contabilita/concorrenza,
fiscale/interfaccia — su codice gia corretto e gia verde. Hanno trovato **due
Critical di sicurezza**, **due Critical di contabilita**, **due Critical di
prodotto** e undici fra High e Medium. Nessuno era visibile ai 3.529 test che
passavano.

### I due Critical di sicurezza, e perche i confini non li vedevano

| | Difetto | Perche il confine non bastava |
|---|---|---|
| **C1** | `createResource` non chiamava **mai** `assertRecordAccess`. In modo `upsert` la chiave la sceglie chi chiama: su `users` e l'email, e `password` diventa `password_hash` per strada. Un account appena registrato riscriveva la password di chiunque, compreso un indirizzo in `EASYGAME_PLATFORM_ADMIN_EMAILS` | Il confine c'era su tre porte di quattro. La quarta non aveva un controllo **sbagliato**: non ne aveva affatto — la stessa forma dei difetti di `users` e `assets` |
| **C2** | `club_access` nel corpo di una richiesta scriveva `organization_users` senza controlli. La riga modificata era la **propria**, quindi `assertRecordAccess` passava correttamente; il corpo nominava un club qualsiasi con ruolo `owner` | Il confine non veniva aggirato: veniva **spostato**. Dopo la scrittura l'attaccante era owner davvero, e ogni controllo successivo gli dava ragione a buon diritto |

Chiusi da `assertRecordAccess` in `createResource` (piu il divieto di creare
una risorsa personale per conto di un altro) e da
`assertConcessioneDiAccessoLecita`, che ammette una tessera nuova solo per il
fondatore del club, per una tessera che esiste gia con quel ruolo, o da un
amministratore del club **attivo**. Vedi ADR-0097.

### Le altre porte chiuse nella stessa tornata

- **il permesso saltato dal percorso ordinario.** Contributi, moduli e
  compilazioni: il controllo di ruolo era dentro `ensureOrganizationAccess`,
  chiamata solo quando il chiamante nominava un club. Il client non lo nomina.
  Restavano aperti a un genitore o a un atleta: quali famiglie sono a voucher e
  per quanto, le compilazioni con codice fiscale e tutori, e la **creazione** di
  un modulo a nome della societa;
- **una riga di club senza club.** `Notification.organization_id` e nullabile;
  `ensureOrganizationAccess` con `null` usciva **senza negare**. Ora
  `assertRecordAccess` nega: una riga che non dichiara a chi appartiene non e
  di chi la chiede. `assertOgniRisorsaDichiaraIlConfine` verifica che
  l'etichetta ci sia, **non** che lo schema la sappia sostenere;
- **il checkout, risolto da una parte e agito dall'altra.** Lo scope veniva
  risolto preferendo l'intestazione, il club su cui agire preferendo il corpo, e
  i due controlli erano poi eseguiti sul valore del corpo contro se stesso.
  Intestazione di A e corpo di B facevano lavorare entitlement, verifica della
  rata e apertura del checkout su B mentre la sessione parlava di A. La rotta
  non aveva **nessun** controllo di ruolo;
- **`GET /api/v1/auth/memberships`**, che sceglie le colonne a mano e percio
  non passa da `serializeRecord`: mandava l'intero `clubs.settings` — piano e
  stato dell'abbonamento, `paymentSettings`, riferimento della firma, campi
  fiscali storici — di **ogni** club dell'utente, attivo o no. Ne esce ora la
  sola parte che il client legge: le stagioni.

### Cosa presidia

- `tests/server/concessione-accesso.test.mjs` — le due porte di scrittura;
- `tests/server/permesso-senza-club-esplicito.test.mjs` — ogni lettura provata
  **due volte**, nominando il club e tacendolo: sono le due scritture della
  stessa richiesta e devono ricevere la stessa risposta;
- `tests/server/confine-righe-senza-club.test.mjs` — la riga senza club;
- `tests/server/memberships-configurazione-club.test.mjs` — la configurazione
  che non esce;
- `tests/server/checkout-session-route.test.mjs` — intestazione e corpo
  discordi, e il ruolo.

### Un rischio che resta, e non e un difetto di questo codice

`validateUserToken` (`src/lib/auth.ts`) **non valida niente**: controlla la
lunghezza della stringa e risponde `valid: true`. La pagina di verifica del
token se ne serviva per tesserare l'utente nel club, e quella strada e ora
chiusa dal lato della scrittura. La funzione resta, e finche resta e una
promessa non mantenuta: vedi il debito **W4-R6**.

### La quarta tornata: cio che una revisione trova solo dopo la correzione (2026-08-30)

Due revisioni di conferma sulle correzioni della terza tornata. Hanno trovato
**un High di sicurezza** e **un Critical di prodotto**, entrambi *creati* dalle
correzioni precedenti — che e la ragione per cui la conferma si fa.

**Una relazione annidata scavalcava il confine.** Il corpo di una richiesta
passava da un **elenco di negazione**: otto nomi di relazione cancellati a
mano. Un elenco di negazione dice cio che non passa, quindi tutto il resto
passa — e quando lo schema cambia, l'elenco resta indietro **in silenzio**.

E successo esattamente cosi. Togliendo l'unicita da `Invoice.payment_id` la
relazione inversa e diventata `invoices` al plurale, e l'elenco continuava a
negare `invoice` al singolare, che da quel momento non esisteva piu:

    POST /api/v1/payments
    {"organization_id":"<mio>","invoices":{"create":{"organization_id":"<altrui>", ...}}}

Prisma eseguiva una **scrittura annidata**: la riga figlia porta il club che il
chiamante ha scritto, e il confine vincola solo quello di primo livello. Una
fattura nasceva nel club di un altro, scavalcando `guardFiscalDocumentIntegrity`
— senza numero della sequenza, senza fotografia, senza classificazione.

La correzione non e stata aggiungere `invoices` all'elenco: e stato smettere di
tenerne uno. `togliRelazioni` chiede le relazioni di un modello allo schema,
attraverso il DMMF di Prisma. Un modello nuovo, o un nome che cambia, non ha
piu bisogno che qualcuno se ne ricordi.

**E lo scrittore di `organization_users` rimasto senza guardia.**
`syncClubMembers` era il gemello non sorvegliato di `syncUserClubAccess`:
stessa tabella, stessa superficie di scalata. Non era sfruttabile — tutti e tre
i chiamanti sono preceduti da un controllo — ma una tabella che decide i
permessi non deve avere uno scrittore sorvegliato e uno no. Ora ne ha due
sorvegliati, e la chiave che legge si chiama `memberships`: sotto `members` si
scontrava con il **libro soci**, e la creazione di un club rispondeva «Accesso
negato» dopo aver scritto il club.

### La quinta tornata: il corpo di una richiesta non e fatto solo di chiavi (2026-08-30)

**Un club si poteva intestare a un altro.** `creator_id` arrivava dal corpo e
non veniva confrontato con la sessione, e
`resolveOrganizationScopeForUser` ricava **da quella colonna** sia
l'appartenenza sia il ruolo `owner`. Si creava quindi un club — nome e
configurazione scelti da chi attacca — e lo si intestava a un altro, che se ne
trovava uno nuovo fra i propri, attivo e con ruolo di proprietario. E la stessa
forma della tessera che si firma da sola, un passo prima: li si concede
l'accesso a un club che esiste, qui se ne fabbrica uno.

**E un valore che non e un valore.** Prisma legge un **oggetto** su una colonna
scalare come un operatore di aggiornamento. Le guardie leggono
`normalized.<campo>` aspettandosi un valore semplice:

    PATCH /api/v1/payments/<id>   {"status":{"set":"paid"}}

`guardLedgerOwnedPaymentState` calcolava `String({...})` — cioe
`"[object Object]"` — non lo riconosceva fra gli stati che sorveglia, e usciva
**senza riscrivere niente**; poi `delegate.update` applicava l'operatore. Una
rata risultava saldata senza che un euro fosse entrato, che e l'invariante che
quella guardia esiste per difendere (CLAUDE.md §2: *lo stato di una rata non si
imposta, si ricava*). Con `{"amount":{"increment":5000}}` cambiava anche
l'importo, e con `{"settings":{"set":{...}}}` su un club l'intera colonna
`settings` veniva sostituita dall'involucro.

Le due correzioni sono la stessa: `togliRelazioni` non filtra piu **nomi**, ma
confronta il corpo con lo schema — toglie cio che non e una colonna, e rifiuta
un oggetto dove lo schema dichiara uno scalare. Le colonne `Json` restano
libere, perche li l'oggetto **e** il dato.

**Una lezione sul rinominare.** La tornata precedente aveva ribattezzato
`members` in `memberships` per separare le tessere dal libro soci, e la
correzione era a meta: nessuno **consumava** la chiave nuova prima della
scrittura, quindi arrivava a Prisma come argomento sconosciuto e la creazione
di un club moriva — da entrambe le schermate. Il difetto non era stato chiuso:
era stato **spostato**, e il test lo diceva verde perche il doppio di Prisma
accetta gli argomenti che non conosce.

### La sesta tornata, e cosa dice del metodo (2026-08-30)

Un **High** — e una critica al metodo che vale piu del difetto.

**`creator_id` era chiuso in creazione e aperto in modifica.** La colonna e una
scalare, quindi sopravviveva al filtro e arrivava a `delegate.update`. Con una
richiesta sola un gestore poteva **regalare il club a chiunque** — perche
`resolveOrganizationScopeForUser` ricava da quella colonna sia l'appartenenza
sia il ruolo `owner` — e nello stesso gesto **spodestare se stesso**, restando
con `activeRole` nullo. Il nuovo proprietario non compariva in nessuna
schermata delle tessere, perche di riga in `organization_users` non ne nasceva
nessuna, e non passava da `assertConcessioneDiAccessoLecita` ne dall'audit.

Chiuse nella stessa tornata: l'operatore di Prisma su una colonna scalare
passava ancora sulle **trenta risorse di club**, dove `name`, `status` e `date`
sono colonne vere; `organization_users` aveva ancora un quarto scrittore fuori
dalla guardia; il rifiuto di un corpo malformato diceva «Accesso negato», cioe
il marcatore riservato al 403, su cio che e un 400; e `togliRelazioni` **usciva
senza filtrare** se non riconosceva il modello — una guardia che si spegne da
sola sul caso che non ha previsto. Adesso `assertOgniRisorsaConosceIlSuoModello`
impedisce al file di caricarsi, come gia fa il confine.

**E la critica al metodo.** La sonda di riconciliazione era verde su
venticinque righe scritte a mano. Una revisione con mille righe ne ha trovate
**551 divergenti**, e ha mostrato perche: in ogni classe di difetto, il valore
scritto a mano era il fratello che per caso andava d'accordo — `0x1f` si,
`-0x10` no; `.9999` si, `.0004999` no; `{}` si, `{"a":"x,y"}` no.

Un elenco compilato da chi ha appena corretto un difetto tende a contenere cio
che quella correzione gestisce. La sonda ora **genera** la sua matrice
combinando forme — giorni per ore per frazioni per fusi per epoche, basi
numeriche per spaziature, valori JSON che non sono stringhe — e semina
**2.253 righe** che nessuno ha scelto perche passassero.

### La settima tornata: l'audit che non ha guardato nessun diff (2026-08-30)

Alla conferma sul round precedente si e affiancata una revisione di forma
diversa: **nessun diff, nessun commit**. Solo il dominio contabile, attaccato
dall'esterno con una domanda sola — *si possono far mentire i soldi?* — e con
550 operazioni casuali su Postgres vero.

Ha trovato **sei strade** che nessuna revisione sui diff aveva visto, perche
nessuna di esse e un errore in una riga: sono tutte proprieta emergenti.

| | Cosa | Quanto |
|---|---|---|
| F1 | Il `financial_account_id` di **un altro club** era accettato dai quattro domini che proiettano nel registro. `listFinancialAccountBalances` filtra per club **e** per elenco dei conti di quel club: quella riga non entrava in nessuno dei due saldi | rendiconto **+8.500 €**, somma dei saldi di entrambi i club **0 €** |
| F2 | Il filtro `to` arriva da un `<input type="date">` e vale **mezzanotte**: l'ultimo giorno di ogni periodo spariva da rendiconto ed export | netto sopravvalutato di **200 €**; un incasso del 31 dicembre alle 20:00 contato **zero volte** fra due periodi adiacenti |
| F3 | La capienza di un periodo maturato era letta **fuori** dalla transazione | 4 richieste su 6 accettate: **30.000 € inventati** su 10.000 maturati |
| F4 | La finestra di incasso non chiedeva il conto: ogni quota nasceva senza | «Saldo cassa e banca» sbagliato **dell'intero incassato quote** |
| F5 | Uno storno lasciava viva e numerata la ricevuta dell'incasso | registro dei documenti e prima nota discordi per **l'intero importo** |
| F7 | Il sovra-incasso rompeva l'identita di chiusura del rendiconto | **200 €** che il club tiene per la famiglia e che nessun numero nominava |

Chiuse insieme a queste: il numero di un documento **annullato** compariva in
prima nota sui movimenti propri; e la ricerca della prima nota abbassava il
testo con `toLowerCase()` di JavaScript mentre la colonna e costruita da
`lower()` di Postgres — su greco e turco **una riga non si trovava cercandola
con la propria descrizione**.

### E un difetto del doppio, che vale piu di tutti gli altri

Correggendo F2 il test di regressione passava **prima** della correzione.
`matchesWhere` in `tests/helpers/fake-prisma.mjs` chiudeva ogni confronto
d'ordine con `continue`: su `{ gte, lte }` — la forma di **ogni** filtro per
periodo — leggeva `gte` e non arrivava mai a `lte`.

Nessun test poteva quindi accorgersi di un difetto sul limite superiore di un
intervallo, e infatti nessuno se n'era accorto: F2 l'ha trovato un audit che
leggeva il database vero. Il doppio valuta ora tutti e quattro i confronti — e
la prima cosa che ha fatto e stata far fallire un test scritto da noi, che
contava le righe sbagliate.

### La nona tornata: gli allegati, che nessuna revisione aveva guardato (2026-08-30)

Un audit multi-tenant — quattro club, ruoli incrociati, doppia tessera nello
stesso club, tessera revocata — ha trovato **il dato piu riservato del prodotto
aperto a chiunque appartenga al club**.

`/api/v1/attachments` sorvegliava due soli `owner_type`: gli annunci, perche
seguono il pubblico della bacheca, e i tipi posseduti dal club. Tutto il resto
non aveva **nessun** controllo di ruolo. Eseguito con un account che nel club
era soltanto **genitore**:

    GET    /api/v1/attachments        -> l'indice di ogni allegato del club
    GET    /api/v1/attachments/<id>   -> i byte di una carta d'identita
    DELETE /api/v1/attachments/<id>   -> distrutta
    PUT    /api/v1/attachments/<id>   -> i byte di un certificato medico,
                                         riscritti dal genitore

Nessun filtro serviva: l'elenco senza parametri restituiva il club intero.

**Tre cose lo rendevano peggio di una guardia mancante.** La rotta
**dedicata** — `GET /api/athletes/:id/documents` — lo rifiutava gia: la
correzione era stata messa su una porta e non sull'altra, ed e la forma di
difetto che questa Wave ha incontrato piu volte. Un genitore poteva
**sostituire i byte** di un certificato medico lasciando intatti nome,
categoria e validita. E le letture non lasciano traccia — l'audit registra
creazione, modifica e cancellazione, non la lettura — quindi scaricare i
documenti d'identita di tutti i tesserati non produceva **nessuna** riga.

Chiuso da `src/lib/server/attachment-permissions.ts`: un allegato non ha
permessi propri, li **eredita** da cio a cui e attaccato. Un `owner_type` che
l'elenco non conosce e trattato come il piu riservato che ci sia — aggiungerne
uno senza dichiararlo lo rende quindi piu chiuso, non piu aperto.

**E gli estremi bancari che una segretaria non doveva vedere.**
`accounting.accounts_read` era applicato al saldo **calcolato**; l'IBAN e il
saldo di **apertura** uscivano da chiunque avesse `accounting.read` — gli
stessi estremi che la stessa persona non puo leggere da `/api/v1/bank_accounts`.
Il campo `balance: null` accanto era il segnale: la rotta sapeva che quel
perimetro e riservato e si era fermata una colonna prima.

**Cosa ha tenuto**, e vale dirlo: `activeRole` governa davvero — ogni superficie
della Wave 4 provata con il club sbagliato attivo ha risposto «Accesso negato»;
una tessera revocata chiude tutto **senza** rilogin, comprese le url degli
allegati; l'amministratore di piattaforma e verificato e non dedotto, e non si
auto-promuove da nessuna delle tre porte; le scritture annidate vengono tolte
in silenzio e gli operatori di Prisma rifiutati.

---

## Wave 4 — la decima tornata: l'identita, non piu il denaro (2026-08-31)

Le nove tornate precedenti avevano guardato quasi solo la contabilita. La
decima ha cambiato bersaglio: **che cosa il prodotto accetta come prova di chi
sei**. Un revisore di conferma sul lavoro del giorno prima, e un audit
indipendente che ha attaccato l'autenticazione dall'esterno — rotte pubbliche,
webhook, guardie di pagina, legame fra sessione e club.

### Il piu grave: un accesso OAuth apriva l'account di un altro

`findOrCreateOAuthUser` non aveva il parametro `emailVerified`. Il provider lo
calcolava — Google leggendo il claim, Microsoft scrivendo `true` fisso — e la
callback lo **buttava via**: era codice morto. Quando nessun `external_account`
corrispondeva, la funzione cercava l'utente **per indirizzo**, e trovandolo gli
rilasciava il cookie di sessione.

Con l'endpoint Microsoft `/common` il tenant Entra ID lo crea chiunque in pochi
minuti, e l'attributo `mail` non e legato a un dominio dimostrato: bastava
crearne uno, scriverci l'indirizzo della vittima e fare un giro di login per
entrare nel suo account — password, OTP e limiti di tentativi scavalcati tutti
insieme. E la vulnerabilita che Microsoft documenta come «nOAuth», e la sua
raccomandazione e esattamente questa: non usare il claim `email` per decidere
chi sei.

Era **latente**: `.env.example` ha entrambi i provider vuoti, quindi oggi
nessun ambiente li espone. Si sarebbe armata da sola il giorno in cui qualcuno
avesse riempito `MICROSOFT_CLIENT_ID`, senza nessun avviso.

La regola adesso:

| Situazione | Cosa succede |
|---|---|
| il provider riconosce lo stesso `sub` di sempre | entra: quell'identita e dimostrata |
| l'indirizzo e **verificato** e un account con quell'indirizzo esiste | si collega |
| l'indirizzo e **verificato** e non esiste nessun account | se ne crea uno |
| l'indirizzo **non e verificato** | rifiutato: non apre e non crea |

L'ultimo caso chiude due strade, non una. Oltre alla presa di possesso, impedisce
di **occupare** l'indirizzo di un altro con un account nuovo: chi lo occupa
resta collegato, e il legittimo proprietario che un giorno arrivasse davvero
verificato finirebbe dentro quell'account.

Microsoft dichiara l'indirizzo verificato **solo** con `MICROSOFT_TENANT_ID`
configurato su un tenant nominato: li l'amministratore e il club, e la sua
parola vale. Con `common`, `organizations` o `consumers` no.

### Ogni tessera del club apriva la cartella di un'altra famiglia

`isGuardianLinkedToUser` accettava anche `guardian.email` — l'indirizzo di
contatto che la segreteria scrive sulla scheda — come prova del legame fra un
account e un tutore. E `PATCH /api/v1/auth/user` lascia cambiare il proprio
indirizzo con qualunque altro non ancora registrato.

Chiunque avesse **una qualsiasi** tessera nel club — genitore del proprio
figlio, atleta, allenatore — poteva scrivere l'indirizzo del tutore di
un'altra famiglia e leggere di quel minore pagamenti, ricevute, fatture,
**certificati medici** e documenti d'identita, poi rimettere il proprio.

Il cambio azzera pero `email_verified_at`, e il login non rilascia sessioni a
un indirizzo non verificato: adesso il legame per indirizzo **vale solo se
l'indirizzo e verificato**. Il tutore vero non se ne accorge — per avere una
sessione ha gia dovuto dimostrare di leggere quella casella.

### E il caricamento degli allegati, che era rimasto aperto

La nona tornata aveva chiuso lettura, modifica e cancellazione degli allegati e
si era fermata a **tre verbi su quattro**: `POST /api/v1/attachments` era
sorvegliato solo per `club` e `announcement`. Un genitore poteva depositare un
file nella cartella di un atleta di un'altra famiglia — `owner_type=athlete`,
`category=certificato-medico` — e alla segreteria compariva fra i documenti di
quel ragazzo, indistinguibile da uno vero.

Nella stessa area, `sport_work` non era dichiarata fra le risorse riservate:
segreteria e collaboratore, respinti da `/api/v1/sport-work/people`, ottenevano
gli stessi documenti — documento d'identita, autocertificazione, **coordinate
bancarie** — da `/api/v1/attachments?owner_type=sport_work_person`.

### Le altre chiusure

| Cosa | Dov'era |
|---|---|
| Il limite di tentativi si azzerava aggiungendo `X-Forwarded-For`: si prendeva la voce piu a **sinistra**, che la scrive il client | `src/lib/server/auth-rate-limit.ts` |
| Il reset password giudicava la password **prima** del token: una password corta diceva se quell'`uid` esisteva, e se si era indovinato l'indirizzo | `confirmPasswordReset` |
| `isPlatformAdminSession` teneva il ramo su `users.role` anche a elenco di indirizzi configurato, mentre `isPlatformAdminUser` no: due serrature che si contraddicono sulla porta di `/api/v1/admin/*` | `src/lib/server/auth.ts` |
| Cambiare indirizzo o password non chiudeva le altre sessioni: una sessione presa in prestito diventava proprieta definitiva | `PATCH /api/v1/auth/user` |
| `/sport-work` non era fra i `PROTECTED_PREFIXES` e non ha un layout con `AccessAreaGuard`: la pagina dei compensi si apriva **senza sessione** (le rotte reggevano) | `src/middleware.ts` |
| Una rotta raggiungibile da un utente eseguiva `DROP INDEX` / `CREATE UNIQUE INDEX` su P2002, cioe si riparava lo schema da sola | `auth/access/redeem` |
| Il guardiano UUID non riconosceva nessuno UUID (mancava un trattino): chiedere l'atleta di un altro non otteneva un rifiuto ma il proprio primo figlio | `src/lib/server/parent-dashboard.ts` |

### Cosa l'audit ha trovato **pulito**

Vale registrarlo quanto i difetti, perche dice dove non serve tornare.

- **I due webhook.** Corpo letto come testo prima di qualunque parse, firma
  verificata prima di toccarlo, `timingSafeEqual` dietro un controllo di
  lunghezza, solo schema `v1`, tolleranza di 300 secondi sul timestamp,
  rifiuto (503, non 200) quando manca il segreto, replay chiuso da
  `(provider, event_id)`. Una chiamata non verificata non muove niente.
- **L'enumerazione al login.** Confronto bcrypt fittizio sul ramo negativo, un
  solo messaggio, indirizzo normalizzato in minuscolo perche il secchiello per
  identita non si possa spezzare cambiando maiuscole.
- **Il meccanismo OTP.** Codici salvati come SHA-256, TTL applicato, tentativi
  fermi a cinque con la sfida bruciata, consumo unico, sfide precedenti
  invalidate al rinvio. `AUTH_ALLOW_TEST_CODES` richiede **anche**
  `NODE_ENV !== "production"`.
- **Il token di reset.** 32 byte casuali, salvato solo come hash, confrontato
  in tempo costante, TTL di 30 minuti, uno solo vivo per utente, e tutte le
  sessioni cancellate nella stessa transazione della scrittura.
- **Il legame fra sessione e club.** Un `x-active-access-role: owner` forgiato
  produce `activeRole = null`, cioe un rifiuto, non una promozione. Non e stata
  trovata nessuna strada per cui una sessione del club A agisca sul club B.

---

## Undicesima tornata — dove il prodotto incontra chi non ha fatto login (2026-08-31)

Audit indipendente sul perimetro esterno: link di pagamento, checkout Stripe,
moduli pubblici, entitlement, e la riconciliazione del denaro che arriva da
fuori.

### Il checkout autenticato accettava URL di ritorno su qualunque dominio

`POST /api/payments/create-checkout-session` validava `successUrl` e
`cancelUrl` solo come «e un URL». Chi ha accesso ai pagamenti del club —
quattro ruoli su sette, segreteria compresa — poteva aprire un checkout vero,
per una rata vera, con il ritorno su un dominio proprio, e mandare alla
famiglia il link Stripe **autentico**. La famiglia paga su una pagina genuina,
con il marchio del suo club, e subito dopo il pagamento riuscito — il momento
di massima fiducia — finisce su «carta rifiutata, reinserisci i dati».

`payment-links.ts` questo attacco lo aveva gia previsto e lo rifiuta da tempo
sulla rotta pubblica, costruendo gli URL dal solo ambiente configurato. Il
gemello autenticato non aveva ricevuto la stessa cura. Adesso gli URL devono
appartenere all'origine configurata, e senza ambiente configurato il checkout
non si apre.

### Una compilazione anonima raggiungeva la bacheca di tutto il club

`notifyClub` prendeva `club.creator_id` piu **ogni riga** di
`organization_users`, senza filtro di ruolo — e quella tabella contiene anche
genitori e allenatori, perche il riscatto di un token di accesso ci scrive
dentro il ruolo che il token nomina.

Erano tre cose insieme: il nome dichiarato da chi compila un modulo pubblico
veniva diffuso a **tutte le famiglie** del club invece che alla sola
segreteria; chiunque conoscesse lo slug — che e il link di iscrizione, e si da
a tutti — aveva un canale di testo verso quelle bacheche; e una richiesta
produceva N email, con la reputazione SMTP del club in gioco.

Adesso il destinatario e chi puo leggere i moduli, che e la stessa domanda che
governa la schermata delle compilazioni, e il nome entra come una riga sola e
corta.

Nella stessa area, i campi `signature` saltavano del tutto il controllo sul
tipo del file invece di essere fissati a un'immagine: non ne usciva uno stored
XSS — `createAttachment` rivalida e cio che non e visualizzabile in linea viene
servito come allegato con `nosniff` — ma allargava i tipi accettati da sette a
quindici da una porta che non doveva aprirsi.

### Cosa l'audit ha trovato pulito

- **I link di pagamento.** Token da 32 byte casuali, solo l'hash SHA-256 nel
  database, confronto in tempo costante, un unico 404 per ogni caso negativo,
  due contatori di tentativi consumati prima di qualunque lavoro sul database.
  L'importo **non e congelato**: si ricalcola dal registro a ogni apertura,
  quindi un link riusabile non e un link riscuotibile due volte. Valuta fissata
  nel codice, beneficiario preso da `club_payment_accounts`, URL di ritorno
  costruiti dal solo ambiente.
- **Il checkout, a parte gli URL.** Importo calcolato dal server e limitato dal
  residuo; un `clubId` nel corpo che contraddice la sessione viene rifiutato,
  non preferito; provider, conto connesso e commissione vengono dallo stato del
  server. `checkout-status` chiede sessione, club attivo e
  `accounting.read`: non si sonda la sessione di un altro club.
- **I moduli pubblici.** Club, modello, versione e stato derivati dallo slug;
  dal client arrivano solo risposte e file. Nessun mass assignment:
  `validateAnswers` scorre i campi dichiarati e scarta tutto il resto, compreso
  un valore mandato al posto di un allegato. La dimensione si controlla prima
  di leggere i byte.
- **Billing ed entitlement.** Piano, abbonamento e override stanno fra le
  chiavi di proprieta della piattaforma, e `withPlatformOwnedSettings`
  ripristina il valore salvato e registra il tentativo — su **tutti** i
  percorsi di scrittura, compresi creazione e upsert. `livemode` si verifica
  prima della deduplica e prima di qualunque scrittura, dalla chiave segreta e
  non da una variabile d'ambiente che puo restare indietro.
- **La deduplica economica.** La meta «due righe» e chiusa davvero: dedup
  sull'evento, dedup sui due nomi che Stripe da allo stesso denaro ancorata al
  PaymentIntent — quindi indipendente dall'ordine di arrivo — e la corsa
  leggi-poi-scrivi arbitrata dall'indice unico parziale. La meta «zero righe»
  era invece aperta, ed e il difetto corretto in questa tornata.

### La conferma sulla decima tornata, e cosa ha trovato

Due correzioni della decima tornata erano incomplete, e le ha trovate la
revisione di conferma — non l'audit esterno.

**L'indirizzo verificato tornava dalla porta di servizio.** Il ramo OAuth
«stesso `sub`» ristampava `email_verified_at` senza confrontare l'indirizzo
del provider con quello che l'account porta adesso: collegare il proprio
account, cambiare indirizzo con quello del tutore di un'altra famiglia e
rientrare dal provider rimetteva la verifica, e con essa il legame per
indirizzo che la decima tornata aveva appena chiuso. Vedi
[07 — Autenticazione](07-authentication.md).

**E l'audit registrava l'indirizzo che il chiamante sceglieva.**
`src/lib/server/audit.ts` conteneva una seconda copia di «qual e l'indirizzo di
chi bussa», con la voce piu a sinistra di `X-Forwarded-For`. Corretta la copia
dei limiti di tentativi e non questa, restavano due idee diverse dello stesso
fatto — la forma di difetto che la stessa tornata aveva corretto sul controllo
dell'amministratore di piattaforma. Non e un aggiramento di controlli, ma
corrompe il registro su cui ci si basa dopo: chi attacca sceglieva l'indirizzo
delle proprie righe, tentativi di accesso falliti e accessi negati compresi.
Adesso `getRequestIp` e l'unica implementazione.

**Due dei test nuovi non potevano fallire.** Verificavano che chi amministra
legga e un genitore no, per ogni `owner_type` — proprieta vera **anche** per un
tipo non dichiarato, perche la ricaduta e su `clubs`. Dicevano di legare la
mappa alla sua fonte e non la legavano: ora il confronto e fra insiemi di
chiavi, e un `owner_type` nuovo senza decisione fa fallire il test.

---

## Dodicesima tornata — cio che esce verso persone reali (2026-08-31)

Audit indipendente su motore delle audience, notifiche, invio email e job
schedulati; piu la conferma sulla tornata precedente.

### Una notifica «di club» e una notifica a tutti, e portava i dati di una famiglia

Nel modello `Notification`, `user_id: null` vuol dire «di societa». Il prodotto
pero lo legge come **«di tutti»**: `getParentDashboardData` interroga
`OR: [{ user_id: userId }, { user_id: null }]` e restituisce la riga **intera**,
campo `data` compreso.

I due scrittori dell'area genitore usavano quella forma. La richiesta di
appuntamento di una famiglia arrivava nella bacheca di ogni altra famiglia con
dentro, per esteso: nome del genitore, indirizzo email, telefono, nome del
minore e il motivo scritto a mano. Bastava aprire la propria pagina per
leggerle tutte, e rileggerla ogni giorno per raccogliere la rubrica del club.
Il caricamento di un documento era la stessa cosa, con in piu il titolo scritto
dalla famiglia — testo libero e di lunghezza non controllata.

**La cosa che conta piu del difetto: era la terza volta.** La stessa forma era
gia stata trovata e chiusa nel giro delle automazioni e nello scheduler del
lavoro sportivo, e in entrambi i casi la correzione era rimasta **privata al
suo modulo**. Due copie della stessa regola sono il modo in cui la terza nasce
gia sbagliata. La regola adesso ha un proprietario —
`src/lib/server/club-notifications.ts` — e i tre scrittori passano di li.

### E il destinatario lo sceglieva chi scrive

`notifications` sta fra le risorse che un **allenatore** puo creare. Il CRUD
generico forza `organization_id` al club attivo e **non guardava `user_id`**:

- `{"user_id": null}` recapitava testo arbitrario a ogni account del club —
  proprietario, segreteria, genitori, atleti: lo stesso pubblico del motore
  delle audience, senza il motore, senza registro delle consegne e senza audit;
- `{"user_id": "<uuid di chiunque>"}` faceva partire una email vera, dal server
  del club, verso un account di **un'altra societa**, perche
  `sendNotificationEmails` risolve l'utente senza filtro di club.

Adesso una notifica si indirizza a una persona, e quella persona deve
appartenere al club. Vale in creazione **e** in modifica: spostare una notifica
gia scritta su un altro destinatario e la stessa cosa che scriverla li.

### Una compilazione anonima raggiungeva tutte le famiglie

`notifyClub` non filtrava per ruolo, e `organization_users` contiene anche
genitori e allenatori. Il nome dichiarato da chi compila un modulo pubblico
veniva diffuso a tutto il club, chiunque conoscesse lo slug — che e il link di
iscrizione — aveva un canale di testo verso quelle bacheche, e una richiesta
produceva N email.

### Cosa l'audit ha trovato pulito

- **L'autorizzazione dei cron.** Tutti e cinque i job passano da
  `authorizeCronRequest`: segreto mancante e **rifiuto 503, non bypass**,
  confronto a tempo costante, gemelli `POST` ciascuno con il proprio permesso.
  Il riavvio ripetuto e innocuo — le consegne si reclamano in modo atomico, le
  notifiche del lavoro sportivo sono per chiave, e nessun cron muove denaro.
- **Il motore delle audience.** Il club si fissa dalla sessione e un club nel
  corpo viene rifiutato; un criterio sconosciuto **solleva** invece di
  allargare; `athlete_ids` si interseca con il club nella query; il criterio
  economico e sorvegliato dal permesso al criterio, non alla pagina. Il client
  non fornisce mai un elenco di destinatari.
- **La bacheca.** Leggere un allegato di annuncio richiede il club dell'allegato
  **e** una consegna reale verso chi chiede.
- **L'invio email.** Nessuna iniezione di intestazioni (nodemailer toglie CR/LF),
  mittente sempre dalla configurazione, nessun `replyTo`, template con escape e
  segnaposto economici negati per difetto, errori normalizzati senza indirizzi.
- **Il rollover di stagione.** Riservato a proprietario e gestore con audit del
  rifiuto, club dalla sessione, doppia esecuzione idempotente, e nessuna riga di
  denaro scritta — quindi un doppio giro non puo duplicare importi.

### Una precisazione sulla tornata precedente

La correzione sulla riconsegna dei webhook diceva di coprire anche «il timeout
della funzione mentre si interroga il provider». **Non lo copriva.** La ripresa
agisce sulle righe `failed`, e una riga finisce in `failed` solo se l'errore
viene **catturato nel processo**: una funzione uccisa dalla piattaforma lascia
la riga in `processed`, cioe indistinguibile da un evento concluso.

La chiamata verso Stripe adesso ha un limite di tempo
(`STRIPE_HTTP_TIMEOUT_MS`, 10 secondi), che trasforma la causa piu probabile —
una chiamata appesa — in un errore gestibile, quindi in una riga `failed` che
si riprende. Resta scoperto il caso in cui la funzione muoia per altro
(esaurimento memoria, terminazione della piattaforma): e registrato in W4-R17
insieme alle righe `failed` che nessuno rilegge.

---

## Tredicesima tornata — la chiusura: cancellazioni, mobile, export, sedi (2026-08-31)

Quattro revisori in parallelo sull'ultimo perimetro non ancora battuto, piu la
conferma sulla tornata precedente. **E l'ultima tornata della Wave 4.**

### Il filo comune, che spiega tre difetti insieme

> Ogni guardia di questo prodotto e scritta sul **nome della risorsa** che si
> cancella, mentre Postgres distrugge per **raggiungibilita**.

Il prodotto rifiuta `DELETE /api/v1/invoices/<emessa>` spiegando che un buco
nella numerazione non e spiegabile. Non sapeva niente di cio che una
cancellazione **un livello piu su** — un club, un utente — o **di fianco** — un
atleta — si porta dietro. Misurato sul database di sviluppo: la chiusura
`CASCADE` da `clubs` tocca **cinquantaquattro tabelle**, e `clubs.creator_id`
e a sua volta `CASCADE`, quindi cancellare una persona cancellava ogni club che
aveva creato.

| Cosa | Adesso |
|---|---|
| Cancellare un account **pubblicava** le sue notifiche: `notifications.user_id` era `SET NULL`, e `NULL` significa «di tutti» per l'area genitore | `CASCADE`: una notifica indirizzata a chi non c'e piu se ne va con lui |
| Cancellare un **atleta** distruggeva `funding_settlement_lines`: la liquidazione restava con l'importo intero e senza beneficiari | Guardia applicativa piu `RESTRICT` sul database |
| `DELETE /api/v1/clubs/<il proprio>` cancellava 54 tabelle aggirando ogni guardia fiscale | Rifiutato se il club ha emesso documenti |
| Le due rotte admin non lasciavano **nessuna traccia** | Audit su esito e su rifiuto; cancellare un utente che possiede club e rifiutato; per un club con storia fiscale serve `force=true`, ed e registrato |

La richiesta di cancellazione che **pubblicava** i dati invece di toglierli e
il difetto piu istruttivo della tornata: la dodicesima aveva dato un
proprietario alla regola sulle notifiche e corretto i tre scrittori
applicativi. Il quarto scrittore era il **database**, e nessun modulo poteva
vederlo.

### Il rendiconto per sede diceva zero euro

Misurato su un club a due sedi: **tutte le sedi** 9 righe e 430,02 EUR, **per
sede** 0 righe e 0,00 EUR. Dei cinque rami della vista del registro solo il
primo portava una sede; gli altri quattro scrivevano `NULL`, e gli incassi
delle famiglie stanno tutti in uno di quei quattro. Il filtro era
un'uguaglianza stretta, quindi selezionare una sede **svuotava** il rendiconto,
senza avviso, e lo stesso CSV finiva al commercialista.

Due correzioni, perche una sola non basta: la vista ora prende la sede dal
conto (era a un campo di distanza, e i rami univano gia quella tabella per
leggerne il nome), e il filtro lascia passare cio che una sede non ce l'ha —
la regola di ADR-0038, che il commento del rendiconto **dichiarava** proprio
sopra un codice che faceva l'opposto. La sede di un movimento si valida ora
come quella di un conto: dichiararne una che non esiste non e piu ammesso.

### Il mobile e pulito

Nessun Critical, nessun High. ADR-0018 regge — nessun ORM, nessuna stringa di
connessione, e la guardia CI e reale. Il token vive solo in `expo-secure-store`,
non finisce mai nei log, e non esce verso host diversi da quello configurato.
Isolamento tenant: il client manda solo `x-active-club-id`, che il server
valida; il ruolo memorizzato localmente non raggiunge **mai** una decisione di
autorizzazione, perche viene sempre riderivato dalle appartenenze. Nessun dato
di atleti o certificati medici viene scritto su disco.

Corretto un difetto reale sotto l'eccezione di sicurezza di ADR-0025: **uscire
non revocava la sessione**. Il token restava valido per i suoi quattordici
giorni — ed e proprio quello che si fa quando si perde il telefono.

### Export

Nessun export restituisce campi che chi lo chiede non potrebbe gia vedere, e
nessuno porta IBAN, hash o token. Corretti due difetti del tracciato dei bandi:
usava una copia privata dell'escape che **non proteggeva il ritorno a capo** —
un nome incollato da Windows inventava una beneficiaria dentro una
rendicontazione pubblica — e non neutralizzava le formule.

---

## Wave 5 — 5A: tre difetti che i gate non vedevano (2026-09-01)

Tre superfici del prodotto non funzionavano con 3.632 test verdi, typecheck
pulito e build a 153 rotte. Sono difetti che stanno **fra il clic e la rete**, o
dentro un `catch` che restituisce `{}`: un test che sostituisce il trasporto non
li vede.

### D-1 — Le richieste di appuntamento delle famiglie si cancellavano da sole — RISOLTO

`POST /api/parent-dashboard/:id/appointments` scriveva la richiesta **solo** in
`clubs.appointments`, con un `prisma.club.update` diretto che aggira
`resources.ts`. Non toccava `club_resource_items`.

`syncClubAggregateField` **rigenera `clubs.appointments` da zero** a partire da
`club_resource_items`, a ogni create, update e delete del CRUD generico. La
prima operazione della segreteria da `/api/v1/appointments` avrebbe cancellato
**tutte** le richieste in attesa: nessun errore, nessun audit, nessuna traccia.

`appointments` e adesso una risorsa **chiusa** (`RESOURCE_BOUNDARIES`), come
`assets`. La chiusura non vive piu solo in `ensureResource` dentro i due route
handler: `assertResourceIsOpen` sta nelle cinque funzioni pubbliche di
`resources.ts`, perche una rotta e una porta fra tante. La segreteria continua a
passare da `PATCH /api/v1/clubs`, che rilegge l'array intero prima di
riscriverlo — il verso sicuro della sincronizzazione. E provvisorio: il dominio
proprio dell'appuntamento arriva in 5E.

Copertura: `tests/server/appuntamenti-non-si-cancellano.test.mjs`.

### D-2 — La dashboard allenatore interrogava otto volte una risorsa vietata al ruolo — RISOLTO

Otto letture finivano su `GET /api/v1/clubs?fields=…`. `clubs` sta in
`MANAGEMENT_ADMIN_ONLY_RESOURCES`: rispondevano **403**. `getClubSettings`
inghiottiva l'errore e restituiva `{}`, e da li la configurazione dei permessi
trainer **non raggiungeva mai la sessione di un allenatore**, il pannello
«Programmazione» era sempre vuoto, e annullare un allenamento o salvare le
convocazioni falliva.

Conseguenza di sicurezza vera e propria: **ogni caricamento della dashboard
allenatore scriveva circa sette righe di audit `resource.access_denied`** su un
club che funzionava normalmente. Un registro rumoroso a quel punto nasconde un
attacco vero.

Adesso: `GET /api/v1/trainer/preferences`, che il ruolo puo aprire e da cui esce
**solo** cio che serve a disegnare la dashboard. Le due scritture passano da
`PATCH /api/v1/trainings|matches/:id` (`src/lib/trainer-club-items.ts`), che il
ruolo ha in `TRAINER_WRITE_RESOURCES` e che **non riscrive l'intera
collezione**.

### D-4 — Il dato clinico dei minori era mascherato solo dal browser — RISOLTO

Vedi [08 — Ruoli e permessi](08-roles-and-permissions.md). Il flag
`viewMedicalStatus` nasceva `true` e compariva in diciannove componenti,
**zero** moduli server: le schede erano nascoste, il dato usciva comunque da
`GET /api/v1/athletes` e da `GET /api/v1/medical_certificates`. Violava ADR-0058
alla lettera e cadeva sotto ADR-0019, su dati sanitari di minori.

Adesso il contenuto clinico esce dalla proiezione di chi non ha `clinical.read`.
Senza `scope` — le letture interne del server — non si toglie niente: hanno gia
il loro confine e devono poter promuovere un certificato o calcolare una
scadenza.

### D-5 — Il perimetro atleti dell'allenatore lo decideva il client — RISOLTO

Vedi [08 — Ruoli e permessi](08-roles-and-permissions.md).

### D-3 — Un genitore con piu figli non raggiungeva il secondo — RISOLTO

Non e un difetto di sicurezza ma di **coerenza fra due proprietari** della
stessa domanda, e la classe merita di essere registrata qui: quando due moduli
rispondono diversamente a «chi sono i figli di questo utente», uno dei due
autorizza e l'altro nega, e nessuno dei due e evidentemente sbagliato. Il
proprietario e adesso uno solo.

---

## Wave 5 — 5I: l'anagrafica di un collega non e il dato dell'allenatore — RISOLTO (2026-09-01)

Segnalato dalla lane 5I mentre lavorava su un'altra cosa, e corretto in 5H.

`trainers` e `staff_members` stanno in `TRAINER_READ_RESOURCES` per una ragione
buona: la dashboard deve sapere **chi allena cosa** — i nomi, le categorie, il
legame con un account. Ma sono collezioni JSON del club, e uscivano **per
intero**: `GET /api/v1/trainers` restituiva a chiunque avesse il ruolo
allenatore in quel club il **codice fiscale, l'indirizzo e il telefono** di ogni
collega.

E la stessa forma di D-4: una schermata che mostra solo cio che serve, e una
risposta che porta tutto. La schermata dell'allenatore mostrava soltanto il
proprio record; il dato usciva comunque.

**La difesa e un elenco di cio che puo uscire**, e non di cio che va tolto — e
la differenza conta: un campo nuovo sulla scheda di un collaboratore nasce cosi
**invisibile** all'allenatore, e chi lo aggiunge non deve ricordarsi di niente.
La riduzione vive in `serializeRecord`, sul ramo delle risorse di club, e vale
anche sul `payload`: una proiezione che guardasse solo il primo livello
perderebbe esattamente il campo che conta.

Copertura: `tests/auth/anagrafica-colleghi.test.mjs`, che comprende la prova che
un campo inventato domani non esce.

## Wave 5 — 5I: gli avvisi dell'allenatore li calcolava il client — RISOLTO

`POST /api/v1/trainer/operational-alerts` riceveva gli avvisi **gia
confezionati** e li persisteva: l'unico controllo era che il `type` fosse uno
dei due ammessi, mentre titolo, testo, record citato e link li dettava il
browser. Tre conseguenze, tutte vere insieme:

- una notifica con il testo che si vuole, riferita a un evento qualsiasi;
- un avviso vero **spento** semplicemente non mandandolo, perche la rotta segna
  risolto tutto cio che non riceve;
- l'unica copia della regola «questa presenza manca» viveva nel browser: chi non
  apriva la dashboard non aveva notifiche, e il club non aveva modo di saperlo.

Adesso il contenuto lo calcola `src/lib/server/trainer-area.ts` dai dati del
club, con il perimetro applicato da `listClubEvents`, e il corpo della richiesta
**non viene letto**.

## Wave 5 — 5H: la famiglia decide sui propri consensi — NUOVO PERIMETRO

La famiglia puo adesso accettare e revocare i consensi del proprio atleta, e il
gate e il **legame**, verificato **dentro il dominio** e non nella rotta
(ADR-0094): una rotta nuova non deve poterlo dimenticare.

Tre restrizioni, tutte provate:

1. il soggetto deve essere `athlete` e coincidere con l'atleta del contesto —
   dal contesto del figlio A non si decide per il figlio B. E la forma dell'OR
   permissivo che 5E ha chiuso sugli appuntamenti, e qui non nasce;
2. lo scope della famiglia ha `activeRole: null` di proposito: senza il legame
   dichiarato si ricade sul controllo di ruolo, che risponde sempre «no»;
3. la sorgente registrata e `subject`, distinta da `manual`: «l'ha spuntata il
   tutore, autenticato» ha un valore probatorio diverso da «gliel'ha spuntata la
   segreteria», e chi legge il registro un anno dopo deve poterlo distinguere.

**L'evidenza di rete e la riga di audit**, che porta indirizzo e user agent e
cita l'identificativo della decisione. L'evidenza di un consenso e un puntatore
e non una copia (ADR-0090): copiare l'indirizzo IP nel registro dei consensi
vorrebbe dire tenerlo in due posti con due politiche di conservazione diverse.

## Wave 5 — 5H: la ricevuta si scarica per legame, non per ruolo

`GET /api/v1/documents/receipt/:id` chiedeva `canAccessClubResource(role,
"receipts", "read")`, che un genitore non ha: le ricevute erano **elencate**
nell'area famiglia e non scaricabili. Una famiglia vedeva l'importo versato e
non poteva stampare la carta che lo dimostra, cioe la sola cosa per cui una
ricevuta esiste.

Il gate di legame **affianca** quello di ruolo, non lo sostituisce, e vale solo
per i documenti del proprio figlio.

## Wave 5 — 5J: cio che la sonda di sicurezza ha misurato (2026-09-01)

`scripts/wave-5-security-probe.mjs` esegue U-15 (undici tentativi cross-tenant)
e U-16 (le sedici chiavi nuove del §12, ognuna negata a un ruolo che non la
possiede e concessa a uno che la possiede) contro il database di sviluppo.
Prima esecuzione: **61 controlli su 93**. Cio che ha trovato, e come e stato
chiuso.

### Nessun diniego lasciava una riga — RISOLTO

Quattordici chiavi su diciotto rifiutavano correttamente, e **zero** di esse
scrivevano in `audit_logs`. Il `recordAuditEvent({outcome: "denied"})` che il
§12 chiede viveva in **quattro route handler su diciassette**: il registro
raccontava i dinieghi di quattro porte e taceva sulle altre tredici — il modo
peggiore di avere un registro, perche si crede di sapere e si sa un quarto.

La traccia e stata messa dove il diniego si **decide** — nelle guardie di
dominio — e non dove si compone il 403: il 403 lo compone ognuna delle
settantaquattro rotte per conto proprio, mentre la guardia e una per dominio.
Chi aggiunge domani una funzione al dominio eredita la traccia senza sapere che
esiste; chi aggiunge una rotta no.

Le guardie sono diventate `async` per poterla **aspettare**: una scrittura
lanciata e non attesa, su un runtime serverless, corre contro la fine della
richiesta, e il tentativo che piu importa tracciare — quello ripetuto e sempre
rifiutato — sarebbe anche quello che finisce prima.

Il prezzo e un pericolo silenzioso: una guardia `async` chiamata senza `await`
restituisce una promessa e **non lancia**, quindi non ferma niente, e il
compilatore non se ne accorge. Lo presidia `tests/server/guardie-attese.test.mjs`,
che rilegge i sorgenti e pretende l'`await` su ognuna delle ventisette chiamate.

Tracciano il diniego: `events.ts`, `appointments.ts`, `document-requests.ts`
(per ruolo **e** per legame), `rsvp.ts`, `consents.ts`, e le due guardie
cliniche di `resources.ts`. L'azione e sempre `permission.denied`, con la
chiave nel metadato.

### `clinical.manage` e `clinical.status_read` erano dichiarate e mai chieste — RISOLTO

`assertHealthPermission` non era chiamata da nessun modulo server: **registrare
un certificato medico non passava da nessuna chiave**. `clinical.status_read`
compariva solo in una schermata, che la usava per descriversi.

Ora il registro generico le applica: `assertClinicalWrite` sulla creazione,
modifica e cancellazione di una risorsa clinica — e sulla scrittura dei **campi**
clinici di una scheda atleta, non su ogni scrittura di anagrafica —
`assertClinicalRead` sulla lettura.

**Oggi non tolgono niente a nessuno, ed e il punto**: i ruoli che hanno le
chiavi sono esattamente quelli che gia scrivevano e leggevano. Cambia **da
dove** si passa, cosi che il giorno dei ruoli personalizzati (Wave 6) la scelta
di un club abbia un posto in cui essere applicata.

### `clinical.read` non nega: proietta — DEVIAZIONE DICHIARATA

Non e cio che il §22 chiede, e resta cosi deliberatamente: negare l'elenco degli
atleti a un allenatore perche non puo vedere le allergie renderebbe inservibile
la sua dashboard, mentre il dato clinico resta comunque fuori dalla risposta. Il
§22 descrive la forma giusta per le chiavi che proteggono un **atto**; questa
protegge un **campo**, e un campo si toglie. Il taglio e misurato sul dato vero
nella sezione D-4 della sonda, che verifica anche il verso opposto — al
collaboratore i campi arrivano.

La sonda la registra come `DEVIA`, che non e ne un successo ne un difetto: una
sonda che non puo essere portata a verde e una sonda in cui una regressione vera
si confonde con il rumore, ma un `PASS` avrebbe nascosto una scelta che merita
di essere riletta.

### `rsvp.answer` aveva due matrici che si contraddicevano — RISOLTO

Il catalogo la concedeva alla gestione e la negava a genitore e atleta;
`communications/permissions.ts` — che e quella che **decide**, via
`assertCommunicationPermission` dentro `answerRsvp` — faceva esattamente il
contrario. Due tabelle in disaccordo su sei ruoli su sette: una schermata che
avesse creduto al catalogo avrebbe mostrato alla segreteria un pulsante che il
server rifiuta, e nascosto alla famiglia l'unica cosa che le e chiesto di fare.

Il catalogo e stato allineato a chi decide: `roles: ["parent", "athlete"]`.
Resta vero che su questa chiave **nessun ruolo puo essere negato**, perche il
ruolo con cui si risponde e derivato dal legame appena verificato: la porta
chiusa e il legame assente, e da questa Wave lascia la sua riga di audit.

### `consents.decide_own` non esisteva — RISOLTO

Il §12 la elencava; nel catalogo c'era solo `consents.decide_for_others`, che e
il permesso opposto. La capacita esisteva — una famiglia accetta e revoca dalla
propria area — ma **senza un nome**, e cio che non ha un nome non si elenca in
una schermata ne si concede a un ruolo personalizzato.

E in catalogo con `roles: []` e `byLink: true`, e l'elenco vuoto non e una
dimenticanza: questo permesso non si ottiene mai da un ruolo. Lo scope della
famiglia porta `activeRole: null` proprio perche ogni controllo di ruolo
risponda «no» e l'unica strada resti il legame.

### Uno scope contraffatto passava ogni confine — RISOLTO

L'undicesimo tentativo di U-15 non chiede una riga altrui con il proprio club
attivo — quella la ferma `belongsToActiveClub` — ma presenta uno **scope
incoerente**: `activeOrganizationId` di un club, `allowedOrganizationIds` di un
altro. Quattro chiamate su quattro riuscite: titolo di un evento del club A
riscritto, appuntamento del club A portato a `confirmed`.

Non era sfruttabile via HTTP — `resolveOrganizationScopeForUser` resta l'unico
costruttore di scope, e la sonda ha verificato che con l'utente del club B
restituisce il club B — ma «non c'e oggi una seconda strada» e una proprieta che
vale finche qualcuno non ne scrive una.

`assertActiveClub` verifica adesso, **prima** di guardare qualunque riga, che il
club attivo sia fra quelli a cui l'account appartiene. **Non riapre ADR-0094**:
quella decisione vieta di giudicare l'appartenenza di una **riga** con
`allowedOrganizationIds`, e resta intatta. Qui si giudica la coerenza dello
**scope**, che e una domanda diversa e precedente. Un elenco vuoto non blocca
niente, perche lo scope della famiglia nasce dal legame e non dalla membership.

### Il conto del §12 non tornava — RISOLTO

Il testo diceva «17 chiavi nuove» e la tabella ne marcava 16. Corretto sul
numero che si puo contare: quando la tabella e l'elenco di cio che va provato,
chi collauda non sa quale delle due credere e cerca una diciassettesima chiave
che non esiste.

### Esito finale

**91 controlli su 91**, con una deviazione dichiarata (`clinical.read`).

## Wave 5 — l'audit indipendente, e le tredici cose che ha trovato (2026-09-01)

Due revisioni ostili indipendenti sul diff completo della Wave (`f92c9b6..HEAD`,
15 commit, 34.091 righe): una sul confine e sui permessi, una sulla
**raggiungibilita** di cio che era stato dichiarato COMPLETE.

Il confine multi-tenant ha retto: nessuna riga di un club leggibile dalla
sessione di un altro. Il resto no.

### C-1 — I byte di un certificato medico uscivano verso l'allenatore — RISOLTO

Il taglio di D-4 toglie `attachment_id`, `file_url` e `certificate_url` dalla
proiezione del certificato, e `GET /api/athletes/:id/documents` rifiuta un
allenatore. Ma i **byte** stavano dietro un cancello piu vecchio: il fascicolo
deposita ogni documento con `ownerType: "athlete"`, e `athlete` eredita da
`athletes`, che l'allenatore legge legittimamente.

Tre porte sullo stesso certificato di un minore, due aperte e una chiusa —
`/api/v1/attachments` in elenco, `/api/v1/attachments/:id` per i byte,
`/api/athletes/:id/documents/:id/file` per gli stessi byte — e **nessun
perimetro di gruppo**: valeva per ogni atleta del club.

La regola dell'ereditarieta resta e resta giusta; quello che si e aggiunto e che
su un documento **sanitario** l'eredita non basta, perche il permesso di vedere
gli atleti non e il permesso di vedere il loro dato clinico.
`canAccessAttachmentOwner` accetta ora la **categoria** e pretende
`clinical.read` quando `isMedicalCertificateDocumentKind` la riconosce — un solo
elenco di nomi, quello del fascicolo. L'elenco filtra le righe cliniche, perche
un identificativo e gia il primo passo verso i byte.

Va detto per intero: **la porta non era nuova.** `medical_certificates` stava in
`TRAINER_READ_RESOURCES` da prima della Wave 5. La Wave 5 ha creato la regola e
l'ha applicata a una porta su tre, e nel farlo ci ha spostato dentro i byte del
fascicolo nuovo.

### H-1 — Due NULL non collidono, e lo slot senza operatore non era protetto — RISOLTO

`appointments.ts` dichiara che la doppia prenotazione la impedisce il database.
L'indice era `UNIQUE (organization_id, assigned_to_user_id, starts_at) WHERE
status IN ('requested','confirmed')`, e in PostgreSQL due `NULL` non sono uguali
fra loro. `assigned_to_user_id` e nullo in due configurazioni tutt'altro che rare
— uno slot senza titolare, e il **ripiego sugli orari di apertura**, che il
modello stesso definisce «la forma piu diffusa fra i club che non hanno mai
aperto quella schermata».

Per quei club l'indice non scattava mai e restava una lettura seguita da una
scrittura, fuori transazione: due famiglie che confermano lo stesso orario nello
stesso istante ottenevano due appuntamenti, senza errore e senza traccia.

Migrazione `20260901150000_wave5_slot_senza_operatore`: l'indice diventa su
espressione, con `COALESCE(assigned_to_user_id, '00000000-…-000000000000')`. La
colonna resta nullabile perche il nullo **significa** qualcosa — «questo posto e
della segreteria, chiunque risponda» — e un valore fittizio sulla colonna
renderebbe illeggibile quel fatto a ogni lettura futura, per proteggere una
scrittura.

> **La sonda lo sapeva e non lo diceva.** `wave-5-concurrency-probe.mjs`
> configurava di proposito lo slot **con** un operatore, con il commento «in
> Postgres due NULL non collidono». Misurava la configurazione in cui il vincolo
> funziona; il prodotto permetteva l'altra. E una lezione sul collaudo, non sul
> codice: una prova che sceglie i dati in cui la difesa funziona non misura la
> difesa.

### H-2 — Tre oracoli di esistenza cross-tenant — RISOLTO

`loadRequest` e `loadSubmission` cercavano la riga **senza** filtro di club e la
facevano poi cadere su `assertActiveClub`. La difesa reggeva — nessun contenuto
usciva — ma le due frasi non erano la stessa: «non e stata trovata» per un
identificativo inventato, «non appartiene al club attivo, o non esiste» per uno
di un altro club. Distinguibili, quindi un oracolo: chiunque crei la propria
societa poteva chiedere se un UUID fosse una richiesta documentale viva **da
qualche parte sulla piattaforma**.

Il terzo: `POST /api/parent-dashboard/:id/consents` **non** chiamava
`canParentAccessAthlete`, a differenza del `GET`. Distinguibile per stato e per
messaggio, e con un corollario peggiore — lo scope veniva costruito con
`activeOrganizationId` **preso dalla riga nominata dall'attaccante**, quindi ogni
diniego scriveva una riga `permission.denied` nel registro di sicurezza di un
club a cui l'attaccante non appartiene. Un registro rumoroso nasconde un attacco
vero, ed e l'argomento che questa Wave usa altrove.

Il club sta adesso dentro il `where` in tutti e tre i casi, e il legame si
verifica prima di leggere la riga.

### I Medium chiusi nello stesso passaggio

| Difetto | Cosa succedeva |
|---|---|
| Perimetro allenatore sulle risorse nuove | `TRAINER_DASHBOARD_FILTERED_RESOURCES` nominava ancora `trainings` e `matches` — che da 5C **non sono piu risorse** — e non le due nuove: `GET /api/v1/club_event_participants` restituiva a qualunque allenatore ogni convocazione, ogni presenza e ogni `rsvp_note` di tutte le squadre. La nota dell'RSVP e il testo con cui un genitore spiega perche il figlio non ci sara |
| L'allenatore configurava l'agenda del club | `createAppointmentSlot`, `updateAppointmentSlot` e `deleteAppointmentSlot` chiedevano solo la chiave e non il perimetro: un allenatore poteva cancellare tutti gli orari di ricevimento del club. Il commento di `assertPerimetro` prometteva gia il contrario |
| Il perimetro degli eventi falliva **aperto** | Un utente con ruolo `trainer` ma senza riga in `clubs.trainers`, o con la riga e nessuna categoria, leggeva l'intero calendario. La funzione gemella di `resources.ts`, sulla stessa domanda, nega tutto: due proprietari e due risposte opposte, la classe di D-3 |
| L'idempotenza restituiva l'appuntamento di un'altra famiglia | La chiave arriva dal corpo e la ricerca era per solo club: chi indovinasse la chiave altrui riceveva motivo, note e stato di quell'appuntamento, con sopra il nome del **proprio** figlio |
| `documents.submit_own` senza «own» | Un allenatore poteva depositare un file nel fascicolo di qualunque atleta o collega. Non lo rileggeva, ma la riga e l'allegato erano scritti — e un documento falso nel fascicolo di un minore non ha bisogno di essere riletto per fare danno |
| `/calendar` rispondeva 200 senza sessione | Terza occorrenza della stessa dimenticanza gia documentata per `/consensi` e `/sport-work`: la pagina nuova non era in `PROTECTED_PREFIXES` |
| `canParentAccessAthlete` accettava un id di **club** | Rispondeva `true` a una domanda diversa da quella fatta. Inerte oggi — tutti e dieci i chiamanti rileggono poi la riga — ma e la funzione sbagliata su cui correre quel rischio |
| Due rami senza confine in `resources.ts` | Uno su `allowedOrganizationIds` (la forma che ADR-0094 vieta) e uno senza nessun filtro di club. Irraggiungibili, e tolti: un ramo irraggiungibile e un ramo che qualcuno un giorno rende raggiungibile |

### Cosa l'audit ha trovato pulito

Tutte le query Prisma dei dodici moduli nuovi; le 89 occorrenze di
`allowedOrganizationIds` classificate una per una; **36 guardie, 236 chiamate,
tutte attese**; `assertScopeIsCoherent` verificato come non riapertura di
ADR-0094; la superficie pubblica della ricevuta di iscrizione, senza niente da
segnalare; i byte dei documenti verso genitore e atleta, tre porte tutte
pinnate; le migrazioni, senza perdita di dati e con il travaso che ricostruisce
invece di scartare.

## Wave 6 — la guardia della Wave 5 non arrivava al registro generico (2026-09-02)

Trovato da `scripts/wave-6-security-probe.mjs`, non da un test. La differenza
conta e vale la pena scriverla: un test unitario costruisce lo scope che il
codice si aspetta, e uno scope contraffatto nessuno lo costruisce per sbaglio.
La sonda lo costruisce apposta.

**Il difetto.** `assertScopeIsCoherent` — la difesa scritta dalla Wave 5 contro
lo scope con `activeOrganizationId` di un club e `allowedOrganizationIds` di un
altro — vive **dentro** `assertActiveClub`. Ma `resources.ts` non chiamava
`assertActiveClub`: chiamava `belongsToActiveClub` da sola, che di proposito
guarda solo il club attivo e **non** l'elenco dei club consentiti.

Conseguenza misurata: con lo stesso scope contraffatto, eventi e appuntamenti
rifiutavano — e `listResourcePage("athletes")` restituiva gli atleti del club A.
La difesa copriva i due domini che erano stati corretti a mano e lasciava
scoperta la superficie **piu ampia**: il registro generico, una cinquantina di
risorse, fra cui l'anagrafica dei minori.

C'era un secondo strato allo stesso difetto, e senza il primo non si vedeva:
anche passando da `assertActiveClub`, la guardia girava solo nel ramo in cui il
client **dichiara** un club. Il ramo che percorre la quasi totalita delle
chiamate — nessun club dichiarato, si prende `scope.activeOrganizationId` —
restituiva quel valore senza guardarlo. I due rami adesso si ricongiungono
prima della guardia, che quindi gira sempre.

Come per la Wave 5: **non era sfruttabile via HTTP**, perche
`resolveOrganizationScopeForUser` resta l'unico costruttore di scope e non
fabbrica scope incoerenti. E come per la Wave 5, «non c'e oggi una seconda
strada» e una proprieta che vale finche qualcuno non ne scrive una — e qui la
strada da scrivere era una chiamata in piu a `listResourcePage`.

**Le prove.** `tests/server/sonde-wave6-difetti.test.mjs` (lo scope contraffatto
su elenco e riga singola, e che uno scope coerente continua a leggere);
`scripts/wave-6-security-probe.mjs` U-38 sul database vero.

### Gli altri tre della stessa tornata

Nessuno dei tre e un difetto di confine, ma condividono il profilo — una difesa
che esiste e non arriva fino in fondo — e stanno qui perche li ha trovati la
stessa tornata di sonde.

| Difetto | Cosa succedeva | Correzione |
|---------|----------------|------------|
| Il filtro di stato era sensibile alle maiuscole | `athleteStatusQueryValues` elenca le grafie in minuscolo e `text IN (...)` su Postgres confronta lettera per lettera: un atleta scritto `Attivo` non compariva in **nessun** filtro. Misurato: 0 righe contro 224 | `mode: "insensitive"` sull'`IN`, cioe la correzione W6-03 completata dentro se stessa |
| Salvare un campo qualunque cancellava le appartenenze | `updateClubAthlete` chiudeva sempre con `replaceAthleteMemberships`, ricostruendo le appartenenze da una proiezione che **non le contiene**. Salvando la sola foto restavano una categoria su due, nessuna sede, e un'etichetta al posto di un id | Le appartenenze si leggono dalla loro tabella; e se l'aggiornamento non ne parla, la tabella non si tocca |
| La stagione attiva non arrivava all'area atleta | Il payload la pubblica come `activeSeasonId`/`activeSeasonLabel`, l'area atleta chiedeva `seasonId`/`seasonLabel`: `undefined`, quindi `null`, quindi un club senza stagione. Stessa forma di W6-09, superficie nuova | Si chiede il nome che il dominio pubblica |

## Wave 6 — l'app mobile perde i documenti d'identita, ed e voluto (2026-09-02)

CLAUDE.md §6 chiede di verificare l'altro albero quando si cambia qualcosa che
lo riguarda, e di **dichiararlo**. Questo e il caso.

Il taglio del dato clinico ora toglie da `athletes.data`, per chi non ha
`clinical.read`, anche i contenitori di documenti: `medicalVisits`,
`certificateFiles`, `identityDocuments`, `sharedDocuments`, `documents`,
`registrations`, `enrollmentDocuments`. Il ruolo che non ha quella chiave e,
fra gli altri, l'**allenatore** — e la app mobile e **solo** allenatore.

Conseguenza misurata: `TrainerAthleteProfileScreen` mostra una sezione
«Documenti d'identita» che da adesso e sempre vuota, perche
`GET /api/v1/athletes` non porta piu quel contenitore a uno scope da allenatore.

**Non e una regressione da correggere: e la correzione.** Quella sezione
mostrava a un allenatore il documento d'identita di un minore, e nella stessa
risposta viaggiavano l'esito di una visita medica e i PDF dei certificati in
base64. La app mobile non aveva un difetto proprio — leggeva cio che il server
le mandava — e cio che il server mandava era troppo.

Cosa fare quando lo sviluppo mobile riprenderà ([ADR-0025](18-decision-log.md)):
togliere la sezione, oppure chiedere al club di concedere `clinical.read` al
ruolo che deve vederla. La seconda non e una scorciatoia — e la stessa decisione
che il web offre — ma va **presa**, non subita: oggi quella sezione promette un
contenuto che non arriva, ed e la forma di difetto che questa Wave esiste per
smontare.

## Wave 6 — closeout: la quinta revisione, e le sei porte che ha trovato (2026-09-02)

La quinta revisione indipendente ha cercato **la seconda porta**, non il
difetto: la stessa capability raggiunta da un'altra rotta, la stessa regola
scritta due volte, il campo sensibile annidato in un JSON, la guardia messa sul
caso complesso e non su quello semplice. Sei difetti, e cinque su sei sono lo
stesso errore di metodo — **un presidio scritto enumerando le porte** invece che
dichiarando la proprieta.

Ognuno e stato riprodotto, corretto alla radice, e coperto da una prova
comportamentale di cui e stata verificata la **non vacuita**: il difetto e stato
reintrodotto e la prova e diventata rossa.

| Cosa usciva o si poteva fare | Come | Correzione | Prova |
|---|---|---|---|
| Le risposte di una compilazione condivisa, di **un'altra famiglia** | L'export di un diritto rimetteva insieme `moduli.mie` e `moduli.condivise`. Il dominio le sapeva gia distinguere — le teneva separate per decidere che quelle condivise **non si cancellano** — e poi le riuniva in uscita | `proiettaCompilazioneCondivisa`: resta la traccia (quale modulo, quando, con che esito) e la sola citazione che riguarda questa persona. Le `answers` sono un testo unico e non si dividono: non escono | `U-49` |
| L'elenco di **tutti** i destinatari di una comunicazione | `communication_deliveries.athlete_ids` usciva intero nell'export | `proiettaConsegna` filtra l'elenco sulla sola persona che ha chiesto | `U-49` |
| Un deposito della famiglia registrato come **fatto dal club** | `source` arrivava dal corpo della richiesta: `/api/v1/document-submissions` lo inoltrava tal quale. Effetti veri: nessuna riga nella coda di chi doveva controllare il documento, una notifica che diceva alla famiglia che era il club a mandarlo, un registro che attribuiva il deposito a chi non lo aveva fatto | La provenienza si **ricava dal ruolo attivo**, che il client non scrive. `public_form` resta nell'enum per le righe storiche, ma nessun ingresso puo piu produrlo | `U-50` |
| Il **codice di accesso della famiglia**, a chiunque | `stripGuardianAccessTokens` entrava in tre contenitori cablati — `guardians`, `tutori`, `parents`. Il repository ne usa un quarto, `tutors` | Il taglio cerca il **campo**, ovunque si trovi nell'albero: un valore che si chiama `parentAccessTokenValue` e una credenziale a qualunque profondita | `U-51` |
| Lo stesso codice **cancellato** da un salvataggio ordinario | `data` si salva intera: la scheda letta senza il gettone e rimandata indietro lo revocava. Nessun errore, nessuna riga, e la famiglia lo scopriva al primo accesso | `restoreGuardianAccessTokens`: la stessa regola gia scritta per il dato clinico — **un'assenza non e una cancellazione** — ma su un valore annidato, quindi si cammina sui due alberi accoppiando gli elementi per identita | `U-51` |
| L'amministrazione degli accessi, a un ruolo personalizzato **con zero chiavi** | `canManageClubConfiguration` normalizza sulla base: uno costruito su `club_manager` entrava. Da li: leggere le chiavi di tutti, e provare le combinazioni finche una passava | La configurazione degli accessi la amministra un ruolo **canonico**. Non c'e chiave di catalogo con cui delegarlo, ed e voluto: delegare la facolta di ridefinire le deleghe e un atto del proprietario. La guardia di rotta e stata allineata, altrimenti la pagina restava nel menu per aprirsi piena di 403 | `U-29.2` |

### Il riscatto di un gettone non lasciava niente, e nessuno lo contava

`POST /api/v1/auth/access/redeem` **fa entrare una persona in un club**, con il
ruolo che il gettone porta scritto nel proprio payload.

- `AUDIT_ACTIONS.accessTokenRedeemed` esisteva in `audit.ts` dalla Wave 4,
  **dichiarata e mai scritta da nessuno**. Una costante non e un presidio;
- nessun contatore. Il codice e corto e si trascrive a mano; la sessione
  richiesta non e una difesa, perche le utenze si creano. Provarne mille non
  incontrava nessun limite e non lasciava nessuna traccia: la forma esatta di
  un attacco a forza bruta invisibile.

Adesso ogni esito lascia la sua riga — riuscito, gettone inesistente, scaduto,
gia usato, troppi tentativi — e il **valore** del gettone non entra mai nel
registro: resta il suo identificativo, che dice quale senza dirne il valore.
Il contatore e in `AUTH_RATE_LIMITS`: dieci tentativi all'ora per utenza,
trenta per indirizzo, gli stessi due contatori del link di pagamento e per la
stessa ragione (chi cambia account, e chi cambia rete).

### I tre presidi che una revisione ha attraversato

Sono la parte che dura, perche un presidio evadibile e peggio di nessun
presidio: dice verde.

- **Le credenziali fuori dal browser.** Cercava cinque nomi di chiave cablati.
  Una revisione ha rimesso il gettone in `localStorage` in tre modi — variabile
  rinominata, chiave nuova (`easygame.session.v2`), `document.cookie` — e ha
  ottenuto sei verdi. Adesso sono tre regole chiuse: nessun file del browser
  **nomina** una credenziale di sessione (due eccezioni dichiarate); ogni
  scrittura di un oggetto in un archivio del browser e **dichiarata** con il
  motivo; nessun percorso del browser scrive un cookie a mano.
- **Il cancello sui byte del certificato.** Contava due occorrenze della
  *condizione*. Una revisione ha lasciato l'`if` dov'era e ha svuotato il ramo:
  il conteggio restava due. Adesso ogni condizione dev'essere seguita da un
  **rifiuto**: la testa senza il corpo non e una guardia.
- **L'errore intero nei log.** Vedeva solo la variabile nuda passata come
  ultimo argomento. `String(error)` e l'interpolazione passavano — ed e il
  messaggio a fare il danno, non la variabile: in un errore Prisma quel
  messaggio contiene la query e i suoi parametri. Il messaggio di aiuto,
  inoltre, **consigliava la fuga**: `{ message: error?.message }`. Adesso
  rileva le tre forme e indirizza al solo punto che redige.

## Wave 6 — closeout: la sesta revisione, e le tre porte che consegnavano il club (2026-09-02)

Sei revisori indipendenti, sei lane. Il conto e stato **8 Critical e 24 High**,
e la lezione non e cambiata: **una regola scritta bene, in un posto solo, e un
secondo ingresso che non ci passa**. Questa e la prima tornata di rimedi, quella
che chiude le scalate.

### Il riscatto di un gettone era il quinto scrittore di `organization_users`

La Wave 5 ha messo `assertConcessioneDiAccessoLecita` su quattro strade che
tesserano una persona. `POST /api/v1/auth/access/redeem` e la quinta, e non
conosceva nessuna guardia. Tre scalate misurate:

| Misurato | Adesso |
|---|---|
| `POST /api/v1/organization_users {role:"owner"}` risponde «l'accesso a un club non si concede da soli» — e lo stesso gestore coniava un gettone `payload.role: "owner"`, lo riscattava da una seconda utenza, e diventava **proprietario del club** | Un gettone e una **concessione differita**: vale il soffitto di chi lo conia. `assertMayGrantRole` gira al conio, e la firma del coniatore resta sulla riga (il client non la scrive: se ci prova viene tolta). Al riscatto si riapplica — e per i gettoni **storici**, senza firma, si giudica con il concedente piu stretto possibile |
| `trainer_id` viene dal gettone e la scheda si caricava **senza scope**: si scriveva nella scheda di un **altro club**. Da quel momento il vero allenatore riceveva 409 per sempre, e il suo codice era stato sovrascritto con quello dell'attaccante — che la sua segreteria gli avrebbe consegnato | La scheda si cerca **dentro il club che ha coniato il gettone**. Il ramo genitore era gia cosi: era l'asimmetria a fare il difetto |
| Lo stato guardato era solo `redeemed`. «Scollega account» scrive `revoked`, «Rigenera token» scrive `expired`, e nessuna delle due tocca `payload.expires_at` — l'unica altra cosa guardata. **Scollegare un genitore non scollegava niente** | Vale lo stato della **riga**, con un elenco chiuso di cio che e ancora riscattabile |

Piu due difetti minori dello stesso atto: un gettone con uno slug personalizzato
scriveva la riga incoerente che ADR-0102 vieta (ruolo base, `custom_role_id`
nullo, cioe il ruolo base **senza** il restringimento), e quattro dinieghi su
otto non lasciavano nessuna riga — fra cui il 409, che e il segnale del
tentativo di scavalcare il confine. Il registro, inoltre, scriveva in
`actor_role` il ruolo **concesso**: la riga di un gestore che si promuoveva
diceva `owner`, cioe nascondeva il fatto per cui la riga esiste.

### `mode: "upsert"` non e una creazione: e una modifica

`updateResource` sapeva che `athletes.user_id` non si scrive dal registro
generico (ADR-0104) e che un contenitore clinico assente non e una
cancellazione. Il ramo `upsert` di `createResource` **aggiorna per chiave** — e
la chiave la sceglie chi chiama — e non incontrava nessuna delle due:

```
PATCH  /api/v1/athletes/<id> {user_id}      -> 403
upsert /api/v1/athletes      {id, user_id}  -> 200, legame scritto
```

e da li `GET /api/v1/athlete-accounts/me`, che non chiede ne ruolo ne tessera
perche risolve la scheda **da quel campo**, consegnava a un'utenza senza alcuna
tessera nel club l'area completa di un minore, dato sanitario compreso, senza
invito e senza audit. Lo stesso ramo cancellava i contenitori clinici.

Non era la prima volta che questa coppia si divideva: il perimetro di sede era
gia stato aggiunto all'`upsert` una revisione fa. Le guardie ora stanno in
**una funzione sola** che entrambi i rami chiamano, e il presidio pretende le
due chiamate: due copie divergono, e la seconda diverge in silenzio.

### Un ruolo personalizzato non e la direzione

`normalizeAccessRole` di `custom:club_manager:<slug>` risponde `club_manager`, e
due predicati ci costruivano sopra una risposta secca.

- **`canAccessClubResource`** usciva `true` **prima** di guardare l'elenco delle
  risorse riservate. Misurato: un ruolo di club con **una chiave** leggeva
  `access_tokens` — il codice d'accesso delle famiglie in chiaro — e
  `bank_accounts`, `document_templates`, `payment_methods`, e ne coniava di
  nuovi. E la prima meta della scalata qui sopra.
- **`canManageClubConfiguration`** autorizzava l'attore in **ventuno** rotte. Lo
  stesso ruolo a cui il club aveva tolto la contabilita non poteva **leggere**
  la prima nota — quella chiede `accounting.read` — e poteva **scrivere un
  incasso**. La casella `accounting.manage` non faceva niente, nel verso
  peggiore.

La distinzione che mancava e fra **soffitto** e **attore**. Le matrici di
dominio chiedono «questo ruolo base arriva fin qui?», e le chiavi concesse
restringono dopo: li la normalizzazione e giusta. Le rotte chiedono «questa
persona puo?», e li il gettone va guardato. Da qui
`canManageClubConfigurationAsActor`, e le tre rotte di contabilita che
accettano in alternativa la **chiave** — cosi un club che ha voluto delegare
continua a poterlo fare, e la casella spuntata fa finalmente qualcosa.

Prove: `U-53`, `U-54`, `U-55` in `wave-6-security-probe.mjs`, ognuna verificata
non vacua reintroducendo il difetto.

## Wave 6 — closeout: la settima revisione, e le due regressioni che avevo introdotto (2026-09-02)

Quattro revisori: conferma su ruoli e riscatto, conferma su perimetro e
famiglia, vacuita dei presidi **nuovi**, e — la lane che questa Wave si e
guadagnata — **regressioni funzionali**. Il conto: **3 Critical, 12 High**.

Cinque dei quindici erano difetti **introdotti dalle correzioni precedenti**.
Vale la pena scriverlo per intero, perche e il fatto piu utile di tutta la Wave:
una correzione stretta e una modifica come le altre, e va rivista come le altre.

### La terza porta sul conio di un gettone (Critical)

`PATCH /api/v1/clubs/:id` accetta un campo JSON per ogni voce di
`CLUB_RESOURCE_TYPES` e riscrive la collezione intera via `createMany`. Quel
percorso non incontrava ne il soffitto sul conio ne la guardia sulle riservate:
`assertNotAdminOnlyFromGenericRoute` giudica `where.resource_type`, e li il tipo
**e** il nome del campo, quindi usciva subito.

Misurato: un `club_manager` a cui `POST /api/v1/access_tokens {role:"owner"}`
risponde 403 scriveva lo stesso gettone da questa porta con un 200 — **firma del
coniatore compresa**, che il riscatto poi legge — e lo riscattava da una seconda
utenza diventando proprietario. E la stessa chiamata, che cancella e ricrea,
spazzava via tutti i gettoni legittimi del club.

L'asimmetria era visibile e nessuno l'aveva letta: `CLUB_JSON_FIELDS` **esclude**
`access_tokens` dalla lettura per campo, e il ciclo di scrittura lo includeva.

### Il legame di famiglia si scriveva con l'email di contatto (Critical)

La guardia contro l'auto-nomina a tutore sorvegliava due campi —
`linkedUserId`, `linked_user_id` — mentre `isGuardianLinkedToUser` ne legge
**sette**, fra cui `guardian.email`, l'indirizzo che una segreteria modifica
ogni giorno. Un ruolo personalizzato **senza** `clinical.read` ci scriveva la
propria email verificata e apriva il cruscotto della famiglia: allergie,
farmaci, visite mediche, e i byte dei documenti del minore.

**La prima correzione era sbagliata**, e va detta: avevo tolto l'email di
contatto dal predicato. L'UAT lo ha smentito in un minuto — `U-06` verifica per
nome che «il figlio legato solo per email verificata resta raggiungibile» — ed e
la strada con cui una famiglia entra senza riscattare un codice. Non era un
residuo: era una capability.

La regola giusta e un'altra, e piu utile: **scrivere un legame di famiglia e un
atto sul dato clinico**, perche e quello che concede. Lo puo fare chi quella
vista ce l'ha gia. Segreteria e collaboratore la hanno per matrice, quindi il
flusso di tutti i giorni non cambia; la perde il ruolo a cui il club ha tolto
`clinical.read`, che e esattamente cio che il club intendeva togliendola.

E i due elenchi non possono piu divergere: `GUARDIAN_LINK_FIELDS` sta in
`parent-dashboard.ts`, e la guardia lo importa.

### Un `data` nullo spegneva tutte e tre le guardie dell'anagrafica (Critical)

Erano condizionate a `normalized.data && existing?.data`, cioe a due valori
**veri**. Un salvataggio con `data: null` — o `""`, o `0` — le attraversava
tutte, e al salvataggio successivo anche `existing.data` era falso: la seconda
scrittura aggiungeva il legame che la guardia sorveglia senza incontrarla.

La domanda giusta non e «c'e un `data` valorizzato?» ma «questa scrittura tocca
`data`?». Cio che manca dall'altro lato vale come oggetto vuoto: non c'era
niente da conservare, ed e diverso da «non guardo».

### Le due regressioni che avevo introdotto (High)

| Cosa avevo rotto | Come |
|---|---|
| **L'onboarding di ogni allenatore** | La guardia di confine sul riscatto confronta `club_resource_items.id`, che e `uuid`, con `trainer_id`, che porta l'**id logico** che il prodotto genera (`trainer-<istante>-<casuale>`). Non «non trova»: fa fallire la query con `22P02`, che risale al catch generico come un **500**. Il repository documenta gia questo errore in `resources.ts`; l'avevo reintrodotto in una porta nuova, e la sonda non lo vedeva perche conia i suoi gettoni con l'id di riga |
| **Una rotta che prima era chiusa** | Nella rotta della rata avevo ricavato il verbo da `request.method`, ma quel file esporta **solo `PATCH`** e l'azione viaggia nel corpo. Il verbo valeva sempre `update`, il ramo `delete` della matrice non veniva interrogato mai, e la segreteria annullava una rata con un 200 |

Piu una terza, sulla stessa funzione gia rifatta una volta: chi non vede una
credenziale poteva comunque **distruggerla** mandando `""`. Il `Set` delle
revoche girava nel ramo di chi *non* ha letto il valore — e chi non l'ha letto
non puo aver deciso di toglierlo. Non c'e piu: per chi non vede, ogni sparizione
e una perdita.

### Le altre porte del perimetro, e i due predicati

- Gli appuntamenti: il perimetro era in **creazione** e non nelle cinque
  transizioni, che confermano e annullano — e mandano una notifica ai tutori.
- I documenti **gia generati** si rileggevano fuori dal perimetro che ne governa
  la generazione: stesso contenuto, altra porta.
- `createAttachment` era la sesta porta di Attachment Core, e l'unica senza
  perimetro: si depositava un file nel fascicolo di un minore di un'altra sede.
- `canAccessClubResource` normalizzava il gettone sulla base per **ogni**
  chiamante che non fosse il registro generico: l'elenco dei beneficiari di un
  contributo pubblico rispondeva al ruolo base. La regola e salita dentro il
  predicato, dove sta la domanda.
- `custom_role_id` e `is_primary` erano chiusi su **una porta su tre**: il ramo
  `upsert` dedicato esce prima delle guardie di modifica, e `syncClubMembers`
  non ci passa. La regola sta ora accanto alla guardia che tutte e tre chiamano.
- Un gettone **senza firma** — coniato prima di questa Wave, quando un
  collaboratore poteva forgiarne uno — non concede piu un ruolo che amministra
  il club.

### I sette presidi che dicevano verde

La lane sulla vacuita ha misurato **28 mutazioni**: 22 passavano `npm test` e
**7** non erano viste da nessun gate. Cinque su sette erano lo stesso errore di
forma, e non un difetto dentro un presidio: **enumerare dove si crede di
misurare una proprieta**.

| Presidio | Enumerava | Adesso |
|---|---|---|
| Credenziali nel browser | i **file** dichiarati, e `setItem(` | le **chiavi**, la scrittura per proprieta (`storage["x"] = y`), e una regola in piu: sotto una chiave di sessione puo finire solo cio che passa da `sessionSenzaCredenziali` |
| Cancello sui byte | due **forme di uscita** note | prima del cancello questa rotta puo restituire **solo un rifiuto** |
| Log senza dati personali | cinque **nomi di variabile inglesi** | il nome che un `catch` **lega**, qualunque sia — piu i nomi classici per le callback. E leggere `error.code` resta lecito: un presidio che vieta i log utili viene aggirato |
| `await` sulle guardie | otto **file** cablati, tre **prefissi**, e un insieme per file | tutti i sorgenti del server, quattro prefissi, e un nome vale se il file lo dichiara **o lo importa** da chi lo dichiara |
| Mappa risorsa → chiave | la mappa **verificava se stessa** | diciassette risorse **pinnate** con il motivo, e la prova comportamentale su tutte invece che su una |

E la proiezione sul profilo atleta — la riga che tiene i codici d'accesso delle
famiglie fuori da una risposta — non era esercitata da nessun gate: toglierla
dava sei verdi. Adesso c'e `U-62`.

## Wave 6 — closeout: l'ottava revisione, e la lezione sul correggere (2026-09-02)

Tre revisori: ruoli e conio, perimetro e famiglia, vacuita dei presidi e
regressioni. Il conto: **3 Critical, 11 High**. E il dato che conta piu dei
numeri: **la maggioranza dei difetti piu gravi era stata introdotta dalle
correzioni della settima revisione**, come nella settima lo era stata da quelle
della sesta.

Tre round di fila con lo stesso schema hanno reso visibile la causa, che non e
nel codice: e nel modo di correggere. Una guardia si scriveva, si provava che
**nega**, e si dava per fatta — senza provare che **lascia passare** il lavoro
di tutti i giorni, e senza percorrere la strada che il prodotto percorre. Da
questa tornata ogni correzione porta la sua controprova positiva **nella stessa
prova**, e si misura dalla rotta e non dalla funzione.

### I tre Critical

| Cosa passava | Perche |
|---|---|
| Un ruolo di club a **una chiave** leggeva i beneficiari dei contributi pubblici, i byte del fascicolo di un minore, e **annullava una rata** — piu di quanto possa una segreteria canonica | Il restringimento era stato messo **sotto** il ramo `owner \|\| club_manager`, che esce `true` per primo. Tre basi su quattro erano ristrette e la quarta — quella con cui i club costruiscono «Segreteria» — no |
| Il legame di famiglia si scriveva con un valore in **array**: `email: ["attaccante@…"]`. Da li allergie, farmaci ed esito di una visita cardiologica a chi il club aveva tolto `clinical.read` | Guardia e predicato condividevano la **lista dei campi** e non la nozione di valore: la guardia contava solo le stringhe, `firstText` fa `String(v)` |
| I documenti gia generati si leggevano **e si modificavano** fuori perimetro | Le quattro rotte costruiscono lo scope a mano e non ci mettevano `accessScopes`: la guardia non veniva **mai** eseguita dal prodotto. Rispondeva solo alle chiamate dirette alla funzione, che e come era stata provata |

Il secondo si e chiuso esportando la **funzione** invece della lista:
`guardianAccessIdentities` parte dagli stessi `getGuardianRows` del predicato,
e non c'e piu una seconda nozione di identita da tenere allineata.

### Le regressioni, e una regola che e stata tolta

Tre difetti erano **negazioni di troppo**, e uno bloccava il lavoro:

- un tutore **senza `id`** rendeva l'anagrafica non salvabile — e quell'`id` lo
  assegna il browser, quindi i dati gia in archivio ne sono privi: le schede di
  quei minori erano bloccate per sempre per segreteria e collaboratori;
- **togliere un tutore** o revocarne il codice era vietato a chiunque non fosse
  direzione canonica, mentre l'interfaccia offre il pulsante «Scollega account»;
- correggere il **recapito dell'atleta** veniva negato con un messaggio sui
  tutori, perche la guardia percorreva tutto `data` e la chiave `email` valeva
  ovunque.

La conclusione e stata che **la guardia contro la «perdita» di una credenziale
non e difendibile**, e non c'e piu: togliere un tutore fa sparire il suo codice
ed e un atto legittimo, quindi chi vuole distruggerlo lo fa comunque — la regola
non proteggeva da lui e bloccava la segreteria.

Al suo posto una regola piu semplice e senza effetti collaterali: **per chi non
vede una credenziale, quei campi sono in sola lettura**. Il valore precedente
vince sempre; un tutore nuovo nasce senza; e chi la vede continua a revocarla.
E l'aggancio ora funziona anche sui dati storici — `id`, poi email, poi
posizione — perche una regola che non si aggancia e una regola che rifiuta.

### Le altre porte

`is_primary` scritto anche quando **omesso** (dichiarare l'intenzione era
vietato, ometterla la eseguiva); la stessa guardia che, spostata «accanto a
quella che tutti chiamano», aveva perso il filtro di risorsa e negava la
categoria primaria di un atleta **al proprietario**; `custom_role_id` accettato
in creazione; un `PATCH` su un gettone che ne riscriveva il segreto e
**sovrascriveva la firma** del coniatore; la compilazione di un modulo, la
lettura di un appuntamento e l'archivio storico degli allegati senza perimetro;
e un gettone che sopravviveva al club cancellato oscurandone uno vivo.

### I presidi, e il cambio di strumento

Quattro stesure del presidio sui log, quattro evasioni: un nome di variabile
italiano, una chiamata spezzata su piu righe, una variabile intermedia. La
lezione e che **una proprieta sulla sintassi si aggira sempre con altra
sintassi**, e che il presidio giusto non era un'espressione regolare.

Adesso e una **regola di lint**: `no-console` sotto `src/lib/server` e
`src/app/api`, con deroga al solo `observability.ts` e una riga di motivo su
ognuna delle dieci chiamate che restano — tutte senza errore dentro. I sette che
passavano l'errore intero sono stati convertiti, e il registro dei residui e
**vuoto**.

Gli altri quattro presidi sono stati stretti dove l'evasione era strutturale: la
regola sugli `await` registrava il nome **esportato** invece del binding locale,
quindi un `import { x as y }` la rendeva cieca; le regole sugli archivi del
browser cercavano il nome dell'archivio, e `const cache = window.sessionStorage`
lo nascondeva. E due difese che funzionavano — il verbo della rata e il cancello
del registro generico — non erano tenute ferme da niente: adesso hanno la loro
prova (`U-64`).

Resta dichiarato un limite: il cancello sui byte del certificato vincola cio che
sta **prima** del primo controllo, e una terza uscita inserita dopo, su un ramo
che il secondo non attraversa, gli passerebbe accanto. E l'unica delle cinque
per cui non ho trovato una forma che non sia di nuovo un'enumerazione.

## Closeout Wave 6 — i nomi diversi che portano alla stessa riga (2026-09-02)

Due revisioni ostili indipendenti, lanciate in parallelo su corsie diverse,
hanno riportato **lo stesso** difetto come piu grave, ognuna per conto suo.
Vale la pena scriverlo, perche e la classe che questo repository ha gia
chiuso tre volte e che continua a tornare da una porta nuova.

`training_attendance` e `club_event_participants` non sono due tabelle: sono
**due nomi di risorsa sullo stesso delegato Prisma**. La guardia che riserva
quella tabella al suo dominio ne nominava uno solo.

```
PATCH /api/v1/club_event_participants/<id>  ->  403  «si scrive dal suo dominio»
PATCH /api/v1/training_attendance/<id>      ->  200
```

Con una sola chiamata si scrivevano le tre colonne che
[ADR-0086](18-decision-log.md) e [ADR-0099](18-decision-log.md) assegnano a
**tre scrittori distinti**: la presenza, la risposta della famiglia — senza
`rsvp_by_user_id`, quindi non attribuibile — e la convocazione. E la presenza
e la colonna su cui `funding/attendance-measure.ts` rendiconta i contributi
pubblici: una presenza forgiata e denaro pubblico su un minore.

### La forma della difesa

Non un settimo elenco. `src/lib/resource-aliases.ts` dichiara i sei alias e
il loro nome canonico, e le guardie del registro confrontano **quello**:

| Guardia | Cosa proteggeva su un nome solo |
|---------|--------------------------------|
| `assertNotDomainOwnedModel` | La scrittura riservata al dominio |
| `TRAINER_DASHBOARD_FILTERED_RESOURCES` | Il gruppo operativo dell'allenatore |
| `buildAccessScopeFilter` | Il perimetro di sede e categoria |

`tests/lib/alias-di-risorsa.test.mjs` verifica che la mappa copra **tutti** i
delegati condivisi di `RESOURCE_CONFIG`: un settimo alias non dichiarato fa
fallire la prova invece di aprire una porta.

### Le altre tre porte, tutte della stessa famiglia

**Il perimetro non copriva le partecipazioni.** Un ruolo recintato sulla sede
Nord leggeva le righe dell'atleta della sede Sud — stato, convocazione e note
in testo libero su un ragazzo — mentre la rotta di dominio sullo stesso dato
negava. Fra due porte decide sempre la piu larga. `athlete_id` non ha una
relazione: il filtro passa per l'insieme degli identificativi dentro il
perimetro.

**Il gruppo dell'allenatore era un filtro di elenco.**
`filterTrainerDashboardRecords` girava solo dentro `listResourcePage`, e un
filtro di elenco si aggira chiedendo la riga per identificativo — che e
esattamente cio che `assertRecordWithinAccessScope` era stata scritta per
chiudere sull'**altra meta** della stessa regola. Misurati 613 byte con
tutori, codice fiscale, data di nascita e codice di accesso di un minore di
un'altra squadra. E l'identificativo non era un segreto:
`athlete_category_memberships` serviva per prima la mappa completa
`atleta -> sede/categoria`, e ora e nel filtro.

**`club_resource_items` e la seconda porta su ogni risorsa di club.** Le
schede di allenatori, staff, sconti e procure vivono tutte in quella tabella,
e il registro le serve in due modi: per nome (`/api/v1/trainers`) e per
contenitore (`/api/v1/club_resource_items`). Misurato:

| Attore | `GET /api/v1/trainers` | `GET /api/v1/club_resource_items` |
|--------|------------------------|-----------------------------------|
| allenatore | senza IBAN, CF, gettone | **IBAN, CF e gettone in chiaro** |
| ruolo di club a **zero chiavi** | senza IBAN, CF, gettone | **IBAN, CF e gettone in chiaro** |

Il gettone in chiaro si riscatta. E in scrittura era peggio:
`POST /api/v1/discounts` risponde 403 a quel ruolo, e
`POST /api/v1/club_resource_items` con `resource_type: "discounts"` scriveva
la stessa riga senza chiedere niente — creazione, modifica e cancellazione.

Adesso la proiezione risolve il **tipo della riga** e taglia come se fosse
stata chiesta per nome; il mazzo si restringe a cio che il ruolo puo davvero
leggere (non ai soli tipi riservati alla direzione); e ogni scrittura chiede
`canAccessClubResource` sul tipo che la riga porta.

### La lezione, di nuovo

Nessuna delle quattro era una regola sbagliata. Erano **una regola giusta
applicata a un nome solo**, quando i nomi che raggiungono la stessa riga sono
due. Prova: `U-68` nella sonda di sicurezza, con la controprova positiva
accanto a ognuna — senza perimetro le partecipazioni si vedono tutte, chi non
e allenatore legge la riga, chi amministra vede l'IBAN, e chi puo scrivere
quel tipo scrive anche dal contenitore.

## Wave 6 — la revisione finale: sei High riprodotti, misurati e chiusi (2026-09-03)

L'handoff della Wave 6 (`docs/wave-6-handoff.md`, §8) consegnava **sei High
riportati da un revisore e non verificati**. La regola della revisione finale
era di non darne per buono nessuno: riprodurre, misurare, correggere solo se
confermato, e provare la non vacuita reintroducendo il difetto. **Tutti e sei
erano veri.** Due Medium della tornata precedente si erano rivelati falsi
positivi; qui nessuno.

### B-H1 + B-H2 — una presa di possesso dell'account, in due meta

**B-H2, il contatore di frequenza.** `consumeAuthRateLimit` girava in una
transazione interattiva: lettura del secchiello, poi `upsert` con `count: 1`
se mancava o era scaduto, altrimenti `update` con `increment`. Il ramo
dell'incremento era atomico; quello di apertura no. Misurato contro Postgres:
**21 richieste ammesse su 40** a freddo e 19 su 40 a finestra scaduta, contro
un limite di 5. In sequenza il conteggio era giusto, ed e per questo che i test
unitari non lo vedevano: un doppio in memoria esegue una chiamata alla volta.
Toccava tutti i contatori — login, registrazione, invio e conferma OTP, riscatto
gettone, moduli pubblici, link di pagamento, ricevuta di iscrizione — perche la
primitiva e una.

**B-H1, il contatore dei tentativi OTP.** `verifyInternalChallenge` leggeva
`attempts`, confrontava il codice e riscriveva `attempts + 1` come valore
**assoluto**. Misurato: **60 codici sbagliati in parallelo, `attempts = 1`,
challenge viva, e il codice giusto accettato subito dopo**. Il codice e a sei
cifre, la challenge si fa emettere senza sessione da `POST
/api/v1/auth/verify/email/send`, e il successo restituisce una sessione.

**La correzione** ([ADR-0109](18-decision-log.md#adr-0109--un-contatore-che-difende-si-scrive-in-unistruzione-condizionata-sola-mai-letto-e-poi-scritto)).
Il contatore di frequenza e un solo `INSERT … ON CONFLICT DO UPDATE …
RETURNING`: Postgres prende il lock di riga e valuta il `SET` sulla versione gia
committata, quindi N richieste simultanee ricevono N valori distinti e solo le
prime `limit` passano; la riapertura a finestra scaduta sta nello stesso `CASE`
e conta una volta per finestra. Non c'e piu una transazione interattiva ne una
lettura prima della scrittura: e per questo che regge fra istanze serverless
diverse. La verifica OTP **spende** il tentativo prima di giudicare il codice
(`UPDATE … SET attempts = attempts + 1 WHERE consumed_at IS NULL AND attempts
< MAX`) e consuma la challenge solo se e ancora viva: dieci codici giusti
simultanei producono **una** verifica. Il reset della password usa la stessa
primitiva; un token giusto seguito da una password che non vale non consuma il
tentativo, come prima.

Una prima stesura chiudeva la challenge al tetto scrivendo `consumed_at`: il
doppio in memoria ha mostrato che quella scrittura **competeva** con il
consumo di un codice giusto ancora in volo — cinque codici giusti e un sesto
qualunque potevano finire senza nessuna verifica. Il tetto vive nel `WHERE`,
e basta.

### B-H3 — l'importo di una rata dal registro generico

`guardLedgerOwnedPaymentState` chiudeva lo `status`; `amount`, `due_date` e
`athlete_id` restavano aperti. Misurato: rata `paid` da 130 portata a 500 da
`PATCH /api/v1/payments/:id`, riga ancora `paid`, registro riletto `partial`
con residuo 370. La stessa regola della rotta di dominio vale ora sul registro
generico e sull'alias `simplified_payments`: una rata saldata o annullata non
cambia importo, scadenza ne atleta; una rata aperta cambia importo **dentro il
lock di riga** e lo stato lo riscrive `recomputeChargeFromLedger`; una rata con
incassi non si sposta su un altro atleta. Descrizione e note restano libere,
perche le schermate rimandano il record intero.

### B-H4 — due approvazioni simultanee della stessa iscrizione

Il controllo «e ancora `pending`?» stava in testa e il passaggio ad `approved`
in coda. Misurato: `['OK','OK']`, **due schede** per lo stesso minore. Non si
poteva spostare `approved` in testa, perche un'approvazione interrotta deve
restare riapprovabile. La compilazione si **prende in esame** con un
`updateMany` condizionato — `reviewed_at` valorizzato su una riga ancora
`pending` significa «qualcuno la sta scrivendo adesso» — si rilascia se la
decisione fallisce, e scade da sola dopo dieci minuti se il processo cade
senza rilascio. Stesso schema di `document-requests.ts`.

### B-H5 — l'anteprima di una compilazione fuori perimetro

`reviewFormSubmission` e la gemella di `buildCompileContext` e non aveva le sue
due guardie: il `recordId` arriva dal corpo (`action: "preview"`), l'anteprima
non scrive e non lascia audit, e il `changeSet` porta il **valore attuale** di
ogni campo. Un operatore recintato sulla sede Nord otteneva nome, codice
fiscale, data di nascita, tutori — e, con un campo legato ad
`athlete.allergies`, il dato sanitario — del minore della sede Sud. Adesso il
perimetro si chiede prima di leggere il confronto e il clinico si toglie dal
record per chi non ha `clinical.read`, come nella precompilazione.

### B-H6 — la seconda porta alla prima nota

`createAccountingEntry` non contiene il permesso: lo chiede l'involucro
`accountingRoute`. `completeObligation` la chiamava da una rotta custodita dal
solo `sport_work.manage`, con scope composto a mano e importo dal corpo. Un
ruolo personalizzato con quella chiave e senza `accounting.manage` scriveva
un'uscita in prima nota. Adesso la chiave si chiede **prima** di marcare
l'adempimento assolto, cosi un 403 non lascia un adempimento chiuso con un
versamento mai registrato; assolvere senza registrare il versamento resta un
atto del lavoro sportivo.

### Prova e non vacuita

`U-69`…`U-74` in `scripts/wave-6-security-probe.mjs`, dalla rotta o dalla
funzione che la rotta chiama, con `Promise.all` contro Postgres dove il
difetto e la concorrenza, e con la controprova positiva accanto a ognuna (in
sequenza i primi cinque passano; due errori e il codice giusto verificano; la
rata aperta cambia importo; la presa vecchia non blocca; la proposta dentro il
perimetro mostra il valore; assolvere senza versamento passa). Non vacuita
verificata reintroducendo i sei difetti insieme: **14 controlli rossi su 24**,
tutte le controprove positive verdi. Cinque nuove prove unitarie sul doppio —
che esegue le chiamate intrecciate ai confini degli `await` — coprono B-H1,
B-H3, B-H4 e B-H6; B-H5 e B-H2 si provano solo contro il database, perche il
doppio non valuta i filtri di relazione ne la concorrenza vera.

### Cosa e stato deciso di **non** fare, e dove sta scritto

Gli otto Medium e i sette Low del §8 dell'handoff non toccano il perimetro di
questa revisione (correzioni e loro regressioni) e sono stati classificati come
debito con il loro motivo in [16 — Debito tecnico](16-technical-debt.md)
(`W6-D30`…`W6-D33`). Nessuno di loro e un accesso cross-tenant, una fuga di
dato di minore o clinico, o denaro che esce due volte.

## PP-05 — un recapito verificato e un canale di accesso (2026-09-04)

Revisione ostile indipendente sulla lane PP-05A, misurata contro PostgreSQL
reale: **1 Critical, 2 High, 5 Medium, 3 Low**. Tutte le prove stanno in
`scripts/pp-05-sicurezza-probe.mjs` e sono state verificate **per mutazione**
(rimossa la guardia, la riga torna rossa). Il verbale completo della lane e in
[46](46-pp-05-onboarding-comunicazioni.md).

### CRITICAL — la presa di possesso che sopravviveva a entrambi gli sfratti

**Come si faceva.** Registro un account con l'indirizzo email di un'altra
persona e **il mio numero di cellulare**, e verifico il numero. Uso il prodotto.
Quando la vittima arriva davvero — con Google, che l'indirizzo lo certifica —
l'adozione azzera la mia password e cancella le mie sessioni, **e lascia il mio
numero sulla sua riga**. Chiedo allora un codice a `/verify/phone/send`, lo
ricevo sul mio telefono, e `/verify/phone/confirm` mi **restituisce una
sessione**. La vittima, nel frattempo, e chiusa fuori: il mio numero le blocca
la creazione della sessione, e la sua password e appena stata azzerata.

Lo stesso valeva per l'altro meccanismo di sfratto: il reset password
cancellava le sessioni e non toccava il canale che le faceva rinascere.

**La lezione, che vale oltre questo caso.** Un elenco di modi per entrare —
password, recapito verificato, gettone, accesso esterno — senza **un punto
unico che li revochi tutti insieme** e un elenco che prima o poi ne dimentica
uno. La correzione non e stata «aggiungere il telefono allo sfratto»: e stata
dare allo sfratto un nome e un posto, `sfrattaOccupante`, cosi che la prossima
credenziale che si aggiunge abbia una casa evidente dove essere chiusa.

**Le due difese, indipendenti.**

1. `sfrattaOccupante` azzera password, sessioni, `phone`, `phone_verified_at` e
   `token_verification_id`. Il numero azzerato **non** blocca la vittima:
   `isPhoneVerificationBlocking` pretende che un numero ci sia.
2. `challengePurposeCanMintSession`: un codice apre una sessione solo se lo
   scopo della challenge e `signup` o `login`, cioe solo se una password e
   appena stata presentata. Un codice chiesto da `/verify/<canale>/send`
   conferma il recapito e risponde `session: null`.

Vedi [ADR-0134](18-decision-log.md).

### HIGH — l'elenco dei trasporti SMS in due copie, divergenti

`provider-policy.ts` e `sms-service.ts` conoscevano ciascuno per conto proprio
i nomi validi di `SMS_PROVIDER`, e sbagliavano in **direzioni opposte**:

- `SMS_PROVIDER=noop` — l'unico valore riconosciuto — faceva **bloccare**
  l'accesso in attesa di un codice che `NoopSmsProvider` per contratto non
  spedisce: ogni account nuovo restava fuori per sempre, con la challenge
  scritta in archivio e nessuno a riceverla;
- il nome di un operatore vero non era riconosciuto, quindi la verifica **si
  spegneva in silenzio**. E il verso peggiore in assoluto, perche succede
  esattamente quando qualcuno crede di aver completato la configurazione.

Ora l'elenco e uno, puro (`src/lib/auth/sms-transport.ts`), e porta la
proprieta che decide: **`delivers`**. Un nome sconosciuto viene segnalato una
volta dal punto unico degli errori, senza il valore dentro.

### HIGH — pompaggio di SMS verso un numero altrui dalla registrazione

`rate-limit-policy.ts` prometteva che `otpSendTarget` fermasse il pompaggio
«anche quando l'attaccante si crea account nuovi». La registrazione consumava
solo `registerIp` e `registerIdentity`, cioe i due assi che l'attaccante
sceglie. Misurati **dieci SMS all'ora verso un numero scelto** da un solo
indirizzo IP, moltiplicabili cambiando rete; ogni invio invalidava alla vittima
il codice appena ricevuto.

Il contatore per destinatario si consuma ora **prima** di sapere se l'indirizzo
email esista gia — cosi i due rami costano uguale e non diventano un oracolo —
e quando e esaurito **l'SMS non parte**, senza cambiare la risposta.

### MEDIUM — il numero mascherato accanto al numero in chiaro

`verification.phone` usciva mascherato, e `user_metadata.phone` usciva **in
chiaro nello stesso corpo, tre righe piu sotto**. Un controllo che c'e ed e
inefficace e peggio di un controllo che manca, perche chi legge il codice lo
conta come fatto. `serializeAuthUserWithoutSession` per le tre risposte senza
sessione.

### MEDIUM — indovinare la password attuale, senza tetto e senza traccia

`PATCH /api/v1/auth/user` chiede la password attuale per cambiare un fattore, ed
e la difesa introdotta **contro la sessione rubata**. Non contava i tentativi:
misurati venticinque di fila senza un 429, e nessun evento di audit. Chi aveva
la sessione poteva rendere permanente un accesso temporaneo — esattamente cio
che quella richiesta doveva impedire. Ora dieci per account in un quarto d'ora,
e il tentativo sbagliato lascia una riga di audit che dice **quale porta** e
stata provata.

### LOW — una difesa che si apriva quando una variabile mancava

`shouldExposeVerificationPreviewCode` chiedeva `NODE_ENV !== "production"`:
`NODE_ENV` **assente** apriva. Su Vercel vale sempre `production` e il rischio
pratico era basso, ma la forma era sbagliata — quando un ambiente non si
dichiara, non lo si indovina. Ora nega anche su `staging` e `preview`, e senza
`NODE_ENV` chiede `EASYGAME_DB_ENV=development`.

Il **secondo round** ha poi mostrato che negare tre nomi non basta (vedi sotto,
L-3): l'elenco e diventato di ammissione.

### Rischio residuo dichiarato

- **Il pepe delle impronte OTP ricade su `DATABASE_URL`** se nessuna delle tre
  variabili dedicate e impostata. Chi ha estratto un dump ha quasi certamente
  anche la stringa di connessione con cui l'ha estratto, e in quel caso il
  milione di codici a sei cifre torna enumerabile. `AUTH_OTP_SECRET` va
  impostato negli ambienti condivisi ([13](13-environments.md)). Il ripiego
  resta perche un'installazione locale deve funzionare senza segreti.
- ~~**Un utente solo-OAuth non puo aggiungere il cellulare**~~ (debito PP05-D1,
  **chiuso nel secondo round**): la strada era «Password dimenticata» e
  bisognava indovinarla. Ora la pagina Account porta il pulsante «Ricevi un
  link per impostarla» accanto agli avvisi di verifica. Non apre nessuna strada
  nuova — chiunque puo chiedere quel link dalla pagina di accesso — e la
  password si imposta **dalla casella**, non dalla sessione. Vale anche per chi
  ha appena subito uno sfratto, che e l'altra popolazione senza password.
- **`maskPhoneNumber` rivela la lunghezza** del numero: e un mascheramento, non
  un segreto.

### Sull'email (PP-05B)

- **L'escaping non e piu una scelta di chi chiama**: i blocchi del template
  core prendono testo, non markup. Il blocco `raw` e l'unica via d'uscita, e ha
  due soli utenti dichiarati — i modelli di messaggio del club e il riepilogo
  giornaliero — che sfuggono i valori dei segnaposto per conto proprio.
- **Nessuna immagine remota** in una email a marchio club: sarebbe un
  tracciatore verso le famiglie di un club, spesso minori, e nessuno ha
  dichiarato quel trasferimento. Un logo diventa `<img>` solo se e servito
  dalla nostra origine.
- **`sandbox=""` sugli iframe dell'anteprima**: un `srcDoc` eredita l'origine
  della pagina che lo contiene, quindi il markup di un template girava con i
  cookie di un amministratore di piattaforma. E la superficie piu facile da
  dimenticare in una pagina che «mostra e basta».
- **L'anteprima non spedisce**, e non e un commento: un test monta un trasporto
  finto, costruisce l'intero catalogo, conta zero invii, e poi manda un
  messaggio con lo stesso doppio per provare che il primo zero non e vacuo.

---

## PP-05 — secondo round della revisione ostile (2026-09-05)

Un round intero rilanciato **dopo** le correzioni del primo, con lo stesso
metodo: reviewer indipendente col mandato di rompere, misura contro PostgreSQL
reale, e ogni fix accompagnato da una prova che **fallisce senza il fix**.
Esito: **1 Critical, 1 High, 2 Medium, 3 Low**. Le prove stanno in
`scripts/pp-05-sicurezza-probe.mjs` (S1-S9) e in
`tests/auth/verifica-recapiti-dalle-rotte.test.mjs`, e sono verificate **per
mutazione**.

### CRITICAL — il legame con l'accesso esterno sopravviveva allo sfratto

Il primo round aveva dato allo sfratto un nome e un posto, e gli aveva fatto
chiudere password, sessioni e telefono. Ne restava **uno**, ed era il piu
forte.

**La catena misurata.** L'attaccante collega il **proprio** Google a un account
proprio, con indirizzo verificato: nessuno sfratto scatta, perche non c'e
niente da sfrattare. Poi cambia l'indirizzo dell'account in quello della
vittima, usando la propria password. E aspetta. Quando la vittima arriva da
Google, lo sfratto scatta e le restituisce l'account — ma la riga in
`external_accounts` dell'attaccante e ancora li, e `findOrCreateOAuthUser`
risolve **per `provider_account_id` prima di ogni altra cosa**. Al suo accesso
successivo l'attaccante rientra sull'account della vittima con tutto quello che
nel frattempo ci ha messo. La seconda difesa del primo round — «un codice apre
una sessione solo se la porta era gia aperta» — non lo vede nemmeno, perche
quel rientro non passa da nessuna challenge.

**La correzione.** `sfrattaOccupante` cancella **tutti** i legami esterni, e lo
stesso fa il ramo di sfratto di `confirmPasswordReset`. Chi adotta l'account
ricrea il proprio subito dopo, in `upsertExternalAccount`: un legame che non si
ricrea non era di chi ha appena dimostrato di possedere l'indirizzo.

**La lezione, di nuovo la stessa del primo round, e per questo vale scriverla.**
Il primo round aveva concluso «serve un punto unico che li revochi tutti
insieme». Il punto unico era stato creato, e gli era stato dato un elenco
**incompleto**. Un punto unico non e una garanzia: e un posto dove guardare.
Quando si aggiunge un modo di entrare, si va li.

### HIGH — l'amministratore di piattaforma su un indirizzo mai verificato

Fino a PP-05, `isPlatformAdminUser` era sicura **per una ragione che non stava
in quella funzione**: `finalizeVerifiedSession` sollevava «Email non
verificata», quindi un indirizzo non provato non produceva nessuna sessione e
non poteva valere come identita da nessuna parte. ADR-0132 ha tolto quel
cancello — con una buona ragione — e la riga e rimasta a decidere sul **solo
indirizzo**.

L'elenco vive in `NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS`, cioe e
**pubblicato a ogni browser**. Chiunque registrasse un indirizzo di
quell'elenco non ancora presente in `users` — o se lo intestasse da
`PATCH /auth/user` — era amministratore di piattaforma alla richiesta
successiva: dati di pagamento di ogni societa, piani, profilo fiscale, conto
Stripe. La correzione del secondo round pretende anche un indirizzo
**provato**, e accettava come prova `email_verified_at` **oppure** la sua
proiezione `user_metadata.emailVerified`, per i chiamanti che vedono la forma
serializzata.

> **Quell'`OR` e durato un round.** Era la seconda sorgente a non valere
> niente, e il terzo round l'ha sfruttata per riaprire il difetto per intero:
> vedi «terzo round», sotto. La forma di oggi **distingue le due forme che
> riceve** invece di accettarle entrambe — chi porta la colonna e giudicato su
> quella e su nient'altro.

**La regola generale, che vale oltre questo caso**: quando si toglie un
cancello, si cerca **chi si appoggiava a quel cancello**. Qui c'era un secondo
punto, `parent-dashboard.ts`, che il proprio controllo lo faceva gia da se.

### MEDIUM-1 — l'UUID di un account non e un segreto, e apriva le rotte di verifica

`findUserByVerificationReference` accettava **sia** il riferimento opaco **sia**
l'UUID dell'utente, e `verification.userId` usciva in chiaro come UUID da ogni
risposta senza sessione. Due conseguenze:

1. la rotazione di `token_verification_id` nello sfratto era **teatro**:
   l'occupante non aveva bisogno del riferimento nuovo, perche l'UUID non cambia
   mai e lo aveva gia;
2. gli UUID utente circolano in molte proiezioni club-scoped, quindi chi ne
   aveva raccolti poteva pilotare `/verify/<canale>/send` e `/confirm` su
   account altrui, e **distinguere un identificativo vero da uno inventato** dal
   modo in cui rispondevano — cioe l'enumerazione che il resto della lane aveva
   chiuso, riaperta da una porta laterale.

Da qui in avanti l'UUID nudo vale **solo per chi ha gia una sessione su quel
medesimo account**: e il caso della pagina Account, dove non si rivela niente
che chi chiama non sappia gia di se stesso. Chiunque altro deve portare il
riferimento opaco, che `ensureVerificationReference` crea se manca e che le
risposte senza sessione emettono al posto dell'UUID. Prova S9, piu tre prove
sulle rotte vere.

### MEDIUM-2 — il contatore per destinatario contava meta

`hashTarget` fa `trim().toLowerCase()`, che per un indirizzo email e la
normalizzazione giusta e per un numero non lo e affatto: `3401234567` e
`+393401234567` sono lo stesso destinatario e producevano **due secchielli**. Il
tetto raddoppiava esattamente sulle righe scritte prima di PP-05 — cioe su tutte
quelle esistenti — perche la rotta di login leggeva la colonna grezza e quelle
di verifica il numero normalizzato. La canonicalizzazione sta ora dentro
`buildOtpTargetCounterKey` e non nei chiamanti: un chiamante che se la dimentica
non produce un errore, produce un contatore che conta meta.

Difetto gemello nella registrazione: si consumava il contatore sul numero del
**corpo della richiesta** e poi si mandava l'SMS a `pendingUser.phone`, il
numero **in archivio**. I due potevano essere diversi, e allora l'asse si
aggirava in un gesto — si ri-registra il proprio indirizzo passando ogni volta
un numero usa-e-getta, e l'SMS parte verso il numero della vittima con il suo
secchiello gia pieno. Ora si conta **il numero che riceve**.

### LOW

- **L-1** — `resolveSmsTransport` leggeva l'oggetto letterale con l'accesso
  diretto: `SMS_PROVIDER=constructor` e `SMS_PROVIDER=__proto__` restituivano un
  valore veritiero e passavano per «configurato», **spegnendo la segnalazione di
  configurazione errata** — cioe la cosa che quel modulo esiste per accendere.
  Nessun bypass (`delivers` restava `undefined`), ma la forma era sbagliata: ora
  `Object.hasOwn`, e `smsTransportDelivers` confronta con `=== true`.
- **L-2** — `sendPasswordResetChallenge` catturava il `P2002` ma non il **log**:
  il logger di Prisma stampa l'invocazione prima ancora che il codice
  applicativo veda l'errore, e quelle righe escono **fuori** dal punto unico
  degli errori. Una lettura prima dell'inserimento toglie il caso comune — il
  secondo clic sul pulsante — e la corsa vera resta al `catch`, che e il posto
  giusto per lei.
- **L-3** — `shouldExposeVerificationPreviewCode` negava tre nomi di ambiente e
  ammetteva tutto il resto: `NODE_ENV=prod` passava, perche non e nessuno dei
  tre. Ora e un elenco di **ammissione** (`development`, `test`, `local`). Un
  elenco di negazione va tenuto aggiornato contro l'ingegno di chi scrive le
  variabili; uno di ammissione no.
- **L-5** — `/verify/email/send` teneva un `console.error` con la sua deroga
  scritta a mano. La deroga era difendibile — usciva solo un codice — ma un
  secondo posto da cui si scrive nei log e un secondo posto da controllare, e la
  riga non portava l'identificativo di richiesta. Ora passa da
  `reportServerError`.

### Coverage gaps del secondo round

Dichiarati dal reviewer e **non** chiusi in questa lane:

- il flusso OAuth e stato attaccato sul ramo di **adozione**; il consenso
  iniziale presso il fornitore (state, PKCE, redirect URI) non e stato
  rimisurato in PP-05, perche non e cambiato;
- nessuna misura di **timing** vera e propria: l'anti-enumeration e verificata
  sull'**uguaglianza dei corpi e degli stati**, non sulla distribuzione dei
  tempi di risposta. Un oracolo temporale resterebbe invisibile a queste prove;
- l'invio SMS e sempre passato da un **doppio**: nessuna proprieta di un
  operatore reale (consegna, stato di recapito, alias mittente) e misurata, e
  non puo esserlo finche la scelta del fornitore e aperta;
- la superficie di anteprima e provata su **chi puo entrare** e su **cosa non
  spedisce**; non e stata attaccata come applicazione (per esempio con un
  catalogo manomesso), perche il catalogo e un valore del sorgente e non un dato.

---

## PP-05 — terzo round della revisione ostile (2026-09-05)

Terzo reviewer indipendente, sulla lane **intera** e con le correzioni dei due
round precedenti gia dentro. Esito: **1 Critical, 3 Low/Osservazione**. Il
Critical e istruttivo piu del difetto in se, perche e **il fix del round
precedente ad averlo aperto**.

### CRITICAL — l'indirizzo si dichiarava verificato da solo, e il fix di H-1 cadeva

Il secondo round aveva chiuso H-1 pretendendo un **indirizzo provato** prima di
concedere l'amministrazione di piattaforma. La funzione accettava come prova
**due sorgenti in `OR`**:

```
Boolean(user?.email_verified_at) || Boolean(user?.user_metadata?.emailVerified)
```

La prima e una colonna scritta solo da qualcosa che ha attraversato la casella.
**La seconda e una colonna JSON libera, scritta dal suo stesso soggetto** — la
stessa colonna che una Wave precedente aveva gia dovuto disinnescare per
`role`, e per la stessa ragione. La blocklist di `PATCH /api/v1/auth/user`
conosceva tre nomi (`role`, `app_metadata`, `is_platform_admin`) e non
`emailVerified`: nel frattempo il lettore ne aveva imparato un quarto, e nessuno
ha aggiornato la lista.

**La catena misurata.** L'elenco degli amministratori vive in
`NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS`, cioe e **pubblicato a ogni
browser**. Si occupa un indirizzo di quell'elenco non ancora registrato — la
casella non serve, perche l'indirizzo non si verifica — e si manda
`PATCH /auth/user {"data":{"emailVerified":true}}`. **Non cambia nessun
fattore**, quindi non passa nemmeno dal cancello della password attuale. Alla
richiesta successiva: `/api/v1/admin/*`, `/api/v1/platform/payments`,
`/api/v1/maintenance`, il profilo fiscale e i conti Stripe di ogni societa, e le
due pagine `private/`.

**Le due difese, indipendenti** — e la sonda misura che **ciascuna da sola**
chiude la catena (S10, verificata per mutazione in due varianti):

1. **`isPlatformAdminUser` distingue le due forme che riceve.** Chi porta la
   **colonna** — i chiamanti lato server, che hanno in mano la riga — viene
   giudicato su quella e su nient'altro. Solo chi non ce l'ha, cioe la
   proiezione verso il client (`/auth/complete` e le due pagine `private/`),
   ricade su `user_metadata.emailVerified`; e li quel campo non e quello
   dell'archivio, perche `buildUserMetadata` lo **ricalcola dalla colonna** a
   ogni serializzazione. La distinzione non e una supposizione sulla forma
   dell'oggetto: e la presenza della colonna.
2. **La blocklist del `PATCH` rifiuta tutte le proiezioni calcolate**, non solo
   quella trovata: `emailVerified`, `phoneVerified`,
   `phoneVerificationRequired`, `isClubCreator`, oltre a `role`, `app_metadata`
   e `is_platform_admin`. Le preferenze vere di una persona restano scrivibili,
   e un test lo presidia: una blocklist che cresce senza un criterio finisce per
   bloccare tutto.

**Le due lezioni, e la seconda e piu utile della prima.**

- Una **proiezione calcolata non si scrive**. `buildUserMetadata` ricostruisce
  quei campi da colonne vere a ogni serializzazione, quindi persisterli non
  cambia cio che il browser legge — viene sovrascritto — e cambia **solo** cio
  che leggono i chiamanti lato server. Una scrittura senza effetto visibile e
  con un effetto invisibile e la forma peggiore che possa avere: non c'e niente,
  nell'interfaccia, che segnali che e successa.
- **Un `OR` fra due sorgenti vale quanto la piu debole delle due.** Il fix
  aggiungeva una condizione per irrobustire una decisione, e l'ha indebolita,
  perche la condizione ammetteva una sorgente che l'interessato controlla. La
  comodita che l'ha motivata era vera — tre chiamanti vedono la forma
  serializzata — ma la risposta giusta a «due chiamanti portano due forme» e
  **distinguerle**, non accettarle entrambe.

### LOW / Osservazione — non chiusi, e perche

- **`prisma:error Unique constraint failed (user_id, channel)` sotto
  concorrenza vera.** Il logger interno di Prisma stampa prima che il codice
  applicativo veda l'errore, quindi quelle righe escono fuori dal punto unico.
  Il pre-read aggiunto al ramo reset (L-2 del secondo round) toglie il caso
  comune — il secondo clic — non la corsa vera. Contenuto: i soli **nomi** dei
  campi, nessun valore e nessun dato personale. E igiene di osservabilita, e la
  correzione giusta e la configurazione del logger, che non appartiene a questa
  lane. Annotato come debito **PP05-D7**.
- **L'`href` dell'invito atleta non passa da `sanitizeEmailUrl`.**
  Non sfruttabile oggi — il link e composto dal server, base da variabile
  d'ambiente e gettone casuale — ma e l'unico URL-in-attributo del sistema email
  rimasto fuori dal filtro, ed e anche reso nell'anteprima.
  `src/lib/server/athlete-accounts.ts` e di **PP-04** nel contratto di ownership
  parallelo: la frontiera non si attraversa. Gia registrato come dependency
  verso PP-04 e come debito **PP05-D4**, che ne esce allargato.
- **Saturazione del secchiello SMS per destinatario.** Registrando account con
  indirizzi usa-e-getta e **il numero della vittima** si consuma il contatore
  condiviso di quel numero (5 all'ora), e per quell'ora l'SMS legittimo della
  vittima non parte. E in parte **intrinseco** a un tetto per destinatario:
  toglierlo riaprirebbe HIGH-3 del primo round, che e molto peggio. Reversibile,
  limitato, nessun dato esposto. Annotato come debito **PP05-D8**.

### Coverage gaps del terzo round

Dichiarati dal reviewer:

- **OAuth vivo**: nessun provider configurato, quindi Google e Microsoft non
  sono stati esercitati end-to-end; il ramo del tenant Microsoft condiviso e
  verificato per lettura e dalla sonda S1.
- **Concorrenza sui tre assi di rate limit**: il reviewer si e appoggiato alle
  sonde del repository invece di scriverne una propria e indipendente.
- **Riscatto del gettone di club**: non attaccato in profondita.
- **SMTP/IMAP amministrativi**: letti, non sottoposti a fuzzing.
- **Segnaposto dei modelli di messaggio**: verificato il percorso di escaping e
  i sanificatori, non fatto fuzzing esaustivo dei blocchi con carichi avversari.
- **Enumerazione per tempi**: valutata per lettura — `bcrypt` gira sui due rami
  — e **non** misurata con un campionamento statistico. E lo stesso gap del
  secondo round, e resta aperto.

---

## PP-05 — quarto round della revisione ostile (2026-09-05)

Quarto reviewer indipendente, sulla lane intera e con le correzioni dei tre
round precedenti gia dentro. Esito: **2 Critical, 0 High, 1 Medium, 1 Low**.

I due Critical hanno **la stessa radice**, che nessuno dei tre round precedenti
aveva nominata: **un token di reset non era legato al recapito per cui era
nato, e nessuna delle logiche di sfratto spegneva cio che l'occupante teneva
gia in mano.**

E la terza volta di fila che il difetto nasce **dal fix del round prima** — non
per una svista di chi lo ha scritto, ma per una ragione strutturale che a
questo punto vale la pena scrivere per esteso: **ogni difesa nuova sposta il
confine di cio che conta, e cio che conta va poi riguardato tutto.** ADR-0132
ha reso mutabile un indirizzo che prima era di fatto immutabile, e da quel
momento «il token e legato all'account» ha smesso di significare «il token e
legato alla casella».

### CRITICAL-1 — un token nasce per un recapito, e valeva per l'account

`confirmPasswordReset` cercava la challenge per `user_id`, `channel`,
`purpose`, `consumed_at` ed `expires_at`. **Non per `target`** — mentre
`verifyInternalChallenge`, cioe la strada degli OTP, il destinatario lo aveva
nel `where` da sempre. La colonna `target` sulla riga c'era ed era scritta
correttamente: nessuno la leggeva.

La catena misurata, e l'attaccante e chiunque sappia registrarsi:

1. l'elenco degli amministratori vive in
   `NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS`, cioe e **pubblicato a ogni
   browser**. Si sceglie un indirizzo di quell'elenco non ancora registrato;
2. ci si registra con un **indirizzo proprio** e il proprio numero, si verifica
   il telefono (scopo `signup`, quindi una sessione si apre), e l'indirizzo
   resta non verificato;
3. `POST /password/forgot` **sul proprio indirizzo**: il token arriva nella
   propria casella, legittimamente;
4. `PATCH /auth/user` cambia l'indirizzo in quello dell'amministratore. Passa
   dal cancello della password attuale, che l'attaccante ha, ed e giusto che
   passi: cambiare il proprio indirizzo e una funzione del prodotto. Il cambio
   azzera `email_verified_at`, com'e giusto;
5. `POST /password/reset` consuma il token. Nessun controllo sul destinatario,
   e il consumo scrive `email_verified_at` **sull'indirizzo nuovo**, sulla
   teoria «chi apre il link controlla la casella» — che dopo il passo 4 **non e
   piu vera**;
6. `isPlatformAdminUser` risponde `true`. Alla richiesta successiva: dati di
   pagamento di ogni societa, piani, profilo fiscale, conti Stripe.

Il difetto **non e** il cambio di indirizzo, ed e importante dirlo: e la
**teoria del token**. Un token dimostra il possesso del recapito a cui e stato
consegnato, e di nessun altro.

**Due difese indipendenti**, e la sonda misura che **ciascuna da sola** chiude
la catena:

1. il destinatario entra nel `where` di `confirmPasswordReset`, come lo era da
   sempre per gli OTP;
2. il destinatario entra nel **legame crittografico** dell'impronta
   (`hashOtpCode`, che ora lega canale, scopo, utente **e destinatario**). Chi
   verifica passa il destinatario **corrente**, mai `challenge.target`: prendere
   il valore dalla riga renderebbe il legame vero per costruzione, cioe vacuo.

La seconda esiste perche le due sono davvero indipendenti: un `where` e una
riga che si puo dimenticare **in uno dei chiamanti** — ed e esattamente cio che
era successo — mentre un legame crittografico vale per chiunque chiami, anche
per chi lo dimentica.

### CRITICAL-2 — lo sfratto toglieva le righe, non cio che l'occupante aveva in mano

`sfrattaOccupante` azzerava password e numero, ruotava il riferimento pubblico,
cancellava sessioni e legami `external_accounts` — quest'ultimo aggiunto dal
secondo round, proprio per la stessa ragione. Non toccava
`auth_verification_challenges`: **un token gia emesso sopravviveva allo
sfratto**, e ne vive trenta.

La catena: si occupa un indirizzo libero, ci si chiede subito un reset, e si
**aspetta**. La vittima arriva davvero dal proprio Google, lo sfratto scatta e
le restituisce l'account. A quel punto l'indirizzo risulta verificato — l'ha
verificato lei — quindi il ramo di sfratto di `confirmPasswordReset` non scatta
nemmeno, e il token dell'occupante **sovrascrive la password** della persona a
cui l'account e appena stato restituito, lasciandole intatto il legame Google.
L'attaccante entra con la propria password.

Chiuso spegnendo tutte le challenge vive dentro lo sfratto, e — caso simmetrico
— dentro il reset password: chi cambia la password perche sospetta di essere
stato compromesso non deve trovarsi in casa un codice altrui ancora valido, e
un codice `login` gia emesso e una porta gia aperta.

**Una challenge viva e un canale di accesso.** ADR-0134 dice che sfrattare
significa chiuderli tutti, e questo e il terzo canale che si aggiunge a
quell'elenco in tre round: password, telefono, sessioni, legami esterni,
challenge. L'elenco si allunga di uno **ogni volta che qualcuno guarda** — che
e il modo giusto di leggere «un punto unico non e una garanzia, e un posto dove
guardare».

### MEDIUM — l'SMS della registrazione e un oracolo di enumerazione

Le risposte HTTP della registrazione sono indistinguibili — stesso corpo,
stesso stato, tempi entro pochi millisecondi, tutto misurato — ma la
**consegna dell'SMS** no: sul ramo dell'indirizzo gia occupato l'SMS parte solo
se la password coincide, mentre per un indirizzo libero parte sempre. Chi
registra un indirizzo candidato **col proprio numero** scopre dall'arrivo o
meno del messaggio se quell'indirizzo esista gia.

Registrato come **PP05-D9** e non chiuso, con la ragione scritta: le tre
correzioni possibili sono peggiori del difetto. Mandare comunque un SMS
significherebbe spedire verso un numero che nessuno ha ancora provato, cioe
riaprire HIGH-3 del primo round; non mandarlo mai spegnerebbe la ripresa di una
registrazione interrotta, che e un caso reale; e distinguere «chi sta
registrando davvero quel numero» da «chi lo sta sondando» pretende il
**possesso**, cioe proprio cio che l'SMS deve ancora provare. Il tetto per
destinatario limita comunque la misura a cinque tentativi l'ora **per numero**,
e il numero e quello dell'attaccante.

### LOW — le righe `prisma:error` anche sul percorso OTP

Stessa forma gia registrata come PP05-D7 per il reset: sotto reinvii simultanei
il logger interno di Prisma stampa la violazione dell'indice unico parziale
**prima** che il `catch` la veda. La proprieta di sicurezza regge — una sola
challenge viva, misurato — ed e igiene di osservabilita. PP05-D7 si allarga
invece di moltiplicarsi.

### Coverage gaps del quarto round

Dichiarati dal reviewer:

- **`/private/email-preview` e «invio da anteprima»**: verificati per **lettura**
  (guardia di sessione piu `isPlatformAdminSession`, `sandbox=""`, catalogo che
  non chiama il punto di invio). Non esercitata la pagina con una richiesta
  reale; la proprieta «non spedisce» resta misurata da
  `tests/email/anteprima-non-spedisce.test.mjs`, che passa.
- **OAuth**: esercitato `findOrCreateOAuthUser` direttamente, **non** il flusso
  completo `state`/CSRF/redirect ne lo scambio del codice.
- **Leak di segreti SMTP**: solo lettura. Non iniettato un errore SMTP reale
  per ispezionare l'uscita del logger.
- **Manipolazione di `X-Forwarded-For`**: solo lettura di `getRequestIp`. E lo
  stesso perimetro di PP05-D5, che resta aperto.
- **Corsa reset-contro-sfratto sotto concorrenza vera**: CRITICAL-2 dimostrato
  in sequenza deterministica e non come corsa parallela — e non serve, perche
  la finestra e l'intera vita del token.
- **Gettone dei ruoli personalizzati**: letto, non montato contraffatto contro
  una rotta protetta. Lo misura pero `scripts/pp-05-gettone-tessera-probe.mjs`
  (prova G5), scritta per la dependency di PP-03.
- **Enumerazione per tempi**: misurata sui corpi, sugli stati e su un delta di
  latenza, **non** con un campionamento statistico. E il gap che si ripete in
  tre round su quattro, e a questo punto e un limite del metodo.

---

## PP-05 — quinto round della revisione ostile (2026-09-05)

Round intero sulla lane, con le correzioni dei quattro round precedenti gia
dentro. Esito: **1 Critical, 0 High, 2 Medium**.

I quattro round precedenti avevano guardato **una porta sola**, e con
crescente attenzione: `/api/v1/auth/**`. Il Critical di questo round non e
dentro quella porta. E la stessa colonna, dall'altra parte.

### CRITICAL — il registro generico scriveva i recapiti, e nessuna delle sette difese girava li

`PATCH /api/v1/users/<la propria riga>` filtra il corpo sullo **schema Prisma**
e negava tre nomi: `role`, `app_metadata`, `is_platform_admin`. Ogni altra
colonna scalare di `User` passava — `email`, `email_verified_at`, `phone`,
`phone_verified_at`, `phone_verification_required`, `password_hash`,
`token_verification_id`, `is_club_creator` — cioe **tutti i recapiti e tutte le
credenziali**.

Le tre catene, misurate contro PostgreSQL con le rotte vere
(`sonda A-1…A-10`, poi `tests/server/platform-boundary.test.mjs`):

1. **amministratore di piattaforma con una richiesta sola.** L'elenco degli
   indirizzi vive in `NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS`, cioe e
   pubblicato a ogni browser. Ci si registra, si verifica il **proprio** numero
   — del tutto legittimo — e si manda
   `{"email":"<indirizzo dell'elenco>","email_verified_at":"<adesso>"}`.
   `isPlatformAdminUser` giudica sulla colonna, che il quarto round aveva
   appena reso la fonte sicura;
2. **un'occupazione che sopravvive allo sfratto OAuth.** Ci si scrive
   `email_verified_at` addosso e **poi** si cambia `email` in quello della
   vittima: `eraOccupatoSenzaProva` e falso, quindi `sfrattaOccupante` **non
   viene chiamato**. Le cinque difese accumulate dentro lo sfratto non sono
   state aggirate: non sono state eseguite;
3. **l'area famiglia di un minore.** Il legame per indirizzo di contatto si fida
   di un indirizzo **provato**: intestarsi quello di un tutore apriva diagnosi,
   allergie, terapie e anagrafica del minore.

**La correzione e un elenco di ammissione**, `WRITABLE_USER_FIELDS`
(`src/lib/server/resources.ts`): `first_name`, `last_name`,
`organization_name`, `user_metadata`, `updated_at`. Da qui si scrive
**anagrafica**; recapiti e credenziali si scrivono dal loro punto di ingresso
unico, `/api/v1/auth/**` (CLAUDE.md §2). Un elenco di negazione va aggiornato
contro ogni colonna che qualcuno aggiungera domani, e in quattro round questo
repository ha dimostrato **tre volte** che non succede.

Nello stesso commit sparisce dal registro generico anche la traduzione
`password` → `password_hash`: era la riga che aveva reso sfruttabile
l'`upsert` per email di una revisione precedente, ed era rimasta viva senza
nessun chiamante.

### MEDIUM-1 — due difese contro lo stesso privilegio, tenute in due elenchi diversi

Le chiavi proibite dentro `user_metadata` vivevano in due liste, una per porta:

    auth/user  = [app_metadata, emailVerified, isClubCreator, is_platform_admin,
                  phoneVerificationRequired, phoneVerified, role]
    resources  = [app_metadata, is_platform_admin, role]

Il terzo round ne aveva corretta **una**, lasciando scritto nel commento «due
difese per lo stesso privilegio, perche una sola prima o poi si dimentica». La
seconda era gia dimenticata mentre quella frase veniva scritta.

L'elenco sta ora in `src/lib/auth/user-metadata-policy.ts` — modulo puro,
nessun Prisma, nessuna rete — e le due porte importano `stripProtectedUser
Metadata`. Un test presidia che nessuna delle due **dichiari** una lista
propria: duplicare una difesa non la raddoppia, raddoppia i posti in cui
dimenticarsi di aggiornarla.

### MEDIUM-2 — l'asse «per account» dei contatori si consumava su una stringa scelta dal chiamante

Le quattro rotte di verifica accettano nel corpo un `userId` che **non e**
l'identificativo dell'account: e il riferimento opaco, oppure l'UUID nudo per
chi ha gia una sessione su quell'account. Il contatore «per account» si
consumava su **quella stringa**, e lo stesso account si nomina in piu modi — il
riferimento corrente, l'UUID, e un riferimento **appena ruotato**, cosa che il
prodotto fa da se in tre punti. Un secchiello per nome vuol dire un asse
azzerabile su richiesta.

**Misurato contro PostgreSQL con le rotte vere**, due nomi dello stesso account,
sei richieste per nome, tetto dichiarato cinque:

| rotta | prima | dopo |
|---|---|---|
| `POST /auth/verify/phone/confirm` | **10 passate su 12** | 5 |
| `POST /auth/verify/email/confirm` | **10 passate su 12** | 5 |
| `POST /auth/verify/phone/send` | 5 (mascherato) | 5 |
| `POST /auth/verify/email/send` | 5 (mascherato) | 5 |

**Dove pesa davvero e la conferma**, e non e un caso: li quel contatore e cio
che limita i tentativi di indovinare un codice a sei cifre **oltre** i cinque
della challenge, e non c'e nessun secondo asse che copra l'errore. Sulle due
rotte di invio l'asse per **destinatario** — stesso tetto, chiave l'impronta del
recapito — arriva nel caso comune alla stessa conclusione, ed e la ragione per
cui li il difetto non si vedeva. Si separano quando il recapito cambia: il
secchiello per destinatario e nuovo perche il destinatario e nuovo, e quello per
account non deve esserlo. E la forma in cui la prova di regressione lo misura.

**La correzione**: l'asse per **rete** resta prima della risoluzione del
riferimento — cosi provare un riferimento a caso costa quanto provarne uno
valido, e copre il costo della lettura — e l'asse per account si consuma
**dopo**, su `utente?.id || userId`. Il ripiego sulla stringa grezza non e
pigrizia: senza, la differenza fra i due 429 direbbe quali riferimenti esistono.

**Nessun secondo esemplare altrove.** Passati in rassegna tutti i chiamanti di
`consumeRequestRateLimits`: gli altri assi per identita sono consumati su
`session.db.user_id` (cambio credenziali), sull'indirizzo normalizzato
(login, registrazione, reset) o sull'impronta di un gettone che **e** il
segreto (link di pagamento, riscatto accesso, stato iscrizione) — cioe su
valori che il chiamante non puo moltiplicare a piacere.

---

## PP-05 — giro conclusivo di attacco (2026-09-05)

Eseguito **dopo** le correzioni del quinto round, sulla superficie che il brief
della lane elenca. Esito: **Critical 0 · High 0 · Medium 0 · Low 0**, su
`scripts/pp-05-giro-conclusivo-probe.mjs`, **29 prove**.

Un giro che non trova niente vale solo se e scritto: altrimenti la volta dopo
si riguarda cio che era gia sicuro e non cio che nessuno ha mai aperto. Quella
sonda **resta**, ed e la mappa di dove si e guardato.

| Superficie del brief | Prove | Esito |
|---|---|---|
| Iniezione HTML nei template (nome club, nome atleta, oggetto) | C1-a…e | il carico ostile diventa entita in ogni blocco, compreso `alt` e `title` |
| Esfiltrazione via link | C2-a…c | otto schemi rifiutati, cinque forme di colore rifiutate, i tre schemi utili passano |
| Esfiltrazione via immagini remote | C3-a…d | logo di club fuori origine e `data:` ricadono sul **nome scritto**; nel markup reso zero immagini di terzi |
| Iniezione di intestazioni SMTP | C4-a…b | un oggetto con CR/LF non fabbrica nessuna intestazione, nessun `Bcc` |
| Segreti SMTP nei log o nell'anteprima | C5-c | sei stringhe cercate nel catalogo, nessuna trovata |
| Accesso non autorizzato all'anteprima | C5-e…f | sessione **e** ruolo di piattaforma, piu `sandbox=""` |
| Invio reale scatenato da un'anteprima | C5-a | otto voci costruite, zero invii con trasporto strumentato |
| Entropia insufficiente | C6-a…c | 150 codici distinti, dieci cifre in **ogni** posizione, zeri iniziali presenti, nessun codice in archivio |
| Corsa fra send e confirm | C7 | otto conferme simultanee dello stesso codice: **una** vince |
| Escalation via cambio recapito | C9 | l'indirizzo si cambia, la prova si azzera, il controllo di piattaforma risponde no |
| Rate limiting su un asse scelto dal chiamante | vedi MEDIUM-2 | quattro esemplari, tutti chiusi; nessun quinto |
| Enumerazione via risposte o tempi | S9, S5, `registrazione-dalla-rotta` | gia misurata nei round precedenti, non ripetuta |

### Tre prove sbagliate, e cosa insegnano

Il primo passaggio della sonda usciva **26/29**. Nessuno dei tre rossi era un
difetto del prodotto: erano tre prove che misuravano la cosa sbagliata. Vale la
pena scriverlo, perche una prova sbagliata che passa e peggio di una che
fallisce, e queste fallivano solo per fortuna.

1. **«nessun gestore d'evento in linea»** cercava `on\w+=` sul markup intero, e
   trovava `onerror=` **dentro** `&lt;img src=x onerror=alert(2)&gt;` — cioe
   dentro la prova che l'escaping aveva funzionato. Si cerca ora su cio che
   resta tolte le sequenze fra `&lt;` e `&gt;`.
2. **«il testo semplice non porta markup»** era una proprieta sbagliata da
   volere: sfuggire la parte `text/plain` mostrerebbe `&lt;` a chi legge la
   posta in testo. La proprieta giusta e che quel testo **non finisca mai dove
   viene interpretato** — nel messaggio e `text/plain`, e nell'unica pagina che
   lo mostra e un figlio JSX, mentre in `srcDoc` finisce solo l'HTML.
3. **l'iniezione di intestazioni SMTP** era misurata con `jsonTransport`, che
   restituisce i campi com'erano senza costruire nessuna intestazione: il CR/LF
   ricompariva intatto e sembrava un difetto. Con `streamTransport` escono i
   byte veri, e il compositore piega l'oggetto su una riga sola.

Il terzo caso lascia anche un **limite dichiarato**: quella difesa e una
proprieta di `nodemailer`, non una normalizzazione di EasyGame. La prova serve
a sapere quando smettera di valere.

### Coverage gaps dichiarati del giro conclusivo

Un gap dichiarato vale piu di una copertura affermata.

1. **Nessuna pagina React esercitata da una richiesta vera.** Il runner e
   `node --experimental-strip-types`, che toglie i tipi e **non compila JSX**:
   nessun componente di questo repository e mai stato reso da un test
   ([15](15-testing.md)). Restano fuori i due `redirect` della pagina di
   anteprima, misurati sul sorgente.
2. **Consegna reale di email e SMS: non misurata**, per vincolo del mandato.
   Le sonde guardano la riga in archivio, la risposta della rotta e il MIME
   composto, mai una casella.
3. **Enumerazione per tempi: nessun campionamento statistico.** Misurata sui
   corpi, sugli stati e su un delta di latenza. E il gap che si ripete in tutti
   i round, ed e un limite del metodo.
4. **Il giro OAuth completo** — scambio del codice, `state`, redirect — non e
   stato attaccato: esercitato `findOrCreateOAuthUser` direttamente.
5. **Iniezione di intestazioni: misurato l'oggetto, non il destinatario.** Un
   indirizzo con CR/LF non e stato provato, perche gli indirizzi in questa lane
   non arrivano mai dal client: escono da `users.email` e da
   `guardians[].email`, gia normalizzati.
6. **`X-Forwarded-For` contraffatto**: solo lettura di `getRequestIp`. E il
   perimetro di PP05-D5, che resta aperto ed e precedente alla lane.
---

## PP-03 — Le due porte del terzo round (2026-09-05)

Verbale completo in [47 — PP-03 Trainer](47-pp-03-trainer.md) §9. Qui restano
le due regole che valgono oltre l'area allenatore.

### Una riga indirizzata a qualcuno non e protetta dal confine del club

`applyRecipientScope` filtrava l'elenco delle notifiche per destinatario e
`assertRecordAccess` — che e il punto comune di `getResourceById`,
`updateResource` e `deleteResource` — guardava soltanto il club. Con
l'identificativo in mano, un qualunque membro **leggeva, riscriveva e
cancellava** la notifica di un altro, riepilogo economico di una famiglia in
arretrato compreso.

**La regola generale.** Quando una risorsa dichiara un destinatario, il
destinatario e parte del confine, e va verificato **su ogni verbo**, non solo
sull'elenco. Una correzione che chiude la lista e lascia aperta la lettura per
identificativo non e una correzione: e uno spostamento.

Vale per `RECIPIENT_SCOPED_RESOURCES` (`notifications`,
`simplified_notifications`) e per ogni risorsa che vi si aggiungera: la guardia
sta nell'insieme, non nel nome.

### Su una colonna JSON libera il dato clinico si dichiara per ammissione

[ADR-0126](18-decision-log.md). Il taglio del contenuto clinico dentro
`medical_certificates.data` era un elenco di campi **vietati**, e una revisione
ostile lo ha aggirato scrivendo il campo con un nome italiano: `diagnosi`,
`referto`, `terapia` uscivano interi a chi ha soltanto `clinical.status_read`.

**La regola generale.** Un elenco di vietati e sostenibile solo dove l'insieme
dei campi e **chiuso**, cioe su uno schema fisso. Dentro una colonna `data`
l'insieme non e chiuso, e la difesa va invertita: si dichiara cosa passa.

Il costo e dichiarato e va nella direzione giusta — un campo dimenticato manca
a schermo, e si nota; un campo dimenticato nell'altro verso e un referto che
esce, e non se ne accorge nessuno. `athletes.data` resta sull'elenco di
vietati per una ragione misurata, non per inerzia: e annotata come `PP03-D5` in
[16 — Debito tecnico](16-technical-debt.md).

## PP-03 — Le quattro porte del quinto round (2026-09-05)

Verbale completo in [47 — PP-03 Trainer](47-pp-03-trainer.md) §15. Qui restano
le quattro regole che valgono oltre l'area allenatore. Nessuna delle quattro e
un difetto di ruolo: sono tutte **una regola giusta applicata a una fonte
sbagliata**, o applicata a una porta sola.

### Una grafia che arriva con la richiesta non e una grafia

Il perimetro dell'allenatore ammetteva una categoria se **una qualunque** delle
sue grafie — identificativo o nome — stava nell'insieme. La regola e giusta: sono
la stessa cosa detta in due modi. La fonte no: `category_name` arriva **con il
corpo della richiesta**, quindi bastava dichiarare come nome l'identificativo di
una categoria propria per scrivere sotto la categoria di un altro.

**La regola generale.** Due grafie sono la stessa cosa solo se lo dice un
**registro**, non se lo dice chi chiama. Le grafie si risolvono lato server, una
volta, contro il registro del club; il confronto resta poi sugli
identificativi, cioe su cio che va in colonna.

E un registro puo essere ambiguo: se un nome coincide con l'identificativo di
un'altra riga, o appartiene a due righe, non risolve niente — la voce resta se
stessa e fallisce chiuso. Un'ambiguita risolta a favore di chi chiede e la
contraffazione rifatta dal registro invece che dalla richiesta.

### Due assi di perimetro: uno decide in lettura, tutti e due in scrittura

Dove un perimetro ha piu assi (gruppo e categoria, sede e categoria), un ramo che
`return`-a sul primo asse **spegne** il secondo. Misurato: un evento con un
gruppo proprio e la categoria di un altro veniva accettato in scrittura, perche
il ramo dei gruppi usciva prima.

**La regola generale.** In *lettura* un asse piu preciso puo decidere da solo
(ADR-0055: il gruppo distingue due squadre che condividono la categoria). Su un
**atto** gli assi stanno in **AND**, che e gia la regola di ADR-0103. E l'asse che
l'oggetto **non dichiara** non conta: un evento di soli gruppi, tutti propri,
resta suo — l'AND si fa fra gli assi dichiarati, non fra tutti quelli esistenti.

### Il perimetro segue la riga anche dalla porta del contenitore

Le risorse di club non hanno una tabella propria: sono righe di
`club_resource_items`, e il registro le serve **per nome** e **per contenitore**.
La proiezione risolveva gia il tipo della riga e proiettava come se fosse stata
chiesta per nome; il **perimetro** no — arrivava col nome del contenitore, che
negli insiemi filtrati non c'e. Da li uscivano le note di segreteria interne alla
direzione e quelle indirizzate a un altro allenatore, in elenco, per
identificativo, e nel conteggio di `meta.total`.

**La regola generale.** Ogni difesa che si accende su un **nome di risorsa** deve
risolvere il nome allo stesso modo in cui lo risolve la proiezione. Se un file
dichiara per iscritto che esiste una seconda porta — e `resources.ts` lo
dichiarava — quella dichiarazione vale per **tutte** le guardie, non per la prima
che qualcuno ha corretto.

E il corollario che la correzione ha imparato a sue spese: un vaglio si applica
alla **forma** su cui e stato scritto. Filtrare la riga grezza con una funzione
scritta per la riga proiettata non fa uscire niente e fa sparire tutto — una nota
legittima che scompare e un difetto tanto quanto un segreto che esce, e una prova
che guarda solo i segreti direbbe «chiuso».

### Chi vede lo stato e non il contenuto legge l'anagrafica per elenco di ammessi

L'inversione di [ADR-0126](18-decision-log.md) valeva per
`medical_certificates.data`; `athletes.data` — la stessa colonna libera — era
rimasta sull'elenco dei vietati, e il quinto round l'ha vinta con contenitori dal
nome nuovo (`schedaSanitaria`, `anamnesi[]`) e campi dal nome italiano.

**Le tre regole generali.**

1. **Un contenitore si dichiara.** Dentro una colonna libera, un valore composto
   — oggetto o elenco — esce solo se il suo nome e nell'elenco degli ammessi: un
   contenitore e il posto in cui il testo libero si nasconde, e nessun elenco di
   divieti ne indovina il nome.
2. **Si dichiara anche la forma, non solo il nome.** Un nome ammesso senza una
   forma dichiarata e l'elenco dei vietati che rientra dalla finestra: `source`
   e una provenienza, cioe una parola, e con un oggetto dentro portava fuori un
   referto.
3. **L'anagrafica di un altro si serve per elenco di ammessi.** Chi ha
   `clinical.status_read` e **non** `clinical.read` legge `athletes.data` per
   ammissione, come gia legge la scheda di un collega
   (`CAMPI_PERSONA_VISIBILI_ALL_ALLENATORE`). Il lettore si definisce con un
   **predicato sulle chiavi**, non con un nome di ruolo, cosi la regola vale
   anche per i ruoli di club che derivano da `trainer`. La famiglia non ha
   nessuna delle due chiavi e resta fuori: legge la scheda del proprio figlio.

Il prezzo di ogni inversione e lo stesso e va dichiarato: un campo dimenticato
**manca a schermo**, e si nota. Nell'altro verso e un referto che esce, e non se
ne accorge nessuno. In questa lane il prezzo si e pagato subito — una delle
cinque grafie della scadenza del certificato mancava dall'elenco, e un test
esistente l'ha fatto fallire nello stesso commit.

`PP03-D5` — il debito che teneva `athletes.data` sull'elenco dei vietati — e
**chiuso** da questa correzione.

### Le tre regole che il sesto round ha aggiunto alle tre di sopra

Il round successivo ha riattaccato le tre regole qui sopra e le ha vinte due
volte. Le due riaperture non hanno trovato una svista: hanno trovato la
**stessa forma** del difetto un livello piu sotto. Quello che segue e cio che
mancava, e vale oltre il dato clinico.

4. **Un predicato di sicurezza ha un solo termine, o il verso si inverte.**
   Il lettore ristretto era «ha la chiave dello stato **e non** quella del
   contenuto». Un ruolo a cui la societa toglie **anche** la chiave dello stato
   non ha nessuna delle due, quindi non era «quel lettore», quindi leggeva la
   colonna **intera**: togliere una casella dava **piu** dato. La domanda giusta
   nomina la cosa che si protegge — *hai titolo al contenuto?* — e chi non ce
   l'ha sta dalla parte stretta, qualunque sia la ragione per cui non ce l'ha.
   Una congiunzione dentro un predicato di sicurezza va letta due volte: la
   seconda chiedendosi chi cade **fuori** da entrambi i termini.

5. **Un contenitore ammesso non e un lasciapassare per cio che ha dentro.**
   Ammettere `guardians` per nome e lasciarlo passare intero riporta il testo
   libero esattamente dove lo si era tolto. Di una voce di contenitore escono i
   campi dichiarati, e **solo se semplici**: un valore composto sotto un nome
   ammesso e il secondo posto in cui si nasconde un referto.

6. **Un elenco di negati non sa niente di cio che non conosce.** Chi filtra
   togliendo i nomi vietati da un elenco di nomi **dichiarati** lascia passare
   tutto cio che quell'elenco non contiene — una grafia al singolare, un tipo
   scritto a mano, una colonna di testo libero su cui hanno scritto in quindici.
   Chi ha titolo a un **sottoinsieme** va servito per elenco di ammessi; l'elenco
   dei negati resta valido solo per chi ha titolo a **tutto**, dove un nome
   sconosciuto e una riga storica da non far sparire.

**E una regola che non riguarda gli elenchi ma le porte**, e questa lane l'ha
trovata cinque volte nello stesso file: quando una risorsa si raggiunge sia per
**elenco** sia per **identificativo**, la guardia va nel punto comune ai verbi,
non nell'elenco. Un filtro di elenco corretto e una lettura per id senza guardia
sono la stessa risorsa con due risposte diverse, e chi attacca prova la seconda.

---

## Un atleta di questo club, e nessun altro (Critical, 2026-09-05)

**Il difetto.** `saveEventConvocations` e `saveEventAttendance`
(`src/lib/server/events.ts`) verificavano **l'evento** — che appartenesse al
club attivo (`assertActiveClub`), che stesse nel perimetro dell'allenatore
(`assertTrainerEventPerimeter`), che il ruolo avesse il permesso — e **non
verificavano gli atleti**.

L'unica guardia sul lato atleta, `assertAtletiDentroIlPerimetro`, esce alla
prima riga quando il ruolo attivo non dichiara un perimetro di sede o categoria:

```ts
if (!buildAthleteAccessScopeConditions(scope)) return;
```

Quel perimetro nasce dalle righe di `club_access_scopes`, che **solo un ruolo
personalizzato ristretto possiede**. Un `trainer` ordinario, un `owner`, la
segreteria: nessuno di loro ne ha, quindi per **tutti** loro non veniva
eseguito nessun controllo sull'atleta. E
`club_event_participants.athlete_id` non e nemmeno una chiave esterna — e una
colonna di testo libero (`prisma/schema.prisma`, `model ClubEventParticipant`).

**La gravita.** Non e un errore di visualizzazione: e una **scrittura
cross-tenant**. Misurato dalle porte vere, con un allenatore ordinario del club
A, contro PostgreSQL:

| atto | prima | dopo |
|------|-------|------|
| convocare l'atleta del club **B** | **accettato**, riga scritta | negato, 0 righe |
| segnarne la **presenza** | **accettato**, riga scritta | negato, 0 righe |
| un identificativo che non nomina nessun atleta | **accettato**, riga scritta | negato, 0 righe |
| un elenco misto (uno dentro, uno fuori) | **accettato per intero** | negato per intero, 0 righe |

Le due conseguenze che rendono il difetto Critical e non High: **convocare fa
partire l'invito alla famiglia** di quel minore — quindi il difetto esce dal
sistema e raggiunge una persona — e **la presenza e il dato su cui
`src/lib/server/funding.ts` rendiconta i contributi pubblici**, quindi entra in
una dichiarazione verso un ente.

**La regola, adesso.** `assertAtletiDelClub` gira su **entrambe** le porte,
prima di ogni altra guardia sul lato atleta e senza condizioni sul ruolo:

> Ogni identificativo di atleta che arriva da un client deve esistere in
> `athletes` **con l'`organization_id` del club attivo**. Se anche uno solo non
> c'e, la chiamata e negata.

**Rifiuta l'elenco intero, non filtra.** Una guardia che scartasse gli estranei
e scrivesse il resto risponderebbe «riuscito» a chi ha chiesto una cosa diversa
da quella che e stata fatta: e la stessa forma del 200 muto chiuso altrove
(KB 09). Se un nome e fuori, non entra nessuno.

**Che cosa questa guardia NON e**, e va detto perche una guardia troppo stretta
non e piu sicura, e rotta:

- **non e il perimetro di categoria** — convocare un atleta del club fuori
  dalla propria categoria e lecito, e `isExtraCategory` esiste per dichiararlo;
- **non e lo stato del tesseramento** — un atleta non piu attivo resta un
  atleta di questo club;
- **non sostituisce** `assertAtletiDentroIlPerimetro`, che resta e continua a
  restringere per sede e categoria i ruoli che dichiarano un perimetro.

**Le prove.** `scripts/eventi-perimetro-atleti.mjs` (14 sonde contro PostgreSQL
vero, dalle porte vere, con un allenatore ordinario) piu cinque test in
`tests/server/eventi-servizio.test.mjs`. Entrambi **verificati per mutazione**:
togliendo la guardia la sonda passa da 14/14 a 6/14 e quattro dei cinque test
diventano rossi. Il quinto — «la guardia non e il perimetro di categoria ne lo
stato del tesseramento» — resta verde, ed e giusto cosi: e la meta che dice se
la correzione e stretta al punto sbagliato.

**`rsvp.ts` non era colpito**, ed e stato verificato: risolve
l'`organization_id` **dall'atleta** (`athlete.organization_id`) e rifiuta un
club dichiarato che non coincida, quindi da li una riga cross-tenant non puo
nascere.

---

## Il riscatto di un gettone consegnava tutto il club (P0-2, 2026-09-06)

**Il difetto.** Le due strade del riscatto creavano una tessera e **non
scrivevano nessuna riga di perimetro**. Per
[ADR-0103](18-decision-log.md#adr-0103--il-perimetro-e-dellassegnazione-e-zero-righe-significano-tutto-il-club) zero righe non significa «nessun
accesso»: significa **tutto il club**.

| strada | dove | cosa scriveva |
|--------|------|----------------|
| gettone dell'atleta | `acceptAthleteAccountInvite` (`athlete-accounts.ts`) | tessera `athlete`, **zero** righe di perimetro |
| gettone generico (allenatore, tutore, ruolo) | `POST /api/v1/auth/access/redeem` | tessera con il ruolo del gettone, **zero** righe di perimetro |

`club_access_scopes` era scritto **solo** da `club-roles.ts`, cioe solo dalla
Gestione accessi. Nessuno dei due riscatti lo toccava.

**La gravita.** Misurato dalle porte vere contro PostgreSQL, con un gestore
recintato sulla **sola sede A** che conia il gettone:

| | prima | dopo |
|---|---|---|
| atleta che riscatta il proprio invito | `accessScopeAllows` **true su ogni sede** | solo le sedi e le categorie delle sue appartenenze |
| allenatore, gettone di un gestore recintato | **true su ogni sede** — il recinto del gestore evaporava | il perimetro del profilo, dentro quello dell'emittente |
| tutore, gettone di un gestore recintato | **true su ogni sede** | il perimetro del minore, dentro quello dell'emittente |

E la stessa lezione che `accessScopeContains` aveva **gia** imparato
sull'altro lato — «un `club_manager` recintato concedeva a una seconda utenza
un `club_manager` senza perimetro, e da quel momento leggeva tutto il club per
interposta persona» — ma quella regola valeva solo sulla Gestione accessi. Il
gettone era la porta che la aggirava.

L'asimmetria rende il difetto inequivocabile: `AthleteAccountsScope.accessScopes`
esiste **apposta** perche un operatore recintato non possa invitare un atleta
fuori dal proprio perimetro. Quel perimetro era applicato a **chi manda**
l'invito e non arrivava mai alla tessera che il riscatto creava.

**La regola, adesso.** Due ingredienti e un ordine preciso:

1. cio che il **profilo di origine** dichiara — le categorie della scheda di un
   allenatore, le appartenenze di un atleta, quelle del minore a cui un gettone
   lega un tutore;
2. cio che **chi ha coniato** poteva concedere.

La risposta non e mai piu larga del secondo, e quando il primo non dice niente
**e** il secondo e ristretto si consegna il secondo — perche consegnare zero
righe li dentro vorrebbe dire consegnare tutto il club. Un asse che l'emittente
restringe e che il profilo non nomina prende i valori dell'emittente: lasciarlo
vuoto lo renderebbe «tutte».

Il calcolo e `resolveRedeemAccessScopes`; la scrittura e
`applyRedeemAccessScopes`, che **rimisura il calcolato** con
`accessScopeContains` e rifiuta se uscisse dal recinto. Le due funzioni vivono
in `club-roles.ts`, che resta l'unico scrittore di `club_access_scopes`: il
riscatto non ne diventa un settimo.

**Il conio timbra il perimetro.** `payload.minted_by_scopes` si affianca a
`minted_by_role`, con la stessa disciplina: lo scrive il server, il client non
lo puo dettare, e su una modifica non si riscrive. Per i gettoni coniati prima
di questa correzione il riscatto ricade sul recinto **attuale** di chi li ha
firmati — che sbaglia dal lato stretto se quel recinto e stato ristretto nel
frattempo.

**Un gettone multiuso senza profilo non e multiuso: e illimitato.**
`one_time: false` lasciava lo stato su `active` per sempre. Su un gettone legato
a un profilo la cardinalita c'e comunque — la seconda persona trova la scheda
gia collegata — ma su un gettone che non nomina nessun profilo quel freno non
esiste: misurato, due utenti diversi con lo stesso codice, due tessere. Nessuna
schermata del prodotto conia gettoni multiuso, quindi il caso non ha un uso
legittimo da difendere: il multiuso resta ammesso **solo** dove ha un freno.

**Il gettone si consuma con una condizione.** Lo stato dell'invito era letto
prima della transazione e riscritto senza ricontrollarlo: due riscatti
simultanei leggevano entrambi `sent` e passavano **entrambi** (misurato, due
successi su due). Adesso la condizione sta dentro l'istruzione — `updateMany`
con `status: "sent"` nel `where` e il conteggio verificato — e il secondo fa
rotolare indietro la transazione. Stessa forma di ADR-0109.

**Le prove.** `scripts/riscatto-perimetro.mjs` — 31 sonde contro PostgreSQL
vero, dalle porte vere, su tre tipi di gettone, con un emittente recintato, due
categorie **omonime su due sedi**, replay, scadenza, revoca, concorrenza,
cross-club e profilo inesistente. Piu `tests/lib/riscatto-perimetro.test.mjs`,
che misura la regola su **tutto** il dominio dei due assi generato (sedici
perimetri per sedici) invece che su casi scelti a mano.

**Verificate per mutazione**: togliendo la propagazione del perimetro dalle due
strade, **sette** asserzioni diventano rosse su tutti e tre i tipi di gettone.
