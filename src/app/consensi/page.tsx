"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import { apiRequest } from "@/lib/api/client";
import {
  CONSENT_SUBJECT_KINDS,
  normalizeConsentKey,
} from "@/lib/consents/model";
import {
  canManageConsentDefinitions,
  canReadConsentRecords,
  canRecordConsentDecision,
} from "@/lib/documents/permissions";
import { FileCheck2, ShieldCheck, Undo2 } from "lucide-react";

/**
 * I consensi del club (W3-C, G-17).
 *
 * **Perche una schermata sola con due mestieri dentro.** La direzione
 * **configura** — decide cosa si chiede e pubblica il testo — e la segreteria
 * **registra** cosa ha deciso una famiglia. Sono due permessi diversi (§13) ma
 * la stessa domanda: «questa persona cosa ha firmato, e quando». Due schermate
 * vorrebbero dire due elenchi da confrontare a occhio.
 *
 * **Cio che un pulsante non fa, non si mostra.** Un pulsante che si vede e
 * risponde 403 e un difetto quanto una porta aperta: i permessi arrivano dallo
 * stesso modulo che usano le rotte (`src/lib/documents/permissions.ts`), non da
 * una seconda idea di chi puo fare cosa.
 *
 * **Lo stato non si sceglie da un menu.** Non c'e nessun controllo per
 * «impostare» un consenso ad accettato: si registra una decisione, e lo stato
 * lo ricava il server dallo storico. Una revoca aggiunge una riga — l'elenco
 * delle decisioni resta li, e non c'e nessun pulsante per cancellarne una.
 */

type Definizione = {
  id: string;
  key: string;
  title: string;
  description: string;
  required: boolean;
  status: string;
  publishedVersion: number;
  publishedVersionId: string | null;
  publishedAt: string | null;
};

type Decisione = {
  id: string;
  status: string;
  version: number | null;
  subjectKind: string;
  subjectId: string;
  subjectLabel: string;
  decidedAt: string | null;
  source: string;
  note: string;
};

type Stato = {
  definitionId: string;
  definitionKey: string;
  definitionTitle: string;
  required: boolean;
  subjectKind: string;
  subjectId: string;
  subjectLabel: string;
  status: string;
  version: number | null;
  decidedAt: string | null;
  onOutdatedVersion: boolean;
  historyCount: number;
};

const ETICHETTA_STATO: Record<string, string> = {
  accepted: "Accettato",
  rejected: "Rifiutato",
  revoked: "Revocato",
  missing: "Manca",
};

const ETICHETTA_SOGGETTO: Record<string, string> = {
  athlete: "Atleta",
  person: "Persona",
  member: "Socio",
  guardian: "Tutore",
};

const ETICHETTA_DEFINIZIONE: Record<string, string> = {
  draft: "Bozza",
  active: "Attivo",
  retired: "Ritirato",
};

const COLORE_STATO: Record<string, string> = {
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-amber-100 text-amber-800",
  revoked: "bg-rose-100 text-rose-800",
  missing: "bg-slate-100 text-slate-600",
};

/**
 * Data all'italiana scritta a mano.
 *
 * `toLocaleDateString("it-IT")` ripiega sull'ordine americano quando
 * l'ambiente non ha i dati di localizzazione, ed e il difetto che
 * `document-view.ts` ha gia risolto una volta: 03/09 letto come 9 marzo su una
 * revoca non e un dettaglio grafico.
 */
const formatData = (valore: string | null) => {
  if (!valore) return "—";
  const data = new Date(valore);
  if (Number.isNaN(data.getTime())) return "—";
  const giorno = String(data.getDate()).padStart(2, "0");
  const mese = String(data.getMonth() + 1).padStart(2, "0");
  return `${giorno}/${mese}/${data.getFullYear()}`;
};

