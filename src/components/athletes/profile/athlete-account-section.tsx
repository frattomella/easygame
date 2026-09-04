"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Mail,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
  Unlink2,
  UserPlus,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import { apiRequest } from "@/lib/api/client";
import { roleHasPermission } from "@/lib/permissions/catalog";

/**
 * **«Accesso EasyGame», al posto del pulsante che mentiva** (W6-26).
 *
 * Qui c'era «Invia credenziali», e non chiamava niente: mostrava un errore, e
 * prima ancora mostrava un messaggio **verde** che diceva «Credenziali
 * inviate». La segreteria chiudeva la scheda convinta di aver fatto una cosa
 * che non era successa, e l'atleta restava senza accesso senza che nessuno lo
 * sapesse.
 *
 * La sezione dice **quattro stati** e non uno: nessun account, invito inviato,
 * accesso attivo, **accesso revocato**. E mostra la **storia**, perche la
 * domanda che arriva dopo — «ma glielo abbiamo mandato?» — non la risponde
 * nessuno stato corrente.
 *
 * Il quarto e di PP-04. Un accesso revocato diceva «Nessun account»: la stessa
 * scritta di un atleta mai invitato, per il fatto opposto. Accanto allo stato
 * ci sono adesso anche **a chi** e stato mandato l'ultimo invito e **quando** —
 * che fuori dallo stato «invitato» sparivano dallo schermo proprio nel momento
 * in cui qualcuno se lo chiede.
 *
 * **Nessuna password compare in questa schermata, in nessun ramo**, e non e
 * una scelta di interfaccia: non ne esiste una da mostrare. Il server manda un
 * link, e la password la sceglie l'atleta.
 */

type StatoAccesso = {
  athleteId: string;
  status: "none" | "invited" | "active" | "revoked";
  account: {
    userId: string;
    email: string;
    name: string | null;
    emailVerifiedAt: string | null;
  } | null;
  invite: {
    id: string;
    email: string;
    sentAt: string;
    expiresAt: string;
  } | null;
  lastInviteEmail: string | null;
  lastInviteAt: string | null;
  revokedAt: string | null;
  history: {
    id: string;
    email: string;
    status: string;
    sentAt: string;
    acceptedAt: string | null;
    revokedAt: string | null;
    expiresAt: string;
  }[];
};

const ETICHETTA_STORIA: Record<string, string> = {
  sent: "Inviato",
  accepted: "Accettato",
  revoked: "Revocato",
  expired: "Scaduto",
};

