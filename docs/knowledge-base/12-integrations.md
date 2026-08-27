# 12 — Integrazioni

Tutte le integrazioni esterne sono **opzionali e degradano in modo esplicito**:
se le credenziali mancano, la funzione si disattiva invece di rompersi. Fa
eccezione SMTP, da cui dipende il login degli utenti non verificati.

## SMTP / Email — attiva, configurata da database

Codice: `src/lib/server/email/`, `src/lib/email/smtp-config.ts`,
`src/app/api/v1/admin/email/**`. Libreria: `nodemailer`.

Caratteristica distintiva: **la configurazione SMTP non e in variabili
d'ambiente**, sta nella tabella `email_provider_configs` (riga singola,
`SMTP_CONFIG_ID`) e si gestisce dalla dashboard platform admin.

Campi: `host`, `port`, `security_mode` (`starttls` | `tls` | `none`),
`username`, `from_email`, `from_name`, piu la password cifrata in tre colonne
(`password_ciphertext`, `password_iv`, `password_tag`).

- Cifratura **AES-GCM autenticata** (`credential-crypto.ts`). Chiave da
  `SMTP_CREDENTIALS_SECRET`, con fallback su `AUTH_RATE_LIMIT_SECRET`. Lo
  stesso segreto serve anche a IMAP, ma con un contesto crittografico diverso:
  vedi la sezione IMAP piu sotto.
- `toPublicSmtpConfiguration` garantisce che la password **non venga mai
  restituita** dalle API (coperto da test).
- `POST /api/v1/admin/email/test` prova l'invio e salva `last_test_at` /
  `last_test_status`.
- Gli errori sono normalizzati in codici sicuri (`SMTP_AUTH_FAILED`,
  `SMTP_CONNECTION_FAILED`, `SMTP_CONFIGURATION_INVALID`,
  `SMTP_DELIVERY_FAILED`) per non far trapelare dettagli del server.

**Impatti operativi**

- Senza SMTP, gli utenti con email non verificata **non possono accedere**
  (vedi [07](07-authentication.md)).
- Cambiare `SMTP_CREDENTIALS_SECRET` (o `AUTH_RATE_LIMIT_SECRET` quando usato
  come fallback) **rende indecifrabile la password salvata**: va riconfigurata
  dalla dashboard.
- La configurazione e **per database**: staging e produzione ne hanno una
  ciascuno.

## IMAP — casella in entrata, opzionale (Blocco 4)

Codice: `src/lib/email/imap-config.ts`, `src/lib/server/email/imap-service.ts`,
`imap-client.ts`, `imap-protocol.ts`, `src/app/api/v1/admin/imap/**`.
**Nessuna libreria nuova**: il test di connessione parla IMAP direttamente su
`node:tls` / `node:net`.

Come SMTP, la configurazione sta nel database — tabella
`imap_provider_configs`, riga singola `IMAP_CONFIG_ID` — e si gestisce dalla
console di piattaforma, sezione «Provider email».

Campi: `host`, `port` (993 con SSL, 143 con STARTTLS), `security_mode`
(`ssl` | `starttls`), `username`, `enabled`, piu la password cifrata nelle
solite tre colonne.

**SMTP e IMAP restano separati**, e la separazione e strutturale, non solo
convenzionale:

- tabelle diverse: la riga SMTP ha un CHECK `provider = 'smtp'` e richiede
  mittente e nome mittente, che per la posta in entrata non esistono;
- **contesti crittografici diversi**: `credential-crypto.ts` accetta un
  `purpose` (`smtp` | `imap`) che entra nella derivazione della chiave e nel
  dato autenticato. Una credenziale IMAP non e decifrabile come SMTP e
  viceversa (test in `tests/email/imap-config.test.mjs`);
- interfacce e handler distinti: la password di un provider non puo finire nel
  corpo della richiesta dell'altro.

Il test di connessione (`POST /api/v1/admin/imap/test`) apre la sessione,
esegue `LOGIN`, chiude con `LOGOUT` e **non legge nessun messaggio**. Con
`starttls`, se il server rifiuta l'upgrade la sessione viene chiusa invece di
autenticarsi in chiaro. Salva `last_test_at` / `last_test_status` e ha lo
stesso tetto di frequenza del test SMTP.

Codici di errore normalizzati: `IMAP_AUTH_FAILED`, `IMAP_CONNECTION_FAILED`,
`IMAP_TLS_REQUIRED`, `IMAP_CONFIGURATION_INVALID`.

