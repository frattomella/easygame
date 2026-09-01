# 11 — Capability e domini

Classificazione:

- **COMPLETE** — implementata end-to-end (UI + API + persistenza) e usabile.
- **PARTIAL** — funziona in parte: manca un pezzo del flusso, o e presente su
  una sola superficie (Web si / Mobile no), o non e coperta da test.
- **MISSING** — non implementata, anche se esistono tracce (tipi, UI, TODO).
- **LEGACY/REVIEW** — presente ma superata, duplicata o da decidere.

> Le classificazioni descrivono lo **stato del codice al 2026-08-26** (Blocco
> E), non un giudizio sul valore della funzione. Dove una voce dice COMPLETE
> per una capacita che il Blocco E ha provato a runtime, la prova e citata
> nella [matrice definitiva](23-v1-release-matrix.md).

## Piattaforma e account

| Capability | Stato | Note |
|-----------|-------|------|
| Registrazione utente | COMPLETE | `/register`, rate limit, policy password 12 caratteri |
| Login email + password | COMPLETE | Rate limit su IP e identita, hash fittizio anti-enumerazione |
| Verifica email OTP | PARTIAL | Obbligatoria e senza bypass, ma **dipende da SMTP configurato**: senza SMTP l'utente non verificato non entra |
| Verifica telefono OTP | PARTIAL | Codice completo, attiva solo con Twilio configurato. Non configurata in staging |
| OAuth Google / Microsoft | PARTIAL | Flusso completo (`start`/`callback`, `external_accounts`), disattivato senza credenziali |
| Reset password | COMPLETE | `/api/v1/auth/password/forgot` e `/reset`, token monouso 30 min via SMTP, revoca di tutte le sessioni, nessuna enumerazione account. Dipende da SMTP configurato |
| Sessioni | COMPLETE | Opache su DB, 14 giorni, cookie + Bearer |
| Refresh token | MISSING | `refresh_token` e uguale ad `access_token`; alla scadenza si rifa il login |
| Logout | COMPLETE | Cancella la riga `sessions` e il cookie |
| Multi-club per account | COMPLETE | `/account`, `memberships`, attivazione club |
| Multi-ruolo nello stesso club | COMPLETE | Unique `(org, user, role)`, header `x-active-access-role` |
| Creazione club | COMPLETE | `/create-club` → `create-club-redirect`; dalla home account porta all'onboarding |
| Configurazione iniziale guidata | COMPLETE | `/onboarding`: cinque passi, saltabile e riprendibile. Stato in `clubs.settings.onboarding`, banner di ripresa in dashboard |
| Accesso via token condiviso | PARTIAL | `POST /api/v1/auth/access/redeem` + risorsa `access_tokens`; nessun test |
| Platform admin | COMPLETE | `/private/easygame-platform-admin-0c7a`, API `/api/v1/admin/*` protette da `requirePlatformAdmin` |
| Configurazione SMTP da pannello | COMPLETE | Host, porta, TLS, credenziali cifrate, invio di prova |
| Configurazione IMAP da pannello | PARTIAL | Host, porta, TLS, credenziali cifrate **separate da SMTP**, test di connessione reale. La casella **non viene ancora letta** da nessuna funzione: e configurazione, non ricezione |

## Anagrafiche

