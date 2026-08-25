import { PublicFormPage } from "@/components/forms/public-form-page";

/**
 * Il modulo pubblico. Fuori dalla chrome dell'applicazione e fuori dai
 * prefissi protetti di `src/middleware.ts`: chi lo apre non ha una sessione,
 * e non deve averne una.
 */

type PublicFormRouteProps = {
  params: {
    publicSlug: string;
  };
};

export default function PublicFormRoute({ params }: PublicFormRouteProps) {
  return <PublicFormPage publicSlug={params.publicSlug} />;
}
