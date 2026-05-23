"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
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

type ParentDashboardContextValue = {
  data: ParentDashboardData | null;
  loading: boolean;
  error: string | null;
  athleteRouteId: string;
  refresh: () => Promise<void>;
  bookAppointment: (input: AppointmentInput) => Promise<void>;
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

export function ParentDashboardProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const athleteRouteId = String(params?.id || "");
  const [data, setData] = useState<ParentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (authLoading) {
      return;
    }

    if (!user?.id) {
      router.push("/");
      return;
    }

    try {
      setLoading(true);
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

  const value = useMemo(
    () => ({
      data,
      loading,
      error,
      athleteRouteId: data?.athlete.id || athleteRouteId,
      refresh,
      bookAppointment,
      uploadDocument,
    }),
    [
      athleteRouteId,
      bookAppointment,
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
