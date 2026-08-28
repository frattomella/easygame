# 15 — Testing

## Stack

**Nessun framework esterno.** Si usa il test runner nativo di Node 22
(`node:test` + `node:assert/strict`), con `--experimental-strip-types` per
importare direttamente i `.ts` sorgente.

```jsonc
"test":      "npm run test:unit",
"test:unit": "node --experimental-strip-types --test-concurrency=1 --import ./tests/helpers/register-hooks.mjs --test \"tests/**/*.test.mjs\""
```

Dal 2026-08-22 la **discovery e automatica**: un file nuovo sotto `tests/` viene
eseguito senza toccare `package.json`. Prima andava elencato a mano ed era la
dimenticanza piu frequente.

I file di test hanno estensione `.mjs` e importano i moduli TypeScript con il
percorso completo:

```js
import { validatePassword } from "../../src/lib/auth/password-policy.ts";
```

Restano non testabili i moduli con JSX o con dipendenze da Next e dal browser.

Dal 2026-08-22 **`src/lib/server/**` e invece testabile**, grazie a due
tasselli:

1. `tests/helpers/extensionless-resolver.mjs` — hook di risoluzione ESM
   registrato via `--import ./tests/helpers/register-hooks.mjs`. Risolve gli
   import senza estensione (`./prisma`) e l'alias `@/`, che Node non conosce
   ma il bundler di Next si. **Non tocca il codice di produzione.**
2. `src/lib/server/prisma.ts` costruisce il client **alla prima query** invece
   che all'import, ed espone `__setPrismaClientForTests()`. Il client esportato
   e un Proxy che inoltra al client reale (o al doppio) legando i metodi,
   perche Prisma usa `this` internamente.

`tests/helpers/fake-prisma.mjs` fornisce un doppio che registra le chiamate e
filtra i record con la semantica dei `where` di Prisma (uguaglianza, `in`,
`not`, `gt`, `OR`, `AND`, `NOT`, filtri su path JSON).

Dove il runtime resta irraggiungibile si usano **test di conformita statica**
sul sorgente: meno espressivi, ma colgono la regressione che conta — un
endpoint nuovo che dimentica il controllo.

## Cosa e coperto oggi — 2.010 test, 157 file

**La tabella sotto ne elenca 57 e non 157**: e rimasta indietro, ed e onesto
dirlo invece di lasciar credere che sia completa. Le righe che ci sono
descrivono correttamente cio che coprono; le mancanti si leggono da `tests/`,
dove la discovery e automatica su `tests/**/*.test.mjs`. Il conteggio in testa
e invece verificato a ogni esecuzione.

