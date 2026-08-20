"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardCopy,
  Download,
  Link as LinkIcon,
  MessageCircle,
  Printer,
  QrCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import type { OnlineForm } from "@/lib/online-forms";
import { drawQrToCanvas, generateQrMatrix } from "@/lib/qr-code-utils";

type FormShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: OnlineForm | null;
  publicUrl: string;
  clubName?: string;
};

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
};

const safeFilePart = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "modulo";

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export function FormShareDialog({
  open,
  onOpenChange,
  form,
  publicUrl,
  clubName = "EasyGame",
}: FormShareDialogProps) {
  const { showToast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [qrError, setQrError] = useState("");
  const canShare = Boolean(form && form.status === "published" && publicUrl);
  const fileName = useMemo(
    () =>
      `modulo-${safeFilePart(form?.publicSlug || form?.id || form?.title || "online")}-qr.png`,
    [form],
  );

  useEffect(() => {
    if (!open || !canShare || !canvasRef.current) return;

    try {
      const matrix = generateQrMatrix(publicUrl);
      drawQrToCanvas(canvasRef.current, matrix, { size: 320, margin: 4 });
      setQrError("");
    } catch (error: any) {
      console.error("QR generation error:", error);
      setQrError(error?.message || "QR Code non generabile per questo link.");
    }
  }, [canShare, open, publicUrl]);

  const handleCopy = async () => {
    try {
      await copyText(publicUrl);
      showToast("success", "Link pubblico copiato");
    } catch (error) {
      console.error("Copy public link error:", error);
      showToast("error", "Impossibile copiare il link");
    }
  };

  const getQrImage = () => {
    const canvas = canvasRef.current;
    if (!canvas || qrError) return "";
    return canvas.toDataURL("image/png");
  };

  const handleDownload = () => {
    const image = getQrImage();
    if (!image) {
      showToast("error", "QR Code non disponibile per il download");
      return;
    }

    const link = document.createElement("a");
    link.href = image;
    link.download = fileName;
    link.click();
  };

  const handlePrint = () => {
    const image = getQrImage();
    if (!image || !form) {
      showToast("error", "QR Code non disponibile per la stampa");
      return;
    }

    const printWindow = window.open("", "_blank", "width=720,height=860");
    if (!printWindow) {
      showToast("error", "Consenti i popup per stampare il QR Code");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html lang="it">
        <head>
          <meta charset="utf-8" />
          <title>QR Code - ${escapeHtml(form.title)}</title>
          <style>
            body {
              margin: 0;
              padding: 40px;
              color: #0f172a;
              font-family: Arial, Helvetica, sans-serif;
              text-align: center;
            }
            .sheet {
              margin: 0 auto;
              max-width: 520px;
              border: 1px solid #e2e8f0;
              border-radius: 16px;
              padding: 32px;
            }
            h1 { margin: 0 0 8px; font-size: 24px; }
            h2 { margin: 0 0 24px; font-size: 18px; color: #334155; }
            img { width: 320px; height: 320px; image-rendering: pixelated; }
            p { line-height: 1.5; }
            .link {
              margin-top: 20px;
              overflow-wrap: anywhere;
              color: #2563eb;
              font-size: 13px;
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <h1>${escapeHtml(clubName)}</h1>
            <h2>${escapeHtml(form.title)}</h2>
            <img src="${image}" alt="QR Code" />
            <p>Scansiona il QR Code per compilare il modulo</p>
            <p class="link">${escapeHtml(publicUrl)}</p>
          </div>
          <script>
            window.setTimeout(() => {
              window.focus();
              window.print();
            }, 250);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleWhatsApp = () => {
    const text = `Ciao, puoi compilare il modulo online da questo link: ${publicUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-blue-600" />
            Condividi modulo
          </DialogTitle>
        </DialogHeader>

        {form ? (
          <div className="space-y-5">
            <div>
              <p className="font-semibold text-slate-900">{form.title}</p>
              <p className="text-sm text-slate-500">
                {form.description || "Modulo online pubblico"}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Link pubblico</Label>
              <div className="flex gap-2">
                <Input readOnly value={publicUrl} />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopy}
                  disabled={!canShare}
                >
                  <ClipboardCopy className="mr-2 h-4 w-4" />
                  Copia
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-slate-50 p-5 text-center">
              {canShare ? (
                <>
                  <canvas
                    ref={canvasRef}
                    className="mx-auto rounded-lg border bg-white p-2"
                    aria-label="QR Code modulo online"
                  />
                  {qrError ? (
                    <p className="mt-3 text-sm text-red-600">{qrError}</p>
                  ) : null}
                </>
              ) : (
                <div className="py-10 text-sm text-slate-500">
                  Pubblica il modulo per generare link e QR Code.
                </div>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleDownload}
                disabled={!canShare || Boolean(qrError)}
              >
                <Download className="mr-2 h-4 w-4" />
                Scarica PNG
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handlePrint}
                disabled={!canShare || Boolean(qrError)}
              >
                <Printer className="mr-2 h-4 w-4" />
                Stampa QR
              </Button>
              <Button type="button" onClick={handleWhatsApp} disabled={!canShare}>
                <MessageCircle className="mr-2 h-4 w-4" />
                WhatsApp
              </Button>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
          <Button onClick={handleCopy} disabled={!canShare}>
            <LinkIcon className="mr-2 h-4 w-4" />
            Copia link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
