import type {
  PublicEvent,
  PublicMatch,
  PublicPerson,
  PublicStandings,
  PublicTeam,
  PublicTeamStats,
} from "@/lib/website/public-dto";
import { itemGridClasses } from "@/lib/website/style-classes";
import { buildMapEmbedSrc } from "@/lib/website/embed";
import { BlockTitle, DateTime, EmptyState, Icon, InternalLink, SiteButton, SiteImage, imageFromPublic, imageFromRef, formatLongDay, formatTime } from "../primitives";
import { Countdown } from "../islands/Countdown";
import { Carousel } from "../islands/Carousel";
import { ConsentFrame } from "../islands/ConsentFrame";
import { Crest, MatchFace, MatchMeta, MatchRow, OutcomePill, PeriodLine, PeriodTable, PersonCard, Placeholder, ScoreBadge } from "./sport-parts";
import { dataOf, reasonOf, type BlockRenderer } from "./types";

/**
 * I renderer dei blocchi sportivi. I dati sono gia DTO pubblici: niente qui
 * vede un atleta che il club non ha pubblicato, e nessun numero si calcola
 * oltre a quelli che il risolutore ha gia restituito.
 */

const monthLabel = (iso: string, timezone: string) =>
  new Intl.DateTimeFormat("it-IT", { timeZone: timezone, month: "long", year: "numeric" }).format(new Date(iso));

