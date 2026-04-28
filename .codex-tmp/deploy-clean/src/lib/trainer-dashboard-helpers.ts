"use client";

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
    source?.id,
    source?.name,
    source?.category,
    source?.category_id,
    source?.category_name,
    source?.categoryId,
    source?.categoryName,
    record?.categories,
    source?.categories,
  ]
    .flatMap((value) => flattenCategoryInput(value))
    .map((value) =>
      typeof value === "object" && value
        ? String(value.id || value.name || value.category || "").trim()
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
    source?.category_name,
    source?.categoryName,
    source?.category,
    source?.category_id,
    source?.categoryId,
    Array.isArray(record?.categories) ? record.categories[0] : null,
    Array.isArray(source?.categories) ? source.categories[0] : null,
  ]
    .flatMap((value) => flattenCategoryInput(value))
    .map((value) =>
      typeof value === "object" && value
        ? String(value.name || value.id || "").trim()
        : String(value || "").trim(),
    )
    .filter(Boolean);

  const firstValue = values[0];
  if (!firstValue) {
    return "Senza categoria";
  }

  return resolveCategoryLabel(firstValue, categories);
};

export const recordMatchesCategory = (
  record: any,
  category: any,
  categories: Array<{ id?: string | null; name?: string | null }> = [],
) => {
  const recordTokens = extractCategoryTokens(record, categories);
  const categoryTokens = extractCategoryTokens(category, categories);

  return Array.from(categoryTokens).some((token) => recordTokens.has(token));
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