| Capability | Stato | Note |
|-----------|-------|------|
| Atleti | COMPLETE | Lista, dettaglio, modifica, profilo. Export PDF **e CSV** per ambito, con le stesse colonne visibili in elenco e la selezione che vince sul filtro. `athletes/[id]/page.tsx` e la pagina piu grande del progetto (~340 KB) |
| Multi-categoria atleta | COMPLETE | `athlete_category_memberships`, migrazione dedicata |
| Import atleti | COMPLETE | CSV e XML con parser propri, XLS/XLSX con `xlsx`. Mappatura colonne, anteprima con esito per riga, barra di avanzamento reale, riepilogo importati/scartati/errori. Scrittura a scaglioni con ritentativo riga per riga: uno scaglione rifiutato non porta via le altre righe. **Non importa sede ne gruppo operativo**: si assegnano dopo. 9 test in `tests/lib/athlete-import.test.mjs`, piu 17 di collaudo su file interi in `tests/lib/athlete-import-hardcheck.test.mjs` |
| Anagrafica assistita | COMPLETE | 107 province con regione, 7.896 comuni ISTAT con codice catastale ([ADR-0032](18-decision-log.md)), CAP dal comune dove ne ha uno solo — 7.836 su 7.896, da IPA di AgID ([ADR-0042](18-decision-log.md#adr-0042--il-cap-arriva-da-ipa-e-si-propone-solo-dove-il-comune-ne-ha-uno-solo)) — piu calcolo e verifica del codice fiscale, client **e** server. Le superfici sono elencate una per una in `tests/ui/anagrafiche-coverage.test.mjs`; la residenza di una persona passa da `PersonResidenceFields` |
| Selezione multipla e azioni di massa | COMPLETE | Su atleti, allenatori, staff e soci. Regole in `src/lib/list-selection.ts`, interfaccia in `src/components/ui/list-selection.tsx`. «Selezionati» non viene mai intersecato con i filtri, e gli ambiti di export si offrono solo quando dicono qualcosa di diverso fra loro. Nessuna eliminazione di massa fuori dagli atleti |
| Allenatori | COMPLETE | Lista, dettaglio, documenti. Selezione multipla con attiva/sospendi, export PDF **e CSV** per ambito e assegnazione **additiva** a un gruppo operativo (o a una categoria, sui club con una sede sola). I documenti sono una griglia sola nella scheda (tipo, file, caricamento, scadenza, stato, azioni) e i byte passano da Attachment Core: vedi `src/lib/trainer-documents.ts`. Fino a RC Fix 1 caricare non salvava niente (scriveva su `clubs.trainer_contracts`, colonna inesistente) e «Visualizza» rimandava all'elenco con «Allenatore non trovato» |
| Staff | COMPLETE | Lista, dettaglio, modifica. Selezione multipla con attiva/disattiva, spostamento di reparto (**sostituisce**: il reparto e uno solo) ed export PDF **e CSV** per ambito |
| Soci | COMPLETE | Lista, dettaglio, creazione, export PDF **e CSV** per ambito, selezione multipla con attiva/disattiva e tipo socio. Dal Blocco A la scheda mostra e modifica **tutto** cio che la creazione scrive: prima ne caricava dodici campi su ventuno, e gli altri nove restavano in archivio invisibili. Dalla Wave 4 (W4-F) la **creazione e del server** e transazionale: prima leggeva `clubs.members`, appendeva e riscriveva l'intera colonna dal browser, e due segreterie nello stesso minuto si cancellavano a vicenda |
| **Libro soci** | COMPLETE | Registro **append-only** in `membership_events` accanto all'anagrafica, che non viene toccata. Cinque eventi (ammissione, dimissione, decadenza, esclusione, riammissione) con delibera, data di efficacia e motivo; lo **stato non e un flag**: `deriveMemberStatus` lo ricava a una data e risponde a «chi era socio il 12 marzo 2026», che e la qualifica da cui dipende la classificazione di un'entrata. Il **numero di tessera si assegna** da `document_number_sequences` (kind `member`, anno `0`: non riparte a gennaio) e il valore mandato dal client viene rifiutato. Dominio in `src/lib/members/model.ts`, scrittura in `src/lib/server/members.ts`, rotte `/api/v1/membership/**`, superficie in `/soci`. **Non e** un modello ufficiale ne un documento da depositare — obbligo statutario ed elemento probatorio — e il prodotto lo dichiara in ogni superficie. Essere tesserato ed essere socio restano due qualita diverse della stessa persona. 25 test |
| Sponsor | COMPLETE | Lista, dettaglio, pagamenti sponsor. Dalla Wave 4 (W4-H) lo sponsor porta un **contratto** — importo pattuito, periodo, riferimento del documento, note — e un **codice fiscale accanto alla P.IVA**. Resta in `clubs.sponsors`: nessuna tabella nuova. Dominio in `src/lib/sponsors/model.ts`, scrittura in `src/lib/server/sponsors.ts` |
| **Credito verso uno sponsor** | COMPLETE | Le tre cifre — **dovuto / incassato / residuo** — si mostrano accanto e non si sommano mai. Il residuo e `pattuito - incassato`, **derivato a ogni lettura e mai salvato**: e ADR-0036 applicata allo sponsor. Il credito non incassato **non e cassa** e non entra in nessun totale di entrate |
| **Fattura a uno sponsor** | COMPLETE | L'intestatario di un documento non e piu per forza un atleta: `resolveFiscalRecipient` conosce la **controparte non-atleta** (`src/lib/documents/fiscal-recipient.ts`), e lo snapshot la congela come gia congela l'atleta. E la stessa estensione che servira al socio. La sponsorizzazione era l'unica entrata del catalogo che una fattura la **richiede** e l'unica che non poteva averla |
| Incasso sponsor su `payment_transactions` | PARTIAL | `prepareSponsorCollection` produce l'incasso pronto, con `counterparty_kind`, `counterparty_id` e l'**etichetta congelata**. La scrittura attende l'estensione di `createPaymentTransaction` alla controparte non-atleta (lane W4-C): le colonne esistono gia in schema |
| Strutture e campi | COMPLETE | `/structures`, orari di apertura, prenotazioni |
| Categorie | COMPLETE | `/categories`, statistiche atleti per categoria. Il secondo anno di nascita e facoltativo: una categoria puo coprire un solo anno |
| Compatibilita fra categorie | COMPLETE | Configurazione esplicita per categoria (`compatibleCategoryIds`), orientata e non transitiva ([ADR-0030](18-decision-log.md)). Consumata oggi dai gruppi numerazione; non crea appartenenze |
| **Multi-sede** | COMPLETE | Sedi (`club_sites`), gruppi operativi categoria x sede (`category_groups`), sede sulla struttura e sull'appartenenza dell'atleta ([ADR-0038](18-decision-log.md)). Filtro sede su Categorie, Atleti e Strutture, montato **solo** con due o piu sedi attive. La categoria non viene mai duplicata |
| Stagioni sportive | COMPLETE | `clubs.settings.seasons`, `/organization?tab=stagioni`. Tre stati (futura, attiva, archiviata) con una sola attiva; filtro server su `x-active-season-id`; creazione guidata con riporto della configurazione dalla stagione scelta (WP-32, WP-35) |
| Riporto fra stagioni | COMPLETE | `/api/v1/seasons/:id/rollover`. Copia categorie, sconti, piani, gruppi numerazione, programma settimanale e previsionale; idempotente, rimappa i riferimenti, non tocca i dati operativi |

## Attivita sportiva

| Capability | Stato | Note |
|-----------|-------|------|
| Allenamenti | COMPLETE | `/training`, luoghi, orari, ricorrenze |
| Programmazione settimanale | COMPLETE | `weekly_schedule`, `WeeklyTrainingSchedulePanel` |
| Generazione automatica allenamenti | COMPLETE | `src/lib/server/training-automation.ts` + `POST /api/v1/training-automation` (un club, a mano) e `GET` (tutti i club, da cron). Dal 2026-08-28 `vercel.json` lo schedula alle **04:00**: prima esisteva ma non girava. Si autentica con `CRON_SECRET`; un club che fallisce non ferma gli altri |
| Presenze allenamento | COMPLETE | `training_attendance`, `AttendanceSheet` |
| Partite | COMPLETE | `/matches`, calendario, luoghi |
| Convocazioni | COMPLETE | `MatchConvocations` |
| Numeri di maglia | COMPLETE | `jersey_groups`, `jersey_assignments` |
| Alert operativi trainer | COMPLETE | `GET /api/v1/trainer/operational-alerts` |

## Documentale

| Capability | Stato | Note |
|-----------|-------|------|
| Certificati medici | COMPLETE | Modello dedicato, scadenze, stato |
| Promemoria certificati | COMPLETE | `src/lib/server/medical-certificate-reminders.ts` + `GET /api/medical-certificate-reminders`, schedulato alle **07:00** dal 2026-08-28. **Idempotente**: chiave deterministica nella notifica e finestra di sette giorni che vale anche se il promemoria e stato letto. Isolato per club: i destinatari devono essere iscritti al club dell'atleta. Lascia una riga di audit `medical_certificate_reminder.run` per club. Il `POST` sullo stesso indirizzo — il sollecito a mano su un atleta — **e stato riparato durante la Wave**: portava un `UUID_PATTERN` a quattro gruppi invece di cinque e rispondeva «Atleta non valido» a qualunque atleta, quindi non aveva mai mandato niente. Il validatore ora ha un proprietario solo, ed e coperto da un test |
| Lettura documenti d'identita | PARTIAL | Flusso unico su nuovo atleta, allenatore, staff, socio e genitore/tutore: si carica, si vede cosa e stato letto, si sceglie cosa applicare. Motore: OCR locale (`tesseract.js`), il documento non lascia il browser. **Legge**: JPG, PNG, WEBP, HEIC fino a 8 MB, piu la zona a lettura ottica (MRZ) quando c'e. **Non legge**: PDF — rifiutati con una spiegazione, non accettati per poi fallire (serve `pdfjs-dist` per rasterizzare: e una decisione di dipendenza, non un difetto). 22 test |
| Firma e timbro del presidente | COMPLETE | Due immagini del **club**, non della persona che le carica: allegato con `owner_type: "club"` e riferimento `attachment:<id>` in `clubs.settings.presidentSignature` / `.presidentStamp`. `GET|PUT|DELETE /api/v1/clubs/:id/signature`; scheda Club → Dati Fiscali, sotto «Legale Rappresentante». Tipi ammessi **piu stretti** degli allegati (solo PNG/JPEG/WebP, max 2 MB) perche finiscono dentro un documento. Legge chi appartiene al club, **scrivono solo proprietario e gestore** (`canManageClubConfiguration`). Il generatore documentale le consuma con `readClubSignatureImage` (`src/lib/server/club-signature.ts`), che restituisce anche il `data:` URL da incorporare |
| Modelli di documento con versioni | COMPLETE | Tre tabelle (`document_templates_v2`, `document_template_versions`, `generated_documents`) al posto dell array JSON sulla riga del club ([ADR-0088](18-decision-log.md#adr-0088--i-modelli-di-documento-escono-da-clubsdocument_templates)). Bozza e pubblicazione sono **due gesti diversi**: pubblicare crea una versione immutabile, e i documenti gia rilasciati continuano a citare la loro. Un modello con documenti generati si **ritira**, non si cancella, e a impedirlo e il database (`ON DELETE RESTRICT`), non una funzione. `/modulistica` e riservata a proprietario e gestore, e lo sono anche le rotte |
| Documento generato come fatto | COMPLETE | `generated_documents`: versione citata, valori congelati, **la resa conservata**, stato, e chi lo ha prodotto. Rileggerlo restituisce il documento **com era**, non una rigenerazione. **Non e un allegato** e non si legge dall endpoint degli allegati ([ADR-0089](18-decision-log.md#adr-0089--un-documento-generato-conserva-la-propria-resa-e-non-e-un-allegato)): quello autorizza la lettura a chiunque appartenga al club, e un attestazione dice quanto ha versato una famiglia |
| Generazione massiva | COMPLETE | `POST /api/v1/documents/generated` con `batch_id`: fino a 50 soggetti per chiamata, cento in due chiamate con lo stesso lotto. Un fallimento e un documento in meno **con il motivo**, non un lotto perso; rieseguire lo stesso lotto non produce doppioni, e l indice unico lo impedisce nel database. Misurato: 50 documenti in 1.155 ms, 100 in 1,9 s |
| Catalogo dei modelli | PARTIAL | Dieci voci in `src/lib/documents/catalog/`, **sei distribuite** e quattro ferme in attesa di validazione professionale ([ADR-0092](18-decision-log.md#adr-0092--il-catalogo-si-classifica-per-ownership-redazionale)). Ogni voce dichiara la classe redazionale, chi risponde del testo e quando e stato riletto. Nessun modulo federale o regionale: sono trenta moduli territoriali da mantenere per sempre, ed e la scelta dichiarata di non aprirli |
| Consensi con revoca | COMPLETE | `consent_definitions` + `consent_versions` + `consent_records` **append-only**: una revoca aggiunge una riga e non cancella la prova del consenso dato prima ([ADR-0090](18-decision-log.md#adr-0090--il-consenso-e-uno-stato-della-persona-non-una-risposta)). Lo stato attuale si **deriva**, non si scrive. Schermata `/consensi` |
| Scadenza di un documento | COMPLETE | `attachments.valid_from` / `valid_until` piu il quinto innesco del motore di Wave 2 (`AUT-05`, anticipi 30 e 7 giorni, filtro per categoria). Lo stato (valido / in scadenza / scaduto) si **ricava**. Il certificato medico resta su `AUT-03` e il doppione e impedito in tre punti |
| Modulistica / template di stampa | COMPLETE | `/modulistica` scheda «Documenti / Template», sopra il motore documentale nuovo. Il generatore «IA» e le due implementazioni doppie della sostituzione dei segnaposto sono state rimosse dalla Wave 3 |
| Catalogo dei segnaposto | COMPLETE | `src/lib/documents/placeholders.ts`. **Elenco chiuso e unico**: lo importano sia `DocumentEditor` (che lo propone) sia il risolutore lato server (che lo risolve). Due elenchi che divergono sarebbero peggio di nessun elenco, e un test di contratto (`tests/lib/document-placeholder-catalog.test.mjs`) impedisce che ne nasca un secondo |
| Documento compilato dai dati | COMPLETE | `src/lib/server/document-placeholders.ts` + `GET /api/v1/documents/filled` + «Genera compilato» in `/modulistica`. **Fino alla Wave 1 EasyGame stampava il modulo vuoto avendo il dato in mano**: `renderBlankTemplateForPdf` svuota ogni segnaposto, anche con un atleta selezionato. Ora le si affianca una seconda strada — quella vecchia **resta**, ed e la giusta per il modulo da firmare a mano. Gli importi vengono dal registro incassi ([ADR-0068](18-decision-log.md)), la frequenza dal dominio contributi ([ADR-0037](18-decision-log.md)), firma e timbro da `readClubSignatureImage`. Un segnaposto sconosciuto resta bianco **ed e elencato nell'anteprima**; un dato che manca idem; una firma non caricata produce un avviso **prima** di stampare. Vedi [ADR-0079](18-decision-log.md#adr-0079--il-risolutore-dei-segnaposto-e-lunica-capability-nuova-della-wave-1-e-accetta-quattro-vincoli-per-restarlo) |
| Attestazione di pagamento e frequenza | COMPLETE | `src/lib/documents/attestation-template.ts`, ed e la prima voce del catalogo — non una copia. **La stampa massiva adesso c e** (G-43 chiuso): un modello, N atleti, un fascicolo |
| Form builder (Modulistica V2) | COMPLETE | `/modulistica` scheda «Moduli online». Dodici tipi di campo piu la sezione, divulgazione progressiva, reorder, duplicazione, anteprima con lo stesso renderer del modulo pubblico, autosave della bozza. `FormBuilder`, `/api/v1/forms` |
| Campi dinamici EasyGame | COMPLETE | Catalogo chiuso server-side (`src/lib/forms/dynamic-fields.ts`): atleta, genitore, allenatore, staff, socio, societa. La UI mostra solo etichette; il mapping e validato dal server |
| Sede e categoria in un modulo | COMPLETE | Campi le cui **opzioni le mette il server** dalle sedi attive e dalle categorie del club ([ADR-0043](18-decision-log.md#adr-0043--sede-e-categoria-non-stanno-nel-modulo-le-mette-il-server-quando-il-modulo-si-apre)). Club mono-sede: nessuna domanda, sede assegnata comunque. `src/lib/forms/field-options.ts` |
| Versionamento dei moduli | COMPLETE | `form_template_versions` immutabili; una compilazione cita la versione con cui e stata fatta. Vedi [ADR-0040](18-decision-log.md#adr-0040--una-compilazione-cita-una-versione-immutabile-e-non-scrive-in-anagrafica) |
| Moduli online pubblici | COMPLETE | `/forms/[publicSlug]` con slug a suffisso casuale, `GET|POST /api/public/forms/[publicSlug]`, rate limiting per IP, formati ristretti, priorita smartphone |
| Iscrizione online | COMPLETE | Invio → coda segreteria → anteprima delle modifiche → controllo duplicati → approvazione → creazione o aggiornamento di atleta e tutori, con gli allegati collegati alla scheda. Approvare colloca anche **categoria e sede**: l'appartenenza nasce con il gruppo giusto ([ADR-0043](18-decision-log.md#adr-0043--sede-e-categoria-non-stanno-nel-modulo-le-mette-il-server-quando-il-modulo-si-apre)) |
| Compilazione dalla scheda atleta | COMPLETE | «Compila modulo»: atleta gia selezionato, scelta esplicita del tutore, campi precompilati e dichiarati, stessa revisione della coda pubblica |
| Procure | COMPLETE | `/procura`, risorsa `procure` |
| Documenti atleta | COMPLETE | `/api/athletes/[athleteId]/documents` |
| Riconciliazione di un bando | COMPLETE | `GET /api/v1/funding/programs/:id/reconciliation`, anche in CSV: una riga per atleta e periodo con la misura grezza accanto al requisito. Serve a provare che la **configurazione** dica quel che il bando prevede — cosa che nessun test puo dimostrare |
| Ricevute e fatture | PARTIAL | Due documenti distinti a partire dallo stesso incasso, con due numerazioni per club e anno ([ADR-0047](18-decision-log.md#adr-0047--un-pagamento-non-e-un-documento-ricevuta-e-fattura-si-scelgono)). Intestatario risolto dal tutore. Documento stampabile con il branding della societa su `GET /api/v1/documents/:kind/:id`. **Non archiviato** (D38), e **non esiste** la trasmissione allo SdI |
| Entitlements e piani | COMPLETE | Catalogo delle funzioni, risoluzione su piano/servizi/eccezioni con **motivo**, `GET|POST /api/v1/entitlements`, sezione «Servizi e piani» nella console di piattaforma ([ADR-0046](18-decision-log.md#adr-0046--chi-puo-usare-cosa-si-calcola-in-un-posto-solo-e-la-risposta-dice-sempre-perche)). Dal Blocco Finale C il piano e **di proprieta della piattaforma** e il gating e attivo su tre scritture — checkout online, creazione di un bando, creazione di un modulo — con `CapabilityGate` che nell'interfaccia mostra il motivo invece di far sparire la schermata ([ADR-0048](18-decision-log.md#adr-0048--il-piano-di-una-societa-appartiene-alla-piattaforma-non-alla-societa)). La **lettura** non e mai negata |
| Pagamenti online (Stripe Connect) | PARTIAL | Il contratto provider-agnostico, l'adapter Stripe (addebiti diretti, commissione di piattaforma, rimborsi, attivazione del club) e la **verifica della firma dei webhook** ci sono e sono coperti dai test. **Non collaudato contro Stripe**: nel repository non ci sono credenziali. Vedi [ADR-0045](18-decision-log.md#adr-0045--cedipay-e-il-livello-di-prodotto-il-psp-sta-sotto-e-si-sostituisce) |
| Storage file | PARTIAL | Gli allegati stanno in `attachments` + `attachment_blobs`, fuori dal record. Restano fuori avatar, loghi e la tabella `assets`. Nessun object storage esterno: vedi [16](16-technical-debt.md).\
**Nota del Blocco E:** fino al 2026-08-26 il caricamento di un allegato **falliva a runtime** per un disallineamento fra `@prisma/client` 6 e `@prisma/adapter-pg` 7, che rompeva le sole colonne `Bytes`. Corretto e coperto da un'invariante sulle dipendenze |
| Export PDF | PARTIAL | Generazione client-side (`people-pdf-export.ts`, `clothing-supplier-order-pdf.ts`); `public/report-template.pdf` non e referenziato |
| Export CSV delle anagrafiche | COMPLETE | Atleti, allenatori, staff e soci, con gli **stessi** ambiti, colonne e valori del PDF (`src/lib/person-export.ts`; gli atleti riusano le loro colonne di pagina). Il tracciato — `;`, CRLF, quoting su `;` `"` e i ritorni a capo, BOM UTF-8 — appartiene a `src/lib/csv.ts` e a nessun altro: il BOM e cio che rende Excel capace di leggere «Nicolò». Restano fuori due serializzatori preesistenti (CSV-01 in [16](16-technical-debt.md)), tenuti in allowlist da un test strutturale |

## Amministrazione e denaro

| Capability | Stato | Note |
|-----------|-------|------|
| Quote e pagamenti atleti | COMPLETE | `/payments`, modello `AthletePayment` |
| Piani di pagamento e sconti | COMPLETE | `payment_plans`, `discounts`, servizi obbligatori e opzionali, rate a percentuale/fisso/saldo |
| Pro-rata sulla quota | COMPLETE | `calculateProratedTotal`, metodo a giorni o mesi. Il periodo lo dichiara il piano; se il piano non lo dichiara si usa quello della **stagione attiva** (`periodFromSeason`), perche lasciare vuote quelle due date era la causa piu comune del pro-rata «non applicato». Ogni esito porta una `reason` — non previsto, senza metodo, periodo mancante, applicato, importo a mano — e `describeProrationResult` la traduce: prima quattro situazioni diverse dicevano tutte «Non applicato» |
| **Registrazione di un incasso** | COMPLETE | `payment_transactions` + `POST /api/v1/payment-transactions`. «Registra pagamento» con importo precompilato al residuo, metodo, data, note e riepilogo. Stesso componente in scheda atleta e area Movimenti ([ADR-0036](18-decision-log.md#adr-0036--una-rata-e-un-debito-un-incasso-e-un-movimento-due-tabelle-non-una)) |
| **Incassi parziali su una rata** | COMPLETE | N movimenti per rata, anche con metodi diversi. Stato **derivato**: `IN ATTESA`, `PARZIALMENTE PAGATA`, `PAGATA`, piu `SCADUTA`. Non e piu impostabile a mano |
| **Storno e correzione di un incasso** | COMPLETE | `{"action":"reverse"}`: l'originale resta marcato, il movimento opposto lo compensa. Nessun `DELETE`. Correggere = stornare e registrare di nuovo |
| Metodi di incasso | COMPLETE | `clubs.settings.paymentMethods` + metodi manuali e provider online; selezione strutturata in «Modifica pagamento» e in «Registra pagamento». Mai testo libero |
| Fatture | COMPLETE | Numerazione unica, campi fatturazione elettronica |
| Ricevute | COMPLETE | Emesse **per incasso** (`receipts.transaction_id`), non per rata: una rata pagata in tre volte ne produce tre. Emissione idempotente. Collegabili anche a fattura |
| Metodi di incasso | COMPLETE | `payment_methods` con commissioni configurabili |
| **Voucher e contributi da enti** | COMPLETE | `funding_programs` + `/api/v1/funding/*`. Le regole di un bando sono **configurazione**: plafond, importo per periodo, frequenza, requisito minimo, unita, comportamento sotto soglia, tetti ([ADR-0037](18-decision-log.md#adr-0037--un-contributo-non-e-un-pagamento-due-contabilita-separate-e-le-regole-del-bando-sono-dati)) |
| Iscrizione atleta su pagina dedicata | COMPLETE | `/athletes/new`, stesso guscio di allenatori e soci. Il salvataggio porta alla scheda creata ([ADR-0057](18-decision-log.md#adr-0057--iscrivere-un-atleta-e-una-pagina-e-il-numero-di-maglia-non-e-un-dato-anagrafico)) |
| Numero di maglia all'iscrizione | RIMOSSA | Non e un dato della persona: e un'assegnazione con gruppo, stagione e unicita. Si assegna dai gruppi di numerazione |
| Scheda «Iscrizione» con un riepilogo solo | COMPLETE | Sei sezioni in ordine fisso, totali in un punto solo, rate e composizione a scomparsa ([ADR-0056](18-decision-log.md#adr-0056--la-scheda-iscrizione-ha-un-riepilogo-solo-e-una-fonte-sola-per-i-numeri)) |
| Prossima rata come azione principale | COMPLETE | La scaduta piu vecchia, poi la prima scoperta per scadenza. Con tutto saldato non compare nessun pulsante |
| Stato dell'iscrizione derivato dagli incassi | COMPLETE | `resolveEnrollmentPaymentState`: nessun campo lo scrive, come per la singola rata |
| Ricevute e fatture nella scheda dell'atleta | COMPLETE | Lette da `receipts` e `invoices` filtrate per `athlete_id`; si emettono dal dettaglio di un incasso |
| Gruppo operativo come unita delle operazioni | COMPLETE | Elenchi atleti, allenamenti, presenze, programma settimanale e assegnazione allenatori si scelgono per **gruppo** (categoria + sede), non per categoria ([ADR-0055](18-decision-log.md#adr-0055--configurazione-si-sceglie-per-categoria-operazione-si-sceglie-per-gruppo)) |
| Sedi di una categoria nel modulo della categoria | COMPLETE | Le spunte scrivono i gruppi. Togliere una sede **archivia** il gruppo e conserva atleti, allenamenti e presenze |
| Allenamento su piu gruppi | COMPLETE | Selezione multipla senza duplicare l'allenamento; la deduplica del generatore include il gruppo |
| Allenatore su piu squadre della stessa categoria | COMPLETE | `trainers.groupIds`; senza dichiarazione segue tutte le squadre delle sue categorie |
| Contributi senza contaminazione fra squadre | COMPLETE | Il dominio filtra gli allenamenti sui gruppi dell'atleta prima di misurare la frequenza |
| Collocazione in blocco del dato senza sede | COMPLETE | Il cambio categoria in blocco accetta una sede e preserva quella esistente quando non se ne indica una |
| Massimale del bando vs importo assegnato al club | COMPLETE | Due valori distinti: `funding_programs.athlete_plafond` e il tetto del bando, `funding_enrollments.assigned_amount` e cio che il club ha in carico. La maturazione si ferma **sempre** al secondo ([ADR-0054](18-decision-log.md#adr-0054--il-massimale-del-bando-non-e-limporto-assegnato-al-club-e-una-presenza-non-e-sempre-una-prova)) |
| Fonte della maturazione configurabile | COMPLETE | `easygame_attendance`, `external_confirmation`, `external_import`. Con una fonte esterna le presenze EasyGame restano una **previsione** e il maturato resta zero fino alla conferma |
| Conferma di maturazione da fonte esterna | COMPLETE | `POST /api/v1/funding/accruals {"action":"confirm"}` con periodo, importo, data, utente, riferimento e nota. Una correzione conserva lo storico e riapre la rendicontazione |
| Import di conferme esterne | COMPLETE | `{"action":"import"}`, tracciato a punto e virgola come la riconciliazione in uscita. Le righe illeggibili tornano indietro elencate |
| Maturazione via API di un ente | NOT_STARTED | `external_api` esiste nel modello ed e **non selezionabile**: nessun ente espone oggi una API che EasyGame possa chiamare, e un adapter finto sarebbe peggio di nessun adapter |
| **Maturato dalle presenze** | COMPLETE | Il server misura ore o presenze periodo per periodo e scrive il maturato: la segreteria non fa calcoli. Ricalcolo idempotente, ripetibile a ogni correzione di appello |
| **Rendicontazione e liquidazione** | COMPLETE | `reported` e una marcatura interna; `settled` arriva con la liquidazione dell'ente, riconciliata riga per riga sui periodi. Il liquidato si legge dalle righe, non dallo stato |
| **Contributi distinti dai pagamenti** | COMPLETE | Cinque importi separati (assegnato, maturato, rendicontato, liquidato, residuo); il Riepilogo Incassi mostra solo il denaro della famiglia |
| Compensazione contributo → rata della famiglia | MISSING | **Scelta**: quale parte della quota il voucher copre lo decide il club, non l'importo maturato. Compensare in automatico farebbe risultare saldate rate che nessuno ha pagato (ADR-0037) |
| Trasmissione telematica delle rendicontazioni | MISSING | Il canale verso l'ente e quello che il bando prescrive: `reported` e interno |
| **Prima nota (movimenti e giroconti)** | COMPLETE | `/movements`, scheda **Prima nota**, sopra `GET /api/v1/accounting/entries`. **Tre letture** al posto delle diciassette di prima — di cui quattordici sulla stessa riga `clubs`, una per colonna — e due letture morte (`suppliers`, `supplier_payments`) sparite: l'elenco, l'anagrafica dei conti e il riepilogo gestionale (`/api/v1/accounting/reports`), da cui arrivano **tutti** i numeri in testa, saldi e crediti compresi. Nessuna somma nel browser. Filtri sul server e sugli indici: intervallo di date, anno fiscale, conto, causale, verso, origine, stato di riconciliazione, ricerca, sede (solo ai club multi-sede, ADR-0038); paginazione a 100 righe. Si registra un movimento con **causale obbligatoria scelta da un elenco** (mai testo libero, mai la categoria sportiva dell'atleta), un giroconto in **una** chiamata transazionale, si storna con motivo obbligatorio e si riconcilia contro l'estratto conto. **Nessun pulsante «Elimina»**: il denaro si storna. Le azioni di riga nascono dai flag `canEdit`/`canReverse`/`canReconcile` che il servizio manda **con la riga**, mai da un ricalcolo del ruolo nella pagina. Chi non ha `accounting.accounts_read` legge perche i saldi non ci sono, invece di vedere `0,00` |
| **Conti finanziari e saldo derivato** | COMPLETE | `financial_accounts` + `src/lib/server/financial-accounts.ts` + `/api/v1/accounting/accounts`. Tre tipi: cassa, banca, **transito** (il denaro incassato online non e in banca il giorno dell'incasso). Il saldo **non e una colonna**: e la somma di prima nota, incassi, uscite del lavoro sportivo e liquidazioni dei bandi, aggregata nel database (soglia 200 ms). Chiude il difetto per cui `current_balance` era mutato a mano dal browser con una chiamata HTTP separata e non transazionale — un incasso dalla scheda atleta non toccava nessun saldo. **Nessun `DELETE`**: un conto si archivia. Vedere i saldi e aprire un conto e di proprietario e gestore (`accounting.accounts_read`); l'elenco senza saldi lo vede anche la segreteria, perche senza non registrerebbe un movimento |
| **Causali configurabili dal club** | COMPLETE | `fiscal_operation_types` esisteva dal Blocco D e **nessun componente la chiamava**: la Wave 4 aggiunge `direction_hint`, `reporting_bucket`, `default_description`, i due flag `deductible` e `is_membership_fee`, l'autore della classificazione (`classified_by` / `classified_at`) e **la schermata** — Club → Account e Fatturazione → Causali. I due flag nascono `null` e mai `false`, e **nessuna delle sette voci `unspecified` del seme viene classificata**: un valore non dichiarato si vede che manca, uno sbagliato sembra compilato. Una voce di sistema, e una gia citata da un movimento, si **disattiva** e non si cancella. Legge la segreteria (`accounting.read`), modificano proprietario e gestore (`accounting.causes_manage`) |
| **La causale arriva ai dati, e cio che manca si vede** | COMPLETE | `operation_type_code` esisteva su `payment_transactions`, `invoices` e `receipts` e valeva `null` su **ogni riga reale**: lo schema di validazione degli incassi non dichiarava il campo, e Zod scarta cio che non dichiara. La Wave 4 (W4-E) apre quella porta — insieme a `financial_account_id` e alla controparte — e **rende visibile il ripiego**: quando nessuno ha classificato, il motore continua a *proporre* una causale (serve a scegliere il documento giusto) ma il documento risulta **NON CLASSIFICATO**, `operation_type_code` resta nullo sulla riga e lo snapshot dichiara `declared: false` con la provenienza (`declared` / `proposed` / `absent`). L'ambito si **congela** all'emissione, perche la causale e configurazione mutabile. Il webhook del provider non ha una fonte affidabile e lascia il campo nullo **dichiarandolo**. Vedi [ADR-0073](18-decision-log.md) e §5.2 del piano della Wave 4 |
| **Imponibile e imposta sui documenti** | COMPLETE, come **dato** | `taxable_amount_cents` e `vat_amount_cents` su `invoices` e `receipts`, piu i due campi nello snapshot; il calcolo sta in `src/lib/fiscal/vat.ts` e scompone un importo **incassato** (lordo). Restano `null` quando l'aliquota non e dichiarata: «zero» e «nessuno l'ha detto» sono due cose diverse. **Non e un motore IVA**: niente liquidazioni, niente saldo per cassa, niente detraibilita — sono regole di classe C (§31 del piano) e non entrano in questa Wave. Il tracciato FatturaPA legge l'imponibile congelato invece del lordo |
| **Un documento emesso non si modifica, e il numero non si digita** | COMPLETE | `assertDocumentMutable` esisteva dal Blocco D e **non aveva chiamanti**, mentre `POST /api/v1/invoices` accettava un `invoice_number` digitato dal client — che con il vincolo di unicita per club poteva **occupare** il numero della sequenza. La Wave 4 collega entrambe le regole al CRUD generico (`src/lib/server/resources.ts`): il numero digitato viene rifiutato, e importo, data, intestatario e snapshot di un documento emesso non si riscrivono. Rimandare indietro lo **stesso** valore non e una modifica |
| **La proposta documentale si legge prima di emettere** | COMPLETE | `describeDocumentDecision` esisteva e non aveva chiamanti: la spiegazione arrivava come **errore dopo**. Ora `GET /api/v1/payment-transactions/:id/document-decision` e la finestra «cosa stai per emettere» (scheda atleta e Iscrizione) dicono prima quale documento, con quale numero — letto con `peekDocumentNumber`, che non consuma — con quale classificazione, con quale imponibile e cosa manca, distinguendo emittente e intestatario. Il pulsante resta acceso su una proposta «da configurare»: da «EasyGame non sa cosa sia questo incasso» non segue «non si puo emettere» |
| **Sollecito degli insoluti alle famiglie** | COMPLETE | `src/lib/server/payment-reminders.ts` + `POST /api/v1/payment-reminders`. Azione «Sollecita» sulla selezione multipla della scheda **Rate e solleciti** di `/movements` (`/payments` vi redirige). **Anteprima obbligatoria** divisa in raggiungibili e non raggiungibili **con il motivo** (`no_guardian`, `no_email`, `no_account`, `already_reminded`): raggiunge il tutore **per indirizzo email anche senza account collegato**, e a chi l’account ce l’ha arriva anche la notifica in-app. Il messaggio porta residuo, rate scadute e prossima scadenza, **senza link di pagamento** (Wave 2). Non dichiara mai «inviato» se SMTP non e configurato o la consegna fallisce: l’esito e **per destinatario**. Finestra di riguardo di **sei ore**, rivendicata sotto blocco di riga: due richieste ravvicinate producono un solo invio ([ADR-0078](18-decision-log.md#adr-0078--il-sollecito-rivendica-il-destinatario-prima-di-scrivergli-e-la-traccia-vive-sulla-rata)). Solo proprietario e gestore |
| Budget previsionale | COMPLETE | La scheda **Previsti** di `/movements` (`src/components/accounting/ExpectedEntries.tsx`), sopra `expected_income` e `expected_expenses`: elenco, totali, creazione e rimozione di una previsione. **Non e cassa e lo dichiara**: i totali si chiamano `expected*`, vivono in un riquadro proprio e non compaiono nella fascia finanziaria del riepilogo; nessuna previsione entra in `accounting_entries`. La scrittura e del **server** — `src/lib/server/expected-entries.ts` e `GET\|POST /api/v1/accounting/expected`, `DELETE /api/v1/accounting/expected/:id` — e passa da `appendClubResourceItem` / `removeClubResourceItem`: una riga in `club_resource_items` sotto lock, mai la riscrittura della colonna JSON dal browser, che era il difetto W4-B1 |
| Compensi allenatori (`trainer_payments`) | **LEGACY/REVIEW** | **Non e piu la fonte canonica dei compensi** (ADR-0071). E una riga con il nome in testo libero, il mese come stringa e uno stato impostabile a mano: non conosce il rapporto, i contributi, l'anno fiscale ne lo storno. Resta leggibile come promemoria storico, con un avviso sulla scheda allenatore. Il dominio che governa i compensi e **Lavoro sportivo** |
| Report societari | PARTIAL | `/reports`: presenze, gare, categorie e report pagamenti. Il filtro **Periodo** ora tocca anche il report pagamenti — fino alla Wave 4 non lo faceva, e «Ultimo mese» lasciava i quattro numeri finanziari sull'intero storico senza dirlo. L'export strutturato della contabilita c'e (riga sotto); resta senza export strutturato la parte sportiva (presenze, gare, categorie) |
| **Export contabile per il commercialista** | COMPLETE | `src/lib/accounting/export.ts` (puro, **sopra** `src/lib/csv.ts`) + `src/lib/server/accounting-export.ts` + `GET /api/v1/accounting/export` + il pulsante «Esporta in CSV» accanto ai filtri del riepilogo in `/reports`. Venti colonne dichiarate: data, numero del documento, codice ed etichetta della causale, descrizione, **entrata e uscita in due colonne** (nessun importo con il segno), conto, metodo, controparte con il suo tipo, documento, classificazione **congelata sulla riga**, imponibile e imposta quando ci sono, origine, **anno fiscale**, **stato di riconciliazione**, data di storno e note. Importi con la **virgola decimale**, cosi in un foglio italiano sono numeri; `;`, CRLF e BOM, cosi Excel lo apre con un doppio clic. **Niente XLSX**: una dipendenza nuova per un guadagno estetico. L'export **sfoglia** tutte le pagine da 500 righe e oltre le 40.000 **rifiuta** invece di consegnare un file corto in silenzio. Permesso `accounting.export`, che la segreteria non ha, e ogni download lascia una traccia. **Non e un documento**: nessuna intestazione, nome di file o etichetta usa «ufficiale», «conforme», «a norma» o «per il deposito» |
| **Riepilogo gestionale** | COMPLETE | `src/lib/accounting/reporting.ts` (puro) + `src/lib/server/accounting-reports.ts` + `GET /api/v1/accounting/reports` + la sezione dentro `/reports`. **Cassa e competenza restano separate**: incassato e pagato da una parte, crediti verso le famiglie, insoluti, contributi attesi e compensi maturati dall'altra, e **nessun campo li somma** (chiude D-2). Un giroconto non e ne entrata ne uscita — la liquidita non cambia — ma si vede nel flusso del conto. Filtri per date, **anno fiscale e stagione insieme** (due assi diversi: la stagione 2026/27 contiene il 2026 e il 2027), conto, causale, sede (solo club multi-sede, ADR-0038), verso e classificazione; confronto fra due periodi solo fra grandezze omogenee. Raggruppa per causale, `reporting_bucket`, conto, mese, origine e classificazione, e **dichiara quante righe sono `unspecified`** invece di nasconderle in un totale. Ogni riquadro porta il **proprietario** del numero e la sua grandezza (`DASHBOARD_KPIS`); «debiti verso fornitori» non esiste e non viene inventato. **Non e un documento ufficiale**: il titolo e «Riepilogo gestionale», la pagina lo dichiara in una riga e nessuna etichetta usa «ufficiale», «conforme», «a norma» o «per il deposito» |
| **Checkout online (PSP)** | **MISSING** | `PAYMENT_PROVIDER_REGISTRY` ha PayPal, Postepay, Mastercard tutti con `isImplemented: false`. `POST /api/payments/create-checkout-session` risponde **501**. Il webhook non verifica firme e non gestisce eventi (3 TODO) |
| Fee di piattaforma | PARTIAL | `calculatePlatformFee` implementata e usata nei metadata, ma non c'e incasso reale |
| Abbonamenti / HUB extra | MISSING | `/hub` (607 righe) e un catalogo **statico**: nessuna chiamata dati, nessuna persistenza |


## Contabilita dopo la remediation della Wave 4 (2026-08-30)

Cio che due tornate di revisione ostile hanno cambiato. Le capability sopra
restano vere; qui c'e la parte che prima era descritta e non funzionava, o
funzionava e non si vedeva.

| Capability | Stato | Note |
|-----------|-------|------|
| **Il registro regge un club grande** | COMPLETE | La prima nota e adesso la vista `accounting_ledger_lines`: filtri, ordinamento, paginazione, conteggio, ricerca e aggregazione scendono nel database. Su 35.000 righe — sotto il tetto dichiarato di 40.000 — la prima pagina costa **325 ms** contro 5.719, il rendiconto **723 ms** contro 110.621, l'export **1.057 ms** contro 93.285. Il tetto **non e stato abbassato** per far passare il collaudo; oltre il tetto il rendiconto lo dichiara e l'export rifiuta. Misure riproducibili: `scripts/measure-accounting-performance.mjs --grande`, con `ANALYZE`, un giro a vuoto e cinque ripetizioni |
| **La classificazione arriva a un incasso** | COMPLETE | `activity_scope_snapshot` esisteva e **nessuna schermata mandava la causale**: ogni incasso reale nasceva non classificato, e il rendiconto dichiarava non classificato il cento per cento delle entrate delle famiglie mentre il documento emesso per lo stesso incasso diceva «commerciale». La finestra di incasso chiede adesso la causale — **facoltativa**, perche una causale obbligatoria su una finestra che si apre trenta volte di fila diventa un campo compilato a caso — e il servizio congela l'ambito leggendolo dal catalogo. Un codice fuori catalogo si **rifiuta**: una classificazione che cita il nulla non e una classificazione mancante, e una sbagliata che sembra compilata |
| **Un documento annullato non blocca il suo incasso** | COMPLETE | L'unicita del documento e adesso parziale su `cancelled_at`: annullata una ricevuta emessa per errore, quell'incasso torna documentabile. Prima l'emissione restituiva il documento morto **dichiarando successo**, e la prima nota — che i documenti annullati li esclude — mostrava l'incasso senza numero |
| **Un documento fiscale nasce solo dal suo dominio** | COMPLETE | Il registro generico non puo piu **crearlo**: nasce da un incasso, dove si risolve l'intestatario, si congela lo snapshot e si chiede il numero alla sequenza. Un collaboratore creava una riga `receipts` con il `transaction_id` di un incasso vero, e quell'incasso non poteva **piu** essere documentato |
| **L'immutabilita e un elenco di cio che e permesso** | COMPLETE | Era un elenco di stati **emessi**, e `status` e testo libero senza enum: una ricevuta creata con stato `"sent"` o `"posted"` non diventava mai immutabile, e lo **snapshot** — la fonte che la stampa legge — restava riscrivibile per sempre. Adesso si e in **bozza**, oppure il documento e uscito. Modalita di pagamento e causale sono immutabili: si vedono sul foglio |
| **Il rendiconto dichiara il troncamento** | COMPLETE | Il server calcolava `truncated` e la pagina non lo leggeva: su un club da 42.000 righe stampava sedici riquadri in euro sulle quarantamila piu recenti, senza un segnale. Mancavano 434.520 € di incassato |
| **Le due schermate degli sponsor dicono lo stesso residuo** | COMPLETE | L'elenco lo calcolava nel browser da una fonte sola: uno sponsor che aveva appena pagato 2.000 su 5.000 compariva con residuo **5.000** nell'elenco e **3.000** nella sua scheda. Adesso lo calcola il server, che conosce entrambe le fonti |
| **Il confine multi-tenant e una dichiarazione obbligatoria** | COMPLETE | `resources.ts` **non si carica** se una risorsa di modello non dichiara il suo confine. Chiude la classe di difetto che quattro correzioni successive non erano riuscite a chiudere, e le due risorse che un confine non ce l'avevano affatto. Vedi [ADR-0094](18-decision-log.md#adr-0094--il-confine-multi-tenant-e-una-dichiarazione-obbligatoria-non-un-elenco) |
| **Riconciliazione bancaria** | **PARTIAL, e va detto** | Cio che esiste e una **spunta manuale** con data valuta e riferimento sulla riga. Nessun parser CAMT/MT940/CBI, nessun matching automatico: chiamarla «riconciliazione bancaria» senza questa riga sarebbe una promessa |
| **Libro soci** | **PARTIAL, e va detto** | Registro append-only con numerazione assegnata, delibera, cessazione e stato derivato a una data. E **bookkeeping**, non conformita statutaria: nessun professionista ha confermato che soddisfi gli obblighi dello statuto o del RUNTS, e il prodotto non lo chiama «legalmente conforme» da nessuna parte |
| **Chiusura dei periodi** | MISSING | Un esercizio non si chiude, e un movimento retrodatato entra in un anno gia rendicontato |
| **Ciclo passivo** | MISSING | I fornitori esistono come **controparte**; fatture ricevute, scadenzario passivo e pagamenti a fornitore no |
| **Motore IVA** | MISSING | Imponibile e imposta si conservano e si espongono; non si **liquidano** |

## Abbigliamento e materiali

| Capability | Stato | Note |
|-----------|-------|------|
| Kit, prodotti, inventario | COMPLETE | `/clothing`, `clothing_*`. Catalogo e kit sono **globali** fra stagioni; le assegnazioni sono stagionali. L'articolo dichiara da quale taglia dell'anagrafica prende (`sizeSource`). Il catalogo **non** ha una stagione ne una compatibilita di categoria: due concetti che un magazzino non ha, tolti dal modello nel Blocco A |
| Gruppi numerazione | COMPLETE | `jersey_groups`, `jersey-numbering-utils.ts`. Schede chiuse di default, ricerca e paginazione interne; le righe dichiarano perche l'atleta e nel gruppo (`primary`/`secondary`/`compatible`/`external`). Un gruppo si puo restringere a una o piu sedi (`siteIds`): vuoto = tutte |
| Assegnazioni kit | COMPLETE | `/api/clothing/assignments`, `kit_assignments`. La taglia parte da quella dell'anagrafica per il capo giusto e si puo sovrascrivere **senza** toccare l'anagrafica |
| **Consegne parziali** | COMPLETE | `clothing-delivery.ts`: quattro stati per articolo (da preparare, pronto, consegnato, non disponibile) e stato del kit **derivato** — «Parziale · 2/4 consegnati · 1 non disponibile». Dialogo consegne a schede impilate, usabile da telefono |
| Ordine fornitore PDF | COMPLETE | `clothing-supplier-order-pdf.ts` |

## Comunicazione

| Capability | Stato | Note |
|-----------|-------|------|
| Notifiche in-app | COMPLETE | Modello `Notification`, `/notifications` |
| Email transazionali | COMPLETE | SMTP configurabile da dashboard admin, password cifrata AES-GCM, test invio |
| Email su notifica | COMPLETE | `POST /api/v1/notifications` invia anche email |
| Email di sollecito pagamento | COMPLETE | `sendPaymentReminderEmail` in `src/lib/server/email/email-service.ts`: contenuto proprio con residuo, rate scadute e prossima scadenza. **Nessun link di pagamento** (Wave 2). Stesso e unico punto di invio delle altre |
| SMS | PARTIAL | Solo OTP via Twilio; nessun SMS applicativo |
| Push mobile | MISSING | Nessuna integrazione push |
| Chat | PARTIAL | `src/components/ui/chat.tsx` (41 KB), montata da `dashboard/Header.tsx`. Non ha modello dati dedicato: verificare la persistenza prima di considerarla completa |

## Area segreteria e iscrizioni

| Capability | Stato | Note |
|-----------|-------|------|
| Segreteria | PARTIAL | `/secretariat`, `secretariat_notes`. Gli appuntamenti si ricevono e **non si confermano**: nessun codice scrive `confirmed` ne `rejected`. Il dominio proprio arriva in Wave 5 — 5E |
| Gestione iscrizioni | PARTIAL | `/registration-management` (3.301 righe) con solo 2 chiamate dati: gran parte dello stato e locale |
| Gestione accessi al club | MOCK | `/dashboard/access-management` e una schermata con tre nomi cablati e un token generato dal browser: **nessun effetto sull'autorizzazione**. I ruoli personalizzati sono un requisito definitivo di prodotto ed entrano fra i blocker obbligatori della Wave 6 pre-production |
| Permessi trainer | COMPLETE | `/permissions` → `trainer-permissions-page`, `trainer-dashboard-permissions.ts`. Fino alla Wave 5 la configurazione **non raggiungeva la sessione dell'allenatore**: si leggeva da `GET /api/v1/clubs`, che al ruolo risponde 403, e l'errore inghiottito faceva ricadere sui default (D-2). Ora passa da `GET /api/v1/trainer/preferences` |
| Impostazioni club | COMPLETE | `/settings` su `clubs.settings` |
| Anagrafica societaria | COMPLETE | `/organization` |

## Area genitore e atleta

| Capability | Stato | Note |
|-----------|-------|------|
| Parent dashboard | PARTIAL | `/parent-view/[id]` + 9 sottopagine, API dedicate `/api/parent-dashboard/**`. Fino alla Wave 5 il genitore con piu figli **non raggiungeva il secondo** (D-3). Le voci mancanti — bacheca, notifiche disegnate, «Paga ora», ricevute scaricabili, consensi, fascicolo — sono il perimetro di 5H |
| Profilo atleta | PARTIAL | `/athletes/[id]/profile` con guard; superficie ridotta rispetto al parent |
| RSVP: conferma di partecipazione della famiglia (G-20) | COMPLETE | Wave 2, W2-E; **esercitabile solo dalla Wave 5** (W5-05), perche fino a li nessuna schermata scriveva `rsvpRequired` e quindi nessun evento chiedeva mai una conferma. `src/lib/rsvp/model.ts` (dominio puro) + `src/lib/server/rsvp.ts` (unico scrittore) + `POST/GET /api/v1/rsvp`. La famiglia risponde da `/parent-view/[id]/trainings` con `AttendanceConfirmation.tsx`, ora collegato al server e senza `localStorage`; puo cambiare risposta finche la scadenza non passa. Lo staff vede si / no / **senza risposta** dentro la scheda appello (`TrainingRsvpSummary` in `AttendanceSheet`), con il perimetro per gruppo operativo dell'allenatore. **L'RSVP non scrive mai `training_attendance.status`**: l'intenzione della famiglia non entra nella misura presenze dei bandi. 30 test |
| RSVP su partite e convocazioni | COMPLETE | Wave 5. La convocazione ha adesso **una forma sola** — una colonna di `club_event_participants` (ADR-0099) — e le dieci grafie sono state normalizzate una volta sola, nella migrazione |
| RSVP da link senza account | ASSENTE | `W2-09`, confermato fuori perimetro dalla Wave 5. Riuserebbe il meccanismo di token dei link di pagamento (W2-B); sarebbe la seconda superficie pubblica e non e stata costruita ora |

## Mobile

| Capability | Stato | Note |
|-----------|-------|------|
| Login mobile | COMPLETE | Stessa API del Web, token in SecureStore |
| Selezione club/contesto | COMPLETE | `AccountHubScreen` |
| Home trainer | PARTIAL | `TrainerHomeDashboardScreen` |
| Allenamenti / partite / atleti trainer | PARTIAL | Schermate v2 collegate, funzionalita ridotte rispetto al Web |
| Notifiche mobile | PARTIAL | Lettura, nessuna push |
| Area management mobile | MISSING | Nessuna schermata |
| Area genitore / atleta mobile | MISSING | Nessuna schermata |
| Test mobile | MISSING | Nessun test |
| Build distribuibile (EAS) | MISSING | Nessuna configurazione EAS |
| Layer dati mobile | LEGACY/REVIEW | Tre servizi storage: uno mock, uno orfano, uno reale |

## Infrastruttura e qualita

| Capability | Stato | Note |
|-----------|-------|------|
| Deploy Vercel staging | COMPLETE | Progetto `easygame-staging`, regione `fra1` |
| Deploy Vercel production | LEGACY/REVIEW | **Nessun progetto production visibile** nello scope Vercel corrente. Vedi [13](13-environments.md) |
| Migrazioni automatiche in build | COMPLETE (rischioso) | `vercel-build` esegue `prisma migrate deploy`. Vedi [14](14-security.md) |
| Test automatici | COMPLETE | 1.596 test su auth, dominio, API, invarianti di interfaccia e responsivita. Discovery automatica su `tests/**/*.test.mjs` |
| CI | COMPLETE | `.github/workflows/ci.yml`, tre job (Web, Mobile, Guardrail) su ogni push e ogni pull request. **Gira davvero**: 41 run sul repository, l'ultima verde sul commit di integrazione. La riga precedente diceva il contrario ed era vecchia di mesi |
| Typecheck e lint | COMPLETE | `npm run typecheck` e `npm run lint` puliti |
| Logging / observability | PARTIAL | `console.error` sui percorsi che possono perdere dati — compreso il modulo pubblico, che dal Blocco E non fallisce piu in silenzio. Nessun servizio di error tracking: dipende dall'ambiente di produzione |
| Audit log | COMPLETE | `audit_logs` su autenticazione, risorse economiche, stagioni, anagrafiche, incassi, storni, documenti, contributi, e **tutti** i dinieghi. Dal Blocco E anche il tentativo di scrivere lo stato di una rata |
| Backup / restore documentato | COMPLETE | Procedura in [13](13-environments.md), **provata** nel Blocco E su sviluppo: backup, alterazione deliberata, ripristino, verifica riga per riga |
| Manutenzione periodica (pulizia dati scaduti) | COMPLETE | `src/lib/server/maintenance.ts`. Dal 2026-08-28 `GET /api/v1/maintenance` e schedulato alle **04:30**: prima esisteva solo il `POST` e non lo azionava nessuno, quindi sessioni, sfide OTP e contatori di rate limit scaduti crescevano. E l'unica porta di cron che pretende `CRON_SECRET` in **ogni** ambiente, perche e l'unica che cancella righe |
| Funzioni periodiche schedulate | COMPLETE | Quattro voci `crons` in `vercel.json` (03:30 lavoro sportivo, 04:00 allenamenti, 04:30 manutenzione, 07:00 promemoria certificati), orari distanziati. Fino al 2026-08-28 ce n'era **una sola**: tre funzioni esistevano nel codice e non giravano. **Da verificare**: il limite di cron del piano Vercel non e documentato da nessuna parte nel repository |

## Pagamenti online e fiscalita dopo il Blocco D (2026-08-26)

| Funzione | Stato reale |
|----------|-------------|
| Registrare un incasso manuale | **Funziona.** E il canale in uso presso club veri |
| Pagare una rata online | **Da collaudare.** Tutto il percorso c'e — onboarding, checkout anche parziale, webhook, rimborsi — ma nessun euro e mai passato da Stripe. Il pulsante compare solo quando il server dice che si puo incassare |
| Rimborsare online | **Funziona, collaudato contro Stripe Sandbox il 2026-08-27.** Pulsante «Rimborsa» nel dettaglio di un incasso online, importo parziale o totale, commissione di piattaforma restituita in proporzione. Il movimento lo scrive l'evento firmato del provider: finche non arriva, la riga dice «in elaborazione» e una seconda richiesta non parte. Solo proprietario e gestore del club ([ADR-0065](18-decision-log.md#adr-0065--il-rimborso-si-avvia-da-easygame-a-scriverlo-nel-registro-resta-levento-firmato)). Il giro reale: rata da 130 EUR pagata con carta, rimborso parziale di 30 (netto 100, residuo 30, rata PARZIALMENTE PAGATA, commissione restituita 0,30 EUR), poi rimborso dei 100 restanti (rata IN ATTESA, commissione restituita 1,00 EUR: 30+100 centesimi = l'intera commissione trattenuta). Doppio clic sulla conferma: due richieste HTTP, **un solo** rimborso presso il provider. Il collaudo ha trovato **sei difetti**, tutti corretti — vedi [22 — Release candidate](22-release-candidate.md) |
| Abbonamento EasyGame pagato dalla societa | **Da collaudare.** Modello, adapter e webhook ci sono; manca una sottoscrizione reale e i prezzi configurati su Stripe |
| Commissione con decorrenza e storico | **Funziona.** Ed e congelata sull'incasso: cambiare il listino non riscrive il passato |
| Profilo fiscale non-ASD | **Funziona.** Dieci forme giuridiche, regimi dichiarati, dati REA |
| Emettere ricevuta o fattura | **Funziona.** Con snapshot, serie, annullamento e immutabilita |
| Generare il tracciato FatturaPA | **Funziona, ma non e mai stato accettato dallo SdI**: e scritto sulla specifica pubblica e va considerato da collaudare |
| **Trasmettere allo SdI** | **NON ATTIVA.** Nessun intermediario accreditato configurato. Nessun documento viene marcato come trasmesso, e la console lo dice a chiare lettere |

## Voucher e contributi dopo il Blocco D (2026-08-26)

| Funzione | Stato reale |
|----------|-------------|
| Configurare un programma (bando, voucher, contributo) | **Funziona.** Le regole sono configurazione: importo per periodo, requisito minimo, cosa succede sotto la soglia |
| **Aprire un programma e vederne la scheda** | **Funziona.** Era il buco: `funding_enrollments` esisteva nel modello e nessuna schermata lo sapeva scrivere |
| Iscrivere uno o piu atleti | **Funziona.** Selezione multipla, plafond e codice voucher individuali, doppie iscrizioni impedite |
| Iscrivere dalla scheda atleta | **Funziona.** Stesso servizio e stesso componente del flusso opposto |
| Togliere o revocare un'iscrizione | **Funziona.** Con storico rendicontato o liquidato si revoca invece di cancellare |
| Vedere i cinque importi per iscritto | **Funziona.** Assegnato, maturato, rendicontato, liquidato, residuo |
| Calcolo del maturato dalle presenze | **Funziona.** E non si puo scavalcare: nessuna superficie accetta un importo maturato scritto a mano |
| Trasmissione telematica all'ente | **NON IMPLEMENTATA.** Il canale cambia da bando a bando e non si scrive a memoria |
| Compensazione automatica sulla rata | **NON IMPLEMENTATA**, per scelta: farebbe risultare saldate rate che nessuno ha pagato |

## Lavoro sportivo e compensi (WP Sport Work V1, 2026-08-28)

Il dominio nato dall'analisi [28](28-lavoro-sportivo-e-compensi-analisi.md).
Gli stati qui sotto sono verificati **a runtime** dal collaudo
`scripts/sport-work-uat.mjs`, che parla HTTP con l'applicazione con un cookie
di sessione vero: 72 controlli, 72 verdi.

| Funzione | Stato reale |
|----------|-------------|
| **Anagrafica del modulo (Person Core)** | **Funziona.** Nome, codice fiscale, nascita, contatti, regime fiscale, copertura previdenziale e IBAN stanno qui una volta sola. Il collegamento all'anagrafica di origine (atleta, allenatore, staff, socio, esterno) e **debole** di proposito: allenatori e staff non sono righe di tabella, e un contratto firmato non deve sparire insieme a una scheda |
| **Rapporto di lavoro sportivo** | **Funziona.** Tre tipi (co.co.co. sportiva, P.IVA, subordinato con paghe esterne), cinque stati, transizioni dichiarate. Nasce sempre in bozza; l'attivazione verifica contratto e anagrafica e **dice cosa manca** |
| **Piano compensi** | **Funziona.** Rate uguali e mensilita; la somma torna al pattuito al centesimo; il piano dichiara quando attraversa due anni solari. Rifarlo e rifiutato se una scadenza ha gia ricevuto denaro |
| **Maturazione** | **Funziona.** Per periodo di competenza, calcolata dal sistema, idempotente. Non si imposta a mano |
| **Programmato / maturato / erogato** | **Funziona.** Tre grandezze in tre colonne, in ogni schermata che le mostra |
| **Motore contributivo** | **Funziona** per la co.co.co. sportiva: franchigia dei 5.000, riduzione al 50%, aliquota per copertura previdenziale, ripartizione un terzo / due terzi, netto previdenziale e costo club. Gli esempi A–E dell'analisi 28 sono i casi di prova |
| **Regole versionate per anno** | **Funziona.** 2026 e 2027, con la fonte normativa accanto a ogni valore. Un anno non configurato **fallisce**: nessun fallback all'anno prima (ADR-0072) |
| **Ritenuta IRPEF** | **NON CALCOLATA, per scelta.** Sopra i 15.000 il motore mostra l'imponibile eccedente e si ferma: la qualificazione reddituale della co.co.co. sportiva non e validata e cambia il netto. Il numero mostrato si chiama «netto previdenziale», non «netto da corrispondere» (ADR-0073) |
| **Posizione annua verso le soglie** | **Funziona.** Per anno solare, per cassa. Erogato dal club e dichiarato esterno restano due numeri distinti, con la data della dichiarazione accanto |
| **Autocertificazione compensi esterni** | **Funziona.** E un record, non un allegato, ed entra nel calcolo. Sostituirla non cancella la precedente |
| **Erogare senza autocertificazione** | **Consentito con conferma esplicita**, e tracciato con nome e data (ADR-0075). Bloccare costringerebbe a pagare fuori dal gestionale |
| **Registro in uscita** | **Funziona.** Append-only, storno con riga di segno opposto, doppio clic protetto da chiave di idempotenza, capienza verificata dentro la transazione dopo il blocco di riga |
| **Uscite in Movimenti** | **Funziona.** Un'erogazione produce una riga sola; la scadenza programmata non e un movimento; le coppie stornate non compaiono |
| **Premi** | **Funziona** come dominio separato. Il trattamento fiscale si **dichiara** e non si deduce, e il valore predefinito e «da verificare» |
| **Rimborsi spese** | **Funziona.** Cinque categorie, ciclo bozza → presentato → approvato → liquidato. Non concorrono a nessuna soglia |
| **Fatture dei professionisti (P.IVA)** | **Funziona** come registrazione: numero, data, imponibile, IVA, ritenuta in fattura, scadenza, pagamento, uscita. **Nessun calcolo co.co.co.**: lo ha fatto chi ha emesso il documento |
| **Subordinati** | **Registrazione soltanto.** Rapporto, contratto e costo. Nessun cedolino, TFR, ferie, malattia, INAIL: e un mestiere diverso, con un software diverso |
| **Agenda degli adempimenti** | **Funziona.** RASD, F24, autocertificazioni, contratti in scadenza, CU. Derivazione idempotente per chiave deterministica |
| **Dati F24 e CU** | **Funzionano come dataset**, esportabili in CSV. **Non sono un F24 e non sono una CU**: sono le tabelle che il consulente si porta via |
| **Trasmissione al RASD, a UNILAV, all'INPS, all'Agenzia delle Entrate** | **NON IMPLEMENTATA, e non lo sara in V1.** EasyGame prepara l'input dell'adempimento, non l'adempimento. «Assolto» significa che una persona lo ha fatto e lo ha dichiarato qui |
| **Comunicazione RASD** | **Tracking assistito.** Sei stati sul rapporto, protocollo e data. Nessuna API ufficiale esiste: dichiarare un'integrazione che non c'e sarebbe peggio di non averla |
| **Giro notturno** | **Funziona.** Vercel Cron alle 03:30: porta a scaduti i contratti finiti, ricalcola il maturato, riallinea l'agenda, notifica cio che scade. Idempotente: rieseguirlo non manda una seconda notifica |
| **Permessi dedicati** | **Funzionano.** Cinque permessi, nessun ruolo nuovo, default negato. Allenatore, staff, collaboratore e atleta non vedono i compensi altrui; ogni diniego e tracciato (ADR-0077) |
| **Sezione «Lavoro e compensi» nelle schede persona** | **Funziona** su atleta, allenatore e staff. Se la persona non e ancora censita nel modulo, la schermata lo dice e offre di farlo |
| **Documenti** | **Funzionano** su Attachment Core, con due proprietari (rapporto e persona). Allegare il contratto lo collega al rapporto e sblocca l'attivazione |
| **Migrazione dei dati legacy** | **Rapporto, non conversione.** Si importano solo le anagrafiche; promemoria di pagamento e procure restano dove sono (ADR-0076) |
| **Volontari e rimborsi forfettari** | **NON IMPLEMENTATI in V1.** Il tetto mensile e in regola, ma le condizioni di legittimita (evento riconosciuto, delibera, autodichiarazione) attendono validazione |
| **Compensazione fra compensi e quote** | **NON IMPLEMENTATA, per scelta.** Un compenso non paga una quota, un contributo non salda una rata, un rimborso non e un compenso |

---

## Wave 5 — 5C e 5F: attivita sportiva (2026-09-01)

| Capability | Stato | Note |
|-----------|-------|------|
| Calendario unico | COMPLETE | `/calendar`: allenamenti e gare insieme, filtrabili per tipo, sede, categoria, gruppo e intervallo. Prima non esisteva niente da unire, perche non esisteva un'entita comune da elencare (ADR-0098) |
| Evento sportivo come riga | COMPLETE | `club_events`, `src/lib/server/events.ts` unico scrittore, `GET/POST /api/v1/events` |
| RSVP configurabile dalla schermata | COMPLETE | Il toggle «chiedi conferma», la scadenza e la capienza entrano nei form di allenamento e gara. Il dominio RSVP esisteva da due Wave e **nessun evento lo richiedeva mai**: era una funzione che nessuna schermata sapeva accendere (W5-05) |
| RSVP sulle gare | COMPLETE | Il dominio era cablato su `trainings`; adesso l'evento e uno solo |
| Convocazione come fatto | COMPLETE | Colonna su `club_event_participants`, con permesso, audit e notifica. Prima era un campo nel payload della gara in dieci grafie |
| Presenze sulle gare | COMPLETE | Stessa riga della convocazione e della risposta (ADR-0099) |
| Capienza dell'evento | PARTIAL | Il numero e il conteggio ci sono e il limite e vero. **Nessuna lista d'attesa**: una coda ha regole di priorita che nessuno ha dichiarato |
| Sede sulla gara | COMPLETE | Derivata dalla struttura scelta, come gia faceva l'allenamento |
| Validazione contro la disponibilita del campo | COMPLETE | Un allenamento delle 23:00 su un campo che chiude alle 20:00 viene respinto (W5-11) |
| Comunicazioni per evento | COMPLETE | Due criteri nuovi nel risolutore del pubblico: «convocati a un evento» e «senza risposta a un evento» (W5-14) |
| Colonna «senza risposta» nel rendiconto | COMPLETE | `/reports`, contata sui soli eventi che una conferma l'hanno chiesta (W5-09) |
| Perimetro per gruppo sulla convocazione | COMPLETE | La gara che dichiara i suoi gruppi mostra solo quegli atleti; senza gruppi ricade sulla categoria (W5-16) |

---

## Wave 5 — 5D e 5E: fascicolo e appuntamenti (2026-09-01)

| Capability | Stato | Note |
|-----------|-------|------|
| Workflow documenti Club ↔ Parent | COMPLETE | Richiesta e deposito sono **righe** con `organization_id`, scadenza sorvegliata e audit (ADR-0100). Il workflow esisteva gia per intero: cio che mancava era dove viveva |
| Deposito spontaneo della famiglia | COMPLETE | `request_id` nullo, stessa coda, stessa decisione |
| Upload della famiglia | COMPLETE | **Multipart**, dentro Attachment Core, con audit. Prima era base64 dentro `Asset`, che non ha `organization_id` |
| Promozione del certificato medico | COMPLETE | All'accettazione nasce la riga in `medical_certificates`, e `status` non si scrive (W5-27, W5-44) |
| Antivirus e magic byte sull'upload | ASSENTE | Wave 6 / pre-produzione |
| Appuntamenti: ciclo di vita completo | COMPLETE | Otto stati, conferma, rifiuto con motivo, riprogrammazione, cancellazione dai due lati, concluso/assente (ADR-0101). Prima **nessun codice scriveva «confermato»** |
| Appuntamenti: disponibilita | COMPLETE | `appointment_slots`, con ripiego dichiarato sugli orari di apertura |
| Appuntamenti: doppia prenotazione | COMPLETE | La impedisce il **database**, con un indice unico parziale sugli stati vivi |
| Appuntamenti: notifiche alla famiglia | COMPLETE | In-app su tutte le transizioni; email su conferma e rifiuto, i due eventi che una famiglia deve sapere senza aprire l'applicazione |
| Appuntamenti: promemoria a 24 ore | ASSENTE | Il giro notturno non lo manda ancora: e una riga nel catalogo chiuso delle automazioni, non un motore nuovo |
| Appuntamenti: schermate | PARTIAL | Le rotte e il dominio ci sono; la coda di lavoro della segreteria, la pagina dell'allenatore e la scelta dello slot nell'area genitore sono 5H e 5I |

---

## Wave 5 — 5G, 5H e 5I (2026-09-01)

### Iscrizione online e rinnovo

| Capability | Stato | Note |
|-----------|-------|------|
| Motore moduli online | COMPLETE | Gia corretto prima della Wave 5: pagina pubblica, limite di frequenza, versione immutabile, anagrafica solo all'approvazione umana (ADR-0040) |
| Riscontro alla famiglia | COMPLETE | Riferimento opaco restituito una volta sola, stato leggibile da rotta pubblica con doppio rate limit e 404 unico. **La pagina che lo legge e nata in 5J**: fino a li c'erano l'API, il modello e il percorso dichiarato da `buildEnrollmentReceiptPath`, e **nessuna schermata che li usasse** — il riferimento usciva nella risposta all'invio e non c'era nessun posto in cui portarlo. Adesso `/iscrizione/[reference]`, e il link si consegna sulla schermata di conferma dell'invio |
| Domanda visibile nell'area genitore | COMPLETE | `/parent-view/[id]/enrollment` |
| Rinnovo precompilato | COMPLETE | Stesso modulo con un contesto: dati esistenti e stagione di destinazione, decisa dal server |
| Documento mancante all'approvazione | COMPLETE | Emette una richiesta documentale invece di respingere: e il punto in cui iscrizione e fascicolo si saldano |
| Pagamento contestuale | ASSENTE | G-37, fuori perimetro per scelta: la domanda produce una pratica, non un movimento |
| Sconti automatici e fratelli | ASSENTE | G-36, G-61, fuori perimetro |
| Iscrizione senza account con seguito | ASSENTE | `W2-09`: la ricevuta e anonima e in sola lettura |

### Dashboard Parent

| Capability | Stato | Note |
|-----------|-------|------|
| Selettore figli | COMPLETE | Anche in club diversi; il legame sopravvive al ricaricamento (5A) |
| Calendario dei figli | COMPLETE | `/parent-view/[id]/calendar`, allenamenti e gare insieme |
| Bacheca | COMPLETE | `/parent-view/[id]/board`, letta dalle consegne |
| Notifiche | COMPLETE | `/parent-view/[id]/notifications`: prima erano nel payload e non venivano **mai disegnate** |
| Consensi accettabili e revocabili | COMPLETE | `/parent-view/[id]/consents`, con sorgente `subject` |
| «Paga ora» | COMPLETE | Riusa il checkout esistente con l'identita di sessione. Nessun secondo checkout |
| Ricevute scaricabili | COMPLETE | Il gate e diventato il legame |
| Stato della domanda | COMPLETE | `/parent-view/[id]/enrollment` |
| Fascicolo documentale | COMPLETE | Dal dominio 5D, con l'upload multipart |
| Appuntamenti su slot | COMPLETE | Dal dominio 5E |
| Push mobile | ASSENTE | G-59, differito da ADR-0025 |

### Dashboard Trainer

| Capability | Stato | Note |
|-----------|-------|------|
| Permessi trainer applicati alla sessione | COMPLETE | Da `GET /api/v1/trainer/preferences` (5A) |
| Calendario dei propri gruppi | COMPLETE | Perimetro implicito sul ruolo |
| Annulla allenamento, convocazioni | COMPLETE | Passano dalle rotte del dominio eventi |
| Appello su allenamento **e gara** | COMPLETE | Legge le righe, non la copia nel payload |
| Bacheca in lettura | COMPLETE | `/trainer-dashboard/board` |
| Documenti pertinenti | COMPLETE | I propri, e i certificati del gruppo limitati allo **stato** |
| Appuntamenti assegnati | COMPLETE | `/trainer-dashboard/appointments` |
| Programmazione settimanale | COMPLETE | Era sempre vuota |
| Avvisi operativi | COMPLETE | Calcolati dal **server**: prima il contenuto lo dettava il client |
| Dato clinico | COMPLETE | `clinical.read` negato di default e applicato dal server; resta `clinical.status_read` |
| Anagrafica dei colleghi | COMPLETE | Ridotta a cio che serve: prima usciva con codice fiscale, indirizzo e telefono |
| Invio comunicazioni dal trainer | ASSENTE | Decisione di prodotto, non un difetto |
| Piani di lavoro tecnici, esercizi, carichi | ASSENTE | W5-13, Wave 6 |

---

## Wave 6 — cosa e diventato raggiungibile (2026-09-01)

> La Wave 6 ha contato **quattordici** capability dichiarate complete e
> irraggiungibili dalla UI, piu tre **superfici finte**. La colonna «Stato» qui
> sotto risponde alla sola domanda che conta: *una persona ci arriva?*

### Atleti e anagrafica

| Capability | Stato | Note |
|-----------|-------|------|
| Filtro per stato nell'elenco atleti | COMPLETE | Quattro stati veri — attivo, sospeso, **in prestito**, disattivato — con un vocabolario unico (`src/lib/athletes/status.ts`). Prima erano tre valori e quattro etichette, quindi due filtri mostravano lo stesso insieme |
| Rimozione della foto profilo | COMPLETE | `??` trattava `null` come «non fornito» e riesumava la foto: si vedeva solo ricaricando. Stessa correzione su codice d'accesso e numero di maglia |
| Cancellazione di un atleta | COMPLETE | Dialogo dell'applicazione, con le conseguenze scritte. Le tre azioni irreversibili della scheda passano da un meccanismo solo |
| Lettura di un documento (OCR) | COMPLETE | Locale, nel browser. Accetta ora anche il **PDF che contiene una fotografia** — cioe cio che salva un telefono che «scansiona». Fotocamera in tutte e cinque le schermate. **Si propone, non si scrive**: anche nella scheda atleta, che era l'unica a scrivere tutto |

### Area famiglia

| Capability | Stato | Note |
|-----------|-------|------|
| Scelta del figlio | COMPLETE | Schermata dedicata all'ingresso quando i figli sono piu d'uno; il guscio dice sempre di chi si sta parlando. Prima l'ingresso portava al **primo** e il cambio esisteva in due pagine su tredici |
| Appartenenze multiple | COMPLETE | La relazione non veniva nemmeno caricata: un ragazzo in due squadre vedeva **meta dei propri impegni**, perche il calendario dipende da quelle |
| Stagione attiva | COMPLETE | La risolve il server. Prima arrivava dal `localStorage` e un evento la azzerava; per un tutore senza tessera non esisteva mai |
| Pagare una rata | COMPLETE | Il pulsante confrontava l'etichetta italiana con token inglesi: era spento **sempre**. Ora anche una rata per volta, scelta da chi paga |
| Scaricare una ricevuta | COMPLETE | Il confine del club attivo girava prima del ramo del legame, e chi non ha una tessera ha un elenco vuoto: la ricevuta era non scaricabile proprio per i tutori piu comuni |
| Fatture | COMPLETE | Erano nel payload e nel tipo, e non le disegnava nessuno |
| Certificato medico | COMPLETE | Quattro stati con **«in scadenza»**, la data del certificato che governa — non del piu vecchio — in tutti gli stati, e una CTA per portarne uno nuovo. L'upload manda finalmente il **tipo**: senza, un certificato entrava come «altro» e non muoveva lo stato sanitario |
| Notifiche | COMPLETE | Filtrate per figlio, e si possono segnare lette |

### Allenatore e atleta

| Capability | Stato | Note |
|-----------|-------|------|
| Perimetro dell'allenatore sugli eventi | COMPLETE | Applicato in **tutte e nove** le funzioni. La regola: in lettura di elenco e un filtro, su ogni **atto** e un confine. Le quattro implementazioni divergenti sono diventate una |
| «I miei compensi» dell'allenatore | COMPLETE | `sport_work.read_own` era in catalogo e non la consumava nessuna superficie: era l'ultima chiave muta |
| Accesso EasyGame di un atleta | COMPLETE | Invito, riscatto, revoca e audit. **Mai una password in chiaro**: un link opaco, poi la persona sceglie |
| Athlete Dashboard V1 | COMPLETE | Area propria, proiezione a elenco chiuso. Fuori per scelta: denaro, tutori, altri atleti, contenuto clinico |
| Ruolo `athlete` | COMPLETE | Era modellato end-to-end — pagina, guardia, redirect, sessione, slegamento — e **nessun percorso scriveva `athlete.user_id`** |

### Documenti e moduli

| Capability | Stato | Note |
|-----------|-------|------|
| Fascicolo documentale lato famiglia | COMPLETE | La famiglia leggeva ancora l'array JSON: una richiesta della segreteria **non le arrivava** |
| Coda «Documenti da verificare» del club | COMPLETE | Il backend era pronto e nessun componente lo chiamava: la segreteria apriva scheda per scheda |
| Le tre aree della famiglia | COMPLETE | Da fare / Documenti / Moduli. Prima le prime due erano la stessa lista frullata due volte |
| Catalogo canonico dei tipi | COMPLETE | Con **tessera sanitaria** e **delega**, e fuori dal file destinato alla cancellazione |
| Modelli consigliati dei moduli | COMPLETE | Un catalogo adottabile, distinguibile da un modulo creato dal club |
| Salva e riprendi la compilazione | COMPLETE | Nel browser. Non salva file, firme ne consensi: sono atti, non dati |

### Permessi, privacy, operativita

| Capability | Stato | Note |
|-----------|-------|------|
| Catalogo dei permessi applicato | COMPLETE | Nove chiavi non le chiedeva nessuno e cinque collassavano su un interruttore. Il presidio verifica che ogni chiave sia **interrogata** |
| Consenso prima di un invio | PARTIAL | Il meccanismo c'e ed e configurazione. La **validazione legale** resta un blocker esterno |
| Export e cancellazione di una persona | COMPLETE | Attraversa sei indici polimorfi. Per un minore serve un riepilogo confermato |
| Identificativo di richiesta | COMPLETE | Due righe di log della stessa richiesta non erano correlabili |
| Giro notturno che si lamenta | COMPLETE | Un passo fallito lascia una riga di audit: prima era invisibile fino alla telefonata di un club |
