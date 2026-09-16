"use client";

import { usePathname } from "next/navigation";
import { AreaLoading, AreaShell, AreaUnavailable } from "@/components/web/shell/AreaShell";
import { ATHLETE_AREA_NAV_GROUPS } from "@/components/web/shell/area-navigation";
import { Button } from "@/components/web/primitives/Button";
import { apiRequest } from "@/lib/api/client";
import { useAthleteArea } from "./athlete-area-context";

/**
 * Il guscio dell'area atleta.
 *
 * **Non monta la navigazione gestionale** (W6-33), e non e una differenza
 * estetica: la barra del club elenca trenta voci che per un atleta rimbalzano
 * sulla guardia. Qui le voci sono tredici — tutte cose che un atleta puo
 * davvero fare — e sono le stesse sopra e sotto la soglia, perche l'elenco
 * (`ATHLETE_AREA_NAV_GROUPS`) e uno solo.
 */

const TITOLI: Record<string, string> = {
  "/athlete-dashboard": "La mia area",
  "/athlete-dashboard/squadre": "Le mie squadre",
  "/athlete-dashboard/calendario": "Calendario",
  "/athlete-dashboard/allenamenti": "Allenamenti",
  "/athlete-dashboard/convocazioni": "Convocazioni",
  "/athlete-dashboard/gare": "Gare",
  "/athlete-dashboard/presenze": "Presenze",
  "/athlete-dashboard/storico": "Storico",
  "/athlete-dashboard/bacheca": "Bacheca",
  "/athlete-dashboard/notifiche": "Notifiche",
  "/athlete-dashboard/documenti": "Documenti",
  "/athlete-dashboard/appuntamenti": "Appuntamenti",
  "/athlete-dashboard/profilo": "Il mio profilo",
};

export default function AthleteAreaShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/athlete-dashboard";
  const { data, loading, error, refresh } = useAthleteArea();

  const titolo = TITOLI[pathname] || "La mia area";

  return (
    <AreaShell
      groups={ATHLETE_AREA_NAV_GROUPS}
      title={titolo}
      notificationCount={data?.notificationsUnread || 0}
      notifications={data?.notifications || null}
      /*
        Anche il ragazzo segna letta una riga, e anche per lui il registro
        generico del club e chiuso: la rotta e quella della famiglia.
      */
      onMarkRead={(id: string) => {
        void apiRequest(`/api/parent-dashboard/${encodeURIComponent(String(data?.me?.id || ""))}/notifications`, {
          method: "PATCH",
          body: { id },
        }).then(() => refresh());
      }}
      clubIdentity={
        data
          ? {
              name: data.club?.name || "EasyGame",
              seasonLabel: data.club?.seasonLabel || null,
              logoUrl: data.club?.logoUrl || null,
              seasonHref: null,
            }
          : null
      }
    >
      {loading && !data ? <AreaLoading label="La tua area in caricamento" /> : null}

      {!loading && !data ? (
        <AreaUnavailable
          title="Non riesco a mostrarti la tua area"
          description={error || "Nessuna scheda atleta risulta collegata a questo account. Chiedi alla tua societa di collegarla."}
          primary={
            <Button variant="secondary" onClick={() => void refresh()}>
              Riprova
            </Button>
          }
        />
      ) : null}

      {data ? children : null}
    </AreaShell>
  );
}