| File | Test | Copre |
|------|------|-------|
| `tests/auth/auth-security.test.mjs` | 5 | Password policy, ruoli in registrazione pubblica, policy rate limit, OTP, provider telefono |
| `tests/auth/role-authorization.test.mjs` | 5 | Matrice `canAccessPath` / `canAccessClubResource` per i 7 ruoli |
| `tests/auth/route-guards.test.mjs` | 7 | Ogni area di gestione monta un guard; il middleware copre tutti i prefissi; le aree riservate restano a owner e club_manager; il guard e idempotente rispetto all'annidamento |
| `tests/auth/api-authorization.test.mjs` | 7 | Conformita di tutti i route handler: sessione richiesta, scope di club o deroga motivata, matrice permessi sul CRUD generico, `requirePlatformAdmin` su `/v1/admin/*`, nessuna esposizione di hash |
| `tests/auth/password-reset.test.mjs` | 11 | Token casuale e mai in chiaro, confronto a tempo costante, monouso, scadenza, tetto tentativi, revoca sessioni, atomicita, nessuna enumerazione, rate limit, dipendenza SMTP, isolamento dagli OTP |
| `tests/auth/active-club-access.test.mjs` | 5 | Selezione e persistenza del club attivo |
| `tests/auth/request-deduper.test.mjs` | 5 | Deduplicazione richieste concorrenti |
| `tests/auth/session-sync.test.mjs` | 3 | Invalidazione cache e handler `unauthorized` |
| `tests/auth/membership-load-result.test.mjs` | 3 | Normalizzazione del caricamento membership |
| `tests/email/smtp-config.test.mjs` | 4 | Validazione config SMTP, **la password non e mai esposta**, cifratura autenticata e rilevamento manomissioni |
| `tests/email/imap-config.test.mjs` | 10 | Validazione config IMAP, password mai esposta, **credenziali SMTP e IMAP non intercambiabili**, conversazione IMAP su SSL e STARTTLS, rifiuto dell'autenticazione in chiaro, iniezione di comandi via CR/LF |
| `tests/server/multi-tenant-isolation.test.mjs` | 29 | **Isolamento multi-tenant a runtime**: lettura, dettaglio, creazione, update e delete cross-tenant sulle funzioni vere di `resources.ts` |
| `tests/server/audit-log.test.mjs` | 14 | Registrazione degli eventi sensibili e assenza di dati riservati nel log |
| `tests/server/web-v1-regressions.test.mjs` | 16 | Proiezione `view=summary` della lista atleti, filtro e stampa della stagione attiva, sincronizzazione transazionale delle risorse club |
| `tests/lib/club-seasons.test.mjs` | 7 | Separazione delle stagioni e attribuzione dei record legacy alla stagione baseline |
| `tests/lib/season-model.test.mjs` | 7 | **Una sola stagione attiva**: stati futura/attiva/archiviata, `draft` letto come futura, stato dedotto dal periodo quando manca, validazione del periodo in creazione |
| `tests/lib/season-rollover.test.mjs` | 8 | Riporto: id nuovi, originali intatti, riferimenti rimappati anche dentro le rate, idempotenza, nessun duplicato per nome, riepilogo veritiero, dati operativi non riportabili |
| `tests/server/season-management.test.mjs` | 17 | Stagioni **a runtime**: creazione, attivazione, archiviazione, riporto e anteprima, rifiuto del riporto in stagione archiviata, **isolamento multi-tenant** su risorse e impostazioni, stagione immutabile in aggiornamento |
| `tests/ui/seasons-tab.test.mjs` | 8 | Scheda Stagioni: logica fuori da `page.tsx`, nessun `fetch` ne font nuovi, conferme sulle operazioni di stato, riepilogo prima della conferma, tre breakpoint |
| `tests/lib/category-birth-years.test.mjs` | 6 | Categorie con un solo anno di nascita: normalizzazione, etichetta, associazione atleta |
| `tests/lib/payment-enrollment.test.mjs` | 16 | Servizi opzionali nel totale e nelle rate, pro-rata applicato e diagnosticato, stato reale di ogni rata |
| `tests/server/cedipay-webhook.test.mjs` | 15 | Cosa succede a un evento **dopo** la verifica della firma: lo stesso evento consegnato due volte incassa una volta sola, due eventi diversi sullo stesso pagamento restano due, importi in centesimi che non si perdono, stati che non muovono denaro (in corso, fallito, scaduto, senza rata), rata di un altro club rifiutata, corpo dell'evento non conservato |
| `tests/lib/cedipay-webhook-signature.test.mjs` | 17 | La firma di un webhook (ADR-0045), con vettori costruiti a mano: solo schema `v1`, corpo modificato di un carattere, segreto diverso, replay in avanti e indietro, tolleranza a cinque minuti, **tolleranza zero che non spegne il controllo**; e la traduzione di un evento, incluso un PaymentIntent che porta `amount` e non `amount_total` |
| `tests/lib/entitlements.test.mjs` | 18 | Chi puo usare cosa (ADR-0046): funzioni gia in uso che restano nel piano di base, abbonamento scaduto che riporta a `free` senza spegnere tutto, `past_due` che continua a pagare, servizio attivo che sblocca fuori piano, eccezione che vince in **entrambe** le direzioni e anche sull'amministratore, funzione inventata che non concede niente |
| `tests/server/entitlements-service.test.mjs` | 10 | Gli stessi entitlement letti dal database: club con e senza servizi, servizio disdetto che non tiene accesa la funzione, «togli l'eccezione» distinto da «vieta», e una scrittura che non porta via il resto di `clubs.settings` |
| `tests/lib/cedipay-registry.test.mjs` | 12 | I quattro gradini che accendono «Paga online»: adapter, credenziali di piattaforma, impostazione del club, conto del club abilitato. Ognuno con il suo messaggio, perche li risolvono quattro persone diverse |
| `tests/lib/document-numbering.test.mjs` | 7 | La forma del numero di un documento (ADR-0044): prefisso per tipo, anno dentro il numero, progressivo a quattro cifre che non tronca, rilettura di un numero gia emesso, numero scritto a mano che non fa esplodere il parser |
| `tests/lib/funding-reconciliation.test.mjs` | 12 | La riconciliazione di un bando: misura grezza accanto al requisito, periodi **non** maturati che restano in tabella, totali che distinguono assegnato, maturabile, maturato, perso e rendicontato, somme in centesimi, CSV con punto e virgola e virgola decimale |
| `tests/lib/document-view.test.mjs` | 12 | Il documento stampabile: contenuto, importo e data **indipendenti dai dati di localizzazione dell'ambiente**, fattura che dichiara di non essere stata trasmessa, e ogni valore sfuggito — una causale con dei tag non riscrive la pagina, un apostrofo in una ragione sociale non la rompe |
| `tests/server/invoice-issuing.test.mjs` | 11 | Cosa distingue una fattura da una ricevuta (ADR-0047): intestazione al genitore e non all'atleta, tutore indicato dal club, atleta maggiorenne, rifiuto senza codice fiscale con le due strade nel messaggio, registri di numerazione che non si mescolano, emissione idempotente, `is_electronic` che resta falso |
| `tests/server/document-numbering.test.mjs` | 10 | L'assegnazione del numero: sequenza per club, per tipo e per esercizio; due societa che hanno entrambe la ricevuta 1; numero assegnato che non torna disponibile; **la forma dell'istruzione** — un incremento solo, non una lettura seguita da una scrittura, perche un doppio di Prisma non ha i lock di Postgres |
| `tests/ui/document-numbering-ownership.test.mjs` | 4 | Che non ricompaia una seconda numerazione: nessuna schermata compone un numero, nessuna scrive nelle ricevute, il proprietario non conta righe |
| `tests/lib/installment-ledger.test.mjs` | 25 | **Il registro incassi**: pagamento totale, parziale e multiplo con metodi diversi; somme in centesimi; scaduta e parziale insieme; storni fuori dai totali ma dentro lo storico; compatibilita con le rate anteriori al registro; ordine cronologico crescente |
| `tests/server/payment-transactions.test.mjs` | 23 | **Gli incassi a runtime**: ogni operazione provata dal club sbagliato deve fallire con «Accesso negato»; lo stato della rata lo riscrive il servizio e non il client; rata annullata che non torna in vita; storno, doppio storno, correzione; provider online rifiutati |
| `tests/lib/payment-partial-regressions.test.mjs` | 9 | Che un acconto arrivi fino ai totali dell'atleta, e che **non** cambi cio che gia funzionava: servizi opzionali, pro-rata, rate annullate |
| `tests/ui/payment-registration-flow.test.mjs` | 13 | Un solo flusso «Registra pagamento» fra scheda atleta e Movimenti; nessuna scelta di stato; metodo dai metodi del club; importo precompilato e modificabile; nessuna griglia a due colonne a 375 px |
| `tests/lib/funding-model.test.mjs` | 31 | **Voucher e contributi**: il caso di riferimento configurato solo come dati, un secondo bando con regole opposte sullo stesso calcolo, periodi mensili di calendario e parziali, soglia, pro-rata, plafond che si consuma in ordine, i cinque importi, riconciliazione delle liquidazioni, misura delle ore dalle presenze |
| `tests/server/funding-service.test.mjs` | 27 | **I contributi a runtime**: isolamento multi-tenant su ogni operazione, maturato calcolato dalle presenze, ricalcolo idempotente, periodo liquidato che non si riscrive ma consuma plafond, liquidazioni parziali, e che **nessuna liquidazione crea un incasso della famiglia** |
| `tests/ui/funding-flow.test.mjs` | 16 | Che **nessuna costante del bando di riferimento viva in `src/`**, che le due contabilita non si tocchino, i cinque importi a schermo, il dettaglio per periodo, la configurabilita completa dal pannello |
| `tests/lib/api-adapter-requests.test.mjs` | 4 | L'adapter fa **una** richiesta per select senza relazioni, e carica le relazioni solo quando servono |
| `tests/lib/trainer-delete.test.mjs` | 8 | L'eliminazione di un allenatore e persistita su tutte le origini che la lettura rimette insieme |
| `tests/lib/coalescing-saver.test.mjs` | 6 | L'autosave scrive una volta alla volta e accorpa le modifiche fatte durante l'attesa |
| `tests/lib/club-write-requests.test.mjs` | 8 | Quante richieste costa ogni operazione sul club e con quale proiezione di colonne |
| `tests/lib/italian-registry.test.mjs` | 11 | 107 province con regione, validazione CAP, coerenza provincia/regione, **carattere di controllo del codice fiscale verificato su quattro codici reali**, calcolo che dichiara cosa manca invece di improvvisare |
| `tests/lib/athlete-import.test.mjs` | 9 | CSV con punto e virgola, BOM e virgolette; XML senza DOMParser; date italiane non lette all'americana; mappatura automatica; righe scartate, duplicati nel file e nel club |
| `tests/lib/onboarding.test.mjs` | 8 | Configurazione iniziale: stato illeggibile che non rompe la pagina, saltare senza perdere i passi, riprendere dopo aver saltato, innesto in `settings` senza toccare il resto |
| `tests/lib/club-profile-autosave.test.mjs` | 6 | **Quali sezioni possono salvarsi da sole**, e che una sezione in autosave non scriva IBAN, dati fiscali, stagioni o listini |
| `tests/server/anagrafica-validation.test.mjs` | 10 | Validazione anagrafica lato server, con l'eccezione esplicita per i dati gia in archivio |
| `tests/ui/brand-and-chrome.test.mjs` | 9 | Marchio senza dipendenze esterne, chat fuori dalla topbar, console di piattaforma separata dal club, modali che stanno nello schermo, font self-hosted |
| `tests/ui/topbar-club-vs-platform.test.mjs` | 16 | **Cosa distingue la chrome del club da quella di piattaforma**: azioni rapide e assistenza sul club e non sulla console, chat fuori da entrambe, gerarchia logo/nome/stagione, due soli font e nessuna taglia inventata sulle superfici dell'identita |
| `tests/lib/sorting.test.mjs` | 8 | Comparatore nominale unico: maiuscole ignorate, numeri ordinati da numeri, valori vuoti in fondo, stabilita, Cognome poi Nome per le persone |
| `tests/lib/category-compatibility.test.mjs` | 8 | Compatibilita **esplicita, orientata e non transitiva**; categorie personalizzate e riferimenti per nome; primaria, appartenenze ed eleggibilita restano insiemi distinti |
| `tests/lib/jersey-numbering-groups.test.mjs` | 10 | Atleti che rientrano nel gruppo con la categoria registrata solo per nome, nome atleta non duplicato, righe ordinate, numeri duplicati e riservati, indice costruito in una passata |
| `tests/lib/numbering-group-persistence.test.mjs` | 5 | I gruppi e la compatibilita sopravvivono al giro serializza/normalizza, compresi i numeri riservati salvati come numeri |
| `tests/lib/forms-model.test.mjs` | 38 | Modello dei moduli: tipi di campo, normalizzazione difensiva (tipo sconosciuto, id duplicati, **collegamento fuori catalogo scartato**), slug non indovinabile, confronto fra versioni, validazione delle risposte (obbligatori, opzioni fuori elenco, email/telefono/numero/data, **un allegato non si soddisfa con una stringa**, risposte a campi inesistenti scartate, testi tagliati), precompilazione, proposta di modifica, duplicati |
| `tests/server/forms-service.test.mjs` | 45 | Moduli **a runtime**: isolamento multi-tenant su ogni operazione, link pubblico (bozza, link disabilitato, chiusura per data, rigenerazione), **versionamento** (la versione 1 non cambia quando si pubblica la 2), allegati che passano dal servizio del Blocco 8, revisione, approvazione, rifiuto, doppia approvazione impedita, dati di sola lettura, compilazione dalla segreteria, **sede e categoria**: opzioni che le mette il server, identificativo scritto al posto del nome, club mono-sede che non vede la domanda, sede sconosciuta che non entra nemmeno manomettendo la riga, appartenenza gia collocata che non si sposta |
| `tests/lib/forms-site-options.test.mjs` | 11 | Le opzioni che il modulo non possiede (ADR-0043): sedi e categorie del club al posto di quelle scritte a mano, club mono-sede senza domanda, una sede fuori elenco rifiutata dalla stessa validazione dei campi a scelta, un modulo con il campo sede pubblicabile senza opzioni |
| `tests/ui/forms-builder.test.mjs` | 25 | Regole di interfaccia della Modulistica V2: logica fuori da `page.tsx`, nessun `fetch` fuori da `@/lib/api/forms`, **nessun identificativo tecnico mostrato**, divulgazione progressiva, autosave con debounce e accorpamento, revisione che non decide da sola, tre breakpoint, modulo pubblico a colonna singola |
| `tests/ui/account-onboarding-and-admin.test.mjs` | 9 | Home account senza tavolozza propria e con i tre stati distinti, area onboarding protetta e saltabile, import con avanzamento reale e riepilogo, IMAP separato da SMTP nella console |
| `tests/lib/multisite-model.test.mjs` | 15 | **Multi-sede**: la stessa categoria in due sedi resta una categoria sola, gruppi impliciti, mono-sede che non vede il concetto, sede vuota che non fa sparire il dato storico, compatibilita non transitiva con piu sedi |
| `tests/lib/jersey-numbering-multisite.test.mjs` | 9 | Numerazione per sede: il 10 di Roma non e il 10 di Aprilia, gruppo senza sedi che non restringe, atleta senza sede che resta dentro, duplicati che restano duplicati nella stessa sede |
| `tests/ui/multisite-ux.test.mjs` | 6 | Il filtro sede non si monta senza due sedi attive, le pagine usano il componente unico, una sede con strutture non si elimina, l'editor scrive gruppi e non categorie |
| `tests/lib/clothing-delivery.test.mjs` | 13 | **Consegne parziali**: stati indipendenti per articolo, «2/4 consegnati», stato del kit derivato e non scritto, taglia proposta dall'anagrafica, override che non tocca l'anagrafica |
| `tests/ui/clothing-delivery-ux.test.mjs` | 12 | La tendina taglia mostra e salva la proposta, lo stato in elenco e derivato, le consegne non passano dal cambio di stato globale, il kit non chiede ne una stagione ne una compatibilita di categoria — e la compatibilita **resta** dove serve, sui gruppi di numerazione |
| `tests/lib/clothing-catalog-model.test.mjs` | 7 | Il **modello** del catalogo, non il JSX: stagione e categorie compatibili non entrano da un record legacy, un salvataggio le toglie dal record e il magazzino di un articolo non e mai vuoto per una ragione sportiva. Esiste perche il test della UI verificava che il campo non si vedesse, e un campo che non si vede ma continua a salvarsi e nascosto, non rimosso |
| `tests/lib/cap-archive.test.mjs` | 14 | Il CAP di un comune: i tre esiti distinti (`unique`, `ambiguous`, `unknown`), l'unione con l'archivio ISTAT che non inventa comuni, la copertura che non si degrada in silenzio, e **Roma, Milano, Napoli, Torino, Genova, Bologna e Firenze fra gli ambigui** — i comuni in cui proporre un CAP sarebbe sbagliato, non solo incompleto |
| `tests/lib/multisite-performance.test.mjs` | 2 | **Il costo cresce con gli atleti, non con il loro quadrato**: rapporto fra 200 e 400 atleti sotto 3x su riepilogo gruppi e progresso consegne |
| `tests/server/web-v1-integration.test.mjs` | 16 | **I punti di contatto fra i tre workstream**, che nessuno di loro poteva provare da solo: incasso parziale e voucher sullo stesso atleta senza sommarsi, liquidazione che non tocca la rata, i cinque importi che restano cinque, atleta multi-sede con una rata sola, modulo pubblico che **non** sceglie il tenant, kit valutato sugli articoli e non sulla sede, allegato di un modulo che eredita il club dal modulo, isolamento multi-tenant su tutti i domini nuovi |
| `tests/server/clothing-assignments-resources.test.mjs` | 8 | Che le assegnazioni passino da `resources.ts` (D32): `club_resource_items` e il JSON del club allineati, **una** transazione per le tre collezioni, validazione prima di qualunque scrittura, isolamento fra club, `created_at` conservato |
| `tests/ui/athlete-profile-integration-audit.test.mjs` | 6 | L'audit della scheda atleta dopo tre workstream paralleli: le otto aree montate, **nessun pannello montato due volte**, nessun import duplicato, lo stato della rata letto e non ricalcolato, la pagina che non supera le 8480 righe della baseline, contributi e incassi in due riquadri distinti |
| `tests/lib/movements-cash-ledger.test.mjs` | 11 | **Le Entrate di `/movements` sono cassa** (RC Fix 3): rata scoperta, parziale, saldata, piu incassi sulla stessa rata, storno, rimborso, incasso-storno-incasso, il caso misurato dal Full Club UAT (329,80 dovuti, 250,00 incassati), rata annullata, rata anteriore al registro, Uscite e saldo |
| `tests/server/birth-date-api.test.mjs` | 15 | **Le date impossibili sul confine dell API** (RC Fix 3): 31/02, 31/04, 29/02 non bisestile e la loro grafia italiana rifiutate — e nessuna scrittura parte; futuro e anno fuori range rifiutati; il 29/02 bisestile e la data valida salvate **esattamente** com erano scritte; una scheda gia in archivio con una data impossibile resta correggibile |
| `tests/server/club-settings-concurrency.test.mjs` | 6 | **Due modifiche concorrenti a `clubs.settings`** (RC Fix 3): il primo test **riproduce** il lost update sul percorso vero; gli altri provano che `settings_patch` non porta con se una copia vecchia — Contatti + Pagamenti, Branding + dati fiscali, due modifiche alla stessa chiave, autosave con cinque sezioni sporche — e che `settings` intero continua a sostituire |
| `tests/ui/kb-link-integrity.test.mjs` | 3 | I 294 link interni della Knowledge Base e la numerazione degli ADR: nessun file mancante, nessuna ancora rotta, nessun ADR duplicato o fuori ordine. Esiste perche l'integrazione ha rinumerato cinque ADR a mano |

