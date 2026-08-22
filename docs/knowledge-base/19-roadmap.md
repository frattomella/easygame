# 19 — Roadmap

Principio guida: **stabilizzare cio che esiste prima di aggiungere.**
Non e prevista alcuna riscrittura dell'applicazione.

I lavori concreti sono in [20 — Work Package](20-work-packages.md).

## Fasi

```
F1  Fondamenta        →  F2  Stabilizzazione Web V1  →  F3  Completamento
     (WP-01..WP-06, WP-09)          (WP-07..WP-12)                (WP-13..WP-16)
                                    ↓                            ↓
                        F4  Mobile (WP-21..WP-25)    F5  Production readiness
                                                          (WP-26..WP-29)
                                                                 ↓
                                                     F6  Evoluzione (WP-30+)
```

### F1 — Fondamenta per lo sviluppo assistito

**Obiettivo:** rendere il repository lavorabile in parallelo, senza sorprese.

Cleanup completato, KB pubblicata, CI attiva, guardie di route uniformi, test
sulle aree critiche, rimozione dei rischi operativi (Drizzle nel mobile).

**Criterio di uscita:** ogni PR passa automaticamente test + typecheck + lint +
build; nessun comando puo alterare per errore il database.

### F2 — Stabilizzazione Web V1

**Obiettivo:** rendere il backend la fonte di verita delle regole di dominio e
togliere le fragilita strutturali.

Estrazione incrementale della logica da `simplified-db.ts` a
`src/lib/server/`, transazionalita della sincronizzazione club, filtro
stagione server-side, paginazione, validazione con `zod`.

**Criterio di uscita:** le regole di business critiche (permessi, scoping,
calcoli economici) sono applicate server-side e coperte da test.

### F3 — Completamento funzionale

**Obiettivo:** chiudere le capability `PARTIAL` e `MISSING` che il prodotto
promette.

Reset password, pagamenti online reali (o rimozione esplicita della promessa),
scheduler per promemoria certificati e automazione allenamenti, report
esportabili, audit log.

**Criterio di uscita:** nessuna capability dichiarata `COMPLETE` senza flusso
end-to-end e test.

### F4 — Mobile

**Obiettivo:** portare l'app mobile da prototipo trainer a prodotto
distribuibile.

Consolidamento a un solo layer dati, rimozione dei mock e delle schermate v1,
copertura funzionale trainer allineata al Web, test, build EAS.
Le aree parent e atleta arrivano solo dopo.

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

## Decisioni che richiedono approvazione del proprietario del prodotto

Queste **non** vanno prese da uno sviluppatore o da un agente:

| # | Decisione | Perche serve una scelta |
|---|-----------|-------------------------|
| A1 | **Ambiente di produzione** | Nello scope Vercel corrente non esiste un progetto production. Va chiarito se esiste altrove, se va creato, e con quale database |
| A2 | **Database locale separato** | Oggi `.env` punta a staging: ogni comando Prisma di scrittura in locale tocca staging. Serve un branch Neon dedicato allo sviluppo |
| A3 | **Pagamenti online** | Implementarli davvero (scelta del PSP, contratti, fee) oppure rimuovere la promessa dall'interfaccia |
| A4 | **`/hub`** | Il catalogo marketplace e statico: diventa reale o viene nascosto |
| A5 | **Reset password** | Oggi assente: se un utente perde la password non ha recupero self-service |
| A6 | **Rimozione dei residui v1** (trainer v1, schermate mobile v1, primitive UI inutilizzate) | Sono recuperabili da Git ma richiedono conferma che nessuna funzione debba essere riportata |
| A7 | **Rimozione di `.babelrc`** | Riabilita SWC e cambia la toolchain di compilazione |
| A8 | **Rimozione di Drizzle/Express dal mobile** | Elimina un rischio concreto per il database, ma tocca la struttura del progetto mobile |
| A9 | **Retention e privacy** | Il sistema tratta dati di minori e dati fiscali senza audit log ne policy di retention documentata |
