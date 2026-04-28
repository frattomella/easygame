export type StructureFieldOption = {
  id: string;
  name: string;
};

export type TrainingLocationOption = {
  id: string;
  structureId: string;
  structureName: string;
  fieldId: string;
  fieldName: string;
  name: string;
  label: string;
};

const normalizeText = (value: any, fallback = "") =>
  String(value ?? fallback).trim();

export const buildTrainingLocationOptions = (
  structures: any[],
): TrainingLocationOption[] => {
  if (!Array.isArray(structures)) {
    return [];
  }

  const options = structures.flatMap((structure: any, structureIndex: number) => {
    const structureId =
      normalizeText(structure?.id) || `structure-${structureIndex + 1}`;
    const structureName =
      normalizeText(structure?.name) || `Struttura ${structureIndex + 1}`;
    const fields = Array.isArray(structure?.fields) ? structure.fields : [];

    if (!fields.length) {
      const fallbackFieldId = `${structureId}-field-main`;
      const fallbackFieldName = "Campo principale";
      return [
        {
          id: fallbackFieldId,
          structureId,
          structureName,
          fieldId: fallbackFieldId,
          fieldName: fallbackFieldName,
          name: `${structureName} - ${fallbackFieldName}`,
          label: `${structureName} / ${fallbackFieldName}`,
        },
      ];
    }

    return fields
      .map((field: any, fieldIndex: number) => {
        const fieldId =
          normalizeText(field?.id) || `${structureId}-field-${fieldIndex + 1}`;
        const fieldName =
          normalizeText(field?.name) || `Campo ${fieldIndex + 1}`;

        return {
          id: fieldId,
          structureId,
          structureName,
          fieldId,
          fieldName,
          name: `${structureName} - ${fieldName}`,
          label: `${structureName} / ${fieldName}`,
        };
      })
      .filter((option) => option.structureId && option.fieldId);
  });

  return options;
};

export const getFallbackTrainingLocationOptions = (): TrainingLocationOption[] => [
  {
    id: "fallback-structure-main",
    structureId: "fallback-structure",
    structureName: "Struttura Principale",
    fieldId: "fallback-structure-main",
    fieldName: "Campo Principale",
    name: "Struttura Principale - Campo Principale",
    label: "Struttura Principale / Campo Principale",
  },
  {
    id: "fallback-structure-secondary",
    structureId: "fallback-structure",
    structureName: "Struttura Principale",
    fieldId: "fallback-structure-secondary",
    fieldName: "Campo Secondario",
    name: "Struttura Principale - Campo Secondario",
    label: "Struttura Principale / Campo Secondario",
  },
];

export const findTrainingLocationOption = (
  options: TrainingLocationOption[],
  input: {
    fieldId?: string | null;
    locationId?: string | null;
    structureId?: string | null;
    location?: string | null;
  },
) => {
  const normalizedLocation = normalizeText(input.location);
  const normalizedFieldId = normalizeText(input.fieldId || input.locationId);
  const normalizedStructureId = normalizeText(input.structureId);

  return (
    options.find(
      (option) =>
        (normalizedFieldId && option.fieldId === normalizedFieldId) ||
        (normalizedStructureId &&
          option.structureId === normalizedStructureId &&
          normalizedLocation &&
          option.name === normalizedLocation) ||
        (normalizedLocation &&
          (option.name === normalizedLocation ||
            option.label === normalizedLocation ||
            option.fieldName === normalizedLocation)),
    ) || null
  );
};

export const getStructureFieldOptions = (
  options: TrainingLocationOption[],
  structureId?: string | null,
): StructureFieldOption[] =>
  options
    .filter((option) => !structureId || option.structureId === structureId)
    .map((option) => ({
      id: option.fieldId,
      name: option.fieldName,
    }));
