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
 * **La seconda forma: l'intestatario che non e un atleta.** Non ogni documento
 * nasce da una quota. Una sponsorizzazione e l'unica entrata dichiaratamente
 * commerciale del catalogo, l'unica che una fattura la richiede — e finche
 * questo modulo sapeva partire solo da un atleta, era l'unica che non poteva
 * averla. Da qui in avanti l'intestatario puo essere anche una **controparte**:
 * uno sponsor, un fornitore, un socio, un ente. Porta la sua partita IVA o il
 * suo codice fiscale e la sua sede, e viene congelato nello snapshot esattamente
 * come l'atleta.
 *
 * Modulo **puro**: riceve i record gia caricati.
 */

import { resolveDocumentGuardians } from "@/lib/guardians/documents";
import type { CounterpartyKind } from "@/lib/accounting/model";

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
  source: "guardian" | "athlete" | "counterparty" | "unknown";
  /**
   * Il tipo di controparte, quando l'intestatario non e un atleta.
   *
   * Serve a chi legge il documento per sapere **di che soggetto si tratta**
   * senza risalire alla riga che lo ha prodotto, e allo snapshot per congelarlo.
   */
  counterpartyKind?: CounterpartyKind | null;
  counterpartyId?: string | null;
};

/**
 * L'intestatario non-atleta, nella forma in cui i domini lo consegnano.
 *
 * **Non e una tabella `counterparties`**: e la stessa coppia polimorfa dei
 * movimenti — tipo, id nel dominio proprietario — piu i dati fiscali letti dal
 * dominio che li possiede. Chi la costruisce e lo sponsor
 * (`src/lib/sponsors/model.ts`), e domani il socio, non questo modulo.
 */
