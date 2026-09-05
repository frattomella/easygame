# 46 — PP-05: onboarding, OTP telefono e sistema email

**Lane:** PP-05 · **Branch:** `feat/pp-05-onboarding-communications` ·
**Base:** `0d66921` (tip di PP-01) · **Data:** 2026-09-04

Verbale della lane. Documenta **il codice reale**: dove il comportamento
descritto qui non corrisponde piu, vince il codice e questa scheda va corretta
nello stesso commit.

Decisioni architetturali: [ADR-0114](18-decision-log.md) (il codice OTP e di
EasyGame, l'operatore e un trasporto), [ADR-0115](18-decision-log.md) (email e
cellulare obbligatori), [ADR-0116](18-decision-log.md) (Email Template Core e i
due brand mode), [ADR-0117](18-decision-log.md) (un recapito verificato e un
canale di accesso).

---

## Il difetto di partenza: un flusso completo che nessuno poteva raggiungere

PP-05 non ha trovato codice mancante. Ha trovato **codice irraggiungibile**,
che e la forma di incompletezza che questo repository produce piu spesso
(CLAUDE.md §11, punto 8).

Il flusso OTP telefono esisteva **per intero** — rotte, challenge, contatore
dei tentativi, un test dedicato sugli incrementi atomici — e non era percorso
da nessuno, perche il campo «Cellulare» del modulo di registrazione era dietro
`capabilities.phoneVerification &&`, cioe compariva solo dove le tre variabili
`TWILIO_*` erano configurate. Su ogni installazione reale: colonna `phone`
nulla, `phone_verification_required` falso, nessuna challenge telefono mai
scritta.

Sull'email il difetto era speculare e piu grave: `finalizeVerifiedSession`
sollevava «Email non verificata» e chiudeva fuori chiunque non avesse
confermato l'indirizzo — **compresa la schermata che gli chiedeva di
confermarlo**. Senza SMTP configurato l'account si creava e non si poteva
usare, mai.

---

## PP-05A — registrazione, numero, OTP

### La regola di prodotto

**Email e cellulare sono entrambi obbligatori** per un account nuovo. Il numero
si verifica **subito** con OTP via SMS; l'email si verifica **dopo**, e non
impedisce l'accesso.

«Account non pienamente attivato» ha **una definizione sola**,
`isPhoneVerificationBlocking`, e **una sola conseguenza**: non nasce una
sessione. Nessun'altra limitazione e stata inventata. Chi e gia dentro resta
dentro.

L'unica limitazione di un'**email** non verificata e che quell'indirizzo **non
vale come prova di identita**: chi lo possiede davvero e lo dimostra sfratta
chi lo aveva solo scritto in un modulo.

### Il numero ha una forma sola

`src/lib/auth/phone-number.ts` — modulo puro, nessun Prisma, nessuna rete.
Normalizza in E.164, riconosce i cellulari italiani, dichiara `mobileChecked:
false` dove non conosce la regola nazionale, e maschera per le risposte senza
sessione. Lo zero interurbano italiano non si toglie.

### Il trasporto SMS

`src/lib/server/sms/` — `SmsProvider.send({ to, text })` e `sendSms` come unico
punto di invio, con la stessa forma di `src/lib/server/email/`. Il provider
**non genera e non verifica** il codice. L'elenco dei nomi riconosciuti vive in
un modulo puro, `src/lib/auth/sms-transport.ts`, e porta la proprieta che conta:
`delivers`.

**Nessun operatore reale e cablato**, ed e una scelta: vedi la sezione
«Decisioni che aspettano una persona».

### Cosa e stato corretto lungo la strada

| Difetto | Come si manifestava |
|---|---|
| Twilio Verify come seconda implementazione dell'OTP | Tetto dei tentativi, scadenza e consumo monouso valevano solo nel ramo interno; il ramo debole era attivo **dove le variabili esistono**, cioe in produzione, e nessun test poteva vederlo |
| `randomInt(100000, 1_000_000)` | Nessun codice cominciava per zero: 900.000 valori invece di 1.000.000 |
| `code_hash = sha256(codice)` | Un milione di valori: una tabella precalcolata li rovescia tutti. Ora HMAC con pepe d'ambiente, legato a canale, scopo e utente |
| Challenge non legata al destinatario | Un codice emesso per il proprio numero confermava il numero di un altro: l'azzeramento al cambio recapito era teatro |
| `update` per id su «verificato» | Fra emissione e conferma il recapito puo cambiare da un'altra sessione: ora `updateMany` condizionato |
| Dodici challenge vive insieme | Le due scritture erano separate: in parallelo dodici `UPDATE` che non trovano niente, poi dodici `INSERT`. Ora transazione **piu indice unico parziale** |
| `catch` che rispondeva 400 a qualunque eccezione | Un guasto del database diceva «codice sbagliato» e bruciava i cinque tentativi, senza lasciare una riga nei log |
| Contatore OTP su un asse solo | `canale:utente:indirizzoIP`: chi cambiava rete ripartiva da zero |
| Numero in chiaro nelle risposte senza sessione | Il ramo «indirizzo gia occupato», nato per non rivelare l'occupazione, era il modo piu comodo per farsi dire il cellulare di un altro |
| Cambio recapito senza password attuale (W4-R13) | Con i recapiti diventati un fattore, una sessione presa in prestito diventava proprieta definitiva del conto |

