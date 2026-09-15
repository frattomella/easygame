"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { PageHeader } from "@/components/web/page/PageHeader";
import { AlertBlock } from "@/components/web/page/Alerts";
import { SectionNav } from "@/components/web/record/Record";
import { SegmentedControl, Skeleton } from "@/components/web/primitives/Controls";
import { Panel } from "@/components/web/primitives/Surface";
import { SaveStatus, type SaveState } from "@/components/ui/save-status";
import { rememberActiveSeason } from "@/lib/api/client";
import { createCoalescingSaver } from "@/lib/performance";
import {
  CLUB_PROFILE_SECTIONS,
  clubProfileSectionSnapshot,
  saveClubProfileSection,
  validateClubProfileSection,
  type ClubFederationEntry,
  type ClubProfileDraft,
  type ClubProfileSectionId,
} from "@/lib/club-profile";
import { readSubscriptionSettingsSource } from "@/lib/entitlements";
import { normalizeExtraServices, normalizePaymentSettings, normalizeSubscriptionSettings } from "@/lib/payments/payment-config-utils";
import type { ClubPaymentSettings as ClubPaymentSettingsType, ClubSubscriptionSettings, HubExtraService } from "@/lib/payments/payment-types";
import { ClubBillingSettings } from "@/components/payments/ClubBillingSettings";
import { ClubPaymentSettings } from "@/components/payments/ClubPaymentSettings";
import { CapabilityGate } from "@/components/organization/v2/capability-gate";
import { SeasonManager } from "@/components/organization/v2/season-manager";
import { ClubSignaturePanel } from "@/components/organization/v2/club-signature-panel";
import { FiscalProfilePanel } from "@/components/organization/v2/fiscal-profile-panel";
import { OperationTypesPanel } from "@/components/organization/v2/operation-types-panel";
import { ClubFederationsSection } from "@/components/organization/v2/club-federations-section";
import { ClubBankSection, ClubContactsSection, ClubFiscalSection, ClubGeneralSection, ClubSocialSection } from "@/components/organization/v2/club-profile-sections";
import { CLUB_SECTIONS, clubFederationsFrom, clubFormValuesFrom, emptyClubFormValues, resolveClubSection, type ClubFormValues, type ClubSectionId } from "@/components/organization/v2/club-model";

/**
 * `/organization` — la scheda del club (Web V2, pattern 5 «Settings»:
 * intestazione → rail di sezione → pannelli a moduli). Le nove schede della
 * V1 sono le nove sezioni del rail, raggiungibili con lo stesso `?tab=` (il
 * guscio manda a `?tab=stagioni`, la gestione iscrizioni a `?tab=pagamenti`).
 *
 * La logica dati e quella della V1: `getClub` per la lettura, l'autosave per
 * sezione di `src/lib/club-profile.ts` per la scrittura (un'impronta per
 * sezione, un problema di forma trattiene solo la sua sezione, una scrittura
 * per volta con accorpamento). Stagioni, firma, profilo fiscale, causali e
 * conto di incasso hanno i loro endpoint e vivono nei pannelli di
 * `components/organization/v2/`.
 */

/**
 * Attesa prima di scrivere una sezione in autosave. Un secondo e la pausa
 * naturale fra due parole digitate: piu corto genera una scrittura per
 * carattere, piu lungo fa sembrare che non stia salvando niente.
 */
const CLUB_AUTOSAVE_DEBOUNCE_MS = 1000;

/** Le sezioni che si salvano da sole, nell'ordine in cui vanno scritte. */
const AUTOSAVE_SECTIONS = CLUB_PROFILE_SECTIONS.filter((section) => section.autosave).map((section) => section.id);

function OrganizationPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const section: ClubSectionId = resolveClubSection(searchParams?.get("tab"));

  const [clubId, setClubId] = React.useState<string | null>(null);
  const [clubSnapshot, setClubSnapshot] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [values, setValues] = React.useState<ClubFormValues>(() => emptyClubFormValues());
  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
  const [federations, setFederations] = React.useState<ClubFederationEntry[]>([]);
  const [paymentSettings, setPaymentSettings] = React.useState<ClubPaymentSettingsType>(() => normalizePaymentSettings(null));
  const [subscriptionSettings, setSubscriptionSettings] = React.useState<ClubSubscriptionSettings>(() => normalizeSubscriptionSettings(null));
  const [extraServices, setExtraServices] = React.useState<HubExtraService[]>(() => normalizeExtraServices([]));

  const update = React.useCallback((patch: Partial<ClubFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
  }, []);

  /* ── Il club: `?clubId=` prima, poi il club attivo memorizzato ─────────── */
  React.useEffect(() => {
    const savedLogo = localStorage.getItem("organization-logo");
    if (savedLogo) setLogoPreview(savedLogo);
  }, []);

  React.useEffect(() => {
    const loadClubData = async () => {
      try {
        const urlClubId = new URLSearchParams(window.location.search).get("clubId");
        let activeClubId = urlClubId;
        if (!activeClubId) {
          const activeClub = localStorage.getItem("activeClub");
          if (activeClub) {
            try {
              activeClubId = JSON.parse(activeClub).id;
            } catch (error) {
              console.error("Error parsing active club:", error);
            }
          }
        }
        if (!activeClubId) {
          setLoading(false);
          return;
        }
        setClubId(activeClubId);

        const { getClub } = await import("@/lib/simplified-db");
        const clubData = await getClub(activeClubId);
        if (clubData) {
          const settings = typeof (clubData as any).settings === "object" && (clubData as any).settings ? ((clubData as any).settings as Record<string, any>) : {};
          setClubSnapshot(clubData);
          setPaymentSettings(normalizePaymentSettings(settings.paymentSettings));
          /* Da quale chiave si legge il piano lo decide un posto solo. */
          setSubscriptionSettings(normalizeSubscriptionSettings(readSubscriptionSettingsSource(settings)));
          setExtraServices(normalizeExtraServices(settings.extraServices));
          setValues(clubFormValuesFrom(clubData));
          setFederations(clubFederationsFrom(clubData));
          if (clubData.logo_url) setLogoPreview(clubData.logo_url);
        }
        setLoadError(null);
      } catch (error: any) {
        console.error("Error loading club data:", error);
        setLoadError(error?.message || "Lettura del club non riuscita");
      } finally {
        setLoading(false);
      }
    };
    void loadClubData();
  }, []);

  const handleLogoChange = (logoData: string | null) => {
    setLogoPreview(logoData);
    if (logoData) localStorage.setItem("organization-logo", logoData);
    else localStorage.removeItem("organization-logo");
  };

  /* ── Autosave della scheda club ────────────────────────────────────────── */
  const clubProfileDraft = React.useMemo<ClubProfileDraft>(
    () => ({
      name: values.name,
      logoUrl: logoPreview || "",
      types: values.types,
      sports: values.sports,
      foundingYear: values.foundingYear,
      address: values.address,
      city: values.city,
      postalCode: values.postalCode,
      region: values.region,
      province: values.province,
      country: values.country,
      contact1Name: values.contact1Name,
      contact1Phone: values.contact1Phone,
      contact1Email: values.contact1Email,
      contact2Name: values.contact2Name,
      contact2Phone: values.contact2Phone,
      contact2Email: values.contact2Email,
      companyEmail: values.companyEmail,
      companyPec: values.companyPec,
      website: values.website,
      facebook: values.facebook,
      instagram: values.instagram,
      twitter: values.twitter,
      youtube: values.youtube,
      businessName: values.businessName,
      vatNumber: values.vatNumber,
      fiscalCode: values.fiscalCode,
      taxRegime: values.taxRegime,
      atecoCode: values.atecoCode,
      sdiCode: values.sdiCode,
      legalAddress: values.legalAddress,
      legalCity: values.legalCity,
      legalPostalCode: values.legalPostalCode,
      legalRegion: values.legalRegion,
      legalProvince: values.legalProvince,
      legalCountry: values.legalCountry,
      representativeName: values.representativeName,
      representativeSurname: values.representativeSurname,
      representativeFiscalCode: values.representativeFiscalCode,
      bankName: values.bankName,
      iban: values.iban,
      federations,
      paymentSettings: normalizePaymentSettings(paymentSettings),
    }),
    [federations, logoPreview, paymentSettings, values],
  );

  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const persistedSectionsRef = React.useRef(new Map<string, string>());
  /*
    Cosa sta trattenendo una sezione, se qualcosa lo sta facendo. Senza, il
    successo di **un'altra** sezione scriveva «Salvato» sopra l'errore di
    quella che si sta modificando (trovato in UAT su staging).
  */
  const blockingRef = React.useRef<string | null>(null);
  const seededClubIdRef = React.useRef<string | null>(null);
  const autosaveRunnerRef = React.useRef<((value: { draft: ClubProfileDraft; entries: { section: ClubProfileSectionId; snapshot: string }[] }) => Promise<void>) | null>(null);

  // Cambiando club il runner precedente scriverebbe sul club sbagliato.
  React.useEffect(() => {
    autosaveRunnerRef.current = null;
    seededClubIdRef.current = null;
  }, [clubId]);

  // Stato di partenza: quello appena caricato dal server. Prima di averlo, l'autosave non deve partire.
  React.useEffect(() => {
    if (!clubId || !clubSnapshot || seededClubIdRef.current === clubId) return;
    seededClubIdRef.current = clubId;
    const snapshots = new Map<string, string>();
    AUTOSAVE_SECTIONS.forEach((entry) => {
      snapshots.set(entry, clubProfileSectionSnapshot(entry, clubProfileDraft));
    });
    persistedSectionsRef.current = snapshots;
  }, [clubId, clubProfileDraft, clubSnapshot]);

  const syncClubIdentityLocally = React.useCallback(
    (name: string, logoUrl: string) => {
      try {
        const rawActiveClub = localStorage.getItem("activeClub");
        if (rawActiveClub) {
          const parsedClub = JSON.parse(rawActiveClub);
          if (parsedClub?.id === clubId) {
            parsedClub.name = name;
            parsedClub.logo_url = logoUrl || parsedClub.logo_url;
            localStorage.setItem("activeClub", JSON.stringify(parsedClub));
          }
        }
        localStorage.setItem("organization-name", name);
        if (logoUrl) localStorage.setItem("organization-logo", logoUrl);
        window.dispatchEvent(new CustomEvent("club-updated", { detail: { clubId, name, logo_url: logoUrl } }));
      } catch (error) {
        console.error("Error syncing club identity locally:", error);
      }
    },
    [clubId],
  );

  const persistClubSections = React.useCallback(
    async (draft: ClubProfileDraft, entries: { section: ClubProfileSectionId; snapshot: string }[]) => {
      if (!clubId || entries.length === 0) return;

      if (!autosaveRunnerRef.current) {
        /*
          Una scrittura per volta, con accorpamento di quelle richieste nel
          frattempo (WP-36): l'accorpamento lavora sull'**insieme** delle
          sezioni sporche, non su una sola.
        */
        autosaveRunnerRef.current = createCoalescingSaver(
          async ({ draft: payload, entries: targets }) => {
            setSaveState("saving");
            try {
              for (const target of targets) {
                if (persistedSectionsRef.current.get(target.section) === target.snapshot) continue;
                await saveClubProfileSection(clubId, target.section, payload);
                persistedSectionsRef.current.set(target.section, target.snapshot);
                if (target.section === "generale") syncClubIdentityLocally(payload.name.trim(), payload.logoUrl);
              }
              setSavedAt(new Date());
              if (blockingRef.current) {
                setSaveError(blockingRef.current);
                setSaveState("error");
              } else {
                setSaveError(null);
                setSaveState("saved");
              }
            } catch (error: any) {
              console.error("Error autosaving club section:", error);
              setSaveError(error?.message || "Non salvato: riprova a modificare");
              setSaveState("error");
            }
          },
          {
            isEqual: ({ entries: targets }) => targets.every((target) => persistedSectionsRef.current.get(target.section) === target.snapshot),
          },
        );
      }

      await autosaveRunnerRef.current({ draft, entries });
    },
    [clubId, syncClubIdentityLocally],
  );

  /*
    L'autosave guarda **tutte** le sezioni, non quella aperta: cambiare
    sezione non interrompe nulla, e uscire dalla pagina trova al piu un
    secondo di lavoro non ancora scritto.
  */
  React.useEffect(() => {
    if (!clubId || seededClubIdRef.current !== clubId) return;

    const dirty: { section: ClubProfileSectionId; snapshot: string }[] = [];
    let blocking: string | null = null;

    for (const section of AUTOSAVE_SECTIONS) {
      const snapshot = clubProfileSectionSnapshot(section, clubProfileDraft);
      if (persistedSectionsRef.current.get(section) === snapshot) continue;

      /* Un valore incompleto non si scrive e si dice perche. */
      const problem = validateClubProfileSection(section, clubProfileDraft);
      if (problem) {
        blocking = blocking || problem;
        continue;
      }
      dirty.push({ section, snapshot });
    }

    blockingRef.current = blocking;

    if (blocking) {
      setSaveError(blocking);
      setSaveState("error");
    } else {
      setSaveError((current) => (current ? null : current));
      setSaveState((current) => (current === "error" ? "idle" : current));
    }

    if (dirty.length === 0) return;

    const timer = setTimeout(() => {
      void persistClubSections(clubProfileDraft, dirty);
    }, CLUB_AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [clubId, clubProfileDraft, persistClubSections]);

  /* ── Navigazione fra le sezioni: `?tab=` resta l'indirizzo ─────────────── */
  const goToSection = (next: ClubSectionId) => {
    const query = new URLSearchParams();
    const urlClubId = searchParams?.get("clubId");
    if (urlClubId) query.set("clubId", urlClubId);
    query.set("tab", next);
    router.replace(`/organization?${query.toString()}`, { scroll: false });
    document.getElementById(`club-section-${next}`)?.scrollIntoView({ block: "start" });
  };

  const navItems = React.useMemo(() => CLUB_SECTIONS.map((item) => ({ id: item.id, label: item.label })), []);
  const current = CLUB_SECTIONS.find((item) => item.id === section);

  const renderSection = () => {
    if (loading) {
      return (
        <Panel aria-busy aria-label="Scheda del club in caricamento">
          <Skeleton className="mb-3 h-3 w-24" />
          <Skeleton className="mb-5 h-5 w-64" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Skeleton key={index} className="h-[46px] w-full" />
            ))}
          </div>
        </Panel>
      );
    }

    switch (section) {
      case "generale":
        return <ClubGeneralSection values={values} onChange={update} logo={logoPreview} onLogoChange={handleLogoChange} />;
      case "fiscali":
        return (
          <div className="flex flex-col gap-[18px]">
            <ClubFiscalSection values={values} onChange={update} />
            {/* Firma e timbro stanno sotto il legale rappresentante: una firma senza il nome di chi firma accanto non si sa di chi sia. */}
            <ClubSignaturePanel clubId={clubId} />
          </div>
        );
      case "bancari":
        return <ClubBankSection values={values} onChange={update} />;
      case "contatti":
        return <ClubContactsSection values={values} onChange={update} />;
      case "federazione":
        return <ClubFederationsSection federations={federations} onChange={setFederations} />;
      case "stagioni":
        return (
          <div id="club-section-stagioni">
            <SeasonManager onActiveSeasonChange={(season) => rememberActiveSeason(season.id, season.label, clubId)} />
          </div>
        );
      case "pagamenti":
        return (
          <section id="club-section-pagamenti" aria-label="Pagamenti online" className="flex flex-col gap-[18px]">
            <div>
              <h2 className="font-brand text-[15px] font-bold leading-5 text-egw-ink">Pagamenti online</h2>
              <p className="mt-1 max-w-[80ch] font-brand text-[12.5px] leading-[1.5] text-egw-ink-62">{current?.description}</p>
            </div>
            {/*
              Gating vero, e non un 403 dopo il click: questa sezione configura
              **solo** gli incassi online, che sono una funzione del piano. I
              metodi manuali della societa non stanno qui e restano raggiungibili.
            */}
            <CapabilityGate feature="online_payments">
              <ClubPaymentSettings value={paymentSettings} onChange={setPaymentSettings} organizationId={clubId} />
            </CapabilityGate>
          </section>
        );
      case "fatturazione":
        return (
          <div id="club-section-fatturazione" className="flex flex-col gap-[18px]">
            {/* Sola lettura: il piano e i servizi appartengono alla piattaforma (D37). */}
            <ClubBillingSettings subscription={subscriptionSettings} extraServices={extraServices} readOnly />
            {/* Il profilo fiscale risponde a «che soggetto e davanti al fisco», non a «come si chiama» (ADR-0052). */}
            <FiscalProfilePanel organizationId={clubId} />
            {/* Le causali stanno accanto al profilo fiscale: decidono se un'operazione porta ricevuta, fattura o niente. */}
            <OperationTypesPanel organizationId={clubId} />
          </div>
        );
      case "social":
        return <ClubSocialSection values={values} onChange={update} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Club" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Impostazioni"
              title="Club"
              description="Gestisci struttura, ruoli e informazioni del tuo club."
              /* Lo stato del salvataggio sta **una volta sola**, in testa alla pagina, e vale per tutte le sezioni. */
              actions={<SaveStatus state={saveState} savedAt={savedAt} message={saveError} />}
            >
              {/* Sotto il rail (xl) le sezioni sono un controllo segmentato scorrevole. */}
              <div className="egw-scroll -mx-1 overflow-x-auto px-1 pb-1 xl:hidden">
                <SegmentedControl aria-label="Sezioni della scheda club" value={section} onChange={goToSection} options={navItems.map((item) => ({ value: item.id, label: item.label }))} />
              </div>
            </PageHeader>

            {!loading && !clubId ? (
              <AlertBlock severity="warning" title="Nessun club attivo">
                Scegli un club dal guscio per aprire la sua scheda.
              </AlertBlock>
            ) : null}
            {loadError ? (
              <AlertBlock severity="danger" title="La scheda del club non e stata letta" className="mb-[18px]">
                {loadError}
              </AlertBlock>
            ) : null}

            <div className="flex items-start gap-[18px]">
              <SectionNav items={navItems} activeId={section} onSelect={(id) => goToSection(id as ClubSectionId)} />
              <div className="flex min-w-0 flex-1 flex-col gap-[18px]">{renderSection()}</div>
            </div>
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}

export default function OrganizationPage() {
  return (
    <Suspense fallback={null}>
      <OrganizationPageContent />
    </Suspense>
  );
}
