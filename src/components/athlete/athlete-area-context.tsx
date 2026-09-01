"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { apiRequest } from "@/lib/api/client";

/**
 * **Il contesto dell'area atleta: una lettura sola, condivisa da tutte le
 * pagine.**
 *
 * Non prende un identificativo, e non e una comodita: l'atleta e **se
 * stesso**, e `GET /api/v1/athlete-accounts/me` risolve la scheda dal legame
 * `athletes.user_id`. Non esiste un parametro da cambiare per farla diventare
 * la scheda di un altro — che e la ragione per cui questa area non ha un
 * selettore come ce l'ha quella della famiglia.
 *
 * Il tipo e volutamente **largo** (`Record<string, any>` sui rami di elenco):
 * la forma stretta e dichiarata dove conta, cioe sul **server**, dove la
 * proiezione a elenco chiuso decide cosa esce. Ripetere qui la stessa
 * dichiarazione significherebbe tenerne allineate due, e la seconda resterebbe
 * indietro.
 */

export type AthleteAreaData = {
  me: {
    id: string;
    name: string;
    firstName: string | null;
    lastName: string | null;
    birthDate: string | null;
    birthPlace: string | null;
    nationality: string | null;
    gender: string | null;
    fiscalCode: string | null;
    jerseyNumber: string | null;
    status: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
  };
  club: {
    id: string;
    name: string;
    logoUrl: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    city: string | null;
    province: string | null;
    website: string | null;
    seasonId: string | null;
    seasonLabel: string | null;
  };
  categories: { id: string; name: string; isPrimary: boolean }[];
  health: {
    status: string;
    statusLabel: string;
    expiryDate: string | null;
  };
  trainings: { upcoming: any[]; history: any[] };
  matches: { upcoming: any[]; history: any[] };
  rsvp: any[];
  attendance: {
    present: number;
    absent: number;
    total: number;
    rate: number;
    items: any[];
  };
  appointments: any[];
  documents: any[];
  notifications: any[];
  notificationsUnread: number;
  season: {
    trainingsPlayed: number;
    matchesPlayed: number;
    attendanceRate: number;
    nextTraining: any | null;
    nextMatch: any | null;
  };
};

type AthleteAreaContextValue = {
  data: AthleteAreaData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** La risposta a una convocazione. La scrive `POST /api/v1/rsvp`. */
  answerRsvp: (input: {
    trainingId: string;
    status: "yes" | "no";
    note?: string;
  }) => Promise<void>;
};

const contestoAssente: AthleteAreaContextValue = {
  data: null,
  loading: false,
  error: "Area atleta non inizializzata",
  refresh: async () => {},
  answerRsvp: async () => {
    throw new Error("Area atleta non inizializzata");
  },
};

const AthleteAreaContext =
  createContext<AthleteAreaContextValue>(contestoAssente);

export const useAthleteArea = () => useContext(AthleteAreaContext);

export function AthleteAreaProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [data, setData] = useState<AthleteAreaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiRequest<AthleteAreaData>(
        "/api/v1/athlete-accounts/me",
      );
      if (response.error) {
        setError(response.error.message);
        setData(null);
        return;
      }
      setData(response.data);
      setError(null);
    } catch (caught: any) {
      setError(caught?.message || "Caricamento dell'area atleta non riuscito");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const answerRsvp = useCallback(
    async (input: { trainingId: string; status: "yes" | "no"; note?: string }) => {
      if (!data) throw new Error("Area atleta non caricata");

      /*
        La risposta passa dal **dominio dell'RSVP**, che e l'unico che sa se la
        risposta e ancora possibile. L'atleta non ha una rotta propria: ne
        avesse una, sarebbe una seconda idea della scadenza.
      */
      const response = await apiRequest("/api/v1/rsvp", {
        method: "POST",
        body: {
          athlete_id: data.me.id,
          training_id: input.trainingId,
          status: input.status,
          note: input.note || undefined,
        },
      });

      if (response.error) throw new Error(response.error.message);
      await refresh();
    },
    [data, refresh],
  );

  const value = useMemo(
    () => ({ data, loading, error, refresh, answerRsvp }),
    [data, loading, error, refresh, answerRsvp],
  );

  return (
    <AthleteAreaContext.Provider value={value}>
      {children}
    </AthleteAreaContext.Provider>
  );
}
