-- PP-02 / WP-C — **tre reperti di una revisione indipendente.**
--
-- Il vaglio strutturale ha attaccato il passaggio con sonde che discriminano, e
-- ha trovato tre cose che le sonde di WP-C non guardavano. Due sono perdite di
-- dato, la terza e un'operazione legittima che l'invariante bloccava.
--
-- ## 1. Il travaso **fondeva due persone in una**
--
-- La chiave di una riga senza utenza e il suo indirizzo, e il travaso
-- raggruppava per chiave. Madre e padre con **un solo indirizzo di famiglia** —
-- che ADR-0114 chiama la configurazione ordinaria, non un caso limite —
-- collassavano percio in **una riga sola**, e `array_agg(...)[1]` teneva il
-- primo nome, il primo rapporto, il primo telefono. Il secondo genitore
-- spariva dall'anagrafica.
--
-- Misurato dalla revisione: la ricevuta usciva intestata **al minore**, perche
-- il tutore con il codice fiscale non c'era piu; `{{parent.2.*}}` restava
-- vuoto; e il `recordId` di una compilazione gia salvata indicava un'altra
-- riga.
--
-- **La correzione.** Ogni riga del blob resta una riga. Quando due righe dello
-- stesso atleta cadono sulla stessa identita, la **prima** la tiene e le altre
-- prendono una chiave propria — restano distinguibili, e continuano a portare
-- lo stesso indirizzo, quindi aprono esattamente come prima. Cio che si perde
-- e solo l'illusione che fossero la stessa persona.
--
-- ## 2. La proiezione **cancellava il codice fiscale del tutore**
--
-- `athlete_guardians` non aveva una colonna per il codice fiscale, l'indirizzo
-- e la data di nascita, e la proiezione riscrive l'elenco per intero: il primo
-- salvataggio di una scheda li azzerava per tutto il club, e non restava
-- **nessuna strada** per riscriverli — il modulo di iscrizione li raccoglie, e
-- nessuno li conservava.
--
-- Il codice fiscale del tutore e cio che finisce sulla ricevuta che una
-- famiglia porta in detrazione.
--
-- **La correzione.** Una colonna JSON per cio che non ha una colonna propria.
-- Non decide niente — nessun accesso, nessuna identita — e per questo si
-- perdeva senza che nessuna difesa se ne accorgesse.
--
-- ## 3. Il vaglio bloccava la cancellazione di un'utenza
--
-- `athlete_guardians.user_id` e `ON DELETE SET NULL`, che PostgreSQL esegue
-- come una **UPDATE**: il vaglio la rifiutava, e cancellare il proprio account
-- falliva con un errore opaco per chiunque fosse tutore di qualcuno.
--
-- La cascata dalla scheda aveva gia la sua deroga, riconosciuta dal fatto che
-- la scheda non esiste piu. Questa e la stessa deroga per l'utenza, e ha lo
-- stesso vaglio: si passa **solo** se l'utenza non c'e piu davvero, e solo per
-- azzerare quel riferimento.

SET LOCAL "easygame.guardian_writer" = 'on';

-- ---------------------------------------------------------------------------
-- 1. La colonna per cio che non ne ha una
-- ---------------------------------------------------------------------------

ALTER TABLE "athlete_guardians" ADD COLUMN IF NOT EXISTS "data" JSONB;

-- ---------------------------------------------------------------------------
-- 2. Il travaso, rifatto senza fondere
-- ---------------------------------------------------------------------------

DELETE FROM "athlete_guardians";

