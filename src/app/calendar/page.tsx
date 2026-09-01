"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Filter, Trophy, Users } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { listEvents } from "@/lib/events/client";
import { getClubData, getClubStructures } from "@/lib/simplified-db";
import {
  buildCategoryGroups,
  normalizeClubSites,
  type CategoryGroup,
  type ClubSite,
} from "@/lib/club-sites";

/**
 * **Il calendario unico.**
 *
 * Non esisteva niente da unire, perche non esisteva un'entita comune da
 * elencare: allenamenti e gare erano due collezioni JSON indipendenti, con due
 * pagine, due semantiche di stato e due percorsi di lettura. Da ADR-0098 sono
 * la stessa riga con un `kind` diverso, e questa pagina e la prima cosa che
 * quella decisione rende possibile.
 *
 * I filtri sono quelli che una segreteria usa davvero per rispondere alla
 * domanda «cosa succede questa settimana»: **tipo, sede, categoria, gruppo,
 * stagione**. Il filtro per sede in particolare e cio che rende leggibile un
 * club multi-sede, dove «i Pulcini» sono due squadre diverse in due posti
 * diversi (ADR-0055).
 *
 * Le due pagine `/training` e `/matches` restano: servono a **operare** su un
 * tipo — l'appello, le convocazioni, la generazione dal programma settimanale —
 * mentre questa serve a **vedere**. Sostituirle con questa vorrebbe dire
 * mettere in una schermata sola due mestieri diversi.
 */

type EventoCalendario = {
  id: string;
  eventId?: string;
  kind: "training" | "match";
  title?: string;
  date: string;
  time: string;
  end_time?: string;
  status: string;
  category?: string;
  categoryId?: string | null;
  siteId?: string | null;
  location?: string;
  opponent?: string;
  groupIds?: string[];
  seasonId?: string | null;
  rsvpRequired?: boolean;
  capacity?: number | null;
};

const OGGI = () => new Date().toISOString().slice(0, 10);

