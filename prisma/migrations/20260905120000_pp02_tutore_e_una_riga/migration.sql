-- PP-02 / AC-1 — **un tutore diventa una riga** (KB 44 §4).
--
-- Fino a qui i tutori vivevano dentro `athletes.data.guardians[]`: un JSON
-- libero, senza chiave, che sedici scrittori riscrivevano per intero. Dentro
-- quel blob c'era la decisione se un genitore vede o non vede il fascicolo di
-- un minore, e da li discendeva tutto il resto — la perdita di aggiornamento
-- come modalita di guasto normale, il blocco per riga, il ciclo dello sweep,
-- il deadlock che ne e nato, e le cinque stesure del riporto delle difese in
-- `resources.ts`.
--
-- Questa migrazione e **additiva e reversibile in avanti**: crea la tabella,
-- travasa cio che il blob contiene, e **non tocca `athletes.data`**. Il blob
-- resta la fonte di lettura finche WP-C non sposta i lettori; WP-D lo svuota.
-- Nessun dato viene cancellato qui, da nessuna parte.

-- ---------------------------------------------------------------------------
-- 1. La colonna del marchio di cancellazione
-- ---------------------------------------------------------------------------
--
-- `anonymizedAt` viveva come chiave dentro `data`, cioe dentro il blob che
-- tutti riscrivono: `resources.ts` doveva rimetterlo a mano dopo ogni
-- salvataggio, perche un `PATCH` ordinario dalla scheda aperta lo avrebbe
-- cancellato — cioe **annullato una cancellazione GDPR**. Una colonna non si
-- perde riscrivendo il blob accanto.

ALTER TABLE "athletes" ADD COLUMN "anonymized_at" TIMESTAMP(3);

UPDATE "athletes"
SET "anonymized_at" = NULLIF(("data" ->> 'anonymizedAt'), '')::timestamptz
WHERE jsonb_typeof("data") = 'object'
  AND NULLIF(("data" ->> 'anonymizedAt'), '') IS NOT NULL
  AND ("data" ->> 'anonymizedAt') ~ '^\d{4}-\d{2}-\d{2}';

-- ---------------------------------------------------------------------------
-- 2. La tabella
-- ---------------------------------------------------------------------------

CREATE TABLE "athlete_guardians" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "identity_key" TEXT NOT NULL,
    "user_id" UUID,
    "email" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "phone" TEXT,
    "relationship" TEXT,
    "contact_only" BOOLEAN NOT NULL DEFAULT false,
    "linked_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "access_token_value" TEXT,
    "access_token_status" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "access_token_generated_at" TIMESTAMP(3),
    "legacy_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "athlete_guardians_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "athlete_guardians_organization_id_user_id_idx" ON "athlete_guardians"("organization_id", "user_id");

CREATE INDEX "athlete_guardians_athlete_id_idx" ON "athlete_guardians"("athlete_id");

-- **La chiave che il blob non aveva.**
--
-- E cio che rende inutili `lockAthleteRow` sui percorsi del tutore, il ciclo
-- dello sweep e i due registri di scheda: l'archivio puo finalmente rifiutare
-- da se una seconda riga per la stessa persona.
CREATE UNIQUE INDEX "athlete_guardians_athlete_id_identity_key_key" ON "athlete_guardians"("athlete_id", "identity_key");

