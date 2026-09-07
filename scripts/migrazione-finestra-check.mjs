/**
 * **Il preflight e il postcheck della finestra di migrazione, eseguibili.**
 *
 *     # prima: si misura e si salva il termine di paragone
 *     node scripts/migrazione-finestra-check.mjs --pre --out=.migrazione-pre.json
 *
 *     # dopo: si rimisura e si confronta
 *     node scripts/migrazione-finestra-check.mjs --post --in=.migrazione-pre.json
 *
 * ---
 *
 * ## Perche esiste, se il runbook aveva gia le query
 *
 * Perche le query scritte a mano in un documento **non si eseguono**, e due di
 * quelle interrogavano una tabella che non esiste: `audit_events` invece di
 * `audit_logs` (`AuditLog` mappa su `audit_logs`, `prisma/schema.prisma:1596`).
 * Erano l'ultima riga del PRECHECK **e** l'ultima del POSTCHECK, cioe l'unico
 * controllo sull'audit da entrambi i lati. Un operatore le avrebbe incollate in
 * `psql` e avrebbe ricevuto `relation "audit_events" does not exist` proprio
 * mentre il runbook gli chiede di confrontare due numeri.
 *
 * Un controllo che si copia e si incolla e un controllo che si sbaglia. Questo
 * si esegue, e il confronto lo fa la macchina invece dell'occhio.
 *
 * ## Sola lettura, e come e garantita
 *
 * Nessuna istruzione di questo file scrive. In piu si **dichiara** la sessione
 * in sola lettura (`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`): se
 * il pooler la rifiuta, lo si **dice** invece di ripiegare in silenzio su una
 * garanzia piu debole — che e la forma di difetto che PP-02 ha passato quindici
 * tornate a togliere.
 *
 * Gira contro il database puntato da `DATABASE_URL`. **Non** pretende
 * `EASYGAME_DB_ENV=development`, ed e deliberato: serve a girare su staging,
 * ed e l'unico script del repository che lo fa **senza scrivere niente**. Per
 * questo dichiara la sola lettura invece di fidarsi di un'etichetta.
 */

import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

const args = process.argv.slice(2);
const has = (nome) => args.includes(nome);
const valore = (nome) =>
  (args.find((a) => a.startsWith(`${nome}=`)) || "").split("=").slice(1).join("=");

const MODO = has("--post") ? "post" : "pre";
const FILE_OUT = valore("--out") || ".migrazione-pre.json";
const FILE_IN = valore("--in") || ".migrazione-pre.json";

const prisma = new PrismaClient();

