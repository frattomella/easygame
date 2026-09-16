"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  History,
  Megaphone,
  ShieldAlert,
  Stethoscope,
  Trophy,
  Users,
  XCircle,
} from "lucide-react";

import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { EmptyStateCard } from "@/components/web/page/Cards";
import { MembershipRoleBadge } from "@/components/categories/category-label";
import { APPOINTMENT_STATUS, CALLUP_STATUS, CERTIFICATE_STATUS, resolveStatus, type StatusSpec } from "@/lib/web/status";
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

/* Lo stato vuoto del sistema, dentro un pannello gia esistente (guideline 09 §9.8). */
function Vuoto({ testo }: { testo: string }) {
  return <EmptyStateCard flat title={testo} className="rounded-egw-field border border-dashed border-egw-hairline bg-egw-page-100 [&>div]:min-h-[120px] [&>div]:py-5" />;
}

/**
 * **Le etichette, in italiano, e solo quando dicono qualcosa.**
 *
 * `attendanceStatus` e `participationStatus` sono identificativi tecnici —
 * `present`, `not_called`, `unknown` — e la riga li stampava tali e quali su una
 * schermata che spesso legge un ragazzino. E lo stesso difetto che l'area aveva
 * gia sugli appuntamenti (`cancelled_by_family`) e sui documenti
 * (`under_review`), corretto li e rimasto qui.
 *
 * `unknown` non e uno stato: e l'assenza di una risposta. Un riquadro grigio che
 * dice «Sconosciuto» accanto a ogni allenamento non informa nessuno, e nasconde
 * quelli che invece una risposta ce l'hanno. Non si mostra.
 */
const ETICHETTA_PRESENZA: Record<string, StatusSpec> = {
  present: CALLUP_STATUS.present,
  absent: CALLUP_STATUS.absent,
};

const ETICHETTA_PARTECIPAZIONE: Record<string, StatusSpec> = {
  participated: { ...CALLUP_STATUS.present, label: "HAI GIOCATO" },
  called: CALLUP_STATUS.called,
  not_called: CALLUP_STATUS.not_called,
};

/**
 * Le squadre **dell'atleta** che questo evento riguarda.
 *
 * L'evento porta gli identificativi di tutte le sue categorie
 * (`club_events.category_ids`, ADR-0111); qui si tengono quelle che sono anche
 * sue, che e la risposta alla domanda vera — «con quale delle mie squadre ci
 * vado?». Un allenamento congiunto dichiarava il nome della sola categoria
 * **primaria**, che sull'atleta della seconda e il nome di una squadra che non
 * e la sua.
 *
 * Se l'incrocio e vuoto si ricade su `categoryName`: meglio l'etichetta della
 * primaria che nessuna etichetta.
 */
const squadreDellEvento = (
  evento: any,
  mie: AthleteAreaData["categories"],
): string[] => {
  const ids = Array.isArray(evento?.categories) ? evento.categories : [];
  const nomi = (mie || [])
    .filter((categoria) => ids.includes(categoria.id))
    .map((categoria) => categoria.name);

  if (nomi.length) return nomi;
  return evento?.categoryName ? [String(evento.categoryName)] : [];
};

