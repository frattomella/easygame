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
| Soci | COMPLETE | Lista, dettaglio, creazione, export PDF **e CSV** per ambito, selezione multipla con attiva/disattiva e tipo socio. Dal Blocco A la scheda mostra e modifica **tutto** cio che la creazione scrive: prima ne caricava dodici campi su ventuno, e gli altri nove restavano in archivio invisibili |
| Sponsor | COMPLETE | Lista, dettaglio, pagamenti sponsor |
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
| Modulistica / template di stampa | COMPLETE | `/modulistica` scheda «Documenti / Template», `document_templates`, `DocumentEditor`. Restano i modelli **di stampa**: i moduli compilabili sono la voce sotto |
| Catalogo dei segnaposto | COMPLETE | `src/lib/documents/placeholders.ts`. **Elenco chiuso e unico**: lo importano sia `DocumentEditor` (che lo propone) sia il risolutore lato server (che lo risolve). Due elenchi che divergono sarebbero peggio di nessun elenco, e un test di contratto (`tests/lib/document-placeholder-catalog.test.mjs`) impedisce che ne nasca un secondo |
| Documento compilato dai dati | COMPLETE | `src/lib/server/document-placeholders.ts` + `GET /api/v1/documents/filled` + «Genera compilato» in `/modulistica`. **Fino alla Wave 1 EasyGame stampava il modulo vuoto avendo il dato in mano**: `renderBlankTemplateForPdf` svuota ogni segnaposto, anche con un atleta selezionato. Ora le si affianca una seconda strada — quella vecchia **resta**, ed e la giusta per il modulo da firmare a mano. Gli importi vengono dal registro incassi ([ADR-0068](18-decision-log.md)), la frequenza dal dominio contributi ([ADR-0037](18-decision-log.md)), firma e timbro da `readClubSignatureImage`. Un segnaposto sconosciuto resta bianco **ed e elencato nell'anteprima**; un dato che manca idem; una firma non caricata produce un avviso **prima** di stampare. Vedi [ADR-0079](18-decision-log.md#adr-0079--il-risolutore-dei-segnaposto-e-lunica-capability-nuova-della-wave-1-e-accetta-quattro-vincoli-per-restarlo) |
| Attestazione di pagamento e frequenza | COMPLETE | Il modello che ogni famiglia chiede ogni anno: `src/lib/documents/attestation-template.ts`, seminato per il club dal pulsante «Aggiungi attestazione di pagamento» in `/modulistica`. **Uno solo**: la libreria dei 77 modelli di Golee e presidio redazionale, non sviluppo (Wave 3). **Niente stampa massiva** (G-43, Wave 3): un documento, un atleta |
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
| Movimenti e trasferimenti | COMPLETE | `/movements`, `transactions`, `transfers` |
| **Sollecito degli insoluti alle famiglie** | COMPLETE | `src/lib/server/payment-reminders.ts` + `POST /api/v1/payment-reminders`. Azione «Sollecita» sulla selezione multipla della scheda **Previsti** di `/movements` (`/payments` vi redirige). **Anteprima obbligatoria** divisa in raggiungibili e non raggiungibili **con il motivo** (`no_guardian`, `no_email`, `no_account`, `already_reminded`): raggiunge il tutore **per indirizzo email anche senza account collegato**, e a chi l’account ce l’ha arriva anche la notifica in-app. Il messaggio porta residuo, rate scadute e prossima scadenza, **senza link di pagamento** (Wave 2). Non dichiara mai «inviato» se SMTP non e configurato o la consegna fallisce: l’esito e **per destinatario**. Finestra di riguardo di **sei ore**, rivendicata sotto blocco di riga: due richieste ravvicinate producono un solo invio ([ADR-0078](18-decision-log.md#adr-0078--il-sollecito-rivendica-il-destinatario-prima-di-scrivergli-e-la-traccia-vive-sulla-rata)). Solo proprietario e gestore |
| Budget previsionale | COMPLETE | `expected_income`, `expected_expenses` |
| Compensi allenatori (`trainer_payments`) | **LEGACY/REVIEW** | **Non e piu la fonte canonica dei compensi** (ADR-0071). E una riga con il nome in testo libero, il mese come stringa e uno stato impostabile a mano: non conosce il rapporto, i contributi, l'anno fiscale ne lo storno. Resta leggibile come promemoria storico, con un avviso sulla scheda allenatore. Il dominio che governa i compensi e **Lavoro sportivo** |
| Report societari | PARTIAL | `/reports` (715 righe) con aggregazioni; nessun export strutturato |
| **Checkout online (PSP)** | **MISSING** | `PAYMENT_PROVIDER_REGISTRY` ha PayPal, Postepay, Mastercard tutti con `isImplemented: false`. `POST /api/payments/create-checkout-session` risponde **501**. Il webhook non verifica firme e non gestisce eventi (3 TODO) |
| Fee di piattaforma | PARTIAL | `calculatePlatformFee` implementata e usata nei metadata, ma non c'e incasso reale |
| Abbonamenti / HUB extra | MISSING | `/hub` (607 righe) e un catalogo **statico**: nessuna chiamata dati, nessuna persistenza |

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
| Segreteria | COMPLETE | `/secretariat`, `secretariat_notes`, appuntamenti |
| Gestione iscrizioni | PARTIAL | `/registration-management` (3.301 righe) con solo 2 chiamate dati: gran parte dello stato e locale |
| Gestione accessi al club | COMPLETE | `/dashboard/access-management` |
| Permessi trainer | COMPLETE | `/permissions` → `trainer-permissions-page`, `trainer-dashboard-permissions.ts` |
| Impostazioni club | COMPLETE | `/settings` su `clubs.settings` |
| Anagrafica societaria | COMPLETE | `/organization` |

## Area genitore e atleta

| Capability | Stato | Note |
|-----------|-------|------|
| Parent dashboard | COMPLETE | `/parent-view/[id]` + 9 sottopagine, API dedicate `/api/parent-dashboard/**` |
| Profilo atleta | PARTIAL | `/athletes/[id]/profile` con guard; superficie ridotta rispetto al parent |
| RSVP: conferma di partecipazione della famiglia (G-20) | COMPLETE | Wave 2, W2-E. `src/lib/rsvp/model.ts` (dominio puro) + `src/lib/server/rsvp.ts` (unico scrittore) + `POST/GET /api/v1/rsvp`. La famiglia risponde da `/parent-view/[id]/trainings` con `AttendanceConfirmation.tsx`, ora collegato al server e senza `localStorage`; puo cambiare risposta finche la scadenza non passa. Lo staff vede si / no / **senza risposta** dentro la scheda appello (`TrainingRsvpSummary` in `AttendanceSheet`), con il perimetro per gruppo operativo dell'allenatore. **L'RSVP non scrive mai `training_attendance.status`**: l'intenzione della famiglia non entra nella misura presenze dei bandi. 30 test |
| RSVP su partite e convocazioni | MISSING | V1.1. La convocazione non ha una forma unica (nove grafie): darle una forma e un lavoro proprio |
| RSVP da link senza account | MISSING | V1.1. Riuserebbe il meccanismo di token dei link di pagamento (W2-B); sarebbe la seconda superficie pubblica e non e stata costruita ora |

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
