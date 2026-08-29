/**
 * Da un elenco di posizioni all'**insieme canonico dei destinatari**.
 *
 * E il pezzo che cinque funzioni diverse chiedevano ciascuna per conto proprio:
 * solleciti, automazioni, comunicazione massiva, bacheca e invito a rispondere.
 * Prima della Wave 2 ne esistevano due versioni con **politiche diverse** — i
 * promemoria sui certificati raggiungevano solo chi ha un account nel club, il
 * sollecito degli insoluti anche chi ha solo un indirizzo — e la differenza non
 * era una scelta: era una divergenza.
 *
 * **Le due regole che governano tutto.**
 *
 * 1. **Una email, un messaggio.** La stessa email associata a due atleti riceve
 *    **un** messaggio che elenca entrambe le posizioni. Due messaggi allo stesso
 *    indirizzo per due figli sono il difetto che una famiglia nota per prima, e
 *    la chiave e l'indirizzo — non l'account, che un tutore puo non avere.
 * 2. **Chi non si raggiunge compare, con il motivo.** Un invio che non
 *    raggiunge nessuno **non e un successo**: e il difetto che il sollecito di
 *    Wave 1 esisteva per chiudere, e che qui vale per ogni canale.
 *
 * Modulo **puro**: nessun Prisma, nessuna rete, nessun DOM.
 */

/**
 * Perche un destinatario resta fuori. **Enum chiusa**: un motivo nuovo si
 * dichiara qui, non si inventa nel punto in cui serve.
 *
 * - `no_guardian` — l'atleta non ha nessun tutore in anagrafica;
 * - `no_email` — il tutore c'e ma non porta nessun indirizzo;
 * - `no_account` — dichiara un account collegato che in **questo** club non
 *   esiste, e non c'e nessun indirizzo da cui recuperarlo. E diverso da
 *   `no_email`: la segreteria deve sapere se le manca un dato o se il
 *   collegamento e da rifare;
 * - `not_active` — l'anagrafica e disattivata: resta nello storico, non nel
 *   pubblico di un messaggio;
 * - `duplicate` — lo stesso indirizzo compare due volte **sulla stessa
 *   persona**. Fra persone diverse non e un'esclusione: e una fusione;
 * - `already_sent` — gia raggiunto per questa occorrenza, secondo il registro
 *   delle consegne.
 */
export type AudienceExclusionReason =
  | "no_guardian"
  | "no_email"
  | "no_account"
  | "not_active"
  | "duplicate"
  | "already_sent";

export const AUDIENCE_EXCLUSION_LABELS: Record<AudienceExclusionReason, string> =
  {
    no_guardian: "Nessun tutore in anagrafica",
    no_email: "Nessun indirizzo email",
    no_account: "Account collegato non trovato in questo club",
    not_active: "Anagrafica non attiva",
    duplicate: "Indirizzo gia presente per questa persona",
    already_sent: "Gia raggiunto per questo messaggio",
  };

/** Un contatto candidato, cosi come lo legge l'anagrafica. */
export type AudienceContact = {
  guardianId: string;
  guardianName: string;
  /** Gia normalizzata in minuscolo, oppure vuota. */
  email: string;
  /** L'account collegato **verificato in questo club**, oppure `null`. */
  userId: string | null;
  /** Vero quando l'anagrafica dichiara un account che qui non risulta. */
  declaresMissingAccount?: boolean;
};

/** La persona a cui il messaggio si riferisce. */
export type AudienceSubject = {
  athleteId: string;
  athleteName: string;
  active?: boolean;
  contacts: AudienceContact[];
  /** Dati liberi che il chiamante vuole ritrovare accanto alla posizione. */
  context?: Record<string, unknown>;
};

export type AudiencePosition = {
  athleteId: string;
  athleteName: string;
  guardianId: string;
  guardianName: string;
  context?: Record<string, unknown>;
};

export type AudienceRecipient = {
  /** L'indirizzo normalizzato: e la chiave del registro delle consegne. */
  key: string;
  email: string;
  /** Il nome con cui salutarlo: quello del primo contatto che lo porta. */
  name: string;
  /** L'account collegato, quando ce n'e uno. Decide il canale in-app. */
  userId: string | null;
  /** Le persone rappresentate. Un messaggio solo, N posizioni. */
  positions: AudiencePosition[];
};

export type AudienceExclusion = {
  athleteId: string;
  athleteName: string;
  guardianId: string | null;
  guardianName: string | null;
  email: string | null;
  reason: AudienceExclusionReason;
};

export type AudienceSet = {
  recipients: AudienceRecipient[];
  exclusions: AudienceExclusion[];
  counts: {
    recipients: number;
    positions: number;
    excluded: number;
    /** Gli atleti che non producono **nessun** destinatario raggiungibile. */
    unreachableSubjects: number;
  };
};

