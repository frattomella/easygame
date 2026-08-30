import { prisma } from "./prisma";

/**
 * **Il conto su cui il denaro si muove dev'essere un conto di quel club.**
 *
 * ---
 *
 * ## Il difetto che questa funzione chiude
 *
 * `createAccountingEntry` verificava il conto; i quattro domini che
 * **proiettano** nel registro — incassi delle famiglie, sponsorizzazioni,
 * liquidazioni dei bandi, compensi del lavoro sportivo — no. Scrivevano
 * `financial_account_id` cosi come arrivava dal corpo della richiesta, e lo
 * schema di validazione ne controllava la sola lunghezza.
 *
 * Il risultato non era una lettura sbagliata: era denaro che **non esiste in
 * nessun saldo**. `listFinancialAccountBalances` filtra per club **e** per
 * elenco dei conti di quel club, quindi una riga che dichiara il club A e un
 * conto di B non viene contata ne di qua ne di la. La prima nota di A la
 * mostrava, il rendiconto di A la sommava, e la somma dei saldi dei conti di A
 * restava zero.
 *
 * Misurato da una revisione indipendente: 12.345,67 euro di sponsorizzazione,
 * 10.000 di quote, 8.000 di contributi e 500 di compensi, tutti su conti di un
 * altro club. Rendiconto: **+8.500 euro netti**. Somma dei saldi di entrambi i
 * club: **zero**.
 *
 * E in piu il nome del conto usciva: la vista fa `LEFT JOIN financial_accounts`
 * senza predicato sul club, quindi la prima nota di A stampava «Banca B».
 *
 * ## Perche non basta filtrare in lettura
 *
 * Perche il difetto e nella **scrittura**: una riga cosi non deve nascere. Un
 * filtro in lettura la nasconderebbe soltanto, e il denaro resterebbe scritto
 * da qualche parte senza comparire da nessuna.
 */
export const assertContoDelClub = async (
  organizationId: string,
  accountId: unknown,
  client: any = prisma,
): Promise<string | null> => {
  const id = String(accountId ?? "").trim();
  if (!id) return null;

  const conto = await client.financialAccount.findUnique({ where: { id } });
  if (!conto || conto.organization_id !== organizationId) {
    throw new Error(
      "Accesso negato: il conto finanziario non appartiene a questo club",
    );
  }

  /*
    Un conto archiviato continua a derivare il suo saldo — la storia si legge —
    ma non riceve movimenti nuovi. E la stessa regola di
    `ensureAccountBelongsToClub`, e vale per tutti i domini che entrano nel
    registro, non per il solo movimento manuale.
  */
  if (conto.is_archived) {
    throw new Error(
      "Il conto e archiviato: non si registrano movimenti nuovi su un conto chiuso",
    );
  }

  return id;
};
