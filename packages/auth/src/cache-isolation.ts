import { z } from "zod";

import { uuidSchema } from "./primitives";

export const cacheIsolationScopes = [
  "browser_memory",
  "query_cache",
  "indexed_db",
  "cache_storage",
  "service_worker_messages",
] as const;
export const cacheIsolationEventTypes = [
  "account_signed_out",
  "learner_profile_switched",
  "profile_session_revoked",
  "account_deletion_started",
] as const;

const cacheScopesSchema = z
  .array(z.enum(cacheIsolationScopes))
  .min(1)
  .max(cacheIsolationScopes.length)
  .refine((scopes) => new Set(scopes).size === scopes.length, "Cache scopes must be unique");

const eventMetadata = {
  version: z.literal(1),
  eventId: uuidSchema,
  occurredAt: z.iso.datetime({ offset: true }),
  accountId: uuidSchema,
  scopes: cacheScopesSchema,
} as const;

export const cacheIsolationEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...eventMetadata,
      type: z.literal("account_signed_out"),
      previousLearnerProfileId: uuidSchema.optional(),
      deviceId: uuidSchema,
    })
    .strict(),
  z
    .object({
      ...eventMetadata,
      type: z.literal("learner_profile_switched"),
      fromLearnerProfileId: uuidSchema,
      toLearnerProfileId: uuidSchema,
      deviceId: uuidSchema,
    })
    .strict()
    .refine(
      (event) => event.fromLearnerProfileId !== event.toLearnerProfileId,
      "Profile switch must change the learner profile",
    ),
  z
    .object({
      ...eventMetadata,
      type: z.literal("profile_session_revoked"),
      learnerProfileId: uuidSchema,
      profileSessionId: uuidSchema,
      deviceId: uuidSchema.optional(),
    })
    .strict(),
  z
    .object({
      ...eventMetadata,
      type: z.literal("account_deletion_started"),
      deletionJobId: uuidSchema,
    })
    .strict(),
]);

export type CacheIsolationScope = (typeof cacheIsolationScopes)[number];
export type CacheIsolationEvent = z.infer<typeof cacheIsolationEventSchema>;

/**
 * Every account/profile boundary clears all stores that can carry learner data.
 * Consumers may add stores later, but must not narrow this directive.
 */
export function requiredCacheIsolationScopes(): readonly CacheIsolationScope[] {
  return cacheIsolationScopes;
}
