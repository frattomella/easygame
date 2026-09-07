/**
 * **Un numero di telefono ha una forma sola: E.164.**
 *
 * Modulo puro (nessun Prisma, nessuna rete, nessun DOM), come gli altri di
 * `src/lib/auth/`: si prova senza database.
 *
 * ## Perche una forma canonica, e perche qui
 *
 * Il numero arriva scritto come lo scrive una persona: `340 123 4567`,
 * `+39 340-1234567`, `0039 3401234567`, `3401234567`. Sono lo stesso numero, e
 * finche restano quattro stringhe diverse succedono quattro cose sbagliate
 * insieme:
 *
 * 1. il **contatore per numero** conta quattro secchielli invece di uno, e chi
 *    vuole far arrivare cento SMS a un numero deve solo scriverlo in modo
 *    diverso ogni volta;
 * 2. la challenge legata al `target` non si ritrova, perche il target salvato e
 *    scritto in un modo e quello corrente in un altro;
 * 3. il provider SMS rifiuta o consegna a caso, perche in E.164 ci vuole
 *    comunque qualcuno che ce lo porti;
 * 4. due account occupano lo stesso numero senza che nessuno se ne accorga.
 *
 * ## Cosa questo modulo non fa
 *
 * Non e una libreria di numerazione telefonica mondiale e non prova a esserlo:
 * conosce **una** regola nazionale, quella italiana, perche l'Italia e il
 * mercato del prodotto e perche un cellulare italiano si riconosce da una riga.
 * Per ogni altro prefisso applica il solo vincolo E.164 (da 8 a 15 cifre) e lo
 * **dichiara**: `mobileChecked: false`. E il verso onesto in cui sbagliare —
 * accettare un numero estero valido che non sappiamo classificare, invece di
 * rifiutare per ignoranza il numero di chi vive fuori.
 */

/** Il prefisso internazionale usato quando chi scrive non ne mette uno. */
export const DEFAULT_COUNTRY_CALLING_CODE = "+39";

export type PhoneNormalizationFailure =
  | "empty"
  | "invalid_characters"
  | "missing_country_code"
  | "too_short"
  | "too_long"
  | "not_mobile";

export type PhoneNormalizationResult =
  | {
      valid: true;
      /** La forma canonica: `+` seguito da sole cifre. */
      e164: string;
      /** Il prefisso paese riconosciuto, con il `+`. */
      countryCallingCode: string;
      /** Il numero nazionale, senza prefisso. */
      nationalNumber: string;
      /** `true` solo dove sappiamo distinguere un cellulare da un fisso. */
      mobileChecked: boolean;
    }
  | { valid: false; reason: PhoneNormalizationFailure };

/**
 * I prefissi che sappiamo classificare. Non e un elenco di paesi ammessi: e
 * l'elenco dei paesi di cui conosciamo la regola dei cellulari.
 */
const KNOWN_MOBILE_RULES: Record<
  string,
  { pattern: RegExp; minLength: number; maxLength: number }
> = {
  /*
    Italia. I cellulari cominciano per 3 e hanno da 9 a 10 cifre: 3401234567 e
    la forma corrente, 33512345 non e mai esistita e 340123456 e una vecchia
    numerazione a nove cifre ancora attiva su alcune SIM. Il fisso italiano
    porta lo zero interurbano dentro il numero (`06...`, `02...`) e qui **non**
    passa: la verifica arriva per SMS, e un fisso non riceve SMS.
  */
  "+39": { pattern: /^3\d{8,9}$/, minLength: 9, maxLength: 10 },
};

/**
 * I paesi in cui lo zero iniziale **appartiene** al numero e non va tolto.
 * L'Italia e il caso di scuola; San Marino usa la numerazione italiana.
 */
const TRUNK_ZERO_COUNTRIES = new Set(["+39", "+378"]);

/** La riga base di E.164: prefisso che non comincia per zero, poi cifre. */
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

/**
 * Il prefisso predefinito dell'installazione.
 *
 * Configurabile perche un club svizzero o sammarinese non deve toccare il
 * codice per far scrivere ai propri soci il numero come lo scrivono sempre.
 * Un valore malformato **non** ricade in silenzio su un altro paese: torna
 * all'Italia, che e il valore documentato, invece di inventare.
 */
export const resolveDefaultCountryCallingCode = (
  environment: Record<string, string | undefined> = process.env,
) => {
  const dichiarato = String(environment.AUTH_DEFAULT_COUNTRY_CODE || "").trim();
  const normalizzato = dichiarato.startsWith("+") ? dichiarato : `+${dichiarato}`;
  return /^\+[1-9]\d{0,2}$/.test(normalizzato)
    ? normalizzato
    : DEFAULT_COUNTRY_CALLING_CODE;
};

/**
 * Da come lo scrive una persona a come lo vuole un operatore.
 *
 * Accetta spazi, punti, trattini, barre e parentesi — sono separatori, non
 * dati — e li butta. Non accetta lettere: un numero con dentro una lettera non
 * e un numero scritto male, e un'altra cosa.
 */
