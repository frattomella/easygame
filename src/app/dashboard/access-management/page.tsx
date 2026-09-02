"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  KeyRound,
  Loader2,
  Plus,
  ScrollText,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";

import { DashboardPageContainer } from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest, readStoredActiveClub } from "@/lib/api/client";
import {
  CUSTOM_ROLE_BASE_ROLES,
  getAccessRoleLabel,
  normalizeAccessRole,
} from "@/lib/access-roles";
import {
  roleHasPermission,
  type PermissionDomain,
} from "@/lib/permissions/catalog";
import {
  isDirectionPermission,
  isOwnerActor,
  listGrantablePermissions,
} from "@/lib/roles/custom-role";
import type { AccessScopeEntry } from "@/lib/roles/access-scope";

/**
 * **La gestione accessi, per la prima volta vera** (W6-2, Wave 6 lane 6G).
 *
 * ## Che cosa c'era prima
 *
 * Un mock integrale: `grep "fetch("` rispondeva zero. Tre gestori inventati con
 * indirizzi `@example.com`, un token generato con `Math.random()` **nel
 * browser** e mai salvato da nessuna parte, e una tabella `access_tokens` che
 * la pagina dichiarava di scrivere e che **non esiste nello schema**. E la
 * peggiore delle tre superfici finte censite dal piano, perche prometteva un
 * controllo di sicurezza che non c'era: chi «disattivava un gestore» qui
 * cambiava uno stato in memoria che spariva al primo ricaricamento.
 *
 * Il mock e stato **sostituito**, non affiancato.
 *
 * ## Le due regole che governano cosa si vede
 *
 * 1. **Nessuna casella che non faccia niente.** Le chiavi mostrate sono quelle
 *    del catalogo (`src/lib/permissions/catalog.ts`), che dalla lane 6B sono
 *    tutte interrogate da una guardia, filtrate da `listGrantablePermissions`:
 *    fuori restano le chiavi che non appartengono al ruolo base — sarebbero un
 *    soprainsieme — e le tre chiavi **di legame**, il cui gate e il legame con
 *    un atleta e non un ruolo.
 * 2. **Cio che le caselle non governano si dice a parole.** Il perimetro sulle
 *    risorse generiche (atleti, pagamenti, magazzino) lo decide ancora la
 *    matrice per risorsa, cioe il **ruolo base**: la scheda del ruolo lo scrive
 *    invece di far credere che una casella lo copra.
 */

const ETICHETTE_DOMINIO: Record<PermissionDomain, string> = {
  accounting: "Contabilita",
  accounts: "Accessi delle persone",
  appointments: "Appuntamenti",
  audit: "Registro delle operazioni",
  communications: "Comunicazioni",
  consents: "Consensi",
  data_subject: "Dati personali di una persona",
  documents: "Documenti e modelli",
  events: "Allenamenti e gare",
  health: "Dato sanitario",
  members: "Libro soci",
  seasons: "Stagioni sportive",
  sport_work: "Lavoro sportivo",
};

/**
 * Cosa il **ruolo base** porta con se sulle risorse generiche, in una riga.
 *
 * Non e una configurazione: e la matrice per risorsa di
 * `src/lib/access-roles.ts`, che le caselle qui sotto non governano. Scriverlo
 * e l'unica alternativa onesta a mostrare caselle che non lo governerebbero.
 */
/**
 * **Cosa il ruolo base porta oltre le caselle, detto per intero.**
 *
 * Le caselle governano le chiavi del catalogo. Tutto cio che passa da
 * `normalizeAccessRole` — la matrice per risorsa, i percorsi riservati alla
 * direzione, la configurazione societaria — risponde invece al **ruolo base**:
 * l'invariante «mai piu del ruolo base» regge, ma per una base ampia come
 * `club_manager` la personalizzazione tocca una parte sola del potere.
 *
 * Questo testo esiste perche chi crea un ruolo lo sappia **prima**, e va tenuto
 * vero. Un audit ostile ha misurato che diceva la verita sulla parte larga —
 * le risorse — e taceva quella affilata: la cancellazione irreversibile del
 * fascicolo di una persona. Quella adesso e una **casella**
 * (`data_subject.erase`), quindi non e piu una cosa che il testo deve
 * confessare: e una cosa che il club puo togliere. Restano le altre, e sono
 * scritte.
 */
