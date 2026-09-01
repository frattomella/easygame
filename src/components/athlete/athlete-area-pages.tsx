"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Megaphone,
  ShieldAlert,
  Stethoscope,
  Trophy,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";

import { useAthleteArea, type AthleteAreaData } from "./athlete-area-context";

/**
 * **Le pagine dell'area atleta.**
 *
 * Stanno in un file solo, come le pagine dell'area famiglia, e per la stessa
 * ragione: leggono tutte lo stesso contesto, e spargerle in dieci file
 * significherebbe dieci import dello stesso stato e dieci occasioni di
 * disallinearne la forma. Le rotte sotto `src/app/athlete-dashboard/**` sono
 * gusci di due righe — la composizione sta li, la logica sta qui, e nessuna
 * delle due e nel `page.tsx` (CLAUDE.md §11.2).
 *
 * Cio che qui **non** compare non e una svista: non ci sono quote, ricevute,
 * fatture, iscrizione, tutori, altri atleti ne contenuto clinico. Il taglio lo
 * fa il **server**, con la proiezione a elenco chiuso di
 * `readAthleteAreaOverview`; queste pagine non potrebbero mostrarli nemmeno
 * volendo, perche non arrivano.
 */

/* ------------------------------------------------------------------ utili */

const dataOra = (valore: string | null | undefined) => {
  if (!valore) return "Data da definire";
  const istante = new Date(valore);
  if (Number.isNaN(istante.getTime())) return "Data da definire";
  return istante.toLocaleString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const soloData = (valore: string | null | undefined) => {
  if (!valore) return "—";
  const istante = new Date(valore);
  if (Number.isNaN(istante.getTime())) return "—";
  return istante.toLocaleDateString("it-IT");
};

function Vuoto({ testo }: { testo: string }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-200 bg-white/60 px-4 py-6 text-center text-sm text-slate-500">
      {testo}
    </p>
  );
}

