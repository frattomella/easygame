/** Anni compiuti, oppure 0 se la data non c'e o non si legge. */
const calculateAgeFromBirthDate = (birthDate?: string | null) => {
  const raw = String(birthDate || "").trim();
  if (!raw) return 0;

  const birth = new Date(raw);
  if (Number.isNaN(birth.getTime())) return 0;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age;
};

/**
 * Taglie di vestiario: definizione unica.
 *
 * Erano quaranta righe dentro `app/athletes/[id]/page.tsx`, e quindi
 * esistevano **solo** per gli atleti. Allenatori, staff e soci ricevono
 * magliette e tute come tutti, ma la loro taglia non aveva un posto dove stare
 * (Blocco 7, punto 12).
 *
 * Il rischio da evitare era introdurre un secondo insieme di taglie
 * incompatibile con quello dell'abbigliamento: un magazzino che conosce `XL` e
 * un'anagrafica che scrive `Extra Large` non si parlano. Le definizioni sono
 * queste, e sono le stesse.
 *
 * **La numerazione di maglia resta agli atleti.** Un dirigente non scende in
 * campo: dargli un numero creerebbe conflitti nei gruppi di numerazione
 * (WP-44) per un dato che non serve a nessuno.
 */

export type ClothingProfile = "BAMBINO" | "BAMBINA" | "UOMO" | "DONNA";

export const CLOTHING_SIZE_OPTIONS: Record<
  ClothingProfile,
  { shirt: readonly string[]; pants: readonly string[]; shoes: readonly string[] }
> = {
  BAMBINO: {
    shirt: ["3-4A", "5-6A", "7-8A", "9-10A", "11-12A", "13-14A"],
    pants: ["3-4A", "5-6A", "7-8A", "9-10A", "11-12A", "13-14A"],
    shoes: ["26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39"],
  },
  BAMBINA: {
    shirt: ["3-4A", "5-6A", "7-8A", "9-10A", "11-12A", "13-14A"],
    pants: ["3-4A", "5-6A", "7-8A", "9-10A", "11-12A", "13-14A"],
    shoes: ["26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39"],
  },
  UOMO: {
    shirt: ["XS", "S", "M", "L", "XL", "XXL", "3XL"],
    pants: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "46", "48", "50", "52", "54", "56", "58", "60"],
    shoes: ["38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48"],
  },
  DONNA: {
    shirt: ["XXS", "XS", "S", "M", "L", "XL", "XXL"],
    pants: ["36", "38", "40", "42", "44", "46", "48", "50", "52"],
    shoes: ["35", "36", "37", "38", "39", "40", "41", "42"],
  },
};

export const CLOTHING_PROFILE_LABELS: Record<ClothingProfile, string> = {
  BAMBINO: "Bambino",
  BAMBINA: "Bambina",
  UOMO: "Uomo",
  DONNA: "Donna",
};

export type ClothingSizes = {
  /** Profilo scelto a mano; vuoto significa «deducilo dai dati anagrafici». */
  profile: string;
  shirtSize: string;
  pantsSize: string;
  shoeSize: string;
};

export const DEFAULT_CLOTHING_SIZES: ClothingSizes = {
  profile: "",
  shirtSize: "",
  pantsSize: "",
  shoeSize: "",
};

const isFemale = (gender?: string | null) => {
  const normalized = String(gender || "").trim().toLowerCase();
  return (
    normalized === "f" ||
    normalized === "femmina" ||
    normalized === "female" ||
    normalized === "donna"
  );
};

/**
 * Il profilo taglie da sesso ed eta.
 *
 * Sotto i 15 anni le taglie sono per eta (`9-10A`), sopra sono lettere o
 * numeri. Per un adulto senza data di nascita la risposta e adulto: e il caso
 * di allenatori, staff e soci, dove la data spesso non c'e.
 */
export const deriveClothingProfile = (
  gender?: string | null,
  birthDate?: string | null,
): ClothingProfile => {
  const age = calculateAgeFromBirthDate(birthDate || "");
  if (age > 0 && age < 15) {
    return isFemale(gender) ? "BAMBINA" : "BAMBINO";
  }
  return isFemale(gender) ? "DONNA" : "UOMO";
};

export const resolveClothingProfile = (
  sizes?: Partial<ClothingSizes> | null,
  person?: { gender?: string | null; birthDate?: string | null } | null,
): ClothingProfile => {
  const explicit = String(sizes?.profile || "").trim().toUpperCase();
  if (explicit in CLOTHING_SIZE_OPTIONS) return explicit as ClothingProfile;
  return deriveClothingProfile(person?.gender, person?.birthDate);
};

export const clothingOptionsFor = (profile: ClothingProfile) =>
  CLOTHING_SIZE_OPTIONS[profile] || CLOTHING_SIZE_OPTIONS.UOMO;

/**
 * Tutte le taglie di un profilo, senza distinguere il capo.
 *
 * Serve dove si assegna un capo qualsiasi da magazzino e non si sa ancora se
 * sia una maglia o un paio di scarpe. Era una **terza** copia delle taglie,
 * appiattita a mano in `registration-management`: con l'ordine diverso e con
 * i duplicati dentro (`46` e `48` comparivano due volte per UOMO).
 */
export const allClothingSizesFor = (profile: ClothingProfile): string[] => {
  const options = clothingOptionsFor(profile);
  return Array.from([...options.shirt, ...options.pants, ...options.shoes]
    .reduce((seen, size) => seen.add(size), new Set<string>()));
};

/** Le taglie di un record, con i vuoti al posto degli `undefined`. */
export const normalizeClothingSizes = (
  value?: Partial<ClothingSizes> | null,
): ClothingSizes => ({
  profile: String(value?.profile || "").trim(),
  shirtSize: String(value?.shirtSize || "").trim(),
  pantsSize: String(value?.pantsSize || "").trim(),
  shoeSize: String(value?.shoeSize || "").trim(),
});

export const hasClothingSizes = (value?: Partial<ClothingSizes> | null) => {
  const sizes = normalizeClothingSizes(value);
  return Boolean(sizes.shirtSize || sizes.pantsSize || sizes.shoeSize);
};

/** Riepilogo per un elenco o un export: `M · 48 · 42`. */
export const formatClothingSizes = (value?: Partial<ClothingSizes> | null) => {
  const sizes = normalizeClothingSizes(value);
  return [sizes.shirtSize, sizes.pantsSize, sizes.shoeSize]
    .filter(Boolean)
    .join(" · ");
};
