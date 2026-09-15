"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Button } from "@/components/web/primitives/Button";
import { apiRequest, readStoredActiveClub } from "@/lib/api/client";
import {
  ONBOARDING_STEPS,
  canResumeOnboarding,
  normalizeOnboardingState,
  onboardingProgress,
  resumeOnboardingStep,
  type OnboardingState,
} from "@/lib/onboarding";

/**
 * Ripresa della configurazione iniziale.
 *
 * Il banner e la promessa mantenuta del pulsante "Salta per ora": un
 * onboarding saltato non e un onboarding perduto. Compare finche non e
 * completato, e non torna piu una volta concluso.
 *
 * Legge la sola colonna `settings` del club: e una riga in piu nella
 * dashboard, non deve costare come un caricamento (WP-36).
 *
 * Dal Web V2 e un blocco di avviso informativo in testa alla coda di lavoro
 * della Dashboard (guideline 09 §9.6): conteggio, prossimo passo, un verbo.
 */
export function OnboardingResumeCard() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);

  useEffect(() => {
    const activeClub = readStoredActiveClub();
    const clubId = activeClub?.id ? String(activeClub.id) : "";
    if (!clubId) return;

    let cancelled = false;

    const load = async () => {
      const params = new URLSearchParams({ id: clubId, fields: "settings" });
      const response = await apiRequest<any[]>(
        `/api/v1/clubs?${params.toString()}`,
      );
      if (cancelled || response.error) return;

      const record = Array.isArray(response.data)
        ? response.data[0]
        : response.data;
      setState(normalizeOnboardingState(record?.settings));
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!state || !canResumeOnboarding(state)) {
    return null;
  }

  const progress = onboardingProgress(state);
  const nextStepId = resumeOnboardingStep(state);
  const nextStep = ONBOARDING_STEPS.find((step) => step.id === nextStepId);

  return (
    <AlertBlock
      severity="info"
      role="status"
      title={
        progress.completed === 0
          ? "Configura il club in cinque passi"
          : "Riprendi la configurazione iniziale"
      }
      actions={
        <Button variant="neutral" size="sm" onClick={() => router.push("/onboarding")}>
          Riprendi
        </Button>
      }
    >
      <span className="egw-num">
        {progress.completed}/{progress.total}
      </span>{" "}
      completati · prossimo passo: {nextStep?.title || "conclusione"}
    </AlertBlock>
  );
}
