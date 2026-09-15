"use client";

import * as React from "react";
import { Scale } from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { Panel, PanelHeader, Hairline } from "@/components/web/primitives/Surface";
import { Button } from "@/components/web/primitives/Button";
import { Skeleton, Toggle } from "@/components/web/primitives/Controls";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Field, FieldGroup, FormGrid, Select, TextInput } from "@/components/web/forms/Field";
import { formatTime } from "@/lib/web/format";

/**
 * Il **profilo fiscale** della societa (Web V2).
 *
 * **Perche e separato dall'anagrafica.** L'anagrafica risponde a «come si
 * chiama e dove la trovo»; questo pannello risponde a «che soggetto e davanti
 * al fisco». Cambiano in momenti diversi (ADR-0052).
 *
 * **Perche la forma giuridica non compila nulla da sola.** Selezionare «ASD»
 * non imposta un regime, non toglie l'IVA e non decide che documenti si
 * emettono. Qui si **dichiara**; le conseguenze stanno nelle causali.
 *
 * **Il modulo non pretende di essere completo.** Cio che manca lo dice
 * l'avviso in cima, distinguendo fattura e fattura elettronica. Stessi
 * endpoint della V1: `GET`/`PUT /api/v1/fiscal/profile`, un salvataggio per
 * tutto il profilo, con «Salvato · hh:mm» nell'intestazione (08 §8.8).
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

const TEXT_FIELDS: Array<{ key: string; label: string; hint?: string; width?: string; numeric?: boolean }> = [
  { key: "legalName", label: "Ragione sociale" },
  { key: "fiscalCode", label: "Codice fiscale", width: "24ch" },
  { key: "vatNumber", label: "Partita IVA", hint: "Undici cifre", width: "20ch", numeric: true },
  { key: "address", label: "Indirizzo della sede fiscale" },
  { key: "city", label: "Comune" },
  { key: "postalCode", label: "CAP", width: "10ch", numeric: true },
  { key: "province", label: "Provincia", hint: "Due lettere", width: "10ch" },
  { key: "pec", label: "PEC" },
  { key: "recipientCode", label: "Codice destinatario", hint: "Sette caratteri", width: "14ch" },
];

const REA_FIELDS: Array<{ key: string; label: string }> = [
  { key: "reaOffice", label: "Ufficio REA" },
  { key: "reaNumber", label: "Numero REA" },
];

export function FiscalProfilePanel({ organizationId }: { organizationId?: string | null }) {
  const { showToast } = useToast();
  const [view, setView] = React.useState<ProfileView | null>(null);
  const [draft, setDraft] = React.useState<Profile>({});
  const [dirty, setDirty] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const response = await apiRequest<ProfileView>(
      organizationId ? `/api/v1/fiscal/profile?organization_id=${encodeURIComponent(organizationId)}` : "/api/v1/fiscal/profile",
    );
    if (response.error || !response.data) {
      const message = response.error?.message || "Errore nella lettura del profilo fiscale";
      setLoadError(message);
      showToast("error", message);
      setLoading(false);
      return;
    }
    setLoadError(null);
    setView(response.data);
    setDraft(response.data.profile);
    setDirty(false);
    setLoading(false);
  }, [organizationId, showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  /* «Salvato · 14:32» resta quattro secondi (08 §8.8), poi il pannello torna quieto. */
  React.useEffect(() => {
    if (!savedAt) return;
    const timer = setTimeout(() => setSavedAt(null), 4000);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const patch = (updates: Profile) => {
    setDraft((current) => ({ ...current, ...updates }));
    setDirty(true);
  };

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    const response = await apiRequest<ProfileView>("/api/v1/fiscal/profile", { method: "PUT", body: { ...draft, organization_id: organizationId } });
    setSaving(false);
    if (response.error) {
      showToast("error", response.error.message || "Salvataggio non riuscito");
      return;
    }
    showToast("success", "Profilo fiscale aggiornato");
    setSavedAt(new Date());
    await load();
  };

  if (loading && !view) {
    return (
      <Panel as="section" aria-busy aria-label="Profilo fiscale in caricamento">
        <Skeleton className="mb-3 h-3 w-24" />
        <Skeleton className="mb-5 h-5 w-56" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-[46px] w-full" />
          ))}
        </div>
      </Panel>
    );
  }

  if (!view) {
    return (
      <AlertBlock
        severity="danger"
        title="Il profilo fiscale non e stato letto"
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Riprova
          </Button>
        }
      >
        {loadError}
      </AlertBlock>
    );
  }

  const missingInvoicing = view.missing.forInvoicing;
  const missingEInvoicing = view.missing.forEInvoicing;
  const legalForm = String(draft.legalForm || "altro");
  const specialRegimes: string[] = draft.specialRegimes || [];

  return (
    <Panel as="section" id="club-section-profilo-fiscale" aria-labelledby="club-section-profilo-fiscale-title">
      <PanelHeader
        eyebrow="Account e fatturazione"
        title={<span id="club-section-profilo-fiscale-title">Profilo fiscale</span>}
        description="Che soggetto e la societa davanti al fisco: forma giuridica, regime, dati che finiscono in fattura."
        actions={savedAt ? <span className="egw-num font-brand text-[11.5px] font-medium text-egw-green">Salvato · {formatTime(savedAt)}</span> : null}
      />

      <div className="flex flex-col gap-5">
        {missingInvoicing.length || missingEInvoicing.length ? (
          <AlertBlock severity="warning" title="Cosa manca">
            {missingInvoicing.length ? (
              <p>
                Per emettere una <strong>fattura</strong>: {missingInvoicing.join(", ")}.
              </p>
            ) : (
              <p>Il profilo e sufficiente per emettere fatture.</p>
            )}
            {missingEInvoicing.length ? (
              <p>
                Per preparare la <strong>fattura elettronica</strong>: {missingEInvoicing.join(", ")}.
              </p>
            ) : null}
            <p className="mt-1 text-[11.5px]">Un profilo incompleto non blocca le ricevute: quelle si emettono con i dati che ci sono.</p>
          </AlertBlock>
        ) : null}

        <FieldGroup eyebrow="Natura del soggetto" columns={2}>
          <Field label="Forma giuridica" htmlFor="legal-form" helper={view.vocabularies.legalForms.find((form) => form.key === legalForm)?.description || undefined}>
            <Select id="legal-form" value={legalForm} onValueChange={(value) => patch({ legalForm: value })} options={view.vocabularies.legalForms.map((form) => ({ value: form.key, label: form.label }))} />
          </Field>
          <Field label="Regime fiscale" htmlFor="tax-regime" helper="Non viene proposto: un regime fiscale scelto da un software e un regime fiscale che nessuno ha letto.">
            <Select id="tax-regime" value={String(draft.taxRegimeCode || "")} onValueChange={(value) => patch({ taxRegimeCode: value })} options={view.vocabularies.taxRegimes.map((regime) => ({ value: regime.code, label: regime.label }))} placeholder="Non dichiarato" />
          </Field>
          <div className="md:col-span-2">
            <p className="mb-2 font-brand text-[12px] font-semibold text-egw-ink-62">Regimi speciali dichiarati</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Regimi speciali dichiarati">
              {view.vocabularies.specialRegimes.map((regime) => {
                const selected = specialRegimes.includes(regime.key);
                return (
                  <button
                    key={regime.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => patch({ specialRegimes: selected ? specialRegimes.filter((entry) => entry !== regime.key) : [...specialRegimes, regime.key] })}
                    className="rounded-egw-chip focus-visible:outline-none focus-visible:shadow-egw-focus"
                  >
                    <DataChip tone={selected ? "navy" : "neutral"}>{regime.label}</DataChip>
                  </button>
                );
              })}
            </div>
          </div>
        </FieldGroup>

        <FieldGroup eyebrow="Dati fiscali" columns={3}>
          {TEXT_FIELDS.map((field) => (
            <Field key={field.key} label={field.label} htmlFor={`fiscal-${field.key}`} helper={field.hint} width={field.width}>
              <TextInput id={`fiscal-${field.key}`} value={String(draft[field.key] || "")} onChange={(event) => patch({ [field.key]: event.target.value })} className={field.numeric ? "egw-num" : undefined} inputMode={field.numeric ? "numeric" : undefined} />
            </Field>
          ))}
        </FieldGroup>

        <FieldGroup
          eyebrow={
            <span className="inline-flex items-center gap-2">
              Registro imprese <DataChip size="sm">solo se iscritti</DataChip>
            </span>
          }
          columns={2}
        >
          {REA_FIELDS.map((field) => (
            <Field key={field.key} label={field.label} htmlFor={`fiscal-${field.key}`}>
              <TextInput id={`fiscal-${field.key}`} value={String(draft[field.key] || "")} onChange={(event) => patch({ [field.key]: event.target.value })} />
            </Field>
          ))}
        </FieldGroup>

        <FieldGroup eyebrow="Imposta di bollo" columns={2}>
          <div className="flex items-start justify-between gap-4 md:col-span-2">
            <div className="min-w-0">
              <label htmlFor="stamp-duty" className="font-brand text-[13px] font-semibold text-egw-ink">
                Applica il bollo sopra la soglia
              </label>
              <p className="mt-0.5 font-brand text-[11.5px] leading-[1.45] text-egw-ink-62">
                Spento per impostazione predefinita: applicarlo e una decisione del soggetto e del suo regime, non una conseguenza di aver installato un gestionale.
              </p>
              <p className="mt-1.5">
                <StatusPill status={draft.stampDuty?.enabled ? { label: "ATTIVO", weight: "solid", hue: "green" } : { label: "NON APPLICATO", weight: "quiet", hue: "neutral" }} size="sm" />
              </p>
            </div>
            <Toggle id="stamp-duty" checked={Boolean(draft.stampDuty?.enabled)} onCheckedChange={(checked) => patch({ stampDuty: { ...(draft.stampDuty || {}), enabled: checked } })} aria-label="Applica imposta di bollo" />
          </div>
          <Field label="Soglia (centesimi)" htmlFor="stamp-threshold" width="14ch">
            <TextInput id="stamp-threshold" numeric inputMode="numeric" value={String(draft.stampDuty?.thresholdCents ?? 7745)} onChange={(event) => patch({ stampDuty: { ...(draft.stampDuty || {}), thresholdCents: Number(event.target.value) || 0 } })} />
          </Field>
          <Field label="Importo (centesimi)" htmlFor="stamp-amount" width="14ch">
            <TextInput id="stamp-amount" numeric inputMode="numeric" value={String(draft.stampDuty?.amountCents ?? 200)} onChange={(event) => patch({ stampDuty: { ...(draft.stampDuty || {}), amountCents: Number(event.target.value) || 0 } })} />
          </Field>
        </FieldGroup>

        <Hairline />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="inline-flex items-start gap-1.5 font-brand text-[11.5px] leading-[1.45] text-egw-ink-62">
            <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />I documenti gia emessi non cambiano: portano con se i dati del giorno in cui sono stati emessi.
          </p>
          <div className="flex items-center gap-2.5">
            {dirty ? <span className="font-brand text-[12px] font-medium text-egw-amber-ink">Modifiche non salvate</span> : null}
            <Button variant="neutral" onClick={() => void save()} loading={saving}>
              Salva profilo fiscale
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
