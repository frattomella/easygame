"use client";

import * as React from "react";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Field, FieldSizeProvider, TextInput, ValidationSummary } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { InsetBlock } from "@/components/web/primitives/Surface";
import type { ProfileFormState } from "@/components/account/account-shared";
import { CONTACT_STATUS, type ProfileValidation } from "@/components/account/v2/account-model";

/**
 * Il profilo dell'account in un cassetto da 480 (otto campi: immagine, nome,
 * cognome, email, cellulare, password attuale, nuova, conferma). Sostituisce
 * la modale «Profilo account» della V1 con gli stessi campi, gli stessi id e
 * lo stesso invio (`supabase.auth.updateUser` → `PATCH /api/v1/auth/user`,
 * fatto da chi lo monta).
 *
 * Nessuna credenziale vive fuori dal modulo: la password attuale attraversa
 * la richiesta e basta, e i tre campi password si azzerano al salvataggio.
 */
export function AccountProfileDrawer({
  open,
  onOpenChange,
  form,
  dirty,
  errors,
  accountDisplayName,
  activeClubName,
  emailVerified,
  phoneVerified,
  saving,
  userRole,
  onChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ProfileFormState;
  dirty: boolean;
  errors: ProfileValidation[];
  accountDisplayName: string;
  activeClubName: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  saving: boolean;
  userRole: string;
  onChange: (field: keyof ProfileFormState, value: string) => void;
  onSubmit: () => void;
}) {
  const errorFor = (field: keyof ProfileFormState) => errors.find((error) => error.field === field)?.message;
  const summary = errors.map((error) => ({ id: `profile-${idOf(error.field)}`, label: error.message }));

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Account"
      title="Profilo account"
      description="Immagine, nome, email, cellulare e password del tuo account EasyGame."
      dirty={dirty}
      locked={saving}
      data-test="account-profile-drawer"
      footer={
        <>
          <Button variant="primary" onClick={onSubmit} loading={saving}>
            Salva profilo
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Chiudi
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <ValidationSummary errors={summary} />

          <InsetBlock className="flex flex-wrap items-center gap-4">
            <AvatarUpload currentImage={form.avatarUrl || null} onImageChange={(value) => onChange("avatarUrl", value || "")} name={accountDisplayName} size="lg" type="user" />
            <div className="min-w-0 flex-1">
              <p className="egw-ellipsis font-brand text-[14px] font-bold text-egw-ink">{accountDisplayName}</p>
              <p className="egw-ellipsis font-brand text-[12px] text-egw-ink-62">{form.email}</p>
              {form.avatarUrl ? (
                <Button variant="text" size="xs" className="mt-1 -ml-2.5" onClick={() => onChange("avatarUrl", "")}>
                  Rimuovi immagine
                </Button>
              ) : null}
            </div>
          </InsetBlock>

          <DrawerSection eyebrow="Identità">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nome" htmlFor="profile-first-name">
                <TextInput id="profile-first-name" value={form.firstName} onChange={(event) => onChange("firstName", event.target.value)} autoComplete="given-name" />
              </Field>
              <Field label="Cognome" htmlFor="profile-last-name">
                <TextInput id="profile-last-name" value={form.lastName} onChange={(event) => onChange("lastName", event.target.value)} autoComplete="family-name" />
              </Field>
            </div>
          </DrawerSection>

          <DrawerSection eyebrow="Recapiti">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Email di accesso" htmlFor="profile-email" helper={<StatusPill size="sm" status={emailVerified ? CONTACT_STATUS.verified : CONTACT_STATUS.to_verify} />}>
                <TextInput id="profile-email" type="email" inputMode="email" value={form.email} onChange={(event) => onChange("email", event.target.value)} autoComplete="email" />
              </Field>
              <Field label="Cellulare" htmlFor="profile-phone" helper={<StatusPill size="sm" status={phoneVerified ? CONTACT_STATUS.verified : CONTACT_STATUS.to_verify} />}>
                <TextInput id="profile-phone" type="tel" inputMode="tel" value={form.phone} onChange={(event) => onChange("phone", event.target.value)} autoComplete="tel" />
              </Field>
            </div>
            <p className="mt-3 font-brand text-[11.5px] leading-[1.5] text-egw-ink-62">Cambiando email o cellulare, EasyGame richiede una nuova verifica.</p>
          </DrawerSection>

          {/*
            **La password attuale, prima delle altre due (PP-05).** Non e «una
            terza password da inventare»: e la prova che chi sta cambiando i
            recapiti e la persona a cui appartengono. Email, cellulare e
            password nuova la richiedono tutte e tre.
          */}
          <DrawerSection eyebrow="Sicurezza">
            <div className="flex flex-col gap-4">
              <Field label="Password attuale" htmlFor="profile-current-password" helper="Serve per cambiare email, cellulare o password." error={errorFor("currentPassword")}>
                <TextInput id="profile-current-password" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => onChange("currentPassword", event.target.value)} />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nuova password" htmlFor="profile-new-password" helper="Lascia vuoto se non vuoi cambiarla.">
                  <TextInput id="profile-new-password" type="password" autoComplete="new-password" value={form.newPassword} onChange={(event) => onChange("newPassword", event.target.value)} />
                </Field>
                <Field label="Conferma password" htmlFor="profile-confirm-password" error={errorFor("confirmPassword")}>
                  <TextInput id="profile-confirm-password" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => onChange("confirmPassword", event.target.value)} placeholder="Ripeti la nuova password" />
                </Field>
              </div>
            </div>
          </DrawerSection>

          <DrawerSection eyebrow="Stato account">
            <InsetBlock>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                <div>
                  <dt className="font-brand text-[11px] text-egw-ink-62">Ruolo base</dt>
                  <dd className="mt-0.5 font-brand text-[13px] font-semibold text-egw-ink">{userRole}</dd>
                </div>
                <div>
                  <dt className="font-brand text-[11px] text-egw-ink-62">Club attivo</dt>
                  <dd className="mt-0.5 font-brand text-[13px] font-semibold text-egw-ink">{activeClubName || "Nessun club attivo selezionato"}</dd>
                </div>
              </dl>
            </InsetBlock>
          </DrawerSection>

          {/* Il tasto Invio di un campo invia il modulo, come nella V1. */}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </FieldSizeProvider>
    </Drawer>
  );
}

const idOf = (field: keyof ProfileFormState) =>
  ({
    firstName: "first-name",
    lastName: "last-name",
    email: "email",
    phone: "phone",
    avatarUrl: "avatar",
    currentPassword: "current-password",
    newPassword: "new-password",
    confirmPassword: "confirm-password",
  })[field];
