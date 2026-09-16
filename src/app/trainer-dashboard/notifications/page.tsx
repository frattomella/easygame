"use client";

import { AlertTriangle, ArrowRight, Bell, ClipboardCheck, ListChecks } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import {
  SectionBlockedState,
  SectionEmptyState,
  SurfacePanel,
} from "@/components/trainer/trainer-dashboard-shared";

const alertIconByType = {
  missing_attendance: ClipboardCheck,
  missing_convocations: ListChecks,
} as const;

const alertLabelByType = {
  missing_attendance: "Presenze",
  missing_convocations: "Convocazioni",
} as const;

export default function TrainerNotificationsPage() {
  const router = useRouter();
  const { operationalAlerts, permissions } = useTrainerDashboard();

  /*
    **La pagina si difendeva con la chiave sbagliata.**

    Guardava `navigation.home`, non `navigation.notifications`. Il club che
    spegneva le notifiche all'allenatore toglieva la voce dal menu e lasciava
    la pagina raggiungibile dall'indirizzo e dalla campanella: un interruttore
    che mantiene meta della promessa.

    Per questo la chiave non era esponibile in Gestione Accessi — esporla
    prima di correggere qui avrebbe messo in pagina una casella che non fa cio
    che dice, che e il difetto vietato dal §11.5. Adesso la leva e intera e la
    chiave e governabile.
  */
  if (!permissions.navigation.notifications) {
    return <SectionBlockedState section="notifications" />;
  }

  return (
    <div className="space-y-6 pb-2">
      <PageHeading
        eyebrow="Dashboard trainer"
        title="Notifiche"
        subtitle="Azioni da completare per presenze e convocazioni."
      />

      <SurfacePanel
        title="Notifiche operative"
        icon={Bell}
        action={
          <Button
            variant="outline"
            className="rounded-egw-panel-sm"
            onClick={() => router.push("/trainer-dashboard")}
          >
            Torna alla Home
          </Button>
        }
      >
        {operationalAlerts.length > 0 ? (
          <div className="space-y-3">
            {operationalAlerts.map((alert) => {
              const Icon = alertIconByType[alert.type] || AlertTriangle;

              return (
                <button
                  key={alert.key}
                  type="button"
                  onClick={() => router.push(alert.actionHref)}
                  className="group flex w-full flex-col gap-3 rounded-egw-panel-sm border border-egw-tint-amber-bd bg-egw-tint-amber/80 px-4 py-4 text-left transition hover:border-egw-tint-amber-bd hover:bg-egw-tint-amber sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-egw-panel-sm bg-white text-egw-amber-ink shadow-egw-plane-1">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-egw-ink">
                          {alert.title}
                        </span>
                        <Badge className="border-egw-tint-amber-bd bg-white text-egw-amber-ink hover:bg-white">
                          {alertLabelByType[alert.type]}
                        </Badge>
                      </span>
                      <span className="mt-1 block text-sm text-egw-ink-72">
                        {alert.message}
                      </span>
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-egw-blue-700">
                    Apri
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <SectionEmptyState
            title="Tutto a posto"
            description="Non ci sono notifiche operative da completare."
          />
        )}
      </SurfacePanel>
    </div>
  );
}
