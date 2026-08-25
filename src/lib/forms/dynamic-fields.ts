/**
 * I dati di EasyGame che un modulo puo chiedere o mostrare.
 *
 * **Il problema che questo file risolve.** Un modulo di iscrizione chiede il
 * telefono del genitore. Se quel campo resta una domanda come le altre, la
 * risposta finisce in un JSON e nessuno la ritrova: la segreteria la ricopia
 * a mano nell'anagrafica. Se invece il campo dichiara *quale* dato e, la
 * risposta puo essere precompilata quando il soggetto e gia noto e riversata
 * nell'anagrafica quando la segreteria approva.
 *
 * **Perche il catalogo e chiuso e sta sul server.** Il percorso tecnico
 * (`guardians[].phone`) non esce mai dal server e non entra mai da un client:
 * il modulo salva una **chiave** di questo catalogo, e il server la risolve.
 * Un client che inventasse `password_hash` non otterrebbe nulla, perche
 * `password_hash` non e una chiave del catalogo. E la regola «mapping
 * server-trusted»: la UI parla di «Telefono del genitore», il database parla
 * di colonne, e in mezzo c'e una tabella che nessuno dei due puo riscrivere.
 *
 * **Perche l'utente non vede mai la chiave.** `guardian.phone` non e un
 * linguaggio che una segretaria debba imparare per costruire un modulo. In
 * tutta l'interfaccia si legge l'etichetta; la chiave e un dettaglio di
 * serializzazione, come l'id di un campo.
 */

import type { FormFieldType } from "./model";

/** I soggetti a cui un dato puo appartenere. */
export const FORM_SUBJECT_KEYS = [
  "athlete",
  "guardian",
  "trainer",
  "staff",
  "member",
  "club",
] as const;

export type FormSubjectKey = (typeof FORM_SUBJECT_KEYS)[number];

export type FormSubjectDefinition = {
  key: FormSubjectKey;
  /** Come si chiama il soggetto nell'interfaccia. */
  label: string;
  /** Plurale, per le tendine di scelta. */
  pluralLabel: string;
  /**
   * Vero se il soggetto va **scelto**: quale atleta, quale genitore.
   * Il club non si sceglie — e sempre quello attivo — quindi vale `false`.
   */
  selectable: boolean;
  /**
   * Vero se il soggetto e una persona dell'anagrafica che una compilazione
   * puo creare o aggiornare. Il club no: un modulo di iscrizione non
   * riscrive la ragione sociale della societa.
   */
  writable: boolean;
};

export const FORM_SUBJECTS: Record<FormSubjectKey, FormSubjectDefinition> = {
  athlete: {
    key: "athlete",
    label: "Atleta",
    pluralLabel: "Atleti",
    selectable: true,
    writable: true,
  },
  guardian: {
    key: "guardian",
    label: "Genitore o tutore",
    pluralLabel: "Genitori e tutori",
    selectable: true,
    writable: true,
  },
  trainer: {
    key: "trainer",
    label: "Allenatore",
    pluralLabel: "Allenatori",
    selectable: true,
    writable: true,
  },
  staff: {
    key: "staff",
    label: "Staff",
    pluralLabel: "Staff",
    selectable: true,
    writable: true,
  },
  member: {
    key: "member",
    label: "Socio",
    pluralLabel: "Soci",
    selectable: true,
    writable: true,
  },
  club: {
    key: "club",
    label: "Societa",
    pluralLabel: "Societa",
    selectable: false,
    writable: false,
  },
};

/**
 * Da dove arrivano le opzioni di un campo a scelta.
 *
 * **Il problema.** «Sede» e «Categoria» sono elenchi a scelta come gli altri,
 * ma le voci non le scrive chi costruisce il modulo: le possiede il club, e
 * cambiano senza che il modulo venga ripubblicato. Se finissero dentro lo
 * schema, un modulo pubblicato a settembre offrirebbe a marzo le sedi di
 * settembre.
 *
 * **La conseguenza sulla sicurezza.** Le opzioni le riempie il server subito
 * prima di servire il modulo *e* subito prima di validare l'invio, leggendole
 * dal club **proprietario del modulo**. Chi compila non manda un `site_id`:
 * manda il nome di una voce che, se non e in quell'elenco, la validazione
 * gia esistente sui campi a scelta rifiuta. Non c'e un secondo controllo da
 * ricordarsi di scrivere.
 */
