import { apiRequest } from "@/lib/api/client";
import { getClubAthletes } from "@/lib/simplified-db";

/**
 * I dati che la Dashboard Club mostra **sopra la piega**, in un colpo solo.
 *
 * **La misura che ha motivato questo modulo** (RC Fix 1, punto 11;
 * `npm run measure:dashboard`, 200 atleti):
 *
 *     richieste  giri di rete  kB      duplicati
 *     29         10            1.960   clubs x9, simplified_athletes x6,
 *                                      medical_certificates x2, athletes x2
 *
 * Non era una query lenta: erano **dieci attese in fila** e lo stesso
 * archivio chiesto quattro volte.
 *
 * - `dashboard/page.tsx` caricava appuntamenti, promemoria, partite e atleti
 *   con quattro `await` **consecutivi**, dopo altri due per il club;
 * - `MetricsOverview` rileggeva tutti gli atleti con il `data` intero — che
 *   contiene anagrafica, tutori, rate e documenti — solo per **contare**
 *   quelli attivi, e ne faceva una seconda identica il cui risultato non
 *   veniva usato da nessuno;
 * - `UpcomingTrainings` rileggeva gli atleti una terza volta;
 * - `CertificationAlerts` ne leggeva una quarta, piu i certificati;
 * - due dei tre componenti aspettavano 300 ms di debounce **prima** di
 *   cominciare, anche alla prima apertura, quando non c'e niente da
 *   accorpare.
 *
 * Qui c'e una lettura sola, in parallelo, con la proiezione giusta:
 *
 * - **una** richiesta per la riga del club, che porta gia appuntamenti,
 *   promemoria, partite, categorie e allenamenti: sono tutte colonne JSON
 *   della stessa riga, chiederle separatamente era chiedere la stessa riga
 *   cinque volte;
 * - **una** lettura degli atleti in proiezione `summary` — la dashboard
 *   mostra conteggi e avvisi, non apre nessun documento;
 * - **una** dei certificati.
 *
 * Il modulo non tocca il DOM e non conosce React: e testabile, ed e misurato
 * da `scripts/measure-dashboard-performance.mjs`.
 */

export type DashboardClubRow = {
  id: string;
  name: string;
  logoUrl: string | null;
  appointments: any[];
  notes: any[];
  matches: any[];
  categories: any[];
  trainings: any[];
  settings: Record<string, any>;
};

export type DashboardCertificate = {
  id: string;
  athleteId: string;
  type: string;
  expiryDate: string | null;
};

export type ClubDashboardOverview = {
  club: DashboardClubRow | null;
  athletes: any[];
  certificates: DashboardCertificate[];
};

/**
 * Le colonne della riga del club che servono alla dashboard.
 *
 * Sono cinque collezioni JSON piu l'identita. Una richiesta sola: erano
 * cinque, tutte sulla stessa riga.
 */
export const DASHBOARD_CLUB_FIELDS = [
  "logo_url",
  "appointments",
  "secretariat_notes",
  "matches",
  "categories",
  "trainings",
];

const asArray = (value: unknown) => (Array.isArray(value) ? value : []);

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

export const readDashboardClubRow = async (
  clubId: string,
): Promise<DashboardClubRow | null> => {
  const params = new URLSearchParams({
    id: clubId,
    fields: DASHBOARD_CLUB_FIELDS.join(","),
  });

  const response = await apiRequest<any[]>(`/api/v1/clubs?${params.toString()}`);
  if (response.error) {
    return null;
  }

  const record = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!record) return null;

  return {
    id: String(record.id || clubId),
    name: String(record.name || "Club"),
    logoUrl: record.logo_url || null,
    appointments: asArray(record.appointments),
    notes: asArray(record.secretariat_notes),
    matches: asArray(record.matches),
    categories: asArray(record.categories),
    trainings: asArray(record.trainings),
    settings: asRecord(record.settings),
  };
};

