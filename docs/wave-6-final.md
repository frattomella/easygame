# WAVE 6 — FINAL

> Verbale della revisione finale. Segue l'handoff
> [`wave-6-handoff.md`](wave-6-handoff.md) (fotografia dello stato **prima**).
> Data: **2026-09-03**.

## Verdetto

**WAVE 6 = DONE.** Critical 0 / High 0 sui sei finding ricevuti (sei
confermati, zero falsi positivi); gate tutti verdi; staging `READY` su HEAD
con smoke e prova del rate limiting superati; nessun deploy in produzione;
KB aggiornata; working tree pulito. Restano fuori dal codice i due blocker
esterni W6-4 e W6-5 (§5).

## 1. Repository

| | |
|---|---|
| Branch | `integration/web-v1` |
| HEAD di partenza | `862069a` — `docs(wave-6): l'handoff per la revisione finale` (l'handoff dichiarava `2641ed7`: e il commit precedente, quello dell'handoff stesso) |
| Working tree di partenza | pulito |
| Migrazioni | 53, `Database schema is up to date!`, nessuna nuova |
| Ambiente | Docker `easygame-dev-db` su 5434, `EASYGAME_DB_ENV=development` |

## 2. I sei High dell'handoff (§8): riprodotti, misurati, chiusi

Regola applicata a ognuno: **riprodurre → misurare → classificare → correggere
la causa → regressione con controprova positiva → non vacuita reintroducendo il
difetto**. Nessuno si e rivelato un falso positivo.

| # | Finding | Riproduzione (prima) | Esito | Correzione | Prova |
|---|---------|----------------------|-------|------------|-------|
| B-H1 | il contatore OTP conta le raffiche | 60 codici sbagliati in parallelo dalla rotta → `attempts = 1`, challenge viva, **codice giusto accettato dopo** | **CONFERMATO** (Critical: presa di possesso, con B-H2) | il tentativo si **spende** in una scrittura condizionata prima di giudicare il codice; consumo solo se ancora viva; stessa primitiva nel reset password | U-70 (sonda), `otp-tentativi-atomici.test.mjs` |
| B-H2 | il contatore di frequenza si azzera in parallelo | **21/40 ammesse** a freddo, 19/40 a finestra scaduta, contro limite 5; in sequenza 5/10 corretto | **CONFERMATO** (High: tutti i contatori) | un solo `INSERT … ON CONFLICT DO UPDATE … RETURNING`: unico proprietario, atomico anche fra istanze serverless | U-69 (sonda, funzione + rotta), emulazione nel doppio |
| B-H3 | l'importo di una rata riscritto dal registro generico | rata `paid` 130 → 500 da `updateResource("payments")`, stato `paid` conservato | **CONFERMATO** (Critical: denaro) | `amount`/`due_date`/`athlete_id` fissati su rata saldata o annullata; su rata aperta scrittura nel lock + `recomputeChargeFromLedger`; vale anche per l'alias | U-71, `rata-importo-registro-generico.test.mjs` |
| B-H4 | due approvazioni simultanee → due schede | `['OK','OK']`, 2 schede per lo stesso minore | **CONFERMATO** (Critical: minori, integrita) | presa in esame con `updateMany` condizionato su `reviewed_at`, rilascio su errore, scadenza a 10 minuti | U-72, `forms-service.test.mjs` |
| B-H5 | l'anteprima non applica perimetro ne taglio clinico | ruolo recintato su sede A → anteprima sul minore della sede B con valore attuale del nome e allergie | **CONFERMATO** (Critical: minori, salute) | `athleteWithinAccessScope` prima del confronto; `stripClinicalAthleteFields` per chi non ha `clinical.read` | U-73 (solo sonda: il doppio non valuta il perimetro) |
| B-H6 | `sport_work.manage` scrive prima nota | ruolo personalizzato senza `accounting.manage` → adempimento chiuso e riga in prima nota scritta | **CONFERMATO** (High: denaro, permessi) | `assertAccountingPermission(accounting.manage)` **prima** di marcare l'adempimento, solo quando si chiede la registrazione del versamento | U-74, `adempimento-prima-nota-permesso.test.mjs` |

