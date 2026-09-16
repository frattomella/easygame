"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { IconChip } from "@/components/web/primitives/StatusPill";
import { AlertBlock } from "@/components/web/page/Alerts";
import { OutsideHeading, OutsideShell, OutsideStatus } from "@/components/web/shell/OutsideShell";
import { apiRequest } from "@/lib/api/client";

/**
 * **Il riscatto dell'invito, e perche chiede un clic.**
 *
 * Il riscatto non parte da solo al caricamento della pagina: gli antivirus e i
 * filtri antispam **aprono i link** delle email per controllarli, e un riscatto
 * automatico verrebbe consumato da un programma prima ancora che la persona
 * legga il messaggio. Un `POST` dietro un pulsante nessun crawler lo preme.
 *
 * La pagina non mostra niente **prima** del riscatto: nome dell'atleta, club e
 * indirizzo li racconta la risposta. Una lettura pubblica del token direbbe
 * quei tre fatti a chiunque avesse il link in mano senza avere l'intenzione di
 * usarlo — per esempio a quegli stessi filtri.
 *
 * Sta sul guscio fuori dal club (ambiente 3): e la stessa EasyGame della
 * pagina di accesso a cui rimanda.
 */

type Esito = {
  clubName: string;
  athleteName: string;
  email: string;
  passwordSetupSent: boolean;
};

export function AthleteInviteRedeemScreen() {
  const parametri = useSearchParams();
  const router = useRouter();
  const token = parametri?.get("token") || "";

  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState<Esito | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const attiva = useCallback(async () => {
    setInCorso(true);
    setErrore(null);
    try {
      const risposta = await apiRequest<Esito>(
        "/api/v1/athlete-accounts/accept",
        { method: "POST", body: { token } },
      );
      if (risposta.error) throw new Error(risposta.error.message);
      setEsito(risposta.data);
    } catch (caught: any) {
      setErrore(caught?.message || "Invito non valido, gia usato o scaduto");
    } finally {
      setInCorso(false);
    }
  }, [token]);

  if (esito) {
    return (
      <OutsideShell width="form">
        <OutsideStatus
          icon={<CheckCircle2 />}
          tone="green"
          title={`Accesso attivato per ${esito.athleteName}`}
          description={esito.clubName}
          primary={
            <Button variant="primary" className="w-full sm:w-auto" onClick={() => router.push("/login")}>
              Vai all&apos;accesso
            </Button>
          }
        />
        <InsetBlock className="mt-6 text-[12.5px] leading-[1.55] text-egw-ink-72">
          {esito.passwordSetupSent ? (
            <>
              Ti abbiamo mandato a <strong className="text-egw-ink">{esito.email}</strong> un secondo messaggio per{" "}
              <strong className="text-egw-ink">scegliere la tua password</strong>. Nessuno del club la conosce e nessuno te la puo comunicare.
            </>
          ) : (
            <>
              Entra con le credenziali che gia usi per <strong className="text-egw-ink">{esito.email}</strong>. Se non le ricordi, dalla pagina di accesso puoi chiedere di reimpostare la password.
            </>
          )}
        </InsetBlock>
      </OutsideShell>
    );
  }

  return (
    <OutsideShell width="form">
      <OutsideHeading title="Attiva il tuo accesso EasyGame" description="Da qui vedrai i tuoi allenamenti, le gare, le convocazioni e i tuoi documenti." />

      <div className="flex flex-col gap-4">
        {!token ? (
          <AlertBlock severity="warning" title="Questo indirizzo non porta nessun invito." >
            Apri il link che hai ricevuto per email, per intero.
          </AlertBlock>
        ) : null}

        {errore ? (
          <AlertBlock severity="danger" role="alert" title={errore}>
            Chiedi alla tua societa di mandartene uno nuovo.
          </AlertBlock>
        ) : null}

        <InsetBlock className="flex items-start gap-3">
          <IconChip tone="blue" size={34}>
            <ShieldCheck />
          </IconChip>
          <p className="text-[12.5px] leading-[1.55] text-egw-ink-72">
            La password la sceglierai tu al primo accesso: EasyGame non manda mai una password per email, e il club non la conosce.
          </p>
        </InsetBlock>

        <Button
          variant="primary"
          className="w-full"
          disabled={!token}
          loading={inCorso}
          onClick={() => {
            void attiva();
          }}
        >
          {inCorso ? "Attivazione…" : "Attiva il mio accesso"}
        </Button>
      </div>
    </OutsideShell>
  );
}
