import { redirect } from "next/navigation";

/**
 * `/trainers/:id/edit` non e piu una pagina: e un rimando alla scheda.
 *
 * Stessa storia della gemella sugli atleti
 * ([D27](../../../../../docs/knowledge-base/16-technical-debt.md)): un form
 * di seicento righe che nessun link raggiungeva, mentre la modifica vera
 * avviene nelle sezioni della scheda di dettaglio. Il rimando esiste perche
 * un indirizzo puo essere in un segnalibro, e un 404 non aiuta chi lo apre.
 */
export default async function TrainerEditRedirect({
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
      ? `/trainers/${resolvedParams.id}?clubId=${clubId}`
      : `/trainers/${resolvedParams.id}`,
  );
}