function EventoRiga({
  evento,
  categorie = [],
}: {
  evento: any;
  categorie?: AthleteAreaData["categories"];
}) {
  const squadre = squadreDellEvento(evento, categorie);
  const presenza = ETICHETTA_PRESENZA[String(evento.attendanceStatus || "")];
  const partecipazione =
    ETICHETTA_PARTECIPAZIONE[String(evento.participationStatus || "")];

  return (
    <li className="flex flex-col gap-1 rounded-egw-control border border-egw-hairline bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-medium text-egw-ink">
          {evento.title || "Evento"}
          {evento.opponent ? ` · ${evento.opponent}` : ""}
        </p>
        <p className="text-sm text-egw-ink-62">
          {dataOra(evento.startsAt)}
          {evento.location ? ` · ${evento.location}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {squadre.map((nome) => (
          <DataChip key={nome}>{nome}</DataChip>
        ))}
        {presenza ? <StatusPill status={presenza} size="sm" /> : null}
        {partecipazione ? <StatusPill status={partecipazione} size="sm" /> : null}
        {evento.status === "cancelled" ? <StatusPill status="cancelled" size="sm" /> : null}
      </div>
    </li>
  );
}

/*
  Lo stato del certificato e una pillola del sistema (`CERTIFICATE_STATUS`).
  **Consegnato non e mancante**, e i due toni lo dicono: il primo e uno stato
  in cui non c'e niente da fare per chi legge — manca una data, e la mette la
  segreteria — il secondo e una cosa da portare.
*/
const PILLOLA_CERTIFICATO: Record<string, StatusSpec> = {
  valid: CERTIFICATE_STATUS.valid,
  expiring: CERTIFICATE_STATUS.expiring,
  expired: CERTIFICATE_STATUS.expired,
  undated: { label: "CONSEGNATO", weight: "outline", hue: "blue" },
  missing: CERTIFICATE_STATUS.missing,
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
        <div className="rounded-egw-field border border-egw-hairline bg-egw-page-100 p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={PILLOLA_CERTIFICATO[data.health.status] || PILLOLA_CERTIFICATO.missing} />
            <p className="font-medium text-egw-ink">
              {data.health.statusLabel || "Stato non disponibile"}
            </p>
          </div>
          {/*
            La frase la scrive il dominio, che sa distinguere «Scade il …» da
            «Scaduto il …» e da «Data di scadenza non disponibile». Qui si
            scriveva sempre «Scadenza:», e su un certificato senza data
            diventava una riga vuota dopo i due punti.
          */}
          <p className="mt-1 text-sm text-egw-ink-72">
            {data.health.detail || `Scadenza: ${soloData(data.health.expiryDate)}`}
          </p>
        </div>
        {/*
          Qui c'e lo **stato**, e non il contenuto: nessuna allergia, nessuna
          nota medica, nessun file. E il taglio di
          `src/lib/health/permissions.ts`, e il contenuto clinico di un minore
          si legge nell'area di chi ne ha la tutela.
        */}
        <p className="mt-2 text-xs text-egw-ink-62">
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
              <span key={categoria.id} className="inline-flex items-center gap-1">
                <DataChip>{categoria.label || categoria.name}</DataChip>
                {data.categories.length > 1 && categoria.isPrimary ? <MembershipRoleBadge isPrimary /> : null}
              </span>
            ))
          ) : (
            <span className="text-sm text-egw-ink-62">
              Nessun gruppo assegnato
            </span>
          )}
        </CardContent>
      </Card>

      {daRispondere.length ? (
        <Card className="border-egw-tint-amber-bd bg-egw-tint-amber">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-egw-amber-ink">
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
                  <EventoRiga
                    key={String(evento.id)}
                    evento={evento}
                    categorie={data.categories}
                  />
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
                <p className="text-2xl font-semibold text-egw-ink">
                  {data.season.trainingsPlayed}
                </p>
                <p className="text-xs text-egw-ink-62">Allenamenti</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-egw-ink">
                  {data.season.matchesPlayed}
                </p>
                <p className="text-xs text-egw-ink-62">Gare</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-egw-ink">
                  {data.attendance.rate}%
                </p>
                <p className="text-xs text-egw-ink-62">Presenze</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- le mie squadre - */

/**
 * **«Le mie squadre».**
 *
 * Un atleta puo stare in piu categorie — la tabella
 * `athlete_category_memberships` esiste da W6-14, con `is_primary` e `site_id`
 * — e l'area gliene mostrava i nomi **in un riquadro della home**, come
 * decorazione sotto il saluto. Non c'era nessun posto in cui rispondere a «in
 * quali squadre sono, dove si allenano, e per quale stagione»: la sola domanda
 * che un ragazzo si fa quando apre il prodotto per la prima volta.
 *
 * La sede esce come identificativo (`siteId`) e non come nome — la proiezione
 * non porta il catalogo delle sedi del club, e portarcelo per un'etichetta
 * vorrebbe dire far uscire l'organigramma della societa da un elenco chiuso.
 * Dove il nome non c'e, non si stampa un identificativo: si tace.
 */
export function AthleteTeams() {
  const { data } = useAthleteArea();
  if (!data) return null;

  const categorie = data.categories || [];
  const conteggio = (ids: string[]) =>
    [
      ...(data.trainings.upcoming || []),
      ...(data.trainings.history || []),
      ...(data.matches.upcoming || []),
      ...(data.matches.history || []),
    ].filter((evento: any) =>
      Array.isArray(evento.categories)
        ? evento.categories.some((id: string) => ids.includes(id))
        : false,
    ).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Le mie squadre
          </CardTitle>
          <CardDescription>
            {data.club.name}
            {data.club.seasonLabel
              ? ` · stagione ${data.club.seasonLabel}`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {categorie.length ? (
            <ul className="space-y-2">
              {categorie.map((categoria) => (
                <li
                  key={categoria.id}
                  className="flex flex-col gap-1 rounded-egw-control border border-egw-hairline bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-egw-ink">
                      {categoria.name}
                    </p>
                    <p className="text-sm text-egw-ink-62">
                      {conteggio([categoria.id])} fra allenamenti e gare in
                      questa stagione
                    </p>
                  </div>
                  <MembershipRoleBadge isPrimary={Boolean(categoria.isPrimary)} />
                </li>
              ))}
            </ul>
          ) : (
            <Vuoto testo="La tua societa non ti ha ancora assegnato a una squadra." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">La mia societa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-egw-ink-72">
          <p className="font-medium text-egw-ink">{data.club.name}</p>
          {data.club.city ? (
            <p>
              {data.club.city}
              {data.club.province ? ` (${data.club.province})` : ""}
            </p>
          ) : null}
          {data.club.contactEmail ? <p>{data.club.contactEmail}</p> : null}
          {data.club.contactPhone ? <p>{data.club.contactPhone}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------- allenamenti - */

/**
 * **«Allenamenti».**
 *
 * Erano divisi in due meta che nessuna schermata teneva insieme: i prossimi nel
 * calendario, quelli svolti sotto le presenze. Un atleta che voglia guardare i
 * **propri allenamenti** — e non il calendario, e non la propria frequenza —
 * doveva aprire due pagine e sapere che erano due.
 */
export function AthleteTrainings() {
  const { data } = useAthleteArea();
  if (!data) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />
            In programma
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.trainings.upcoming?.length ? (
            <ul className="space-y-2">
              {data.trainings.upcoming.map((evento: any) => (
                <EventoRiga
                  key={String(evento.id)}
                  evento={evento}
                  categorie={data.categories}
                />
              ))}
            </ul>
          ) : (
            <Vuoto testo="Nessun allenamento in programma." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Gia svolti</CardTitle>
          <CardDescription>
            Accanto a ognuno c&apos;e come sei stato segnato all&apos;appello.
            Se qualcosa non torna, parlane con il tuo allenatore.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.trainings.history?.length ? (
            <ul className="space-y-2">
              {data.trainings.history.map((evento: any) => (
                <EventoRiga
                  key={String(evento.id)}
                  evento={evento}
                  categorie={data.categories}
                />
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

/* -------------------------------------------------------------- storico - */

/**
 * **«Storico», nella forma minima che V1 puo davvero sostenere.**
 *
 * Non e uno storico per stagione, e la pagina lo **dice** invece di lasciarlo
 * credere: la proiezione dell'area porta la stagione **attiva** e nient'altro,
 * perche `getParentDashboardData` legge gli eventi del club senza partizionarli
 * per stagione. Una pagina che disegnasse un selettore di stagioni mostrando
 * sempre gli stessi numeri sarebbe peggio di una che non ce l'ha: direbbe una
 * cosa falsa con piu convinzione.
 *
 * Quello che c'e e vero: la stagione in corso, le squadre, quanto si e fatto e
 * con che frequenza.
 */
export function AthleteHistory() {
  const { data } = useAthleteArea();
  if (!data) return null;

  const squadre = (data.categories || []).map((c) => c.name).join(", ");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            {data.club.seasonLabel
              ? `Stagione ${data.club.seasonLabel}`
              : "Questa stagione"}
          </CardTitle>
          <CardDescription>
            {squadre || "Nessuna squadra assegnata"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          <div>
            <p className="text-2xl font-semibold text-egw-ink">
              {data.season.trainingsPlayed}
            </p>
            <p className="text-xs text-egw-ink-62">Allenamenti svolti</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-egw-ink">
              {data.season.matchesPlayed}
            </p>
            <p className="text-xs text-egw-ink-62">Gare giocate</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-egw-green">
              {data.attendance.present}
            </p>
            <p className="text-xs text-egw-ink-62">Presenze</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-egw-ink">
              {data.attendance.rate}%
            </p>
            <p className="text-xs text-egw-ink-62">Frequenza</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Le gare che hai giocato</CardTitle>
        </CardHeader>
        <CardContent>
          {data.matches.history?.length ? (
            <ul className="space-y-2">
              {data.matches.history.map((evento: any) => (
                <EventoRiga
                  key={String(evento.id)}
                  evento={evento}
                  categorie={data.categories}
                />
              ))}
            </ul>
          ) : (
            <Vuoto testo="Nessuna gara giocata in questa stagione." />
          )}
        </CardContent>
      </Card>

      {/*
        Dichiarare il limite e parte della pagina, non una nota a pie'.
        Un ragazzo al secondo anno si aspetta di trovare il primo, e senza
        questa riga penserebbe che il prodotto l'abbia perso.
      */}
      <p className="px-1 text-xs text-egw-ink-62">
        Qui c&apos;e la stagione in corso. Le stagioni precedenti le conserva la
        tua societa: chiedile in segreteria.
      </p>
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
                <EventoRiga
                  key={String(evento.id)}
                  evento={evento}
                  categorie={data.categories}
                />
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
                <EventoRiga
                  key={String(evento.id)}
                  evento={evento}
                  categorie={data.categories}
                />
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
                <EventoRiga
                  key={String(evento.id)}
                  evento={evento}
                  categorie={data.categories}
                />
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
                <EventoRiga
                  key={String(evento.id)}
                  evento={evento}
                  categorie={data.categories}
                />
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
                className="rounded-egw-control border border-egw-hairline bg-white p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-egw-ink">
                      {invito.title}
                      {invito.opponent ? ` · ${invito.opponent}` : ""}
                    </p>
                    <p className="text-sm text-egw-ink-62">
                      {dataOra(invito.startsAt)}
                      {invito.location ? ` · ${invito.location}` : ""}
                    </p>
                    {invito.deadline ? (
                      <p className="text-xs text-egw-ink-62">
                        Rispondi entro il {dataOra(invito.deadline)}
                      </p>
                    ) : null}
                  </div>
                  <StatusPill
                    size="sm"
                    status={
                      invito.state === "yes"
                        ? { label: "CI SARAI", weight: "solid", hue: "green" }
                        : invito.state === "no"
                          ? { label: "NON CI SARAI", weight: "urgent", hue: "red" }
                          : { label: "DA RISPONDERE", weight: "outline", hue: "amber" }
                    }
                  />
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
                  <p className="mt-2 text-sm text-egw-ink-62">
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
            <p className="text-2xl font-semibold text-egw-green">
              {data.attendance.present}
            </p>
            <p className="text-xs text-egw-ink-62">Presente</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-egw-red">
              {data.attendance.absent}
            </p>
            <p className="text-xs text-egw-ink-62">Assente</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-egw-ink">
              {data.attendance.rate}%
            </p>
            <p className="text-xs text-egw-ink-62">Frequenza</p>
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
                <EventoRiga
                  key={String(evento.id)}
                  evento={evento}
                  categorie={data.categories}
                />
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
          <p className="text-sm text-egw-red">{errore}</p>
        ) : annunci === null ? (
          <Vuoto testo="Caricamento…" />
        ) : annunci.length ? (
          <ul className="space-y-3">
            {annunci.map((annuncio) => (
              <li
                key={String(annuncio.id)}
                className="rounded-egw-control border border-egw-hairline bg-white p-3"
              >
                <p className="font-medium text-egw-ink">{annuncio.title}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-egw-ink-72">
                  {annuncio.body}
                </p>
                <p className="mt-2 text-xs text-egw-ink-42">
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
                className={`rounded-egw-control border p-3 ${
                  notifica.read
                    ? "border-egw-hairline bg-white"
                    : "border-egw-tint-green-bd bg-egw-tint-green"
                }`}
              >
                <p className="font-medium text-egw-ink">{notifica.title}</p>
                <p className="text-sm text-egw-ink-72">{notifica.message}</p>
                <p className="mt-1 text-xs text-egw-ink-42">
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
                className="flex flex-col gap-1 rounded-egw-control border border-egw-hairline bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-egw-ink">
                    {documento.title || "Documento"}
                  </p>
                  <p className="text-sm text-egw-ink-62">
                    {documento.type || "—"} · {soloData(documento.uploadedAt)}
                  </p>
                </div>
                {/*
                  L'etichetta italiana, non lo stato tecnico: `under_review` e
                  il nome di una colonna, «Da verificare» e cio che questa
                  persona deve poter leggere. La calcola il dominio del
                  fascicolo e la proiezione la porta come `statusLabel`.
                */}
                {documento.statusLabel ? (
                  <StatusPill size="sm" status={{ ...resolveStatus(documento.status), label: String(documento.statusLabel).toUpperCase() }} />
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
                className="flex flex-col gap-1 rounded-egw-control border border-egw-hairline bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-egw-ink">
                    {appuntamento.reason || "Appuntamento"}
                  </p>
                  <p className="text-sm text-egw-ink-62">
                    {dataOra(appuntamento.startsAt)}
                  </p>
                  {/*
                    Il motivo di un rifiuto o di una riprogrammazione: e
                    l'unica cosa che rende utile una risposta negativa, e chi
                    e atteso a quell'appuntamento deve poterla leggere qui
                    invece di chiederla a casa.
                  */}
                  {appuntamento.decisionNote ? (
                    <p className="mt-1 text-sm text-egw-ink-72">
                      {appuntamento.decisionNote}
                    </p>
                  ) : null}
                </div>
                {/*
                  L'etichetta italiana degli otto stati la possiede il dominio
                  degli appuntamenti: qui si mostrava `cancelled_by_family`.
                */}
                <StatusPill
                  size="sm"
                  status={{
                    ...(APPOINTMENT_STATUS[String(appuntamento.status || "") as keyof typeof APPOINTMENT_STATUS] || APPOINTMENT_STATUS.requested),
                    ...(appuntamento.statusLabel ? { label: String(appuntamento.statusLabel).toUpperCase() } : {}),
                  }}
                />
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
            <p className="text-xs uppercase text-egw-ink-62">Nome</p>
            <p className="font-medium text-egw-ink">{data.me.name}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-egw-ink-62">Data di nascita</p>
            <p className="font-medium text-egw-ink">
              {soloData(data.me.birthDate)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-egw-ink-62">Codice fiscale</p>
            <p className="font-medium text-egw-ink">
              {data.me.fiscalCode || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-egw-ink-62">Numero di maglia</p>
            <p className="font-medium text-egw-ink">
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
        <CardContent className="space-y-1 text-sm text-egw-ink-72">
          <p className="font-medium text-egw-ink">{data.club.name}</p>
          {data.club.contactEmail ? <p>{data.club.contactEmail}</p> : null}
          {data.club.contactPhone ? <p>{data.club.contactPhone}</p> : null}
          {data.club.seasonLabel ? (
            <p className="text-egw-ink-62">Stagione {data.club.seasonLabel}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
