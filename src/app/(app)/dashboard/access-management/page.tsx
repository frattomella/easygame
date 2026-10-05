"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Copy, KeyRound, Pencil, Plus, ScrollText, ShieldCheck, Trash2, UserCog, UserX, Users } from "lucide-react";

import { DashboardPageContainer } from "@/components/dashboard/dashboard-page-container";
import { useToast } from "@/components/ui/toast-notification";
import { HeaderStat, PageHeader } from "@/components/web/page/PageHeader";
import { InfoCard } from "@/components/web/page/Cards";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/web/primitives/Overlays";
import { CellChips, DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { formatDateShort, formatInteger, joinMeta } from "@/lib/web/format";
import { apiRequest, readStoredActiveClub } from "@/lib/api/client";
import { getAccessRoleLabel } from "@/lib/access-roles";
import { roleHasPermission } from "@/lib/permissions/catalog";
import { isOwnerActor } from "@/lib/roles/custom-role";
import type { AccessScopeEntry } from "@/lib/roles/access-scope";
import { RoleDrawer } from "@/components/access-management/v2/role-drawer";
import { RoleInspector } from "@/components/access-management/v2/role-inspector";
import { AssignmentDrawer } from "@/components/access-management/v2/assignment-drawer";
import { DeleteRoleDialog, RevokeAccessDialog } from "@/components/access-management/v2/access-dialogs";
import {
  BOZZA_VUOTA,
  PRESET,
  bozzaDaRuolo,
  corpoBozza,
  etichettePerimetro,
  nomeAssegnazione,
  perimetroRistretto,
  statoRuolo,
  type Assegnazione,
  type Bozza,
  type LetturaAccessi,
  type OpzioniPerimetro,
  type RuoloDiClub,
} from "@/components/access-management/v2/access-model";

/**
 * **Ruoli e accessi** (Web V2, Wave E; pattern 10 della guideline 09: due
 * griglie impilate sotto l'intestazione).
 *
 * ## Che cosa c'era prima della V1 vera (W6-2)
 *
 * Un mock integrale: tre gestori inventati con indirizzi `@example.com`, un
 * token generato con `Math.random()` **nel browser** e una tabella
 * `access_tokens` che la pagina dichiarava di scrivere e che non esiste nello
 * schema. La V1 lo ha **sostituito** con la lettura vera di
 * `GET /api/v1/club-roles/assignments`; questa V2 cambia la forma e non la
 * sostanza: stessa lettura, stesse quattro scritture, stessi predicati.
 *
 * ## Le due regole che governano cosa si vede
 *
 * 1. **Nessuna casella che non faccia niente.** Le chiavi proposte nel
 *    cassetto del ruolo sono quelle di `listGrantablePermissions(base)`: le
 *    chiavi del catalogo che appartengono al ruolo base, senza le tre chiavi
 *    di legame.
 * 2. **Cio che le caselle non governano si dice a parole.** Il perimetro sulle
 *    risorse generiche lo decide il ruolo base: cassetto e ispettore lo
 *    scrivono invece di far credere che una casella lo copra.
 *
 * ## Permessi (gli stessi della V1)
 *
 * - creare, modificare, cancellare un ruolo: `isOwnerActor(ruoloAttivo)`;
 *   per chi non e proprietario le azioni sono **assenti** e la pagina lo dice;
 * - il registro delle operazioni: `roleHasPermission(ruoloAttivo, "audit.read")`;
 * - assegnare e revocare: nessun predicato client, come in V1; la rotta e
 *   gia riservata ai ruoli amministrativi canonici e il server decide.
 */
const VISTE_ACCESSI: ViewDef[] = [
  { id: "restricted", label: "Perimetro ristretto", filters: { perimeter: "restricted" }, builtIn: true },
  { id: "custom", label: "Ruolo del club", filters: { kind: "custom" }, builtIn: true },
];

const VISTE_RUOLI: ViewDef[] = [
  { id: "direction", label: "Con permessi di direzione", filters: { direction: "yes" }, builtIn: true, tone: "amber" },
  { id: "inactive", label: "Disattivati", filters: { status: "inactive" }, builtIn: true },
];

export default function AccessManagementPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [ruoli, setRuoli] = useState<RuoloDiClub[]>([]);
  const [assegnazioni, setAssegnazioni] = useState<Assegnazione[]>([]);
  const [opzioni, setOpzioni] = useState<OpzioniPerimetro>({ site: [], category: [] });
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const [ispezionato, setIspezionato] = useState<RuoloDiClub | null>(null);
  const [daCancellare, setDaCancellare] = useState<RuoloDiClub | null>(null);
  const [cancellazione, setCancellazione] = useState(false);
  const [daRevocare, setDaRevocare] = useState<Assegnazione | null>(null);
  const [revocaInCorso, setRevocaInCorso] = useState(false);
  const [inModifica, setInModifica] = useState<Assegnazione | null>(null);
  const [vistaAccessi, setVistaAccessi] = useState<string | null>(null);
  const [vistaRuoli, setVistaRuoli] = useState<string | null>(null);

  const ruoloAttivo = useMemo(() => readStoredActiveClub()?.role || "", []);
  const sonoProprietario = isOwnerActor(ruoloAttivo);
  const vedeRegistro = roleHasPermission(ruoloAttivo, "audit.read");

  const carica = useCallback(async () => {
    setCaricamento(true);
    const risposta = await apiRequest<LetturaAccessi>("/api/v1/club-roles/assignments");

    if (risposta.error) {
      setErrore(risposta.error.message);
      setCaricamento(false);
      return;
    }

    setErrore(null);
    setRuoli(risposta.data?.roles || []);
    setAssegnazioni(risposta.data?.assignments || []);
    setOpzioni(risposta.data?.scope_options || { site: [], category: [] });
    setCaricamento(false);
  }, []);

  useEffect(() => {
    void carica();
  }, [carica]);

  /* ── Scritture (le stesse rotte della V1, via apiRequest) ──────────────── */

  const salvaRuolo = async (valori: Bozza): Promise<boolean> => {
    const corpo = corpoBozza(valori);
    const risposta = valori.id
      ? await apiRequest(`/api/v1/club-roles/${valori.id}`, { method: "PATCH", body: corpo })
      : await apiRequest("/api/v1/club-roles", { method: "POST", body: corpo });

    if (risposta.error) {
      showToast("error", risposta.error.message);
      return false;
    }

    showToast("success", valori.id ? "Ruolo aggiornato" : "Ruolo creato");
    setBozza(null);
    setIspezionato(null);
    await carica();
    return true;
  };

  const cancellaRuolo = async () => {
    const ruolo = daCancellare;
    if (!ruolo) return;
    setCancellazione(true);
    const risposta = await apiRequest(`/api/v1/club-roles/${ruolo.id}`, { method: "DELETE" });
    setCancellazione(false);
    if (risposta.error) {
      showToast("error", risposta.error.message);
      return;
    }
    setDaCancellare(null);
    setIspezionato((current) => (current?.id === ruolo.id ? null : current));
    showToast("success", `Ruolo «${ruolo.name}» cancellato`);
    await carica();
  };

  const assegna = async (persona: Assegnazione, ruolo: string, scopes: AccessScopeEntry[]): Promise<boolean> => {
    const risposta = await apiRequest("/api/v1/club-roles/assignments", {
      method: "POST",
      body: { user_id: persona.user_id, role: ruolo, scopes },
    });
    if (risposta.error) {
      showToast("error", risposta.error.message);
      return false;
    }
    showToast("success", `Accesso aggiornato per ${nomeAssegnazione(persona)}`);
    setInModifica(null);
    await carica();
    return true;
  };

  const revoca = async () => {
    const persona = daRevocare;
    if (!persona) return;
    setRevocaInCorso(true);
    const risposta = await apiRequest(`/api/v1/club-roles/assignments/${persona.membership_id}`, { method: "DELETE" });
    setRevocaInCorso(false);
    if (risposta.error) {
      showToast("error", risposta.error.message);
      return;
    }
    setDaRevocare(null);
    showToast("success", "Accesso revocato");
    await carica();
  };

  /* ── Griglia delle persone con accesso ─────────────────────────────────── */

  const colonneAccessi = useMemo<ColumnDef<Assegnazione>[]>(
    () => [
      {
        id: "identity",
        header: "Persona",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => <IdentityCell name={nomeAssegnazione(row)} round meta={row.email || undefined} onClick={() => setInModifica(row)} />,
        sortValue: (row) => nomeAssegnazione(row).toLowerCase(),
        title: (row) => nomeAssegnazione(row),
      },
      {
        id: "role",
        header: "Ruolo",
        kind: "classification",
        cell: (row) => (
          <DataChip size="sm" tone={row.is_owner ? "navy" : row.custom_role_id ? "blue" : "neutral"} title={row.custom_role_id ? `Ruolo del club · ${row.role}` : row.role}>
            {row.role_label}
          </DataChip>
        ),
        sortValue: (row) => row.role_label.toLowerCase(),
      },
      {
        id: "perimeter",
        header: "Perimetro",
        kind: "chips",
        width: 1.4,
        cell: (row) => <CellChips items={etichettePerimetro(row, opzioni).map((label) => ({ label, tone: perimetroRistretto(row) ? "amber" : "neutral" }))} />,
        sortValue: (row) => (perimetroRistretto(row) ? 1 : 0),
        title: (row) => etichettePerimetro(row, opzioni).join(" · "),
      },
      {
        id: "permissions",
        header: "Permessi del ruolo di club",
        kind: "number",
        hidden: true,
        cell: (row) => (row.custom_role_id ? <span className="egw-num">{formatInteger(row.permissions.length)}</span> : null),
        sortValue: (row) => (row.custom_role_id ? row.permissions.length : null),
      },
      {
        id: "granted_at",
        header: "Accesso dal",
        kind: "date",
        hidden: true,
        cell: (row) => (row.granted_at ? formatDateShort(row.granted_at) : null),
        sortValue: (row) => row.granted_at || null,
      },
    ],
    [opzioni],
  );

  const filtriAccessi = useMemo<FilterDef<Assegnazione>[]>(() => {
    const etichetteRuolo = Array.from(new Set(assegnazioni.map((row) => row.role_label))).sort((a, b) => a.localeCompare(b, "it"));
    return [
      {
        id: "role",
        label: "Ruolo",
        type: "select",
        pinned: true,
        options: etichetteRuolo.map((label) => ({ value: label, label, count: assegnazioni.filter((row) => row.role_label === label).length })),
        apply: (row, value) => (typeof value === "string" && value ? row.role_label === value : true),
      },
      {
        id: "perimeter",
        label: "Perimetro",
        type: "select",
        options: [
          { value: "all", label: "Tutto il club" },
          { value: "restricted", label: "Ristretto a sedi o categorie" },
        ],
        apply: (row, value) => (typeof value === "string" && value ? (perimetroRistretto(row) ? "restricted" : "all") === value : true),
      },
      {
        id: "kind",
        label: "Tipo di ruolo",
        type: "select",
        options: [
          { value: "standard", label: "Ruolo standard" },
          { value: "custom", label: "Ruolo del club" },
        ],
        apply: (row, value) => (typeof value === "string" && value ? (row.custom_role_id ? "custom" : "standard") === value : true),
      },
    ];
  }, [assegnazioni]);

  const azioniAccessi = useMemo<RowActionDef<Assegnazione>[]>(
    () => [
      { id: "edit", label: "Ruolo e perimetro", icon: <UserCog />, primary: true, onClick: (row) => setInModifica(row) },
      { id: "revoke", label: "Revoca accesso", icon: <UserX />, tone: "danger", onClick: (row) => setDaRevocare(row) },
    ],
    [],
  );

  const ricercaAccessi = useMemo(
    () => ({
      placeholder: "Cerca per nome, email, ruolo",
      match: (row: Assegnazione, query: string) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return [row.name, row.email, row.role_label, row.role].some((valore) => String(valore || "").toLowerCase().includes(q));
      },
    }),
    [],
  );

  /* ── Griglia dei ruoli del club ────────────────────────────────────────── */

  const colonneRuoli = useMemo<ColumnDef<RuoloDiClub>[]>(
    () => [
      {
        id: "identity",
        header: "Ruolo",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => <IdentityCell name={row.name} meta={row.description || joinMeta("Ruolo del club")} onClick={() => setIspezionato(row)} />,
        sortValue: (row) => row.name.toLowerCase(),
        title: (row) => row.description || row.name,
      },
      {
        id: "base",
        header: "Parte da",
        kind: "classification",
        cell: (row) => <DataChip size="sm">da {row.base_role_label}</DataChip>,
        sortValue: (row) => row.base_role_label.toLowerCase(),
      },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={statoRuolo(row)} />,
        sortValue: (row) => (row.is_active ? "active" : "inactive"),
      },
      {
        id: "permissions",
        header: "Permessi",
        kind: "number",
        cell: (row) => <span className="egw-num">{formatInteger(row.permissions.length)}</span>,
        sortValue: (row) => row.permissions.length,
      },
      {
        id: "assigned",
        header: "Persone",
        kind: "number",
        cell: (row) => <span className="egw-num">{formatInteger(row.assigned_count)}</span>,
        sortValue: (row) => row.assigned_count,
      },
      {
        id: "direction",
        header: "Direzione",
        kind: "chips",
        cell: (row) => (row.contains_direction_keys ? <DataChip size="sm" tone="amber">contiene permessi di direzione</DataChip> : null),
        sortValue: (row) => (row.contains_direction_keys ? 1 : 0),
      },
      {
        id: "slug",
        header: "Identificativo",
        kind: "text",
        hidden: true,
        cell: (row) => <span className="egw-num">{row.slug}</span>,
        sortValue: (row) => row.slug,
      },
    ],
    [],
  );

  const filtriRuoli = useMemo<FilterDef<RuoloDiClub>[]>(
    () => [
      {
        id: "base",
        label: "Parte da",
        type: "select",
        pinned: true,
        options: Array.from(new Set(ruoli.map((row) => row.base_role))).map((base) => ({ value: base, label: getAccessRoleLabel(base), count: ruoli.filter((row) => row.base_role === base).length })),
        apply: (row, value) => (typeof value === "string" && value ? row.base_role === value : true),
      },
      {
        id: "status",
        label: "Stato",
        type: "select",
        options: [
          { value: "active", label: "Attivo" },
          { value: "inactive", label: "Disattivato" },
        ],
        apply: (row, value) => (typeof value === "string" && value ? (row.is_active ? "active" : "inactive") === value : true),
      },
      {
        id: "direction",
        label: "Permessi di direzione",
        type: "select",
        options: [
          { value: "yes", label: "Ne contiene" },
          { value: "no", label: "Non ne contiene" },
        ],
        apply: (row, value) => (typeof value === "string" && value ? (row.contains_direction_keys ? "yes" : "no") === value : true),
      },
    ],
    [ruoli],
  );

  const azioniRuoli = useMemo<RowActionDef<RuoloDiClub>[]>(
    () => [
      { id: "inspect", label: "Dettaglio", icon: <ChevronRight />, primary: true, onClick: (row) => setIspezionato(row) },
      { id: "edit", label: "Modifica", icon: <Pencil />, hidden: () => !sonoProprietario, onClick: (row) => setBozza(bozzaDaRuolo(row)) },
      { id: "delete", label: "Elimina", icon: <Trash2 />, tone: "danger", hidden: () => !sonoProprietario, onClick: (row) => setDaCancellare(row) },
    ],
    [sonoProprietario],
  );

  const ricercaRuoli = useMemo(
    () => ({
      placeholder: "Cerca per nome, descrizione, permesso",
      match: (row: RuoloDiClub, query: string) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return [row.name, row.description, row.slug, row.base_role_label, ...row.permission_labels.map((voce) => voce.label), ...row.permissions].some((valore) => String(valore || "").toLowerCase().includes(q));
      },
    }),
    [],
  );

  const statoGriglia = caricamento ? "loading" : errore ? "error" : "ready";
  const conDirezione = ruoli.filter((row) => row.contains_direction_keys).length;
  const ristretti = assegnazioni.filter(perimetroRistretto).length;

  const apriNuovoRuolo = () => setBozza({ ...BOZZA_VUOTA, permissions: [] });

  return (
    <DashboardPageContainer>
      <PageHeader
        eyebrow="Impostazioni"
        title="Ruoli e accessi"
        description="Chi entra in questo club, con quale ruolo e su quale perimetro."
        stats={
          <>
            <HeaderStat value={formatInteger(assegnazioni.length)} label={assegnazioni.length === 1 ? "persona con accesso" : "persone con accesso"} />
            <HeaderStat value={formatInteger(ristretti)} label="con perimetro ristretto" tone={ristretti ? "amber" : "ink"} onClick={() => setVistaAccessi("restricted")} />
            <HeaderStat value={formatInteger(ruoli.length)} label={ruoli.length === 1 ? "ruolo del club" : "ruoli del club"} />
            {conDirezione ? <HeaderStat value={formatInteger(conDirezione)} label="con permessi di direzione" tone="amber" onClick={() => setVistaRuoli("direction")} /> : null}
          </>
        }
        actions={
          <>
            {/*
              **La voce sparisce con la chiave.** Chi non ha `audit.read` non
              vede il collegamento, e se lo indovinasse a mano la rotta
              risponderebbe comunque 403: due serrature che dicono la stessa
              cosa.
            */}
            {vedeRegistro ? (
              <Button variant="secondary" icon={<ScrollText />} onClick={() => router.push("/audit")}>
                Registro delle operazioni
              </Button>
            ) : null}
            {sonoProprietario ? (
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="secondary" icon={<Copy />}>
                    Parti da un modello
                  </Button>
                </MenuTrigger>
                <MenuContent width={300}>
                  <MenuLabel>Modelli di ruolo</MenuLabel>
                  {PRESET.map((preset) => (
                    <MenuItem key={preset.titolo} onSelect={() => setBozza({ ...preset.bozza, permissions: [...preset.bozza.permissions] })} className="h-auto flex-col items-start gap-0.5 py-2">
                      <span>Clona «{preset.titolo}»</span>
                      <span className="whitespace-normal text-[11px] font-normal leading-[1.4] text-egw-ink-62">{preset.descrizione}</span>
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            ) : null}
            {sonoProprietario ? (
              <Button variant="primary" icon={<Plus />} onClick={apriNuovoRuolo}>
                Nuovo ruolo
              </Button>
            ) : null}
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <InfoCard eyebrow="Come si entra">
            Chi entra per la prima volta riceve un invito dalla propria scheda (atleta, allenatore, socio): il ruolo si assegna qui, dopo che l&apos;accesso è stato accettato.
          </InfoCard>
          {sonoProprietario ? (
            <InfoCard eyebrow="Ruoli del club">
              Un ruolo del club serve quando a una persona vanno concessi <strong className="font-semibold text-egw-ink">meno</strong> permessi di quelli del suo ruolo standard, mai di più. I sette ruoli standard restano disponibili.
            </InfoCard>
          ) : (
            <InfoCard eyebrow="Ruoli del club">Creare e modificare un ruolo è riservato al proprietario del club. Puoi assegnare i ruoli esistenti e il perimetro alle persone con accesso.</InfoCard>
          )}
        </div>
      </PageHeader>

      {errore ? (
        <AlertBlock
          severity="danger"
          title="Non è stato possibile leggere gli accessi del club."
          className="mb-[18px]"
          actions={
            <Button variant="secondary" size="sm" onClick={() => void carica()}>
              Riprova
            </Button>
          }
        >
          {errore}
        </AlertBlock>
      ) : null}

      <section aria-labelledby="accessi-titolo" className="mb-[18px]">
        <div className="mb-3 flex items-center gap-2.5">
          <Users className="h-[18px] w-[18px] text-egw-blue-700" aria-hidden />
          <h2 id="accessi-titolo" className="font-brand text-[20px] font-extrabold leading-6 tracking-[var(--egw-track-display)] text-egw-ink">
            Persone con accesso
          </h2>
        </div>
        <DataGrid<Assegnazione>
          module="accessi"
          aria-label="Persone con accesso al club"
          rows={assegnazioni}
          getRowId={(row) => row.membership_id}
          rowLabel={(row) => nomeAssegnazione(row)}
          columns={colonneAccessi}
          filters={filtriAccessi}
          views={VISTE_ACCESSI}
          requestedViewId={vistaAccessi}
          search={ricercaAccessi}
          rowActions={azioniAccessi}
          onOpenRow={(row) => setInModifica(row)}
          activeRowId={inModifica?.membership_id ?? null}
          state={statoGriglia}
          errorMessage={errore}
          onRetry={() => void carica()}
          noun={{ singular: "persona", plural: "persone", gender: "f" }}
          defaultPageSize={25}
          empty={{
            icon: <Users />,
            title: "Nessun accesso registrato per questo club",
            description: "Chi entra per la prima volta riceve un invito dalla propria scheda: il ruolo si assegna qui, dopo che l'accesso è stato accettato.",
          }}
        />
      </section>

      <section aria-labelledby="ruoli-titolo">
        <div className="mb-3 flex items-center gap-2.5">
          <ShieldCheck className="h-[18px] w-[18px] text-egw-blue-700" aria-hidden />
          <h2 id="ruoli-titolo" className="font-brand text-[20px] font-extrabold leading-6 tracking-[var(--egw-track-display)] text-egw-ink">
            Ruoli del club
          </h2>
        </div>
        <DataGrid<RuoloDiClub>
          module="ruoli-club"
          aria-label="Ruoli personalizzati del club"
          rows={ruoli}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
          columns={colonneRuoli}
          filters={filtriRuoli}
          views={VISTE_RUOLI}
          requestedViewId={vistaRuoli}
          search={ricercaRuoli}
          defaultSort={{ columnId: "identity", direction: "asc" }}
          rowActions={azioniRuoli}
          onOpenRow={(row) => setIspezionato(row)}
          onInspectRow={(row) => setIspezionato(row)}
          activeRowId={ispezionato?.id ?? null}
          state={statoGriglia}
          errorMessage={errore}
          onRetry={() => void carica()}
          noun={{ singular: "ruolo", plural: "ruoli" }}
          defaultPageSize={25}
          empty={{
            icon: <KeyRound />,
            title: "Nessun ruolo personalizzato",
            description: "I sette ruoli standard restano disponibili: un ruolo personalizzato serve quando a una persona vanno concessi meno permessi di quelli del suo ruolo, mai di più.",
            primary: sonoProprietario ? (
              <Button variant="primary" size="sm" icon={<Plus />} onClick={apriNuovoRuolo}>
                Nuovo ruolo
              </Button>
            ) : null,
          }}
        />
      </section>

      <RoleDrawer bozza={bozza} onClose={() => setBozza(null)} onSave={salvaRuolo} />

      <RoleInspector
        ruolo={ispezionato}
        onClose={() => setIspezionato(null)}
        canManage={sonoProprietario}
        onEdit={(ruolo) => {
          setIspezionato(null);
          setBozza(bozzaDaRuolo(ruolo));
        }}
        onDelete={(ruolo) => {
          setIspezionato(null);
          setDaCancellare(ruolo);
        }}
      />

      <AssignmentDrawer persona={inModifica} ruoli={ruoli} opzioni={opzioni} onClose={() => setInModifica(null)} onSave={assegna} />

      <DeleteRoleDialog ruolo={daCancellare} onOpenChange={(open) => !open && !cancellazione && setDaCancellare(null)} onConfirm={cancellaRuolo} loading={cancellazione} />

      <RevokeAccessDialog persona={daRevocare} onOpenChange={(open) => !open && !revocaInCorso && setDaRevocare(null)} onConfirm={revoca} loading={revocaInCorso} />
    </DashboardPageContainer>
  );
}
