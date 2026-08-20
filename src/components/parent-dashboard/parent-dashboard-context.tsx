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
import type { ParentDashboardData } from "./parent-dashboard-types";

type AppointmentInput = {
  reason: string;
  date: string;
  time: string;
  notes?: string;
};

type DocumentInput = {
  templateId?: string;
  title: string;
  file: File;
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

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

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
        const activeClub = {
          id: payload.data.club.id,
          name: payload.data.club.name,
          logo_url: payload.data.club.logo_url,
          role: "parent",
          roleLabel: "Genitore",
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

  const bookAppointment = useCallback(
    async (input: AppointmentInput) => {
      const response = await fetch(
        `/api/parent-dashboard/${data?.athlete.id || athleteRouteId}/appointments`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload?.error) {
        throw new Error(
          payload?.error?.message || "Impossibile prenotare l'appuntamento",
        );
      }

      showToast("success", "Richiesta appuntamento inviata");
      await refresh();
    },
    [athleteRouteId, data?.athlete.id, refresh, showToast],
  );

  const updateAppointment = useCallback(
    async (id: string, input: AppointmentInput) => {
      const response = await fetch(
        `/api/parent-dashboard/${data?.athlete.id || athleteRouteId}/appointments`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, ...input }),
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload?.error) {
        throw new Error(
          payload?.error?.message || "Impossibile modificare l'appuntamento",
        );
      }

      showToast("success", "Richiesta appuntamento aggiornata");
      await refresh();
    },
    [athleteRouteId, data?.athlete.id, refresh, showToast],
  );

  const cancelAppointment = useCallback(
    async (id: string) => {
      const response = await fetch(
        `/api/parent-dashboard/${data?.athlete.id || athleteRouteId}/appointments`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload?.error) {
        throw new Error(
          payload?.error?.message || "Impossibile cancellare l'appuntamento",
        );
      }

      showToast("success", "Richiesta appuntamento cancellata");
      await refresh();
    },
    [athleteRouteId, data?.athlete.id, refresh, showToast],
  );

  const uploadDocument = useCallback(
    async (input: DocumentInput) => {
      const dataBase64 = await fileToBase64(input.file);
      const response = await fetch(
        `/api/parent-dashboard/${data?.athlete.id || athleteRouteId}/documents`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            templateId: input.templateId,
            title: input.title,
            fileName: input.file.name,
            mimeType: input.file.type,
            dataBase64,
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload?.error) {
        throw new Error(
          payload?.error?.message || "Impossibile caricare il documento",
        );
      }

      showToast("success", "Documento caricato");
      await refresh();
    },
    [athleteRouteId, data?.athlete.id, refresh, showToast],
  );

  const bookStructure = useCallback(
    async (input: StructureBookingInput) => {
      const response = await fetch(
        `/api/parent-dashboard/${data?.athlete.id || athleteRouteId}/structures`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload?.error) {
        throw new Error(
          payload?.error?.message || "Impossibile richiedere la prenotazione",
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
