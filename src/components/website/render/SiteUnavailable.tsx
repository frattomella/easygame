/**
 * La pagina «sito non disponibile»: dominio non ancora verificato, sito
 * ritirato o servizio sospeso. Non dice niente del club oltre al nome, non
 * dice perche a chi non lo deve sapere, e non si indicizza.
 */
const MESSAGES: Record<string, string> = {
  domain_not_ready: "Il sito sta per arrivare: il dominio e in fase di attivazione.",
  not_published: "Il sito sta per arrivare.",
  offline: "Il sito non e al momento disponibile.",
  suspended: "Il sito non e al momento disponibile.",
};

export const SiteUnavailable = ({ siteName, reason }: { siteName: string | null; reason: string }) => (
  <main className="ws-body flex min-h-screen items-center justify-center px-6 text-center">
    <div className="max-w-md">
      {siteName ? <h1 className="font-heading text-3xl font-bold">{siteName}</h1> : null}
      <p className="mt-4 text-lg opacity-80">{MESSAGES[reason] || MESSAGES.offline}</p>
    </div>
  </main>
);
