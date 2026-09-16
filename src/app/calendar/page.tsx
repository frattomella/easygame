"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarDays, MapPin, Trophy, Users } from "lucide-react";
import { buildCategoryDisplayIndex } from "@/lib/categories/display";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { listEvents } from "@/lib/events/client";
import { getClubData } from "@/lib/simplified-db";
import {
  buildCategoryGroups,
  normalizeClubSites,
  type CategoryGroup,
  type ClubSite,
} from "@/lib/club-sites";
import { formatLocalDateOnly, todayLocalDateOnly } from "@/lib/date-only";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/web/page/PageHeader";
import { Button } from "@/components/web/primitives/Button";
import { Panel, Eyebrow } from "@/components/web/primitives/Surface";
import { SegmentedControl, Skeleton } from "@/components/web/primitives/Controls";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { Field, FieldSizeProvider, Select, DateInput } from "@/components/web/forms/Field";
import { EmptyStateCard, TimelineRow } from "@/components/web/page/Cards";
import { formatInteger, formatTime, joinMeta, parseDateInput } from "@/lib/web/format";
import { formatDayTitle, isSameDay } from "@/components/training/v2/training-page-model";
import { MonthGrid } from "@/components/calendar/v2/MonthGrid";
import {
  confiniDelMese,
  dayKeyOf,
  filtraEventi,
  isAnnullato,
  isGara,
  leggiDataRichiesta,
  linkOperativo,
  raggruppaPerGiorno,
  statoDi,
  titoloDi,
  type EventoCalendario,
  type TipoEvento,
} from "@/components/calendar/v2/calendar-model";

/**
 * **Il calendario unico**, nel Web V2.
 *
 * Allenamenti e gare sono la stessa riga con un `kind` diverso (ADR-0098), e
 * questa pagina serve a **vedere** — `/training` e `/matches` restano per
 * operare. La lettura e quella della V1: `listEvents` con tipo e intervallo,
 * annullati compresi (D-AUD-20), i filtri per sede, categoria e gruppo sul
 * client. Due viste: il **mese** (griglia lun → dom con le tessere, il giorno
 * scelto elencato sotto) e l'**elenco** per giorno con l'intervallo libero
 * «Dal / Al» della V1. `?date=YYYY-MM-DD` apre il mese e il giorno indicati.
 */

/*
  **"Oggi" come giorno civile del dispositivo, non come istante UTC troncato**
  (bug UAT "date-only timezone shift"): il filtro «Dal» partiva un giorno
  indietro nelle prime ore dopo la mezzanotte locale.
*/
const OGGI = () => todayLocalDateOnly();