const esiti = [];
const prova = (titolo, ok, dettaglio = "") => {
  esiti.push({ titolo, ok, dettaglio });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(58)} ${dettaglio}`,
  );
};
const info = (titolo, valore) =>
  console.log(`  INFO  ${titolo.padEnd(58)} ${JSON.stringify(valore)}`);

const uno = async (sql) => {
  const righe = await prisma.$queryRawUnsafe(sql);
  const riga = Array.isArray(righe) ? righe[0] : null;
  if (!riga) return null;
  const [chiave] = Object.keys(riga);
  const v = riga[chiave];
  return typeof v === "bigint" ? Number(v) : v;
};

const esiste = async (tabella) =>
  (await uno(`SELECT to_regclass('public.${tabella}') IS NOT NULL AS c`)) === true;

/* ==================================================== la sola lettura == */

const dichiaraSolaLettura = async () => {
  try {
    await prisma.$executeRawUnsafe(
      "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY",
    );
    const stato = await uno("SHOW transaction_read_only");
    if (String(stato) === "on") {
      info("sola lettura", "dichiarata sulla sessione (transaction_read_only=on)");
      return "dichiarata";
    }
    info("sola lettura", `il server risponde transaction_read_only=${stato}`);
    return "non-confermata";
  } catch (errore) {
    info("sola lettura", `il pooler ha rifiutato la dichiarazione: ${String(errore?.message).slice(0, 80)}`);
    return "rifiutata";
  }
};

/* ================================================== cio che si misura == */

/**
 * I numeri che **non devono muoversi**: nessuna delle cinque migrazioni ha
 * questi domini nel proprio perimetro. Se uno cambia, si e mosso qualcosa che
 * nessuno aveva chiesto — e il verso del rimedio e il ripristino, non
 * un'indagine a caldo.
 */
const INVARIANTI = {
  clubs: "SELECT count(*) FROM clubs",
  utenti: "SELECT count(*) FROM users",
  tessere: "SELECT count(*) FROM organization_users",
  atleti: "SELECT count(*) FROM athletes",
  atleti_con_account: "SELECT count(*) FROM athletes WHERE user_id IS NOT NULL",
  documenti: "SELECT count(*) FROM document_requests",
  rate: "SELECT count(*) FROM payments",
  rate_dovuto: "SELECT coalesce(sum(amount), 0)::float8 FROM payments",
  incassi: "SELECT count(*) FROM payment_transactions",
  incassi_totale: "SELECT coalesce(sum(amount), 0)::float8 FROM payment_transactions",
  eventi: "SELECT count(*) FROM club_events",
  eventi_annullati: "SELECT count(*) FROM club_events WHERE status = 'cancelled'",
  partecipazioni: "SELECT count(*) FROM club_event_participants",
  presenze: "SELECT count(*) FROM club_event_participants WHERE status = 'present'",
  convocazioni:
    "SELECT count(*) FROM club_event_participants WHERE convocation_status = 'convocated'",
  audit: "SELECT count(*) FROM audit_logs",
};

const misuraInvarianti = async () => {
  const misure = {};
  for (const [nome, sql] of Object.entries(INVARIANTI)) {
    misure[nome] = await uno(sql);
  }
  return misure;
};

/* ============================================ i preflight che bloccano == */

const preflight = async () => {
  console.log("\n— Preflight: cosa puo far fallire `migrate deploy` —\n");

  /* Migrazione 2: non ha `IF NOT EXISTS`, quindi una collisione la aborta. */
  const tabellaGiaPresente = await esiste("athlete_guardians");
  const colonnaGiaPresente = await uno(
    `SELECT count(*) FROM information_schema.columns
      WHERE table_name = 'athletes' AND column_name = 'anonymized_at'`,
  );
  prova(
    "F1 · la migrazione 2 non trova gia il proprio schema",
    !tabellaGiaPresente && Number(colonnaGiaPresente) === 0,
    `athlete_guardians=${tabellaGiaPresente} anonymized_at=${colonnaGiaPresente}`,
  );

  /*
    Migrazioni 2, 4 e 5: `(g ->> 'contactOnly')::boolean` e l'unico cast del
    travaso **senza** una regex di guardia davanti. Una stringa vuota o una
    parola non booleana fa abortire `migrate deploy` a meta.
  */
  const booleaniRotti = await uno(`
    SELECT count(*) FROM athletes a
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(a.data -> 'guardians') = 'array' THEN a.data -> 'guardians' ELSE '[]'::jsonb END
      || CASE WHEN jsonb_typeof(a.data -> 'parents') = 'array' THEN a.data -> 'parents' ELSE '[]'::jsonb END
      || CASE WHEN jsonb_typeof(a.data -> 'tutors')  = 'array' THEN a.data -> 'tutors'  ELSE '[]'::jsonb END
      || CASE WHEN jsonb_typeof(a.data -> 'tutori')  = 'array' THEN a.data -> 'tutori'  ELSE '[]'::jsonb END
      || CASE WHEN jsonb_typeof(a.data -> 'parent1') = 'object' THEN jsonb_build_array(a.data -> 'parent1') ELSE '[]'::jsonb END
      || CASE WHEN jsonb_typeof(a.data -> 'parent2') = 'object' THEN jsonb_build_array(a.data -> 'parent2') ELSE '[]'::jsonb END
    ) AS t(g)
    WHERE jsonb_typeof(a.data) = 'object' AND jsonb_typeof(t.g) = 'object'
      AND (
        (t.g ? 'contactOnly'  AND lower(btrim(coalesce(t.g ->> 'contactOnly','')))
           NOT IN ('t','true','y','yes','on','1','f','false','n','no','off','0'))
     OR (t.g ? 'contact_only' AND lower(btrim(coalesce(t.g ->> 'contact_only','')))
           NOT IN ('t','true','y','yes','on','1','f','false','n','no','off','0'))
      )`);
  prova(
    "F2 · nessun `contactOnly` che PostgreSQL non sa convertire",
    Number(booleaniRotti) === 0,
    `voci non convertibili: ${booleaniRotti}`,
  );

  /* Gli stessi tre travasi castano dieci chiavi a `timestamptz`. */
  const dateRotte = await uno(`
    SELECT count(*) FROM athletes a
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(a.data -> 'guardians') = 'array' THEN a.data -> 'guardians' ELSE '[]'::jsonb END
      || CASE WHEN jsonb_typeof(a.data -> 'parent1') = 'object' THEN jsonb_build_array(a.data -> 'parent1') ELSE '[]'::jsonb END
      || CASE WHEN jsonb_typeof(a.data -> 'parent2') = 'object' THEN jsonb_build_array(a.data -> 'parent2') ELSE '[]'::jsonb END
    ) AS t(g)
    CROSS JOIN LATERAL (VALUES
      ('linkedAt'), ('linked_at'), ('accessRevokedAt'), ('access_revoked_at'),
      ('parentAccessTokenExpiresAt'), ('parent_access_token_expires_at'), ('accessTokenExpiresAt'),
      ('parentAccessTokenGeneratedAt'), ('parent_access_token_generated_at'), ('accessTokenGeneratedAt')
    ) AS ks(k)
    CROSS JOIN LATERAL (SELECT t.g ->> ks.k AS v) vv
    WHERE jsonb_typeof(t.g) = 'object' AND v ~ '^\\d{4}-\\d{2}-\\d{2}'
      AND substring(v from 1 for 10) !~ '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$'`);
  const anonimaRotta = await uno(`
    SELECT count(*) FROM athletes
    WHERE jsonb_typeof(data) = 'object'
      AND (data ->> 'anonymizedAt') ~ '^\\d{4}-\\d{2}-\\d{2}'
      AND substring(data ->> 'anonymizedAt' from 1 for 10)
          !~ '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$'`);
  prova(
    "F3 · nessuna data del blob che il cast rifiuta",
    Number(dateRotte) === 0 && Number(anonimaRotta) === 0,
    `voci=${dateRotte} anonymizedAt=${anonimaRotta}`,
  );

  /* Migrazione 5: `jsonb - text[]` solleva su una voce che non e un oggetto. */
  const nonOggetti = await uno(`
    SELECT count(*) FROM athletes a
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(a.data -> 'guardians') = 'array' THEN a.data -> 'guardians' ELSE '[]'::jsonb END
    ) AS t(g)
    WHERE jsonb_typeof(a.data) = 'object' AND jsonb_typeof(t.g) <> 'object'`);
  prova(
    "F4 · ogni voce del blob dei tutori e un oggetto",
    Number(nonOggetti) === 0,
    `voci non-oggetto: ${nonOggetti}`,
  );

  /*
    **Il preflight che il runbook non aveva.** La migrazione 5 e l'unica delle
    cinque il cui `INSERT` non e protetto da un `GROUP BY` sulla chiave
    dell'indice unico: deduplica con una finestra, e la chiave di ripiego
    `'riga:pos-' || athlete_id || '-' || ord` **non e unica** quando una voce
    del blob dichiara due identificativi utente. Due righe nate dalla stessa
    voce condividono `ord`, e se entrambe sono la seconda occorrenza della
    propria identita prendono la stessa chiave: violazione dell'indice unico, e
    `migrate deploy` si ferma sulla quinta.
  */
  const collisioni = await uno(`
    WITH righe AS (
      SELECT a.id AS athlete_id, r.ord, x.uid
      FROM athletes a
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(a.data -> 'guardians') = 'array'
               AND jsonb_array_length(a.data -> 'guardians') > 0
            THEN a.data -> 'guardians'
          ELSE
            CASE WHEN jsonb_typeof(a.data -> 'parent1') = 'object'
                 THEN jsonb_build_array(a.data -> 'parent1') ELSE '[]'::jsonb END
            || CASE WHEN jsonb_typeof(a.data -> 'parent2') = 'object'
                 THEN jsonb_build_array(a.data -> 'parent2') ELSE '[]'::jsonb END
        END
      ) WITH ORDINALITY AS r(g, ord)
      LEFT JOIN LATERAL (
        SELECT DISTINCT lower(btrim(e.val)) AS uid
        FROM unnest(ARRAY['linkedUserId','linked_user_id','userId','user_id',
                          'linkedUserIds','linked_user_ids']) AS k(chiave)
        CROSS JOIN LATERAL (
          SELECT CASE
            WHEN jsonb_typeof(r.g -> k.chiave) = 'array'  THEN r.g -> k.chiave
            WHEN jsonb_typeof(r.g -> k.chiave) = 'string' THEN jsonb_build_array(r.g -> k.chiave)
            ELSE '[]'::jsonb END AS valori
        ) v
        CROSS JOIN LATERAL jsonb_array_elements_text(v.valori) AS e(val)
        WHERE NULLIF(btrim(e.val), '') IS NOT NULL
      ) x ON TRUE
      WHERE jsonb_typeof(a.data) = 'object' AND jsonb_typeof(r.g) = 'object'
    )
    SELECT count(*) FROM (
      SELECT athlete_id, ord FROM (
        SELECT athlete_id, ord, uid,
               row_number() OVER (PARTITION BY athlete_id, uid ORDER BY ord) AS ordine
        FROM righe WHERE uid IS NOT NULL
      ) s
      WHERE ordine > 1
      GROUP BY 1, 2 HAVING count(*) > 1
    ) y`);
  prova(
    "F5 · la chiave di ripiego della migrazione 5 non collide",
    Number(collisioni) === 0,
    `posizioni in collisione: ${collisioni}`,
  );

  /*
    Migrazione 1: la sua `UPDATE` forward-safe bonifica da se, quindi i
    duplicati **non** bloccano. Blocca il traffico vivo: una challenge creata
    durante la finestra puo nascere fra la bonifica e l'indice.
  */
  const duplicati = await uno(`
    SELECT count(*) FROM (
      SELECT user_id, channel, purpose <> 'reset_password' AS otp
      FROM auth_verification_challenges
      WHERE consumed_at IS NULL
      GROUP BY 1, 2, 3 HAVING count(*) > 1
    ) x`);
  const recenti = await uno(`
    SELECT count(*) FROM auth_verification_challenges
    WHERE consumed_at IS NULL AND created_at > now() - interval '15 minutes'`);
  info("F6 · challenge da bonificare (non blocca)", duplicati);
  prova(
    "F6 · nessuna challenge nata negli ultimi 15 minuti",
    Number(recenti) === 0,
    `vive e recenti: ${recenti} — se > 0 c'e traffico OTP durante la finestra`,
  );
};

