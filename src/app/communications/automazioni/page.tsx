"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import {
  AUTOMATION_AUDIENCES,
  AUTOMATION_AUDIENCE_LABELS,
  AUTOMATION_DELIVERIES,
  AUTOMATION_DELIVERY_LABELS,
  MAX_AUTOMATION_OFFSETS,
  describeAutomationOffset,
  type AutomationAudience,
  type AutomationDelivery,
} from "@/lib/automations/catalog";
import { SUGGESTED_ATTACHMENT_CATEGORIES } from "@/lib/attachments";
import { AlertTriangle, Eye, Play, Save, Timer } from "lucide-react";

/**
 * La configurazione delle automazioni (W2-A, G-03/G-04/G-58).
 *
 * **Perche una sottopagina di «Comunicazioni» e non una voce di menu nuova.**
 * Un'automazione e un messaggio che parte da solo: sta accanto ai messaggi che
 * partono a mano, non in un'area propria. Una voce in piu nel menu avrebbe
 * suggerito che sia un'altra cosa.
 *
 * **Perche l'interruttore e la prima riga di ogni regola.** E l'unica funzione
 * del prodotto che scrive a nome della societa senza che nessuno prema un
 * pulsante: la domanda «e accesa?» deve avere risposta prima di ogni altra, e
 * spegnerla non deve richiedere di capire il resto della scheda.
 *
 * **Perche l'anteprima mostra i segnaposto vuoti.** Un modello con
 * `{{importo}}` scritto male non deve arrivare a trecento famiglie: qui i
 * segnaposto che non producono niente si vedono **prima**, sotto il testo, con
 * il loro nome.
 */

type RuleView = {
  id: string;
  trigger: string;
  enabled: boolean;
  offsetDays: number[];
  audience: AutomationAudience;
  delivery: AutomationDelivery;
  template: { subject: string; body: string };
  categories: string[];
  updatedAt: string | null;
  label: string;
  description: string;
  direction: "before" | "after";
  defaultOffsetDays: number[];
  supportsCategoryFilter: boolean;
  sample: { subject: string; text: string; unresolved: string[] };
};

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

const offsetsToText = (values: number[]) => values.join(", ");

/**
 * `7, 3` diventa `[7, 3]`.
 *
 * Cio che non e un numero **resta fuori** invece di diventare zero: «7, tre»
 * salvato come «7, 0» manderebbe un messaggio il giorno della scadenza senza
 * che nessuno lo abbia chiesto. Il server rifiuta comunque, ed e li che la
 * regola vera vive.
 */
const parseOffsets = (text: string) =>
  text
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part))
    .filter((value) => Number.isFinite(value));

/**
 * «BLSD, primo soccorso» diventa `["blsd", "primo-soccorso"]`.
 *
 * La riduzione vera la fa il dominio, che e anche l'unico posto in cui le
 * categorie del certificato medico vengono scartate: qui si separa e basta,
 * cosi il campo resta scrivibile come si scriverebbe a mano.
 */
const parseCategories = (text: string) =>
  text
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

