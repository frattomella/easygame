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
| Creazione club | COMPLETE | `/create-club` → `create-club-redirect` |
| Accesso via token condiviso | PARTIAL | `POST /api/v1/auth/access/redeem` + risorsa `access_tokens`; nessun test |
| Platform admin | COMPLETE | `/private/easygame-platform-admin-0c7a`, API `/api/v1/admin/*` protette da `requirePlatformAdmin` |

## Anagrafiche

| Capability | Stato | Note |
|-----------|-------|------|
| Atleti | COMPLETE | Lista, dettaglio, modifica, profilo. `athletes/[id]/page.tsx` e la pagina piu grande del progetto (~340 KB) |
| Multi-categoria atleta | COMPLETE | `athlete_category_memberships`, migrazione dedicata |
| Import atleti | PARTIAL | `src/lib/athlete-import.ts` + `xlsx`; nessun test |
| Allenatori | COMPLETE | Lista, dettaglio, contratti, upload |
| Staff | COMPLETE | Lista, dettaglio, modifica |
| Soci | COMPLETE | Lista, dettaglio, creazione |
| Sponsor | COMPLETE | Lista, dettaglio, pagamenti sponsor |
| Strutture e campi | COMPLETE | `/structures`, orari di apertura, prenotazioni |
| Categorie | COMPLETE | `/categories`, statistiche atleti per categoria |

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
| OCR certificati | PARTIAL | `tesseract.js` in `athletes/[id]/page.tsx`, `src/lib/document-scan.ts`. Nessun test |
| Modulistica / template | COMPLETE | `/modulistica`, `document_templates`, `DocumentEditor` |
| Moduli online firmabili | COMPLETE | `/forms/[publicSlug]` pubblico, `OnlineFormsDashboard`, `/api/online-forms`, `/api/public/forms/[publicSlug]` |
| Procure | COMPLETE | `/procura`, risorsa `procure` |
| Documenti atleta | COMPLETE | `/api/athletes/[athleteId]/documents` |
| Storage file | PARTIAL | Modello `Asset` con `data_base64`: **i binari possono finire nel database**. Nessun object storage. Vedi [16](16-technical-debt.md) |
| Export PDF | PARTIAL | Generazione client-side (`athletes-pdf-export.ts`, `clothing-supplier-order-pdf.ts`); `public/report-template.pdf` non e referenziato |

## Amministrazione e denaro

| Capability | Stato | Note |
|-----------|-------|------|
| Quote e pagamenti atleti | COMPLETE | `/payments`, modello `AthletePayment` |
| Piani di pagamento e sconti | COMPLETE | `payment_plans`, `discounts` |
| Fatture | COMPLETE | Numerazione unica, campi fatturazione elettronica |
| Ricevute | COMPLETE | Collegabili a pagamento e fattura |
| Metodi di incasso | COMPLETE | `payment_methods` con commissioni configurabili |
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
| Kit, prodotti, inventario | COMPLETE | `/clothing` (4.082 righe), `clothing_*` |
| Assegnazioni kit | COMPLETE | `/api/clothing/assignments`, `kit_assignments` |
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