const PERIMETRO_DEL_RUOLO_BASE: Record<string, string> = {
  club_manager:
    "Tutte le risorse del club, comprese quelle riservate: conti correnti, metodi di pagamento, anagrafica societaria, lavoro sportivo. E i percorsi riservati alla direzione: configurazione, stagioni, comunicazioni, onboarding. Non si tolgono con una casella: per restringere davvero, parti da un ruolo base piu stretto.",
  collaborator:
    "Atleti, categorie, iscrizioni, pagamenti, magazzino e anagrafiche. Restano fuori conti correnti, metodi di pagamento, anagrafica societaria e lavoro sportivo; la cancellazione di rate e documenti fiscali e riservata alla direzione.",
  staff:
    "Come il collaboratore: atleti, categorie, iscrizioni, pagamenti, magazzino e anagrafiche, senza le risorse riservate alla direzione.",
  trainer:
    "Sola lettura sulle anagrafiche della propria squadra; in scrittura solo appello, allenamenti e notifiche. Il perimetro sui gruppi operativi resta quello dell'allenatore.",
};

type RuoloDiClub = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  base_role: string;
  base_role_label: string;
  is_active: boolean;
  permissions: string[];
  permission_labels: { key: string; label: string }[];
  contains_direction_keys: boolean;
  assigned_count: number;
};

type Assegnazione = {
  membership_id: string;
  user_id: string;
  email: string;
  name: string;
  role: string;
  role_label: string;
  is_owner: boolean;
  custom_role_id: string | null;
  custom_role_name: string | null;
  permissions: string[];
  scopes: AccessScopeEntry[];
};

type OpzioniPerimetro = {
  site: { id: string; label: string }[];
  category: { id: string; label: string }[];
};

type Bozza = {
  id: string | null;
  name: string;
  description: string;
  baseRole: string;
  permissions: string[];
};

const BOZZA_VUOTA: Bozza = {
  id: null,
  name: "",
  description: "",
  baseRole: "collaborator",
  permissions: [],
};

/**
 * I due ruoli che il mandato chiede per nome (§24), come **punto di partenza**
 * e non come riga di codice cablata: si aprono nell'editor, si cambiano, e
 * quello che viene salvato e una riga di `club_roles` come tutte le altre.
 *
 * «Segreteria» non porta `sport_work.read_own` — i compensi restano fuori — ne
 * nessuna chiave di configurazione contabile, che non esiste come chiave e
 * resta quindi governata dal ruolo base. «Direttore Sportivo» non porta niente
 * di documentale ne di economico.
 */
const PRESET: { titolo: string; descrizione: string; bozza: Bozza }[] = [
  {
    titolo: "Segreteria",
    descrizione:
      "Atleti, documenti, iscrizioni, appuntamenti e consensi. Niente compensi, niente proprieta.",
    bozza: {
      id: null,
      name: "Segreteria",
      description:
        "Anagrafiche, fascicolo documentale, appuntamenti e consensi delle famiglie.",
      baseRole: "collaborator",
      permissions: [
        "documents.templates.read",
        "documents.generate",
        "documents.generated.read",
        "documents.generated.advance",
        "documents.request",
        "documents.review",
        "documents.read_dossier",
        "appointments.read",
        "appointments.read_own",
        "appointments.manage",
        "consents.decide_for_others",
        "consents.records.read",
        "members.register.read",
        "clinical.status_read",
        "accounts.athlete.manage",
      ],
    },
  },
  {
    titolo: "Direttore Sportivo",
    descrizione:
      "Atleti, allenatori, eventi, gare e programmazione. Niente pagamenti, niente contabilita.",
    bozza: {
      id: null,
      name: "Direttore Sportivo",
      description:
        "Programmazione sportiva: calendario, convocazioni, appello e risposte delle famiglie.",
      baseRole: "staff",
      permissions: [
        "events.read",
        "events.manage",
        "events.convoke",
        "events.attendance",
        "rsvp.read",
        "clinical.status_read",
        "appointments.read_own",
      ],
    },
  },
];