---

## PP-05B — Email Template Core

### Il difetto di partenza

L'HTML nasceva in tre posti. `layout.ts` metteva un guscio; dentro ci finiva
una stringa composta a mano da `auth-workflows.ts`, `athlete-accounts.ts` ed
`email-service.ts`, ognuna con il proprio markup, il proprio pulsante finto e
il proprio `escapeHtml` — o senza. Il testo semplice si scriveva a mano accanto
all'HTML e divergeva alla prima modifica. Il guscio era **sempre EasyGame**,
anche quando il messaggio partiva da un club.

### Come e fatto adesso

`src/lib/server/email/template-core.ts` e **l'unico posto in cui si scrive
markup per la posta**. Un'email si compone di **blocchi** (`heading`, `text`,
`list`, `cta`, `code`, `info`, `divider`, `footnote`, `raw`), e un blocco
prende **testo, non markup**: non esiste un modo di comporre un messaggio
dimenticandosi di sfuggire il nome di un club.

`renderEmailDocument` restituisce sempre `{ html, text }`: due proiezioni degli
stessi blocchi, quindi non possono divergere.

Filtri, tutti nel core: `sanitizeEmailUrl` (solo `http`, `https`, `mailto`;
un link rifiutato lascia l'etichetta come testo), `sanitizeEmailColor` (solo
esadecimale, l'insieme che non contiene ne `;` ne `)`), `resolveBrandLogo` (un
`<img>` solo per un URL sulla nostra origine).

Formato: tabelle, stili in linea, `width="600"` piu `max-width`, nessun
`<style>`, nessun `flex`, nessun `grid`, nessuna classe. **E un test**, perche
e la proprieta che si perde per prima quando qualcuno «sistema» il markup con
l'occhio del browser.

### I due brand mode

| | EASYGAME BRAND | CLUB BRAND |
|---|---|---|
| Chi manda | EasyGame | La societa sportiva |
| Cosa | Account, sicurezza, verifica recapiti, reset password | Comunicazioni, solleciti, promemoria, riepiloghi |
| In cima | Logotipo EasyGame | Nome del club (o il suo logo, se servito dalla nostra origine) |
| Nel piede | «EasyGame» | Nome del club **piu `Powered by EasyGame`** |
| Rimovibile | — | **No, in V1.** Non e un parametro: non esiste una chiamata che lo ometta |

Il riferimento nel piede non e una firma commerciale: e la riga che permette a
una famiglia di capire a chi appartiene il sistema che le ha scritto, cioe a
chi rivolgersi se il messaggio e sospetto. Serve a lei prima che a noi.

### I ripieghi, che sono il caso normale

- **Manca il logo del club.** Oggi `clubs.logo_url` e un **data URL**, che
  Gmail e Outlook bloccano: il ripiego — il nome del club scritto in lettere —
  e cio che si vede **sempre**, non l'eccezione. Vale anche per un URL su host
  esterno, che oltre a poter sparire e un **tracciatore**: direbbe a quell'host
  quando il messaggio e stato aperto, da quale indirizzo e con quale client,
  verso le famiglie di un club e quindi spesso verso minori.
- **Manca il colore del club.** Non esiste alcun campo colore: si usa l'accento
  EasyGame. Un valore illeggibile ricade sullo stesso.
- **Manca SMTP.** `sendTransactionalEmail` risponde `skipped: not_configured` —
  non solleva e non finge un invio. Chi chiama decide cosa dire.

### L'anteprima

`/private/email-preview`, riservata a `platform_admin`. Non e piu 404 in
produzione: il 404 non era una difesa — la difesa e `isPlatformAdminSession`,
che c'era gia — era una limitazione che rendeva la pagina inutile proprio dove
serve, cioe su un'installazione da configurare.

Tre proprieta, tutte provate:

1. **non spedisce niente** — l'inventario e un valore
   (`src/lib/server/email/preview-catalog.ts`), e un test monta un trasporto
   finto, costruisce l'intero catalogo e conta zero invii; poi manda un
   messaggio con lo stesso doppio, per provare che il primo zero non e vacuo;
2. **nessun dato reale** — gli esempi sono valori inventati su `esempio.test`;
3. **`sandbox=""` sugli iframe** — un `srcDoc` eredita l'origine della pagina
   che lo contiene, e un riquadro contiene di proposito un nome di club ostile.

Filtri per marchio e per larghezza (375 px) come collegamenti, non come stato
del client: la pagina resta un componente di server.

---

## Inventario delle email

Tutte le email passano da **un solo punto di invio**, `sendTransactionalEmail`
in `src/lib/server/email/email-service.ts`, con la stessa configurazione SMTP e
la stessa politica di errore. Un test strutturale
(`tests/ui/communications-ownership.test.mjs`) tiene l'elenco dei chiamanti
legittimi.

