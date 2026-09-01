"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, ScrollText, ShieldAlert } from "lucide-react";

import { DashboardPageContainer } from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api/client";
import { getAccessRoleLabel } from "@/lib/access-roles";

/**
 * **La consultazione del registro** (WP-16, Wave 6 lane 6G).
 *
 * Il registro esisteva da tre Wave — centootto punti di scrittura, quattro
 * indici gia adatti alla lettura — e non lo leggeva nessuno. Questa e la
 * schermata che mancava.
 *
 * ## Cosa si vede, e cosa no
 *
 * Solo le righe del **club attivo**: quelle senza club — il giro notturno dei
 * promemoria, un accesso fallito prima che ci sia un'organizzazione — non
 * appartengono a nessuno e non escono dalla rotta.
 *
 * Dei metadati esce un elenco **chiuso** di chiavi che descrivono l'atto —
 * quale permesso e stato negato, quale percorso, quante righe — e mai il
 * contenuto: nessun nome, nessun importo, nessun testo libero. Il dispositivo
 * di chi ha operato (`user_agent`) resta fuori del tutto.
 *
 * ## Il permesso e una chiave, non il percorso
 *
 * `/audit` non e fra i prefissi riservati alla direzione: chi decide e
 * `audit.read`. Tolta la chiave a un ruolo, questa pagina dice che l'accesso e
 * negato e la rotta risponde 403; rimessa, tornano entrambe. E la prova che
 * §10.5 del piano chiede, e per essere una prova deve passare da qui.
 */

type EventoAudit = {
  id: string;
  created_at: string;
  action: string;
  outcome: string;
  actor_email: string | null;
  actor_role: string | null;
  resource: string | null;
  resource_id: string | null;
  ip: string | null;
  metadata: Record<string, unknown>;
};

type Filtri = {
  area: string;
  outcome: string;
  actorEmail: string;
  resource: string;
  from: string;
  to: string;
  denied: boolean;
};

const FILTRI_VUOTI: Filtri = {
  area: "",
  outcome: "",
  actorEmail: "",
  resource: "",
  from: "",
  to: "",
  denied: false,
};

const PAGINA = 50;

const ETICHETTE_ESITO: Record<string, string> = {
  success: "Riuscita",
  failure: "Fallita",
  denied: "Negata",
};

const coloreEsito = (outcome: string) =>
  outcome === "denied"
    ? "destructive"
    : outcome === "failure"
      ? "outline"
      : "secondary";

const formattaIstante = (valore: string) => {
  const data = new Date(valore);
  return Number.isFinite(data.getTime())
    ? data.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "medium" })
    : valore;
};

