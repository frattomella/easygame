"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createEvent, updateEvent } from "@/lib/events/client";
import {
  EMPTY_EVENT_RSVP,
  EventRsvpFields,
  fromEventRsvpPayload,
  toEventRsvpPayload,
  type EventRsvpValue,
} from "@/components/events/event-rsvp-fields";
import {
  buildTrainingLocationOptions,
  type TrainingLocationOption,
} from "@/lib/training-location-options";

/**
 * **Il pulsante che `events.manage` non aveva** (PP-03 §11).
 *
 * Il terzo round di revisione ostile ha misurato sulle rotte vere che
 * l'allenatore la chiave ce l'ha e il server la esegue:
 *
 *     POST  /api/v1/events           (categoria propria)   -> 200
 *     PATCH /api/v1/events/<id>      {"time":"20:00"}      -> 200
 *     POST  /api/v1/events           (categoria altrui)    -> 403
 *     PATCH /api/v1/events/<id>      {"categories":["altrui"]} -> 403
 *
 * E nessuna schermata dell'area allenatore offriva **creazione** o
 * **modifica**: solo «Annulla» e «Ripristina». `AddTrainingForm` e
 * `AddMatchForm` vivono in `/training` e `/matches`, che stanno in
 * `MANAGEMENT_PATH_PREFIXES` — `canAccessPath("trainer", "/training")` e
 * `false`. Due dei tre verbi della chiave erano irraggiungibili per il ruolo
 * che li possiede: un allenatore non poteva spostare di mezz'ora un proprio
 * allenamento.
 *
 * ## Perche un modulo nuovo e non `AddTrainingForm`
 *
 * Non e una seconda implementazione della creazione di un evento: la scrittura
 * resta l'unica che c'e — `createEvent` / `updateEvent`, cioe
 * `POST`/`PATCH /api/v1/events`, cioe `src/lib/server/events.ts` (ADR-0098).
 * Quello che cambia e **il modulo**, e cambia perche le due domande sono
 * diverse.
 *
 * `AddTrainingForm` e il modulo della segreteria: sceglie fra tutte le
 * categorie del club, genera ricorrenze, apre l'RSVP, assegna gli allenatori,
 * dichiara la capienza. Un allenatore in palestra, sul telefono, ne usa cinque
 * campi e non ha il diritto di toccarne la meta — e montarlo qui vorrebbe dire
 * disegnare comandi spenti, che e il modo in cui si annuncia una funzione che
 * non c'e.
 *
 * ## Il perimetro sta nel server, e qui si vede
 *
 * L'elenco delle categorie e `assignedCategories`, cioe **le proprie**. Non e
 * la guardia — la guardia e `assertTrainerEventPerimeter` in modo `"scrittura"`
 * (ADR-0111 letto come regola di scrittura, §7 del verbale) — ed e la ragione
 * per cui questo modulo non deve fidarsi di se stesso: se il perimetro cambia
 * mentre la schermata e aperta, il salvataggio riceve un 403 e lo mostra.
 * L'elenco ristretto serve a non far scegliere una cosa che verra rifiutata,
 * non a impedirla.
 */

export type TrainerEventKind = "training" | "match";

type Categoria = { id?: unknown; name?: unknown };

const testo = (valore: unknown) => String(valore ?? "").trim();

/**
 * Da una riga di evento ai campi del modulo.
 *
 * Le grafie sono piu d'una perche la proiezione che arriva al browser porta sia
 * le colonne sia il `payload` storico: leggerne una sola vorrebbe dire aprire
 * la modifica con meta campi vuoti e **riscrivere l'evento perdendoli**.
 */
const dallEvento = (evento: any, opzioni: TrainingLocationOption[]) => {
  const inizio = evento?.startsAt || evento?.starts_at || null;
  const dataIso = testo(evento?.date || evento?.matchDate)
    || (inizio ? new Date(inizio).toISOString().slice(0, 10) : "");

  const strutturaId = testo(evento?.structureId || evento?.structure_id);
  const campoId = testo(evento?.fieldId || evento?.field_id);
  const luogo = opzioni.find(
    (opzione) =>
      opzione.structureId === strutturaId &&
      (!campoId || opzione.fieldId === campoId),
  );

  return {
    title: testo(evento?.title || evento?.name),
    categoryId: testo(evento?.categoryId || evento?.category_id),
    date: dataIso,
    time: testo(evento?.time || evento?.startTime || evento?.start_time).slice(0, 5),
    endTime: testo(evento?.endTime || evento?.end_time).slice(0, 5),
    locationId: luogo?.id || "",
    opponent: testo(evento?.opponent || evento?.opponentName),
    homeAway: testo(evento?.homeAway || evento?.home_away) || "home",
    notes: testo(evento?.notes || evento?.description),
  };
};

