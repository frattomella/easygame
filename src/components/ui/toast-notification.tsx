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
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const getIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "error":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case "info":
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getBackgroundColor = () => {
    switch (type) {
      case "success":
        return "bg-green-50 border-green-200";
      case "error":
        return "bg-red-50 border-red-200";
      case "info":
        return "bg-blue-50 border-blue-200";
    }
  };

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border p-4 shadow-md ${getBackgroundColor()}`}
    >
      {getIcon()}
      <p className="flex-1 text-sm">{message}</p>
      <button
        onClick={onClose}
        className="rounded-full p-1 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300"
      >
        <X className="h-4 w-4" />
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
