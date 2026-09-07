-- PP-02 / WP-C — **il travaso perdeva quattro identita e ne inventava quattro.**
--
-- ## Come si e visto
--
-- WP-B ha dichiarato «14 identita → 14 righe, 0 perse». Quel conteggio misura
-- che nessuna riga e sparita, e non e la proprieta che conta.
--
-- La proprieta che conta e un'**equivalenza fra due predicati**: chi apriva il
-- fascicolo di un minore leggendo il blob deve aprirlo leggendo la tabella, e —
-- nell'altro verso, che e quello che nessuno guarda — chi il blob teneva fuori
-- deve restare fuori. Misurata dalla porta vera del prodotto
-- (`getParentLinkedAthletes` contro `findGuardianLinks`) su ventitre grafie
-- storiche, una scheda per grafia, `scripts/pp-02-travaso-equivalente.mjs`:
--
-- | Verso | Grafie | Conseguenza |
-- |---|---|---|
-- | **perse** | `linkedUserIds[]`, `linked_user_ids[]`, `linkedUserEmail`, `linked_user_email`, due identificativi sulla stessa riga, indirizzo di accesso diverso da quello di recapito | un tutore legittimo perde calendario, rate, ricevute, documenti e certificato, **senza che nessuna schermata lo spieghi** |
-- | **inventate** | `parents[]`, `tutors[]`, `tutori[]`, `parent1` quando `guardians` non e vuoto | una persona che il predicato **non** riconosceva apre il fascicolo sanitario di un minore |
--
-- Le due cause sono simmetriche e sono tutte e due «una lista scritta a mano
-- che non e stata derivata da chi decide»:
--
-- 1. il travaso leggeva **quattro** grafie dell'identificativo, e solo scalari.
--    `guardianDeclaredIds` ne legge **sei**, e conta anche gli **elementi di un
--    array** — la funzione lo dice a chiare lettere, «un valore in array conta
--    per tutti i suoi elementi». Sull'indirizzo il travaso leggeva `email` e
--    basta; `isGuardianLinkedToUser` legge `linkedUserEmail`,
--    `linked_user_email` e `email`, nell'ordine;
-- 2. il travaso **univa** sei collezioni. `getGuardianRows` ne legge **una**,
--    e ricade sulla coppia storica solo quando `guardians` e vuoto:
--    `guardians.length > 0 ? guardians : legacyParents`. `parents`, `tutors` e
--    `tutori` non li consulta **nessun** predicato di accesso — lo dice gia il
--    commento dello sweep della revoca, «si spazzava dove non c'era polvere».
--
-- ## Perche si rifa daccapo invece di correggere
--
-- Nessun codice di prodotto scrive `athlete_guardians`: il censimento lo ha
-- verificato riga per riga, e la migrazione precedente e l'unica cosa che ci
-- abbia mai messo dentro qualcosa. Quindi **ogni riga presente viene dal
-- travaso**, e rifarlo non puo perdere niente che non fosse gia derivabile dal
-- blob. Distinguere a posteriori quali righe venissero da `tutori` invece che
-- da `guardians` non si puo: la riga non porta la collezione da cui e nata.
--
-- La migrazione precedente non si tocca — e gia stata applicata — e questa e
-- la correzione in avanti.
--
-- ## Una divergenza voluta, dichiarata qui perche non venga scoperta dopo
--
-- Oggi un legame **dichiarato** apre anche quando l'identita e nel registro
-- delle revoche: il registro chiude solo il ripiego sull'indirizzo. Regge
-- perche lo sweep della revoca **azzera** i campi del legame — ed e proprio
-- quello sweep che `R-2` dimostra fallire sotto concorrenza, cioe: quando la
-- revoca non riesce del tutto, l'accesso resta aperto.
--
-- Con la tabella la revoca e un fatto sulla riga e vale per **tutti e due** i
-- percorsi. E un restringimento, ed e il punto di WP-C.