INSERT INTO "athlete_guardians" (
  "id", "organization_id", "athlete_id", "identity_key",
  "user_id", "email", "first_name", "last_name", "phone", "relationship",
  "contact_only", "linked_at", "revoked_at",
  "access_token_value", "access_token_status",
  "access_token_expires_at", "access_token_generated_at",
  "legacy_id", "position", "data", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  p."organization_id",
  p."athlete_id",
  -- **Una riga per riga, e la prima tiene la chiave.**
  --
  -- La seconda persona allo stesso indirizzo prende una chiave sua e conserva
  -- l'indirizzo nella colonna `email`: apre come prima — il ripiego guarda
  -- l'indirizzo, non la chiave — e smette di essere confusa con l'altra.
  CASE
    WHEN p."ordine_nella_chiave" = 1 THEN p."identity_key"
    ELSE 'riga:pos-' || p."athlete_id"::text || '-' || p."ord"::text
  END,
  p."user_id",
  p."email",
  p."first_name",
  p."last_name",
  p."phone",
  p."relationship",
  p."contact_only",
  p."linked_at",
  p."revoked_at",
  p."access_token_value",
  p."access_token_status",
  p."access_token_expires_at",
  p."access_token_generated_at",
  p."legacy_id",
  p."ord"::int,
  p."residuo",
  now(),
  now()
FROM (
  SELECT
    q.*,
    -- Quante righe di questo atleta hanno gia preso questa identita.
    row_number() OVER (
      PARTITION BY q."athlete_id", q."identity_key"
      ORDER BY q."ord", q."uid_ordine"
    ) AS "ordine_nella_chiave"
  FROM (
    SELECT
      a."id"              AS "athlete_id",
      a."organization_id" AS "organization_id",
      r."ord"             AS "ord",
      COALESCE(d."ordine", 1) AS "uid_ordine",
      NULLIF(btrim(r."g" ->> 'id'), '')                       AS "legacy_id",
      u."id"                                                  AS "user_id",
      acc."indirizzo"                                         AS "email",
      NULLIF(btrim(r."g" ->> 'name'), '')                     AS "first_name",
      NULLIF(btrim(r."g" ->> 'surname'), '')                  AS "last_name",
      COALESCE(
        NULLIF(btrim(r."g" ->> 'phone'), ''),
        NULLIF(btrim(r."g" ->> 'telefono'), '')
      )                                                       AS "phone",
      NULLIF(btrim(r."g" ->> 'relationship'), '')             AS "relationship",
      COALESCE(
        (r."g" ->> 'contactOnly')::boolean,
        (r."g" ->> 'contact_only')::boolean,
        false
      )                                                       AS "contact_only",
      CASE
        WHEN COALESCE(r."g" ->> 'linkedAt', r."g" ->> 'linked_at') ~ '^\d{4}-\d{2}-\d{2}'
          THEN (COALESCE(r."g" ->> 'linkedAt', r."g" ->> 'linked_at'))::timestamptz
        ELSE NULL
      END                                                     AS "linked_at",
      CASE
        WHEN COALESCE(r."g" ->> 'accessRevokedAt', r."g" ->> 'access_revoked_at') ~ '^\d{4}-\d{2}-\d{2}'
          THEN (COALESCE(r."g" ->> 'accessRevokedAt', r."g" ->> 'access_revoked_at'))::timestamptz
        ELSE NULL
      END                                                     AS "revoked_at",
      COALESCE(
        NULLIF(btrim(r."g" ->> 'parentAccessTokenValue'), ''),
        NULLIF(btrim(r."g" ->> 'parent_access_token_value'), ''),
        NULLIF(btrim(r."g" ->> 'accessTokenValue'), '')
      )                                                       AS "access_token_value",
      COALESCE(
        NULLIF(btrim(r."g" ->> 'parentAccessTokenStatus'), ''),
        NULLIF(btrim(r."g" ->> 'parent_access_token_status'), ''),
        NULLIF(btrim(r."g" ->> 'accessTokenStatus'), '')
      )                                                       AS "access_token_status",
      CASE
        WHEN COALESCE(r."g" ->> 'parentAccessTokenExpiresAt', r."g" ->> 'parent_access_token_expires_at', r."g" ->> 'accessTokenExpiresAt') ~ '^\d{4}-\d{2}-\d{2}'
          THEN (COALESCE(r."g" ->> 'parentAccessTokenExpiresAt', r."g" ->> 'parent_access_token_expires_at', r."g" ->> 'accessTokenExpiresAt'))::timestamptz
        ELSE NULL
      END                                                     AS "access_token_expires_at",
      CASE
        WHEN COALESCE(r."g" ->> 'parentAccessTokenGeneratedAt', r."g" ->> 'parent_access_token_generated_at', r."g" ->> 'accessTokenGeneratedAt') ~ '^\d{4}-\d{2}-\d{2}'
          THEN (COALESCE(r."g" ->> 'parentAccessTokenGeneratedAt', r."g" ->> 'parent_access_token_generated_at', r."g" ->> 'accessTokenGeneratedAt'))::timestamptz
        ELSE NULL
      END                                                     AS "access_token_generated_at",
      -- **Cio che non ha una colonna**: il codice fiscale, l'indirizzo, la data
      -- di nascita, e qualunque campo che il prodotto abbia accumulato. Si
      -- tiene per intero, tolte le chiavi che una colonna ce l'hanno.
      NULLIF(
        (r."g" - ARRAY[
          'id','name','surname','email','phone','telefono','relationship','role',
          'linkedUserId','linked_user_id','userId','user_id',
          'linkedUserIds','linked_user_ids',
          'linkedUserEmail','linked_user_email',
          'contactOnly','contact_only','accessRevokedAt','access_revoked_at',
          'linkedAt','linked_at',
          'parentAccessTokenValue','parent_access_token_value','accessTokenValue',
          'parentAccessTokenStatus','parent_access_token_status','accessTokenStatus',
          'parentAccessTokenExpiresAt','parent_access_token_expires_at','accessTokenExpiresAt',
          'parentAccessTokenGeneratedAt','parent_access_token_generated_at','accessTokenGeneratedAt'
        ]),
        '{}'::jsonb
      )                                                       AS "residuo",
      COALESCE(
        d."uid",
        acc."indirizzo",
        'riga:' || COALESCE(NULLIF(btrim(r."g" ->> 'id'), ''), 'pos-' || r."ord"::text)
      )                                                       AS "identity_key"
    FROM "athletes" a

    CROSS JOIN LATERAL (
      SELECT "valore" AS "g", "ordinalita" AS "ord"
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(a."data" -> 'guardians') = 'array'
               AND jsonb_array_length(a."data" -> 'guardians') > 0
            THEN a."data" -> 'guardians'
          ELSE
            CASE WHEN jsonb_typeof(a."data" -> 'parent1') = 'object'
                 THEN jsonb_build_array(a."data" -> 'parent1') ELSE '[]'::jsonb END
            ||
            CASE WHEN jsonb_typeof(a."data" -> 'parent2') = 'object'
                 THEN jsonb_build_array(a."data" -> 'parent2') ELSE '[]'::jsonb END
        END
      ) WITH ORDINALITY AS t("valore", "ordinalita")
    ) r

    CROSS JOIN LATERAL (
      SELECT COALESCE(
        NULLIF(lower(btrim(r."g" ->> 'linkedUserEmail')), ''),
        NULLIF(lower(btrim(r."g" ->> 'linked_user_email')), ''),
        NULLIF(lower(btrim(r."g" ->> 'email')), '')
      ) AS "indirizzo"
    ) acc

    LEFT JOIN LATERAL (
      SELECT "uid", row_number() OVER (ORDER BY "uid") AS "ordine"
      FROM (
        SELECT DISTINCT lower(btrim(x."valore")) AS "uid"
        FROM unnest(ARRAY[
          'linkedUserId', 'linked_user_id', 'userId', 'user_id',
          'linkedUserIds', 'linked_user_ids'
        ]) AS k("chiave")
        CROSS JOIN LATERAL (
          SELECT CASE
            WHEN jsonb_typeof(r."g" -> k."chiave") = 'array'  THEN r."g" -> k."chiave"
            WHEN jsonb_typeof(r."g" -> k."chiave") = 'string' THEN jsonb_build_array(r."g" -> k."chiave")
            ELSE '[]'::jsonb
          END AS "valori"
        ) v
        CROSS JOIN LATERAL jsonb_array_elements_text(v."valori") AS x("valore")
        WHERE NULLIF(btrim(x."valore"), '') IS NOT NULL
      ) s
    ) d ON TRUE

    LEFT JOIN "users" u
      ON d."uid" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND u."id" = d."uid"::uuid

    WHERE jsonb_typeof(a."data") = 'object'
      AND jsonb_typeof(r."g") = 'object'
  ) q
) p;

