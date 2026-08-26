/**
 * L'**intermediario** per la fattura elettronica: il confine, e il fatto che
 * oggi dietro non c'e nessuno.
 *
 * **Perche esiste un'interfaccia se non c'e un'implementazione.** Perche la
 * scelta dell'intermediario e una decisione commerciale e contrattuale che non
 * appartiene a chi scrive il codice, e perche il momento in cui la si prende
 * non deve essere il momento in cui si scopre che mezza applicazione parla
 * direttamente con un fornitore. Il confine si disegna prima; il fornitore si
 * infila dentro dopo.
 *
 * **Perche il registro e vuoto, e non contiene un finto.** Un adapter finto che
 * risponde «trasmessa» e peggio di nessun adapter: produce esattamente lo stato
 * che non si deve poter raggiungere, e lo produce in modo indistinguibile da
 * quello vero. Il registro qui sotto e vuoto per costruzione, e
 * `describeEInvoiceCapability` lo dice a chiare lettere all'interfaccia, che
 * disabilita il pulsante invece di offrirlo e fallire.
 *
 * Vedi ADR-0053. Quando un intermediario verra scelto, cambiano tre cose e
 * nessun'altra: un file nuovo sotto `providers/`, una riga nel registro, e la
 * configurazione in Platform Admin.
 */

import type { EInvoiceState } from "./states";

export const EINVOICE_PROVIDER_KEYS = [
  "aruba",
  "fatture_in_cloud",
  "acube",
  "sdi_diretto",
] as const;

export type EInvoiceProviderKey = (typeof EINVOICE_PROVIDER_KEYS)[number];

export const isEInvoiceProviderKey = (
  value: unknown,
): value is EInvoiceProviderKey =>
  EINVOICE_PROVIDER_KEYS.includes(String(value || "") as EInvoiceProviderKey);

export type EInvoiceProviderDescriptor = {
  key: EInvoiceProviderKey;
  label: string;
  description: string;
  /** Vero se esiste un adapter scritto. Oggi: nessuno. */
  hasAdapter: boolean;
  /** Cosa saprebbe fare quel provider, quando ci sara. */
  capabilities: Array<"transmit" | "receive_receipts" | "archive" | "inbound">;
};

/**
 * I candidati noti.
 *
 * Sono qui perche la scelta va **presentata** a chi la deve prendere, con
 * scritto accanto che nessuno di loro e collegato. Un elenco vuoto avrebbe
 * lasciato la sezione della console senza contenuto, e la decisione senza un
 * posto in cui essere presa.
 */
export const EINVOICE_PROVIDERS: Record<
  EInvoiceProviderKey,
  EInvoiceProviderDescriptor
> = {
  aruba: {
    key: "aruba",
    label: "Aruba Fatturazione Elettronica",
    description: "Intermediario accreditato con API di trasmissione e conservazione.",
    hasAdapter: false,
    capabilities: ["transmit", "receive_receipts", "archive", "inbound"],
  },
  fatture_in_cloud: {
    key: "fatture_in_cloud",
    label: "Fatture in Cloud",
    description: "Servizio con API REST e gestione delle ricevute SdI.",
    hasAdapter: false,
    capabilities: ["transmit", "receive_receipts", "archive"],
  },
  acube: {
    key: "acube",
    label: "A-Cube",
    description: "Intermediario orientato alle integrazioni applicative.",
    hasAdapter: false,
    capabilities: ["transmit", "receive_receipts", "inbound"],
  },
  sdi_diretto: {
    key: "sdi_diretto",
    label: "Canale SdI diretto",
    description:
      "Accreditamento diretto presso lo SdI: richiede canale, certificati e conservazione a carico di Cedi Soft.",
    hasAdapter: false,
    capabilities: ["transmit", "receive_receipts"],
  },
};

/* -------------------------------------------------------------- adapter */

