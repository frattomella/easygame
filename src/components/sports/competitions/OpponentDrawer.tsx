"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Field, FormGrid, TextInput } from "@/components/web/forms/Field";
import { MediaField } from "@/components/website/admin/MediaPicker";
import { useToast } from "@/components/ui/toast-notification";
import { sportsApi, type OpponentDto } from "@/lib/sports/client";
import type { WebsiteMediaAvailability } from "@/components/sports/useWebsiteMediaAvailability";

/**
 * **Crea o modifica un avversario** (ADR-0200 §8). Scrive solo da
 * `POST /api/v1/opponents`; il nome e unico nel club e il server lo dice.
 * Scegliere l'avversario in una gara allinea anche il testo storico della gara.
 */

type OpponentDraft = { name: string; shortName: string; city: string; websiteUrl: string; logoMediaId: string | null };

const draftFrom = (opponent: OpponentDto | null): OpponentDraft => ({
  name: opponent?.name || "",
  shortName: opponent?.shortName || "",
  city: opponent?.city || "",
  websiteUrl: opponent?.websiteUrl || "",
  logoMediaId: opponent?.logoMediaId || null,
});

export type OpponentDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opponent: OpponentDto | null;
  media: WebsiteMediaAvailability;
  onSaved: (opponent: OpponentDto) => void;
};

export function OpponentDrawer({ open, onOpenChange, opponent, media, onSaved }: OpponentDrawerProps) {
  const { showToast } = useToast();
  const [draft, setDraft] = React.useState<OpponentDraft>(() => draftFrom(opponent));
  const [initial, setInitial] = React.useState(() => JSON.stringify(draftFrom(opponent)));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [nameError, setNameError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const next = draftFrom(opponent);
    setDraft(next);
    setInitial(JSON.stringify(next));
    setError(null);
    setNameError(null);
  }, [open, opponent]);

  const update = (patch: Partial<OpponentDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const dirty = JSON.stringify(draft) !== initial;

  const handleSave = async () => {
    if (saving) return;
    const name = draft.name.trim();
    setNameError(name ? null : "Dai un nome all'avversario");
    if (!name) return;
    setSaving(true);
    setError(null);
    const response = await sportsApi.saveOpponent({
      ...(opponent ? { id: opponent.id, expectedVersion: opponent.version } : {}),
      name,
      shortName: draft.shortName.trim(),
      city: draft.city.trim(),
      websiteUrl: draft.websiteUrl.trim() || null,
      logoMediaId: draft.logoMediaId,
    });
    setSaving(false);
    if (response.error || !response.data) {
      const message = response.error?.message || "Impossibile salvare l'avversario";
      setError(message);
      showToast("error", message);
      return;
    }
    showToast("success", opponent ? `Avversario «${response.data.name}» salvato` : `Avversario «${response.data.name}» aggiunto`);
    setInitial(JSON.stringify(draft));
    onSaved(response.data);
    onOpenChange(false);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Avversario"
      title={opponent ? `Modifica «${opponent.name}»` : "Nuovo avversario"}
      description="L'anagrafica delle squadre che il club incontra: il nome e il logo compaiono nelle gare e sul sito."
      dirty={dirty && !saving}
      locked={saving}
      footer={
        <>
          <Button variant="primary" onClick={() => void handleSave()} loading={saving}>
            {opponent ? "Salva" : "Aggiungi avversario"}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      {error ? (
        <AlertBlock severity="danger" title="Il salvataggio non è riuscito" className="mb-5">
          {error}
        </AlertBlock>
      ) : null}
      <DrawerSection eyebrow="Dati">
        <FormGrid columns={1}>
          <Field label="Nome" htmlFor="opponent-name" required error={nameError}>
            <TextInput
              id="opponent-name"
              value={draft.name}
              onChange={(event) => update({ name: event.target.value.slice(0, 120) })}
              placeholder="Basket Latina"
              disabled={saving}
            />
          </Field>
        </FormGrid>
        <FormGrid className="mt-4">
          <Field label="Nome breve" htmlFor="opponent-short-name" optional>
            <TextInput
              id="opponent-short-name"
              value={draft.shortName}
              onChange={(event) => update({ shortName: event.target.value.slice(0, 30) })}
              placeholder="Latina"
              disabled={saving}
            />
          </Field>
          <Field label="Città" htmlFor="opponent-city" optional>
            <TextInput
              id="opponent-city"
              value={draft.city}
              onChange={(event) => update({ city: event.target.value.slice(0, 80) })}
              disabled={saving}
            />
          </Field>
        </FormGrid>
        <Field label="Sito web" htmlFor="opponent-website" optional className="mt-4" helper="Un indirizzo che inizia con https://, oppure solo il dominio.">
          <TextInput
            id="opponent-website"
            type="url"
            inputMode="url"
            value={draft.websiteUrl}
            onChange={(event) => update({ websiteUrl: event.target.value.slice(0, 300) })}
            placeholder="https://www.basketlatina.it"
            disabled={saving}
          />
        </Field>
      </DrawerSection>
      <DrawerSection eyebrow="Logo">
        <MediaField
          label="Logo dell'avversario"
          value={draft.logoMediaId ? { mediaId: draft.logoMediaId } : null}
          onChange={(value) => update({ logoMediaId: value?.mediaId || null })}
          category="opponent-logo"
          disabled={saving || !media.available}
          help={
            media.checking
              ? "Verifica della libreria del sito…"
              : media.reason || "Il logo viene dalla libreria del sito e compare accanto al nome nelle gare pubblicate."
          }
        />
      </DrawerSection>
    </Drawer>
  );
}