export type DynamicFieldOptionsSource = "club_sites" | "club_categories";

export type DynamicFieldDefinition = {
  /** La chiave salvata nel modulo. Non si mostra mai all'utente. */
  key: string;
  subject: FormSubjectKey;
  /** Cosa legge chi costruisce il modulo. */
  label: string;
  /** Il tipo di campo che il builder crea scegliendo questo dato. */
  fieldType: FormFieldType;
  /**
   * Dove sta il dato nel record del soggetto. Percorso a segmenti: il primo
   * livello sono le colonne, `data` scende nel JSON del record.
   */
  path: string[];
  /**
   * Vero se una compilazione approvata puo **scrivere** questo dato.
   * I dati della societa e i dati calcolati sono di sola lettura.
   */
  writable: boolean;
  /** Testo di aiuto mostrato nel selettore. */
  hint?: string;
  /**
   * Quando c'e, le opzioni del campo non stanno nello schema: le mette il
   * server leggendo il club. Vedi `DynamicFieldOptionsSource`.
   */
  optionsSource?: DynamicFieldOptionsSource;
};

const define = (
  definitions: Array<
    Omit<DynamicFieldDefinition, "writable"> & { writable?: boolean }
  >,
): DynamicFieldDefinition[] =>
  definitions.map((definition) => ({
    ...definition,
    writable: definition.writable !== false,
  }));

/**
 * Il catalogo.
 *
 * Contiene solo dati che ha senso chiedere in un modulo. Non contiene — e non
 * deve mai contenere — credenziali, hash, token, codici di accesso, note
 * riservate o importi: un modulo pubblico e compilabile da chiunque abbia il
 * link, e cio che si puo *mostrare* precompilato e cio che si e disposti a
 * far leggere a chi apre quel link.
 */
