export const normalizeAccessRole = (role?: string | null) => {
  const value = String(role || "").trim().toLowerCase();

  const aliases: Record<string, string> = {
    allenatore: "trainer",
    atleta: "athlete",
    collaboratore: "collaborator",
    collaboratoree: "collaborator",
    collaborator: "collaborator",
    genitore: "parent",
    guardian: "parent",
    manager: "admin",
    membro: "member",
    proprietario: "owner",
    segreteria: "staff",
    secretary: "staff",
  };

  return aliases[value] || value;
};

export const getAccessRoleLabel = (role?: string | null) => {
  switch (normalizeAccessRole(role)) {
    case "owner":
      return "Proprietario";
    case "admin":
      return "Amministratore";
    case "trainer":
      return "Allenatore";
    case "athlete":
      return "Atleta";
    case "parent":
      return "Genitore";
    case "staff":
      return "Segreteria";
    case "member":
      return "Membro";
    case "collaborator":
    default:
      return "Collaboratore";
  }
};

export const isTrainerAccessRole = (role?: string | null) =>
  normalizeAccessRole(role) === "trainer";

export const isParentAccessRole = (role?: string | null) =>
  normalizeAccessRole(role) === "parent";

export const isAthleteAccessRole = (role?: string | null) =>
  normalizeAccessRole(role) === "athlete";

export const isManagementAccessRole = (role?: string | null) =>
  [
    "owner",
    "admin",
    "collaborator",
    "staff",
    "member",
    "manager",
    "secretariat",
  ].includes(normalizeAccessRole(role));
