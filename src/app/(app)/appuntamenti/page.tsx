"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, Pencil, Plus, Power, Trash2 } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { HeaderStat, PageHeader } from "@/components/web/page/PageHeader";
import { AlertBlock } from "@/components/web/page/Alerts";
import { EmptyStateCard } from "@/components/web/page/Cards";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { Checkbox, Toggle } from "@/components/web/primitives/Controls";
import { Panel, PanelHeader, InsetBlock, Eyebrow } from "@/components/web/primitives/Surface";
import { Field, FieldSizeProvider, TextInput } from "@/components/web/forms/Field";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { RowActionDef } from "@/components/web/datagrid/types";
import { useConfirm } from "@/components/web/overlays/useConfirm";
import { formatInteger } from "@/lib/web/format";
import { isManagementAccessRole } from "@/lib/access-roles";
import { getClubData } from "@/lib/simplified-db";
import { normalizeClubSites } from "@/lib/club-sites";
import { apiRequest } from "@/lib/api/client";
import { DEFAULT_APPOINTMENTS_CONFIG, normalizeAppointmentsConfig, type AppointmentsConfig, familyCanRequestAppointment } from "@/lib/appointments/config";
import { createAppointmentSlot, deleteAppointmentSlot, listAppointmentSlots, updateAppointmentSlot, type AppointmentSlotRow } from "@/lib/api/appointments-client";
import { SlotDrawer } from "@/components/appuntamenti/v2/slot-drawer";
import { SLOT_VIEWS, slotColumns, slotFilters, slotSearch } from "@/components/appuntamenti/v2/slots-grid";
import { estraiOperatori, intestazioniClub, isSlotActive, slotStatusKey, soloData, type Operatore, type Sede, type SlotFormValues } from "@/components/appuntamenti/v2/slot-model";

/**
 * `/appuntamenti` — la disponibilita (Web V2, pattern 10: intestazione →
 * avviso di ripiego → griglia delle fasce + rail «Come riceviamo»).
 *
 * **Quando la societa riceve: la configurazione che non aveva una schermata**
 * (W6-53). Senza una sola regola dichiarata, `computeFreeAppointmentSlots`
 * ricade sugli orari di apertura: colloqui di trenta minuti, senza operatore,
 * replicati su tutti i giorni della settimana. Il ripiego non e un dettaglio
 * da nascondere: e la configurazione in cui il club si trova adesso.
 *
 * Il gate della pagina e lo stesso del dominio: la coda degli appuntamenti la
 * lavora anche l'allenatore, sui propri, mentre la disponibilita la configura
 * solo chi amministra il club (`assertPuoConfigurareLaDisponibilita`, che
 * chiede `isManagementAccessRole`). Chi non lo passa legge una frase, non un
 * modulo che risponde 403.
 *
 * Le scritture sono quelle della V1: i quattro verbi degli slot con
 * `x-active-club-id` nell'intestazione, e la configurazione «Come riceviamo»
 * (PP-02 §K) salvata **tutta** a ogni gesto, in modo ottimistico con
 * ripristino se il server dice di no.
 */
