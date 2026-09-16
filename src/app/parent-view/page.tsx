"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Users } from "lucide-react";

import { AccessAreaGuard } from "@/components/auth/access-area-guard";
import { Button } from "@/components/web/primitives/Button";
import { Avatar } from "@/components/web/primitives/Identity";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { Skeleton } from "@/components/web/primitives/Controls";
import { AlertBlock } from "@/components/web/page/Alerts";
import { EmptyStateCard } from "@/components/web/page/Cards";
import { OutsideHeading, OutsideShell } from "@/components/web/shell/OutsideShell";
import { MembershipRoleBadge } from "@/components/categories/category-label";
import { apiRequest } from "@/lib/api/client";
import { cn } from "@/lib/utils";

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
 *
 * E una pagina a livello di account, prima di entrare nel club: ambiente 3
 * (guideline 05 §5.1), lo stesso guscio dell'accesso e della home account.
 */

type Appartenenza = {
  id: string;
  name: string;
  siteId: string | null;
  siteName: string | null;
  /** L'etichetta canonica, scritta dal server (ADR-0185): «Pulcini · Scauri». */
  label?: string;
  isPrimary: boolean;
};

type Figlio = {
  id: string;
  name: string;
  clubId: string;
  clubName: string;
  clubLogoUrl: string | null;
  categoryName: string | null;
  categories?: Appartenenza[];
  birthYear?: number | null;
  status?: string | null;
  avatarUrl: string | null;
};

/*
  Un figlio non piu attivo si dichiara **prima** di entrare. La sua area resta
  aperta — pagamenti e documenti di un'annata chiusa sono suoi, e toglierli
  vorrebbe dire cancellare la storia — ma una schermata che elenca due nomi
  identici, uno iscritto e uno no, senza dirlo, promette due iscrizioni vive.
  Lo stato e una pillola del sistema (`PERSON_STATUS`), non una parola inventata.
*/
const STATI_DA_DIRE = new Set(["suspended", "loan", "on_loan", "inactive", "archived"]);
const statoCanonico = (status: string | null | undefined) => (status === "loan" ? "on_loan" : status || "");

/**
 * **Le squadre del figlio, una per chip.**
 *
 * PP-02 §B / ADR-0185: l'etichetta e quella che il server ha gia scritto con
 * l'indice canonico — la sede accanto solo quando c'e o serve a distinguere,
 * mai composta qui, mai un identificativo. La primaria porta la pillola di
 * ruolo del sistema (ADR-0186), perche fra due squadre la famiglia deve
 * sapere quale e la casa.
 */
const squadre = (figlio: Figlio): Appartenenza[] => {
  const righe = (figlio.categories || []).filter((categoria) => categoria.label || categoria.name);
  if (righe.length) return righe;
  if (figlio.categoryName) {
    return [{ id: "", name: figlio.categoryName, siteId: null, siteName: null, label: figlio.categoryName, isPrimary: true }];
  }
  return [];
};

