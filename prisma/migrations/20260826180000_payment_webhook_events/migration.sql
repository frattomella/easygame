-- La memoria degli eventi gia ricevuti dal PSP (ADR-0045).
--
-- **Perche serve una tabella e non basta la firma.** La firma dice che
-- l'evento viene davvero dal provider. Non dice che sia la prima volta che
-- arriva, e non lo sara: Stripe riprova la consegna per tre giorni finche non
-- riceve un 2xx, e un rinvio manuale e a un clic di distanza nella sua
-- dashboard. Senza deduplica, un evento consegnato due volte registra
-- l'incasso due volte, e la rata di una famiglia risulta pagata il doppio.
--
-- La chiave e (provider, identificativo dell'evento presso il provider). Non
-- l'identificativo del pagamento: due eventi diversi possono riguardare lo
-- stesso pagamento — e devono poterlo fare, perche uno dice «autorizzato» e
-- l'altro «incassato».
--
-- **Cosa non c'e dentro.** Il corpo dell'evento. Contiene l'email di chi
-- paga, l'importo e i riferimenti dell'account connesso, e conservarlo
-- vorrebbe dire tenere una copia dei dati di pagamento in un posto in piu
-- senza che nessuno la legga. Restano il tipo, l'esito e — quando l'evento ne
-- porta uno — il riferimento esterno del pagamento.

CREATE TABLE "payment_webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "organization_id" UUID,
    "external_reference" TEXT,
    -- `processed` | `ignored` | `failed`
    "status" TEXT NOT NULL DEFAULT 'processed',
    "error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_webhook_events_provider_event_id_key"
    ON "payment_webhook_events"("provider", "event_id");

CREATE INDEX "payment_webhook_events_organization_id_idx"
    ON "payment_webhook_events"("organization_id");

-- `SET NULL` e non `CASCADE`: se un club viene cancellato, la traccia di cosa
-- il PSP aveva comunicato non deve sparire con lui.
ALTER TABLE "payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "clubs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