export default function AppuntamentiDisponibilitaPage() {
  const { showToast } = useToast();
  const { activeClub } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || "/appuntamenti";
  const rawSearchParams = useSearchParams();
  const searchParams = React.useMemo(() => rawSearchParams ?? new URLSearchParams(), [rawSearchParams]);
  const [confirm, confirmDialog] = useConfirm();

  const [slots, setSlots] = React.useState<AppointmentSlotRow[]>([]);
  const [sedi, setSedi] = React.useState<Sede[]>([]);
  const [operatori, setOperatori] = React.useState<Operatore[]>([]);
  const [caricamento, setCaricamento] = React.useState(true);
  const [erroreCaricamento, setErroreCaricamento] = React.useState<string | null>(null);
  const [drawer, setDrawer] = React.useState<{ open: boolean; slot: AppointmentSlotRow | null }>({ open: false, slot: null });
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [configurazione, setConfigurazione] = React.useState<AppointmentsConfig>(DEFAULT_APPOINTMENTS_CONFIG);
  const [nuovoTipo, setNuovoTipo] = React.useState({ name: "" });

  const puoConfigurare = isManagementAccessRole(activeClub?.role);

  const carica = React.useCallback(async () => {
    if (!activeClub?.id || !puoConfigurare) {
      setCaricamento(false);
      return;
    }
    setCaricamento(true);
    try {
      const [righe, sitiGrezzi, staff, allenatori, config] = await Promise.all([
        listAppointmentSlots(intestazioniClub(activeClub.id)),
        getClubData(activeClub.id, "club_sites"),
        getClubData(activeClub.id, "staff_members"),
        getClubData(activeClub.id, "trainers"),
        apiRequest<AppointmentsConfig>("/api/v1/appointments/config", { headers: intestazioniClub(activeClub.id) }),
      ]);
      setSlots(Array.isArray(righe) ? righe : []);
      if (config?.data) setConfigurazione(normalizeAppointmentsConfig(config.data));
      setSedi(normalizeClubSites(sitiGrezzi).map((sede) => ({ id: sede.id, name: sede.name })));
      setOperatori(estraiOperatori([...(Array.isArray(staff) ? staff : []), ...(Array.isArray(allenatori) ? allenatori : [])]));
      setErroreCaricamento(null);
    } catch (errore) {
      const messaggio = String((errore as Error)?.message || "Non riesco a leggere la disponibilita configurata");
      setErroreCaricamento(messaggio);
      showToast("error", messaggio);
    } finally {
      setCaricamento(false);
    }
  }, [activeClub?.id, puoConfigurare, showToast]);

  React.useEffect(() => {
    void carica();
  }, [carica]);

  /* `?action=new` apre il cassetto della nuova fascia (azioni rapide). */
  React.useEffect(() => {
    if (searchParams.get("action") !== "new" || !puoConfigurare) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("action");
    setDrawer({ open: true, slot: null });
    const query = params.toString();
    const frame = window.requestAnimationFrame(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, puoConfigurare, router, searchParams]);

  /*
    Si salva l'intera configurazione a ogni gesto — un motivo aggiunto, uno
    tolto, l'interruttore mosso — perche e un oggetto piccolo e perche il
    server la normalizza comunque: una patch parziale sarebbe una seconda idea
    di cosa sia «la configurazione».
  */
  const salvaConfigurazione = React.useCallback(
    async (prossima: AppointmentsConfig) => {
      if (!activeClub?.id) return;
      const precedente = configurazione;
      setConfigurazione(normalizeAppointmentsConfig(prossima));
      const risposta = await apiRequest<AppointmentsConfig>("/api/v1/appointments/config", {
        method: "PUT",
        headers: intestazioniClub(activeClub.id),
        body: { data: prossima },
      });
      if (risposta.error) {
        /* Il server ha detto di no: la schermata torna a cio che era vero. */
        setConfigurazione(precedente);
        showToast("error", risposta.error.message || "Non riesco a salvare la configurazione");
        return;
      }
      if (risposta.data) setConfigurazione(normalizeAppointmentsConfig(risposta.data));
    },
    [activeClub?.id, configurazione, showToast],
  );

  const inRipiego = React.useMemo(() => slots.filter((slot) => slot.active !== false).length === 0, [slots]);

  /* ── Scritture delle fasce (gli stessi verbi della V1) ─────────────────── */
  const salva = async (modulo: SlotFormValues) => {
    if (!activeClub?.id) return false;
    try {
      /*
        Giorno della settimana **oppure** data: il dominio rifiuta una regola
        che non dichiari nessuno dei due, e rifiuta di ragionare su entrambi.
        Si manda solo quello scelto, cosi passare da una forma all'altra
        cancella davvero l'altra invece di lasciarla scritta sotto.
      */
      const corpo = {
        siteId: modulo.siteId || null,
        assignedToUserId: modulo.assignedToUserId || null,
        weekday: modulo.ambito === "weekly" ? Number(modulo.weekday) : null,
        specificDate: modulo.ambito === "date" ? modulo.specificDate : null,
        startTime: modulo.startTime,
        endTime: modulo.endTime,
        durationMinutes: Number(modulo.durationMinutes) || 30,
        validFrom: modulo.validFrom || null,
        validUntil: modulo.validUntil || null,
        active: modulo.active,
        notes: modulo.notes || null,
      };
      if (modulo.id) await updateAppointmentSlot(modulo.id, corpo, intestazioniClub(activeClub.id));
      else await createAppointmentSlot(corpo, intestazioniClub(activeClub.id));
      await carica();
      showToast("success", modulo.id ? "Fascia aggiornata: le famiglie vedono subito la nuova disponibilita" : "Fascia aggiunta: le famiglie possono prenotarla");
      return true;
    } catch (errore) {
      showToast("error", String((errore as Error)?.message || "Non riesco a salvare la fascia"));
      return false;
    }
  };

  /**
   * Disattivare non e cancellare, ed e la mossa che serve piu spesso. Una
   * fascia con una **data** e `active = false` e una chiusura: il dominio la
   * legge come «quel giorno non si riceve». Si rimanda **tutta** la riga con
   * il solo interruttore cambiato: un campo assente viaggerebbe come `null`.
   */
  const cambiaAttivazione = async (slot: AppointmentSlotRow) => {
    if (!activeClub?.id || busyId) return;
    setBusyId(slot.id);
    try {
      await updateAppointmentSlot(
        slot.id,
        {
          siteId: slot.site_id,
          assignedToUserId: slot.assigned_to_user_id,
          weekday: slot.specific_date ? null : slot.weekday,
          specificDate: slot.specific_date ? soloData(slot.specific_date) : null,
          startTime: slot.start_time,
          endTime: slot.end_time,
          durationMinutes: slot.duration_minutes,
          validFrom: slot.valid_from ? soloData(slot.valid_from) : null,
          validUntil: slot.valid_until ? soloData(slot.valid_until) : null,
          active: slot.active === false,
          notes: slot.notes,
        },
        intestazioniClub(activeClub.id),
      );
      await carica();
      showToast("success", slot.active === false ? "Fascia riattivata" : "Fascia disattivata");
    } catch (errore) {
      showToast("error", String((errore as Error)?.message || "Non riesco a cambiare la fascia"));
    } finally {
      setBusyId(null);
    }
  };

  /**
   * La rimozione **non** cancella gli appuntamenti gia presi su quella fascia
   * (la chiave esterna e `SET NULL`): si perde solo la regola che la
   * proponeva. Conferma distruttiva con «cosa se ne va».
   */
  const rimuovi = async (slot: AppointmentSlotRow) => {
    if (!activeClub?.id || busyId) return;
    const ok = await confirm({
      title: "Eliminare questa fascia?",
      description: "Per smettere di offrirla senza toglierla dalla storia, disattivala.",
      confirmLabel: "Elimina",
      tone: "danger",
      consequences: ["Si perde la regola che la proponeva alle famiglie", "Gli appuntamenti gia presi su questa fascia restano in agenda"],
      irreversible: true,
    });
    if (!ok) return;
    setBusyId(slot.id);
    try {
      await deleteAppointmentSlot(slot.id, intestazioniClub(activeClub.id));
      await carica();
      showToast("success", "Fascia rimossa");
    } catch (errore) {
      showToast("error", String((errore as Error)?.message || "Non riesco a rimuovere la fascia"));
    } finally {
      setBusyId(null);
    }
  };

  /* ── Griglia ───────────────────────────────────────────────────────────── */
  const columns = React.useMemo(() => slotColumns(sedi, operatori), [sedi, operatori]);
  const filters = React.useMemo(() => slotFilters(slots, sedi, operatori), [slots, sedi, operatori]);
  const search = React.useMemo(() => slotSearch(sedi, operatori), [sedi, operatori]);
  const rowActions = React.useMemo<RowActionDef<AppointmentSlotRow>[]>(
    () => [
      { id: "edit", label: "Modifica", icon: <Pencil />, primary: true, onClick: (row) => setDrawer({ open: true, slot: row }) },
      { id: "toggle-off", label: "Disattiva", icon: <Power />, hidden: (row) => !isSlotActive(row), onClick: (row) => void cambiaAttivazione(row) },
      { id: "toggle-on", label: "Riattiva", icon: <Power />, hidden: (row) => isSlotActive(row), onClick: (row) => void cambiaAttivazione(row) },
      { id: "delete", label: "Elimina", icon: <Trash2 />, tone: "danger", onClick: (row) => void rimuovi(row) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeClub?.id, busyId],
  );

  const attive = slots.filter(isSlotActive).length;
  const chiusure = slots.filter((slot) => slotStatusKey(slot) === "closure").length;
  const prenotazioniAperte = familyCanRequestAppointment(configurazione);
  const gridState = caricamento ? "loading" : erroreCaricamento ? "error" : "ready";

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Disponibilita appuntamenti" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Segreteria"
              title="Disponibilita appuntamenti"
              description="Dichiara quando la societa riceve: giorni, orari, durata del colloquio, sede e operatore."
              stats={
                puoConfigurare ? (
                  <>
                    <HeaderStat value={formatInteger(attive)} label={attive === 1 ? "fascia attiva" : "fasce attive"} tone={attive ? "green" : "amber"} />
                    <HeaderStat value={formatInteger(chiusure)} label={chiusure === 1 ? "chiusura" : "chiusure"} tone={chiusure ? "red" : "ink"} />
                    <HeaderStat value={formatInteger(configurazione.types.length)} label="motivi" />
                    <HeaderStat value={prenotazioniAperte ? "Aperte" : "Chiuse"} label="richieste online" tone={prenotazioniAperte ? "green" : "amber"} />
                  </>
                ) : null
              }
              actions={
                puoConfigurare ? (
                  <>
                    <Button variant="primary" icon={<Plus />} onClick={() => setDrawer({ open: true, slot: null })} disabled={caricamento}>
                      Nuova fascia
                    </Button>
                    <Button asChild variant="secondary">
                      <Link href="/secretariat">Vai alla Segreteria</Link>
                    </Button>
                  </>
                ) : null
              }
            >
              {puoConfigurare && inRipiego && !caricamento ? (
                <AlertBlock
                  severity="warning"
                  title="Nessuna fascia attiva: si sta usando l'orario di apertura."
                  actions={
                    <Button variant="secondary" size="sm" onClick={() => setDrawer({ open: true, slot: null })}>
                      Dichiara la prima fascia
                    </Button>
                  }
                >
                  Finche non dichiari almeno una fascia, alle famiglie vengono proposti colloqui di trenta minuti dentro l&apos;orario di apertura, senza operatore, e — se l&apos;orario e uno solo per tutta la settimana — anche nei giorni in cui la segreteria e chiusa.
                </AlertBlock>
              ) : null}
            </PageHeader>

            {!puoConfigurare ? (
              <EmptyStateCard
                icon={<CalendarClock />}
                iconTone="amber"
                title="Gli orari di ricevimento del club li configura chi lo amministra"
                description="Gli appuntamenti che ti sono assegnati restano nella tua agenda."
              />
            ) : (
              <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,1fr)_340px]">
                <DataGrid<AppointmentSlotRow>
                  module="appuntamenti-fasce"
                  aria-label="Fasce di ricevimento"
                  rows={slots}
                  getRowId={(row) => row.id}
                  rowLabel={(row) => `${row.specific_date ? soloData(row.specific_date) : "fascia"} ${row.start_time}`}
                  columns={columns}
                  filters={filters}
                  views={SLOT_VIEWS}
                  search={search}
                  defaultSort={{ columnId: "identity", direction: "asc" }}
                  rowActions={rowActions}
                  onOpenRow={(row) => setDrawer({ open: true, slot: row })}
                  canSelect={false}
                  state={gridState}
                  errorMessage={erroreCaricamento}
                  onRetry={() => void carica()}
                  noun={{ singular: "fascia", plural: "fasce" }}
                  empty={{
                    icon: <CalendarClock />,
                    title: "Nessuna fascia dichiarata.",
                    description: "Una fascia dice quando, dove e con chi la societa riceve; senza, vale l'orario di apertura.",
                    primary: (
                      <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setDrawer({ open: true, slot: null })}>
                        Nuova fascia
                      </Button>
                    ),
                  }}
                />

                {/*
                  **PP-02 §K. Come riceve questo club: se, e per cosa.** «Se»
                  esisteva solo come `active` sulla singola fascia; «per cosa» non
                  esisteva affatto, e il motivo arrivava come testo libero.
                */}
                <Panel as="aside" aria-labelledby="egw-come-riceviamo" className="self-start">
                  <PanelHeader eyebrow="Configurazione" title={<span id="egw-come-riceviamo">Come riceviamo</span>} description="Se le famiglie possono chiedere un appuntamento, e per quali motivi." />

                  <InsetBlock className="flex items-start justify-between gap-3">
                    <label htmlFor="prenotazioni-famiglia" className="font-brand text-[12.5px] font-semibold text-egw-ink">
                      Le famiglie possono prenotare
                      <span className="block font-normal text-egw-ink-62">{configurazione.familyBookingEnabled ? "Attivo" : "Non attivo: l'area famiglia non mostra il modulo e la richiesta viene rifiutata. Gli appuntamenti gia presi restano."}</span>
                    </label>
                    <Toggle
                      id="prenotazioni-famiglia"
                      checked={configurazione.familyBookingEnabled}
                      onCheckedChange={(valore) => void salvaConfigurazione({ ...configurazione, familyBookingEnabled: valore })}
                      aria-label="Le famiglie possono prenotare"
                    />
                  </InsetBlock>

                  {/*
                    **Chi chiude la porta deve vederla chiusa.** `familyCanRequestAppointment`
                    e falsa anche con l'interruttore acceso, quando nessun motivo e
                    prenotabile: la schermata della famiglia la chiede, e questa —
                    che e quella che **causa** lo stato — la deve mostrare.
                  */}
                  {configurazione.familyBookingEnabled && !familyCanRequestAppointment(configurazione) ? (
                    <AlertBlock severity="warning" title="Nessun motivo e prenotabile dalle famiglie: per loro le richieste online risultano chiuse." className="mt-4">
                      Spunta «Le famiglie possono chiederlo» su almeno un motivo, oppure togli del tutto i motivi per accettare anche il testo libero.
                    </AlertBlock>
                  ) : null}

                  <div className="mt-5">
                    <Eyebrow as="h3" className="block">
                      Motivi che accettiamo
                    </Eyebrow>
                    <p className="mt-1.5 font-brand text-[12px] leading-[1.5] text-egw-ink-62">Senza nessun motivo la famiglia continua a scriverlo a mano: i motivi restringono, la loro assenza non e un divieto.</p>

                    {configurazione.types.length ? (
                      <ul className="mt-3 flex flex-col gap-2">
                        {configurazione.types.map((tipo) => (
                          <li key={tipo.id}>
                            <InsetBlock className="flex flex-wrap items-center justify-between gap-2 p-3">
                              <span className="min-w-0 font-brand text-[13px] font-semibold text-egw-ink">
                                {tipo.name}
                                {tipo.bookable ? "" : <span className="ml-1.5 font-normal text-egw-ink-62">· solo dal desk</span>}
                              </span>
                              <span className="flex items-center gap-2">
                                {/* `bookable`: «Convocazione» la decide il club, la famiglia non la chiede. */}
                                <label className="flex items-center gap-2 font-brand text-[11.5px] text-egw-ink-62">
                                  <Checkbox
                                    size={16}
                                    checked={tipo.bookable}
                                    onChange={(event) =>
                                      void salvaConfigurazione({
                                        ...configurazione,
                                        types: configurazione.types.map((voce) => (voce.id === tipo.id ? { ...voce, bookable: event.target.checked } : voce)),
                                      })
                                    }
                                  />
                                  Le famiglie possono chiederlo
                                </label>
                                <IconButton
                                  aria-label={`Rimuovi il motivo ${tipo.name}`}
                                  size="xs"
                                  variant="row"
                                  className="text-egw-red hover:text-egw-red"
                                  onClick={() => void salvaConfigurazione({ ...configurazione, types: configurazione.types.filter((voce) => voce.id !== tipo.id) })}
                                >
                                  <Trash2 />
                                </IconButton>
                              </span>
                            </InsetBlock>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <form
                      className="mt-3 flex flex-wrap items-end gap-2"
                      onSubmit={(evento) => {
                        evento.preventDefault();
                        const nome = nuovoTipo.name.trim();
                        if (!nome) return;
                        void salvaConfigurazione({ ...configurazione, types: [...configurazione.types, { id: "", name: nome, bookable: true }] });
                        setNuovoTipo({ name: "" });
                      }}
                    >
                      <FieldSizeProvider size="sm">
                        <Field label="Nuovo motivo" htmlFor="nuovo-motivo" className="min-w-[12rem] flex-1">
                          <TextInput id="nuovo-motivo" value={nuovoTipo.name} placeholder="Es. Colloquio con la segreteria" onChange={(evento) => setNuovoTipo({ name: evento.target.value })} />
                        </Field>
                      </FieldSizeProvider>
                      <Button type="submit" variant="neutral" disabled={!nuovoTipo.name.trim()}>
                        Aggiungi
                      </Button>
                    </form>
                  </div>
                </Panel>
              </div>
            )}
          </DashboardPageContainer>
        </main>
      </div>

      <SlotDrawer open={drawer.open} onOpenChange={(open) => setDrawer((current) => ({ ...current, open }))} slot={drawer.slot} sedi={sedi} operatori={operatori} onSubmit={salva} />

      {confirmDialog}
    </div>
  );
}
