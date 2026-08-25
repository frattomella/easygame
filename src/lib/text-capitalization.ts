/**
 * Maiuscola iniziale sui campi anagrafici, dove ha senso.
 *
 * **Il problema.** Nomi, cognomi, indirizzi e comuni finivano in archivio come
 * capitava: `mario`, `MARIO`, `Mario`. Gli elenchi ordinati alfabeticamente
 * mescolavano le tre forme, e la stessa persona sembrava tre persone.
 *
 * **Cosa questo modulo non fa** (Blocco 7, punto 11):
 *
 * - niente `.toUpperCase()` indiscriminato. Un cognome tutto maiuscolo e come
 *   viene scritto sui documenti, non come si scrive in un elenco;
 * - non tocca **mai** email, password, URL, username, codici fiscali, IBAN,
 *   numeri di tessera, codici catastali o qualunque valore tecnico. La regola
 *   e per parole in una lingua, non per identificatori;
 * - non «corregge» le sigle. `ASD`, `US`, `AC`, `PGS` restano come sono: chi
 *   le ha scritte maiuscole lo ha fatto apposta;
 * - non riscrive mentre si digita. Chi scrive `deLuca` e a meta di `De Luca`,
 *   e correggerlo al terzo carattere gli sposta il cursore. La correzione
 *   avviene **all'uscita dal campo**.
 */

/**
 * Particelle che restano minuscole quando non sono la prima parola.
 *
 * `Mario de Luca`, `Piazza dei Mestieri`, `Van der Berg`. Sono le stesse
 * particelle che l'anagrafe italiana scrive minuscole in mezzo a un nome.
 *
 * Ci sono anche le preposizioni articolate dei nomi di comune, che il Blocco 8
 * ha reso necessarie: dal momento in cui la capitalizzazione arriva sulle
 * schede di modifica, tocca i comuni scelti dall'archivio ISTAT. `Reggio
 * nell'Emilia` diventava `Reggio Nell'Emilia`, cioe un nome ufficiale
 * corretto veniva peggiorato dalla regola che doveva migliorarlo.
 */
const LOWERCASE_PARTICLES = new Set([
  "a",
  "al",
  "all",
  "alla",
  "alle",
  "allo",
  "col",
  "con",
  "d",
  "da",
  "dal",
  "dalla",
  "dalle",
  "dallo",
  "das",
  "de",
  "degli",
  "dei",
  "del",
  "dell",
  "della",
  "delle",
  "dello",
  "den",
  "der",
  "des",
  "di",
  "dos",
  "du",
  "e",
  "ed",
  "in",
  "la",
  "le",
  "lo",
  "nei",
  "negli",
  "nel",
  "nell",
  "nella",
  "nelle",
  "nello",
  "su",
  "sui",
  "sul",
  "sull",
  "sulla",
  "sulle",
  "sullo",
  "ter",
  "van",
  "von",
  "y",
]);

/**
 * Una parola che e gia «intenzionale» non si tocca.
 *
 * Copre tre casi, tutti veri nei dati di un club:
 *
 * - **sigle**: due o piu lettere tutte maiuscole (`ASD`, `SSD`, `AC`);
 * - **maiuscole interne**: `McDonald`, `DeLuca`, `iPhone` — chi le ha scritte
 *   cosi lo sapeva;
 * - **parole con cifre**: `U15`, `2B`, `A1`.
 */
const isIntentional = (word: string) => {
  if (/\d/.test(word)) return true;
  const letters = word.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length >= 2 && letters === letters.toUpperCase()) return true;
  // Maiuscola dopo il primo carattere: e una scelta di chi ha scritto.
  return /[a-zà-ÿ][A-ZÀ-Ý]/.test(word);
};

const capitalizeWord = (word: string) => {
  if (!word) return word;
  if (isIntentional(word)) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
};

/**
 * Applica la maiuscola parola per parola, rispettando trattini e apostrofi.
 *
 * `anna-maria` → `Anna-Maria`, `d'angelo` → `D'Angelo`, `sant'agata` →
 * `Sant'Agata`. Sono separatori interni a un nome, non spazi.
 *
 * **La particella si riconosce prima dell'apostrofo, non dopo.** `nell'emilia`
 * e una parola sola per chi la legge separando gli spazi, ma sono due:
 * `nell` + `emilia`. Confrontare l'intera parola con l'elenco delle
 * particelle non trovava niente e produceva `Nell'Emilia`; lo stesso valeva
 * per `de'` di `Cava de' Tirreni`, dove l'apostrofo e in coda.
 */