export const DYNAMIC_FIELDS: DynamicFieldDefinition[] = define([
  // --- Atleta ---------------------------------------------------------------
  { key: "athlete.firstName", subject: "athlete", label: "Nome dell'atleta", fieldType: "short_text", path: ["first_name"] },
  { key: "athlete.lastName", subject: "athlete", label: "Cognome dell'atleta", fieldType: "short_text", path: ["last_name"] },
  { key: "athlete.birthDate", subject: "athlete", label: "Data di nascita dell'atleta", fieldType: "date", path: ["birth_date"] },
  { key: "athlete.fiscalCode", subject: "athlete", label: "Codice fiscale dell'atleta", fieldType: "short_text", path: ["data", "fiscalCode"] },
  { key: "athlete.gender", subject: "athlete", label: "Sesso dell'atleta", fieldType: "dropdown", path: ["data", "gender"] },
  { key: "athlete.birthPlace", subject: "athlete", label: "Luogo di nascita dell'atleta", fieldType: "short_text", path: ["data", "birthPlace"] },
  { key: "athlete.nationality", subject: "athlete", label: "Cittadinanza dell'atleta", fieldType: "short_text", path: ["data", "nationality"] },
  { key: "athlete.email", subject: "athlete", label: "Email dell'atleta", fieldType: "email", path: ["data", "email"] },
  { key: "athlete.phone", subject: "athlete", label: "Telefono dell'atleta", fieldType: "phone", path: ["data", "phone"] },
  { key: "athlete.address", subject: "athlete", label: "Indirizzo dell'atleta", fieldType: "short_text", path: ["data", "address"] },
  { key: "athlete.streetNumber", subject: "athlete", label: "Numero civico dell'atleta", fieldType: "short_text", path: ["data", "streetNumber"] },
  { key: "athlete.city", subject: "athlete", label: "Comune di residenza dell'atleta", fieldType: "short_text", path: ["data", "city"] },
  { key: "athlete.postalCode", subject: "athlete", label: "CAP dell'atleta", fieldType: "short_text", path: ["data", "postalCode"] },
  { key: "athlete.province", subject: "athlete", label: "Provincia dell'atleta", fieldType: "short_text", path: ["data", "province"] },
  { key: "athlete.emergencyContact", subject: "athlete", label: "Contatto di emergenza", fieldType: "short_text", path: ["data", "emergencyContact"] },
  { key: "athlete.emergencyPhone", subject: "athlete", label: "Telefono di emergenza", fieldType: "phone", path: ["data", "emergencyPhone"] },
  { key: "athlete.allergies", subject: "athlete", label: "Allergie e intolleranze dell'atleta", fieldType: "long_text", path: ["data", "allergies"] },
  {
    key: "athlete.categoryName",
    subject: "athlete",
    label: "Categoria dell'atleta",
    fieldType: "dropdown",
    path: ["category_name"],
    optionsSource: "club_categories",
    hint: "Le categorie del club. Approvare iscrive l'atleta alla categoria scelta.",
  },
  {
    key: "athlete.siteId",
    subject: "athlete",
    label: "Sede dell'atleta",
    fieldType: "dropdown",
    path: ["data", "siteId"],
    optionsSource: "club_sites",
    hint: "Le sedi attive del club. Un club con una sede sola non vede la domanda.",
  },
  {
    key: "athlete.jerseyNumber",
    subject: "athlete",
    label: "Numero di maglia dell'atleta",
    fieldType: "short_text",
    path: ["jersey_number"],
    writable: false,
    hint: "Assegnato dal club: qui si mostra soltanto.",
  },

  // --- Genitore o tutore ----------------------------------------------------
  { key: "guardian.name", subject: "guardian", label: "Nome del genitore", fieldType: "short_text", path: ["name"] },
  { key: "guardian.surname", subject: "guardian", label: "Cognome del genitore", fieldType: "short_text", path: ["surname"] },
  { key: "guardian.relationship", subject: "guardian", label: "Rapporto con l'atleta", fieldType: "dropdown", path: ["relationship"] },
  { key: "guardian.fiscalCode", subject: "guardian", label: "Codice fiscale del genitore", fieldType: "short_text", path: ["fiscalCode"] },
  { key: "guardian.phone", subject: "guardian", label: "Telefono del genitore", fieldType: "phone", path: ["phone"] },
  { key: "guardian.email", subject: "guardian", label: "Email del genitore", fieldType: "email", path: ["email"] },

  // --- Allenatore -----------------------------------------------------------
  { key: "trainer.firstName", subject: "trainer", label: "Nome dell'allenatore", fieldType: "short_text", path: ["firstName"] },
  { key: "trainer.lastName", subject: "trainer", label: "Cognome dell'allenatore", fieldType: "short_text", path: ["lastName"] },
  { key: "trainer.fiscalCode", subject: "trainer", label: "Codice fiscale dell'allenatore", fieldType: "short_text", path: ["fiscalCode"] },
  { key: "trainer.email", subject: "trainer", label: "Email dell'allenatore", fieldType: "email", path: ["email"] },
  { key: "trainer.phone", subject: "trainer", label: "Telefono dell'allenatore", fieldType: "phone", path: ["phone"] },
  { key: "trainer.role", subject: "trainer", label: "Ruolo dell'allenatore", fieldType: "short_text", path: ["role"] },

  // --- Staff ----------------------------------------------------------------
  { key: "staff.firstName", subject: "staff", label: "Nome della persona di staff", fieldType: "short_text", path: ["firstName"] },
  { key: "staff.lastName", subject: "staff", label: "Cognome della persona di staff", fieldType: "short_text", path: ["lastName"] },
  { key: "staff.fiscalCode", subject: "staff", label: "Codice fiscale della persona di staff", fieldType: "short_text", path: ["fiscalCode"] },
  { key: "staff.email", subject: "staff", label: "Email della persona di staff", fieldType: "email", path: ["email"] },
  { key: "staff.phone", subject: "staff", label: "Telefono della persona di staff", fieldType: "phone", path: ["phone"] },
  { key: "staff.role", subject: "staff", label: "Ruolo nello staff", fieldType: "short_text", path: ["role"] },

  // --- Socio ----------------------------------------------------------------
  { key: "member.firstName", subject: "member", label: "Nome del socio", fieldType: "short_text", path: ["firstName"] },
  { key: "member.lastName", subject: "member", label: "Cognome del socio", fieldType: "short_text", path: ["lastName"] },
  { key: "member.fiscalCode", subject: "member", label: "Codice fiscale del socio", fieldType: "short_text", path: ["fiscalCode"] },
  { key: "member.email", subject: "member", label: "Email del socio", fieldType: "email", path: ["email"] },
  { key: "member.phone", subject: "member", label: "Telefono del socio", fieldType: "phone", path: ["phone"] },
  { key: "member.memberType", subject: "member", label: "Tipo di socio", fieldType: "short_text", path: ["memberType"] },

  // --- Societa (sola lettura) ----------------------------------------------
  { key: "club.name", subject: "club", label: "Denominazione della societa", fieldType: "short_text", path: ["name"], writable: false },
  { key: "club.businessName", subject: "club", label: "Ragione sociale della societa", fieldType: "short_text", path: ["business_name"], writable: false },
  { key: "club.fiscalCode", subject: "club", label: "Codice fiscale della societa", fieldType: "short_text", path: ["fiscal_code"], writable: false },
  { key: "club.vatNumber", subject: "club", label: "Partita IVA della societa", fieldType: "short_text", path: ["vat_number"], writable: false },
  { key: "club.address", subject: "club", label: "Indirizzo della societa", fieldType: "short_text", path: ["address"], writable: false },
  { key: "club.city", subject: "club", label: "Comune della societa", fieldType: "short_text", path: ["city"], writable: false },
  { key: "club.contactEmail", subject: "club", label: "Email di contatto della societa", fieldType: "email", path: ["contact_email"], writable: false },
  { key: "club.contactPhone", subject: "club", label: "Telefono della societa", fieldType: "phone", path: ["contact_phone"], writable: false },
  { key: "club.representativeName", subject: "club", label: "Legale rappresentante", fieldType: "short_text", path: ["representative_name"], writable: false },
]);

