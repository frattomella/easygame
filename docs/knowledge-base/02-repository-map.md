# 02 — Mappa del repository

Il repository ospita **due applicazioni separate** nella stessa working copy.
La separazione va mantenuta: vedi [17 — Convenzioni](17-development-conventions.md).

```
easygame/
├── src/                    WEB APP (Next.js 14 App Router)  <- app principale
├── easygamemobile/         MOBILE APP (Expo / React Native) <- app secondaria
├── prisma/                 schema + migration + seed (condivisi, owner = Web)
├── scripts/                utility Node per avvio locale e verifiche staging
├── tests/                  test Node runner (solo Web)
├── docs/                   documentazione, inclusa questa KB
└── public/                 asset statici serviti dalla Web App
```

## Web App — `src/`

| Percorso | Contenuto | Note |
|----------|-----------|------|
| `src/app/` | 131 file. Route App Router: 72 `page.tsx`, 42 `route.ts` API, 6 `layout.tsx` | Vedi [04](04-web-architecture.md) |
| `src/app/api/v1/` | API versionata: auth, admin, registry, risorse generiche | Superficie usata anche dal mobile |
| `src/app/api/` (fuori `v1`) | Endpoint di dominio non versionati: parent-dashboard, payments, athletes/documents, clothing, forms/assets, medical-certificate-reminders, **public/forms** | Incoerenza nota, vedi [09](09-api-conventions.md). `public/forms` sta fuori da `v1` di proposito: non e la superficie ufficiale, e l'unico endpoint senza sessione |
| `src/components/ui/` | 58 file. Primitive shadcn/ui + componenti custom (chat, avatar-upload, toast) | 18 primitive non referenziate, vedi [cleanup-report](cleanup-report.md) |
| `src/components/trainer/` | 28 file. Dashboard allenatore | Convivono v1 (`trainer-*-page`) e v2 (`trainer-*-dashboard-page`); solo v2 e in uso |
| `src/lib/entitlements/` | Chi puo usare cosa ([ADR-0046](18-decision-log.md#adr-0046--chi-puo-usare-cosa-si-calcola-in-un-posto-solo-e-la-risposta-dice-sempre-perche)): catalogo chiuso delle funzioni e risoluzione su piano, servizi attivi ed eccezioni | Modulo puro. Chi lo usa conosce il nome della funzione, non i piani |
| `src/lib/payments/cedipay/` | Il contratto provider-agnostico dei pagamenti online e gli adapter ([ADR-0045](18-decision-log.md#adr-0045--cedipay-e-il-livello-di-prodotto-il-psp-sta-sotto-e-si-sostituisce)). `contract.ts` non conosce nessun PSP; `providers/stripe.ts` e il primo adapter; `providers/stripe-signature.ts` verifica la firma dei webhook | Il nome di un PSP non deve comparire fuori da `providers/` |
| `src/lib/forms/` | Modello puro dei moduli: tipi di campo, catalogo dei dati EasyGame, validazione, precompilazione, proposta di modifica, **opzioni che il modulo non possiede** (`field-options.ts`: sedi e categorie del club) | Nessun import da `lib/server`: si prova senza database |
| `src/components/forms/` | 25 file. Builder e modulo pubblico della Modulistica V2 (`form-builder`, `form-renderer`, `forms-dashboard`, `public-form-page`, `submission-review-dialog`, `compile-form-dialog`), editor documenti, form di dominio | |
| `src/components/dashboard/` | 15 file. Sidebar, Header, widget dashboard club | |
| `src/components/providers/` | `AuthProvider`, `ThemeProvider`, `GlobalLoadingProvider`, `AppClientProviders` | Montati in `src/app/layout.tsx` |
| `src/components/auth/` | `auth-shell.tsx` (login+registrazione), `access-area-guard.tsx` | |
| `src/components/account/` | Home account e le sue dialog (crea club, profilo, riscatta accesso) | Ridisegnata nel Blocco 4 |
| `src/components/brand/` | Marchio SVG e identita di club | |
| `src/components/platform-admin/` | Shell della console di piattaforma | Nessun riferimento alle risorse di club |
| `src/components/organization/` | Scheda Stagioni della pagina Organizzazione (`season-manager.tsx`) | Blocco 6, vedi [10](10-ui-ux-conventions.md) |
| `src/components/sites/` | Filtro sede, anagrafica sedi, editor dei gruppi operativi | Workstream B, [ADR-0038](18-decision-log.md). `SiteFilter` non si monta se il club non e multi-sede |
| `src/components/clothing/` | Dialogo consegne di un kit, a schede impilate | Workstream B. Usabile da telefono: le consegne si registrano in magazzino |
| `src/data/` | Tabelle di riferimento pubbliche versionate (comuni ISTAT) | Blocco 7, generate da `scripts/`, vedi [06](06-data-model.md) |
| `src/lib/` | 93 file (esclusa `server/`). Logica di dominio, utility, policy | Vedi tabella sotto |
| `src/lib/server/` | Codice **solo server**: Prisma client, auth, resources, email, workflow | Non importare dal client |
| `src/pages/` | 4 file residui del Pages Router: `_app`, `_document`, `_error`, `404` | Legacy, vedi [16](16-technical-debt.md) |
| `src/types/` | `bcryptjs.d.ts` — dichiarazione ambient necessaria (non esistono `@types/bcryptjs` installati) | **Non cancellare** |

### File chiave di `src/lib`

| File | Righe | Ruolo |
|------|-------|-------|
| `simplified-db.ts` | 4.036 | Data layer **client-side** di dominio. Il file piu grande e piu critico del progetto. |
| `server/resources.ts` | 1.919 | Data layer **server-side** generico: `RESOURCE_CONFIG`, `listResource`, `createResource`, `API_REGISTRY`. |
| `supabase.ts` | 1.116 | Adapter con API in stile Supabase implementato sopra `fetch` verso `/api/v1`. **Non parla con Supabase.** Vedi [ADR-0003](18-decision-log.md). |
| `access-roles.ts` | 340 | Unica fonte di verita su ruoli, aree e permessi risorsa. |
| `server/auth.ts` | 335 | Sessioni, cookie, scope organizzativo, platform admin. |
| `auth/*.ts` | — | Policy pure e testabili: password, OTP, rate limit, registrazione, provider. |
| `api/client.ts` | 178 | `apiRequest`: envelope, header di contesto, invalidazione sessione su 401. |
| `api/registry.ts` | 211 | Registro endpoint per il client mobile. |
| `server/email/` | — | Provider SMTP e IMAP, cifratura credenziali (contesti separati), invio transazionale. `imap-protocol.ts` e la macchina a stati IMAP, pura e testabile; `imap-client.ts` il solo pezzo che tocca il socket. |
| `italian-registry.ts` | 530 | Province, CAP e codice fiscale. Puro. Fonte unica delle regole anagrafiche, usata sia dai form sia da `server/anagrafica.ts`. |
| `athlete-import.ts` | 761 | Parser CSV e XML scritti in casa, mappatura colonne, validazione riga per riga. Puro: nessun DOM. |
| `club-profile.ts` | 402 | Sezioni della scheda club, quali sono in autosave e cosa scrive ognuna. Include `patchClubSettings`. |
| `onboarding.ts` | 220 | Stato della configurazione iniziale del club. Puro. |
| `server/anagrafica.ts` | 209 | Validazione anagrafica lato server, chiamata da `resources.ts`. |
| `club-seasons.ts` | 700 | Modello delle stagioni: stati, invariante «una sola attiva», filtro per stagione, pianificatore del riporto. **Puro.** |
| `server/seasons.ts` | 320 | Scrittura delle stagioni: creazione, attivazione, archiviazione, riporto, conteggi. Unico punto che scrive `settings.seasons`. |
| `api/seasons.ts` | 90 | Trasporto client delle stagioni verso `/api/v1/seasons`. |
| `payments/installment-ledger.ts` | 526 | Il registro incassi: dovuto, incassato, residuo e stato di una rata si **calcolano** dai movimenti. **Puro.** Vedi [ADR-0036](18-decision-log.md#adr-0036--una-rata-e-un-debito-un-incasso-e-un-movimento-due-tabelle-non-una). |
| `server/payment-transactions.ts` | 561 | Scrittura degli incassi: registrazione, storno, emissione ricevuta. Unico punto che scrive `payment_transactions`, e l'unico che riscrive `payments.status`. |
| `payments/` (resto) | — | Tipi, fee di piattaforma, registro provider (nessuno implementato), metodi di incasso configurati dal club. |
| `funding/funding-model.ts` | 724 | Voucher e contributi: periodi, maturato, i cinque importi, validazione della configurazione e della riconciliazione. **Puro**, e senza nessuna regola di un singolo bando. Vedi [ADR-0037](18-decision-log.md#adr-0037--un-contributo-non-e-un-pagamento-due-contabilita-separate-e-le-regole-del-bando-sono-dati). |
| `funding/attendance-measure.ts` | 193 | Dalle presenze EasyGame alla misura che un bando chiede: ore o sessioni per periodo. **Puro**: riceve allenamenti e presenze, non li cerca. |
| `server/funding.ts` | 760 | Scrittura dei contributi: programmi, beneficiari, ricalcolo del maturato, rendicontazione, liquidazioni. **Non importa i pagamenti**, di proposito. |
| `club-sites.ts` | 466 | **Sedi, strutture e gruppi operativi** ([ADR-0038](18-decision-log.md)). Il gruppo e la coppia (categoria, sede): la categoria non si duplica mai. Puro. |
| `category-compatibility.ts` | 372 | Compatibilita fra categorie: esplicita, orientata, **non transitiva** ([ADR-0030](18-decision-log.md)). Puro. |
| `jersey-numbering-utils.ts` | 524 | Chi e in un gruppo numerazione e con che numero. Indici costruiti una volta per pagina: O(N + G), non O(N x G). |
| `clothing-inventory-utils.ts` | 1.694 | Catalogo, kit, magazzino e assegnazioni: normalizzazione, serializzazione, riserva di stock. |
| `clothing-delivery.ts` | 354 | **Ciclo di consegna**: quattro stati per articolo, stato del kit **derivato**, taglia proposta dall'anagrafica. Puro. |
| `structures-utils.ts` | 314 | Strutture, campi, disponibilita e prenotazioni. Porta `siteId`. |

## Mobile App — `easygamemobile/`

| Percorso | Contenuto | Stato |
|----------|-----------|-------|
| `client/screens/` | 19 schermate | Solo 9 sono collegate ai navigator |
| `client/navigation/` | 7 navigator (root, tab, 5 stack) | Wiring **solo trainer** |
| `client/services/api.ts` | Client HTTP verso `/api/v1` della Web App | Fonte dati reale |
| `client/services/mobile-backend-storage.ts` | Cache/adapter sopra `api.ts` | In uso |
| `client/services/storage.ts` | **Dati mock** (`MOCK_USER`, `MOCK_CLUBS`) | Usato solo da schermate non collegate |
| `client/services/mobile-storage-service.ts` | Terzo layer di storage | **Orfano** |
| ~~`server/`, `shared/`, `drizzle.config.ts`, `.replit`~~ | Scaffold Replit, schema Drizzle e accesso diretto al database | **Rimossi** il 2026-08-22, vedi [ADR-0018](18-decision-log.md) |

## Radice

| File | Ruolo |
|------|-------|
| `package.json` | Web App. `engines.node = 22.x`. Script test/typecheck/lint/build/prisma. |
| `next.config.js` | Config Next: `reactStrictMode`, remote images, `serverActions.bodySizeLimit`. |
| `vercel.json` | `buildCommand: npm run vercel-build`, regione `fra1`. |
| `.vercelignore` | Esclude `easygamemobile/`, `.codex-tmp/`, log, env. |
| `.github/workflows/ci.yml` | Pipeline CI: job web, mobile e guardrail di sicurezza. |
| `tempo.config.json` | Residuo del tool Tempo. Nessun codice lo legge. |
| `components.json` | Config shadcn/ui. |
| `.eslintrc.json` / `.eslintignore` | ESLint via `next/core-web-vitals`. |
| `src/middleware.ts` | Cancello di autenticazione edge sui percorsi protetti. |
| `scripts/db-guard.mjs` | Blocca le scritture locali verso database condivisi. |
| `EasyGame - Avvio Locale.bat`, `avvia-easygame.cmd`, `start-local.sh`, `scripts/start-local.*` | Launcher locali multi-piattaforma. |

## Directory locali non versionate

`.next/`, `node_modules/`, `.vercel/`, `.vercel-home/`, `.codex*/`,
`.git-backups/` sono ignorate da Git. `.codex-tmp/` conteneva uno **snapshot
duplicato dell'intero repository** ed e stata rimossa dal tracking (commit di
cleanup 2026-08-22).

## I moduli del Blocco D (2026-08-26)

| Percorso | Cosa c'e |
|----------|----------|
| `src/lib/payments/gateway/` | Il contratto provider-agnostico e l'adapter Stripe per gli **incassi** (Connect). Era `payments/cedipay/` ([ADR-0049](18-decision-log.md#adr-0049--cedipay-non-e-un-prodotto-della-v1-sotto-ce-stripe-e-si-chiama-stripe)) |
| `src/lib/payments/billing/` | Il flusso **abbonamenti** verso l'account centrale di Cedi Soft. Separato di proposito: la differenza tecnica e una sola intestazione, e in un modulo condiviso sarebbe un parametro dimenticabile |
| `src/lib/payments/commission.ts` | Quale condizione commerciale vale, e il congelamento sull'incasso. Puro |
| `src/lib/payments/connect-account.ts` | I sette stati dell'account di incasso e i sei ostacoli al checkout. Puro |
| `src/lib/payments/live-mode.ts` | La separazione **sandbox / produzione** su un evento di webhook. Puro: si prova con stringhe e booleani ([ADR-0060](18-decision-log.md#adr-0060--la-firma-dice-chi-ha-parlato-non-da-quale-mondo-sandbox-e-produzione-si-separano-sullevento)) |
| `src/lib/fiscal/` | Forme giuridiche, profilo fiscale, classificazione delle operazioni, motore fiscale. Tutto puro |
| `src/lib/fiscal/fatturapa/` | Stati, generatore del tracciato, interfaccia adapter. **Registro degli adapter vuoto** |
| `src/lib/documents/document-snapshot.ts` | La fotografia di un documento al momento dell'emissione, e l'elenco dei campi immutabili |
| `src/lib/server/platform-settings.ts` | Configurazioni di piattaforma e condizioni commerciali. **Unico proprietario** |
| `src/lib/server/connect-accounts.ts` | L'account di incasso di un club. Lo scrivono solo la console e gli eventi firmati |
| `src/lib/server/payment-environment.ts` | La sola parte di `live-mode.ts` che legge le variabili d'ambiente. Lo usano entrambi i flussi di ADR-0051 |
| `src/lib/server/platform-billing.ts` | Gli abbonamenti EasyGame. Non tocca mai `payment_transactions` |
| `src/lib/server/fiscal-config.ts` | Profilo, serie e tipi di operazione di un club |
| `src/lib/server/fiscal-documents.ts` | Emissione, annullamento e immutabilita dei documenti. **Usciti** da `payment-transactions.ts` |
| `src/lib/server/einvoice.ts` | Preparazione del tracciato. `transmitEInvoice` esiste per dire di no in un posto solo |
| `src/lib/navigation/external-link.ts` | Proprietario unico dell'apertura di un indirizzo esterno |
| `src/components/platform-admin/payments-billing-section.tsx` | La console «Pagamenti & Billing», quattro schede |
| `src/components/fiscal/FiscalProfilePanel.tsx` | Il profilo fiscale nella pagina Organizzazione |

---

## Lavoro sportivo e compensi

| File | Ruolo |
|------|-------|
| `src/lib/sport-work/rules/<anno>.ts` | Le regole dell'anno: soglie, aliquote, riduzione, causali F24, **con la fonte normativa accanto a ogni valore**. Dati, non logica |
| `src/lib/sport-work/rules/index.ts` | `rulesFor(anno)`: risolve l'anno della data di pagamento e **fallisce** se non e configurato |
| `src/lib/sport-work/engine.ts` | Il motore puro: imponibili, contributi, netto, costo club, **e la motivazione riga per riga** |
| `src/lib/sport-work/model.ts` | Il vocabolario: stati, tipi, transizioni, denaro, date. Nessuna dipendenza |
| `src/lib/sport-work/plan.ts` | Piano compensi e maturazione. La somma delle rate torna al pattuito |
| `src/lib/sport-work/position.ts` | Posizione annua e **scostamento**: quanto il conto cambierebbe se si rifacesse oggi |
| `src/lib/sport-work/obligations.ts` | Agenda degli adempimenti e dataset F24 / CU |
| `src/lib/sport-work/permissions.ts` | Cinque permessi, nessun ruolo nuovo |
| `src/lib/sport-work/legacy-migration.ts` | Classificazione dei dati legacy: cosa si importa e cosa no |
| `src/lib/server/sport-work.ts` | **Unico** punto di scrittura di persone, rapporti, piani, scadenze, dichiarazioni, posizioni |
| `src/lib/server/sport-work-ledger.ts` | **Unico** punto in cui esce denaro. Blocca prima la persona, poi la scadenza |
| `src/lib/server/sport-work-agenda.ts` | Premi, rimborsi, fatture, adempimenti, cruscotto, dataset |
| `src/lib/server/sport-work-scheduler.ts` | Il giro notturno. Idempotente per chiave, non per stato |
| `src/lib/server/sport-work-route.ts` | L'involucro delle rotte: sessione, club, permesso, diniego tracciato |
| `src/components/sport-work/` | Le schermate. Il dialogo di erogazione e la piu importante |
| `scripts/sport-work-uat.mjs` | Il collaudo a runtime: parla HTTP con l'applicazione vera |
| `scripts/sport-work-legacy-report.mjs` | Il rapporto sui dati legacy, in sola lettura |

