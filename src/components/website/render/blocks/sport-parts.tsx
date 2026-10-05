import type { PublicMatch, PublicPerson, PublicSide } from "@/lib/website/public-dto";
import { DateTime, Icon, InternalLink, SiteImage, imageFromPublic, formatTime } from "../primitives";
import type { RenderContext } from "../context";

/**
 * Pezzi condivisi dei blocchi sportivi: stemma, riga di gara, risultato,
 * scheda persona. Mostrano solo cio che il DTO porta: un dato assente non
 * diventa un trattino inventato, semplicemente non compare.
 */

export const Crest = ({ side, size = "md" }: { side: PublicSide; size?: "sm" | "md" | "lg" | "xl" }) => {
  const dimension = { sm: "h-8 w-8", md: "h-12 w-12", lg: "h-16 w-16", xl: "h-24 w-24 md:h-28 md:w-28" }[size];
  const image = imageFromPublic(side.logo);
  if (image) {
    return <SiteImage image={{ ...image, alt: image.alt || `Logo ${side.name}` }} sizes="112px" fit="contain" className={`${dimension} shrink-0`} maxWidth={384} />;
  }
  const initials = side.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return (
    <span className={`${dimension} inline-flex shrink-0 items-center justify-center rounded-full font-heading font-bold ${side.isClub ? "bg-ws-primary text-ws-primary-ink" : "bg-ws-muted text-ws-fg"}`} aria-hidden="true">
      {initials || "?"}
    </span>
  );
};

export const outcomeLabel = (match: PublicMatch) =>
  match.result?.outcome === "win" ? "Vittoria" : match.result?.outcome === "loss" ? "Sconfitta" : match.result?.outcome === "draw" ? "Pareggio" : "";

const OUTCOME_CLASS: Record<string, string> = {
  win: "bg-ws-success text-white",
  loss: "bg-ws-danger text-white",
  draw: "bg-ws-muted text-ws-fg",
};

export const ScoreBadge = ({ match, large = false }: { match: PublicMatch; large?: boolean }) => {
  if (match.status === "cancelled") return <span className="rounded-ws-sm bg-ws-muted px-2 py-1 text-xs font-semibold uppercase">Annullata</span>;
  if (!match.result) {
    return <span className={`font-heading font-bold tabular-nums ${large ? "text-3xl" : "text-lg"}`}>{formatTime(match.startsAt, match.timezone)}</span>;
  }
  return (
    <span className={`inline-flex items-center gap-2 font-heading font-bold tabular-nums ${large ? "text-4xl md:text-5xl" : "text-xl"}`} aria-label={`Risultato ${match.result.home} a ${match.result.away}`}>
      <span>{match.result.home}</span>
      <span aria-hidden="true">–</span>
      <span>{match.result.away}</span>
    </span>
  );
};

