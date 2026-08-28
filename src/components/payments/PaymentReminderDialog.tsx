"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Mail, MailX, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  previewPaymentReminders,
  sendPaymentReminders,
  type PaymentReminderOutcome,
  type PaymentReminderPreview,
} from "@/lib/api/payment-reminders";

/**
 * «Sollecita»: la finestra che mostra **chi ricevera il messaggio** prima di
 * mandarlo (W1-F, PP-4).
 *
 * **Perche l'anteprima e obbligatoria e non un di piu.** Un sollecito di massa
 * raggiunge persone reali fuori dal prodotto. Prima di questa finestra
 * l'unico meccanismo di sollecito che EasyGame aveva partiva dagli account
 * collegati e usciva in silenzio quando non ce n'erano: chi premeva leggeva
 * «inviato» senza sapere a quante famiglie. Qui i destinatari sono in due
 * elenchi — raggiungibili e **non** raggiungibili con il motivo — e il secondo
 * elenco e la meta che prima non esisteva.
 *
 * **Perche non c'e una tabella.** A 375 px una tabella di destinatari
 * scorrerebbe in orizzontale, cioe nasconderebbe proprio la colonna del
 * motivo. Le righe si impilano.
 *
 * **Il doppio clic.** Il pulsante si disabilita mentre l'invio e in corso, ma
 * non e li che sta la difesa: il dominio rivendica ogni destinatario sotto
 * blocco di riga, e una seconda richiesta riceve `already_reminded`. Questo e
 * solo cortesia verso chi guarda.
 */

const BLOCK_REASON_LABELS: Record<string, string> = {
  no_guardian: "Nessun tutore in anagrafica",
  no_email: "Nessun indirizzo email",
  no_account: "Account collegato non trovato in questo club",
  already_reminded: "Gia sollecitato nelle ultime 6 ore",
  email_not_configured: "Invio email non configurato",
  delivery_failed: "Consegna non riuscita",
};

const reasonLabel = (reason?: string | null) =>
  (reason && BLOCK_REASON_LABELS[reason]) || "Motivo non disponibile";

const euro = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toLocaleDateString("it-IT");
};

/** Una riga di persona: nome, indirizzo, e cio che la riguarda. */
function RecipientRow({
  title,
  subtitle,
  note,
  tone,
}: {
  title: string;
  subtitle?: string | null;
  note?: string | null;
  tone: "ok" | "warn" | "error";
}) {
  return (
    <li className="flex flex-col gap-1 border-b border-slate-100 py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{title}</p>
        {subtitle ? (
          <p className="truncate text-xs text-slate-500">{subtitle}</p>
        ) : null}
      </div>
      {note ? (
        <Badge
          variant="outline"
          className={
            tone === "ok"
              ? "shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700"
              : tone === "warn"
                ? "shrink-0 border-amber-200 bg-amber-50 text-amber-700"
                : "shrink-0 border-red-200 bg-red-50 text-red-700"
          }
        >
          {note}
        </Badge>
      ) : null}
    </li>
  );
}

