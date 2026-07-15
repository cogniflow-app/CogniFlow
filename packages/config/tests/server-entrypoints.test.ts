import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getPublicCapabilities } from "../src/server-capabilities";
import { getServerEnvironment } from "../src/server-env";

describe("server-only configuration entry points", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEPLOYMENT_PROFILE", "test");
    vi.stubEnv("ENABLE_CHILD_PROFILES", "false");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses an explicitly supplied source", () => {
    expect(getServerEnvironment({ NODE_ENV: "test" })).toMatchObject({
      deploymentProfile: "test",
      enableChildProfiles: false,
    });
  });

  it("returns only sanitized public capabilities", () => {
    expect(getPublicCapabilities()).toEqual({
      deploymentProfile: "test",
      childProfiles: false,
      publicChildContent: false,
      freeTextGameChat: false,
    });
  });
});
