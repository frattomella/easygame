import { normalizePersonOrigin, toMoney, type PersonOriginType } from "./model";

/**
 * La classificazione dei **dati legacy** che assomigliano a questo dominio.
 *
 * Tre archivi esistevano prima del modulo, e nessuno dei tre e convertibile
 * alla cieca.
 *
 * 1. **`trainer_payments`** — una riga con il nome dell'allenatore in testo
 *    libero, il mese come stringa e uno stato impostato a mano. Non ha un
 *    rapporto, non ha lordo e netto, non conosce i contributi ne l'anno
 *    fiscale, e non si puo stornare. Trasformarla in un'erogazione
 *    significherebbe **inventare** i contributi che non ha: il registro in
 *    uscita direbbe che su quel compenso sono stati calcolati zero euro di
 *    contributi, e non e vero — e semplicemente non si sa.
 * 2. **`clubs.procure`** — la parola «procura» nel dominio sportivo ha almeno
 *    quattro significati distinti (agente sportivo, delega, mandato al
 *    pagamento, rapporto economico) e questa colonna non ne dichiara nessuno.
 *    Convertirla vorrebbe dire scegliere un significato al posto del cliente.
 * 3. **`clubs.trainers` e `clubs.staff_members`** — anagrafiche. Queste si
 *    possono importare: nome, cognome, contatti e codice fiscale sono
 *    inequivocabili, e creare una persona nel modulo **non tocca** la riga di
 *    origine.
 *
 * Da qui i tre esiti, e la regola: **si importa solo cio che non richiede una
 * scelta**. Tutto il resto viene elencato perche una persona lo guardi.
 */

export type LegacyOutcome = "MIGRATED" | "NEEDS_CLASSIFICATION" | "LEGACY_ONLY";

export type LegacyFinding = {
  source: "trainer_payments" | "clubs.procure" | "clubs.trainers" | "clubs.staff_members";
  outcome: LegacyOutcome;
  id: string;
  label: string;
  reason: string;
  /** I dati pronti per l'importazione, quando l'esito e `MIGRATED`. */
  candidate?: {
    originType: PersonOriginType;
    originId: string;
    firstName: string;
    lastName: string;
    fiscalCode: string | null;
    email: string | null;
    phone: string | null;
    iban: string | null;
  };
  amount?: number;
};

const asText = (value: unknown) => String(value ?? "").trim();

const splitName = (full: string) => {
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
};

/**
 * Una persona dell'anagrafica JSON del club.
 *
 * Si importa se ha **nome e cognome**: senza, il modulo avrebbe una riga che
 * nessuno riesce a riconoscere in un elenco, e il rapporto che le si
 * attaccherebbe sarebbe intestato a nessuno.
 */
export const classifyDirectoryPerson = (
  row: any,
  source: "clubs.trainers" | "clubs.staff_members",
): LegacyFinding => {
  const originType = normalizePersonOrigin(
    source === "clubs.trainers" ? "trainer" : "staff_member",
  );
  const id = asText(row?.id) || asText(row?.uuid);

  const explicitFirst = asText(row?.firstName || row?.first_name || row?.name);
  const explicitLast = asText(row?.lastName || row?.last_name || row?.surname);
  const fallback = splitName(asText(row?.fullName || row?.full_name));

  const firstName = explicitFirst || fallback.firstName;
  const lastName = explicitLast || fallback.lastName;
  const label = `${firstName} ${lastName}`.trim() || "(senza nome)";

  if (!id) {
    return {
      source,
      outcome: "NEEDS_CLASSIFICATION",
      id: "",
      label,
      reason:
        "La voce non ha un identificativo: senza, il collegamento all'anagrafica di origine non si puo scrivere.",
    };
  }

  if (!firstName || !lastName) {
    return {
      source,
      outcome: "NEEDS_CLASSIFICATION",
      id,
      label,
      reason:
        "Nome o cognome mancante: una persona senza nome non e riconoscibile in un elenco di compensi.",
    };
  }

  return {
    source,
    outcome: "MIGRATED",
    id,
    label,
    reason:
      "Anagrafica inequivocabile: si importa come persona del modulo, con il collegamento debole alla voce di origine. La voce originale non viene toccata.",
    candidate: {
      originType,
      originId: id,
      firstName,
      lastName,
      fiscalCode: asText(row?.fiscalCode || row?.fiscal_code).toUpperCase() || null,
      email: asText(row?.email).toLowerCase() || null,
      phone: asText(row?.phone) || null,
      iban: asText(row?.iban).replace(/\s+/g, "").toUpperCase() || null,
    },
  };
};

/**
 * Un pagamento del registro storico degli allenatori.
 *
 * **Sempre `NEEDS_CLASSIFICATION`, e non e una resa.** La riga non dice a
 * quale rapporto si riferisce, con quali regole e stata calcolata, quanti
 * contributi sono stati versati e in quale anno fiscale ricade. Convertirla
 * in un'erogazione produrrebbe un registro che dichiara zero contributi su
 * compensi su cui i contributi possono benissimo essere stati versati: un
 * numero falso, con l'aria di un numero storico.
 *
 * Cio che si puo fare — e che il rapporto propone — e **collegare** il
 * pagamento alla persona, quando il nome corrisponde, e lasciare che sia
 * qualcuno a decidere se ricostruirlo nel modulo.
 */