const capitalizeSegment = (segment: string, isFirstWord: boolean) => {
  const parts = segment.split(/([-'’])/);

  return parts
    .map((part, index) => {
      // Gli indici dispari sono i separatori: restano com'erano.
      if (index % 2 === 1) return part;

      // Solo il primo pezzo puo essere una particella: in `nell'emilia` e
      // `nell`, non `emilia`.
      const isLeadingPart = index === 0;
      if (
        isLeadingPart &&
        !isFirstWord &&
        LOWERCASE_PARTICLES.has(part.toLowerCase())
      ) {
        return isIntentional(part) ? part : part.toLowerCase();
      }

      return capitalizeWord(part);
    })
    .join("");
};

/**
 * Il valore e stato scritto «come capitava»?
 *
 * Tutto minuscolo — `mario rossi`, `reggio nell'emilia` — e il modo in cui un
 * dato entra senza che nessuno abbia deciso come scriverlo. E il caso per cui
 * questo modulo esiste. (Il tutto maiuscolo non si tocca gia oggi: un cognome
 * in stampatello e come viene scritto sui documenti, e `isIntentional` lo
 * riconosce parola per parola.)
 *
 * **Un valore con una maiuscola gia dentro e gia una decisione**, e non si
 * tocca. La prova che questa distinzione serve arriva dall'archivio ISTAT: su
 * 7.896 comuni, applicare la regola a un nome ufficiale ne cambiava **30** —
 * `Alcara li Fusi` → `Alcara Li Fusi`, `Morra De Sanctis` → `Morra de
 * Sanctis`, `Riva presso Chieri` → `Riva Presso Chieri`. Trenta nomi giusti
 * peggiorati dalla regola che doveva sistemarli, e nessuno dei trenta era un
 * errore di chi li aveva scritti: erano il nome ufficiale.
 *
 * Nessun elenco di particelle chiude quel caso, perche non e una regola:
 * `Alcara li Fusi` vuole `li` minuscolo e `Torre Le Nocelle` lo vuole
 * maiuscolo. Sono nomi propri, e l'elenco dei nomi propri ce l'abbiamo gia —
 * e proprio quello. Con questa condizione i comuni alterati sono **zero**, ed
 * e verificato su tutto il dataset.
 */
const looksUnformatted = (value: string) => {
  const letters = value.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (!letters) return false;

  return letters === letters.toLowerCase();
};

/**
 * Nome proprio, cognome, comune, via.
 *
 * Preserva gli spazi originali: chi ha scritto due spazi voleva due spazi, e
 * comprimerli e una decisione diversa da questa.
 */
export const capitalizeName = (value?: string | null): string => {
  const raw = String(value ?? "");
  if (!raw.trim()) return raw;

  // Gia formattato da qualcuno o da qualcosa: non e compito nostro rifarlo.
  if (!looksUnformatted(raw)) return raw;

  let wordIndex = 0;
  return raw
    .split(/(\s+)/)
    .map((chunk) => {
      if (/^\s+$/.test(chunk) || !chunk) return chunk;
      const result = capitalizeSegment(chunk, wordIndex === 0);
      wordIndex += 1;
      return result;
    })
    .join("");
};

/**
 * Frase: maiuscola solo sulla prima lettera, il resto invariato.
 *
 * Per note, descrizioni e motivazioni — dove trasformare ogni parola sarebbe
 * grottesco.
 */
export const capitalizeSentence = (value?: string | null): string => {
  const raw = String(value ?? "");
  const match = /\S/.exec(raw);
  if (!match) return raw;

  const at = match.index;
  const first = raw[at];
  if (first !== first.toLowerCase()) return raw;

  return raw.slice(0, at) + first.toUpperCase() + raw.slice(at + 1);
};

export type CapitalizationMode = "name" | "sentence" | "none";

/**
 * Campi che **non** vanno mai capitalizzati, riconosciuti dal nome.
 *
 * E un elenco per sottostringa perche gli stessi campi si chiamano in molti
 * modi nel repository (`fiscalCode`, `fiscal_code`, `codiceFiscale`).
 */
const NEVER_CAPITALIZE = [
  "email",
  "mail",
  "password",
  "pwd",
  "url",
  "website",
  "sito",
  "link",
  "username",
  "user",
  "login",
  "token",
  "code",
  "codice",
  "fiscal",
  "iban",
  "bic",
  "swift",
  "vat",
  "piva",
  "partitaiva",
  "tessera",
  "membership",
  "number",
  "numero",
  "phone",
  "telefono",
  "cellulare",
  "pec",
  "hash",
  "slug",
  "id",
];

const SENTENCE_FIELDS = ["note", "notes", "description", "descrizione", "bio", "motivo"];

/**
 * Che trattamento merita un campo, dedotto dal suo nome.
 *
 * Serve a non dover decidere caso per caso in trenta form: chi monta un input
 * passa il nome del campo e ottiene la regola. Nel dubbio la risposta e
 * `"none"` — non capitalizzare e sempre reversibile, capitalizzare no.
 */
export const capitalizationModeForField = (
  fieldName?: string | null,
): CapitalizationMode => {
  const key = String(fieldName || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

  if (!key) return "none";
  if (NEVER_CAPITALIZE.some((needle) => key.includes(needle))) return "none";
  if (SENTENCE_FIELDS.some((needle) => key.includes(needle))) return "sentence";

  return "name";
};

/** Applica la modalita scelta. */
export const applyCapitalization = (
  value: string | null | undefined,
  mode: CapitalizationMode,
): string => {
  if (mode === "name") return capitalizeName(value);
  if (mode === "sentence") return capitalizeSentence(value);
  return String(value ?? "");
};
