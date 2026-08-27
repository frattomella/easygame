-- Un incasso solo per ogni pagamento del provider (ADR-0062).
--
-- **Perche non bastava il controllo applicativo.** Un pagamento riuscito
-- genera due eventi diversi — `payment_intent.succeeded` e
-- `checkout.session.completed` — che Stripe consegna praticamente insieme: nel
-- collaudo del Blocco E sono arrivati a **109 millisecondi** di distanza, ed
-- erano elaborati da due invocazioni distinte.
--
-- Il gestore del webhook cerca gia nel registro se quel denaro sia stato
-- incassato, ma e una lettura seguita da una scrittura: con due invocazioni
-- concorrenti entrambe leggono «non c'e» prima che una delle due scriva, e la
-- rata di una famiglia risulta pagata il doppio. Non e un caso raro da
-- laboratorio: si e verificato a **ogni** pagamento del collaudo.
--
-- La finestra si chiude solo dove la concorrenza si arbitra davvero, cioe nel
-- database. Il controllo applicativo resta: risponde nel caso normale — la
-- riconsegna a distanza di secondi — e da un messaggio comprensibile invece di
-- un errore di vincolo.
--
-- **Perche l'indice e parziale.** Perche il vincolo non vale per tutte le
-- righe:
--
--   * gli **storni** e i **rimborsi** copiano per costruzione
--     l'identificativo dell'incasso che compensano — e devono farlo, perche e
--     cosi che si ricollegano — e hanno importo negativo o nullo. Un indice
--     pieno li rifiuterebbe, cioe impedirebbe di rimborsare;
--   * gli incassi **manuali** (contanti, bonifico) non hanno un
--     identificativo del provider: sono `NULL`, e in Postgres due `NULL` non
--     collidono, ma l'esclusione esplicita rende la regola leggibile.
--
-- Resta quindi: **al piu un incasso positivo per (club, pagamento del
-- provider)**.

CREATE UNIQUE INDEX IF NOT EXISTS "payment_transactions_incasso_unico"
  ON "payment_transactions" ("organization_id", "external_payment_id")
  WHERE "external_payment_id" IS NOT NULL
    AND "amount" > 0;
