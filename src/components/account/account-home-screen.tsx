"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { fetchMemberships } from "@/lib/auth/memberships-client";
import { classifyMembershipResponse } from "@/lib/auth/membership-load-result";
import { getAccessRedirectPath, getAccessRoleLabel } from "@/lib/access-roles";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Crown,
  Loader2,
  LogOut,
  Plus,
  RotateCw,
  Search,
  Trash2,
  TriangleAlert,
  UserCircle2,
  UserPlus,
  Users,
} from "lucide-react";
import { AccountCreateClubDialog } from "./account-create-club-dialog";
import { AccountProfileDialog } from "./account-profile-dialog";
import { AccountRedeemAccessDialog } from "./account-redeem-access-dialog";
import {
  AccountClub,
  buildClubPayload,
  ClubCreateFormState,
  CREATE_CLUB_REQUIRED_FIELDS,
  createClubDefaults,
  createProfileDefaults,
  getInitials,
  mapMembershipToClub,
  MembershipRecord,
  ProfileFormState,
  sortClubs,
  type LinkedProfile,
} from "./account-shared";
import { EasyGameWordmark } from "@/components/brand/easygame-logo";

/**
 * Home account: la porta d'ingresso a tutti i club di una persona.
 *
 * Rifatta con l'identita introdotta dal Blocco 3 (marchio SVG, `font-display`,
 * palette slate, cifre tabellari). La versione precedente viveva su una
 * tavolozza tutta sua, scritta in esadecimale dentro le classi: nessuno degli
 * altri schermi la usava, e ogni modifica al tema non la raggiungeva.
 *
 * Le tre cose che questa pagina deve fare bene:
 *
 * 1. **far scegliere in fretta** — con molti accessi serve un filtro, il ruolo
 *    va letto a colpo d'occhio e il club aperto per ultimo va riconosciuto;
 * 2. **dire la verita mentre carica** — lo scheletro ha la forma del
 *    contenuto, non e uno spinner a tutta pagina; un errore di rete non viene
 *    mostrato come "nessun club";
 * 3. **stare in 375 px** — le righe si impilano, i comandi restano da dito.
 */

const ACCOUNT_HERO_IMAGE = "/images/account/account-hero.png";

/** Oltre questa soglia cercare e piu veloce che scorrere. */
const SEARCH_THRESHOLD = 5;

const getAccountFirstName = (displayName: string) =>
  displayName.split(" ").filter(Boolean)[0] || "EasyGamer";

const matchesQuery = (club: AccountClub, query: string) => {
  if (!query) return true;
  const needle = query.trim().toLowerCase();
  return [club.name, club.city, club.province, club.roleLabel]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
};

// --- pezzi di interfaccia ----------------------------------------------------

/**
 * **Come si chiama il legame**, che non e lo stesso per tutti.
 *
 * «Tutore di» per i figli, «La tua scheda» per la propria, «Scheda"
 * allenatore» per quella dell'allenatore. Un'etichetta sola per tre cose
 * diverse sarebbe stata piu corta e avrebbe detto meno.
 */
function etichettaProfili(profili: LinkedProfile[]) {
  const tipi = new Set(profili.map((profilo) => profilo.kind));

  if (tipi.size === 1 && tipi.has("guardian")) {
    return profili.length === 1 ? "Tutore di" : "Tutore di";
  }
  if (tipi.size === 1 && tipi.has("athlete")) return "La tua scheda";
  if (tipi.size === 1 && tipi.has("trainer")) return "Scheda allenatore";

  return "Profili collegati";
}

function ClubAvatar({ club }: { club: AccountClub }) {
  return (
    <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white">
      {club.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo caricato dal club, spesso una data URL
        <img
          src={club.logoUrl}
          alt=""
          className="h-full w-full object-contain p-1"
        />
      ) : (
        <span className="font-display text-sm font-semibold text-slate-500">
          {getInitials(club.name)}
        </span>
      )}
    </span>
  );
}

/**
 * L'avviso di un recapito non verificato, con il gesto che lo risolve.
 *
 * Un componente solo per i due canali: il telefono e l'email hanno lo stesso
 * problema — «questo recapito non e provato» — e due riquadri scritti a mano
 * sarebbero divergiti alla prima modifica. Nessuna tavolozza propria: i colori
 * sono quelli gia usati dagli altri avvisi di questa pagina.
 *
 * A 375 px il pulsante va a capo sotto il testo (`flex-wrap`), come l'avviso
 * di errore delle membership qui sotto.
 */
function VerificationNotice({
  tone,
  title,
  description,
  ctaLabel,
  pending,
  open,
  onAction,
  onConfirm,
  onResend,
}: {
  tone: "warning" | "info";
  title: string;
  description: string;
  ctaLabel: string;
  pending: boolean;
  /** Se la casella del codice e aperta: il codice e gia partito. */
  open: boolean;
  onAction: () => void;
  onConfirm: (code: string) => void;
  onResend: () => void;
}) {
  const [code, setCode] = useState("");
  const palette =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div
      className={cn("rounded-xl border px-4 py-3 text-sm", palette)}
      role="status"
    >
      <div className="flex flex-wrap items-center gap-3">
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          <p className="text-xs opacity-90">{description}</p>
        </div>
        {open ? null : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={onAction}
          >
            {pending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : null}
            {ctaLabel}
          </Button>
        )}
      </div>

      {open ? (
        /*
          A colonna singola sotto i 640 px e in riga sopra: a 375 px un campo
          codice accanto a due pulsanti lascerebbe al campo una manciata di
          pixel, ed e la larghezza in cui va scritta la cosa piu importante
          della schermata.
        */
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm(code.trim());
          }}
        >
          <label className="sr-only" htmlFor={`verification-code-${tone}`}>
            Codice di verifica
          </label>
          <Input
            id={`verification-code-${tone}`}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="Codice a 6 cifre"
            className="sm:max-w-[180px]"
          />
          <Button type="submit" size="sm" disabled={pending || !code.trim()}>
            {pending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : null}
            Conferma
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={onResend}
          >
            Rimanda il codice
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function RoleBadge({ ownerMode, label }: { ownerMode: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        // L'ambra qui dice "sei tu il proprietario", non "stagione": da quando
        // il token della stagione e grigio (Blocco 7) va scritto per esteso.
        ownerMode
          ? "bg-amber-50 text-amber-700"
          : "bg-[var(--eg-blue-soft)] text-[var(--eg-blue)]",
      )}
    >
      {ownerMode ? (
        <Crown className="h-3 w-3" aria-hidden />
      ) : (
        <Users className="h-3 w-3" aria-hidden />
      )}
      {ownerMode ? "Proprieta" : label}
    </span>
  );
}

