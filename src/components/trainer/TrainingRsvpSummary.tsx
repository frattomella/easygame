"use client";

import React, { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api/client";
import { CheckCircle, HelpCircle, XCircle } from "lucide-react";

/**
 * Le risposte della famiglia, accanto all'appello (G-20, Wave 2 §9).
 *
 * **Perche proprio qui.** Non serviva una pagina nuova: la scheda dove
 * l'allenatore fa l'appello e gia il punto in cui guarda un allenamento
 * specifico, e le tre schermate che la usano — `/training`,
 * `trainer-trainings-page`, `trainer-trainings-dashboard-page` — la ottengono
 * senza che nessuna debba passare un dato in piu. La sezione si legge da sola
 * il riepilogo, cosi il perimetro per gruppo operativo lo applica il server e
 * non tre chiamanti diversi.
 *
 * **La colonna che conta e la terza.** «Senza risposta» non e un residuo dei
 * primi due numeri: e l'unica lista su cui l'allenatore puo ancora fare
 * qualcosa prima dell'allenamento. Per questo i nomi si mostrano solo per
 * quella.
 *
 * **Non e l'appello.** Nessuno di questi numeri e una presenza: sono
 * intenzioni dichiarate, e restano separate dalle caselle qui sotto. La
 * presenza la registra l'allenatore, il giorno dell'allenamento.
 */

type RsvpSummaryRow = {
  athleteId: string;
  athleteName: string;
  state: "yes" | "no" | "no_response";
  note: string;
};

type RsvpSummaryPayload = {
  rsvpRequired: boolean;
  deadline: string | null;
  deadlinePassed: boolean;
  totals: { yes: number; no: number; noResponse: number; expected: number };
  athletes: RsvpSummaryRow[];
};

const Tally = ({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof CheckCircle;
  label: string;
  value: number;
  tone: string;
}) => (
  <div
    className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${tone}`}
  >
    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
    <span className="text-sm">
      <strong className="font-semibold">{value}</strong> {label}
    </span>
  </div>
);

export function TrainingRsvpSummary({ trainingId }: { trainingId: string }) {
  const [summary, setSummary] = useState<RsvpSummaryPayload | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!trainingId) return;

      const response = await apiRequest<RsvpSummaryPayload>(
        `/api/v1/rsvp?training_id=${encodeURIComponent(trainingId)}`,
      );

      /*
        Un 403 qui e una risposta legittima — l'allenamento non e di un gruppo
        di chi guarda — e non un guasto: la sezione semplicemente non compare,
        e l'appello resta utilizzabile.
      */
      if (cancelled) return;
      setSummary(response.error || !response.data ? null : response.data);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [trainingId]);

  if (!summary || !summary.rsvpRequired) return null;

  const missing = summary.athletes.filter((row) => row.state === "no_response");

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-slate-900">
          Risposte delle famiglie
        </p>
        {summary.deadline ? (
          <p className="text-xs text-slate-500">
            {summary.deadlinePassed ? "Conferme chiuse il " : "Conferme aperte fino al "}
            {new Date(summary.deadline).toLocaleString("it-IT", {
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Tally
          icon={CheckCircle}
          label="ci saranno"
          value={summary.totals.yes}
          tone="border-emerald-200 bg-emerald-50 text-emerald-800"
        />
        <Tally
          icon={XCircle}
          label="non ci saranno"
          value={summary.totals.no}
          tone="border-amber-200 bg-amber-50 text-amber-800"
        />
        <Tally
          icon={HelpCircle}
          label="senza risposta"
          value={summary.totals.noResponse}
          tone="border-slate-200 bg-slate-50 text-slate-700"
        />
      </div>

      {missing.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Senza risposta
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {missing.map((row) => (
              <li
                key={row.athleteId}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
              >
                {row.athleteName}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          Tutte le famiglie attese hanno risposto.
        </p>
      )}
    </div>
  );
}
