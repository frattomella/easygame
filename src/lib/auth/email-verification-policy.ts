export const EMAIL_VERIFICATION_UNAVAILABLE_MESSAGE =
  "La verifica email è temporaneamente non disponibile. Riprova quando il servizio sarà configurato.";

export const resolveEmailVerificationPolicy = (
  providerConfigured: boolean,
) => ({
  required: true,
  canSendOtp: providerConfigured,
  allowUnverifiedSession: false,
});
