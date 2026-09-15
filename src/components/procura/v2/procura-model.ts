import { MISSING, formatMoney } from "@/lib/web/format";

/**
 * Il modello della pagina `/procura` (Web V2).
 *
 * Una «procura» qui e un record CRM in forma libera salvato nella colonna JSON
 * `clubs.procure`: la parola copre quattro fattispecie diverse
 * (`src/lib/sport-work/legacy-migration.ts`) e **non** va ripiegata nel
 * modello agente/mandato di `/sport-work`. Questo modulo non tocca nessuna
 * forma salvata: i nomi dei campi (`contacts`, `athletes`, `trainers`,
 * `payments`, `personId`, `personType`, `amount`, `type`, …) sono quelli che
 * `src/lib/club-financial-summary.ts` legge quando aggrega i pagamenti delle
 * procure fra i movimenti del club.
 */
export type ProcuraContact = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
};

export type ProcuraAddress = {
  street: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
};

export type PersonType = "athlete" | "trainer";

export type ProcuraAssociation = {
  personId: string;
  personType: PersonType;
  cost: number;
  notes?: string;
  addedAt?: string;
};

export type PaymentType = "entrata" | "uscita";

export type ProcuraPayment = {
  id: string;
  personId: string;
  personType: PersonType;
  date: string;
  amount: number;
  type: PaymentType;
  description: string;
  createdAt?: string;
};

export type Procura = {
  id: string;
  name: string;
  address?: Partial<ProcuraAddress> | null;
  contacts?: ProcuraContact[];
  athletes?: ProcuraAssociation[];
  trainers?: ProcuraAssociation[];
  payments?: ProcuraPayment[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

/** Il modulo di creazione/modifica: la stessa forma che la V1 salvava. */
export type ProcuraDraft = {
  name: string;
  address: ProcuraAddress;
  contacts: ProcuraContact[];
  athletes: ProcuraAssociation[];
  trainers: ProcuraAssociation[];
  payments: ProcuraPayment[];
};

/** Un atleta o un allenatore del club, ridotto a cio che la pagina mostra. */
export type PersonRef = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  type: PersonType;
};

export const UNKNOWN_PERSON = "Sconosciuto";

export const PERSON_TYPE_OPTIONS: ReadonlyArray<{ value: PersonType; label: string }> = [
  { value: "athlete", label: "Atleta" },
  { value: "trainer", label: "Allenatore" },
];

export const PAYMENT_TYPE_OPTIONS: ReadonlyArray<{ value: PaymentType; label: string }> = [
  { value: "entrata", label: "Entrata" },
  { value: "uscita", label: "Uscita" },
];

export const emptyAddress = (): ProcuraAddress => ({
  street: "",
  city: "",
  province: "",
  postalCode: "",
  country: "Italia",
});

export const emptyProcuraDraft = (): ProcuraDraft => ({
  name: "",
  address: emptyAddress(),
  contacts: [],
  athletes: [],
  trainers: [],
  payments: [],
});

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** Il modulo precompilato da una procura esistente (V1 `editProcura`). */
export const procuraDraftFrom = (procura: Procura): ProcuraDraft => ({
  name: String(procura.name || ""),
  address: {
    ...emptyAddress(),
    ...(procura.address && typeof procura.address === "object" ? procura.address : {}),
  },
  contacts: asArray<ProcuraContact>(procura.contacts),
  athletes: asArray<ProcuraAssociation>(procura.athletes),
  trainers: asArray<ProcuraAssociation>(procura.trainers),
  payments: asArray<ProcuraPayment>(procura.payments),
});

export const contactsOf = (procura: Procura): ProcuraContact[] => asArray<ProcuraContact>(procura.contacts);
export const athletesOf = (procura: Procura): ProcuraAssociation[] => asArray<ProcuraAssociation>(procura.athletes);
export const trainersOf = (procura: Procura): ProcuraAssociation[] => asArray<ProcuraAssociation>(procura.trainers);
export const paymentsOf = (procura: Procura): ProcuraPayment[] => asArray<ProcuraPayment>(procura.payments);

export const associationsOf = (procura: Procura, type: PersonType): ProcuraAssociation[] =>
  type === "athlete" ? athletesOf(procura) : trainersOf(procura);

/** Il campo della procura che ospita le associazioni di quel tipo. */
export const associationField = (type: PersonType): "athletes" | "trainers" =>
  type === "athlete" ? "athletes" : "trainers";

export const contactDisplayName = (contact: Pick<ProcuraContact, "firstName" | "lastName">): string =>
  `${String(contact.firstName || "").trim()} ${String(contact.lastName || "").trim()}`.trim();

/** Le righe dell'indirizzo come la V1 le stampava: via · CAP citta (prov) · paese. */
export const formatAddressLines = (address: Procura["address"]): string[] => {
  if (!address || typeof address !== "object") return [];
  const street = String(address.street || "").trim();
  const cityLine = [
    String(address.postalCode || "").trim(),
    String(address.city || "").trim(),
    address.province ? `(${String(address.province).trim()})` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const country = String(address.country || "").trim();
  return [street, cityLine, country].filter(Boolean);
};

export const procuraCity = (procura: Procura): string =>
  String(procura.address?.city || "").trim();

/** La riga meta della cella identita: la citta, oppure `—`. */
export const procuraMeta = (procura: Procura): string => procuraCity(procura) || MISSING;

/** Nome della persona di un'associazione o di un pagamento, con il ripiego della V1. */
export const resolvePersonName = (
  people: { athletes: PersonRef[]; trainers: PersonRef[] },
  type: PersonType,
  personId: string,
): string => {
  const pool = type === "athlete" ? people.athletes : people.trainers;
  return pool.find((person) => person.id === personId)?.name || UNKNOWN_PERSON;
};

export const paymentsBalance = (procura: Procura): number =>
  paymentsOf(procura).reduce((sum, payment) => {
    const amount = Number(payment?.amount) || 0;
    return sum + (payment?.type === "uscita" ? -amount : amount);
  }, 0);

/** `Costo: 120,00 €` — la V1 stampava `Costo: €120.00`, con `0.00` per chi non ne ha. */
export const formatAssociationCost = (cost: unknown): string => formatMoney(Number(cost) || 0);

/**
 * La ricerca in griglia: la V1 cercava solo nel nome; la V2 estende alla
 * citta e ai contatti, cosi «Rossi» trova anche la procura del sig. Rossi.
 */
export const matchesProcuraSearch = (procura: Procura, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    procura.name,
    procuraCity(procura),
    ...contactsOf(procura).flatMap((contact) => [contactDisplayName(contact), contact.email, contact.phone]),
  ];
  return haystack.some((value) => String(value || "").toLowerCase().includes(q));
};

/** Un importo digitato nel campo valuta (`120,50` o `120.50`) → numero. */
export const parseAmountInput = (value: string): number => {
  const n = parseFloat(String(value || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Il numero salvato → il testo del campo valuta (`0` resta vuoto). */
export const amountInputValue = (value: number): string => (value ? String(value).replace(".", ",") : "");

/** Il totale delle persone associate (atleti + allenatori) di un elenco di procure. */
export const countAssociations = (procure: Procura[]) =>
  procure.reduce(
    (acc, procura) => ({
      contacts: acc.contacts + contactsOf(procura).length,
      athletes: acc.athletes + athletesOf(procura).length,
      trainers: acc.trainers + trainersOf(procura).length,
    }),
    { contacts: 0, athletes: 0, trainers: 0 },
  );
