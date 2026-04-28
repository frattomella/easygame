"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  X,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  ChevronDown,
} from "lucide-react";

interface SetupGuideProps {
  onClose: () => void;
  onStartTour: () => void;
}

const SetupGuide: React.FC<SetupGuideProps> = ({ onClose, onStartTour }) => {
  const [isMinimized, setIsMinimized] = useState(false);

  return (
    <div
      className={`fixed bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 ${isMinimized ? "w-12 h-12" : "max-w-md"} z-50 border border-blue-200 dark:border-blue-800 transition-all duration-300`}
    >
      {isMinimized ? (
        <button
          onClick={() => setIsMinimized(false)}
          className="w-full h-full flex items-center justify-center text-blue-600"
        >
          <HelpCircle className="h-6 w-6" />
        </button>
      ) : (
        <>
          <div className="flex justify-between items-start mb-2">
            <h4 className="font-medium text-blue-600">
              Guida alla configurazione
            </h4>
            <div className="flex gap-1">
              <button
                onClick={() => setIsMinimized(true)}
                className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="text-sm space-y-2">
            <p>
              Benvenuto nella tua nuova dashboard! Ecco alcune funzionalità
              principali:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Personalizza la dashboard con il pulsante in alto a destra
              </li>
              <li>Aggiungi nuovi widget e riorganizzali tramite drag & drop</li>
              <li>Accedi rapidamente alle sezioni principali dalla sidebar</li>
              <li>Visualizza le metriche e le attività recenti</li>
            </ul>
            <p className="mt-2">Vuoi un tour guidato dell'applicazione?</p>
          </div>
          <div className="flex justify-end mt-3 gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Salta
            </Button>
            <Button size="sm" onClick={onStartTour}>
              Inizia tour
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default SetupGuide;
