type AuthProviderEnvironment = Partial<
  Record<
    | "NODE_ENV"
    | "AUTH_ALLOW_TEST_CODES"
    | "RESEND_API_KEY"
    | "AUTH_FROM_EMAIL"
    | "TWILIO_ACCOUNT_SID"
    | "TWILIO_AUTH_TOKEN"
    | "TWILIO_VERIFY_SERVICE_SID",
    string | undefined
  >
>;

export const isEmailVerificationProviderConfigured = (
  environment: AuthProviderEnvironment = process.env,
) => Boolean(environment.RESEND_API_KEY && environment.AUTH_FROM_EMAIL);

export const isPhoneVerificationProviderConfigured = (
  environment: AuthProviderEnvironment = process.env,
) =>
  Boolean(
    environment.TWILIO_ACCOUNT_SID &&
      environment.TWILIO_AUTH_TOKEN &&
      environment.TWILIO_VERIFY_SERVICE_SID,
  );

export const isPhoneVerificationEnabled = (
  environment: AuthProviderEnvironment = process.env,
) =>
  isPhoneVerificationProviderConfigured(environment) ||
  (environment.NODE_ENV !== "production" &&
    environment.AUTH_ALLOW_TEST_CODES === "true");
