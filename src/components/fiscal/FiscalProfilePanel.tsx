"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Info, Loader2, Save, Scale } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";

/**
 * Il **profilo fiscale** della societa.
 *
 * **Perche e separato dall'anagrafica.** L'anagrafica risponde a «come si
 * chiama e dove la trovo»; questa scheda risponde a «che soggetto e davanti al
 * fisco». Cambiano in momenti diversi: si cambia recapito senza cambiare forma
 * giuridica, e si cambia regime senza traslocare.
 *
 * **Perche la forma giuridica non compila nulla da sola.** Selezionare «ASD»
 * non imposta un regime, non toglie l'IVA e non decide che documenti si
 * emettono. Due ASD possono avere trattamenti diversi, e un software che li
 * indovina fa sbagliare qualcuno con sicurezza. Qui si **dichiara**; le
 * conseguenze stanno nella configurazione dei tipi di operazione, dove
 * qualcuno le ha scritte di proposito (ADR-0052).
 *
 * **Il modulo non pretende di essere completo.** Un profilo a meta e la
 * condizione normale di chi sta configurando: cio che manca lo dice il
 * riquadro in cima, e lo dice **distinguendo** cosa serve per una fattura da
 * cosa serve per la fattura elettronica, che non sono la stessa cosa.
 */

type Vocabularies = {
  legalForms: Array<{ key: string; label: string; description: string }>;
  taxRegimes: Array<{ code: string; label: string }>;
  specialRegimes: Array<{ key: string; label: string }>;
};

type Profile = Record<string, any>;

type ProfileView = {
  profile: Profile;
  missing: { forInvoicing: string[]; forEInvoicing: string[] };
  vocabularies: Vocabularies;
};

const TEXT_FIELDS: Array<{ key: string; label: string; hint?: string }> = [
  { key: "legalName", label: "Ragione sociale" },
  { key: "fiscalCode", label: "Codice fiscale" },
  { key: "vatNumber", label: "Partita IVA", hint: "Undici cifre" },
  { key: "address", label: "Indirizzo della sede fiscale" },
  { key: "city", label: "Comune" },
  { key: "postalCode", label: "CAP" },
  { key: "province", label: "Provincia", hint: "Due lettere" },
  { key: "pec", label: "PEC" },
  { key: "recipientCode", label: "Codice destinatario", hint: "Sette caratteri" },
];

const REA_FIELDS: Array<{ key: string; label: string }> = [
  { key: "reaOffice", label: "Ufficio REA" },
  { key: "reaNumber", label: "Numero REA" },
];