/* ================================================ i controlli del dopo == */

const postcheck = async (prima) => {
  console.log("\n— Postcheck: il travaso, e cio che non doveva muoversi —\n");

  const c = await esiste("athlete_guardians");
  prova("D1 · la tabella dei tutori esiste", c === true, "");
  if (!c) return;

  const righe = await uno("SELECT count(*) FROM athlete_guardians");
  const vociBlob = await uno(`
    SELECT coalesce(sum(jsonb_array_length(data -> 'guardians')), 0)
    FROM athletes WHERE jsonb_typeof(data -> 'guardians') = 'array'`);
  prova(
    "D2 · una riga per ogni voce del blob: ne persa ne inventata",
    Number(righe) === Number(vociBlob),
    `righe=${righe} voci=${vociBlob}`,
  );

  const chiaviDuplicate = await uno(`
    SELECT count(*) FROM (
      SELECT athlete_id, identity_key FROM athlete_guardians
      GROUP BY 1, 2 HAVING count(*) > 1
    ) x`);
  prova(
    "D3 · la chiave e unica sulla scheda",
    Number(chiaviDuplicate) === 0,
    `duplicate: ${chiaviDuplicate}`,
  );

  /*
    **La posizione, che il runbook dichiarava di controllare e non
    controllava.** `49 §D` la dichiara una chiave e dice che la proiezione
    fonde le righe che la condividono: due righe con la stessa posizione sono
    le due persone che la migrazione 5 esiste per separare, rifuse a valle.
  */
  const posizioniDuplicate = await uno(`
    SELECT count(*) FROM (
      SELECT athlete_id, position FROM athlete_guardians
      GROUP BY 1, 2 HAVING count(*) > 1
    ) y`);
  prova(
    "D4 · e la posizione non si ripete sulla stessa scheda",
    Number(posizioniDuplicate) === 0,
    `duplicate: ${posizioniDuplicate}`,
  );

  /*
    **Questa non e una soglia, ed e la correzione piu importante al runbook.**

    Il runbook pretendeva **zero** righe escluse che conservano l'utenza, e
    imponeva il ripristino su una sola riga. Ma `49-pp-02-invarianti-tutori.md`
    dice il contrario: quella coppia la **produce il travaso stesso**, che
    marca per identita senza azzerare l'utenza, e l'invariante §C si fa valere
    nel **predicato di lettura**, non nei dati. Una soglia a zero avrebbe fatto
    ripristinare uno snapshot per un esito atteso.
  */
  const escluseConUtenza = await uno(`
    SELECT count(*) FROM athlete_guardians
    WHERE user_id IS NOT NULL AND (contact_only OR revoked_at IS NOT NULL)`);
  info("D5 · righe escluse che conservano l'utenza (atteso, non un guasto)", escluseConUtenza);

  const trigger = await uno(`
    SELECT count(*) FROM pg_trigger
    WHERE tgrelid = 'public.athlete_guardians'::regclass AND NOT tgisinternal`);
  prova(
    "D6 · il vaglio d'archivio e vivo sulla tabella",
    Number(trigger) >= 1,
    `trigger: ${trigger}`,
  );

  const duplicati = await uno(`
    SELECT count(*) FROM (
      SELECT user_id, channel, purpose <> 'reset_password' AS otp
      FROM auth_verification_challenges
      WHERE consumed_at IS NULL
      GROUP BY 1, 2, 3 HAVING count(*) > 1
    ) z`);
  prova(
    "D7 · una challenge viva per canale, come l'indice pretende",
    Number(duplicati) === 0,
    `gruppi duplicati: ${duplicati}`,
  );

  if (!prima) {
    console.log(
      "\n  Nessun termine di paragone: rilancia con --in=<file> per confrontare.\n",
    );
    return;
  }

  console.log("\n— Cio che non doveva muoversi —\n");
  const dopo = await misuraInvarianti();
  for (const nome of Object.keys(INVARIANTI)) {
    const a = prima.invarianti?.[nome];
    const b = dopo[nome];
    prova(
      `I · ${nome}`,
      Number(a) === Number(b),
      `prima=${a} dopo=${b}`,
    );
  }
};

