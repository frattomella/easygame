/**
 * Genitori e tutori di un atleta: il dominio, senza interfaccia.
 *
 * **Perche esiste** (WP-19, Blocco 8). Questa logica viveva in cima a
 * `src/app/athletes/[id]/page.tsx`, che supera le 8.000 righe. Non era
 * sbagliata — era invisibile: le regole su quando un token e scaduto, su come
 * si legge lo stato di un collegamento e su quale nome mostrare stavano in
 * mezzo a duecento `useState`, e nessuna era verificata.
 *
 * Qui non c'e React e non c'e `fetch`. E la condizione perche le regole si
 * possano provare: un test le esercita senza montare una pagina da 340 kB.
 *
 * **Perche i campi si leggono in tre grafie.** Un genitore arriva dal payload
 * JSON dell'atleta, dove lo stesso dato e stato scritto negli anni come
 * `parentAccessTokenExpiresAt`, `parent_access_token_expires_at` e
 * `accessTokenExpiresAt`. Normalizzarli in archivio e una migrazione a se; qui
 * si legge cio che c'e, e si legge in un posto solo.
 */

/** Quanto vive un token di accesso genitore, quando nessuno lo dichiara. */
export const PARENT_TOKEN_EXPIRY_HOURS = 72;

/**
 * Alfabeto senza caratteri ambigui.
 *
 * Niente `I`, `O`, `0`, `1`: un token si detta al telefono e si trascrive a
 * mano, e la differenza fra `O` e `0` in una segreteria e una telefonata in
 * piu.
 */
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const TOKEN_LENGTH = 9;

/**
 * Un token di accesso genitore.
 *
 * Usa `crypto.getRandomValues` quando c'e. Il ripiego su `Math.random` serve
 * solo al rendering server, dove questa funzione non viene mai chiamata per
 * generare un token vero: un token con entropia debole non deve poter
 * finire in archivio per una svista di ambiente.
 */
export const createParentAccessToken = (
  randomSource?: (length: number) => Uint32Array,
): string => {
  const values =
    randomSource?.(TOKEN_LENGTH) ||
    (typeof globalThis.crypto?.getRandomValues === "function"
      ? globalThis.crypto.getRandomValues(new Uint32Array(TOKEN_LENGTH))
      : Uint32Array.from({ length: TOKEN_LENGTH }, () =>
          Math.floor(Math.random() * TOKEN_ALPHABET.length),
        ));

  return `PAR${Array.from(
    values,
    (value) => TOKEN_ALPHABET[value % TOKEN_ALPHABET.length],
  ).join("")}`;
};

/** `PARAB12CD34` → `PARA-B12C-D34`: si legge e si detta a gruppi di quattro. */
export const formatParentAccessToken = (value?: string | null): string => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");

  if (!normalized) return "-";

  return normalized.match(/.{1,4}/g)?.join("-") || normalized;
};

export type GuardianLike = Record<string, any>;