export const OutcomePill = ({ match }: { match: PublicMatch }) =>
  match.result?.outcome ? (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${OUTCOME_CLASS[match.result.outcome]}`}>
      {outcomeLabel(match)}
      {!match.result.final ? " (provvisorio)" : ""}
    </span>
  ) : null;

export const MatchMeta = ({ match, showVenue, showCompetition }: { match: PublicMatch; showVenue?: boolean; showCompetition?: boolean }) => (
  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ws-muted-fg">
    <span className="inline-flex items-center gap-1">
      <Icon name="calendar" className="h-4 w-4" />
      <DateTime iso={match.startsAt} timezone={match.timezone} mode="day" />
    </span>
    {showVenue && match.venue ? (
      <span className="inline-flex items-center gap-1">
        <Icon name="map-pin" className="h-4 w-4" />
        {match.venue.name}
      </span>
    ) : null}
    {showCompetition && match.competition ? <span>{match.competition.shortName}{match.round ? ` · ${match.round}` : ""}</span> : null}
    {match.categoryLabel ? <span className="font-semibold text-ws-fg">{match.categoryLabel}</span> : null}
  </p>
);

/** Una gara in una riga: casa, risultato o orario, trasferta. */
export const MatchRow = ({
  match,
  context,
  showVenue = true,
  showCompetition = true,
  showPeriods = false,
}: {
  match: PublicMatch;
  context: RenderContext;
  showVenue?: boolean;
  showCompetition?: boolean;
  showPeriods?: boolean;
}) => (
  <InternalLink href={match.href} context={context} className="block rounded-ws border border-ws-border bg-ws-bg p-4 transition-shadow hover:shadow-md" ariaLabel={`${match.home.name} contro ${match.away.name}`}>
    <MatchMeta match={match} showVenue={showVenue} showCompetition={showCompetition} />
    <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Crest side={match.home} size="sm" />
        <span className={`truncate font-semibold ${match.home.isClub ? "" : ""}`}>{match.home.name}</span>
      </div>
      <div className="text-center">
        <ScoreBadge match={match} />
      </div>
      <div className="flex min-w-0 items-center justify-end gap-3 text-right">
        <span className="truncate font-semibold">{match.away.name}</span>
        <Crest side={match.away} size="sm" />
      </div>
    </div>
    {showPeriods && match.periods.length ? <PeriodLine match={match} /> : null}
    {match.result ? <div className="mt-2 flex justify-center"><OutcomePill match={match} /></div> : null}
  </InternalLink>
);

export const PeriodLine = ({ match }: { match: PublicMatch }) => (
  <p className="mt-2 text-center text-xs tabular-nums text-ws-muted-fg">
    {match.periods.map((period) => `${period.home ?? "–"}-${period.away ?? "–"}`).join(" · ")}
  </p>
);

export const PeriodTable = ({ match }: { match: PublicMatch }) =>
  match.periods.length ? (
    <div className="overflow-x-auto">
      <table className="mx-auto min-w-[16rem] text-sm tabular-nums">
        <caption className="sr-only">Parziali</caption>
        <thead>
          <tr className="text-ws-muted-fg">
            <th scope="col" className="px-3 py-1 text-left font-medium">Squadra</th>
            {match.periods.map((period) => (
              <th key={period.number} scope="col" className="px-3 py-1 font-medium">{period.label}</th>
            ))}
            {match.result ? <th scope="col" className="px-3 py-1 font-semibold">Finale</th> : null}
          </tr>
        </thead>
        <tbody>
          {(["home", "away"] as const).map((side) => (
            <tr key={side} className="border-t border-ws-border">
              <th scope="row" className="px-3 py-2 text-left font-semibold">{match[side].shortName || match[side].name}</th>
              {match.periods.map((period) => (
                <td key={period.number} className="px-3 py-2 text-center">{period[side] ?? "–"}</td>
              ))}
              {match.result ? <td className="px-3 py-2 text-center font-bold">{match.result[side]}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : null;

/** La scheda di una gara in grande: stemmi, nomi, orario o risultato. */
export const MatchFace = ({ match, tone = "inherit" }: { match: PublicMatch; tone?: "inherit" | "light" }) => (
  <div className={`grid grid-cols-[1fr_auto_1fr] items-center gap-4 md:gap-10 ${tone === "light" ? "text-white" : ""}`}>
    <div className="flex flex-col items-center gap-3 text-center">
      <Crest side={match.home} size="xl" />
      <span className="font-heading text-lg font-bold uppercase md:text-2xl">{match.home.name}</span>
    </div>
    <div className="text-center">
      {match.result ? <ScoreBadge match={match} large /> : <span className="font-heading text-2xl font-bold opacity-80 md:text-4xl">VS</span>}
    </div>
    <div className="flex flex-col items-center gap-3 text-center">
      <Crest side={match.away} size="xl" />
      <span className="font-heading text-lg font-bold uppercase md:text-2xl">{match.away.name}</span>
    </div>
  </div>
);

/* ------------------------------------------------------------- persone */

export const PersonCard = ({
  person,
  context,
  variant = "card",
  showPhoto = true,
  showNumber = true,
  showRole = true,
  statKeys = [],
  extra,
}: {
  person: PublicPerson;
  context: RenderContext;
  variant?: "card" | "compact" | "overlay" | "large";
  showPhoto?: boolean;
  showNumber?: boolean;
  showRole?: boolean;
  statKeys?: string[];
  extra?: React.ReactNode;
}) => {
  const photo = showPhoto ? imageFromPublic(person.photo) : null;
  const stats = (statKeys.length ? person.stats.filter((stat) => statKeys.includes(stat.key)) : []).slice(0, 4);
  const number = showNumber && person.jerseyNumber ? person.jerseyNumber : "";
  const role = showRole ? person.role : "";

  if (variant === "compact") {
    return (
      <InternalLink href={person.href} context={context} className="flex items-center gap-3 rounded-ws border border-ws-border bg-ws-bg p-3">
        {photo ? <SiteImage image={photo} sizes="56px" className="h-14 w-14 shrink-0 rounded-full" maxWidth={384} /> : <Placeholder name={person.displayName} className="h-14 w-14 rounded-full text-lg" />}
        <div className="min-w-0">
          <p className="truncate font-semibold">{number ? <span className="mr-2 font-heading text-ws-primary">#{number}</span> : null}{person.displayName}</p>
          {role ? <p className="truncate text-sm text-ws-muted-fg">{role}</p> : null}
        </div>
      </InternalLink>
    );
  }

  if (variant === "overlay") {
    return (
      <InternalLink href={person.href} context={context} className="group relative block overflow-hidden rounded-ws bg-ws-dark text-white">
        {photo ? <SiteImage image={photo} sizes="(min-width: 1024px) 25vw, 50vw" className="aspect-[3/4] w-full transition-transform group-hover:scale-105" maxWidth={828} /> : <Placeholder name={person.displayName} className="aspect-[3/4] w-full text-5xl" dark />}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4">
          {number ? <p className="font-heading text-4xl font-bold leading-none text-ws-accent">{number}</p> : null}
          <p className="mt-1 font-heading text-lg font-bold uppercase">{person.displayName}</p>
          {role ? <p className="text-sm opacity-90">{role}</p> : null}
        </div>
      </InternalLink>
    );
  }

  return (
    <InternalLink href={person.href} context={context} className="block overflow-hidden rounded-ws border border-ws-border bg-ws-bg transition-shadow hover:shadow-md">
      <div className="relative">
        {photo ? <SiteImage image={photo} sizes="(min-width: 1024px) 25vw, 50vw" className="aspect-square w-full" maxWidth={828} /> : <Placeholder name={person.displayName} className="aspect-square w-full text-5xl" />}
        {number ? <span className="absolute left-3 top-3 rounded-ws-sm bg-ws-primary px-2 py-1 font-heading text-lg font-bold text-ws-primary-ink">{number}</span> : null}
      </div>
      <div className="p-4">
        <p className="font-heading text-lg font-bold">{person.displayName}</p>
        {role ? <p className="text-sm text-ws-muted-fg">{role}</p> : null}
        {stats.length ? (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {stats.map((stat) => (
              <div key={stat.key} className="rounded-ws-sm bg-ws-muted px-2 py-1">
                <dt className="text-xs text-ws-muted-fg">{stat.label}</dt>
                <dd className="font-bold tabular-nums">{stat.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {extra}
      </div>
    </InternalLink>
  );
};

/** Al posto della foto: le iniziali, mai una sagoma che finge una persona. */
export const Placeholder = ({ name, className = "", dark = false }: { name: string; className?: string; dark?: boolean }) => (
  <span className={`flex items-center justify-center font-heading font-bold ${dark ? "bg-ws-secondary text-ws-secondary-ink" : "bg-ws-muted text-ws-muted-fg"} ${className}`} aria-hidden="true">
    {name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("")}
  </span>
);
