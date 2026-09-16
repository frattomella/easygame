"use client";

import { useEffect, useState } from "react";
import { CalendarClock, FileText, Wallet } from "lucide-react";

import { apiRequest } from "@/lib/api/client";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Badge } from "@/components/ui/badge";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import {
  SectionBlockedState,
  SectionEmptyState,
  SurfacePanel,
  formatDate,
} from "@/components/trainer/trainer-dashboard-shared";
import { SPORT_WORK_ROLE_LABELS } from "@/lib/sport-work/model";
import { cn } from "@/lib/utils";

/**
 * **«I miei compensi»: la superficie che mancava a `sport_work.read_own`**
 * (W6-32).
 *
 * La chiave era in catalogo, concessa a chi lavora per il club, e nessuna
 * schermata la interrogava: era l'ultima chiave del catalogo senza un atto da
 * proteggere. Questa pagina e quell'atto.
 *
 * ## Cosa mostra, e cosa non mostra
 *
 * Mostra **solo** la persona collegata alla sessione: rapporti, piano, rate e
 * dichiarazioni proprie. Non c'e un filtro da cambiare, perche il server non
 * ne accetta uno — `/api/v1/sport-work/me` non ha un `person_id`.
 *
 * Non mostra IBAN, note interne, aliquote e contributi: la risposta e un
 * elenco chiuso di campi costruito dal server, e cio che non serve a chi
 * guarda i propri compensi non esce affatto.
 *
 * ## Perche legge una rotta di dominio
 *
 * `sport_work` sta in `MANAGEMENT_ADMIN_ONLY_RESOURCES`: la porta generica
 * `/api/v1/[resource]` e chiusa, ed e giusto che lo resti. «I miei compensi»
 * non e l'elenco del club ristretto: e una domanda diversa, con un permesso
 * diverso.
 */

type Statement = {
  personId: string;
  displayName: string;
  relationships: Array<{
    id: string;
    role: string;
    relationshipType: string;
    status: string;
    startDate: string;
    endDate: string | null;
    contractAmount: number | null;
    currency: string;
    compensationFrequency: string;
    plan: { kind: string; totalAmount: number; currency: string } | null;
  }>;
  installments: Array<{
    id: string;
    relationshipId: string;
    sequence: number;
    label: string;
    dueDate: string;
    grossAmount: number;
    accruedAmount: number;
    paidAmount: number;
    remainingAmount: number;
    status: string;
  }>;
  declarations: Array<{
    id: string;
    fiscalYear: number;
    externalAmount: number;
    declarationDate: string;
    status: string;
    hasOtherCoverage: boolean;
  }>;
  position: {
    year: number;
    clubGross: number;
    externalDeclared: number;
    progressive: number;
    paymentCount: number;
    lastPaymentAt: string | null;
    hasCurrentDeclaration: boolean;
  } | null;
};

const RELATIONSHIP_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Bozza",
  ACTIVE: "Attivo",
  SUSPENDED: "Sospeso",
  EXPIRED: "Scaduto",
  TERMINATED: "Cessato",
};

const INSTALLMENT_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Programmata",
  ACCRUED: "Maturata",
  PARTIALLY_PAID: "Pagata in parte",
  PAID: "Pagata",
  OVERDUE: "Scaduta",
  CANCELLED: "Annullata",
};

const INSTALLMENT_STATUS_CLASSES: Record<string, string> = {
  SCHEDULED: "border-egw-hairline bg-egw-page-100 text-egw-ink-72 hover:bg-[#e9eef9]",
  ACCRUED: "border-egw-tint-blue-bd bg-egw-tint-blue text-egw-blue-700 hover:bg-egw-tint-blue",
  PARTIALLY_PAID:
    "border-egw-tint-amber-bd bg-egw-tint-amber text-egw-amber-ink hover:bg-egw-tint-amber",
  PAID: "border-egw-tint-green-bd bg-egw-tint-green text-egw-green hover:bg-egw-tint-green",
  OVERDUE: "border-egw-tint-red-bd bg-egw-tint-red text-egw-red hover:bg-egw-tint-red",
  CANCELLED: "border-egw-hairline bg-egw-page-100 text-egw-ink-62 hover:bg-[#e9eef9]",
};

