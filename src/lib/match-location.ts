const normalizeText = (value: unknown) => String(value || "").trim();

type MatchLocationLike = {
  structureName?: string | null;
  fieldName?: string | null;
  location?: string | null;
  structure?: string | null;
  field?: string | null;
};

export const formatMatchLocationLabel = (match: MatchLocationLike | null | undefined) => {
  if (!match) {
    return "Luogo da definire";
  }

  const structureName = normalizeText(match.structureName || match.structure);
  const fieldName = normalizeText(match.fieldName || match.field);
  const fallbackLocation = normalizeText(match.location);

  const structuredLocation = [structureName, fieldName].filter(Boolean).join(" - ");
  if (structuredLocation) {
    return structuredLocation;
  }

  if (fallbackLocation) {
    return fallbackLocation.replace(/\s*\/\s*/g, " - ");
  }

  return "Luogo da definire";
};