-- ---------------------------------------------------------------------------
-- 0. Questa migrazione dichiara di essere uno scrittore dei tutori
-- ---------------------------------------------------------------------------
--
-- Il vaglio introdotto un'ora fa ha **rifiutato questa migrazione**, ed e la
-- prova che serviva: non e un elenco di file da tenere aggiornato, e non
-- conosce eccezioni implicite.
--
-- La risposta giusta non e esentare le migrazioni nel vaglio — sarebbe una
-- scappatoia che qualunque scrittura potrebbe imboccare dichiarandosi tale — ma
-- che **chi ha il diritto di scrivere lo dichiari**, qui come nel modulo
-- proprietario. Una migrazione che tocca i tutori porta questa riga, si vede
-- nel diff, e chi la legge sa cosa sta guardando.
--
-- Prisma esegue il file dentro una transazione, quindi `SET LOCAL` vale per
-- tutte le istruzioni che seguono e si spegne da se al `COMMIT`.

SET LOCAL "easygame.guardian_writer" = 'on';

-- ---------------------------------------------------------------------------
-- 1. Si svuota cio che il travaso precedente aveva scritto
-- ---------------------------------------------------------------------------

DELETE FROM "athlete_guardians";

-- ---------------------------------------------------------------------------
-- 1-bis. La posizione, che nel blob era implicita e qui non lo e
-- ---------------------------------------------------------------------------
--
-- Un array ha un ordine; una tabella no. E tre cose in questo prodotto leggono
-- i tutori **per posizione**, non per identita:
--
-- | Chi | Cosa decide |
-- |---|---|
-- | `data.billingGuardianIndex` | di chi e il codice fiscale su una ricevuta |
-- | i segnaposto `{{parent.1.*}}` / `{{parent.2.*}}` | quale genitore compare su un documento |
-- | il `recordId` di una compilazione | quale riga una pratica gia salvata stava modificando |
--
-- Nessuna delle tre puo cambiare persona senza riscrivere un fatto: la prima
-- sposta una detrazione fiscale, la seconda cambia il nome su un documento gia
-- emesso, la terza fa applicare una modifica alla riga sbagliata.
--
-- `created_at` non serve a conservarla: l'`INSERT` scrive tutte le righe con lo
-- stesso `now()`, quindi non le ordina. La posizione va conservata
-- **esplicitamente**, e viene dal posto in cui la riga stava nell'array.

ALTER TABLE "athlete_guardians" ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2. Il travaso, derivato dai predicati invece che da un elenco
-- ---------------------------------------------------------------------------

