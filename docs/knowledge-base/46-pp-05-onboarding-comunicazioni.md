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
| `scripts/pp-05-sicurezza-probe.mjs` | 10 prove dei difetti chiusi dalla revisione ostile, ognuna verificata **per mutazione** |
| `tests/auth/numero-di-cellulare.test.mjs` | Normalizzazione, mascheramento, messaggi |
| `tests/auth/verifica-recapiti-dalle-rotte.test.mjs` | Prove sulle **rotte reali**, non su helper interni |
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

Due round, condotti da revisori indipendenti con il mandato di rompere.

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

---

## Debito e limiti dichiarati

- **PP05-D1 — un utente solo-OAuth non puo aggiungere il cellulare.**
  `createOAuthBootstrapUser` scrive una password casuale che nessuno conosce, e
  `CURRENT_PASSWORD_REQUIRED` gli impedisce di cambiare email, numero o
  password. La regola «il numero e obbligatorio» **non si applica** a
  quell'intera popolazione, e non c'e modo di rimediare dall'interfaccia.
  Servirebbe distinguere «non ha mai avuto una password» da «ha una password
  che non ricorda» — una colonna, quindi una migrazione, quindi una decisione
  che merita il suo ADR. Nel frattempo la strada esiste ed e «Password
  dimenticata».
- **Il pepe delle impronte OTP ricade su `DATABASE_URL`** quando nessuna delle
  tre variabili dedicate e impostata. Chi ha estratto un dump ha quasi
  certamente anche la stringa di connessione con cui l'ha estratto, e in quel
  caso il milione di codici torna enumerabile. `AUTH_OTP_SECRET` e ora in
  `.env.example` e in [13](13-environments.md): **va impostato negli ambienti
  condivisi**. Il ripiego resta perche un'installazione locale deve funzionare
  senza configurare segreti.
- **`maskPhoneNumber` rivela la lunghezza** del numero oltre a prefisso e
  ultime tre cifre. Su un cellulare italiano restano alcuni milioni di
  combinazioni, non dieci milioni: e un mascheramento, non un segreto.
- **Il logo di un club non e mai un'immagine, oggi.** Finche `clubs.logo_url` e
  un data URL, il brand club e il nome scritto in lettere. Servirebbe un
  archivio di loghi servito dalla nostra origine — fuori scope PP-05.
- **L'invito atleta (#3) resta a marchio EasyGame** anche se lo manda il club:
  `athlete-accounts.ts` e di PP-04 e la frontiera non si attraversa. Vedi
  dependency.

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
