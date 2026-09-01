/**
 * **Il catalogo canonico dei tipi di documento** (Wave 6, lane 6E, W6-47).
 *
 * ---
 *
 * ## Perche esiste
 *
 * Il vocabolario dei tipi documentali viveva in `src/lib/shared-documents.ts`
 * — `SHARED_DOCUMENT_TYPES` — cioe **nel file che la lane 5J deve cancellare**.
 * Un elenco che sparisce con l'archivio storico non e un catalogo: e un residuo
 * che tiene in ostaggio la cancellazione. Qui vive nel dominio nuovo, accanto a
 * `request-model.ts`, e sopravvive a quella rimozione.
 *
 * E mancavano due voci che una segreteria chiede tutte le settimane: la
 * **tessera sanitaria** e la **delega** al ritiro del minore. Senza una voce
 * canonica ognuna delle due diventava «Altro» piu una descrizione a mano
 * scritta in tre modi diversi da tre operatori — e a quel punto «quanti hanno
 * consegnato la delega?» non e piu una domanda a cui il prodotto sappia
 * rispondere.
 *
 * ## Cosa un tipo canonico e, e cosa non e
 *
 * Un tipo e una **chiave di raggruppamento**, non un titolo. Il titolo lo
 * scrive chi chiede il documento — «Carta d'identita del secondo genitore» e
 * «Carta d'identita del minore» sono due richieste diverse con lo stesso tipo —
 * ed e per questo che `validateDocumentRequestDraft` pretende il titolo e non
 * lo ricava dal tipo.
 *
 * Il tipo esiste per tre cose che il titolo non puo fare: filtrare una coda,
 * far scattare la promozione in `medical_certificates`, e contare.
 *
 * Modulo **puro** e client-safe: nessun Prisma, nessuna rete, nessun DOM.
 * Nessun import da `shared-documents.ts`, che e il punto.
 */

import { normalizeDocumentKind } from "./request-model";

export type DocumentKindEntry = {
  /** La chiave canonica, gia normalizzata: e cio che finisce in archivio. */
  key: string;
  label: string;
  /** Cosa il club sta chiedendo davvero, per chi compila la richiesta. */
  description: string;
  /**
   * Le scritture che nel tempo hanno significato la stessa cosa.
   *
   * Non sono sinonimi di comodo: sono i valori che stanno **gia** in archivio,
   * scritti dalle rotte storiche e dalle importazioni. Toglierli qui non
   * cancella quelle righe — le rende solo irriconoscibili.
   */
  aliases: readonly string[];
};

/**
 * L'elenco chiuso.
 *
 * L'ordine e quello in cui una segreteria li incontra, non l'alfabetico: il
 * certificato medico e il documento d'identita sono il 90% del traffico, e
 * stanno in cima. `other` sta in fondo perche e l'ultima risposta, non la
 * prima.
 */
