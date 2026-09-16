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
import { UNKNOWN_CATEGORY_LABEL } from "@/lib/categories/display";
import { categoryIdentity, sameCategory } from "@/lib/categories/identity";

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

  /*
    Con il catalogo in mano un riferimento che nessuna voce riconosce non
    esce com'e — `category-1757…` come «categoria primaria» — ma come
    «Categoria non disponibile» (D-RD-17 a, revisione ostile A10). Senza
    catalogo resta il riferimento: e il club con i soli nomi.
  */
  const risolta = resolveCategoryLabel(firstValue, categories);
  const conosciuta = categories.some(
    (category) =>
      String(category?.id || "").trim() === firstValue ||
      String(category?.name || "").trim() === firstValue,
  );
  return categories.length && !conosciuta ? UNKNOWN_CATEGORY_LABEL : risolta;
};

/**
 * **La regola vive in `src/lib/categories/identity.ts`, e qui non c'e una
 * copia** (D-INT-2).
 *
 * Queste due erano una delle **due** risposte canoniche alla stessa domanda —
 * l'altra era `athleteMatchesCategory` — e ognuna aveva la propria idea di
 * quando due riferimenti nominino la stessa categoria. Adesso ne esiste una,
 * e queste sono il nome con cui la conoscono le bacheche dell'allenatore.
 *
 * Restano esportate perche otto consumatori le importano per nome, e
 * rinominarli tutti sarebbe un diff estraneo alla correzione (CLAUDE.md §3).
 */
export const extractCategoryIdentity = categoryIdentity;

export const recordMatchesCategory = (
  record: any,
  category: any,
  categories: Array<{ id?: string | null; name?: string | null }> = [],
) => sameCategory(record, category, categories);

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
