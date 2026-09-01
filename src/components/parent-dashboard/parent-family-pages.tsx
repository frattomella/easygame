"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  FileSignature,
  Megaphone,
  ShieldCheck,
  Trophy,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeading } from "@/components/dashboard/page-heading";
import { useToast } from "@/components/ui/toast-notification";
import { useParentDashboard } from "./parent-dashboard-context";

/**
 * **Le quattro schermate che la famiglia non aveva.**
 *
 * Il §13 del piano le elenca con la stessa forma: «backend pronto, nessuna
 * pagina». Non erano funzioni mancanti — erano funzioni **irraggiungibili**, e
 * la differenza conta perche il collaudo non poteva nemmeno provarle:
 *
 * - **la bacheca**: il motore delle comunicazioni e completo da due Wave, e
 *   `board.read` era un permesso senza schermata;
 * - **le notifiche**: arrivavano nel payload della dashboard e **non venivano
 *   mai disegnate**; «vedi tutte» rimbalzava;
 * - **i consensi**: la famiglia non poteva accettare ne revocare niente, e
 *   doveva telefonare per cambiare idea su una fotografia;
 * - **il calendario**: due elenchi separati in sola lettura, uno per figlio.
 *
 * Ognuna e una lettura sola verso una rotta che autorizza con il **legame**, e
 * non con il ruolo: un tutore puo non avere nessuna membership.
 */