export const DOCUMENT_KINDS: readonly DocumentKindEntry[] = [
  {
    key: "medical_certificate",
    label: "Certificato medico",
    description:
      "Il certificato di idoneita sportiva. Accettato, diventa una scadenza che il club sorveglia.",
    aliases: ["certificato_medico", "visita_medica", "certificate", "medical"],
  },
  {
    key: "identity_document",
    label: "Carta d'identita",
    description:
      "Un documento di riconoscimento in corso di validita, del minore o di chi ne risponde.",
    aliases: [
      "documento_identita",
      "carta_d_identita",
      "carta_identita",
      "identity",
      "id",
      "passaporto",
    ],
  },
  {
    /*
      W6-47. Non e un doppione della carta d'identita: la tessera sanitaria
      porta il **codice fiscale** ed e quella che una societa allega al
      tesseramento federale. Chiederla come «Altro» significa non poterla
      cercare.
    */
    key: "health_card",
    label: "Tessera sanitaria",
    description:
      "La tessera sanitaria con il codice fiscale, richiesta dal tesseramento.",
    aliases: [
      "tessera_sanitaria",
      "codice_fiscale",
      "health_insurance_card",
      "tesserino_sanitario",
    ],
  },
  {
    /*
      W6-47. La delega e l'unico documento del fascicolo che autorizza una
      **persona** a fare qualcosa — ritirare un minore — e non certifica un
      fatto. E la ragione per cui merita una voce sua: «chi puo venire a
      prendere Marco» e una domanda che si fa all'ingresso della palestra, non
      in archivio.
    */
    key: "delegation",
    label: "Delega",
    description:
      "La delega al ritiro del minore o alla rappresentanza, con il documento del delegato.",
    aliases: ["delega", "delega_ritiro", "proxy", "autorizzazione_ritiro"],
  },
  {
    key: "enrollment",
    label: "Modulo di iscrizione",
    description: "Il modulo di iscrizione o di rinnovo firmato.",
    aliases: ["iscrizione", "registration", "modulo_iscrizione"],
  },
  {
    key: "privacy",
    label: "Informativa privacy",
    description: "L'informativa privacy o il consenso firmato su carta.",
    aliases: ["gdpr", "informativa", "consenso_privacy"],
  },
  {
    key: "membership",
    label: "Tesseramento",
    description: "Il modulo o la ricevuta di tesseramento federale.",
    aliases: ["tesseramento", "cartellino"],
  },
  {
    key: "payment_receipt",
    label: "Ricevuta di pagamento",
    description: "La prova di un pagamento fatto fuori dal sistema.",
    aliases: ["ricevuta", "receipt", "bonifico", "ricevuta_pagamento"],
  },
  {
    key: "other",
    label: "Altro",
    description:
      "Qualunque altro documento. Il titolo della richiesta dice di cosa si tratta.",
    aliases: [],
  },
] as const;

/** Il tipo di ripiego. Non e un errore: e la risposta onesta quando non si sa. */
export const DEFAULT_DOCUMENT_KIND = "other";

const BY_KEY = new Map<string, DocumentKindEntry>();
const BY_ALIAS = new Map<string, DocumentKindEntry>();

for (const entry of DOCUMENT_KINDS) {
  BY_KEY.set(entry.key, entry);
  BY_ALIAS.set(entry.key, entry);
  for (const alias of entry.aliases) {
    BY_ALIAS.set(normalizeDocumentKind(alias), entry);
  }
}

export const isCanonicalDocumentKind = (value: unknown) =>
  BY_KEY.has(normalizeDocumentKind(value));

/**
 * Da qualunque scrittura alla chiave canonica.
 *
 * **Un tipo sconosciuto non diventa `other`.** Restituirebbe «Altro» per un
 * valore che in archivio c'e ed e scritto: la riga resterebbe filtrabile solo
 * da chi ne conosce la stringa esatta, e l'elenco «Altro» conterebbe cose che
 * altro non sono. Si restituisce la chiave normalizzata, e chi mostra
 * l'etichetta ripiega su una leggibile.
 */
export const resolveDocumentKind = (value: unknown): string => {
  const normalizzato = normalizeDocumentKind(value);
  if (!normalizzato) return DEFAULT_DOCUMENT_KIND;
  return BY_ALIAS.get(normalizzato)?.key || normalizzato;
};

/**
 * L'etichetta leggibile di un tipo.
 *
 * Per un tipo fuori catalogo si ricompone la stringa in parole invece di dire
 * «Altro»: chi legge deve poter riconoscere cosa ha chiesto la segreteria tre
 * mesi fa, anche se lo ha chiamato in un modo che il catalogo non conosce.
 */
export const getDocumentKindLabel = (value: unknown): string => {
  const chiave = resolveDocumentKind(value);
  const entry = BY_KEY.get(chiave);
  if (entry) return entry.label;

  const parole = chiave.split("_").filter(Boolean);
  if (parole.length === 0) return "Documento";
  return parole.join(" ").replace(/^./, (lettera) => lettera.toUpperCase());
};

export const getDocumentKindDescription = (value: unknown): string =>
  BY_KEY.get(resolveDocumentKind(value))?.description || "";

/** Le voci proponibili in un menu, nell'ordine del catalogo. */
export const DOCUMENT_KIND_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = DOCUMENT_KINDS.map((entry) => ({ value: entry.key, label: entry.label }));
