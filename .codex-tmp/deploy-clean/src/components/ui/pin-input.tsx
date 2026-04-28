"use client";

import React, { useState, useEffect } from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";

interface PinInputProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => void;
  title?: string;
  description?: string;
}

export function PinInput({
  isOpen,
  onClose,
  onSubmit,
  title = "Inserisci PIN",
  description = "Inserisci il PIN di 4 cifre per visualizzare i dati sensibili",
}: PinInputProps) {
  const [pin, setPin] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const handleNumberClick = (number: number) => {
    if (pin.length < 4) {
      setPin((prev) => prev + number);
      setError(null);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    setPin("");
    setError(null);
  };

  const handleSubmit = () => {
    if (pin.length !== 4) {
      setError("Il PIN deve essere di 4 cifre");
      return;
    }
    onSubmit(pin);
    // Don't close the dialog here, let the parent component decide
  };

  useEffect(() => {
    if (!isOpen) {
      setPin("");
      setError(null);
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center space-y-4">
          <p className="text-sm text-muted-foreground">{description}</p>

          {/* PIN Display */}
          <div className="flex justify-center space-x-2 my-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`w-12 h-12 flex items-center justify-center border-2 rounded-md text-xl font-bold ${i < pin.length ? "border-blue-500 bg-blue-50" : "border-gray-300"}`}
              >
                {i < pin.length ? "•" : ""}
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Number Pad */}
          <div className="grid grid-cols-3 gap-2 w-full max-w-xs">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <Button
                key={num}
                variant="outline"
                className="h-12 text-xl font-medium"
                onClick={() => handleNumberClick(num)}
              >
                {num}
              </Button>
            ))}
            <Button
              variant="outline"
              className="h-12 text-xl font-medium"
              onClick={handleClear}
            >
              C
            </Button>
            <Button
              variant="outline"
              className="h-12 text-xl font-medium"
              onClick={() => handleNumberClick(0)}
            >
              0
            </Button>
            <Button
              variant="outline"
              className="h-12 text-xl font-medium"
              onClick={handleBackspace}
            >
              ←
            </Button>
          </div>

          <Button
            className="w-full mt-4 bg-blue-600 hover:bg-blue-700"
            onClick={handleSubmit}
            disabled={pin.length !== 4}
          >
            Conferma
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
