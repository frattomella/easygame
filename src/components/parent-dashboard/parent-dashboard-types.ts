/**
 * **Una ricevuta o una fattura, come la legge una famiglia** (PP-02 §E).
 *
 * Sette campi piu il figlio: data, numero, causale, importo, stato e la strada
 * per scaricarlo. Cio che manca — chi lo ha emesso, la classificazione
 * contabile, le chiavi di riconciliazione della cassa del club — non manca per
 * distrazione: e il club che parla con se stesso, e usciva perche la riga
 * veniva mandata intera.
 */
export type FamilyFiscalDocument = {
  id: string;
  kind: "receipt" | "invoice";
  number: string;
  issueDate: string | null;
  amount: number;
  description: string;
  status: string;
  statusLabel: string;
  athleteId: string | null;
  athleteName: string | null;
  downloadPath: string;
};

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
      /**
       * Il nome della sede, risolto dal server (PP-02 §B). `null` sul club
       * mono-sede e su ogni riga che non dichiara una sede.
       */
      siteName?: string | null;
      isPrimary: boolean;
    }>;
    status?: string | null;
    avatar_url?: string | null;
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
    /**
     * PP-02 §F. Lo stato come lo legge la famiglia, con la voce che a
     * `status` manca: `undated` — il certificato **c'e** ma non dichiara una
     * scadenza, che non e la stessa cosa di non averlo.
     */
    familyState?: "valid" | "expiring" | "expired" | "missing" | "undated";
    /** «Valido», «In scadenza», «Scaduto», «Consegnato», «Mancante». */
    familyLabel?: string;
    /** «Scade il 01/06/2027» · «Scaduto il 03/01/2026» · «Data di scadenza non disponibile». */
    familyDetail?: string;
    /** Le due cose insieme: «Valido — Scade il 01/06/2027». */
    familySummary?: string;
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
    /**
     * **Il canale di incasso online del club** (PP-02 §D).
     *
     * `available` accende il pulsante; `message` e cio che si legge quando e
     * spento. Facoltativo perche il payload puo arrivare dalla cache di una
     * sessione aperta prima del rilascio.
     */
    online?: {
      available: boolean;
      blocker: "not_configured" | "temporarily_unavailable" | "nothing_due" | null;
      message: string;
    };
    /**
     * **Elenco chiuso** (PP-02 §E): prima usciva l'intera riga del documento,
     * con chi lo ha emesso, la classificazione contabile e le chiavi di
     * riconciliazione del club.
     */
    receipts: FamilyFiscalDocument[];
    invoices: FamilyFiscalDocument[];
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
    /**
     * **Come riceve questo club** (PP-02 §K): se accetta richieste online, e
     * per quali motivi. Facoltativo perche il payload puo arrivare dalla cache
     * di una sessione aperta prima del rilascio.
     */
    config?: {
      familyBookingEnabled: boolean;
      types: Array<{ id: string; name: string }>;
    };
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