export default function AccessManagementPage() {
  const { showToast } = useToast();

  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [ruoli, setRuoli] = useState<RuoloDiClub[]>([]);
  const [assegnazioni, setAssegnazioni] = useState<Assegnazione[]>([]);
  const [opzioni, setOpzioni] = useState<OpzioniPerimetro>({
    site: [],
    category: [],
  });
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);
  const [daCancellare, setDaCancellare] = useState<RuoloDiClub | null>(null);
  const [daRevocare, setDaRevocare] = useState<Assegnazione | null>(null);
  const [inModifica, setInModifica] = useState<string | null>(null);

  const ruoloAttivo = useMemo(() => readStoredActiveClub()?.role || "", []);
  const sonoProprietario = isOwnerActor(ruoloAttivo);

  const carica = useCallback(async () => {
    setCaricamento(true);
    const risposta = await apiRequest<{
      assignments: Assegnazione[];
      roles: RuoloDiClub[];
      scope_options: OpzioniPerimetro;
    }>("/api/v1/club-roles/assignments");

    if (risposta.error) {
      setErrore(risposta.error.message);
      setCaricamento(false);
      return;
    }

    setErrore(null);
    setRuoli(risposta.data?.roles || []);
    setAssegnazioni(risposta.data?.assignments || []);
    setOpzioni(
      risposta.data?.scope_options || { site: [], category: [] },
    );
    setCaricamento(false);
  }, []);

  useEffect(() => {
    void carica();
  }, [carica]);

  const chiaviConcedibili = useMemo(
    () => listGrantablePermissions(bozza?.baseRole || "collaborator"),
    [bozza?.baseRole],
  );

  const perDominio = useMemo(() => {
    const gruppi = new Map<PermissionDomain, typeof chiaviConcedibili>();
    for (const voce of chiaviConcedibili) {
      const elenco = gruppi.get(voce.domain) || [];
      gruppi.set(voce.domain, [...elenco, voce]);
    }
    return Array.from(gruppi.entries());
  }, [chiaviConcedibili]);

  const salvaRuolo = async () => {
    if (!bozza) return;
    setSalvataggio(true);

    const corpo = {
      name: bozza.name,
      description: bozza.description,
      base_role: bozza.baseRole,
      permissions: bozza.permissions,
    };

    const risposta = bozza.id
      ? await apiRequest(`/api/v1/club-roles/${bozza.id}`, {
          method: "PATCH",
          body: corpo,
        })
      : await apiRequest("/api/v1/club-roles", { method: "POST", body: corpo });

    setSalvataggio(false);

    if (risposta.error) {
      showToast("error", risposta.error.message);
      return;
    }

    showToast("success", bozza.id ? "Ruolo aggiornato" : "Ruolo creato");
    setBozza(null);
    await carica();
  };

  const cancellaRuolo = async (ruolo: RuoloDiClub) => {
    const risposta = await apiRequest(`/api/v1/club-roles/${ruolo.id}`, {
      method: "DELETE",
    });
    if (risposta.error) {
      showToast("error", risposta.error.message);
      return;
    }
    showToast("success", `Ruolo «${ruolo.name}» cancellato`);
    await carica();
  };

  const assegna = async (
    persona: Assegnazione,
    ruolo: string,
    scopes: AccessScopeEntry[],
  ) => {
    const risposta = await apiRequest("/api/v1/club-roles/assignments", {
      method: "POST",
      body: { user_id: persona.user_id, role: ruolo, scopes },
    });
    if (risposta.error) {
      showToast("error", risposta.error.message);
      return;
    }
    showToast("success", `Accesso aggiornato per ${persona.name || persona.email}`);
    setInModifica(null);
    await carica();
  };

  const revoca = async (persona: Assegnazione) => {
    const risposta = await apiRequest(
      `/api/v1/club-roles/assignments/${persona.membership_id}`,
      { method: "DELETE" },
    );
    if (risposta.error) {
      showToast("error", risposta.error.message);
      return;
    }
    showToast("success", "Accesso revocato");
    await carica();
  };

  return (
    <DashboardPageContainer>
      <SharedPageHeader
        title="Gestione accessi"
        subtitle="Chi entra in questo club, con quale ruolo e su quale perimetro."
        eyebrow="Sicurezza"
      />

      {errore ? (
        <Card className="border-destructive/40">
          <CardContent className="py-6 text-sm text-destructive">
            {errore}
          </CardContent>
        </Card>
      ) : null}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/*
          **La voce sparisce con la chiave.** E la meta visibile della prova di
          §10.5: chi non ha `audit.read` non vede il collegamento, e se lo
          indovinasse a mano la rotta risponderebbe comunque 403. Due serrature
          che dicono la stessa cosa, che e il modo giusto di averne due.
        */}
        {roleHasPermission(ruoloAttivo, "audit.read") ? (
          <Link href="/audit">
            <Button variant="outline" size="sm" className="gap-2">
              <ScrollText className="h-4 w-4" />
              Registro delle operazioni
            </Button>
          </Link>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Chi entra per la prima volta riceve un invito dalla propria scheda
          (atleta, allenatore, socio): il ruolo si assegna qui, dopo che
          l&apos;accesso e stato accettato.
        </p>
      </div>

      {/* ------------------------------------------------ i ruoli del club */}
      <Card className="mb-6">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            Ruoli del club
          </CardTitle>
          {sonoProprietario ? (
            <div className="flex flex-wrap gap-2">
              {PRESET.map((preset) => (
                <Button
                  key={preset.titolo}
                  variant="outline"
                  size="sm"
                  onClick={() => setBozza({ ...preset.bozza })}
                >
                  Clona «{preset.titolo}»
                </Button>
              ))}
              <Button
                size="sm"
                className="gap-2"
                onClick={() => setBozza({ ...BOZZA_VUOTA })}
              >
                <Plus className="h-4 w-4" />
                Nuovo ruolo
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Creare e modificare un ruolo e riservato al proprietario del club.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {caricamento ? (
            <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carico i ruoli…
            </p>
          ) : ruoli.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Nessun ruolo personalizzato. I sette ruoli standard restano
              disponibili: un ruolo personalizzato serve quando a una persona
              vanno concessi <strong>meno</strong> permessi di quelli del suo
              ruolo, mai di piu.
            </p>
          ) : (
            ruoli.map((ruolo) => (
              <div
                key={ruolo.id}
                className="rounded-lg border p-4"
                data-testid="club-role"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {ruolo.name}
                      <Badge variant="secondary">
                        da {ruolo.base_role_label}
                      </Badge>
                      {ruolo.contains_direction_keys ? (
                        <Badge variant="outline">contiene permessi di direzione</Badge>
                      ) : null}
                      {!ruolo.is_active ? (
                        <Badge variant="destructive">disattivato</Badge>
                      ) : null}
                    </p>
                    {ruolo.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {ruolo.description}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {ruolo.permissions.length} permessi ·{" "}
                      {ruolo.assigned_count} persone ·{" "}
                      <span className="font-mono">{ruolo.slug}</span>
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      <strong>Oltre alle caselle</strong>, il ruolo base porta:{" "}
                      {PERIMETRO_DEL_RUOLO_BASE[
                        normalizeAccessRole(ruolo.base_role) || "collaborator"
                      ] || "—"}
                    </p>
                  </div>
                  {sonoProprietario ? (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setBozza({
                            id: ruolo.id,
                            name: ruolo.name,
                            description: ruolo.description || "",
                            baseRole: ruolo.base_role,
                            permissions: [...ruolo.permissions],
                          })
                        }
                      >
                        Modifica
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setDaCancellare(ruolo)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {ruolo.permission_labels.map((voce) => (
                    <Badge
                      key={voce.key}
                      variant="outline"
                      className="font-normal"
                      title={voce.key}
                    >
                      {voce.label}
                    </Badge>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------ l'editor di ruolo */}
      {bozza ? (
        <Card className="mb-6 border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-5 w-5 text-blue-600" />
              {bozza.id ? "Modifica ruolo" : "Nuovo ruolo"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nome-ruolo">Nome</Label>
                <Input
                  id="nome-ruolo"
                  value={bozza.name}
                  onChange={(event) =>
                    setBozza({ ...bozza, name: event.target.value })
                  }
                  placeholder="Segreteria"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="base-ruolo">Parte da</Label>
                <select
                  id="base-ruolo"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                  value={bozza.baseRole}
                  disabled={Boolean(bozza.id)}
                  onChange={(event) =>
                    setBozza({
                      ...bozza,
                      baseRole: event.target.value,
                      permissions: [],
                    })
                  }
                >
                  {CUSTOM_ROLE_BASE_ROLES.map((ruolo) => (
                    <option key={ruolo} value={ruolo}>
                      {getAccessRoleLabel(ruolo)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {bozza.id
                    ? "Il ruolo di partenza non si cambia: cambierebbe i permessi di chi lo porta gia. Si crea un ruolo nuovo."
                    : "Il ruolo personalizzato potra avere al massimo i permessi di quello scelto qui."}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="descrizione-ruolo">Descrizione</Label>
              <Textarea
                id="descrizione-ruolo"
                value={bozza.description}
                onChange={(event) =>
                  setBozza({ ...bozza, description: event.target.value })
                }
                placeholder="A cosa serve questo ruolo nel club"
                rows={2}
              />
            </div>

            <div className="space-y-4">
              {perDominio.map(([dominio, voci]) => (
                <div key={dominio}>
                  <p className="mb-2 text-sm font-medium">
                    {ETICHETTE_DOMINIO[dominio] || dominio}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {voci.map((voce) => {
                      const attiva = bozza.permissions.includes(voce.key);
                      return (
                        <label
                          key={voce.key}
                          className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm"
                        >
                          <Checkbox
                            checked={attiva}
                            onCheckedChange={(valore) =>
                              setBozza({
                                ...bozza,
                                permissions: valore
                                  ? [...bozza.permissions, voce.key]
                                  : bozza.permissions.filter(
                                      (chiave) => chiave !== voce.key,
                                    ),
                              })
                            }
                          />
                          <span className="min-w-0">
                            <span className="block">{voce.label}</span>
                            <span className="block font-mono text-[11px] text-muted-foreground">
                              {voce.key}
                              {isDirectionPermission(voce.key)
                                ? " · direzione"
                                : ""}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={salvaRuolo} disabled={salvataggio}>
                {salvataggio ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Salva ruolo
              </Button>
              <Button variant="outline" onClick={() => setBozza(null)}>
                Annulla
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ------------------------------------------- le persone con accesso */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-blue-600" />
            Persone con accesso
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {caricamento ? (
            <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carico gli accessi…
            </p>
          ) : assegnazioni.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Nessun accesso registrato per questo club.
            </p>
          ) : (
            assegnazioni.map((persona) => (
              <div
                key={persona.membership_id}
                className="rounded-lg border p-4"
                data-testid="club-access-row"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {persona.name || persona.email}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {persona.email}
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant={persona.is_owner ? "default" : "secondary"}>
                        {persona.role_label}
                      </Badge>
                      {persona.scopes.length ? (
                        persona.scopes.map((perimetro) => (
                          <Badge
                            key={`${perimetro.kind}:${perimetro.value}`}
                            variant="outline"
                          >
                            {perimetro.kind === "site" ? "Sede" : "Categoria"}:{" "}
                            {(perimetro.kind === "site"
                              ? opzioni.site
                              : opzioni.category
                            ).find((voce) => voce.id === perimetro.value)
                              ?.label || perimetro.value}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline">Tutto il club</Badge>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setInModifica(
                          inModifica === persona.membership_id
                            ? null
                            : persona.membership_id,
                        )
                      }
                    >
                      <UserCog className="mr-2 h-4 w-4" />
                      Ruolo e perimetro
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDaRevocare(persona)}
                    >
                      Revoca
                    </Button>
                  </div>
                </div>

                {inModifica === persona.membership_id ? (
                  <EditorAssegnazione
                    persona={persona}
                    ruoli={ruoli}
                    opzioni={opzioni}
                    onSalva={(ruolo, scopes) => assegna(persona, ruolo, scopes)}
                  />
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(daCancellare)}
        onOpenChange={(aperto) => !aperto && setDaCancellare(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cancellare il ruolo «{daCancellare?.name}»?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Un ruolo assegnato non si puo cancellare: prima va revocato alle
              persone che lo portano.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const ruolo = daCancellare;
                setDaCancellare(null);
                if (ruolo) void cancellaRuolo(ruolo);
              }}
            >
              Cancella
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(daRevocare)}
        onOpenChange={(aperto) => !aperto && setDaRevocare(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Revocare l&apos;accesso a {daRevocare?.name || daRevocare?.email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              La persona non potra piu entrare in questo club. L&apos;operazione
              resta nel registro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const persona = daRevocare;
                setDaRevocare(null);
                if (persona) void revoca(persona);
              }}
            >
              Revoca
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardPageContainer>
  );
}

/**
 * Il ruolo e il perimetro di **una** persona.
 *
 * Il perimetro si scrive per sostituzione, e nessuna voce spuntata significa
 * «tutto il club»: e la stessa convenzione dell'archivio, dove zero righe non
 * sono zero accessi ma nessuna restrizione.
 */
function EditorAssegnazione({
  persona,
  ruoli,
  opzioni,
  onSalva,
}: {
  persona: Assegnazione;
  ruoli: RuoloDiClub[];
  opzioni: OpzioniPerimetro;
  onSalva: (ruolo: string, scopes: AccessScopeEntry[]) => void;
}) {
  const [ruolo, setRuolo] = useState(persona.role);
  const [scopes, setScopes] = useState<AccessScopeEntry[]>(persona.scopes);

  const commuta = (kind: "site" | "category", value: string) => {
    setScopes((precedenti) =>
      precedenti.some(
        (voce) => voce.kind === kind && voce.value === value,
      )
        ? precedenti.filter(
            (voce) => !(voce.kind === kind && voce.value === value),
          )
        : [...precedenti, { kind, value }],
    );
  };

  return (
    <div className="mt-4 space-y-4 rounded-md border bg-muted/30 p-4">
      <div className="space-y-2">
        <Label htmlFor={`ruolo-${persona.membership_id}`}>Ruolo</Label>
        <select
          id={`ruolo-${persona.membership_id}`}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm sm:max-w-sm"
          value={ruolo}
          onChange={(event) => setRuolo(event.target.value)}
        >
          <optgroup label="Ruoli standard">
            {["club_manager", "collaborator", "staff", "trainer"].map(
              (canonico) => (
                <option key={canonico} value={canonico}>
                  {getAccessRoleLabel(canonico)}
                </option>
              ),
            )}
          </optgroup>
          {ruoli.filter((voce) => voce.is_active).length ? (
            <optgroup label="Ruoli del club">
              {ruoli
                .filter((voce) => voce.is_active)
                .map((voce) => (
                  <option key={voce.id} value={voce.slug}>
                    {voce.name}
                  </option>
                ))}
            </optgroup>
          ) : null}
        </select>
      </div>

      {opzioni.site.length || opzioni.category.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {opzioni.site.length ? (
            <div>
              <p className="mb-2 text-sm font-medium">Sedi</p>
              <div className="space-y-2">
                {opzioni.site.map((sede) => (
                  <label
                    key={sede.id}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={scopes.some(
                        (voce) => voce.kind === "site" && voce.value === sede.id,
                      )}
                      onCheckedChange={() => commuta("site", sede.id)}
                    />
                    {sede.label}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          {opzioni.category.length ? (
            <div>
              <p className="mb-2 text-sm font-medium">Categorie</p>
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {opzioni.category.map((categoria) => (
                  <label
                    key={categoria.id}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={scopes.some(
                        (voce) =>
                          voce.kind === "category" &&
                          voce.value === categoria.id,
                      )}
                      onCheckedChange={() => commuta("category", categoria.id)}
                    />
                    {categoria.label}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/*
        **La promessa era senza riserve, e il perimetro non lo e ancora.**

        Il perimetro restringe atleti, allenamenti e gare, e i documenti. Su
        pagamenti, appuntamenti, comunicazioni, consensi, libro soci e lavoro
        sportivo non e ancora applicato (W6-D18). Chi assegna un perimetro
        deve saperlo **qui**, non scoprirlo dopo: una recinzione descritta come
        completa e piu pericolosa di una descritta per quello che e.
      */}
      <p className="text-xs text-muted-foreground">
        Nessuna casella spuntata significa <strong>tutto il club</strong>. Con
        una o piu caselle il perimetro vale su <strong>atleti</strong>,{" "}
        <strong>allenamenti e gare</strong> e <strong>documenti</strong>: gli
        altri elenchi del club restano completi.
      </p>

      <Button size="sm" onClick={() => onSalva(ruolo, scopes)}>
        Salva accesso
      </Button>
    </div>
  );
}