## Isolamento multi-tenant: cosa dimostrano i test

`tests/server/multi-tenant-isolation.test.mjs` esercita le funzioni reali con
un doppio del client. Copre, per un utente che appartiene al solo club A:

| Operazione | Verifica |
|-----------|----------|
| `listResource` | la query parte gia con `where.organization_id` del club attivo; un `organization_id` o `club_id` altrui viene rifiutato |
| `listResource("clubs")` | `where.id` ristretto a `{ in: allowedOrganizationIds }`; senza club consentiti la lista e vuota |
| `getResourceById` | un record altrui non e leggibile |
| `createResource` | un `organization_id` altrui e rifiutato; senza, viene imposto il club attivo; senza club attivo non si crea nulla |
| `updateResource` | un record altrui non e modificabile e **resta intatto**; non si puo spostare un record in un altro club |
| `deleteResource` | un record altrui non e cancellabile e **resta presente** |
| Alias | `simplified_athletes` e `organizations` applicano lo stesso isolamento |
| Copertura d'insieme | **tutte** le risorse `club_resource` piu atleti, certificati, pagamenti, fatture e ricevute filtrano per organizzazione |

Due forme di rifiuto, entrambe corrette:

- modelli Prisma dedicati → `"Accesso negato"` (il record e letto e poi
  rifiutato);
