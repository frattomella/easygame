"use client";

import * as React from "react";
import { Copy, KeyRound, RefreshCw, Unlink2 } from "lucide-react";
import { Panel, PanelHeader, InsetBlock, Eyebrow } from "@/components/web/primitives/Surface";
import { Button } from "@/components/web/primitives/Button";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { Skeleton } from "@/components/web/primitives/Controls";
import { InfoCard } from "@/components/web/page/Cards";
import { CollapsedSection } from "@/components/web/record/Record";
import { ConfirmDialog } from "@/components/web/overlays/Modal";
import { formatDateTime, MISSING, orMissing } from "@/lib/web/format";
import {
  formatTrainerAccessToken,
  type TrainerAccessMeta,
} from "@/components/trainer/v2/trainer-record-model";

/**
 * «Accesso EasyGame» della scheda allenatore: il token temporaneo, il suo
 * stato, e l'utenza collegata. Stesse chiamate della V1 — la generazione
 * scrive `access_tokens` e il record, lo scollegamento passa dalla rotta
 * dedicata `DELETE /api/v1/trainer-accounts/:id` (ADR-0110).
 *
 * La V1 aveva due pulsanti («Scollega Account» e «Scollega tutti gli
 * account») con lo stesso gestore: qui ne resta uno.
 */
