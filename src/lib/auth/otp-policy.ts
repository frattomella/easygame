export const MAX_OTP_ATTEMPTS = 5;

export const shouldExposeVerificationPreviewCode = (
  environment: {
    NODE_ENV?: string;
    AUTH_ALLOW_TEST_CODES?: string;
  } = process.env,
) =>
  environment.NODE_ENV !== "production" &&
  environment.AUTH_ALLOW_TEST_CODES === "true";
