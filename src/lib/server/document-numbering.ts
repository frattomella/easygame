/**
 * Chi assegna il prossimo numero di documento. **Unico proprietario.**
 *
 * **Il problema, in una riga.** Due operatori della stessa societa registrano
 * un incasso nello stesso secondo. Se il numero si ricava contando le
 * ricevute gia emesse, leggono lo stesso conteggio e chiedono lo stesso
 * numero: uno dei due incassi non si documenta, oppure due incassi portano lo
 * stesso numero. Non e un caso raro da laboratorio — e il sabato mattina di
 * una segreteria con due sportelli.
 *
 * **Come si evita.** La sequenza e una riga con un contatore, e
 * l'incremento e un `UPDATE ... SET last_number = last_number + 1` dentro una
 * transazione. Postgres blocca quella riga fino al commit: la seconda
 * richiesta non legge un valore vecchio, **aspetta**. La lettura del valore
 * assegnato avviene nella stessa transazione, quindi vede il proprio
 * incremento e nessun altro.
 *
 * **Perche il primo documento di un club puo riprovare.** Se la riga della
 * sequenza non esiste ancora, va creata, e due richieste possono provarci
 * insieme: la seconda prende un errore di chiave duplicata, che in Postgres
 * annulla l'intera transazione — non si puo recuperare da dentro. Si riprova
 * l'operazione intera, e al secondo giro la riga c'e e si incrementa. La
 * finestra e larga quanto il primo documento di un club in un anno.
 *
 * **Perche non si riusa il numero di un documento annullato.** La sequenza
 * conta cio che e stato **assegnato**, non cio che esiste. Un buco nella
 * numerazione e leggibile e spiegabile; lo stesso numero su due documenti no.
 */

import { prisma } from "./prisma";
import {
  formatDocumentNumber,
  normalizeSeriesCode,
  type DocumentNumberKind,
} from "@/lib/documents/numbering";

export type DocumentNumberAllocation = {
  kind: DocumentNumberKind;
  /** Vuoto per la serie predefinita. */
  series: string;
  year: number;
  sequence: number;
  /** Il numero gia scritto: `R-2026-0001`. */
  number: string;
};

const sequenceClient = (client: any) => client.documentNumberSequence;

const isDuplicateKey = (error: any) =>
  error?.code === "P2002" ||
  String(error?.message || "").includes("document_number_sequences");

const allocateOnce = async (
  organizationId: string,
  kind: DocumentNumberKind,
  series: string,
  year: number,
): Promise<number> =>
  (prisma as any).$transaction(async (tx: any) => {
    const where = { organization_id: organizationId, kind, series, year };

    /*
      `updateMany` con `increment` e una sola istruzione SQL: il valore non
      passa mai dall'applicazione, quindi non c'e un intervallo in cui due
      richieste possano leggere lo stesso numero.
    */
    const bumped = await sequenceClient(tx).updateMany({
      where,
      data: { last_number: { increment: 1 } },
    });

    if (!bumped.count) {
      await sequenceClient(tx).create({
        data: { ...where, last_number: 1 },
      });
      return 1;
    }

    const row = await sequenceClient(tx).findFirst({ where });
    return Number(row?.last_number || 1);
  });

/**
 * Il prossimo numero per un club, un tipo di documento e un anno.
 *
 * Non scrive il documento: restituisce il numero. Chi lo ha chiesto lo usa
 * nella stessa operazione in cui crea la riga, e se quella fallisce il numero
 * resta consumato — vedi sopra sul perche un buco e preferibile a un
 * duplicato.
 */
export const allocateDocumentNumber = async (input: {
  organizationId: string;
  kind: DocumentNumberKind;
  year: number;
  /** Vuoto = serie predefinita, che e cio che ha ogni club che non ne usa. */
  series?: string;
}): Promise<DocumentNumberAllocation> => {
  const organizationId = String(input.organizationId || "").trim();
  if (!organizationId) {
    throw new Error("Accesso negato: numerazione senza club");
  }

  const year = Math.trunc(Number(input.year) || new Date().getFullYear());
  const series = normalizeSeriesCode(input.series);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const sequence = await allocateOnce(organizationId, input.kind, series, year);
      return {
        kind: input.kind,
        series,
        year,
        sequence,
        number: formatDocumentNumber(input.kind, year, sequence, series),
      };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      lastError = error;
    }
  }

  throw new Error(
    `Numerazione ${input.kind} non disponibile: riprova fra qualche istante`,
    { cause: lastError },
  );
};

/**
 * L'ultimo numero assegnato, senza assegnarne uno nuovo.
 *
 * Serve a mostrare «la prossima sara la 12» prima di emettere, e alla
 * riconciliazione di chi controlla un registro. Non incrementa: leggere non
 * deve consumare.
 */
export const peekDocumentNumber = async (input: {
  organizationId: string;
  kind: DocumentNumberKind;
  year: number;
  series?: string;
}): Promise<number> => {
  const row = await sequenceClient(prisma).findFirst({
    where: {
      organization_id: input.organizationId,
      kind: input.kind,
      series: normalizeSeriesCode(input.series),
      year: Math.trunc(Number(input.year) || new Date().getFullYear()),
    },
  });

  return Number(row?.last_number || 0);
};