**Non vacuita.** Con i sei difetti reintrodotti insieme (stash dei soli
`src/`), la sonda segna **14 controlli rossi su 24** nuovi, distribuiti su
tutti e sei i finding; le controprove positive restano verdi. Ripristinati i
sorgenti, 273/273.

**Una correzione alla correzione.** La prima stesura di B-H1 chiudeva la
challenge al tetto scrivendo `consumed_at`; il doppio in memoria ha mostrato
che quella scrittura competeva con il consumo di un codice giusto in volo
(dieci codici giusti simultanei → **zero** verifiche). Il tetto vive nel
`WHERE`; la scrittura in piu e stata tolta. Decisione in
[ADR-0109](knowledge-base/18-decision-log.md#adr-0109--un-contatore-che-difende-si-scrive-in-unistruzione-condizionata-sola-mai-letto-e-poi-scritto).

### Medium e Low dell'handoff

Fuori dal perimetro della revisione (che copre le correzioni e le loro
regressioni). Classificati come debito con motivo e priorita in
[16 — Debito tecnico](knowledge-base/16-technical-debt.md) (`W6-D32`,
`W6-D33`). Nessuno e cross-tenant, fuga di dato di minore o clinico, o denaro
duplicato. Da riprodurre per primi alla prossima tornata: `M-1`, `M-3`, `M-8`
(denaro e saldi).

Due difetti nuovi, trovati scrivendo le prove e dichiarati come debito:
`W6-D30` (un'approvazione fallita **dopo** aver creato la scheda la ricrea al
tentativo successivo — non e una corsa) e `W6-D31` (i candidati duplicati
dell'anteprima escono da tutto il club, nome e data di nascita).

## 3. Gate completo su HEAD

| Gate | Esito |
|------|-------|
| `npm test` | **4.564 / 4.564** (erano 4.543; +21) |
| `npm run typecheck` | pulito |
| `npm run lint` | **0 errori**, 36 warning (invariati, tutti `no-img-element`) |
| `npm run build` | completa |
| `npm run wave6:uat` | **78 / 78** |
| `npm run wave6:roles` | **52 / 52** |
| `npm run wave6:security` | **273 / 273** (erano 249; +24: U-69…U-74) |
| Sonde di rate limiting | U-69 (40 simultanee, finestra scaduta, dalla rotta), U-70 (60 simultanee da 50 indirizzi) — **PASS** |
| `npx prisma migrate status` | 53 migrazioni, nessuna pendente, nessuna nuova |
| Schema drift | nessuno (nessuna modifica a `schema.prisma`) |

## 4. File toccati

| Area | File |
|------|------|
| Correzioni | `src/lib/server/auth-rate-limit.ts`, `auth-workflows.ts`, `resources.ts`, `form-submissions.ts`, `sport-work-agenda.ts` |
| Sonda | `scripts/wave-6-security-probe.mjs` (U-69…U-74) |
| Test nuovi | `tests/auth/otp-tentativi-atomici.test.mjs`, `tests/server/rata-importo-registro-generico.test.mjs`, `tests/server/adempimento-prima-nota-permesso.test.mjs` |
| Test aggiornati | `password-reset`, `forms-service` (+3), `form-submissions-documents`, `iscrizione-servizio`, `helpers/fake-prisma.mjs` (emulazione dell'unica istruzione SQL grezza) |
| KB | `14-security` (sezione «revisione finale»), `16-technical-debt` (W6-D23 aggiornata, W6-D30…D33), `18-decision-log` (ADR-0109), `20-work-packages`, `CLAUDE.md` (conteggio test) |

Nessun cambio di contratto API, nessuna variabile d'ambiente nuova, nessuna
migrazione, nessun file mobile.

## 5. Blocker production che restano

1. **W6-4 · Policy dei consensi** — validazione **legale** esterna: non e codice.
2. **W6-5 · Dato clinico per singolo operatore** — decisione di prodotto (allargare `clinical.read` a `trainer` nel catalogo, o una concessione per persona che oggi non ha modello).
3. **Nessun progetto production nello scope Vercel.** Esistono `easygame-staging` e `easygamemobile` (il progetto della app mobile, non toccato): un deploy in produzione richiede un progetto che non c'e e un'autorizzazione esplicita.

## 6. Staging

| | |
|---|---|
| Progetto | `mefrancesco2007-5434s-projects/easygame-staging` (nessun progetto production nello scope; `easygamemobile` e la app mobile, non toccata) |
| Prima del deploy | ultimo deploy del 31 agosto, **53 commit** indietro rispetto a HEAD (l'handoff diceva 33: la differenza sono i commit di revisione arrivati dopo) |
| Deploy | commit `7d20b69`, `npx vercel --prod` — `● Ready` in 3 minuti |
| URL | `https://easygame-staging-b46uvhf7w-mefrancesco2007-5434s-projects.vercel.app` (alias `https://easygame-staging-pi.vercel.app`) |
| Migrazioni | il deploy ha applicato **13 migrazioni** pendenti (da `wave5_evento_sportivo` a `wave6_liquidazione_e_una_entrata`): «All migrations have been successfully applied» |

### Smoke (senza sessione: nessuna credenziale e stata usata)

| Superficie | Esito |
|------------|-------|
| `/`, `/login`, `/register`, `/api/v1/registry` | 200 |
| `/api/v1/auth/session` senza cookie | 200, `session: null` |
| `/api/v1/athletes` senza sessione | 401 |
| `/dashboard`, `/parent-view`, `/trainer-dashboard`, `/athlete-dashboard`, `/dashboard/access-management`, `/permissions`, `/documenti`, `/appuntamenti`, `/payments`, `/calendar`, `/modulistica`, `/audit`, `/sport-work`, `/movements` | 307 → `/login?next=…` (protette, raggiungibili) |
| `/forms/<slug inesistente>`, `/pay/<token inesistente>` | 200 con stato «non trovato» lato client; `/api/public/enrollment-status/<inesistente>` 404 |

### Rate limiting sull'ambiente vero (serverless, piu istanze)

| Prova | Esito |
|-------|-------|
| conferma OTP, 12 richieste in sequenza, stesso `userId` e indirizzo (limite 5) | `400 ×5`, poi `429 ×7` |
| conferma OTP, **20 richieste in parallelo** | **esattamente 5** `400` e 15 `429` — il contatore regge la concorrenza fra istanze |
| login con password sbagliata, 14 in sequenza (limite per identita 10) | `401 ×10`, poi `429 ×4` |

### Aree per ruolo

| Area | Esito | Nota |
|------|-------|------|
| Club | PASS | dashboard e sotto-pagine protette e raggiungibili; API 401 senza sessione |
| Parent | PARTIAL | `/parent-view` raggiungibile e protetta; il flusso con sessione (figli, rate, RSVP) va percorso nel collaudo manuale, §7 |
| Trainer | PARTIAL | `/trainer-dashboard` raggiungibile e protetta; appello e «I miei compensi» nel collaudo manuale |
| Athlete | PARTIAL | `/athlete-dashboard` raggiungibile e protetta; account atleta nel collaudo manuale |
| Custom roles | PARTIAL | `/dashboard/access-management` e `/permissions` protette; il restringimento e provato a runtime dalla sonda `wave6:roles` (52/52) sul database di sviluppo, non ancora con un clic su staging |

Il motivo dei `PARTIAL` e uno solo: lo smoke non ha aperto nessuna sessione,
perche non e stata usata nessuna credenziale. Tutto cio che una sessione
mostra e coperto dalle tre sonde a runtime (403 controlli) e va confermato
dal collaudo manuale del §7.

## 7. Checklist per il collaudo manuale su staging

Flussi che una persona deve percorrere dal clic alla riga scritta. Un punto
per riga; «⚠» segna cio che questa revisione ha toccato.

**Club (owner / segreteria)**
1. Login con email e password; sbagliare la password 11 volte di fila → il dodicesimo tentativo risponde «troppi tentativi» anche se corretto; dopo 15 minuti si rientra. ⚠
2. Registrare un nuovo utente, ricevere l'OTP, sbagliarlo 5 volte → il sesto (anche giusto) e rifiutato; «invia di nuovo» genera un codice nuovo che funziona. ⚠
3. Dashboard Club: sedi, categorie, stagione attiva, sidebar a 375 / 768 / 1280 px.
4. Movimenti: registrare un incasso su una rata, verificare stato e residuo; provare a modificare l'**importo** di una rata gia pagata dalla scheda atleta e dalla lista rate → rifiutato con messaggio chiaro; modificare la **descrizione** → accettato. ⚠
5. Modificare l'importo di una rata **aperta** con un acconto → lo stato cambia da solo (saldata o parziale). ⚠

**Custom roles / Access management**
6. Creare un ruolo personalizzato su base `collaborator` con sole `documents.review` e `appointments.read`; assegnarlo a una tessera; entrare con quella tessera: le voci di menu e le pagine negate coincidono con le chiavi tolte.
7. Ruolo personalizzato **recintato su una sede**: nella coda delle compilazioni, «anteprima» con un atleta dell'altra sede → negato; con un atleta della propria sede → proposta visibile. ⚠
8. Ruolo con `sport_work.manage` e senza `accounting.manage`: chiudere un adempimento F24 **senza** conto/causale → chiuso; chiuderlo **con** conto e causale → negato, adempimento ancora aperto; con `owner` → riga in prima nota. ⚠
9. Coniare un codice di accesso, riscattarlo da un secondo account → tessera creata con il ruolo giusto; provare 11 codici inventati → 429.

**Enrollment / Forms**
10. Compilare il modulo pubblico da smartphone (375 px), inviare, ricevere il riferimento; controllare lo stato dalla pagina pubblica.
11. In segreteria: aprire la compilazione, anteprima, **approvare due volte in rapida successione** (doppio clic) → una scheda sola, seconda risposta «gia in esame / gia esaminata». ⚠
12. Approvare chiedendo un documento mancante → richiesta documentale aperta sulla scheda; rifiutare un'altra compilazione con nota.

**Documents**
13. Club: creare una richiesta documentale su un atleta; famiglia: caricare il file dall'area genitore; club: accettare o respingere; lo stato si aggiorna in tutte e tre le aree (club, famiglia, atleta).
14. Un ruolo senza `clinical.read` non vede il contenuto del certificato medico ma ne vede lo stato.

**Appointments**
15. Club: creare uno slot ricorrente; famiglia: prenotare; club: riprogrammare → la vecchia prenotazione risulta chiusa e ne esiste una nuova; due famiglie sullo stesso orario → la seconda riceve «orario appena preso».

**Parent**
16. Genitore con **due figli** in categorie diverse: cambio figlio, calendario, RSVP a una convocazione, rate e ricevute del figlio giusto, nessun dato dell'altro figlio di un'altra famiglia.
17. Pagare una rata dal link di pagamento (modalita test) → rata saldata, ricevuta visibile.

**Trainer**
18. Allenatore: vede solo i propri gruppi; fa l'appello dalla propria rotta; non vede IBAN/CF dei colleghi; «I miei compensi» mostra solo i propri.

**Athlete**
19. Atleta con account: dashboard con calendario, convocazioni, documenti propri; nessun accesso ai dati economici del club.

**Multi-tenant**
20. Utente con tessere in due club: cambiare club attivo e verificare che elenchi, rate, documenti e appuntamenti cambino tutti insieme; un identificativo dell'altro club nell'URL risponde «non trovato».
