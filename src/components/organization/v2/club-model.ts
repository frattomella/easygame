import type { ClubFederationEntry, ClubProfileSectionId } from "@/lib/club-profile";
import type { StatusSpec } from "@/lib/web/status";
import { PERSON_STATUS } from "@/lib/web/status";
import type { ClubSeasonStatus } from "@/lib/club-seasons";

/**
 * Il modello puro della scheda Club (Web V2): le liste chiuse della V1, le
 * sezioni con i loro alias di URL, i valori del modulo e la loro lettura dal
 * record del club. Nessun React, nessuna rete: la pagina e i pannelli in
 * `v2/` lo importano e lo testano cosi com'e.
 */

/* ── Liste chiuse (identiche alla V1) ────────────────────────────────────── */
export const CLUB_TYPES_LIST = ["Dilettante", "Professionista", "Altro"] as const;

export const TAX_REGIMES_LIST = [
  "Ordinario",
  "398/1991 (ASD/SSD)",
  "Forfettario (L.190/2014)",
  "Regime dei minimi",
  "Altro",
] as const;

export const DEFAULT_TAX_REGIME = "398/1991 (ASD/SSD)";

export const SPORTS_LIST = [
  "Calcio",
  "Basket",
  "Pallavolo",
  "Tennis",
  "Nuoto",
  "Atletica Leggera",
  "Rugby",
  "Pallamano",
  "Ciclismo",
  "Ginnastica",
  "Scherma",
  "Judo",
  "Karate",
  "Taekwondo",
  "Boxe",
  "Canottaggio",
  "Vela",
  "Sci",
  "Pattinaggio",
  "Hockey",
  "Golf",
  "Equitazione",
  "Tiro a Segno",
  "Tiro con l'Arco",
  "Altro",
] as const;

export const ITALIAN_FEDERATIONS = [
  "FIGC - Federazione Italiana Giuoco Calcio",
  "FIP - Federazione Italiana Pallacanestro",
  "FIPAV - Federazione Italiana Pallavolo",
  "FIT - Federazione Italiana Tennis",
  "FIN - Federazione Italiana Nuoto",
  "FIDAL - Federazione Italiana Atletica Leggera",
  "FIR - Federazione Italiana Rugby",
  "FIGH - Federazione Italiana Giuoco Handball",
  "FCI - Federazione Ciclistica Italiana",
  "FGI - Federazione Ginnastica d'Italia",
  "FIS - Federazione Italiana Scherma",
  "FIJLKAM - Federazione Italiana Judo Lotta Karate Arti Marziali",
  "FPI - Federazione Pugilistica Italiana",
  "FIC - Federazione Italiana Canottaggio",
  "FIV - Federazione Italiana Vela",
  "FISI - Federazione Italiana Sport Invernali",
  "FISG - Federazione Italiana Sport del Ghiaccio",
  "FIH - Federazione Italiana Hockey",
  "FIG - Federazione Italiana Golf",
  "FISE - Federazione Italiana Sport Equestri",
  "FITAV - Federazione Italiana Tiro a Volo",
  "UITS - Unione Italiana Tiro a Segno",
  "FITARCO - Federazione Italiana Tiro con l'Arco",
  "CONI - Comitato Olimpico Nazionale Italiano",
  "CIP - Comitato Italiano Paralimpico",
  "ASI - Associazioni Sportive e Sociali Italiane",
  "CSEN - Centro Sportivo Educativo Nazionale",
  "UISP - Unione Italiana Sport Per tutti",
  "Altro",
] as const;

/** «Altro» apre l'inserimento libero: non e un valore che si salva. */
export const OTHER_OPTION = "Altro";

/* ── Sezioni della pagina e alias di URL ─────────────────────────────────── */
export type ClubSectionId = ClubProfileSectionId;

export const CLUB_SECTIONS: ReadonlyArray<{ id: ClubSectionId; label: string; description: string }> = [
  { id: "generale", label: "Generale", description: "Nome, logo, tipologia, sport e sede operativa." },
  { id: "fiscali", label: "Dati fiscali", description: "Anagrafica fiscale, sede legale, legale rappresentante, firma e timbro." },
  { id: "bancari", label: "Dati bancari", description: "IBAN e banca su cui il club riceve i versamenti." },
  { id: "contatti", label: "Contatti", description: "Recapiti della societa e dei referenti." },
  { id: "federazione", label: "Federazione", description: "Federazioni ed enti a cui il club e affiliato." },
  { id: "stagioni", label: "Stagioni", description: "La stagione attiva e il perimetro dei dati che vedi in tutta l'applicazione." },
  { id: "pagamenti", label: "Pagamenti", description: "Incassi online e metodi disponibili nelle iscrizioni." },
  { id: "fatturazione", label: "Account e fatturazione", description: "Piano, servizi, profilo fiscale e causali contabili." },
  { id: "social", label: "Social", description: "Sito e profili pubblici del club." },
];

