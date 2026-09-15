"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer } from "@/components/web/overlays/Drawer";
import { IconChip } from "@/components/web/primitives/StatusPill";
import { Eyebrow } from "@/components/web/primitives/Surface";
import { usePreference } from "@/components/web/hooks/use-preference";
import type { QuickAction } from "@/components/web/shell/navigation";

/**
 * Il cassetto «Azioni rapide» (guideline 06 §6.5): l'unica superficie globale
 * di creazione. Intestazione in gradiente, prima riga promossa, ogni riga con
 * l'elenco dei campi che chiedera, «Usate di recente» in fondo.
 *
 * Una riga apre il modulo di creazione della sua pagina, com'e oggi. Il modulo
 * compatto *dentro* il cassetto (§8.6) arrivera con le pagine che lo
 * supportano: fino ad allora la riga porta al modulo vero, senza inventarne
 * un secondo.
 */
export function QuickActionsDrawer({
  open,
  onOpenChange,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: readonly QuickAction[];
}) {
  const router = useRouter();
  const [recent, setRecent] = usePreference<string[]>("shell", "recentActions", []);

  const run = React.useCallback(
    (action: QuickAction) => {
      setRecent((current) => [action.id, ...current.filter((id) => id !== action.id)].slice(0, 3));
      onOpenChange(false);
      router.push(action.href);
    },
    [onOpenChange, router, setRecent],
  );

  const recentActions = recent
    .map((id) => actions.find((a) => a.id === id))
    .filter((a): a is QuickAction => Boolean(a));

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="narrow"
      tone="brand"
      blurScrim
      eyebrow="Azioni rapide"
      title="Cosa devi registrare?"
      description="Una scorciatoia apre il modulo giusto senza passare dall'elenco."
      bodyClassName="px-4 py-4"
      footer={
        <span className="text-[11px] text-egw-ink-62">
          Scorciatoia <kbd className="rounded-egw-micro border border-egw-hairline bg-white px-1.5 py-0.5 font-mono text-[10px]">⌘J</kbd>
        </span>
      }
    >
      <ul className="flex flex-col gap-2">
        {actions.map((action, index) => {
          const Icon = action.icon;
          const promoted = index === 0;
          return (
            <li key={action.id}>
              <button
                type="button"
                onClick={() => run(action)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-egw-field border px-[13px] py-3 text-left transition-colors duration-hover focus-visible:outline-none focus-visible:shadow-egw-focus",
                  promoted
                    ? "border-[rgba(37,99,235,.22)] bg-egw-page-050 shadow-[inset_0_1px_0_#fff] hover:border-[rgba(37,99,235,.4)]"
                    : "border-[rgba(11,26,58,.1)] bg-white hover:border-[rgba(37,99,235,.32)]",
                )}
              >
                <IconChip tone={action.tone} size={34}>
                  <Icon />
                </IconChip>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold leading-4 text-egw-ink">{action.label}</span>
                  <span className="egw-ellipsis block text-[10.5px] leading-[1.4] text-[rgba(11,26,58,.58)]">{action.fields}</span>
                </span>
                <ChevronRight className={cn("h-[13px] w-[13px] shrink-0", promoted ? "text-egw-blue" : "text-[rgba(11,26,58,.35)]")} />
              </button>
            </li>
          );
        })}
      </ul>

      {recentActions.length ? (
        <section className="mt-6">
          <Eyebrow className="mb-2.5 px-0.5">Usate di recente</Eyebrow>
          <div className="flex flex-wrap gap-2">
            {recentActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => run(action)}
                className="inline-flex h-7 items-center rounded-egw-chip border border-[rgba(11,26,58,.1)] bg-egw-page-100 px-2.5 text-[11.5px] font-medium text-egw-ink-72 transition-colors duration-hover hover:bg-white focus-visible:outline-none focus-visible:shadow-egw-focus"
              >
                {action.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </Drawer>
  );
}