const formatDate = (value: unknown) => {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const formatDateTime = (value: unknown) => {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const EmptyState = ({ text }: { text: string }) => (
  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
    {text}
  </p>
);

/* ================================================== la bacheca =========== */

export function ParentBoardPage() {
  const { data, athleteRouteId } = useParentDashboard();
  const { showToast } = useToast();
  const [annunci, setAnnunci] = useState<any[]>([]);
  const [caricamento, setCaricamento] = useState(true);

  const athleteId = data?.athlete.id || athleteRouteId;

  const carica = useCallback(async () => {
    if (!athleteId) return;
    setCaricamento(true);
    try {
      const risposta = await fetch(
        `/api/parent-dashboard/${athleteId}/board`,
        { cache: "no-store" },
      );
      const payload = await risposta.json().catch(() => ({}));
      if (!risposta.ok || payload?.error) {
        throw new Error(payload?.error?.message || "Bacheca non disponibile");
      }
      setAnnunci(Array.isArray(payload.data) ? payload.data : []);
    } catch (errore: any) {
      showToast("error", errore?.message || "Bacheca non disponibile");
      setAnnunci([]);
    } finally {
      setCaricamento(false);
    }
  }, [athleteId, showToast]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const segnaLetto = async (deliveryId: string) => {
    if (!athleteId || !deliveryId) return;
    await fetch(`/api/parent-dashboard/${athleteId}/board`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deliveryId }),
    }).catch(() => undefined);
    void carica();
  };

  return (
    <div className="space-y-6">
      <PageHeading
        title="Bacheca"
        subtitle="Le comunicazioni del club, quelle indirizzate a te."
      />
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-blue-600" />
            Avvisi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {caricamento ? (
            <EmptyState text="Caricamento…" />
          ) : annunci.length === 0 ? (
            <EmptyState text="Nessun avviso per ora." />
          ) : (
            annunci.map((annuncio) => (
              <article
                key={annuncio.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-950">
                      {annuncio.title}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(annuncio.publishedAt)}
                    </p>
                  </div>
                  {annuncio.readAt ? (
                    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                      Letto
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => segnaLetto(annuncio.deliveryId)}
                    >
                      Segna come letto
                    </Button>
                  )}
                </div>
                <p className="mt-3 whitespace-pre-line text-sm text-slate-700">
                  {annuncio.body}
                </p>
              </article>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ================================================ le notifiche =========== */

export function ParentNotificationsPage() {
  const { data } = useParentDashboard();
  const notifiche = data?.notifications || [];

  return (
    <div className="space-y-6">
      <PageHeading
        title="Notifiche"
        subtitle="Cio che il club ti ha segnalato."
      />
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-600" />
            Le tue notifiche
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {notifiche.length === 0 ? (
            <EmptyState text="Nessuna notifica." />
          ) : (
            notifiche.map((notifica: any) => (
              <div
                key={notifica.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-slate-950">
                    {notifica.title}
                  </p>
                  <span className="text-xs text-slate-500">
                    {formatDateTime(notifica.created_at)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{notifica.message}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ================================================== i consensi =========== */

export function ParentConsentsPage() {
  const { data, athleteRouteId } = useParentDashboard();
  const { showToast } = useToast();
  const [stati, setStati] = useState<any[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [inCorso, setInCorso] = useState<string | null>(null);

  const athleteId = data?.athlete.id || athleteRouteId;

  const carica = useCallback(async () => {
    if (!athleteId) return;
    setCaricamento(true);
    try {
      const risposta = await fetch(
        `/api/parent-dashboard/${athleteId}/consents`,
        { cache: "no-store" },
      );
      const payload = await risposta.json().catch(() => ({}));
      if (!risposta.ok || payload?.error) {
        throw new Error(payload?.error?.message || "Consensi non disponibili");
      }
      setStati(Array.isArray(payload.data) ? payload.data : []);
    } catch (errore: any) {
      showToast("error", errore?.message || "Consensi non disponibili");
      setStati([]);
    } finally {
      setCaricamento(false);
    }
  }, [athleteId, showToast]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const decidi = async (definitionId: string, status: string) => {
    if (!athleteId) return;
    setInCorso(`${definitionId}:${status}`);
    try {
      const risposta = await fetch(
        `/api/parent-dashboard/${athleteId}/consents`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ definitionId, status }),
        },
      );
      const payload = await risposta.json().catch(() => ({}));
      if (!risposta.ok || payload?.error) {
        throw new Error(payload?.error?.message || "Decisione non registrata");
      }
      showToast(
        "success",
        status === "revoked" ? "Consenso revocato" : "Consenso registrato",
      );
      await carica();
    } catch (errore: any) {
      showToast("error", errore?.message || "Decisione non registrata");
    } finally {
      setInCorso(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading
        title="Consensi"
        subtitle="A cosa hai detto di si, e cosa puoi revocare."
      />
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            I tuoi consensi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {caricamento ? (
            <EmptyState text="Caricamento…" />
          ) : stati.length === 0 ? (
            <EmptyState text="Il club non chiede nessun consenso." />
          ) : (
            stati.map((stato: any) => {
              const accettato = stato.status === "accepted";
              return (
                <div
                  key={stato.definitionId || stato.definition?.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-950">
                        {stato.title || stato.definition?.title || "Consenso"}
                      </p>
                      {stato.description || stato.definition?.description ? (
                        <p className="mt-1 text-sm text-slate-600">
                          {stato.description || stato.definition?.description}
                        </p>
                      ) : null}
                      {stato.required ? (
                        <p className="mt-1 text-xs font-medium text-amber-700">
                          Obbligatorio per il tesseramento
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      className={
                        accettato
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-50"
                      }
                    >
                      {accettato
                        ? "Accettato"
                        : stato.status === "revoked"
                          ? "Revocato"
                          : stato.status === "rejected"
                            ? "Rifiutato"
                            : "Da decidere"}
                    </Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={
                        accettato ||
                        inCorso ===
                          `${stato.definitionId || stato.definition?.id}:accepted`
                      }
                      onClick={() =>
                        decidi(
                          stato.definitionId || stato.definition?.id,
                          "accepted",
                        )
                      }
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Accetto
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        !accettato ||
                        inCorso ===
                          `${stato.definitionId || stato.definition?.id}:revoked`
                      }
                      onClick={() =>
                        decidi(
                          stato.definitionId || stato.definition?.id,
                          "revoked",
                        )
                      }
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Revoco
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ================================================= il calendario ========= */

export function ParentCalendarPage() {
  const { data, athleteRouteId } = useParentDashboard();
  const [tipo, setTipo] = useState<"all" | "training" | "match">("all");

  const eventi = useMemo(() => {
    if (!data) return [] as any[];
    const allenamenti = (data.trainings.all || []).map((voce: any) => ({
      ...voce,
      kind: "training" as const,
    }));
    const gare = (data.matches.all || []).map((voce: any) => ({
      ...voce,
      kind: "match" as const,
    }));

    return [...allenamenti, ...gare]
      .filter((voce) => (tipo === "all" ? true : voce.kind === tipo))
      .sort((sinistra, destra) =>
        String(sinistra.date || "").localeCompare(String(destra.date || "")),
      );
  }, [data, tipo]);

  const figli = data?.athlete.linkedAthletes || [];

  return (
    <div className="space-y-6">
      <PageHeading
        title="Calendario"
        subtitle="Allenamenti e gare insieme, in un elenco solo."
      />

      {figli.length > 1 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="flex flex-wrap gap-2 p-4">
            {figli.map((figlio: any) => (
              <Button
                key={figlio.id}
                asChild
                size="sm"
                variant={figlio.id === athleteRouteId ? "default" : "outline"}
              >
                <Link href={`/parent-view/${figlio.id}/calendar`}>
                  {figlio.name}
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-blue-600" />
            Prossimi impegni
          </CardTitle>
          <div className="flex gap-2">
            {(
              [
                ["all", "Tutto"],
                ["training", "Allenamenti"],
                ["match", "Gare"],
              ] as const
            ).map(([valore, etichetta]) => (
              <Button
                key={valore}
                size="sm"
                variant={tipo === valore ? "default" : "outline"}
                onClick={() => setTipo(valore)}
              >
                {etichetta}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {eventi.length === 0 ? (
            <EmptyState text="Nessun impegno in calendario." />
          ) : (
            eventi.map((evento: any) => (
              <div
                key={`${evento.kind}-${evento.id}`}
                className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={`mt-1 rounded-lg p-2 ${
                      evento.kind === "match"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {evento.kind === "match" ? (
                      <Trophy className="h-4 w-4" />
                    ) : (
                      <CalendarDays className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-950">
                      {evento.title ||
                        (evento.kind === "match"
                          ? `Gara contro ${evento.opponent || "avversario"}`
                          : "Allenamento")}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatDate(evento.date)}
                      {evento.time ? ` · ${evento.time}` : ""}
                      {evento.category ? ` · ${evento.category}` : ""}
                      {evento.location ? ` · ${evento.location}` : ""}
                    </p>
                  </div>
                </div>
                {evento.rsvpRequired ? (
                  <Badge className="border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-50">
                    Conferma richiesta
                  </Badge>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================================ le pratiche di iscrizione === */

/**
 * **Lo stato della domanda, che la famiglia non aveva mai visto.**
 *
 * Il motore dei moduli e corretto e ben costruito, e l'anagrafica nasce solo
 * all'approvazione umana (ADR-0040): l'iscrizione online esisteva **per il club
 * e non per la famiglia**. Si inviava e poi non si sapeva piu niente — nessun
 * riscontro, nessuno stato, nessun modo di sapere che era stata approvata, e la
 * segreteria riceveva la telefonata «a che punto siamo?».
 *
 * Lo stato «in lavorazione» e **derivato**, non una colonna nuova: e una
 * domanda ancora in attesa su cui pende almeno una richiesta documentale. Cio
 * che manca si mostra accanto, perche e l'unica cosa su cui la famiglia puo
 * fare qualcosa.
 */
export function ParentEnrollmentPage() {
  const { data, athleteRouteId } = useParentDashboard();
  const { showToast } = useToast();
  const [pratiche, setPratiche] = useState<any[]>([]);
  const [caricamento, setCaricamento] = useState(true);

  const athleteId = data?.athlete.id || athleteRouteId;

  useEffect(() => {
    if (!athleteId) return;
    let annullato = false;

    const carica = async () => {
      setCaricamento(true);
      try {
        const risposta = await fetch(
          `/api/v1/family/enrollment-requests?athlete_id=${encodeURIComponent(athleteId)}`,
          { cache: "no-store" },
        );
        const payload = await risposta.json().catch(() => ({}));
        if (!risposta.ok || payload?.error) {
          throw new Error(
            payload?.error?.message || "Pratiche non disponibili",
          );
        }
        if (!annullato) {
          setPratiche(Array.isArray(payload.data) ? payload.data : []);
        }
      } catch (errore: any) {
        if (!annullato) {
          showToast("error", errore?.message || "Pratiche non disponibili");
          setPratiche([]);
        }
      } finally {
        if (!annullato) setCaricamento(false);
      }
    };

    void carica();
    return () => {
      annullato = true;
    };
  }, [athleteId, showToast]);

  const etichetta = (stato: string) => {
    switch (String(stato || "").toLowerCase()) {
      case "approved":
        return {
          testo: "Approvata",
          classe: "border-emerald-200 bg-emerald-50 text-emerald-700",
        };
      case "rejected":
        return {
          testo: "Respinta",
          classe: "border-red-200 bg-red-50 text-red-700",
        };
      case "in_review":
      case "processing":
        return {
          testo: "In lavorazione",
          classe: "border-amber-200 bg-amber-50 text-amber-700",
        };
      default:
        return {
          testo: "Inviata",
          classe: "border-slate-200 bg-slate-50 text-slate-600",
        };
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading
        title="Iscrizione e rinnovo"
        subtitle="A che punto e la tua domanda, e cosa manca."
      />
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-blue-600" />
            Le tue pratiche
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {caricamento ? (
            <EmptyState text="Caricamento…" />
          ) : pratiche.length === 0 ? (
            <EmptyState text="Nessuna domanda inviata." />
          ) : (
            pratiche.map((pratica: any) => {
              const stato = etichetta(pratica.state || pratica.status);
              const mancanti = Array.isArray(pratica.missingDocuments)
                ? pratica.missingDocuments
                : [];
              return (
                <article
                  key={pratica.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-950">
                        {pratica.templateTitle ||
                          (pratica.kind === "renewal"
                            ? "Rinnovo"
                            : "Iscrizione")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Inviata il {formatDate(pratica.submittedAt)}
                        {pratica.seasonLabel
                          ? ` · stagione ${pratica.seasonLabel}`
                          : ""}
                      </p>
                    </div>
                    <Badge className={`${stato.classe} hover:bg-inherit`}>
                      {stato.testo}
                    </Badge>
                  </div>

                  {pratica.reviewNote ? (
                    <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      {pratica.reviewNote}
                    </p>
                  ) : null}

                  {mancanti.length > 0 ? (
                    <div className="mt-3 space-y-1">
                      <p className="text-sm font-medium text-amber-700">
                        Il club aspetta:
                      </p>
                      <ul className="list-inside list-disc text-sm text-slate-700">
                        {mancanti.map((documento: any) => (
                          <li key={documento.id || documento.title}>
                            {documento.title || documento.documentKind}
                          </li>
                        ))}
                      </ul>
                      <Button asChild size="sm" variant="outline" className="mt-2">
                        <Link href={`/parent-view/${athleteId}/documents`}>
                          Vai ai documenti
                        </Link>
                      </Button>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
