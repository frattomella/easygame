/**
 * Numeri di telefono: prefisso internazionale e numero, separati.
 *
 * **Il problema.** Ogni anagrafica aveva un campo di testo libero, e dentro ci
 * finiva di tutto: `333 1234567`, `+39 333 1234567`, `0039 3331234567`,
 * `333-123-4567`. Cercare un numero non funzionava, confrontarne due nemmeno,
 * e non c'era modo di sapere se un numero fosse italiano o no.
 *
 * **La regola** (Blocco 7, punto 10): il prefisso si sceglie da un elenco, il
 * numero si scrive a parte, e il valore memorizzato e sempre
 * `+<prefisso> <numero>`.
 *
 * **I dati esistenti non si toccano.** `parsePhoneNumber` sa leggere tutte le
 * forme di sopra; un numero che non si riesce a interpretare resta com'e, e
 * viene riscritto solo se qualcuno lo modifica davvero. Una normalizzazione
 * di massa su numeri di telefono e il tipo di operazione che si scopre di
 * aver sbagliato quando un genitore non riceve piu gli avvisi.
 */

export type PhoneCountry = {
  /** ISO 3166-1 alpha-2, usato come chiave stabile. */
  code: string;
  /** Prefisso internazionale, senza `+`. */
  dial: string;
  name: string;
  /** Bandiera come emoji: due caratteri, nessuna immagine da scaricare. */
  flag: string;
};

