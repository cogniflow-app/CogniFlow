import type { HostingRuntimeAdapter, ProviderDescriptor } from "./providers";

export const runtimeProviders = ["local", "vercel", "cloudflare"] as const;
export const runtimeKinds = ["nodejs", "edge"] as const;

export type RuntimeProvider = (typeof runtimeProviders)[number];
export type RuntimeKind = (typeof runtimeKinds)[number];

export interface RuntimeDescriptor {
  readonly provider: RuntimeProvider;
  readonly runtime: RuntimeKind;
  readonly buildVersion: string;
  readonly commitSha?: string;
  readonly region?: string;
}

export interface RuntimeHealth {
  readonly status: "ok";
  readonly checkedAt: string;
  readonly buildVersion: string;
  readonly provider: RuntimeProvider;
  readonly runtime: RuntimeKind;
}

export interface PlatformRuntimeAdapter extends HostingRuntimeAdapter<
  "health" | "server_rendering"
> {
  readonly runtime: RuntimeDescriptor;
  health(now?: Date): Promise<ProviderDescriptor>;
}

function normalizeOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function createRuntimeDescriptor(descriptor: RuntimeDescriptor): RuntimeDescriptor {
  const buildVersion = descriptor.buildVersion.trim();
  if (!buildVersion) {
    throw new Error("Runtime buildVersion cannot be empty");
  }

  const commitSha = normalizeOptional(descriptor.commitSha);
  const region = normalizeOptional(descriptor.region);

  return Object.freeze({
    provider: descriptor.provider,
    runtime: descriptor.runtime,
    buildVersion,
    ...(commitSha === undefined ? {} : { commitSha }),
    ...(region === undefined ? {} : { region }),
  });
}

export function createRuntimeHealth(
  descriptor: RuntimeDescriptor,
  now: Date = new Date(),
): RuntimeHealth {
  const normalized = createRuntimeDescriptor(descriptor);

  return Object.freeze({
    status: "ok",
    checkedAt: now.toISOString(),
    buildVersion: normalized.buildVersion,
    provider: normalized.provider,
    runtime: normalized.runtime,
  });
}
