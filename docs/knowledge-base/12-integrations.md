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
