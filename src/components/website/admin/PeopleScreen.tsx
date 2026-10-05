"use client";

import * as React from "react";
import { ChevronRight, Search, Users } from "lucide-react";
import { Panel } from "@/components/web/primitives/Surface";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { AlertBlock } from "@/components/web/page/Alerts";
import { EmptyStateCard, InfoCard } from "@/components/web/page/Cards";
import { TextInput } from "@/components/web/forms/Field";
import { spec } from "@/lib/web/status";
import { websiteApi, type PublicationCandidateDto } from "@/lib/website/client";
import { useWebsiteArea } from "./WebsiteAreaShell";
import { ListSkeleton } from "./admin-ui";
import { PublicationDrawer, consentDescription, type PersonKind } from "./PublicationDrawer";

/** Chi compare sul sito: atleti, allenatori, staff (ADR-0200 §7). */

const TABS: Array<{ value: PersonKind; label: string }> = [
  { value: "athlete", label: "Atleti" },
  { value: "trainer", label: "Allenatori" },
  { value: "staff", label: "Staff" },
];

const PUBLISHED = spec("PUBBLICATO", "solid", "green");
const NOT_PUBLISHED = spec("NON PUBBLICATO", "quiet", "neutral");

const CONSENT_CHIP: Record<PublicationCandidateDto["imageConsent"], { tone: "green" | "red" | "neutral"; label: string }> = {
  accepted: { tone: "green", label: "Immagini: consenso" },
  rejected: { tone: "red", label: "Immagini: rifiutato" },
  missing: { tone: "neutral", label: "Immagini: non registrato" },
};

export function PeopleScreen() {
  const { can, canEdit } = useWebsiteArea();
  const [kind, setKind] = React.useState<PersonKind>("athlete");
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [data, setData] = React.useState<{ imageConsentDefined: boolean; people: PublicationCandidateDto[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const allowed = can("website.people.manage");

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = React.useCallback(async () => {
    const result = await websiteApi.people(kind, debounced);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setData({ imageConsentDefined: result.data.imageConsentDefined, people: result.data.people });
  }, [kind, debounced]);

  React.useEffect(() => {
    if (!allowed) return;
    setData(null);
    void load();
  }, [allowed, load]);

  if (!allowed) {
    return (
      <InfoCard eyebrow="Accesso riservato">
        Decidere chi compare sul sito, e con quali dati, e riservato a chi ha il permesso di gestire le persone del sito.
      </InfoCard>
    );
  }

  const selected = data?.people.find((person) => person.id === selectedId) ?? null;
  const publishedCount = data?.people.filter((person) => person.settings.published).length ?? 0;

  return (
    <div className="space-y-4">
      <InfoCard eyebrow="Come funziona">
        Nessuno compare sul sito finche non lo pubblichi qui. Dati sensibili, contatti, documenti e date di nascita complete non vengono mai mostrati. Per i minori valgono regole piu strette.
      </InfoCard>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SegmentedControl value={kind} onChange={(value) => { setKind(value); setSelectedId(null); }} options={TABS} aria-label="Tipo di persona" />
        <div className="min-w-0 md:w-72">
          <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca per nome" aria-label="Cerca persone" leading={<Search />} />
        </div>
      </div>

      {error ? (
        <AlertBlock severity="danger" title="Le persone non si possono caricare">{error}</AlertBlock>
      ) : !data ? (
        <ListSkeleton rows={6} />
      ) : !data.people.length ? (
        <EmptyStateCard icon={<Users className="h-6 w-6" />} title={debounced ? "Nessuna persona corrisponde alla ricerca" : "Nessuna persona in questo elenco"} description="Le persone arrivano dall'anagrafica del gestionale." />
      ) : (
        <>
          <p className="text-[12.5px] text-egw-ink-62" role="status">
            {publishedCount} di {data.people.length} pubblicati
          </p>
          <Panel flush>
            <ul className="divide-y divide-egw-hairline">
              {data.people.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(person.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-egw-page-050 focus-visible:outline-none focus-visible:shadow-egw-focus sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-semibold text-egw-ink">{person.name}</span>
                        {person.isMinor ? <DataChip size="sm" tone="amber">Minorenne</DataChip> : null}
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-egw-ink-62">{person.categories.length ? person.categories.join(" · ") : person.role || "—"}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <StatusPill status={person.settings.published ? PUBLISHED : NOT_PUBLISHED} size="sm" />
                        <DataChip size="sm" tone={CONSENT_CHIP[person.imageConsent].tone} title={consentDescription(person, data.imageConsentDefined)}>
                          {CONSENT_CHIP[person.imageConsent].label}
                        </DataChip>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-egw-ink-42" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}

      <PublicationDrawer
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelectedId(null)}
        kind={kind}
        person={selected}
        imageConsentDefined={data?.imageConsentDefined ?? false}
        disabled={!canEdit}
        onSaved={load}
      />
    </div>
  );
}