- risorse generiche di club → `"non trovata"`, perche il filtro e **dentro la
  query**: il record altrui non viene mai letto. E la forma migliore, perche
  non conferma l'esistenza. Un test dedicato verifica che un id inventato e un
  id reale di un altro club diano **la stessa** risposta.

### Verificati per mutazione

I test sono stati validati sabotando temporaneamente il codice:

| Sabotaggio | Test falliti |
|-----------|--------------|
| `listResource` non impone piu `organization_id` | **8** |
| `ensureOrganizationAccess` non solleva piu | **11** |

## Cosa NON e coperto

- **`syncClubResourceItemsFromField`** — la sincronizzazione distruttiva
  `club_resource_items` ⇄ `clubs.<json>` non e ancora coperta. → WP-10
- **`src/lib/simplified-db.ts`** — 4.036 righe di logica di dominio.
- **Componenti e pagine** — nessun test di rendering.
- **Mobile** — nessun test. → [WP-24](20-work-packages.md)
- **End-to-end** — nessuna suite. Esistono script manuali
  (`scripts/verify-staging-access-switch.mjs`,
  `scripts/provision-staging-e2e.mjs`).
- **Migrazioni** — nessuna verifica automatica.

## Gate di qualita

Eseguiti automaticamente dalla CI su ogni push e pull request
(`.github/workflows/ci.yml`), e da eseguire in locale prima di ogni commit:

