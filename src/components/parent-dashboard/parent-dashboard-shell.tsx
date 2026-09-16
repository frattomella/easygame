"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AreaLoading, AreaShell, AreaUnavailable } from "@/components/web/shell/AreaShell";
import type { SidebarIdentity } from "@/components/web/shell/Sidebar";
import { parentAreaNavGroups } from "@/components/web/shell/area-navigation";
import { Button } from "@/components/web/primitives/Button";
import { apiRequest } from "@/lib/api/client";
import { useParentDashboard } from "./parent-dashboard-context";

const resolvePageTitle = (pathname: string) => {
  if (pathname.includes("/calendar")) return "Calendario";
  if (pathname.includes("/enrollment")) return "Iscrizione e rinnovo";
  if (pathname.includes("/board")) return "Bacheca";
  if (pathname.includes("/notifications")) return "Notifiche";
  if (pathname.includes("/consents")) return "Consensi";
  if (pathname.includes("/athlete")) return "Atleta";
  if (pathname.includes("/trainings")) return "Allenamenti";
  if (pathname.includes("/structures")) return "Strutture";
  if (pathname.includes("/matches")) return "Gare";
  if (pathname.includes("/payments")) return "Pagamenti";
  if (pathname.includes("/documents")) return "Documenti";
  if (pathname.includes("/secretariat")) return "Segreteria";
  if (pathname.includes("/contacts")) return "Contatti club";
  return "Area famiglia";
};

/**
 * Il guscio dell'area famiglia: lo stesso guscio del club (`AreaShell`) con
 * le voci della famiglia e, al posto del club, **il figlio che si sta
 * guardando** (PP-02 §A): l'identita di chi si parla appartiene al guscio,
 * non al contenuto, e «Cambia figlio» sta accanto a lei — compare solo con
 * piu di un figlio, perche con uno solo porterebbe a una schermata che
 * reindirizza subito indietro.
 *
 * La stagione la dice il server (PP-02 §C, `normalizeActiveClubSeason`), le
 * notifiche e il «segna letta» passano dalla rotta della famiglia, che e
 * l'unica aperta a questo ruolo.
 */
export default function ParentDashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { athleteRouteId, data, loading, error, refresh } = useParentDashboard();
  const isBlockingLoad = loading && !data;
  const isBlockingError = !data && Boolean(error);

  const groups = React.useMemo(() => parentAreaNavGroups(athleteRouteId), [athleteRouteId]);

  const figlio = data?.athlete;
  const piuFigli = (figlio?.linkedAthletes?.length || 0) > 1;
  const identity: SidebarIdentity | undefined = figlio
    ? {
        eyebrow: "Figlio",
        name: figlio.name,
        meta: data?.club?.name || null,
        avatarSrc: figlio.avatar_url || null,
        ariaLabel: `Stai vedendo ${figlio.name}${piuFigli ? ", cambia figlio" : ""}`,
        actions: [
          ...(piuFigli ? [{ id: "switch-child", label: "Cambia figlio", onSelect: () => router.push("/parent-view") }] : []),
          { id: "account", label: "Torna al mio account", onSelect: () => router.push("/account"), tone: "muted" as const },
        ],
      }
    : undefined;

  return (
    <AreaShell
      groups={groups}
      identity={identity}
      title={resolvePageTitle(pathname || "")}
      notificationCount={data?.notificationsUnread || 0}
      notifications={data?.notifications || null}
      onMarkRead={(id: string) => {
        void apiRequest(`/api/parent-dashboard/${encodeURIComponent(String(data?.athlete.id || ""))}/notifications`, {
          method: "PATCH",
          body: { id },
        }).then(() => refresh());
      }}
      clubIdentity={
        data
          ? {
              name: data.club.name || "EasyGame",
              seasonLabel: data.club.activeSeasonLabel || null,
              logoUrl: data.club.logo_url || null,
              seasonHref: null,
            }
          : null
      }
    >
      {isBlockingLoad ? (
        <AreaLoading label="Area famiglia in caricamento" />
      ) : isBlockingError || !data ? (
        /*
          Accanto a «Riprova» c'e la porta che serve davvero (PP-02 §A): da
          quando un identificativo sconosciuto non ricade piu sul primo
          figlio, questa schermata e cio che si vede dietro un segnalibro
          storto, e «riprova» ritenterebbe la stessa richiesta all'infinito.
        */
        <AreaUnavailable
          title="Accesso non disponibile"
          description={error || "Questo atleta non risulta collegato al tuo account."}
          primary={
            <Button variant="primary" onClick={() => void refresh()}>
              Riprova
            </Button>
          }
          secondary={
            <Button variant="secondary" asChild>
              <Link href="/parent-view">Scegli il figlio</Link>
            </Button>
          }
        />
      ) : (
        children
      )}
    </AreaShell>
  );
}