| # | Email | Sorgente | Costruttore | Destinatario | Marchio |
|---|---|---|---|---|---|
| 1 | Verifica del recapito (OTP email) | `auth-workflows.ts` | `buildVerificationEmail` | Chi si registra o verifica | **EasyGame** |
| 2 | Reimposta la password | `auth-workflows.ts` | `buildPasswordResetEmail` | Titolare dell'account | **EasyGame** |
| 3 | Invito: attiva l'accesso atleta | `athlete-accounts.ts` (PP-04) | `buildAthleteInviteEmailHtml` | Atleta o famiglia | **EasyGame** (ibrida: vedi dependency) |
| 4 | Test configurazione SMTP | `email-service.ts` | `renderEmailLayout` | Chi configura, dal pannello | **EasyGame** |
| 5 | Notifica generica | `email-service.ts` | `buildGenericNotificationEmailHtml` | Chiunque abbia una notifica | **EasyGame** |
| 6 | Sollecito di pagamento | `email-service.ts` ← `payment-reminders.ts` | `buildPaymentReminderEmail` | Famiglia con quote da versare | **Club** |
| 7 | Comunicazione del club (invio massivo) | `communications.ts` | `renderMessageTemplate` + `renderEmailLayout` | Famiglie del pubblico scelto | **Club** |
| 8 | Automazione (rata, certificato, RSVP, documento) | `automations.ts` | `renderMessageTemplate` + `renderEmailLayout` | Famiglie | **Club** |
| 9 | Riepilogo giornaliero | `automations.ts` | `buildDailyDigest` + `renderEmailLayout` | Chi gestisce il club | **Club** |