const money = (value: number | null | undefined, currency = "EUR") =>
  typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(
        value,
      )
    : "—";

export default function TrainerCompensationDashboardPage() {
  const { permissions } = useTrainerDashboard();
  const [statement, setStatement] = useState<Statement | null>(null);
  /*
    Tre stati e non due: «sto caricando», «il club non mi ha nel registro» e
    «non ho potuto leggere». Un errore appiattito sull'elenco vuoto manderebbe
    un allenatore a chiedere alla segreteria un compenso che invece c'e — ed e
    lo stesso difetto che la Wave 6 corregge sull'elenco dei moduli (W6-44).
  */
  const [stato, setStato] = useState<"loading" | "ok" | "errore">("loading");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const response = await apiRequest<Statement | null>(
        "/api/v1/sport-work/me",
      );
      if (cancelled) return;

      if (response.error) {
        setStato("errore");
        return;
      }

      setStatement(response.data ?? null);
      setStato("ok");
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!permissions.navigation.compensation) {
    return <SectionBlockedState section="compensation" />;
  }

  const position = statement?.position || null;

  return (
    <div className="space-y-6 pb-2">
      <PageHeading
        eyebrow="Dashboard trainer"
        title="I miei compensi"
        subtitle="Il tuo rapporto con il club, il piano concordato e le rate. Solo i tuoi."
      />

      {stato === "loading" ? (
        <SectionEmptyState
          title="Caricamento"
          description="Sto leggendo la tua posizione."
        />
      ) : null}

      {stato === "errore" ? (
        <SectionEmptyState
          title="Non è stato possibile leggere i tuoi compensi"
          description="Riprova fra poco. Se il problema resta, segnalalo alla segreteria."
        />
      ) : null}

      {stato === "ok" && !statement ? (
        <SectionEmptyState
          title="Nessun compenso registrato"
          description="Il club non ti ha ancora inserito nel registro del lavoro sportivo. Non è un errore: finché non c'è un rapporto, qui non c'è niente da mostrare."
        />
      ) : null}

      {stato === "ok" && statement ? (
        <>
          {position ? (
            <SurfacePanel
              title={`Posizione ${position.year}`}
              description="Quanto ti ha erogato questo club nell'anno solare, per cassa."
              icon={Wallet}
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-egw-panel-sm border border-egw-hairline bg-white px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-egw-ink-62">
                    Erogato dal club
                  </p>
                  <p className="mt-1 text-xl font-semibold text-egw-ink">
                    {money(position.clubGross)}
                  </p>
                </div>
                <div className="rounded-egw-panel-sm border border-egw-hairline bg-white px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-egw-ink-62">
                    Dichiarato da altri
                  </p>
                  <p className="mt-1 text-xl font-semibold text-egw-ink">
                    {money(position.externalDeclared)}
                  </p>
                </div>
                <div className="rounded-egw-panel-sm border border-egw-hairline bg-white px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-egw-ink-62">
                    Totale progressivo
                  </p>
                  <p className="mt-1 text-xl font-semibold text-egw-ink">
                    {money(position.progressive)}
                  </p>
                </div>
                <div className="rounded-egw-panel-sm border border-egw-hairline bg-white px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-egw-ink-62">
                    Ultimo pagamento
                  </p>
                  <p className="mt-1 text-xl font-semibold text-egw-ink">
                    {position.lastPaymentAt
                      ? formatDate(position.lastPaymentAt)
                      : "—"}
                  </p>
                </div>
              </div>
            </SurfacePanel>
          ) : null}

          <SurfacePanel
            title="I miei rapporti"
            description="Sola lettura: le variazioni le registra la segreteria."
            icon={FileText}
          >
            {statement.relationships.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {statement.relationships.map((relationship) => (
                  <article
                    key={relationship.id}
                    className="rounded-egw-panel-sm border border-egw-hairline bg-white px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/*
                        **La qualifica e un gettone, non una frase.**

                        `sport_work_relationships.role` porta un valore del
                        vocabolario di `sport-work/model.ts` — `COACH`,
                        `ATHLETIC_TRAINER`, `OTHER` — e qui usciva grezzo: la
                        scheda diceva «COACH» all'allenatore e «OTHER» a chi il
                        club non aveva saputo classificare. Lo stato accanto
                        passava gia da una tabella di etichette; la qualifica
                        no, ed era l'unica delle due a farsi leggere da chi non
                        ha scritto il codice.

                        L'etichetta si prende dal proprietario del vocabolario,
                        non da una quarta copia locale: `model.ts` e un modulo
                        puro e le altre schermate del lavoro sportivo la
                        importano gia da li.
                      */}
                      <p className="font-semibold text-egw-ink">
                        {SPORT_WORK_ROLE_LABELS[
                          relationship.role as keyof typeof SPORT_WORK_ROLE_LABELS
                        ] || relationship.role}
                      </p>
                      <Badge className="border-egw-tint-blue-bd bg-egw-tint-blue text-egw-blue-700 hover:bg-egw-tint-blue">
                        {RELATIONSHIP_STATUS_LABELS[relationship.status] ||
                          relationship.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-egw-ink-72">
                      Dal {formatDate(relationship.startDate)}
                      {relationship.endDate
                        ? ` al ${formatDate(relationship.endDate)}`
                        : ""}
                    </p>
                    <p className="mt-1 text-sm text-egw-ink-72">
                      Compenso concordato:{" "}
                      <span className="font-medium text-egw-ink">
                        {money(
                          relationship.plan?.totalAmount ??
                            relationship.contractAmount,
                          relationship.currency,
                        )}
                      </span>
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <SectionEmptyState
                title="Nessun rapporto"
                description="Non risulta un rapporto di lavoro sportivo intestato a te in questo club."
              />
            )}
          </SurfacePanel>

          <SurfacePanel
            title="Le mie rate"
            description="Programmato, maturato ed erogato sono tre grandezze diverse."
            icon={CalendarClock}
          >
            {statement.installments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-egw-hairline text-left text-xs uppercase tracking-wide text-egw-ink-62">
                      <th className="py-2 pr-3 font-medium">Rata</th>
                      <th className="py-2 pr-3 font-medium">Scadenza</th>
                      <th className="py-2 pr-3 font-medium">Lordo</th>
                      <th className="py-2 pr-3 font-medium">Erogato</th>
                      <th className="py-2 font-medium">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.installments.map((installment) => (
                      <tr
                        key={installment.id}
                        className="border-b border-egw-rule last:border-0"
                      >
                        <td className="py-2 pr-3 font-medium text-egw-ink">
                          {installment.label}
                        </td>
                        <td className="py-2 pr-3 text-egw-ink-72">
                          {formatDate(installment.dueDate)}
                        </td>
                        <td className="py-2 pr-3 text-egw-ink-72">
                          {money(installment.grossAmount)}
                        </td>
                        <td className="py-2 pr-3 text-egw-ink-72">
                          {money(installment.paidAmount)}
                        </td>
                        <td className="py-2">
                          <Badge
                            className={cn(
                              INSTALLMENT_STATUS_CLASSES[installment.status] ||
                                INSTALLMENT_STATUS_CLASSES.SCHEDULED,
                            )}
                          >
                            {INSTALLMENT_STATUS_LABELS[installment.status] ||
                              installment.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <SectionEmptyState
                title="Nessuna rata"
                description="Il piano dei compensi non è ancora stato definito."
              />
            )}
          </SurfacePanel>

          {statement.declarations.length > 0 ? (
            <SurfacePanel
              title="Le mie dichiarazioni"
              description="Quanto hai dichiarato di aver percepito da altri committenti."
              icon={FileText}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {statement.declarations.map((declaration) => (
                  <article
                    key={declaration.id}
                    className="rounded-egw-panel-sm border border-egw-hairline bg-white px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-egw-ink">
                        Anno {declaration.fiscalYear}
                      </p>
                      <Badge className="border-egw-hairline bg-egw-page-100 text-egw-ink-72 hover:bg-[#e9eef9]">
                        {declaration.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-egw-ink-72">
                      Importo dichiarato:{" "}
                      <span className="font-medium text-egw-ink">
                        {money(declaration.externalAmount)}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-egw-ink-72">
                      Del {formatDate(declaration.declarationDate)}
                    </p>
                  </article>
                ))}
              </div>
            </SurfacePanel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