export default function AutomazioniPage() {
  const { showToast } = useToast();

  const [clubName, setClubName] = useState("");
  const [rules, setRules] = useState<RuleView[]>([]);
  const [offsetText, setOffsetText] = useState<Record<string, string>>({});
  const [categoryText, setCategoryText] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");

  const carica = useCallback(async () => {
    setCaricamento(true);
    const response = await apiRequest<any>("/api/v1/automations");
    setCaricamento(false);

    if (response.error || !response.data) {
      setErrore(response.error?.message || "Lettura non riuscita");
      return;
    }

    setErrore("");
    setClubName(String(response.data.clubName || ""));
    const caricate = asArray(response.data.rules) as RuleView[];
    setRules(caricate);
    setOffsetText(
      Object.fromEntries(
        caricate.map((rule) => [rule.trigger, offsetsToText(rule.offsetDays)]),
      ),
    );
    setCategoryText(
      Object.fromEntries(
        caricate.map((rule) => [
          rule.trigger,
          asArray(rule.categories).join(", "),
        ]),
      ),
    );
  }, []);

  useEffect(() => {
    carica().catch(() => setCaricamento(false));
  }, [carica]);

  const aggiorna = (trigger: string, patch: Partial<RuleView>) => {
    setRules((current) =>
      current.map((rule) =>
        rule.trigger === trigger ? { ...rule, ...patch } : rule,
      ),
    );
  };

  const salva = async (rule: RuleView) => {
    setBusy(rule.trigger);
    const response = await apiRequest<any>("/api/v1/automations", {
      method: "POST",
      body: {
        rule: {
          trigger: rule.trigger,
          enabled: rule.enabled,
          offsetDays: parseOffsets(offsetText[rule.trigger] ?? ""),
          audience: rule.audience,
          delivery: rule.delivery,
          template: rule.template,
          categories: rule.supportsCategoryFilter
            ? parseCategories(categoryText[rule.trigger] ?? "")
            : [],
        },
      },
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
    setBusy("run");
    const response = await apiRequest<any>("/api/v1/automations/run", {
      method: "POST",
      body: {},
    });
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

  return (
    <div className="flex h-[100dvh] bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Automazioni" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-5xl">
            <SharedPageHeader
              title="Automazioni"
              subtitle={`I messaggi che ${clubName || "il club"} manda da solo: quando partono, a chi, e con quali parole.`}
              actions={
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" asChild>
                    <Link href="/communications">Comunicazioni</Link>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={eseguiAdesso}
                    disabled={busy !== ""}
                  >
                    <Play className="mr-2 h-4 w-4" aria-hidden="true" />
                    Esegui adesso
                  </Button>
                </div>
              }
            />

            <p className="text-sm text-slate-600">
              Il giro parte ogni notte. Un anticipo gia trascorso non viene
              recuperato all&apos;indietro: accendere oggi una regola «7 giorni
              prima» non manda niente per una scadenza fra due giorni.
            </p>

            {errore ? (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="flex items-start gap-2 p-4 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4" aria-hidden="true" />
                  <span>{errore}</span>
                </CardContent>
              </Card>
            ) : null}

            {caricamento ? (
              <p className="text-sm text-slate-500">Caricamento…</p>
            ) : null}

            <div className="space-y-6">
              {rules.map((rule) => (
                <Card key={rule.trigger}>
                  <CardHeader className="gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Timer className="h-4 w-4" aria-hidden="true" />
                        {rule.label}
                      </CardTitle>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={rule.enabled}
                          onChange={(event) =>
                            aggiorna(rule.trigger, {
                              enabled: event.target.checked,
                            })
                          }
                        />
                        <span>{rule.enabled ? "Accesa" : "Spenta"}</span>
                      </label>
                    </div>
                    <p className="text-sm text-slate-600">{rule.description}</p>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`anticipi-${rule.trigger}`}>
                          Anticipi (giorni, al massimo {MAX_AUTOMATION_OFFSETS})
                        </Label>
                        <Input
                          id={`anticipi-${rule.trigger}`}
                          value={offsetText[rule.trigger] ?? ""}
                          inputMode="numeric"
                          onChange={(event) =>
                            setOffsetText((current) => ({
                              ...current,
                              [rule.trigger]: event.target.value,
                            }))
                          }
                        />
                        <p className="text-xs text-slate-500">
                          {parseOffsets(offsetText[rule.trigger] ?? "")
                            .map((days) =>
                              describeAutomationOffset(rule.direction, days),
                            )
                            .join(" · ") || "Nessun anticipo: la regola non parte"}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`pubblico-${rule.trigger}`}>Pubblico</Label>
                        <select
                          id={`pubblico-${rule.trigger}`}
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                          value={rule.audience}
                          onChange={(event) =>
                            aggiorna(rule.trigger, {
                              audience: event.target.value as AutomationAudience,
                            })
                          }
                        >
                          {AUTOMATION_AUDIENCES.map((audience) => (
                            <option key={audience} value={audience}>
                              {AUTOMATION_AUDIENCE_LABELS[audience]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`consegna-${rule.trigger}`}>
                        Come arriva alla societa
                      </Label>
                      <select
                        id={`consegna-${rule.trigger}`}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                        value={rule.delivery}
                        disabled={rule.audience === "family"}
                        onChange={(event) =>
                          aggiorna(rule.trigger, {
                            delivery: event.target.value as AutomationDelivery,
                          })
                        }
                      >
                        {AUTOMATION_DELIVERIES.map((delivery) => (
                          <option key={delivery} value={delivery}>
                            {AUTOMATION_DELIVERY_LABELS[delivery]}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-500">
                        Il riepilogo raccoglie in una sola email al giorno tutto
                        cio che riguarda la societa. Alla famiglia arriva sempre
                        il messaggio che la riguarda.
                      </p>
                    </div>

                    {rule.supportsCategoryFilter ? (
                      <div className="space-y-2">
                        <Label htmlFor={`categorie-${rule.trigger}`}>
                          Documenti da sorvegliare
                        </Label>
                        <Input
                          id={`categorie-${rule.trigger}`}
                          list={`categorie-note-${rule.trigger}`}
                          placeholder="blsd, documento-identita"
                          value={categoryText[rule.trigger] ?? ""}
                          onChange={(event) =>
                            setCategoryText((current) => ({
                              ...current,
                              [rule.trigger]: event.target.value,
                            }))
                          }
                        />
                        <datalist id={`categorie-note-${rule.trigger}`}>
                          {SUGGESTED_ATTACHMENT_CATEGORIES.map((categoria) => (
                            <option key={categoria} value={categoria} />
                          ))}
                        </datalist>
                        <p className="text-xs text-slate-500">
                          Separa le categorie con una virgola. Lascia vuoto per
                          sorvegliare tutti i documenti con una scadenza. Il
                          certificato medico resta fuori: lo governa la regola
                          «Certificato medico», e due regole sulla stessa data
                          sarebbero due promemoria.
                        </p>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Label htmlFor={`oggetto-${rule.trigger}`}>Oggetto</Label>
                      <Input
                        id={`oggetto-${rule.trigger}`}
                        value={rule.template.subject}
                        onChange={(event) =>
                          aggiorna(rule.trigger, {
                            template: {
                              ...rule.template,
                              subject: event.target.value,
                            },
                          })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`testo-${rule.trigger}`}>Testo</Label>
                      <Textarea
                        id={`testo-${rule.trigger}`}
                        rows={10}
                        value={rule.template.body}
                        onChange={(event) =>
                          aggiorna(rule.trigger, {
                            template: {
                              ...rule.template,
                              body: event.target.value,
                            },
                          })
                        }
                      />
                    </div>

                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <Eye className="h-4 w-4" aria-hidden="true" />
                        Anteprima con dati di esempio
                      </p>
                      <p className="mt-2 text-sm font-medium text-slate-800">
                        {rule.sample.subject}
                      </p>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-600">
                        {rule.sample.text}
                      </pre>
                      {rule.sample.unresolved.length > 0 ? (
                        <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-amber-700">
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          Segnaposto senza valore:
                          {rule.sample.unresolved.map((key) => (
                            <Badge key={key} variant="outline">
                              {key}
                            </Badge>
                          ))}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-slate-500">
                        L&apos;anteprima usa dati inventati. Serve a vedere la
                        forma del messaggio e i segnaposto che restano vuoti.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-500">
                        Predefiniti:{" "}
                        {rule.defaultOffsetDays
                          .map((days) =>
                            describeAutomationOffset(rule.direction, days),
                          )
                          .join(" · ")}
                      </p>
                      <Button
                        onClick={() => salva(rule)}
                        disabled={busy !== ""}
                      >
                        <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                        Salva
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
