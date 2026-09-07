/*
  **Questo modulo non e piu dichiarato client.**

  Portava `"use client"` per abitudine, non per necessita: non ha un hook, non
  tocca il DOM e non legge `window`. La direttiva aveva pero una conseguenza
  vera: `trainer-operational-alerts.ts` importa `recordMatchesCategory` da qui,
  quindi **l'intero calcolo degli avvisi restava confinato al browser**. Era il
  difetto: la notifica la scriveva il client e il server la persisteva cosi
  come arrivava. Tolta la direttiva, la stessa regola vale nei due posti — e
  ce n'e uno solo che decide.
*/

import { resolveCategoryId, resolveCategoryLabel } from "@/lib/category-utils";

export const normalizeTrainerDashboardValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const toRecordSource = (record: any) =>
  record?.data && typeof record.data === "object" ? record.data : {};

const flattenCategoryInput = (value: any): any[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenCategoryInput(entry));
  }

  if (typeof value === "string" && value.includes(",")) {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [value];
};

export const extractCategoryTokens = (
  record: any,
  categories: Array<{ id?: string | null; name?: string | null }> = [],
) => {
  const source = toRecordSource(record);
  const rawValues = [
    record?.id,
    record?.name,
    record?.category,
    record?.category_id,
    record?.category_name,
    record?.categoryId,
    record?.categoryName,
    record?.categoryIds,
    record?.category_ids,
    record?.selectedCategories,
    record?.selectedCategoryIds,
    record?.memberships,
    record?.categoryMemberships,
    record?.category_memberships,
    source?.id,
    source?.name,
    source?.category,
    source?.category_id,
    source?.category_name,
    source?.categoryId,
    source?.categoryName,
    source?.categoryIds,
    source?.category_ids,
    source?.selectedCategories,
    source?.selectedCategoryIds,
    source?.memberships,
    source?.categoryMemberships,
    source?.category_memberships,
    record?.categories,
    source?.categories,
  ]
    .flatMap((value) => flattenCategoryInput(value))
    .map((value) =>
      typeof value === "object" && value
        ? String(
            value.categoryId ||
              value.category_id ||
              value.category ||
              value.categoryName ||
              value.category_name ||
              value.name ||
              value.label ||
              value.title ||
              value.id ||
              value.value ||
              "",
          ).trim()
        : String(value || "").trim(),
    )
    .filter(Boolean);

  const tokens = new Set<string>();

  for (const rawValue of rawValues) {
    tokens.add(normalizeTrainerDashboardValue(rawValue));
    const resolvedId = resolveCategoryId(rawValue, categories);
    const resolvedLabel = resolveCategoryLabel(rawValue, categories);

    if (resolvedId) {
      tokens.add(normalizeTrainerDashboardValue(resolvedId));
    }

    if (resolvedLabel) {
      tokens.add(normalizeTrainerDashboardValue(resolvedLabel));
    }
  }

  return tokens;
};

export const getRecordDisplayCategory = (
  record: any,
  categories: Array<{ id?: string | null; name?: string | null }> = [],
) => {
  const source = toRecordSource(record);
  const values = [
    record?.category_name,
    record?.categoryName,
    record?.category,
    record?.category_id,
    record?.categoryId,
    record?.categoryIds,
    record?.category_ids,
    source?.category_name,
    source?.categoryName,
    source?.category,
    source?.category_id,
    source?.categoryId,
    source?.categoryIds,
    source?.category_ids,
    Array.isArray(record?.categories) ? record.categories[0] : null,
    Array.isArray(source?.categories) ? source.categories[0] : null,
  ]
    .flatMap((value) => flattenCategoryInput(value))
    .map((value) =>
      typeof value === "object" && value
        ? String(
            value.name ||
              value.label ||
              value.categoryName ||
              value.category_name ||
              value.title ||
              value.id ||
              value.value ||
              value.categoryId ||
              value.category_id ||
              "",
          ).trim()
        : String(value || "").trim(),
    )
    .filter(Boolean);

  const firstValue = values[0];
  if (!firstValue) {
    return "Senza categoria";
  }

  return resolveCategoryLabel(firstValue, categories);
};

