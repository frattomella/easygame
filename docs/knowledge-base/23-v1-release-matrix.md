# 23 — Matrice definitiva Web V1

**Ultimo aggiornamento:** 2026-08-26 (Blocco E — Final Release Candidate, UAT e hard check)

Questo documento risponde a **una domanda sola**, requisito per requisito:
*questa cosa e fatta, e come lo sappiamo?*

Non duplica gli altri tre documenti di stato, li chiude:

| Documento | Domanda | Rapporto con questo |
|-----------|---------|---------------------|
| [20 — Work Package](20-work-packages.md) | «cosa faccio adesso» | resta il piano di lavoro |
| [21 — Backlog master](21-backlog.md) | «quella cosa che avevo chiesto, a che punto e» | resta l'ordine cronologico delle richieste |
| [22 — Matrice RC](22-release-candidate.md) | «si puo rilasciare, e cosa lo impedisce» | **superata da questa**: la 22 racconta il percorso fino al Blocco D2, questa lo stato finale |
| **23 — questa** | «ogni requisito V1 e chiuso, e con quale prova» | il verdetto |

## Gli stati, e perche sono solo tre

Il Blocco E ha imposto una regola: per un requisito della V1 **non esistono
piu** `PARTIAL` e `NOT_DONE`. Una cosa e fatta, oppure e ferma per qualcosa
che non sta in questo repository, oppure e stata messa fuori dalla V1 con una
decisione scritta. «Mezzo fatto» non e uno stato: e un modo di rimandare la
domanda.

| Stato | Significato | Cosa serve per assegnarlo |
|-------|-------------|---------------------------|
| `DONE` | Implementato **e provato** | Una prova nominata: un test, una misura, un'operazione eseguita davvero |
| `BLOCKED_EXTERNAL` | Il codice c'e; manca una credenziale, un account, un ambiente o un atto che non stanno qui | Il confine deve essere disegnato, e cio che serve deve essere scritto per esteso |
| `DEFERRED_POST_V1` | Fuori dalla V1 per decisione esplicita | La decisione, e perche non impedisce a una segreteria di lavorare |

La colonna **Prova** e la parte che conta. «Il codice c'e» non e una prova:
dove il requisito chiedeva un fatto — un file caricato davvero, un modulo
compilato da fuori, un ripristino eseguito — lo stato riflette il fatto.

---

## 0. Quello che il Blocco E ha trovato

Sei difetti veri, nessuno dei quali visibile dai gate. Sono elencati qui in
testa perche sono la ragione per cui questo documento esiste: una matrice che
si limita a rileggere la precedente non serve a niente.

| # | Difetto | Come si e visto | Stato |
|---|---------|-----------------|-------|
| BE-1 | **Nessun allegato poteva essere salvato.** `@prisma/adapter-pg` 7 era installato con `@prisma/client` 6: tutto funzionava tranne le colonne `Bytes`, e `attachmentBlob.upsert` rispondeva `JS functions cannot be represented as a serde_json::Value`. Documenti dell'atleta, contratti, visite mediche, BLSD, allegati dei moduli pubblici: nessuno | Caricando un file davvero. I test del servizio allegati usano un doppio del client e non toccano il driver | **Corretto** |
| BE-2 | **Lo stato di una rata si poteva scrivere dal client.** `PATCH /api/v1/payments/:id {"status":"paid"}` marcava saldata una rata senza un euro incassato, e `PATCH /api/athlete-payments/:id` accettava `status` fra le modifiche. Il record si contraddiceva: `status: paid` accanto a `ledger: {state: partial, residuo 30}` | Provando a imporre lo stato dopo lo scenario dei 130 € | **Corretto** |
| BE-3 | **Una schermata prometteva la fattura elettronica.** Movimenti aveva un pulsante «Emetti fattura elettronica» che apriva un modulo con il numero digitato a mano e la casella «Fattura Elettronica» **spuntata di suo**, e scriveva la riga in `invoices` dal browser: fuori dalla numerazione (ADR-0044), senza snapshot (ADR-0052), con `is_electronic: true` (contro ADR-0053) | Leggendo il codice della pagina Movimenti alla ricerca del gemello del difetto gia chiuso sulle ricevute | **Corretto** |
| BE-4 | **Cinque schede della scheda atleta erano senza nome sotto 640 px**, fra cui «Iscrizione». L'etichetta stava in uno `span` nascosto: `display: none` la toglie anche dal nome accessibile | Aprendo la scheda a 375 px | **Corretto** |
| BE-5 | **Duecento comandi senza nome nell'elenco atleti** (uno per riga), **tre** nell'elenco categorie e **sei matite identiche** senza etichetta sulla scheda atleta | Contando i controlli senza nome accessibile a schermo | **Corretto** |
| BE-6 | **Il seed di sviluppo non arrivava in fondo**: cercava una fattura per `invoice_number` da solo, mentre il vincolo unico e composto per club ed esercizio dal Blocco D | Eseguendolo | **Corretto** |

