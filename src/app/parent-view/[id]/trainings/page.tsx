import { ParentTrainingsPage } from "@/components/parent-dashboard/parent-dashboard-pages";
import { ParentRsvpSection } from "@/components/parent/ParentRsvpSection";

/**
 * Gli inviti stanno **sopra** il calendario, e non dentro l'elenco.
 *
 * Sono l'unica cosa di questa pagina su cui la famiglia deve fare qualcosa: il
 * resto e consultazione. Metterli in cima li rende la prima cosa che si vede
 * senza toccare la forma dell'elenco degli allenamenti, che resta di chi la
 * possiede (`parent-dashboard-pages.tsx`).
 */
export default function ParentViewTrainingsPage() {
  return (
    <div className="space-y-6">
      <ParentRsvpSection />
      <ParentTrainingsPage />
    </div>
  );
}
