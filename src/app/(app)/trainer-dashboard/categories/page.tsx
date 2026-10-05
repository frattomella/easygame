import TrainerCategoriesDashboardPage from "@/components/trainer/trainer-categories-dashboard-page";

/**
 * Qui c'era `redirect("/trainer-dashboard")` (W6-31): una rotta che esisteva
 * per non mostrare niente. Adesso mostra le squadre del perimetro.
 */
export default function TrainerDashboardCategoriesRoute() {
  return <TrainerCategoriesDashboardPage />;
}