/**
 * `?tab=` con gli stessi valori della V1: il guscio manda a
 * `/organization?tab=stagioni`, la gestione iscrizioni a `?tab=pagamenti`.
 * Gli alias (`stagione`, `payments`, `billing`) restano validi.
 */
export const resolveClubSection = (param: string | null | undefined): ClubSectionId => {
  const value = String(param || "").trim().toLowerCase();
  if (value === "stagioni" || value === "stagione") return "stagioni";
  if (value === "pagamenti" || value === "payments") return "pagamenti";
  if (value === "fatturazione" || value === "billing") return "fatturazione";
  const known = CLUB_SECTIONS.find((section) => section.id === value);
  return known ? known.id : "generale";
};

/* ── Il modulo ───────────────────────────────────────────────────────────── */
export type ClubFormValues = {
  name: string;
  types: string[];
  sports: string[];
  foundingYear: string;
  address: string;
  city: string;
  postalCode: string;
  region: string;
  province: string;
  country: string;
  businessName: string;
  vatNumber: string;
  fiscalCode: string;
  /** Il regime scelto (un preset della lista o il testo libero). */
  taxRegime: string;
  /** Vero quando il regime e scritto a mano («Altro»). */
  taxRegimeCustom: boolean;
  atecoCode: string;
  sdiCode: string;
  legalAddress: string;
  legalCity: string;
  legalPostalCode: string;
  legalCountry: string;
  legalRegion: string;
  legalProvince: string;
  representativeName: string;
  representativeSurname: string;
  representativeFiscalCode: string;
  bankName: string;
  iban: string;
  companyEmail: string;
  companyPec: string;
  contact1Name: string;
  contact1Phone: string;
  contact1Email: string;
  contact2Name: string;
  contact2Phone: string;
  contact2Email: string;
  facebook: string;
  instagram: string;
  twitter: string;
  youtube: string;
  website: string;
};

export const emptyClubFormValues = (): ClubFormValues => ({
  name: "",
  types: ["Dilettante"],
  sports: [],
  foundingYear: "",
  address: "",
  city: "",
  postalCode: "",
  region: "",
  province: "",
  country: "Italia",
  businessName: "",
  vatNumber: "",
  fiscalCode: "",
  taxRegime: DEFAULT_TAX_REGIME,
  taxRegimeCustom: false,
  atecoCode: "",
  sdiCode: "",
  legalAddress: "",
  legalCity: "",
  legalPostalCode: "",
  legalCountry: "Italia",
  legalRegion: "",
  legalProvince: "",
  representativeName: "",
  representativeSurname: "",
  representativeFiscalCode: "",
  bankName: "",
  iban: "",
  companyEmail: "",
  companyPec: "",
  contact1Name: "",
  contact1Phone: "",
  contact1Email: "",
  contact2Name: "",
  contact2Phone: "",
  contact2Email: "",
  facebook: "",
  instagram: "",
  twitter: "",
  youtube: "",
  website: "",
});

const text = (value: unknown) => (value == null ? "" : String(value));

/** Le tipologie storiche in minuscolo si leggono con la maiuscola della lista. */
const normalizeClubType = (value: string) => {
  if (value === "dilettante") return "Dilettante";
  if (value === "professionista") return "Professionista";
  return value;
};

/**
 * Legge il modulo dal record del club con **lo stesso ordine di ripiego**
 * della V1: prima la colonna, poi la chiave in `settings`.
 */
