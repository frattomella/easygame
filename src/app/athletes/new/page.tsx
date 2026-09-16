"use client";

import React, { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { PageHeader } from "@/components/web/page/PageHeader";
import { IconButton } from "@/components/web/primitives/Button";
import { AlertBlock } from "@/components/web/page/Alerts";
import { DirtyGuardDialog } from "@/components/web/overlays/Modal";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import { AthleteCreateForm } from "@/components/forms/AthleteCreateForm";
import { TrialMatchNotice } from "@/components/trials/v2/TrialMatchNotice";
import { convertTrialAthlete, type TrialAthlete } from "@/lib/trials/client";
import { roleHasPermission } from "@/lib/permissions/catalog";
import {
  findCategoryForBirthDate,
  selectableCategoryOptions,
} from "@/lib/category-utils";
import { buildCategoryDisplayIndex } from "@/lib/categories/display";
import { buildCategoryGroups, normalizeClubSites } from "@/lib/club-sites";
import {
  addClubAthlete,
  updateClubAthlete,
  getClubCategories,
  getClubData,
  getClubFederationOptions,
} from "@/lib/simplified-db";
import { type ClubFederation } from "@/lib/club-federations";
import { sortByName } from "@/lib/sorting";

/**
 * Iscrivere un atleta: **una pagina**, come per allenatori e soci (ADR-0057).
 *
 * **Perche non una finestra.** Il modulo di iscrizione e il piu lungo che una
 * segreteria compila — anagrafica, codice fiscale, residenza, contatti,
 * genitori, tesseramento, taglie. Dentro una finestra scorreva in un riquadro
 * dentro una pagina che scorre a sua volta, a 375 px non aveva dove stare, e
 * un clic fuori lo chiudeva portandosi via cio che era stato scritto.
 * Allenatori e soci avevano gia la loro pagina: l'atleta, che ha piu campi di
 * entrambi, era rimasto l'unico in una finestra.
 *
 * La pagina non contiene logica di dominio: monta il modulo, scrive con
 * `addClubAthlete` e porta alla scheda appena creata — che e il gesto
 * successivo naturale, invece di riportare a un elenco dove cercarla.
 *
 * Nel Web V2 e il pattern 6 («Full-page form», guideline 09 §9.1):
 * intestazione di pagina, pannelli a sezioni, barra delle azioni in fondo.
 * L'unico gradiente della schermata e il «Salva atleta» della barra: qui in
 * cima resta solo la freccia per tornare all'elenco, con la guardia sulle
 * modifiche non salvate.
 */

function NewAthletePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { user, activeClub } = useAuth();

  const clubIdFromUrl = searchParams?.get("clubId");
  const [clubId, setClubId] = React.useState<string | null>(
    clubIdFromUrl || null,
  );
  const [categories, setCategories] = React.useState<any[]>([]);
  const [categoryGroups, setCategoryGroups] = React.useState<any[]>([]);
  const [federations, setFederations] = React.useState<ClubFederation[]>([]);

  /** Come si scrive una categoria qui (ADR-0185): la sede solo dove serve. */
  const categoryDisplay = React.useMemo(
    () => buildCategoryDisplayIndex({ categories, groups: categoryGroups }),
    [categories, categoryGroups],
  );
  const [dirty, setDirty] = React.useState(false);
  const [guardOpen, setGuardOpen] = React.useState(false);

  React.useEffect(() => {
    if (clubIdFromUrl && clubIdFromUrl !== "null") {
      setClubId(clubIdFromUrl);
      return;
    }

    if (activeClub?.id) {
      setClubId(activeClub.id);
      return;
    }

    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem("activeClub");
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);
      if (parsed?.id) setClubId(parsed.id);
    } catch {
      // Un `activeClub` illeggibile non e un errore da mostrare: la pagina
      // dice comunque che serve scegliere un club.
    }
  }, [clubIdFromUrl, activeClub]);

  React.useEffect(() => {
    if (!clubId) return;
    let cancelled = false;

    /*
      **Si sceglie solo fra cio che il club ha configurato** (ADR-0185): il
      catalogo porta anche le voci nate da una scheda, e chi iscrive un
      ragazzo non deve poterlo mettere in una squadra che non esiste. I gruppi
      e le sedi servono a scrivere «Pulcini · Scauri» dove il nome ne nomina
      due.
    */
    void Promise.all([
      getClubCategories(clubId),
      getClubData(clubId, "club_sites"),
      getClubData(clubId, "category_groups"),
    ]).then(([rows, sites, groups]: any[]) => {
      if (cancelled) return;
      const selezionabili = selectableCategoryOptions(
        Array.isArray(rows) ? rows : [],
      );
      setCategories(sortByName(selezionabili, (row: any) => row?.name));
      setCategoryGroups(
        buildCategoryGroups({
          categories: selezionabili,
          sites: normalizeClubSites(sites),
          groups,
        }),
      );
    });

    /*
      Le federazioni del club servono alla tendina del tesseramento: qui c'era
      un campo di testo libero, e cio che ne usciva non era necessariamente un
      ente del club (N2).
    */
    void getClubFederationOptions(clubId).then((rows: any) => {
      if (cancelled) return;
      setFederations(Array.isArray(rows) ? rows : []);
    });

    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const backHref = clubId ? `/athletes?clubId=${clubId}` : "/athletes";

  const goBack = React.useCallback(() => {
    router.push(backHref);
  }, [backHref, router]);

  /** La freccia in cima chiede prima, se c'e qualcosa da perdere. */
  const requestBack = () => {
    if (dirty) {
      setGuardOpen(true);
      return;
    }
    goBack();
  };

  /*
    La persona in prova che questa iscrizione riconosce come se stessa
    (ADR-0188 §5): se c'e, la scheda non nasce dal registro generico ma
    dalla **conversione** della prova — l'unica autorita che la crea e la
    collega — e poi si completa con cio che il modulo ha raccolto.
  */
  const [trialToUse, setTrialToUse] = React.useState<TrialAthlete | null>(null);
  const canReadTrials = roleHasPermission(activeClub?.role || null, "trials.read");
  const canConvertTrials = roleHasPermission(activeClub?.role || null, "trials.convert");

  const handleSubmit = async (draft: any) => {
    if (!clubId || !user) {
      showToast("error", "Club o utente non trovato");
      return false;
    }

    try {
      const linkedCategory =
        categories.find((category) => category.id === draft.categoryId) ||
        findCategoryForBirthDate(draft.birthDate, categories);

      const secondaryIds: string[] = Array.isArray(draft.secondaryCategoryIds)
        ? draft.secondaryCategoryIds
        : [];

      /*
        Le appartenenze si scrivono alla creazione, primaria e secondarie: un
        atleta che si allena con due gruppi lo fa dal primo giorno, e finora la
        seconda si poteva aggiungere solo riaprendo la scheda.
      */
      const categoryMemberships = [
        ...(linkedCategory
          ? [
              {
                category_id: linkedCategory.id,
                category_name: linkedCategory.name,
                is_primary: true,
              },
            ]
          : []),
        ...secondaryIds
          .filter((id) => id && id !== linkedCategory?.id)
          .map((id) => {
            const category = categories.find((item) => item.id === id);
            return {
              category_id: id,
              category_name: category?.name || id,
              is_primary: false,
            };
          }),
      ];

      let saved: { id?: string } | null = null;
      if (trialToUse) {
        /*
          Prima la conversione — canonica, transazionale, una sola — poi il
          resto del modulo sulla scheda appena nata. Se il completamento
          fallisce la scheda esiste gia e la prova e collegata: si va sulla
          scheda e lo si dice, invece di lasciare credere che non ci sia.
        */
        const esito = await convertTrialAthlete(trialToUse.id, {
          create: {
            status: "active",
            categoryId: linkedCategory?.id || null,
            siteId: trialToUse.siteId || null,
          },
        });
        saved = { id: esito.athleteId };
        try {
          /*
            `updateClubAthlete` fonde le chiavi **piatte** dentro `data`
            (revisione ostile A-F1): i dati del modulo — codice fiscale,
            recapiti, tutori, tesseramenti — si passano spacchettati, non
            sotto una chiave `data` che finirebbe in `data.data`.
          */
          await updateClubAthlete(clubId, esito.athleteId, {
            firstName: draft.firstName,
            lastName: draft.lastName,
            birthDate: draft.birthDate,
            medicalCertExpiry: draft.medicalCertExpiry || null,
            ...(draft.data || {}),
            ...(categoryMemberships.length ? { categoryMemberships } : {}),
          });
        } catch (error) {
          console.error("Error completing converted athlete:", error);
          showToast("error", "La persona in prova e diventata atleta, ma il resto del modulo non e stato salvato: completa la scheda.");
          router.push(`/athletes/${esito.athleteId}`);
          return true;
        }
      } else {
        saved = await addClubAthlete(clubId, {
          firstName: draft.firstName,
          lastName: draft.lastName,
          birthDate: draft.birthDate,
          category: linkedCategory?.id || null,
          categoryName: linkedCategory?.name || null,
          medicalCertExpiry: draft.medicalCertExpiry || null,
          status: "active",
          data: draft.data || {},
          ...(categoryMemberships.length ? { categoryMemberships } : {}),
        });
      }

      showToast(
        "success",
        trialToUse
          ? `${draft.firstName} ${draft.lastName} e ora un atleta: le ${trialToUse.trialsCount} prove restano nello storico`
          : `Atleta ${draft.firstName} ${draft.lastName} iscritto con successo`,
      );

      /*
        Si va sulla scheda appena creata: chi ha appena iscritto un atleta
        quasi sempre continua da li — piano di pagamento, certificato,
        documenti — e riportarlo all'elenco lo costringerebbe a ritrovarlo.
      */
      router.push(saved?.id ? `/athletes/${saved.id}` : backHref);
      return true;
    } catch (error) {
      console.error("Error creating athlete:", error);
      showToast("error", "Errore durante la creazione dell'atleta");
      return false;
    }
  };

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Nuovo atleta" />

        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-[1120px]">
            <div className="flex items-start gap-3">
              <IconButton
                aria-label="Torna agli atleti"
                variant="secondary"
                size="md"
                className="mt-1 shrink-0"
                onClick={requestBack}
              >
                <ArrowLeft />
              </IconButton>
              <PageHeader
                eyebrow="Persone · Atleti"
                title="Nuovo atleta"
                description="Obbligatori nome, cognome e data di nascita. Il resto si può compilare ora o dopo."
                className="mb-0 min-w-0 flex-1"
              >
                {!clubId ? (
                  <AlertBlock
                    severity="warning"
                    title="Nessun club selezionato"
                  >
                    Seleziona prima un club dalla tua area account, poi torna
                    qui per iscrivere il nuovo atleta.
                  </AlertBlock>
                ) : null}
              </PageHeader>
            </div>

            <AthleteCreateForm
              formId="athlete-create-form"
              categories={categories}
              categoryLabel={(categoryId) => categoryDisplay.label(categoryId)}
              federations={federations}
              onSubmit={handleSubmit}
              onCancel={goBack}
              onDirtyChange={setDirty}
              identityNotice={
                canReadTrials
                  ? (identity) => (
                      <TrialMatchNotice
                        firstName={identity.firstName}
                        lastName={identity.lastName}
                        birthDate={identity.birthDate}
                        enabled={canConvertTrials}
                        selectedTrialId={trialToUse?.id || null}
                        onUse={(trial) => setTrialToUse(trial)}
                        onDismiss={() => setTrialToUse(null)}
                        onClear={() => setTrialToUse(null)}
                      />
                    )
                  : undefined
              }
            />
          </DashboardPageContainer>
        </main>
      </div>

      <DirtyGuardDialog
        open={guardOpen}
        onOpenChange={setGuardOpen}
        onDiscard={() => {
          setGuardOpen(false);
          goBack();
        }}
      />
    </div>
  );
}

export default function NewAthletePage() {
  return (
    <Suspense fallback={null}>
      <NewAthletePageContent />
    </Suspense>
  );
}
