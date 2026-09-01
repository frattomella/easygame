"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Users } from "lucide-react";

import { AccessAreaGuard } from "@/components/auth/access-area-guard";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * **Di quale figlio parliamo.**
 *
 * W6-12. Fino alla Wave 6 questa domanda non veniva fatta: l'ingresso portava
 * sempre al **primo** figlio, e per cambiarlo bisognava sapere che esistevano
 * due chip sulla Home e due pulsanti sul Calendario. Le altre undici pagine
 * dell'area famiglia non avevano nessun selettore, e nemmeno un'indicazione di
 * chi stessero parlando oltre al nome nel sottotitolo.
 *
 * Il difetto non e la mancanza di uno switch: e che la domanda non veniva
 * fatta. Un genitore con due figli apriva «Pagamenti» e leggeva degli importi
 * senza aver mai scelto di chi. Su una pagina che parla di denaro — o di
 * certificati medici — quella e un'ambiguita che il prodotto non puo
 * permettersi.
 *
 * Percio: **si sceglie all'ingresso, e si cambia tornando qui.** Non un
 * selettore in ogni intestazione, che moltiplicherebbe per tredici il posto in
 * cui la scelta puo diventare incoerente.
 *
 * Con un figlio solo questa schermata non compare mai: `getAccessRedirectPath`
 * porta dritto alla sua area, e chiedere una scelta fra un'alternativa sola
 * sarebbe un clic in piu tutti i giorni.
 */

type Figlio = {
  id: string;
  name: string;
  clubId: string;
  clubName: string;
  clubLogoUrl: string | null;
  categoryName: string | null;
  avatarUrl: string | null;
};

const iniziali = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() || "")
    .join("") || "?";

function ScegliFiglio() {
  const router = useRouter();
  const [figli, setFigli] = useState<Figlio[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setErrore(null);
    try {
      const risposta = await fetch("/api/v1/family/children");
      const payload = await risposta.json().catch(() => ({}));
      if (!risposta.ok || payload?.error) {
        throw new Error(
          payload?.error?.message || "Non riesco a leggere i figli collegati",
        );
      }
      setFigli(
        Array.isArray(payload?.data?.children) ? payload.data.children : [],
      );
    } catch (problema: any) {
      setErrore(problema?.message || "Non riesco a leggere i figli collegati");
      setFigli([]);
    }
  }, []);

  useEffect(() => {
    void carica();
  }, [carica]);

  /*
    Con un figlio solo si entra e basta. Puo capitare arrivandoci da un
    indirizzo salvato, o dopo che un secondo figlio e stato scollegato: la
    schermata non deve restare li a chiedere una scelta che non c'e.
  */
  useEffect(() => {
    if (figli?.length === 1) {
      router.replace(`/parent-view/${figli[0].id}`);
    }
  }, [figli, router]);

  if (figli === null) {
    return <AppLoadingScreen subtitle="Cerco i tuoi figli collegati" />;
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="mb-8 space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
          Area famiglia
        </p>
        <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">
          Di quale figlio vuoi occuparti?
        </h1>
        <p className="text-slate-600">
          Calendario, pagamenti, documenti e certificati sono sempre quelli del
          figlio che scegli qui. Per cambiare, torna a questa schermata.
        </p>
      </div>

      {errore ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-amber-900">{errore}</p>
            <Button variant="outline" onClick={() => void carica()}>
              Riprova
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!errore && figli.length === 0 ? (
        <Card className="border-slate-200">
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-3 text-slate-700">
              <Users className="h-5 w-5" />
              <p className="font-semibold">Nessun figlio collegato</p>
            </div>
            <p className="text-sm text-slate-600">
              Il collegamento lo crea la societa: chiedi alla segreteria di
              associare il tuo account alla scheda di tuo figlio.
            </p>
            <Button variant="outline" onClick={() => router.push("/account")}>
              Torna al mio account
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3">
        {figli.map((figlio) => (
          <button
            key={figlio.id}
            type="button"
            onClick={() => router.push(`/parent-view/${figlio.id}`)}
            className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <Avatar className="h-12 w-12 shrink-0">
              {figlio.avatarUrl ? (
                <AvatarImage src={figlio.avatarUrl} alt="" />
              ) : null}
              <AvatarFallback>{iniziali(figlio.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-950">
                {figlio.name}
              </p>
              <p className="truncate text-sm text-slate-600">
                {[figlio.clubName, figlio.categoryName]
                  .filter(Boolean)
                  .join(" · ") || "Categoria da assegnare"}
              </p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-slate-400" />
          </button>
        ))}
      </div>
    </main>
  );
}

export default function ParentViewChooserPage() {
  return (
    <AccessAreaGuard>
      <ScegliFiglio />
    </AccessAreaGuard>
  );
}
