"use client";

import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  firstText,
  isChoiceField,
  isReadOnlyField,
  type OnlineForm,
} from "@/lib/online-forms";

type PublicFormPayload = {
  form: OnlineForm;
  club: {
    id: string;
    name: string;
    logoUrl?: string;
    contactEmail?: string;
  };
};

type OnlinePublicFormProps = {
  publicSlug: string;
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

function SignaturePad({
  value,
  onChange,
}: {
  value?: string;
  onChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  const resizeCanvas = () => {
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
    if (value) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height);
      image.src = value;
    }
  };

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, []);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const commitSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="h-36 w-full touch-none rounded-md border bg-white"
        onPointerDown={(event) => {
          drawingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          const context = event.currentTarget.getContext("2d");
          const point = getPoint(event);
          context?.beginPath();
          context?.moveTo(point.x, point.y);
        }}
        onPointerMove={(event) => {
          if (!drawingRef.current) return;
          const context = event.currentTarget.getContext("2d");
          const point = getPoint(event);
          context?.lineTo(point.x, point.y);
          context?.stroke();
        }}
        onPointerUp={(event) => {
          drawingRef.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
          commitSignature();
        }}
        onPointerLeave={() => {
          if (!drawingRef.current) return;
          drawingRef.current = false;
          commitSignature();
        }}
      />
      <Button type="button" variant="outline" size="sm" onClick={clear}>
        <Trash2 className="mr-2 h-4 w-4" />
        Cancella firma
      </Button>
    </div>
  );
}