const fraTrentaGiorni = () =>
  formatLocalDateOnly(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

const formattaGiorno = (giorno: string) => {
  const data = parseDateInput(giorno);
  if (!data) return giorno;
  return data.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

type VistaCalendario = "month" | "list";

export default function CalendarPage() {
  const { activeClub } = useAuth();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const dataRichiesta = useMemo(() => leggiDataRichiesta(searchParams?.get("date") ?? null), [searchParams]);

  const [caricamento, setCaricamento] = useState(true);
  const [eventi, setEventi] = useState<EventoCalendario[]>([]);
  const [sedi, setSedi] = useState<ClubSite[]>([]);
  const [gruppi, setGruppi] = useState<CategoryGroup[]>([]);
  const [categorie, setCategorie] = useState<any[]>([]);

  /** Come si scrive una categoria nei filtri (N3): la sede solo dove il nome ne nomina due. */
  const categoryDisplay = useMemo(
    () => buildCategoryDisplayIndex({ categories: categorie, groups: gruppi }),
    [categorie, gruppi],
  );
  const etichettaCategoria = useCallback(
    (evento: EventoCalendario) =>
      categoryDisplay.label({ categoryId: evento.categoryId || "", categoryName: evento.category || "" }),
    [categoryDisplay],
  );

  const [vista, setVista] = useState<VistaCalendario>("month");
  const [tipo, setTipo] = useState<TipoEvento>("all");
  const [sede, setSede] = useState("");
  const [categoria, setCategoria] = useState("");
  const [gruppo, setGruppo] = useState("");
  /* L'intervallo libero dell'elenco (V1): oggi → +30 giorni. */
  const [da, setDa] = useState(OGGI);
  const [a, setA] = useState(fraTrentaGiorni);
  /* Il mese e il giorno della griglia: da `?date=`, altrimenti oggi. */
  const [anchor, setAnchor] = useState<Date>(() => {
    const base = dataRichiesta || new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [giornoScelto, setGiornoScelto] = useState<Date | null>(() => dataRichiesta);

  /* L'intervallo letto dal server: il mese in griglia, «Dal / Al» in elenco. */
  const intervallo = useMemo(
    () => (vista === "month" ? confiniDelMese(anchor) : { da, a }),
    [vista, anchor, da, a],
  );

  useEffect(() => {
    if (!activeClub?.id) return;
    let annullato = false;

    const carica = async () => {
      setCaricamento(true);
      try {
        const [righe, clubCategorie, clubSiti, clubGruppi] = await Promise.all([
          listEvents({
            kind: tipo,
            from: `${intervallo.da}T00:00:00.000Z`,
            to: `${intervallo.a}T23:59:59.999Z`,
            /* Un evento annullato si vede: e per questo che si annulla (D-AUD-20). */
            include_cancelled: "1",
          }),
          getClubData(activeClub.id, "categories"),
          getClubData(activeClub.id, "club_sites"),
          getClubData(activeClub.id, "category_groups"),
        ]);

        if (annullato) return;

        const siti = normalizeClubSites(clubSiti);
        setSedi(siti);
        setCategorie(Array.isArray(clubCategorie) ? clubCategorie : []);
        setGruppi(
          buildCategoryGroups({
            categories: Array.isArray(clubCategorie) ? clubCategorie : [],
            sites: siti,
            groups: clubGruppi,
          }),
        );
        setEventi(Array.isArray(righe) ? (righe as EventoCalendario[]) : []);
      } catch (errore: any) {
        if (!annullato) {
          showToast("error", errore?.message || "Impossibile caricare il calendario");
          setEventi([]);
        }
      } finally {
        if (!annullato) setCaricamento(false);
      }
    };

    void carica();
    return () => {
      annullato = true;
    };
  }, [activeClub?.id, tipo, intervallo.da, intervallo.a, showToast]);

  const visibili = useMemo(() => filtraEventi(eventi, { sede, categoria, gruppo }), [eventi, sede, categoria, gruppo]);
  const perGiorno = useMemo(() => raggruppaPerGiorno(visibili), [visibili]);
  const eventiPerGiorno = useMemo(() => new Map(perGiorno.map(({ giorno, righe }) => [giorno, righe])), [perGiorno]);

  const nomeSede = (siteId?: string | null) => sedi.find((sito) => sito.id === String(siteId || ""))?.name || "";

  const eventiDelGiornoScelto = useMemo(
    () => (giornoScelto ? eventiPerGiorno.get(formatLocalDateOnly(giornoScelto)) || [] : []),
    [eventiPerGiorno, giornoScelto],
  );

  const gare = visibili.filter(isGara).length;
  const descrizione = caricamento
    ? "Caricamento del calendario…"
    : `${formatInteger(visibili.length)} ${visibili.length === 1 ? "evento" : "eventi"} · ${formatInteger(gare)} ${gare === 1 ? "gara" : "gare"} · ${formatInteger(visibili.length - gare)} ${visibili.length - gare === 1 ? "allenamento" : "allenamenti"}`;

  const filtriAttivi = Boolean(sede || categoria || gruppo || tipo !== "all");

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Calendario" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Attività sportiva"
              title="Calendario"
              description={descrizione}
              actions={
                <>
                  <SegmentedControl<VistaCalendario>
                    aria-label="Vista"
                    value={vista}
                    onChange={setVista}
                    options={[
                      { value: "month", label: "Mese" },
                      { value: "list", label: "Elenco" },
                    ]}
                  />
                  <Button variant="secondary" asChild>
                    <Link href="/training?action=new">Nuovo allenamento</Link>
                  </Button>
                  <Button variant="primary" asChild>
                    <Link href="/matches?action=new">Nuova gara</Link>
                  </Button>
                </>
              }
            />

            <Panel className="mb-[18px] p-4" data-test="calendar-filters">
              <FieldSizeProvider size="sm">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                  <Field label="Tipo" htmlFor="calendario-tipo">
                    <Select
                      id="calendario-tipo"
                      value={tipo}
                      onValueChange={(valore) => setTipo(valore as TipoEvento)}
                      options={[
                        { value: "all", label: "Tutto" },
                        { value: "training", label: "Allenamenti" },
                        { value: "match", label: "Gare" },
                      ]}
                    />
                  </Field>
                  <Field label="Sede" htmlFor="calendario-sede">
                    <Select
                      id="calendario-sede"
                      value={sede || "__all__"}
                      onValueChange={(valore) => setSede(valore === "__all__" ? "" : valore)}
                      options={[
                        { value: "__all__", label: "Tutte le sedi" },
                        ...sedi.map((sito) => ({ value: sito.id, label: sito.name })),
                      ]}
                    />
                  </Field>
                  <Field label="Categoria" htmlFor="calendario-categoria">
                    <Select
                      id="calendario-categoria"
                      value={categoria || "__all__"}
                      onValueChange={(valore) => setCategoria(valore === "__all__" ? "" : valore)}
                      options={[
                        { value: "__all__", label: "Tutte" },
                        ...categorie.map((voce: any) => ({
                          value: String(voce.id),
                          label: categoryDisplay.label(voce.id) || voce.id,
                        })),
                      ]}
                    />
                  </Field>
                  <Field label="Gruppo" htmlFor="calendario-gruppo">
                    <Select
                      id="calendario-gruppo"
                      value={gruppo || "__all__"}
                      onValueChange={(valore) => setGruppo(valore === "__all__" ? "" : valore)}
                      options={[
                        { value: "__all__", label: "Tutti" },
                        ...gruppi.map((voce) => ({ value: voce.id, label: voce.name })),
                      ]}
                    />
                  </Field>
                  {vista === "list" ? (
                    <>
                      <Field label="Dal" htmlFor="calendario-da">
                        <DateInput id="calendario-da" value={da} onChange={(evento) => setDa(evento.target.value)} />
                      </Field>
                      <Field label="Al" htmlFor="calendario-a">
                        <DateInput id="calendario-a" value={a} onChange={(evento) => setA(evento.target.value)} />
                      </Field>
                    </>
                  ) : null}
                </div>
              </FieldSizeProvider>
            </Panel>

            {vista === "month" ? (
              <div className="flex flex-col gap-[18px]">
                <MonthGrid
                  anchor={anchor}
                  onAnchorChange={(next) => {
                    setAnchor(next);
                    setGiornoScelto(null);
                  }}
                  selectedDay={giornoScelto}
                  onSelectDay={(day) => setGiornoScelto((current) => (current && isSameDay(current, day) ? null : day))}
                  eventsByDay={eventiPerGiorno}
                  loading={caricamento}
                />
                {giornoScelto ? (
                  <DayPanel
                    giorno={giornoScelto}
                    eventi={eventiDelGiornoScelto}
                    nomeSede={nomeSede}
                    etichettaCategoria={etichettaCategoria}
                  />
                ) : !caricamento && perGiorno.length === 0 ? (
                  <EmptyCalendar filtrati={filtriAttivi} />
                ) : null}
              </div>
            ) : caricamento ? (
              <div className="flex flex-col gap-3.5" aria-busy="true" aria-label="Caricamento del calendario">
                {[0, 1].map((index) => (
                  <Panel key={index} className="px-6 py-4">
                    <Skeleton className="mb-3 h-3 w-40" />
                    <div className="flex gap-4">
                      <Skeleton className="h-10 w-14" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                    </div>
                  </Panel>
                ))}
              </div>
            ) : perGiorno.length === 0 ? (
              <EmptyCalendar filtrati={filtriAttivi} />
            ) : (
              <div className="flex flex-col gap-3.5" data-test="calendar-day-list">
                {perGiorno.map(({ giorno, righe }) => (
                  <Panel as="section" key={giorno} className="px-5 py-3 sm:px-6" aria-label={formattaGiorno(giorno)}>
                    <Eyebrow as="h2" className="mb-1 capitalize">
                      {formattaGiorno(giorno)}
                    </Eyebrow>
                    {righe.map((evento) => (
                      <EventRow key={evento.eventId || evento.id} evento={evento} nomeSede={nomeSede} etichettaCategoria={etichettaCategoria} />
                    ))}
                  </Panel>
                ))}
              </div>
            )}
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}

type EtichettaCategoria = (evento: EventoCalendario) => string;

function DayPanel({
  giorno,
  eventi,
  nomeSede,
  etichettaCategoria,
}: {
  giorno: Date;
  eventi: EventoCalendario[];
  nomeSede: (siteId?: string | null) => string;
  /** Come si scrive la categoria (ADR-0185): l'indice della pagina, come nel filtro. */
  etichettaCategoria: EtichettaCategoria;
}) {
  return (
    <Panel as="section" className="px-5 py-3 sm:px-6" aria-label={`Eventi di ${formatDayTitle(giorno)}`} data-test="calendar-day-panel">
      <Eyebrow as="h2" className="mb-1">
        {formatDayTitle(giorno)}
      </Eyebrow>
      {eventi.length === 0 ? (
        <p className="py-3 font-brand text-[12.5px] text-egw-ink-62">Nessun evento in questo giorno con questi filtri.</p>
      ) : (
        eventi.map((evento) => (
          <EventRow key={evento.eventId || evento.id} evento={evento} nomeSede={nomeSede} etichettaCategoria={etichettaCategoria} />
        ))
      )}
    </Panel>
  );
}

function EventRow({
  evento,
  nomeSede,
  etichettaCategoria,
}: {
  evento: EventoCalendario;
  nomeSede: (siteId?: string | null) => string;
  etichettaCategoria: EtichettaCategoria;
}) {
  const gara = isGara(evento);
  const annullato = isAnnullato(evento);
  const sede = nomeSede(evento.siteId);
  return (
    <TimelineRow
      stripe={gara && !annullato ? "match" : null}
      time={<span className={cn(annullato && "text-egw-ink-42 line-through")}>{evento.time ? formatTime(evento.time) : "—"}</span>}
      duration={evento.end_time ? `fino alle ${formatTime(evento.end_time)}` : undefined}
      title={
        <span className={cn("flex flex-wrap items-center gap-2", annullato && "text-egw-ink-62 line-through")}>
          {gara ? <Trophy className="h-3.5 w-3.5 shrink-0 text-egw-orange" aria-hidden /> : <Users className="h-3.5 w-3.5 shrink-0 text-egw-blue" aria-hidden />}
          <span className="min-w-0 text-[14px] font-bold">{titoloDi(evento)}</span>
          <DataChip tone={gara ? "orange" : "blue"} size="sm">
            {gara ? "Gara" : "Allenamento"}
          </DataChip>
          {evento.category || evento.categoryId ? (
            <DataChip tone="blue" size="sm" title={etichettaCategoria(evento)}>
              {etichettaCategoria(evento)}
            </DataChip>
          ) : null}
        </span>
      }
      meta={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {sede || evento.location ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-egw-ink-42" aria-hidden />
              <span className="egw-ellipsis">{joinMeta(sede, evento.location)}</span>
            </span>
          ) : null}
          {evento.rsvpRequired ? <DataChip tone="amber" size="sm">Conferma richiesta</DataChip> : null}
          {evento.capacity ? (
            <DataChip tone="neutral" size="sm">
              Capienza {evento.capacity}
            </DataChip>
          ) : null}
        </span>
      }
      aside={
        <>
          <StatusPill status={statoDi(evento.status)} size="sm" className="hidden sm:inline-flex" />
          <Button variant="row" size="sm" asChild>
            <Link href={linkOperativo(evento)} aria-label={`Apri ${titoloDi(evento)} del ${dayKeyOf(evento)}`}>
              Apri
            </Link>
          </Button>
        </>
      }
    />
  );
}

function EmptyCalendar({ filtrati }: { filtrati: boolean }) {
  return (
    <EmptyStateCard
      icon={<CalendarDays />}
      title="Nessun evento nell'intervallo scelto con questi filtri."
      description={filtrati ? "Allarga l'intervallo o togli un filtro." : "Aggiungi un allenamento o una gara dalle loro pagine."}
      primary={
        <Button variant="neutral" asChild>
          <Link href="/training">Vai agli allenamenti</Link>
        </Button>
      }
      secondary={
        <Button variant="text" asChild>
          <Link href="/matches">Vai alle gare</Link>
        </Button>
      }
    />
  );
}