const BY_KEY = new Map(DYNAMIC_FIELDS.map((field) => [field.key, field]));

/** La definizione di una chiave, oppure `null` se la chiave non esiste. */
export const getDynamicField = (
  key?: string | null,
): DynamicFieldDefinition | null => BY_KEY.get(String(key || "").trim()) || null;

export const isDynamicFieldKey = (key?: string | null) =>
  BY_KEY.has(String(key || "").trim());

/**
 * L'etichetta umana di una chiave.
 *
 * Esiste perche nessuna schermata deve costruirsela da se: se un giorno
 * «Telefono del genitore» diventa «Telefono del tutore», cambia qui e cambia
 * ovunque.
 */
export const getDynamicFieldLabel = (key?: string | null) =>
  getDynamicField(key)?.label || "";

/** Le definizioni di un soggetto, nell'ordine in cui vanno mostrate. */
export const getDynamicFieldsForSubject = (subject: FormSubjectKey) =>
  DYNAMIC_FIELDS.filter((field) => field.subject === subject);

/**
 * I soggetti che un modulo coinvolge, dedotti dai campi.
 *
 * Non si chiede a chi costruisce il modulo di dichiararli: sarebbe una
 * dichiarazione da tenere allineata a mano, e una dichiarazione sbagliata
 * porterebbe a chiedere «quale genitore?» per un modulo che il genitore non
 * lo nomina. La societa non compare: non si sceglie.
 */
export const collectSubjectsFromBindings = (
  bindings: Array<string | null | undefined>,
): FormSubjectKey[] => {
  const found = new Set<FormSubjectKey>();

  for (const binding of bindings) {
    const definition = getDynamicField(binding);
    if (!definition) continue;
    if (!FORM_SUBJECTS[definition.subject].selectable) continue;
    found.add(definition.subject);
  }

  return FORM_SUBJECT_KEYS.filter((key) => found.has(key));
};

/**
 * Legge il valore di una chiave dentro il record del soggetto.
 *
 * Il record arriva gia caricato dal server: questa funzione non conosce
 * Prisma e non fa domande al database, cosi si puo provare senza.
 */
export const readDynamicFieldValue = (
  key: string,
  record: Record<string, any> | null | undefined,
): string => {
  const definition = getDynamicField(key);
  if (!definition || !record) return "";

  let current: any = record;
  for (const segment of definition.path) {
    if (current == null || typeof current !== "object") return "";
    current = current[segment];
  }

  if (current == null) return "";
  if (current instanceof Date) return current.toISOString().slice(0, 10);
  if (typeof current === "boolean") return current ? "true" : "";
  if (typeof current === "object") return "";

  const text = String(current).trim();

  /*
    Le date arrivano come ISO completo dal database e come `YYYY-MM-DD` dai
    campi JSON. Un `<input type="date">` accetta solo la seconda forma, e
    mostrare una casella data vuota accanto a un valore che c'e e il modo piu
    rapido per far ridigitare una data gia nota.
  */
  if (definition.fieldType === "date" && /^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return text.slice(0, 10);
  }

  return text;
};