/** `Mario.Rossi@Example.COM ` → `mario.rossi@example.com`. */
export const normalizeRecipientKey = (email: unknown) =>
  String(email ?? "")
    .trim()
    .toLowerCase();

/**
 * Costruisce l'insieme canonico.
 *
 * `alreadySent` sono le chiavi gia presenti nel registro delle consegne per
 * questa occorrenza: entrano come esclusione con il motivo, **non** come
 * silenzio. Chi guarda l'anteprima deve capire perche un indirizzo che si
 * aspettava non c'e.
 */
export const buildAudienceSet = ({
  subjects,
  alreadySent = new Set<string>(),
}: {
  subjects: readonly AudienceSubject[];
  alreadySent?: ReadonlySet<string>;
}): AudienceSet => {
  const byKey = new Map<string, AudienceRecipient>();
  const exclusions: AudienceExclusion[] = [];
  let unreachableSubjects = 0;

  for (const subject of subjects) {
    const athleteId = String(subject.athleteId || "");
    const athleteName = String(subject.athleteName || "") || "Atleta";

    if (subject.active === false) {
      exclusions.push({
        athleteId,
        athleteName,
        guardianId: null,
        guardianName: null,
        email: null,
        reason: "not_active",
      });
      unreachableSubjects += 1;
      continue;
    }

    if (subject.contacts.length === 0) {
      exclusions.push({
        athleteId,
        athleteName,
        guardianId: null,
        guardianName: null,
        email: null,
        reason: "no_guardian",
      });
      unreachableSubjects += 1;
      continue;
    }

    /*
      Il duplicato si conta **per persona**, non globalmente: due tutori dello
      stesso atleta con lo stesso indirizzo sono una ripetizione in anagrafica
      e vanno dette; lo stesso indirizzo su due atleti e una **famiglia**, e
      dirla come duplicato farebbe sembrare un problema cio che e la ragione
      per cui questo modulo esiste.
    */
    const seenForSubject = new Set<string>();
    let reachedForSubject = 0;

    for (const contact of subject.contacts) {
      const key = normalizeRecipientKey(contact.email);

      if (!key) {
        exclusions.push({
          athleteId,
          athleteName,
          guardianId: contact.guardianId || null,
          guardianName: contact.guardianName || null,
          email: null,
          reason: contact.declaresMissingAccount ? "no_account" : "no_email",
        });
        continue;
      }

      if (seenForSubject.has(key)) {
        exclusions.push({
          athleteId,
          athleteName,
          guardianId: contact.guardianId || null,
          guardianName: contact.guardianName || null,
          email: key,
          reason: "duplicate",
        });
        continue;
      }
      seenForSubject.add(key);

      if (alreadySent.has(key)) {
        exclusions.push({
          athleteId,
          athleteName,
          guardianId: contact.guardianId || null,
          guardianName: contact.guardianName || null,
          email: key,
          reason: "already_sent",
        });
        continue;
      }

      reachedForSubject += 1;

      const position: AudiencePosition = {
        athleteId,
        athleteName,
        guardianId: contact.guardianId || "",
        guardianName: contact.guardianName || "",
        ...(subject.context ? { context: subject.context } : {}),
      };

      const existing = byKey.get(key);

      if (existing) {
        existing.positions.push(position);
        /*
          Un account trovato su una seconda posizione vale per tutte: e la
          stessa persona, e il canale in-app o c'e o non c'e.
        */
        if (!existing.userId && contact.userId) existing.userId = contact.userId;
        continue;
      }

      byKey.set(key, {
        key,
        email: key,
        name: contact.guardianName || "",
        userId: contact.userId || null,
        positions: [position],
      });
    }

    if (reachedForSubject === 0) unreachableSubjects += 1;
  }

  /*
    L'ordine e deterministico e non e un dettaglio estetico: l'anteprima e
    l'invio devono elencare le stesse persone nello stesso ordine, altrimenti
    confrontarli a occhio e impossibile e i test diventano instabili.
  */
  const recipients = [...byKey.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );

  for (const recipient of recipients) {
    recipient.positions.sort((left, right) =>
      left.athleteId.localeCompare(right.athleteId),
    );
  }

  exclusions.sort(
    (left, right) =>
      left.athleteId.localeCompare(right.athleteId) ||
      String(left.email || "").localeCompare(String(right.email || "")) ||
      left.reason.localeCompare(right.reason),
  );

  return {
    recipients,
    exclusions,
    counts: {
      recipients: recipients.length,
      positions: recipients.reduce(
        (total, recipient) => total + recipient.positions.length,
        0,
      ),
      excluded: exclusions.length,
      unreachableSubjects,
    },
  };
};
