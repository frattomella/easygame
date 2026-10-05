"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { Button } from "@/components/web/primitives/Button";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Field, FormGrid, TextInput } from "@/components/web/forms/Field";
import { useToast } from "@/components/ui/toast-notification";
import { cn } from "@/lib/utils";
import { websiteApi, type TemplateSummaryDto } from "@/lib/website/client";
import { ListSkeleton } from "./admin-ui";

/**
 * **La creazione del sito in tre passi** (ADR-0200 §9): template, nome e
 * colori, conferma. Il dominio non serve per iniziare: si lavora in
 * anteprima privata e lo si collega quando si e pronti.
 */

const STEPS = ["Template", "Nome e colori", "Conferma"] as const;

const HEX = /^#[0-9a-f]{6}$/i;

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label} htmlFor={id} helper="Clicca il quadrato per scegliere, oppure scrivi il codice esadecimale.">
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={HEX.test(value) ? value : "#000000"}
          onChange={(event) => onChange(event.target.value)}
          className="h-[46px] w-14 shrink-0 cursor-pointer rounded-egw-field border border-egw-field-border bg-white p-1"
        />
        <TextInput
          aria-label={`${label} (codice)`}
          value={value}
          maxLength={7}
          onChange={(event) => onChange(event.target.value)}
          className="egw-num"
        />
      </div>
    </Field>
  );
}