Piu due difetti di qualita degli strumenti, non del prodotto:

- il test `attendance-report-performance` falliva **una volta su cinque**: cronometrava due scenari di frazioni di millisecondo, e il giro di riscaldamento scaldava solo quello piccolo — l'indice delle presenze vive in una `WeakMap` legata all'array. Ora conta le **letture** su ogni riga di presenza invece dei millisecondi: e deterministico, e su codice mutato apposta segnala 123 letture per riga contro un massimo di 8;
- un `500` sul modulo pubblico — l'unica rotta che accetta scritture da chi non ha una sessione — non lasciava traccia **da nessuna parte**: ne nella risposta, giustamente, ne nei log. Ora il motivo si scrive nei log e il messaggio al pubblico resta generico.

---

## 1. Prestazioni e scala

| ID | Requisito | Stato | Prova |
|----|-----------|-------|-------|
| P-1 | 200+ atleti senza attese | `DONE` | Misurato nel Blocco E su **223 atleti reali** in archivio: elenco paginato 14,9 kB e 35 ms; elenco intero 131,8 kB e 45 ms |
| P-2 | Paginazione server vera | `DONE` | `?limit/page/q/order_by/category_id/site_id`. Pagina 9 di 25 restituisce le ultime 23 righe con `total: 223`. `tests/server/athlete-list-pagination.test.mjs` |
| P-3 | Dataset realistici | `DONE` | `npm run measure:web` su 200/1.000/2.000; e nel Blocco E 220 atleti creati **attraverso l'API** in 3,0 s |
| P-4 | Niente N+1, niente O(n²) | `DONE` | `tests/lib/attendance-report-performance.test.mjs`, ora deterministico: misura le letture per riga, non i millisecondi |
| P-5 | Elenchi non paginati su archivi grandi | `DEFERRED_POST_V1` | Rate e presenze tornano intere; **nessuna pagina le carica tutte** oggi, e il server sa gia impaginare. Misurato, non nascosto |
| P-6 | Import massivo senza una richiesta per atleta | `DONE` | 220 atleti in **10 richieste HTTP** (due per scaglione da 50), 0,045 richieste per atleta |
| P-7 | Il tetto di pagina non tronca in silenzio | `DONE` | `limit=500` restituisce 200 righe **e dichiara** `total: 223, limit: 200, hasMore: true` |

## 2. Sicurezza, permessi ed entitlement