const MatchCollection = ({
  matches,
  props,
  context,
  groupByMonth = false,
}: {
  matches: PublicMatch[];
  props: any;
  context: Parameters<BlockRenderer>[0]["context"];
  groupByMonth?: boolean;
}) => {
  if (props.layout === "table") {
    return (
      <div className="overflow-x-auto rounded-ws border border-ws-border">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="bg-ws-muted text-left text-ws-muted-fg">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Data</th>
              <th scope="col" className="px-4 py-3 font-medium">Gara</th>
              <th scope="col" className="px-4 py-3 text-center font-medium">Risultato</th>
              {props.showVenue ? <th scope="col" className="px-4 py-3 font-medium">Luogo</th> : null}
              {props.showCompetition ? <th scope="col" className="px-4 py-3 font-medium">Competizione</th> : null}
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => (
              <tr key={match.id} className="border-t border-ws-border">
                <td className="whitespace-nowrap px-4 py-3"><DateTime iso={match.startsAt} timezone={match.timezone} mode="day" /> · {formatTime(match.startsAt, match.timezone)}</td>
                <td className="px-4 py-3 font-semibold">
                  <InternalLink href={match.href} context={context} className="hover:underline">{match.home.name} – {match.away.name}</InternalLink>
                </td>
                <td className="px-4 py-3 text-center">{match.result ? `${match.result.home}-${match.result.away}` : match.status === "cancelled" ? "Annullata" : "—"}</td>
                {props.showVenue ? <td className="px-4 py-3">{match.venue?.name || ""}</td> : null}
                {props.showCompetition ? <td className="px-4 py-3">{match.competition?.shortName || ""}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const render = (list: PublicMatch[]) =>
    props.layout === "cards" ? (
      <div className={`grid gap-4 ${itemGridClasses({ desktop: 3 })}`}>
        {list.map((match) => (
          <MatchRow key={match.id} match={match} context={context} showVenue={props.showVenue} showCompetition={props.showCompetition} showPeriods={props.showPeriods} />
        ))}
      </div>
    ) : (
      <div className="space-y-3">
        {list.map((match) => (
          <MatchRow key={match.id} match={match} context={context} showVenue={props.showVenue} showCompetition={props.showCompetition} showPeriods={props.showPeriods} />
        ))}
      </div>
    );
  if (!groupByMonth) return render(matches);
  const groups = new Map<string, PublicMatch[]>();
  for (const match of matches) {
    const key = monthLabel(match.startsAt, match.timezone);
    groups.set(key, [...(groups.get(key) || []), match]);
  }
  return (
    <div className="space-y-8">
      {Array.from(groups.entries()).map(([label, list]) => (
        <section key={label} aria-label={label}>
          <h3 className="mb-3 font-heading text-lg font-bold capitalize">{label}</h3>
          {render(list)}
        </section>
      ))}
    </div>
  );
};

export const NextMatchRenderer: BlockRenderer = ({ props, context, data }) => {
  const match = dataOf<PublicMatch | null>(data, null);
  if (!match) {
    return (
      <div>
        <BlockTitle title={props.title} />
        <EmptyState message={props.emptyMessage} hint={reasonOf(data)} context={context} />
      </div>
    );
  }
  const meta = (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm opacity-90">
      {props.showDate ? <span className="inline-flex items-center gap-1"><Icon name="calendar" className="h-4 w-4" /><DateTime iso={match.startsAt} timezone={match.timezone} mode="long" /></span> : null}
      {props.showTime ? <span className="inline-flex items-center gap-1"><Icon name="clock" className="h-4 w-4" />{formatTime(match.startsAt, match.timezone)}</span> : null}
      {props.showVenue && match.venue ? <span className="inline-flex items-center gap-1"><Icon name="map-pin" className="h-4 w-4" />{match.venue.name}</span> : null}
      {props.showCompetition && match.competition ? <span>{match.competition.name}{match.round ? ` · ${match.round}` : ""}</span> : null}
    </div>
  );
  if (props.layout === "compact") {
    return (
      <div>
        <BlockTitle title={props.title} />
        <MatchRow match={match} context={context} showVenue={props.showVenue} showCompetition={props.showCompetition} />
      </div>
    );
  }
  const box = props.layout === "banner" ? "rounded-ws-lg bg-ws-secondary p-6 text-ws-secondary-ink md:p-10" : "rounded-ws-lg border border-ws-border bg-ws-bg p-6 md:p-8";
  return (
    <div>
      <BlockTitle title={props.title} />
      <InternalLink href={match.href} context={context} className={`block ${box}`}>
        {props.showLogos ? <MatchFace match={match} /> : <p className="text-center font-heading text-2xl font-bold">{match.home.name} – {match.away.name}</p>}
        <div className="mt-6">{meta}</div>
        {props.showCountdown ? <div className="mt-4 flex justify-center"><Countdown target={match.startsAt} /></div> : null}
      </InternalLink>
      {props.cta?.label ? <div className="mt-4 flex justify-center"><SiteButton label={props.cta.label} link={props.cta.link} context={context} /></div> : null}
    </div>
  );
};

export const MatchHeroRenderer: BlockRenderer = ({ props, context, data }) => {
  const match = dataOf<PublicMatch | null>(data, null);
  const background = imageFromRef(props.background, context);
  return (
    <div className="relative overflow-hidden px-4 py-16 text-white md:py-24">
      {background ? <SiteImage image={background} sizes="100vw" className="absolute inset-0 h-full w-full" priority decorative /> : null}
      <div className="absolute inset-0 bg-ws-dark" style={{ opacity: background ? Number(props.overlay) / 100 : 1 }} aria-hidden="true" />
      <div className="relative mx-auto max-w-ws-container text-center">
        {props.eyebrow ? <p className="mb-6 text-sm font-semibold uppercase tracking-[0.3em] text-ws-accent">{props.eyebrow}</p> : null}
        {match ? (
          <>
            <MatchFace match={match} tone="light" />
            <p className="mt-8 text-lg font-semibold">
              <DateTime iso={match.startsAt} timezone={match.timezone} mode="long" /> · ore {formatTime(match.startsAt, match.timezone)}
            </p>
            {match.venue ? <p className="mt-1 opacity-90">{match.venue.name}{match.venue.address ? ` — ${match.venue.address}` : ""}</p> : null}
            {match.competition ? <p className="mt-1 text-sm uppercase tracking-wider opacity-80">{match.competition.name}{match.round ? ` · ${match.round}` : ""}</p> : null}
            {props.showCountdown && !match.result ? <div className="mt-8 flex justify-center"><Countdown target={match.startsAt} tone="light" /></div> : null}
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {match.href ? <a href={context.links.pathPrefix ? `${context.links.pathPrefix}${match.href}` : match.href} className="ws-btn ws-btn-outline">Dettagli della gara</a> : null}
              {props.cta?.label ? <SiteButton label={props.cta.label} link={props.cta.link} context={context} variant="accent" /> : null}
            </div>
          </>
        ) : (
          <p className="text-xl opacity-90">{props.emptyMessage}</p>
        )}
      </div>
    </div>
  );
};

const listRenderer = (groupByMonth: (props: any) => boolean): BlockRenderer =>
  function MatchListBlock({ props, context, data }) {
  const matches = dataOf<PublicMatch[]>(data, []);
  return (
    <div>
      <BlockTitle title={props.title} />
      {matches.length ? (
        <MatchCollection matches={matches} props={props} context={context} groupByMonth={groupByMonth(props)} />
      ) : (
        <EmptyState message={props.emptyMessage} hint={reasonOf(data)} context={context} />
      )}
    </div>
  );
};

export const MatchListRenderer = listRenderer((props) => Boolean(props.groupByMonth) && props.layout !== "table");
export const UpcomingMatchesRenderer = listRenderer(() => false);
export const RecentResultsRenderer = listRenderer(() => false);

export const LastMatchRenderer: BlockRenderer = ({ props, context, data }) => {
  const match = dataOf<PublicMatch[]>(data, [])[0];
  if (!match) {
    return (
      <div>
        <BlockTitle title={props.title} />
        <EmptyState message={props.emptyMessage} hint={reasonOf(data)} context={context} />
      </div>
    );
  }
  const box = props.layout === "banner" ? "rounded-ws-lg bg-ws-secondary p-6 text-ws-secondary-ink md:p-10" : "rounded-ws-lg border border-ws-border bg-ws-bg p-6";
  return (
    <div>
      <BlockTitle title={props.title} />
      <div className={box}>
        <MatchMeta match={match} showVenue={props.showVenue} showCompetition />
        <div className="mt-4"><MatchFace match={match} /></div>
        <div className="mt-3 flex justify-center"><OutcomePill match={match} /></div>
        {props.showPeriods ? <div className="mt-4"><PeriodTable match={match} /></div> : null}
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {props.showRecap && match.recapHref ? <InternalLink href={match.recapHref} context={context} className="ws-link font-semibold">Leggi il resoconto</InternalLink> : null}
          {match.href ? <InternalLink href={match.href} context={context} className="ws-link font-semibold">Dettagli</InternalLink> : null}
        </div>
      </div>
    </div>
  );
};

export const MatchDetailRenderer: BlockRenderer = ({ props, context, data }) => {
  const detail = dataOf<{ match: PublicMatch; convocated: PublicPerson[]; stats: Array<{ person: PublicPerson; values: Record<string, number> }> } | null>(data, null);
  if (!detail) return <EmptyState message="Gara non trovata." hint={reasonOf(data)} context={context} />;
  const { match } = detail;
  const statKeys = context.data.sport.stats.filter((stat) => detail.stats.some((row) => row.values[stat.key] !== undefined));
  return (
    <article>
      <header className="text-center">
        {match.competition ? <p className="text-sm font-semibold uppercase tracking-widest text-ws-primary">{match.competition.name}{match.round ? ` · ${match.round}` : ""}</p> : null}
        <h1 className="sr-only">{match.home.name} contro {match.away.name}</h1>
        <div className="mt-6"><MatchFace match={match} /></div>
        <div className="mt-3 flex justify-center"><OutcomePill match={match} /></div>
        <p className="mt-4 text-ws-muted-fg">
          <DateTime iso={match.startsAt} timezone={match.timezone} mode="long" /> · ore {formatTime(match.startsAt, match.timezone)}
        </p>
        {props.showVenue && match.venue ? <p className="text-ws-muted-fg">{match.venue.name}{match.venue.address ? ` — ${match.venue.address}` : ""}</p> : null}
      </header>
      {props.showPeriods && match.periods.length ? <section className="mt-10" aria-label="Parziali"><PeriodTable match={match} /></section> : null}
      {props.showStats && detail.stats.length && statKeys.length ? (
        <section className="mt-10" aria-labelledby="ws-match-stats">
          <h2 id="ws-match-stats" className="mb-4 font-heading text-2xl font-bold">Statistiche</h2>
          <div className="overflow-x-auto rounded-ws border border-ws-border">
            <table className="w-full min-w-[32rem] text-sm tabular-nums">
              <thead className="bg-ws-muted text-ws-muted-fg">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left font-medium">Giocatore</th>
                  {statKeys.map((stat) => <th key={stat.key} scope="col" className="px-3 py-2 font-medium" title={stat.label}>{stat.short}</th>)}
                </tr>
              </thead>
              <tbody>
                {detail.stats.map((row) => (
                  <tr key={row.person.id} className="border-t border-ws-border">
                    <th scope="row" className="px-4 py-2 text-left font-semibold">{row.person.jerseyNumber ? `#${row.person.jerseyNumber} ` : ""}{row.person.displayName}</th>
                    {statKeys.map((stat) => <td key={stat.key} className="px-3 py-2 text-center">{row.values[stat.key] ?? "–"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {props.showRoster && detail.convocated.length ? (
        <section className="mt-10" aria-labelledby="ws-match-roster">
          <h2 id="ws-match-roster" className="mb-4 font-heading text-2xl font-bold">Convocati</h2>
          <div className={`grid gap-3 ${itemGridClasses({ desktop: 4, tablet: 3, mobile: 1 })}`}>
            {detail.convocated.map((person) => <PersonCard key={person.id} person={person} context={context} variant="compact" />)}
          </div>
        </section>
      ) : null}
      {match.recapHref ? <p className="mt-10 text-center"><InternalLink href={match.recapHref} context={context} className="ws-btn ws-btn-primary">Leggi il resoconto della gara</InternalLink></p> : null}
    </article>
  );
};

export const StandingsRenderer: BlockRenderer = ({ props, context, data }) => {
  const standings = dataOf<PublicStandings | null>(data, null);
  if (!standings || !standings.rows.length) {
    return (
      <div>
        <BlockTitle title={props.title} />
        <EmptyState message={props.emptyMessage} hint={reasonOf(data)} context={context} />
      </div>
    );
  }
  const has = (key: keyof PublicStandings["rows"][number]) => standings.rows.some((row) => row[key] !== null);
  const columns = (props.compact ? ["played", "points"] : ["played", "won", "drawn", "lost", "pointsFor", "pointsAgainst", "points"]).filter((key) => has(key as any));
  const labels: Record<string, string> = { played: "G", won: "V", drawn: "N", lost: "P", pointsFor: "F", pointsAgainst: "S", points: "Pt" };
  const titles: Record<string, string> = { played: "Giocate", won: "Vinte", drawn: "Pareggiate", lost: "Perse", pointsFor: "Fatti", pointsAgainst: "Subiti", points: "Punti" };
  return (
    <div>
      <BlockTitle title={props.title} subtitle={standings.competition.name} />
      <div className="overflow-x-auto rounded-ws border border-ws-border">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Classifica {standings.competition.name}</caption>
          <thead className="bg-ws-muted text-ws-muted-fg">
            <tr>
              <th scope="col" className="w-10 px-3 py-2 text-left font-medium">#</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Squadra</th>
              {columns.map((key) => <th key={key} scope="col" className="px-3 py-2 text-center font-medium" title={titles[key]}>{labels[key]}</th>)}
            </tr>
          </thead>
          <tbody>
            {standings.rows.map((row) => (
              <tr key={`${row.position}-${row.team}`} className={`border-t border-ws-border ${props.highlightClub && row.isClub ? "bg-ws-primary/10 font-bold" : ""}`}>
                <td className="px-3 py-2">{row.position}</td>
                <th scope="row" className="px-3 py-2 text-left font-semibold">{row.team}</th>
                {columns.map((key) => <td key={key} className="px-3 py-2 text-center">{(row as any)[key] ?? "–"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {standings.updatedAt ? <p className="mt-2 text-xs text-ws-muted-fg">Aggiornata al {formatLongDay(standings.updatedAt)}</p> : null}
    </div>
  );
};

const EventRow = ({ event, context }: { event: PublicEvent; context: Parameters<BlockRenderer>[0]["context"] }) => (
  <InternalLink href={event.href} context={context} className="flex items-center gap-4 rounded-ws border border-ws-border bg-ws-bg p-4 hover:shadow-md">
    <div className="w-16 shrink-0 rounded-ws bg-ws-primary py-2 text-center text-ws-primary-ink">
      <p className="text-xs uppercase">{new Intl.DateTimeFormat("it-IT", { timeZone: event.timezone, month: "short" }).format(new Date(event.startsAt))}</p>
      <p className="font-heading text-2xl font-bold leading-none">{new Intl.DateTimeFormat("it-IT", { timeZone: event.timezone, day: "numeric" }).format(new Date(event.startsAt))}</p>
    </div>
    <div className="min-w-0">
      <p className="truncate font-semibold">{event.title}</p>
      <p className="text-sm text-ws-muted-fg">
        {formatTime(event.startsAt, event.timezone)}
        {event.venue ? ` · ${event.venue.name}` : ""}
        {event.kind === "training" ? " · Allenamento" : ""}
      </p>
    </div>
  </InternalLink>
);

export const EventsListRenderer: BlockRenderer = ({ props, context, data }) => {
  const events = dataOf<PublicEvent[]>(data, []);
  return (
    <div>
      <BlockTitle title={props.title} />
      {events.length ? (
        <div className={props.layout === "cards" ? `grid gap-4 ${itemGridClasses({ desktop: 3 })}` : "space-y-3"}>
          {events.map((event) => <EventRow key={event.id} event={event} context={context} />)}
        </div>
      ) : (
        <EmptyState message={props.emptyMessage} hint={reasonOf(data)} context={context} />
      )}
    </div>
  );
};

export const EventDetailRenderer: BlockRenderer = ({ props, context, data }) => {
  const event = dataOf<PublicEvent | null>(data, null);
  if (!event) return <EmptyState message="Evento non trovato." hint={reasonOf(data)} context={context} />;
  return (
    <article>
      <p className="text-sm font-semibold uppercase tracking-widest text-ws-primary">{event.kind === "match" ? "Gara" : "Allenamento"}</p>
      <h1 className="mt-2 font-heading text-3xl font-bold md:text-4xl">{event.title}</h1>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div><dt className="text-xs uppercase text-ws-muted-fg">Quando</dt><dd className="font-semibold"><DateTime iso={event.startsAt} timezone={event.timezone} mode="full" /></dd></div>
        {event.venue ? <div><dt className="text-xs uppercase text-ws-muted-fg">Dove</dt><dd className="font-semibold">{event.venue.name}{event.venue.address ? `, ${event.venue.address}` : ""}</dd></div> : null}
        {event.team ? <div><dt className="text-xs uppercase text-ws-muted-fg">Squadra</dt><dd className="font-semibold"><InternalLink href={event.team.href} context={context} className="ws-link">{event.team.name}</InternalLink></dd></div> : null}
      </dl>
      {event.match?.result ? <div className="mt-6"><MatchFace match={event.match} /></div> : null}
      {props.showMap && event.venue ? (
        <div className="mt-8">
          <ConsentFrame src={buildMapEmbedSrc(`${event.venue.name} ${event.venue.address}`, 15)} title={`Mappa di ${event.venue.name}`} provider="Google Maps" allow="fullscreen" height={320} />
        </div>
      ) : null}
    </article>
  );
};

/* -------------------------------------------------------------- squadre */

export const TeamListRenderer: BlockRenderer = ({ props, context, data }) => {
  const teams = dataOf<PublicTeam[]>(data, []);
  if (!teams.length) {
    return (
      <div>
        <BlockTitle title={props.title} />
        <EmptyState message={props.emptyMessage} hint={reasonOf(data) || "crea le squadre nel gestionale e collegale alle categorie della stagione"} context={context} />
      </div>
    );
  }
  return (
    <div>
      <BlockTitle title={props.title} />
      {props.layout === "list" ? (
        <ul className="divide-y divide-ws-border rounded-ws border border-ws-border">
          {teams.map((team) => (
            <li key={team.id}>
              <InternalLink href={team.href} context={context} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-ws-muted">
                <span className="font-semibold">{team.name}</span>
                <span className="text-sm text-ws-muted-fg">{team.categoryLabel}</span>
              </InternalLink>
            </li>
          ))}
        </ul>
      ) : (
        <div className={`grid gap-5 ${itemGridClasses({ desktop: Number(props.columns) || 3 })}`}>
          {teams.map((team) => {
            const photo = props.showPhoto ? imageFromPublic(team.photo) : null;
            return (
              <InternalLink key={team.id} href={team.href} context={context} className="group block overflow-hidden rounded-ws border border-ws-border bg-ws-bg hover:shadow-md">
                {photo ? <SiteImage image={photo} sizes="(min-width: 1024px) 33vw, 50vw" className="aspect-[16/10] w-full transition-transform group-hover:scale-105" /> : <div className="aspect-[16/10] bg-gradient-to-br from-ws-primary to-ws-secondary" aria-hidden="true" />}
                <div className="p-5">
                  <h3 className="font-heading text-xl font-bold">{team.name}</h3>
                  <p className="text-sm text-ws-muted-fg">{[team.categoryLabel, team.seasonLabel].filter(Boolean).join(" · ")}</p>
                </div>
              </InternalLink>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const TeamHeroRenderer: BlockRenderer = ({ props, context, data }) => {
  const team = dataOf<PublicTeam | null>(data, null);
  if (!team) return <EmptyState message="Squadra non trovata." hint={reasonOf(data)} context={context} />;
  const background = imageFromRef(props.background, context) || imageFromPublic(team.photo);
  return (
    <div className="relative overflow-hidden px-4 py-20 text-white md:py-28">
      {background ? <SiteImage image={background} sizes="100vw" className="absolute inset-0 h-full w-full" priority decorative /> : null}
      <div className="absolute inset-0 bg-ws-secondary" style={{ opacity: background ? Number(props.overlay) / 100 : 1 }} aria-hidden="true" />
      <div className="relative mx-auto max-w-ws-container">
        <p className="text-sm font-semibold uppercase tracking-widest text-ws-accent">{[props.showCategory ? team.categoryLabel : "", props.showSeason ? team.seasonLabel : ""].filter(Boolean).join(" · ")}</p>
        <h1 className="mt-2 font-heading text-4xl font-bold uppercase md:text-6xl">{team.name}</h1>
      </div>
    </div>
  );
};

export const TeamInfoRenderer: BlockRenderer = ({ props, context, data }) => {
  const team = dataOf<PublicTeam | null>(data, null);
  if (!team) return <EmptyState hint={reasonOf(data)} context={context} />;
  return (
    <div>
      <h2 className="font-heading text-2xl font-bold">{team.name}</h2>
      {team.description ? <p className="mt-3 whitespace-pre-line">{team.description}</p> : null}
      {props.extraText ? <p className="mt-3 whitespace-pre-line">{props.extraText}</p> : null}
      <dl className="mt-6 flex flex-wrap gap-6 text-sm">
        {team.categoryLabel ? <div><dt className="text-ws-muted-fg">Categoria</dt><dd className="font-semibold">{team.categoryLabel}</dd></div> : null}
        {team.seasonLabel ? <div><dt className="text-ws-muted-fg">Stagione</dt><dd className="font-semibold">{team.seasonLabel}</dd></div> : null}
        {props.showCount && team.rosterCount ? <div><dt className="text-ws-muted-fg">Giocatori</dt><dd className="font-semibold">{team.rosterCount}</dd></div> : null}
      </dl>
    </div>
  );
};

export const RosterRenderer: BlockRenderer = ({ props, context, data }) => {
  const people = dataOf<PublicPerson[]>(data, []);
  if (!people.length) {
    return (
      <div>
        <BlockTitle title={props.title} />
        <EmptyState message={props.emptyMessage} hint={reasonOf(data) || "pubblica gli atleti dalla sezione Persone del sito"} context={context} />
      </div>
    );
  }
  return (
    <div>
      <BlockTitle title={props.title} />
      <div className={`grid gap-4 ${props.variant === "compact" ? itemGridClasses({ desktop: Number(props.columns) || 4, tablet: 2, mobile: 1 }) : itemGridClasses({ desktop: Number(props.columns) || 4, tablet: 3, mobile: 2 })}`}>
        {people.map((person) => (
          <PersonCard key={person.id} person={person} context={context} variant={props.variant} showPhoto={props.showPhoto} showNumber={props.showNumber} showRole={props.showRole} statKeys={props.statKeys} />
        ))}
      </div>
    </div>
  );
};

export const RosterCarouselRenderer: BlockRenderer = ({ props, context, data }) => {
  const people = dataOf<PublicPerson[]>(data, []);
  if (!people.length) {
    return (
      <div>
        <BlockTitle title={props.title} />
        <EmptyState message={props.emptyMessage} hint={reasonOf(data)} context={context} />
      </div>
    );
  }
  return (
    <div>
      <BlockTitle title={props.title} />
      <Carousel label={props.title || "La rosa"} itemWidth={{ base: "70%", md: "38%", lg: "23%" }}>
        {people.map((person) => (
          <PersonCard key={person.id} person={person} context={context} variant={props.variant === "card" ? "card" : "overlay"} showPhoto={props.showPhoto} showNumber={props.showNumber} showRole={props.showRole} statKeys={props.statKeys} />
        ))}
      </Carousel>
    </div>
  );
};

export const TeamStaffRenderer: BlockRenderer = ({ props, context, data }) => {
  const people = dataOf<PublicPerson[]>(data, []);
  if (!people.length) return props.emptyMessage ? <EmptyState message={props.emptyMessage} hint={reasonOf(data)} context={context} /> : <EmptyState hint="pubblica gli allenatori assegnati alla squadra" context={context} />;
  return (
    <div>
      <BlockTitle title={props.title} />
      <div className={`grid gap-4 ${itemGridClasses({ desktop: Number(props.columns) || 4, tablet: 2, mobile: 1 })}`}>
        {people.map((person) => <PersonCard key={person.id} person={person} context={context} variant="compact" showPhoto={props.showPhoto} showNumber={false} />)}
      </div>
    </div>
  );
};

export const TeamStatsRenderer: BlockRenderer = ({ props, context, data }) => {
  const stats = dataOf<PublicTeamStats | null>(data, null);
  if (!stats) {
    return (
      <div>
        <BlockTitle title={props.title} />
        <EmptyState message={props.emptyMessage} hint={reasonOf(data)} context={context} />
      </div>
    );
  }
  const cells: Array<[string, number]> = [
    ["Giocate", stats.played],
    ["Vinte", stats.won],
    ...(stats.drawn ? ([["Pareggiate", stats.drawn]] as Array<[string, number]>) : []),
    ["Perse", stats.lost],
    ...(props.showPoints ? ([["Fatti", stats.pointsFor], ["Subiti", stats.pointsAgainst]] as Array<[string, number]>) : []),
  ];
  return (
    <div>
      <BlockTitle title={props.title} />
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cells.map(([label, value]) => (
          <div key={label} className="rounded-ws bg-ws-muted p-4 text-center">
            <dd className="font-heading text-3xl font-bold tabular-nums">{value}</dd>
            <dt className="text-xs uppercase tracking-wider text-ws-muted-fg">{label}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-ws-muted-fg">Calcolati dai risultati definitivi registrati.</p>
    </div>
  );
};

/* ------------------------------------------------------------- giocatori */

export const PlayerCardRenderer: BlockRenderer = ({ props, context, data }) => {
  const person = dataOf<PublicPerson | null>(data, null);
  if (!person) return <EmptyState hint={reasonOf(data) || "scegli un giocatore pubblicato"} context={context} />;
  const facts = (
    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
      {props.showTeam && person.teams.length ? <div><dt className="text-ws-muted-fg">Squadra</dt><dd className="font-semibold">{person.teams.map((team) => team.name).join(", ")}</dd></div> : null}
      {props.showRole && person.role ? <div><dt className="text-ws-muted-fg">Ruolo</dt><dd className="font-semibold">{person.role}</dd></div> : null}
      {props.showHeight && person.heightCm ? <div><dt className="text-ws-muted-fg">Altezza</dt><dd className="font-semibold">{person.heightCm} cm</dd></div> : null}
      {props.showBirthYear && person.birthYear ? <div><dt className="text-ws-muted-fg">Anno di nascita</dt><dd className="font-semibold">{person.birthYear}</dd></div> : null}
    </dl>
  );
  if (props.variant === "large") {
    const photo = props.showPhoto ? imageFromPublic(person.photo) : null;
    const stats = person.stats.filter((stat) => !props.statKeys?.length || props.statKeys.includes(stat.key));
    return (
      <article className="grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="relative overflow-hidden rounded-ws-lg">
          {photo ? <SiteImage image={photo} sizes="(min-width: 768px) 40vw, 100vw" className="aspect-[3/4] w-full" priority /> : <Placeholder name={person.displayName} className="aspect-[3/4] w-full text-7xl" />}
        </div>
        <div>
          {props.showNumber && person.jerseyNumber ? <p className="font-heading text-6xl font-bold text-ws-primary">{person.jerseyNumber}</p> : null}
          <h1 className="font-heading text-4xl font-bold uppercase md:text-5xl">{person.displayName}</h1>
          {facts}
          {props.showBio && person.bio ? <p className="mt-6 whitespace-pre-line">{person.bio}</p> : null}
          {stats.length ? (
            <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.key} className="rounded-ws bg-ws-muted p-3 text-center">
                  <dd className="font-heading text-2xl font-bold tabular-nums">{stat.value}</dd>
                  <dt className="text-xs uppercase text-ws-muted-fg">{stat.label}</dt>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </article>
    );
  }
  return (
    <div className="max-w-sm">
      <PersonCard person={person} context={context} variant={props.variant} showPhoto={props.showPhoto} showNumber={props.showNumber} showRole={props.showRole} statKeys={props.statKeys} extra={props.variant === "card" ? facts : undefined} />
    </div>
  );
};

export const PlayerSpotlightRenderer: BlockRenderer = ({ props, context, data }) => {
  const person = dataOf<PublicPerson | null>(data, null);
  if (!person) return <EmptyState hint={reasonOf(data) || "scegli un giocatore pubblicato"} context={context} />;
  const photo = imageFromPublic(person.photo);
  const stats = person.stats.filter((stat) => props.statKeys?.includes(stat.key));
  const image = (
    <div className="overflow-hidden rounded-ws-lg">
      {photo ? <SiteImage image={photo} sizes="(min-width: 768px) 45vw, 100vw" className="aspect-[4/5] w-full" /> : <Placeholder name={person.displayName} className="aspect-[4/5] w-full text-7xl" dark />}
    </div>
  );
  return (
    <div className={`grid items-center gap-8 md:grid-cols-2 ${props.imageSide === "right" ? "md:[&>*:first-child]:order-2" : ""}`}>
      {image}
      <div>
        {props.eyebrow ? <p className="text-sm font-semibold uppercase tracking-widest text-ws-primary">{props.eyebrow}</p> : null}
        <h2 className="mt-2 font-heading text-4xl font-bold uppercase">{person.displayName}</h2>
        <p className="mt-1 text-ws-muted-fg">{[person.jerseyNumber ? `#${person.jerseyNumber}` : "", person.role, person.teams[0]?.name].filter(Boolean).join(" · ")}</p>
        {props.text ? <p className="mt-4 whitespace-pre-line text-lg">{props.text}</p> : null}
        {stats.length ? (
          <dl className="mt-6 flex flex-wrap gap-6">
            {stats.map((stat) => (
              <div key={stat.key}>
                <dd className="font-heading text-4xl font-bold text-ws-primary tabular-nums">{stat.value}</dd>
                <dt className="text-xs uppercase tracking-wider">{stat.label}</dt>
              </div>
            ))}
          </dl>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          {person.href ? <InternalLink href={person.href} context={context} className="ws-btn ws-btn-outline">Scheda completa</InternalLink> : null}
          {props.cta?.label ? <SiteButton label={props.cta.label} link={props.cta.link} context={context} /> : null}
        </div>
      </div>
    </div>
  );
};

export const PlayerStatsRenderer: BlockRenderer = ({ props, context, data }) => {
  const value = dataOf<{ person: PublicPerson; seasonLabel: string; matches: number } | null>(data, null);
  if (!value || !value.person.stats.length) {
    return (
      <div>
        <BlockTitle title={props.title} />
        <EmptyState message={props.emptyMessage} hint={reasonOf(data)} context={context} />
      </div>
    );
  }
  const stats = value.person.stats.filter((stat) => !props.statKeys?.length || props.statKeys.includes(stat.key));
  return (
    <div>
      <BlockTitle title={props.title} subtitle={`${value.seasonLabel} · ${value.matches} ${value.matches === 1 ? "gara" : "gare"} con statistiche`} />
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.key} className="rounded-ws border border-ws-border p-4 text-center">
            <dd className="font-heading text-3xl font-bold tabular-nums">{stat.value}</dd>
            <dt className="text-xs uppercase text-ws-muted-fg">{stat.label}</dt>
            {value.matches ? <p className="mt-1 text-xs text-ws-muted-fg">{(stat.value / value.matches).toFixed(1)} a gara</p> : null}
          </div>
        ))}
      </dl>
    </div>
  );
};

export const StaffRenderer: BlockRenderer = ({ props, context, data }) => {
  const people = dataOf<PublicPerson[]>(data, []);
  if (!people.length) {
    return props.emptyMessage || context.mode === "preview" ? (
      <div>
        <BlockTitle title={props.title} />
        <EmptyState message={props.emptyMessage} hint="pubblica allenatori e dirigenti dalla sezione Persone del sito" context={context} />
      </div>
    ) : null;
  }
  return (
    <div>
      <BlockTitle title={props.title} />
      {props.layout === "list" ? (
        <ul className="divide-y divide-ws-border">
          {people.map((person) => (
            <li key={`${person.kind}-${person.id}`} className="flex items-center justify-between py-3">
              <span className="font-semibold">{person.displayName}</span>
              {props.showRole && person.role ? <span className="text-ws-muted-fg">{person.role}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className={`grid gap-5 ${itemGridClasses({ desktop: Number(props.columns) || 4, tablet: 3, mobile: 2 })}`}>
          {people.map((person) => (
            <div key={`${person.kind}-${person.id}`} className="text-center">
              {props.showPhoto ? (
                imageFromPublic(person.photo) ? <SiteImage image={imageFromPublic(person.photo)!} sizes="200px" className="mx-auto aspect-square w-full max-w-[12rem] rounded-full" maxWidth={384} /> : <Placeholder name={person.displayName} className="mx-auto aspect-square w-full max-w-[12rem] rounded-full text-4xl" />
              ) : null}
              <p className="mt-3 font-heading text-lg font-bold">{person.displayName}</p>
              {props.showRole && person.role ? <p className="text-sm text-ws-muted-fg">{person.role}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export { Crest, ScoreBadge, PeriodLine };
