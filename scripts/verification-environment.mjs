const fixedVerificationValues = Object.freeze({
  NEXT_PUBLIC_APP_NAME: "Lumen Verification",
  NEXT_PUBLIC_APP_URL: "https://verification.example.test",
  NEXT_PUBLIC_SUPABASE_URL: "https://supabase.verification.example.test",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_inert_verification_value",
  AUTH_EMAIL_CONFIRMATION_REQUIRED: "false",
  AUTH_OAUTH_AZURE_ENABLED: "false",
  AUTH_OAUTH_GITHUB_ENABLED: "false",
  AUTH_OAUTH_GOOGLE_ENABLED: "false",
  SUPABASE_SECRET_KEY: "inert-verification-secret-key-not-for-use",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  DEPLOYMENT_PROFILE: "cloudflare",
  ENABLE_CHILD_PROFILES: "false",
  ENABLE_PUBLIC_CHILD_CONTENT: "false",
  ENABLE_FREE_TEXT_GAME_CHAT: "false",
  PARENTAL_CONSENT_MODE: "disabled",
  AUDIT_EVENT_RETENTION_DAYS: "365",
  DELETION_GRACE_PERIOD_DAYS: "30",
  EXPORT_DOWNLOAD_RETENTION_DAYS: "7",
  GUEST_SESSION_RETENTION_HOURS: "24",
  PROFILE_SESSION_TTL_MINUTES: "30",
  RATE_LIMIT_DESTRUCTIVE_REQUEST_ATTEMPTS: "3",
  RATE_LIMIT_GUEST_CREATION_ATTEMPTS: "20",
  RATE_LIMIT_PASSWORD_RESET_ATTEMPTS: "5",
  RATE_LIMIT_PROFILE_PIN_ATTEMPTS: "5",
  RATE_LIMIT_SIGNUP_ATTEMPTS: "5",
  RATE_LIMIT_WINDOW_SECONDS: "900",
  APP_ENCRYPTION_KEY: "inert-verification-app-key-at-least-32-characters",
  GUEST_TOKEN_SIGNING_KEY: "inert-verification-guest-key-at-least-32-characters",
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  NEXT_PUBLIC_BUILD_VERSION: "phase-01-verification",
});

export function withVerificationEnvironment(base = process.env) {
  return {
    ...base,
    ...fixedVerificationValues,
  };
}
