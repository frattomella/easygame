"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Lock } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import { resolveActiveClubId } from "@/lib/active-club";
import type { EntitlementReason } from "@/lib/entitlements";

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
 * le funzioni: si legge una volta e si distribuisce. Una richiesta per
 * pulsante avrebbe rifatto lo stesso calcolo dieci volte per schermata.
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

/*
  La risposta cambia solo quando Cedi cambia il piano di quel club: tenerla
  per la durata della pagina evita una richiesta a ogni montaggio di un
  pulsante, e non rischia di mostrare uno stato vecchio per giorni.
*/
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

const buildCapabilities = (
  payload: Payload | null,
  loading: boolean,
): ClubCapabilities => {
  if (!payload) {
    return { ...EMPTY, loading };
  }

  const byKey = new Map(payload.features.map((item) => [item.key, item]));

  return {
    loading: false,
    unknown: false,
    plan: payload.plan,
    effectivePlan: payload.effectivePlan,
    subscriptionStatus: payload.subscriptionStatus,
    isPlatformAdmin: payload.isPlatformAdmin,
    /*
      Una funzione che il catalogo non conosce non si nasconde: nascondere per
      un nome scritto male toglierebbe una schermata senza dirlo a nessuno.
    */
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

    const { data } = await apiRequest<Payload>(
      `/api/v1/entitlements?organization_id=${encodeURIComponent(organizationId)}`,
    );

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

  return useMemo(
    () => (inherited.unknown ? buildCapabilities(payload, loading) : inherited),
    [inherited, payload, loading],
  );
};

/** Rende disponibile un verdetto gia letto a tutta una sezione di pagina. */
export function ClubCapabilitiesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const capabilities = useClubCapabilities();
  return (
    <CapabilityContext.Provider value={capabilities}>
      {children}
    </CapabilityContext.Provider>
  );
}

type CapabilityGateProps = {
  feature: string;
  children: React.ReactNode;
  /**
   * Cosa fare quando la funzione non c'e.
   *
   * `explain` mostra il motivo ed e il valore giusto per una schermata
   * intera: sparire senza dire niente lascia chi guarda a chiedersi dove sia
   * finita. `hide` e per un pulsante dentro un elenco, dove una spiegazione
   * per riga sarebbe rumore.
   */
  fallback?: "explain" | "hide";
};

/**
 * Mostra il contenuto solo se la societa puo usare quella funzione.
 *
 * Mentre il verdetto si carica il contenuto **resta visibile**: far sparire e
 * ricomparire i pulsanti a ogni caricamento e peggio di un `403` raro.
 */
export function CapabilityGate({
  feature,
  children,
  fallback = "explain",
}: CapabilityGateProps) {
  const capabilities = useClubCapabilities();

  if (capabilities.loading || capabilities.has(feature)) {
    return <>{children}</>;
  }

  if (fallback === "hide") {
    return null;
  }

  const verdict = capabilities.explain(feature);

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-slate-300 p-4 text-sm sm:flex-row sm:items-center sm:gap-3">
      <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-medium">
          {verdict?.label || "Funzione non disponibile"}
        </p>
        <p className="text-muted-foreground">
          {verdict?.message ||
            "Questa funzione non e attiva per la tua societa."}
        </p>
      </div>
    </div>
  );
}
