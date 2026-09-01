import { normalizeAccessRole } from "@/lib/access-roles";
import { roleHasPermission } from "@/lib/permissions/catalog";

/**
 * **Chi vede lo stato di un certificato non vede per cio stesso il contenuto
 * clinico di un minore.**
 *
 * Il difetto (D-4, gap G-33) non era «manca un permesso»: era peggio, perche
 * sembrava esserci. `medical_certificates` e `simplified_certificates` stanno
 * in `TRAINER_READ_RESOURCES` accanto ad `athletes`, e il flag
 * `viewMedicalStatus` di `trainer-dashboard-permissions.ts` nasce **`true`** e
 * compare in diciannove punti, **tutti dentro `src/components/**`**: zero
 * occorrenze sotto `src/lib/server/**` e zero sotto `src/app/api/**`.
 * Nascondeva le schede — allergie, farmaci, gruppo sanguigno, BLSD — mentre il
 * dato usciva comunque da `GET /api/v1/athletes`.
 *
 * Viola ADR-0058 alla lettera: *«uno stato che si ricava non si scrive, e la
 * guardia sta in ogni strada che porta al campo»*. E cade sotto ADR-0019, che
 * dichiara privacy e audit bloccanti per la produzione: qui si tratta di dati
 * sanitari di minori.
 *
 * **Il taglio, e perche e quello giusto.**
 *
 * - **Lo stato** — valido, in scadenza, scaduto, mancante, con la data —
 *   risponde alla domanda operativa «questo atleta puo scendere in campo?».
 *   Serve all'allenatore, e gli resta.
 * - **Il contenuto** — allergie, patologie, farmaci, gruppo sanguigno, note
 *   mediche, il file del certificato — risponde a una domanda che l'allenatore
 *   non deve porsi per fare il proprio lavoro. Default **negato**.
 *
 * Il taglio non e inventato: e esattamente quello che l'interfaccia gia
 * distingue, con il badge di scadenza da una parte e le schede
 * allergie/farmaci/BLSD dall'altra. La differenza e che prima lo distingueva
 * **il browser**, e da adesso lo distingue il server.
 *
 * **Il legame vale piu del ruolo.** Un genitore e un atleta leggono il proprio
 * fascicolo per legame — `⛓` nella matrice della Wave 5 — e non passano da
 * questo modulo: le loro rotte risolvono il legame e sono l'unico gate. Qui si
 * decide cosa vede chi guarda il fascicolo **di qualcun altro**.
 */

export type HealthPermission =
  | "clinical.status_read"
  | "clinical.read"
  | "clinical.manage";

export const HEALTH_PERMISSIONS: readonly HealthPermission[] = [
  "clinical.status_read",
  "clinical.read",
  "clinical.manage",
] as const;

export const HEALTH_PERMISSION_LABELS: Record<HealthPermission, string> = {
  "clinical.status_read":
    "Vedere se il certificato medico e valido, in scadenza o scaduto",
  "clinical.read":
    "Vedere il contenuto clinico: allergie, patologie, farmaci, gruppo sanguigno e il file del certificato",
  "clinical.manage": "Registrare e modificare certificati e dati sanitari",
};

/**
 * **Perche collaborator e staff hanno il contenuto e trainer no.**
 *
 * Segreteria e collaboratori sono le persone che il certificato lo **ricevono,
 * lo protocollano e lo sollecitano**: senza il contenuto non possono fare il
 * lavoro per cui il club le paga. L'allenatore no: il suo lavoro finisce alla
 * domanda «puo giocare», e quella la risponde lo stato.
 *
 * Finche non esiste il meccanismo di concessione per singolo operatore
 * (Wave 6, con i ruoli personalizzati) non c'e un modo di restituire il
 * contenuto a un allenatore. E una scelta deliberata: **il default su un dato
 * sanitario di un minore e negato**, e un default sbagliato non si compensa
 * con una casella di spunta nel browser.
 *
 * **La matrice vive nel catalogo unico** (`src/lib/permissions/catalog.ts`,
 * W5-70): una chiave che nessuna schermata puo elencare non e configurabile, e
 * un motore di ruoli personalizzati non avrebbe niente da leggere. Questo
 * modulo resta il proprietario del **dominio** — cosa e stato e cosa e
 * contenuto — e non tiene una seconda copia della tabella dei ruoli.
 */
