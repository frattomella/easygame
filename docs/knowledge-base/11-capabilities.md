# 11 — Capability e domini

Classificazione:

- **COMPLETE** — implementata end-to-end (UI + API + persistenza) e usabile.
- **PARTIAL** — funziona in parte: manca un pezzo del flusso, o e presente su
  una sola superficie (Web si / Mobile no), o non e coperta da test.
- **MISSING** — non implementata, anche se esistono tracce (tipi, UI, TODO).
- **LEGACY/REVIEW** — presente ma superata, duplicata o da decidere.

> Le classificazioni descrivono lo **stato del codice al 2026-08-22**, non un
> giudizio sul valore della funzione.

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
| Atleti | COMPLETE | Lista, dettaglio, modifica, profilo. `athletes/[id]/page.tsx` e la pagina piu grande del progetto (~340 KB) |
| Multi-categoria atleta | COMPLETE | `athlete_category_memberships`, migrazione dedicata |
| Import atleti | COMPLETE | CSV e XML con parser propri, XLS/XLSX con `xlsx`. Mappatura colonne, anteprima con esito per riga, barra di avanzamento reale, riepilogo importati/scartati/errori. 9 test in `tests/lib/athlete-import.test.mjs` |
| Anagrafica assistita | COMPLETE | 107 province con regione, 7.896 comuni ISTAT con codice catastale ([ADR-0032](18-decision-log.md)), CAP dal comune dove ne ha uno solo — 7.836 su 7.896, da IPA di AgID ([ADR-0042](18-decision-log.md#adr-0042--il-cap-arriva-da-ipa-e-si-propone-solo-dove-il-comune-ne-ha-uno-solo)) — piu calcolo e verifica del codice fiscale, client **e** server. Le superfici sono elencate una per una in `tests/ui/anagrafiche-coverage.test.mjs`; la residenza di una persona passa da `PersonResidenceFields` |
| Allenatori | COMPLETE | Lista, dettaglio, contratti, upload |
| Staff | COMPLETE | Lista, dettaglio, modifica |
| Soci | COMPLETE | Lista, dettaglio, creazione, export PDF. Dal Blocco A la scheda mostra e modifica **tutto** cio che la creazione scrive: prima ne caricava dodici campi su ventuno, e gli altri nove restavano in archivio invisibili |
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
| Generazione automatica allenamenti | PARTIAL | `src/lib/server/training-automation.ts` + `POST /api/v1/training-automation`. Il job «tutti i club» richiede `CRON_SECRET`, **non configurato in staging**, e non c'e uno scheduler Vercel Cron |
| Presenze allenamento | COMPLETE | `training_attendance`, `AttendanceSheet` |
| Partite | COMPLETE | `/matches`, calendario, luoghi |
| Convocazioni | COMPLETE | `MatchConvocations` |
| Numeri di maglia | COMPLETE | `jersey_groups`, `jersey_assignments` |
| Alert operativi trainer | COMPLETE | `GET /api/v1/trainer/operational-alerts` |

## Documentale

| Capability | Stato | Note |
|-----------|-------|------|
| Certificati medici | COMPLETE | Modello dedicato, scadenze, stato |
| Promemoria certificati | PARTIAL | `POST /api/medical-certificate-reminders` invia notifiche + email, ma va invocato manualmente: nessuno scheduler |
| Lettura documenti d'identita | PARTIAL | Flusso unico su nuovo atleta, allenatore, staff, socio e genitore/tutore: si carica, si vede cosa e stato letto, si sceglie cosa applicare. Motore: OCR locale (`tesseract.js`), il documento non lascia il browser. **Legge**: JPG, PNG, WEBP, HEIC fino a 8 MB, piu la zona a lettura ottica (MRZ) quando c'e. **Non legge**: PDF — rifiutati con una spiegazione, non accettati per poi fallire (serve `pdfjs-dist` per rasterizzare: e una decisione di dipendenza, non un difetto). 22 test |
| Modulistica / template di stampa | COMPLETE | `/modulistica` scheda «Documenti / Template», `document_templates`, `DocumentEditor`. Restano i modelli **di stampa**: i moduli compilabili sono la voce sotto |
| Form builder (Modulistica V2) | COMPLETE | `/modulistica` scheda «Moduli online». Dodici tipi di campo piu la sezione, divulgazione progressiva, reorder, duplicazione, anteprima con lo stesso renderer del modulo pubblico, autosave della bozza. `FormBuilder`, `/api/v1/forms` |
| Campi dinamici EasyGame | COMPLETE | Catalogo chiuso server-side (`src/lib/forms/dynamic-fields.ts`): atleta, genitore, allenatore, staff, socio, societa. La UI mostra solo etichette; il mapping e validato dal server |
| Sede e categoria in un modulo | COMPLETE | Campi le cui **opzioni le mette il server** dalle sedi attive e dalle categorie del club ([ADR-0043](18-decision-log.md#adr-0043--sede-e-categoria-non-stanno-nel-modulo-le-mette-il-server-quando-il-modulo-si-apre)). Club mono-sede: nessuna domanda, sede assegnata comunque. `src/lib/forms/field-options.ts` |
| Versionamento dei moduli | COMPLETE | `form_template_versions` immutabili; una compilazione cita la versione con cui e stata fatta. Vedi [ADR-0040](18-decision-log.md#adr-0040--una-compilazione-cita-una-versione-immutabile-e-non-scrive-in-anagrafica) |
| Moduli online pubblici | COMPLETE | `/forms/[publicSlug]` con slug a suffisso casuale, `GET|POST /api/public/forms/[publicSlug]`, rate limiting per IP, formati ristretti, priorita smartphone |
| Iscrizione online | COMPLETE | Invio → coda segreteria → anteprima delle modifiche → controllo duplicati → approvazione → creazione o aggiornamento di atleta e tutori, con gli allegati collegati alla scheda. Approvare colloca anche **categoria e sede**: l'appartenenza nasce con il gruppo giusto ([ADR-0043](18-decision-log.md#adr-0043--sede-e-categoria-non-stanno-nel-modulo-le-mette-il-server-quando-il-modulo-si-apre)) |
| Compilazione dalla scheda atleta | COMPLETE | «Compila modulo»: atleta gia selezionato, scelta esplicita del tutore, campi precompilati e dichiarati, stessa revisione della coda pubblica |
| Procure | COMPLETE | `/procura`, risorsa `procure` |
| Documenti atleta | COMPLETE | `/api/athletes/[athleteId]/documents` |
| Ricevute e fatture | PARTIAL | Due documenti distinti a partire dallo stesso incasso, con due numerazioni per club e anno ([ADR-0047](18-decision-log.md#adr-0047--un-pagamento-non-e-un-documento-ricevuta-e-fattura-si-scelgono)). Intestatario risolto dal tutore. Documento stampabile con il branding della societa su `GET /api/v1/documents/:kind/:id`. **Non archiviato** (D38), e **non esiste** la trasmissione allo SdI |
| Entitlements e piani | PARTIAL | Catalogo delle funzioni, risoluzione su piano/servizi/eccezioni con **motivo**, `GET|POST /api/v1/entitlements`, sezione «Servizi e piani» nella console di piattaforma ([ADR-0046](18-decision-log.md#adr-0046--chi-puo-usare-cosa-si-calcola-in-un-posto-solo-e-la-risposta-dice-sempre-perche)). Oggi **descrittivo**: nessuna schermata e ancora negata da questo strato, e non deve esserlo finche il piano resta modificabile dal club (D37) |
| Pagamenti online (CediPay) | PARTIAL | Il contratto provider-agnostico, l'adapter Stripe (addebiti diretti, commissione di piattaforma, rimborsi, attivazione del club) e la **verifica della firma dei webhook** ci sono e sono coperti dai test. **Non collaudato contro Stripe**: nel repository non ci sono credenziali. Vedi [ADR-0045](18-decision-log.md#adr-0045--cedipay-e-il-livello-di-prodotto-il-psp-sta-sotto-e-si-sostituisce) |
| Storage file | PARTIAL | Modello `Asset` con `data_base64`: **i binari possono finire nel database**. Nessun object storage. Vedi [16](16-technical-debt.md) |
| Export PDF | PARTIAL | Generazione client-side (`athletes-pdf-export.ts`, `clothing-supplier-order-pdf.ts`); `public/report-template.pdf` non e referenziato |

## Amministrazione e denaro

| Capability | Stato | Note |
|-----------|-------|------|
| Quote e pagamenti atleti | COMPLETE | `/payments`, modello `AthletePayment` |
| Piani di pagamento e sconti | COMPLETE | `payment_plans`, `discounts`, servizi obbligatori e opzionali, rate a percentuale/fisso/saldo |
| Pro-rata sulla quota | COMPLETE | `calculateProratedTotal`, metodo a giorni o mesi. Quando non e calcolabile la UI dice quale dato manca |
| **Registrazione di un incasso** | COMPLETE | `payment_transactions` + `POST /api/v1/payment-transactions`. «Registra pagamento» con importo precompilato al residuo, metodo, data, note e riepilogo. Stesso componente in scheda atleta e area Movimenti ([ADR-0036](18-decision-log.md#adr-0036--una-rata-e-un-debito-un-incasso-e-un-movimento-due-tabelle-non-una)) |
| **Incassi parziali su una rata** | COMPLETE | N movimenti per rata, anche con metodi diversi. Stato **derivato**: `IN ATTESA`, `PARZIALMENTE PAGATA`, `PAGATA`, piu `SCADUTA`. Non e piu impostabile a mano |
| **Storno e correzione di un incasso** | COMPLETE | `{"action":"reverse"}`: l'originale resta marcato, il movimento opposto lo compensa. Nessun `DELETE`. Correggere = stornare e registrare di nuovo |
| Metodi di incasso | COMPLETE | `clubs.settings.paymentMethods` + metodi manuali e provider online; selezione strutturata in «Modifica pagamento» e in «Registra pagamento». Mai testo libero |
| Fatture | COMPLETE | Numerazione unica, campi fatturazione elettronica |
| Ricevute | COMPLETE | Emesse **per incasso** (`receipts.transaction_id`), non per rata: una rata pagata in tre volte ne produce tre. Emissione idempotente. Collegabili anche a fattura |
| Metodi di incasso | COMPLETE | `payment_methods` con commissioni configurabili |
| **Voucher e contributi da enti** | COMPLETE | `funding_programs` + `/api/v1/funding/*`. Le regole di un bando sono **configurazione**: plafond, importo per periodo, frequenza, requisito minimo, unita, comportamento sotto soglia, tetti ([ADR-0037](18-decision-log.md#adr-0037--un-contributo-non-e-un-pagamento-due-contabilita-separate-e-le-regole-del-bando-sono-dati)) |
| **Maturato dalle presenze** | COMPLETE | Il server misura ore o presenze periodo per periodo e scrive il maturato: la segreteria non fa calcoli. Ricalcolo idempotente, ripetibile a ogni correzione di appello |
| **Rendicontazione e liquidazione** | COMPLETE | `reported` e una marcatura interna; `settled` arriva con la liquidazione dell'ente, riconciliata riga per riga sui periodi. Il liquidato si legge dalle righe, non dallo stato |
| **Contributi distinti dai pagamenti** | COMPLETE | Cinque importi separati (assegnato, maturato, rendicontato, liquidato, residuo); il Riepilogo Incassi mostra solo il denaro della famiglia |
| Compensazione contributo → rata della famiglia | MISSING | **Scelta**: quale parte della quota il voucher copre lo decide il club, non l'importo maturato. Compensare in automatico farebbe risultare saldate rate che nessuno ha pagato (ADR-0037) |
| Trasmissione telematica delle rendicontazioni | MISSING | Il canale verso l'ente e quello che il bando prescrive: `reported` e interno |
| Movimenti e trasferimenti | COMPLETE | `/movements`, `transactions`, `transfers` |
| Budget previsionale | COMPLETE | `expected_income`, `expected_expenses` |
| Compensi allenatori | COMPLETE | `trainer_payments` |
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
| Conferma presenza da genitore | LEGACY/REVIEW | `AttendanceConfirmation.tsx` esiste ma **non e referenziato** |

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
| Test automatici | PARTIAL | 30 test, solo su auth ed email. Nessun test su API, dominio, UI |
| CI | MISSING | Nessuna pipeline. `.gitignore` esclude `.github/` |
| Typecheck e lint | COMPLETE | `npm run typecheck` e `npm run lint` puliti |
| Logging / observability | MISSING | Solo `console.error`. Nessun error tracking |
| Audit log | MISSING | Nessuna traccia delle operazioni sensibili |
| Backup / restore documentato | MISSING | Ci si affida a Neon |
