# 22 — Matrice Release Candidate (Web V1)

**Ultimo aggiornamento:** 2026-08-26 (Blocco D — Stripe Connect, billing di piattaforma, motore fiscale)

Questo documento risponde a **una domanda sola**: la Web V1 si puo dichiarare
Release Candidate, e cosa manca perche lo sia.

E complementare agli altri due documenti di stato e non li duplica:

| Documento | Domanda a cui risponde |
|-----------|------------------------|
| [20 — Work Package](20-work-packages.md) | «Cosa faccio adesso, in quali file, con quali criteri di accettazione» |
| [21 — Backlog master](21-backlog.md) | «Quella cosa che avevo chiesto, a che punto e» |
| **22 — questo** | «Si puo rilasciare? E se no, che cosa lo impedisce **davvero**» |

## Gli stati, e cosa NON significano

| Stato | Significato |
|-------|-------------|
| `DONE` | Implementato **e provato**. Dove il requisito chiede una verifica reale, quella verifica e stata fatta |
| `PARTIAL` | Funziona per la parte principale; cio che manca e scritto per esteso |
| `BLOCKED_EXTERNAL` | Il codice c'e; manca una credenziale, un account o un ambiente che non stanno in questo repository |
| `DEFERRED_POST_V1` | Fuori dalla V1 per decisione esplicita, con l'ADR che la contiene |
| `NOT_DONE` | Non fatto |

**`DONE` non si assegna a «codice scritto ma non provato».** Dove il requisito
originale chiedeva una prova — un pagamento vero, una pagina aperta a 375 px,
un bando reale — lo stato riflette la prova, non il codice.

---

## 1. Prestazioni e scala

| # | Requisito | Stato | Implementazione | Prova | Blocca RC? |
|---|-----------|-------|-----------------|-------|-----------|
| P-1 | 200+ atleti: la pagina non deve metterci trenta secondi | `DONE` | `view=summary` (WP-31), avatar serviti come immagine, allegati fuori dai record, e dal Blocco Finale C **paginazione consumata** dalla lista | `npm run measure:web`: 121 kB e 2 query costanti da 200 a 2.000 atleti | No |
| P-2 | Paginazione server-side vera, non `slice` nel browser | `DONE` | `?limit/page/q/order_by` + `category_id`, `site_id`. Due modi decisi dall'archivio: sotto una pagina niente cambia | `tests/server/athlete-list-pagination.test.mjs`, 7 test | No |
| P-3 | Dataset realistici 200 / 1.000 / 2.000 | `DONE` | `scripts/measure-web-v1-performance.mjs`: peso, righe, **query**, tempo, per cinque domini | Eseguito; numeri nel rapporto del blocco | No |
| P-4 | Niente N+1, niente O(n²) | `DONE` | Nessuna lista cresce di query. Due cicli annidati veri trovati e chiusi nei report (indice per allenamento, presenze per atleta) | `tests/lib/attendance-report-performance.test.mjs` misura il **rapporto** di crescita | No |
| P-5 | Liste non paginate su archivi grandi | `PARTIAL` | Rate (5 MB a 2.000 atleti) e presenze (30 MB) tornano intere: nessuna pagina le impagina. Il server sa gia farlo | Misurato, non nascosto | No — nessuna pagina le carica tutte insieme oggi |

## 2. Sicurezza, permessi ed entitlement

