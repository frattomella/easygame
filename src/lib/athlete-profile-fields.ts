import type { KitComponent } from "@/components/forms/CustomKitComponentsBuilder";
import { normalizeKitComponents } from "@/lib/clothing-kit-utils";

/**
 * Stati iniziali e conversioni dei form della scheda atleta.
 *
 * **Perche esiste** (WP-19, Blocco 8). Erano funzioni in cima a
 * `src/app/athletes/[id]/page.tsx`, che supera le 8.000 righe. Sono pure — non
 * leggono stato, non chiamano API — quindi non c'era ragione per cui stessero
 * dentro un componente, se non che le si era scritte li.
 *
 * Estrarle non cambia il comportamento. Cambia che ora si possono leggere in
 * dieci secondi e provare senza montare una pagina.
 */

/** La visita medica che il form propone quando si apre. */
export const createEmptyMedicalVisit = () => ({
  title: "",
  description: "",
  type: "Agonistica",
  paidBy: "atleta",
  location: "",
  date: "",
  outcome: "",
  file: null as File | null,
});

/** Il tesseramento che il form propone quando si apre. */
export const createEmptyRegistration = () => ({
  federation: "",
  number: "",
  status: "In corso",
  issueDate: "",
  expiryDate: "",
  notes: "",
  file: null as File | null,
});

/** L'allegato generico: documento, documento d'identita, modulo d'iscrizione. */
export const createEmptyAttachment = () => ({
  name: "",
  type: "",
  notes: "",
  file: null as File | null,
});

/**
 * Le federazioni di un club, in qualunque posto siano state salvate.
 *
 * Due percorsi storici — la colonna e le impostazioni — e due forme per voce,
 * stringa o oggetto. Si leggono entrambi e si tolgono i duplicati: una
 * tendina che mostra «FIP» due volte fa dubitare che siano due cose diverse.
 */
export const normalizeClubFederations = (clubData: any): string[] => {
  const raw = Array.isArray(clubData?.federations)
    ? clubData.federations
    : Array.isArray(clubData?.settings?.federations)
      ? clubData.settings.federations
      : [];

  const names: string[] = raw
    .map((federation: any) =>
      typeof federation === "string"
        ? federation
        : federation?.name || federation?.title || "",
    )
    .map((name: string) => String(name || "").trim())
    .filter(Boolean);

  return Array.from(new Set<string>(names));
};

/**
 * L'eta compiuta, non la differenza fra gli anni.
 *
 * Chi e nato a dicembre non ha ancora compiuto gli anni a novembre, e in una
 * societa sportiva questo decide la categoria.
 */
export const calculateAgeFromBirthDate = (
  birthDate?: string | null,
  today: Date = new Date(),
): number => {
  if (!birthDate) return 0;

  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return 0;

  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age;
};

/**
 * Un «si» in tutte le forme in cui e stato salvato.
 *
 * Gli stessi campi booleani sono in archivio come `true`, `"true"`, `"1"`,
 * `"si"`, `"sì"`, `"active"`. Trattarne uno solo come vero vuol dire mostrare
 * «non iscritto» a un atleta iscritto.
 */
export const coerceBooleanField = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;

  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized) return false;

  return ["true", "1", "yes", "si", "sì", "active", "enabled"].includes(
    normalized,
  );
};

export const getTodayDateString = (today: Date = new Date()): string =>
  today.toISOString().slice(0, 10);

/** I componenti di un kit, nella forma che vuole il builder. */
export const buildAthleteKitBuilderComponents = (
  components: any[],
): KitComponent[] =>
  normalizeKitComponents(components).map((componentName, index) => ({
    id: `athlete-kit-component-${index}-${componentName
      .replace(/\s+/g, "-")
      .toLowerCase()}`,
    name: componentName,
    selected: true,
    deliveryStatus: "pending" as const,
  }));
