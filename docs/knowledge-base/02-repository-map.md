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
| `src/app/` | Route App Router in due gruppi: `(app)/` il gestionale, `(site)/` il sito pubblico dei club (ADR-0200); `api/` fuori dai gruppi. I gruppi non cambiano gli URL | Vedi [04](04-web-architecture.md) |
| `src/app/api/v1/` | API versionata: auth, admin, registry, risorse generiche | Superficie usata anche dal mobile |
| `src/app/api/` (fuori `v1`) | Endpoint di dominio non versionati: parent-dashboard, payments, athletes/documents, clothing, forms/assets, medical-certificate-reminders, **public/forms** | Incoerenza nota, vedi [09](09-api-conventions.md). `public/forms` sta fuori da `v1` di proposito: non e la superficie ufficiale, e l'unico endpoint senza sessione |
| `src/components/web/` | **Il sistema Web V2** (EGDS v3.1.0, ADR-0184): `shell/` (barra laterale, topbar, navigazione, cassetti globali), `primitives/`, `overlays/`, `forms/`, `datagrid/` (l'unica griglia), `page/` (intestazione, card, avvisi, barra azioni), `record/` (scheda), `hooks/` (`usePreference`, `useRouteClubId`) | Le regole in [10](10-ui-ux-conventions.md) §Web V2; i test in `tests/web/` |
| `src/lib/web/` | Puro: formattazione italiana, mappa degli stati, preferenze `egw.*`, accordo dei nomi (`nouns.ts`), esportazione CSV di una griglia (`export-grid-csv.ts`) | |
| `src/styles/` | Token `--egw-*` (copia di `design-source/tokens/web.css`) e base del Web V2 | |
| `src/components/<dominio>/v2/` | Composizioni V2 di una pagina migrata (`athletes/v2`, `athletes/profile/v2`, `trainer/v2`, `staff/v2`, `dashboard/v2`, `training/v2`, `categories/v2`, `medical/v2`, `accounting/v2`, `reports/v2`, `procura/v2`) | Candidati alle fondamenta in D-RD-2 |
| `src/components/ui/` | 58 file. Primitive shadcn/ui + componenti custom (chat, avatar-upload, toast) | 18 primitive non referenziate, vedi [cleanup-report](cleanup-report.md); il toast ha l'aspetto V2 |
| `src/components/trainer/` | 28 file. Dashboard allenatore | Convivono v1 (`trainer-*-page`) e v2 (`trainer-*-dashboard-page`); solo v2 e in uso |
| `src/lib/entitlements/` | Chi puo usare cosa ([ADR-0046](18-decision-log.md#adr-0046--chi-puo-usare-cosa-si-calcola-in-un-posto-solo-e-la-risposta-dice-sempre-perche)): catalogo chiuso delle funzioni e risoluzione su piano, servizi attivi ed eccezioni | Modulo puro. Chi lo usa conosce il nome della funzione, non i piani |
| `src/lib/payments/cedipay/` | Il contratto provider-agnostico dei pagamenti online e gli adapter ([ADR-0045](18-decision-log.md#adr-0045--cedipay-e-il-livello-di-prodotto-il-psp-sta-sotto-e-si-sostituisce)). `contract.ts` non conosce nessun PSP; `providers/stripe.ts` e il primo adapter; `providers/stripe-signature.ts` verifica la firma dei webhook | Il nome di un PSP non deve comparire fuori da `providers/` |
| `src/lib/forms/` | Modello puro dei moduli: tipi di campo, catalogo dei dati EasyGame, validazione, precompilazione, proposta di modifica, **opzioni che il modulo non possiede** (`field-options.ts`: sedi e categorie del club) | Nessun import da `lib/server`: si prova senza database |
| `src/lib/guardians/` | Le **regole** del dominio genitori e tutori ([ADR-0153](18-decision-log.md#adr-0153--le-regole-di-un-dominio-stanno-in-una-primitiva-non-in-ogni-consumatore)): `exclusion` (il predicato, un OR), `identity` (le grafie), `projection` (da righe a voci), `documents` (chi un documento nuovo puo nominare), `notifications` (chi riceve un avviso) | Puro. **Nessuna primitiva ha parametri che ne cambino la semantica.** Chi tocca il dominio va classificato in `scripts/pp-02-censimento.mjs` prima di essere scritto |
| `src/components/forms/` | 25 file. Builder e modulo pubblico della Modulistica V2 (`form-builder`, `form-renderer`, `forms-dashboard`, `public-form-page`, `submission-review-dialog`, `compile-form-dialog`), editor documenti, form di dominio | |
| `src/components/dashboard/` | 15 file. Sidebar, Header, widget dashboard club | |
| `src/components/providers/` | `AuthProvider`, `ThemeProvider`, `GlobalLoadingProvider`, `AppClientProviders` | Montati in `src/app/(app)/layout.tsx` (mai nel sito pubblico) |
| `src/components/auth/` | `auth-shell.tsx` (login+registrazione), `access-area-guard.tsx` | |
| `src/components/account/` | Home account e le sue dialog (crea club, profilo, riscatta accesso) | Ridisegnata nel Blocco 4 |
| `src/components/brand/` | Marchio SVG e identita di club | |
| `src/components/platform-admin/` | Shell della console di piattaforma | Nessun riferimento alle risorse di club |
| `src/components/organization/v2/` | La scheda Club al Web V2: sezioni del profilo, federazioni, stagioni (`season-manager.tsx`), firma, profilo fiscale, causali, `capability-gate.tsx` | Blocco 6, vedi [10](10-ui-ux-conventions.md) |
| `src/components/settings/v2/` | Impostazioni (notifiche, sistema, sicurezza) | |
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
| `club-sites.ts` | 1196 | **Sedi, strutture e gruppi operativi** ([ADR-0038](18-decision-log.md)). Il gruppo e la coppia (categoria, sede): la categoria non si duplica mai. `getSiteName` non restituisce mai un riferimento sconosciuto; `describeCategoryGroupOptions` e l'unica regola per l'etichetta di un gruppo fra le opzioni ([ADR-0185](18-decision-log.md)). Puro. |
| `categories/identity.ts` | 478 | **Chi e una categoria** ([ADR-0155](18-decision-log.md)): risoluzione e confronto per identificativo; un nome che ne nomina due non ne nomina nessuna; l'ambiguita si conta su identificativi distinti e gli `aliases` (nomi stantii) rispondono come nomi ([ADR-0185](18-decision-log.md)). Puro. |
| `categories/display.ts` | 337 | **Come si scrive una categoria**: un indice per schermata, la sede accanto solo dove il nome ne nomina due, per nome e mai per `siteId` (`UNKNOWN_SITE_LABEL` se non si sa leggere). Unico per Web corrente e V2 ([ADR-0185](18-decision-log.md)). Puro. |
| `athlete-category-memberships.ts` | 910 | **Le appartenenze di un atleta come identita**: righe, proiezioni e colonna storica riconciliate; `storedCategoryName` conserva il nome com'era scritto; `collectDanglingAthleteCategoryReferences` espone cio che non e diventato appartenenza ([ADR-0185](18-decision-log.md)). Puro. |
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
| `scripts/censimento-appartenenze-legacy.mjs` | Censimento in sola lettura delle righe di `athlete_category_memberships` con l'etichetta al posto dell'identificativo (ADR-0185, D-RD-16). |
| `src/lib/server/category-write-guard.ts` | Il vaglio del server su cio che si scrive come categoria (ADR-0186): il registro generico risolve il riferimento sul catalogo e scrive l'identificativo, o rifiuta. |
| `src/lib/server/trial-athletes.ts` | **L'unico scrittore** di `trial_athletes` e `trial_attendances` (ADR-0188): ricerca degli omonimi, registrazione, presenze per evento, storia derivata, conversione in atleta che crea o collega senza duplicare. Perimetro dell'allenatore e recapiti applicati qui. |
| `src/lib/trials/client.ts` | Il trasporto client delle quattro rotte delle persone in prova (passa da `api/client.ts`). |
| `src/components/trials/v2/` | Elenco, scheda, cassetto di registrazione e cassetto di conversione delle persone in prova (`TrialAthletesPanel`, `TrialProfile`, `TrialFormDrawer`, `TrialConvertDrawer`, `use-trial-catalog`). |
| `src/components/training/v2/TrialAttendanceSection.tsx` | La sezione «Atleta in prova» del registro presenze: cerca → scegli o crea → segna; salva prima del registro degli atleti. |
| `src/components/web/shell/AreaShell.tsx`, `area-navigation.ts` | Il guscio unico delle aree famiglia, allenatore e atleta sulla `Sidebar`/`Topbar` del club; le voci di ogni area in un file solo (ADR-0187). |
| `src/components/web/shell/OutsideShell.tsx` | Il guscio dell'ambiente 3 («fuori dal club»): accesso, recupero, conferma, invito, onboarding, moduli pubblici, pagamento con link; il solo «powered by CediSoft» (ADR-0187). |
| `scripts/bonifica-appartenenze-fasi.mjs` + `scripts/lib/bonifica-fasi.mjs` + `scripts/lib/bonifica-guardie.mjs` | Le fasi B (proiezioni `athletes.data`) e C (nomi stantii) di D-RD-16, con le guardie comuni a tutte le bonifiche (un solo elenco di branch ammessi). |
| `scripts/bonifica-appartenenze-legacy.mjs` + `scripts/lib/bonifica-appartenenze.mjs` | La bonifica D-RD-16: dry-run per default, scrittura solo con tutte le guardie del piano (`docs/redesign/D-RD-16-piano-bonifica-appartenenze.md`) e su un branch solo; le regole R1/R2/R3/R0 sono pure e provate su fixture (`tests/scripts/`). |
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
| `src/components/organization/v2/fiscal-profile-panel.tsx` | Il profilo fiscale nella pagina Club |

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



---

## EasyGame Website e sport core (ADR-0200, 2026-10-05)

| Percorso | Cosa c'e |
|----------|----------|
| `src/lib/website/` | **Dominio puro del sito** (client-safe, nessun import da `lib/server`): `document/` (tipi SITE → PAGE → SECTION → BLOCK, operazioni dell'editor, cronologia, validazione), `registry/` (**l'unico** registry dei blocchi: `blocks/content.ts`, `sports.ts`, `club.ts`, 59 definizioni), `datasources/` (contratti zod e richieste deduplicabili), `people/policy.ts` (`applyPublicationPolicy`, l'unica funzione che decide chi compare), `domains/model.ts` (hostname, record DNS, stati), `publishing/snapshot.ts` (lo snapshot pubblicato e l'instradamento delle pagine), `templates/`, `theme/` (palette, caratteri, tema), `navigation.ts`, `slug.ts`, `links.ts`, `embed.ts`, `seo.ts`, `site-config.ts`, `permissions.ts`, `access-state.ts`, `editor-protocol.ts` (messaggi editor ↔ anteprima), `public-dto.ts`, `client.ts` e `public-client.ts` (trasporto dal browser) |
| `src/lib/server/website/` | **Server del sito**: `access.ts` (`requireWebsiteAccess`, il cancello unico; `WebsiteConflictError`), `route.ts` (`websiteRoute`, il guscio delle rotte), `sites.ts`, `pages.ts`, `publishing.ts`, `domains.ts` + `domain-providers/` (`mock`, `vercel`, `cloudflare`), `media.ts`, `people.ts`, `articles.ts`, `inquiries.ts`, `sponsors-showcase.ts`, `public-site.ts` (host → sito → revisione → pagina), `page-data.ts` (risolutore dei datasource) + `public-data/`, `cache.ts` (tag e invalidazione), `preview.ts`, `document-sanitize.ts`, `audit-actions.ts` |
| `src/lib/server/storage/s3-driver.ts` | Driver allegati S3/R2/MinIO con firma SigV4; si registra da `src/lib/server/attachments.ts` |
| `src/lib/server/club-teams.ts`, `src/lib/server/competitions.ts` | Unici scrittori di `club_teams`, `competitions`, `opponents` |
| `src/lib/sports/` | Puro: `adapters.ts` (sport, periodi, statistiche, risultato dai parziali), `teams.ts` (collegamenti per stagione, storico degli slug), `client.ts` |
| `src/components/website/render/` | Il renderer pubblico: `SiteDocument`, intestazione, piede, sezioni, `blocks/` (una mappa tipizzata contro il registry), `islands/` (le isole client: menu mobile, carosello, lightbox, conto alla rovescia, modulo contatti, modulo incorporato, `ConsentFrame`), `fonts.ts` (l'unico punto che carica caratteri). Non importa ne il gestionale ne l'editor |
| `src/components/website/admin/` | Le schermate dell'area `/website` (panoramica e creazione guidata, media, news, persone, sponsor, messaggi, domini, versioni, impostazioni, cassetti di pubblicazione) |
| `src/components/website/editor/` | L'editor visuale (`WebsiteEditor`, `useWebsiteEditor`, pannelli, inspector, `PreviewFrame`, `ConflictDialog`) |
| `src/components/website/preview/` | `EditorProbe`: collega l'iframe dell'anteprima ai pannelli dell'editor |
| `src/components/sports/`, `src/components/matches/v2/MatchResultDrawer.tsx` | Squadre stabili, competizioni e avversari; il cassetto del risultato di una gara |
| `src/app/(app)/website/` | L'area del gestionale: `/website`, `/website/editor`, `media`, `news`, `news/[id]`, `persone`, `sponsor`, `messaggi`, `domini`, `versioni`, `impostazioni` |
| `src/app/(app)/categories/squadre/`, `src/app/(app)/matches/competizioni/` | Le schermate dello sport core |
| `src/app/(site)/site-render/[host]/` | Il renderer pubblico (raggiunto solo per rewrite dal middleware): `[[...path]]/page.tsx`, `robots.txt/`, `sitemap.xml/`, `not-found.tsx` |
| `src/app/(site)/website-preview/[siteId]/` | L'anteprima privata della bozza |
| `src/app/api/v1/website/`, `src/app/api/public/website/` | Rotte del gestionale e rotte pubbliche del sito (elenco in `docs/api-registry.md`) |
| `src/styles/website/site.css`, `tailwind.website.config.ts` | Il CSS del sito, separato da quello del gestionale |