export const clubFormValuesFrom = (clubData: any): ClubFormValues => {
  const settings: Record<string, any> = typeof clubData?.settings === "object" && clubData.settings ? clubData.settings : {};
  const base = emptyClubFormValues();

  const rawTypes = clubData?.types ?? settings.types ?? null;
  const fallbackType = clubData?.type ?? settings.type ?? null;
  const typesArray: string[] = Array.isArray(rawTypes) ? rawTypes.map(text) : fallbackType ? [text(fallbackType)] : [];
  const types = typesArray.length ? typesArray.map(normalizeClubType) : ["Dilettante"];

  const taxValue = text(clubData?.tax_regime ?? settings.tax_regime ?? "");
  const taxRegimeCustom = Boolean(taxValue) && !(TAX_REGIMES_LIST as readonly string[]).includes(taxValue);

  return {
    ...base,
    name: text(clubData?.name),
    types,
    sports: Array.isArray(clubData?.sports) ? clubData.sports.map(text) : clubData?.sport ? [text(clubData.sport)] : [],
    foundingYear: text(clubData?.founding_year || settings.foundingYear || ""),
    address: text(clubData?.address),
    city: text(clubData?.city),
    postalCode: text(clubData?.postal_code),
    region: text(clubData?.region),
    province: text(clubData?.province),
    country: text(clubData?.country || "Italia"),
    businessName: text(clubData?.business_name || settings.businessName || ""),
    vatNumber: text(clubData?.vat_number),
    fiscalCode: text(clubData?.fiscal_code),
    taxRegime: taxValue || DEFAULT_TAX_REGIME,
    taxRegimeCustom,
    atecoCode: text(clubData?.ateco_code || settings.atecoCode || ""),
    sdiCode: text(clubData?.sdi_code),
    legalAddress: text(clubData?.legal_address),
    legalCity: text(clubData?.legal_city),
    legalPostalCode: text(clubData?.legal_postal_code),
    legalCountry: text(clubData?.legal_country || "Italia"),
    legalRegion: text(clubData?.legal_region),
    legalProvince: text(clubData?.legal_province),
    representativeName: text(clubData?.representative_name),
    representativeSurname: text(clubData?.representative_surname),
    representativeFiscalCode: text(clubData?.representative_fiscal_code),
    bankName: text(clubData?.bank_name),
    iban: text(clubData?.iban),
    companyEmail: text(clubData?.email ?? settings.email ?? clubData?.email1 ?? ""),
    companyPec: text(clubData?.pec ?? settings.pec ?? settings.companyPec ?? ""),
    contact1Name: text(clubData?.contact1_name || settings.contact1Name || ""),
    contact1Phone: text(clubData?.phone1 || settings.contact1Phone || clubData?.contact_phone || settings.phone || ""),
    contact1Email: text(clubData?.email1 || settings.contact1Email || clubData?.contact_email || settings.email || ""),
    contact2Name: text(clubData?.contact2_name || settings.contact2Name || ""),
    contact2Phone: text(clubData?.phone2 || settings.contact2Phone || ""),
    contact2Email: text(clubData?.email2 || settings.contact2Email || ""),
    facebook: text(clubData?.facebook || settings.facebook || ""),
    instagram: text(clubData?.instagram || settings.instagram || ""),
    twitter: text(clubData?.twitter || settings.twitter || ""),
    youtube: text(clubData?.youtube || settings.youtube || ""),
    website: text(clubData?.website || settings.website || ""),
  };
};

/** Le affiliazioni, dalla colonna o da `settings` (come la V1). */
export const clubFederationsFrom = (clubData: any): ClubFederationEntry[] => {
  const settings: Record<string, any> = typeof clubData?.settings === "object" && clubData.settings ? clubData.settings : {};
  const raw = clubData?.federations ?? (Array.isArray(settings.federations) ? settings.federations : null);
  return Array.isArray(raw) ? raw : [];
};

/** Il nome di una federazione e in lista, oppure e scritto a mano. */
export const isKnownFederation = (name: string | undefined) =>
  Boolean(name) && (ITALIAN_FEDERATIONS as readonly string[]).includes(String(name)) && name !== OTHER_OPTION;

/* ── Stati locali non ancora in `src/lib/web/status.ts` ──────────────────── */
const spec = (label: string, weight: StatusSpec["weight"], hue: StatusSpec["hue"]): StatusSpec => Object.freeze({ label, weight, hue });

/**
 * Lo stato di una stagione. `active` e `archived` sono parole del sistema;
 * «FUTURA» manca in `status.ts` (segnalato nel rapporto) e vive qui finche
 * il lead non la promuove.
 */
export const SEASON_STATUS_SPEC: Record<ClubSeasonStatus, StatusSpec> = {
  active: PERSON_STATUS.active,
  upcoming: spec("FUTURA", "outline", "blue"),
  archived: PERSON_STATUS.archived,
};

/** La classificazione di una causale: dichiarata o ancora da dichiarare. */
export const OPERATION_TYPE_STATUS = {
  classified: spec("CLASSIFICATA", "solid", "green"),
  unclassified: spec("DA CLASSIFICARE", "outline", "amber"),
  inactive: PERSON_STATUS.inactive,
} as const;

/** Lo stato di un pagamento online del club. */
export const ONLINE_PAYMENTS_STATUS = {
  enabled: spec("ATTIVI", "solid", "green"),
  paused: spec("SOSPESI", "quiet", "neutral"),
} as const;
