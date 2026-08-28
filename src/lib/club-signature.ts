/**
 * Firma e timbro del presidente: il modello, lato client e lato server.
 *
 * **A chi appartengono.** Non alla persona che le carica: al **club**. Il
 * presidente cambia, la societa resta, e il documento che le porta e emesso
 * dalla societa. Per questo l'allegato ha `owner_type: "club"` e
 * `owner_id: <organization_id>` — il tipo esisteva gia in
 * `ATTACHMENT_OWNER_TYPES` e nessuno lo usava — e per questo il riferimento
 * sta in `clubs.settings`, accanto agli altri dati anagrafici della societa.
 *
 * **Perche un modulo separato da quello del server.** E la stessa divisione
 * di `attachments.ts` / `server/attachments.ts`: qui c'e cio che il browser
 * deve poter sapere prima di caricare 4 MB su una connessione mobile — quali
 * tipi sono ammessi, quanto pesa il limite, come si chiamano le due cose —
 * e nient'altro. Il modulo server e l'unico che scrive, e non e importabile
 * da un componente.
 */

/** Le due cose che si possono caricare. Elenco chiuso. */
export const CLUB_SIGNATURE_KINDS = ["signature", "stamp"] as const;

export type ClubSignatureKind = (typeof CLUB_SIGNATURE_KINDS)[number];

/**
 * Le categorie di allegato corrispondenti.
 *
 * Sono costanti e chiuse perche sono una **chiave di ricerca**: e con queste
 * che si ritrova il file di un club nella tabella degli allegati. Un valore
 * calcolato a runtime, o scritto a mano in due posti, e un file che un giorno
 * non si trova piu.
 */
export const CLUB_SIGNATURE_CATEGORIES = [
  "president_signature",
  "president_stamp",
] as const;

export type ClubSignatureCategory = (typeof CLUB_SIGNATURE_CATEGORIES)[number];

export const CLUB_SIGNATURE_CATEGORY_BY_KIND: Record<
  ClubSignatureKind,
  ClubSignatureCategory
> = {
  signature: "president_signature",
  stamp: "president_stamp",
};

/**
 * La chiave di `clubs.settings` che porta il **riferimento** all'allegato.
 *
 * Il valore e sempre `attachment:<id>`, mai un `data:` — il logo del club
 * (`clubs.logo_url`) e ancora un data URL e non e un precedente da imitare:
 * e proprio il difetto che WP-15 chiude.
 */
export const CLUB_SIGNATURE_SETTINGS_KEY_BY_KIND: Record<
  ClubSignatureKind,
  string
> = {
  signature: "presidentSignature",
  stamp: "presidentStamp",
};

export const CLUB_SIGNATURE_SETTINGS_KEYS = Object.values(
  CLUB_SIGNATURE_SETTINGS_KEY_BY_KIND,
);

/** L'etichetta italiana, per messaggi e schermate. */
export const CLUB_SIGNATURE_LABELS: Record<ClubSignatureKind, string> = {
  signature: "Firma del presidente",
  stamp: "Timbro della societa",
};

const KIND_SET = new Set<string>(CLUB_SIGNATURE_KINDS);

export const isClubSignatureKind = (
  value?: string | null,
): value is ClubSignatureKind =>
  KIND_SET.has(String(value || "").trim().toLowerCase());

/**
 * I tipi ammessi: **solo immagini**, e piu stretti di Attachment Core.
 *
 * Una firma non e un PDF e non e un documento Word. Finisce dentro un altro
 * documento, come `<img>`: qualunque cosa il browser non sappia disegnare
 * come immagine e un file che passerebbe il caricamento e poi non comparirebbe
 * sulla ricevuta. Meglio rifiutarlo qui, quando c'e ancora qualcuno che puo
 * caricarne un altro.
 *
 * Niente `image/heic` ne `image/tiff`, che pure Attachment Core accetta:
 * nessun browser li disegna, e una firma HEIC sarebbe un riquadro vuoto.
 */
export const ALLOWED_CLUB_SIGNATURE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

const ALLOWED_MIME_SET = new Set<string>(ALLOWED_CLUB_SIGNATURE_MIME_TYPES);

/**
 * Dimensione massima: 2 MB, contro i 10 di un allegato qualsiasi.
 *
 * Non e prudenza generica. Una firma non si consegna da sola: si **incorpora**
 * in un documento HTML come `data:` base64, che costa un terzo in piu del
 * binario. A 10 MB una singola ricevuta peserebbe 13 MB, e un ciclo di stampa
 * di duecento ricevute renderebbe la pagina inutilizzabile. Una firma
 * scansionata a 300 dpi in PNG sta in poche centinaia di kB: oltre i 2 MB c'e
 * quasi sempre la foto non ridimensionata di un foglio intero.
 */
export const MAX_CLUB_SIGNATURE_BYTES = 2 * 1024 * 1024;

export type ClubSignatureValidationResult =
  | { ok: true; mimeType: string; sizeBytes: number }
  | { ok: false; message: string };

const humanSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${bytes} byte`;
};

/**
 * Il file caricato e accettabile come firma o timbro?
 *
 * Vale sul client per dirlo subito e sul server, dove e l'unico controllo che
 * conta. Il messaggio dice **cosa fare**, non solo cosa e andato storto.
 */
export const validateClubSignatureInput = (input: {
  mimeType?: string | null;
  sizeBytes?: number | null;
}): ClubSignatureValidationResult => {
  const mimeType = String(input.mimeType || "").trim().toLowerCase();
  const sizeBytes = Number(input.sizeBytes || 0);

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, message: "Il file e vuoto." };
  }

  if (sizeBytes > MAX_CLUB_SIGNATURE_BYTES) {
    return {
      ok: false,
      message: `L'immagine supera il limite di ${humanSize(MAX_CLUB_SIGNATURE_BYTES)} (${humanSize(sizeBytes)}). Ritagliala attorno alla firma e ricaricala.`,
    };
  }

  if (!mimeType) {
    return { ok: false, message: "Non riesco a riconoscere il tipo del file." };
  }

  if (!ALLOWED_MIME_SET.has(mimeType)) {
    return {
      ok: false,
      message: `Tipo di file non ammesso (${mimeType}). Firma e timbro devono essere un'immagine PNG, JPEG o WebP: finiscono dentro un documento.`,
    };
  }

  return { ok: true, mimeType, sizeBytes };
};

/** L'elenco dei tipi, nella forma che vuole l'attributo `accept`. */
export const CLUB_SIGNATURE_ACCEPT_ATTRIBUTE =
  ALLOWED_CLUB_SIGNATURE_MIME_TYPES.join(",");

/**
 * L'indirizzo da cui il browser legge l'immagine.
 *
 * Non e un `data:` e non e pubblico: e una rotta autenticata che verifica
 * l'appartenenza al club prima di consegnare i byte.
 *
 * `version` e l'impronta del contenuto (il `checksum` dei metadati). Serve a
 * far ricomparire l'immagine **nuova** subito dopo una sostituzione: la
 * risposta e in cache privata nel browser, e senza un indirizzo diverso
 * l'anteprima continuerebbe a mostrare la firma di prima.
 */
export const buildClubSignatureUrl = (
  organizationId: string,
  kind: ClubSignatureKind,
  version?: string | null,
) => {
  const base = `/api/v1/clubs/${encodeURIComponent(String(organizationId || "").trim())}/signature?kind=${encodeURIComponent(kind)}`;
  const stamp = String(version || "").trim();
  return stamp ? `${base}&v=${encodeURIComponent(stamp)}` : base;
};
