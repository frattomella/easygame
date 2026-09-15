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
import { findCategoryForBirthDate } from "@/lib/category-utils";
import {
  addClubAthlete,
  getClubCategories,
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
  const [federations, setFederations] = React.useState<ClubFederation[]>([]);
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

    void getClubCategories(clubId).then((rows: any) => {
      if (cancelled) return;
      setCategories(
        sortByName(Array.isArray(rows) ? rows : [], (row: any) => row?.name),
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

      const saved = await addClubAthlete(clubId, {
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

      showToast(
        "success",
        `Atleta ${draft.firstName} ${draft.lastName} iscritto con successo`,
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
              federations={federations}
              onSubmit={handleSubmit}
              onCancel={goBack}
              onDirtyChange={setDirty}
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