function ClubRow({
  club,
  ownerMode,
  isActive,
  isSwitching,
  isDeleting,
  onOpen,
  onDelete,
}: {
  club: AccountClub;
  ownerMode: boolean;
  isActive: boolean;
  isSwitching: boolean;
  isDeleting: boolean;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const place = [club.city, club.province].filter(Boolean).join(", ");

  return (
    <li className="flex items-stretch gap-1 rounded-xl border border-slate-200 bg-white transition-colors hover:border-blue-300">
      <button
        type="button"
        onClick={onOpen}
        disabled={isSwitching}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <ClubAvatar club={club} />

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-display font-semibold tracking-tight text-slate-900">
              {club.name}
            </span>
            {isActive ? (
              <span className="eg-eyebrow-sm rounded bg-slate-900 px-1.5 py-0.5 leading-none text-white">
                Aperto
              </span>
            ) : null}
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <RoleBadge ownerMode={ownerMode} label={club.roleLabel} />
            {place ? (
              <span className="truncate text-xs text-slate-500">{place}</span>
            ) : null}
            {club.activeSeasonLabel ? (
              <span className="eg-tabular text-xs text-[var(--eg-season)]">
                {club.activeSeasonLabel}
              </span>
            ) : null}
          </span>

          {/*
            **Chi sei dentro questo club** (P0 «pagina Account»).

            La card diceva dove puoi entrare e con quale ruolo, e non chi
            sei li dentro: un genitore leggeva «Genitore» e non i nomi dei
            figli, un atleta non vedeva la propria scheda, un allenatore non
            vedeva la propria. Il legame c'era da sempre — e cio che decide
            dove il browser puo andare — e nessuna schermata lo diceva.

            Sta **sotto** il ruolo e non accanto: e la risposta a una
            seconda domanda, e su 375 px accanto non ci sta.
          */}
          {club.linkedProfiles?.length ? (
            <span
              className="mt-1 flex w-full min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 text-xs text-slate-600"
              data-testid="profili-collegati"
            >
              <span className="shrink-0 text-slate-400">
                {etichettaProfili(club.linkedProfiles)}
              </span>
              {/*
                I nomi **vanno a capo**, non in ellissi: un elenco di figli
                troncato a 375 px risponde meta domanda, e un nodo che non
                va a capo alza la larghezza minima di tutta la colonna della
                griglia — la pagina finiva per scorrere in orizzontale.
              */}
              <span className="min-w-0 break-words font-medium text-slate-700">
                {club.linkedProfiles.map((profilo) => profilo.name).join(", ")}
              </span>
            </span>
          ) : null}
        </span>

        <span className="grid h-8 w-8 shrink-0 place-items-center text-slate-400">
          {isSwitching ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ChevronRight className="h-5 w-5" aria-hidden />
          )}
        </span>
      </button>

      {!ownerMode && onDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="my-2 mr-2 h-10 w-10 shrink-0 self-center text-slate-400 hover:bg-red-50 hover:text-red-600"
          disabled={isDeleting}
          onClick={onDelete}
          aria-label={`Elimina l'accesso ${club.roleLabel} a ${club.name}`}
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="h-4 w-4" aria-hidden />
          )}
        </Button>
      ) : null}
    </li>
  );
}

