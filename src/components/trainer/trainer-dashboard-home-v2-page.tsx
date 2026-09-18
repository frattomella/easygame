"use client";

import { trainingDisplayTitle } from "@/lib/events/training-presenter";
import {
  AlertTriangle,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  LayoutGrid,
  ListChecks,
  MapPin,
  Trophy,
  UserCircle,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { MatchCertificateWarningBadge } from "@/components/matches/MatchCertificateWarningBadge";
import { PageHeading } from "@/components/dashboard/page-heading";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { ACTIVITY_STATUS, type StatusSpec } from "@/lib/web/status";
import { Button } from "@/components/ui/button";
import { TrainerWeeklyMatchesWidget } from "@/components/trainer/TrainerWeeklyMatchesWidget";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import {
  CompactEntityCard,
  SectionBlockedState,
  SectionEmptyState,
  SummaryCard,
  SurfacePanel,
  formatDate,
  formatTimeRange,
  getAthleteDisplayName,
  getStatusBadgeClasses,
} from "@/components/trainer/trainer-dashboard-shared";
import {
  compareTrainerRecordsByStart,
  isSameTrainerDay,
} from "@/lib/trainer-dashboard-helpers";
import { getTrainingStableKey } from "@/lib/training-utils";
import { formatMatchLocationLabel } from "@/lib/match-location";
import {
  getMatchConvocationLabel,
  getMatchConvocationStatus,
  getTrainerRecordAthletes,
  getTrainingAttendanceLabel,
  getTrainingAttendanceStatus,
  isTrainingMissingAttendance,
} from "@/lib/trainer-operational-alerts";
import { getInvalidCertificatesForConvocatedAthletes } from "@/lib/match-certificate-warnings";
import { isCancelledEvent } from "@/lib/events/model";
import { cn } from "@/lib/utils";

/* La pillola delle convocazioni: il conteggio e la parola, nel tono dello stato. */
const convocationPillSpec = (state: string, count: string): StatusSpec => {
  if (state === "convocations_complete") return { label: `${count} CONVOCATI`, weight: "solid", hue: "green" };
  if (state === "convocations_missing") return { label: `${count} CONVOCATI`, weight: "urgent", hue: "red" };
  return { label: `${count} CONVOCATI`, weight: "outline", hue: "blue" };
};

export default function TrainerDashboardHomeV2Page() {
  const router = useRouter();
  const {
    assignedAthletes,
    assignedCategories,
    categories,
    categoryDisplay,
    matchConvocationDeadlineDays,
    operationalAlerts,
    permissions,
    trainerProfile,
    user,
    visibleMatches,
    visibleTrainings,
  } = useTrainerDashboard();

  if (!permissions.navigation.home) {
    return <SectionBlockedState section="home" />;
  }

  const now = new Date();

  /*
    **«Lo conto?» e «lo mostro?» sono due domande, e questa bacheca risponde
    alla prima** (P0-3, `D-AUD-20`).

    Il contesto chiede ora il calendario con `include_cancelled=1`, ed e
    giusto: la pastiglia «Annullato» e il ripristino vivono sulla riga
    annullata, e senza quella riga non esistono piu. Ma da quella deroga
    discende che gli annullati entrano in `visibleTrainings` e
    `visibleMatches` — e qui non serviva mostrarli, serviva **contarli**.

    L'effetto: «Allenamenti di oggi: 3» con due annullati per maltempo, e in
    «Prossimi impegni» un allenamento annullato accanto a uno in programma,
    **indistinguibile** — la pastiglia di quel riquadro e la stringa fissa
    «Allenamento». Un allenatore legge «quando torno in campo» e ci trova una
    seduta che non ci sara.

    Gli annullati restano dove servono: la pagina Allenamenti della bacheca li
    disegna con la loro pastiglia, ed e da li che si ripristinano.
  */
  const impegniTrainings = visibleTrainings.filter(
    (training: any) => !isCancelledEvent(training),
  );
  const impegniMatches = visibleMatches.filter(
    (match: any) => !isCancelledEvent(match),
  );

  const todayTrainings = impegniTrainings
    .filter((training) => isSameTrainerDay(training?.startsAt, now))
    .sort(compareTrainerRecordsByStart);
  const todayMatches = impegniMatches
    .filter((match) => isSameTrainerDay(match?.startsAt, now))
    .sort(compareTrainerRecordsByStart);
  /*
    **I prossimi impegni, che erano scritti e nascosti** (P0-7, `D-INT-11`).

    La home rispondeva a «che cosa succede **oggi**»: due riquadri sul giorno
    corrente e l'agenda gare della settimana. Cio che un allenatore chiede
    aprendo la bacheca il martedi — «quando torno in campo, e con chi» — non
    c'era. Il codice per disegnarlo c'era: viveva dentro un `div` con la classe
    `hidden` e leggeva un `nextMatches` inizializzato a elenco vuoto. E la
    forma di difetto che CLAUDE.md §11.8 descrive: non manca il codice, manca
    la strada che ci arriva.

    Allenamenti e gare stanno **insieme** e in ordine di orario, perche la
    settimana di un allenatore e una sola: separarli lo costringe a leggere due
    elenchi e fondere le date a mente.

    Oggi resta fuori: ha gia i suoi due riquadri, e ripeterlo qui farebbe
    scorrere le stesse righe due volte su un telefono.
  */
  const prossimiImpegni = [
    ...impegniTrainings.map((record: any) => ({ record, gara: false })),
    ...impegniMatches.map((record: any) => ({ record, gara: true })),
  ]
    .filter(
      ({ record }) =>
        record?.startsAt &&
        record.startsAt > now &&
        !isSameTrainerDay(record.startsAt, now),
    )
    /*
      Che cosa sia lo si sa da **dove viene**, non da un campo da indovinare:
      i due elenchi arrivano gia separati dal contesto.
    */
    .sort((sinistra, destra) =>
      compareTrainerRecordsByStart(sinistra.record, destra.record),
    )
    .slice(0, 6);

  const matchOfTheDay = todayMatches[0] || null;
  const trainerDisplayName =
    trainerProfile?.name ||
    user?.user_metadata?.name ||
    user?.user_metadata?.firstName ||
    user?.email?.split("@")[0] ||
    "Allenatore";
  const trainerFirstName =
    String(trainerDisplayName).trim().split(/\s+/)[0] || "Allenatore";

  const getAthletesForRecord = (record: any) =>
    getTrainerRecordAthletes({
      record,
      assignedAthletes,
      assignedCategories,
      categories,
    });

  return (
    <div className="space-y-6 pb-2">
      <PageHeading eyebrow="Area allenatore" title={`Bentornato, ${trainerFirstName}`} subtitle="Hai tutto pronto per presenze e convocazioni." />

      {/*
        **Le cinque chiavi `permissions.widgets.*`, finalmente lette** (W6-29).

        Erano configurabili in `/permissions` e non le interrogava nessuno: un
        club poteva spuntarle e non succedeva niente — e tre di loro nominavano
        riquadri che la home V2 aveva **smesso di disegnare**, quindi non
        sarebbe bastato leggerle. Qui i riquadri tornano, e le chiavi decidono
        se compaiono.
      */}
      {permissions.widgets.summary ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            icon={Users}
            label="Squadre seguite"
            value={assignedCategories.length}
            accentClassName="bg-egw-tint-blue text-egw-blue-700"
          />
          <SummaryCard
            icon={UserCircle}
            label="Atleti nel perimetro"
            value={assignedAthletes.length}
            accentClassName="bg-egw-tint-green text-egw-green"
          />
          <SummaryCard
            icon={CalendarDays}
            label="Allenamenti di oggi"
            value={todayTrainings.length}
            accentClassName="bg-egw-tint-blue text-egw-indigo"
          />
          <SummaryCard
            icon={Trophy}
            label="Gare di oggi"
            value={todayMatches.length}
            accentClassName="bg-egw-tint-orange text-egw-orange"
          />
        </div>
      ) : null}

      {matchOfTheDay ? (
        <section className="relative overflow-hidden rounded-egw-panel border border-egw-panel-border bg-egw-panel p-5 shadow-egw-plane-1 md:p-6">
          <div aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-egw-match" />
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-orange">Gara</p>
                <h2 className="mt-1 font-brand text-[24px] font-extrabold leading-[1.1] tracking-[var(--egw-track-display)] text-egw-ink">
                  Gara di oggi
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-egw-field border border-egw-hairline bg-egw-page-100 px-4 py-3">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">
                    <Trophy className="h-3.5 w-3.5" />
                    Categoria
                  </div>
                  <p className="mt-1 font-semibold text-egw-ink">
                    {matchOfTheDay.displayCategory ||
                      matchOfTheDay.category ||
                      "Categoria"}
                  </p>
                </div>
                <div className="rounded-egw-field border border-egw-hairline bg-egw-page-100 px-4 py-3">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">
                    <Clock3 className="h-3.5 w-3.5" />
                    Orario
                  </div>
                  <p className="mt-1 font-semibold text-egw-ink">
                    {formatTimeRange(matchOfTheDay.time)}
                  </p>
                </div>
                <div className="rounded-egw-field border border-egw-hairline bg-egw-page-100 px-4 py-3 sm:col-span-2">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">
                    <MapPin className="h-3.5 w-3.5" />
                    Luogo
                  </div>
                  <p className="mt-1 font-semibold text-egw-ink">
                    {formatMatchLocationLabel(matchOfTheDay)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-egw-field border border-egw-hairline bg-egw-page-100 p-4">
              {(() => {
                const matchAthletes = getAthletesForRecord(matchOfTheDay);
                const convocationStatus = getMatchConvocationStatus({
                  match: matchOfTheDay,
                  totalAthletes: matchAthletes.length,
                  deadlineDays: matchConvocationDeadlineDays,
                  now,
                });
                const certificateWarning = getInvalidCertificatesForConvocatedAthletes(
                  matchOfTheDay,
                  assignedAthletes,
                );

                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-egw-ink-72">
                        Convocazioni
                      </p>
                      <StatusPill
                        size="sm"
                        status={{
                          label: `${convocationStatus.convocated}/${convocationStatus.total} CONVOCATI`,
                          weight: convocationStatus.state === "convocations_missing" ? "urgent" : "outline",
                          hue: convocationStatus.state === "convocations_missing" ? "red" : "blue",
                        }}
                      />
                    </div>
                    <MatchCertificateWarningBadge warning={certificateWarning} />
                    <p className="text-xl font-semibold text-egw-ink">
                      {getMatchConvocationLabel(convocationStatus.state)}
                    </p>
                    <Button
                      className="w-full rounded-egw-panel-sm bg-egw-blue text-white hover:bg-egw-blue-700"
                      onClick={() =>
                        router.push(
                          `/trainer-dashboard/matches?focus=${matchOfTheDay.id}`,
                        )
                      }
                    >
                      <ListChecks className="mr-2 h-4 w-4" />
                      Gestisci convocazioni
                    </Button>
                  </div>
                );
              })()}
            </div>
          </div>
        </section>
      ) : null}

      {operationalAlerts.length > 0 ? (
        <SurfacePanel
          title="Da completare"
          icon={AlertTriangle}
          className="border-egw-tint-red-bd bg-egw-tint-red shadow-egw-plane-1"
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {operationalAlerts.slice(0, 6).map((alert) => (
              <button
                key={alert.key}
                type="button"
                onClick={() => router.push(alert.actionHref)}
                className="rounded-egw-panel-sm border border-egw-tint-red-bd bg-white px-4 py-3 text-left shadow-egw-plane-1 transition hover:border-egw-tint-red-bd hover:bg-egw-tint-red"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-egw-field bg-egw-tint-red text-egw-red">
                    {alert.type === "missing_attendance" ? (
                      <ClipboardCheck className="h-4 w-4" />
                    ) : (
                      <ListChecks className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-egw-ink">
                      {alert.title}
                    </span>
                    <span className="mt-1 block text-sm text-egw-ink-72">
                      {alert.message}
                    </span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        </SurfacePanel>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        {permissions.widgets.upcomingTrainings ? (
        <SurfacePanel
          title="Allenamenti di oggi"
          icon={CalendarDays}
          action={
            <Button
              variant="outline"
              className="rounded-egw-panel-sm"
              onClick={() => router.push("/trainer-dashboard/trainings")}
            >
              Storico
            </Button>
          }
        >
          {todayTrainings.length > 0 ? (
            <div className="space-y-3">
              {todayTrainings.map((training) => {
                const status = getStatusBadgeClasses(
                  training?.status,
                  training?.startsAt,
                  training?.endsAt,
                );
                const trainingAthletes = getAthletesForRecord(training);
                const attendanceStatus = getTrainingAttendanceStatus(
                  training,
                  trainingAthletes,
                );
                const missingAttendance = isTrainingMissingAttendance(
                  training,
                  trainingAthletes,
                  now,
                );

                return (
                  <CompactEntityCard
                    key={getTrainingStableKey(training)}
                    title={trainingDisplayTitle(training)}
                    className={
                      missingAttendance
                        ? "border-egw-tint-red-bd bg-egw-tint-red"
                        : undefined
                    }
                    badge={
                      <StatusPill status={status.spec} size="sm" />
                    }
                    lines={[
                      <span key="category">
                        <DataChip>
                          {training.displayCategory ||
                            training.category ||
                            "Categoria"}
                        </DataChip>
                      </span>,
                      <span key="time">
                        {formatTimeRange(training.time, training.endTime)}
                      </span>,
                      <span key="location">
                        {training.location || "Luogo da definire"}
                      </span>,
                      <span key="attendance" className="font-medium">
                        {attendanceStatus.present}/{attendanceStatus.total} ·{" "}
                        {getTrainingAttendanceLabel(attendanceStatus.state)}
                      </span>,
                    ]}
                    footer={
                      missingAttendance ? (
                        <div className="flex items-center gap-2 text-sm font-medium text-egw-red">
                          <AlertTriangle className="h-4 w-4" />
                          Completa le presenze
                        </div>
                      ) : null
                    }
                    actions={
                      permissions.actions.manageAttendance ? (
                        <Button
                          size="sm"
                          className="bg-egw-blue hover:bg-egw-blue-700"
                          onClick={() =>
                            router.push(
                              `/trainer-dashboard/trainings?focus=${training.id}`,
                            )
                          }
                        >
                          <ClipboardCheck className="mr-2 h-4 w-4" />
                          {attendanceStatus.state === "missing"
                            ? "Prendi presenze"
                            : "Modifica presenze"}
                        </Button>
                      ) : undefined
                    }
                  />
                );
              })}
            </div>
          ) : (
            <SectionEmptyState
              title="Nessun allenamento oggi"
              description="La giornata è libera."
            />
          )}
        </SurfacePanel>
        ) : null}

        {permissions.widgets.upcomingMatches ? (
        <SurfacePanel
          title="Agenda gare settimanale"
          icon={Trophy}
          action={
            <Button
              variant="outline"
              className="rounded-egw-panel-sm"
              onClick={() => router.push("/trainer-dashboard/matches")}
            >
              Apri gare
            </Button>
          }
        >
          <TrainerWeeklyMatchesWidget
            matches={visibleMatches}
            athletes={assignedAthletes}
            onSelectMatch={(match) =>
              router.push(`/trainer-dashboard/matches?focus=${match.id}`)
            }
          />
        </SurfacePanel>
        ) : null}
      </div>

      {/*
        **Prossimi impegni** (P0-7, `D-INT-11`): allenamenti e gare insieme, in
        ordine di orario. Vedi il commento su `prossimiImpegni`.
      */}
      <SurfacePanel
        title="Prossimi impegni"
        icon={Clock3}
        action={
          <Button
            variant="outline"
            className="rounded-egw-panel-sm"
            onClick={() => router.push("/trainer-dashboard/trainings")}
          >
            Apri calendario
          </Button>
        }
      >
        {prossimiImpegni.length > 0 ? (
          <div
            className="space-y-3"
            data-testid="prossimi-impegni"
          >
            {prossimiImpegni.map(({ record: impegno, gara: eGara }) => {
              const atleti = getAthletesForRecord(impegno);
              const convocazioni = eGara
                ? getMatchConvocationStatus({
                    match: impegno,
                    totalAthletes: atleti.length,
                    deadlineDays: matchConvocationDeadlineDays,
                    now,
                  })
                : null;
              const avvisoCertificati = eGara
                ? getInvalidCertificatesForConvocatedAthletes(
                    impegno,
                    assignedAthletes,
                  )
                : null;
              const destinazione = eGara
                ? `/trainer-dashboard/matches?focus=${impegno.id}`
                : `/trainer-dashboard/trainings?focus=${impegno.id}`;

              return (
                <CompactEntityCard
                  key={`${eGara ? "gara" : "allenamento"}:${getTrainingStableKey(impegno)}`}
                  title={
                    eGara
                      ? impegno.title || `vs ${impegno.opponent || "Gara"}`
                      : trainingDisplayTitle(impegno)
                  }
                  badge={
                    <StatusPill
                      size="sm"
                      status={
                        eGara
                          ? convocationPillSpec(
                              convocazioni?.state || "not_due_yet",
                              `${convocazioni?.convocated ?? 0}/${convocazioni?.total ?? 0}`,
                            )
                          : ACTIVITY_STATUS.training
                      }
                    />
                  }
                  lines={[
                    <span key="quando" className="font-medium text-egw-ink-72">
                      {formatDate(impegno.date)} ·{" "}
                      {formatTimeRange(impegno.time, impegno.endTime)}
                    </span>,
                    <span key="categoria">
                      {impegno.displayCategory ||
                        impegno.category ||
                        "Categoria"}
                    </span>,
                    <span key="dove">
                      {eGara
                        ? formatMatchLocationLabel(impegno)
                        : impegno.location || "Luogo da definire"}
                    </span>,
                    ...(eGara && convocazioni
                      ? [
                          <span key="convocazioni">
                            {getMatchConvocationLabel(convocazioni.state)}
                          </span>,
                        ]
                      : []),
                    ...(avvisoCertificati?.hasInvalidCertificates
                      ? [
                          <span key="certificati">
                            <MatchCertificateWarningBadge
                              warning={avvisoCertificati}
                            />
                          </span>,
                        ]
                      : []),
                  ]}
                  actions={
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => router.push(destinazione)}
                    >
                      {eGara ? (
                        <>
                          <ListChecks className="mr-2 h-4 w-4" />
                          Convocazioni
                        </>
                      ) : (
                        <>
                          <CalendarDays className="mr-2 h-4 w-4" />
                          Apri
                        </>
                      )}
                    </Button>
                  }
                  onClick={() => router.push(destinazione)}
                />
              );
            })}
          </div>
        ) : (
          <SectionEmptyState
            title="Nessun impegno in programma"
            description="Dopo oggi il calendario e libero."
          />
        )}
      </SurfacePanel>

      {permissions.widgets.assignedCategories ||
      permissions.widgets.assignedAthletes ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {permissions.widgets.assignedCategories ? (
            <SurfacePanel
              title="Le mie squadre"
              description="Le categorie e i gruppi che il club ti ha assegnato."
              icon={LayoutGrid}
              action={
                <Button
                  variant="outline"
                  className="rounded-egw-panel-sm"
                  onClick={() => router.push("/trainer-dashboard/categories")}
                >
                  Apri squadre
                </Button>
              }
            >
              {assignedCategories.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {assignedCategories.map((category: any) => (
                    <DataChip key={category?.id || category?.name}>
                      {category?.id
                        ? categoryDisplay.label({ categoryId: category.id, categoryName: category.name })
                        : category?.name || "Categoria"}
                    </DataChip>
                  ))}
                </div>
              ) : (
                <SectionEmptyState
                  title="Nessuna squadra assegnata"
                  description="Finché il club non completa la tua scheda non vedi né atleti né calendario."
                />
              )}
            </SurfacePanel>
          ) : null}

          {permissions.widgets.assignedAthletes ? (
            <SurfacePanel
              title="I miei atleti"
              description="Anteprima del roster nel tuo perimetro."
              icon={UserCircle}
              action={
                <Button
                  variant="outline"
                  className="rounded-egw-panel-sm"
                  onClick={() => router.push("/trainer-dashboard/athletes")}
                >
                  Apri atleti
                </Button>
              }
            >
              {assignedAthletes.length > 0 ? (
                <ul className="space-y-1 text-sm text-egw-ink-72">
                  {assignedAthletes.slice(0, 8).map((athlete: any) => (
                    <li
                      key={athlete?.id}
                      className="rounded-egw-field border border-egw-rule bg-white px-3 py-2"
                    >
                      {getAthleteDisplayName(athlete)}
                    </li>
                  ))}
                  {assignedAthletes.length > 8 ? (
                    <li className="px-3 py-1 text-xs text-egw-ink-62">
                      e altri {assignedAthletes.length - 8}
                    </li>
                  ) : null}
                </ul>
              ) : (
                <SectionEmptyState
                  title="Nessun atleta"
                  description="Il tuo perimetro non contiene ancora atleti."
                />
              )}
            </SurfacePanel>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