/**
 * L'elenco e **curato**, non esaustivo: Europa completa piu i paesi di
 * provenienza piu frequenti nelle societa sportive italiane. Un elenco di 200
 * voci in una tendina non aiuta nessuno.
 *
 * Aggiungerne uno e una riga sola. Un numero con un prefisso fuori elenco
 * resta comunque memorizzabile: `parsePhoneNumber` lo lascia intatto.
 */
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: "IT", dial: "39", name: "Italia", flag: "🇮🇹" },
  { code: "AL", dial: "355", name: "Albania", flag: "🇦🇱" },
  { code: "DZ", dial: "213", name: "Algeria", flag: "🇩🇿" },
  { code: "AD", dial: "376", name: "Andorra", flag: "🇦🇩" },
  { code: "AR", dial: "54", name: "Argentina", flag: "🇦🇷" },
  { code: "AT", dial: "43", name: "Austria", flag: "🇦🇹" },
  { code: "BD", dial: "880", name: "Bangladesh", flag: "🇧🇩" },
  { code: "BE", dial: "32", name: "Belgio", flag: "🇧🇪" },
  { code: "BY", dial: "375", name: "Bielorussia", flag: "🇧🇾" },
  { code: "BA", dial: "387", name: "Bosnia ed Erzegovina", flag: "🇧🇦" },
  { code: "BR", dial: "55", name: "Brasile", flag: "🇧🇷" },
  { code: "BG", dial: "359", name: "Bulgaria", flag: "🇧🇬" },
  { code: "CA", dial: "1", name: "Canada", flag: "🇨🇦" },
  { code: "CN", dial: "86", name: "Cina", flag: "🇨🇳" },
  { code: "CO", dial: "57", name: "Colombia", flag: "🇨🇴" },
  { code: "KR", dial: "82", name: "Corea del Sud", flag: "🇰🇷" },
  { code: "CI", dial: "225", name: "Costa d'Avorio", flag: "🇨🇮" },
  { code: "HR", dial: "385", name: "Croazia", flag: "🇭🇷" },
  { code: "CU", dial: "53", name: "Cuba", flag: "🇨🇺" },
  { code: "DK", dial: "45", name: "Danimarca", flag: "🇩🇰" },
  { code: "EG", dial: "20", name: "Egitto", flag: "🇪🇬" },
  { code: "EE", dial: "372", name: "Estonia", flag: "🇪🇪" },
  { code: "PH", dial: "63", name: "Filippine", flag: "🇵🇭" },
  { code: "FI", dial: "358", name: "Finlandia", flag: "🇫🇮" },
  { code: "FR", dial: "33", name: "Francia", flag: "🇫🇷" },
  { code: "GE", dial: "995", name: "Georgia", flag: "🇬🇪" },
  { code: "DE", dial: "49", name: "Germania", flag: "🇩🇪" },
  { code: "GH", dial: "233", name: "Ghana", flag: "🇬🇭" },
  { code: "JP", dial: "81", name: "Giappone", flag: "🇯🇵" },
  { code: "GR", dial: "30", name: "Grecia", flag: "🇬🇷" },
  { code: "IN", dial: "91", name: "India", flag: "🇮🇳" },
  { code: "IE", dial: "353", name: "Irlanda", flag: "🇮🇪" },
  { code: "IS", dial: "354", name: "Islanda", flag: "🇮🇸" },
  { code: "IL", dial: "972", name: "Israele", flag: "🇮🇱" },
  { code: "XK", dial: "383", name: "Kosovo", flag: "🇽🇰" },
  { code: "LV", dial: "371", name: "Lettonia", flag: "🇱🇻" },
  { code: "LI", dial: "423", name: "Liechtenstein", flag: "🇱🇮" },
  { code: "LT", dial: "370", name: "Lituania", flag: "🇱🇹" },
  { code: "LU", dial: "352", name: "Lussemburgo", flag: "🇱🇺" },
  { code: "MK", dial: "389", name: "Macedonia del Nord", flag: "🇲🇰" },
  { code: "MA", dial: "212", name: "Marocco", flag: "🇲🇦" },
  { code: "MT", dial: "356", name: "Malta", flag: "🇲🇹" },
  { code: "MD", dial: "373", name: "Moldavia", flag: "🇲🇩" },
  { code: "MC", dial: "377", name: "Monaco", flag: "🇲🇨" },
  { code: "ME", dial: "382", name: "Montenegro", flag: "🇲🇪" },
  { code: "NG", dial: "234", name: "Nigeria", flag: "🇳🇬" },
  { code: "NO", dial: "47", name: "Norvegia", flag: "🇳🇴" },
  { code: "NL", dial: "31", name: "Paesi Bassi", flag: "🇳🇱" },
  { code: "PK", dial: "92", name: "Pakistan", flag: "🇵🇰" },
  { code: "PE", dial: "51", name: "Perù", flag: "🇵🇪" },
  { code: "PL", dial: "48", name: "Polonia", flag: "🇵🇱" },
  { code: "PT", dial: "351", name: "Portogallo", flag: "🇵🇹" },
  { code: "GB", dial: "44", name: "Regno Unito", flag: "🇬🇧" },
  { code: "CZ", dial: "420", name: "Repubblica Ceca", flag: "🇨🇿" },
  { code: "DO", dial: "1809", name: "Repubblica Dominicana", flag: "🇩🇴" },
  { code: "RO", dial: "40", name: "Romania", flag: "🇷🇴" },
  { code: "RU", dial: "7", name: "Russia", flag: "🇷🇺" },
  { code: "SM", dial: "378", name: "San Marino", flag: "🇸🇲" },
  { code: "SN", dial: "221", name: "Senegal", flag: "🇸🇳" },
  { code: "RS", dial: "381", name: "Serbia", flag: "🇷🇸" },
  { code: "SK", dial: "421", name: "Slovacchia", flag: "🇸🇰" },
  { code: "SI", dial: "386", name: "Slovenia", flag: "🇸🇮" },
  { code: "ES", dial: "34", name: "Spagna", flag: "🇪🇸" },
  { code: "US", dial: "1", name: "Stati Uniti", flag: "🇺🇸" },
  { code: "ZA", dial: "27", name: "Sudafrica", flag: "🇿🇦" },
  { code: "SE", dial: "46", name: "Svezia", flag: "🇸🇪" },
  { code: "CH", dial: "41", name: "Svizzera", flag: "🇨🇭" },
  { code: "TN", dial: "216", name: "Tunisia", flag: "🇹🇳" },
  { code: "TR", dial: "90", name: "Turchia", flag: "🇹🇷" },
  { code: "UA", dial: "380", name: "Ucraina", flag: "🇺🇦" },
  { code: "HU", dial: "36", name: "Ungheria", flag: "🇭🇺" },
  { code: "VE", dial: "58", name: "Venezuela", flag: "🇻🇪" },
];

export const DEFAULT_PHONE_COUNTRY = "IT";
export const DEFAULT_PHONE_DIAL = "39";

const BY_CODE = new Map(PHONE_COUNTRIES.map((country) => [country.code, country]));

/**
 * Prefissi ordinati dal piu lungo al piu corto.
 *
 * `+1809` (Repubblica Dominicana) deve essere provato prima di `+1` (Stati
 * Uniti), altrimenti ogni numero dominicano diventa statunitense.
 */
const BY_DIAL_LENGTH = [...PHONE_COUNTRIES].sort(
  (left, right) => right.dial.length - left.dial.length,
);

export const findPhoneCountry = (code?: string | null): PhoneCountry | null =>
  BY_CODE.get(String(code || "").trim().toUpperCase()) || null;