function EventoRiga({ evento }: { evento: any }) {
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-900">
          {evento.title || "Evento"}
          {evento.opponent ? ` · ${evento.opponent}` : ""}
        </p>
        <p className="text-sm text-slate-500">
          {dataOra(evento.startsAt)}
          {evento.location ? ` · ${evento.location}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {evento.categoryName ? (
          <Badge variant="secondary">{evento.categoryName}</Badge>
        ) : null}
        {evento.attendanceStatus ? (
          <Badge variant="outline">{evento.attendanceStatus}</Badge>
        ) : null}
        {evento.status === "cancelled" ? (
          <Badge variant="destructive">Annullato</Badge>
        ) : null}
      </div>
    </li>
  );
}

const STILE_CERTIFICATO: Record<string, string> = {
  valid: "border-emerald-200 bg-emerald-50 text-emerald-900",
  expiring: "border-amber-200 bg-amber-50 text-amber-900",
  expired: "border-red-200 bg-red-50 text-red-900",
  missing: "border-slate-200 bg-slate-50 text-slate-700",
};

function CertificatoCard({ data }: { data: AthleteAreaData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Stethoscope className="h-4 w-4" />
          Certificato medico
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`rounded-lg border p-3 ${
            STILE_CERTIFICATO[data.health.status] || STILE_CERTIFICATO.missing
          }`}
        >
          <p className="font-medium">
            {data.health.statusLabel || "Stato non disponibile"}
          </p>
          <p className="text-sm">
            Scadenza: {soloData(data.health.expiryDate)}
          </p>
        </div>
        {/*
          Qui c'e lo **stato**, e non il contenuto: nessuna allergia, nessuna
          nota medica, nessun file. E il taglio di
          `src/lib/health/permissions.ts`, e il contenuto clinico di un minore
          si legge nell'area di chi ne ha la tutela.
        */}
        <p className="mt-2 text-xs text-slate-500">
          Il certificato lo consegna e lo aggiorna la tua societa: se la data
          non e quella che ti aspetti, scrivi in segreteria.
        </p>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------- home ---- */

export function AthleteHome() {
  const { data } = useAthleteArea();
  if (!data) return null;

  const prossimi = [
    ...(data.trainings.upcoming || []),
    ...(data.matches.upcoming || []),
  ]
    .slice()
    .sort((a, b) =>
      String(a.startsAt || "").localeCompare(String(b.startsAt || "")),
    )
    .slice(0, 5);

  const daRispondere = (data.rsvp || []).filter(
    (invito: any) => invito.canAnswer && invito.state === "no_response",
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xl">Ciao {data.me.name}</CardTitle>
          <CardDescription>
            {data.club.name}
            {data.club.seasonLabel ? ` · ${data.club.seasonLabel}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(data.categories || []).length ? (
            data.categories.map((categoria) => (
              <Badge key={categoria.id} variant={categoria.isPrimary ? "default" : "secondary"}>
                {categoria.name}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-slate-500">
              Nessun gruppo assegnato
            </span>
          )}
        </CardContent>
      </Card>

      {daRispondere.length ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-900">
              <ShieldAlert className="h-4 w-4" />
              Hai {daRispondere.length}{" "}
              {daRispondere.length === 1 ? "convocazione" : "convocazioni"} a cui
              rispondere
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm">
              <a href="/athlete-dashboard/convocazioni">Rispondi ora</a>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" />
              I prossimi impegni
            </CardTitle>
          </CardHeader>
          <CardContent>
            {prossimi.length ? (
              <ul className="space-y-2">
                {prossimi.map((evento: any) => (
                  <EventoRiga key={String(evento.id)} evento={evento} />
                ))}
              </ul>
            ) : (
              <Vuoto testo="Nessun impegno in programma." />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <CertificatoCard data={data} />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">La mia stagione</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-2xl font-semibold text-slate-900">
                  {data.season.trainingsPlayed}
                </p>
                <p className="text-xs text-slate-500">Allenamenti</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-900">
                  {data.season.matchesPlayed}
                </p>
                <p className="text-xs text-slate-500">Gare</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-900">
                  {data.attendance.rate}%
                </p>
                <p className="text-xs text-slate-500">Presenze</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- calendario --- */

export function AthleteCalendar() {
  const { data } = useAthleteArea();
  if (!data) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />
            Allenamenti in programma
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.trainings.upcoming?.length ? (
            <ul className="space-y-2">
              {data.trainings.upcoming.map((evento: any) => (
                <EventoRiga key={String(evento.id)} evento={evento} />
              ))}
            </ul>
          ) : (
            <Vuoto testo="Nessun allenamento in programma." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4" />
            Gare in programma
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.matches.upcoming?.length ? (
            <ul className="space-y-2">
              {data.matches.upcoming.map((evento: any) => (
                <EventoRiga key={String(evento.id)} evento={evento} />
              ))}
            </ul>
          ) : (
            <Vuoto testo="Nessuna gara in programma." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AthleteMatches() {
  const { data } = useAthleteArea();
  if (!data) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Prossime gare</CardTitle>
        </CardHeader>
        <CardContent>
          {data.matches.upcoming?.length ? (
            <ul className="space-y-2">
              {data.matches.upcoming.map((evento: any) => (
                <EventoRiga key={String(evento.id)} evento={evento} />
              ))}
            </ul>
          ) : (
            <Vuoto testo="Nessuna gara in programma." />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Gare giocate</CardTitle>
        </CardHeader>
        <CardContent>
          {data.matches.history?.length ? (
            <ul className="space-y-2">
              {data.matches.history.map((evento: any) => (
                <EventoRiga key={String(evento.id)} evento={evento} />
              ))}
            </ul>
          ) : (
            <Vuoto testo="Nessuna gara giocata in questa stagione." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------- convocazioni --- */

export function AthleteRsvp() {
  const { data, answerRsvp } = useAthleteArea();
  const { showToast } = useToast();
  const [inCorso, setInCorso] = useState<string | null>(null);

  const rispondi = useCallback(
    async (trainingId: string, status: "yes" | "no") => {
      setInCorso(`${trainingId}:${status}`);
      try {
        await answerRsvp({ trainingId, status });
        showToast("success", "Risposta registrata");
      } catch (errore: any) {
        showToast("error", errore?.message || "Risposta non registrata");
      } finally {
        setInCorso(null);
      }
    },
    [answerRsvp, showToast],
  );

  if (!data) return null;

  const inviti = data.rsvp || [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4" />
          Le mie convocazioni
        </CardTitle>
        <CardDescription>
          Rispondere serve al tuo allenatore per sapere su chi contare. Puoi
          cambiare idea finche la scadenza non e passata.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {inviti.length ? (
          <ul className="space-y-3">
            {inviti.map((invito: any) => (
              <li
                key={`${invito.trainingId}`}
                className="rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {invito.title}
                      {invito.opponent ? ` · ${invito.opponent}` : ""}
                    </p>
                    <p className="text-sm text-slate-500">
                      {dataOra(invito.startsAt)}
                      {invito.location ? ` · ${invito.location}` : ""}
                    </p>
                    {invito.deadline ? (
                      <p className="text-xs text-slate-500">
                        Rispondi entro il {dataOra(invito.deadline)}
                      </p>
                    ) : null}
                  </div>
                  <Badge
                    variant={
                      invito.state === "yes"
                        ? "default"
                        : invito.state === "no"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {invito.state === "yes"
                      ? "Ci sarai"
                      : invito.state === "no"
                        ? "Non ci sarai"
                        : "Da rispondere"}
                  </Badge>
                </div>

                {invito.canAnswer ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={inCorso !== null}
                      onClick={() => {
                        void rispondi(invito.trainingId, "yes");
                      }}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Ci saro
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={inCorso !== null}
                      onClick={() => {
                        void rispondi(invito.trainingId, "no");
                      }}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Non ci saro
                    </Button>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    {invito.blockedMessage ||
                      "Non e piu possibile cambiare la risposta."}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Vuoto testo="Nessuna convocazione al momento." />
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------ presenze -- */

export function AthleteAttendance() {
  const { data } = useAthleteArea();
  if (!data) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Le mie presenze</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-2xl font-semibold text-emerald-700">
              {data.attendance.present}
            </p>
            <p className="text-xs text-slate-500">Presente</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-red-600">
              {data.attendance.absent}
            </p>
            <p className="text-xs text-slate-500">Assente</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-slate-900">
              {data.attendance.rate}%
            </p>
            <p className="text-xs text-slate-500">Frequenza</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Allenamenti svolti</CardTitle>
        </CardHeader>
        <CardContent>
          {data.trainings.history?.length ? (
            <ul className="space-y-2">
              {data.trainings.history.map((evento: any) => (
                <EventoRiga key={String(evento.id)} evento={evento} />
              ))}
            </ul>
          ) : (
            <Vuoto testo="Nessun allenamento registrato." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------- avvisi -- */

export function AthleteBoard() {
  const { data } = useAthleteArea();
  const [annunci, setAnnunci] = useState<any[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const atletaId = data?.me.id;

  useEffect(() => {
    if (!atletaId) return;
    let vivo = true;

    /*
      La bacheca la serve la rotta che gia esiste: il gate e il **legame** con
      l'atleta, e per un atleta quel legame e se stesso. Una rotta propria
      sarebbe una seconda idea di «chi puo leggere questo avviso».
    */
    void apiRequest<any[]>(`/api/parent-dashboard/${atletaId}/board`).then(
      (risposta) => {
        if (!vivo) return;
        if (risposta.error) {
          setErrore(risposta.error.message);
          setAnnunci([]);
          return;
        }
        setAnnunci(Array.isArray(risposta.data) ? risposta.data : []);
      },
    );

    return () => {
      vivo = false;
    };
  }, [atletaId]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="h-4 w-4" />
          Bacheca
        </CardTitle>
      </CardHeader>
      <CardContent>
        {errore ? (
          <p className="text-sm text-red-600">{errore}</p>
        ) : annunci === null ? (
          <Vuoto testo="Caricamento…" />
        ) : annunci.length ? (
          <ul className="space-y-3">
            {annunci.map((annuncio) => (
              <li
                key={String(annuncio.id)}
                className="rounded-lg border border-slate-200 bg-white p-3"
              >
                <p className="font-medium text-slate-900">{annuncio.title}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-600">
                  {annuncio.body}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {soloData(annuncio.publishedAt || annuncio.publishAt)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Vuoto testo="Nessun avviso in bacheca." />
        )}
      </CardContent>
    </Card>
  );
}

export function AthleteNotifications() {
  const { data } = useAthleteArea();
  if (!data) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Notifiche</CardTitle>
      </CardHeader>
      <CardContent>
        {data.notifications?.length ? (
          <ul className="space-y-2">
            {data.notifications.map((notifica: any) => (
              <li
                key={String(notifica.id)}
                className={`rounded-lg border p-3 ${
                  notifica.read
                    ? "border-slate-200 bg-white"
                    : "border-emerald-200 bg-emerald-50"
                }`}
              >
                <p className="font-medium text-slate-900">{notifica.title}</p>
                <p className="text-sm text-slate-600">{notifica.message}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {soloData(notifica.created_at)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Vuoto testo="Nessuna notifica." />
        )}
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------------- documenti -- */

export function AthleteDocuments() {
  const { data } = useAthleteArea();
  if (!data) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />I miei documenti
        </CardTitle>
        <CardDescription>
          Sono i documenti della tua scheda. Per consegnarne uno nuovo passa
          dalla tua famiglia o dalla segreteria.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.documents?.length ? (
          <ul className="space-y-2">
            {data.documents.map((documento: any, indice: number) => (
              <li
                key={String(documento.id || indice)}
                className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {documento.title || documento.name || "Documento"}
                  </p>
                  <p className="text-sm text-slate-500">
                    {documento.type || "—"} · {soloData(documento.uploadedAt)}
                  </p>
                </div>
                {documento.status ? (
                  <Badge variant="secondary">{documento.status}</Badge>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <Vuoto testo="Nessun documento nella tua scheda." />
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------- appuntamenti -- */

export function AthleteAppointments() {
  const { data } = useAthleteArea();
  if (!data) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Appuntamenti che ti riguardano</CardTitle>
        <CardDescription>
          Li chiede e li disdice la tua famiglia dall&apos;area genitori: qui li vedi
          per sapere quando sei atteso.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.appointments?.length ? (
          <ul className="space-y-2">
            {data.appointments.map((appuntamento: any) => (
              <li
                key={String(appuntamento.id)}
                className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {appuntamento.reason || "Appuntamento"}
                  </p>
                  <p className="text-sm text-slate-500">
                    {dataOra(appuntamento.startsAt)}
                  </p>
                </div>
                <Badge variant="secondary">{appuntamento.status}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <Vuoto testo="Nessun appuntamento." />
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------- profilo -- */

const CAMPI_RECAPITO = [
  { chiave: "email", etichetta: "Email di contatto", tipo: "email" },
  { chiave: "phone", etichetta: "Telefono", tipo: "tel" },
  { chiave: "address", etichetta: "Indirizzo", tipo: "text" },
  { chiave: "city", etichetta: "Citta", tipo: "text" },
  { chiave: "province", etichetta: "Provincia", tipo: "text" },
  { chiave: "postalCode", etichetta: "CAP", tipo: "text" },
] as const;

export function AthleteProfile() {
  const { data, refresh } = useAthleteArea();
  const { showToast } = useToast();
  const [bozza, setBozza] = useState<Record<string, string>>({});
  const [salvataggio, setSalvataggio] = useState(false);

  const iniziale = useMemo(() => {
    if (!data) return {};
    const valori: Record<string, string> = {};
    for (const campo of CAMPI_RECAPITO) {
      valori[campo.chiave] = String(
        (data.me as Record<string, any>)[campo.chiave] || "",
      );
    }
    return valori;
  }, [data]);

  useEffect(() => {
    setBozza(iniziale);
  }, [iniziale]);

  const salva = useCallback(async () => {
    setSalvataggio(true);
    try {
      const risposta = await apiRequest("/api/v1/athlete-accounts/me", {
        method: "PATCH",
        body: bozza,
      });
      if (risposta.error) throw new Error(risposta.error.message);
      showToast("success", "Recapiti aggiornati");
      await refresh();
    } catch (errore: any) {
      showToast("error", errore?.message || "Aggiornamento non riuscito");
    } finally {
      setSalvataggio(false);
    }
  }, [bozza, refresh, showToast]);

  if (!data) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">I miei dati</CardTitle>
          <CardDescription>
            Nome, data di nascita, codice fiscale e categoria li tiene la tua
            societa: se qualcosa non torna, scrivi in segreteria.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-slate-500">Nome</p>
            <p className="font-medium text-slate-900">{data.me.name}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Data di nascita</p>
            <p className="font-medium text-slate-900">
              {soloData(data.me.birthDate)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Codice fiscale</p>
            <p className="font-medium text-slate-900">
              {data.me.fiscalCode || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Numero di maglia</p>
            <p className="font-medium text-slate-900">
              {data.me.jerseyNumber || "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">I miei recapiti</CardTitle>
          <CardDescription>
            Questi puoi correggerli tu. Non sono le credenziali di accesso: la
            password e l&apos;email con cui entri si cambiano dal tuo account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {CAMPI_RECAPITO.map((campo) => (
              <div key={campo.chiave}>
                <Label htmlFor={`recapito-${campo.chiave}`}>
                  {campo.etichetta}
                </Label>
                <Input
                  id={`recapito-${campo.chiave}`}
                  type={campo.tipo}
                  value={bozza[campo.chiave] ?? ""}
                  onChange={(evento) =>
                    setBozza((corrente) => ({
                      ...corrente,
                      [campo.chiave]: evento.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <Button
            disabled={salvataggio}
            onClick={() => {
              void salva();
            }}
          >
            {salvataggio ? "Salvataggio…" : "Salva i recapiti"}
          </Button>
        </CardContent>
      </Card>

      <CertificatoCard data={data} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">La mia societa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-slate-700">
          <p className="font-medium text-slate-900">{data.club.name}</p>
          {data.club.contactEmail ? <p>{data.club.contactEmail}</p> : null}
          {data.club.contactPhone ? <p>{data.club.contactPhone}</p> : null}
          {data.club.seasonLabel ? (
            <p className="text-slate-500">Stagione {data.club.seasonLabel}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
