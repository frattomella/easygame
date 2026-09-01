export type ParentDashboardData = {
  user: {
    id: string;
    email: string;
    name: string;
  };
  club: {
    id: string;
    name: string;
    logo_url?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
    address?: string | null;
    city?: string | null;
    province?: string | null;
    /**
     * La stagione attiva del club, gia risolta dal server (W6-09).
     *
     * Prima l'area famiglia non la risolveva affatto: l'etichetta arrivava dal
     * `localStorage`, e per un tutore senza riga di membership quel
     * `localStorage` non l'aveva mai vista.
     */
    activeSeasonId?: string | null;
    activeSeasonLabel?: string | null;
    /**
     * L'indirizzo del sito del club.
     *
     * Era l'unico campo che la famiglia leggesse da `settings`, e per averlo
     * usciva `settings` **intero** — stagioni, categorie, sconti, piani. Adesso
     * esce solo questo, e un campo nuovo su `settings` nasce non visibile.
     */
    website?: string | null;
    opening_hours?: any;
  };
  athlete: {
    id: string;
    organization_id: string;
    name: string;
    first_name?: string | null;
    last_name?: string | null;
    birth_date?: string | null;
    category_id?: string | null;
    category_name?: string | null;
    /**
     * **Tutte** le appartenenze, non la sola primaria (W6-14).
     *
     * La relazione non veniva nemmeno caricata dalla query dell area
     * famiglia, quindi il calendario — che da queste dipende — perdeva le
     * attivita della seconda squadra.
     */
    categories?: Array<{
      id: string;
      name: string;
      siteId: string | null;
      isPrimary: boolean;
    }>;
    status?: string | null;
    jersey_number?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    province?: string | null;
    postal_code?: string | null;
    fiscal_code?: string | null;
    birth_place?: string | null;
    nationality?: string | null;
    gender?: string | null;
    user_id?: string | null;
    data?: any;
    guardians: Array<Record<string, any>>;
    linkedAthletes: Array<{
      id: string;
      organization_id: string;
      name: string;
      birth_date?: string | null;
      category_name?: string | null;
    }>;
  };
  health: {
    certificates: Array<Record<string, any>>;
    /**
     * W6-16. `expiring` mancava: il club lo vede da sempre, e la famiglia — che
     * e quella che deve andare a rifare il certificato — scopriva la scadenza
     * il giorno dopo.
     */
    status: "valid" | "expiring" | "expired" | "missing";
    statusLabel: string;
    /** La scadenza del certificato che **governa**, non del primo in elenco. */
    expiryDate: string | null;
    allergies: any[];
    notes: string;
  };
  payments: {
    items: Array<Record<string, any>>;
    pending: number;
    paid: number;
    totalDue: number;
    totalPaid: number;
    remaining: number;
    summary?: Record<string, any>;
    receipts: Array<Record<string, any>>;
    invoices: Array<Record<string, any>>;
  };
  enrollment?: Record<string, any>;
  documents: {
    required: Array<Record<string, any>>;
    uploaded: Array<Record<string, any>>;
  };
  trainings: {
    upcoming: Array<Record<string, any>>;
    history: Array<Record<string, any>>;
    all: Array<Record<string, any>>;
  };
  matches: {
    upcoming: Array<Record<string, any>>;
    history: Array<Record<string, any>>;
    all: Array<Record<string, any>>;
  };
  attendance: {
    items: Array<Record<string, any>>;
    present: number;
    absent: number;
    total: number;
    rate: number;
  };
  appointments: {
    items: Array<Record<string, any>>;
    openingHours?: any;
  };
  structures?: {
    items: Array<Record<string, any>>;
    bookings: Array<Record<string, any>>;
  };
  notifications: Array<Record<string, any>>;
  /** Quante fra quelle mostrate non sono ancora state lette (W6-20). */
  notificationsUnread: number;
  analytics: {
    attendanceRate: number;
    lastAttendance: Array<Record<string, any>>;
    nextTraining: Record<string, any> | null;
    nextMatch: Record<string, any> | null;
  };
};
