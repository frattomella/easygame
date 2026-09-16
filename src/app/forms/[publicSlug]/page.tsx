import { Suspense } from "react";
import { PublicFormPage } from "@/components/forms/public-form-page";

/**
 * Il modulo pubblico. Fuori dalla chrome dell'applicazione e fuori dai
 * prefissi protetti di `src/middleware.ts`: chi lo apre non ha una sessione,
 * e non deve averne una. `Suspense` perche la pagina legge `?riprendi=`
 * (la ripresa di una bozza, ADR-0189 §3).
 */

type PublicFormRouteProps = {
  params: {
    publicSlug: string;
  };
};

export default function PublicFormRoute({ params }: PublicFormRouteProps) {
  return (
    <Suspense fallback={null}>
      <PublicFormPage publicSlug={params.publicSlug} />
    </Suspense>
  );
}
