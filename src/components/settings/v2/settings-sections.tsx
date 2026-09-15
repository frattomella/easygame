"use client";

import * as React from "react";
import Link from "next/link";
import { KeyRound, UserRound } from "lucide-react";
import { Panel, PanelHeader, Hairline } from "@/components/web/primitives/Surface";
import { Button } from "@/components/web/primitives/Button";
import { Toggle } from "@/components/web/primitives/Controls";
import { InfoCard } from "@/components/web/page/Cards";
import { Field, FormGrid, Select } from "@/components/web/forms/Field";
import { formatTime } from "@/lib/web/format";
import {
  DATE_FORMAT_OPTIONS,
  LANGUAGE_OPTIONS,
  NOTIFICATION_OPTIONS,
  SETTINGS_SECTIONS,
  type NotificationSettings,
  type SystemSettings,
} from "@/components/settings/v2/settings-model";

/**
 * I pannelli di `/settings` (Web V2, pattern 5: un pannello per sezione, con
 * il proprio «Salva» e «Salvato · hh:mm» nell'intestazione per quattro
 * secondi, guideline 08 §8.8). Stessi campi e stessa scrittura della V1
 * (`saveClubSettings` sulle chiavi `notifications` e `system`).
 */
const sectionMeta = (id: "notifiche" | "sistema" | "sicurezza") => SETTINGS_SECTIONS.find((section) => section.id === id);

/** Una riga «etichetta + spiegazione + interruttore», con lo stato detto a parole. */
function ToggleRow({ id, label, helper, checked, onCheckedChange }: { id: string; label: string; helper: string; checked: boolean; onCheckedChange: (next: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="font-brand text-[13px] font-semibold text-egw-ink">
          {label}
        </label>
        <p className="mt-0.5 font-brand text-[11.5px] leading-[1.45] text-egw-ink-62">{helper}</p>
        <p className={checked ? "mt-1 font-brand text-[11px] font-semibold text-egw-green" : "mt-1 font-brand text-[11px] font-semibold text-egw-ink-42"}>{checked ? "Attiva" : "Non attiva"}</p>
      </div>
      <Toggle id={id} checked={checked} onCheckedChange={onCheckedChange} aria-label={`${label}: ${checked ? "attiva" : "non attiva"}`} />
    </div>
  );
}

function PanelSaveRow({ dirty, saving, onSave, label }: { dirty: boolean; saving: boolean; onSave: () => void; label: string }) {
  return (
    <>
      <Hairline className="my-4" />
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        {dirty ? <span className="font-brand text-[12px] font-medium text-egw-amber-ink">Modifiche non salvate</span> : null}
        <Button variant="neutral" onClick={onSave} loading={saving}>
          {label}
        </Button>
      </div>
    </>
  );
}

const SavedStamp = ({ savedAt }: { savedAt: Date | null }) => (savedAt ? <span className="egw-num font-brand text-[11.5px] font-medium text-egw-green">Salvato · {formatTime(savedAt)}</span> : null);

/* ── Notifiche ───────────────────────────────────────────────────────────── */
export function NotificationsPanel({
  value,
  onChange,
  dirty,
  saving,
  savedAt,
  onSave,
}: {
  value: NotificationSettings;
  onChange: (patch: Partial<NotificationSettings>) => void;
  dirty: boolean;
  saving: boolean;
  savedAt: Date | null;
  onSave: () => void;
}) {
  return (
    <Panel as="section" id="settings-section-notifiche" aria-labelledby="settings-section-notifiche-title">
      <PanelHeader eyebrow="Notifiche" title={<span id="settings-section-notifiche-title">Preferenze notifiche</span>} description={sectionMeta("notifiche")?.description} actions={<SavedStamp savedAt={savedAt} />} />
      <div className="divide-y divide-egw-hairline">
        {NOTIFICATION_OPTIONS.map((option) => (
          <ToggleRow key={option.key} id={`notif-${option.key}`} label={option.label} helper={option.helper} checked={value[option.key]} onCheckedChange={(next) => onChange({ [option.key]: next } as Partial<NotificationSettings>)} />
        ))}
      </div>
      <PanelSaveRow dirty={dirty} saving={saving} onSave={onSave} label="Salva preferenze" />
    </Panel>
  );
}

/* ── Sistema ─────────────────────────────────────────────────────────────── */
export function SystemPanel({
  value,
  onChange,
  dirty,
  saving,
  savedAt,
  onSave,
}: {
  value: SystemSettings;
  onChange: (patch: Partial<SystemSettings>) => void;
  dirty: boolean;
  saving: boolean;
  savedAt: Date | null;
  onSave: () => void;
}) {
  return (
    <Panel as="section" id="settings-section-sistema" aria-labelledby="settings-section-sistema-title">
      <PanelHeader eyebrow="Sistema" title={<span id="settings-section-sistema-title">Impostazioni di sistema</span>} description={sectionMeta("sistema")?.description} actions={<SavedStamp savedAt={savedAt} />} />
      <div className="flex flex-col gap-5">
        <FormGrid>
          <Field label="Lingua" htmlFor="system-language" helper="La lingua predefinita del gestionale.">
            <Select id="system-language" value={value.language} onValueChange={(language) => onChange({ language })} options={LANGUAGE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} />
          </Field>
          <Field label="Formato data" htmlFor="system-date-format" helper="Come si scrivono le date nei moduli.">
            <Select id="system-date-format" value={value.dateFormat} onValueChange={(dateFormat) => onChange({ dateFormat })} options={DATE_FORMAT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} />
          </Field>
        </FormGrid>
        <div className="divide-y divide-egw-hairline">
          <ToggleRow id="system-backup" label="Backup automatico" helper="Esegui backup automatici dei dati" checked={value.backup} onCheckedChange={(backup) => onChange({ backup })} />
        </div>
      </div>
      <PanelSaveRow dirty={dirty} saving={saving} onSave={onSave} label="Salva impostazioni" />
    </Panel>
  );
}

/* ── Sicurezza ───────────────────────────────────────────────────────────── */
/**
 * La V1 raccoglieva password e PIN e li «aggiornava» senza mandarli da
 * nessuna parte (audit `wave-e-impostazioni.md`, difetto 1): il modulo e
 * sostituito dalle due porte vere. Non c'e un modulo perche non c'e una
 * scrittura.
 */
export function SecurityPanel() {
  return (
    <Panel as="section" id="settings-section-sicurezza" aria-labelledby="settings-section-sicurezza-title">
      <PanelHeader eyebrow="Sicurezza" title={<span id="settings-section-sicurezza-title">Password e accessi</span>} description={sectionMeta("sicurezza")?.description} />
      <div className="flex flex-col gap-4">
        <InfoCard eyebrow="La tua password">
          La password si imposta dalla tua casella di posta: dal recupero password ricevi un link che vale una volta sola. Nessuno nel club puo leggerla o scriverla al posto tuo.
        </InfoCard>
        <InfoCard eyebrow="Gli accessi delle persone del club">
          Chi entra, con quale ruolo e con quali permessi si governa da «Ruoli e accessi»: revocare o reinvitare una persona e un gesto di quella pagina, non di questa.
        </InfoCard>
        <div className="flex flex-wrap gap-2.5">
          <Button asChild variant="secondary">
            <Link href="/auth/forgot-password">
              <KeyRound className="h-[15px] w-[15px]" aria-hidden />
              Imposta una nuova password
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/account">
              <UserRound className="h-[15px] w-[15px]" aria-hidden />
              Apri il tuo account
            </Link>
          </Button>
        </div>
      </div>
    </Panel>
  );
}
