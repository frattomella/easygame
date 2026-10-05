"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useToast } from "@/components/ui/toast-notification";
import { getClubSettings, saveClubSettings } from "@/lib/simplified-db";
import { PageHeader } from "@/components/web/page/PageHeader";
import { AlertBlock } from "@/components/web/page/Alerts";
import { SectionNav } from "@/components/web/record/Record";
import { SegmentedControl, Skeleton } from "@/components/web/primitives/Controls";
import { Panel } from "@/components/web/primitives/Surface";
import { MatchesPanel, NotificationsPanel, SecurityPanel, SystemPanel } from "@/components/settings/v2/settings-sections";
import {
  DEFAULT_PREFERENCES,
  SETTINGS_SECTIONS,
  matchSettingsPayload,
  preferencesFrom,
  resolveSettingsSection,
  type ClubPreferences,
  type MatchSettings,
  type NotificationSettings,
  type SettingsSectionId,
  type SystemSettings,
} from "@/components/settings/v2/settings-model";

/**
 * `/settings` — le preferenze del club (Web V2, pattern 5 «Settings»:
 * intestazione → rail di sezione → un pannello per sezione con il proprio
 * «Salva»). Stessa lettura e stessa scrittura della V1: `getClubSettings` e
 * `saveClubSettings` sulle chiavi `notifications` e `system` di
 * `clubs.settings`. Le tre schede sono tre sezioni raggiungibili con
 * `?tab=notifiche|sistema|sicurezza`.
 *
 * La sezione Sicurezza non ha piu un modulo: quello della V1 non cambiava
 * nessuna password (audit `wave-e-impostazioni.md`).
 */
function SettingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const section: SettingsSectionId = resolveSettingsSection(searchParams?.get("tab"));

  const [loading, setLoading] = React.useState(true);
  const [clubId, setClubId] = React.useState<string>("");
  const [preferences, setPreferences] = React.useState<ClubPreferences>(DEFAULT_PREFERENCES);
  const [persisted, setPersisted] = React.useState<ClubPreferences>(DEFAULT_PREFERENCES);
  const [saving, setSaving] = React.useState<"notifications" | "system" | "matches" | "">("");
  const [savedAt, setSavedAt] = React.useState<{ notifications: Date | null; system: Date | null; matches: Date | null }>({ notifications: null, system: null, matches: null });

  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const activeClubData = localStorage.getItem("activeClub");
        if (!activeClubData) {
          console.warn("No active club found in localStorage");
          return;
        }
        let activeClub: any;
        try {
          activeClub = JSON.parse(activeClubData);
        } catch (error) {
          console.error("Error parsing active club data:", error);
          showToast("error", "Errore nel caricamento dei dati del club");
          return;
        }
        if (!activeClub || !activeClub.id) {
          console.error("Active club data is invalid:", activeClub);
          showToast("error", "ID Club non trovato");
          return;
        }
        setClubId(activeClub.id);
        const clubSettings = await getClubSettings(activeClub.id);
        const loaded = preferencesFrom(clubSettings);
        setPreferences(loaded);
        setPersisted(loaded);
      } catch (error) {
        console.error("Error loading settings:", error);
        showToast("error", "Errore nel caricamento delle impostazioni");
      } finally {
        setLoading(false);
      }
    };
    void loadSettings();
  }, [showToast]);

  /* «Salvato · hh:mm» resta quattro secondi (08 §8.8). */
  React.useEffect(() => {
    if (!savedAt.notifications && !savedAt.system && !savedAt.matches) return;
    const timer = setTimeout(() => setSavedAt({ notifications: null, system: null, matches: null }), 4000);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const notificationsDirty = JSON.stringify(preferences.notifications) !== JSON.stringify(persisted.notifications);
  const systemDirty = JSON.stringify(preferences.system) !== JSON.stringify(persisted.system);
  const matchesDirty = JSON.stringify(preferences.matches) !== JSON.stringify(persisted.matches);

  const updateNotifications = (patch: Partial<NotificationSettings>) => setPreferences((current) => ({ ...current, notifications: { ...current.notifications, ...patch } }));
  const updateSystem = (patch: Partial<SystemSettings>) => setPreferences((current) => ({ ...current, system: { ...current.system, ...patch } }));
  const updateMatches = (patch: Partial<MatchSettings>) => setPreferences((current) => ({ ...current, matches: { ...current.matches, ...patch } }));

  /*
    Scrive la chiave storica `matchConvocationDeadlineDays`, la stessa che gli
    avvisi dell'allenatore leggono: nessuna seconda chiave, nessun secondo
    sistema di impostazioni. Solo il valore di questo club, solo se cambiato.
  */
  const saveMatchSettings = async () => {
    if (!clubId) {
      showToast("error", "ID club non disponibile");
      return;
    }
    if (!matchesDirty) return;
    setSaving("matches");
    try {
      await saveClubSettings(clubId, matchSettingsPayload(preferences.matches));
      setPersisted((current) => ({ ...current, matches: preferences.matches }));
      setSavedAt((current) => ({ ...current, matches: new Date() }));
      showToast("success", "Impostazioni convocazioni salvate");
    } catch (error) {
      console.error("Error saving match settings:", error);
      showToast("error", "Errore nel salvataggio delle impostazioni gare");
    } finally {
      setSaving("");
    }
  };

  const saveNotificationSettings = async () => {
    if (!clubId) {
      console.error("No club ID available for saving settings");
      showToast("error", "ID club non disponibile");
      return;
    }
    if (!notificationsDirty) return;
    setSaving("notifications");
    try {
      await saveClubSettings(clubId, { notifications: preferences.notifications });
      setPersisted((current) => ({ ...current, notifications: preferences.notifications }));
      setSavedAt((current) => ({ ...current, notifications: new Date() }));
      showToast("success", "Preferenze notifiche salvate con successo");
    } catch (error) {
      console.error("Error saving notification settings:", error);
      showToast("error", "Errore nel salvataggio delle preferenze notifiche");
    } finally {
      setSaving("");
    }
  };

  const saveSystemSettings = async () => {
    if (!clubId) {
      console.error("No club ID available for saving system settings");
      showToast("error", "ID club non disponibile");
      return;
    }
    if (!systemDirty) return;
    setSaving("system");
    try {
      await saveClubSettings(clubId, { system: preferences.system });
      setPersisted((current) => ({ ...current, system: preferences.system }));
      setSavedAt((current) => ({ ...current, system: new Date() }));

      /* La lingua si applica subito, come nella V1: attributo del documento, memoria locale, evento per chi ascolta. */
      document.documentElement.lang = preferences.system.language;
      localStorage.setItem("app-language", preferences.system.language);
      window.dispatchEvent(new CustomEvent("language-change", { detail: { language: preferences.system.language } }));

      showToast("success", "Impostazioni sistema salvate con successo");
    } catch (error) {
      console.error("Error saving system settings:", error);
      showToast("error", "Errore nel salvataggio delle impostazioni sistema");
    } finally {
      setSaving("");
    }
  };

  const goToSection = (next: SettingsSectionId) => {
    router.replace(`/settings?tab=${next}`, { scroll: false });
  };

  const navItems = React.useMemo(() => SETTINGS_SECTIONS.map((item) => ({ id: item.id, label: item.label })), []);

  const renderSection = () => {
    if (loading) {
      return (
        <Panel aria-busy aria-label="Impostazioni in caricamento">
          <Skeleton className="mb-3 h-3 w-24" />
          <Skeleton className="mb-5 h-5 w-56" />
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="mb-3 h-12 w-full" />
          ))}
        </Panel>
      );
    }
    if (section === "gare") {
      return <MatchesPanel value={preferences.matches} onChange={updateMatches} dirty={matchesDirty} saving={saving === "matches"} savedAt={savedAt.matches} onSave={() => void saveMatchSettings()} />;
    }
    if (section === "sistema") {
      return <SystemPanel value={preferences.system} onChange={updateSystem} dirty={systemDirty} saving={saving === "system"} savedAt={savedAt.system} onSave={() => void saveSystemSettings()} />;
    }
    if (section === "sicurezza") {
      return <SecurityPanel />;
    }
    return <NotificationsPanel value={preferences.notifications} onChange={updateNotifications} dirty={notificationsDirty} saving={saving === "notifications"} savedAt={savedAt.notifications} onSave={() => void saveNotificationSettings()} />;
  };

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Impostazioni" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader eyebrow="Impostazioni" title="Impostazioni" description="Configura preferenze, accessi e parametri dell'app.">
              <div className="egw-scroll -mx-1 overflow-x-auto px-1 pb-1 xl:hidden">
                <SegmentedControl aria-label="Sezioni delle impostazioni" value={section} onChange={goToSection} options={navItems.map((item) => ({ value: item.id, label: item.label }))} />
              </div>
            </PageHeader>

            {!loading && !clubId ? (
              <AlertBlock severity="warning" title="Nessun club attivo" className="mb-[18px]">
                Scegli un club dal guscio per modificarne le preferenze.
              </AlertBlock>
            ) : null}

            <div className="flex items-start gap-[18px]">
              <SectionNav items={navItems} activeId={section} onSelect={(id) => goToSection(id as SettingsSectionId)} />
              <div className="flex min-w-0 flex-1 flex-col gap-[18px]">{renderSection()}</div>
            </div>
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageContent />
    </Suspense>
  );
}