export function PaymentReminderDialog({
  open,
  onOpenChange,
  chargeIds,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Le rate selezionate nell'elenco. */
  chargeIds: string[];
  /** Chiamata dopo un invio riuscito: l'elenco va riletto. */
  onSent?: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [preview, setPreview] = React.useState<PaymentReminderPreview | null>(
    null,
  );
  const [outcome, setOutcome] = React.useState<PaymentReminderOutcome | null>(
    null,
  );
  const [error, setError] = React.useState("");

  const key = chargeIds.join(",");

  React.useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError("");
    setOutcome(null);
    setPreview(null);

    previewPaymentReminders(key ? key.split(",") : [])
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((cause: any) => {
        if (!cancelled) setError(String(cause?.message || cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, key]);

  const handleSend = async () => {
    if (sending) return;
    setSending(true);
    setError("");

    try {
      const result = await sendPaymentReminders(key ? key.split(",") : []);
      setOutcome(result);
      if (result.totals.sent > 0) onSent?.();
    } catch (cause: any) {
      setError(String(cause?.message || cause));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sollecita le quote non pagate</DialogTitle>
          <DialogDescription>
            Il messaggio riporta l&apos;importo ancora da versare, le rate
            scadute e la prossima scadenza. Non contiene link di pagamento.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-slate-500">
            Calcolo dei destinatari…
          </p>
        ) : null}

        {error ? (
          <p className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        ) : null}

        {preview && !outcome ? (
          <div className="space-y-4">
            {!preview.emailConfigured ? (
              <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <MailX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  L&apos;invio email non e configurato: nessun messaggio
                  partirebbe davvero. Configura SMTP in Impostazioni.
                </span>
              </p>
            ) : null}

            <section>
              <h3 className="mb-1 text-sm font-semibold text-slate-800">
                Posizioni da sollecitare ({preview.positions.length})
              </h3>
              <ul className="rounded-md border border-slate-200 px-3">
                {preview.positions.map((position) => {
                  const nextDueDate = formatDate(position.nextDueDate);
                  return (
                    <RecipientRow
                      key={position.athleteId}
                      tone="warn"
                      title={position.athleteName}
                      subtitle={[
                        position.overdueCount > 0
                          ? `${position.overdueCount} ${position.overdueCount === 1 ? "rata scaduta" : "rate scadute"}`
                          : null,
                        nextDueDate ? `prossima scadenza ${nextDueDate}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      note={euro.format(position.residualAmount)}
                    />
                  );
                })}
                {preview.positions.length === 0 ? (
                  <li className="py-3 text-sm text-slate-500">
                    Nessuna rata da sollecitare fra quelle selezionate.
                  </li>
                ) : null}
              </ul>
            </section>

            <section>
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <Mail className="h-4 w-4" aria-hidden />
                Raggiungibili ({preview.reachable.length})
              </h3>
              <ul className="rounded-md border border-slate-200 px-3">
                {preview.reachable.map((recipient) => (
                  <RecipientRow
                    key={`${recipient.athleteId}-${recipient.email}`}
                    tone="ok"
                    title={`${recipient.guardianName} — ${recipient.athleteName}`}
                    subtitle={recipient.email}
                    note={recipient.hasAccount ? "Anche in app" : "Solo email"}
                  />
                ))}
                {preview.reachable.length === 0 ? (
                  <li className="py-3 text-sm text-slate-500">
                    Nessun destinatario raggiungibile.
                  </li>
                ) : null}
              </ul>
            </section>

            <section>
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-700">
                <MailX className="h-4 w-4" aria-hidden />
                Non raggiungibili ({preview.unreachable.length})
              </h3>
              <ul className="rounded-md border border-slate-200 px-3">
                {preview.unreachable.map((blocked, index) => (
                  <RecipientRow
                    key={`${blocked.athleteId}-${blocked.guardianId || index}`}
                    tone="warn"
                    title={`${blocked.guardianName || "Nessun tutore"} — ${blocked.athleteName}`}
                    subtitle={blocked.email}
                    note={reasonLabel(blocked.reason)}
                  />
                ))}
                {preview.unreachable.length === 0 ? (
                  <li className="py-3 text-sm text-slate-500">
                    Nessuno resta fuori.
                  </li>
                ) : null}
              </ul>
            </section>

            {preview.blockedReason ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {preview.blockedReason}
              </p>
            ) : null}
          </div>
        ) : null}

        {outcome ? (
          <div className="space-y-4">
            <p className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                aria-hidden
              />
              <span>
                Inviati {outcome.totals.sent}, non inviati{" "}
                {outcome.totals.skipped}, non riusciti {outcome.totals.failed}.
              </span>
            </p>

            <ul className="rounded-md border border-slate-200 px-3">
              {outcome.deliveries.map((delivery, index) => (
                <RecipientRow
                  key={`${delivery.athleteId}-${delivery.email || index}`}
                  tone={
                    delivery.status === "sent"
                      ? "ok"
                      : delivery.status === "skipped"
                        ? "warn"
                        : "error"
                  }
                  title={`${delivery.guardianName || "Nessun tutore"} — ${delivery.athleteName}`}
                  subtitle={delivery.email}
                  note={
                    delivery.status === "sent"
                      ? "Inviato"
                      : reasonLabel(delivery.reason)
                  }
                />
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            {outcome ? "Chiudi" : "Annulla"}
          </Button>
          {!outcome ? (
            <Button
              onClick={handleSend}
              disabled={sending || loading || !preview?.canSend}
              className="w-full sm:w-auto"
            >
              <Send className="mr-2 h-4 w-4" aria-hidden />
              {sending
                ? "Invio in corso…"
                : `Invia sollecito (${preview?.reachable.length || 0})`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
