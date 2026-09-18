# Coerenza operativa su piu stagioni — ricostruzione sul pilota ed esito UAT (ADR-0198, 2026-09-18)

Branch `feat/web-redesign` · deploy `easygame-redesign-staging` · DB `web-redesign-staging` (`ep-dry-block-alkxdiiu`, backup `br-falling-dream-alcw0nur`). Fortitudo (4139ddd1) letta in **sola lettura**; scritture solo sul QA UAT Club (ae3d545b).

## Fortitudo — ricostruzione (sola lettura, `.codex-scratch/season/trace-fortitudo-2.mjs`)

- **Stagioni**: A `season-2026-2027` (1 lug 2026 → 30 giu 2027) · B `season-2026-09-01-2027-08-31-ru1uu` «2026/27» (1 set 2026 → 31 ago 2027), **attiva**, sovrapposta.
- **Allenatori sugli allenamenti**: le 40 voci del programma della B portano `trainerIds` (12 con 3, 23 con 2, 5 con 1) copiati dalla A dal riporto; gli eventi generati in B li scrivono in `club_events.trainer_ids` e `payload.trainerIds`. Dieci allenatori su undici hanno solo categorie della A; uno (F. Mella) ne ha 17 della B. Fonte esatta: **riferimento copiato sulla voce → snapshot dell'evento**, non una derivazione per nome.
- **Dashboard «non registrato»**: 5 eventi della B con appello (Scoiattoli 10/10, Pulcini 4/4, U14 Regionale 9/9, U14 Gold 12/12, U15 Ecc. A 2/3); la proiezione `clubs.trainings` ha `attendees=0` e nessun campo di appello: il riquadro leggeva quella.
- **40 → 50**: «Genera ora» con «7 giorni» alle 09:25 di giovedi 17: eventi dal 17 al **24** compresi (8 giorni), un solo `created_at`; per data 17:10 · 18:6 · 19:2 · 21:6 · 22:8 · 23:8 · 24:10. Voci con 1 occorrenza 30, con 2 occorrenze 10 (tutte del giovedi: 17 e 24). 30 + 20 = 50. Nessuna voce doppia, nessuna voce di A, nessuna ricorrenza multipla: era la finestra `<= oggi + N`.
- **Con il codice ADR-0198** (anteprima, nessuna scrittura, stesso istante, 7 giorni): 40/40 valide, 40 occorrenze tutte gia esistenti, 0 candidate, «generato fino al» 23/09; 35 voci nominano 9 allenatori non assegnati nella B (es. «Giovedì 17:00 Femminile: Leonardo Ortenzi»).

## QA UAT Club — esito

| Passo | Esito |
|---|---|
| 1-5 · 40 voci B con l'allenatore della A (`trainer-uat7-rossi` → Pulcini A) | anteprima: 40 valide, candidate senza allenatore, «40 sessioni nominano allenatori non assegnati» |
| 7-8 · assegnato a Pulcini B (colonna `trainers`) | candidate Pulcini con `trainer-uat7-rossi`, Esordienti senza; 20 voci ancora dette |
| 6-9 · storico | gli eventi della B generati prima conservano `trainer_ids` (snapshot); la A intatta |
| 10-12 · 13 assenti su 13 (08:00 Pulcini B) | rotta: recorded 13 / present 0 · Dashboard e Allenamenti: «0/14 presenti · REGISTRATO» |
| 32-38 · 13 presenti + 2 in prova (10:00) | rotta: recorded 15 / present 15 / roster 13 / trial 2 · Dashboard e Allenamenti: **15/14** (il 14° e la prova convertita, ora in rosa) · «Elenco presenze» 15 righe con «· in prova» |
| 16-20 · titolo | ovunque «Allenamento» + badge categoria; data e ora come campi; gli eventi vecchi con «Venerdì 18 Settembre» in archivio si mostrano come tipo |
| 21-25 · prova senza data | `POST` 201 con `birthDate: null`; conversione senza data 400 «indicala nella conversione», con data 200; il modulo dice «Data di nascita (facoltativo)» |
| 26-31 · omonimi | «Prova Uat8 Uno» → Atleta in prova; «Andrea Viola Qa» (atleta della A, B attiva) → «Esiste gia un atleta con lo stesso nome e cognome nel club · Atleta registrato · ATTIVO»; nessun merge/link |
| 39-45 · finestra | «7 giorni» alle 02:56 del 18/09: 0 candidate (40 esistenti dal 18 al 24), «generato fino al» 24/09; «Genera fino al 25»: 8 candidate (le voci del venerdi) |

Trovati e chiusi in UAT: il prefiltro degli omonimi per ogni parola («Qa» in ogni cognome del club) nascondeva l'omonimo dietro il tetto delle righe; l'organico atteso contava per **nome** gli atleti della A nei Pulcini della B (107 invece di 13).

Residui sul QA UAT Club (pulizia su autorizzazione): 13 appartenenze Pulcini B (`batchId uat8-pulcini-b`), appelli sugli eventi `edf27bd8` e `dc307a45`, prove «Prova Uat8 Uno» (in prova) e «Prova Uat8 Due» (convertita in atleta, nata 2015-04-05), assegnazione `trainer-uat7-rossi` → Pulcini B.