export default function AuditPage() {
  const [filtri, setFiltri] = useState<Filtri>(FILTRI_VUOTI);
  const [applicati, setApplicati] = useState<Filtri>(FILTRI_VUOTI);
  const [offset, setOffset] = useState(0);
  const [caricamento, setCaricamento] = useState(true);
  const [negato, setNegato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [eventi, setEventi] = useState<EventoAudit[]>([]);
  const [aree, setAree] = useState<string[]>([]);
  const [totale, setTotale] = useState(0);

  const query = useMemo(() => {
    const parametri = new URLSearchParams();
    if (applicati.area) parametri.set("area", applicati.area);
    if (applicati.outcome) parametri.set("outcome", applicati.outcome);
    if (applicati.actorEmail) parametri.set("actor_email", applicati.actorEmail);
    if (applicati.resource) parametri.set("resource", applicati.resource);
    if (applicati.from) parametri.set("from", applicati.from);
    if (applicati.to) parametri.set("to", `${applicati.to}T23:59:59`);
    if (applicati.denied) parametri.set("denied", "1");
    parametri.set("limit", String(PAGINA));
    parametri.set("offset", String(offset));
    return parametri.toString();
  }, [applicati, offset]);

  const carica = useCallback(async () => {
    setCaricamento(true);
    const risposta = await apiRequest<{
      items: EventoAudit[];
      total: number;
      areas: string[];
    }>(`/api/v1/audit?${query}`);

    setCaricamento(false);

    if (risposta.error) {
      setNegato(risposta.error.status === 403);
      setErrore(risposta.error.message);
      setEventi([]);
      return;
    }

    setNegato(false);
    setErrore(null);
    setEventi(risposta.data?.items || []);
    setTotale(risposta.data?.total || 0);
    if (risposta.data?.areas?.length) setAree(risposta.data.areas);
  }, [query]);

  useEffect(() => {
    void carica();
  }, [carica]);

  if (negato) {
    return (
      <DashboardPageContainer>
        <SharedPageHeader
          title="Registro delle operazioni"
          subtitle="Chi ha fatto cosa in questo club, e cosa e stato negato."
          eyebrow="Sicurezza"
        />
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 py-8">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Il ruolo attivo non puo leggere il registro</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Serve il permesso <span className="font-mono">audit.read</span>.
                Lo concede il proprietario dalla gestione accessi.
              </p>
            </div>
          </CardContent>
        </Card>
      </DashboardPageContainer>
    );
  }

  return (
    <DashboardPageContainer>
      <SharedPageHeader
        title="Registro delle operazioni"
        subtitle="Chi ha fatto cosa in questo club, e cosa e stato negato."
        eyebrow="Sicurezza"
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-5 w-5 text-blue-600" />
            Filtri
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="area">Area</Label>
              <select
                id="area"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                value={filtri.area}
                onChange={(event) =>
                  setFiltri({ ...filtri, area: event.target.value })
                }
              >
                <option value="">Tutte</option>
                {aree.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="esito">Esito</Label>
              <select
                id="esito"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                value={filtri.outcome}
                onChange={(event) =>
                  setFiltri({ ...filtri, outcome: event.target.value })
                }
              >
                <option value="">Tutti</option>
                <option value="success">Riuscite</option>
                <option value="failure">Fallite</option>
                <option value="denied">Negate</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="attore">Chi (indirizzo)</Label>
              <Input
                id="attore"
                value={filtri.actorEmail}
                onChange={(event) =>
                  setFiltri({ ...filtri, actorEmail: event.target.value })
                }
                placeholder="parte dell'indirizzo"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="risorsa">Risorsa</Label>
              <Input
                id="risorsa"
                value={filtri.resource}
                onChange={(event) =>
                  setFiltri({ ...filtri, resource: event.target.value })
                }
                placeholder="athletes, payments…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dal">Dal</Label>
              <Input
                id="dal"
                type="date"
                value={filtri.from}
                onChange={(event) =>
                  setFiltri({ ...filtri, from: event.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="al">Al</Label>
              <Input
                id="al"
                type="date"
                value={filtri.to}
                onChange={(event) =>
                  setFiltri({ ...filtri, to: event.target.value })
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                setOffset(0);
                setApplicati(filtri);
              }}
            >
              Applica
            </Button>
            <Button
              size="sm"
              variant={applicati.denied ? "default" : "outline"}
              onClick={() => {
                const prossimi = { ...filtri, denied: !applicati.denied };
                setFiltri(prossimi);
                setOffset(0);
                setApplicati(prossimi);
              }}
            >
              Solo dinieghi
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFiltri(FILTRI_VUOTI);
                setApplicati(FILTRI_VUOTI);
                setOffset(0);
              }}
            >
              Azzera
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">
            {totale} operazioni
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(offset - PAGINA, 0))}
            >
              Precedenti
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={offset + PAGINA >= totale}
              onClick={() => setOffset(offset + PAGINA)}
            >
              Successive
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {errore ? (
            <p className="py-4 text-sm text-destructive">{errore}</p>
          ) : caricamento ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carico il registro…
            </p>
          ) : eventi.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              Nessuna operazione con questi filtri.
            </p>
          ) : (
            <div className="space-y-2">
              {eventi.map((evento) => (
                <div
                  key={evento.id}
                  className="rounded-lg border p-3 text-sm"
                  data-testid="audit-row"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant={coloreEsito(evento.outcome)}>
                        {ETICHETTE_ESITO[evento.outcome] || evento.outcome}
                      </Badge>
                      <span className="font-mono text-xs">{evento.action}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formattaIstante(evento.created_at)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {evento.actor_email || "—"}
                    {evento.actor_role
                      ? ` · ${getAccessRoleLabel(evento.actor_role)}`
                      : ""}
                    {evento.resource ? ` · ${evento.resource}` : ""}
                    {evento.resource_id ? ` · ${evento.resource_id}` : ""}
                    {evento.ip ? ` · ${evento.ip}` : ""}
                  </p>
                  {Object.keys(evento.metadata).length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Object.entries(evento.metadata).map(([chiave, valore]) => (
                        <Badge
                          key={chiave}
                          variant="outline"
                          className="font-normal"
                        >
                          {chiave}:{" "}
                          {typeof valore === "object"
                            ? JSON.stringify(valore)
                            : String(valore)}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardPageContainer>
  );
}
