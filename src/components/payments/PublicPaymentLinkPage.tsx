"use client";

import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { CheckCircle2, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/web/primitives/Button";
import { AlertBlock } from "@/components/web/page/Alerts";
import { OutsideShell, OutsideStatus } from "@/components/web/shell/OutsideShell";

/**
 * La pagina pubblica del link di pagamento (`/pay/[token]`).
 *
 * **Non e una pagina dell'applicazione.** Nessuna chrome, nessuna sidebar,
 * nessuna sessione: chi la apre non e nessuno, e vede il minimo indispensabile
 * per capire che cosa sta pagando e a chi. Nessun identificativo interno arriva
 * fin qui, perche non esce dall'API.
 *
 * **Priorita al telefono.** Un link di pagamento si apre dal messaggio, con una
 * mano sola: una colonna sola a qualunque larghezza (375, 768, 1280, 1440),
 * comandi alti almeno 44 px, il pulsante in fondo al flusso e non in una barra
 * che copre l'importo.
 *
 * **Tre stati e nient'altro:** pagabile, gia saldata, non disponibile. Il
 * secondo non e un errore ed e il piu frequente: chi ha gia pagato allo
 * sportello deve leggere «e tutto a posto», non una schermata rossa.
 */

type PublicPaymentView = {
  status: "payable" | "already_settled";
  clubName: string;
  clubLogoUrl: string;
  clubContactEmail: string;
  athleteName: string;
  description: string;
  dueDate: string | null;
  residualAmount: number;
  residualCents: number;
  dueAmount: number;
  paidAmount: number;
  linkExpiresAt: string;
};

const euro = (amount: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(Number(amount) || 0);

const giorno = (value: string | null) => {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
};

/* Il guscio fuori dal club (ambiente 3): una colonna sola, e una ricevuta, non un cruscotto. */
const Guscio = ({ children }: { children: React.ReactNode }) => (
  <OutsideShell width="stepper" bare>
    <div className="w-full [&>header]:rounded-t-egw-panel [&>header]:border-white/60 [&>header]:shadow-egw-plane-2 [&>section]:border-white/60 [&>section:last-of-type]:rounded-b-egw-panel">{children}</div>
  </OutsideShell>
);

const Piede = () => <p className="py-4 text-center text-[11.5px] text-white/70">Pagamento gestito con EasyGame</p>;

export function PublicPaymentLinkPage({ token }: { token: string }) {
  const [view, setView] = useState<PublicPaymentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/public/payment-links/${encodeURIComponent(token)}`);
      const body = await response.json().catch(() => null);

      if (!response.ok || body?.error) {
        setFailure(body?.error?.message || "Link di pagamento non disponibile.");
        setView(null);
      } else {
        setView(body.data as PublicPaymentView);
        setFailure("");
      }
    } catch {
      setFailure("Non riesco a caricare il link. Controlla la connessione.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
    Il ritorno dal PSP non conclude niente: l'incasso lo registra il webhook,
    su un evento firmato (ADR-0045). Quello che si puo dire onestamente qui e
    «ci risulta inviato», e poi si rilegge il residuo.
  */
  useEffect(() => {
    const esito = new URLSearchParams(window.location.search).get("esito");
    if (esito === "inviato") {
      setNotice(
        "Pagamento inviato. Puo volerci qualche minuto perche risulti registrato.",
      );
    } else if (esito === "annullato") {
      setNotice("Pagamento annullato: non e stato addebitato niente.");
    }
  }, []);

  const paga = async () => {
    if (opening) return;
    setOpening(true);
    setFailure("");

    try {
      /*
        Nessun `successUrl` e nessun `cancelUrl` nel corpo: li costruisce il
        server. Mandarli da qui renderebbe il link un redirector aperto.
      */
      const response = await fetch(
        `/api/public/payment-links/${encodeURIComponent(token)}/checkout`,
        { method: "POST" },
      );
      const body = await response.json().catch(() => null);

      if (!response.ok || body?.error) {
        setFailure(
          body?.error?.message || "Non riesco ad aprire il pagamento adesso.",
        );
        return;
      }

      if (body?.data?.status === "already_settled") {
        setNotice(body.data.message);
        await load();
        return;
      }

      if (body?.data?.checkoutUrl) {
        window.location.href = body.data.checkoutUrl;
        return;
      }

      setFailure("Non riesco ad aprire il pagamento adesso.");
    } catch {
      setFailure("Non riesco ad aprire il pagamento. Controlla la connessione.");
    } finally {
      setOpening(false);
    }
  };

  if (loading) {
    return (
      <OutsideShell width="form">
        <OutsideStatus icon={<Loader2 />} title="Pagamento" description="Un momento: carico il pagamento." busy busyLabel="Carico il pagamento…" />
      </OutsideShell>
    );
  }

  if (!view) {
    return (
      <Guscio>
        <div className="rounded-egw-panel border border-white/60 bg-white p-6 text-center shadow-egw-plane-2">
          <h1 className="font-brand text-[20px] font-extrabold tracking-[var(--egw-track-display)] text-egw-ink">
            Link non disponibile
          </h1>
          <p className="mt-2 text-sm text-egw-ink-72">
            {failure ||
              "Il link non e piu valido. Chiedi alla societa un link aggiornato."}
          </p>
        </div>
        <Piede />
      </Guscio>
    );
  }

  const saldata = view.status === "already_settled";

  return (
    <Guscio>
      <header className="rounded-t-egw-panel border border-b-0 border-egw-hairline bg-white p-5">
        <div className="flex items-center gap-3">
          {view.clubLogoUrl ? (
            <Image
              src={view.clubLogoUrl}
              alt=""
              width={44}
              height={44}
              unoptimized
              className="h-11 w-11 rounded-egw-control object-contain"
            />
          ) : null}
          <p className="font-brand text-sm font-semibold text-egw-ink-72">
            {view.clubName}
          </p>
        </div>

        <h1 className="mt-4 font-brand text-xl font-semibold text-egw-ink sm:text-2xl">
          {saldata ? "Rata gia saldata" : "Pagamento della quota"}
        </h1>
        {view.athleteName ? (
          <p className="mt-1 text-sm text-egw-ink-72">{view.athleteName}</p>
        ) : null}
      </header>

      <section className="rounded-b-egw-panel border border-egw-hairline bg-white p-5">
        <dl className="space-y-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-egw-ink-72">Causale</dt>
            <dd className="font-medium text-egw-ink">{view.description}</dd>
          </div>

          {view.dueDate ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-egw-ink-72">Scadenza</dt>
              <dd className="font-medium text-egw-ink">
                {giorno(view.dueDate)}
              </dd>
            </div>
          ) : null}

          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-egw-ink-72">Importo della rata</dt>
            <dd className="font-medium text-egw-ink">
              {euro(view.dueAmount)}
            </dd>
          </div>

          {view.paidAmount > 0 ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-egw-ink-72">Gia versato</dt>
              <dd className="font-medium text-egw-green">
                {euro(view.paidAmount)}
              </dd>
            </div>
          ) : null}
        </dl>

        <div
          className={`mt-4 rounded-egw-control border p-4 ${
            saldata
              ? "border-egw-tint-green-bd bg-egw-tint-green"
              : "border-egw-hairline bg-egw-page-100"
          }`}
        >
          {saldata ? (
            <p className="flex items-center gap-2 text-sm font-medium text-egw-green">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              Non c&apos;e niente da pagare: risulta tutto versato.
            </p>
          ) : (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm text-egw-ink-72">Da pagare adesso</span>
              <span className="font-brand text-2xl font-semibold text-egw-ink">
                {euro(view.residualAmount)}
              </span>
            </div>
          )}
        </div>

        {notice ? <AlertBlock severity="info" role="status" title={notice} className="mt-4" /> : null}

        {failure ? <AlertBlock severity="danger" role="alert" title={failure} className="mt-4" /> : null}

        {!saldata ? (
          <>
            <Button
              type="button"
              variant="primary"
              onClick={paga}
              loading={opening}
              icon={<CreditCard />}
              className="mt-5 min-h-[44px] w-full"
            >
              Paga {euro(view.residualAmount)}
            </Button>

            <p className="mt-3 flex items-start gap-2 text-xs text-egw-ink-62">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              Il pagamento avviene sul circuito sicuro del fornitore. EasyGame
              non vede e non conserva i dati della tua carta.
            </p>
          </>
        ) : null}

        {view.clubContactEmail ? (
          <p className="mt-4 text-xs text-egw-ink-62">
            Per informazioni scrivi a {view.clubContactEmail}.
          </p>
        ) : null}
      </section>

      <Piede />
    </Guscio>
  );
}