export type FiscalCounterparty = {
  kind: CounterpartyKind;
  id?: string | null;
  name: string;
  fiscalCode?: string | null;
  vatNumber?: string | null;
  recipientCode?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  province?: string | null;
  country?: string | null;
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

const fromCounterparty = (
  counterparty: FiscalCounterparty,
): FiscalRecipient => ({
  name: asText(counterparty.name),
  fiscalCode: asText(counterparty.fiscalCode),
  vatNumber: asText(counterparty.vatNumber),
  recipientCode: asText(counterparty.recipientCode),
  email: asText(counterparty.email),
  address: asText(counterparty.address),
  city: asText(counterparty.city),
  postalCode: asText(counterparty.postalCode),
  province: asText(counterparty.province),
  country: firstText(counterparty.country, "Italia"),
  source: "counterparty",
  counterpartyKind: counterparty.kind,
  counterpartyId: asText(counterparty.id) || null,
});

/**
 * L'intestatario di un documento quando **non** e un atleta.
 *
 * Esportata a parte perche ha un chiamante che l'atleta non ce l'ha proprio —
 * un'anteprima di fattura allo sponsor, prima ancora che un incasso esista.
 */
export const resolveCounterpartyFiscalRecipient = (
  counterparty: FiscalCounterparty | null | undefined,
): FiscalRecipient =>
  isRecord(counterparty) && asText(counterparty.name)
    ? fromCounterparty(counterparty)
    : EMPTY;

/**
 * Il soggetto di un documento, nelle **due** forme che esistono.
 *
 * La forma storica — l'atleta passato direttamente — resta valida e resta la
 * piu comune: nessun chiamante e stato costretto a cambiare per far posto alla
 * seconda.
 */
export type FiscalRecipientSubject =
  | Record<string, any>
  | { counterparty: FiscalCounterparty }
  | null
  | undefined;

/**
 * L'intestatario di un documento, dato l'atleta **o** la controparte.
 *
 * `billingGuardianIndex` e la scelta esplicita del club, quando c'e: chi paga
 * non e sempre il primo genitore dell'elenco, e indovinarlo significa
 * intestare la detrazione alla persona sbagliata.
 *
 * **Quando la controparte c'e, vince.** Non e un ordine di preferenza
 * arbitrario: un incasso che dichiara una controparte non-atleta la dichiara
 * perche il documento e suo. Cadere sull'atleta intesterebbe a una famiglia una
 * fattura di sponsorizzazione, che e l'errore peggiore fra quelli possibili qui.
 */
export const resolveFiscalRecipient = (
  subject: FiscalRecipientSubject,
): FiscalRecipient => {
  if (isRecord(subject) && isRecord((subject as any).counterparty)) {
    return resolveCounterpartyFiscalRecipient(
      (subject as { counterparty: FiscalCounterparty }).counterparty,
    );
  }

  const athlete = subject as Record<string, any> | null | undefined;
  if (!isRecord(athlete)) return EMPTY;

  const data = isRecord(athlete.data) ? athlete.data : {};

  /*
    **Un documento nuovo non intesta a chi il club ha escluso, ne a un recapito.**

    La proiezione riproduce **tutte** le righe, comprese quelle revocate e
    quelle di solo recapito: e voluto, perche li nessuno decide un accesso. Ma
    qui si decide chi compare come intestatario su una ricevuta — quella che una
    famiglia porta in detrazione — e due righe non possono comparirci:

    * una riga **revocata** e una persona che il club ha escluso. Continuare a
      intestarle i documenti nuovi vuol dire che l'esclusione vale per l'accesso
      e non per il resto, che non e cio che un operatore intende quando revoca;
    * una riga **di solo recapito** e un indirizzo che qualcuno ha dichiarato
      dalla porta pubblica. Misurato: un terzo compila un modulo pubblico con il
      proprio codice fiscale e diventa l'intestatario della ricevuta.

    Le ricevute gia emesse non cambiano: il destinatario si congela sulla riga
    al momento dell'emissione. Questa scelta riguarda cio che si emette **da
    adesso**, ed e la prima volta che viene scritta: tre revisioni l'avevano
    segnalata come «letta, mai decisa».

    La posizione scelta a mano dal club (`billingGuardianIndex`) non fa
    eccezione: se punta a una riga esclusa, si passa alla successiva utile.
  */
  /*
    **Il predicato non e piu scritto qui** (49 §C, §G).

    `intestabile` era la seconda di cinque stesure della stessa domanda, e
    l'unica che leggesse `access_revoked_at` con un `firstText`: le altre
    quattro usavano la truthiness, e nessuna leggeva le grafie della **riga**.
    Adesso la domanda la fa `resolveDocumentGuardians`, che restituisce le voci
    **per posizione** con `null` al posto di chi e escluso — cosi la posizione
    non slitta, che e l'altra meta della regola.
  */
  const intestabili = resolveDocumentGuardians(data);

  const chosenIndex = Number(data.billingGuardianIndex);
  const chosen =
    Number.isInteger(chosenIndex) &&
    chosenIndex >= 0 &&
    chosenIndex < intestabili.length
      ? intestabili[chosenIndex]
      : null;

  if (chosen) return fromGuardian(chosen);

  const withFiscalCode = intestabili.find(
    (guardian) =>
      Boolean(guardian) && firstText(guardian!.fiscalCode, guardian!.fiscal_code),
  );
  if (withFiscalCode) return fromGuardian(withFiscalCode);

  const athleteRecipient = fromAthlete(athlete);

  /*
    Senza tutori e senza codice fiscale dell'atleta si resta con il nome. Il
    documento si emette lo stesso: rifiutarsi vorrebbe dire non documentare un
    incasso che e avvenuto, e la ricevuta senza codice fiscale resta valida.
  */
  /*
    **Anche l'ultimo ripiego passa da `intestabile`.**

    La regola era stata applicata a due rami su tre, dentro la stessa funzione:
    questo intestava a `guardians[0]` qualunque cosa fosse, quindi anche a una
    riga revocata o a un recapito dichiarato dalla porta pubblica. Un ADR che
    dice «due righe non possono comparirci» e poi lascia un ramo che le fa
    comparire non dice niente.
  */
  const primoIntestabile = intestabili.find(Boolean);
  if (!athleteRecipient.name && primoIntestabile) {
    return fromGuardian(primoIntestabile);
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
