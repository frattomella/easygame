"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import { isManagementAccessRole } from "@/lib/access-roles";
import { getClubData } from "@/lib/simplified-db";
import { normalizeClubSites } from "@/lib/club-sites";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createAppointmentSlot,
  deleteAppointmentSlot,
  listAppointmentSlots,
  updateAppointmentSlot,
  type AppointmentSlotRow,
} from "@/lib/api/appointments-client";
import { CalendarClock, Plus, Trash2 } from "lucide-react";

/**
 * **Quando la societa riceve: la configurazione che non aveva una schermata.**
 *
 * W6-53. Le quattro rotte di `/api/v1/appointment-slots` e le quattro funzioni
 * di `src/lib/server/appointments.ts` esistono dalla Wave 5, e **nessun
 * componente le chiamava**. La conseguenza non era l'assenza di una comodita:
 * era che ogni club del prodotto stava — e sta, finche non apre questa pagina —
 * nella configurazione di **ripiego**. Senza una sola regola dichiarata,
 * `computeFreeAppointmentSlots` ricade sugli orari di apertura e ne ricava
 * fasce da trenta minuti, senza operatore, replicate su tutti e sette i giorni
 * della settimana quando gli orari sono una stringa sola. Alla famiglia veniva
 * quindi proposto di prenotare la domenica in una societa che la domenica e
 * chiusa, e la segreteria non aveva nessun modo di dirlo.
 *
 * ## Perche una pagina propria e non una scheda di `/secretariat`
 *
 * La tentazione era metterla accanto agli orari di apertura, che stanno li. Ma
 * sono due cose con **due permessi diversi**, e l'abbiamo scoperto guardando
 * il dominio: la coda degli appuntamenti la lavora anche l'allenatore, sui
 * propri (`appointments.manage` con il perimetro di `assertPerimetro`), mentre
 * la disponibilita la configura solo chi amministra il club
 * (`assertPuoConfigurareLaDisponibilita`, che chiede
 * `isManagementAccessRole` — l'audit della Wave 5 lo ha aggiunto proprio
 * perche un allenatore poteva cancellare gli orari di ricevimento di tutti).
 *
 * Una scheda dentro una pagina con un gate piu largo sarebbe una scheda che a
 * un allenatore si apre e poi risponde 403 su ogni gesto: e la «superficie
 * finta» che §6 del piano della Wave 6 elenca fra i difetti peggiori di
 * un'assenza. Qui il gate della pagina e lo stesso del dominio, e chi non lo
 * passa legge una frase invece di un modulo che non funziona.
 *
 * L'ingresso e nella scheda Appuntamenti della Segreteria, che e da dove una
 * segretaria ci arriva pensando all'agenda. La voce di menu appartiene alle
 * sidebar, che sono di un'altra lane.
 */

const GIORNI = [
  { valore: 0, nome: "Domenica" },
  { valore: 1, nome: "Lunedi" },
  { valore: 2, nome: "Martedi" },
  { valore: 3, nome: "Mercoledi" },
  { valore: 4, nome: "Giovedi" },
  { valore: 5, nome: "Venerdi" },
  { valore: 6, nome: "Sabato" },
];

/** Il club su cui si sta lavorando viaggia nell'intestazione, come ovunque. */
const intestazioniClub = (
  organizationId?: string | null,
): Record<string, string> =>
  organizationId ? { "x-active-club-id": String(organizationId) } : {};

const soloData = (value: unknown) => String(value ?? "").slice(0, 10);

type Operatore = { userId: string; nome: string };

/**
 * Gli operatori a cui una fascia si puo assegnare.
 *
 * Sono le persone dello staff e gli allenatori **che hanno un account**, e non
 * e una restrizione arbitraria: `appointment_slots.assigned_to_user_id` e un
 * identificativo di utente, e `assertPerimetro` lo confronta con quello della
 * sessione. Una persona senza account non potrebbe mai aprire l'appuntamento
 * che le e stato assegnato, quindi offrirla qui vorrebbe dire costruire
 * un'agenda che nessuno puo leggere.
 */
