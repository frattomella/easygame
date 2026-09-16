"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { Button as WebButton } from "@/components/web/primitives/Button";
import { AlertBlock } from "@/components/web/page/Alerts";
import { OutsideShell, OutsideStatus } from "@/components/web/shell/OutsideShell";
import { SkyProvider } from "@/components/web/primitives/Surface";
import { FormRenderer } from "@/components/forms/form-renderer";
import { normalizeFormSchema, type FormSchema } from "@/lib/forms/model";
import { buildEnrollmentReceiptPath } from "@/lib/forms/enrollment-receipt";

/**
 * **L'integrazione di una pratica** (`/iscrizione/[reference]/integra`,
 * ADR-0189 §4, ADR-0191 §1).
 *
 * Il club ha chiesto di correggere alcuni campi: qui si vedono tutti, ma si
 * modificano **solo** quelli chiesti (gli altri sono bloccati con la
 * risposta data). La credenziale e la ricevuta, la stessa che apre lo stato;
 * il server rifiuta ogni cambiamento fuori dall'elenco. Al reinvio la copia
 * precedente resta nelle revisioni e la pratica torna in coda.
 */

type Contesto = {
  clubName: string;
  templateTitle: string;
  schema: FormSchema;
  answers: Record<string, unknown>;
  files: Array<{ fieldId: string; fileName: string }>;
  allowedFieldIds: string[];
  note: string;
  revision: number;
  publicSlug: string;
};

export function PublicEnrollmentRevisionPage({ reference }: { reference: string }) {
  const [contesto, setContesto] = useState<Contesto | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState("");
  const [done, setDone] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/public/enrollment-status/${encodeURIComponent(reference)}/revision`, {
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.error) {
        setContesto(null);
        setFailure(body?.error?.message || "Pratica non disponibile");
        return;
      }
      const data = body.data as Contesto;
      setContesto({ ...data, schema: normalizeFormSchema(data.schema) });
      setValues(data.answers || {});
      setFailure("");
    } catch {
      setFailure("Non riesco a caricare la pratica. Controlla la connessione.");
    } finally {
      setLoading(false);
    }
  }, [reference]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!contesto || sending) return;
    setSending(true);
    setErrors({});
    setFailure("");
    try {
      const body = new FormData();
      const consentiti = new Set(contesto.allowedFieldIds);
      const answers: Record<string, unknown> = {};
      for (const id of consentiti) if (id in values) answers[id] = values[id];
      body.append("payload", JSON.stringify({ answers }));
      for (const [fieldId, file] of Object.entries(files)) {
        if (file && consentiti.has(fieldId)) body.append(`file:${fieldId}`, file, file.name);
      }
      const response = await fetch(`/api/public/enrollment-status/${encodeURIComponent(reference)}/revision`, {
        method: "POST",
        body,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.error) {
        setErrors(result?.data?.errors || {});
        setFailure(result?.error?.message || "Reinvio non riuscito.");
        return;
      }
      setDone(Number(result.data?.revision) || contesto.revision + 1);
    } catch {
      setFailure("Reinvio non riuscito. Controlla la connessione e riprova.");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <OutsideShell width="form">
        <OutsideStatus icon={<Send />} title="Integrazione" description="Un momento: carico la pratica." busy busyLabel="Carico la pratica…" />
      </OutsideShell>
    );
  }

  if (!contesto) {
    return (
      <OutsideShell width="form">
        <OutsideStatus
          icon={<Send />}
          tone="amber"
          title="Integrazione non disponibile"
          description={failure || "La pratica non aspetta un'integrazione, oppure il link non e valido."}
        />
      </OutsideShell>
    );
  }

  if (done) {
    return (
      <OutsideShell width="form">
        <OutsideStatus
          icon={<CheckCircle2 />}
          tone="green"
          title="Integrazione inviata"
          description={`La pratica e tornata alla societa (revisione ${done}). Puoi seguirla dalla ricevuta.`}
        />
        <div className="text-center">
          <a href={buildEnrollmentReceiptPath(reference)} className="mt-4 inline-block text-sm font-medium text-egw-blue-800 underline underline-offset-2">
            Torna alla ricevuta
          </a>
        </div>
      </OutsideShell>
    );
  }

  const existingFiles = Object.fromEntries(contesto.files.map((file) => [file.fieldId, file.fileName]));

  return (
    <OutsideShell width="wide" bare>
      <SkyProvider onSky={false}>
      <div className="w-full">
        <header className="rounded-t-egw-panel border border-b-0 border-white/60 bg-white p-5 shadow-egw-plane-2">
          <p className="font-brand text-sm font-semibold text-egw-ink-72">{contesto.clubName}</p>
          <h1 className="mt-2 font-brand text-xl font-semibold text-egw-ink sm:text-2xl">{contesto.templateTitle}</h1>
          <div className="mt-4 rounded-egw-control border border-egw-tint-orange-bd bg-egw-tint-orange p-4" data-test="changes-requested">
            <p className="text-sm font-semibold text-egw-ink">Il club richiede queste integrazioni</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-egw-ink">
              {contesto.allowedFieldIds.map((id) => {
                const field = contesto.schema.fields.find((f) => f.id === id);
                return field ? <li key={id}>{field.label}</li> : null;
              })}
            </ul>
            {contesto.note ? <p className="mt-2 text-sm text-egw-ink-72">{contesto.note}</p> : null}
            <p className="mt-2 text-xs text-egw-ink-62">Gli altri campi restano come li hai inviati e non si possono cambiare da qui.</p>
          </div>
        </header>

        <form onSubmit={submit} className="space-y-6 rounded-b-egw-panel border border-t-0 border-white/60 bg-white p-5 shadow-egw-plane-2">
          <FormRenderer
            fields={contesto.schema.fields}
            values={values}
            files={files}
            errors={errors}
            editableFieldIds={contesto.allowedFieldIds}
            existingFiles={existingFiles}
            assetBase={contesto.publicSlug ? `/api/public/forms/${encodeURIComponent(contesto.publicSlug)}/assets` : ""}
            onChange={(fieldId, value) => {
              setValues((current) => ({ ...current, [fieldId]: value }));
              setErrors((current) => ({ ...current, [fieldId]: "" }));
            }}
            onFileChange={(fieldId, file) => {
              setFiles((current) => ({ ...current, [fieldId]: file }));
              setErrors((current) => ({ ...current, [fieldId]: "" }));
            }}
          />

          {failure ? <AlertBlock severity="danger" role="alert" title={failure} /> : null}

          <div className="sticky bottom-0 -mx-5 -mb-5 rounded-b-egw-panel border-t border-egw-hairline bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:mx-0 sm:mb-0 sm:rounded-egw-control sm:border">
            <WebButton type="submit" variant="primary" loading={sending} icon={<Send />} className="min-h-[44px] w-full">
              Reinvia la pratica
            </WebButton>
          </div>
        </form>

        <p className="py-4 text-center text-[11.5px] text-white/70">Modulo gestito con EasyGame</p>
      </div>
      </SkyProvider>
    </OutsideShell>
  );
}