/**
 * Il primo paese di un prefisso.
 *
 * Piu paesi condividono lo stesso prefisso (`+1` sono Stati Uniti e Canada):
 * si sceglie il primo in elenco e si accetta che la tendina mostri quello. Il
 * numero memorizzato e identico in entrambi i casi, quindi non si perde nulla.
 */
export const findCountryByDial = (dial?: string | null): PhoneCountry | null => {
  const normalized = String(dial || "").replace(/[^0-9]/g, "");
  if (!normalized) return null;
  return PHONE_COUNTRIES.find((country) => country.dial === normalized) || null;
};

export type ParsedPhone = {
  /** Prefisso senza `+`. Vuoto se il numero non ne dichiara uno. */
  dial: string;
  /** Il numero senza prefisso, sole cifre. */
  national: string;
  /** Il codice paese corrispondente, quando riconosciuto. */
  countryCode: string;
  /**
   * Vero quando il valore in archivio non dichiarava un prefisso: la tendina
   * mostra il default, ma il valore **non va riscritto** finche qualcuno non
   * lo modifica davvero.
   */
  assumedDefault: boolean;
};

/**
 * Legge un numero in qualunque forma sia stato scritto negli anni.
 *
 * Riconosce `+39 …`, `0039…`, `39…` solo se preceduto da `+` o `00`, e il
 * numero nazionale nudo. Non indovina il paese da un numero senza prefisso:
 * `3331234567` puo essere italiano, ma `612345678` e sia francese sia
 * olandese sia spagnolo.
 */
export const parsePhoneNumber = (value?: string | null): ParsedPhone => {
  const raw = String(value || "").trim();

  if (!raw) {
    return {
      dial: "",
      national: "",
      countryCode: DEFAULT_PHONE_COUNTRY,
      assumedDefault: true,
    };
  }

  // `00` e la forma internazionale usata in Italia prima del `+`.
  const withPlus = raw.replace(/^00(?=\d)/, "+");
  const digitsOnly = withPlus.replace(/[^0-9+]/g, "");

  if (digitsOnly.startsWith("+")) {
    const digits = digitsOnly.slice(1);
    for (const country of BY_DIAL_LENGTH) {
      if (digits.startsWith(country.dial)) {
        return {
          dial: country.dial,
          national: digits.slice(country.dial.length),
          countryCode: country.code,
          assumedDefault: false,
        };
      }
    }

    /*
      Prefisso fuori elenco: si tiene cosi com'e invece di attribuirlo a un
      paese a caso. La tendina mostrera il default, ma `assumedDefault` dice a
      chi ospita il campo di non riscrivere niente.
    */
    return {
      dial: "",
      national: digits,
      countryCode: DEFAULT_PHONE_COUNTRY,
      assumedDefault: true,
    };
  }

  return {
    dial: "",
    national: digitsOnly,
    countryCode: DEFAULT_PHONE_COUNTRY,
    assumedDefault: true,
  };
};

/** Sole cifre: quello che si puo digitare nella parte nazionale. */
export const sanitizeNationalNumber = (value?: string | null) =>
  String(value || "").replace(/[^0-9]/g, "");

/**
 * La forma memorizzata: `+<prefisso> <numero>`.
 *
 * Uno spazio solo, sempre nello stesso posto: rende il valore leggibile
 * nell'elenco e ricostruibile senza ambiguita.
 */
export const formatPhoneNumber = (
  dial?: string | null,
  national?: string | null,
): string => {
  const digits = sanitizeNationalNumber(national);
  if (!digits) return "";

  const prefix = String(dial || "").replace(/[^0-9]/g, "");
  return prefix ? `+${prefix} ${digits}` : digits;
};

/**
 * Un numero e plausibile?
 *
 * Non si valida la struttura interna paese per paese — richiederebbe una
 * libreria e una tabella che invecchia. Si controlla la sola cosa
 * universalmente vera: la lunghezza sensata di un numero telefonico (E.164 ne
 * ammette al massimo 15 cifre, prefisso compreso).
 */
export const isPlausiblePhoneNumber = (value?: string | null): boolean => {
  const { dial, national } = parsePhoneNumber(value);
  if (!national) return false;

  const total = dial.length + national.length;
  return national.length >= 4 && total <= 15;
};

/**
 * Normalizza un numero **solo se lo capisce**.
 *
 * Un valore che non dichiara un prefisso torna identico: e la garanzia che
 * introdurre questa funzione non riscriva l'archivio esistente.
 */
export const normalizePhoneNumber = (value?: string | null): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const parsed = parsePhoneNumber(raw);
  if (parsed.assumedDefault || !parsed.dial) return raw;

  return formatPhoneNumber(parsed.dial, parsed.national);
};
