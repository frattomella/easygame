-- Uno storno solo per ogni rimborso del provider (ADR-0062, lato uscita).
--
-- **Il gemello del difetto sugli incassi.** Un rimborso genera due eventi —
-- `charge.refunded`, che porta il *charge*, e `charge.refund.updated`, che
-- porta il *rimborso* — e Stripe li consegna insieme: nel collaudo del Blocco E
-- i due storni sono stati scritti a **sette millisecondi** di distanza.
--
-- Il controllo applicativo in `recordRefundTransaction` cerca gia se quel
-- rimborso sia stato registrato, ma e una lettura seguita da una scrittura: con
-- due invocazioni concorrenti entrambe leggono «non c'e». La famiglia si vede
-- restituire una somma e stornare il doppio.
--
-- **Perche l'indice e parziale.** Perche vale solo per il denaro che **esce**:
--
--   * gli **incassi** hanno importo positivo e il proprio indice
--     (`payment_transactions_incasso_unico`);
--   * gli **storni manuali** registrati dalla segreteria non hanno un
--     riferimento del provider — sono `NULL` — e restano fuori.
--
-- Resta quindi: **al piu un movimento negativo per (club, riferimento del
-- provider)**. Due rimborsi parziali dello stesso incasso hanno due `re_…`
-- diversi e non collidono, che e cio che deve succedere.

CREATE UNIQUE INDEX IF NOT EXISTS "payment_transactions_storno_unico"
  ON "payment_transactions" ("organization_id", "external_reference")
  WHERE "external_reference" IS NOT NULL
    AND "amount" < 0;
