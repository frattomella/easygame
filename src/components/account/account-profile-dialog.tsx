"use client";

import { FormEvent } from "react";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { ProfileFormState } from "./account-shared";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ProfileFormState;
  accountDisplayName: string;
  activeClubName: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  saving: boolean;
  userRole: string;
  onChange: (field: keyof ProfileFormState, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function AccountProfileDialog({
  open,
  onOpenChange,
  form,
  accountDisplayName,
  activeClubName,
  emailVerified,
  phoneVerified,
  saving,
  userRole,
  onChange,
  onSubmit,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-[32px] border-white/70 bg-white/95 p-0 shadow-2xl backdrop-blur-xl">
        <div className="rounded-t-[32px] bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 px-8 py-7 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl">Profilo account</DialogTitle>
            <DialogDescription className="text-blue-100">
              Gestisci immagine profilo, nome, email, telefono, password e stato
              delle verifiche del tuo account utente EasyGame.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={onSubmit} className="space-y-6 px-8 py-7">
          <div className="flex flex-col gap-5 rounded-[26px] border border-slate-100 bg-slate-50/70 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <AvatarUpload
                currentImage={form.avatarUrl || null}
                onImageChange={(value) => onChange("avatarUrl", value || "")}
                name={accountDisplayName}
                size="xl"
                type="user"
              />
              <div>
                <p className="text-lg font-semibold text-slate-900">
                  {accountDisplayName}
                </p>
                <p className="text-sm text-slate-500">{form.email}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge
                    className={
                      emailVerified
                        ? "rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                        : "rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100"
                    }
                  >
                    <Mail className="mr-1 h-3.5 w-3.5" />
                    {emailVerified ? "Email verificata" : "Email da verificare"}
                  </Badge>
                  <Badge
                    className={
                      phoneVerified
                        ? "rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                        : "rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100"
                    }
                  >
                    <Phone className="mr-1 h-3.5 w-3.5" />
                    {phoneVerified
                      ? "Cellulare verificato"
                      : "Cellulare da verificare"}
                  </Badge>
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => onChange("avatarUrl", "")}
            >
              Rimuovi immagine
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-first-name">Nome</Label>
              <Input
                id="profile-first-name"
                value={form.firstName}
                onChange={(event) => onChange("firstName", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-last-name">Cognome</Label>
              <Input
                id="profile-last-name"
                value={form.lastName}
                onChange={(event) => onChange("lastName", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email di accesso</Label>
              <Input
                id="profile-email"
                type="email"
                value={form.email}
                onChange={(event) => onChange("email", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-phone">Cellulare</Label>
              <Input
                id="profile-phone"
                type="tel"
                value={form.phone}
                onChange={(event) => onChange("phone", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-new-password">Nuova password</Label>
              <Input
                id="profile-new-password"
                type="password"
                value={form.newPassword}
                onChange={(event) => onChange("newPassword", event.target.value)}
                placeholder="Lascia vuoto se non vuoi cambiarla"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-confirm-password">Conferma password</Label>
              <Input
                id="profile-confirm-password"
                type="password"
                value={form.confirmPassword}
                onChange={(event) =>
                  onChange("confirmPassword", event.target.value)
                }
                placeholder="Ripeti la nuova password"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                <BadgeCheck className="h-4 w-4 text-emerald-600" />
                Sicurezza
              </div>
              <p className="text-sm text-slate-500">
                Cambiando email o cellulare, EasyGame richiede una nuova verifica.
              </p>
            </div>
            <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                Stato account
              </div>
              <p className="text-sm text-slate-500">Ruolo base: {userRole}</p>
            </div>
            <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                <Building2 className="h-4 w-4 text-blue-600" />
                Club attivo
              </div>
              <p className="text-sm text-slate-500">
                {activeClubName || "Nessun club attivo selezionato"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => onOpenChange(false)}
            >
              Chiudi
            </Button>
            <Button
              type="submit"
              className="rounded-full bg-blue-600 hover:bg-blue-700"
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Salva profilo
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
