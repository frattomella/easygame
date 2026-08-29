"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookOpen, History } from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  fetchMembershipRecord,
  recordMembershipEvent,
  type MembershipRecordView,
} from "@/lib/members/client";
import {
  MEMBERSHIP_EVENT_LABELS,
  MEMBERSHIP_REGISTER_DISCLAIMER,
  canApplyMembershipEvent,
  isMembershipCessation,
  MEMBERSHIP_EVENT_TYPES,
  type MembershipEventType,
} from "@/lib/members/model";
import { canManageMembershipRegister } from "@/lib/members/permissions";

/**
 * Il libro soci nella scheda di un socio.
 *
 * **Cosa mostra, e perche in questa forma.** Lo stato non e un interruttore:
 * e la conseguenza degli eventi, e li si vedono tutti in fila. Registrare una
 * dimissione non modifica niente — aggiunge una riga — ed e la ragione per cui
 * qui non esiste un pulsante «disattiva».
 *
 * **I permessi non si decidono qui.** `canManageMembershipRegister` e lo stesso
 * modulo che il server applica: un pulsante che si vede e risponde 403 e un
 * difetto quanto una porta aperta.
 */

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const today = () => new Date().toISOString().slice(0, 10);

export function MembershipRegisterPanel({
  clubId,
  memberId,
}: {
  clubId: string | null;
  memberId: string;
}) {
  const { showToast } = useToast();
  const { activeClub, userRole } = useAuth();
  const canManage = canManageMembershipRegister(activeClub?.role || userRole);

  const [record, setRecord] = useState<MembershipRecordView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    eventType: "" as MembershipEventType | "",
    effectiveDate: today(),
    reason: "",
    resolutionReference: "",
    resolutionDate: "",
    notes: "",
  });

  const load = useCallback(async () => {
    if (!clubId || !memberId) return;

    setLoading(true);
    const { data, error } = await fetchMembershipRecord(memberId, { clubId });
    if (error) {
      // Un socio senza registro non e un errore da urlare: e il caso normale
      // di chi e stato creato prima che il libro esistesse.
      setRecord(null);
    } else {
      setRecord(data);
    }
    setLoading(false);
  }, [clubId, memberId]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Gli eventi proponibili adesso, dallo stato corrente.
   *
   * Non e cosmetica: offrire «ammetti» a chi e gia socio produrrebbe un rifiuto
   * del server su un gesto che l'interfaccia aveva appena suggerito.
   */
  const eventiPossibili = useMemo(() => {
    const stato = record?.status?.status || "mai_ammesso";
    return MEMBERSHIP_EVENT_TYPES.filter((tipo) =>
      canApplyMembershipEvent(stato, tipo),
    );
  }, [record]);

  const tipoScelto = form.eventType || eventiPossibili[0] || "";
  const serveMotivo = isMembershipCessation(tipoScelto);
  const serveDelibera = tipoScelto === "ADMISSION";

  const registra = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!clubId || !tipoScelto) return;

    setSaving(true);
    const { error } = await recordMembershipEvent({
      clubId,
      memberId,
      eventType: tipoScelto as MembershipEventType,
      effectiveDate: form.effectiveDate,
      reason: form.reason || null,
      resolutionReference: form.resolutionReference || null,
      resolutionDate: form.resolutionDate || null,
      notes: form.notes || null,
    });
    setSaving(false);

    if (error) {
      showToast("error", error.message);
      return;
    }

    showToast("success", "Evento registrato nel libro soci");
    setForm({
      eventType: "",
      effectiveDate: today(),
      reason: "",
      resolutionReference: "",
      resolutionDate: "",
      notes: "",
    });
    await load();
  };

  const stato = record?.status;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Posizione associativa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {MEMBERSHIP_REGISTER_DISCLAIMER}
          </p>

          {loading ? (
            <p className="text-sm text-muted-foreground">Caricamento…</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  Stato
                </h3>
                <div className="mt-1">
                  <Badge
                    className={
                      stato?.isMember ? "bg-green-600" : "bg-gray-500"
                    }
                  >
                    {stato?.label || "Non socio"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Lo stato non e un campo: si ricava dagli eventi qui sotto.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  Numero di tessera
                </h3>
                <p className="mt-1 eg-tabular">
                  {stato?.membershipNumber || "-"}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  Ammesso il
                </h3>
                <p className="mt-1">{formatDate(stato?.admittedOn)}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  Delibera
                </h3>
                <p className="mt-1">{stato?.resolutionReference || "-"}</p>
              </div>
              {stato?.endedOn ? (
                <>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">
                      Cessazione
                    </h3>
                    <p className="mt-1">{formatDate(stato.endedOn)}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">
                      Motivo
                    </h3>
                    <p className="mt-1">{stato.reason || "-"}</p>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && eventiPossibili.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registra un evento</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={registra} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="membership-event-type">Evento</Label>
                  <Select
                    value={tipoScelto}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        eventType: value as MembershipEventType,
                      }))
                    }
                  >
                    <SelectTrigger id="membership-event-type">
                      <SelectValue placeholder="Scegli l'evento" />
                    </SelectTrigger>
                    <SelectContent>
                      {eventiPossibili.map((tipo) => (
                        <SelectItem key={tipo} value={tipo}>
                          {MEMBERSHIP_EVENT_LABELS[tipo]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="membership-effective-date">
                    Ha effetto dal
                  </Label>
                  <Input
                    id="membership-effective-date"
                    type="date"
                    value={form.effectiveDate}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        effectiveDate: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
              </div>

              {serveMotivo ? (
                <div className="space-y-2">
                  <Label htmlFor="membership-reason">Motivo *</Label>
                  <Input
                    id="membership-reason"
                    value={form.reason}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        reason: e.target.value,
                      }))
                    }
                    placeholder="Dimissioni volontarie, morosita, trasferimento…"
                    required
                  />
                </div>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="membership-resolution">
                    Estremi della delibera {serveDelibera ? "*" : ""}
                  </Label>
                  <Input
                    id="membership-resolution"
                    value={form.resolutionReference}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        resolutionReference: e.target.value,
                      }))
                    }
                    placeholder="Delibera del consiglio direttivo n. 12"
                    required={serveDelibera}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="membership-resolution-date">
                    Data della delibera
                  </Label>
                  <Input
                    id="membership-resolution-date"
                    type="date"
                    value={form.resolutionDate}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        resolutionDate: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="membership-notes">Note</Label>
                <Textarea
                  id="membership-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      notes: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={saving}>
                  {saving ? "Registrazione…" : "Registra nel libro"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5" />
            Storico
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!record || record.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessun evento nel libro per questo socio. Chi e stato registrato
              prima che il libro esistesse entra con la sua ammissione, con gli
              estremi della delibera che la decise.
            </p>
          ) : (
            <ul className="space-y-3">
              {record.events.map((evento) => (
                <li
                  key={evento.id}
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {MEMBERSHIP_EVENT_LABELS[evento.eventType] ||
                        evento.eventType}
                    </Badge>
                    <span className="text-sm font-medium">
                      {formatDate(evento.effectiveDate)}
                    </span>
                    {evento.membershipNumber ? (
                      <span className="text-sm text-muted-foreground eg-tabular">
                        tessera {evento.membershipNumber}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 space-y-1 text-sm text-muted-foreground">
                    {evento.resolutionReference ? (
                      <p>
                        {evento.resolutionReference}
                        {evento.resolutionDate
                          ? ` — ${formatDate(evento.resolutionDate)}`
                          : ""}
                      </p>
                    ) : null}
                    {evento.reason ? <p>Motivo: {evento.reason}</p> : null}
                    {evento.notes ? <p>{evento.notes}</p> : null}
                    <p className="text-xs">
                      Registrato il {formatDate(evento.createdAt)} a nome di{" "}
                      {evento.memberLabel}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default MembershipRegisterPanel;