export function FiscalProfilePanel({
  organizationId,
}: {
  organizationId?: string | null;
}) {
  const { showToast } = useToast();
  const [view, setView] = useState<ProfileView | null>(null);
  const [draft, setDraft] = useState<Profile>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const response = await apiRequest<ProfileView>(
      organizationId
        ? `/api/v1/fiscal/profile?organization_id=${encodeURIComponent(organizationId)}`
        : "/api/v1/fiscal/profile",
    );

    if (response.error || !response.data) {
      showToast(
        "error",
        response.error?.message || "Errore nella lettura del profilo fiscale",
      );
      setLoading(false);
      return;
    }

    setView(response.data);
    setDraft(response.data.profile);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const patch = (updates: Profile) =>
    setDraft((current) => ({ ...current, ...updates }));

  const save = async () => {
    setSaving(true);
    const response = await apiRequest<ProfileView>("/api/v1/fiscal/profile", {
      method: "PUT",
      body: { ...draft, organization_id: organizationId },
    });
    setSaving(false);

    if (response.error) {
      showToast("error", response.error.message || "Salvataggio non riuscito");
      return;
    }

    showToast("success", "Profilo fiscale aggiornato");
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Caricamento profilo fiscale…
      </div>
    );
  }

  if (!view) return null;

  const missingInvoicing = view.missing.forInvoicing;
  const missingEInvoicing = view.missing.forEInvoicing;

  return (
    <div className="space-y-4">
      {missingInvoicing.length || missingEInvoicing.length ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Cosa manca</AlertTitle>
          <AlertDescription className="space-y-1">
            {missingInvoicing.length ? (
              <p>
                Per emettere una <strong>fattura</strong>:{" "}
                {missingInvoicing.join(", ")}.
              </p>
            ) : (
              <p>Il profilo e sufficiente per emettere fatture.</p>
            )}
            {missingEInvoicing.length ? (
              <p>
                Per preparare la <strong>fattura elettronica</strong>:{" "}
                {missingEInvoicing.join(", ")}.
              </p>
            ) : null}
            <p className="text-xs">
              Un profilo incompleto non blocca le ricevute: quelle si emettono
              con i dati che ci sono.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-5 w-5" />
            Natura del soggetto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="legal-form">Forma giuridica</Label>
              <Select
                value={String(draft.legalForm || "altro")}
                onValueChange={(value) => patch({ legalForm: value })}
              >
                <SelectTrigger id="legal-form">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {view.vocabularies.legalForms.map((form) => (
                    <SelectItem key={form.key} value={form.key}>
                      {form.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {view.vocabularies.legalForms.find(
                  (form) => form.key === String(draft.legalForm || "altro"),
                )?.description || ""}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax-regime">Regime fiscale</Label>
              <Select
                value={String(draft.taxRegimeCode || "")}
                onValueChange={(value) => patch({ taxRegimeCode: value })}
              >
                <SelectTrigger id="tax-regime">
                  <SelectValue placeholder="Non dichiarato" />
                </SelectTrigger>
                <SelectContent>
                  {view.vocabularies.taxRegimes.map((regime) => (
                    <SelectItem key={regime.code} value={regime.code}>
                      {regime.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Non viene proposto: un regime fiscale scelto da un software e un
                regime fiscale che nessuno ha letto.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Regimi speciali dichiarati</Label>
            <div className="flex flex-wrap gap-2">
              {view.vocabularies.specialRegimes.map((regime) => {
                const selected = (draft.specialRegimes || []).includes(
                  regime.key,
                );

                return (
                  <Button
                    key={regime.key}
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    onClick={() =>
                      patch({
                        specialRegimes: selected
                          ? (draft.specialRegimes || []).filter(
                              (entry: string) => entry !== regime.key,
                            )
                          : [...(draft.specialRegimes || []), regime.key],
                      })
                    }
                  >
                    {regime.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dati fiscali</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEXT_FIELDS.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`fiscal-${field.key}`}>{field.label}</Label>
              <Input
                id={`fiscal-${field.key}`}
                value={String(draft[field.key] || "")}
                onChange={(event) => patch({ [field.key]: event.target.value })}
              />
              {field.hint ? (
                <p className="text-xs text-muted-foreground">{field.hint}</p>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Registro Imprese
            <Badge variant="secondary" className="ml-2 font-normal">
              solo se iscritti
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {REA_FIELDS.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`fiscal-${field.key}`}>{field.label}</Label>
              <Input
                id={`fiscal-${field.key}`}
                value={String(draft[field.key] || "")}
                onChange={(event) => patch({ [field.key]: event.target.value })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Imposta di bollo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Applica il bollo sopra la soglia</Label>
              <p className="text-xs text-muted-foreground">
                Spento per impostazione predefinita: applicarlo e una decisione
                del soggetto e del suo regime, non una conseguenza di aver
                installato un gestionale.
              </p>
            </div>
            <Switch
              checked={Boolean(draft.stampDuty?.enabled)}
              onCheckedChange={(checked) =>
                patch({
                  stampDuty: { ...(draft.stampDuty || {}), enabled: checked },
                })
              }
              aria-label="Applica imposta di bollo"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="stamp-threshold">Soglia (centesimi)</Label>
              <Input
                id="stamp-threshold"
                inputMode="numeric"
                value={String(draft.stampDuty?.thresholdCents ?? 7745)}
                onChange={(event) =>
                  patch({
                    stampDuty: {
                      ...(draft.stampDuty || {}),
                      thresholdCents: Number(event.target.value) || 0,
                    },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stamp-amount">Importo (centesimi)</Label>
              <Input
                id="stamp-amount"
                inputMode="numeric"
                value={String(draft.stampDuty?.amountCents ?? 200)}
                onChange={(event) =>
                  patch({
                    stampDuty: {
                      ...(draft.stampDuty || {}),
                      amountCents: Number(event.target.value) || 0,
                    },
                  })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salva profilo fiscale
        </Button>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />I documenti gia emessi non cambiano:
          portano con se i dati del giorno in cui sono stati emessi.
        </p>
      </div>
    </div>
  );
}
