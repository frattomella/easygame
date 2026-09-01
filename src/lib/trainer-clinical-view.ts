import { CLINICAL_ATHLETE_FIELDS } from "@/lib/health/permissions";
import {
  getMedicalCertificateAvailability,
  getMedicalCertificateAvailabilityLabel,
  type MedicalCertificateAvailability,
} from "@/lib/medical-certificates";

/**
 * **Cosa vede un allenatore di un certificato medico, e cosa no.**
 *
 * Il taglio e dichiarato da `src/lib/health/permissions.ts`: `clinical.status_read`
 * si, `clinical.read` no. Il server lo applica gia — la proiezione di
 * `resources.ts` toglie allergie, patologie, farmaci, gruppo sanguigno e il
 * file del certificato da `GET /api/v1/athletes` — e questo modulo e la
 * **stessa decisione dal lato della schermata**.
 *
 * **Perche serve un modulo e non un `if` nella pagina.** Il difetto D-4 non
 * era che mancasse un permesso: era che il permesso c'era **solo** nel
 * browser, in diciannove punti, e nessuno di quei diciannove poteva sapere se
 * gli altri diciotto la pensassero allo stesso modo. Qui la regola e una, e la
 * pagina non ha campi clinici da nascondere: **non li riceve**.
 *
 * L'altra meta della regola, ed e quella che si dimentica: quando il contenuto
 * e negato **non si mostrano i trattini**. Una scheda «Allergie: —» dice a chi
 * guarda che quel campo esiste e che potrebbe essere pieno, e a chi lo scrive
 * che l'allenatore lo vedrebbe. Non e nascondere, e sussurrare. La riga
 * semplicemente non c'e.
 */

export type TrainerClinicalGrant = {
  /** Vedere se il certificato e valido, in scadenza o scaduto. */
  statusRead: boolean;
  /** Vedere il contenuto clinico. Per l'allenatore e `false` per progetto. */
  read: boolean;
};

export type TrainerCertificateRow = {
  athleteId: string;
  athleteName: string;
  categoryName: string;
  /** Solo il giorno: e lo **stato**, non il documento. */
  expiryDate: string | null;
  availability: MedicalCertificateAvailability;
  availabilityLabel: string;
  /** Giorni alla scadenza. Negativo se gia scaduto, `null` se non registrato. */
  daysToExpiry: number | null;
};

export type TrainerSquadCertificatesView = {
  /**
   * Falso quando nemmeno lo **stato** e concesso. In quel caso la schermata
   * non disegna una tabella vuota: dice che la sezione non e disponibile.
   */
  allowed: boolean;
  rows: TrainerCertificateRow[];
  /** Quante righe chiedono un intervento: mancante, scaduto o in scadenza. */
  attentionCount: number;
};

const asText = (value: unknown) => String(value ?? "").trim();

const toIsoDay = (value: unknown) => {
  const raw = asText(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString().slice(0, 10);
};

/**
 * La scadenza registrata su un atleta.
 *
 * Le tre grafie convivono perche convivono in archivio: `data.medicalCertExpiry`
 * e la forma dell'anagrafica JSON, `medical_cert_expiry` quella della colonna,
 * `medicalCertExpiry` quella che alcune proiezioni appiattiscono. Nessuna delle
 * tre e contenuto clinico: sono lo stato, ed e per questo che
 * `CLINICAL_ATHLETE_FIELDS` non le contiene.
 */
export const getTrainerAthleteCertificateExpiry = (athlete: any) =>
  toIsoDay(
    athlete?.data?.medicalCertExpiry ??
      athlete?.medical_cert_expiry ??
      athlete?.medicalCertExpiry ??
      athlete?.data?.medical_cert_expiry ??
      null,
  );

const ATTENTION: readonly MedicalCertificateAvailability[] = [
  "missing",
  "expired",
  "expiring",
];

/**
 * I certificati del proprio gruppo, **limitati allo stato**.
 *
 * Ogni riga e costruita campo per campo da un elenco chiuso: non e uno spread
 * dell'anagrafica con qualche chiave tolta. La differenza conta, perche uno
 * spread con `delete` lascia passare il campo nuovo che qualcuno aggiungera
 * fra sei mesi, e un elenco chiuso no.
 */
export const buildTrainerSquadCertificates = ({
  athletes,
  clinical,
  now = new Date(),
  getDisplayName,
}: {
  athletes: any[];
  clinical: TrainerClinicalGrant;
  now?: Date;
  getDisplayName: (athlete: any) => string;
}): TrainerSquadCertificatesView => {
  if (!clinical?.statusRead) {
    return { allowed: false, rows: [], attentionCount: 0 };
  }

  const rows = (Array.isArray(athletes) ? athletes : []).map((athlete) => {
    const expiryDate = getTrainerAthleteCertificateExpiry(athlete);
    const availability = getMedicalCertificateAvailability(expiryDate, now);
    const daysToExpiry = expiryDate
      ? Math.ceil(
          (new Date(`${expiryDate}T00:00:00Z`).getTime() -
            Date.UTC(
              now.getUTCFullYear(),
              now.getUTCMonth(),
              now.getUTCDate(),
            )) /
            86_400_000,
        )
      : null;

    return {
      athleteId: asText(athlete?.id),
      athleteName: getDisplayName(athlete),
      categoryName:
        asText(athlete?.category_name || athlete?.data?.categoryName) ||
        "Senza categoria",
      expiryDate,
      availability,
      availabilityLabel: getMedicalCertificateAvailabilityLabel(availability),
      daysToExpiry,
    } satisfies TrainerCertificateRow;
  });

  return {
    allowed: true,
    rows: rows
      .filter((row) => ATTENTION.includes(row.availability))
      .sort((left, right) => {
        const leftDays = left.daysToExpiry ?? Number.NEGATIVE_INFINITY;
        const rightDays = right.daysToExpiry ?? Number.NEGATIVE_INFINITY;
        return leftDays - rightDays;
      }),
    attentionCount: rows.filter((row) => ATTENTION.includes(row.availability))
      .length,
  };
};

/**
 * Le chiavi che una riga di questa vista **non deve mai** contenere.
 *
 * Esiste per essere asserita da un test: un elenco chiuso protegge finche
 * qualcuno non ne aggiunge una fuori elenco, e l'unico modo di accorgersene e
 * chiedere a ogni riga se ha portato con se qualcosa che non doveva.
 */
export const TRAINER_FORBIDDEN_CLINICAL_KEYS: readonly string[] = [
  ...CLINICAL_ATHLETE_FIELDS,
  "file_url",
  "fileUrl",
  "attachment_id",
  "attachmentId",
  "doctor",
  "doctor_name",
];
