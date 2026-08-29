-- Wave 2 / W2-E — RSVP sull'evento (G-20, ADR-0086).
--
-- Due cose, in quest'ordine, perche la seconda non e possibile senza la prima.
--
-- 1. **La deduplica.** `training_attendance` non ha mai avuto una chiave
--    unica su (club, allenamento, atleta): il client compensava cancellando a
--    mano le righe in eccesso dopo averle trovate. Finche la riga porta solo
--    la presenza il difetto e sopportabile; con la risposta della famiglia
--    sulla stessa riga, due righe significano **due risposte contraddittorie**
--    per lo stesso atleta.
--
--    Sopravvive la riga **aggiornata piu di recente** — cioe l'ultima verita
--    scritta dall'appello — con `created_at` piu vecchio a parita di
--    aggiornamento, cosi la scelta e deterministica.
--
-- 2. **Le colonne dell'RSVP**, separate da `status`. `status` resta la
--    presenza registrata dall'allenatore e continua ad alimentare la misura
--    delle presenze dei bandi; `rsvp_status` e l'intenzione della famiglia e
--    non la tocca mai.

DELETE FROM "training_attendance" a
USING "training_attendance" b
WHERE a."organization_id" = b."organization_id"
  AND a."training_id" = b."training_id"
  AND a."athlete_id" = b."athlete_id"
  AND (
        a."updated_at" < b."updated_at"
     OR (a."updated_at" = b."updated_at" AND a."created_at" > b."created_at")
     OR (a."updated_at" = b."updated_at" AND a."created_at" = b."created_at" AND a."id" > b."id")
  );

ALTER TABLE "training_attendance" ADD COLUMN "rsvp_status" TEXT;
ALTER TABLE "training_attendance" ADD COLUMN "rsvp_note" TEXT;
ALTER TABLE "training_attendance" ADD COLUMN "rsvp_at" TIMESTAMP(3);
ALTER TABLE "training_attendance" ADD COLUMN "rsvp_by_user_id" UUID;

CREATE UNIQUE INDEX "training_attendance_event_athlete_unique"
    ON "training_attendance" ("organization_id", "training_id", "athlete_id");

CREATE INDEX "training_attendance_rsvp_idx"
    ON "training_attendance" ("organization_id", "athlete_id", "rsvp_status");
