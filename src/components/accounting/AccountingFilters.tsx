"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SiteFilter } from "@/components/sites/site-filter";
import type { ClubSite } from "@/lib/club-sites";
import { Search, X } from "lucide-react";
import {
  RECONCILIATION_STATUSES,
  RECONCILIATION_STATUS_LABELS,
  SOURCE_DOMAINS,
  SOURCE_DOMAIN_LABELS,
} from "@/lib/accounting/model";
import {
  fiscalYearChoices,
  hasActiveFilters,
  type AccountingFilterState,
  type FinancialAccountView,
  type OperationTypeView,
} from "./accounting-view";

/**
 * I filtri della prima nota.
 *
 * **Cosa aggiunge rispetto a prima.** La pagina precedente aveva una casella
 * di ricerca e una tendina dei conti, e **nessun filtro di data**: su un club
 * con tre stagioni di storico la domanda «cosa e successo a gennaio» non aveva
 * risposta, e la pagina rendeva comunque tutte le righe. Qui i filtri sono
 * quelli che il servizio sa applicare **sugli indici**, e nessuno di piu:
 * offrirne uno che il server ignora e peggio che non offrirlo.
 *
 * **Il filtro sede compare solo ai club multi-sede.** Non e una decisione di
 * questa schermata: la prende `SiteFilter`, che e il proprietario della regola
 * di ADR-0038 — «il club mono-sede non paga niente». Riscriverla qui avrebbe
 * prodotto la seconda copia che la Wave 2 ha imparato a temere.
 */

/*
  `Select` non accetta la stringa vuota come valore di una voce: sarebbe
  indistinguibile da «nessuna selezione» e il segnaposto sparirebbe. Ogni
  tendina ha quindi una sentinella per «tutti», tradotta in stringa vuota
  prima di uscire dal componente — perche il servizio legge la stringa vuota
  come «non filtrare».
*/
const TUTTI = "__tutti__";
const fromSentinel = (value: string) => (value === TUTTI ? "" : value);
const toSentinel = (value: string) => value || TUTTI;

export function AccountingFilters({
  filters,
  onChange,
  onReset,
  accounts,
  operationTypes,
  sites,
  disabled = false,
}: {
  filters: AccountingFilterState;
  onChange: (next: Partial<AccountingFilterState>) => void;
  onReset: () => void;
  accounts: readonly FinancialAccountView[];
  operationTypes: readonly OperationTypeView[];
  sites: ClubSite[];
  disabled?: boolean;
}) {
  const anni = fiscalYearChoices();

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <Label htmlFor="movimenti-dal" className="text-xs text-slate-500">
            Dal
          </Label>
          <Input
            id="movimenti-dal"
            type="date"
            className="mt-1"
            value={filters.from}
            disabled={disabled}
            onChange={(event) => onChange({ from: event.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="movimenti-al" className="text-xs text-slate-500">
            Al
          </Label>
          <Input
            id="movimenti-al"
            type="date"
            className="mt-1"
            value={filters.to}
            disabled={disabled}
            onChange={(event) => onChange({ to: event.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="movimenti-anno" className="text-xs text-slate-500">
            Anno fiscale
          </Label>
          <Select
            value={toSentinel(filters.fiscalYear)}
            disabled={disabled}
            onValueChange={(value) =>
              onChange({ fiscalYear: fromSentinel(value) })
            }
          >
            <SelectTrigger id="movimenti-anno" className="mt-1">
              <SelectValue placeholder="Tutti gli anni" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TUTTI}>Tutti gli anni</SelectItem>
              {anni.map((anno) => (
                <SelectItem key={anno} value={String(anno)}>
                  {anno}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="movimenti-conto" className="text-xs text-slate-500">
            Conto
          </Label>
          <Select
            value={toSentinel(filters.financialAccountId)}
            disabled={disabled}
            onValueChange={(value) =>
              onChange({ financialAccountId: fromSentinel(value) })
            }
          >
            <SelectTrigger id="movimenti-conto" className="mt-1">
              <SelectValue placeholder="Tutti i conti" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TUTTI}>Tutti i conti</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="movimenti-causale" className="text-xs text-slate-500">
            Causale
          </Label>
          <Select
            value={toSentinel(filters.operationTypeCode)}
            disabled={disabled}
            onValueChange={(value) =>
              onChange({ operationTypeCode: fromSentinel(value) })
            }
          >
            <SelectTrigger id="movimenti-causale" className="mt-1">
              <SelectValue placeholder="Tutte le causali" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TUTTI}>Tutte le causali</SelectItem>
              {operationTypes.map((type) => (
                <SelectItem key={type.code} value={type.code}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="movimenti-verso" className="text-xs text-slate-500">
            Verso
          </Label>
          <Select
            value={toSentinel(filters.direction)}
            disabled={disabled}
            onValueChange={(value) =>
              onChange({ direction: fromSentinel(value) })
            }
          >
            <SelectTrigger id="movimenti-verso" className="mt-1">
              <SelectValue placeholder="Entrate e uscite" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TUTTI}>Entrate e uscite</SelectItem>
              <SelectItem value="IN">Solo entrate</SelectItem>
              <SelectItem value="OUT">Solo uscite</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="movimenti-origine" className="text-xs text-slate-500">
            Origine
          </Label>
          <Select
            value={toSentinel(filters.sourceDomain)}
            disabled={disabled}
            onValueChange={(value) =>
              onChange({ sourceDomain: fromSentinel(value) })
            }
          >
            <SelectTrigger id="movimenti-origine" className="mt-1">
              <SelectValue placeholder="Tutte le origini" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TUTTI}>Tutte le origini</SelectItem>
              {SOURCE_DOMAINS.map((domain) => (
                <SelectItem key={domain} value={domain}>
                  {SOURCE_DOMAIN_LABELS[domain]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label
            htmlFor="movimenti-riconciliazione"
            className="text-xs text-slate-500"
          >
            Riconciliazione
          </Label>
          <Select
            value={toSentinel(filters.reconciliationStatus)}
            disabled={disabled}
            onValueChange={(value) =>
              onChange({ reconciliationStatus: fromSentinel(value) })
            }
          >
            <SelectTrigger id="movimenti-riconciliazione" className="mt-1">
              <SelectValue placeholder="Qualsiasi stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TUTTI}>Qualsiasi stato</SelectItem>
              {RECONCILIATION_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {RECONCILIATION_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/*
          Si monta da solo o non si monta affatto: la regola di ADR-0038 vive
          dentro `SiteFilter`, non qui.
        */}
        <SiteFilter
          id="movimenti-sede"
          sites={sites}
          value={filters.siteId}
          onChange={(siteId) => onChange({ siteId })}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Label htmlFor="movimenti-ricerca" className="text-xs text-slate-500">
            Ricerca
          </Label>
          <div className="relative mt-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              id="movimenti-ricerca"
              className="pl-9"
              placeholder="Descrizione, controparte, causale, riferimento bancario"
              value={filters.search}
              disabled={disabled}
              onChange={(event) => onChange({ search: event.target.value })}
            />
          </div>
        </div>

        {hasActiveFilters(filters) ? (
          <Button
            type="button"
            variant="outline"
            className="sm:w-auto"
            onClick={onReset}
            disabled={disabled}
          >
            <X className="mr-2 h-4 w-4" aria-hidden />
            Azzera filtri
          </Button>
        ) : null}
      </div>
    </div>
  );
}