const estraiOperatori = (righe: unknown): Operatore[] => {
  if (!Array.isArray(righe)) return [];

  const trovati = new Map<string, string>();
  for (const riga of righe as any[]) {
    if (!riga || typeof riga !== "object") continue;
    const dati =
      riga.data && typeof riga.data === "object" ? (riga.data as any) : {};
    const userId = String(
      riga.linkedUserId ||
        riga.linked_user_id ||
        riga.userId ||
        riga.user_id ||
        dati.linkedUserId ||
        dati.userId ||
        "",
    ).trim();
    if (!userId) continue;

    const nome =
      String(
        riga.fullName ||
          [riga.name, riga.surname || riga.lastName].filter(Boolean).join(" ") ||
          riga.email ||
          "",
      ).trim() || "Operatore senza nome";

    if (!trovati.has(userId)) trovati.set(userId, nome);
  }

  return Array.from(trovati.entries())
    .map(([userId, nome]) => ({ userId, nome }))
    .sort((sinistra, destra) => sinistra.nome.localeCompare(destra.nome, "it"));
};

type Modulo = {
  id: string | null;
  ambito: "weekly" | "date";
  weekday: string;
  specificDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: string;
  siteId: string;
  assignedToUserId: string;
  validFrom: string;
  validUntil: string;
  active: boolean;
  notes: string;
};

const MODULO_VUOTO: Modulo = {
  id: null,
  ambito: "weekly",
  weekday: "1",
  specificDate: "",
  startTime: "09:00",
  endTime: "12:00",
  durationMinutes: "30",
  siteId: "",
  assignedToUserId: "",
  validFrom: "",
  validUntil: "",
  active: true,
  notes: "",
};

