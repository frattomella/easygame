export const PASSWORD_POLICY = {
  minLength: 12,
  maxLength: 128,
} as const;

export type PasswordPolicyResult = {
  valid: boolean;
  errors: string[];
};

const COMMON_PASSWORDS = new Set([
  "password",
  "password123",
  "qwerty123456",
  "123456789012",
  "easygame1234",
]);

export const validatePassword = (
  password: string,
  email?: string | null,
): PasswordPolicyResult => {
  const errors: string[] = [];

  if (password.length < PASSWORD_POLICY.minLength) {
    errors.push(`almeno ${PASSWORD_POLICY.minLength} caratteri`);
  }
  if (password.length > PASSWORD_POLICY.maxLength) {
    errors.push(`non più di ${PASSWORD_POLICY.maxLength} caratteri`);
  }
  if (!/[a-z]/.test(password)) errors.push("una lettera minuscola");
  if (!/[A-Z]/.test(password)) errors.push("una lettera maiuscola");
  if (!/\d/.test(password)) errors.push("un numero");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("un carattere speciale");

  const normalizedPassword = password.toLowerCase();
  if (COMMON_PASSWORDS.has(normalizedPassword)) {
    errors.push("una password non comune");
  }

  const emailLocalPart = String(email || "")
    .trim()
    .toLowerCase()
    .split("@")[0];
  if (emailLocalPart.length >= 4 && normalizedPassword.includes(emailLocalPart)) {
    errors.push("una password che non contenga il nome dell’email");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

export const getPasswordPolicyMessage = (result: PasswordPolicyResult) =>
  result.valid
    ? ""
    : `La password deve contenere ${result.errors.join(", ")}.`;
