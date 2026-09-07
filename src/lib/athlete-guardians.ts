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
import { resolveNotificationGuardianEntries } from "@/lib/guardians/notifications";


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

/*
  **Quattro grafie: il badge deve dire cio che il cancello decide.**

  Ne leggeva due, e una riga collegata con `userId` mostrava «Account non
  collegato» mentre apriva l'area famiglia. Un badge che contraddice il cancello
  e peggio di nessun badge.
*/
const LINKED_USER_KEYS = [
  "linkedUserId",
  "linked_user_id",
  "userId",
  "user_id",
];

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
): GuardianLike[] => {
  /*
    **Un id deve nominare una persona sola, e questo poteva nominarne due.**

    L'id nasce dal dato piu l'indice, e sembra percio unico. Non lo e, per due
    ragioni che si incontrano: la scheda atleta **salva** le righe cosi
    normalizzate, quindi l'id sintetico finisce in archivio; e
    `form-submissions.ts` fa `guardians.push` di righe **senza** id. Basta
    allora cancellare una riga — le altre scalano di posto — perche una riga
    gia salvata come `guardian-1-<indirizzo>` si ritrovi accanto a una riga
    senza id che a quel posto genera **lo stesso** identificativo.

    Misurato: due righe con lo stesso id, il clic su «Scollega account» della
    nonna che revoca il **padre**, l'audit che nomina il padre, e la schermata
    che segna «Account non collegato» su tutte e due. Lo stesso id collidente
    faceva copiare il marchio della revoca sulla riga sbagliata al primo
    salvataggio dell'anagrafica.

    Un id gia visto viene percio disambiguato con la sua posizione. Resta
    stabile fra due montaggi della stessa scheda — che e la ragione per cui
    non e un contatore — e smette di essere ambiguo.
  */
  const visti = new Set<string>();

  return (Array.isArray(items) ? items : []).map((guardian, index) => {
    const base =
      guardian?.id ||
      `guardian-${index}-${String(
        guardian?.email || guardian?.phone || guardian?.name || fallbackSeed,
      )
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")}`;

    const id = visti.has(String(base)) ? `${base}--${index}` : String(base);
    visti.add(id);

    return { ...guardian, id };
  });
};

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

  /*
    **Era il terzo gemello, e nessuno lo chiamava cosi** (49 §H).

    Da qui escono i solleciti degli insoluti — che portano il nome del minore,
    l'importo e un **collegamento a gettone per pagare** — e le comunicazioni
    di gruppo. Il censimento lo dichiarava «dominio puro lato client», non
    canonico: cioe una presentazione. Non lo e — decide **chi riceve** — e
    aveva percio la propria copia delle tre difese, la terza di tre, con le
    proprie sfumature.

    Adesso il filtro e `resolveNotificationGuardianEntries`, lo stesso dei
    promemoria del certificato e delle notifiche documentali. Qui resta solo
    cio che e davvero di questo modulo: dare alla riga un identificativo
    stabile e un nome da mostrare.
  */
  const superstiti = resolveNotificationGuardianEntries(data);

  return normalizeGuardianRows(
    superstiti.map((voce) => voce.record),
    String(athlete?.id || "senza-atleta"),
  ).map((guardian, indice) => ({
    id: String(guardian.id),
    name: getGuardianDisplayName(guardian),
    /*
      **Un indirizzo revocato non esce, nemmeno da una riga viva.**

      L'uscita «un legame dichiarato vince» tiene in piedi la riga — ed e
      giusto: madre e padre con l'indirizzo di famiglia condiviso, uno solo
      revocato. Ma se la riga sopravvive portandosi dietro **quell'indirizzo**,
      l'invio ci arriva lo stesso, e la revoca vale per il cruscotto e non per
      la posta. Lo azzera la primitiva, per tutti e tre i canali insieme.
    */
    email: superstiti[indice].linkedUserEmail.toLowerCase(),
    linkedUserId: superstiti[indice].linkedUserId,
  }));
};

export type GuardianAccessState =
  | "linked"
  | "token-active"
  | "token-expired"
  /**
   * **Un recapito dichiarato da chi ha compilato un modulo, non dal club.**
   *
   * Vale come indirizzo a cui scrivere e **non** come chiave dell'area
   * famiglia: ADR-0127 fa valere l'indirizzo di contatto come legame, e quella
   * regola poggia sul presupposto che lo scriva la segreteria.
   */
  | "contact-only"
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
  "contact-only": {
    state: "contact-only",
    label: "Solo recapito",
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
  /**
   * **Il registro dell'atleta, quando chi chiama ce l'ha.**
   *
   * Il segno vive sulla riga **e** in un registro a livello di atleta, e a
   * decidere e il registro: una riga puo quindi essere «solo recapito» senza
   * portarne traccia. Senza questo argomento il badge diceva «Account non
   * collegato» a un tutore che il cancello sta rifiutando, e il club non aveva
   * modo di capire perche.
   */
  contactOnlyIdentities: Iterable<string> = [],
  /*
    **E chi chiama deve avere quel registro davvero.**

    La prima stesura del cablaggio lo leggeva da `athlete.data` nella scheda
    atleta, dove lo stato e un oggetto **chiuso** costruito campo per campo e
    una chiave `data` non esiste: il terzo argomento era sempre vuoto e questa
    funzione tornava a leggere il solo marchio di riga. La correzione c'era e
    non girava — un tutore rifiutato dal cancello compariva come «Account non
    collegato», e alla segreteria non veniva detto ne perche ne come rimediare.
  */
): GuardianAccessStatus => {
  const recapitiSoli = new Set(
    [...contactOnlyIdentities]
      .map((valore) => String(valore || "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (firstValue(guardian, LINKED_USER_KEYS)) return ACCESS_STATUS.linked;

  /*
    **La difesa che governa l'accesso al dato sanitario di un minore era
    invisibile in ogni schermata.**

    `contactOnly` decide se un indirizzo apra o no l'area famiglia — allergie,
    farmaci, byte del certificato — e non compariva da nessuna parte: una
    revisione lo ha misurato con un `grep` su tutto `src/components` e
    `src/app`, zero occorrenze. Prima e dopo che quel segno cadesse, la scheda
    mostrava **la stessa riga e lo stesso badge**, mentre il vaglio dell'accesso
    passava da «no» a «si».

    Il club non aveva modo di vedere che una riga e solo un recapito, ne di
    accorgersi che il segno era caduto. E la forma dell'errore n. 8 di
    CLAUDE.md — un dato che decide un accesso e che nessuna schermata sa
    accendere — applicata a una **difesa** invece che a una funzione, ed e per
    questo che il difetto e rimasto vivo cinque round.
  */
  const suoIndirizzo = String(
    (guardian as any)?.email ||
      (guardian as any)?.linkedUserEmail ||
      (guardian as any)?.linked_user_email ||
      "",
  )
    .trim()
    .toLowerCase();

  if (
    (guardian as any)?.contactOnly ||
    (guardian as any)?.contact_only ||
    (suoIndirizzo && recapitiSoli.has(suoIndirizzo))
  ) {
    return ACCESS_STATUS["contact-only"];
  }

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