export function OnlinePublicForm({ publicSlug }: OnlinePublicFormProps) {
  const [payload, setPayload] = useState<PublicFormPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [respondentName, setRespondentName] = useState("");
  const [respondentEmail, setRespondentEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const loadForm = async () => {
      setLoading(true);
      const response = await fetch(`/api/public/forms/${publicSlug}`, {
        credentials: "include",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.error) {
        setError(data?.error?.message || "Modulo non disponibile");
        setPayload(data?.data?.form ? data.data : null);
      } else {
        setPayload(data.data);
      }
      setLoading(false);
    };

    void loadForm();
  }, [publicSlug]);

  const updateAnswer = (fieldId: string, value: any) => {
    setAnswers((current) => ({
      ...current,
      [fieldId]: value,
    }));
    setFieldErrors((current) => ({
      ...current,
      [fieldId]: "",
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!payload) return;

    setSubmitting(true);
    setError("");
    setFieldErrors({});

    try {
      const uploadPayload = [];
      for (const field of payload.form.fields) {
        if (field.type === "file_upload" || field.type === "image") {
          const file = files[field.id];
          if (file) {
            uploadPayload.push({
              fieldId: field.id,
              fileName: file.name,
              mimeType: file.type || "application/octet-stream",
              size: file.size,
              dataBase64: await fileToDataUrl(file),
            });
          }
        }

        if (field.type === "signature" && firstText(answers[field.id])) {
          uploadPayload.push({
            fieldId: field.id,
            fileName: `${field.label || "firma"}.png`,
            mimeType: "image/png",
            dataBase64: answers[field.id],
          });
        }
      }

      const response = await fetch(`/api/public/forms/${publicSlug}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          respondentName,
          respondentEmail,
          answers,
          files: uploadPayload,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || data?.error) {
        setError(data?.error?.message || "Errore invio risposta");
        if (data?.data?.errors) {
          setFieldErrors(data.data.errors);
        }
        return;
      }

      setSuccessMessage(
        data?.data?.successMessage ||
          payload.form.settings.successMessage ||
          "Risposta inviata correttamente. Grazie!",
      );
    } catch (submitError: any) {
      setError(submitError?.message || "Errore invio risposta");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Caricamento modulo...
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="py-10 text-center">
            <h1 className="text-xl font-semibold">Modulo non disponibile</h1>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
            {error.toLowerCase().includes("login") ? (
              <Button className="mt-5" asChild>
                <a href="/login">Accedi</a>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (successMessage) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <Card className="mx-auto w-full max-w-2xl">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            <h1 className="mt-4 text-2xl font-semibold text-slate-900">
              Risposta inviata
            </h1>
            <p className="mt-2 max-w-xl text-slate-600">{successMessage}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { form, club } = payload;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:py-10">
      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-3xl space-y-5">
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            {club.logoUrl ? (
              <img
                src={club.logoUrl}
                alt={club.name}
                className="h-12 w-12 rounded-md object-contain"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-blue-600 font-semibold text-white">
                EG
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-slate-500">
                {club.name || "EasyGame"}
              </p>
              <h1 className="text-2xl font-semibold text-slate-900">
                {form.title}
              </h1>
            </div>
          </div>
          {form.description ? (
            <p className="mt-4 whitespace-pre-wrap text-sm text-slate-600">
              {form.description}
            </p>
          ) : null}
        </div>

        {(form.settings.collectEmail || form.requiresAuth) && (
          <Card>
            <CardHeader>
              <CardTitle>Dati risposta</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome e cognome</Label>
                <Input
                  value={respondentName}
                  onChange={(event) => setRespondentName(event.target.value)}
                  placeholder="Nome del compilatore"
                />
              </div>
              {form.settings.collectEmail ? (
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={respondentEmail}
                    onChange={(event) => setRespondentEmail(event.target.value)}
                    placeholder="email@example.com"
                  />
                  {fieldErrors.respondentEmail ? (
                    <p className="text-sm text-red-600">
                      {fieldErrors.respondentEmail}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {form.fields.map((field) => {
          if (field.type === "section") {
            return (
              <div key={field.id} className="rounded-lg border bg-white p-5">
                <h2 className="text-lg font-semibold text-slate-900">
                  {field.label}
                </h2>
                {field.description ? (
                  <p className="mt-1 text-sm text-slate-500">
                    {field.description}
                  </p>
                ) : null}
              </div>
            );
          }

          if (field.type === "divider") {
            return <div key={field.id} className="border-t" />;
          }

          return (
            <Card key={field.id}>
              <CardContent className="space-y-3 p-5">
                <div>
                  <Label className="text-base">
                    {field.label}
                    {field.required ? " *" : ""}
                  </Label>
                  {field.description ? (
                    <p className="mt-1 text-sm text-slate-500">
                      {field.description}
                    </p>
                  ) : null}
                </div>

                {field.type === "long_text" ? (
                  <Textarea
                    value={answers[field.id] || ""}
                    onChange={(event) =>
                      updateAnswer(field.id, event.target.value)
                    }
                    placeholder={field.placeholder}
                    rows={4}
                  />
                ) : field.type === "single_choice" ? (
                  <div className="grid gap-2">
                    {(field.options || []).map((option) => (
                      <label
                        key={option}
                        className="flex items-center gap-2 rounded-md border p-3 text-sm"
                      >
                        <input
                          type="radio"
                          name={field.id}
                          value={option}
                          checked={answers[field.id] === option}
                          onChange={() => updateAnswer(field.id, option)}
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                ) : field.type === "multiple_choice" ? (
                  <div className="grid gap-2">
                    {(field.options || []).map((option) => {
                      const selected = Array.isArray(answers[field.id])
                        ? answers[field.id]
                        : [];
                      return (
                        <label
                          key={option}
                          className="flex items-center gap-2 rounded-md border p-3 text-sm"
                        >
                          <Checkbox
                            checked={selected.includes(option)}
                            onCheckedChange={(checked) =>
                              updateAnswer(
                                field.id,
                                checked
                                  ? [...selected, option]
                                  : selected.filter((item: string) => item !== option),
                              )
                            }
                          />
                          {option}
                        </label>
                      );
                    })}
                  </div>
                ) : field.type === "dropdown" ? (
                  <Select
                    value={answers[field.id] || ""}
                    onValueChange={(value) => updateAnswer(field.id, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona" />
                    </SelectTrigger>
                    <SelectContent>
                      {(field.options || []).map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field.type === "checkbox" || field.type === "consent" ? (
                  <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
                    <Checkbox
                      checked={Boolean(answers[field.id])}
                      onCheckedChange={(checked) =>
                        updateAnswer(field.id, Boolean(checked))
                      }
                    />
                    <span>
                      {field.type === "consent"
                        ? field.description || field.label
                        : field.placeholder || "Confermo"}
                    </span>
                  </label>
                ) : field.type === "file_upload" || field.type === "image" ? (
                  <Input
                    type="file"
                    accept={field.validation?.acceptedFileTypes?.join(",")}
                    onChange={(event) => {
                      setFiles((current) => ({
                        ...current,
                        [field.id]: event.target.files?.[0] || null,
                      }));
                      setFieldErrors((current) => ({
                        ...current,
                        [field.id]: "",
                      }));
                    }}
                  />
                ) : field.type === "signature" ? (
                  <SignaturePad
                    value={answers[field.id]}
                    onChange={(value) => updateAnswer(field.id, value)}
                  />
                ) : (
                  <Input
                    type={
                      field.type === "email"
                        ? "email"
                        : field.type === "number"
                          ? "number"
                          : field.type === "date"
                            ? "date"
                            : field.type === "phone"
                              ? "tel"
                              : "text"
                    }
                    min={field.validation?.min}
                    max={field.validation?.max}
                    value={answers[field.id] || ""}
                    onChange={(event) =>
                      updateAnswer(field.id, event.target.value)
                    }
                    placeholder={field.placeholder}
                  />
                )}

                {fieldErrors[field.id] ? (
                  <p className="text-sm text-red-600">{fieldErrors[field.id]}</p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="sticky bottom-0 border-t bg-slate-50 py-4">
          <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Invia risposta
          </Button>
        </div>
      </form>
    </div>
  );
}