| ID | Requisito | Stato | Prova |
|----|-----------|-------|-------|
| S-1 | Isolamento multi-tenant | `DONE` | 29 test a runtime **piu** una prova IDOR fra due organizzazioni vere nel Blocco E: 11 tentativi su 11 respinti (lettura, elenco, `organization_id` proposto dal client, modifica, cancellazione, lettura incassi, registrazione di un incasso, modifica del club, console di piattaforma, e due chiamate senza sessione) |
| S-2 | Route guard e matrice permessi | `DONE` | `route-guards`, `api-authorization`, `role-authorization` |
| S-3 | Il piano appartiene alla piattaforma | `DONE` | ADR-0048, 22 test; un tentativo lascia audit `denied` |
| S-4 | Gating vero delle funzioni | `DONE` | `requireClubEntitlement` su tre scritture, `CapabilityGate` mostra il motivo |
| S-5 | Validazione con schema | `DONE` | 16 test; scope dichiarato |
| S-6 | Audit log | `DONE` | 17 test; nel Blocco E si aggiunge il diniego su `payment_state` |
| S-7 | Rate limiting | `DONE` | Provato a runtime sul modulo pubblico: il 429 arriva al nono invio, come dice la politica (dieci all'ora per indirizzo) |
| S-8 | Firma dei webhook | `DONE` | 17 test |
| S-9 | Nessun segreto nei log e nelle risposte | `DONE` | `sanitizeMetadata`; la risposta pubblica di un modulo non contiene nessun dato riservato del club |
| S-10 | Pulizia delle righe scadute | `DONE` | `POST /api/v1/maintenance`, 7 test. Il *trigger* va configurato per ambiente |
| S-11 | Condizioni commerciali fuori dalle mani del club | `DONE` | ADR-0050, 12 test |
| S-12 | Un evento del PSP non attraversa due societa | `DONE` | 3 test di isolamento |
| S-13 | **Lo stato di una rata non si scrive dal client** | `DONE` | Corretto nel Blocco E (BE-2). `tests/server/payment-state-ownership.test.mjs`, 8 test; provato anche a runtime |
| S-14 | Permessi sugli allegati | `DONE` | Stesso file: 200 per il club proprietario, 401 senza sessione, 403 da un altro club. Intestazioni `Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff` |
| S-15 | **Nessuna vulnerabilita critica nelle dipendenze** | `DONE` | `npm audit` diceva **1 critica e 14 alte**. La critica era [GHSA-f82v-jwr5-mffw](https://github.com/advisories/GHSA-f82v-jwr5-mffw), **aggiramento dell'autorizzazione nel middleware di Next.js**, su un prodotto che il middleware lo usa per le route guard. Next passa da 14.2.23 a **14.2.35**, ultima della stessa minor: zero critiche |

## 3. Denaro

| ID | Requisito | Stato | Prova |
|----|-----------|-------|-------|
| E-1 | Pagamento parziale, metodo, data, note | `DONE` | Scenario 130 € eseguito **a runtime** nel Blocco E: 50 contanti → `partially_paid` residuo 80; +30 carta → residuo 50; +50 bonifico → `paid`; storno dei 30 → `partially_paid` residuo 30 |
| E-2 | Lo stato di una rata non si imposta | `DONE` | Vedi S-13. Era il difetto BE-2 |
| E-3 | Nessuna interfaccia legacy | `DONE` | La pagina Movimenti non offre piu il vecchio modulo fattura (BE-3); invarianti in `document-numbering-ownership` |
| E-4 | Rate opzionali e pro-rata | `DONE` | `payment-enrollment`, `payment-partial-regressions` |
| E-5 | Ricevuta ≠ fattura ≠ pagamento | `DONE` | ADR-0047; e a runtime nel Blocco E su un incasso vero: ricevuta `R-2026-0002` emessa, riemissione **idempotente** (stesso numero), documento stampabile in HTML |
| E-6 | Numerazione per club e per esercizio | `DONE` | ADR-0044. Dal Blocco E **nessuna schermata** puo comporre o digitare un numero: due invarianti nuove |
| E-7 | Documento stampabile con il marchio | `DONE` | `document-view`, 12 test |
| E-8 | Archiviazione del file emesso | `DEFERRED_POST_V1` | Lo **snapshot** dei dati c'e (ADR-0052): una ristampa non rilegge l'anagrafica di oggi. Il file archiviato serve quando si emettono fatture vere, non prima |
| E-9 | Fatturazione elettronica (SdI) | `BLOCKED_EXTERNAL` | ADR-0053: tracciato `FPR12` generato e validato, nove stati, registro degli adapter **vuoto per costruzione**, sei test provano che «trasmessa» sia irraggiungibile. Manca un intermediario accreditato. **La condizione «nessuna schermata promette l'invio» ora e vera**: non lo era, ed e il difetto BE-3 |
| E-10 | Checkout online reale | `DONE` | **Collaudato contro Stripe**, non piu su mock: Sandbox Cedi Soft, 2026-08-27. Connected account dal percorso EasyGame, onboarding, 50 € + 80 € su 130 €, fee 1% e override 0,75%, webhook e idempotenza, rimborso parziale (fee proporzionale) e totale, pagamento rifiutato, isolamento multi-tenant. Quattro difetti di contabilita trovati e corretti: doppio accredito da due eventi (ADR-0062), sessione riusata sul secondo acconto (ADR-0063), commissione del PSP mai recuperata, doppio storno da identificativo di rimborso inventato |
| E-11 | Le tre decisioni Connect | `DONE` | Percentuale: 1% di riserva, override 0,75% con decorrenza, **non retroattivo**. Tipo di account: `dashboard: "full"` (equivalente Standard). Saldi negativi: `losses_collector: "stripe"`, con `fees_collector: "stripe"`. Le responsabilita **si congelano alla creazione** e non si correggono dopo (ADR-0061) |
| E-12 | La commissione non cambia col listino | `DONE` | Congelata sull'incasso; `commission`, `payment-gateway-refunds` |
| E-13 | Rimborsi e storni | `PARTIAL` | Il rimborso **registrato dal webhook** e `DONE` e provato contro Stripe (collaudo del 2026-08-27, rimborso avviato dal cruscotto del provider). Il rimborso **avviato da EasyGame** e implementato e non ancora collaudato a runtime: cita un incasso e non una rata (una rata pagata con 50 + 80 ha due residui rimborsabili distinti), la risposta HTTP non e il registro, e finche il webhook non conferma la riga dice «in elaborazione». Permessi: proprietario e gestore. 79 test con trasporto sostituito, compreso il doppio evento sullo stesso rimborso e la doppia richiesta sullo stesso incasso ([ADR-0065](18-decision-log.md#adr-0065--il-rimborso-si-avvia-da-easygame-a-scriverlo-nel-registro-resta-levento-firmato)). **Manca il giro reale**: e la stessa classe di prova che a questo blocco ha lasciato passare quattro difetti di contabilita |
| E-14 | Billing EasyGame separato dagli incassi dei club | `BLOCKED_EXTERNAL` | Due account, due endpoint, due segreti; 14 test. Manca una sottoscrizione reale |
| E-15 | Profilo fiscale non-ASD | `DONE` | 18 test su ASD, SSD, altri soggetti, solo CF, con P.IVA |
| E-16 | Un incasso non diventa una fattura | `DONE` | 15 test; il motore **propone**, il predefinito e il piu conservativo. A runtime, su un intestatario senza dati fiscali, rifiuta la fattura **elencando cosa manca** e suggerisce la ricevuta: «mancano codice fiscale o partita IVA, indirizzo, comune, CAP» |

## 4. Contributi e voucher

| ID | Requisito | Stato | Prova |
|----|-----------|-------|-------|
| V-1 | Assegnato / maturato / rendicontato / liquidato | `DONE` | 31 test, e a runtime nel Blocco E i cinque importi tornano distinti sull'iscrizione |
| V-2 | Soglia, pro-rata, plafond, periodo liquidato | `DONE` | Regole come configurazione |
| V-3 | Riconciliazione riga per riga | `DONE` | 12 test; provata a runtime, anche in CSV |
| V-4 | Primo bando reale caricato e riconciliato | `BLOCKED_EXTERNAL` | Lo strumento e provato end-to-end su dati sintetici. Manca **l'atto** su un bando vero, che richiede il prospetto di un ente |
| V-5 | Trasmissione telematica all'ente | `DEFERRED_POST_V1` | Il canale cambia da bando a bando e non si scrive a memoria |
| V-6 | Compensazione automatica sulla rata | `DEFERRED_POST_V1` | ADR-0037: farebbe risultare saldate rate che nessuno ha pagato |
| V-7 | Massimale del bando ≠ assegnato al club | `DONE` | A runtime: iscrivere con 900 su un massimale di 500 viene **scartato** con il motivo; con 300 passa |
| V-8 | Fonte della maturazione configurabile | `DONE` | A runtime con `external_confirmation`: otto periodi calcolati, maturato **zero** finche non arriva la conferma |
| V-9 | Conferma di maturazione auditabile | `DONE` | A runtime: periodo, importo, data, riferimento esterno, nota → maturato 100, **liquidato ancora 0** |
| V-10 | Import di conferme da file | `DONE` | `funding-accrual-source` |
| V-11 | Nessuna contaminazione fra squadre | `DONE` | `funding-multisite`, 6 test |
| V-12 | Maturazione via API di un ente | `DEFERRED_POST_V1` | `external_api` dichiarato e **non selezionabile** |
| V-13 | Il maturato non si scrive a mano | `DONE` | A runtime: un `PATCH` con `accrued_amount: 999` non cambia il maturato |

## 5. Modulistica e moduli online

| ID | Requisito | Stato | Prova |
|----|-----------|-------|-------|
| M-1 | Builder, anteprima, pubblicazione, versioni | `DONE` | `forms-builder`, `forms-model`; e a runtime: bozza, riordino conservato, pubblicazione versione 1 |
| M-2 | Pubblico e interno, atleta e tutore | `DONE` | `forms-service` |
| M-3 | Sede e categoria con opzioni dal server | `DONE` | A runtime il modulo pubblico arriva con `Under 15, Under 17, Pulcini` e `Santi Cosma, Scauri` gia dentro |
| M-4 | Allegati, duplicati, approvazione, rifiuto | `DONE` | A runtime, compreso l'allegato — che **prima del Blocco E non poteva funzionare** (BE-1) |
| **M-5** | **Primo ciclo reale su un modulo pubblico** | `DONE` | Eseguito nel Blocco E **da sessione non autenticata**: apertura del link, invio `multipart` con un file, coda della segreteria, anteprima delle modifiche, approvazione, **creazione dell'atleta con tutore collegato e sede assegnata**. Piu: una bozza risponde 404 sul link pubblico, il rate limit scatta al nono invio, il link pubblico non restituisce le compilazioni ricevute, lo slug porta 48 bit di suffisso |
| M-6 | Logica condizionale fra campi | `DEFERRED_POST_V1` | Aggiunge un modello di dipendenze |
| M-7 | Pagamento contestuale | `DEFERRED_POST_V1` | Dipende dal checkout online |

## 6. Anagrafiche, multi-sede, abbigliamento

| ID | Requisito | Stato | Prova |
|----|-----------|-------|-------|
| A-1 … A-7 | Codice fiscale, comuni, CAP, telefono, capitalizzazione, taglie leggibili, tessera mai obbligatoria | `DONE` | `italian-registry`, `anagrafiche-coverage`, `comuni-archive`, `cap-archive`. A runtime nel Blocco E: allenatore, staff e socio creati e riletti, nessun «Id club non trovato» |
| A-8 | Categoria ≠ sede ≠ struttura ≠ gruppo | `DONE` | ADR-0038 |
| A-8b … A-8e | Il gruppo e l'unita delle operazioni | `DONE` | ADR-0055; `multisite-groups` (24), `multisite-ux` (21) |
| A-9 | Club mono-sede senza complicazioni | `DONE` | Verificato a schermo: con una sola sede il filtro non si monta; alla seconda compare |
| A-10 … A-16 | Kit senza stagione, taglia proposta, consegne parziali, gruppi numerazione, import, export | `DONE` | `clothing-delivery`, `athlete-import`, `person-export` |
| **A-17** | **Primo club con due sedi vere** | `DONE` | Configurato **dall'interfaccia** nel Blocco E: sedi «Scauri» (Minturno) e «Santi Cosma» (Formia), categoria «Pulcini» spuntata su entrambe → due gruppi operativi. 220 atleti distribuiti: elenco Scauri 113, Santi Cosma 113, **nessuna contaminazione** (le tre schede in comune sono le anagrafiche senza sede, che per ADR-0038 appartengono a tutte) |
| A-18 | Iscrizione atleta su pagina dedicata | `DONE` | ADR-0057; `athlete-create-form` |

## 7. Interfaccia, responsivita, accessibilita

| ID | Requisito | Stato | Prova |
|----|-----------|-------|-------|
| U-1 | Topbar club | `DONE` | 30 invarianti |
| U-2 | Console di piattaforma separata dal club | `DONE` | Verificata a schermo: «Da qui non si amministra nessun club» |
| U-3 | Ordine Cognome → Nome | `DONE` | `sorting`; verificato sull'elenco di 223 atleti |
| U-4 | Autosave dove ha senso | `DONE` | `club-profile-autosave` |
| U-5 | Attese uniformi | `DONE` | `AppLoadingScreen` |
| U-6 | Ogni pagina usabile a 375, 768, 1280 | `DONE` | Verifica a schermo nel Blocco E su Dashboard, Atleti, scheda atleta (tutte e sette le sezioni), Movimenti, Allenamenti, Modulistica, Abbigliamento, Categorie e **tutte** le sezioni della console di piattaforma: `document.scrollWidth` mai superiore alla viewport. Le tabelle e le barre di schede scorrono nel **proprio** contenitore |
| **U-7** | **Console di piattaforma verificata a schermo** | `DONE` | Fatta nel Blocco E: Panoramica, Club, Account, Servizi e piani, Pagamenti & Billing, Provider email, a 375 px. Ha richiesto un'utenza amministrativa di collaudo, creata solo sul database di sviluppo e **rimossa dalla configurazione** a verifica finita |
| **U-8** | **Accessibilita essenziale** | `DONE` | Audit eseguito contando i controlli senza nome accessibile, i campi senza etichetta e le immagini senza `alt`. Trovati e corretti: cinque schede senza nome sotto 640 px (BE-4), duecento comandi di riga e sei matite senza etichetta (BE-5). Esito finale sulle superfici verificate — Dashboard, Atleti, scheda atleta, Categorie — **0 controlli senza nome**, su 660 nel solo elenco atleti, 0 campi senza etichetta, 0 immagini senza `alt`, dialoghi con `aria-labelledby` e `aria-describedby`. Non e una certificazione WCAG, ed e dichiarato |
| U-9 | Nessun font nuovo | `DONE` | Due invarianti |
| U-10 | Due sistemi di toast | `DEFERRED_POST_V1` | Debito visibile all'utente, non impedisce di lavorare. Resta in [16](16-technical-debt.md) |

## 8. File e archiviazione

| ID | Requisito | Stato | Prova |
|----|-----------|-------|-------|
| **F-1** | **Un allegato si carica, si vede e si scarica** | `DONE` | Provato nel Blocco E per **sette** combinazioni di proprietario e categoria — atleta, contratto allenatore, visita medica, BLSD, staff, socio, tutore — piu l'allegato di un modulo pubblico: caricamento 201, rilettura **byte per byte identica**, nome del file leggibile, `Content-Type` corretto. Era il difetto BE-1, e prima **non funzionava nessuno** |
| F-2 | Ogni «Visualizza» apre davvero | `DONE` | Quattro invarianti piu la verifica a runtime delle intestazioni |
| F-3 | Nome di download leggibile | `DONE` | `documento-atleta.png`, `contratto-allenatore.png`: il nome e ripulito dal server |
| F-4 | Nessun file nuovo dentro un record | `DONE` | Invariante attiva; verificato a runtime che il binario di una compilazione **non** stia nel record |
| F-5 | Migrazione dei file legacy | `DEFERRED_POST_V1` | `scripts/migrate-legacy-attachments.mjs` esiste, e ripetibile e ha la prova a vuoto. **Non eseguito**: e un'operazione su dati di un ambiente, non codice |
| F-6 | Avatar e loghi fuori dai record | `DEFERRED_POST_V1` | `AvatarUpload`/`LogoUpload` e la tabella `assets` usano ancora la via legacy. Gli avatar non viaggiano piu negli elenchi: sono serviti come immagine |
| F-7 | Provider di storage esterno | `DEFERRED_POST_V1` | ADR-0034 elenca opzioni e raccomandazione. **Decisione del proprietario del prodotto**: blocca la crescita, non il funzionamento |

## 9. Ambiente, rilascio e continuita

| ID | Requisito | Stato | Prova |
|----|-----------|-------|-------|
| R-1 | Migrazioni versionate, nessun drift | `DONE` | 17 migrazioni, `prisma migrate status` verde prima e **dopo il ripristino** |
| **R-2** | **CI verde su ogni push** | `DONE` | **La premessa «GitHub Actions non genera run» era falsa.** Il repository `frattomella/easygame` e pubblico, Actions e attiva e ha 41 run. L'ultimo, il numero 41 sul commit `46b5e29` di `integration/web-v1`, e `success` su tutti e tre i job (Web, Mobile, Guardrail). La distinzione «LOCAL PASS / REMOTE BLOCKED» **non serve piu** |
| R-3 | Deployment Preview funzionanti | `BLOCKED_EXTERNAL` | Verificato con `vercel env ls`: `DATABASE_URL` e `DIRECT_URL` esistono per `Production` e `Development`, **non per `Preview`**. Si chiude aggiungendole al target Preview — e una modifica di variabili d'ambiente, che richiede autorizzazione |
| R-4 | Ambiente di produzione | `BLOCKED_EXTERNAL` | `vercel project ls` mostra **un solo progetto**, `easygame-staging`. Nessun progetto production e stato creato: non e un lavoro di codice |
| R-5 | Error tracking e logging | `BLOCKED_EXTERNAL` | Dipende da R-4. Nel frattempo il Blocco E ha chiuso il buco peggiore: un `500` sul modulo pubblico ora lascia traccia |
| **R-6** | **Backup e restore provati** | `DONE` | Esercitazione completa sul database di **sviluppo**: backup (`pg_dump -Fc`, 492 ms, 192 kB) → alterazione deliberata (un atleta aggiunto, undici cognomi riscritti, due incassi cancellati) → ripristino (`pg_restore --clean --if-exists`, 1.392 ms) → **verifica**: tutti i conteggi tornati ai valori pre-backup, zero righe alterate, zero righe aggiunte. Dopo il ripristino `prisma migrate status` e verde e l'applicazione risponde. Procedura in [13 — Ambienti](13-environments.md) |
| **R-7** | **UAT strutturato** | `DONE` | E questo blocco: dodici aree provate a runtime contro il database di sviluppo con 223 atleti, due sedi, due organizzazioni |
| R-8 | Il seed di sviluppo arriva in fondo | `DONE` | Corretto (BE-6) ed eseguito |

---

## I blocker, divisi come vanno divisi

### Blocker software

**Nessuno.**

I sei difetti che il Blocco E ha trovato sono stati corretti, ognuno con una
prova a runtime e — dove il difetto poteva tornare — con un'invariante che lo
impedisce. Nessuno di essi e stato declassato a debito tecnico.

### Blocker esterni

Non impediscono al software di funzionare. Impediscono di chiamarlo
*rilasciato*.

| # | Cosa manca | Chi lo chiude | Azione precisa |
|---|-----------|---------------|----------------|
| X-1 | **Non esiste un ambiente di produzione** | Proprietario del prodotto | Creare il progetto Vercel di produzione e il database Neon corrispondente. Finche l'unico ambiente e staging, «rilasciato» non ha un significato operativo |
| X-2 | **`DATABASE_URL` e `DIRECT_URL` mancano sul target Preview** | Proprietario del prodotto | `vercel env add DATABASE_URL preview` e `vercel env add DIRECT_URL preview` sul progetto `easygame-staging`. Senza, ogni deployment Preview e rosso e si smette di guardarli |
| X-3 | ~~Nessuna credenziale Stripe in nessun ambiente~~ — `RISOLTO 2026-08-27` | Cedi Soft | Le tre variabili sono configurate su `easygame-staging` e il collaudo end-to-end e stato eseguito nella Sandbox Cedi Soft. Il tipo di account e stato scelto (`dashboard: "full"`, equivalente Standard) insieme alle responsabilita su commissioni e saldi negativi, che **si congelano alla creazione**. Restano da configurare le stesse variabili sull'ambiente di produzione, quando esistera |
| X-4 | **Nessun intermediario per la fattura elettronica** | Cedi Soft | Decisione contrattuale. Il confine e gia disegnato: un file, una riga nel registro, la configurazione |
| X-5 | **Nessun bando reale caricato** | Una societa e un ente | Il percorso e provato su dati sintetici; manca il prospetto vero |
| X-6 | **`EASYGAME_MAINTENANCE_TOKEN` non configurato** | Proprietario del prodotto | La rotta di manutenzione risponde 403 finche il segreto non c'e: le pulizie periodiche non girano |

### Post-V1

Nell'ordine in cui conviene affrontarli.

1. Provider di storage esterno (F-7) — serve **prima** che i file diventino un problema
2. Archiviazione del file dei documenti fiscali emessi (E-8)
3. Primo giro reale su Stripe (X-3)
4. Ricondurre `assets` al servizio allegati (F-6)
5. Migrazione dei file legacy sugli ambienti (F-5)
6. Unificare i due sistemi di toast (U-10)
7. Impaginare rate e presenze (P-5)
8. Scomporre le pagine monolitiche
9. Import atleti transazionale
10. Logica condizionale nei moduli (M-6)
11. Mobile — `DEFERRED` per [ADR-0025](18-decision-log.md#adr-0025--mobile-app-differita-la-priorita-e-easygame-web-v1-responsive)

### Cosa **non** e un blocker, e perche

- **Stripe reale.** L'interfaccia non offre un pulsante che non funziona: dove
  manca una configurazione lo dice, con un messaggio diverso per ognuno dei
  quattro blocchi. Un rilascio con i pagamenti manuali e un rilascio onesto —
  ed e il canale in uso presso club veri.
- **SdI.** `is_electronic` e falso per costruzione, e da questo blocco
  **nessuna schermata dice il contrario**. Il tracciato si genera e si scarica:
  e cio che una societa fa gia oggi consegnandolo al commercialista.
- **I due sistemi di toast, i componenti `ui/*` non usati, le pagine
  monolitiche.** Sono debiti veri e restano scritti in
  [16](16-technical-debt.md). Nessuno impedisce a una segreteria di lavorare.

---

## I numeri finali

| Gate | Esito |
|------|-------|
| `npm test` | **1.596 test, 0 falliti** (erano 1.535 all'inizio del blocco: +61 — +20 su difetti trovati qui, +21 su separazione sandbox/produzione e commissione Stripe (ADR-0060), +20 sul pagamento online parziale) |
| `npm run typecheck` | nessun output |
| `npm run lint` | 0 errori, 41 warning — **lo stesso numero** con cui il blocco e cominciato |
| `npm run build` | completa |
| Codice irraggiungibile | nessuno |
| `npx prisma migrate status` | 17 migrazioni, schema aggiornato |
| CI remota | run 41, `success` su tutti e tre i job |

I venti test nuovi:

| File | Test | Cosa impedisce |
|------|------|----------------|
| `tests/server/payment-state-ownership.test.mjs` | 8 | Che lo stato di una rata torni scrivibile dal client |
| `tests/server/prisma-driver-alignment.test.mjs` | 3 | Che l'adapter del driver diverga di nuovo dal client |
| `tests/ui/athlete-accessible-names.test.mjs` | 7 | Che un comando torni senza nome, e che un'etichetta torni dietro un breakpoint |
| `tests/ui/document-numbering-ownership.test.mjs` | +2 | Che una schermata scriva in `invoices` o dichiari elettronico un documento |

---

## Le vulnerabilita che restano nelle dipendenze, e perche non bloccano

Dopo l'aggiornamento a Next 14.2.35 restano quindici avvisi `high` e uno
`moderate`, e **tutti** quelli su Next si chiudono solo con la 15.x, cioe con
una migrazione major che non si fa dentro un blocco di stabilizzazione.

Guardati uno per uno, quasi nessuno tocca EasyGame:

| Classe di avviso | Si applica? | Perche |
|------------------|-------------|--------|
| DoS e SSRF nelle **Server Actions** | **No** | EasyGame non ne usa nessuna: `"use server"` non compare in tutto `src/`, per [ADR-0007](18-decision-log.md#adr-0007--nessuna-migrazione-net-ora-ma-nessun-nuovo-lock-in) |
| SSRF nelle **rewrites** | **No** | Non ci sono rewrites, ne in `next.config.js` ne in `vercel.json` |
| Aggiramento del middleware con **Pages Router + i18n** | **No** | App Router, e nessun i18n configurato |
| Cache poisoning su **RSC** e redirect | Marginale | Le pagine autenticate hanno `Cache-Control: private, max-age=0, must-revalidate` |
| DoS e cache di **next/image** | **Si**, in parte | `remotePatterns` ammette due host esterni (Unsplash, DiceBear). Vale la pena chiudere quel varco quando si affronta la 15 |
| Avvisi su `glob`, `minimatch`, `picomatch`, `brace-expansion` | **No** in esecuzione | Sono strumenti di sviluppo e di build, non arrivano nel bundle servito |

Le quindici `high` residue **non sono quindici falle**: sono quindici avvisi
su un pacchetto solo, e la maggior parte descrive funzioni che questo prodotto
non usa. L'aggiornamento a Next 15 e nella lista post-V1 con la sua ragione.

---

## Verdetto

**GO come Release Candidate.**

Significa: EasyGame Web V1 e pronta per essere mandata in UAT presso una
societa reale, su staging.

**Non** significa: pubblicata in produzione. La produzione non esiste ancora
(X-1), e crearla e la prima cosa da fare.

Il software non ha blocchi propri. I sei difetti trovati in questo blocco
erano reali e due di essi erano gravi — nessun allegato poteva essere salvato,
e lo stato di una rata si poteva scrivere dal client — ma sono stati corretti,
provati a runtime e chiusi con invarianti. La sola vulnerabilita **critica**
delle dipendenze, un aggiramento dell autorizzazione nel middleware di Next.js,
e stata chiusa con un aggiornamento di patch. I gate sono verdi in locale **e**
sulla CI remota. L'isolamento multi-tenant regge una prova IDOR fra due
organizzazioni vere. Un modulo pubblico e stato compilato da fuori con un
allegato. Un backup e stato ripristinato davvero.

Quello che resta e fuori dal codice: un ambiente da creare, delle credenziali
da ottenere, un bando vero da caricare.

---

## Appendice — la lista di prova manuale, per chi fa la UAT

Quello che una prova automatica non puo dire: se una segreteria ci lavora
davvero. Va fatta su staging, con un club vero, da chi in quel club ci lavora.
Un'ora e mezza abbondante.

L'ordine non e casuale: ogni passo prepara il successivo.

### Prima di cominciare

- [ ] Aprire l'applicazione da **telefono**, non da computer. Tre quarti dei
      difetti di questo blocco si sono visti solo li
- [ ] Segnare l'ora d'inizio: se un passo richiede piu di due minuti, il
      problema e quello, non chi lo sta facendo

### 1. Entrare (10 minuti)

- [ ] Registrare un account nuovo e ricevere il codice di verifica **via
      email**. Senza SMTP configurato non arriva, e l'account non entra: e il
      primo controllo da fare su un ambiente nuovo
- [ ] Sbagliare la password cinque volte di fila e vedere cosa succede
- [ ] «Password dimenticata», e usare il link ricevuto
- [ ] Uscire e rientrare. Chiudere il browser e riaprirlo: la sessione dura
      quattordici giorni

### 2. Il club (15 minuti)

- [ ] Creare il club e **non** completare l'onboarding: la dashboard deve
      dire a che punto si e e come riprendere
- [ ] Anagrafica societaria: cambiare **un solo** campo e ricaricare la
      pagina. Controllare che non ne sia sparito un altro
- [ ] Dati fiscali e bancari: qui il salvataggio e esplicito, non automatico.
      Verificare che lo dica
- [ ] Creare due sedi e una categoria svolta in entrambe. Verificare che
      compaia il filtro sede, e che con **una** sola sede non ci fosse

### 3. Gli atleti (25 minuti)

- [ ] Iscrivere un atleta a mano, compilando **tutto**
- [ ] Importare un file vero della societa — CSV o Excel, quello che hanno.
      Guardare l'anteprima riga per riga prima di confermare
- [ ] Cercare un atleta per cognome. Poi filtrarlo per categoria, poi per sede
- [ ] Aprire una scheda e girare tutte e sette le sezioni **da telefono**
- [ ] Caricare un documento di identita, poi riaprirlo con «Visualizza» e
      scaricarlo. Controllare il nome del file scaricato
- [ ] Aggiungere un genitore o tutore e verificare che compaia nei contatti

### 4. I soldi (20 minuti)

- [ ] Assegnare un piano di pagamento a un atleta e guardare la scheda
      «Iscrizione»: totale, pagato e residuo devono comparire **una volta
      sola**
- [ ] Registrare un incasso parziale in contanti. La rata diventa parziale e
      il residuo cala
- [ ] Registrare il saldo con un metodo diverso. La rata diventa pagata
- [ ] Stornare uno dei due incassi. La rata torna parziale, e nello storico
      restano **tutte e tre** le righe
- [ ] Emettere la ricevuta di un incasso e stamparla
- [ ] Provare a emettere una fattura per un atleta senza dati fiscali: deve
      dire **quali** dati mancano

### 5. Il modulo online (20 minuti)

- [ ] Costruire il modulo di iscrizione della societa, con i campi che usano
      davvero e almeno un allegato obbligatorio
- [ ] Collegare i campi all'anagrafica, e aggiungere i campi «categoria» e
      «sede»: le opzioni le mette il server
- [ ] Pubblicare, e **rigenerare il link** se il nome non e quello giusto
- [ ] Mandare il link a un genitore vero, su WhatsApp. Farlo compilare **dal
      suo telefono**, con una foto del certificato
- [ ] In segreteria: aprire la compilazione, guardare l'anteprima delle
      modifiche, approvare
- [ ] Verificare che l'atleta sia nato con il tutore collegato e nella sede
      giusta

### 6. Il resto (20 minuti)

- [ ] Creare un allenamento su **due** gruppi e fare l'appello
- [ ] Assegnare un kit e consegnarne solo una parte
- [ ] Iscrivere un atleta a un bando e ricalcolare la maturazione
- [ ] Aggiungere un allenatore con contratto, visita medica e BLSD
- [ ] Esportare l'elenco atleti

### Da segnare, sempre

- [ ] Ogni volta che si e dovuto **indovinare** dove cliccare
- [ ] Ogni messaggio di errore che non dice cosa fare
- [ ] Ogni schermata che da telefono costringe a scorrere in orizzontale
- [ ] Ogni numero che non torna con quello scritto due righe sopra
