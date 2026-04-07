"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Crown,
  Loader2,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import { AccountClub, formatDate } from "./account-shared";

type ClubCardProps = {
  club: AccountClub;
  activeClubId: string | null;
  switchingClubId: string | null;
  ownerMode: boolean;
  onSetActive: () => void;
  onOpen: () => void;
};

export function AccountClubCard({
  club,
  activeClubId,
  switchingClubId,
  ownerMode,
  onSetActive,
  onOpen,
}: ClubCardProps) {
  return (
    <Card className="overflow-hidden rounded-[28px] border-white/70 bg-white/90 shadow-[0_20px_60px_-24px_rgba(15,23,42,0.28)] backdrop-blur">
      <CardContent className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[22px] bg-slate-100">
              {club.logoUrl ? (
                <img
                  src={club.logoUrl}
                  alt={club.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Building2 className="h-7 w-7 text-slate-400" />
              )}
            </div>
            <div>
              <p className="text-xl font-semibold text-slate-900">{club.name}</p>
              <p className="mt-1 text-sm text-slate-500">
                {ownerMode
                  ? `Creato il ${formatDate(club.createdAt)}`
                  : `Accesso come ${club.roleLabel.toLowerCase()}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {ownerMode ? (
              <Badge className="rounded-full bg-amber-100 text-amber-700 hover:bg-amber-100">
                <Crown className="mr-1 h-3.5 w-3.5" />
                Proprieta
              </Badge>
            ) : (
              <Badge variant="secondary" className="rounded-full">
                {club.roleLabel}
              </Badge>
            )}
            {club.isPrimary || activeClubId === club.id ? (
              <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                Attivo
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 rounded-[22px] bg-slate-50/85 p-4 text-sm text-slate-600 md:grid-cols-3">
          <div className="space-y-1">
            <p className="font-medium text-slate-900">Localita</p>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-600" />
              <span>
                {[club.city, club.province].filter(Boolean).join(", ") ||
                  "Non indicata"}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <p className="font-medium text-slate-900">Contatti</p>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-blue-600" />
              <span>{club.contactEmail || "Email non indicata"}</span>
            </div>
          </div>

          <div className="space-y-1">
            <p className="font-medium text-slate-900">Telefono</p>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-blue-600" />
              <span>{club.contactPhone || "Telefono non indicato"}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-slate-200 bg-white"
            disabled={switchingClubId === club.id}
            onClick={onSetActive}
          >
            {switchingClubId === club.id ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            {ownerMode ? "Rendi attivo" : "Imposta attivo"}
          </Button>
          <Button
            type="button"
            className="rounded-full bg-blue-600 hover:bg-blue-700"
            onClick={onOpen}
          >
            <ArrowRight className="mr-2 h-4 w-4" />
            {club.role === "trainer" ? "Apri area trainer" : "Apri dashboard"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