ALTER TABLE "athlete_guardians" ADD CONSTRAINT "athlete_guardians_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "athlete_guardians" ADD CONSTRAINT "athlete_guardians_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "athlete_guardians" ADD CONSTRAINT "athlete_guardians_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Il travaso
-- ---------------------------------------------------------------------------
--
-- **Da dove si legge.** Non solo `data.guardians`: il prodotto ha accumulato
-- quattro grafie della stessa collezione (`guardians`, `parents`, `tutors`,
-- `tutori`) piu la coppia storica `parent1`/`parent2`, che e un oggetto e non
-- un elemento di array. Leggerne una sola lascerebbe indietro proprio le
-- schede piu vecchie — e PP02-D32 dice che la coppia storica porta difese che
-- il riporto non guarda affatto.
--
-- **La chiave.** `identity_key` e l'identita su cui la riga e unica dentro
-- l'atleta: l'identificativo dell'utenza se c'e, altrimenti l'indirizzo in
-- minuscolo, altrimenti un ripiego costruito sulla chiave che la riga portava
-- nel blob. Le prime due sono la **stessa** normalizzazione che usano
-- `revokedGuardianIdentities` e `contactOnlyIdentities` — trim piu minuscolo —
-- e questo e cio che permette al punto 4 di abbinare i due registri.
--
-- **Gli ambigui.** Due righe del blob che collassano sulla stessa identita
-- sono la norma, non l'eccezione: gli id sintetici `guardian-<indice>-<dato>`
-- collidevano gia per costruzione. Si fondono in una riga sola, e la fusione
-- e **conservativa sulle difese**: se una qualunque delle righe fuse era
-- revocata, la riga risultante e revocata; se una era solo-recapito, lo e.
-- Nel verso opposto si perderebbe una difesa, e questa e una migrazione che
-- non deve poter aprire un accesso che prima era chiuso.
--
-- **I campi descrittivi** prendono il primo valore non vuoto nell'ordine di
-- comparsa, che e l'ordine in cui le schermate li mostravano.

