export type TrainingLocationOption = {
  id: string;
  name: string;
  label: string;
  structureId: string;
  structureName: string;
  fieldId: string;
  fieldName: string;
};

const normalizeText = (value: unknown) => String(value || "").trim();

export const getFallbackTrainingLocations = (): TrainingLocationOption[] => [
  {
    id: "field-main",
    name: "Campo Principale",
    label: "Centro Sportivo - Campo Principale",
    structureId: "structure-main",
    structureName: "Centro Sportivo",
    fieldId: "field-main",
    fieldName: "Campo Principale",
  },
  {
    id: "field-secondary",
    name: "Campo Secondario",
    label: "Centro Sportivo - Campo Secondario",
    structureId: "structure-main",
    structureName: "Centro Sportivo",
    fieldId: "field-secondary",
    fieldName: "Campo Secondario",
  },
];

export const buildTrainingLocationOptions = (
  structures: any[],
): TrainingLocationOption[] => {
  const options = (Array.isArray(structures) ? structures : []).flatMap(
    (structure: any) => {
      const structureId =
        normalizeText(structure?.id) ||
        `structure-${normalizeText(structure?.name).toLowerCase().replace(/\s+/g, "-")}`;
      const structureName = normalizeText(structure?.name) || "Struttura";
      const fields = Array.isArray(structure?.fields) ? structure.fields : [];

      if (!fields.length) {
        return [
          {
            id: structureId,
            name: structureName,
            label: structureName,
            structureId,
            structureName,
            fieldId: structureId,
            fieldName: structureName,
          },
        ];
      }

      return fields
        .map((field: any) => {
          const fieldId =
            normalizeText(field?.id) ||
            `${structureId}-${normalizeText(field?.name).toLowerCase().replace(/\s+/g, "-")}`;
          const fieldName = normalizeText(field?.name);

          if (!fieldId || !fieldName) {
            return null;
          }

          return {
            id: fieldId,
            name: fieldName,
            label: `${structureName} - ${fieldName}`,
            structureId,
            structureName,
            fieldId,
            fieldName,
          } satisfies TrainingLocationOption;
        })
        .filter(Boolean) as TrainingLocationOption[];
    },
  );

  return options.length ? options : getFallbackTrainingLocations();
};

export const groupTrainingLocationsByStructure = (
  locations: TrainingLocationOption[],
) => {
  const groups = new Map<
    string,
    { structureId: string; structureName: string; fields: TrainingLocationOption[] }
  >();

  for (const location of locations) {
    if (!groups.has(location.structureId)) {
      groups.set(location.structureId, {
        structureId: location.structureId,
        structureName: location.structureName,
        fields: [],
      });
    }

    groups.get(location.structureId)?.fields.push(location);
  }

  return Array.from(groups.values());
};

export const findTrainingLocationById = (
  locations: TrainingLocationOption[],
  locationId?: string | null,
) =>
  locations.find(
    (location) =>
      location.id === locationId || location.fieldId === locationId,
  ) || null;

export const getTrainingLocationLabel = (
  locations: TrainingLocationOption[],
  locationId?: string | null,
  fallback?: string | null,
) => findTrainingLocationById(locations, locationId)?.label || fallback || "";
