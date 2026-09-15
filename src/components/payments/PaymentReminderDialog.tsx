"use client";

import * as React from "react";
import { CheckCircle2, Mail, MailX, Send } from "lucide-react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, IconChip } from "@/components/web/primitives/StatusPill";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Skeleton } from "@/components/web/primitives/Controls";
import { formatDateShort, formatMoney } from "@/lib/web/format";
import {
  previewPaymentReminders,
  sendPaymentReminders,
  type PaymentReminderOutcome,
  type PaymentReminderPreview,
} from "@/lib/api/payment-reminders";

/**
 * «Sollecita»: il cassetto che mostra **chi ricevera il messaggio** prima di
 * mandarlo (W1-F, PP-4). Nel Web V2 e un cassetto da 480 (guideline 07 §7.7:
 * un'azione di massa apre un cassetto, mai scrive al primo clic).
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
 * motivo. Le righe si impilano, e il corpo del cassetto scorre da solo.
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

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : formatDateShort(parsed);
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
    <li className="flex flex-col gap-1 border-b border-egw-rule py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <p className="egw-ellipsis font-brand text-[13px] font-semibold text-egw-ink">{title}</p>
        {subtitle ? <p className="egw-ellipsis font-brand text-[11.5px] text-egw-ink-62">{subtitle}</p> : null}
      </div>
      {note ? (
        <DataChip size="sm" tone={tone === "ok" ? "green" : tone === "warn" ? "amber" : "red"} className="shrink-0">
          {note}
        </DataChip>
      ) : null}
    </li>
  );
}

function RecipientList({ children }: { children: React.ReactNode }) {
  return (
    <InsetBlock className="px-3 py-1">
      <ul>{children}</ul>
    </InsetBlock>
  );
}

const EmptyRow = ({ children }: { children: React.ReactNode }) => (
  <li className="py-3 font-brand text-[12.5px] text-egw-ink-62">{children}</li>
);

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
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow={`Azione su ${chargeIds.length} ${chargeIds.length === 1 ? "rata" : "rate"}`}
      title="Sollecita le quote non pagate"
      description="Il messaggio riporta l'importo ancora da versare, le rate scadute e la prossima scadenza. Non contiene link di pagamento."
      locked={sending}
      data-test="payment-reminder-drawer"
      footer={
        <>
          {!outcome ? (
            <Button
              variant="primary"
              icon={<Send />}
              onClick={handleSend}
              loading={sending}
              disabled={sending || loading || !preview?.canSend}
            >
              {sending
                ? "Invio in corso…"
                : `Invia sollecito (${preview?.reachable.length || 0})`}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={sending}>
            {outcome ? "Chiudi" : "Annulla"}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex flex-col gap-3" aria-busy>
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <p className="font-brand text-[12.5px] text-egw-ink-62">Calcolo dei destinatari…</p>
        </div>
      ) : null}

      {error ? (
        <AlertBlock severity="danger" title="Il sollecito non e partito" className="mb-4">
          {error}
        </AlertBlock>
      ) : null}

      {preview && !outcome ? (
        <div className="flex flex-col gap-5">
          {!preview.emailConfigured ? (
            <AlertBlock severity="warning" title="L'invio email non e configurato">
              Nessun messaggio partirebbe davvero. Configura SMTP in Impostazioni.
            </AlertBlock>
          ) : null}

          <DrawerSection eyebrow={`Posizioni da sollecitare (${preview.positions.length})`}>
            <RecipientList>
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
                    note={formatMoney(position.residualAmount)}
                  />
                );
              })}
              {preview.positions.length === 0 ? (
                <EmptyRow>Nessuna rata da sollecitare fra quelle selezionate.</EmptyRow>
              ) : null}
            </RecipientList>
          </DrawerSection>

          <DrawerSection
            eyebrow={
              <span className="inline-flex items-center gap-1.5 text-egw-green">
                <Mail className="h-3.5 w-3.5" aria-hidden />
                Raggiungibili ({preview.reachable.length})
              </span>
            }
          >
            <RecipientList>
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
                <EmptyRow>Nessun destinatario raggiungibile.</EmptyRow>
              ) : null}
            </RecipientList>
          </DrawerSection>

          <DrawerSection
            eyebrow={
              <span className="inline-flex items-center gap-1.5 text-egw-amber-ink">
                <MailX className="h-3.5 w-3.5" aria-hidden />
                Non raggiungibili ({preview.unreachable.length})
              </span>
            }
          >
            <RecipientList>
              {preview.unreachable.map((blocked, index) => (
                <RecipientRow
                  key={`${blocked.athleteId}-${blocked.guardianId || index}`}
                  tone="warn"
                  title={`${blocked.guardianName || "Nessun tutore"} — ${blocked.athleteName}`}
                  subtitle={blocked.email}
                  note={reasonLabel(blocked.reason)}
                />
              ))}
              {preview.unreachable.length === 0 ? <EmptyRow>Nessuno resta fuori.</EmptyRow> : null}
            </RecipientList>
          </DrawerSection>

          {preview.blockedReason ? (
            <AlertBlock severity="warning" title="Invio non possibile">
              {preview.blockedReason}
            </AlertBlock>
          ) : null}
        </div>
      ) : null}

      {outcome ? (
        <div className="flex flex-col gap-4">
          <InsetBlock className="flex items-start gap-3">
            <IconChip tone="green" size={32}>
              <CheckCircle2 />
            </IconChip>
            <p className="egw-num font-brand text-[13px] text-egw-ink">
              Inviati {outcome.totals.sent}, non inviati{" "}
              {outcome.totals.skipped}, non riusciti {outcome.totals.failed}.
            </p>
          </InsetBlock>

          <RecipientList>
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
          </RecipientList>
        </div>
      ) : null}
    </Drawer>
  );
}