function ScegliFiglio() {
  const router = useRouter();
  const [figli, setFigli] = useState<Figlio[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  /*
    Si passa da `apiRequest` e non da un `fetch` diretto: e il trasporto di
    prodotto, e con la sessione scaduta chiama `notifyUnauthorized()` sul 401.
    Con il `fetch` nudo questa schermata mostrava un riquadro d'errore — «Non
    riesco a leggere i figli collegati» — a chi doveva semplicemente rifare il
    login, e nessun pulsante lo portava li.
  */
  const carica = useCallback(async () => {
    setErrore(null);
    const risposta = await apiRequest<{ children?: Figlio[] }>(
      "/api/v1/family/children",
    );

    if (risposta.error) {
      setErrore(
        risposta.error.message || "Non riesco a leggere i figli collegati",
      );
      setFigli([]);
      return;
    }

    setFigli(
      Array.isArray(risposta.data?.children) ? risposta.data.children : [],
    );
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


  return (
    <OutsideShell
      width="stepper"
      below={
        <button type="button" onClick={() => router.push("/account")} className="rounded-egw-micro font-semibold text-white underline-offset-4 hover:underline focus-visible:outline-none focus-visible:shadow-egw-focus-dark">
          Torna al mio account
        </button>
      }
    >
      <OutsideHeading
        title="Di quale figlio vuoi occuparti?"
        description="Calendario, pagamenti, documenti e certificati sono sempre quelli del figlio che scegli qui. Per cambiare, torna a questa schermata."
      />
      <p className="sr-only">Area famiglia</p>

      {figli === null ? (
        <div className="flex flex-col gap-3" role="status" aria-busy>
          <span className="sr-only">Cerco i tuoi figli collegati</span>
          {[0, 1].map((index) => (
            <div key={index} className="flex items-center gap-4 rounded-egw-field border border-egw-hairline bg-egw-page-100 p-4">
              <Skeleton className="h-12 w-12 rounded-egw-pill" />
              <div className="flex-1">
                <Skeleton className="mb-2 h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {errore ? (
        <AlertBlock
          severity="warning"
          title={errore}
          actions={
            <Button variant="secondary" size="sm" onClick={() => void carica()}>
              Riprova
            </Button>
          }
        />
      ) : null}

      {figli && !errore && figli.length === 0 ? (
        <EmptyStateCard
          flat
          icon={<Users />}
          iconTone="neutral"
          title="Nessun figlio collegato"
          description="Il collegamento lo crea la societa: chiedi alla segreteria di associare il tuo account alla scheda di tuo figlio."
          primary={
            <Button variant="secondary" onClick={() => router.push("/account")}>
              Torna al mio account
            </Button>
          }
        />
      ) : null}

      {figli && figli.length > 0 ? (
        <ul className="flex flex-col gap-3" aria-label="Figli collegati">
          {figli.map((figlio) => {
            const stato = statoCanonico(figlio.status);
            const appartenenze = squadre(figlio);
            return (
              <li key={figlio.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/parent-view/${figlio.id}`)}
                  className={cn(
                    "group flex w-full items-start gap-4 rounded-egw-field border border-egw-field-border bg-egw-page-100 p-4 text-left transition-[border-color,background-color,box-shadow] duration-hover",
                    "hover:border-[rgba(37,99,235,.32)] hover:bg-white focus-visible:border-egw-blue focus-visible:bg-white focus-visible:outline-none focus-visible:shadow-egw-focus",
                  )}
                >
                  <Avatar src={figlio.avatarUrl} name={figlio.name} size={48} />
                  {/*
                    Tre righe e non una: nome, chi e (anno, club, stato), dove
                    gioca. A 375 px il testo va a capo invece di essere
                    troncato — su una schermata di scelta l'informazione
                    tagliata e il motivo per cui si sceglie male.
                  */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <p className="text-[15px] font-bold leading-5 text-egw-ink">{figlio.name}</p>
                      {stato && STATI_DA_DIRE.has(stato) ? <StatusPill status={stato} size="sm" /> : null}
                    </div>
                    <p className="egw-num mt-0.5 text-[12.5px] leading-[1.5] text-egw-ink-62">
                      {[figlio.birthYear ? `Classe ${figlio.birthYear}` : "", figlio.clubName]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {appartenenze.length ? (
                        appartenenze.map((categoria) => (
                          <span key={`${categoria.id}-${categoria.siteId || ""}`} className="inline-flex items-center gap-1">
                            <DataChip>{categoria.label || categoria.name}</DataChip>
                            {appartenenze.length > 1 && categoria.isPrimary ? <MembershipRoleBadge isPrimary /> : null}
                          </span>
                        ))
                      ) : (
                        <span className="text-[12px] font-medium text-egw-ink-42">Categoria da assegnare</span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="mt-3 h-[17px] w-[17px] shrink-0 text-egw-ink-42 transition-colors duration-hover group-hover:text-egw-blue-700" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </OutsideShell>
  );
}

export default function ParentViewChooserPage() {
  return (
    <AccessAreaGuard>
      <ScegliFiglio />
    </AccessAreaGuard>
  );
}