const vuoto = (categoriaPredefinita: string) => ({
  title: "",
  categoryId: categoriaPredefinita,
  date: "",
  time: "18:30",
  endTime: "20:00",
  locationId: "",
  opponent: "",
  homeAway: "home",
  notes: "",
});

export function TrainerEventEditorDialog({
  open,
  kind,
  event,
  assignedCategories,
  structures,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  kind: TrainerEventKind;
  /** `null` per la creazione. */
  event: any | null;
  assignedCategories: Categoria[];
  structures: any[];
  onOpenChange: (aperto: boolean) => void;
  onSaved: (messaggio: string) => void | Promise<void>;
}) {
  const opzioniLuogo = useMemo(
    () => buildTrainingLocationOptions(structures),
    [structures],
  );

  const categorieAmmesse = useMemo(
    () =>
      assignedCategories
        .map((categoria) => ({
          id: testo(categoria?.id),
          name: testo(categoria?.name) || testo(categoria?.id),
        }))
        .filter((categoria) => categoria.id),
    [assignedCategories],
  );

  const [campi, setCampi] = useState(() => vuoto(categorieAmmesse[0]?.id || ""));
  /*
    **La casella che accendeva l'RSVP viveva solo nei moduli della segreteria.**

    `rsvp.read` e dell'allenatore, il riquadro «Hanno risposto» c'e ed e
    montato — e `rsvpRequired` si poteva scrivere soltanto da `AddTrainingForm`
    e `AddMatchForm`, cioe da pagine che l'allenatore non apre. Il riquadro era
    quindi **strutturalmente vuoto** salvo che la segreteria spuntasse la
    casella al posto suo: una funzione completa che nessuno di quelli che la
    usano sa accendere.

    Il componente e **quello che esiste gia**, `EventRsvpFields`, con le sue
    due regole di dominio: la scadenza senza la richiesta non si scrive, e la
    capienza e un numero e non una coda. Una seconda copia sarebbe divergente
    entro una Wave.
  */
  const [rsvp, setRsvp] = useState<EventRsvpValue>(EMPTY_EVENT_RSVP);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrore(null);
    setCampi(
      event
        ? dallEvento(event, opzioniLuogo)
        : vuoto(categorieAmmesse[0]?.id || ""),
    );
    setRsvp(event ? fromEventRsvpPayload(event) : EMPTY_EVENT_RSVP);
  }, [open, event, opzioniLuogo, categorieAmmesse]);

  const aggiorna = (chiave: string, valore: string) =>
    setCampi((precedenti) => ({ ...precedenti, [chiave]: valore }));

  const inModifica = Boolean(event);
  const etichetta = kind === "match" ? "gara" : "allenamento";

  const salva = async () => {
    setErrore(null);

    if (!campi.categoryId) {
      setErrore("Scegli la squadra: un evento senza categoria non e di nessuno.");
      return;
    }
    if (!campi.date || !campi.time) {
      setErrore("Giorno e ora sono obbligatori.");
      return;
    }
    if (kind === "match" && !campi.opponent) {
      setErrore("Indica l'avversario.");
      return;
    }

    const luogo = opzioniLuogo.find((opzione) => opzione.id === campi.locationId);
    const categoria = categorieAmmesse.find(
      (voce) => voce.id === campi.categoryId,
    );

    const dati: Record<string, unknown> = {
      title:
        campi.title ||
        (kind === "match"
          ? `Gara contro ${campi.opponent}`
          : `Allenamento ${categoria?.name || ""}`.trim()),
      date: campi.date,
      time: campi.time,
      endTime: campi.endTime || undefined,
      categoryId: campi.categoryId,
      /*
        **La primaria da sola, e dichiarata anche come elenco.**

        `toEventColumns` compone `category_ids` mettendo davanti la primaria; se
        l'elenco non arriva, un evento **congiunto** modificato da qui
        perderebbe le altre categorie. Nella modifica si conserva quindi
        l'elenco esistente, cambiando soltanto la primaria: un allenatore che
        sposta l'orario di un congiunto non deve poterlo trasformare in un
        evento della sola squadra sua — e sarebbe proprio l'appropriazione che
        §7 del verbale ha chiuso lato server.
      */
      categories: inModifica
        ? Array.from(
            new Set(
              [
                campi.categoryId,
                ...(Array.isArray(event?.categories)
                  ? event.categories.map((voce: any) => testo(voce?.id || voce))
                  : []),
                ...(Array.isArray(event?.categoryIds) ? event.categoryIds : []),
                ...(Array.isArray(event?.category_ids) ? event.category_ids : []),
              ]
                .map((voce) => testo(voce))
                .filter(Boolean),
            ),
          )
        : [campi.categoryId],
      categoryName: categoria?.name || undefined,
      structureId: luogo?.structureId || undefined,
      fieldId: luogo?.fieldId || undefined,
      siteId: luogo?.siteId || undefined,
      location: luogo?.name || undefined,
      notes: campi.notes || undefined,
      ...toEventRsvpPayload(rsvp),
      ...(kind === "match"
        ? { opponent: campi.opponent, homeAway: campi.homeAway }
        : {}),
    };

    setSalvataggio(true);
    try {
      if (inModifica) {
        await updateEvent(
          testo(event?.id),
          dati,
          typeof event?.version === "number" ? event.version : null,
        );
      } else {
        await createEvent(kind, dati);
      }
      onOpenChange(false);
      await onSaved(
        inModifica
          ? `${etichetta === "gara" ? "Gara" : "Allenamento"} aggiornato`
          : `${etichetta === "gara" ? "Gara" : "Allenamento"} creato`,
      );
    } catch (problema: any) {
      /*
        Il messaggio del server si mostra **per intero**: dice quale confine e
        stato toccato — «non e di una tua categoria», «il campo e chiuso»,
        «l'evento e stato modificato da qualcun altro» — e riscriverlo con una
        frase generica toglierebbe a chi compila l'unica informazione utile.
      */
      setErrore(
        String(problema?.message || "").trim() ||
          `Non e stato possibile salvare l'${etichetta}.`,
      );
    } finally {
      setSalvataggio(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {inModifica
              ? `Modifica ${etichetta}`
              : `Nuov${kind === "match" ? "a gara" : "o allenamento"}`}
          </DialogTitle>
          <DialogDescription>
            Solo per le squadre che segui. Il club vede subito la modifica.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="trainer-evento-categoria">Squadra</Label>
            <select
              id="trainer-evento-categoria"
              className="h-11 w-full rounded-egw-field border border-egw-hairline bg-white px-3 text-sm"
              value={campi.categoryId}
              onChange={(evento) => aggiorna("categoryId", evento.target.value)}
            >
              <option value="">Scegli la squadra</option>
              {categorieAmmesse.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="trainer-evento-data">Giorno</Label>
              <Input
                id="trainer-evento-data"
                type="date"
                className="h-11"
                value={campi.date}
                onChange={(evento) => aggiorna("date", evento.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trainer-evento-ora">Dalle</Label>
              <Input
                id="trainer-evento-ora"
                type="time"
                className="h-11"
                value={campi.time}
                onChange={(evento) => aggiorna("time", evento.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trainer-evento-fine">Alle</Label>
              <Input
                id="trainer-evento-fine"
                type="time"
                className="h-11"
                value={campi.endTime}
                onChange={(evento) => aggiorna("endTime", evento.target.value)}
              />
            </div>
          </div>

          {kind === "match" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="trainer-evento-avversario">Avversario</Label>
                <Input
                  id="trainer-evento-avversario"
                  className="h-11"
                  value={campi.opponent}
                  onChange={(evento) =>
                    aggiorna("opponent", evento.target.value)
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="trainer-evento-campo">Campo</Label>
                <select
                  id="trainer-evento-campo"
                  className="h-11 w-full rounded-egw-field border border-egw-hairline bg-white px-3 text-sm"
                  value={campi.homeAway}
                  onChange={(evento) =>
                    aggiorna("homeAway", evento.target.value)
                  }
                >
                  <option value="home">In casa</option>
                  <option value="away">In trasferta</option>
                </select>
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="trainer-evento-luogo">Dove</Label>
            <select
              id="trainer-evento-luogo"
              className="h-11 w-full rounded-egw-field border border-egw-hairline bg-white px-3 text-sm"
              value={campi.locationId}
              onChange={(evento) => aggiorna("locationId", evento.target.value)}
            >
              <option value="">Da definire</option>
              {opzioniLuogo.map((opzione) => (
                <option key={opzione.id} value={opzione.id}>
                  {opzione.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trainer-evento-titolo">Titolo (facoltativo)</Label>
            <Input
              id="trainer-evento-titolo"
              className="h-11"
              placeholder={
                kind === "match" ? "Gara contro…" : "Allenamento tecnico"
              }
              value={campi.title}
              onChange={(evento) => aggiorna("title", evento.target.value)}
            />
          </div>

          <EventRsvpFields
            value={rsvp}
            onChange={setRsvp}
            idPrefix="trainer-evento"
          />

          {errore ? (
            <p className="rounded-egw-field border border-egw-tint-red-bd bg-egw-tint-red px-3 py-2 text-sm text-egw-red">
              {errore}
            </p>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="w-full rounded-egw-field sm:w-auto"
            onClick={() => onOpenChange(false)}
            disabled={salvataggio}
          >
            Annulla
          </Button>
          <Button
            className="w-full rounded-egw-field bg-egw-blue hover:bg-egw-blue-700 sm:w-auto"
            onClick={salva}
            disabled={salvataggio}
          >
            {salvataggio ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {inModifica ? "Salva modifiche" : "Crea"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