| # | Requisito | Stato | Implementazione | Prova | Blocca RC? |
|---|-----------|-------|-----------------|-------|-----------|
| S-1 | Isolamento multi-tenant | `DONE` | Ogni query club-scoped passa da `resources.ts` con `organization_id`; `ensureOrganizationAccess` sull'id proposto dal client | 29 test a runtime in `multi-tenant-isolation` | No |
| S-2 | Route guard e matrice permessi | `DONE` | `middleware.ts` + `AccessAreaGuard` + autorizzazione server nelle API | `route-guards`, `api-authorization`, `role-authorization` | No |
| S-3 | Il piano di un club esce dalle mani del club | `DONE` | [ADR-0048](18-decision-log.md#adr-0048--il-piano-di-una-societa-appartiene-alla-piattaforma-non-alla-societa): quattro chiavi di `clubs.settings` scrivibili solo da `platform_admin`, guardia **nella scrittura** | 22 test; un tentativo lascia audit `denied` | No |
| S-4 | Gating vero delle funzioni | `DONE` | `requireClubEntitlement` su tre scritture; `CapabilityGate` mostra il motivo invece di nascondere | Test sul diniego motivato e invariante che vieta `plan === "plus"` sparsi | No |
| S-5 | Validazione input con schema | `DONE` (scope dichiarato) | `src/lib/validation/` su auth, incassi, stagioni, piano, contributi. CRUD generico **escluso per scelta motivata** | 16 test | No |
| S-6 | Audit log | `DONE` | Auth, risorse economiche, stagioni, **tutti** i dinieghi, e dal Blocco C anagrafiche, incassi, storni, documenti, contributi, commerciale | `audit-log`, 17 test | No |
| S-7 | Rate limiting | `DONE` | `auth-rate-limit` su login, registrazione, OTP, moduli pubblici | `auth-security` | No |
| S-8 | Firma dei webhook | `DONE` | HMAC verificata, deduplica su `(provider, event_id)`, 503 senza segreto | 17 test | No |
| S-9 | Nessun segreto nei log e nelle risposte | `DONE` | `sanitizeMetadata`; nessun endpoint restituisce hash o token | Test dedicati | No |
| S-11 | Le condizioni commerciali escono dalle mani del club | `DONE` | [ADR-0050](18-decision-log.md#adr-0050--una-condizione-commerciale-ha-una-decorrenza-e-la-commissione-si-congela-sullincasso): la guardia lavora **campo per campo** dentro `paymentSettings`. Prima un club poteva azzerarsi la commissione e digitare l'account Stripe su cui far arrivare gli incassi delle famiglie — dai campi che la pagina mostrava | 12 test; un tentativo lascia audit `denied` con il percorso del campo | No |
| S-12 | Un evento del PSP non attraversa il confine fra due societa | `DONE` | L'account connesso vince sui metadati; un evento da un account sconosciuto viene **ignorato** invece di ripiegare sui metadati | `payment-gateway-refunds`, 3 test di isolamento | No |
| S-10 | Pulizia delle righe scadute | `DONE` | `POST /api/v1/maintenance`; il *trigger* e esterno per non legarsi all'hosting | 7 test | No — ma va **configurato** su ogni ambiente |

## 3. Denaro

| # | Requisito | Stato | Implementazione | Prova | Blocca RC? |
|---|-----------|-------|-----------------|-------|-----------|
| E-1 | Pagamento parziale, metodo, data, note | `DONE` | Payment V2 ([ADR-0036](18-decision-log.md)): una rata e un debito, un incasso e un movimento | Scenario 130 € end-to-end: 50 contanti, 30 carta, 50 bonifico, storno dei 30 | No |
| E-2 | Lo stato di una rata non si imposta | `DONE` | Si ricava dal registro; lo stato inviato dal client non ha effetto | `installment-ledger`, `payment-transactions` | No |
| E-3 | UX «Rata → Paga → importo → metodo → data → note» | `DONE` | Nessuna interfaccia legacy espone piu il vecchio flusso; la terza finestra mai montata e rimossa (D31) | `payment-registration-flow` + invariante sull'assenza del file | No |
| E-4 | Rate opzionali e pro-rata | `DONE` | `payment-plan-utils`, `athlete-enrollment-summary` | `payment-enrollment`, `payment-partial-regressions` | No |
| E-5 | Ricevuta ≠ fattura ≠ pagamento | `DONE` | [ADR-0047](18-decision-log.md): due registri, intestatario risolto dal tutore, emissione idempotente | `invoice-issuing`, `document-numbering` | No |
| E-6 | Numerazione per club e per esercizio | `DONE` | [ADR-0044](18-decision-log.md): vincolo composto, sequenza in transazione | `document-numbering` (server e modello) | No |
| E-7 | Documento stampabile con il marchio | `DONE` | `GET /api/v1/documents/:kind/:id`, HTML autonomo | `document-view`, 12 test | No |
| E-8 | Archiviazione del documento emesso | `PARTIAL` | Dal Blocco D il documento porta uno **snapshot** dei dati al momento dell'emissione: la ristampa non rilegge piu l'anagrafica di oggi, e una fattura non cambia perche l'atleta trasloca. **Manca** il file archiviato ([ADR-0052](18-decision-log.md#adr-0052--la-sigla-non-decide-il-trattamento-fiscale-il-profilo-si-dichiara-il-documento-si-propone)) | `fiscal-documents`, 3 test sullo snapshot | No per la V1; **si** il giorno in cui si emettono fatture vere |
| E-9 | Fatturazione elettronica (SdI) | `PARTIAL` | [ADR-0053](18-decision-log.md#adr-0053--easygame-prepara-il-tracciato-fatturapa-non-lo-trasmette-e-non-lo-dichiara-trasmesso): modello, nove stati, generazione e validazione del tracciato `FPR12` dallo snapshot, interfaccia adapter. **La trasmissione non e attiva**: il registro degli adapter e vuoto per costruzione e `canTransition` rifiuta ogni stato che presupponga un invio | `fatturapa`, 19 test — sei dei quali provano che «trasmessa» sia irraggiungibile | No, **a condizione** che nessuna schermata prometta l'invio (oggi lo nega esplicitamente) |
| E-12 | La commissione applicata non cambia col listino | `DONE` | Congelata sulla riga dell'incasso: lordo, fee, netto, percentuale e regola applicata. Cambiare l'1% in 1,5% non tocca i movimenti gia registrati | `commission` + `payment-gateway-refunds` | No |
| E-13 | Rimborsi e storni | `DONE` (su mock) | Un rimborso e un **movimento che conta**, distinto dallo storno: 130 incassati − 30 rimborsati = rata PARZIALE con residuo 30. La commissione restituita e proporzionale a quella trattenuta, non ricalcolata su oggi | 11 test, compreso il doppio evento sullo stesso rimborso | No |
| E-14 | Billing EasyGame separato dagli incassi dei club | `PARTIAL` | [ADR-0051](18-decision-log.md#adr-0051--due-flussi-stripe-due-account-due-segreti-il-denaro-delle-famiglie-non-e-il-fatturato-di-easygame): due account, due endpoint webhook, due segreti. Modello, adapter e webhook ci sono; **nessuna sottoscrizione reale** e mai stata creata | `platform-billing`, 14 test | No |
| E-15 | Profilo fiscale non-ASD | `DONE` | Dieci forme giuridiche, regimi speciali dichiarati, dati REA dove pertinenti. **La sigla non deduce il trattamento**: due ASD possono avere trattamenti diversi | `fiscal-profile`, 18 test su ASD, SSD, altri soggetti, solo CF, con P.IVA | No |
| E-16 | Un incasso non diventa una fattura | `DONE` | Il motore fiscale **propone** a partire da profilo + tipo di operazione + configurazione, e il predefinito e il piu conservativo. Da «non so cosa sia» non segue «non si puo fatturare» | `fiscal-engine`, 15 test | No |
| E-10 | Checkout online reale | `BLOCKED_EXTERNAL` | Dal Blocco D: onboarding Connect dalla console, importi **parziali**, stato «in verifica» finche il webhook non conferma, rimborsi, `account.updated`. **Nessun giro reale**: non ci sono credenziali Stripe in questo repository | Test su mock; il pulsante compare solo quando il server dice che si puo incassare | No, **a condizione** che l'interfaccia non offra un pulsante che non funziona (oggi lo dice) |
| E-11 | Le tre decisioni Connect | `PARTIAL` | La **percentuale** ha ora un posto dove essere scritta, con decorrenza e storico, e un valore di riserva dell'1%. Il **tipo di account** (`standard` o `express`) e configurabile in Platform Admin e va deciso *prima* del primo collegamento reale: e irreversibile per account gia creato. I **saldi negativi** restano una decisione aperta | [ADR-0051](18-decision-log.md#adr-0051--due-flussi-stripe-due-account-due-segreti-il-denaro-delle-famiglie-non-e-il-fatturato-di-easygame) | No |

## 4. Contributi e voucher

| # | Requisito | Stato | Implementazione | Prova | Blocca RC? |
|---|-----------|-------|-----------------|-------|-----------|
| V-1 | Assegnato / maturato / rendicontato / liquidato | `DONE` | [ADR-0037](18-decision-log.md): contabilita separata dai pagamenti della famiglia | `funding-model`, 31 test | No |
| V-2 | Soglia, pro-rata, plafond, periodo gia liquidato | `DONE` | Regole del bando come **configurazione**, non codice | Scenari sopra e sotto soglia, liquidazione parziale, ricalcolo | No |
| V-3 | Riconciliazione riga per riga | `DONE` | `GET /api/v1/funding/programs/:id/reconciliation`, anche CSV | `funding-reconciliation`, 12 test | No |
| V-4 | Primo bando reale caricato e riconciliato | `NOT_DONE` | Lo strumento c'e; **manca l'atto** su dati veri | — | No, ma e la prima cosa da fare in UAT |
| V-5 | Trasmissione telematica all'ente | `DEFERRED_POST_V1` | Il canale cambia da bando a bando e non si implementa a memoria | — | No |
| V-6 | Compensazione automatica sulla rata | `DEFERRED_POST_V1` | Scelta consapevole: farebbe risultare saldate rate che nessuno ha pagato | — | No |

## 5. Modulistica e moduli online

| # | Requisito | Stato | Implementazione | Prova | Blocca RC? |
|---|-----------|-------|-----------------|-------|-----------|
| M-1 | Builder, anteprima, pubblicazione, versioni | `DONE` | Forms V2, versioni immutabili | `forms-builder`, `forms-model` | No |
| M-2 | Pubblico e interno, atleta e tutore | `DONE` | `/api/forms/public`, soggetti collegati | `forms-service` | No |
| M-3 | Sede e categoria con opzioni dal server | `DONE` | [ADR-0043](18-decision-log.md): la stessa funzione riempie e valida | `forms-site-options` | No |
| M-4 | Allegati, duplicati, approvazione, rifiuto | `DONE` | Coda, controllo duplicati, scrittura in anagrafica all'approvazione | `forms-service`, audit `form.submission.*` | No |
| M-5 | Primo modulo pubblicato e primo ciclo reale | `NOT_DONE` | E l'unica superficie su Internet **senza autenticazione**: il primo giro va fatto con un modulo vero | — | **Si** — vedi blocker RC-2 |
| M-6 | Logica condizionale fra campi | `DEFERRED_POST_V1` | Aggiunge un modello di dipendenze, va disegnato a parte | — | No |
| M-7 | Pagamento contestuale alla compilazione | `DEFERRED_POST_V1` | Dipende dal checkout online | — | No |

## 6. Anagrafiche, multi-sede, abbigliamento

| # | Requisito | Stato | Prova | Blocca RC? |
|---|-----------|-------|-------|-----------|
| A-1 | Codice fiscale assistito su **ogni** anagrafica di persona | `DONE` | `italian-registry`, `anagrafiche-coverage` | No |
| A-2 | Comuni e codici catastali dall'archivio, non a mano | `DONE` | `comuni-archive` (ISTAT), `cap-archive` (IPA) | No |
| A-3 | Il comune porta il CAP dove ne ha uno solo | `DONE` | 7.836 comuni su 7.896; per i 52 con piu CAP il form lo dice | No |
| A-4 | Telefono internazionale ovunque | `DONE` | Componente condiviso, nove superfici, bandiera non salvata | No |
| A-5 | Capitalizzazione con le esclusioni giuste | `DONE` | Verificata sull'intero dataset ISTAT a ogni esecuzione | No |
| A-6 | Taglie per allenatori, staff e soci, **leggibili** | `DONE` | Erano di sola scrittura: riaperto e chiuso nel Blocco A | No |
| A-7 | Numero di tessera mai obbligatorio | `DONE` | Invariante su tutte le schermate di persona | No |
| A-8 | Categoria ≠ sede ≠ struttura ≠ gruppo | `DONE` | [ADR-0038](18-decision-log.md); `multisite-model`, `multisite-ux` | No |
| A-9 | Club mono-sede senza complicazioni | `DONE` | `SiteFilter` non si monta sotto due sedi attive | No |
| A-10 | Kit senza stagione, niente categorie compatibili su articoli | `DONE` | Tolte dal **modello**, non solo dal form (BA-19, BA-20) | No |
| A-11 | Taglia proposta dall'anagrafica, override che non la riscrive | `DONE` | `clothing-delivery` copre entrambe le direzioni | No |
| A-12 | Consegna per articolo con stato del kit derivato | `DONE` | Quattro stati per articolo, riepilogo mai scritto | No |
| A-13 | Gruppi di numerazione, filtro sede, nomi non duplicati | `DONE` | Quattro file di test | No |
| A-14 | Import atleti: CSV, XML, `;`, date italiane, mapping, duplicati | `DONE` | `athlete-import` | No |
| A-15 | Import massivo senza una richiesta per atleta | `DONE` | Dal Blocco Finale C l'import va a **scaglioni da 50**: due richieste per scaglione invece di due per atleta. Uno scaglione che fallisce ripiega riga per riga, cosi una sola anagrafica sbagliata non porta via le altre quarantanove. **Non e transazionale** e non lo era prima: un import interrotto lascia gli atleti gia creati | No |
| A-16 | Export atleti, allenatori, staff, soci | `DONE` | `person-export` sopra `people-pdf-export`: un motore, tre insiemi di colonne | No |
| A-17 | Primo club con due sedi vere | `NOT_DONE` | Modello e filtri coperti; «due sedi» diventa reale con una segreteria | No |

## 7. Interfaccia, responsivita, accessibilita

| # | Requisito | Stato | Prova | Blocca RC? |
|---|-----------|-------|-------|-----------|
| U-1 | Topbar club: niente logo EasyGame, logo club senza cornice, stagione grigia, azioni rapide, assistenza, niente chat | `DONE` | 30 invarianti in `brand-and-chrome` e `topbar-club-vs-platform` | No |
| U-2 | Console di piattaforma separata dal contesto club | `DONE` | Stesse invarianti | No |
| U-3 | Ordine alfabetico Cognome → Nome, cronologico dove ha senso | `DONE` | `sorting`; gli incassi in ordine cronologico anche se registrati a ritroso | No |
| U-4 | Autosave dove ha senso, conferma esplicita dove serve | `DONE` | `club-profile-autosave`, `coalescing-saver`; fiscali, bancari, pagamenti e stagioni restano a conferma | No |
| U-5 | Attese uniformi, niente spinner per pagina | `DONE` | `AppLoadingScreen`, `SaveStatus`, `GlobalLoadingProvider` | No |
| U-6 | Ogni pagina usabile a 375, 768, 1280 px | `DONE` | **Verifica su schermo** di 18 pagine, sette difetti trovati e corretti | No |
| U-7 | Console di piattaforma verificata su schermo | `NOT_DONE` | Il seed di sviluppo non ha un account amministratore | No — vedi «azioni richieste» |
| U-8 | Accessibilita minima: label, aria, focus, contrasto | `PARTIAL` | Le superfici nuove hanno `aria-label` sui comandi a sola icona e `aria-current` sui passi; **non** e stato fatto un audit sistematico con uno strumento | No |
| U-9 | Nessun font nuovo | `DONE` | Due invarianti: nessun `next/font` nuovo, nessun font fuori dai token | No |
| U-10 | Due sistemi di toast | `NOT_DONE` | Ne convivono due (R-06). Due comportamenti per lo stesso avviso | No |

## 8. File e archiviazione

| # | Requisito | Stato | Prova | Blocca RC? |
|---|-----------|-------|-------|-----------|
| F-1 | Nessun file nuovo dentro un record come data URL | `PARTIAL` | Invariante attiva su documenti, certificati, contratti. **Restano fuori** avatar e loghi (`AvatarUpload`/`LogoUpload`) e la tabella `assets` (logo club, moduli online) — B8-14 | No: gli avatar non viaggiano piu nelle liste, sono serviti come immagine |
| F-2 | Ogni «Visualizza» apre davvero | `DONE` | Quattro invarianti impediscono `window.open` su un data URL o un link diretto | No |
| F-3 | Nome di download leggibile per persona | `DONE` | `Tipo_Cognome_Nome_data.estensione`; l'estensione la mette il server | No |
| F-4 | Migrazione dei file legacy | `DONE` (strumento) | `scripts/migrate-legacy-attachments.mjs`: prova a vuoto predefinita, conteggi, dimensioni, errori, `--limit`, ripetibile. **Non eseguito** su nessun ambiente | No |
| F-5 | Provider di storage esterno | `NOT_DONE` | [ADR-0034](18-decision-log.md) elenca opzioni e raccomandazione. **E una decisione del proprietario del prodotto** | No — blocca la crescita, non il funzionamento |

## 9. Ambiente e rilascio

| # | Requisito | Stato | Prova | Blocca RC? |
|---|-----------|-------|-------|-----------|
| R-1 | Migrazioni versionate, nessun drift | `DONE` | 17 migrazioni; `prisma migrate status` verde su staging | No |
| R-2 | CI verde su ogni push | `DONE` | Tre job: web, mobile, guardrail. Il Blocco Finale C ha trovato il job **guardrail rosso dal commit di CediPay**: un test scriveva una chiave Stripe finta con il prefisso vero, e il guardrail non puo distinguere una chiave inventata da una vera. Corretto, e i quattro guardrail sono ora rifatti anche come test (`tests/ui/ci-guardrails.test.mjs`), cosi si scoprono in un secondo invece che dopo un push | No |
| R-3 | Deployment Preview funzionanti | `BLOCKED_EXTERNAL` | `DATABASE_URL` e `DIRECT_URL` sono su Production e non su Preview (D39) | No — ma e il rumore che fa smettere di guardare i deployment rossi |
| R-4 | Ambiente di produzione | `NOT_DONE` | Non esiste nello scope Vercel corrente | **Si** — vedi blocker RC-1 |
| R-5 | Error tracking e logging | `NOT_DONE` | Dipende da R-4 | No per la RC, si per il rilascio |
| R-6 | Backup e restore **provati** | `NOT_DONE` | Dipende da R-4 | **Si** — vedi blocker RC-3 |
| R-7 | UAT strutturato | `NOT_DONE` | Dipende da R-4 | No per la RC: la RC **e** cio che si manda in UAT |

---

## Lo stato di staging al 2026-08-26

| Voce | Valore |
|------|--------|
| Deployment | **READY** sul progetto `easygame-staging`, target `production` del progetto |
| Migrazioni | Nessuna nuova: il Blocco Finale C non tocca lo schema |
| Smoke test | Undici pagine e cinque API, verificate **nel contenuto** e non solo nello stato: un 200 che restituisce la pagina SSO di Vercel non e un 200 di EasyGame |
| Validazione | `POST /api/v1/auth/login` con un corpo malformato risponde **400** con `VALIDATION_ERROR` e la lista dei campi. Lo strato nuovo non e solo compilato: risponde |
| Manutenzione | `POST /api/v1/maintenance` senza token risponde **403**: la porta di servizio e chiusa finche `EASYGAME_MAINTENANCE_TOKEN` non e configurata |

Il dettaglio, comprese le due variabili da configurare, e in
[13 — Ambienti](13-environments.md).

---

## I blocker della Release Candidate

Sono tre. Non sono debiti tecnici: sono cose che impediscono un uso
professionale, o che rendono il rilascio irreversibile in caso di errore.

| # | Blocker | Perche blocca | Chi lo chiude |
|---|---------|---------------|---------------|
| **RC-1** | **Non esiste un ambiente di produzione** | «Rilasciato» non ha un significato operativo finche l'unico ambiente e staging. Non e un lavoro di codice | Proprietario del prodotto (F5-01, WP-26) |
| **RC-2** | **Nessun modulo pubblico e mai stato compilato da un estraneo** | E l'**unica** superficie di EasyGame esposta su Internet senza autenticazione. Rate limit, validazione e deduplica sono coperti da test, ma un modulo vero con un allegato vero non e mai passato di li | Una societa, un modulo, una compilazione (R-13) |
| **RC-3** | **Backup e restore non sono mai stati provati** | Un gestionale che tiene anagrafiche di minori e movimenti di denaro non si rilascia senza aver **ripristinato** almeno una volta. Non basta che il backup esista | Proprietario del prodotto (F5-03, WP-28) |

### Cosa **non** e un blocker, e perche

- **Stripe reale** (`BLOCKED_EXTERNAL`). L'interfaccia non promette un checkout
  che non funziona: dove manca una configurazione lo **dice**, con un messaggio
  diverso per ognuno dei quattro blocchi. Un rilascio con i pagamenti manuali e
  un rilascio onesto.
- **SdI**. `is_electronic` e `false` **per costruzione**, e dal Blocco D
  l'interfaccia parla di fatturazione elettronica per **negarla**: la sezione
  Fiscalita della console di piattaforma dice che l'invio non e configurato ed
  elenca cosa EasyGame fa davvero. Il tracciato si genera e si scarica; e cio
  che una societa fa gia oggi consegnandolo al commercialista, solo piu
  rapido.
- **Provider di storage esterno**. I file stanno nel database di Neon: cresce,
  ma funziona. Blocca la crescita, non il rilascio.
- **I due sistemi di toast**, i 19 componenti `ui/*` non usati, le pagine
  monolitiche. Sono debiti veri e restano scritti in [16](16-technical-debt.md);
  nessuno di essi impedisce a una segreteria di lavorare.
- **Deployment Preview rossi**. Fastidiosi, non bloccanti: il deploy da riga di
  comando funziona.

---

## Post-V1

Nell'ordine in cui conviene affrontarli, non in ordine di dimensione.

| # | Voce | Perche dopo |
|---|------|-------------|
| 1 | Provider di storage esterno | Serve prima che i file diventino un problema, non dopo. Decisione di prodotto |
| 2 | Archiviazione dei documenti fiscali emessi (D38) | Diventa necessario appena si emettono fatture vere |
| 3 | Primo giro reale su Stripe | Serve un account in test mode, la scelta del tipo di account Connect (irreversibile) e un collaudo: checkout, webhook, rimborso |
| 3-bis | Intermediario per la fattura elettronica | Decisione contrattuale di Cedi Soft. Il confine e gia disegnato: un file, una riga nel registro, la configurazione |
| 4 | Promemoria certificati a orario | Il posto dove agganciarlo c'e; mancano destinatari, frequenza e disiscrizione |
| 5 | Unificare i due sistemi di toast | Debito visibile all'utente: due comportamenti per lo stesso avviso |
| 6 | Scomporre le pagine monolitiche | `athletes/[id]` 8.480 righe, `clothing`, `registration-management` |
| 7 | Import atleti transazionale | A scaglioni lo e gia; manca la transazione unica, e un import interrotto lascia gli atleti gia creati |
| 8 | Ricondurre `assets` al servizio allegati | Logo club e moduli online usano ancora la via legacy |
| 9 | Logica condizionale nei moduli | Aggiunge un modello di dipendenze |
| 10 | Mobile | `DEFERRED` per [ADR-0025](18-decision-log.md) finche la Web V1 non e rilasciata |

---

## Verdetto

**GO condizionato per la Release Candidate.**

Il software non ha blocchi propri: i gate sono verdi, l'isolamento
multi-tenant e provato a runtime, i pagamenti manuali reggono lo scenario
completo compreso lo storno, i moduli funzionano, le anagrafiche sono
complete, e la responsivita e stata verificata **su schermo** e non per
somiglianza.

I tre blocker sono tutti **fuori dal codice**: un ambiente da creare, una
compilazione vera da ricevere, un ripristino da provare. Finche non sono
chiusi, quello che c'e e una Release Candidate **da mandare in UAT**, non una
versione da mettere davanti a societa paganti.
