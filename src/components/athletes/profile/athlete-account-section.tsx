"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Mail,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
  Unlink2,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/web/primitives/Button";
import { Checkbox, Skeleton } from "@/components/web/primitives/Controls";
import { Panel, PanelHeader, Eyebrow } from "@/components/web/primitives/Surface";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { Drawer } from "@/components/web/overlays/Drawer";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Field, FieldSizeProvider, TextInput } from "@/components/web/forms/Field";
import { formatDateTime } from "@/lib/web/format";
import { useToast } from "@/components/ui/toast-notification";
import { athleteAccountStatus } from "./v2/record-primitives";
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
  /** Vero anche quando la data di nascita manca del tutto (ADR-0116). */
  isMinor: boolean;
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

const quando = (valore: string | null | undefined) => formatDateTime(valore);

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
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Accesso"
      title="Accesso EasyGame"
      description="L'atleta riceve un link personale e sceglie da sé la propria password. EasyGame non manda mai una password per email, e nessuno del club la può vedere."
    >
      {open ? (
        <FieldSizeProvider size="sm">
          <AthleteAccountSection
            athleteId={athleteId}
            suggestedEmail={suggestedEmail}
            chrome="plain"
          />
        </FieldSizeProvider>
      ) : null}
    </Drawer>
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
    **La conferma sulla responsabilita genitoriale** (ADR-0116). Non e uno
    stato del server: e la dichiarazione che si sta facendo adesso, e riparte
    da spenta a ogni apertura del pannello e dopo ogni gesto riuscito. Una
    casella che restasse spuntata fra un atleta e l'altro sarebbe una
    dichiarazione che nessuno ha piu fatto.
  */
  const [tutoreAutorizza, setTutoreAutorizza] = useState(false);

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
        setTutoreAutorizza(false);
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

  /*
    Il pulsante resta spento finche la dichiarazione non c'e. Non e il
    presidio — il presidio e il dominio, che rifiuta comunque — ma un pulsante
    acceso che risponde 400 e il difetto che questa Wave ha trovato dieci
    volte.
  */
  const mancaLaConferma = Boolean(stato?.isMinor) && !tutoreAutorizza;

  const corpo = (
    <div className="flex flex-col gap-4">
      {caricamento ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-[42px] w-full" />
          <Skeleton className="h-8 w-40" />
        </div>
      ) : errore ? (
        <AlertBlock severity="danger" title={errore} />
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
            <StatusPill status={athleteAccountStatus(stato.status)} />
            {stato.account ? (
              <span className="font-brand text-[12.5px] text-egw-ink-62">
                {stato.account.email}
                {stato.account.name ? ` · ${stato.account.name}` : ""}
              </span>
            ) : stato.invite ? (
              <span className="font-brand text-[12.5px] text-egw-ink-62">
                {stato.invite.email} · inviato il {quando(stato.invite.sentAt)}, scade il {quando(stato.invite.expiresAt)}
              </span>
            ) : stato.lastInviteEmail ? (
              /*
                Fuori dallo stato «invitato» il ramo `invite` e nullo, e con
                lui sparivano dallo schermo «a chi» e «quando» — che sono
                esattamente le due domande che ci si fa **dopo** una revoca o
                una scadenza.
              */
              <span className="font-brand text-[12.5px] text-egw-ink-62">
                {stato.lastInviteEmail} · ultimo invito il {quando(stato.lastInviteAt)}
                {stato.revokedAt ? `, revocato il ${quando(stato.revokedAt)}` : ""}
              </span>
            ) : null}
          </div>

          {stato.status === "revoked" ? (
            <AlertBlock severity="danger" title="Questo atleta aveva un accesso a EasyGame e non ce l'ha più.">
              Se deve rientrare, mandagli un invito nuovo: il vecchio link non funziona.
            </AlertBlock>
          ) : null}

          {/* ----------------------------------------------- le azioni -- */}
          {stato.status === "active" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<Unlink2 />}
                disabled={inCorso}
                onClick={() => {
                  void agisci(
                    `/api/v1/athlete-accounts/${athleteId}/link`,
                    { method: "DELETE" },
                    "Account scollegato dal profilo atleta",
                  );
                }}
              >
                Scollega account
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={<ShieldOff />}
                disabled={inCorso}
                onClick={() => {
                  void agisci(
                    `/api/v1/athlete-accounts/${athleteId}`,
                    { method: "DELETE" },
                    "Accesso revocato",
                  );
                }}
              >
                Revoca l&apos;accesso
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <Field label="Indirizzo email dell'atleta" htmlFor="accesso-atleta-email">
                <TextInput
                  id="accesso-atleta-email"
                  type="email"
                  inputMode="email"
                  leading={<Mail />}
                  value={email}
                  onChange={(evento) => setEmail(evento.target.value)}
                  placeholder="nome@esempio.it"
                />
              </Field>

              {/*
                **La conferma sul minore** (ADR-0116).

                EasyGame non ha una policy che dica se un minore possa avere
                un accesso proprio, chi lo autorizzi e come lo si provi: e una
                decisione legale che il repository non puo prendere. Finche
                non c'e, il gesto non passa in silenzio — chi lo compie
                dichiara, e la dichiarazione finisce nell'audit con il suo
                nome e la sua ora.

                La casella e qui perche la conferma la deve dare una persona,
                non il codice che compone la richiesta: il server la pretende
                comunque, e nasconderla soltanto lascerebbe un pulsante che
                risponde 400. E la stessa forma della cancellazione di un
                minore (ADR-0105), sulla stessa scheda.
              */}
              {stato.isMinor ? (
                <label className="flex items-start gap-2.5 rounded-egw-field border border-egw-tint-amber-bd bg-egw-tint-amber p-3 font-brand text-[12.5px] leading-[1.5] text-egw-ink">
                  <Checkbox
                    className="mt-0.5"
                    checked={tutoreAutorizza}
                    onChange={(evento) => setTutoreAutorizza(evento.target.checked)}
                    aria-label="Confermo che chi ha la responsabilita genitoriale ha autorizzato l'accesso"
                  />
                  <span>
                    Questo atleta risulta <strong>minorenne</strong>, o non ha
                    una data di nascita in anagrafica. Confermo che chi ne ha
                    la <strong>responsabilita genitoriale</strong> ha
                    autorizzato l&apos;apertura di un accesso EasyGame a suo
                    nome.
                  </span>
                </label>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {stato.status === "invited" ? (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<RotateCcw />}
                      disabled={inCorso}
                      onClick={() => {
                        void agisci(
                          `/api/v1/athlete-accounts/${athleteId}/resend`,
                          { method: "POST" },
                          "Invito reinviato",
                        );
                      }}
                    >
                      Reinvia l&apos;invito
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Mail />}
                      disabled={inCorso || !email.trim() || mancaLaConferma}
                      onClick={() => {
                        void agisci(
                          `/api/v1/athlete-accounts/${athleteId}/email`,
                          {
                            method: "POST",
                            body: {
                              email,
                              acknowledgeMinor: tutoreAutorizza,
                            },
                          },
                          "Invito mandato al nuovo indirizzo",
                        );
                      }}
                    >
                      Cambia indirizzo e reinvia
                    </Button>
                    <Button
                      variant="text"
                      size="sm"
                      icon={<ShieldOff />}
                      disabled={inCorso}
                      onClick={() => {
                        void agisci(
                          `/api/v1/athlete-accounts/${athleteId}`,
                          { method: "DELETE" },
                          "Invito revocato",
                        );
                      }}
                    >
                      Revoca l&apos;invito
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<UserPlus />}
                    disabled={inCorso || !email.trim() || mancaLaConferma}
                    onClick={() => {
                      void agisci(
                        `/api/v1/athlete-accounts/${athleteId}`,
                        {
                          method: "POST",
                          body: { email, acknowledgeMinor: tutoreAutorizza },
                        },
                        "Invito inviato",
                      );
                    }}
                  >
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
            <div className="pt-1">
              <Eyebrow className="mb-2">Cosa è successo</Eyebrow>
              <ul className="divide-y divide-egw-rule rounded-egw-field border border-egw-hairline bg-egw-page-100">
                {stato.history.map((riga) => (
                  <li key={riga.id} className="flex min-h-[40px] flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1.5 font-brand text-[12.5px] text-egw-ink-62">
                    <span className="font-semibold text-egw-ink">
                      {ETICHETTA_STORIA[riga.status] || riga.status}
                    </span>
                    <span>{riga.email}</span>
                    <span className="egw-num ml-auto text-egw-ink-42">
                      {quando(riga.acceptedAt || riga.revokedAt || riga.sentAt)}
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
    <Panel as="section">
      <PanelHeader
        eyebrow="Accesso"
        title={
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Accesso EasyGame
          </span>
        }
        description="L'atleta riceve un link personale e sceglie da sé la propria password. EasyGame non manda mai una password per email, e nessuno del club la può vedere."
      />
      {corpo}
    </Panel>
  );
}
