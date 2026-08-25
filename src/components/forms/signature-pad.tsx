"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * La firma: un canvas che si disegna con il dito o con il mouse.
 *
 * Restituisce un `File` PNG, non un data URL. Il resto del modulo invia i
 * file in `multipart/form-data`; se la firma tornasse come stringa base64
 * dentro le risposte diventerebbe l'unico allegato che non passa dal
 * servizio allegati — cioe esattamente la scorciatoia che il Blocco 8 ha
 * chiuso.
 */

type SignaturePadProps = {
  /** Vero quando una firma e gia stata tracciata: cambia solo l'aiuto. */
  hasSignature: boolean;
  onChange: (file: File | null) => void;
};

export function SignaturePad({ hasSignature, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  const prepareCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));

    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2;
    context.strokeStyle = "#0f172a";
  }, []);

  useEffect(() => {
    prepareCanvas();
    window.addEventListener("resize", prepareCanvas);
    return () => window.removeEventListener("resize", prepareCanvas);
  }, [prepareCanvas]);

  const commit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) return;
      onChange(new File([blob], "firma.png", { type: "image/png" }));
    }, "image/png");
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  };

  const pointOf = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        aria-label="Area per la firma"
        /*
          `touch-none`: senza, su telefono il gesto di disegno scorre la
          pagina invece di tracciare la firma, ed e il difetto per cui una
          firma su smartphone diventa una riga storta.
        */
        className="h-36 w-full touch-none rounded-md border border-slate-300 bg-white"
        onPointerDown={(event) => {
          drawingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          const context = event.currentTarget.getContext("2d");
          const point = pointOf(event);
          context?.beginPath();
          context?.moveTo(point.x, point.y);
        }}
        onPointerMove={(event) => {
          if (!drawingRef.current) return;
          const context = event.currentTarget.getContext("2d");
          const point = pointOf(event);
          context?.lineTo(point.x, point.y);
          context?.stroke();
        }}
        onPointerUp={(event) => {
          drawingRef.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
          commit();
        }}
        onPointerLeave={() => {
          if (!drawingRef.current) return;
          drawingRef.current = false;
          commit();
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          <Trash2 className="mr-2 h-4 w-4" />
          Cancella
        </Button>
        <span className="text-xs text-slate-500">
          {hasSignature ? "Firma acquisita." : "Firma nel riquadro."}
        </span>
      </div>
    </div>
  );
}