```bash
npm test           # 84/84 attesi
npm run typecheck  # nessun output = OK
npm run lint       # 0 errori (i warning esistenti sono tollerati)
npm run build      # deve completare
```

Per il mobile, separatamente:

```bash
cd easygamemobile
npm run check:types
npm run lint
```

La CI aggiunge anche `npx tsc --allowUnreachableCode false` e quattro
guardrail di sicurezza (nessun `.env` committato, nessun token noto, nessuna
connection string con credenziali, nessun `DATABASE_URL` nel mobile).

### Baseline verificata il 2026-08-26 (Blocco D2)

| Gate | Esito |
|------|-------|
| `npm test` | 1.535 pass / 0 fail (2026-08-26, Blocco D2) |
| `npm run typecheck` | OK |
| `npm run lint` | 0 errori, 41 warning (`no-img-element`, `exhaustive-deps`) |
| `npm run build` | OK |
| `easygamemobile` `check:types` | OK |
| `easygamemobile` `lint` | esce 0, 20 warning |
| `tsc --allowUnreachableCode false` | 0 segnalazioni |

**Il numero di warning ESLint non deve crescere.** Se un tuo commit lo aumenta,
correggi prima di committare.

## Misure, non solo test

Quattro script producono numeri **rifacibili** invece di numeri copiati. Non
fanno passare o fallire niente: servono a decidere prima di ottimizzare, e a
produrre la riga «prima» e la riga «dopo» della stessa tabella.

