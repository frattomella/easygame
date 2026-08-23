"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiRequest, readStoredActiveClub } from "@/lib/api/client";
import {
  ONBOARDING_STEPS,
  canResumeOnboarding,
  normalizeOnboardingState,
  onboardingProgress,
  resumeOnboardingStep,
  type OnboardingState,
} from "@/lib/onboarding";
import { ArrowRight, Compass } from "lucide-react";

/**
 * Ripresa della configurazione iniziale.
 *
 * Il banner e la promessa mantenuta del pulsante "Salta per ora": un
 * onboarding saltato non e un onboarding perduto. Compare finche non e
 * completato, e non torna piu una volta concluso.
 *
 * Legge la sola colonna `settings` del club: e una riga in piu nella
 * dashboard, non deve costare come un caricamento (WP-36).
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
    <section className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50/70 p-4 sm:flex-row sm:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-600 text-white">
        <Compass className="h-5 w-5" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">
          {progress.completed === 0
            ? "Configura il club in cinque passi"
            : "Riprendi la configurazione iniziale"}
        </p>
        <p className="mt-0.5 text-sm text-slate-600">
          <span className="eg-tabular">
            {progress.completed}/{progress.total}
          </span>{" "}
          completati · prossimo passo: {nextStep?.title || "conclusione"}
        </p>
      </div>

      <Button
        type="button"
        className="shrink-0"
        onClick={() => router.push("/onboarding")}
      >
        Riprendi
        <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
      </Button>
    </section>
  );
}
