"use client";

import { FormEvent } from "react";
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
  ArrowRight,
  CalendarDays,
  KeyRound,
  Loader2,
  ShieldCheck,
  Users,
} from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  loading: boolean;
  onValueChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function AccountRedeemAccessDialog({
  open,
  onOpenChange,
  value,
  loading,
  onValueChange,
  onSubmit,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-[32px] border-white/70 bg-white/95 p-0 shadow-2xl backdrop-blur-xl">
        <div className="rounded-t-[32px] bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 px-8 py-7 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl">Aggiungi un accesso</DialogTitle>
            <DialogDescription className="text-blue-100">
              Inserisci il token che il club ti ha condiviso. Se il token e
              valido e non scaduto, il ruolo viene aggiunto al tuo account.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={onSubmit} className="space-y-6 px-8 py-7">
          <div className="rounded-[26px] border border-slate-100 bg-slate-50/80 p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="mt-1 flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Token di accesso club</p>
                <p className="text-sm text-slate-500">
                  Il token puo avere una scadenza. Inseriscilo prima che venga
                  invalidato dal club che te lo ha condiviso.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="access-token">Token</Label>
              <Input
                id="access-token"
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                placeholder="Es. EGCLUB8H2K9"
                className="uppercase tracking-[0.18em]"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                <Users className="h-4 w-4 text-blue-600" />
                Accessi ordinati
              </div>
              <p className="text-sm text-slate-500">
                I club assegnati restano separati dai tuoi club di proprieta.
              </p>
            </div>
            <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                <CalendarDays className="h-4 w-4 text-blue-600" />
                Scadenza controllata
              </div>
              <p className="text-sm text-slate-500">
                I token scaduti vengono rifiutati automaticamente dal backend.
              </p>
            </div>
            <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                Ruolo assegnato
              </div>
              <p className="text-sm text-slate-500">
                Il club decide il ruolo collegato al token che hai ricevuto.
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
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              Collega accesso
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