| Comando | Che domanda risponde |
|---------|----------------------|
| `npm run measure:athletes` | Quanto pesa la lista Atleti, e quanto pesava con i file dentro i record |
| `npm run measure:multisite` | Come cresce il costo dell'abbigliamento e della numerazione con piu sedi |
| `npm run measure:web` | Come cresce **ogni dominio** da 200 a 2.000 atleti: peso, righe, **interrogazioni**, tempo |
| `npm run measure:dashboard` | Quanto costa **aprire** la Dashboard Club: richieste, **giri di rete**, byte, duplicati |

Il terzo e nato nel Blocco Finale C e ha trovato due cicli annidati veri nei
report: erano centinaia di milioni di confronti per disegnare una tabella, e
nessun test funzionale poteva accorgersene.

Il quarto e nato in RC Fix 1 e misura una cosa che gli altri non vedevano: i
**giri di rete**. Ventinove richieste non sono un problema se partono
insieme; dieci attese in fila lo sono, ed erano quelle che facevano sembrare
lenta la dashboard.

| Dashboard Club | richieste | giri | kB (200 atleti) | kB (1.000) |
|----------------|-----------|------|-----------------|------------|
| prima | 29 | 10 | 1.960 | 9.500 |
| dopo, sopra la piega | 4 | 1 | 157 | 683 |
| dopo, pagina intera | 20 | 1 | 725 | 3.487 |