export function OnboardingWizard({ onCreated }: { onCreated: () => Promise<void> }) {
  const { showToast } = useToast();
  const [templates, setTemplates] = React.useState<TemplateSummaryDto[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [step, setStep] = React.useState(0);
  const [templateKey, setTemplateKey] = React.useState<string | null>(null);
  const [displayName, setDisplayName] = React.useState("");
  const [primaryColor, setPrimaryColor] = React.useState("#1d4ed8");
  const [secondaryColor, setSecondaryColor] = React.useState("#0b1b3f");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void websiteApi.templates().then((result) => {
      if (result.error) setLoadError(result.error.message);
      else setTemplates(result.data);
    });
  }, []);

  const chosen = templates?.find((template) => template.key === templateKey) ?? null;

  const choose = (template: TemplateSummaryDto) => {
    setTemplateKey(template.key);
    setPrimaryColor(template.preview.colors[0]);
    setSecondaryColor(template.preview.colors[1]);
  };

  const colorsValid = HEX.test(primaryColor) && HEX.test(secondaryColor);

  const create = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    const result = await websiteApi.create({
      templateKey: chosen.key,
      displayName: displayName.trim() || undefined,
      primaryColor,
      secondaryColor,
    });
    if (result.error) {
      setBusy(false);
      setError(result.error.message);
      return;
    }
    showToast("success", "Il sito e stato creato: ora puoi modificarlo in anteprima");
    await onCreated();
    setBusy(false);
  };

  return (
    <Panel as="section">
      <PanelHeader
        eyebrow="Crea il sito"
        title="Il sito della societa in pochi passi"
        description="Scegli un punto di partenza: pagine, menu e stile si cambiano tutti dopo. Il dominio non serve adesso — lavori in anteprima privata e lo colleghi quando sei pronto."
      />
      <ol className="mb-5 flex flex-wrap gap-2" aria-label="Passi della creazione">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-egw-pill border px-3 py-1 text-[12px] font-semibold",
              index === step ? "border-egw-blue bg-egw-tint-blue text-egw-blue-800" : index < step ? "border-egw-tint-green-bd bg-egw-tint-green text-egw-green" : "border-egw-hairline text-egw-ink-62",
            )}
          >
            {index < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span aria-hidden>{index + 1}</span>}
            {label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        loadError ? (
          <AlertBlock severity="danger" title="I template non si possono caricare">{loadError}</AlertBlock>
        ) : !templates ? (
          <ListSkeleton rows={2} />
        ) : (
          <div role="radiogroup" aria-label="Template" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {templates.map((template) => {
              const selected = template.key === templateKey;
              return (
                <button
                  key={template.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${template.label}: ${template.description}`}
                  onClick={() => choose(template)}
                  className={cn(
                    "flex flex-col rounded-egw-field border bg-white p-4 text-left transition-colors focus-visible:outline-none focus-visible:shadow-egw-focus",
                    selected ? "border-[1.5px] border-egw-blue shadow-egw-focus" : "border-egw-hairline hover:border-egw-control-border",
                  )}
                >
                  <div className="mb-3 flex h-16 overflow-hidden rounded-md" aria-hidden>
                    {template.preview.colors.map((color) => (
                      <span key={color} className="flex-1" style={{ background: color }} />
                    ))}
                  </div>
                  <span className="text-[14px] font-bold text-egw-ink">{template.label}</span>
                  <span className="mt-1 text-[12px] leading-[1.5] text-egw-ink-62">{template.description}</span>
                  <span className="mt-2 text-[11.5px] text-egw-ink-42">
                    Titoli in {template.preview.headingFont} · {template.pageCount} pagine
                  </span>
                </button>
              );
            })}
          </div>
        )
      ) : null}

      {step === 1 ? (
        <FormGrid>
          <Field label="Nome del sito" htmlFor="wizard-name" optional helper="Vuoto = la denominazione della societa dall'anagrafica.">
            <TextInput id="wizard-name" value={displayName} maxLength={120} onChange={(event) => setDisplayName(event.target.value)} placeholder="Es. Fortitudo Basket" />
          </Field>
          <div className="hidden laptop:block" />
          <ColorField id="wizard-primary" label="Colore principale" value={primaryColor} onChange={setPrimaryColor} />
          <ColorField id="wizard-secondary" label="Colore secondario" value={secondaryColor} onChange={setSecondaryColor} />
          {!colorsValid ? (
            <p role="alert" className="text-[12px] font-medium text-egw-red laptop:col-span-2">Scrivi i colori nel formato #RRGGBB.</p>
          ) : null}
        </FormGrid>
      ) : null}

      {step === 2 && chosen ? (
        <div className="space-y-3">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-egw-field border border-egw-hairline bg-egw-page-100 p-3">
              <dt className="text-[11.5px] text-egw-ink-62">Template</dt>
              <dd className="mt-1 text-[13.5px] font-semibold text-egw-ink">{chosen.label}</dd>
            </div>
            <div className="rounded-egw-field border border-egw-hairline bg-egw-page-100 p-3">
              <dt className="text-[11.5px] text-egw-ink-62">Nome</dt>
              <dd className="mt-1 text-[13.5px] font-semibold text-egw-ink">{displayName.trim() || "Denominazione della societa"}</dd>
            </div>
            <div className="rounded-egw-field border border-egw-hairline bg-egw-page-100 p-3">
              <dt className="text-[11.5px] text-egw-ink-62">Colori</dt>
              <dd className="mt-1 flex items-center gap-2">
                <span className="h-6 w-6 rounded border border-egw-hairline" style={{ background: primaryColor }} aria-label={`Principale ${primaryColor}`} />
                <span className="h-6 w-6 rounded border border-egw-hairline" style={{ background: secondaryColor }} aria-label={`Secondario ${secondaryColor}`} />
              </dd>
            </div>
          </dl>
          <p className="text-[12.5px] text-egw-ink-72">
            Creiamo {chosen.pageCount} pagine di partenza, il menu e lo stile. Niente e pubblico finche non premi «Pubblica».
          </p>
          {error ? <AlertBlock severity="danger" title="Il sito non e stato creato">{error}</AlertBlock> : null}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || busy}>
          Indietro
        </Button>
        {step < 2 ? (
          <Button
            variant="primary"
            trailingIcon={<ArrowRight className="h-4 w-4" />}
            onClick={() => setStep((current) => current + 1)}
            disabled={(step === 0 && !chosen) || (step === 1 && !colorsValid)}
          >
            Avanti
          </Button>
        ) : (
          <Button variant="primary" icon={<Sparkles className="h-4 w-4" />} onClick={() => void create()} loading={busy}>
            Crea il sito
          </Button>
        )}
      </div>
    </Panel>
  );
}
