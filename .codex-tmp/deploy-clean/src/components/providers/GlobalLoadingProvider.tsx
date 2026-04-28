"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
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

export function GlobalLoadingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [manualCount, setManualCount] = useState(0);
  const [manualMessage, setManualMessage] = useState(DEFAULT_MESSAGE);

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
      isBusy: manualCount > 0,
      message: manualCount > 0 ? manualMessage : DEFAULT_MESSAGE,
      runWithLoader,
      showLoader,
      hideLoader,
    }),
    [hideLoader, manualCount, manualMessage, runWithLoader, showLoader],
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
