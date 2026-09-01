import { canAccessClubResource } from "@/lib/access-roles";

/**
 * Chi puo stare davanti ai **moduli online**. Una volta sola.
 *
 * **Il difetto che chiude (W6-42).** La pagina Modulistica ospita due domini
 * distinti — i modelli di **documento** che il club stampa, e i **moduli
 * online** che la famiglia compila — e li governava con un permesso solo:
 * `canReadDocumentTemplates`. La guardia della pagina usava quello, quindi un
 * ruolo autorizzato ai moduli ma non ai modelli di stampa leggeva «I modelli
 * di documento li vede chi lavora nella segreteria del club» e **non vedeva
 * mai i moduli**. Due domini, due cancelli.
 *
 * **Perche la risorsa e `forms` e non una chiave del catalogo.** Il catalogo
 * dei permessi non ha chiavi `forms.*`, e inventarne qui sarebbe la seconda
 * implementazione di una decisione che vive altrove. L'autorita e gia scritta
 * e gia applicata: `src/lib/server/forms.ts` chiede
 * `canAccessClubResource(role, "forms", "read")` a ogni operazione, e
 * `attachment-permissions.ts` mappa gli allegati di un modulo sulla stessa
 * risorsa. Questo file dice **le stesse parole** al browser, perche un
 * pulsante che si vede e risponde 403 e un difetto quanto una porta aperta.
 *
 * Modulo **puro** e client-safe: nessun Prisma, nessuna rete, nessun DOM.
 */

/** Vedere l'elenco dei moduli, la coda delle compilazioni e i modelli. */
export const canReadClubForms = (role?: string | null) =>
  canAccessClubResource(role, "forms", "read");

/**
 * Creare, modificare, pubblicare, archiviare un modulo — e adottare un modello.
 *
 * Il servizio non distingue lettura e scrittura (chiede `read` per entrambe):
 * qui la distinzione si fa lo stesso, perche una schermata che offre «Nuovo
 * modulo» a chi il giorno in cui la matrice si stringera non potra crearne
 * uno e una promessa scritta in anticipo. `create` e l'azione con cui la
 * matrice nomina la scrittura.
 */
export const canManageClubForms = (role?: string | null) =>
  canAccessClubResource(role, "forms", "create");