**La notifica generica (#5) copre da sola una decina di casi d'uso** —
appuntamenti (`appointments.ts`), richieste documentali
(`document-requests.ts`), moduli compilati (`form-submissions.ts`), avvisi
all'allenatore (`trainer-area.ts`), certificati medici in scadenza
(`medical-certificate-reminders.ts` e il suo cron), notifiche generiche del
registro (`resources.ts`, `/api/v1/[resource]`) — e il suo contenuto e **fisso
di proposito**: mai un dato riservato nell'oggetto o nel corpo, solo l'invito
ad accedere. Nell'inventario e una riga sola perche e un template solo, ma vale
la pena sapere che dietro ci sono otto chiamanti.

**Nessuna email di iscrizione o di ricevuta esce dal prodotto**: l'iscrizione
notifica dentro l'applicazione, e la ricevuta si scarica.

---

## Superficie API toccata

Nessun endpoint nuovo. Contratti cambiati:

| Endpoint | Cosa cambia |
|---|---|
| `POST /auth/register` | Il numero e **obbligatorio** e normalizzato: 400 `INVALID_PHONE` se non e un cellulare. Il numero nella risposta e **mascherato**. Consuma anche il contatore per destinatario |
| `POST /auth/login` | Non risponde piu 403 `EMAIL_NOT_VERIFIED`. `PHONE_NOT_VERIFIED` resta, e consuma tre assi di rate limit. `user_metadata.phone` mascherato nelle risposte senza sessione |
| `PATCH /auth/user` | Cambiare email, cellulare o password richiede `currentPassword`: 403 `CURRENT_PASSWORD_REQUIRED`. Numero normalizzato: 400 `INVALID_PHONE`. Tetto ai tentativi: 429 `RATE_LIMITED`, con riga di audit |
| `POST /auth/verify/{email,phone}/confirm` | Apre una sessione **solo** se la challenge era `signup` o `login`; altrimenti conferma il recapito e risponde `session: null` |
| `POST /auth/verify/{email,phone}/send` | Tre assi di rate limit; 429 `RESEND_TOO_SOON` con `Retry-After` sul cooldown |
| `GET /auth/providers` | `phoneNumberRequired` (sempre `true`), `phoneVerification`, `phoneVerificationRequired` |

---

## Migrazione

`prisma/migrations/20260904120000_pp05_una_challenge_viva_per_canale/` —
forward-safe. Chiude le challenge vive in eccesso tenendo la piu recente per
gruppo (nessuna riga cancellata), poi crea due indici unici parziali su
`auth_verification_challenges (user_id, channel)`: uno per le challenge OTP
(`purpose <> 'reset_password'`), uno per i token di reset. I due mondi
convivono sulla stessa tabella e non devono escludersi a vicenda.

Nessuna modifica a `prisma/schema.prisma`: gli indici parziali non si esprimono
in Prisma e vivono solo nella migrazione.

---

## Come e stato verificato

| Strumento | Cosa misura |
|---|---|
| `scripts/pp-05-otp-probe.mjs` | 7 proprieta contro PostgreSQL reale: tetto dei tentativi sotto concorrenza, monouso, cooldown, legame col destinatario, scadenza calcolata dal database, contatore per numero attraverso reti diverse |
| `scripts/pp-05-sicurezza-probe.mjs` | **14** prove dei difetti chiusi dalla revisione ostile (S1-S12), ognuna verificata **per mutazione**. S10 lo e in **due varianti**, perche le due difese contro il Critical del terzo round sono indipendenti e ciascuna doveva reggere da sola |
| `scripts/pp-05-gettone-tessera-probe.mjs` | 5 prove che il ruolo emesso dalle rotte delle tessere **accende i permessi** — la dependency di PP-03 — e che un gettone contraffatto non ne aggiunge nessuno |
| `tests/auth/numero-di-cellulare.test.mjs` | Normalizzazione, mascheramento, messaggi |
| `tests/auth/verifica-recapiti-dalle-rotte.test.mjs` | 19 prove sulle **rotte reali**, non su helper interni: invio, conferma, replay, scadenza, cooldown, legame col destinatario, anti-enumeration, e il vincolo «UUID nudo solo con la propria sessione» |
| `tests/auth/registrazione-dalla-rotta.test.mjs` | La **porta d'ingresso della lane**, che fino al terzo round era coperta dai soli controlli statici sul sorgente: normalizzazione in E.164, le due challenge verso i destinatari giusti, il riferimento opaco e il numero mascherato nella risposta, e l'indistinguibilita del ramo «indirizzo gia occupato» |
| `tests/auth/gettone-tessera-dalle-rotte.test.mjs` | Che il gettone emesso dalle due rotte delle tessere non torni allo slug in silenzio |
| `tests/auth/active-club-boundary.test.mjs` | Che una **proiezione calcolata** non si scriva, e che le preferenze vere restino scrivibili |
| `tests/email/template-core.test.mjs` | Escaping, link, colori, ripieghi, formato email-safe, i due marchi |
| `tests/email/anteprima-non-spedisce.test.mjs` | L'anteprima non spedisce, e la prova non e vacua |
| `tests/server/email-builders.test.mjs` | I costruttori mostrano il dato che devono mostrare, in HTML e in testo |

**Perche le sonde e non solo i test.** Il doppio di Prisma esegue una chiamata
alla volta: non ha i lock di riga di Postgres, non ha `READ COMMITTED`, non ha
vincoli di unicita e non calcola le scadenze con l'orologio del database. Tutto
cio che dipende da quelle quattro cose e invisibile in `npm test` **per
costruzione**.

---

## La revisione ostile

Quattro round che hanno trovato qualcosa, piu un quinto conclusivo, condotti da
revisori **indipendenti** — uno diverso per round — col mandato di rompere, non
di approvare. Ogni Critical e ogni High ha una prova che **fallisce senza il
fix**, e ogni prova e verificata **per mutazione**: rimossa la guardia, la riga
torna rossa.

**Primo round: 1 Critical, 2 High, 5 Medium, 3 Low.**

- **CRITICAL-1 — il telefono era una credenziale, e nessuno dei due sfratti la
  toglieva.** Un occupante che registra un account con l'indirizzo di un'altra
  persona e **il proprio numero** restava dentro anche dopo l'adozione OAuth
  (che azzerava la sola password) e anche dopo un reset password della vittima
  (che cancellava le sole sessioni): chiedeva un codice, e la conferma gli
  restituiva una sessione. La vittima, intanto, era **chiusa fuori**, perche il
  telefono altrui le bloccava l'accesso. Chiuso con due difese indipendenti:
  `sfrattaOccupante` azzera **tutti** i canali, e un codice apre una sessione
  solo se la porta era gia stata aperta (ADR-0117).
- **HIGH-2 — l'elenco dei trasporti SMS viveva in due posti, e i due sbagliavano
  in direzioni opposte.** `noop` faceva **bloccare** l'accesso in attesa di un
  codice che per contratto non spedisce (brick di ogni registrazione); un nome
  di operatore vero **spegneva** la verifica in silenzio, cioe proprio quando
  qualcuno crede di aver finito la configurazione. Chiuso con un elenco unico e
  puro che porta `delivers`.
- **HIGH-3 — la registrazione non contava l'asse per destinatario.** Dieci SMS
  all'ora verso un numero altrui da un solo indirizzo IP, moltiplicabili
  cambiando rete, e ogni invio invalidava alla vittima il codice appena
  ricevuto.
- **MEDIUM-5** — il numero usciva in chiaro in `user_metadata` nella stessa
  risposta in cui `verification.phone` era mascherato: il controllo c'era ed era
  inefficace. **MEDIUM-7** — venticinque tentativi di indovinare la password
  attuale senza un 429 e senza una riga di audit. **LOW-9** — il ramo del reset
  password non era stato adeguato al nuovo indice unico. **LOW-10** —
  `shouldExposeVerificationPreviewCode` si apriva su `NODE_ENV` assente.

**MEDIUM-6 non e stato corretto** ed e registrato come debito: vedi sotto.

**Secondo round: 1 Critical, 1 High, 2 Medium, 3 Low.** Rilanciato **dopo** le
correzioni del primo, ed e il round che ha insegnato di piu.

- **C-1 — il legame con l'accesso esterno sopravviveva allo sfratto.** Il primo
  round aveva concluso «serve un punto unico che li revochi tutti insieme». Il
  punto unico era stato creato, e gli era stato dato un elenco **incompleto**:
  un `external_accounts` superstite riapre l'account al prossimo accesso
  dell'occupante **senza passare da nessuna challenge**, perche
  `findOrCreateOAuthUser` risolve per `provider_account_id` prima di ogni altra
  cosa. Un punto unico non e una garanzia: e **un posto dove guardare**.
- **H-1 — l'amministratore di piattaforma su un indirizzo mai verificato.**
  `isPlatformAdminUser` era sicura per una ragione che non stava in quella
  funzione: prima di PP-05 un indirizzo non provato non produceva **nessuna
  sessione**. ADR-0115 ha tolto quel cancello, e la riga e rimasta a decidere
  sul solo indirizzo — che vive in una variabile `NEXT_PUBLIC_*`, cioe e
  pubblicato a ogni browser. Quando si toglie un cancello, si cerca **chi si
  appoggiava a quel cancello**.
- **M-1 — l'UUID di un account non e un segreto, e apriva le rotte di
  verifica.** La rotazione del riferimento fatta dallo sfratto era **teatro**
  finche `findUserByVerificationReference` accettava anche l'UUID, che non
  cambia mai e che l'occupante aveva gia. In piu gli UUID utente circolano in
  molte proiezioni club-scoped: chi ne avesse raccolti poteva pilotare le rotte
  di verifica su account altrui e **distinguere un identificativo vero da uno
  inventato** — l'enumerazione chiusa altrove, riaperta da una porta laterale.
- **M-2 — il contatore per destinatario contava meta**, perche `3401234567` e
  `+393401234567` producevano due secchielli. Il tetto raddoppiava esattamente
  sulle righe scritte prima di PP-05.
- **L-1** `Object.hasOwn` nella risoluzione del trasporto SMS; **L-2** il
  `P2002` del reset si evita oltre che catturarlo; **L-3** l'elenco degli
  ambienti con anteprima diventa di **ammissione** — negarne tre lasciava
  passare `NODE_ENV=prod`; **L-5** un `console.error` residuo passa dal punto
  unico.

**Terzo round: 1 Critical, 3 minori.** Ed e il round in cui il pattern si e
visto per intero: **e stato il fix del round precedente ad aprire il difetto.**

- **CRITICAL — l'indirizzo si dichiarava verificato da solo.** Il fix di H-1
  accettava come prova due sorgenti in `OR`: la colonna `email_verified_at` e la
  chiave `user_metadata.emailVerified`. La seconda e una colonna JSON **libera,
  scritta dal suo stesso soggetto** — la stessa che una Wave precedente aveva
  gia dovuto disinnescare per `role` — e la blocklist di `PATCH /auth/user` non
  la conosceva. Bastava `{"data":{"emailVerified":true}}`, che non cambia nessun
  fattore e quindi non passa nemmeno dal cancello della password attuale.
  Chiuso con due difese indipendenti, ciascuna misurata da sola: la funzione
  **distingue le due forme** che riceve (chi porta la colonna e giudicato su
  quella e su nient'altro), e la blocklist rifiuta **tutte** le proiezioni
  calcolate, non solo quella trovata.
- Tre minori **non** chiusi, con la ragione scritta: le righe `prisma:error`
  sotto concorrenza vera (PP05-D7 — la correzione e nella configurazione del
  logger, e vale su tutto il prodotto); l'`href` dell'invito atleta fuori da
  `sanitizeEmailUrl` (PP05-D4 allargato — `athlete-accounts.ts` e di PP-04); la
  saturazione del secchiello SMS per destinatario (PP05-D8 — **in parte
  intrinseca** a un tetto per destinatario: toglierlo riaprirebbe HIGH-3, che e
  molto peggio).

**Quarto round: 2 Critical, 0 High, 1 Medium, 1 Low.** I due Critical hanno
**la stessa radice**, che nessuno dei tre round precedenti aveva nominata: un
token era legato all'**account** e non al **recapito**, e lo sfratto toglieva
le righe dell'occupante ma non cio che l'occupante teneva gia in mano.

- **C-1 — un token nasce per un recapito, e valeva per l'account.**
  `confirmPasswordReset` cercava la challenge per utente, canale, scopo e vita
  della riga; **non per destinatario**, mentre la strada degli OTP il
  destinatario lo filtrava da sempre. La colonna `target` c'era ed era scritta
  correttamente: nessuno la leggeva. Ci si registra con un indirizzo proprio,
  si chiede il reset **sul proprio** indirizzo, si cambia l'indirizzo in uno
  dell'elenco pubblicato in `NEXT_PUBLIC_*` — passando dal cancello della
  password attuale, ed e **giusto che passi** — e si consuma il token: il
  consumo scriveva `email_verified_at` sulla teoria «chi apre il link controlla
  la casella», che dopo il cambio non e piu vera. Il difetto non e il cambio di
  indirizzo: e la **teoria del token**.
- **C-2 — lo sfratto toglieva le righe, non cio che l'altro aveva in mano.**
  Password, numero, riferimento, sessioni, legami esterni: tutte e quattro le
  difese dei round precedenti, e nessuna toccava le challenge. Un token vive
  trenta minuti e lo si chiede **prima**: si occupa un indirizzo libero, ci si
  chiede un reset, si aspetta che la vittima arrivi davvero dal proprio Google.
  Lo sfratto le restituisce l'account, e a quel punto l'indirizzo risulta
  verificato — l'ha verificato lei — quindi il ramo di sfratto del reset non
  scatta nemmeno: il token dell'occupante **sovrascrive la password** della
  persona a cui l'account e appena stato restituito.
- **Il Medium e il Low non sono chiusi**, con la ragione scritta. PP05-D9: le
  risposte HTTP della registrazione sono indistinguibili — corpo, stato e
  tempi, misurati — ma la **consegna dell'SMS** no, e le tre correzioni
  possibili sono peggiori del difetto. PP05-D7 si allarga al percorso OTP
  invece di moltiplicarsi.

### Le quattro regole che questi round lasciano

1. **Un punto unico non e una garanzia, e un posto dove guardare.** Quando si
   aggiunge un modo di entrare, ci si va.
2. **Quando si toglie un cancello, si cerca chi si appoggiava a quel cancello.**
   H-1 e nato cosi, e non era una svista di chi ha scritto ADR-0115: era una
   dipendenza che nessuno aveva scritto da nessuna parte.
3. **Un `OR` fra due sorgenti vale quanto la piu debole delle due.** Il
   Critical del terzo round e stato aggiunto **per irrobustire** una decisione,
   e l'ha indebolita. La risposta giusta a «due chiamanti portano due forme» e
   **distinguerle**, non accettarle entrambe.
4. **Un `where` e una riga che un chiamante puo dimenticare; un legame
   crittografico no.** La regola «la challenge e legata al destinatario»
   esisteva, era scritta nella KB, ed era vera in **uno** dei due chiamanti. Una
   proprieta che vale solo se ogni chiamante se la ricorda non e una proprieta
   del sistema: e una convenzione. Il quarto round l'ha pagata due volte.

**E la regola che le contiene tutte e quattro**, visibile solo guardandole
insieme: **ogni difesa nuova sposta il confine di cio che conta, e cio che
conta va poi riguardato tutto.** Tre Critical su quattro sono nati dal fix del
round precedente, e nessuno per distrazione. ADR-0115 ha reso mutabile un
indirizzo che prima era di fatto immutabile: da quel momento «il token e legato
all'account» ha smesso di significare «il token e legato alla casella», e
`isPlatformAdminUser` ha smesso di essere sicura — **senza che una riga di quei
due file cambiasse**. Il rischio non sta nel codice che si scrive: sta nel
codice che si e smesso di guardare perche non lo si e toccato.

### Coverage gaps dichiarati dai reviewer

Nessuno dei round dichiara di aver coperto tutto, e le lacune sono le stesse in
tre round su quattro — il che le rende un limite del metodo, non di un
reviewer:

- **enumerazione per tempi**: verificata sull'uguaglianza di corpi e stati, mai
  su un campionamento statistico delle latenze. Un oracolo temporale resterebbe
  invisibile a tutte le prove di questa lane;
- **OAuth vivo**: nessun provider configurato, quindi il consenso presso Google
  e Microsoft non e stato esercitato end-to-end. Attaccato il solo ramo di
  **adozione**, che e quello che PP-05 cambia;
- **operatore SMS reale**: l'invio e sempre passato da un doppio, e non puo
  essere altrimenti finche la scelta del fornitore e aperta. Nessuna proprieta
  di consegna, stato di recapito o alias mittente e misurata;
- **fuzzing dei segnaposto** dei modelli di messaggio: verificati il percorso di
  escaping e i sanificatori, non fatto un fuzzing esaustivo con carichi
  avversari;
- **l'anteprima come pagina**: la proprieta «non spedisce» e misurata da un
  test che monta un trasporto finto e conta zero invii, ma la pagina di server
  non e mai stata esercitata con una richiesta vera; le sue due guardie —
  sessione e `isPlatformAdminSession` — sono verificate per lettura;
- **il flusso OAuth completo**: attaccato `findOrCreateOAuthUser`
  direttamente, mai lo scambio del codice ne il giro `state`/CSRF/redirect.

---

## Le due dependency di altre lane, e cosa ne e stato

| Da | Cosa chiedeva | Esito |
|---|---|---|
| **PP-03** | Che `GET /auth/memberships` e `POST /auth/memberships/activate` emettano il **gettone** invece dello slug nudo: uno slug senza chiavi spegne **ogni** permesso lato interfaccia per **ogni** ruolo personalizzato | **Implementata** (commit `c31d613`). Le due rotte gia chiamavano `risolviTessere` per scartare le tessere incoerenti, e ne buttavano via il `token`. Non concede niente in piu, ed e misurato: G5 manda un gettone **contraffatto** con una chiave aggiunta a mano e verifica che il risolutore non ne aggiunga nessuna |
| **PP-04** | Che la firma di `sendPasswordResetChallenge` non cambi | **Soddisfatta senza modifiche**: la firma e invariata. Due cose sono cambiate **dentro** — la transazione, e il corpo che passa dal template core — e nessuna tocca il contratto |

**Uno sconfinamento ricevuto e non anticipabile.** PP-04 ha scritto una riga in
`src/app/api/v1/auth/memberships/route.ts`, che e di PP-05:
`allowSelfAthleteLink: true`. E **giusta nel merito** — chi inverte un
predefinito deve adeguare i chiamanti nello stesso commit — e PP-05 **non puo
anticiparla**, perche quell'opzione nel branch di PP-05 non esiste ancora:
passarla oggi sarebbe un errore di compilazione. Le due modifiche allo stesso
file stanno in punti diversi della stessa funzione e in integrazione si tengono
entrambe.

---

## Debito e limiti dichiarati

Otto voci, tutte in [16](16-technical-debt.md) con la forma per esteso. Qui
stanno nell'ordine in cui sono nate, con **cosa manca davvero** — che e la sola
cosa che serve a chi le riprendera.

**Due sono chiuse dentro la lane stessa**, e restano scritte perche il modo in
cui si sono chiuse e piu istruttivo del difetto:

| | Difetto | Come si e chiuso |
|---|---|---|
| ~~**PP05-D1**~~ | **Un utente solo-OAuth non poteva aggiungere il cellulare**, ne cambiare email, ne impostare una password: `createOAuthBootstrapUser` scrive una password casuale che nessuno conosce, e `CURRENT_PASSWORD_REQUIRED` chiudeva tutti e tre i campi. Valeva anche per chi aveva appena subito uno **sfratto** (ADR-0117), che e l'altra popolazione senza password | **Senza la colonna e senza l'ADR** che la prima stesura riteneva necessari. La distinzione «non ha mai avuto una password» / «ne ha una che non ricorda» resta indecidibile dal client, e **non serve deciderla**: la strada esisteva gia ed era «Password dimenticata». Mancava il **pulsante**, che ora sta nella pagina Account accanto agli avvisi di verifica. Non apre nessuna strada nuova: quel link chiunque puo chiederlo dalla pagina di accesso |
| ~~**PP05-D6**~~ | **`npm run lint` usciva con codice 1 in ogni worktree parallelo**, per un conflitto del plugin `@next/next` fra `.eslintrc.json` del worktree e quello identico della radice — che ESLint trova risalendo l'albero, perche i worktree vivono sotto `.claude/` | `"root": true` in `.eslintrc.json`. La prima stesura la rimandava all'integrazione; e stata applicata qui perche il gate e reale e questa e l'unica correzione possibile. **Conflitto previsto in integrazione**, sotto |

**Sei restano aperte**, e nessuna e un difetto sfruttabile della lane:

| | Cosa resta | Perche non si chiude qui |
|---|---|---|
| **PP05-D2** | **Il pepe delle impronte OTP ricade su `DATABASE_URL`** quando `AUTH_OTP_SECRET`, `AUTH_RATE_LIMIT_SECRET` e `CRON_SECRET` mancano tutti e tre. Chi ha estratto un dump ha quasi certamente anche la stringa di connessione con cui l'ha estratto: in quel caso il milione di codici a sei cifre torna enumerabile. E una rotazione della password del database invalida in silenzio tutte le impronte vive | Togliere il ripiego significa che un'installazione locale non parte senza configurare un segreto. La correzione giusta e **rifiutare l'avvio** con `NODE_ENV=production` e nessun segreto dichiarato: una guardia di avvio, che oggi **non esiste per nessuna variabile** e va disegnata una volta per tutte, non inventata qui. Nel frattempo `AUTH_OTP_SECRET` e in `.env.example` e in [13](13-environments.md), e **va impostato negli ambienti condivisi** |
| **PP05-D3** | **`clubs.logo_url` e un data URL**, quindi il marchio club nelle email e sempre il nome scritto in lettere: nessun logo compare mai. Il core lo accetterebbe gia, se fosse un URL sulla nostra origine (`resolveBrandLogo`) | Serve un archivio di loghi servito dalla nostra origine, cioe toccare `attachments.ts` e la scheda club, che PP-05 non possiede. Il ripiego e leggibile e onesto, non un difetto visibile |
| **PP05-D4** | **L'invito ad attivare l'accesso atleta resta a marchio EasyGame** anche se lo manda il club, compone HTML a mano invece di passare dai blocchi del core, e — **allargamento del terzo round** — il suo `href` non passa da `sanitizeEmailUrl`: e l'**unico** URL-in-attributo del sistema email rimasto fuori dal filtro | `src/lib/server/athlete-accounts.ts` e di **PP-04**: la frontiera non si attraversa. Registrato come dependency. Non sfruttabile oggi — link composto dal server, base da variabile d'ambiente, gettone casuale — ma e l'ultima eccezione a una regola che vale ovunque |
| **PP05-D5** | **`getRequestIp` dietro un proxy non fidato**: con `AUTH_RATE_LIMIT_TRUSTED_PROXIES=1` e una catena `X-Forwarded-For` lunga 1, l'indice cade sulla voce scritta dal client | Codice **precedente** a PP-05 (Wave 6), non toccato dalla lane. E la ragione per cui e un fastidio e non una chiave rotta: i due assi introdotti da PP-05 — per account e per destinatario — **non passano di li**, e sono quelli che l'attaccante non sceglie |
| **PP05-D7** | **Le righe `prisma:error Unique constraint failed` sfuggono al punto unico degli errori** sotto concorrenza vera: il logger interno di Prisma stampa l'invocazione **prima** che il codice applicativo veda l'eccezione, quindi il `catch` ferma l'eccezione ma non la riga. Contenuto: i soli **nomi** dei campi (`user_id`, `channel`), nessun valore — igiene di osservabilita, non riservatezza | La correzione e nella **configurazione del logger** in `src/lib/server/prisma.ts`, che e il punto unico del client: spegnere `log: ["error"]` toglie rumore qui e **segnale altrove**. E una decisione su tutto il prodotto. Il pre-read del secondo round toglie gia il caso comune, che e il secondo clic sul pulsante |
| **PP05-D8** | **Il secchiello SMS per destinatario si puo saturare a danno di terzi**: registrando account con indirizzi usa-e-getta e **il numero di un'altra persona** si consuma il contatore condiviso di quel numero, e per quell'ora l'SMS legittimo di quella persona non parte | **In parte intrinseco** a un tetto per destinatario. Toglierlo riaprirebbe HIGH-3 del primo round — dieci SMS all'ora verso un numero scelto — che e molto peggio. La correzione vera pretende di distinguere «chi sta registrando davvero quel numero» da «chi lo sta pompando», e l'unico segnale che le separa e il **possesso**, cioe proprio cio che l'SMS deve ancora provare |

### Due limiti che non sono debito, perche sono scelte

- **`maskPhoneNumber` rivela la lunghezza** del numero oltre a prefisso e
  ultime tre cifre. Su un cellulare italiano restano alcuni milioni di
  combinazioni, non dieci milioni: e un **mascheramento**, non un segreto, e
  serve a far riconoscere il proprio numero a chi lo possiede gia.
- **Il codice OTP e visibile nella risposta** solo negli ambienti dell'elenco di
  **ammissione** di `shouldExposeVerificationPreviewCode`, che dopo L-3 del
  secondo round e un elenco di cio che si ammette e non di cio che si nega: un
  `NODE_ENV` sconosciuto, assente o inventato **non passa**. Senza quella
  finestra un'installazione locale senza SMTP e senza operatore SMS non
  potrebbe completare nessun flusso.

### Conflitti previsti in integrazione

| File | Chi altro lo tocca | Come si risolve |
|---|---|---|
| `.eslintrc.json` | PP-03 e PP-04 hanno lo **stesso** gate rosso e l'**unica** correzione possibile | Se aggiungono `"root": true`, e la stessa riga nello stesso posto: se ne tiene una |
| `src/app/api/v1/auth/memberships/route.ts` | PP-04 ha scritto `allowSelfAthleteLink: true` sulla chiamata a `getParentLinkedAthletes` (~riga 169); PP-05 tocca la risoluzione delle tessere (~100-145) e il campo `role` emesso (~185) | Punti diversi della stessa funzione: un merge a tre vie le prende entrambe. Se il conflitto si presenta **si tengono tutte e due** — non c'e nessuna scelta da fare fra loro |
| `docs/knowledge-base/16-technical-debt.md`, `18-decision-log.md` | Tutte e tre le lane vi aggiungono voci | Aggiunte in coda, non riscritture. Sulla numerazione degli ADR: PP-05 usa `0114`-`0117`, PP-04 `0122`-`0123`, PP-03 e partita da `0125` lasciando un varco. Un numero e un'etichetta: in integrazione si puo stringere senza conseguenze |

---

## Decisioni che aspettano una persona

**La scelta dell'operatore SMS e commerciale, non tecnica.** La lane si e
fermata prima dell'integrazione irreversibile: c'e l'astrazione, c'e il
provider che non spedisce, c'e il doppio dei test, e aggiungere l'operatore
scelto e un file piu tre righe.

Cosa serve dal proprietario del prodotto, in [ADR-0114](18-decision-log.md) per
esteso:

1. scelta dell'operatore e firma del contratto;
2. **tetto di spesa presso l'operatore** — e la protezione vera contro l'SMS
   pumping, e non si scrive nel codice;
3. firma del **DPA**, leggendo per prima la clausola sulla **conservazione del
   contenuto dei messaggi**: nel 2023 il Garante ha sanzionato un operatore
   italiano per aver conservato ventiquattro mesi il contenuto integrale degli
   SMS dei clienti, **codici OTP compresi**;
4. decisione sul mittente alfanumerico. **Vincolo che tocca l'architettura:**
   la delibera AGCOM 12/23/CIR impone al fornitore di rigettare la
   registrazione di un alias richiesta da un terzo per conto del titolare,
   **anche con delega espressa**. EasyGame non puo registrare gli alias dei
   propri club: ogni ASD deve avere un rapporto diretto con il fornitore,
   oppure accettare il mittente numerico;
5. aggiornamento di informativa privacy e registro dei trattamenti.

**Raccomandazione tecnica:** prima scelta Smshosting (societa italiana, API
HTTPS utilizzabile con `fetch` puro, costo piu basso fra quelli con listino
pubblico) — con il suo punto debole detto: **non pubblica ne un DPA scaricabile
ne certificazioni ISO**, e per un canale OTP quello e il primo documento da
chiedere. Seconda scelta la piattaforma Commify (Skebby / Esendex Italia).
