"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, ShieldCheck, ShieldOff, UserCog } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiRequest, readStoredActiveClub } from "@/lib/api/client";
import { canManageClubConfigurationAsActor } from "@/lib/access-roles";

/**
 * **«Accesso EasyGame» al posto del pulsante che non chiamava niente** (W6-D05).
 *
 * ## Cosa c'era
 *
 * Sulla scheda di un membro dello staff e su quella di un socio c'era «Invia
 * Credenziali». Il gestore non chiamava nessuna rotta: mostrava un toast, e
 * prima ancora della Wave 6 lo mostrava **verde**. La segreteria chiudeva la
 * scheda convinta di aver consegnato un accesso che non era mai partito.
 *
 * ## Perche non c'e un invito qui
 *
 * L'unico invito che esiste nel prodotto e quello dell'atleta
 * (`athlete_account_invites`, `src/lib/server/athlete-accounts.ts`), ed e
 * modellato **sull'atleta**: `athlete_id` non e nullabile, e il modulo dichiara
 * di non essere «la porta dei tutori». Estenderlo a staff e soci sarebbe un
 * **secondo sistema di inviti** — esattamente cio che l'ownership dei domini
 * vieta (CLAUDE.md §2, §11.1) — e la scelta fra colonna polimorfa e seconda
 * tabella va decisa, non improvvisata (16 — debito tecnico, W6-D05).
 *
 * ## Cosa c'e davvero, ed e qui che si rimanda
 *
 * `/dashboard/access-management` — «Ruoli e accessi» nella barra laterale,
 * gruppo CONFIGURAZIONE — e la schermata vera: legge
 * `GET /api/v1/club-roles/assignments`, che elenca **le tessere reali** del
 * club, e assegna o revoca un ruolo con
 * `POST /api/v1/club-roles/assignments`. E la strada con cui una persona di
 * staff o un socio che **ha gia un'utenza in questo club** ottiene il ruolo che
 * gli spetta.
 *
 * Quello che quella schermata non sa fare — creare l'utenza di chi non ce l'ha
 * — questa scheda **lo dice**, invece di offrire un pulsante che non lo fa.
 *
 * ## Il legame e l'email, e la scheda lo dichiara
 *
 * Un'anagrafica di staff o di socio non ha una colonna che punti a un'utenza:
 * il legame `linked_user_id` lo scrive solo il riscatto di un token, e per
 * queste due anagrafiche nessuna schermata ne genera uno. L'unico aggancio
 * disponibile e quindi il **confronto fra le email**, ed e un'indicazione, non
 * una prova: la scheda lo scrive a parole invece di far credere a un legame che
 * in archivio non esiste.
 *
 * ## Chi la vede
 *
 * Solo proprietario e gestore, cioe lo stesso perimetro che
 * `listClubAccessAssignments` impone sul server (`canManageClubConfiguration`).
 * A chiunque altro la sezione non compare: una scorciatoia verso una pagina che
 * la guardia di percorso chiuderebbe e la stessa promessa vuota di prima.
 */

type Assegnazione = {
  membership_id: string;
  user_id: string;
  email: string;
  name: string;
  role: string;
  role_label: string;
  is_owner: boolean;
  custom_role_name: string | null;
};

export type ClubPersonAccessCardProps = {
  /** L'email dell'anagrafica: l'unico aggancio disponibile verso un'utenza. */
  email?: string | null;
  /** Come nominare la persona nei testi: «membro dello staff», «socio». */
  personaLabel: string;
};

const normalizzaEmail = (valore: unknown) =>
  String(valore ?? "").trim().toLowerCase();

export function ClubPersonAccessCard({
  email,
  personaLabel,
}: ClubPersonAccessCardProps) {
  /*
    Il ruolo attivo si legge dopo il montaggio: `readStoredActiveClub` tocca
    `localStorage`, che sul server non esiste. Leggerlo durante il render
    darebbe due alberi diversi fra server e client.
  */
  const [ruoloAttivo, setRuoloAttivo] = useState<string | null>(null);
  const [assegnazione, setAssegnazione] = useState<Assegnazione | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    setRuoloAttivo(readStoredActiveClub()?.role || "");
  }, []);

  useEffect(() => {
    if (ruoloAttivo === null) return;
    if (!canManageClubConfigurationAsActor(ruoloAttivo)) {
      setCaricamento(false);
      return;
    }

    let annullato = false;

    const carica = async () => {
      setCaricamento(true);
      const risposta = await apiRequest<{ assignments: Assegnazione[] }>(
        "/api/v1/club-roles/assignments",
      );
      if (annullato) return;

      if (risposta.error) {
        setErrore(risposta.error.message);
        setAssegnazione(null);
        setCaricamento(false);
        return;
      }

      const cercata = normalizzaEmail(email);
      setErrore(null);
      setAssegnazione(
        cercata
          ? (risposta.data?.assignments || []).find(
              (voce) => normalizzaEmail(voce.email) === cercata,
            ) || null
          : null,
      );
      setCaricamento(false);
    };

    void carica();

    return () => {
      annullato = true;
    };
  }, [ruoloAttivo, email]);

  if (ruoloAttivo === null || !canManageClubConfigurationAsActor(ruoloAttivo)) {
    return null;
  }

  const emailNormalizzata = normalizzaEmail(email);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          Accesso EasyGame
        </CardTitle>
        <CardDescription>
          Il ruolo con cui questa persona entra nel club si assegna in «Ruoli e
          accessi». Da questa scheda non parte nessuna credenziale: le password
          le sceglie la persona, il club non le vede mai.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {caricamento ? (
          <p className="text-sm text-muted-foreground">
            Verifica dell&apos;accesso in corso...
          </p>
        ) : errore ? (
          <p className="text-sm text-destructive">{errore}</p>
        ) : !emailNormalizzata ? (
          <div className="flex items-start gap-2">
            <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Questa scheda non ha un&apos;email: senza, non si puo dire se la
              persona abbia gia un accesso. Aggiungila nei contatti.
            </p>
          </div>
        ) : assegnazione ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="text-sm font-medium">Accesso attivo</span>
              <Badge variant="outline">
                {assegnazione.custom_role_name || assegnazione.role_label}
              </Badge>
              {assegnazione.is_owner ? (
                <Badge className="bg-blue-600 text-white">Proprietario</Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground break-words">
              Un&apos;utenza del club usa {assegnazione.email}, la stessa email
              di questa scheda. Il collegamento e dedotto dall&apos;email: in
              archivio le due righe restano distinte.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nessuna utenza del club usa {email}. Un {personaLabel} senza
              account non riceve un invito da qui: deve prima esistere come
              utenza del club — registrandosi, oppure riscattando un token di
              accesso — e poi il ruolo si assegna in «Ruoli e accessi».
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/dashboard/access-management"
            className="w-full sm:w-auto"
          >
            <Button variant="outline" className="w-full gap-2 sm:w-auto">
              <UserCog className="h-4 w-4" />
              Apri Ruoli e accessi
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