export const classifyTrainerPayment = (row: any): LegacyFinding => {
  const id = asText(row?.id);
  const name = asText(row?.trainer_name || row?.trainerName);
  const amount = toMoney(row?.amount);
  const month = asText(row?.month);

  return {
    source: "trainer_payments",
    outcome: "NEEDS_CLASSIFICATION",
    id,
    label: `${name || "(senza nome)"} — ${month || "senza mese"}`,
    amount,
    reason:
      "Il promemoria non dichiara rapporto, regole applicate, contributi ne anno fiscale. Ricostruirlo come erogazione inventerebbe dati contributivi che non ha. Va riportato a mano nel modulo, oppure lasciato dov'e come storico.",
  };
};

/**
 * Una voce di `clubs.procure`.
 *
 * **Sempre `LEGACY_ONLY`.** Non e una questione di dati mancanti: e che la
 * parola significa quattro cose diverse e la colonna non dice quale. Un
 * mandato con un agente sportivo, una delega a rappresentare un minore, un
 * mandato al pagamento e un rapporto economico con un procuratore hanno
 * regimi diversi e destinazioni diverse in questo modulo. Sceglierne uno per
 * conto del cliente e esattamente cio che il modulo esiste per non fare.
 */
export const classifyProcura = (row: any): LegacyFinding => {
  const id = asText(row?.id);
  const label =
    asText(row?.name || row?.agency_name || row?.agencyName) || "(senza nome)";
  const payments = Array.isArray(row?.payments) ? row.payments : [];

  return {
    source: "clubs.procure",
    outcome: "LEGACY_ONLY",
    id,
    label,
    amount: payments.reduce(
      (total: number, payment: any) => total + toMoney(payment?.amount),
      0,
    ),
    reason:
      "«Procura» copre quattro fattispecie con regimi diversi — agente sportivo, delega, mandato al pagamento, rapporto economico — e la voce non dichiara quale sia. Resta leggibile dove sta; la classificazione la fa una persona.",
  };
};

export type LegacyMigrationReport = {
  organizationId: string;
  findings: LegacyFinding[];
  summary: {
    MIGRATED: number;
    NEEDS_CLASSIFICATION: number;
    LEGACY_ONLY: number;
  };
  amountsAtStake: {
    trainerPayments: number;
    procure: number;
  };
};

export const buildLegacyMigrationReport = (input: {
  organizationId: string;
  trainers?: any[];
  staffMembers?: any[];
  trainerPayments?: any[];
  procure?: any[];
}): LegacyMigrationReport => {
  const findings: LegacyFinding[] = [
    ...(input.trainers || []).map((row) =>
      classifyDirectoryPerson(row, "clubs.trainers"),
    ),
    ...(input.staffMembers || []).map((row) =>
      classifyDirectoryPerson(row, "clubs.staff_members"),
    ),
    ...(input.trainerPayments || []).map(classifyTrainerPayment),
    ...(input.procure || []).map(classifyProcura),
  ];

  const summary = {
    MIGRATED: findings.filter((row) => row.outcome === "MIGRATED").length,
    NEEDS_CLASSIFICATION: findings.filter(
      (row) => row.outcome === "NEEDS_CLASSIFICATION",
    ).length,
    LEGACY_ONLY: findings.filter((row) => row.outcome === "LEGACY_ONLY").length,
  };

  return {
    organizationId: input.organizationId,
    findings,
    summary,
    amountsAtStake: {
      trainerPayments: (input.trainerPayments || []).reduce(
        (total, row) => total + toMoney(row?.amount),
        0,
      ),
      procure: findings
        .filter((row) => row.source === "clubs.procure")
        .reduce((total, row) => total + (row.amount || 0), 0),
    },
  };
};

/**
 * I candidati importabili, senza duplicati.
 *
 * La deduplica e per **codice fiscale** quando c'e, altrimenti per origine:
 * lo stesso allenatore puo comparire in `clubs.trainers` e fra i soci con due
 * identificativi diversi, e due persone del modulo per la stessa persona
 * spezzerebbero il progressivo annuo in due meta — ognuna delle quali
 * resterebbe sotto le soglie.
 */
export const listImportCandidates = (report: LegacyMigrationReport) => {
  const seen = new Set<string>();
  const candidates: NonNullable<LegacyFinding["candidate"]>[] = [];

  for (const finding of report.findings) {
    if (finding.outcome !== "MIGRATED" || !finding.candidate) continue;

    const key = finding.candidate.fiscalCode
      ? `cf:${finding.candidate.fiscalCode}`
      : `${finding.candidate.originType}:${finding.candidate.originId}`;

    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(finding.candidate);
  }

  return candidates;
};