export default function AppuntamentiDisponibilitaPage() {
  const { showToast } = useToast();
  const { activeClub } = useAuth();

  const [slots, setSlots] = useState<AppointmentSlotRow[]>([]);
  const [sedi, setSedi] = useState<{ id: string; name: string }[]>([]);
  const [operatori, setOperatori] = useState<Operatore[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [daRimuovere, setDaRimuovere] = useState<AppointmentSlotRow | null>(
    null,
  );
  const [modulo, setModulo] = useState<Modulo>(MODULO_VUOTO);

  const puoConfigurare = isManagementAccessRole(activeClub?.role);

  const carica = useCallback(async () => {
    if (!activeClub?.id || !puoConfigurare) {
      setCaricamento(false);
      return;
    }

    setCaricamento(true);
    try {
      const [righe, sitiGrezzi, staff, allenatori] = await Promise.all([
        listAppointmentSlots(intestazioniClub(activeClub.id)),
        getClubData(activeClub.id, "club_sites"),
        getClubData(activeClub.id, "staff_members"),
        getClubData(activeClub.id, "trainers"),
      ]);

      setSlots(Array.isArray(righe) ? righe : []);
      setSedi(
        normalizeClubSites(sitiGrezzi).map((sede) => ({
          id: sede.id,
          name: sede.name,
        })),
      );
      setOperatori(
        estraiOperatori([
          ...(Array.isArray(staff) ? staff : []),
          ...(Array.isArray(allenatori) ? allenatori : []),
        ]),
      );
    } catch (errore) {
      showToast(
        "error",
        String(
          (errore as Error)?.message ||
            "Non riesco a leggere la disponibilita configurata",
        ),
      );
    } finally {
      setCaricamento(false);
    }
  }, [activeClub?.id, puoConfigurare, showToast]);

  useEffect(() => {
    void carica();
  }, [carica]);

  /*
    Il ripiego non e un dettaglio da nascondere: e la configurazione in cui il
    club si trova adesso, e finche nessuno gliela nomina non ha modo di sapere
    perche alle famiglie viene proposta la domenica mattina.
  */
  const inRipiego = useMemo(
    () => slots.filter((slot) => slot.active !== false).length === 0,
    [slots],
  );

  const nomeSede = useCallback(
    (siteId: string | null) => {
      if (!siteId) return "Tutte le sedi";
      return sedi.find((sede) => sede.id === siteId)?.name || "Sede rimossa";
    },
    [sedi],
  );

  const nomeOperatore = useCallback(
    (userId: string | null) => {
      if (!userId) return "Segreteria";
      return (
        operatori.find((operatore) => operatore.userId === userId)?.nome ||
        "Operatore non piu in organico"
      );
    },
    [operatori],
  );

  const apriNuovo = () => setModulo({ ...MODULO_VUOTO });

  const apriModifica = (slot: AppointmentSlotRow) =>
    setModulo({
      id: slot.id,
      ambito: slot.specific_date ? "date" : "weekly",
      weekday: slot.weekday === null ? "1" : String(slot.weekday),
      specificDate: soloData(slot.specific_date),
      startTime: slot.start_time || "09:00",
      endTime: slot.end_time || "12:00",
      durationMinutes: String(slot.duration_minutes || 30),
      siteId: slot.site_id || "",
      assignedToUserId: slot.assigned_to_user_id || "",
      validFrom: soloData(slot.valid_from),
      validUntil: soloData(slot.valid_until),
      active: slot.active !== false,
      notes: slot.notes || "",
    });

  const salva = async () => {
    if (!activeClub?.id || salvataggio) return;

    if (modulo.ambito === "date" && !modulo.specificDate) {
      showToast("error", "Indica la data della fascia");
      return;
    }

    setSalvataggio(true);
    try {
      /*
        Giorno della settimana **oppure** data: il dominio rifiuta una regola
        che non dichiari nessuno dei due, e rifiuta di ragionare su entrambi.
        Qui si manda solo quello scelto, cosi passare da una forma all'altra
        cancella davvero l'altra invece di lasciarla scritta sotto.
      */
      const corpo = {
        siteId: modulo.siteId || null,
        assignedToUserId: modulo.assignedToUserId || null,
        weekday: modulo.ambito === "weekly" ? Number(modulo.weekday) : null,
        specificDate: modulo.ambito === "date" ? modulo.specificDate : null,
        startTime: modulo.startTime,
        endTime: modulo.endTime,
        durationMinutes: Number(modulo.durationMinutes) || 30,
        validFrom: modulo.validFrom || null,
        validUntil: modulo.validUntil || null,
        active: modulo.active,
        notes: modulo.notes || null,
      };

      if (modulo.id) {
        await updateAppointmentSlot(
          modulo.id,
          corpo,
          intestazioniClub(activeClub.id),
        );
      } else {
        await createAppointmentSlot(corpo, intestazioniClub(activeClub.id));
      }

      setModulo({ ...MODULO_VUOTO });
      await carica();
      showToast(
        "success",
        modulo.id
          ? "Fascia aggiornata: le famiglie vedono subito la nuova disponibilita"
          : "Fascia aggiunta: le famiglie possono prenotarla",
      );
    } catch (errore) {
      showToast(
        "error",
        String((errore as Error)?.message || "Non riesco a salvare la fascia"),
      );
    } finally {
      setSalvataggio(false);
    }
  };

  /**
   * Disattivare non e cancellare, ed e la mossa che serve piu spesso.
   *
   * Una fascia con una **data** e `active = false` e una chiusura
   * straordinaria: il dominio la legge come «quel giorno non si riceve», e
   * toglie il giorno invece di limitarsi a non aggiungerlo. Cancellarla
   * significherebbe riaprire il giorno.
   */
  const cambiaAttivazione = async (slot: AppointmentSlotRow) => {
    if (!activeClub?.id) return;
    try {
      /*
        Si rimanda **tutta** la riga con il solo interruttore cambiato: il
        trasporto manda ogni campo, e un campo assente da qui viaggerebbe come
        `null`, cioe come «svuota». Un gesto che dice «disattiva» non deve
        togliere la sede e l'operatore per strada.
      */
      await updateAppointmentSlot(
        slot.id,
        {
          siteId: slot.site_id,
          assignedToUserId: slot.assigned_to_user_id,
          weekday: slot.specific_date ? null : slot.weekday,
          specificDate: slot.specific_date ? soloData(slot.specific_date) : null,
          startTime: slot.start_time,
          endTime: slot.end_time,
          durationMinutes: slot.duration_minutes,
          validFrom: slot.valid_from ? soloData(slot.valid_from) : null,
          validUntil: slot.valid_until ? soloData(slot.valid_until) : null,
          active: slot.active === false,
          notes: slot.notes,
        },
        intestazioniClub(activeClub.id),
      );
      await carica();
      showToast(
        "success",
        slot.active === false ? "Fascia riattivata" : "Fascia disattivata",
      );
    } catch (errore) {
      showToast(
        "error",
        String((errore as Error)?.message || "Non riesco a cambiare la fascia"),
      );
    }
  };

  const rimuovi = async () => {
    if (!activeClub?.id || !daRimuovere) return;
    try {
      await deleteAppointmentSlot(
        daRimuovere.id,
        intestazioniClub(activeClub.id),
      );
      setDaRimuovere(null);
      await carica();
      showToast("success", "Fascia rimossa");
    } catch (errore) {
      showToast(
        "error",
        String((errore as Error)?.message || "Non riesco a rimuovere la fascia"),
      );
    }
  };

  const ordinati = useMemo(
    () =>
      [...slots].sort((sinistra, destra) => {
        const chiave = (slot: AppointmentSlotRow) =>
          `${slot.specific_date ? "1" : "0"}${String(slot.weekday ?? 9)}${soloData(slot.specific_date)}${slot.start_time}`;
        return chiave(sinistra).localeCompare(chiave(destra));
      }),
    [slots],
  );

  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Disponibilita appuntamenti" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <SharedPageHeader
              title="Disponibilita appuntamenti"
              subtitle="Dichiara quando la societa riceve: giorni, orari, durata del colloquio, sede e operatore."
            />

            {!puoConfigurare ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Gli orari di ricevimento del club li configura chi lo
                  amministra. Gli appuntamenti che ti sono assegnati restano
                  nella tua agenda.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {inRipiego && !caricamento ? (
                  <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                    <CardContent className="py-4 text-sm">
                      <p className="font-medium">
                        Nessuna fascia attiva: si sta usando l&apos;orario di
                        apertura.
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        Finche non dichiari almeno una fascia, alle famiglie
                        vengono proposti colloqui di trenta minuti dentro
                        l&apos;orario di apertura, senza operatore, e — se
                        l&apos;orario e uno solo per tutta la settimana — anche
                        nei giorni in cui la segreteria e chiusa.
                      </p>
                    </CardContent>
                  </Card>
                ) : null}

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CalendarClock className="h-4 w-4" />
                      {modulo.id ? "Modifica fascia" : "Nuova fascia"}
                    </CardTitle>
                    {modulo.id ? (
                      <Button variant="ghost" size="sm" onClick={apriNuovo}>
                        Annulla modifica
                      </Button>
                    ) : null}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="slot-ambito">Ricorrenza</Label>
                        <select
                          id="slot-ambito"
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={modulo.ambito}
                          onChange={(evento) =>
                            setModulo((prima) => ({
                              ...prima,
                              ambito: evento.target.value as "weekly" | "date",
                            }))
                          }
                        >
                          <option value="weekly">Ogni settimana</option>
                          <option value="date">Una data sola</option>
                        </select>
                      </div>

                      {modulo.ambito === "weekly" ? (
                        <div className="space-y-2">
                          <Label htmlFor="slot-weekday">
                            Giorno della settimana
                          </Label>
                          <select
                            id="slot-weekday"
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={modulo.weekday}
                            onChange={(evento) =>
                              setModulo((prima) => ({
                                ...prima,
                                weekday: evento.target.value,
                              }))
                            }
                          >
                            {GIORNI.map((giorno) => (
                              <option
                                key={giorno.valore}
                                value={String(giorno.valore)}
                              >
                                {giorno.nome}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label htmlFor="slot-data">Data</Label>
                          <Input
                            id="slot-data"
                            type="date"
                            value={modulo.specificDate}
                            onChange={(evento) =>
                              setModulo((prima) => ({
                                ...prima,
                                specificDate: evento.target.value,
                              }))
                            }
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="slot-inizio">Dalle *</Label>
                        <Input
                          id="slot-inizio"
                          type="time"
                          value={modulo.startTime}
                          onChange={(evento) =>
                            setModulo((prima) => ({
                              ...prima,
                              startTime: evento.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="slot-fine">Alle *</Label>
                        <Input
                          id="slot-fine"
                          type="time"
                          value={modulo.endTime}
                          onChange={(evento) =>
                            setModulo((prima) => ({
                              ...prima,
                              endTime: evento.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="slot-durata">
                          Durata del colloquio (minuti)
                        </Label>
                        <Input
                          id="slot-durata"
                          type="number"
                          min={5}
                          step={5}
                          value={modulo.durationMinutes}
                          onChange={(evento) =>
                            setModulo((prima) => ({
                              ...prima,
                              durationMinutes: evento.target.value,
                            }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          La fascia si divide in appuntamenti di questa durata.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="slot-sede">Sede</Label>
                        <select
                          id="slot-sede"
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={modulo.siteId}
                          onChange={(evento) =>
                            setModulo((prima) => ({
                              ...prima,
                              siteId: evento.target.value,
                            }))
                          }
                        >
                          <option value="">Tutte le sedi</option>
                          {sedi.map((sede) => (
                            <option key={sede.id} value={sede.id}>
                              {sede.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="slot-operatore">Operatore</Label>
                        <select
                          id="slot-operatore"
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={modulo.assignedToUserId}
                          onChange={(evento) =>
                            setModulo((prima) => ({
                              ...prima,
                              assignedToUserId: evento.target.value,
                            }))
                          }
                        >
                          <option value="">Segreteria</option>
                          {operatori.map((operatore) => (
                            <option
                              key={operatore.userId}
                              value={operatore.userId}
                            >
                              {operatore.nome}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                          Solo chi ha un account puo tenere un&apos;agenda
                          propria.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="slot-da">In vigore dal</Label>
                        <Input
                          id="slot-da"
                          type="date"
                          value={modulo.validFrom}
                          onChange={(evento) =>
                            setModulo((prima) => ({
                              ...prima,
                              validFrom: evento.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="slot-a">Fino al</Label>
                        <Input
                          id="slot-a"
                          type="date"
                          value={modulo.validUntil}
                          onChange={(evento) =>
                            setModulo((prima) => ({
                              ...prima,
                              validUntil: evento.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="slot-note">Note interne</Label>
                      <Textarea
                        id="slot-note"
                        rows={2}
                        value={modulo.notes}
                        onChange={(evento) =>
                          setModulo((prima) => ({
                            ...prima,
                            notes: evento.target.value,
                          }))
                        }
                        placeholder={"Promemoria per chi tiene l'agenda: la famiglia non le legge"}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="slot-attiva"
                        checked={modulo.active}
                        onCheckedChange={(valore) =>
                          setModulo((prima) => ({
                            ...prima,
                            active: valore === true,
                          }))
                        }
                      />
                      <Label htmlFor="slot-attiva" className="text-sm">
                        Attiva
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Una fascia con una data e disattivata e una chiusura:
                      quel giorno non si riceve, nemmeno nelle fasce
                      settimanali.
                    </p>

                    <Button
                      className="w-full sm:w-auto"
                      disabled={salvataggio}
                      onClick={() => void salva()}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {modulo.id ? "Salva la fascia" : "Aggiungi la fascia"}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Fasce di ricevimento
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {caricamento ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        Caricamento della disponibilita...
                      </p>
                    ) : ordinati.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        Nessuna fascia dichiarata.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {ordinati.map((slot) => (
                          <div
                            key={slot.id}
                            className="rounded-lg border p-3 text-sm"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">
                                {slot.specific_date
                                  ? soloData(slot.specific_date)
                                  : GIORNI.find(
                                      (giorno) => giorno.valore === slot.weekday,
                                    )?.nome || "Giorno non indicato"}
                              </span>
                              <span>
                                {slot.start_time} — {slot.end_time}
                              </span>
                              <Badge variant="secondary">
                                {slot.duration_minutes} min
                              </Badge>
                              <Badge variant="outline">
                                {nomeSede(slot.site_id)}
                              </Badge>
                              <Badge variant="outline">
                                {nomeOperatore(slot.assigned_to_user_id)}
                              </Badge>
                              {slot.active === false ? (
                                <Badge variant="destructive">
                                  {slot.specific_date
                                    ? "Chiusura"
                                    : "Disattivata"}
                                </Badge>
                              ) : null}
                            </div>

                            {slot.valid_from || slot.valid_until ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                In vigore
                                {slot.valid_from
                                  ? ` dal ${soloData(slot.valid_from)}`
                                  : ""}
                                {slot.valid_until
                                  ? ` fino al ${soloData(slot.valid_until)}`
                                  : ""}
                              </p>
                            ) : null}

                            {slot.notes ? (
                              <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                                {slot.notes}
                              </p>
                            ) : null}

                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => apriModifica(slot)}
                              >
                                Modifica
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void cambiaAttivazione(slot)}
                              >
                                {slot.active === false ? "Riattiva" : "Disattiva"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDaRimuovere(slot)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Elimina
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <p className="text-sm text-muted-foreground">
                  Gli appuntamenti gia presi si lavorano dalla{" "}
                  <Link className="underline" href="/secretariat">
                    Segreteria
                  </Link>
                  .
                </p>
              </div>
            )}
          </DashboardPageContainer>
        </main>
      </div>

      {/*
        La cancellazione passa da un dialogo, non da `confirm()`: e la stessa
        lezione di W6-07, dove la stessa scheda proteggeva un certificato con
        un dialogo e cancellava un atleta con il popup del browser.
      */}
      <AlertDialog
        open={Boolean(daRimuovere)}
        onOpenChange={(aperto) => {
          if (!aperto) setDaRimuovere(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa fascia?</AlertDialogTitle>
            <AlertDialogDescription>
              Gli appuntamenti gia presi su questa fascia restano in agenda:
              si perde solo la regola che la proponeva. Per smettere di offrirla
              senza toglierla dalla storia, disattivala.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(evento) => {
                evento.preventDefault();
                void rimuovi();
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