function PanelSkeleton() {
  return (
    <ul className="space-y-2" aria-hidden>
      {[0, 1, 2].map((index) => (
        <li
          key={`skeleton-${index}`}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
        >
          <span className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-slate-100" />
          <span className="flex-1 space-y-2">
            <span className="block h-3.5 w-2/5 animate-pulse rounded bg-slate-100" />
            <span className="block h-3 w-1/4 animate-pulse rounded bg-slate-100" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function PanelEmptyState({
  ownerMode,
  filtered,
  onAction,
}: {
  ownerMode: boolean;
  filtered: boolean;
  onAction: () => void;
}) {
  if (filtered) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        Nessun club corrisponde alla ricerca.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-7 text-center">
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-white text-slate-400">
        {ownerMode ? (
          <Building2 className="h-5 w-5" aria-hidden />
        ) : (
          <UserPlus className="h-5 w-5" aria-hidden />
        )}
      </span>
      <p className="mt-3 font-medium text-slate-900">
        {ownerMode
          ? "Non hai ancora creato un club"
          : "Nessun accesso assegnato"}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
        {ownerMode
          ? "Crea il tuo club: bastano nome, sede e contatti, il resto si completa dopo."
          : "Se una societa ti ha invitato, inserisci il token che ti ha condiviso."}
      </p>
      <Button type="button" variant="outline" className="mt-4" onClick={onAction}>
        {ownerMode ? "Crea un club" : "Inserisci un token"}
      </Button>
    </div>
  );
}

function AccessPanel({
  ownerMode,
  title,
  description,
  actionLabel,
  clubs,
  loading,
  filtered,
  activeClubId,
  switchingClubId,
  deletingAccessKey,
  slotLabel,
  onAction,
  onOpenClub,
  onDeleteClub,
}: {
  ownerMode: boolean;
  title: string;
  description: string;
  actionLabel: string;
  clubs: AccountClub[];
  loading: boolean;
  filtered: boolean;
  activeClubId: string | null;
  switchingClubId: string | null;
  deletingAccessKey: string | null;
  slotLabel?: string;
  onAction: () => void;
  onOpenClub: (club: AccountClub) => void;
  onDeleteClub?: (club: AccountClub) => void;
}) {
  return (
    <section
      id={ownerMode ? "owned-clubs" : "assigned-clubs"}
      className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-slate-900">
            {ownerMode ? (
              <Crown className="h-4 w-4 text-amber-700" aria-hidden />
            ) : (
              <Users className="h-4 w-4 text-[var(--eg-blue)]" aria-hidden />
            )}
            {title}
            <span className="eg-tabular rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
              {clubs.length}
            </span>
          </h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
          {slotLabel ? (
            <p className="mt-1 text-xs text-slate-400">{slotLabel}</p>
          ) : null}
        </div>

        <Button type="button" size="sm" className="shrink-0" onClick={onAction}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          {actionLabel}
        </Button>
      </div>

      <div className="mt-4">
        {loading ? (
          <PanelSkeleton />
        ) : clubs.length ? (
          <ul className="space-y-2">
            {clubs.map((club) => (
              <ClubRow
                key={club.accessKey || `${club.id}:${club.role}`}
                club={club}
                ownerMode={ownerMode}
                isActive={activeClubId === club.id}
                isSwitching={switchingClubId === club.id}
                isDeleting={
                  deletingAccessKey === (club.accessKey || club.membershipId)
                }
                onOpen={() => onOpenClub(club)}
                onDelete={
                  !ownerMode && onDeleteClub ? () => onDeleteClub(club) : undefined
                }
              />
            ))}
          </ul>
        ) : (
          <PanelEmptyState
            ownerMode={ownerMode}
            filtered={filtered}
            onAction={onAction}
          />
        )}
      </div>
    </section>
  );
}

// --- schermata ---------------------------------------------------------------

export default function AccountHomeScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user, loading, activeClub, setActiveClub, signOut } = useAuth();

  const [savingProfile, setSavingProfile] = useState(false);
  const [creatingClub, setCreatingClub] = useState(false);
  const [redeemingAccess, setRedeemingAccess] = useState(false);
  const [switchingClubId, setSwitchingClubId] = useState<string | null>(null);
  const [deletingAccessKey, setDeletingAccessKey] = useState<string | null>(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [createClubOpen, setCreateClubOpen] = useState(false);
  const [redeemAccessOpen, setRedeemAccessOpen] = useState(false);

  const [profileForm, setProfileForm] = useState<ProfileFormState>(
    createProfileDefaults(null),
  );
  const [createClubForm, setCreateClubForm] = useState<ClubCreateFormState>(
    createClubDefaults(null),
  );
  const [createClubTab, setCreateClubTab] = useState<
    "general" | "fiscal" | "bank" | "contacts" | "federation" | "social"
  >("general");
  const [accessToken, setAccessToken] = useState("");
  const [query, setQuery] = useState("");

  const [ownedClubs, setOwnedClubs] = useState<AccountClub[]>([]);
  const [accessClubs, setAccessClubs] = useState<AccountClub[]>([]);
  const [membershipsStatus, setMembershipsStatus] = useState<
    "loading" | "error" | "loaded"
  >("loading");
  const [membershipsError, setMembershipsError] = useState<string | null>(null);
  const [hasLoadedMemberships, setHasLoadedMemberships] = useState(false);
  const [membershipsLoading, setMembershipsLoading] = useState(false);

  const clubSlotLimit = useMemo(() => {
    const rawLimit = Number(user?.user_metadata?.clubSlotLimit);
    return Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : null;
  }, [user?.user_metadata?.clubSlotLimit]);

  const activeClubId = activeClub?.id || null;
  const availableClubSlots =
    clubSlotLimit === null ? null : Math.max(clubSlotLimit - ownedClubs.length, 0);
  const [verificatoOra, setVerificatoOra] = useState<Array<"email" | "phone">>(
    [],
  );
  const emailVerified =
    Boolean(user?.user_metadata?.emailVerified) ||
    verificatoOra.includes("email");
  const phoneVerified =
    Boolean(user?.user_metadata?.phoneVerified) ||
    verificatoOra.includes("phone");

  /*
    **La verifica si completa qui, non altrove.**

    La tentazione era mandare a `/token-verification/<id>`, che dal nome sembra
    la pagina giusta: **non lo e**. Quella schermata riscatta il gettone di
    accesso a un club — cinque, otto o dieci caselle — e non sa niente di OTP.
    Mandarci una persona che deve confermare l'email avrebbe prodotto il difetto
    piu comune di questo repository (CLAUDE.md §11, punto 8): un flusso che
    sembra collegato e finisce sul consumer sbagliato.

    Il codice si scrive quindi dentro l'avviso stesso, dove la persona sta gia
    guardando, e la conferma ricarica la sessione: `emailVerified` e
    `phoneVerified` vengono dal server, quindi l'avviso sparisce da solo quando
    e vero che deve sparire.
  */
  const [verificationSending, setVerificationSending] = useState<
    "email" | "phone" | null
  >(null);
  const [verificationOpen, setVerificationOpen] = useState<
    "email" | "phone" | null
  >(null);

  /**
   * **Chi non ha una password non deve restare fuori dai propri recapiti.**
   *
   * Due popolazioni non conoscono nessuna password del proprio account: chi si
   * e registrato **solo** con Google o Microsoft — `createOAuthBootstrapUser`
   * ne scrive una casuale — e chi ha appena subito uno **sfratto** (ADR-0134),
   * a cui la password e stata sostituita proprio per chiudere fuori un
   * occupante. Entrambe si scontrano con `CURRENT_PASSWORD_REQUIRED` e non
   * possono aggiungere il cellulare, che il prodotto dichiara obbligatorio.
   *
   * La via d'uscita esiste gia ed e il recupero password, che manda un link
   * **all'indirizzo dell'account**: qui c'e solo il pulsante che la rende
   * raggiungibile, invece di lasciarla indovinare. Non apre nessuna strada
   * nuova — chiunque puo chiedere quel link dalla pagina di accesso — e non
   * cambia niente della difesa: la password si imposta **dalla casella**, non
   * dalla sessione.
   */
  const [sendingPasswordLink, setSendingPasswordLink] = useState(false);

  const requestPasswordLink = async () => {
    const indirizzo = String(user?.email || "").trim();
    if (!indirizzo || sendingPasswordLink) return;
    setSendingPasswordLink(true);

    const response = await apiRequest<{ sent: boolean }>(
      "/api/v1/auth/password/forgot",
      { method: "POST", body: { email: indirizzo } },
    );

    setSendingPasswordLink(false);

    /*
      La rotta risponde sempre allo stesso modo — e la sua regola
      anti-enumeration — quindi qui non c'e niente da distinguere: si dice cosa
      succedera, non cosa e successo.
    */
    showToast(
      response.error ? "error" : "success",
      response.error
        ? response.error.message || "Invio non riuscito"
        : `Se serve, ti abbiamo scritto a ${indirizzo}: apri il link per impostare una password.`,
    );
  };

  const requestVerificationCode = async (channel: "email" | "phone") => {
    if (!user?.id || verificationSending) return;
    setVerificationSending(channel);

    /*
      **Non `fetch`**: la regola di trasporto e `@/lib/api/client` (CLAUDE.md
      §2), gia importato qui. L'identificativo e `user.id`: le rotte accettano
      sia il riferimento opaco della registrazione sia l'identificativo, e qui
      la sessione c'e gia — non si sta rivelando niente che chi chiama non
      sappia di se stesso.
    */
    const response = await apiRequest<{ sent: boolean }>(
      `/api/v1/auth/verify/${channel}/send`,
      {
        method: "POST",
        body: { userId: user.id },
      },
    );

    setVerificationSending(null);

    if (response.error) {
      showToast("error", response.error.message || "Invio non riuscito");
      /*
        Anche quando l'invio e rifiutato per il cooldown la casella si apre: il
        codice precedente e ancora buono, e chiudere la casella costringerebbe
        ad aspettare un minuto per scrivere un codice che si ha gia in mano.
      */
      if (response.error.code !== "RESEND_TOO_SOON") return;
    } else {
      showToast(
        "success",
        channel === "email"
          ? "Ti abbiamo inviato un codice via email."
          : "Ti abbiamo inviato un codice via SMS.",
      );
    }

    setVerificationOpen(channel);
  };

  const confirmVerificationCode = async (
    channel: "email" | "phone",
    code: string,
  ) => {
    if (!user?.id) return;
    setVerificationSending(channel);

    const response = await apiRequest<{ user: unknown }>(
      `/api/v1/auth/verify/${channel}/confirm`,
      {
        method: "POST",
        body: { userId: user.id, code },
      },
    );

    setVerificationSending(null);

    if (response.error) {
      showToast("error", response.error.message || "Codice non valido");
      return;
    }

    setVerificationOpen(null);
    /*
      Il segno locale, e non una riscrittura di `user`: `AuthProvider` non
      espone un ricaricamento della sessione e **non e un file di questa lane**
      (contratto di ownership parallelo), quindi non gli si aggiunge un metodo
      qui. Il segno vale finche la pagina resta aperta; al caricamento
      successivo l'avviso lo decide di nuovo il server, che e la fonte vera.
    */
    setVerificatoOra((precedente) => [...precedente, channel]);
    showToast(
      "success",
      channel === "email" ? "Email verificata" : "Telefono verificato",
    );
  };
  const accountDisplayName =
    [profileForm.firstName, profileForm.lastName].filter(Boolean).join(" ") ||
    user?.user_metadata?.name ||
    user?.email ||
    "Utente EasyGame";

  const syncActiveClubLocally = (club: AccountClub) => {
    const isSelectedAccess = (item: AccountClub) =>
      club.accessKey
        ? item.accessKey === club.accessKey
        : item.id === club.id && item.role === club.role;
    const nextActiveClub = {
      id: club.id,
      role: club.role,
      roleLabel: club.roleLabel,
      name: club.name,
      logo_url: club.logoUrl || null,
      email: club.contactEmail || null,
      phone: club.contactPhone || null,
      membershipId: club.membershipId || null,
      accessKind: club.accessKind || "membership",
      accessKey: club.accessKey || null,
      activeSeasonId: club.activeSeasonId || null,
      activeSeasonLabel: club.activeSeasonLabel || null,
      linkedAthleteId: club.linkedAthleteId || null,
      linkedAthleteIds: club.linkedAthleteIds || [],
      redirectPath: club.redirectPath || null,
    };

    if (typeof window !== "undefined") {
      window.localStorage.setItem("activeClub", JSON.stringify(nextActiveClub));
      if (user?.id) {
        window.localStorage.setItem(
          `activeClub_${user.id}`,
          JSON.stringify(nextActiveClub),
        );
      }
    }

    setOwnedClubs((current) =>
      sortClubs(
        current.map((item) => ({ ...item, isPrimary: isSelectedAccess(item) })),
      ),
    );
    setAccessClubs((current) =>
      sortClubs(
        current.map((item) => ({ ...item, isPrimary: isSelectedAccess(item) })),
      ),
    );
    setActiveClub(nextActiveClub);
  };

  const loadMemberships = async (silent = false) => {
    if (!user?.id) {
      setOwnedClubs([]);
      setAccessClubs([]);
      setHasLoadedMemberships(false);
      setMembershipsStatus("loading");
      setMembershipsLoading(false);
      return;
    }

    setMembershipsLoading(true);
    if (!hasLoadedMemberships && !silent) {
      setMembershipsStatus("loading");
    }
    setMembershipsError(null);

    try {
      const response = await fetchMemberships<MembershipRecord>(user.id);
      const result = classifyMembershipResponse(response);

      if (result.kind === "aborted" || result.kind === "unauthorized") {
        return;
      }

      if (result.kind === "error") {
        showToast("error", result.message);
        // Un errore temporaneo non equivale ad avere zero club: manteniamo i
        // dati gia caricati e distinguiamo "error" da "loaded-empty".
        setMembershipsError(result.message);
        setMembershipsStatus("error");
        return;
      }

      const mappedClubs = sortClubs(
        result.memberships.map((membership) =>
          mapMembershipToClub(membership, user.id),
        ),
      );

      setOwnedClubs(
        mappedClubs
          .filter((club) => club.accessKind === "ownership")
          .map(({ ownerId, ...club }) => club),
      );
      setAccessClubs(
        mappedClubs
          .filter(
            (club) =>
              club.accessKind !== "ownership" &&
              !(club.role === "owner" && club.ownerId === user.id),
          )
          .map(({ ownerId, ...club }) => club),
      );

      setMembershipsStatus("loaded");
      setHasLoadedMemberships(true);
    } finally {
      setMembershipsLoading(false);
    }
  };

  useEffect(() => {
    if (loading) return;

    if (!user?.id) {
      router.replace("/login");
      return;
    }

    setProfileForm(createProfileDefaults(user));
    setCreateClubForm(createClubDefaults(user));
  }, [loading, router, user]);

  useEffect(() => {
    // Attendiamo la validazione della sessione lato server: senza questo
    // controllo partirebbe una richiesta protetta basata solo sulla cache.
    if (loading || !user?.id) return;
    void loadMemberships();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("openCreateClub") === "1") {
      setCreateClubOpen(true);
      window.history.replaceState({}, "", "/account");
    }
    /*
      **«Profilo» apre il profilo, non una pagina da cui cercarlo** (PP-01 §J).

      La voce «Profilo» del menu utente portava a `/profile/[userId]`, che e la
      seconda superficie: mostrava meno campi, non permetteva di cambiare
      l'indirizzo, scriveva l'immagine in una colonna **che non esiste**, e per
      cinque ruoli su sette rispondeva 403. Adesso porta qui, e questo parametro
      apre direttamente il dialogo invece di lasciare la persona davanti
      all'elenco dei club a cercarlo in un menu.
    */
    if (params.get("profile") === "1") {
      setProfileOpen(true);
      window.history.replaceState({}, "", "/account");
    }
  }, []);

  const updateProfileField = (field: keyof ProfileFormState, value: string) => {
    setProfileForm((current) => ({ ...current, [field]: value }));
  };

  const updateClubField = (field: keyof ClubCreateFormState, value: any) => {
    setCreateClubForm((current) => ({ ...current, [field]: value }));
  };

  const updateFederation = (
    federationId: string,
    field: "name" | "registrationNumber" | "affiliationDate",
    value: string,
  ) => {
    setCreateClubForm((current) => ({
      ...current,
      federations: current.federations.map((item) =>
        item.id === federationId ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const addFederation = () => {
    setCreateClubForm((current) => ({
      ...current,
      federations: [
        ...current.federations,
        {
          id: `fed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: "",
          registrationNumber: "",
          affiliationDate: "",
        },
      ],
    }));
  };

  const removeFederation = (federationId: string) => {
    setCreateClubForm((current) => ({
      ...current,
      federations: current.federations.filter((item) => item.id !== federationId),
    }));
  };

  const persistActiveClub = async (club: AccountClub) => {
    setSwitchingClubId(club.id);

    const response = await apiRequest<MembershipRecord>(
      "/api/v1/auth/memberships/activate",
      {
        method: "POST",
        body: {
          organization_id: club.id,
          role: club.role,
          membership_id:
            club.accessKind === "ownership"
              ? undefined
              : club.membershipId || undefined,
          access_kind: club.accessKind || "membership",
        },
      },
    );

    if (response.error) {
      setSwitchingClubId(null);
      throw new Error(
        response.error.message || "Impossibile impostare il club attivo",
      );
    }

    const activatedRole = String(
      response.data?.resolved_role || response.data?.role || club.role,
    );
    const activatedClub: AccountClub = {
      ...club,
      role: activatedRole,
      roleLabel: getAccessRoleLabel(activatedRole),
      linkedAthleteId: response.data?.linked_athlete_id || null,
      linkedAthleteIds: response.data?.linked_athlete_ids || [],
      redirectPath: response.data?.redirect_path || null,
    };

    syncActiveClubLocally(activatedClub);
    setSwitchingClubId(null);

    return { ...response.data, activatedClub };
  };

  const openClubArea = async (club: AccountClub) => {
    try {
      const activatedAccess = await persistActiveClub(club);
      const redirectPath = getAccessRedirectPath(
        activatedAccess?.resolved_role || activatedAccess?.role || club.role,
        {
          organizationId: club.id,
          linkedAthleteId: activatedAccess?.linked_athlete_id,
          linkedAthleteIds: activatedAccess?.linked_athlete_ids,
        },
      );

      if (redirectPath === "/account") {
        showToast(
          "error",
          "Accesso attivato, ma il profilo collegato non è disponibile",
        );
        return;
      }

      router.push(redirectPath);
    } catch (error: any) {
      showToast("error", error?.message || "Errore cambio club attivo");
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (profileForm.newPassword !== profileForm.confirmPassword) {
      showToast("error", "Le password non coincidono");
      return;
    }

    setSavingProfile(true);

    const emailChanged =
      profileForm.email.trim().toLowerCase() !==
      String(user?.email || "").toLowerCase();
    const phoneChanged =
      profileForm.phone.trim() !== String(user?.user_metadata?.phone || "");

    /*
      La password attuale si manda **solo** quando serve — cioe quando cambia
      un fattore — e non a ogni salvataggio: chi corregge un refuso nel proprio
      cognome non deve ridigitare la password.
    */
    const richiedePassword =
      emailChanged || phoneChanged || Boolean(profileForm.newPassword.trim());

    if (richiedePassword && !profileForm.currentPassword.trim()) {
      showToast(
        "error",
        "Per cambiare email, cellulare o password serve la password attuale. Se non ne hai una, usa «Ricevi un link per impostarla».",
      );
      setSavingProfile(false);
      return;
    }

    const response = await supabase.auth.updateUser({
      email: profileForm.email.trim().toLowerCase(),
      password: profileForm.newPassword.trim() || undefined,
      currentPassword: richiedePassword
        ? profileForm.currentPassword
        : undefined,
      data: {
        firstName: profileForm.firstName.trim(),
        lastName: profileForm.lastName.trim(),
        phone: profileForm.phone.trim(),
        avatarUrl: profileForm.avatarUrl || null,
      },
    });

    if (response.error) {
      showToast("error", response.error.message || "Errore aggiornamento profilo");
      setSavingProfile(false);
      return;
    }

    setProfileForm((current) => ({
      ...current,
      newPassword: "",
      confirmPassword: "",
    }));
    setSavingProfile(false);
    setProfileOpen(false);

    if (emailChanged || phoneChanged) {
      showToast(
        "success",
        "Profilo aggiornato. Email e telefono richiederanno una nuova verifica.",
      );
    } else {
      showToast("success", "Profilo aggiornato correttamente");
    }
  };

  const createOwnedClub = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user?.id) return;

    if (clubSlotLimit !== null && ownedClubs.length >= clubSlotLimit) {
      showToast("error", "Hai esaurito gli slot disponibili per i club");
      return;
    }

    /*
      Il messaggio nominava sette campi e lasciava l'utente sulla scheda dove
      stava: due di quei sette — email e telefono di contatto — vivono nella
      scheda «Contatti», che era chiusa. Chi premeva «Crea club» dalla scheda
      «Generali» leggeva di dover compilare campi che non erano sulla pagina.
      Adesso la mancanza porta alla scheda che la contiene, e il messaggio dice
      **solo** cio che manca davvero.
    */
    const missing = CREATE_CLUB_REQUIRED_FIELDS.filter(
      (entry) => !String(createClubForm[entry.field] || "").trim(),
    );

    if (missing.length > 0) {
      setCreateClubTab(missing[0].tab);
      showToast(
        "error",
        missing.length === 1
          ? `Manca ancora un dato obbligatorio: ${missing[0].label}.`
          : `Mancano ancora ${missing.length} dati obbligatori: ${missing
              .map((entry) => entry.label)
              .join(", ")}.`,
      );
      return;
    }

    setCreatingClub(true);

    const shouldBePrimary = ownedClubs.length === 0 && accessClubs.length === 0;
    const response = await apiRequest<any>("/api/v1/clubs", {
      method: "POST",
      body: {
        mode: "create",
        data: buildClubPayload(createClubForm, user, shouldBePrimary),
      },
    });

    if (response.error) {
      showToast("error", response.error.message || "Errore creazione club");
      setCreatingClub(false);
      return;
    }

    const createdClub = response.data;
    const createdSummary: AccountClub = {
      id: createdClub.id,
      name: createdClub.name || createClubForm.name.trim(),
      role: "owner",
      roleLabel: "Proprietario",
      isPrimary: shouldBePrimary,
      logoUrl: createdClub.logo_url || createClubForm.logoUrl || null,
      city: createdClub.city || createClubForm.city || null,
      province: createdClub.province || createClubForm.province || null,
      contactEmail: createdClub.contact_email || createClubForm.contactEmail || null,
      contactPhone: createdClub.contact_phone || createClubForm.contactPhone || null,
      createdAt: createdClub.created_at || null,
      ownerId: user.id,
      accessKind: "ownership",
      accessKey: `ownership:${createdClub.id}`,
    };

    // Il club appena creato diventa quello aperto: la configurazione iniziale
    // lavora sul club attivo, e non avrebbe senso proporla su un altro.
    syncActiveClubLocally(createdSummary);

    await loadMemberships(true);
    setCreateClubForm(createClubDefaults(user));
    setCreateClubTab("general");
    setCreateClubOpen(false);
    setCreatingClub(false);
    showToast(
      "success",
      `Club ${createdSummary.name} creato. Ti accompagniamo nella configurazione iniziale.`,
    );
    router.push("/onboarding");
  };

  const redeemClubAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken.trim()) {
      showToast("error", "Inserisci il token condiviso dal club");
      return;
    }

    setRedeemingAccess(true);

    const response = await apiRequest<{ membership: MembershipRecord }>(
      "/api/v1/auth/access/redeem",
      { method: "POST", body: { token: accessToken } },
    );

    if (response.error) {
      showToast("error", response.error.message || "Errore collegamento al club");
      setRedeemingAccess(false);
      return;
    }

    const membership = response.data?.membership;
    if (membership) {
      const club = mapMembershipToClub(membership, user?.id);
      if (club.isPrimary || !activeClubId) {
        syncActiveClubLocally(club);
      }
    }

    await loadMemberships(true);
    setAccessToken("");
    setRedeemAccessOpen(false);
    setRedeemingAccess(false);
    showToast("success", "Accesso aggiunto correttamente al tuo account");
  };

  const deleteAssignedAccess = async (club: AccountClub) => {
    if (!club.membershipId) {
      showToast("error", "Accesso assegnato non valido");
      return;
    }

    const confirmed = window.confirm(
      `Eliminare l'accesso ${club.roleLabel.toLowerCase()} a ${club.name}? Il profilo collegato verra scollegato dal tuo account, ma non verra eliminato dal club.`,
    );

    if (!confirmed) return;

    const accessKey = club.accessKey || club.membershipId;
    setDeletingAccessKey(accessKey);

    const response = await apiRequest<{
      deletedMembershipId: string;
      unlinkedProfilesCount: number;
    }>("/api/v1/auth/memberships/delete", {
      method: "POST",
      body: {
        membership_id: club.membershipId,
        organization_id: club.id,
        role: club.role,
      },
    });

    if (response.error) {
      showToast("error", response.error.message || "Errore eliminazione accesso");
      setDeletingAccessKey(null);
      return;
    }

    const activeAccessMatches =
      activeClub?.membershipId === club.membershipId ||
      activeClub?.accessKey === club.accessKey;
    if (activeAccessMatches && user?.id) {
      window.localStorage.removeItem("activeClub");
      window.localStorage.removeItem(`activeClub_${user.id}`);
      setActiveClub(null);
    }

    await loadMemberships(true);
    setDeletingAccessKey(null);
    showToast("success", "Accesso eliminato e profilo scollegato");
  };

  const handleSupport = () => {
    window.open("https://www.cedisoft.it/contatti/", "_blank", "noopener,noreferrer");
  };

  const panelsLoading = loading || membershipsStatus === "loading";
  const totalClubs = ownedClubs.length + accessClubs.length;
  const showSearch = !panelsLoading && totalClubs >= SEARCH_THRESHOLD;
  const filteredOwnedClubs = ownedClubs.filter((club) => matchesQuery(club, query));
  const filteredAccessClubs = accessClubs.filter((club) => matchesQuery(club, query));
  const firstName = getAccountFirstName(accountDisplayName);
  const blockingError = membershipsStatus === "error" && !hasLoadedMemberships;

  return (
    <div className="min-h-[100dvh] bg-[var(--eg-paper)] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 md:px-6">
          <EasyGameWordmark logoClassName="h-7" />

          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="hidden text-slate-600 sm:inline-flex"
              onClick={handleSupport}
            >
              <CircleHelp className="mr-1.5 h-4 w-4" aria-hidden />
              Assistenza
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white pl-1 pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label="Menu account"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                    {profileForm.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- avatar utente, spesso una data URL
                      <img
                        src={profileForm.avatarUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      getInitials(accountDisplayName)
                    )}
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-2 py-1.5">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {accountDisplayName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {profileForm.email}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
                  <UserCircle2 className="mr-2 h-4 w-4" aria-hidden />
                  Profilo account
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleSupport}>
                  <CircleHelp className="mr-2 h-4 w-4" aria-hidden />
                  Assistenza
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onSelect={() => {
                    void signOut();
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" aria-hidden />
                  Esci dall&apos;account
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-6">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="grid items-center gap-4 p-5 md:p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <p className="eg-eyebrow text-slate-400">Home account</p>
              <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                Ciao, {firstName}
              </h1>
              <p className="mt-2 max-w-xl text-sm text-slate-600">
                Da qui entri nei club che possiedi e in quelli dove ti hanno
                assegnato un accesso. Ogni club porta con se il suo ruolo e la
                sua stagione attiva.
              </p>
            </div>

            <div className="relative hidden h-36 xl:block">
              <Image
                src={ACCOUNT_HERO_IMAGE}
                alt=""
                fill
                priority
                sizes="320px"
                className="object-contain object-right"
              />
            </div>
          </div>
        </section>

        {/*
          **Gli avvisi di verifica dei recapiti (PP-05).**

          `emailVerified` e `phoneVerified` arrivavano gia dentro
          `user_metadata` — `buildUserMetadata` li scrive da sempre — e
          **nessuna schermata li leggeva**: due booleani calcolati a ogni
          richiesta e mai mostrati a nessuno. Questa e la superficie che li
          rende visibili, con il gesto che li risolve accanto.

          L'ordine non e casuale: il telefono sta sopra perche e l'unico che
          **blocca** (ADR-0132) — chi lo ha cambiato non rientrera al prossimo
          accesso finche non lo verifica — mentre l'email non impedisce niente
          e puo aspettare. Un avviso che grida quanto quello sopra insegna a
          ignorarli entrambi.
        */}
        {!phoneVerified ? (
          <VerificationNotice
            tone="warning"
            title="Telefono non verificato"
            description="Finché non verifichi il numero non potrai rientrare al prossimo accesso."
            ctaLabel="Verifica telefono"
            pending={verificationSending === "phone"}
            open={verificationOpen === "phone"}
            onAction={() => {
              void requestVerificationCode("phone");
            }}
            onResend={() => {
              void requestVerificationCode("phone");
            }}
            onConfirm={(code) => {
              void confirmVerificationCode("phone", code);
            }}
          />
        ) : null}

        {!emailVerified ? (
          <VerificationNotice
            tone="info"
            title="Email non verificata"
            description={`Non abbiamo ancora confermato ${profileForm.email || "il tuo indirizzo"}. Puoi usare EasyGame lo stesso, ma un indirizzo non verificato non vale come prova della tua identità.`}
            ctaLabel="Verifica email"
            pending={verificationSending === "email"}
            open={verificationOpen === "email"}
            onAction={() => {
              void requestVerificationCode("email");
            }}
            onResend={() => {
              void requestVerificationCode("email");
            }}
            onConfirm={(code) => {
              void confirmVerificationCode("email", code);
            }}
          />
        ) : null}

        {/*
          **La via d'uscita per chi non conosce nessuna password.**

          Sta accanto agli avvisi di verifica e non dentro il modulo del
          profilo, perche chi ne ha bisogno non arriva dal profilo: arriva da un
          accesso con Google, o da uno sfratto che gli ha appena sostituito la
          password. La riga e discreta di proposito — non e un allarme, e
          un'informazione per chi la cerca — e compare sempre, perche dal client
          non si puo sapere se una password esista: chiederlo al server
          significherebbe pubblicare quel fatto, e non e un fatto che serva a
          nessun altro.
        */}
        <p className="text-xs text-slate-500">
          Non conosci nessuna password di questo account — per esempio perché
          accedi con Google o Microsoft?{" "}
          <button
            type="button"
            className="font-medium text-slate-700 underline underline-offset-2 disabled:opacity-60"
            disabled={sendingPasswordLink}
            onClick={() => {
              void requestPasswordLink();
            }}
          >
            Ricevi un link per impostarla
          </button>
          . Serve per cambiare email o cellulare.
        </p>

        {membershipsStatus === "error" && hasLoadedMemberships ? (
          <div
            className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              {membershipsError ||
                "Aggiornamento dei club non riuscito: i dati mostrati potrebbero non essere aggiornati."}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={membershipsLoading}
              onClick={() => {
                void loadMemberships(true);
              }}
            >
              {membershipsLoading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              Riprova
            </Button>
          </div>
        ) : null}

        {blockingError ? (
          <section className="rounded-2xl border border-red-200 bg-white p-8 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-red-50 text-red-600">
              <TriangleAlert className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-4 font-display text-lg font-semibold text-slate-900">
              Non riusciamo a caricare i tuoi club
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              {membershipsError ||
                "Si e verificato un errore durante il caricamento. Nessun dato e stato modificato."}
            </p>
            <Button
              type="button"
              className="mt-5"
              disabled={membershipsLoading}
              onClick={() => {
                void loadMemberships();
              }}
            >
              {membershipsLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RotateCw className="mr-2 h-4 w-4" aria-hidden />
              )}
              Riprova
            </Button>
          </section>
        ) : (
          <>
            {showSearch ? (
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Cerca per nome, citta o ruolo"
                  aria-label="Cerca fra i tuoi club"
                  className="pl-9"
                />
              </div>
            ) : null}

            <div className="grid gap-5 xl:grid-cols-2">
              <AccessPanel
                ownerMode
                title="Club di proprieta"
                description="I club che hai creato e amministri come proprietario."
                actionLabel="Crea club"
                clubs={filteredOwnedClubs}
                loading={panelsLoading}
                filtered={Boolean(query) && ownedClubs.length > 0}
                activeClubId={activeClubId}
                switchingClubId={switchingClubId}
                deletingAccessKey={deletingAccessKey}
                slotLabel={
                  clubSlotLimit === null
                    ? undefined
                    : `${availableClubSlots} slot disponibili su ${clubSlotLimit}`
                }
                onAction={() => setCreateClubOpen(true)}
                onOpenClub={(club) => {
                  void openClubArea(club);
                }}
              />

              <AccessPanel
                ownerMode={false}
                title="Accessi assegnati"
                description="I club dove qualcun altro ti ha dato un ruolo."
                actionLabel="Aggiungi accesso"
                clubs={filteredAccessClubs}
                loading={panelsLoading}
                filtered={Boolean(query) && accessClubs.length > 0}
                activeClubId={activeClubId}
                switchingClubId={switchingClubId}
                deletingAccessKey={deletingAccessKey}
                onAction={() => setRedeemAccessOpen(true)}
                onOpenClub={(club) => {
                  void openClubArea(club);
                }}
                onDeleteClub={(club) => {
                  void deleteAssignedAccess(club);
                }}
              />
            </div>
          </>
        )}
      </main>

      <AccountProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        form={profileForm}
        accountDisplayName={accountDisplayName}
        activeClubName={activeClub?.name || null}
        emailVerified={emailVerified}
        phoneVerified={phoneVerified}
        saving={savingProfile}
        userRole={user?.user_metadata?.role || "user"}
        onChange={updateProfileField}
        onSubmit={saveProfile}
      />

      <AccountCreateClubDialog
        open={createClubOpen}
        onOpenChange={setCreateClubOpen}
        form={createClubForm}
        tab={createClubTab}
        creating={creatingClub}
        availableClubSlots={availableClubSlots}
        clubSlotLimit={clubSlotLimit}
        ownedClubCount={ownedClubs.length}
        onTabChange={setCreateClubTab}
        onFieldChange={updateClubField}
        onFederationChange={updateFederation}
        onFederationAdd={addFederation}
        onFederationRemove={removeFederation}
        onSubmit={createOwnedClub}
      />

      <AccountRedeemAccessDialog
        open={redeemAccessOpen}
        onOpenChange={setRedeemAccessOpen}
        value={accessToken}
        loading={redeemingAccess}
        onValueChange={setAccessToken}
        onSubmit={redeemClubAccess}
      />
    </div>
  );
}