/** Il primo valore non vuoto fra piu grafie dello stesso campo. */
const firstValue = (guardian: GuardianLike, keys: string[]) => {
  for (const key of keys) {
    const value = guardian?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return null;
};

const TOKEN_VALUE_KEYS = [
  "parentAccessTokenValue",
  "parent_access_token_value",
  "accessTokenValue",
];

const TOKEN_STATUS_KEYS = [
  "parentAccessTokenStatus",
  "parent_access_token_status",
  "accessTokenStatus",
];

const TOKEN_EXPIRY_KEYS = [
  "parentAccessTokenExpiresAt",
  "parent_access_token_expires_at",
  "accessTokenExpiresAt",
];

const TOKEN_GENERATED_KEYS = [
  "parentAccessTokenGeneratedAt",
  "parent_access_token_generated_at",
  "accessTokenGeneratedAt",
];

const LINKED_USER_KEYS = ["linkedUserId", "linked_user_id"];

export const getGuardianDisplayName = (guardian: GuardianLike): string =>
  [guardian?.name, guardian?.surname].filter(Boolean).join(" ").trim() ||
  guardian?.email ||
  "Genitore/Tutore";

/**
 * Da un elenco di genitori a un elenco con un `id` stabile.
 *
 * Serve a React per non ridisegnare le righe sbagliate. L'id si costruisce dal
 * dato — email, telefono, nome — e non da un contatore: due montaggi della
 * stessa scheda devono produrre le stesse chiavi, altrimenti il campo che si
 * sta modificando perde il fuoco.
 */
export const normalizeGuardianRows = (
  items: GuardianLike[],
  fallbackSeed: string | number = "senza-dati",
): GuardianLike[] =>
  (Array.isArray(items) ? items : []).map((guardian, index) => ({
    ...guardian,
    id:
      guardian?.id ||
      `guardian-${index}-${String(
        guardian?.email || guardian?.phone || guardian?.name || fallbackSeed,
      )
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")}`,
  }));

/**
 * Un tutore visto come **recapito**: chi e, dove lo si raggiunge, e se ha un
 * account.
 *
 * **Perche esiste** (W1-F). Chi deve mandare qualcosa a una famiglia partiva
 * finora da `getParentUserIds`, che elenca i soli tutori **con un account
 * collegato**: le famiglie senza account uscivano dall'elenco senza comparire
 * da nessuna parte, e l'operazione si dichiarava riuscita lo stesso. Un
 * indirizzo email in anagrafica c'e anche senza account, ed e il recapito che
 * quelle famiglie hanno davvero.
 *
 * `email` vuota e `linkedUserId` vuoto sono due assenze diverse e vanno
 * distinte da chi legge: la prima dice «non so dove scrivergli», la seconda
 * dice «non ha un posto dove leggere in applicazione».
 */
export type AthleteGuardianContact = {
  /** Stabile: nasce dal dato, non da un contatore. */
  id: string;
  name: string;
  /** Normalizzata in minuscolo. Vuota quando l'anagrafica non ne porta una. */
  email: string;
  /** L'account collegato dichiarato in anagrafica. Vuoto quando non c'e. */
  linkedUserId: string;
};

const GUARDIAN_EMAIL_KEYS = ["email", "linkedUserEmail", "linked_user_email"];

const GUARDIAN_ACCOUNT_KEYS = [
  "linkedUserId",
  "linked_user_id",
  "userId",
  "user_id",
];

/**
 * I tutori di un atleta, nelle **due forme che convivono in archivio**:
 * l'elenco `guardians` e la coppia storica `parent1` / `parent2`.
 *
 * L'elenco vince quando c'e: le due forme non si sommano, perche
 * un'anagrafica migrata porta gli stessi due tutori in entrambe e sommarle
 * scriverebbe due volte alla stessa persona.
 */
export const readAthleteGuardianContacts = (
  athlete: GuardianLike | null | undefined,
): AthleteGuardianContact[] => {
  const data =
    athlete && typeof athlete === "object" && athlete.data ? athlete.data : {};
  const record = data && typeof data === "object" ? (data as GuardianLike) : {};

  const listed = Array.isArray(record.guardians) ? record.guardians : [];
  const legacy = [record.parent1, record.parent2].filter(
    (value) => value && typeof value === "object",
  ) as GuardianLike[];

  /*
    **Anche qui l'elenco delle identita, non solo il marchio di riga.**

    Da questa funzione escono i solleciti degli insoluti — che portano il
    **link per pagare** — e le comunicazioni di gruppo. La verita sulla revoca
    si e spostata dalla riga all'identita, perche il marchio di riga si
    aggirava aggiungendone una sorella con lo stesso indirizzo; questa lettura
    era rimasta indietro, quindi la riga sorella riapriva questo canale.
  */
  const identitaRevocate = new Set(
    (Array.isArray((record as any).revokedGuardianIdentities)
      ? ((record as any).revokedGuardianIdentities as unknown[])
      : []
    )
      .map((valore) => String(valore || "").trim().toLowerCase())
      .filter(Boolean),
  );

  const rows = (listed.length > 0 ? listed : legacy).filter((riga) => {
    const identita = (riga || {}) as GuardianLike;
    const revocataPerIdentita = [
      (identita as any).linkedUserId,
      (identita as any).linked_user_id,
      (identita as any).userId,
      (identita as any).user_id,
      (identita as any).linkedUserEmail,
      (identita as any).linked_user_email,
      (identita as any).email,
    ].some((valore) =>
      identitaRevocate.has(String(valore || "").trim().toLowerCase()),
    );
      /*
        **Un legame dichiarato e non revocato vince, come per l'accesso.**

        Senza questa uscita i canali di invio erano piu chiusi del cancello, e
        in due modi che si vedevano solo dal lato della famiglia:

        1. `contactOnly` non aveva **nessuna strada di ritorno**. Il percorso
           normale di una nuova iscrizione — la famiglia compila il modulo
           pubblico, la segreteria approva e le genera un invito, lei lo
           riscatta — le dava l'area famiglia completa e **nessun invio**: ne
           il sollecito, ne il promemoria del certificato, ne le notifiche
           documentali. Per sempre, e senza che niente lo dicesse: la scheda
           mostrava «Account collegato». Un invito generato dal club **per
           quella riga** e il club che se ne fa garante;
        2. madre e padre con lo stesso indirizzo di famiglia — configurazione
           ordinaria — e la revoca di uno metteva quell'indirizzo nell'elenco,
           chiudendo i canali **all'altro**, che ha il proprio legame
           dichiarato e continua a entrare nel cruscotto.

        E la stessa uscita che `athleteBelongsToParent` ha da sempre. Averla
        qui e non li voleva dire che la stessa domanda, sulla stessa persona,
        aveva due risposte.
      */
    const dichiarato = String(
      (identita as any).linkedUserId || (identita as any).linked_user_id || "",
    )
      .trim()
      .toLowerCase();

    if (dichiarato && !identitaRevocate.has(dichiarato)) return true;

    if (revocataPerIdentita) return false;

    /*
      **E il segno di solo-recapito.**

      Da qui escono i solleciti degli insoluti — che portano il nome del
      minore, l'importo e un **collegamento a gettone per pagare** — e le
      comunicazioni di gruppo. Una riga `contactOnly` e un indirizzo che
      **uno sconosciuto ha dichiarato** compilando un modulo pubblico: il
      ragionamento scritto per l'accesso vale parola per parola anche qui, e
      per un link di pagamento vale di piu.

      Finora questo segno lo onorava **solo** il percorso di accesso: la riga
      non apriva il cruscotto e intanto riceveva le email. Tre difese e quattro
      letture, ognuna che ne guardava un sottoinsieme diverso.
    */
    if ((identita as any).contactOnly || (identita as any).contact_only) {
      return false;
    }

    /*
      **Chi e stato scollegato non riceve piu avvisi su quel minore.**

      Da qui passano i solleciti di pagamento e le comunicazioni di gruppo, che
      portano il nome del minore, l'insoluto e un collegamento a gettone. La
      revoca lascia in piedi l'indirizzo di **contatto** — al club serve per
      scrivere a quella persona di sua iniziativa — ma questi invii non sono
      una scelta del club: partono da soli, per un minore che quella persona
      non segue piu.

      E la stessa domanda a cui i promemoria del certificato hanno gia
      risposto: due letture non possono dare due risposte.
    */
    const record = (riga || {}) as GuardianLike;
    return !String(
      (record as any).accessRevokedAt || (record as any).access_revoked_at || "",
    ).trim();
  });

  return normalizeGuardianRows(rows, String(athlete?.id || "senza-atleta")).map(
    (guardian) => ({
      id: String(guardian.id),
      name: getGuardianDisplayName(guardian),
      email: String(firstValue(guardian, GUARDIAN_EMAIL_KEYS) || "")
        .trim()
        .toLowerCase(),
      linkedUserId: String(
        firstValue(guardian, GUARDIAN_ACCOUNT_KEYS) || "",
      ).trim(),
    }),
  );
};

export type GuardianAccessState =
  | "linked"
  | "token-active"
  | "token-expired"
  | "not-linked";

export type GuardianAccessStatus = {
  state: GuardianAccessState;
  label: string;
  className: string;
};

const ACCESS_STATUS: Record<GuardianAccessState, GuardianAccessStatus> = {
  linked: {
    state: "linked",
    label: "Account collegato",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  },
  "token-active": {
    state: "token-active",
    label: "Token attivo",
    className: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50",
  },
  "token-expired": {
    state: "token-expired",
    label: "Token scaduto",
    className: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
  },
  "not-linked": {
    state: "not-linked",
    label: "Account non collegato",
    className:
      "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100",
  },
};

/**
 * In che stato e l'accesso di un genitore.
 *
 * L'ordine delle condizioni e il contenuto della regola: **un account
 * collegato vince su tutto**, anche su un token scaduto, perche il token e il
 * mezzo con cui ci si collega e una volta collegati non serve piu. Invertire
 * i due controlli mostrerebbe «Token scaduto» a un genitore che sta usando
 * l'applicazione in quel momento.
 */
export const getGuardianAccessStatus = (
  guardian: GuardianLike,
  nowMs: number = Date.now(),
): GuardianAccessStatus => {
  if (firstValue(guardian, LINKED_USER_KEYS)) return ACCESS_STATUS.linked;

  const status = String(firstValue(guardian, TOKEN_STATUS_KEYS) || "")
    .trim()
    .toLowerCase();

  if (status === "revoked" || status === "disconnected") {
    return ACCESS_STATUS["not-linked"];
  }

  const expiresAtRaw = firstValue(guardian, TOKEN_EXPIRY_KEYS);
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw as string) : null;
  const isExpired = Boolean(
    expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < nowMs,
  );

  if ((status === "expired" || isExpired) && expiresAtRaw) {
    return ACCESS_STATUS["token-expired"];
  }

  if (firstValue(guardian, TOKEN_VALUE_KEYS)) {
    return ACCESS_STATUS["token-active"];
  }

  return ACCESS_STATUS["not-linked"];
};

