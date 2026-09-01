/**
 * Chi puo fare cosa con il libro soci. **Una volta sola.**
 *
 * **Qui dentro non c'e nessun permesso nuovo**: c'e la composizione di quelli
 * che esistono gia. Il libro soci e configurazione societaria — chi ammette ed
 * esclude un socio e lo stesso organo che decide lo statuto, non chi tiene la
 * segreteria — quindi la scrittura passa da `canManageClubConfiguration`, lo
 * stesso perimetro che gia protegge conti correnti e firma del presidente.
 *
 * La **lettura** e piu larga: il perimetro gestionale. Chi prepara una
 * convocazione o incassa una quota deve poter sapere se quella persona e socia,
 * e negarglielo lo spingerebbe a tenersi un elenco a parte — che e il modo in
 * cui un libro smette di essere l'unica fonte.
 *
 * Genitori, atleti e allenatori non compaiono: le loro aree non passano di qui.
 *
 * Modulo **puro** e client-safe: nessun Prisma, nessuna rete, nessun DOM. Lo
 * importano sia le rotte sia le schermate, perche un pulsante che si vede e
 * risponde 403 e un difetto quanto una porta aperta.
 */

import { canManageClubConfiguration } from "@/lib/access-roles";
import { roleHasPermission } from "@/lib/permissions/catalog";

/*
  **Le chiavi, invece dei booleani senza nome** (W5-70). La matrice per ruolo e
  la stessa di prima — questo non e un cambio di comportamento — e adesso vive
  nel catalogo unico, dove una schermata di configurazione e, un giorno, un
  motore di ruoli personalizzati la possono leggere.
*/

/** Registrare un'ammissione, una cessazione o una riammissione. */
export const canManageMembershipRegister = (role?: string | null) =>
  canManageClubConfiguration(role);

/** Leggere il libro e lo storico di un socio. */
export const canReadMembershipRegister = (role?: string | null) =>
  roleHasPermission(role, "members.register.read");
