"use client";

import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { CheckCircle2, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EasyGameLogo } from "@/components/brand/easygame-logo";

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

const Guscio = ({ children }: { children: React.ReactNode }) => (
  <main className="min-h-[100dvh] bg-slate-50 py-6">
    {/* Una colonna sola a ogni larghezza: e una ricevuta, non un cruscotto. */}
    <div className="mx-auto w-full max-w-lg px-4">{children}</div>
  </main>
);

const Piede = () => (
  <footer className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500">
    <span>Pagamento gestito con</span>
    <EasyGameLogo className="h-4 w-4" tone="dark" />
    <span className="font-display font-semibold">EasyGame</span>
  </footer>
);

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
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-slate-600"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Carico il pagamento…
        </p>
      </main>
    );
  }

  if (!view) {
    return (
      <Guscio>
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
          <h1 className="font-display text-lg font-semibold text-slate-900">
            Link non disponibile
          </h1>
          <p className="mt-2 text-sm text-slate-600">
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
      <header className="rounded-t-lg border border-b-0 border-slate-200 bg-white p-5">
        <div className="flex items-center gap-3">
          {view.clubLogoUrl ? (
            <Image
              src={view.clubLogoUrl}
              alt=""
              width={44}
              height={44}
              unoptimized
              className="h-11 w-11 rounded-md object-contain"
            />
          ) : null}
          <p className="font-display text-sm font-semibold text-slate-700">
            {view.clubName}
          </p>
        </div>

        <h1 className="mt-4 font-display text-xl font-semibold text-slate-900 sm:text-2xl">
          {saldata ? "Rata gia saldata" : "Pagamento della quota"}
        </h1>
        {view.athleteName ? (
          <p className="mt-1 text-sm text-slate-600">{view.athleteName}</p>
        ) : null}
      </header>

      <section className="rounded-b-lg border border-slate-200 bg-white p-5">
        <dl className="space-y-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-slate-600">Causale</dt>
            <dd className="font-medium text-slate-900">{view.description}</dd>
          </div>

          {view.dueDate ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-slate-600">Scadenza</dt>
              <dd className="font-medium text-slate-900">
                {giorno(view.dueDate)}
              </dd>
            </div>
          ) : null}

          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-slate-600">Importo della rata</dt>
            <dd className="font-medium text-slate-900">
              {euro(view.dueAmount)}
            </dd>
          </div>

          {view.paidAmount > 0 ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-slate-600">Gia versato</dt>
              <dd className="font-medium text-emerald-700">
                {euro(view.paidAmount)}
              </dd>
            </div>
          ) : null}
        </dl>

        <div
          className={`mt-4 rounded-md border p-4 ${
            saldata
              ? "border-emerald-200 bg-emerald-50"
              : "border-slate-200 bg-slate-50"
          }`}
        >
          {saldata ? (
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              Non c&apos;e niente da pagare: risulta tutto versato.
            </p>
          ) : (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm text-slate-600">Da pagare adesso</span>
              <span className="font-display text-2xl font-semibold text-slate-900">
                {euro(view.residualAmount)}
              </span>
            </div>
          )}
        </div>

        {notice ? (
          <p
            role="status"
            className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800"
          >
            {notice}
          </p>
        ) : null}

        {failure ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {failure}
          </p>
        ) : null}

        {!saldata ? (
          <>
            <Button
              type="button"
              onClick={paga}
              disabled={opening}
              className="mt-5 min-h-[44px] w-full"
            >
              {opening ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="mr-2 h-4 w-4" />
              )}
              Paga {euro(view.residualAmount)}
            </Button>

            <p className="mt-3 flex items-start gap-2 text-xs text-slate-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              Il pagamento avviene sul circuito sicuro del fornitore. EasyGame
              non vede e non conserva i dati della tua carta.
            </p>
          </>
        ) : null}

        {view.clubContactEmail ? (
          <p className="mt-4 text-xs text-slate-500">
            Per informazioni scrivi a {view.clubContactEmail}.
          </p>
        ) : null}
      </section>

      <Piede />
    </Guscio>
  );
}