export const normalizePhoneNumber = (
  raw: unknown,
  defaultCountryCallingCode = resolveDefaultCountryCallingCode(),
): PhoneNormalizationResult => {
  const grezzo = String(raw ?? "").trim();
  if (!grezzo) return { valid: false, reason: "empty" };

  /*
    `00` e il prefisso di uscita internazionale scritto a voce; `+` e lo stesso
    concetto scritto per una macchina. Si traduce prima di ogni altra cosa,
    altrimenti `0039340...` diventerebbe un numero nazionale che comincia per
    zero e verrebbe rifiutato per il motivo sbagliato.
  */
  const senzaSeparatori = grezzo
    .replace(/^00/, "+")
    .replace(/[\s.\-/()]/g, "");

  if (!/^\+?\d+$/.test(senzaSeparatori)) {
    return { valid: false, reason: "invalid_characters" };
  }

  /*
    **Lo zero interurbano: l'Italia e l'eccezione, non la regola.**

    Quasi ovunque lo zero iniziale di un numero scritto in forma nazionale e un
    prefisso di uscita e va tolto passando a E.164 (`020 7946 0000` diventa
    `+442079460000`). In Italia **no**: lo zero fa parte del numero, e `06
    1234567` in E.164 e `+39061234567`.

    Toglierlo comunque non produceva un numero sbagliato per caso: produceva un
    numero **piu corto**, che veniva poi rifiutato con «troppo corto» invece che
    con «serve un cellulare». Il rifiuto era giusto e il motivo era falso, e il
    motivo e cio che la persona legge.
  */
  const tieneLoZero = TRUNK_ZERO_COUNTRIES.has(defaultCountryCallingCode);
  const conPrefisso = senzaSeparatori.startsWith("+")
    ? senzaSeparatori
    : `${defaultCountryCallingCode}${
        tieneLoZero ? senzaSeparatori : senzaSeparatori.replace(/^0+/, "")
      }`;

  if (!conPrefisso.startsWith("+") || conPrefisso.length < 2) {
    return { valid: false, reason: "missing_country_code" };
  }

  const soleCifre = conPrefisso.slice(1);
  if (soleCifre.length < 8) return { valid: false, reason: "too_short" };
  if (soleCifre.length > 15) return { valid: false, reason: "too_long" };
  if (!E164_PATTERN.test(conPrefisso)) {
    return { valid: false, reason: "missing_country_code" };
  }

  /*
    Il prefisso si riconosce dal piu lungo al piu corto: `+1` e `+39` e `+378`
    convivono, e chi cerca dal piu corto attribuirebbe a `+3` numeri che sono
    italiani. Qui l'elenco e uno, ma la regola di lettura e quella giusta fin
    da subito: un secondo paese aggiunto domani non deve cambiare questa riga.
  */
  const prefissoNoto = Object.keys(KNOWN_MOBILE_RULES)
    .sort((a, b) => b.length - a.length)
    .find((prefisso) => conPrefisso.startsWith(prefisso));

  if (!prefissoNoto) {
    return {
      valid: true,
      e164: conPrefisso,
      countryCallingCode: `+${soleCifre.slice(0, 2)}`,
      nationalNumber: soleCifre.slice(2),
      mobileChecked: false,
    };
  }

  const regola = KNOWN_MOBILE_RULES[prefissoNoto]!;
  const nazionale = conPrefisso.slice(prefissoNoto.length);

  if (nazionale.length < regola.minLength) {
    return { valid: false, reason: "too_short" };
  }
  if (nazionale.length > regola.maxLength) {
    return { valid: false, reason: "too_long" };
  }
  if (!regola.pattern.test(nazionale)) {
    return { valid: false, reason: "not_mobile" };
  }

  return {
    valid: true,
    e164: conPrefisso,
    countryCallingCode: prefissoNoto,
    nationalNumber: nazionale,
    mobileChecked: true,
  };
};

/** I messaggi, in un posto solo: le rotte non riscrivono la stessa frase. */
export const PHONE_NORMALIZATION_MESSAGES: Record<
  PhoneNormalizationFailure,
  string
> = {
  empty: "Il numero di cellulare è obbligatorio.",
  invalid_characters: "Il numero di cellulare può contenere solo cifre.",
  missing_country_code:
    "Indica il numero con il prefisso internazionale, per esempio +39.",
  too_short: "Il numero di cellulare è troppo corto.",
  too_long: "Il numero di cellulare è troppo lungo.",
  not_mobile:
    "Serve un numero di cellulare: un numero fisso non può ricevere il codice via SMS.",
};

export const getPhoneNormalizationMessage = (
  reason: PhoneNormalizationFailure,
) => PHONE_NORMALIZATION_MESSAGES[reason];

/**
 * Il numero come si mostra a schermo quando non si vuole **mostrarlo**.
 *
 * Serve nella schermata di verifica: chi ha appena scritto il proprio numero
 * deve riconoscerlo, e chi e arrivato li con l'identificativo di qualcun altro
 * non deve poterlo leggere. Restano il prefisso e le ultime tre cifre, che
 * bastano a dire «si, e il mio» e non bastano a comporlo.
 */
export const maskPhoneNumber = (e164: string) => {
  const valore = String(e164 || "").trim();
  if (!valore.startsWith("+") || valore.length < 6) return "•••";
  const coda = valore.slice(-3);
  const testa = valore.slice(0, 3);
  return `${testa}${"•".repeat(Math.max(valore.length - 6, 3))}${coda}`;
};