INSERT INTO "athlete_guardians" (
  "id", "organization_id", "athlete_id", "identity_key",
  "user_id", "email", "first_name", "last_name", "phone", "relationship",
  "contact_only", "linked_at", "revoked_at",
  "access_token_value", "access_token_status",
  "access_token_expires_at", "access_token_generated_at",
  "legacy_id", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  p."organization_id",
  p."athlete_id",
  p."identity_key",
  (array_agg(p."user_id"     ORDER BY p."ord") FILTER (WHERE p."user_id"     IS NOT NULL))[1],
  (array_agg(p."email"       ORDER BY p."ord") FILTER (WHERE p."email"       IS NOT NULL))[1],
  (array_agg(p."first_name"  ORDER BY p."ord") FILTER (WHERE p."first_name"  IS NOT NULL))[1],
  (array_agg(p."last_name"   ORDER BY p."ord") FILTER (WHERE p."last_name"   IS NOT NULL))[1],
  (array_agg(p."phone"       ORDER BY p."ord") FILTER (WHERE p."phone"       IS NOT NULL))[1],
  (array_agg(p."relationship" ORDER BY p."ord") FILTER (WHERE p."relationship" IS NOT NULL))[1],
  bool_or(p."contact_only"),
  min(p."linked_at"),
  max(p."revoked_at"),
  (array_agg(p."access_token_value"  ORDER BY p."ord") FILTER (WHERE p."access_token_value"  IS NOT NULL))[1],
  (array_agg(p."access_token_status" ORDER BY p."ord") FILTER (WHERE p."access_token_status" IS NOT NULL))[1],
  (array_agg(p."access_token_expires_at"   ORDER BY p."ord") FILTER (WHERE p."access_token_expires_at"   IS NOT NULL))[1],
  (array_agg(p."access_token_generated_at" ORDER BY p."ord") FILTER (WHERE p."access_token_generated_at" IS NOT NULL))[1],
  (array_agg(p."legacy_id" ORDER BY p."ord") FILTER (WHERE p."legacy_id" IS NOT NULL))[1],
  now(),
  now()
FROM (
  SELECT
    a."id"              AS "athlete_id",
    a."organization_id" AS "organization_id",
    r."ord"             AS "ord",
    NULLIF(btrim(r."g" ->> 'id'), '')                       AS "legacy_id",
    u."id"                                                  AS "user_id",
    NULLIF(lower(btrim(r."g" ->> 'email')), '')             AS "email",
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
    -- La chiave: utenza, altrimenti indirizzo, altrimenti un ripiego che non
    -- fonde due sconosciuti diversi.
    COALESCE(
      NULLIF(lower(btrim(COALESCE(
        r."g" ->> 'linkedUserId',
        r."g" ->> 'linked_user_id',
        r."g" ->> 'userId',
        r."g" ->> 'user_id'
      ))), ''),
      NULLIF(lower(btrim(r."g" ->> 'email')), ''),
      'riga:' || COALESCE(NULLIF(btrim(r."g" ->> 'id'), ''), 'pos-' || r."ord"::text)
    )                                                       AS "identity_key"
  FROM "athletes" a
  CROSS JOIN LATERAL (
    SELECT "valore" AS "g", "ordinalita" AS "ord"
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(a."data" -> 'guardians') = 'array' THEN a."data" -> 'guardians' ELSE '[]'::jsonb END
      || CASE WHEN jsonb_typeof(a."data" -> 'parents')  = 'array' THEN a."data" -> 'parents'  ELSE '[]'::jsonb END
      || CASE WHEN jsonb_typeof(a."data" -> 'tutors')   = 'array' THEN a."data" -> 'tutors'   ELSE '[]'::jsonb END
      || CASE WHEN jsonb_typeof(a."data" -> 'tutori')   = 'array' THEN a."data" -> 'tutori'   ELSE '[]'::jsonb END
      || CASE WHEN jsonb_typeof(a."data" -> 'parent1')  = 'object' THEN jsonb_build_array(a."data" -> 'parent1') ELSE '[]'::jsonb END
      || CASE WHEN jsonb_typeof(a."data" -> 'parent2')  = 'object' THEN jsonb_build_array(a."data" -> 'parent2') ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS t("valore", "ordinalita")
  ) r
  -- **L'utenza si scrive solo se esiste davvero.** Un blob puo nominare
  -- un'utenza cancellata: la chiave esterna la rifiuterebbe e la migrazione
  -- fallirebbe su un dato storico. L'identita resta comunque nella chiave, e
  -- il legame si ricuce da se al primo riscatto.
  LEFT JOIN "users" u
    ON lower(btrim(COALESCE(
         r."g" ->> 'linkedUserId',
         r."g" ->> 'linked_user_id',
         r."g" ->> 'userId',
         r."g" ->> 'user_id'
       ))) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND u."id" = lower(btrim(COALESCE(
         r."g" ->> 'linkedUserId',
         r."g" ->> 'linked_user_id',
         r."g" ->> 'userId',
         r."g" ->> 'user_id'
       )))::uuid
  WHERE jsonb_typeof(a."data") = 'object'
    AND jsonb_typeof(r."g") = 'object'
) p
GROUP BY p."organization_id", p."athlete_id", p."identity_key";

-- ---------------------------------------------------------------------------
-- 4. I due registri di scheda diventano fatti sulla riga
-- ---------------------------------------------------------------------------
--
-- `revokedGuardianIdentities` e `contactOnlyIdentities` erano il **surrogato
-- di una chiave**: elenchi a livello di atleta che dicevano «questa identita
-- e revocata» proprio perche la riga poteva perdersi a ogni riscrittura del
-- blob. Adesso lo dice la riga, e i due elenchi non servono piu.
--
-- Il registro **vince sul segno di riga**: era gia cosi nel prodotto — «il
-- segno sulla riga resta, ma non e piu lui a decidere» — quindi un'identita
-- elencata qui e revocata anche se la sua riga non portava `accessRevokedAt`.
--
-- La data della revoca il registro non la porta: si usa `athletes.updated_at`,
-- che e l'ultimo momento in cui quella scheda e cambiata e quindi il limite
-- superiore piu stretto che l'archivio conosca. E un'approssimazione, ed e
-- dichiarata: nessuna decisione di accesso dipende da **quando** la revoca sia
-- avvenuta, solo dal fatto che sia avvenuta.

UPDATE "athlete_guardians" AS g
SET "revoked_at" = COALESCE(g."revoked_at", a."updated_at")
FROM "athletes" a
WHERE a."id" = g."athlete_id"
  AND jsonb_typeof(a."data" -> 'revokedGuardianIdentities') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(a."data" -> 'revokedGuardianIdentities') AS reg("valore")
    WHERE lower(btrim(reg."valore")) = g."identity_key"
  );

UPDATE "athlete_guardians" AS g
SET "contact_only" = true
FROM "athletes" a
WHERE a."id" = g."athlete_id"
  AND jsonb_typeof(a."data" -> 'contactOnlyIdentities') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(a."data" -> 'contactOnlyIdentities') AS reg("valore")
    WHERE lower(btrim(reg."valore")) = g."identity_key"
  );