/* ==================================================================== */

console.log(
  `\n  Finestra di migrazione — ${MODO === "pre" ? "PREFLIGHT" : "POSTCHECK"}\n`,
);

try {
  const garanzia = await dichiaraSolaLettura();
  const bersaglio = await uno(
    "SELECT current_database() || '@' || coalesce(inet_server_addr()::text, 'locale') AS c",
  );
  info("database", bersaglio);

  if (MODO === "pre") {
    const invarianti = await misuraInvarianti();
    console.log("");
    for (const [nome, v] of Object.entries(invarianti)) info(nome, v);
    await preflight();

    fs.writeFileSync(
      FILE_OUT,
      JSON.stringify(
        { quando: new Date().toISOString(), bersaglio, garanzia, invarianti },
        null,
        2,
      ),
    );
    console.log(`\n  Termine di paragone salvato in ${FILE_OUT}\n`);
  } else {
    const prima = fs.existsSync(FILE_IN)
      ? JSON.parse(fs.readFileSync(FILE_IN, "utf8"))
      : null;
    if (prima) info("termine di paragone", `${FILE_IN} (${prima.quando})`);
    await postcheck(prima);
  }
} finally {
  await prisma.$disconnect();
}

const passati = esiti.filter((e) => e.ok).length;
console.log(`\n  ${passati}/${esiti.length} verificati.\n`);
if (passati < esiti.length) {
  console.log("  NON PROCEDERE — questi non tornano:");
  for (const e of esiti.filter((x) => !x.ok)) {
    console.log(`   - ${e.titolo}  [${e.dettaglio}]`);
  }
  process.exitCode = 1;
}
