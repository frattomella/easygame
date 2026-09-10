import { ParentChild } from "@/services/api";

/**
 * Dominio puro del multi-figlio mobile. Specchio minimo del comportamento
 * Web (`getParentLinkedAthletes` + `/parent-view` + `getAccessRedirectPath`
 * in `src/lib/access-roles.ts`): un solo figlio si seleziona da solo, piu
 * figli restano una scelta esplicita e mai automatica, e una scelta salvata
 * che non esiste piu tra i figli attuali (un figlio scollegato, un accesso
 * revocato) non blocca — ricade sul primo disponibile, mai su uno schermo
 * vuoto.
 */

/** Ordine stabile e prevedibile: per nome, poi per club (mai per data di arrivo dal server). */
export function sortParentChildren(children: ParentChild[]): ParentChild[] {
  return [...children].sort((left, right) => {
    const byName = left.name.localeCompare(right.name, "it");
    if (byName !== 0) return byName;
    return left.clubName.localeCompare(right.clubName, "it");
  });
}

/**
 * Il figlio da selezionare all'apertura dell'area Parent o dopo che
 * l'elenco e cambiato (aggiunta/rimozione di un figlio).
 *
 * - Nessun figlio → `null` (empty state, non un errore).
 * - Un solo figlio → quello, sempre (mai uno switcher a una voce sola).
 * - Piu figli e una scelta salvata ancora valida → quella scelta.
 * - Piu figli senza una scelta valida → il primo in ordine stabile, mai
 *   "nessuno": la Home deve sempre avere un contesto quando esiste almeno
 *   un figlio.
 */
export function resolveSelectedChildId(
  children: ParentChild[],
  storedChildId: string | null | undefined,
): string | null {
  if (children.length === 0) {
    return null;
  }

  if (storedChildId && children.some((child) => child.id === storedChildId)) {
    return storedChildId;
  }

  return sortParentChildren(children)[0].id;
}

/** Raggruppa i figli per club, nell'ordine in cui i club compaiono nell'elenco ordinato — usato dal foglio espanso di `ChildSwitcher`. */
export function groupChildrenByClub(
  children: ParentChild[],
): { clubId: string; clubName: string; children: ParentChild[] }[] {
  const sorted = sortParentChildren(children);
  const groups: {
    clubId: string;
    clubName: string;
    children: ParentChild[];
  }[] = [];

  for (const child of sorted) {
    const existing = groups.find((group) => group.clubId === child.clubId);
    if (existing) {
      existing.children.push(child);
    } else {
      groups.push({
        clubId: child.clubId,
        clubName: child.clubName,
        children: [child],
      });
    }
  }

  return groups;
}

/**
 * L'accento stabile di un figlio (`EGChildAccents`), assegnato in ordine di
 * collegamento — qui approssimato con l'ordine stabile di `sortParentChildren`,
 * perche il payload non porta una data di collegamento. Un aiuto visivo, mai
 * l'unico identificativo: il nome resta sempre accanto.
 */
export function resolveChildAccentIndex(
  children: ParentChild[],
  childId: string,
): number {
  const sorted = sortParentChildren(children);
  const index = sorted.findIndex((child) => child.id === childId);
  return index >= 0 ? index % 4 : 0;
}

/** Il figlio e su un club diverso da quello dell'ultimo figlio selezionato — la regola "cross-club" del foglio. */
export function isCrossClubSwitch(
  children: ParentChild[],
  fromChildId: string | null,
  toChildId: string,
): boolean {
  if (!fromChildId) return false;
  const from = children.find((child) => child.id === fromChildId);
  const to = children.find((child) => child.id === toChildId);
  if (!from || !to) return false;
  return from.clubId !== to.clubId;
}