/**
 * **Cosa nomina questo record: identificativi da una parte, nomi dall'altra.**
 *
 * ---
 *
 * ## Il difetto che chiude (P0-4, pilota Fortitudo Scauri)
 *
 * `extractCategoryTokens` mette nello **stesso** insieme l'identificativo di
 * una categoria e la sua etichetta, e `recordMatchesCategory` intersecava quel
 * miscuglio. Due categorie diverse che si chiamano allo stesso modo — «Under
 * 15» a Scauri e «Under 15» a Formia, cioe la configurazione ordinaria di una
 * societa multi-sede — producono percio insiemi che si intersecano **sul
 * nome**, e per il prodotto diventano una categoria sola.
 *
 * Misurato sul pilota: l'allenatore di una delle due vedeva gli allenamenti e
 * gli atleti dell'altra, e i due elenchi non si potevano piu separare da
 * nessuna schermata.
 *
 * ## La regola
 *
 * L'identita di una categoria e il suo **identificativo**. Il nome e
 * un'etichetta: serve a leggerla, non a riconoscerla.
 *
 * Un valore diventa un identificativo se il catalogo del club lo riconosce —
 * per identificativo, oppure per nome quando quel nome ne nomina **una sola**.
 * Un nome che ne nomina due non entra da nessuna parte: non e ambiguo per
 * caso, e sceglierne una sarebbe la fusione di prima con un passaggio in meno.
 *
 * Il ripiego sui nomi resta, e serve: un club che non ha mai aperto la pagina
 * delle categorie non ha un catalogo, e i suoi record portano solo etichette.
 * Ma vale **solo quando almeno uno dei due lati non porta identificativi**: se
 * li portano entrambi e non coincidono, sono due categorie diverse, e il fatto
 * che si chiamino uguale non le rende la stessa.
 */
export const extractCategoryIdentity = (
  record: any,
  categories: Array<{ id?: string | null; name?: string | null }> = [],
) => {
  const identificativi = new Set<string>();
  const nomi = new Set<string>();

  const conosciute = categories.filter((category) => category?.id);

  for (const grezzo of Array.from(extractCategoryTokens(record, []))) {
    if (!grezzo) continue;

    const perId = conosciute.find(
      (category) => normalizeTrainerDashboardValue(category.id) === grezzo,
    );
    if (perId?.id) {
      identificativi.add(normalizeTrainerDashboardValue(perId.id));
      continue;
    }

    const perNome = conosciute.filter(
      (category) => normalizeTrainerDashboardValue(category.name) === grezzo,
    );
    if (perNome.length === 1) {
      identificativi.add(normalizeTrainerDashboardValue(perNome[0].id));
      continue;
    }

    /* Ambiguo nel catalogo: non nomina nessuna categoria, e non entra. */
    if (perNome.length > 1) continue;

    nomi.add(grezzo);
  }

  return { identificativi, nomi };
};

export const recordMatchesCategory = (
  record: any,
  category: any,
  categories: Array<{ id?: string | null; name?: string | null }> = [],
) => {
  const delRecord = extractCategoryIdentity(record, categories);
  const dellaCategoria = extractCategoryIdentity(category, categories);

  for (const id of dellaCategoria.identificativi) {
    if (delRecord.identificativi.has(id)) return true;
  }

  /*
    Se tutti e due i lati sanno dire chi sono, la risposta e gia stata data: due
    identificativi diversi sono due categorie diverse, e il nome non le unisce.
  */
  if (delRecord.identificativi.size && dellaCategoria.identificativi.size) {
    return false;
  }

  for (const nome of dellaCategoria.nomi) {
    if (delRecord.nomi.has(nome)) return true;
  }

  return false;
};

export const recordMatchesAnyCategory = (
  record: any,
  categoryList: any[],
  categories: Array<{ id?: string | null; name?: string | null }> = [],
) =>
  (Array.isArray(categoryList) ? categoryList : []).some((category) =>
    recordMatchesCategory(record, category, categories),
  );

export const toTrainerDateTime = (
  dateValue: unknown,
  timeValue?: string | null,
) => {
  const parsed = dateValue ? new Date(String(dateValue)) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (timeValue) {
    const [hours, minutes] = String(timeValue).split(":");
    parsed.setHours(Number(hours) || 0, Number(minutes) || 0, 0, 0);
  }

  return parsed;
};

export const isSameTrainerDay = (
  left: Date | null | undefined,
  right: Date | null | undefined,
) => {
  if (!left || !right) {
    return false;
  }

  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
};

export const getTrainerStartOfWeek = (referenceDate: Date) => {
  const next = new Date(referenceDate);
  next.setHours(0, 0, 0, 0);
  const day = next.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + offset);
  return next;
};

export const getTrainerEndOfWeek = (referenceDate: Date) => {
  const start = getTrainerStartOfWeek(referenceDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

export const compareTrainerRecordsByStart = (left: any, right: any) => {
  const leftTime = left?.startsAt
    ? new Date(left.startsAt).getTime()
    : Number.MAX_SAFE_INTEGER;
  const rightTime = right?.startsAt
    ? new Date(right.startsAt).getTime()
    : Number.MAX_SAFE_INTEGER;

  return leftTime - rightTime;
};
