# Iscrizioni online e modulistica — secondo lotto del redesign (2026-09-16)

Branch `feat/web-redesign`, da `d766ca8`. Ambienti: Vercel
`easygame-redesign-staging`, Neon `web-redesign-staging`
(`br-hidden-salad-alm93r7e`, endpoint `ep-dry-block-alkxdiiu`). Nessun
altro ambiente toccato.

## 1. Trace del sistema esistente (prima di decidere)

Tre agenti in sola lettura hanno tracciato il codice reale; il dettaglio con
i riferimenti a file e riga sta nei rapporti del lotto, qui il verdetto per
area.

| Area | Cosa c'era | Verdetto |
|------|-----------|----------|
| Modelli di modulo | `form_templates` (bozza JSON `FormSchema`), `form_template_versions` (immutabili), slug pubblico a 48 bit | **canonico**, esteso |
| Compilazioni | `form_submissions` (`pending · approved · rejected`, `version_id`, `subjects`, `answers`, `files` come riferimenti, `receipt_token_hash`, `dedup_key`) | **canonico**: e la pratica; esteso (ADR-0189) |
| Scrittura in anagrafica | solo `decideFormSubmission` → `createResource("athletes")`, `syncEnrollmentMembership`, `upsertGuardianFromFormApproval` (recapito, nessuna autorita), consensi, documento generato, presa in esame con `updateMany` | **canonico**, esteso con `request_changes`, `archive`, `trialAthleteId`, `converted` |
| Catalogo dei dati | `DYNAMIC_FIELDS` chiuso, server-side, con `writable`; opzioni di sede/categoria iniettate dal server | **canonico** = il catalogo dei campi pubblici |
| Modulo pubblico | `/forms/:slug`, `GET|POST /api/public/forms/:slug`, rate limit, 404 unico, multipart, MIME allowlist, bozza nel browser | **canonico**, esteso con bozza sul server |
| Ricevuta | `/iscrizione/:reference`, 256 bit, hash, sola lettura | **canonico**, esteso con l'integrazione |
| Consensi | `consent_definitions/versions/records` append-only, `FormField.consentKey` | **canonico**, esteso con `legalKind` e `declarations` |
| Firma | `signature` = PNG allegato; `generated_documents.signed` = copia caricata | **canonico**, rinominato «firma disegnata (evidenza grafica)» |
| Editor documenti | `DocumentEditor.tsx`: `contentEditable` + `execCommand`, sanificazione solo client, immagini base64 | **sostituito** (ADR-0190) |
| Renderer moduli | `form-renderer.tsx`, uno solo | **canonico**, esteso |
| PDF | nessun motore server; stampa del browser | invariato (D38) |
| Audit | `recordAuditEvent`, chiamato solo dalla rotta per approve/reject | esteso: ogni transizione e i modelli |
| Data subject | pratiche proprie cancellate, condivise anonimizzate | esteso: `athlete_id` e allegati delle revisioni |
| Permessi | `forms.submissions.read/review`; modelli governati dalla matrice generica `forms` | esteso con sei chiavi |
| Legacy | `clubs.document_templates`, `/api/forms/assets`, `simplified-db.saveDocumentTemplate*` (senza chiamanti) | non toccati (D28, W5-41) |

## 2. Catalogo dei campi dell'atleta (§10 del mandato)

Fonte: `athletes` (14 colonne) e `athletes.data` (censite 40 chiavi). La
classificazione vive nel catalogo dei dati (`src/lib/forms/dynamic-fields.ts`:
un campo e chiedibile dal pubblico **solo** se ha una chiave `athlete.*` /
`guardian.*` scrivibile) e nel vaglio di scrittura.

| Classe | Campi | Come si fa valere |
|--------|-------|-------------------|
| PUBLIC_ENROLLMENT_ALLOWED | nome, cognome, data e luogo di nascita, codice fiscale, sesso, nazionalita, email, telefono, indirizzo (via, numero, comune, CAP, provincia, regione, paese), contatto di emergenza, taglie, sede e categoria (opzioni del server), dati del genitore/tutore (nome, cognome, parentela, telefono, email) | `DYNAMIC_FIELDS` con `writable`; il club decide visibile/obbligatorio/facoltativo/non richiesto per ogni campo |
| CLUB_ONLY | stato, categoria/sede/gruppo come identita, tesseramenti, certificato medico e campi clinici (`CLINICAL_ATHLETE_FIELDS`, `clinical.manage`), note, numero di maglia, piano di pagamento e stato economico, documenti d'identita interni, `billingGuardianIndex` | non nel catalogo pubblico; scrivibili solo dalla scheda con i permessi del dominio |
| SYSTEM_MANAGED | `id`, `organization_id`, `user_id` (solo `athlete-accounts.ts`), `access_code`, `anonymized_at`, `created_at/updated_at`, proiezioni `guardians[]`, `categoryMemberships[]`, `trialOriginId`, registri dei tutori | il registro generico li toglie o li rifiuta |
| ENROLLMENT_CUSTOM_FIELD | qualunque campo senza `binding` | resta nella pratica (`answers`), mai copiato in `athletes.data` |

## 3. Migrazioni e copie di sicurezza

| Migrazione | Ambiente | Copia | Riscrittura di dati |
|------------|----------|-------|---------------------|
| `20260916200000_adr0189_pratiche_di_iscrizione` | `web-redesign-staging` | `br-sparkling-butterfly-al5o6a2g` (2026-09-16T12:32Z) | nessuna: colonne nullable/default e due tabelle nuove; 0 righe in `form_submissions` sul redesign al momento dell'applicazione |

Rollback: il codice precedente ignora le colonne nuove; le tabelle nuove non
sono referenziate da niente altro.

## 4. Cio che questo lotto NON fa (rinviato e dichiarato)

- Allegati in bozza; OTP sul recapito; retention automatica; cancellazione
  bozze per recapito (D-RD-23).
- FEA/FEQ, marca temporale, conservazione a norma, PDF server (D-RD-24, D38).
- Promozione dello staging ufficiale (§54).
