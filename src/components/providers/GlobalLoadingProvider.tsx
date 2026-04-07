"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppBlockingOverlay } from "@/components/ui/app-loading-screen";

type GlobalLoadingContextValue = {
  isBusy: boolean;
  message: string;
  runWithLoader: <T>(message: string, task: () => Promise<T>) => Promise<T>;
  showLoader: (message: string) => void;
  hideLoader: () => void;
};

const GlobalLoadingContext = createContext<GlobalLoadingContextValue | null>(
  null,
);

const DEFAULT_MESSAGE = "Operazione in corso, attendi un momento...";
const FETCH_DELAY_MS = 450;

export function GlobalLoadingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [manualCount, setManualCount] = useState(0);
  const [fetchCount, setFetchCount] = useState(0);
  const [manualMessage, setManualMessage] = useState(DEFAULT_MESSAGE);
  const timeoutMapRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const originalFetch = window.fetch.bind(window);

    const shouldTrack = (input: RequestInfo | URL) => {
      const rawUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;

      return (
        rawUrl.includes("/api/") ||
        rawUrl.includes("/auth/") ||
        rawUrl.includes("localhost:3001") ||
        rawUrl.includes("easygame-staging.vercel.app")
      );
    };

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!shouldTrack(input)) {
        return originalFetch(input, init);
      }

      const requestId = ++requestIdRef.current;
      const timeout = setTimeout(() => {
        setFetchCount((current) => current + 1);
        timeoutMapRef.current.delete(requestId);
      }, FETCH_DELAY_MS);

      timeoutMapRef.current.set(requestId, timeout);

      try {
        return await originalFetch(input, init);
      } finally {
        const pendingTimeout = timeoutMapRef.current.get(requestId);
        if (pendingTimeout) {
          clearTimeout(pendingTimeout);
          timeoutMapRef.current.delete(requestId);
        } else {
          setFetchCount((current) => Math.max(0, current - 1));
        }
      }
    };

    return () => {
      window.fetch = originalFetch;
      timeoutMapRef.current.forEach((timeout) => clearTimeout(timeout));
      timeoutMapRef.current.clear();
    };
  }, []);

  const showLoader = useCallback((message: string) => {
    setManualMessage(message || DEFAULT_MESSAGE);
    setManualCount((current) => current + 1);
  }, []);

  const hideLoader = useCallback(() => {
    setManualCount((current) => Math.max(0, current - 1));
  }, []);

  const runWithLoader = useCallback(
    async <T,>(message: string, task: () => Promise<T>) => {
      showLoader(message);
      try {
        return await task();
      } finally {
        hideLoader();
      }
    },
    [hideLoader, showLoader],
  );

  const contextValue = useMemo<GlobalLoadingContextValue>(
    () => ({
      isBusy: manualCount > 0 || fetchCount > 0,
      message: manualCount > 0 ? manualMessage : DEFAULT_MESSAGE,
      runWithLoader,
      showLoader,
      hideLoader,
    }),
    [fetchCount, hideLoader, manualCount, manualMessage, runWithLoader, showLoader],
  );

  return (
    <GlobalLoadingContext.Provider value={contextValue}>
      {children}
      <AppBlockingOverlay
        visible={contextValue.isBusy}
        subtitle={contextValue.message}
      />
    </GlobalLoadingContext.Provider>
  );
}

export const useGlobalLoading = () => {
  const context = useContext(GlobalLoadingContext);

  if (!context) {
    return {
      isBusy: false,
      message: DEFAULT_MESSAGE,
      runWithLoader: async <T,>(_message: string, task: () => Promise<T>) =>
        task(),
      showLoader: () => undefined,
      hideLoader: () => undefined,
    };
  }

  return context;
};