export type GuardianTokenTiming = {
  label: string;
  /** 0-100: quanto del tempo concesso resta. */
  progress: number;
  isExpired: boolean;
};

/**
 * Quanto manca alla scadenza di un token, in una forma da mostrare.
 *
 * La barra si calcola sul tempo **effettivamente concesso** (scadenza meno
 * generazione) quando entrambe le date ci sono, e sulle 72 ore di default
 * quando la data di generazione manca — cosa che succede sui token creati
 * prima che venisse registrata. Senza questa distinzione un token da 24 ore
 * apparirebbe gia a un terzo appena creato.
 */
export const getGuardianTokenTiming = (
  guardian: GuardianLike,
  nowMs: number = Date.now(),
): GuardianTokenTiming => {
  const expiresAtRaw = firstValue(guardian, TOKEN_EXPIRY_KEYS);
  const generatedAtRaw = firstValue(guardian, TOKEN_GENERATED_KEYS);

  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw as string).getTime() : 0;
  const generatedAt = generatedAtRaw
    ? new Date(generatedAtRaw as string).getTime()
    : 0;

  if (!expiresAt || Number.isNaN(expiresAt)) {
    return { label: "Scadenza non disponibile", progress: 0, isExpired: false };
  }

  const remainingMs = Math.max(expiresAt - nowMs, 0);
  const totalMs =
    generatedAt && !Number.isNaN(generatedAt)
      ? Math.max(expiresAt - generatedAt, 1)
      : PARENT_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;

  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

  return {
    label: remainingMs > 0 ? `${hours}h ${minutes}m rimanenti` : "Token scaduto",
    progress: Math.max(0, Math.min(100, (remainingMs / totalMs) * 100)),
    isExpired: remainingMs <= 0,
  };
};
