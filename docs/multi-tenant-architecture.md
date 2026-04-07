# Architettura Multi-Tenant

Per EasyGame la scelta consigliata non e un database separato per ogni club.

## Perche non un DB per club

- aumenta molto la complessita operativa
- complica backup, restore, migrazioni e monitoring
- rende piu difficile la futura app mobile
- obbliga il backend a gestire connessioni e provisioning per ogni nuovo club

## Scelta consigliata

Usare un solo database PostgreSQL con isolamento logico per tenant:

- ogni club e un tenant
- ogni tabella operativa contiene `organization_id`
- tutte le query applicative sono filtrate per `organization_id`
- il backend accetta il club attivo e verifica che l'utente appartenga a quel club

## Stato attuale del progetto

Nel progetto:

- i dati operativi sono gia legati al club tramite `organization_id`
- le API ora leggono il club attivo dalla richiesta
- le API verificano l'appartenenza dell'utente al club prima di leggere o modificare i dati
- gli endpoint club-scoped non restituiscono piu liste globali mischiate tra societa

## Evoluzioni consigliate

Passi successivi consigliati:

1. aggiungere indici composti per le query piu usate, ad esempio `organization_id + status` o `organization_id + created_at`
2. introdurre audit log per operazioni sensibili
3. centralizzare tutte le query club-scoped in servizi server dedicati
4. valutare Row Level Security se in futuro passerai a un access layer SQL piu rigido

## Regola pratica

Un solo database, tanti tenant, sempre isolati per `organization_id`.
