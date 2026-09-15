/**
 * Quali rotte sotto `/dashboard` sono **la** Dashboard del club (ambiente 2,
 * sul cielo): l'indice e la rotta legacy `/dashboard/<id>`, che oggi disegna
 * la stessa schermata. `/dashboard/access-management` e una pagina di lavoro
 * e resta sul mist. Modulo puro, testato in `tests/ui/dashboard-v2-parity.test.mjs`.
 */
export const isClubDashboardRoute = (pathname: string | null | undefined) => {
  const path = String(pathname || "").replace(/\/+$/, "") || "/";
  if (path === "/dashboard") return true;
  if (!path.startsWith("/dashboard/")) return false;
  const segments = path.split("/").filter(Boolean);
  return segments.length === 2 && segments[1] !== "access-management";
};
