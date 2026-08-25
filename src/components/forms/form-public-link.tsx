"use client";

import React, { useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { buildPublicFormPath, type FormTemplateDetail } from "@/lib/forms/model";
import * as formsApi from "@/lib/api/forms";

/**
 * Il link pubblico di un modulo.
 *
 * Tre comandi e nient'altro: copia, abilita/disabilita, rigenera.
 *
 * **Perche «rigenera» esiste.** Un link di iscrizione si manda su WhatsApp a
 * duecento famiglie: prima o poi finisce in un gruppo dove non doveva. Senza
 * un modo di invalidarlo, l'unica alternativa sarebbe rifare il modulo da
 * capo e perdere le risposte gia raccolte.
 *
 * **Perche «pubblicato» e «pubblico» sono due interruttori.** Un modulo puo
 * essere in uso — compilato dalla segreteria dalla scheda di un atleta — e
 * non dover rispondere a nessun link. Con un solo stato, pubblicare
 * significherebbe per forza esporre.
 */

type FormPublicLinkProps = {
  template: FormTemplateDetail;
  onTemplateChange: (template: FormTemplateDetail) => void;
};

export function FormPublicLink({
  template,
  onTemplateChange,
}: FormPublicLinkProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const path = buildPublicFormPath(template.publicSlug);
  const fullUrl =
    typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  const enabled = Boolean(template.publicPath);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("error", "Il browser non ha permesso la copia: seleziona il link a mano");
    }
  };

  const run = async (
    operation: () => Promise<FormTemplateDetail>,
    message: string,
  ) => {
    setBusy(true);
    try {
      onTemplateChange(await operation());
      showToast("success", message);
    } catch (error: any) {
      showToast("error", error?.message || "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Label htmlFor="public-link">Link pubblico</Label>
          <p className="text-xs text-slate-500">
            {template.status === "published"
              ? "Chi apre questo link vede la versione pubblicata."
              : "Il link risponde solo quando il modulo e pubblicato."}
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Switch
            checked={enabled}
            disabled={busy}
            aria-label="Abilita il link pubblico"
            onCheckedChange={(checked) =>
              run(
                () => formsApi.setFormPublicAccess(template.id, checked),
                checked ? "Link pubblico attivo" : "Link pubblico disattivato",
              )
            }
          />
          Attivo
        </label>
      </div>

      {/* Il link e lungo: scorre dentro la casella, non allarga la pagina. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="public-link"
          readOnly
          value={fullUrl}
          className="font-mono text-xs"
          onFocus={(event) => event.currentTarget.select()}
        />
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={copy}>
            {copied ? (
              <Check className="mr-2 h-4 w-4 text-emerald-600" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            {copied ? "Copiato" : "Copia"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              run(
                () => formsApi.regenerateFormLink(template.id),
                "Nuovo link generato: il precedente non risponde piu",
              )
            }
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Rigenera
          </Button>
        </div>
      </div>
    </div>
  );
}
