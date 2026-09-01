"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  FileSignature,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  Trophy,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeading } from "@/components/dashboard/page-heading";
import { useToast } from "@/components/ui/toast-notification";
import {
  RenewalForm,
  readRenewalSlug,
} from "@/components/enrollment/renewal-form";
import { apiRequest } from "@/lib/api/client";
import * as formsApi from "@/lib/api/forms";
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
    /*
      Passa da `apiRequest`, come la regola di CLAUDE.md §2 chiede: nessun
      `fetch` diretto a `/api` da un componente. E `apiRequest` serializza da
      se — passargli un corpo gia serializzato manderebbe una stringa e ogni
      campo risulterebbe assente al server.
    */
    await apiRequest<unknown>(
      `/api/parent-dashboard/${athleteId}/board`,
      { method: "POST", body: { deliveryId } },
    ).catch(() => undefined);
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
  const { data, athleteRouteId, refresh } = useParentDashboard();
  const { showToast } = useToast();
  const [inCorso, setInCorso] = useState(false);
  const notifiche = data?.notifications || [];
  const daLeggere = data?.notificationsUnread || 0;

  /*
    W6-20. Fino alla Wave 6 questa pagina elencava otto notifiche e non
    permetteva di **chiuderne** nessuna: la campanella restava accesa per
    sempre, e da quel momento il numero smetteva di voler dire qualcosa. Una
    notifica che non si puo chiudere e rumore, e il rumore insegna a
    ignorare anche cio che conta.
  */
  const segnaTutteLette = async () => {
    setInCorso(true);
    try {
      const esito = await apiRequest<unknown>(
        `/api/parent-dashboard/${athleteRouteId}/notifications`,
        { method: "PATCH", body: { all: true } },
      );
      if (esito?.error) {
        throw new Error(esito.error.message || "Errore aggiornamento");
      }
      await refresh();
    } catch (problema: any) {
      showToast("error", problema?.message || "Errore aggiornamento");
    } finally {
      setInCorso(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading
        title="Notifiche"
        subtitle="Cio che il club ti ha segnalato."
        actions={
          daLeggere > 0 ? (
            <Button
              variant="outline"
              disabled={inCorso}
              onClick={() => void segnaTutteLette()}
            >
              {inCorso
                ? "Aggiorno…"
                : `Segna tutte come lette (${daLeggere})`}
            </Button>
          ) : undefined
        }
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
                {!notifica.read ? (
                  <span className="mt-2 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                    Da leggere
                  </span>
                ) : null}
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
      const payload = await apiRequest<unknown>(
        `/api/parent-dashboard/${athleteId}/consents`,
        { method: "POST", body: { definitionId, status } },
      );
      if (payload?.error) {
        throw new Error(payload.error.message || "Decisione non registrata");
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

      {/*
        W6-12. Il terzo e ultimo selettore sparso: era l'unica altra pagina che
        sapesse di avere piu figli. Adesso lo dice il guscio, su tutte.
      */}

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
 *
 * **Il rinnovo si apre da qui.** La pagina sapeva gia *leggere* una pratica
 * con `kind === "renewal"` e non sapeva crearne una: la rotta, la bozza
 * precompilata e i loro test esistevano senza nessun pulsante che li
 * accendesse. Il modulo lo disegna `RenewalForm`, che riusa `FormRenderer`.
 *
 * **Quale modulo si rinnova lo dice il club.** L'elenco arriva da
 * `fetchRenewalForms` — la stessa rotta del rinnovo, interrogata senza slug —
 * e porta solo titolo e slug pubblico. Il link ricevuto dalla societa resta
 * una scorciatoia (`?modulo=…`), non l'unica strada: finche lo era, il rinnovo
 * esisteva soltanto per chi sapeva gia che esisteva.
 */
export function ParentEnrollmentPage() {
  const { data, athleteRouteId } = useParentDashboard();
  const { showToast } = useToast();
  const [pratiche, setPratiche] = useState<any[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  /* I moduli che il club ha pubblicato, quello scelto, e se e aperto. */
  const [moduli, setModuli] = useState<formsApi.RenewalFormOption[]>([]);
  const [statoModuli, setStatoModuli] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [erroreModuli, setErroreModuli] = useState("");
  const [slugRinnovo, setSlugRinnovo] = useState("");
  const [rinnovoAperto, setRinnovoAperto] = useState(false);
  /*
    Cambia dopo un invio riuscito, e basta a rileggere l'elenco: la pratica
    appena inviata deve comparire subito, altrimenti la famiglia non ha nessun
    riscontro — che e esattamente il vuoto che questa pagina esiste per
    chiudere.
  */
  const [versione, setVersione] = useState(0);

  const athleteId = data?.athlete.id || athleteRouteId;

  /*
    La query si legge da `window.location`, non con `useSearchParams`: quel
    hook obbliga a una barriera `Suspense` attorno alla pagina, e qui serve un
    valore solo, una volta, dopo il montaggio.
  */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const parametri = new URLSearchParams(window.location.search);
    const dalLink = readRenewalSlug(
      parametri.get("modulo") || parametri.get("slug"),
    );
    if (!dalLink) return;
    setSlugRinnovo(dalLink);
    setRinnovoAperto(true);
  }, []);

  const caricaModuli = useCallback(async () => {
    if (!athleteId) return;
    setStatoModuli("loading");
    try {
      const elenco = await formsApi.fetchRenewalForms(athleteId);
      setModuli(elenco);
      setErroreModuli("");
      setStatoModuli("ready");
      /*
        Con **un** modulo solo non si sceglie: un menu con una voce sola non
        informa e occupa una riga che a 375 px serve al resto. Con lo slug gia
        arrivato dal link non si tocca cio che la famiglia ha in mano.
      */
      setSlugRinnovo((corrente) =>
        corrente || (elenco.length === 1 ? elenco[0].publicSlug : ""),
      );
    } catch (errore: any) {
      setModuli([]);
      setErroreModuli(errore?.message || "Moduli di rinnovo non disponibili");
      setStatoModuli("error");
    }
  }, [athleteId]);

  useEffect(() => {
    void caricaModuli();
  }, [caricaModuli]);

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
  }, [athleteId, showToast, versione]);

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

      {rinnovoAperto && athleteId && slugRinnovo ? (
        <RenewalForm
          athleteId={athleteId}
          publicSlug={slugRinnovo}
          onClose={() => setRinnovoAperto(false)}
          onSent={(messaggio) => {
            setRinnovoAperto(false);
            showToast("success", messaggio);
            setVersione((corrente) => corrente + 1);
          }}
        />
      ) : (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-blue-600" />
              Rinnova l&#8217;iscrizione
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">
              Il rinnovo e lo stesso modulo dell&#8217;iscrizione, gia compilato
              con i dati che la societa ha in archivio: si controlla, si
              corregge cio che e cambiato e si invia. La stagione la decide la
              societa.
            </p>

            {/*
              Tre stati, non due (10 — UI/UX): un elenco che non arriva non si
              racconta come «la societa non ha pubblicato niente», o una
              famiglia smette di cercare il rinnovo che le hanno chiesto.
            */}
            {statoModuli === "loading" ? (
              <p
                role="status"
                aria-live="polite"
                className="text-sm text-slate-500"
              >
                Cerco i moduli di rinnovo…
              </p>
            ) : statoModuli === "error" ? (
              <div className="space-y-2">
                <p role="alert" className="text-sm text-red-700">
                  {erroreModuli}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px] w-full sm:w-auto"
                  onClick={() => void caricaModuli()}
                >
                  Riprova
                </Button>
              </div>
            ) : moduli.length === 0 && !slugRinnovo ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                La societa non ha pubblicato nessun modulo di rinnovo. Quando lo
                fara lo trovi qui: non serve nessun link.
              </p>
            ) : (
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
                {/* Con un modulo solo non si sceglie: si apre. */}
                {moduli.length > 1 ? (
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor="modulo-rinnovo">Quale modulo</Label>
                    <Select
                      value={slugRinnovo || undefined}
                      onValueChange={setSlugRinnovo}
                    >
                      <SelectTrigger
                        id="modulo-rinnovo"
                        className="min-h-[44px] bg-white"
                      >
                        <SelectValue placeholder="Scegli il modulo" />
                      </SelectTrigger>
                      <SelectContent>
                        {moduli.map((modulo) => (
                          <SelectItem
                            key={modulo.publicSlug}
                            value={modulo.publicSlug}
                          >
                            {modulo.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <Button
                  type="button"
                  className="min-h-[44px] w-full sm:w-auto"
                  disabled={!athleteId || !slugRinnovo}
                  onClick={() => setRinnovoAperto(true)}
                >
                  Apri il rinnovo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
