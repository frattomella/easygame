"use client";

import { Megaphone, StickyNote } from "lucide-react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Badge } from "@/components/ui/badge";
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
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <h3 className="min-w-0 text-sm font-semibold text-slate-950">
                    {String(announcement?.title || "Avviso")}
                  </h3>
                  {/*
                    Il pallino «non letto» e l'unica informazione di stato che
                    esce da `?mine=1`: i criteri con cui il pubblico e stato
                    scelto restano al club, e infatti la proiezione li toglie.
                  */}
                  {!announcement?.readAt ? (
                    <Badge className="shrink-0 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">
                      Nuovo
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
                  {String(announcement?.body || "")}
                </p>
                <p className="mt-3 text-xs text-slate-400">
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
                className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <h3 className="min-w-0 text-sm font-semibold text-slate-950">
                    {String(
                      reminder?.title || reminder?.data?.title || "Promemoria",
                    )}
                  </h3>
                  {reminder?.expiryDate || reminder?.expiry_date ? (
                    <Badge className="shrink-0 border-amber-300 bg-white text-amber-800 hover:bg-white">
                      Scade il{" "}
                      {formatDate(reminder.expiryDate || reminder.expiry_date)}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-slate-700">
                  {String(
                    reminder?.description ||
                      reminder?.note ||
                      reminder?.data?.description ||
                      "",
                  )}
                </p>
                <p className="mt-3 text-xs text-slate-500">
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
