"use client";

import * as React from "react";
import { type AudienceCriterionKind } from "@/lib/audience/criteria";
import type { AudienceOption } from "@/components/communications/audience-events";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { DateInput, Field, FieldSizeProvider, FormGrid, TextInput, Textarea, ValidationSummary } from "@/components/web/forms/Field";
import { InfoCard } from "@/components/web/page/Cards";
import { AudiencePicker, audienceCriteriaPayload, audienceSelectionError } from "@/components/communications/v2/audience-picker";

/**
 * «Nuovo avviso» — il cassetto da 480 (sei campi, un concetto: guideline 08
 * §8.5) che sostituisce la card fissa a sinistra della bacheca V1.
 *
 * La creazione **non pubblica**: un annuncio nasce bozza e diventa pubblico
 * con un secondo gesto dall'elenco. E la ragione per cui il pulsante dice
 * «Salva come bozza», come nella V1.
 */
export type AnnouncementDraft = {
  title: string;
  body: string;
  criteria: Array<{ kind: AudienceCriterionKind; values?: string[] }>;
  publishAt: string | null;
  expiresAt: string | null;
};

export function AnnouncementDrawer<K extends AudienceCriterionKind>({
  open,
  onOpenChange,
  criteria,
  optionsFor,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** I criteri che la bacheca offre (meno di quelli della comunicazione, di proposito). */
  criteria: readonly K[];
  optionsFor: (kind: K) => AudienceOption[];
  onSave: (draft: AnnouncementDraft) => Promise<boolean>;
}) {
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [kind, setKind] = React.useState<K>(criteria[0]);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [publishAt, setPublishAt] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [errors, setErrors] = React.useState<Array<{ id?: string; label: string }>>([]);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) return;
    setTitle("");
    setBody("");
    setKind(criteria[0]);
    setSelected([]);
    setPublishAt("");
    setExpiresAt("");
    setErrors([]);
  }, [open, criteria]);

  const options = optionsFor(kind);
  const dirty = Boolean(title || body || selected.length || publishAt || expiresAt || kind !== criteria[0]);

  const submit = async () => {
    const trovati: Array<{ id?: string; label: string }> = [];
    if (!title.trim()) trovati.push({ id: "avviso-titolo", label: "Un annuncio senza titolo non si pubblica" });
    if (!body.trim()) trovati.push({ id: "avviso-testo", label: "Un annuncio senza testo non si pubblica" });
    const erroreSelezione = audienceSelectionError(kind, selected, options);
    if (erroreSelezione) trovati.push({ id: "avviso-opzioni", label: erroreSelezione });
    if (publishAt && expiresAt && expiresAt <= publishAt) {
      trovati.push({ id: "avviso-scadenza", label: "La scadenza deve venire dopo l'uscita" });
    }
    setErrors(trovati);
    if (trovati.length) return;

    setBusy(true);
    try {
      const ok = await onSave({
        title,
        body,
        criteria: audienceCriteriaPayload(kind, selected),
        publishAt: publishAt || null,
        expiresAt: expiresAt || null,
      });
      if (ok) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const errorFor = (id: string) => errors.find((e) => e.id === id)?.label;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Bacheca"
      title="Nuovo avviso"
      description="Resta in bacheca finche non scade; chi arriva dopo lo trova."
      dirty={dirty}
      locked={busy}
      data-test="announcement-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            Salva come bozza
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <ValidationSummary errors={errors} />

          <DrawerSection eyebrow="Avviso">
            <div className="flex flex-col gap-4">
              <Field label="Titolo" htmlFor="avviso-titolo" required error={errorFor("avviso-titolo")}>
                <TextInput id="avviso-titolo" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Domenica il campo e chiuso" />
              </Field>
              <Field label="Testo" htmlFor="avviso-testo" required error={errorFor("avviso-testo")}>
                <Textarea id="avviso-testo" rows={5} value={body} onChange={(event) => setBody(event.target.value)} />
              </Field>
            </div>
          </DrawerSection>

          <DrawerSection eyebrow="Chi lo legge">
            <div className="flex flex-col gap-4">
              <AudiencePicker
                idPrefix="avviso"
                label="Chi lo legge"
                criteria={criteria}
                kind={kind}
                onKindChange={(next) => {
                  setKind(next);
                  setSelected([]);
                }}
                selected={selected}
                onSelectedChange={setSelected}
                options={options}
                error={errorFor("avviso-opzioni")}
              />
            </div>
          </DrawerSection>

          <DrawerSection eyebrow="Quando">
            <FormGrid>
              <Field label="Esce il" htmlFor="avviso-uscita" width="16ch">
                <DateInput id="avviso-uscita" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} />
              </Field>
              <Field label="Scade il" htmlFor="avviso-scadenza" width="16ch" error={errorFor("avviso-scadenza")}>
                <DateInput id="avviso-scadenza" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
              </Field>
            </FormGrid>
            <InfoCard className="mt-4">
              Senza data esce quando lo pubblichi. Un avviso scaduto non viene cancellato: esce dalla bacheca e resta in archivio.
            </InfoCard>
          </DrawerSection>
        </form>
      </FieldSizeProvider>
    </Drawer>
  );
}
