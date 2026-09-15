"use client";

import * as React from "react";
import { Eye, LayoutPanelTop, ShieldCheck, SlidersHorizontal } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { HeaderStat, PageHeader } from "@/components/web/page/PageHeader";
import { InfoCard } from "@/components/web/page/Cards";
import { AlertBlock } from "@/components/web/page/Alerts";
import { StickyActionBar } from "@/components/web/page/StickyActionBar";
import { Button } from "@/components/web/primitives/Button";
import { Skeleton, Toggle } from "@/components/web/primitives/Controls";
import { DataChip } from "@/components/web/primitives/StatusPill";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/web/primitives/Overlays";
import { SectionNav } from "@/components/web/record/Record";
import { formatInteger } from "@/lib/web/format";
import { cn } from "@/lib/utils";
import { getClubSettings, saveClubSettings } from "@/lib/simplified-db";
import {
  buildTrainerDashboardPermissionPayload,
  DEFAULT_TRAINER_DASHBOARD_PERMISSIONS,
  resolveTrainerDashboardPermissions,
  type TrainerDashboardPermissions,
} from "@/lib/trainer-dashboard-permissions";
import {
  PERMISSION_GROUPS,
  PRESETS,
  clonePermissions,
  countEnabled,
  matchingPreset,
  permissionsEqual,
  setPermission,
  type PermissionGroupId,
} from "@/components/permissions/v2/trainer-permissions-model";

/**
 * `/permissions` — «Permessi allenatore» (Web V2, Wave E; pattern 5 della
 * guideline 09: intestazione, navigazione di sezione a sinistra, pannelli
 * con le leve, barra di salvataggio fissa in basso).
 *
 * Stessa logica dati della V1: le impostazioni del club si leggono con
 * `getClubSettings` e si scrivono con `saveClubSettings` +
 * `buildTrainerDashboardPermissionPayload` (le due grafie della chiave in
 * `clubs.settings`), la fusione con i default e nel dominio puro. I tre
 * preset sostituiscono lo stato locale e non salvano, come prima. Quello
 * che la V1 non aveva e che il sistema pretende: la guardia sulle modifiche
 * non salvate («Modifiche non salvate» nella barra) e uno scheletro mentre
 * la lettura arriva, invece di venticinque interruttori accesi per default.
 */
const GROUP_ICONS: Record<PermissionGroupId, React.ReactNode> = {
  navigation: <LayoutPanelTop />,
  widgets: <Eye />,
  actions: <ShieldCheck />,
};

