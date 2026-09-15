"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Field, FieldSizeProvider, TextInput, Textarea, ValidationSummary } from "@/components/web/forms/Field";
import { Checkbox } from "@/components/web/primitives/Controls";
import { Button } from "@/components/web/primitives/Button";
import { InfoCard } from "@/components/web/page/Cards";
import { explainConsentKeyDenial, normalizeConsentKey } from "@/lib/consents/model";
import type { Definizione } from "@/components/consensi/v2/consensi-model";

/**
 * «Definisci un consenso» (guideline 08 §8.5: quattro campi, un cassetto da
 * 480). Sostituisce la card in colonna della V1 con gli stessi campi —
 * chiave, titolo, descrizione, «segnala chi non lo ha dato» — e la stessa
 * regola: chiave e titolo sono obbligatori, la chiave la citano moduli e
 * modelli e dopo non si cambia. Nasce in bozza: si pubblica il testo, e da li
 * si raccolgono decisioni.
 */
export type NewConsentValues = { key: string; title: string; description: string; required: boolean };

export function NewConsentDrawer({
  open,
  onOpenChange,
  onCreate,
  creating,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (values: NewConsentValues) => Promise<void>;
  creating?: boolean;
}) {
  const [nuovaChiave, setNuovaChiave] = React.useState("");
  const [nuovoTitolo, setNuovoTitolo] = React.useState("");
  const [nuovaDescrizione, setNuovaDescrizione] = React.useState("");
  const [nuovoObbligatorio, setNuovoObbligatorio] = React.useState(false);
  const [errors, setErrors] = React.useState<Array<{ id?: string; label: string }>>([]);
  const keyId = React.useId();
  const titleId = React.useId();
  const descriptionId = React.useId();
  const requiredId = React.useId();

  React.useEffect(() => {
    if (open) {
      setNuovaChiave("");
      setNuovoTitolo("");
      setNuovaDescrizione("");
      setNuovoObbligatorio(false);
      setErrors([]);
    }
  }, [open]);

  const dirty = Boolean(nuovaChiave.trim() || nuovoTitolo.trim() || nuovaDescrizione.trim() || nuovoObbligatorio);
  const errorFor = (id: string) => errors.find((e) => e.id === id)?.label;

  const submit = async () => {
    const found: Array<{ id: string; label: string }> = [];
    if (!nuovaChiave.trim() || !nuovoTitolo.trim()) {
      if (!nuovaChiave.trim()) found.push({ id: keyId, label: "Chiave e titolo sono obbligatori" });
      if (!nuovoTitolo.trim()) found.push({ id: titleId, label: "Chiave e titolo sono obbligatori" });
    } else {
      const keyDenial = explainConsentKeyDenial(nuovaChiave);
      if (keyDenial) found.push({ id: keyId, label: keyDenial });
    }
    setErrors(found);
    if (found.length) return;
    await onCreate({ key: normalizeConsentKey(nuovaChiave), title: nuovoTitolo.trim(), description: nuovaDescrizione.trim(), required: nuovoObbligatorio });
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Consensi del club"
      title="Definisci un consenso"
      description="Nasce in bozza: si pubblica il testo, e da lì si raccolgono le decisioni."
      dirty={dirty && !creating}
      locked={creating}
      data-test="new-consent-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={creating}>
            Crea in bozza
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={creating}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <ValidationSummary errors={errors.filter((e, i, all) => all.findIndex((x) => x.label === e.label) === i)} className="mb-5" />
        <DrawerSection>
          <div className="flex flex-col gap-5">
            <Field label="Chiave" htmlFor={keyId} required error={errorFor(keyId)} helper="Minuscole, cifre, trattino. La citano i moduli e i modelli: dopo non si cambia.">
              <TextInput id={keyId} value={nuovaChiave} onChange={(event) => setNuovaChiave(event.target.value)} placeholder="images" autoFocus className="egw-num" />
            </Field>
            <Field label="Titolo" htmlFor={titleId} required error={errorFor(titleId)}>
              <TextInput id={titleId} value={nuovoTitolo} onChange={(event) => setNuovoTitolo(event.target.value)} placeholder="Consenso immagini" />
            </Field>
            <Field label="Descrizione" htmlFor={descriptionId} optional>
              <TextInput id={descriptionId} value={nuovaDescrizione} onChange={(event) => setNuovaDescrizione(event.target.value)} />
            </Field>
            <label htmlFor={requiredId} className="flex cursor-pointer items-center gap-2.5 font-brand text-[13px] text-egw-ink">
              <Checkbox id={requiredId} checked={nuovoObbligatorio} onChange={(event) => setNuovoObbligatorio(event.target.checked)} />
              Segnala chi non lo ha dato
            </label>
          </div>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}

/**
 * «Pubblica un testo nuovo»: una versione pubblicata non si modifica piu; i
 * consensi gia raccolti restano validi e vengono segnalati come dati su una
 * versione precedente. Il testo e obbligatorio.
 */
export function PublishConsentTextDrawer({
  open,
  onOpenChange,
  definizione,
  onPublish,
  publishing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definizione: Definizione | null;
  onPublish: (text: string) => Promise<void>;
  publishing?: boolean;
}) {
  const [testo, setTesto] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const textId = React.useId();

  React.useEffect(() => {
    if (open) {
      setTesto("");
      setError(null);
    }
  }, [open, definizione?.id]);

  const nextVersion = (definizione?.publishedVersion || 0) + 1;

  const submit = async () => {
    if (!testo.trim()) {
      setError("Il testo del consenso non può essere vuoto");
      return;
    }
    setError(null);
    await onPublish(testo);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow={definizione?.title || "Consenso"}
      title="Pubblica un testo nuovo"
      description={`Diventa la versione ${nextVersion}: è quella che le famiglie leggeranno e accetteranno.`}
      dirty={Boolean(testo.trim()) && !publishing}
      locked={publishing}
      data-test="publish-consent-text-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={publishing}>
            Pubblica versione {nextVersion}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={publishing}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <DrawerSection>
          <InfoCard eyebrow="Cosa succede">
            Una versione pubblicata non si modifica più. I consensi già raccolti restano validi e vengono segnalati come dati su una
            versione precedente.
          </InfoCard>
        </DrawerSection>
        <DrawerSection>
          <Field label="Testo del consenso" htmlFor={textId} required error={error}>
            <Textarea id={textId} value={testo} onChange={(event) => setTesto(event.target.value)} rows={8} placeholder="Autorizzo la pubblicazione di foto e video…" className="min-h-[200px]" />
          </Field>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}
