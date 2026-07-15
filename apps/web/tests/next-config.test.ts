import { createEnvironmentFixture } from "@lumen/test-utils";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_EXPORT,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
  PHASE_TEST,
} from "next/constants";
import { describe, expect, it } from "vitest";

import { validateNextEnvironment } from "../next.config";

const requiredProductionValues = [
  "DEPLOYMENT_PROFILE",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "DATABASE_URL",
  "APP_ENCRYPTION_KEY",
  "GUEST_TOKEN_SIGNING_KEY",
  "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
] as const;

describe("Next environment validation", () => {
  it.each(requiredProductionValues)(
    "rejects a production build without %s even when NODE_ENV says test",
    (name) => {
      const source: Record<string, string | undefined> = {
        ...createEnvironmentFixture(),
        NODE_ENV: "test",
      };
      delete source[name];

      expect(() => validateNextEnvironment(PHASE_PRODUCTION_BUILD, source)).toThrow();
    },
  );

  it.each([PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER, PHASE_EXPORT])(
    "forces production semantics for %s",
    (phase) => {
      const environment = validateNextEnvironment(phase, createEnvironmentFixture());

      expect(environment.nodeEnvironment).toBe("production");
    },
  );

  it("keeps development and test phases usable with safe local defaults", () => {
    expect(validateNextEnvironment(PHASE_DEVELOPMENT_SERVER, {}).nodeEnvironment).toBe(
      "development",
    );
    expect(validateNextEnvironment(PHASE_TEST, {}).nodeEnvironment).toBe("test");
  });
});
