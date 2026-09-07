"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Bell,
  CalendarDays,
  CreditCard,
  FileText,
  Home,
  FileSignature,
  Mail,
  Megaphone,
  ShieldCheck,
  Stethoscope,
  Trophy,
  UserCircle,
  Users,
} from "lucide-react";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import type { MobileNavSection } from "@/components/layout/MobileTopBar";
import { apiRequest } from "@/lib/api/client";
import ParentSidebar from "./ParentSidebar";
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
  if (pathname.includes("/contacts")) return "Contatti Club";
  return "Dashboard Genitore";
};

export default function ParentDashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { athleteRouteId, data, loading, error, refresh } = useParentDashboard();
  const basePath = `/parent-view/${athleteRouteId}`;
  const isBlockingLoad = loading && !data;
  const isBlockingError = !data && Boolean(error);
  /*
    PP-02 §A. Su mobile la scelta del figlio sta in cima al menu, come prima
    voce e con il nome di chi si sta guardando nell'intestazione della
    sezione: e il posto in cui si va quando si vuole cambiare pagina, che e
    esattamente il gesto con cui si cambia figlio. Compare solo con piu di un
    figlio collegato — con uno solo sarebbe una porta su una schermata che
    reindirizza subito indietro.
  */
  const sezioneFiglio: MobileNavSection[] =
    data && (data.athlete.linkedAthletes?.length || 0) > 1
      ? [
          {
            id: "parent-child",
            label: `FIGLIO · ${data.athlete.name}`,
            items: [
              { href: "/parent-view", label: "Cambia figlio", icon: Users },
            ],
          },
        ]
      : [];

  const mobileNavSections: MobileNavSection[] = [
    ...sezioneFiglio,
    {
      id: "parent-main",
      label: "AREA FAMIGLIA",
      items: [
        { href: basePath, label: "Home", icon: Home },
        { href: `${basePath}/calendar`, label: "Calendario", icon: CalendarDays },
        { href: `${basePath}/athlete`, label: "Atleta", icon: UserCircle },
        {
          href: `${basePath}/trainings`,
          label: "Allenamenti",
          icon: CalendarDays,
        },
        { href: `${basePath}/structures`, label: "Strutture", icon: Building2 },
        { href: `${basePath}/matches`, label: "Gare", icon: Trophy },
      ],
    },
    {
      id: "parent-office",
      label: "SEGRETERIA",
      items: [
        { href: `${basePath}/payments`, label: "Pagamenti", icon: CreditCard },
        {
          href: `${basePath}/enrollment`,
          label: "Iscrizione",
          icon: FileSignature,
        },
        { href: `${basePath}/documents`, label: "Documenti", icon: FileText },
        { href: `${basePath}/consents`, label: "Consensi", icon: ShieldCheck },
        { href: `${basePath}/board`, label: "Bacheca", icon: Megaphone },
        { href: `${basePath}/notifications`, label: "Notifiche", icon: Bell },
        {
          href: `${basePath}/secretariat`,
          label: "Segreteria",
          icon: Stethoscope,
        },
        { href: `${basePath}/contacts`, label: "Contatti Club", icon: Mail },
      ],
    },
  ];

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="hidden md:block">
        <ParentSidebar />
      </div>

      {/*
        `min-w-0` non e ridondante accanto a `overflow-hidden`: e la stessa
        coppia che le altre quaranta schermate del club hanno gia. Senza, a
        768 px il guscio si allarga fino alla larghezza del proprio contenuto
        invece di lasciarlo scorrere — misurato su /organization, dove la barra
        delle schede portava il guscio a 1022 px e con lui tutta la pagina.
      */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/*
          PP-02 §C. **La stagione la dice il server, non il `localStorage`.**

          La targhetta leggeva `activeClub.activeSeasonLabel` dalla copia nel
          browser: alla prima pittura quella copia non c'e ancora — e per un
          tutore senza tessera non c'e mai stata — e la barra diceva «Nessuna
          stagione attiva» a un club che ne ha una. Il payload della famiglia
          la porta gia (`normalizeActiveClubSeason`, W6-09): mancava solo che
          arrivasse fin qui.

          `seasonHref: null` perche la targhetta rimandava a
          `/organization?tab=stagioni`, che per un genitore e un rimbalzo.
        */}
        <Header
          title={resolvePageTitle(pathname || "")}
          showMobileHubLink={false}
          mobileNavSections={mobileNavSections}
          /*
            **Il numero, non solo la porta.**

            Questo stesso pacchetto ha corretto **dove porta** il campanello e
            ha lasciato **se si accende**: la pastiglia e governata solo da
            questa prop, che ha un default a zero, quindi ometterla non e un
            errore di compilazione — e una campanella spenta per sempre. Un
            genitore con avvisi non letti la guardava spenta, e il conteggio
            compariva solo **dentro** la pagina che si sarebbe voluto fargli
            raggiungere.

            Il server lo calcola per figlio da sempre, e il guscio gemello
            dell'area atleta lo passava gia.
          */
          notificationCount={data?.notificationsUnread || 0}
          /*
            E le notifiche stesse: il pannello altrimenti le chiede al registro
            **generico** del club, che a un genitore risponde 403 e scrive una
            riga di diniego in audit a ogni apertura. Finche il conteggio era
            zero la pastiglia non compariva e nessuno lo apriva; accenderla ha
            reso visibile il difetto — «tre avvisi» e poi «Nessuna notifica».
          */
          notifications={data?.notifications || null}
          /*
            **E dove segnarle lette.** Senza, il clic sulla riga passava dal
            registro **generico** del club — chiuso a questo ruolo — e lo
            sfondo azzurro spariva solo a schermo: il contatore restava lo
            stesso e al ricaricamento la notifica tornava da leggere. La rotta
            della famiglia accetta un id singolo, ed e questa.
          */
          onMarkRead={(id: string) => {
            void apiRequest(
              `/api/parent-dashboard/${encodeURIComponent(
                String(data?.athlete.id || ""),
              )}/notifications`,
              { method: "PATCH", body: { id } },
            ).then(() => refresh());
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
        />

        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            {/*
              **PP-02 §A. Lo switcher non e piu una fascia sopra ogni pagina.**

              W6-12 aveva risolto la domanda giusta — «di chi stiamo parlando»
              non veniva mai fatta — mettendo la risposta **dentro il
              contenuto**: una barra bianca a tutta larghezza, in cima a
              tredici schermate su tredici, con dentro un nome e un link. Su
              uno schermo da 375 px quella fascia e la prima cosa che si vede e
              spinge sotto la piega cio per cui si e aperta la pagina.

              L'identita del figlio appartiene al **guscio**, dove sta gia
              quella del club: sta nella barra laterale e in cima al menu
              mobile, insieme alle due porte d'uscita — «Torna al mio account»
              e «Esci» — perche cambiare figlio e un gesto della stessa
              famiglia di quelli, non un'azione della pagina che si sta
              guardando.
            */}
            {isBlockingLoad ? (
              <div className="flex min-h-[55vh] items-center justify-center">
                <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-center text-slate-600 shadow-sm">
                  Caricamento dashboard...
                </div>
              </div>
            ) : isBlockingError || !data ? (
              <div className="flex min-h-[55vh] items-center justify-center">
                <div className="max-w-lg rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm">
                  <h2 className="text-2xl font-bold text-slate-900">
                    Accesso non disponibile
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {error || "Questo atleta non risulta collegato al tuo account."}
                  </p>
                  {/*
                    PP-02 §A. Accanto a «Riprova» c'e la porta che serve
                    davvero: da quando un identificativo sconosciuto non ricade
                    piu sul primo figlio, questa schermata e cio che si vede
                    dietro un segnalibro storto — e da li «riprova» ritenta la
                    stessa richiesta sbagliata all'infinito. La strada e
                    scegliere di nuovo di quale figlio si parla.
                  */}
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        void refresh();
                      }}
                      className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Riprova
                    </button>
                    <Link
                      href="/parent-view"
                      className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      Scegli il figlio
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              children
            )}
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