export const readClubMedicalCertificates = async (
  clubId: string,
): Promise<DashboardCertificate[]> => {
  const params = new URLSearchParams({
    organization_id: clubId,
    select: "id,athlete_id,type,expiry_date",
  });

  const response = await apiRequest<any[]>(
    `/api/v1/medical_certificates?${params.toString()}`,
  );
  if (response.error || !Array.isArray(response.data)) {
    return [];
  }

  return response.data.map((row: any) => ({
    id: String(row?.id || ""),
    athleteId: String(row?.athlete_id || ""),
    type: String(row?.type || "").trim() || "Certificato medico",
    expiryDate: row?.expiry_date ? String(row.expiry_date) : null,
  }));
};

/** Tutto quello che la dashboard mostra all'apertura, in un giro di rete. */
export const loadClubDashboardOverview = async (
  clubId: string,
): Promise<ClubDashboardOverview> => {
  if (!clubId) {
    return { club: null, athletes: [], certificates: [] };
  }

  const [club, athletes, certificates] = await Promise.all([
    readDashboardClubRow(clubId),
    /*
      `summary` e la differenza fra 1,9 MB e poche decine di kB su 200 atleti:
      la dashboard conta e avvisa, non apre schede.
    */
    getClubAthletes(clubId, { view: "summary" }),
    readClubMedicalCertificates(clubId),
  ]);

  return {
    club,
    athletes: asArray(athletes),
    certificates,
  };
};

// --- cio che si ricava, senza altre letture ---------------------------------

