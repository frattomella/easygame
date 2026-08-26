/**
 * A chi e intestato un documento fiscale.
 *
 * **Perche non e l'atleta, quasi mai.** Un atleta minorenne non ha una
 * posizione fiscale: la quota la paga un genitore, e la detrazione per
 * attivita sportiva la chiede quel genitore, con **il suo** codice fiscale.
 * Una fattura intestata al bambino non e utilizzabile da nessuno, ed e
 * l'errore che rende inutile un documento altrimenti corretto.
 *
 * **La regola, in ordine.** Si usa il tutore che il club ha marcato come
 * intestatario; altrimenti il primo tutore che ha un codice fiscale;
 * altrimenti l'atleta — che e il caso giusto quando l'atleta e maggiorenne e
 * si iscrive da solo. Se non c'e nemmeno quello, il documento si emette
 * comunque con i dati che ci sono: una ricevuta senza codice fiscale resta
 * una ricevuta valida, e rifiutarsi di emetterla vorrebbe dire non
 * documentare un incasso che e avvenuto.
 *
 * Modulo **puro**: riceve i record gia caricati.
 */

const asText = (value: unknown) => String(value ?? "").trim();

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export type FiscalRecipient = {
  /** Chi compare come intestatario. */
  name: string;
  fiscalCode: string;
  vatNumber: string;
  /** Codice destinatario SdI, se il soggetto ne ha uno. */
  recipientCode: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
  province: string;
  country: string;
  /** Da dove sono stati presi i dati: si mostra, non si indovina. */
  source: "guardian" | "athlete" | "unknown";
};

const EMPTY: FiscalRecipient = {
  name: "",
  fiscalCode: "",
  vatNumber: "",
  recipientCode: "",
  email: "",
  address: "",
  city: "",
  postalCode: "",
  province: "",
  country: "Italia",
  source: "unknown",
};

const fromGuardian = (guardian: Record<string, any>): FiscalRecipient => ({
  name: `${asText(guardian.name)} ${asText(guardian.surname)}`.trim(),
  fiscalCode: firstText(guardian.fiscalCode, guardian.fiscal_code),
  vatNumber: firstText(guardian.vatNumber, guardian.vat_number),
  recipientCode: firstText(guardian.recipientCode, guardian.sdiCode),
  email: asText(guardian.email),
  address: firstText(guardian.address, guardian.indirizzo),
  city: firstText(guardian.city, guardian.comune),
  postalCode: firstText(guardian.postalCode, guardian.cap),
  province: asText(guardian.province),
  country: firstText(guardian.country, "Italia"),
  source: "guardian",
});

const fromAthlete = (athlete: Record<string, any>): FiscalRecipient => {
  const data = isRecord(athlete.data) ? athlete.data : {};

  return {
    name: `${asText(athlete.first_name)} ${asText(athlete.last_name)}`.trim(),
    fiscalCode: firstText(data.fiscalCode, data.fiscal_code),
    vatNumber: firstText(data.vatNumber),
    recipientCode: firstText(data.recipientCode, data.sdiCode),
    email: asText(data.email),
    address: [asText(data.address), asText(data.streetNumber)]
      .filter(Boolean)
      .join(" "),
    city: asText(data.city),
    postalCode: asText(data.postalCode),
    province: asText(data.province),
    country: firstText(data.country, "Italia"),
    source: "athlete",
  };
};

/**
 * L'intestatario di un documento, dato l'atleta.
 *
 * `billingGuardianIndex` e la scelta esplicita del club, quando c'e: chi paga
 * non e sempre il primo genitore dell'elenco, e indovinarlo significa
 * intestare la detrazione alla persona sbagliata.
 */
export const resolveFiscalRecipient = (
  athlete: Record<string, any> | null | undefined,
): FiscalRecipient => {
  if (!isRecord(athlete)) return EMPTY;

  const data = isRecord(athlete.data) ? athlete.data : {};
  const guardians: Record<string, any>[] = Array.isArray(data.guardians)
    ? data.guardians.filter(isRecord)
    : [];

  const chosenIndex = Number(data.billingGuardianIndex);
  const chosen =
    Number.isInteger(chosenIndex) &&
    chosenIndex >= 0 &&
    chosenIndex < guardians.length
      ? guardians[chosenIndex]
      : null;

  if (chosen) return fromGuardian(chosen);

  const withFiscalCode = guardians.find((guardian) =>
    firstText(guardian.fiscalCode, guardian.fiscal_code),
  );
  if (withFiscalCode) return fromGuardian(withFiscalCode);

  const athleteRecipient = fromAthlete(athlete);

  /*
    Senza tutori e senza codice fiscale dell'atleta si resta con il nome. Il
    documento si emette lo stesso: rifiutarsi vorrebbe dire non documentare un
    incasso che e avvenuto, e la ricevuta senza codice fiscale resta valida.
  */
  if (!athleteRecipient.name && guardians.length) {
    return fromGuardian(guardians[0]);
  }

  return athleteRecipient;
};

/** Cosa manca per una **fattura**. Per una ricevuta non manca niente. */
export const missingInvoiceFields = (recipient: FiscalRecipient): string[] => {
  const missing: string[] = [];

  if (!recipient.name) missing.push("intestatario");
  if (!recipient.fiscalCode && !recipient.vatNumber) {
    missing.push("codice fiscale o partita IVA");
  }

  return missing;
};
