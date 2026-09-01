import {
  createClubRole,
  listClubRoles,
} from "@/lib/server/club-roles";
import { errore, leggiCorpo, nonAutenticato, ok, risolviScope } from "./shared";

/**
 * **I ruoli personalizzati di un club** (Wave 6, lane 6G, blocker W6-1).
 *
 *   GET  /api/v1/club-roles   l'elenco, con le chiavi e quante persone lo portano
 *   POST /api/v1/club-roles   ne crea uno — **solo il proprietario** (§10.4)
 *
 * Il corpo del POST porta `name`, `base_role`, `permissions` e, se si sta
 * clonando un preset, la stessa forma con le chiavi gia scelte: clonare non e
 * un'operazione diversa dal creare, e darle una rotta propria vorrebbe dire
 * avere due strade per la stessa scrittura.
 */

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const risolto = await risolviScope(request);
    if (!risolto) return nonAutenticato();

    return ok({ roles: await listClubRoles(risolto.scope) });
  } catch (error: any) {
    return errore(error, "Lettura dei ruoli non riuscita");
  }
}

export async function POST(request: Request) {
  try {
    const risolto = await risolviScope(request);
    if (!risolto) return nonAutenticato();

    const corpo = await leggiCorpo(request);

    return ok(
      await createClubRole(risolto.scope, {
        name: String(corpo.name ?? ""),
        description: corpo.description == null ? null : String(corpo.description),
        baseRole: String(corpo.base_role ?? corpo.baseRole ?? ""),
        permissions: Array.isArray(corpo.permissions)
          ? corpo.permissions.map((chiave: unknown) => String(chiave))
          : [],
      }),
      201,
    );
  } catch (error: any) {
    return errore(error, "Creazione del ruolo non riuscita");
  }
}
