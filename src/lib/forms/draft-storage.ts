import type { FormField } from "./model";

/**
 * **Salva e riprendi**, per chi compila un modulo dal telefono.
 *
 * **Il difetto che chiude (W6-48).** Compilare un modulo pubblico e premere
 * F5 — o ricevere una telefonata, o cercare il codice fiscale in un'altra
 * app — perdeva tutto. Per un'iscrizione compilata in piedi, con una mano
 * sola, e la differenza fra una pratica inviata e una abbandonata.
 *
 * **Perche nel browser e non sul server.** Una bozza lato server sarebbe
 * un'entita nuova: una riga senza autore autenticato (il modulo pubblico non
 * ha sessione), con un ciclo di vita, una retention e un diritto di
 * cancellazione da dichiarare — cioe dati personali di un minore conservati
 * da noi prima ancora che qualcuno decida di inviarli. Nel browser di chi
 * compila la bozza resta di chi compila.
 *
 * **I tre limiti, dichiarati qui perche sono parte del contratto.**
 *
 * 1. **i file non si salvano.** Non sono serializzabili, e non e solo una
 *    difficolta tecnica: tenere in archivio locale la carta d'identita di un
 *    minore per giorni sarebbe peggio del problema che risolviamo. Chi
 *    riprende deve riallegare, e la schermata glielo dice;
 * 2. **i consensi e le firme non si salvano.** Una casella che dichiara un
 *    consenso e una firma sono **atti**, non dati: ripristinarli
 *    significherebbe presentare come gia dato un consenso che nessuno ha dato
 *    in questa sessione. Vanno rifatti, sempre;
 * 3. **la bozza scade dopo un giorno e si cancella all'invio riuscito.** Un
 *    modulo si compila dal telefono, e un telefono si presta: quello che resta
 *    in archivio locale e comunque un'anagrafica, e non deve restarci oltre il
 *    tempo in cui serve davvero.
 */

/** La versione della forma salvata: cambiarla invalida le bozze vecchie. */
const STORAGE_PREFIX = "easygame:form-draft:v1:";

/** Un giorno. Vedi il limite 3 qui sopra. */
export const FORM_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type FormDraft = {
  savedAt: number;
  answers: Record<string, unknown>;
  respondentName: string;
  respondentEmail: string;
};

/**
 * I campi le cui risposte **non** finiscono nella bozza.
 *
 * Non e un elenco di tipi «delicati»: e l'elenco degli atti. Una firma e un
 * consenso si compiono, non si ricordano.
 */
export const isDraftableField = (field: FormField) => {
  if (field.type === "signature") return false;
  if (field.type === "file_upload") return false;
  if (field.type === "checkbox" && field.consentKey) return false;
  return true;
};

/**
 * La chiave sotto cui vive la bozza.
 *
 * Lo slug pubblico ci sta dentro perche due moduli aperti nello stesso
 * browser sono due bozze; il contesto (l'atleta, nel rinnovo) perche due
 * figli sono due pratiche diverse dello stesso modulo.
 */
export const formDraftKey = (slug: string, context = "") =>
  `${STORAGE_PREFIX}${String(context || "public").trim()}:${String(slug || "").trim()}`;

/**
 * L'archivio locale, quando c'e.
 *
 * Puo mancare o rifiutare di scrivere — navigazione privata, quota piena,
 * impostazioni che bloccano i dati dei siti — e in tutti quei casi il modulo
 * deve funzionare come prima. Nessun `throw` esce da questo file.
 */
const store = (): Storage | null => {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
};

/**
 * Cio che va salvato, ripulito di cio che non deve essere salvato.
 *
 * Il filtro sta **qui** e non nel componente: un secondo punto in cui
 * decidere «questo si puo scrivere» e un secondo punto in cui un giorno
 * qualcuno dimentichera un consenso.
 */
export const buildDraftAnswers = (
  fields: FormField[],
  answers: Record<string, unknown>,
): Record<string, unknown> => {
  const salvabili = new Set(
    fields.filter(isDraftableField).map((field) => field.id),
  );

  const risultato: Record<string, unknown> = {};
  for (const [fieldId, value] of Object.entries(answers || {})) {
    if (!salvabili.has(fieldId)) continue;
    if (value === undefined || value === null || value === "") continue;
    risultato[fieldId] = value;
  }

  return risultato;
};

/** Vero se la bozza contiene qualcosa che valga la pena riprendere. */
const isWorthKeeping = (draft: FormDraft) =>
  Object.keys(draft.answers).length > 0 ||
  Boolean(draft.respondentName) ||
  Boolean(draft.respondentEmail);

export const saveFormDraft = (
  key: string,
  fields: FormField[],
  input: {
    answers: Record<string, unknown>;
    respondentName: string;
    respondentEmail: string;
  },
) => {
  const archivio = store();
  if (!archivio) return;

  const draft: FormDraft = {
    savedAt: Date.now(),
    answers: buildDraftAnswers(fields, input.answers),
    respondentName: String(input.respondentName || ""),
    respondentEmail: String(input.respondentEmail || ""),
  };

  try {
    if (!isWorthKeeping(draft)) {
      archivio.removeItem(key);
      return;
    }
    archivio.setItem(key, JSON.stringify(draft));
  } catch {
    /* Un archivio pieno o negato non deve impedire di compilare il modulo. */
  }
};

/**
 * La bozza, se c'e ed e ancora valida.
 *
 * Una bozza scaduta non si restituisce **e si cancella**: lasciarla li
 * significherebbe tenere un'anagrafica nel browser di qualcuno finche non
 * riapre quel modulo, che potrebbe essere mai.
 */
export const readFormDraft = (
  key: string,
  now = Date.now(),
): FormDraft | null => {
  const archivio = store();
  if (!archivio) return null;

  try {
    const grezzo = archivio.getItem(key);
    if (!grezzo) return null;

    const record = JSON.parse(grezzo) as Partial<FormDraft> | null;
    const savedAt = Number(record?.savedAt) || 0;
    if (!savedAt || now - savedAt > FORM_DRAFT_MAX_AGE_MS) {
      archivio.removeItem(key);
      return null;
    }

    const draft: FormDraft = {
      savedAt,
      answers:
        record?.answers && typeof record.answers === "object"
          ? (record.answers as Record<string, unknown>)
          : {},
      respondentName: String(record?.respondentName || ""),
      respondentEmail: String(record?.respondentEmail || ""),
    };

    return isWorthKeeping(draft) ? draft : null;
  } catch {
    return null;
  }
};

export const clearFormDraft = (key: string) => {
  const archivio = store();
  if (!archivio) return;
  try {
    archivio.removeItem(key);
  } catch {
    /* Niente da fare, e niente da dire a chi ha appena inviato. */
  }
};
