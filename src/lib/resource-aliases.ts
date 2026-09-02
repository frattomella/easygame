/**
 * **I nomi diversi che portano alla stessa riga.**
 *
 * Sei risorse del registro generico sono in realta tre coppie piu tre: due
 * nomi, un solo delegato Prisma, la **stessa tabella**. I nomi storici
 * restano perche cambiarli vorrebbe dire cambiare contratto a schermate e
 * applicazioni che gia li usano — ed e una scelta, scritta caso per caso
 * accanto a `RESOURCE_CONFIG`.
 *
 * ## Perche questo modulo esiste
 *
 * Perche la scelta ha un costo che e stato pagato tre volte. Ogni guardia del
 * registro confronta una **stringa**: se ne nomina uno solo dei due, l'altro
 * e una porta di servizio verso la stessa riga, con le stesse colonne e senza
 * nessun controllo.
 *
 * Due revisioni indipendenti hanno misurato lo stesso caso, ognuna per conto
 * suo: `PATCH /api/v1/club_event_participants/:id` rispondeva «si scrive dal
 * suo dominio», `PATCH /api/v1/training_attendance/:id` rispondeva **200** e
 * scriveva in una sola chiamata presenza, risposta della famiglia e
 * convocazione — le tre colonne che ADR-0086 e ADR-0099 assegnano a tre
 * scrittori distinti. E la presenza e la colonna su cui si rendicontano i
 * contributi pubblici.
 *
 * ## La regola
 *
 * **Una guardia si scrive sul nome canonico, mai sull'alias.** Chi confronta
 * `resource` con una stringa passa prima di qui. Un test strutturale
 * (`tests/lib/alias-di-risorsa.test.mjs`) verifica che questa mappa copra
 * **tutti** i delegati condivisi di `RESOURCE_CONFIG`: aggiungere un settimo
 * alias senza dichiararlo qui fa fallire la prova.
 *
 * Non vale per le **proiezioni**: due nomi possono legittimamente restituire
 * forme diverse della stessa riga — e cio per cui `simplified_*` esiste. Vale
 * per le guardie: chi puo, su cosa, e dentro quale perimetro.
 */

/** Alias → nome canonico. La chiave e il nome storico, il valore quello vero. */
export const CANONICAL_RESOURCE_BY_ALIAS: Readonly<Record<string, string>> = {
  organizations: "clubs",
  simplified_athletes: "athletes",
  simplified_certificates: "medical_certificates",
  simplified_payments: "payments",
  simplified_notifications: "notifications",
  training_attendance: "club_event_participants",
};

/**
 * Il nome canonico di una risorsa: se stesso, quando non e un alias.
 *
 * Normalizza anche spazi e maiuscole, perche il nome arriva dal percorso di
 * una richiesta e non da una costante.
 */
export const canonicalResourceName = (resource: unknown): string => {
  const normalized = String(resource || "")
    .trim()
    .toLowerCase();

  return CANONICAL_RESOURCE_BY_ALIAS[normalized] || normalized;
};

/** Vero se i due nomi portano alla stessa tabella. */
export const isSameResource = (left: unknown, right: unknown) =>
  canonicalResourceName(left) === canonicalResourceName(right);
