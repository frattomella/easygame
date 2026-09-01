"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import type { ParentDashboardData } from "./parent-dashboard-types";

/**
 * Uno **slot libero** cosi come il server lo calcola e lo serializza.
 *
 * Non e una comodita: e il contratto. `findFreeSlotAt` confronta l'istante di
 * inizio con `getTime() === getTime()` su una griglia di trenta minuti, quindi
 * un orario digitato a mano che non cade esattamente su uno slot viene
 * rifiutato. La famiglia deve poter scegliere fra questi, non comporne uno.
 */
export type AppointmentSlot = {
  slotId: string | null;
  source: "slot" | "opening_hours";
  siteId: string | null;
  assignedToUserId: string | null;
  /** L'istante di inizio in ISO: e il solo campo che il server confronta. */
  startsAt: string;
  endsAt: string;
  /** Giorno `YYYY-MM-DD` e ora `HH:MM` gia risolti nel fuso del club. */
  day: string;
  time: string;
  durationMinutes: number;
  capacity: number;
  taken: number;
  remaining: number;
};

type AppointmentInput = {
  reason: string;
  /**
   * L'istante dello slot scelto. Sostituisce il giorno e l'ora liberi: erano
   * due campi che producevano quasi sempre un orario fuori griglia, e un
   * rifiuto che rimandava a un elenco che nessuna schermata mostrava.
   */
  startsAt: string;
  slotId?: string | null;
  siteId?: string | null;
  notes?: string;
};

type DocumentInput = {
  templateId?: string;
  title: string;
  file: File;
  /**
   * Che **tipo** di documento e.
   *
   * W6-18. La rotta lo accetta da sempre — `documentType`, con ripiego su
   * `other` — e nessun client glielo mandava. Conseguenza: un certificato
   * medico caricato dalla famiglia entrava in archivio come «altro», e non
   * muoveva lo stato sanitario dell'atleta. Il genitore vedeva «Certificato
   * scaduto» il giorno dopo averlo caricato, e aveva ragione lui.
   */
  documentType?: string;
};

export type StructureBookingInput = {
  structureId: string;
  fieldId: string;
  start: string;
  end: string;
  athleteId?: string;
  notes?: string;
};

type ParentDashboardContextValue = {
  data: ParentDashboardData | null;
  loading: boolean;
  error: string | null;
  athleteRouteId: string;
  refresh: () => Promise<void>;
  loadAppointmentSlots: () => Promise<AppointmentSlot[]>;
  bookAppointment: (input: AppointmentInput) => Promise<void>;
  updateAppointment: (id: string, input: AppointmentInput) => Promise<void>;
  cancelAppointment: (id: string) => Promise<void>;
  bookStructure: (input: StructureBookingInput) => Promise<void>;
  uploadDocument: (input: DocumentInput) => Promise<void>;
};

const missingProviderContext: ParentDashboardContextValue = {
  data: null,
  loading: false,
  error: "Dashboard genitore non inizializzata",
  athleteRouteId: "",
  refresh: async () => {},
  loadAppointmentSlots: async () => {
    throw new Error("Dashboard genitore non inizializzata");
  },
  bookAppointment: async () => {
    throw new Error("Dashboard genitore non inizializzata");
  },
  updateAppointment: async () => {
    throw new Error("Dashboard genitore non inizializzata");
  },
  cancelAppointment: async () => {
    throw new Error("Dashboard genitore non inizializzata");
  },
  bookStructure: async () => {
    throw new Error("Dashboard genitore non inizializzata");
  },
  uploadDocument: async () => {
    throw new Error("Dashboard genitore non inizializzata");
  },
};

const ParentDashboardContext =
  createContext<ParentDashboardContextValue>(missingProviderContext);

const getParentDashboardCacheKey = (athleteId: string) =>
  athleteId ? `easygame:parent-dashboard:${athleteId}` : "";

const readCachedParentDashboard = (athleteId: string) => {
  if (typeof window === "undefined" || !athleteId) return null;

  try {
    const raw = window.sessionStorage.getItem(
      getParentDashboardCacheKey(athleteId),
    );
    return raw ? (JSON.parse(raw) as ParentDashboardData) : null;
  } catch {
    return null;
  }
};

