type AuthProviderEnvironment = Partial<
  Record<
    | "NODE_ENV"
    | "AUTH_ALLOW_TEST_CODES"
    | "TWILIO_ACCOUNT_SID"
    | "TWILIO_AUTH_TOKEN"
    | "TWILIO_VERIFY_SERVICE_SID",
    string | undefined
  >
>;

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
