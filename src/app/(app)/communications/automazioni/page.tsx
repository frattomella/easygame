"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Play, Timer } from "lucide-react";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { PageHeader } from "@/components/web/page/PageHeader";
import { AlertBlock } from "@/components/web/page/Alerts";
import { EmptyStateCard, InfoCard } from "@/components/web/page/Cards";
import { Button } from "@/components/web/primitives/Button";
import { Skeleton } from "@/components/web/primitives/Controls";
import { Panel } from "@/components/web/primitives/Surface";
import { SectionNav } from "@/components/web/record/Record";
import { useConfirm } from "@/components/web/overlays/useConfirm";
import { CommunicationsNav } from "@/components/communications/v2/communications-nav";
import { AutomationRulePanel } from "@/components/communications/v2/automation-rule-panel";
import { ruleDraftFrom, rulePayload, type RuleDraft, type RuleView } from "@/components/communications/v2/automation-model";

/**
 * La configurazione delle automazioni (W2-A, G-03/G-04/G-58) — Web V2,
 * pattern 5 «Settings»: intestazione → rail di sezione → un pannello per
 * regola con il proprio «Salva».
 *
 * **Perche una sottopagina di «Comunicazioni» e non una voce di menu nuova.**
 * Un'automazione e un messaggio che parte da solo: sta accanto ai messaggi che
 * partono a mano, non in un'area propria. Una voce in piu nel menu avrebbe
 * suggerito che sia un'altra cosa.
 *
 * Le regole sono un catalogo **chiuso** (`AUTOMATION_TRIGGER_KINDS`): non se
 * ne creano e non se ne cancellano, si accendono e si spengono. Per questo
 * non c'e una griglia ne un cassetto di creazione: c'e un modulo per regola.
 */

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

export default function AutomazioniPage() {
  const { showToast } = useToast();
  const [confirm, confirmDialog] = useConfirm();

  const [clubName, setClubName] = useState("");
  const [rules, setRules] = useState<RuleView[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({});
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeRule, setActiveRule] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    const response = await apiRequest<any>("/api/v1/automations");
    setLoading(false);

    if (response.error || !response.data) {
      setLoadError(response.error?.message || "Lettura non riuscita");
      return;
    }

    setLoadError("");
    setClubName(String(response.data.clubName || ""));
    const caricate = asArray(response.data.rules) as RuleView[];
    setRules(caricate);
    setDrafts(Object.fromEntries(caricate.map((rule) => [rule.trigger, ruleDraftFrom(rule)])));
    setActiveRule((current) => current || caricate[0]?.trigger || null);
  }, []);

  useEffect(() => {
    carica().catch(() => setLoading(false));
  }, [carica]);

  const aggiorna = (trigger: string, patch: Partial<RuleDraft>) => {
    setDrafts((current) => ({ ...current, [trigger]: { ...current[trigger], ...patch } }));
  };

  const salva = async (rule: RuleView) => {
    const draft = drafts[rule.trigger];
    if (!draft) return;
    setBusy(rule.trigger);
    const response = await apiRequest<any>("/api/v1/automations", {
      method: "POST",
      body: { rule: rulePayload(rule, draft) },
    });
    setBusy("");

    if (response.error) {
      showToast("error", response.error.message || "Salvataggio non riuscito");
      return;
    }

    showToast("success", `${rule.label}: configurazione salvata`);
    await carica();
  };

  const eseguiAdesso = async () => {
    /*
      Il giro manda email vere a tutte le occorrenze del giorno: e un gesto
      notevole (guideline 08 §8.9), una riga di conseguenza e il verbo.
    */
    const ok = await confirm({
      title: "Eseguire il giro delle automazioni adesso?",
      description: "Le regole accese mandano subito i messaggi per le scadenze di oggi. Chi e gia stato avvisato non riceve un secondo promemoria.",
      confirmLabel: "Esegui",
    });
    if (!ok) return;

    setBusy("run");
    const response = await apiRequest<any>("/api/v1/automations/run", { method: "POST", body: {} });
    setBusy("");

    if (response.error || !response.data) {
      showToast("error", response.error?.message || "Esecuzione non riuscita");
      return;
    }

    const totali = response.data.totals || { sent: 0, skipped: 0, failed: 0 };
    showToast(
      totali.sent > 0 ? "success" : "info",
      `Occorrenze trovate: ${response.data.occurrences || 0} · inviati ${totali.sent} · saltati ${totali.skipped} · falliti ${totali.failed}`,
    );
  };

  const navItems = useMemo(() => rules.map((rule) => ({ id: rule.trigger, label: rule.label })), [rules]);

  const vaiA = (trigger: string) => {
    setActiveRule(trigger);
    document.getElementById(`regola-${trigger}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Automazioni" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Segreteria"
              title="Automazioni"
              description={`I messaggi che ${clubName || "il club"} manda da solo: quando partono, a chi, e con quali parole.`}
              actions={
                <Button variant="secondary" icon={<Play />} loading={busy === "run"} disabled={busy !== "" && busy !== "run"} onClick={() => void eseguiAdesso()}>
                  Esegui adesso
                </Button>
              }
            >
              <CommunicationsNav />
            </PageHeader>

            <InfoCard eyebrow="Il giro notturno">
              Il giro parte ogni notte. Un anticipo gia trascorso non viene recuperato all&apos;indietro: accendere oggi una regola «7 giorni prima» non manda
              niente per una scadenza fra due giorni.
            </InfoCard>

            {loadError ? (
              <AlertBlock
                severity="danger"
                title="Le automazioni non sono state lette"
                actions={
                  <Button variant="secondary" size="sm" onClick={() => void carica()}>
                    Riprova
                  </Button>
                }
              >
                {loadError}
              </AlertBlock>
            ) : null}

            <div className="flex items-start gap-[18px]">
              {rules.length > 0 ? <SectionNav items={navItems} activeId={activeRule || undefined} onSelect={vaiA} /> : null}

              <div className="flex min-w-0 flex-1 flex-col gap-[18px]">
                {loading && rules.length === 0 ? (
                  [0, 1, 2].map((index) => (
                    <Panel key={index}>
                      <Skeleton className="mb-3 h-3 w-24" />
                      <Skeleton className="mb-5 h-5 w-64" />
                      <Skeleton className="mb-3 h-[46px] w-full" />
                      <Skeleton className="mb-3 h-[46px] w-full" />
                      <Skeleton className="h-[120px] w-full" />
                    </Panel>
                  ))
                ) : rules.length === 0 && !loadError ? (
                  <EmptyStateCard icon={<Timer />} title="Nessuna regola disponibile" description="Il catalogo delle automazioni e vuoto per questo club." />
                ) : (
                  rules.map((rule) =>
                    drafts[rule.trigger] ? (
                      <AutomationRulePanel
                        key={rule.trigger}
                        rule={rule}
                        draft={drafts[rule.trigger]}
                        onChange={(patch) => aggiorna(rule.trigger, patch)}
                        onSave={() => void salva(rule)}
                        saving={busy === rule.trigger}
                        disabled={busy !== ""}
                      />
                    ) : null,
                  )
                )}
              </div>
            </div>
          </DashboardPageContainer>
        </main>
      </div>
      {confirmDialog}
    </div>
  );
}