export function TrainerAccessPanel({
  trainer,
  access,
  tokenDetails,
  linkedAccountDetails,
  linkedMembershipDetails,
  loadingDetails,
  generating,
  disconnecting,
  onGenerate,
  onCopy,
  onDisconnect,
}: {
  trainer: any;
  access: TrainerAccessMeta;
  tokenDetails: any | null;
  linkedAccountDetails: any | null;
  linkedMembershipDetails: any | null;
  loadingDetails: boolean;
  generating: boolean;
  disconnecting: boolean;
  onGenerate: () => Promise<void>;
  onCopy: () => Promise<boolean>;
  onDisconnect: () => Promise<void>;
}) {
  const [confirmRegenerate, setConfirmRegenerate] = React.useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false);

  const linkedUserId = trainer?.linkedUserId || trainer?.linked_user_id || null;
  const hasToken = Boolean(trainer?.accessTokenValue);
  const hasActiveToken =
    hasToken && String(trainer?.accessTokenStatus || "").toLowerCase() !== "expired" && !linkedUserId;

  const tokenStatusLabel = orMissing(String(tokenDetails?.status || trainer?.accessTokenStatus || "").trim());
  const tokenExpiry = tokenDetails?.expires_at || tokenDetails?.date || trainer?.accessTokenExpiresAt || null;

  const metadata = linkedAccountDetails?.user_metadata || {};
  const linkedAccountName =
    [metadata.firstName, metadata.lastName].filter(Boolean).join(" ").trim() ||
    String(metadata.name || "").trim() ||
    String(linkedAccountDetails?.email || trainer?.linkedUserEmail || "").trim() ||
    MISSING;
  const linkedAccountPhone = String(linkedAccountDetails?.phone || metadata.phone || "").trim() || MISSING;

  const stats: Array<{ label: string; value: React.ReactNode; mono?: boolean }> = [
    { label: "Token attuale", value: formatTrainerAccessToken(trainer?.accessTokenValue), mono: true },
    { label: "Stato token", value: <span className="capitalize">{tokenStatusLabel}</span> },
    { label: "Scadenza", value: formatDateTime(tokenExpiry) },
    { label: "Ultimo collegamento", value: formatDateTime(trainer?.linkedAt) },
  ];

  const accountFields: Array<{ label: string; value: React.ReactNode }> = [
    { label: "Nome account", value: linkedAccountName },
    { label: "Email", value: linkedAccountDetails?.email || trainer?.linkedUserEmail || MISSING },
    { label: "Telefono", value: linkedAccountPhone },
    { label: "ID account", value: <span className="break-all">{linkedUserId || MISSING}</span> },
    { label: "Ruolo nel club", value: <span className="capitalize">{linkedMembershipDetails?.role || "trainer"}</span> },
    { label: "Membership creata il", value: formatDateTime(linkedMembershipDetails?.created_at) },
    { label: "Account creato il", value: formatDateTime(linkedAccountDetails?.created_at) },
    { label: "Token generato il", value: formatDateTime(trainer?.accessTokenGeneratedAt) },
    { label: "Token riscattato il", value: formatDateTime(trainer?.accessTokenRedeemedAt) },
  ];

  return (
    <>
      <Panel as="section" data-test="trainer-access-panel">
        <PanelHeader
          eyebrow="Accesso EasyGame"
          title="Accesso account allenatore"
          description="Da qui il club gestisce il collegamento tra il profilo allenatore e l'account EasyGame personale dell'allenatore."
          actions={<StatusPill status={access.status} />}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <InsetBlock key={stat.label}>
              <Eyebrow className="mb-2">{stat.label}</Eyebrow>
              <p className={stat.mono ? "egw-num font-brand text-[15px] font-bold text-egw-ink" : "font-brand text-[13px] font-semibold text-egw-ink"}>
                {stat.value}
              </p>
            </InsetBlock>
          ))}
        </div>

        <InfoCard eyebrow={access.label} className="mt-4">
          {access.description}
        </InfoCard>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Button
            variant="neutral"
            icon={hasToken ? <RefreshCw /> : <KeyRound />}
            loading={generating}
            onClick={() => {
              if (hasActiveToken) setConfirmRegenerate(true);
              else void onGenerate();
            }}
          >
            {hasToken ? "Rigenera token" : "Genera token"}
          </Button>
          {hasToken ? (
            <Button variant="secondary" icon={<Copy />} onClick={() => void onCopy()}>
              Copia token
            </Button>
          ) : null}
          {linkedUserId ? (
            <Button variant="danger" icon={<Unlink2 />} loading={disconnecting} onClick={() => setConfirmDisconnect(true)}>
              Scollega account
            </Button>
          ) : null}
        </div>
      </Panel>

      <CollapsedSection
        id="linked-account"
        recordType="allenatore"
        title="Account collegato"
        summary={linkedUserId ? linkedAccountName : "Nessun account collegato"}
        actions={loadingDetails ? <Skeleton className="h-3 w-16" /> : null}
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-[18px] sm:grid-cols-2 lg:grid-cols-3">
          {accountFields.map((field) => (
            <div key={field.label} className="min-w-0">
              <dt className="font-brand text-[12px] text-[rgba(11,26,58,.55)]">{field.label}</dt>
              <dd className="mt-1 break-words font-brand text-[13.5px] text-egw-ink">{field.value}</dd>
            </div>
          ))}
        </dl>
      </CollapsedSection>

      <ConfirmDialog
        open={confirmRegenerate}
        onOpenChange={setConfirmRegenerate}
        title="Rigenerare il token?"
        description="Esiste già un token attivo per questo allenatore. Rigenerarlo invalida quello precedente: chi lo aveva ricevuto non potrà più usarlo."
        confirmLabel="Rigenera"
        loading={generating}
        onConfirm={async () => {
          await onGenerate();
          setConfirmRegenerate(false);
        }}
      />

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Scollegare questo account?"
        description="La scheda allenatore dimenticherà l'utenza collegata, ma il suo accesso al club non viene toccato: per revocarlo usa la Gestione accessi. Se servirà, potrai poi generare un nuovo token da qui."
        confirmLabel="Conferma scollegamento"
        tone="danger"
        loading={disconnecting}
        onConfirm={async () => {
          try {
            await onDisconnect();
            setConfirmDisconnect(false);
          } catch {
            // La scheda ha gia avvisato con il toast: il modale resta aperto.
          }
        }}
      />
    </>
  );
}