Il numero difeso a ogni esecuzione della suite sta in
`tests/lib/dashboard-overview.test.mjs`: quattro richieste, nessun duplicato.

## Come aggiungere un test

1. Il modulo da testare non deve avere JSX ne dipendenze da Next o dal DOM.
   Gli import senza estensione e l'alias `@/` sono gestiti dall'hook di
   risoluzione. Se il modulo tocca il database, inietta un doppio con
   `__setPrismaClientForTests()` e usa `createFakePrisma()`.
2. Crea `tests/<area>/<nome>.test.mjs`. Viene raccolto automaticamente.
3. Esegui `npm test`.

Se il modulo non e importabile, valuta un test di conformita statica sul
modello di `api-authorization.test.mjs`: leggi il sorgente e verifica
l'invariante.

## Regola

Ogni commit che tocca **autenticazione, ruoli, permessi o accesso ai dati**
deve includere o aggiornare un test. Non e negoziabile: e il presidio
automatico piu vicino all'isolamento multi-tenant, finche quello vero manca.

---

## Lavoro sportivo: il collaudo che i test non sostituiscono (2026-08-28)

Il dominio ha **199 test** fra unita, servizio e rotte. Non bastano, e si sa
perche: girano su un doppio di Prisma e su uno scope costruito a mano. Provano
il dominio, non il prodotto.

