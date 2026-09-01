"use client";

import { Input } from "@/components/ui/input";
import type { EventRsvpValue } from "@/lib/events/model";
import { Label } from "@/components/ui/label";

/**
 * **Le tre righe che sbloccano novecento righe di dominio gia scritte.**
 *
 * L'RSVP esiste in EasyGame da due Wave: il dominio e completo, testato, con la
 * scadenza, la deduplica e il perimetro dell'allenatore. Ma **nessun evento lo
 * richiedeva mai**, perche `rsvpRequired` non compariva in nessun form: si
 * poteva impostare solo scrivendo a mano nel JSON del club. Una funzione che
 * nessuna schermata sa accendere non e una funzione — e la ragione per cui il
 * collaudo dell'RSVP era finora ineseguibile su un club vero (W5-05).
 *
 * La capienza sta qui accanto perche e la stessa domanda operativa: quante
 * persone mi aspetto, e chi mi ha detto che viene. La Wave 5 mette il numero e
 * il conteggio, **non la coda**: una lista d'attesa ha regole di priorita che
 * nessuno ha ancora dichiarato.
 *
 * Un componente solo per allenamenti e gare, perche l'evento e uno solo
 * (ADR-0098): due copie divergono, e una delle due sarebbe rimasta indietro
 * come e successo a ogni altra coppia in questo repository.
 */
export {
  EMPTY_EVENT_RSVP,
  fromEventRsvpPayload,
  toEventRsvpPayload,
  type EventRsvpValue,
} from "@/lib/events/model";

export function EventRsvpFields({
  value,
  onChange,
  idPrefix = "event",
}: {
  value: EventRsvpValue;
  onChange: (next: EventRsvpValue) => void;
  idPrefix?: string;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <label
        className="flex items-start gap-3 text-sm font-medium text-slate-800"
        htmlFor={`${idPrefix}-rsvp-required`}
      >
        <input
          id={`${idPrefix}-rsvp-required`}
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-slate-300"
          checked={value.rsvpRequired}
          onChange={(event) =>
            onChange({ ...value, rsvpRequired: event.target.checked })
          }
        />
        <span>
          Chiedi conferma alle famiglie
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Le famiglie ricevono la convocazione e rispondono «ci sono» o «non
            ci sono». Senza questa spunta l&apos;evento non chiede niente a
            nessuno.
          </span>
        </span>
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-rsvp-deadline`}>
            Rispondere entro
          </Label>
          <Input
            id={`${idPrefix}-rsvp-deadline`}
            type="datetime-local"
            value={value.rsvpDeadline}
            disabled={!value.rsvpRequired}
            onChange={(event) =>
              onChange({ ...value, rsvpDeadline: event.target.value })
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-capacity`}>Capienza</Label>
          <Input
            id={`${idPrefix}-capacity`}
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="Nessun limite"
            value={value.capacity}
            onChange={(event) =>
              onChange({ ...value, capacity: event.target.value })
            }
          />
        </div>
      </div>
    </div>
  );
}
