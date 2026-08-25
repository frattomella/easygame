# 19 — Roadmap

Principio guida: **stabilizzare cio che esiste prima di aggiungere.**
Non e prevista alcuna riscrittura dell'applicazione.

**Priorita assoluta corrente ([ADR-0025](18-decision-log.md#adr-0025--mobile-app-differita-la-priorita-e-easygame-web-v1-responsive)):**
completare **EasyGame Web V1** e renderla pienamente utilizzabile da desktop,
tablet e smartphone. La **Mobile App e DIFFERITA**: nessuna nuova funzionalita
mobile fino a una decisione esplicita.

I lavori concreti sono in [20 — Work Package](20-work-packages.md).

## Fasi

```
F1  Fondamenta        →  F2  Stabilizzazione Web V1  →  F3  Completamento
     (WP-01..WP-06, WP-09)     (WP-07..WP-12, WP-31..WP-43)      (WP-13..WP-16)
                                                                 ↓
                                                     F5  Production readiness
                                                          (WP-26..WP-29)
                                                                 ↓
                                                     F6  Evoluzione (WP-30+)

F4  Mobile (WP-21..WP-25) — DIFFERITA, fuori dal percorso critico
```

### F1 — Fondamenta per lo sviluppo assistito — **COMPLETATA** (2026-08-22)

**Obiettivo:** rendere il repository lavorabile in parallelo, senza sorprese.

Fatto: cleanup, KB, CI con guardrail, route guard su tutte le aree, database di
sviluppo separato con guardia sulle scritture, rimozione dell'accesso diretto
al database dal mobile, isolamento multi-tenant coperto da test a runtime,
audit log, reset password.

**Criterio di uscita raggiunto:** ogni push passa automaticamente test,
typecheck, lint, build e guardrail di sicurezza; nessun comando npm puo
alterare per errore un database condiviso.

Resta fuori: lo scheduler della purge dell'audit e la UI di consultazione
(WP-16), e il branch Neon di sviluppo (WP-09, richiede la console).

### F2 — Stabilizzazione Web V1

**Obiettivo:** rendere il backend la fonte di verita delle regole di dominio e
togliere le fragilita strutturali.

Estrazione incrementale della logica da `simplified-db.ts` a
`src/lib/server/`, transazionalita della sincronizzazione club, filtro
stagione server-side, paginazione, validazione con `zod`.

Con [ADR-0025](18-decision-log.md#adr-0025--mobile-app-differita-la-priorita-e-easygame-web-v1-responsive)
la fase assorbe anche i difetti che colpiscono l'uso quotidiano del Web:
performance delle liste grandi (WP-31), consistenza di stagioni e risorse club
(WP-32), correttezza del dominio pagamenti (WP-33) e responsivita verificata
(WP-34).

Il lavoro procede a **blocchi**, ognuno chiuso da un commit con i gate verdi:

| Blocco | Contenuto | WP |
|--------|-----------|-----|
| 1 | Performance, stagioni, pagamenti | WP-31, WP-32, WP-33 |
| 2 | Costo delle scritture e autosave | WP-36 |
| 3 | Identita visiva, topbar, console di piattaforma, responsivita sistemica | WP-37, WP-34 |
| 4 | Account, onboarding, produttivita gestionale | WP-38, WP-39, WP-40, WP-41, WP-42, WP-43 |
| 5 | Gruppi numerazione, compatibilita categorie, ordinamento | WP-44 |
| 6 | Gestione completa delle stagioni, topbar definitiva | WP-35, WP-45 |
| 7 | Anagrafiche, staff, allegati, coerenza UI | vedi [21 — Backlog master](21-backlog.md), voci `B7-*` |

**Criterio di uscita:** le regole di business critiche (permessi, scoping,
calcoli economici) sono applicate server-side e coperte da test; la pagina
Atleti di un club reale carica in pochi secondi; ogni pagina toccata resta
usabile a 375 px, 768 px e 1280 px.

### F3 — Completamento funzionale

**Obiettivo:** chiudere le capability `PARTIAL` e `MISSING` che il prodotto
promette.

Reset password, pagamenti online reali (o rimozione esplicita della promessa),
scheduler per promemoria certificati e automazione allenamenti, report
esportabili, audit log.

**Criterio di uscita:** nessuna capability dichiarata `COMPLETE` senza flusso
end-to-end e test.

### F4 — Mobile — **DIFFERITA** (2026-08-22)

Sospesa da [ADR-0025](18-decision-log.md#adr-0025--mobile-app-differita-la-priorita-e-easygame-web-v1-responsive).
Non e cancellata: riprendera quando il Web V1 sara completo e responsive.

Sul codice `easygamemobile/` restano ammessi **solo** le correzioni di
sicurezza e gli adeguamenti resi necessari da un cambio di contratto API
deciso lato Web. Il progetto resta nella CI e continua a essere compilato.

**Obiettivo alla ripresa:** portare l'app mobile da prototipo trainer a
prodotto distribuibile — un solo layer dati, rimozione dei mock e delle
schermate v1, copertura funzionale trainer allineata al Web, test, build EAS.

**Criterio di uscita:** build firmata installabile, flusso trainer completo,
test presenti.

### F5 — Production readiness

**Obiettivo:** poter dichiarare la produzione supportabile.

Chiarimento e formalizzazione dell'ambiente di produzione, separazione dei
database, error tracking, backup e restore provati, runbook operativo, UAT
strutturato.

**Criterio di uscita:** esiste una procedura scritta e provata per rilasciare,
diagnosticare e ripristinare.

### F6 — Evoluzione

Solo dopo F1–F5: internazionalizzazione, push notification, object storage,
estrazione del dominio in un servizio autonomo (prerequisito per un'eventuale
Cedi Platform), analytics.

## Vincolo Cedi Platform

Nessuna attivita .NET in nessuna fase. Il modo corretto di prepararsi e
**F2**: piu la logica di dominio e server-side e isolata, piu una futura
estrazione e un lavoro di trasporto e non di riscrittura.

Regola operativa permanente: nessun nuovo accoppiamento a servizi proprietari
dell'hosting. Vedi [ADR-0007](18-decision-log.md).

## Decisioni deliberate — tutte chiuse il 2026-08-22

Le questioni A1–A9 aperte dall'audit sono state **decise dal proprietario del
prodotto**. Sono vincolanti e registrate come ADR in
[18 — Decision log](18-decision-log.md).

| # | Decisione presa | ADR |
|---|-----------------|-----|
| A1 | Production **non attivata**; staging e l'ambiente ufficiale fino alla UAT finale | [ADR-0011](18-decision-log.md) |
| A2 | **DB/branch Neon separato** per development; il locale non scrive su staging | [ADR-0012](18-decision-log.md) |
| A3 | Pagamenti **in roadmap**, passeranno da **CediPay / Platform.Payments** | [ADR-0013](18-decision-log.md) |
| A4 | `/hub` **resta statico** | [ADR-0014](18-decision-log.md) |
| A5 | Reset password **obbligatorio prima della produzione**, via SMTP | [ADR-0015](18-decision-log.md) |
| A6 | Si eliminano **solo** i residui gia classificati `SAFE TO DELETE` | [ADR-0016](18-decision-log.md) |
| A7 | `.babelrc` si rimuove **solo se SWC supera tutti i gate** | [ADR-0017](18-decision-log.md) |
| A8 | Il mobile usa **solo le API EasyGame**; rischio Drizzle/Express/`db:push` **rimosso** | [ADR-0018](18-decision-log.md) |
| A9 | Privacy, retention e audit **bloccanti per la produzione** | [ADR-0019](18-decision-log.md) |

Decisioni aggiuntive prese nella stessa sede:

| Decisione | ADR |
|-----------|-----|
| Web e Mobile restano nello **stesso repository**, con confini espliciti | [ADR-0020](18-decision-log.md) |
| Backend **TypeScript** per la V1, nessuna migrazione .NET; ridurre progressivamente la logica client-side | [ADR-0021](18-decision-log.md) |
| Workflow: **locale → test/build → commit → staging → UAT → production solo autorizzata** | [ADR-0022](18-decision-log.md) |
| **Mobile App differita**; priorita assoluta a Web V1 completo e responsive | [ADR-0025](18-decision-log.md#adr-0025--mobile-app-differita-la-priorita-e-easygame-web-v1-responsive) |