const quando = (valore: string | null | undefined) => {
  if (!valore) return "—";
  const istante = new Date(valore);
  if (Number.isNaN(istante.getTime())) return "—";
  return istante.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * **La stessa chiave, chiesta una volta sola.**
 *
 * La scheda atleta disegna il pulsante «Accesso EasyGame» solo a chi puo
 * davvero gestirlo. Senza questo gancio la chiave finirebbe scritta due volte —
 * qui e nella pagina — e il giorno in cui una delle due cambiasse comparirebbe
 * un pulsante che apre un pannello vuoto.
 */
export function usePuoGestireAccessoAtleta() {
  const { activeClub } = useAuth();
  return roleHasPermission(activeClub?.role, "accounts.athlete.manage");
}

/**
 * **Il pannello dedicato** (PP-01 §G).
 *
 * Il contenuto e lo stesso di prima: cambia solo dove sta. Stava in cima alla
 * scheda, sopra l'anagrafica, e occupava la prima schermata di ogni atleta per
 * una cosa che si fa **una volta sola** nella vita di quell'atleta. Adesso e un
 * pulsante nell'intestazione che apre questo dialogo.
 *
 * Il contenuto si monta con il dialogo, quindi la chiamata a
 * `GET /api/v1/athlete-accounts/:id` parte all'apertura e non piu a ogni
 * visita della scheda: e una richiesta in meno per ogni atleta aperto.
 */
export function AthleteAccountDialog({
  athleteId,
  suggestedEmail,
  open,
  onOpenChange,
}: {
  athleteId: string;
  suggestedEmail?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Accesso EasyGame
          </DialogTitle>
          <DialogDescription>
            L&apos;atleta riceve un link personale e sceglie da se la propria
            password. EasyGame non manda mai una password per email, e nessuno
            del club la puo vedere.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <AthleteAccountSection
            athleteId={athleteId}
            suggestedEmail={suggestedEmail}
            chrome="plain"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function AthleteAccountSection({
  athleteId,
  suggestedEmail,
  chrome = "card",
}: {
  athleteId: string;
  /** L'indirizzo gia in anagrafica: si propone, non si impone. */
  suggestedEmail?: string | null;
  /**
   * `card` disegna la propria intestazione; `plain` no, perche dentro un
   * dialogo il titolo lo mette il dialogo e due cornici annidate sono solo
   * due bordi.
   */
  chrome?: "card" | "plain";
}) {
  const { activeClub } = useAuth();
  const { showToast } = useToast();
  const [stato, setStato] = useState<StatoAccesso | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [inCorso, setInCorso] = useState(false);

  /*
    La stessa chiave che il server chiede. Nasconderla a chi non ce l'ha non e
    il presidio — il presidio e la guardia di dominio — ma mostrare a un
    allenatore una sezione che poi risponde 403 e il difetto che questa Wave ha
    trovato dieci volte.
  */
  const puoGestire = roleHasPermission(
    activeClub?.role,
    "accounts.athlete.manage",
  );

  const carica = useCallback(async () => {
    if (!athleteId) return;
    setCaricamento(true);
    try {
      const risposta = await apiRequest<StatoAccesso>(
        `/api/v1/athlete-accounts/${athleteId}`,
      );
      if (risposta.error) {
        setErrore(risposta.error.message);
        setStato(null);
        return;
      }
      setStato(risposta.data);
      setErrore(null);
    } finally {
      setCaricamento(false);
    }
  }, [athleteId]);

  useEffect(() => {
    if (!puoGestire) {
      setCaricamento(false);
      return;
    }
    void carica();
  }, [carica, puoGestire]);

  useEffect(() => {
    /*
      Dopo una revoca l'indirizzo giusto da riproporre e **quello a cui si era
      gia mandato**, non quello in anagrafica: se differiscono, e perche
      qualcuno aveva gia corretto il primo.
    */
    setEmail(
      stato?.invite?.email || stato?.lastInviteEmail || suggestedEmail || "",
    );
  }, [stato?.invite?.email, stato?.lastInviteEmail, suggestedEmail]);

  const agisci = useCallback(
    async (
      percorso: string,
      opzioni: { method: string; body?: any },
      successo: string,
    ) => {
      setInCorso(true);
      try {
        const risposta = await apiRequest(percorso, opzioni as any);
        if (risposta.error) throw new Error(risposta.error.message);
        showToast("success", successo);
        await carica();
      } catch (caught: any) {
        showToast("error", caught?.message || "Operazione non riuscita");
      } finally {
        setInCorso(false);
      }
    },
    [carica, showToast],
  );

  if (!puoGestire) return null;

  const corpo = (
    <div className="space-y-4">
        {caricamento ? (
          <p className="text-sm text-slate-500">Caricamento…</p>
        ) : errore ? (
          <p className="text-sm text-red-600">{errore}</p>
        ) : stato ? (
          <>
            {/* ------------------------------------------------ lo stato -- */}
            {/*
              **Quattro stati, non tre** (PP-04). «Accesso revocato» era
              indistinguibile da «Nessun account»: la stessa scritta per un
              atleta mai invitato e per uno a cui l'accesso e stato **tolto**,
              che sono i due fatti opposti su cui la segreteria telefona.
            */}
            <div className="flex flex-wrap items-center gap-2">
              {stato.status === "active" ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Accesso attivo
                </Badge>
              ) : stato.status === "invited" ? (
                <Badge variant="secondary">
                  <Mail className="mr-1 h-3 w-3" />
                  Invito inviato
                </Badge>
              ) : stato.status === "revoked" ? (
                <Badge variant="destructive">
                  <ShieldOff className="mr-1 h-3 w-3" />
                  Accesso revocato
                </Badge>
              ) : (
                <Badge variant="outline">Nessun account</Badge>
              )}

              {stato.account ? (
                <span className="text-sm text-slate-600">
                  {stato.account.email}
                  {stato.account.name ? ` · ${stato.account.name}` : ""}
                </span>
              ) : stato.invite ? (
                <span className="text-sm text-slate-600">
                  {stato.invite.email} · inviato il {quando(stato.invite.sentAt)}
                  , scade il {quando(stato.invite.expiresAt)}
                </span>
              ) : stato.lastInviteEmail ? (
                /*
                  Fuori dallo stato «invitato» il ramo `invite` e nullo, e con
                  lui sparivano dallo schermo «a chi» e «quando» — che sono
                  esattamente le due domande che ci si fa **dopo** una revoca o
                  una scadenza.
                */
                <span className="text-sm text-slate-600">
                  {stato.lastInviteEmail} · ultimo invito il{" "}
                  {quando(stato.lastInviteAt)}
                  {stato.revokedAt
                    ? `, revocato il ${quando(stato.revokedAt)}`
                    : ""}
                </span>
              ) : null}
            </div>

            {stato.status === "revoked" ? (
              <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-900">
                Questo atleta aveva un accesso a EasyGame e non ce l&apos;ha
                piu. Se deve rientrare, mandagli un invito nuovo: il vecchio
                link non funziona.
              </p>
            ) : null}

            {/* ----------------------------------------------- le azioni -- */}
            {stato.status === "active" ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={inCorso}
                  onClick={() => {
                    void agisci(
                      `/api/v1/athlete-accounts/${athleteId}/link`,
                      { method: "DELETE" },
                      "Account scollegato dal profilo atleta",
                    );
                  }}
                >
                  <Unlink2 className="mr-2 h-4 w-4" />
                  Scollega account
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={inCorso}
                  onClick={() => {
                    void agisci(
                      `/api/v1/athlete-accounts/${athleteId}`,
                      { method: "DELETE" },
                      "Accesso revocato",
                    );
                  }}
                >
                  <ShieldOff className="mr-2 h-4 w-4" />
                  Revoca l&apos;accesso
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="max-w-md">
                  <Label htmlFor="accesso-atleta-email">
                    Indirizzo email dell&apos;atleta
                  </Label>
                  <Input
                    id="accesso-atleta-email"
                    type="email"
                    value={email}
                    onChange={(evento) => setEmail(evento.target.value)}
                    placeholder="nome@esempio.it"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {stato.status === "invited" ? (
                    <>
                      <Button
                        size="sm"
                        disabled={inCorso}
                        onClick={() => {
                          void agisci(
                            `/api/v1/athlete-accounts/${athleteId}/resend`,
                            { method: "POST" },
                            "Invito reinviato",
                          );
                        }}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Reinvia l&apos;invito
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={inCorso || !email.trim()}
                        onClick={() => {
                          void agisci(
                            `/api/v1/athlete-accounts/${athleteId}/email`,
                            { method: "POST", body: { email } },
                            "Invito mandato al nuovo indirizzo",
                          );
                        }}
                      >
                        <Mail className="mr-2 h-4 w-4" />
                        Cambia indirizzo e reinvia
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={inCorso}
                        onClick={() => {
                          void agisci(
                            `/api/v1/athlete-accounts/${athleteId}`,
                            { method: "DELETE" },
                            "Invito revocato",
                          );
                        }}
                      >
                        <ShieldOff className="mr-2 h-4 w-4" />
                        Revoca l&apos;invito
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      disabled={inCorso || !email.trim()}
                      onClick={() => {
                        void agisci(
                          `/api/v1/athlete-accounts/${athleteId}`,
                          { method: "POST", body: { email } },
                          "Invito inviato",
                        );
                      }}
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      {stato.status === "revoked"
                        ? "Invita di nuovo"
                        : "Invita l’atleta"}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* --------------------------------------------- cosa e stato - */}
            {stato.history.length ? (
              <div className="pt-2">
                <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                  Cosa e successo
                </p>
                <ul className="space-y-1 text-sm text-slate-600">
                  {stato.history.map((riga) => (
                    <li
                      key={riga.id}
                      className="flex flex-wrap items-center gap-x-2 border-b border-slate-100 pb-1"
                    >
                      <span className="font-medium text-slate-800">
                        {ETICHETTA_STORIA[riga.status] || riga.status}
                      </span>
                      <span>{riga.email}</span>
                      <span className="text-slate-400">
                        {quando(
                          riga.acceptedAt || riga.revokedAt || riga.sentAt,
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
      ) : null}
    </div>
  );

  if (chrome === "plain") return corpo;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" />
          Accesso EasyGame
        </CardTitle>
        <CardDescription>
          L&apos;atleta riceve un link personale e sceglie da se la propria
          password. EasyGame non manda mai una password per email, e nessuno del
          club la puo vedere.
        </CardDescription>
      </CardHeader>
      <CardContent>{corpo}</CardContent>
    </Card>
  );
}
