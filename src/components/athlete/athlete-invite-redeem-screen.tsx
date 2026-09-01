"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiRequest } from "@/lib/api/client";
import { EasyGameLogo } from "@/components/brand/easygame-logo";

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

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center">
          <EasyGameLogo className="mb-2 h-12 w-12" />
          <CardTitle>Attiva il tuo accesso EasyGame</CardTitle>
          <CardDescription>
            Da qui vedrai i tuoi allenamenti, le gare, le convocazioni e i tuoi
            documenti.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {!token ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Questo indirizzo non porta nessun invito. Apri il link che hai
              ricevuto per email, per intero.
            </p>
          ) : null}

          {esito ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div className="min-w-0 text-sm text-emerald-900">
                  <p className="font-semibold">
                    Accesso attivato per {esito.athleteName}
                  </p>
                  <p>{esito.clubName}</p>
                </div>
              </div>

              {esito.passwordSetupSent ? (
                <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                  Ti abbiamo mandato a <strong>{esito.email}</strong> un secondo
                  messaggio per <strong>scegliere la tua password</strong>.
                  Nessuno del club la conosce e nessuno te la puo comunicare.
                </p>
              ) : (
                <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                  Entra con le credenziali che gia usi per{" "}
                  <strong>{esito.email}</strong>. Se non le ricordi, dalla
                  pagina di accesso puoi chiedere di reimpostare la password.
                </p>
              )}

              <Button className="w-full" onClick={() => router.push("/login")}>
                Vai all&apos;accesso
              </Button>
            </div>
          ) : (
            <>
              {errore ? (
                <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                  <p className="min-w-0 text-sm text-red-900">
                    {errore} Chiedi alla tua societa di mandartene uno nuovo.
                  </p>
                </div>
              ) : null}

              <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                <p>
                  La password la sceglierai tu al primo accesso: EasyGame non
                  manda mai una password per email, e il club non la conosce.
                </p>
              </div>

              <Button
                className="w-full"
                disabled={!token || inCorso}
                onClick={() => {
                  void attiva();
                }}
              >
                {inCorso ? "Attivazione…" : "Attiva il mio accesso"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