export default function ConsensiPage() {
  const { showToast } = useToast();
  const { activeClub, userRole } = useAuth();

  const ruolo = String(activeClub?.role || userRole || "");
  const puoConfigurare = canManageConsentDefinitions(ruolo);
  const puoRegistrare = canRecordConsentDecision(ruolo);
  const puoLeggere = canReadConsentRecords(ruolo);

  const [definizioni, setDefinizioni] = useState<Definizione[]>([]);
  const [selezionata, setSelezionata] = useState<string>("");
  const [decisioni, setDecisioni] = useState<Decisione[]>([]);
  const [stati, setStati] = useState<Stato[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [occupato, setOccupato] = useState("");

  const [nuovaChiave, setNuovaChiave] = useState("");
  const [nuovoTitolo, setNuovoTitolo] = useState("");
  const [nuovaDescrizione, setNuovaDescrizione] = useState("");
  const [nuovoObbligatorio, setNuovoObbligatorio] = useState(false);

  const [testo, setTesto] = useState("");

  const [soggettoTipo, setSoggettoTipo] = useState<string>("athlete");
  const [soggettoId, setSoggettoId] = useState("");
  const [soggettoNome, setSoggettoNome] = useState("");
  const [nota, setNota] = useState("");

  const definizione = useMemo(
    () => definizioni.find((riga) => riga.id === selezionata) || null,
    [definizioni, selezionata],
  );

  const caricaDefinizioni = useCallback(async () => {
    const risposta = await apiRequest<Definizione[]>(
      "/api/v1/consents?include_retired=1",
    );
    setCaricamento(false);

    if (risposta.error || !Array.isArray(risposta.data)) {
      if (risposta.error) showToast("error", risposta.error.message);
      return;
    }

    setDefinizioni(risposta.data);
    setSelezionata((corrente) =>
      corrente && risposta.data.some((riga) => riga.id === corrente)
        ? corrente
        : risposta.data[0]?.id || "",
    );
  }, [showToast]);

  useEffect(() => {
    if (!puoLeggere) {
      setCaricamento(false);
      return;
    }
    caricaDefinizioni().catch(() => setCaricamento(false));
  }, [puoLeggere, caricaDefinizioni]);

  const caricaDecisioni = useCallback(async (definitionId: string) => {
    if (!definitionId) {
      setDecisioni([]);
      return;
    }
    const risposta = await apiRequest<Decisione[]>(
      `/api/v1/consents/${definitionId}/records?limit=50`,
    );
    setDecisioni(risposta.error || !Array.isArray(risposta.data) ? [] : risposta.data);
  }, []);

  useEffect(() => {
    if (!puoLeggere) return;
    caricaDecisioni(selezionata).catch(() => undefined);
  }, [puoLeggere, selezionata, caricaDecisioni]);

  /** La vista per soggetto: e quella che dice **cosa manca**. */
  const cercaSoggetto = useCallback(async () => {
    const id = soggettoId.trim();
    if (!id) {
      showToast("error", "Indica il soggetto da cercare");
      return;
    }

    setOccupato("ricerca");
    const risposta = await apiRequest<Stato[]>(
      `/api/v1/consents/states?subject_kind=${encodeURIComponent(soggettoTipo)}&subject_id=${encodeURIComponent(id)}`,
    );
    setOccupato("");

    if (risposta.error || !Array.isArray(risposta.data)) {
      showToast("error", risposta.error?.message || "Ricerca non riuscita");
      return;
    }
    setStati(risposta.data);
  }, [soggettoTipo, soggettoId, showToast]);

  const creaDefinizione = async () => {
    if (!nuovaChiave.trim() || !nuovoTitolo.trim()) {
      showToast("error", "Chiave e titolo sono obbligatori");
      return;
    }

    setOccupato("crea");
    const risposta = await apiRequest<Definizione>("/api/v1/consents", {
      method: "POST",
      body: {
        key: normalizeConsentKey(nuovaChiave),
        title: nuovoTitolo.trim(),
        description: nuovaDescrizione.trim(),
        required: nuovoObbligatorio,
      },
    });
    setOccupato("");

    if (risposta.error || !risposta.data) {
      showToast("error", risposta.error?.message || "Creazione non riuscita");
      return;
    }

    setNuovaChiave("");
    setNuovoTitolo("");
    setNuovaDescrizione("");
    setNuovoObbligatorio(false);
    showToast("success", "Consenso creato: ora pubblica il testo");
    await caricaDefinizioni();
    setSelezionata(risposta.data.id);
  };

  const pubblicaTesto = async () => {
    if (!definizione) return;
    if (!testo.trim()) {
      showToast("error", "Il testo del consenso non puo essere vuoto");
      return;
    }

    setOccupato("pubblica");
    const risposta = await apiRequest(
      `/api/v1/consents/${definizione.id}/versions`,
      { method: "POST", body: { body_text: testo } },
    );
    setOccupato("");

    if (risposta.error) {
      showToast("error", risposta.error.message);
      return;
    }

    setTesto("");
    showToast(
      "success",
      "Testo pubblicato. I consensi gia raccolti restano validi e vengono segnalati come dati su una versione precedente",
    );
    await caricaDefinizioni();
  };

  const cambiaStato = async (stato: string) => {
    if (!definizione) return;

    setOccupato("stato");
    const risposta = await apiRequest(`/api/v1/consents/${definizione.id}`, {
      method: "PATCH",
      body: { status: stato },
    });
    setOccupato("");

    if (risposta.error) {
      showToast("error", risposta.error.message);
      return;
    }
    await caricaDefinizioni();
  };

  const registra = async (stato: "accepted" | "rejected" | "revoked") => {
    if (!definizione) return;
    if (!soggettoId.trim()) {
      showToast("error", "Indica il soggetto della decisione");
      return;
    }

    setOccupato(stato);
    const risposta = await apiRequest(
      `/api/v1/consents/${definizione.id}/records`,
      {
        method: "POST",
        body: {
          subject_kind: soggettoTipo,
          subject_id: soggettoId.trim(),
          subject_label: soggettoNome.trim(),
          status: stato,
          source: "manual",
          note: nota.trim(),
        },
      },
    );
    setOccupato("");

    if (risposta.error) {
      showToast("error", risposta.error.message);
      return;
    }

    setNota("");
    showToast(
      "success",
      stato === "revoked"
        ? "Revoca registrata. L'accettazione precedente resta nello storico"
        : "Decisione registrata",
    );
    await caricaDecisioni(definizione.id);
    if (stati.length) await cercaSoggetto();
  };

  if (!puoLeggere) {
    return (
      <div className="flex h-[100dvh] bg-slate-50">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Consensi" />
          <main className={dashboardMainClassName}>
            <DashboardPageContainer className="max-w-3xl">
              <SharedPageHeader
                title="Consensi"
                subtitle="Accesso negato: i consensi del club li legge chi ci lavora dentro."
              />
            </DashboardPageContainer>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Consensi" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-7xl">
            <SharedPageHeader
              title="Consensi"
              subtitle="Cosa il club chiede di acconsentire, con quale testo, e chi ha detto di si. Una revoca non cancella niente: aggiunge una riga."
            />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
              {/* ---------------------------------------------- elenco */}
              <div className="flex flex-col gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      I consensi del club
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {caricamento ? (
                      <p className="text-sm text-slate-500">Caricamento…</p>
                    ) : definizioni.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Nessun consenso definito.
                        {puoConfigurare
                          ? " Creane uno qui sotto."
                          : " La direzione del club non ne ha ancora definiti."}
                      </p>
                    ) : (
                      definizioni.map((riga) => (
                        <button
                          key={riga.id}
                          type="button"
                          onClick={() => setSelezionata(riga.id)}
                          className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                            riga.id === selezionata
                              ? "border-blue-300 bg-blue-50"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                              {riga.title}
                            </span>
                            <Badge className="bg-slate-100 text-slate-700">
                              {ETICHETTA_DEFINIZIONE[riga.status] || riga.status}
                            </Badge>
                          </span>
                          <span className="mt-1 block truncate text-xs text-slate-500">
                            {riga.key}
                            {riga.publishedVersion > 0
                              ? ` · versione ${riga.publishedVersion}`
                              : " · nessun testo pubblicato"}
                            {riga.required ? " · obbligatorio" : ""}
                          </span>
                        </button>
                      ))
                    )}
                  </CardContent>
                </Card>

                {puoConfigurare ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Definisci un consenso
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="chiave">Chiave</Label>
                        <Input
                          id="chiave"
                          value={nuovaChiave}
                          placeholder="images"
                          onChange={(evento) =>
                            setNuovaChiave(evento.target.value)
                          }
                        />
                        <p className="text-xs text-slate-500">
                          Minuscole, cifre, trattino. La citano i moduli e i
                          modelli: dopo non si cambia.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="titolo">Titolo</Label>
                        <Input
                          id="titolo"
                          value={nuovoTitolo}
                          placeholder="Consenso immagini"
                          onChange={(evento) =>
                            setNuovoTitolo(evento.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="descrizione">Descrizione</Label>
                        <Input
                          id="descrizione"
                          value={nuovaDescrizione}
                          onChange={(evento) =>
                            setNuovaDescrizione(evento.target.value)
                          }
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={nuovoObbligatorio}
                          onChange={(evento) =>
                            setNuovoObbligatorio(evento.target.checked)
                          }
                        />
                        Segnala chi non lo ha dato
                      </label>
                      <Button
                        className="w-full"
                        onClick={creaDefinizione}
                        disabled={occupato === "crea"}
                      >
                        Crea in bozza
                      </Button>
                    </CardContent>
                  </Card>
                ) : null}
              </div>

              {/* --------------------------------------------- dettaglio */}
              <div className="flex min-w-0 flex-col gap-4">
                {!definizione ? (
                  <Card>
                    <CardContent className="py-8 text-sm text-slate-500">
                      Seleziona un consenso per vederne il testo e le decisioni.
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                          <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                          <span className="min-w-0 break-words">
                            {definizione.title}
                          </span>
                          <Badge className="bg-slate-100 text-slate-700">
                            {ETICHETTA_DEFINIZIONE[definizione.status] ||
                              definizione.status}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-slate-600">
                          {definizione.description ||
                            "Nessuna descrizione."}{" "}
                          {definizione.publishedVersion > 0
                            ? `Testo in vigore: versione ${definizione.publishedVersion} del ${formatData(definizione.publishedAt)}.`
                            : "Nessun testo pubblicato: non si possono raccogliere decisioni."}
                        </p>

                        {puoConfigurare ? (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="testo">
                                Pubblica un testo nuovo
                              </Label>
                              <Textarea
                                id="testo"
                                rows={5}
                                value={testo}
                                placeholder="Autorizzo la pubblicazione di foto e video…"
                                onChange={(evento) =>
                                  setTesto(evento.target.value)
                                }
                              />
                              <p className="text-xs text-slate-500">
                                Una versione pubblicata non si modifica piu. I
                                consensi gia raccolti restano validi e vengono
                                segnalati come dati su una versione precedente.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                onClick={pubblicaTesto}
                                disabled={occupato === "pubblica"}
                              >
                                Pubblica versione{" "}
                                {definizione.publishedVersion + 1}
                              </Button>
                              {definizione.status === "active" ? (
                                <Button
                                  variant="outline"
                                  onClick={() => cambiaStato("retired")}
                                  disabled={occupato === "stato"}
                                >
                                  Ritira
                                </Button>
                              ) : null}
                              {definizione.status === "retired" ? (
                                <Button
                                  variant="outline"
                                  onClick={() => cambiaStato("active")}
                                  disabled={occupato === "stato"}
                                >
                                  Riattiva
                                </Button>
                              ) : null}
                            </div>
                          </>
                        ) : null}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">
                          Il soggetto
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor="soggetto-tipo">Tipo</Label>
                            <select
                              id="soggetto-tipo"
                              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                              value={soggettoTipo}
                              onChange={(evento) =>
                                setSoggettoTipo(evento.target.value)
                              }
                            >
                              {CONSENT_SUBJECT_KINDS.map((tipo) => (
                                <option key={tipo} value={tipo}>
                                  {ETICHETTA_SOGGETTO[tipo] || tipo}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="soggetto-id">Identificativo</Label>
                            <Input
                              id="soggetto-id"
                              value={soggettoId}
                              onChange={(evento) =>
                                setSoggettoId(evento.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="soggetto-nome">Nome</Label>
                            <Input
                              id="soggetto-nome"
                              value={soggettoNome}
                              placeholder="Rossi Mario"
                              onChange={(evento) =>
                                setSoggettoNome(evento.target.value)
                              }
                            />
                          </div>
                        </div>

                        {puoRegistrare ? (
                          <div className="space-y-2">
                            <Label htmlFor="nota">Nota</Label>
                            <Input
                              id="nota"
                              value={nota}
                              placeholder="Modulo cartaceo consegnato in segreteria"
                              onChange={(evento) => setNota(evento.target.value)}
                            />
                          </div>
                        ) : null}

                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={cercaSoggetto}
                            disabled={occupato === "ricerca"}
                          >
                            Cosa ha firmato
                          </Button>
                          {puoRegistrare ? (
                            <>
                              <Button
                                onClick={() => registra("accepted")}
                                disabled={occupato === "accepted"}
                              >
                                Accetta
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => registra("rejected")}
                                disabled={occupato === "rejected"}
                              >
                                Rifiuta
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => registra("revoked")}
                                disabled={occupato === "revoked"}
                              >
                                <Undo2 className="mr-1 h-4 w-4" aria-hidden="true" />
                                Revoca
                              </Button>
                            </>
                          ) : null}
                        </div>

                        {stati.length ? (
                          <div className="space-y-2">
                            {stati.map((stato) => (
                              <div
                                key={`${stato.definitionId}-${stato.subjectId}`}
                                className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  {stato.definitionTitle}
                                </span>
                                <Badge
                                  className={
                                    COLORE_STATO[stato.status] ||
                                    COLORE_STATO.missing
                                  }
                                >
                                  {ETICHETTA_STATO[stato.status] || stato.status}
                                </Badge>
                                {stato.onOutdatedVersion ? (
                                  <Badge className="bg-amber-100 text-amber-800">
                                    versione precedente
                                  </Badge>
                                ) : null}
                                <span className="text-xs text-slate-500">
                                  {formatData(stato.decidedAt)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">
                          Le decisioni registrate
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {decisioni.length === 0 ? (
                          <p className="text-sm text-slate-500">
                            Nessuna decisione registrata per questo consenso.
                          </p>
                        ) : (
                          /*
                            La tabella scorre **dentro il suo contenitore**: a
                            375 px sei colonne non ci stanno, e farle allargare
                            la pagina significherebbe sfilare la barra laterale
                            fuori dallo schermo.
                          */
                          <div className="-mx-2 overflow-x-auto px-2">
                            <table className="w-full min-w-[42rem] text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                                  <th className="py-2 pr-3">Data</th>
                                  <th className="py-2 pr-3">Soggetto</th>
                                  <th className="py-2 pr-3">Decisione</th>
                                  <th className="py-2 pr-3">Versione</th>
                                  <th className="py-2 pr-3">Provenienza</th>
                                  <th className="py-2">Nota</th>
                                </tr>
                              </thead>
                              <tbody>
                                {decisioni.map((riga) => (
                                  <tr
                                    key={riga.id}
                                    className="border-b border-slate-100 last:border-0"
                                  >
                                    <td className="py-2 pr-3 whitespace-nowrap">
                                      {formatData(riga.decidedAt)}
                                    </td>
                                    <td className="py-2 pr-3">
                                      {riga.subjectLabel || riga.subjectId}
                                      <span className="block text-xs text-slate-500">
                                        {ETICHETTA_SOGGETTO[riga.subjectKind] ||
                                          riga.subjectKind}
                                      </span>
                                    </td>
                                    <td className="py-2 pr-3">
                                      <Badge
                                        className={
                                          COLORE_STATO[riga.status] ||
                                          COLORE_STATO.missing
                                        }
                                      >
                                        {ETICHETTA_STATO[riga.status] ||
                                          riga.status}
                                      </Badge>
                                    </td>
                                    <td className="py-2 pr-3">
                                      {riga.version ?? "—"}
                                    </td>
                                    <td className="py-2 pr-3">{riga.source}</td>
                                    <td className="py-2">{riga.note || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>
            </div>
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