const fraTrentaGiorni = () =>
  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const etichettaStato = (status: string) => {
  switch (String(status || "").toLowerCase()) {
    case "cancelled":
      return { testo: "Annullato", classe: "bg-red-50 text-red-700 border-red-200" };
    case "completed":
      return {
        testo: "Concluso",
        classe: "bg-slate-100 text-slate-600 border-slate-200",
      };
    case "archived":
      return {
        testo: "Archiviato",
        classe: "bg-amber-50 text-amber-700 border-amber-200",
      };
    default:
      return {
        testo: "In programma",
        classe: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
  }
};

const formattaGiorno = (giorno: string) => {
  const data = new Date(`${giorno}T00:00:00.000Z`);
  if (Number.isNaN(data.getTime())) return giorno;
  return data.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

export default function CalendarPage() {
  const { activeClub } = useAuth();
  const { showToast } = useToast();

  const [caricamento, setCaricamento] = useState(true);
  const [eventi, setEventi] = useState<EventoCalendario[]>([]);
  const [sedi, setSedi] = useState<ClubSite[]>([]);
  const [gruppi, setGruppi] = useState<CategoryGroup[]>([]);
  const [categorie, setCategorie] = useState<any[]>([]);

  const [tipo, setTipo] = useState<"all" | "training" | "match">("all");
  const [sede, setSede] = useState("");
  const [categoria, setCategoria] = useState("");
  const [gruppo, setGruppo] = useState("");
  const [da, setDa] = useState(OGGI);
  const [a, setA] = useState(fraTrentaGiorni);

  useEffect(() => {
    if (!activeClub?.id) return;
    let annullato = false;

    const carica = async () => {
      setCaricamento(true);
      try {
        const [righe, clubCategorie, clubSiti, strutture] = await Promise.all([
          listEvents({
            kind: tipo,
            from: `${da}T00:00:00.000Z`,
            to: `${a}T23:59:59.999Z`,
          }),
          getClubData(activeClub.id, "categories"),
          getClubData(activeClub.id, "club_sites"),
          getClubStructures(activeClub.id),
        ]);

        if (annullato) return;

        const siti = normalizeClubSites(clubSiti);
        setSedi(siti);
        setCategorie(Array.isArray(clubCategorie) ? clubCategorie : []);
        setGruppi(
          buildCategoryGroups({
            categories: Array.isArray(clubCategorie) ? clubCategorie : [],
            sites: siti,
            groups: await getClubData(activeClub.id, "category_groups"),
          }),
        );
        void strutture;
        setEventi(Array.isArray(righe) ? (righe as EventoCalendario[]) : []);
      } catch (errore: any) {
        if (!annullato) {
          showToast(
            "error",
            errore?.message || "Impossibile caricare il calendario",
          );
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
  }, [activeClub?.id, tipo, da, a, showToast]);

  const visibili = useMemo(() => {
    return eventi.filter((evento) => {
      if (sede && String(evento.siteId || "") !== sede) return false;
      if (
        categoria &&
        String(evento.categoryId || "") !== categoria &&
        String(evento.category || "") !== categoria
      ) {
        return false;
      }
      if (gruppo && !(evento.groupIds || []).includes(gruppo)) return false;
      return true;
    });
  }, [eventi, sede, categoria, gruppo]);

  const perGiorno = useMemo(() => {
    const mappa = new Map<string, EventoCalendario[]>();
    for (const evento of visibili) {
      const giorno = String(evento.date || "").slice(0, 10);
      if (!giorno) continue;
      mappa.set(giorno, [...(mappa.get(giorno) || []), evento]);
    }
    return Array.from(mappa.entries())
      .sort(([sinistra], [destra]) => sinistra.localeCompare(destra))
      .map(([giorno, righe]) => ({
        giorno,
        righe: righe.sort((sinistra, destra) =>
          String(sinistra.time || "").localeCompare(String(destra.time || "")),
        ),
      }));
  }, [visibili]);

  const nomeSede = (siteId?: string | null) =>
    sedi.find((sito) => sito.id === String(siteId || ""))?.name || "";

  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Calendario" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <SharedPageHeader
              title="Calendario"
              subtitle="Allenamenti e gare insieme, con i filtri che servono a leggere una settimana."
            />

        <Card>
          <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1">
              <Label htmlFor="calendario-da">Dal</Label>
              <input
                id="calendario-da"
                type="date"
                value={da}
                onChange={(evento) => setDa(evento.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="calendario-a">Al</Label>
              <input
                id="calendario-a"
                type="date"
                value={a}
                onChange={(evento) => setA(evento.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="calendario-tipo">Tipo</Label>
              <select
                id="calendario-tipo"
                value={tipo}
                onChange={(evento) => setTipo(evento.target.value as any)}
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
              >
                <option value="all">Tutto</option>
                <option value="training">Allenamenti</option>
                <option value="match">Gare</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="calendario-sede">Sede</Label>
              <select
                id="calendario-sede"
                value={sede}
                onChange={(evento) => setSede(evento.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
              >
                <option value="">Tutte le sedi</option>
                {sedi.map((sito) => (
                  <option key={sito.id} value={sito.id}>
                    {sito.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="calendario-categoria">Categoria</Label>
              <select
                id="calendario-categoria"
                value={categoria}
                onChange={(evento) => setCategoria(evento.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
              >
                <option value="">Tutte</option>
                {categorie.map((voce: any) => (
                  <option key={voce.id} value={voce.id}>
                    {voce.name || voce.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="calendario-gruppo">Gruppo</Label>
              <select
                id="calendario-gruppo"
                value={gruppo}
                onChange={(evento) => setGruppo(evento.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
              >
                <option value="">Tutti</option>
                {gruppi.map((voce) => (
                  <option key={voce.id} value={voce.id}>
                    {voce.name}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        {caricamento ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-slate-500">
              Caricamento del calendario…
            </CardContent>
          </Card>
        ) : perGiorno.length === 0 ? (
          <Card>
            <CardContent className="space-y-3 p-8 text-center">
              <Filter className="mx-auto h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-600">
                Nessun evento nell&apos;intervallo scelto con questi filtri.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/training">Vai agli allenamenti</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/matches">Vai alle gare</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            {perGiorno.map(({ giorno, righe }) => (
              <section key={giorno} className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {formattaGiorno(giorno)}
                </h2>
                <div className="space-y-2">
                  {righe.map((evento) => {
                    const stato = etichettaStato(evento.status);
                    const gara = evento.kind === "match";
                    return (
                      <Card key={evento.eventId || evento.id}>
                        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-start gap-3">
                            <div
                              className={`mt-1 rounded-lg p-2 ${
                                gara
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {gara ? (
                                <Trophy className="h-4 w-4" />
                              ) : (
                                <Users className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900">
                                {evento.title ||
                                  (gara
                                    ? `Gara contro ${evento.opponent || "avversario"}`
                                    : "Allenamento")}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                {evento.time}
                                {evento.end_time ? `–${evento.end_time}` : ""}
                                {evento.category ? ` · ${evento.category}` : ""}
                                {nomeSede(evento.siteId)
                                  ? ` · ${nomeSede(evento.siteId)}`
                                  : ""}
                                {evento.location ? ` · ${evento.location}` : ""}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {evento.rsvpRequired ? (
                              <Badge className="border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-50">
                                Conferma richiesta
                              </Badge>
                            ) : null}
                            {evento.capacity ? (
                              <Badge className="border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-50">
                                Capienza {evento.capacity}
                              </Badge>
                            ) : null}
                            <Badge className={`${stato.classe} hover:bg-inherit`}>
                              {stato.testo}
                            </Badge>
                            <Button asChild variant="outline" size="sm">
                              <Link href={gara ? "/matches" : "/training"}>
                                Apri
                              </Link>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
