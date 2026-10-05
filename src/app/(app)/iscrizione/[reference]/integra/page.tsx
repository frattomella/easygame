import { PublicEnrollmentRevisionPage } from "@/components/enrollment/PublicEnrollmentRevisionPage";

/**
 * L'integrazione di una pratica (`/iscrizione/[reference]/integra`,
 * ADR-0189 §4): la famiglia corregge solo i campi che il club ha chiesto,
 * con la ricevuta come credenziale. Fuori dalla chrome e dai prefissi
 * protetti, come la ricevuta stessa.
 */
export default function PublicEnrollmentRevisionRoute({ params }: { params: { reference: string } }) {
  return <PublicEnrollmentRevisionPage reference={params.reference} />;
}
