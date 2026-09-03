-- PP-01 §A — un evento di tre categorie ne dichiarava una sola.
--
-- `club_events.category_id` e la categoria **primaria** e resta tale: i lettori
-- storici la leggono e nessuno di loro cambia. Le altre categorie di un
-- allenamento multi-categoria vivevano dentro `payload.categories`, cioe in un
-- posto che nessuna query poteva interrogare: filtrare per la seconda categoria
-- non trovava l'evento, e un ruolo ristretto a quella categoria non lo vedeva
-- affatto.
--
-- La colonna nuova le porta tutte, la primaria compresa e per prima.

ALTER TABLE "club_events"
  ADD COLUMN "category_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- **Il travaso**: cio che il payload gia contiene diventa interrogabile.
--
-- L'ordine e quello di dichiarazione, non l'alfabetico: la primaria porta
-- `ord = 0` e viene per prima, le altre seguono nell'ordine in cui l'evento le
-- elenca. Un valore ripetuto conta una volta sola — un evento che dichiara due
-- volte la stessa categoria non e un evento di due categorie — e conserva la
-- **prima** posizione in cui compare.
UPDATE "club_events" AS e
SET "category_ids" = COALESCE(d.ids, ARRAY[]::TEXT[])
FROM (
  SELECT
    c.id,
    (
      SELECT array_agg(u.valore ORDER BY u.ord)
      FROM (
        SELECT t.valore, MIN(t.ord) AS ord
        FROM (
          SELECT btrim(c."category_id") AS valore, 0::bigint AS ord
          UNION ALL
          SELECT btrim(x.valore), x.ord
          FROM jsonb_array_elements_text(
                 CASE
                   WHEN jsonb_typeof(COALESCE(c."payload", '{}'::jsonb) -> 'categories')
                        = 'array'
                     THEN COALESCE(c."payload", '{}'::jsonb) -> 'categories'
                   ELSE '[]'::jsonb
                 END
               ) WITH ORDINALITY AS x(valore, ord)
        ) AS t
        WHERE t.valore IS NOT NULL AND t.valore <> ''
        GROUP BY t.valore
      ) AS u
    ) AS ids
  FROM "club_events" AS c
) AS d
WHERE e.id = d.id;

-- Il filtro per categoria e la strada piu battuta del calendario.
--
-- Indice GIN sulla sola colonna: un GIN multicolonna che comprenda anche
-- `organization_id` richiederebbe l'estensione `btree_gin`, cioe una dipendenza
-- dell'ambiente. Il filtro per club resta il btree che c'e gia.
CREATE INDEX "club_events_category_ids_idx" ON "club_events" USING GIN ("category_ids");