**Oggi la casella non viene letta da nessuna funzione applicativa**: il Blocco 4
chiedeva la configurazione, non un client di posta. E il presupposto per una
futura ricezione (protocolli, ricevute di lettura, risposte automatiche).

## Twilio Verify — SMS OTP, opzionale

Variabili: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_VERIFY_SERVICE_SID`.

`isPhoneVerificationProviderConfigured()` e `isPhoneVerificationEnabled()`
(`src/lib/auth/provider-policy.ts`) decidono se il passaggio telefono e attivo.
Senza le tre variabili la verifica telefono viene **saltata**, anche se
`users.phone_verification_required` e `true`.

Non configurata su staging.

## OAuth Google e Microsoft — opzionale

Variabili: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`,
`MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`, piu `AUTH_BASE_URL` per
costruire la redirect URI.

`GET /api/v1/auth/providers` espone i provider attivi; l'interfaccia mostra i
bottoni solo per quelli presenti. Gli account collegati finiscono in
`external_accounts`.

Non configurati su staging.

## Provider di pagamento — previsti, non implementati

`src/lib/payments/provider-registry.ts` definisce **PayPal**, **Postepay**,
**Mastercard**, tutti con `isImplemented: false`.

- `POST /api/payments/create-checkout-session` valida club, importo, provider e
  configurazione, calcola la fee di piattaforma e poi risponde **501** con
  `checkoutUrl: null`.
- `POST /api/payments/webhook` riconosce il provider e controlla la presenza di
  un secret, ma **non verifica la firma** e non gestisce alcun evento
  (3 TODO espliciti).
- Variabili previste ma non usate per incassi reali: `PAYPAL_CLIENT_ID`,
  `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`.

> Non annunciare il checkout online come disponibile. Vedi
> [WP-13](20-work-packages.md).

## Neon PostgreSQL

Unico datastore. Due URL:

- `DATABASE_URL` → endpoint **pooler** (`-pooler` nell'host), usato dal runtime
  tramite `@prisma/adapter-pg`;
- `DIRECT_URL` → endpoint diretto, usato da `prisma migrate` / CLI.

Entrambi con `sslmode=require&channel_binding=require`.
Script di verifica: `scripts/verify-neon-ssl.mjs`,
`scripts/configure-staging-neon-ssl.mjs`.

## Vercel

Vedi [13 — Ambienti](13-environments.md).

## Librerie che si comportano da integrazione

| Libreria | Uso | Dove |
|----------|-----|------|
| `tesseract.js` | OCR lato client sui documenti caricati | `src/app/athletes/[id]/page.tsx`, `src/lib/document-scan.ts` |
| `xlsx` | Import/export fogli di calcolo | `src/lib/athlete-import.ts` e affini |
| `bcryptjs` | Hash password | `src/lib/server/auth.ts` |
| `nodemailer` | SMTP | `src/lib/server/email/smtp-provider.ts` |

## Integrazioni assenti

Push notification, object storage (i file possono finire in
`assets.data_base64`), error tracking / APM, analytics, scheduler
(nessun Vercel Cron configurato benche esistano endpoint pensati per un cron).

## Stripe: due integrazioni, non una (Blocco D, 2026-08-26)

EasyGame parla con Stripe per **due denari diversi**, e la distinzione non e
organizzativa ma sostanziale.

| | Flusso B — incassi | Flusso A — abbonamenti |
|---|---|---|
| Chi paga | La famiglia | La societa |
| A chi | Al **club** | A **Cedi Soft** |
| Account Stripe | Connesso del club (`Stripe-Account`) | Centrale di Cedi Soft |
| Commissione | EasyGame trattiene `application_fee_amount` | Nessuna: e il ricavo |
| Webhook | `POST /api/payments/webhook` | `POST /api/billing/webhook` |
| Segreto | `STRIPE_WEBHOOK_SECRET` | `STRIPE_BILLING_WEBHOOK_SECRET` |
| Dove atterra | `payment_transactions` | `platform_billing_accounts` |

**Perche due endpoint e non uno.** Perche sono due account con due segreti di
firma diversi. Un endpoint solo avrebbe dovuto provare entrambi i segreti su
ogni richiesta, e quando una firma si verifica «con uno dei due» non si sa piu
quale flusso ha parlato — e un abbonamento trattato come un incasso di club e
un errore contabile che nessuno cercherebbe li. Ognuno dei due rifiuta gli
eventi dell'altro, e lo dice.

### Il modello Connect scelto: addebiti diretti

Chi paga sta pagando **la sua societa sportiva**, non EasyGame: sull'estratto
conto della famiglia compare il club, e il denaro entra sul saldo del club
senza passare da un conto di Cedi. Un marketplace avrebbe scelto l'addebito
indiretto; un gestionale no — EasyGame non vende lo sport, lo amministra.
Vedi [ADR-0051](18-decision-log.md#adr-0051--due-flussi-stripe-due-account-due-segreti-il-denaro-delle-famiglie-non-e-il-fatturato-di-easygame).

### Il provisioning parla Accounts v2; il resto parla v1

Stripe non crea piu account connessi con `POST /v1/accounts` per le
integrazioni nuove: risponde `400` e rimanda a `POST /v2/core/accounts`. Dal
Blocco E il **solo provisioning** e migrato — creazione dell'account, link di
onboarding, rilettura dello stato — mentre checkout, addebiti diretti,
application fee, rimborsi, `balance_transaction` e verifica della firma
restano sulla v1, che li serve correttamente. Stripe dichiara
l'interoperabilita: un identificativo creato in v2 e accettato dagli endpoint
v1. Vedi
[ADR-0061](18-decision-log.md#adr-0061--un-account-connesso-nasce-sulla-accounts-v2-il-resto-dellintegrazione-resta-sulla-v1).

| | v1 | v2 |
|---|---|---|
| Corpo | `form-urlencoded` | **JSON** |
| Versione API | default dell'account | **obbligatoria** in intestazione (`Stripe-Version`) |
| Risposta | completa | solo i rami chiesti con `include`; gli altri tornano `null` |

Il trasporto v2 e `callStripeV2` in
`src/lib/payments/gateway/providers/stripe-http.ts`, accanto a `callStripe` e
non al suo posto.

> **`include` non e un'ottimizzazione.** Cio che non si chiede torna `null`,
> non «vuoto». Una rilettura senza `configuration.merchant` direbbe che un club
> operativo non ha capacita, e la sincronizzazione gli spegnerebbe i pagamenti.

**Il tipo di account non esiste piu.** Al suo posto ci sono `dashboard` e
`defaults.responsibilities`. L'equivalente dell'account Standard e:

| Proprieta | Valore | Cosa significa |
|---|---|---|
| `dashboard` | `full` | il club vede il cruscotto Stripe completo e legge i propri incassi senza passare da EasyGame |
| `defaults.responsibilities.fees_collector` | `stripe` | Stripe trattiene le proprie commissioni **dal club**, non da EasyGame |
| `defaults.responsibilities.losses_collector` | `stripe` | di un saldo negativo risponde Stripe, non EasyGame |
| `configuration.merchant.capabilities.card_payments.requested` | `true` | il club puo accettare carte |

Le due responsabilita **si congelano alla creazione**: non e una preferenza
modificabile, e dice chi e l'esercente.

**Uno stato v2 non si traduce alla lettera.** La v1 aveva due booleani e un
`disabled_reason`; la v2 ha uno stato e un elenco di motivi **per ogni
capacita**. Un account appena creato e `card_payments.status = "restricted"`
con motivo `requirements_past_due`: non e limitato, non ha ancora fatto
l'onboarding. La distinzione la fa il **motivo**:

| Motivo | Stato EasyGame |
|---|---|
| `restricted_other` | `restricted` — blocco vero |
| `unsupported_country`, o capacita `unsupported` | `disabled` |
| tutto il resto | `pending` — onboarding da completare |

Le richieste aperte arrivano da `requirements.entries`, filtrate su
`minimum_deadline.status`: si mostrano `past_due` e `currently_due`, non le
`eventually_due`, che non impediscono di incassare oggi.

**Un guardrail impedisce il ritorno alla v1.**
`tests/lib/stripe-connect-v2.test.mjs` fallisce se qualcuno ripristina
`callStripe("/accounts")`. Serve perche il rifiuto di Stripe arriva a runtime,
e in sandbox l'interruttore «Accounts v1 support» puo mascherarlo fino al
giorno del passaggio al live.

### Gli eventi sottoscritti, e perche solo questi

**Connect:** `checkout.session.completed`, `payment_intent.succeeded`,
`payment_intent.payment_failed`, `charge.refunded`, `charge.refund.updated`,
`account.updated`.

**Piattaforma:** `checkout.session.completed`,
`customer.subscription.created|updated|deleted`, `invoice.payment_failed`.

Sottoscrivere `invoice.*` per intero riempirebbe la tabella degli eventi di
righe che nessuno legge e che nascondono quelle che contano.

### Sandbox e produzione: la quarta domanda su un evento

Le prime tre le poneva gia il Blocco D: la **firma** (viene da Stripe),
l'**account** (per conto di una societa che conosciamo), la **deduplica** (non
l'abbiamo gia visto). La quarta e **da quale mondo**, e la aggiunge il Blocco E
([ADR-0060](18-decision-log.md#adr-0060--la-firma-dice-chi-ha-parlato-non-da-quale-mondo-sandbox-e-produzione-si-separano-sullevento)).

L'ambiente atteso lo dichiara la **chiave segreta**, non una variabile dedicata:
una variabile puo restare indietro dopo una rotazione, una chiave no.
`PAYMENT_MODE` resta il ripiego per quando la chiave non e riconoscibile. Vale
su entrambi i flussi, che condividono la chiave — e quindi l'ambiente — pur non
condividendo il segreto di firma.

### La commissione di Stripe non si calcola: si chiede a Stripe — e si richiede

`payment_transactions.provider_fee_cents` esisteva dal Blocco D e non lo
scriveva nessuno. Dal Blocco E lo riempie `PaymentGateway.fetchSettlement`,
leggendo il `balance_transaction` del charge **sull'account connesso** — che e
dove l'addebito diretto avviene.

**Ma non e noto quando l'evento arriva.** Il `balance_transaction` matura
*dopo* il pagamento, e il webhook arriva entro frazioni di secondo: nel
collaudo del Blocco E la commissione era `null` su **tutti** gli incassi. Il
campo era progettato per essere riempito piu tardi, ma quel piu tardi non
esisteva — `fetchSettlement` veniva chiamata in un punto solo, alla
registrazione, e nessuno tornava a chiedere. Il netto del club risultava quindi
il lordo meno la sola quota di piattaforma, cioe **piu alto del vero**.

Il recupero e ora un passo della manutenzione a orario
(`backfillProviderFees`, passo `payment_provider_fees`): prende gli incassi
che hanno ancora `provider_fee_cents` a `null`, richiede la liquidazione e
ricalcola il netto come lordo meno **entrambe** le trattenute. Se il saldo non
e ancora maturo non scrive niente e riprova al giro dopo: `null` significa
«non ancora noto», e zero direbbe «gratis».

Non e su una lettura perche sarebbe una chiamata di rete per riga a ogni
apertura di una lista — la cosa che `syncClubPaymentAccount` esiste per non
fare.

Le voci si leggono per **tipo** (`stripe_fee`, `application_fee`) e non per
posizione: l'elenco puo contenerne altre — imposte, costi di rete — e sommarle
tutte attribuirebbe a Stripe cio che non e suo. Il `net` si prende com'e:
ricalcolarlo darebbe lo stesso numero quasi sempre, e sbaglierebbe in silenzio
proprio nei casi che non abbiamo saputo classificare.

**Una formula qui sarebbe un difetto, non una scorciatoia.** La commissione di
Stripe cambia per metodo di pagamento, circuito e paese della carta, e cambia di
listino senza avvisare: «1,5% + 25 centesimi» sarebbe giusto il giorno in cui
viene scritto e sbagliato il giorno dopo, e comparirebbe in un rendiconto con
l'aria di essere un fatto. `null` significa **non ancora noto** — la transazione
di saldo matura dopo l'incasso — e non zero, che direbbe «gratis».

### Cosa non e collaudato

La verifica della firma, la traduzione degli eventi e la lettura del
`balance_transaction` hanno test. **Tutto cio che parla davvero con
`api.stripe.com` non e mai stato provato contro Stripe**: non ci sono
credenziali in questo repository e non se ne inventano. Il codice e scritto
sulla documentazione ufficiale e va considerato *da collaudare*, non
funzionante — vedi X-3 in
[23 — Matrice V1](23-v1-release-matrix.md).

## Fatturazione elettronica: nessun intermediario collegato

EasyGame genera e valida il tracciato `FPR12`, e si ferma li. Il registro
degli adapter (`src/lib/fiscal/fatturapa/provider.ts`) e **vuoto per
costruzione**: un adapter finto che risponde «trasmessa» e peggio di nessun
adapter, perche produce esattamente lo stato che non si deve poter
raggiungere e lo produce in modo indistinguibile da quello vero.

I candidati noti — Aruba, Fatture in Cloud, A-Cube, canale SdI diretto — sono
elencati nel registro **con `hasAdapter: false`**, perche la scelta va
presentata a chi la deve prendere. Vedi
[ADR-0053](18-decision-log.md#adr-0053--easygame-prepara-il-tracciato-fatturapa-non-lo-trasmette-e-non-lo-dichiara-trasmesso).
