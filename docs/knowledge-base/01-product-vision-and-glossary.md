# 01 — Product vision e glossario

## Cos'e EasyGame

EasyGame e un **gestionale multi-tenant per ASD, associazioni e societa
sportive** italiane. Un singolo deployment serve piu societa; ogni societa
(«club») vede solo i propri dati.

Il prodotto copre il ciclo di vita gestionale di una societa sportiva:
anagrafiche (atleti, allenatori, staff, soci), attivita sportiva (categorie,
allenamenti, partite, convocazioni, presenze), documentale (certificati medici,
modulistica, procure, moduli online firmabili), amministrazione (quote, incassi,
fatture, ricevute, movimenti, sponsor) e comunicazione (notifiche, email).

L'interfaccia e **in italiano**. Anche i messaggi di errore delle API sono in
italiano: e una scelta deliberata, non un difetto (vedi
[ADR-0006](18-decision-log.md)).

## Attori

| Attore | Descrizione | Superficie principale |
|--------|-------------|-----------------------|
| **Platform admin** | Gestore della piattaforma EasyGame (non del singolo club) | `/private/easygame-platform-admin-0c7a` |
| **Owner** | Chi ha creato il club, proprietario | Area management |
| **Club manager** | Amministratore delegato del club | Area management |
| **Collaborator / Staff** | Segreteria e collaboratori, senza accesso alla configurazione | Area management (ridotta) |
| **Trainer** | Allenatore, opera su categorie assegnate | `/trainer-dashboard` + app mobile |
| **Parent** | Genitore/tutore di un atleta | `/parent-view/[athleteId]` |
| **Athlete** | Atleta | `/athletes/[id]/profile` |

## Glossario

| Termine | Significato nel codice |
|---------|------------------------|
| **Club** | La societa sportiva. Modello Prisma `Club`, tabella `clubs`. |
| **Organization** | **Sinonimo di Club.** Le API espongono sia `clubs` sia `organizations`, entrambi mappati sul delegate Prisma `club`. Le colonne di scoping si chiamano `organization_id`. |
| **Tenant** | Un club. L'isolamento e logico, per `organization_id`, su un unico database. |
| **Membership** | Riga di `organization_users`: lega un utente a un club con un ruolo. Un utente puo avere **piu ruoli nello stesso club** (unique su `organization_id + user_id + role`). |
| **Ownership** | Relazione `clubs.creator_id -> users.id`. Non passa da `organization_users`: chi ha creato il club e owner anche senza membership. |
| **Active club** | Il club selezionato dall'utente nella sessione corrente. Trasmesso alle API con l'header `x-active-club-id`. |
| **Active access role** | Il ruolo con cui l'utente sta operando nel club attivo. Header `x-active-access-role`. Serve perche un utente puo avere piu ruoli nello stesso club. |
| **Access area** | Macro-area di navigazione derivata dal ruolo: `management`, `trainer`, `parent`, `athlete`, `account`, `public`. Vedi `src/lib/access-roles.ts`. |
| **Season** | Stagione sportiva. Vive dentro `clubs.settings` (JSON), non in una tabella. Tre stati — futura, attiva, archiviata — con **una sola attiva** per club. Header `x-active-season-id`. Vedi [ADR-0031](18-decision-log.md). |
| **Riporto** | Copia della **configurazione** (categorie, sconti, piani, gruppi, programma, previsionale) da una stagione all'altra. Crea record nuovi, e idempotente, e non tocca mai i dati operativi della stagione di origine. |
| **Club resource** | Entita del club salvata in modo generico nella tabella `club_resource_items` (`resource_type` + `payload` JSON): categorie, allenamenti, partite, sponsor, strutture, ecc. |
| **Simplified\_\*** | Alias di compatibilita nel registro risorse (`simplified_athletes`, `simplified_payments`, ...). Puntano agli stessi delegate Prisma delle risorse non-alias. Retaggio, vedi [16 — Debito tecnico](16-technical-debt.md). |
| **Registry** | `src/lib/api/registry.ts` + `GET /api/v1/registry`: elenco macchina-leggibile degli endpoint, pensato per il client mobile. |
| **Procura** | Delega/mandato societario. Route `/procura`, risorsa club `procure`. |
| **Modulistica** | Modelli documentali del club. Route `/modulistica`, risorsa club `document_templates`. |
| **Soci** | Membri dell'associazione (diversi dagli atleti). Route `/soci`, risorsa club `members`. |
| **Movements** | Movimenti contabili. Route `/movements`, risorse club `transactions` / `transfers`. |

## Posizionamento futuro (Cedi Platform)

EasyGame **potrebbe** in futuro diventare un prodotto della Cedi Platform, con
un possibile backend .NET.

**Non e in corso alcuna migrazione .NET e non deve essere avviata ora.**

La conseguenza pratica per lo sviluppo e una sola: **non introdurre nuovo
accoppiamento** che renda difficile spostare la logica di dominio fuori da
Next.js. Vedi [ADR-0007](18-decision-log.md) e
[17 — Convenzioni](17-development-conventions.md).