const startOfDay = (value: unknown) => {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const compareByDateThenTime = (
  left: { date: Date; time?: string },
  right: { date: Date; time?: string },
) =>
  left.date.getTime() - right.date.getTime() ||
  String(left.time || "").localeCompare(String(right.time || ""));

export const selectUpcomingAppointments = (
  appointments: any[],
  today: Date = new Date(),
) => {
  const reference = startOfDay(today) || new Date();

  return asArray(appointments)
    .map((appointment) => {
      const date = startOfDay(appointment?.date);
      return date ? { ...appointment, date } : null;
    })
    .filter((appointment): appointment is any => Boolean(appointment))
    .filter((appointment) => appointment.date >= reference)
    .sort(compareByDateThenTime);
};

export const selectActiveNotes = (notes: any[], today: Date = new Date()) => {
  const reference = startOfDay(today) || new Date();

  return asArray(notes)
    .filter((note) => {
      if (!note?.expiryDate) return true;
      const expiry = startOfDay(note.expiryDate);
      return !expiry || expiry >= reference;
    })
    .map((note) => ({
      ...note,
      date: new Date(String(note?.date || "")),
      expiryDate: note?.expiryDate ? new Date(String(note.expiryDate)) : undefined,
    }));
};

export const selectUpcomingMatches = (matches: any[], today: Date = new Date()) => {
  const reference = startOfDay(today) || new Date();

  return asArray(matches)
    .map((match) => {
      const date = startOfDay(match?.date);
      return date ? { ...match, date } : null;
    })
    .filter((match): match is any => Boolean(match))
    .filter((match) => match.date >= reference && match.status !== "cancelled")
    .sort(compareByDateThenTime);
};

export type DashboardMetrics = {
  totalAthletes: number;
  activeCategories: number;
  upcomingTrainings: number;
  expiringCertificates: number;
  expiredCertificates: number;
};

/** Giorni entro i quali un certificato si considera in scadenza. */
export const CERTIFICATE_WARNING_DAYS = 30;

const athleteIsActive = (athlete: any) => {
  const status = String(
    athlete?.data?.status || athlete?.status || "active",
  ).toLowerCase();
  return status === "active";
};

export const buildDashboardMetrics = ({
  club,
  athletes,
  certificates,
  today = new Date(),
}: {
  club: DashboardClubRow | null;
  athletes: any[];
  certificates: DashboardCertificate[];
  today?: Date;
}): DashboardMetrics => {
  const reference = startOfDay(today) || new Date();
  const horizon = new Date(reference);
  horizon.setDate(horizon.getDate() + CERTIFICATE_WARNING_DAYS);

  const upcomingTrainings = asArray(club?.trainings).filter((training: any) => {
    const date = startOfDay(training?.date);
    if (!date) return false;
    const status = String(training?.status || "").toLowerCase();
    return (
      date >= reference &&
      date <= horizon &&
      status !== "cancelled" &&
      status !== "annullato"
    );
  }).length;

  let expiring = 0;
  let expired = 0;
  for (const certificate of certificates) {
    const expiry = startOfDay(certificate.expiryDate);
    if (!expiry) continue;
    if (expiry < reference) expired += 1;
    else if (expiry <= horizon) expiring += 1;
  }

  return {
    totalAthletes: asArray(athletes).filter(athleteIsActive).length,
    activeCategories: asArray(club?.categories).length,
    upcomingTrainings,
    expiringCertificates: expiring,
    expiredCertificates: expired,
  };
};

export type DashboardCertificateAlert = {
  id: string;
  athleteId: string;
  certificateId: string | null;
  athleteName: string;
  certificateType: string;
  expiryDate: string;
  status: "expired" | "expiring" | "missing";
};

const athleteName = (athlete: any) =>
  [athlete?.last_name || athlete?.lastName, athlete?.first_name || athlete?.firstName]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ") ||
  String(athlete?.name || "").trim() ||
  "Atleta";

/**
 * Gli avvisi sui certificati, dagli stessi atleti gia caricati.
 *
 * Prima li ricavava `CertificationAlerts` da due letture proprie — una
 * dell'anagrafica atleti e una dei certificati con join — che duplicavano
 * quelle appena fatte dalla pagina.
 */
export const buildCertificateAlerts = ({
  athletes,
  certificates,
  today = new Date(),
}: {
  athletes: any[];
  certificates: DashboardCertificate[];
  today?: Date;
}): DashboardCertificateAlert[] => {
  const reference = startOfDay(today) || new Date();
  const horizon = new Date(reference);
  horizon.setDate(horizon.getDate() + CERTIFICATE_WARNING_DAYS);

  const byAthlete = new Map<string, DashboardCertificate>();
  for (const certificate of certificates) {
    if (!certificate.athleteId) continue;
    const current = byAthlete.get(certificate.athleteId);
    const currentExpiry = startOfDay(current?.expiryDate)?.getTime() ?? -Infinity;
    const candidateExpiry = startOfDay(certificate.expiryDate)?.getTime() ?? -Infinity;
    if (!current || candidateExpiry > currentExpiry) {
      byAthlete.set(certificate.athleteId, certificate);
    }
  }

  const alerts: DashboardCertificateAlert[] = [];

  for (const athlete of asArray(athletes)) {
    const id = String(athlete?.id || "").trim();
    if (!id || !athleteIsActive(athlete)) continue;

    const certificate = byAthlete.get(id);
    const expiry = startOfDay(certificate?.expiryDate);

    if (!certificate || !expiry) {
      alerts.push({
        id: `missing-${id}`,
        athleteId: id,
        certificateId: certificate?.id || null,
        athleteName: athleteName(athlete),
        certificateType: certificate?.type || "Certificato medico",
        expiryDate: "",
        status: "missing",
      });
      continue;
    }

    if (expiry < reference) {
      alerts.push({
        id: certificate.id || `expired-${id}`,
        athleteId: id,
        certificateId: certificate.id || null,
        athleteName: athleteName(athlete),
        certificateType: certificate.type,
        expiryDate: certificate.expiryDate || "",
        status: "expired",
      });
      continue;
    }

    if (expiry <= horizon) {
      alerts.push({
        id: certificate.id || `expiring-${id}`,
        athleteId: id,
        certificateId: certificate.id || null,
        athleteName: athleteName(athlete),
        certificateType: certificate.type,
        expiryDate: certificate.expiryDate || "",
        status: "expiring",
      });
    }
  }

  /*
    Scaduti prima, poi in scadenza, poi mancanti: e l'ordine in cui una
    segreteria li affronta.
  */
  const weight = { expired: 0, expiring: 1, missing: 2 } as const;
  return alerts.sort(
    (left, right) =>
      weight[left.status] - weight[right.status] ||
      left.expiryDate.localeCompare(right.expiryDate) ||
      left.athleteName.localeCompare(right.athleteName),
  );
};
