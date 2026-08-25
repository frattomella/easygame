/**
 * Tipi di socio.
 *
 * Erano tre stringhe scritte a mano dentro la dialog di modifica della scheda
 * socio, e da nessun'altra parte: il form «Nuovo socio» non li conosceva, e
 * per assegnare un tipo bisognava creare il socio e poi riaprirlo (Blocco 7,
 * punto 8). Stanno qui perche un elenco chiuso usato da due schermate deve
 * avere un posto solo.
 *
 * Il valore memorizzato e l'etichetta stessa: e cosi che l'archivio esistente
 * ha i soci gia dentro, e cambiarlo in un codice li renderebbe tutti «tipo
 * sconosciuto» senza guadagnare niente.
 */

export const MEMBER_TYPES = [
  "Socio Ordinario",
  "Socio Sostenitore",
  "Socio Onorario",
] as const;

export type MemberType = (typeof MEMBER_TYPES)[number];

export const DEFAULT_MEMBER_TYPE: MemberType = "Socio Ordinario";

/**
 * Il tipo di un socio, con il default per chi non ce l'ha.
 *
 * Non rifiuta i valori fuori elenco: un club puo avere in archivio tipi
 * scritti prima che l'elenco esistesse, e cancellarli sarebbe una perdita di
 * dato mascherata da normalizzazione.
 */
export const normalizeMemberType = (value?: string | null): string => {
  const trimmed = String(value || "").trim();
  return trimmed || DEFAULT_MEMBER_TYPE;
};

/** Tutti i tipi presenti, elenco chiuso piu quelli storici trovati nei dati. */
export const collectMemberTypes = (
  members: Array<{ type?: string | null }> = [],
): string[] => {
  const seen = new Map<string, string>();

  for (const type of MEMBER_TYPES) {
    seen.set(type.toLowerCase(), type);
  }

  for (const member of members) {
    const value = String(member?.type || "").trim();
    if (value && !seen.has(value.toLowerCase())) {
      seen.set(value.toLowerCase(), value);
    }
  }

  return Array.from(seen.values());
};
