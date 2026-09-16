"use client";

import { Megaphone, StickyNote } from "lucide-react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { READ_STATUS } from "@/lib/web/status";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import {
  SectionBlockedState,
  SectionEmptyState,
  SurfacePanel,
  formatDate,
} from "@/components/trainer/trainer-dashboard-shared";

/**
 * **La bacheca dell'allenatore, in sola lettura.**
 *
 * Nella verifica voce per voce della Wave 5 questa riga diceva: «`board.read`
 * **senza schermata**». Non era un permesso da concedere — l'allenatore lo ha
 * insieme a genitori, atleti, staff e collaboratori — era che non esisteva un
 * posto da cui leggerlo. Un avviso mandato a «tutti gli allenatori» arrivava,
 * veniva contato come consegnato, e non aveva una pagina dove comparire.
 *
 * **Perche le note di segreteria stanno qui e non altrove.** Il contesto della
 * dashboard le calcolava gia — `visibleReminders`, filtrate su
 * `isReminderVisibleToTrainer`, ordinate per scadenza — e poi **nessuna
 * schermata le disegnava**. Erano lavoro fatto e buttato via a ogni
 * caricamento. Sono la stessa cosa di un avviso di bacheca dal punto di vista
 * di chi guarda — «il club ha scritto qualcosa a me» — e stanno nella stessa
 * pagina, in due riquadri distinti perche hanno due origini diverse.
 *
 * **Sola lettura, e per ora e una decisione di prodotto.** L'invio dal trainer
 * verso il proprio gruppo e dichiarato «decisione di prodotto» nel piano: qui
 * non c'e nessun pulsante di scrittura, e non ce n'e uno disabilitato — una
 * funzione che non esiste non si annuncia con un comando spento.
 */
export default function TrainerBoardDashboardPage() {
  const { announcements, permissions, visibleReminders } =
    useTrainerDashboard();

  if (!permissions.navigation.board) {
    return <SectionBlockedState section="board" />;
  }

  return (
    <div className="space-y-6 pb-2">
      <PageHeading
        eyebrow="Dashboard trainer"
        title="Bacheca"
        subtitle="Gli avvisi del club e le note della segreteria che ti riguardano."
      />

      <SurfacePanel
        title="Avvisi del club"
        description="Solo gli avvisi pubblicati e destinati a te."
        icon={Megaphone}
      >
        {announcements.length > 0 ? (
          <div className="space-y-3">
            {announcements.map((announcement: any) => (
              <article
                key={String(announcement?.id || announcement?.deliveryId)}
                className="rounded-egw-panel-sm border border-egw-hairline bg-white p-4 shadow-egw-plane-1"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <h3 className="min-w-0 text-sm font-semibold text-egw-ink">
                    {String(announcement?.title || "Avviso")}
                  </h3>
                  {/*
                    Il pallino «non letto» e l'unica informazione di stato che
                    esce da `?mine=1`: i criteri con cui il pubblico e stato
                    scelto restano al club, e infatti la proiezione li toglie.
                  */}
                  {!announcement?.readAt ? (
                    <StatusPill status={READ_STATUS.unread} size="sm" className="shrink-0" />
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-egw-ink-72">
                  {String(announcement?.body || "")}
                </p>
                <p className="mt-3 text-xs text-egw-ink-42">
                  {announcement?.publishedAt || announcement?.publishAt
                    ? `Pubblicato il ${formatDate(
                        announcement.publishedAt || announcement.publishAt,
                      )}`
                    : "Pubblicato"}
                  {announcement?.expiresAt
                    ? ` · valido fino al ${formatDate(announcement.expiresAt)}`
                    : ""}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <SectionEmptyState
            title="Nessun avviso"
            description="Il club non ti ha ancora scritto in bacheca."
          />
        )}
      </SurfacePanel>

      <SurfacePanel
        title="Note della segreteria"
        description="Promemoria indirizzati a te o a tutti gli allenatori."
        icon={StickyNote}
      >
        {visibleReminders.length > 0 ? (
          <div className="space-y-3">
            {visibleReminders.map((reminder: any, index: number) => (
              <article
                key={String(reminder?.id || `nota-${index}`)}
                className="rounded-egw-panel-sm border border-egw-tint-amber-bd bg-egw-tint-amber p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <h3 className="min-w-0 text-sm font-semibold text-egw-ink">
                    {String(
                      reminder?.title || reminder?.data?.title || "Promemoria",
                    )}
                  </h3>
                  {reminder?.expiryDate || reminder?.expiry_date ? (
                    <DataChip tone="amber" size="sm" className="shrink-0">
                      Scade il {formatDate(reminder.expiryDate || reminder.expiry_date)}
                    </DataChip>
                  ) : null}
                </div>
                {/*
                  **Il corpo della nota si chiama `content`.**

                  Qui si leggevano `description`, `note` e `data.description`, e
                  nessuna delle tre e la grafia che il club scrive: chi compone
                  la nota e `/secretariat` (riga ~706), che salva `content`, ed
                  e la stessa chiave che rileggono la sua schermata e la
                  dashboard del club. Il vaglio dei destinatari funzionava, la
                  nota arrivava, e all'allenatore compariva un riquadro con
                  l'intestazione «Promemoria», la scadenza, il destinatario —
                  **e nessun testo**. La nota c'era e non diceva niente.

                  Le altre grafie restano dietro: una colonna JSON conserva
                  cio che ci e stato scritto in passato, e toglierle
                  svuoterebbe le note vecchie invece di riempire quelle nuove.
                */}
                <p className="mt-2 whitespace-pre-line text-sm text-egw-ink-72">
                  {String(
                    reminder?.content ||
                      reminder?.description ||
                      reminder?.note ||
                      reminder?.data?.content ||
                      reminder?.data?.description ||
                      "",
                  )}
                </p>
                <p className="mt-3 text-xs text-egw-ink-62">
                  {String(reminder?.targetSummary || "")}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <SectionEmptyState
            title="Nessuna nota"
            description="La segreteria non ti ha lasciato promemoria in corso di validita."
          />
        )}
      </SurfacePanel>
    </div>
  );
}
