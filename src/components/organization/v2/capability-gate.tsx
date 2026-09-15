"use client";

import * as React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import { resolveActiveClubId } from "@/lib/active-club";
import type { EntitlementReason } from "@/lib/entitlements";
import { AlertBlock } from "@/components/web/page/Alerts";

/**
 * Cosa questa societa puo usare, **lato interfaccia**.
 *
 * **Il server resta l'unico che decide.** Questo strato non protegge niente:
 * serve a non far cliccare un pulsante che rispondera `403`, e a dire perche.
 * Chi lo aggirasse dalla console del browser troverebbe comunque
 * `requireClubEntitlement` dall'altra parte.
 *
 * **Perche non basta mostrare l'errore dopo il click.** «Disponibile con il
 * piano Plus», «L'abbonamento non e in corso» e «Si attiva come servizio
 * aggiuntivo» portano a fare tre cose diverse, e nessuna delle tre e
 * «riprova». Un `403` generico le appiattisce e fa telefonare.
 *
 * **Perche una richiesta sola per pagina.** Il verdetto e lo stesso per tutte
 * le funzioni: si legge una volta e si distribuisce.
 *
 * Vive qui (Web V2 della scheda Club) perche la scheda Club e l'unica
 * superficie che lo monta; il giorno in cui un'altra pagina ne avra bisogno,
 * si promuove alle fondamenta.
 */
export type CapabilityVerdict = {
  key: string;
  label: string;
  area: string | null;
  allowed: boolean;
  reason: EntitlementReason;
  message: string;
};

export type ClubCapabilities = {
  loading: boolean;
  /** `true` finche non si sa: una funzione non si nasconde mentre si carica. */
  unknown: boolean;
  plan: string;
  effectivePlan: string;
  subscriptionStatus: string;
  isPlatformAdmin: boolean;
  has: (key: string) => boolean;
  explain: (key: string) => CapabilityVerdict | null;
};

type Payload = {
  organizationId: string;
  plan: string;
  effectivePlan: string;
  subscriptionStatus: string;
  isPlatformAdmin: boolean;
  activeExtras: string[];
  features: CapabilityVerdict[];
};

/* La risposta cambia solo quando Cedi cambia il piano di quel club: si tiene per la durata della pagina. */
const cache = new Map<string, Payload>();

const EMPTY: ClubCapabilities = {
  loading: true,
  unknown: true,
  plan: "free",
  effectivePlan: "free",
  subscriptionStatus: "not_active",
  isPlatformAdmin: false,
  has: () => true,
  explain: () => null,
};

const CapabilityContext = createContext<ClubCapabilities>(EMPTY);

const buildCapabilities = (payload: Payload | null, loading: boolean): ClubCapabilities => {
  if (!payload) return { ...EMPTY, loading };
  const byKey = new Map(payload.features.map((item) => [item.key, item]));
  return {
    loading: false,
    unknown: false,
    plan: payload.plan,
    effectivePlan: payload.effectivePlan,
    subscriptionStatus: payload.subscriptionStatus,
    isPlatformAdmin: payload.isPlatformAdmin,
    /* Una funzione che il catalogo non conosce non si nasconde: nascondere per un nome scritto male toglierebbe una schermata senza dirlo a nessuno. */
    has: (key: string) => byKey.get(key)?.allowed ?? true,
    explain: (key: string) => byKey.get(key) || null,
  };
};

/** Legge gli entitlement del club attivo. Da usare dentro le pagine del club. */
export const useClubCapabilities = (): ClubCapabilities => {
  const inherited = useContext(CapabilityContext);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const organizationId = resolveActiveClubId();
    if (!organizationId) {
      setLoading(false);
      return;
    }
    const cached = cache.get(organizationId);
    if (cached) {
      setPayload(cached);
      setLoading(false);
      return;
    }
    const { data } = await apiRequest<Payload>(`/api/v1/entitlements?organization_id=${encodeURIComponent(organizationId)}`);
    if (data) {
      cache.set(organizationId, data);
      setPayload(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!inherited.unknown) return;
    void load();
  }, [inherited.unknown, load]);

  return useMemo(() => (inherited.unknown ? buildCapabilities(payload, loading) : inherited), [inherited, payload, loading]);
};

/** Rende disponibile un verdetto gia letto a tutta una sezione di pagina. */
export function ClubCapabilitiesProvider({ children }: { children: React.ReactNode }) {
  const capabilities = useClubCapabilities();
  return <CapabilityContext.Provider value={capabilities}>{children}</CapabilityContext.Provider>;
}

type CapabilityGateProps = {
  feature: string;
  children: React.ReactNode;
  /**
   * `explain` mostra il motivo ed e il valore giusto per una schermata intera;
   * `hide` e per un pulsante dentro un elenco, dove una spiegazione per riga
   * sarebbe rumore.
   */
  fallback?: "explain" | "hide";
};

/**
 * Mostra il contenuto solo se la societa puo usare quella funzione. Mentre il
 * verdetto si carica il contenuto **resta visibile**. Negato e da spiegare:
 * un blocco di avviso informativo (guideline 09 §9.6), non un riquadro
 * tratteggiato inventato.
 */
export function CapabilityGate({ feature, children, fallback = "explain" }: CapabilityGateProps) {
  const capabilities = useClubCapabilities();

  if (capabilities.loading || capabilities.has(feature)) {
    return <>{children}</>;
  }
  if (fallback === "hide") return null;

  const verdict = capabilities.explain(feature);
  return (
    <AlertBlock severity="info" title={verdict?.label || "Funzione non disponibile"} role="status">
      <span className="inline-flex items-start gap-1.5">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{verdict?.message || "Questa funzione non e attiva per la tua societa."}</span>
      </span>
    </AlertBlock>
  );
}