export const listHealthPermissions = (
  role: string | null | undefined,
): readonly HealthPermission[] => {
  const normalized = normalizeAccessRole(role);
  if (!normalized) return [];

  return HEALTH_PERMISSIONS.filter((permission) =>
    roleHasPermission(normalized, permission),
  );
};

export const hasHealthPermission = (
  role: string | null | undefined,
  permission: HealthPermission,
) => roleHasPermission(role, permission);

/**
 * Solleva se il ruolo non ha il permesso.
 *
 * Il messaggio contiene «Accesso negato» perche il route handler lo mappi su
 * 403: e la convenzione del repository, e non e negoziabile.
 */
export const assertHealthPermission = (
  role: string | null | undefined,
  permission: HealthPermission,
) => {
  if (!hasHealthPermission(role, permission)) {
    throw new Error(
      `Accesso negato: il ruolo attivo non puo ${HEALTH_PERMISSION_LABELS[permission].toLowerCase()}`,
    );
  }
};

/**
 * I campi di `athletes.data` che sono **contenuto clinico**, non stato.
 *
 * L'elenco e chiuso e sta qui, in un modulo puro, perche la proiezione lato
 * server e la schermata devono nascondere **le stesse cose**: quando erano due
 * elenchi, uno dei due e rimasto indietro per undici mesi.
 *
 * `medicalCertificateExpiry` e i suoi alias **non** sono in elenco: sono lo
 * stato, ed e cio che l'allenatore deve continuare a vedere.
 */
export const CLINICAL_ATHLETE_FIELDS: readonly string[] = [
  "allergies",
  "allergie",
  "bloodType",
  "blood_type",
  "bloodGroup",
  "blood_group",
  "chronicDiseases",
  "chronic_diseases",
  "patologie",
  "disabilities",
  "medications",
  "medicinali",
  "medicalNotes",
  "medical_notes",
  "noteMediche",
  "healthNotes",
  "health_notes",
  "blsd",
  "firstAid",
  "first_aid",
  "fireSafety",
  "fire_safety",
  "dietaryRestrictions",
  "dietary_restrictions",
] as const;

const CLINICAL_ATHLETE_FIELD_SET = new Set(CLINICAL_ATHLETE_FIELDS);

/**
 * Toglie il contenuto clinico da un oggetto `data` di anagrafica.
 *
 * Non lo azzera e non lo maschera con una stringa: lo **toglie**. Un campo
 * presente e vuoto dice comunque che quel campo esiste, e un client scritto
 * male lo riscriverebbe a vuoto sul primo salvataggio.
 */
export const stripClinicalAthleteFields = (data: unknown) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }

  const source = data as Record<string, unknown>;
  let toccato = false;
  const next: Record<string, unknown> = {};

  for (const [chiave, valore] of Object.entries(source)) {
    if (CLINICAL_ATHLETE_FIELD_SET.has(chiave)) {
      toccato = true;
      continue;
    }
    next[chiave] = valore;
  }

  return toccato ? next : source;
};

/**
 * I campi di un certificato medico che sono **contenuto**, non stato.
 *
 * Restano fuori dall'elenco `expiry_date`, `issue_date`, `status` e
 * `athlete_id`: sono la risposta a «puo scendere in campo», che l'allenatore
 * deve avere.
 */
export const CLINICAL_CERTIFICATE_FIELDS: readonly string[] = [
  "attachment_id",
  "attachment_url",
  "certificate_url",
  "data_base64",
  "doctor",
  "doctor_name",
  "file_name",
  "file_url",
  "notes",
  "public_url",
  "result",
  "sport_type",
] as const;

const CLINICAL_CERTIFICATE_FIELD_SET = new Set(CLINICAL_CERTIFICATE_FIELDS);

export const stripClinicalCertificateFields = (
  record: Record<string, any>,
) => {
  const next: Record<string, any> = {};

  for (const [chiave, valore] of Object.entries(record)) {
    if (CLINICAL_CERTIFICATE_FIELD_SET.has(chiave)) {
      continue;
    }
    next[chiave] =
      chiave === "data" ? stripClinicalAthleteFields(valore) : valore;
  }

  return next;
};
