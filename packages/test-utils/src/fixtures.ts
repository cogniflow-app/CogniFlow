import { createRuntimeDescriptor, type RuntimeDescriptor } from "@lumen/domain/runtime";

export type EnvironmentFixture = Readonly<Record<string, string>>;

export function createEnvironmentFixture(
  overrides: Readonly<Record<string, string>> = {},
): EnvironmentFixture {
  return Object.freeze({
    NODE_ENV: "test",
    DEPLOYMENT_PROFILE: "test",
    NEXT_PUBLIC_APP_NAME: "Lumen Test",
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    AUTH_EMAIL_CONFIRMATION_REQUIRED: "false",
    AUTH_OAUTH_AZURE_ENABLED: "false",
    AUTH_OAUTH_GITHUB_ENABLED: "false",
    AUTH_OAUTH_GOOGLE_ENABLED: "false",
    SUPABASE_SECRET_KEY: "fixture-secret-key-with-sufficient-length",
    DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    APP_ENCRYPTION_KEY: "fixture-encryption-key-with-sufficient-length",
    GUEST_TOKEN_SIGNING_KEY: "fixture-signing-key-with-sufficient-length",
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    ENABLE_CHILD_PROFILES: "false",
    ENABLE_PUBLIC_CHILD_CONTENT: "false",
    ENABLE_FREE_TEXT_GAME_CHAT: "false",
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
    PARENTAL_CONSENT_MODE: "disabled",
    ...overrides,
  });
}

export function createRuntimeFixture(
  overrides: Partial<RuntimeDescriptor> = {},
): RuntimeDescriptor {
  return createRuntimeDescriptor({
    provider: "local",
    runtime: "nodejs",
    buildVersion: "0.0.0-test",
    ...overrides,
  });
}

export interface MemoryCookieStore {
  readonly getAll: () => readonly {
    readonly name: string;
    readonly value: string;
  }[];
  readonly setAll: (values: readonly { readonly name: string; readonly value: string }[]) => void;
}

export function createMemoryCookieStore(
  initial: Readonly<Record<string, string>> = {},
): MemoryCookieStore {
  const values = new Map(Object.entries(initial));

  return {
    getAll: () => [...values.entries()].map(([name, value]) => ({ name, value })),
    setAll: (nextValues) => {
      for (const { name, value } of nextValues) {
        values.set(name, value);
      }
    },
  };
}
