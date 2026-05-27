export type AthleteNameLike = {
  first_name?: string | null;
  last_name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  surname?: string | null;
  cognome?: string | null;
  fullName?: string | null;
  full_name?: string | null;
  displayName?: string | null;
  label?: string | null;
  name?: string | null;
  category_name?: string | null;
  categoryName?: string | null;
  jersey_number?: string | null;
  jerseyNumber?: string | null;
};

export const cleanNamePart = (value: unknown) =>
  String(value || "").trim();

export const normalizeNamePart = cleanNamePart;

const getRecordValue = (athlete: unknown, keys: string[]) => {
  if (!athlete || typeof athlete !== "object") {
    return "";
  }

  const record = athlete as Record<string, any>;
  for (const key of keys) {
    const value = cleanNamePart(record[key]);
    if (value) {
      return value;
    }
  }

  return "";
};

const getFallbackDisplayValue = (person: unknown) => {
  if (!person || typeof person !== "object") {
    return "";
  }

  const record = person as Record<string, any>;
  return cleanNamePart(
    record.fullName || record.full_name || record.displayName || record.label || record.name,
  );
};

export const getAthleteFirstName = (athlete: unknown) =>
  getRecordValue(athlete, ["first_name", "firstName", "nome"]);

export const getAthleteLastName = (athlete: unknown) =>
  getRecordValue(athlete, ["last_name", "lastName", "surname", "cognome"]);

export const formatPersonNameLastFirst = (person: AthleteNameLike) => {
  const lastName = getAthleteLastName(person);
  const firstName = getAthleteFirstName(person);
  const formatted = [lastName, firstName].filter(Boolean).join(" ").trim();

  return formatted || getFallbackDisplayValue(person);
};

export const formatAthleteNameLastFirst = (athlete: AthleteNameLike) =>
  formatPersonNameLastFirst(athlete) || "Atleta";

export const formatAthleteName = (athlete: AthleteNameLike) =>
  formatAthleteNameLastFirst(athlete);

export const getAthleteDisplayName = (athlete: unknown) => {
  const composite =
    athlete && typeof athlete === "object"
      ? formatPersonNameLastFirst(athlete as Record<string, any>)
      : "";

  if (composite) {
    return composite;
  }

  const fallback = getFallbackDisplayValue(athlete);
  if (fallback) {
    return fallback;
  }

  return "Atleta";
};

export const compareAthletesByLastName = (left: unknown, right: unknown) => {
  const leftLastName = getAthleteLastName(left);
  const rightLastName = getAthleteLastName(right);
  const surnameComparison = leftLastName.localeCompare(rightLastName, "it", {
    sensitivity: "base",
  });

  if (surnameComparison !== 0) {
    return surnameComparison;
  }

  const leftFirstName = getAthleteFirstName(left);
  const rightFirstName = getAthleteFirstName(right);
  const firstNameComparison = leftFirstName.localeCompare(
    rightFirstName,
    "it",
    {
      sensitivity: "base",
    },
  );

  if (firstNameComparison !== 0) {
    return firstNameComparison;
  }

  const leftDisplayName = getAthleteDisplayName(left);
  const rightDisplayName = getAthleteDisplayName(right);

  return leftDisplayName.localeCompare(rightDisplayName, "it", {
    sensitivity: "base",
  });
};

export const getAthleteSearchText = (athlete: AthleteNameLike) => {
  const firstName = cleanNamePart(athlete.first_name ?? athlete.firstName);
  const lastName = cleanNamePart(
    athlete.last_name ?? athlete.lastName ?? athlete.surname ?? athlete.cognome,
  );
  const categoryName = cleanNamePart(
    athlete.category_name ?? athlete.categoryName,
  );
  const jerseyNumber = cleanNamePart(
    athlete.jersey_number ?? athlete.jerseyNumber,
  );

  return [
    firstName,
    lastName,
    [lastName, firstName].filter(Boolean).join(" "),
    [firstName, lastName].filter(Boolean).join(" "),
    getFallbackDisplayValue(athlete),
    categoryName,
    jerseyNumber,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
};