export default function TrainerPermissionsPage() {
  const { showToast } = useToast();
  const { activeClub } = useAuth();
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [permissions, setPermissions] = React.useState<TrainerDashboardPermissions>(DEFAULT_TRAINER_DASHBOARD_PERMISSIONS);
  const [saved, setSaved] = React.useState<TrainerDashboardPermissions>(DEFAULT_TRAINER_DASHBOARD_PERMISSIONS);
  const [activeSection, setActiveSection] = React.useState<PermissionGroupId>("navigation");

  React.useEffect(() => {
    const loadPermissions = async () => {
      if (!activeClub?.id) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const clubSettings = await getClubSettings(activeClub.id);
        const resolved = resolveTrainerDashboardPermissions(clubSettings);
        setPermissions(resolved);
        setSaved(clonePermissions(resolved));
      } catch (error) {
        console.error("Error loading trainer permissions:", error);
        showToast("error", "Errore nel caricamento dei permessi trainer");
      } finally {
        setIsLoading(false);
      }
    };

    void loadPermissions();
  }, [activeClub?.id, showToast]);

  const dirty = !permissionsEqual(permissions, saved);

  const applyPreset = (preset: TrainerDashboardPermissions) => setPermissions(clonePermissions(preset));

  const handleSave = async () => {
    if (!activeClub?.id) {
      showToast("error", "Nessun club attivo selezionato");
      return;
    }

    try {
      setIsSaving(true);
      await saveClubSettings(activeClub.id, buildTrainerDashboardPermissionPayload(permissions));
      setSaved(clonePermissions(permissions));
      showToast("success", "Permessi trainer salvati con successo");
    } catch (error) {
      console.error("Error saving trainer permissions:", error);
      showToast("error", "Errore nel salvataggio dei permessi trainer");
    } finally {
      setIsSaving(false);
    }
  };

  const vaiA = (id: string) => {
    setActiveSection(id as PermissionGroupId);
    document.getElementById(`permessi-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const totale = PERMISSION_GROUPS.reduce((sum, group) => sum + group.options.length, 0);
  const attive = PERMISSION_GROUPS.reduce((sum, group) => sum + countEnabled(permissions[group.id] as Record<string, boolean>), 0);
  const preset = matchingPreset(permissions);

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Permessi allenatore" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Impostazioni"
              title="Permessi allenatore"
              description="Controlla esattamente cosa l'allenatore può vedere e fare nella sua area: pagine, widget della home e funzioni operative."
              stats={
                <>
                  <HeaderStat value={`${formatInteger(attive)}/${formatInteger(totale)}`} label="leve attive" tone={attive === totale ? "green" : "ink"} />
                  {preset ? <HeaderStat value={preset.label} label="preset in uso" tone="blue" /> : null}
                </>
              }
              context={
                <DataChip tone={activeClub?.name ? "blue" : "amber"} title={activeClub?.name || undefined}>
                  Club: {activeClub?.name || "non selezionato"}
                </DataChip>
              }
              actions={
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="secondary" icon={<SlidersHorizontal />} disabled={isLoading}>
                      Preset rapidi
                    </Button>
                  </MenuTrigger>
                  <MenuContent width={320}>
                    <MenuLabel>Parti da una configurazione tipo e poi rifinisci le singole leve</MenuLabel>
                    {PRESETS.map((item) => (
                      <MenuItem key={item.id} onSelect={() => applyPreset(item.value)} className="h-auto flex-col items-start gap-0.5 py-2">
                        <span>{item.label}</span>
                        <span className="whitespace-normal text-[11px] font-normal leading-[1.4] text-egw-ink-62">{item.description}</span>
                      </MenuItem>
                    ))}
                  </MenuContent>
                </Menu>
              }
            >
              <InfoCard eyebrow="Perimetro per categorie assegnate">
                L&apos;allenatore vedrà sempre e solo categorie, atleti, allenamenti e gare assegnate al suo profilo. Da qui definisci quali pagine, widget e funzioni operative rendere disponibili nella sua area: il perimetro resta quello del ruolo.
              </InfoCard>
            </PageHeader>

            {!activeClub?.id && !isLoading ? (
              <AlertBlock severity="warning" title="Nessun club attivo selezionato." className="mb-[18px]">
                Scegli un club dalla barra laterale per leggere e salvare i permessi dell&apos;allenatore.
              </AlertBlock>
            ) : null}

            <div className="flex items-start gap-6">
              <SectionNav items={PERMISSION_GROUPS.map((group) => ({ id: group.id, label: group.title }))} activeId={activeSection} onSelect={vaiA} />

              <div className="flex min-w-0 flex-1 flex-col gap-[18px]">
                {PERMISSION_GROUPS.map((group) => {
                  const values = permissions[group.id] as Record<string, boolean>;
                  return (
                    <Panel key={group.id} as="section" id={`permessi-${group.id}`} aria-labelledby={`permessi-${group.id}-titolo`} className="scroll-mt-4">
                      <PanelHeader
                        eyebrow={
                          <span className="inline-flex items-center gap-1.5 [&>svg]:h-3.5 [&>svg]:w-3.5">
                            {GROUP_ICONS[group.id]}
                            {group.title}
                          </span>
                        }
                        title={<span id={`permessi-${group.id}-titolo`}>{group.title}</span>}
                        description={group.description}
                        actions={
                          <span className="egw-num font-brand text-[12px] font-bold text-egw-ink-62" aria-label={`${countEnabled(values)} leve attive su ${group.options.length}`}>
                            {formatInteger(countEnabled(values))}/{formatInteger(group.options.length)}
                          </span>
                        }
                      />
                      <ul className="flex flex-col gap-2">
                        {group.options.map((option) => {
                          const checked = Boolean(values[option.key]);
                          const id = `permesso-${group.id}-${option.key}`;
                          return (
                            <li key={option.key} className="flex items-start justify-between gap-4 rounded-egw-field border border-egw-hairline bg-egw-page-100 px-4 py-3">
                              <div className="min-w-0">
                                {isLoading ? (
                                  <>
                                    <Skeleton className="mb-2 h-3.5 w-40" />
                                    <Skeleton className="h-3 w-64 max-w-full" />
                                  </>
                                ) : (
                                  <>
                                    <label htmlFor={id} className="block font-brand text-[13px] font-semibold text-egw-ink">
                                      {option.label}
                                    </label>
                                    <p className="mt-0.5 font-brand text-[12px] leading-[1.45] text-egw-ink-62">{option.description}</p>
                                    <p className={cn("mt-1 font-brand text-[11px] font-medium", checked ? "text-egw-green" : "text-egw-ink-42")}>{checked ? "Attiva" : "Non attiva"}</p>
                                  </>
                                )}
                              </div>
                              {isLoading ? (
                                <Skeleton className="h-[22px] w-10 rounded-egw-pill" />
                              ) : (
                                <Toggle id={id} checked={checked} onCheckedChange={(next) => setPermissions((current) => setPermission(current, group.id, option.key, next))} aria-label={option.label} />
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </Panel>
                  );
                })}
              </div>
            </div>

            <StickyActionBar
              dirty={dirty}
              saving={isSaving}
              onSave={() => void handleSave()}
              onCancel={dirty ? () => setPermissions(clonePermissions(saved)) : undefined}
              saveLabel="Salva permessi trainer"
              cancelLabel="Annulla le modifiche"
              saveDisabled={isLoading || !activeClub?.id}
            />
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
