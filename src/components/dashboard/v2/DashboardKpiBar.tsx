"use client";

import { CalendarDays, Layers, ShieldAlert, Users } from "lucide-react";
import { KpiBar, KpiCard } from "@/components/web/page/Cards";
import { formatInteger } from "@/lib/web/format";
import type { DashboardMetrics } from "@/lib/dashboard/club-overview";

/**
 * La barra KPI compressa della Dashboard (guideline 09 §9.3, §9.7): quattro
 * card bianche e opache a cavallo dell'orizzonte. I numeri sono quelli che la
 * V1 calcolava con `buildDashboardMetrics` dai dati gia letti — compreso
 * «allenamenti nei prossimi 30 giorni», che la V1 calcolava e non mostrava.
 * Ogni conteggio porta all'elenco corrispondente.
 */
export function DashboardKpiBar({
  metrics,
  trainingsToday,
  loading,
}: {
  metrics: DashboardMetrics;
  trainingsToday: number;
  loading: boolean;
}) {
  const categoriesLabel =
    metrics.activeCategories === 1 ? "1 categoria" : `${formatInteger(metrics.activeCategories)} categorie`;
  return (
    <KpiBar className="lg:[grid-template-columns:repeat(4,minmax(0,1fr))]">
      <KpiCard
        label="Atleti attivi"
        value={formatInteger(metrics.totalAthletes)}
        qualifier={`su ${categoriesLabel}`}
        icon={<Users />}
        iconTone="blue"
        href="/athletes"
        loading={loading}
        ariaLabel={`${metrics.totalAthletes} atleti attivi, apri l'elenco atleti`}
      />
      <KpiCard
        label="Categorie attive"
        value={formatInteger(metrics.activeCategories)}
        qualifier="Configurate per il club"
        icon={<Layers />}
        iconTone="green"
        href="/categories"
        loading={loading}
        ariaLabel={`${metrics.activeCategories} categorie attive, apri le categorie`}
      />
      <KpiCard
        label="Allenamenti"
        value={formatInteger(metrics.upcomingTrainings)}
        qualifier={`${trainingsToday} oggi · prossimi 30 giorni`}
        icon={<CalendarDays />}
        iconTone="blue"
        href="/training"
        loading={loading}
        ariaLabel={`${metrics.upcomingTrainings} allenamenti nei prossimi 30 giorni, apri gli allenamenti`}
      />
      <KpiCard
        label="Certificati in scadenza"
        value={formatInteger(metrics.expiringCertificates)}
        delta={metrics.expiredCertificates > 0 ? `${formatInteger(metrics.expiredCertificates)} scaduti` : undefined}
        deltaTone="red"
        qualifier={
          metrics.expiredCertificates > 0
            ? "Entro 30 giorni, più quelli già scaduti"
            : "Entro 30 giorni · nessuno scaduto"
        }
        icon={<ShieldAlert />}
        iconTone={metrics.expiredCertificates > 0 ? "red" : "amber"}
        href="/medical"
        loading={loading}
        ariaLabel={`${metrics.expiringCertificates} certificati in scadenza e ${metrics.expiredCertificates} scaduti, apri i certificati medici`}
      />
    </KpiBar>
  );
}
