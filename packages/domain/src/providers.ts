export const providerKinds = [
  "runtime",
  "email",
  "object_storage",
  "realtime",
  "rate_limit",
  "background_jobs",
  "ai",
  "analytics",
  "error_reporting",
] as const;

export type ProviderKind = (typeof providerKinds)[number];
export type ProviderHealthStatus = "available" | "degraded" | "disabled";

export interface ProviderDescriptor {
  readonly kind: ProviderKind;
  readonly provider: string;
  readonly status: ProviderHealthStatus;
  readonly reason?: string;
}

export interface InfrastructureAdapter<TCapability extends string = string> {
  readonly descriptor: ProviderDescriptor;
  capabilities(): readonly TCapability[];
  health(): Promise<ProviderDescriptor>;
}

export interface HostingRuntimeAdapter<
  TCapability extends string = string,
> extends InfrastructureAdapter<TCapability> {
  readonly descriptor: ProviderDescriptor & { readonly kind: "runtime" };
}

export type EmailAdapter<TCapability extends string = string> = InfrastructureAdapter<TCapability>;
export type ObjectStorageAdapter<TCapability extends string = string> =
  InfrastructureAdapter<TCapability>;
export type RealtimeAdapter<TCapability extends string = string> =
  InfrastructureAdapter<TCapability>;
export type RateLimitAdapter<TCapability extends string = string> =
  InfrastructureAdapter<TCapability>;
export type BackgroundJobAdapter<TCapability extends string = string> =
  InfrastructureAdapter<TCapability>;
export type AiAdapter<TCapability extends string = string> = InfrastructureAdapter<TCapability>;
export type AnalyticsAdapter<TCapability extends string = string> =
  InfrastructureAdapter<TCapability>;
export type ErrorReportingAdapter<TCapability extends string = string> =
  InfrastructureAdapter<TCapability>;

export interface ProviderAvailabilitySummary {
  readonly available: readonly ProviderKind[];
  readonly degraded: readonly ProviderKind[];
  readonly disabled: readonly ProviderKind[];
}

/** Produces a deterministic, non-secret capability summary for diagnostics. */
export function summarizeProviderAvailability(
  providers: readonly ProviderDescriptor[],
): ProviderAvailabilitySummary {
  const byStatus = (status: ProviderHealthStatus): readonly ProviderKind[] =>
    Object.freeze(
      [
        ...new Set(
          providers
            .filter((provider) => provider.status === status)
            .map((provider) => provider.kind),
        ),
      ].sort(),
    );

  return Object.freeze({
    available: byStatus("available"),
    degraded: byStatus("degraded"),
    disabled: byStatus("disabled"),
  });
}
