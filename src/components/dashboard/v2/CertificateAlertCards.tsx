"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCard } from "@/components/web/page/Alerts";
import { Button } from "@/components/web/primitives/Button";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { CERTIFICATE_STATUS } from "@/lib/web/status";
import { daysUntil, formatDayMonth } from "@/lib/web/format";
import type { DashboardCertificateAlert } from "@/lib/dashboard/club-overview";

/**
 * Le card di avviso sui certificati medici (guideline 09 §9.6): la rossa per
 * scaduti e mancanti, l'ambra per chi scade entro 30 giorni. Gli avvisi
 * arrivano gia calcolati da `buildCertificateAlerts`, sugli stessi atleti e
 * certificati che la pagina ha letto: qui non si rilegge niente.
 *
 * Il promemoria e la stessa porta della V1 (`POST
 * /api/medical-certificate-reminders`, un atleta alla volta); «Vedi» apre la
 * scheda dell'atleta sulla sezione sanitaria, come prima.
 */
type Props = {
  alerts: DashboardCertificateAlert[];
  clubId: string | null;
};

const describeAlert = (alert: DashboardCertificateAlert) => {
  if (alert.status === "missing") return "certificato mancante";
  const days = daysUntil(alert.expiryDate);
  if (alert.status === "expired") return `scaduto il ${formatDayMonth(alert.expiryDate)}`;
  if (days === 0) return "scade oggi";
  if (days === 1) return "scade domani";
  return `scade fra ${days} giorni`;
};

export function CertificateAlertCards({ alerts, clubId }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [sending, setSending] = React.useState<Set<string>>(() => new Set());

  const blocking = React.useMemo(
    () => alerts.filter((alert) => alert.status === "expired" || alert.status === "missing"),
    [alerts],
  );
  const expiring = React.useMemo(
    () => alerts.filter((alert) => alert.status === "expiring"),
    [alerts],
  );

  const athleteHref = (alert: DashboardCertificateAlert) => {
    const query = clubId ? `?clubId=${clubId}&tab=sanitari` : "?tab=sanitari";
    return `/athletes/${alert.athleteId}${query}#sanitari`;
  };

  const sendReminder = async (alert: DashboardCertificateAlert) => {
    setSending((current) => new Set(current).add(alert.id));
    try {
      const response = await apiRequest<{ created: number; skipped: number; recipients: number }>(
        "/api/medical-certificate-reminders",
        {
          method: "POST",
          body: {
            athleteId: alert.athleteId,
            certificateId: alert.certificateId,
            organizationId: clubId,
          },
        },
      );
      if (response.error) {
        showToast("error", `Promemoria non inviato: ${response.error.message}`);
        return;
      }
      const created = response.data?.created || 0;
      const skipped = response.data?.skipped || 0;
      if (created > 0) {
        showToast(
          "success",
          `Promemoria inviato a ${alert.athleteName}: ${created} notific${created === 1 ? "a inviata" : "he inviate"} ai contatti collegati.`,
        );
      } else if (skipped > 0) {
        showToast("info", "Esiste già un promemoria non letto per questo certificato.");
      } else {
        showToast("info", "Nessun nuovo promemoria creato.");
      }
    } finally {
      setSending((current) => {
        const next = new Set(current);
        next.delete(alert.id);
        return next;
      });
    }
  };

  const renderRow = (alert: DashboardCertificateAlert) => (
    <div key={alert.id} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
      <IdentityCell
        name={alert.athleteName}
        meta={describeAlert(alert)}
        href={athleteHref(alert)}
        onClick={() => router.push(athleteHref(alert))}
        className="min-w-0 flex-1 basis-40"
      />
      <StatusPill status={CERTIFICATE_STATUS[alert.status]} size="sm" />
      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="row" size="xs" onClick={() => router.push(athleteHref(alert))}>
          Vedi
        </Button>
        <Button
          variant="row"
          size="xs"
          loading={sending.has(alert.id)}
          onClick={() => void sendReminder(alert)}
        >
          Invia promemoria
        </Button>
      </div>
    </div>
  );

  if (blocking.length === 0 && expiring.length === 0) return null;

  return (
    <>
      {blocking.length > 0 ? (
        <AlertCard
          severity="danger"
          count={blocking.length}
          noun={blocking.length === 1 ? "certificato medico scaduto o mancante" : "certificati medici scaduti o mancanti"}
          consequence="Questi atleti non possono essere convocati finché il certificato non è registrato."
          rows={blocking.map(renderRow)}
          seeAll={{ label: `Vedi tutti (${blocking.length})`, href: "/medical" }}
          actions={
            <Button variant="neutral" size="sm" onClick={() => router.push("/medical?action=new")}>
              Registra certificato
            </Button>
          }
        />
      ) : null}
      {expiring.length > 0 ? (
        <AlertCard
          severity="warning"
          count={expiring.length}
          noun={expiring.length === 1 ? "certificato medico in scadenza" : "certificati medici in scadenza"}
          consequence="Entro 30 giorni questi atleti non potranno più essere convocati."
          rows={expiring.map(renderRow)}
          seeAll={{ label: `Vedi tutti (${expiring.length})`, href: "/medical" }}
          actions={
            <Button variant="secondary" size="sm" onClick={() => router.push("/medical")}>
              Vedi elenco
            </Button>
          }
        />
      ) : null}
    </>
  );
}
