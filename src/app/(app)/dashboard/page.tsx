"use client";

import { ClubDashboard } from "@/components/dashboard/v2/ClubDashboard";

/**
 * `/dashboard` — la Dashboard del club (Web V2, ambiente 2).
 *
 * La pagina non contiene logica: la lettura, le derivazioni e la composizione
 * vivono in `ClubDashboard`, che e la stessa schermata disegnata anche dalla
 * rotta legacy `/dashboard/<id>`.
 */
export default function DashboardPage() {
  return <ClubDashboard />;
}
