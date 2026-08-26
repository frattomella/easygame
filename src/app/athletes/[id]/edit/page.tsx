import { redirect } from "next/navigation";

/**
 * `/athletes/:id/edit` non e piu una pagina: e un rimando alla scheda.
 *
 * **Cosa c'era prima** ([D27](../../../../../docs/knowledge-base/16-technical-debt.md)).
 * Seicento righe di form irraggiungibile — nessun link, nessun
 * `router.push` in tutto il repository — costruito su un nome, un telefono e
 * un codice fiscale **inventati a mano nel file**. Chi ci fosse arrivato
 * digitando l'indirizzo avrebbe visto l'anagrafica di un atleta che non
 * esiste, e avrebbe potuto crederla vera.
 *
 * **Perche un rimando e non una cancellazione.** L'indirizzo puo essere in
 * un segnalibro o in una vecchia email. Cancellare la rotta darebbe un 404;
 * rimandare alla scheda porta dove la modifica avviene davvero, che e cio
 * che chi ha digitato quell'indirizzo stava cercando. E la stessa cosa che
 * fa gia `/staff/:id/edit`.
 */
export default async function AthleteEditRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ clubId?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const clubId = resolvedSearchParams?.clubId;

  redirect(
    clubId
      ? `/athletes/${resolvedParams.id}?clubId=${clubId}`
      : `/athletes/${resolvedParams.id}`,
  );
}