const writeCachedParentDashboard = (
  routeId: string,
  nextData: ParentDashboardData,
) => {
  if (typeof window === "undefined") return;

  try {
    const serialized = JSON.stringify(nextData);
    if (routeId) {
      window.sessionStorage.setItem(
        getParentDashboardCacheKey(routeId),
        serialized,
      );
    }
    if (nextData.athlete?.id && nextData.athlete.id !== routeId) {
      window.sessionStorage.setItem(
        getParentDashboardCacheKey(nextData.athlete.id),
        serialized,
      );
    }
  } catch {
    // La cache serve solo a evitare schermate vuote tra navigazioni.
  }
};

export function ParentDashboardProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const routeIdFromPath = String(pathname || "")
    .split("/")
    .filter(Boolean)[1];
  const athleteRouteId = String(params?.id || routeIdFromPath || "");
  const [data, setData] = useState<ParentDashboardData | null>(() =>
    readCachedParentDashboard(athleteRouteId),
  );
  const [loading, setLoading] = useState(
    () => !readCachedParentDashboard(athleteRouteId),
  );
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<ParentDashboardData | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const cachedData = readCachedParentDashboard(athleteRouteId);
    if (!cachedData) return;

    setData(cachedData);
    setLoading(false);
    setError(null);
  }, [athleteRouteId]);

  const refresh = useCallback(async () => {
    if (authLoading) {
      return;
    }

    if (!user?.id) {
      router.push("/");
      return;
    }

    if (!athleteRouteId) {
      setError("Atleta non selezionato");
      setLoading(false);
      return;
    }

    try {
      if (!dataRef.current) {
        setLoading(true);
      } else {
        setLoading(false);
      }
      setError(null);
      const response = await fetch(`/api/parent-dashboard/${athleteRouteId}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload?.error) {
        throw new Error(
          payload?.error?.message || "Impossibile caricare la dashboard",
        );
      }

      setData(payload.data);
      writeCachedParentDashboard(athleteRouteId, payload.data);

      if (typeof window !== "undefined" && payload.data?.club) {
        /*
          **Questa riscrittura perdeva il legame famiglia** (D-3).

          L'oggetto salvato era ridotto a cinque campi, e fra quelli che
          spariva c'era l'elenco dei figli: al primo `F5` su
          `/parent-view/[id]` la guardia d'area non trovava nessun figlio
          autorizzato e rimandava il genitore su `/account`.

          Ora si **fonde** con quanto c'e gia, e l'elenco dei figli lo detta la
          risposta del server — che li risolve tutti, in tutti i club.
        */
        const storedRaw =
          localStorage.getItem(`activeClub_${user.id}`) ||
          localStorage.getItem("activeClub");
        let stored: Record<string, any> = {};
        try {
          const parsed = storedRaw ? JSON.parse(storedRaw) : null;
          stored =
            parsed && parsed.id === payload.data.club.id ? parsed : {};
        } catch {
          stored = {};
        }

        const linkedAthleteIds = Array.isArray(
          payload.data?.athlete?.linkedAthletes,
        )
          ? payload.data.athlete.linkedAthletes
              .map((athlete: any) => String(athlete?.id || "").trim())
              .filter(Boolean)
          : [];

        /*
          W6-09. **Le due righe che dicevano «Nessuna stagione attiva».**

          Questo oggetto veniva ricostruito senza i due campi della stagione, e
          poi scritto nel `localStorage` e annunciato con l'evento
          `club-updated`. L'intestazione ascolta quell'evento e fa
          `setActiveSeasonLabel(nextSeasonLabel || null)`: cioe **azzerava**
          l'etichetta che `AuthProvider` aveva calcolato, e la schermata della
          famiglia annunciava che il club non ha una stagione mentre ce l'ha.

          Peggio per un tutore legato attraverso `athletes.data.guardians` senza
          riga di membership: per lui `stored` e vuoto e `AuthProvider` non
          popola niente, quindi l'etichetta non esisteva **in nessun momento**.

          Adesso la stagione la risolve il server e viaggia nel payload: qui si
          trasporta, non si ricalcola.
        */
        const activeClub = {
          ...stored,
          id: payload.data.club.id,
          name: payload.data.club.name,
          logo_url: payload.data.club.logo_url,
          activeSeasonId: payload.data.club.activeSeasonId ?? null,
          activeSeasonLabel: payload.data.club.activeSeasonLabel ?? null,
          role: "parent",
          roleLabel: "Genitore",
          linkedAthleteIds,
          linkedAthleteId: linkedAthleteIds[0] || null,
        };
        localStorage.setItem("activeClub", JSON.stringify(activeClub));
        localStorage.setItem(`activeClub_${user.id}`, JSON.stringify(activeClub));
        window.dispatchEvent(
          new CustomEvent("club-updated", {
            detail: { clubData: activeClub },
          }),
        );
      }
    } catch (nextError: any) {
      const message =
        nextError?.message || "Errore caricamento dashboard genitore";
      setError(message);
      showToast("error", message);
    } finally {
      setLoading(false);
    }
  }, [athleteRouteId, authLoading, router, showToast, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Gli orari su cui si puo davvero chiedere un appuntamento.
   *
   * La rotta li calcolava gia — regole di disponibilita del club, orari di
   * apertura come ripiego, slot gia occupati tolti — e **nessuno li leggeva**:
   * la schermata offriva un giorno e un'ora liberi, il server pretendeva la
   * corrispondenza esatta con uno slot, e la famiglia riceveva un rifiuto che
   * la rimandava a un elenco che non aveva mai visto.
   *
   * La lettura sta qui, accanto alle tre scritture, perche chi propone gli
   * orari e chi prenota devono parlare della stessa griglia.
   */
  const loadAppointmentSlots = useCallback(async () => {
    const athleteId = data?.athlete.id || athleteRouteId;
    if (!athleteId) return [];

    const response = await apiRequest<{ availableSlots: AppointmentSlot[] }>(
      `/api/parent-dashboard/${encodeURIComponent(String(athleteId))}/appointments`,
    );

    if (response.error) {
      throw new Error(
        response.error.message || "Impossibile leggere gli orari disponibili",
      );
    }

    return Array.isArray(response.data?.availableSlots)
      ? response.data.availableSlots
      : [];
  }, [athleteRouteId, data?.athlete.id]);

  const bookAppointment = useCallback(
    async (input: AppointmentInput) => {
      /*
        `apiRequest` serializza da se: passargli un corpo gia serializzato
        manderebbe una stringa e ogni campo risulterebbe assente al server. E
        anche la regola di CLAUDE.md §2 — nessun `fetch` diretto a `/api` da un
        componente — che questi cinque punti violavano dalla loro nascita.
      */
      const payload = await apiRequest<unknown>(
        `/api/parent-dashboard/${data?.athlete.id || athleteRouteId}/appointments`,
        { method: "POST", body: input },
      );

      if (payload?.error) {
        throw new Error(
          payload.error.message || "Impossibile prenotare l'appuntamento",
        );
      }

      showToast("success", "Richiesta appuntamento inviata");
      await refresh();
    },
    [athleteRouteId, data?.athlete.id, refresh, showToast],
  );

  const updateAppointment = useCallback(
    async (id: string, input: AppointmentInput) => {
      /*
        `apiRequest` serializza da se: passargli un corpo gia serializzato
        manderebbe una stringa e ogni campo risulterebbe assente al server. E
        anche la regola di CLAUDE.md §2 — nessun `fetch` diretto a `/api` da un
        componente — che questi cinque punti violavano dalla loro nascita.
      */
      const payload = await apiRequest<unknown>(
        `/api/parent-dashboard/${data?.athlete.id || athleteRouteId}/appointments`,
        { method: "PATCH", body: { id, ...input } },
      );

      if (payload?.error) {
        throw new Error(
          payload.error.message || "Impossibile modificare l'appuntamento",
        );
      }

      showToast("success", "Richiesta appuntamento aggiornata");
      await refresh();
    },
    [athleteRouteId, data?.athlete.id, refresh, showToast],
  );

  const cancelAppointment = useCallback(
    async (id: string) => {
      /*
        `apiRequest` serializza da se: passargli un corpo gia serializzato
        manderebbe una stringa e ogni campo risulterebbe assente al server. E
        anche la regola di CLAUDE.md §2 — nessun `fetch` diretto a `/api` da un
        componente — che questi cinque punti violavano dalla loro nascita.
      */
      const payload = await apiRequest<unknown>(
        `/api/parent-dashboard/${data?.athlete.id || athleteRouteId}/appointments`,
        { method: "DELETE", body: { id } },
      );

      if (payload?.error) {
        throw new Error(
          payload.error.message || "Impossibile cancellare l'appuntamento",
        );
      }

      showToast("success", "Richiesta appuntamento cancellata");
      await refresh();
    },
    [athleteRouteId, data?.athlete.id, refresh, showToast],
  );

  const uploadDocument = useCallback(
    async (input: DocumentInput) => {
      /*
        **Il file viaggia come file, non come testo.**

        Fino alla Wave 6 la famiglia mandava base64 dentro un corpo JSON, e il
        ramo multipart esisteva gia sul server senza che nessuno lo usasse: il
        commento della rotta prometteva che sarebbe sparito con la lane 5J, e
        non e sparito.

        Base64 costa il 33% in piu, e su una foto di documento fatta col
        telefono non e poco: e la differenza fra un caricamento che riesce in
        palestra e uno che va in timeout. In piu la rotta decodificava **e
        poi** misurava, cioe il limite di dimensione arrivava dopo aver
        allocato il file.

        `apiRequest` riconosce `FormData` e non la serializza: e il motivo per
        cui questa chiamata non ha bisogno di un `fetch` diretto, che la regola
        di CLAUDE.md §2 vieta.
      */
      const modulo = new FormData();
      modulo.append("file", input.file, input.file.name);
      modulo.append("title", input.title);
      if (input.templateId) modulo.append("templateId", input.templateId);
      if (input.documentType) {
        modulo.append("documentType", input.documentType);
      }

      const payload = await apiRequest<unknown>(
        `/api/parent-dashboard/${data?.athlete.id || athleteRouteId}/documents`,
        { method: "POST", body: modulo },
      );

      if (payload?.error) {
        throw new Error(
          payload.error.message || "Impossibile caricare il documento",
        );
      }

      showToast("success", "Documento caricato");
      await refresh();
    },
    [athleteRouteId, data?.athlete.id, refresh, showToast],
  );

  const bookStructure = useCallback(
    async (input: StructureBookingInput) => {
      /*
        `apiRequest` serializza da se: passargli un corpo gia serializzato
        manderebbe una stringa e ogni campo risulterebbe assente al server. E
        anche la regola di CLAUDE.md §2 — nessun `fetch` diretto a `/api` da un
        componente — che questi cinque punti violavano dalla loro nascita.
      */
      const payload = await apiRequest<unknown>(
        `/api/parent-dashboard/${data?.athlete.id || athleteRouteId}/structures`,
        { method: "POST", body: input },
      );

      if (payload?.error) {
        throw new Error(
          payload.error.message || "Impossibile richiedere la prenotazione",
        );
      }

      showToast("success", "Richiesta prenotazione inviata");
      await refresh();
    },
    [athleteRouteId, data?.athlete.id, refresh, showToast],
  );

  const value = useMemo(
    () => ({
      data,
      loading,
      error,
      athleteRouteId: data?.athlete.id || athleteRouteId,
      refresh,
      loadAppointmentSlots,
      bookAppointment,
      updateAppointment,
      cancelAppointment,
      bookStructure,
      uploadDocument,
    }),
    [
      athleteRouteId,
      bookStructure,
      bookAppointment,
      updateAppointment,
      cancelAppointment,
      data,
      error,
      loadAppointmentSlots,
      loading,
      refresh,
      uploadDocument,
    ],
  );

  return (
    <ParentDashboardContext.Provider value={value}>
      {children}
    </ParentDashboardContext.Provider>
  );
}

export const useParentDashboard = () => {
  return useContext(ParentDashboardContext);
};