INSERT INTO "athlete_guardians" (
  "id", "organization_id", "athlete_id", "identity_key",
  "user_id", "email", "first_name", "last_name", "phone", "relationship",
  "contact_only", "linked_at", "revoked_at",
  "access_token_value", "access_token_status",
  "access_token_expires_at", "access_token_generated_at",
  "legacy_id", "position", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  p."organization_id",
  p."athlete_id",
  p."identity_key",
  (array_agg(p."user_id"      ORDER BY p."ord") FILTER (WHERE p."user_id"      IS NOT NULL))[1],
  (array_agg(p."email"        ORDER BY p."ord") FILTER (WHERE p."email"        IS NOT NULL))[1],
  (array_agg(p."first_name"   ORDER BY p."ord") FILTER (WHERE p."first_name"   IS NOT NULL))[1],
  (array_agg(p."last_name"    ORDER BY p."ord") FILTER (WHERE p."last_name"    IS NOT NULL))[1],
  (array_agg(p."phone"        ORDER BY p."ord") FILTER (WHERE p."phone"        IS NOT NULL))[1],
  (array_agg(p."relationship" ORDER BY p."ord") FILTER (WHERE p."relationship" IS NOT NULL))[1],
  -- Conservativa sulle difese: se una qualunque delle righe fuse era
  -- solo-recapito, lo e la riga risultante. Nel verso opposto si aprirebbe un
  -- accesso che nessuna delle due righe apriva.
  bool_or(p."contact_only"),
  min(p."linked_at"),
  max(p."revoked_at"),
  (array_agg(p."access_token_value"        ORDER BY p."ord") FILTER (WHERE p."access_token_value"        IS NOT NULL))[1],
  (array_agg(p."access_token_status"       ORDER BY p."ord") FILTER (WHERE p."access_token_status"       IS NOT NULL))[1],
  (array_agg(p."access_token_expires_at"   ORDER BY p."ord") FILTER (WHERE p."access_token_expires_at"   IS NOT NULL))[1],
  (array_agg(p."access_token_generated_at" ORDER BY p."ord") FILTER (WHERE p."access_token_generated_at" IS NOT NULL))[1],
  (array_agg(p."legacy_id" ORDER BY p."ord") FILTER (WHERE p."legacy_id" IS NOT NULL))[1],
  -- La posizione della riga da cui questa identita viene. Due identita nate
  -- dalla stessa riga del blob la condividono, e l'ordine fra loro lo decide
  -- la chiave: deterministico, che e cio che serve.
  min(p."ord")::int,
  now(),
  now()
FROM (
  SELECT
    a."id"              AS "athlete_id",
    a."organization_id" AS "organization_id",
    r."ord"             AS "ord",
    NULLIF(btrim(r."g" ->> 'id'), '')                       AS "legacy_id",
    u."id"                                                  AS "user_id",
    -- **L'indirizzo che apre, nell'ordine in cui lo legge chi decide.**
    -- `isGuardianLinkedToUser` fa `firstText(linkedUserEmail,
    -- linked_user_email, email)`: e quello il recapito che vale come chiave,
    -- e quello va nella colonna che `findGuardianLinks` interroga.
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
    -- **La chiave: una riga per identita che apriva.**
    --
    -- Non «una riga del blob → una riga della tabella»: quella corrispondenza
    -- e cio che perdeva il secondo identificativo di una riga che ne
    -- dichiarava due. Una riga della tabella e **una persona**, e una riga del
    -- blob che nominava due persone ne produce due.
    COALESCE(
      d."uid",
      acc."indirizzo",
      'riga:' || COALESCE(NULLIF(btrim(r."g" ->> 'id'), ''), 'pos-' || r."ord"::text)
    )                                                       AS "identity_key"
  FROM "athletes" a

  -- **Le collezioni che il predicato legge davvero, e nell'ordine giusto.**
  --
  -- `getGuardianRows` fa `guardians.length > 0 ? guardians : legacyParents`.
  -- Non e un'unione: e una precedenza. Unirle faceva nascere una riga per un
  -- `parent1` che il predicato ignorava — cioe un accesso che prima non
  -- c'era. `parents`, `tutors` e `tutori` non li legge nessun predicato di
  -- accesso: restano nel blob come dato morto (debito PP02-D38).
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

  -- **I sei campi dell'identificativo, e gli elementi degli array.**
  --
  -- `LEFT JOIN ... ON TRUE`: una riga senza nessun identificativo non sparisce,
  -- esce con `uid` nullo e prende la chiave dall'indirizzo. Una riga che ne
  -- dichiara due esce **due volte**, ed e il punto.
  LEFT JOIN LATERAL (
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
  ) d ON TRUE

  -- L'utenza si scrive solo se esiste davvero: un blob puo nominare un'utenza
  -- cancellata, e la chiave esterna la rifiuterebbe. L'identita resta comunque
  -- nella chiave, e il legame si ricuce da se al primo riscatto.
  LEFT JOIN "users" u
    ON d."uid" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND u."id" = d."uid"::uuid

  WHERE jsonb_typeof(a."data") = 'object'
    AND jsonb_typeof(r."g") = 'object'
) p
GROUP BY p."organization_id", p."athlete_id", p."identity_key";

-- ---------------------------------------------------------------------------
-- 3. I due registri di scheda diventano fatti sulla riga
-- ---------------------------------------------------------------------------
--
-- Invariati rispetto al travaso precedente: gli elenchi portano identita
-- normalizzate allo stesso modo di `identity_key`, e il registro vince sul
-- segno di riga.

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

-- ---------------------------------------------------------------------------
-- 4. L'indice che la ricerca dell'area famiglia interroga
-- ---------------------------------------------------------------------------
--
-- `findGuardianLinks` cerca per utenza (gia indicizzata) **e per indirizzo**.
-- Senza questo indice la seconda strada e una scansione, cioe esattamente il
-- costo che si e appena tolto a `findClubsWhereUserIsGuardian`.

CREATE INDEX IF NOT EXISTS "athlete_guardians_email_idx"
  ON "athlete_guardians" ("email")
  WHERE "email" IS NOT NULL;
