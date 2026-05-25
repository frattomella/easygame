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
    settings?: any;
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
    status: "valid" | "expired" | "missing";
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
  notifications: Array<Record<string, any>>;
  analytics: {
    attendanceRate: number;
    lastAttendance: Array<Record<string, any>>;
    nextTraining: Record<string, any> | null;
    nextMatch: Record<string, any> | null;
  };
};