-- ---------------------------------------------------------------------------
-- 3. I due registri di scheda diventano fatti sulla riga
-- ---------------------------------------------------------------------------

UPDATE "athlete_guardians" AS g
SET "revoked_at" = COALESCE(g."revoked_at", a."updated_at")
FROM "athletes" a
WHERE a."id" = g."athlete_id"
  AND jsonb_typeof(a."data" -> 'revokedGuardianIdentities') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(a."data" -> 'revokedGuardianIdentities') AS reg("valore")
    WHERE lower(btrim(reg."valore")) IN (
      g."identity_key",
      COALESCE(g."user_id"::text, ''),
      COALESCE(g."email", '')
    )
  );

UPDATE "athlete_guardians" AS g
SET "contact_only" = true
FROM "athletes" a
WHERE a."id" = g."athlete_id"
  AND jsonb_typeof(a."data" -> 'contactOnlyIdentities') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(a."data" -> 'contactOnlyIdentities') AS reg("valore")
    WHERE lower(btrim(reg."valore")) IN (
      g."identity_key",
      COALESCE(g."user_id"::text, ''),
      COALESCE(g."email", '')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Il vaglio lascia passare l'azzeramento di un'utenza cancellata
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "easygame_athlete_guardians_solo_il_proprietario"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(current_setting('easygame.guardian_writer', true), '') = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- La cascata dalla cancellazione della scheda: qui la scheda non c'e gia piu.
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM "athletes" WHERE "id" = OLD."athlete_id") THEN
    RETURN OLD;
  END IF;

  -- **L'azzeramento del riferimento a un'utenza cancellata.**
  --
  -- `user_id` e `ON DELETE SET NULL`, che PostgreSQL esegue come una UPDATE:
  -- senza questa deroga, cancellare il proprio account falliva con un errore
  -- opaco per chiunque fosse tutore di qualcuno. Si passa solo se l'utenza
  -- **non c'e piu davvero**, e solo per togliere quel riferimento: ogni altro
  -- campo deve restare com'era, altrimenti sarebbe una scrittura travestita.
  IF TG_OP = 'UPDATE'
     AND NEW."user_id" IS NULL
     AND OLD."user_id" IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM "users" WHERE "id" = OLD."user_id")
     AND NEW."identity_key" IS NOT DISTINCT FROM OLD."identity_key"
     AND NEW."email"        IS NOT DISTINCT FROM OLD."email"
     AND NEW."revoked_at"   IS NOT DISTINCT FROM OLD."revoked_at"
     AND NEW."contact_only" IS NOT DISTINCT FROM OLD."contact_only" THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'athlete_guardians: scrittura (%) fuori dal modulo proprietario. Passa da src/lib/server/athlete-guardians.ts',
    TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;
