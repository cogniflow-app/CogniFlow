const fixedVerificationValues = Object.freeze({
  NEXT_PUBLIC_APP_NAME: "Lumen Verification",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_inert_verification_value",
  SUPABASE_SECRET_KEY: "inert-verification-secret-key-not-for-use",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  DEPLOYMENT_PROFILE: "test",
  ENABLE_CHILD_PROFILES: "false",
  ENABLE_PUBLIC_CHILD_CONTENT: "false",
  ENABLE_FREE_TEXT_GAME_CHAT: "false",
  APP_ENCRYPTION_KEY: "inert-verification-app-key-at-least-32-characters",
  GUEST_TOKEN_SIGNING_KEY: "inert-verification-guest-key-at-least-32-characters",
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  NEXT_PUBLIC_BUILD_VERSION: "phase-00-verification",
});

export function withVerificationEnvironment(base = process.env) {
  return {
    ...base,
    ...fixedVerificationValues,
  };
}
