/**
 * **Le guardie comuni alle bonifiche dei dati** (D-RD-16 e le sue fasi).
 *
 * Un solo posto dice quale branch Neon una bonifica puo toccare e come si
 * legge una connection string senza mostrarne i segreti. Gli script che
 * scrivono (`bonifica-appartenenze-legacy.mjs`, `bonifica-appartenenze-fasi.mjs`)
 * importano da qui: due elenchi di branch ammessi divergerebbero al primo
 * ambiente aggiunto, e il secondo sarebbe la porta aperta.
 */

/**
 * L'unico bersaglio ammesso in questa versione. La chiave e il valore di
 * `EASYGAME_DB_ENV`, il valore e l'identificativo dell'endpoint Neon che
 * compare nell'host della connection string. Lo staging Fortitudo e la
 * produzione **non** ci sono: aggiungerli e una decisione, non un parametro.
 */
export const BRANCH_AMMESSI = Object.freeze({
  "web-redesign-staging": "ep-dry-block-alkxdiiu",
});

export const TABELLA_AUDIT = "bonifica_appartenenze_audit";

export const senzaSegreti = (url) => {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(connection string non interpretabile)";
  }
};

/**
 * Verifica che la connection string punti al branch ammesso per l'ambiente
 * e, in scrittura, che sia l'endpoint diretto con `EASYGAME_DB_ENV` coerente.
 * Restituisce l'elenco dei motivi di rifiuto (vuoto = si passa).
 */
export const motiviDiRifiutoDelBersaglio = ({ url, ambiente, scrive, env = process.env }) => {
  const motivi = [];
  const endpoint = BRANCH_AMMESSI[ambiente];
  if (!endpoint) {
    motivi.push(`Ambiente «${ambiente}» non previsto: gli ambienti ammessi sono ${Object.keys(BRANCH_AMMESSI).join(", ")}.`);
    return motivi;
  }
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    motivi.push("Connection string non interpretabile.");
    return motivi;
  }
  if (!host.startsWith(`${endpoint}.`) && !host.startsWith(`${endpoint}-pooler.`)) {
    motivi.push(`Rifiuto: l'host ${host} non e il branch ${ambiente} (${endpoint}). Questo script non tocca altri branch.`);
  }
  if (scrive) {
    if (host.includes("-pooler")) motivi.push("In scrittura serve l'endpoint diretto, non il pooler.");
    if (String(env.EASYGAME_DB_ENV || "") !== ambiente) motivi.push(`In scrittura EASYGAME_DB_ENV deve valere «${ambiente}».`);
  }
  return motivi;
};

/** L'SQL della tabella di audit: la stessa per tutte le fasi. */
export const SQL_TABELLA_AUDIT = `CREATE TABLE IF NOT EXISTS ${TABELLA_AUDIT} (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  organization_id uuid not null,
  tabella text not null,
  riga_id uuid not null,
  operazione text not null,
  regola text not null,
  prima jsonb,
  dopo jsonb,
  eseguita_at timestamptz not null default now(),
  unique (run_id, tabella, riga_id, operazione)
)`;
