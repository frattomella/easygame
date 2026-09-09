export type MedicalCertificateStatus = "valid" | "expiring" | "expired";
export type MedicalCertificateAvailability =
  | MedicalCertificateStatus
  | "missing";

type ExpirySource =
  | string
  | Date
  | null
  | undefined
  | {
      expiryDate?: string | Date | null;
      expiry_date?: string | Date | null;
    };

const toDate = (value: string | Date | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getMedicalCertificateStatus = (
  source: ExpirySource,
  referenceDate: Date = new Date(),
): MedicalCertificateStatus => {
  const expiryDate = toDate(
    typeof source === "object" && source !== null && !(source instanceof Date)
      ? source.expiryDate ?? source.expiry_date
      : source,
  );

  if (!expiryDate) {
    return "valid";
  }

  const comparisonDate = new Date(referenceDate);
  const warningDate = new Date(expiryDate);
  warningDate.setMonth(warningDate.getMonth() - 1);

  if (expiryDate < comparisonDate) {
    return "expired";
  }

  if (comparisonDate >= warningDate) {
    return "expiring";
  }

  return "valid";
};

export const getMedicalCertificateAvailability = (
  source: ExpirySource,
  referenceDate: Date = new Date(),
): MedicalCertificateAvailability => {
  const expiryDate = toDate(
    typeof source === "object" && source !== null && !(source instanceof Date)
      ? source.expiryDate ?? source.expiry_date
      : source,
  );

  if (!expiryDate) {
    return "missing";
  }

  return getMedicalCertificateStatus(expiryDate, referenceDate);
};

export const getMedicalCertificateAvailabilityLabel = (
  availability: MedicalCertificateAvailability,
) => {
  switch (availability) {
    case "missing":
      return "Certificato mancante";
    case "expired":
      return "Certificato scaduto";
    case "expiring":
      return "Certificato in scadenza";
    default:
      return "Certificato valido";
  }
};

export const getLatestMedicalCertificateExpiry = (
  certificates: Array<{
    expiryDate?: string | Date | null;
    expiry_date?: string | Date | null;
  }>,
) => {
  const timestamps = certificates
    .map((certificate) =>
      toDate(certificate.expiryDate ?? certificate.expiry_date)?.getTime() ?? 0,
    )
    .filter((value) => value > 0);

  if (!timestamps.length) {
    return "";
  }

  return new Date(Math.max(...timestamps)).toISOString();
};

/* ==================================================================== */
/*  PP-02 §F — cio che la famiglia legge sul certificato                */
/* ==================================================================== */

/**
 * **Lo stato del certificato come lo legge una famiglia.**
 *
 * `MedicalCertificateAvailability` ha quattro voci e ne mancava una: un
 * certificato **c'e** ma non dichiara una scadenza. Oggi quel caso finisce su
 * `missing` — «Certificato mancante» — e non e vero: il documento e stato
 * consegnato, e quello che manca e la data. Sono due cose che la famiglia deve
 * fare in modo diverso (caricarlo, oppure chiedere alla segreteria di
 * completarlo) e che una parola sola non distingue.
 *
 * Vive accanto e non **dentro** `MedicalCertificateAvailability` perche quel
 * tipo lo leggono anche l'appello e le convocazioni, che ricevono una data
 * sola e non sanno se dietro ci sia un certificato: allargarlo li obbligherebbe
 * a rispondere a una domanda che non possono porre.
 */
export type MedicalCertificateFamilyState =
  | MedicalCertificateStatus
  | "missing"
  | "undated";

export const getMedicalCertificateFamilyState = (
  input: { count: number; expiryDate?: string | Date | null },
  referenceDate: Date = new Date(),
): MedicalCertificateFamilyState => {
  const expiryDate = toDate(input?.expiryDate ?? null);

  if (expiryDate) {
    return getMedicalCertificateStatus(expiryDate, referenceDate);
  }

  return Number(input?.count || 0) > 0 ? "undated" : "missing";
};

const FAMILY_LABELS: Record<MedicalCertificateFamilyState, string> = {
  valid: "Valido",
  expiring: "In scadenza",
  expired: "Scaduto",
  undated: "Consegnato",
  missing: "Mancante",
};

/**
 * La data in cifre, **letta nel fuso in cui e stata scritta**.
 *
 * `expiry_date` e una data senza ora: in archivio e la mezzanotte UTC. Resa
 * con il fuso del lettore, in un fuso positivo diventa il giorno prima — e un
 * certificato che scade il primo giugno si legge «Scade il 31/05». E la stessa
 * famiglia del difetto AUD-02, e qui si chiude dichiarando il fuso.
 */
export const formatMedicalCertificateDate = (
  value: string | Date | null | undefined,
) => {
  const date = toDate(value);
  if (!date) return "";

  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
};

/**
 * **La riga che la famiglia legge, per intero.**
 *
 * PP-02 §F. La card diceva soltanto lo stato — «Certificato valido» — e la
 * data viveva in una riga separata, quando c'era la riga. Uno stato senza la
 * sua data non dice cio che una famiglia deve sapere, che non e «va bene» ma
 * **fino a quando**.
 *
 * Le forme, e sono un elenco chiuso:
 *
 *     Valido — Scade il 01/06/2027
 *     In scadenza — Scade il 12/09/2026
 *     Scaduto — Scaduto il 03/01/2026
 *     Mancante — Data di scadenza non disponibile
 *     Consegnato — Data di scadenza non disponibile
 *
 * **L'etichetta c'e sempre**, e senza data e l'unica cosa che distingue il
 * certificato che non c'e da quello consegnato senza scadenza. La prima
 * stesura la ometteva, e il riquadro della Home smetteva di scrivere
 * «Mancante» proprio per l'atleta che il certificato non lo ha portato.
 */
export const describeMedicalCertificateForFamily = (
  state: MedicalCertificateFamilyState,
  expiryDate: string | Date | null | undefined,
) => {
  const label = FAMILY_LABELS[state] || FAMILY_LABELS.missing;
  const formatted = formatMedicalCertificateDate(expiryDate);

  if (!formatted) {
    /*
      **L'etichetta resta anche qui**, e la prima stesura la perdeva.
      `summary` valeva la sola frase sulla data, e la Home — che ha sostituito
      il paragrafo dell'etichetta con quello della riga — smetteva di scrivere
      «Mancante» proprio sull'atleta che il certificato non ce l'ha. Cioe il
      caso per cui il riquadro esiste.
    */
    return {
      label,
      detail: "Data di scadenza non disponibile",
      summary: `${label} — Data di scadenza non disponibile`,
    };
  }

  const detail =
    state === "expired" ? `Scaduto il ${formatted}` : `Scade il ${formatted}`;

  return { label, detail, summary: `${label} — ${detail}` };
};

/**
 * **Il certificato piu recente per primo.**
 *
 * Lo stesso confronto viveva **tre volte** nella scheda atleta — al
 * caricamento, all'aggiunta e alla correzione — e tre copie di un ordinamento
 * sono tre occasioni di ordinarlo diversamente. Un certificato senza scadenza
 * va in fondo: non e piu recente di niente, e fingere il contrario lo
 * metterebbe davanti a quelli veri.
 */
export const compareCertificatesByExpiryDesc = (
  left: { expiryDate?: unknown },
  right: { expiryDate?: unknown },
) => {
  const quando = (value: unknown) => {
    if (!value) return 0;
    const data = new Date(String(value));
    return Number.isNaN(data.getTime()) ? 0 : data.getTime();
  };

  return quando(right?.expiryDate) - quando(left?.expiryDate);
};