export type EInvoiceTransmissionResult = {
  provider: EInvoiceProviderKey;
  /** L'identificativo assegnato dall'intermediario. */
  externalId: string;
  state: EInvoiceState;
  /** L'identificativo dello SdI, quando l'intermediario lo restituisce subito. */
  sdiIdentifier: string | null;
};

export type EInvoiceReceipt = {
  /** `RC` consegna, `MC` mancata consegna, `NS` scarto, ... */
  kind: string;
  receivedAt: string;
  message: string | null;
  raw: Record<string, any>;
};

/**
 * Cosa deve saper fare un intermediario per stare dietro questo confine.
 *
 * Quattro operazioni. Se un intermediario ne offre altre restano dietro
 * l'adapter; se ne offre meno, `capabilities` lo dichiara e l'interfaccia
 * disabilita cio che quel canale non sa fare, invece di offrirlo e fallire
 * davanti a chi sta emettendo una fattura.
 */
export type EInvoiceProvider = {
  key: EInvoiceProviderKey;
  isConfigured: () => boolean;
  transmit: (input: {
    xml: string;
    fileName: string;
    organizationId: string;
  }) => Promise<EInvoiceTransmissionResult>;
  fetchReceipts: (input: {
    externalId: string;
  }) => Promise<EInvoiceReceipt[]>;
  /** Lo stato secondo l'intermediario, per riallinearsi dopo un'interruzione. */
  fetchState: (input: { externalId: string }) => Promise<EInvoiceState>;
};

/**
 * Il registro degli adapter. **Vuoto, e non per dimenticanza.**
 *
 * Vedi la nota in testa al file sul perche non contiene un adapter finto.
 */
const ADAPTERS: Partial<Record<EInvoiceProviderKey, EInvoiceProvider>> = {};

export const getEInvoiceProvider = (key: unknown): EInvoiceProvider | null =>
  isEInvoiceProviderKey(key) ? ADAPTERS[key] || null : null;

export type EInvoiceCapability = {
  /** Vero solo se esiste un adapter **ed e** configurato. */
  canTransmit: boolean;
  providerKey: EInvoiceProviderKey | null;
  providerLabel: string | null;
  /** Cosa leggere nell'interfaccia. Una frase, gia in italiano. */
  message: string;
};

/**
 * Cosa EasyGame puo fare, adesso, con la fattura elettronica.
 *
 * **Il messaggio non e generico di proposito.** «Funzione non disponibile»
 * lascia credere a un guasto. Qui si dice quale delle tre cose manca — nessun
 * provider scelto, provider scelto ma senza adapter, adapter presente ma senza
 * credenziali — perche le risolvono persone diverse.
 */
export const describeEInvoiceCapability = (input: {
  providerKey?: unknown;
}): EInvoiceCapability => {
  const key = isEInvoiceProviderKey(input.providerKey) ? input.providerKey : null;

  if (!key) {
    return {
      canTransmit: false,
      providerKey: null,
      providerLabel: null,
      message:
        "Invio elettronico non configurato: non e stato scelto un intermediario accreditato. EasyGame prepara il tracciato FatturaPA; la trasmissione allo SdI non e attiva.",
    };
  }

  const descriptor = EINVOICE_PROVIDERS[key];
  const adapter = ADAPTERS[key];

  if (!adapter) {
    return {
      canTransmit: false,
      providerKey: key,
      providerLabel: descriptor.label,
      message: `${descriptor.label} e stato selezionato ma non e ancora collegato: la trasmissione allo SdI non e attiva.`,
    };
  }

  if (!adapter.isConfigured()) {
    return {
      canTransmit: false,
      providerKey: key,
      providerLabel: descriptor.label,
      message: `${descriptor.label} e collegato ma non configurato su questo ambiente.`,
    };
  }

  return {
    canTransmit: true,
    providerKey: key,
    providerLabel: descriptor.label,
    message: `Trasmissione attiva tramite ${descriptor.label}.`,
  };
};