`scripts/sport-work-uat.mjs` parla HTTP con l'applicazione in ascolto, con un
cookie di sessione vero, e passa dalle stesse rotte che usa il browser. Copre
gli scenari A–E del work package, sicurezza, concorrenza, storno, anno nuovo e
prestazioni su un dataset realistico: **72 controlli**.

```bash
NEXT_DIST_DIR=.next-verify npm run build
node scripts/start-verify-server.mjs
node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
  scripts/sport-work-uat.mjs --base=http://127.0.0.1:3010
```

**Ha trovato due difetti che duemila test verdi non avevano visto**, ed
entrambi vivono nello spazio fra il dominio e il modo in cui le rotte lo
chiamano:

1. `Number(null)` non e `NaN`, e `0`, ed e un intero: il filtro per anno
   diventava `fiscal_year = 0` e il registro delle uscite rispondeva elenco
   vuoto. Nei test passava `undefined`, che invece diventa `NaN`;
2. per un **indice parziale** Prisma riporta il nome dell'indice e non quello
   delle colonne: il riconoscimento del doppio clic cadeva proprio nel caso per
   cui l'indice esiste. Il doppio di Prisma non lo poteva mostrare, perche non
   conosce gli indici parziali.

Entrambi hanno ora un test di regressione. La lezione e la stessa di
`tests/server/checkout-session-route.test.mjs`: **cio che i test non chiamano
come lo chiama l'interfaccia, non e provato.**

