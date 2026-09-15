"use client";

import * as React from "react";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface ToastProps {
  type: ToastType;
  message: string;
  onClose: () => void;
}

export function Toast({ type, message, onClose }: ToastProps) {
  /*
    Guideline 09 §9.5: un successo dura 4 secondi, un errore 8 — perche chi
    ha sbagliato deve fare in tempo a leggere cosa.
  */
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, type === "error" ? 8000 : 4000);

    return () => clearTimeout(timer);
  }, [onClose, type]);

  const getIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircle className="h-[17px] w-[17px] text-egw-green" />;
      case "error":
        return <AlertCircle className="h-[17px] w-[17px] text-egw-red" />;
      case "info":
        return <Info className="h-[17px] w-[17px] text-egw-blue-700" />;
    }
  };

  const bar =
    type === "success"
      ? "before:bg-egw-green"
      : type === "error"
        ? "before:bg-egw-red"
        : "before:bg-egw-blue-700";

  return (
    /*
      **Annunciato, non solo mostrato.** Questo componente non aveva ne `role`
      ne `aria-live`: chi usa uno screen reader compiva l'azione e non sentiva
      niente — mentre le schermate che usano il toast di Radix sentivano tutto.
      La stessa azione, annunciata su una pagina e muta sull'altra.

      `alert` per un errore (interrompe), `status` per il resto (attende una
      pausa): un errore che aspetta il proprio turno arriva quando la persona
      ha gia premuto il pulsante una seconda volta.

      L'aspetto e quello del Web V2 (EGDS v3.1.0, guideline 09 §9.5): 360px in
      basso a destra, bianco, barra di 4px a sinistra nel colore semantico.
    */
    <div
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      className={`egw-toast-enter fixed bottom-6 right-6 z-[80] flex w-[360px] max-w-[calc(100vw-32px)] items-start gap-3 overflow-hidden rounded-egw-field bg-white py-3 pl-4 pr-3 font-brand shadow-egw-plane-2 before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-[''] ${bar}`}
    >
      <span className="mt-px shrink-0">{getIcon()}</span>
      <p className="flex-1 text-[12.5px] font-semibold leading-[1.45] text-egw-ink">{message}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Chiudi la notifica"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-egw-micro text-egw-ink-62 hover:bg-egw-page-100 focus:outline-none focus-visible:shadow-egw-focus"
      >
        <X className="h-[15px] w-[15px]" aria-hidden="true" />
      </button>
    </div>
  );
}

interface ToastProviderProps {
  children: React.ReactNode;
}

type ToastContextType = {
  showToast: (
    typeOrOptions:
      | ToastType
      | string
      | {
          title?: string;
          description?: string;
          variant?: "default" | "destructive";
        },
    message?: string,
    type?: ToastType,
  ) => void;
};

const ToastContext = React.createContext<ToastContextType | undefined>(
  undefined,
);

export function ToastProvider({ children }: ToastProviderProps) {
  const [toast, setToast] = React.useState<{
    type: ToastType;
    message: string;
  } | null>(null);

  const showToast = React.useCallback(
    (
      typeOrOptions:
        | ToastType
        | string
        | {
            title?: string;
            description?: string;
            variant?: "default" | "destructive";
          },
      message?: string,
      type?: ToastType,
    ) => {
      if (
        typeof typeOrOptions === "string" &&
        (typeOrOptions === "success" ||
          typeOrOptions === "error" ||
          typeOrOptions === "info") &&
        !type
      ) {
        setToast({ type: typeOrOptions, message: message || "" });
        return;
      }

      if (typeof typeOrOptions === "string") {
        setToast({
          type: type || "info",
          message: [typeOrOptions, message].filter(Boolean).join(" - "),
        });
        return;
      }

      setToast({
        type: typeOrOptions.variant === "destructive" ? "error" : "info",
        message:
          [typeOrOptions.title, typeOrOptions.description]
            .filter(Boolean)
            .join(" - ") || "Operazione completata",
      });
    },
    [],
  );

  const closeToast = React.useCallback(() => {
    setToast(null);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <Toast type={toast.type} message={toast.message} onClose={closeToast} />
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
