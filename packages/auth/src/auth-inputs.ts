import { z } from "zod";

import { selfOnboardingAgeBandSchema, signupAgeBandSchema } from "./identity-values";
import { opaqueTokenSchema, uuidSchema } from "./primitives";
import { oauthProviderNameSchema } from "./providers";
import { returnUrlInputSchema } from "./redirects";

const passwordControlPattern = /[\u0000-\u001f\u007f]/u;

export const emailAddressSchema = z
  .string()
  .trim()
  .max(254)
  .email("Enter a valid email address")
  .transform((value) => value.toLowerCase());

/** Used only when verifying an existing credential; it does not weaken new-password policy. */
export const passwordCredentialSchema = z.string().min(1).max(128);

export const newPasswordSchema = passwordCredentialSchema
  .refine((value) => value.length >= 12, "Use at least 12 characters")
  .refine(
    (value) => !passwordControlPattern.test(value),
    "Password contains unsupported characters",
  )
  .refine((value) => !/^\s+$/u.test(value), "Password cannot contain only whitespace");

export const emailPasswordSignUpInputSchema = z
  .object({
    ageBand: signupAgeBandSchema,
    email: emailAddressSchema,
    password: newPasswordSchema,
    returnTo: returnUrlInputSchema,
  })
  .strict();

export const emailPasswordSignInInputSchema = z
  .object({
    email: emailAddressSchema,
    password: passwordCredentialSchema,
    returnTo: returnUrlInputSchema,
  })
  .strict();

export const magicLinkSignInInputSchema = z
  .object({
    email: emailAddressSchema,
    returnTo: returnUrlInputSchema,
  })
  .strict();

export const passwordRecoveryRequestInputSchema = z
  .object({
    email: emailAddressSchema,
    returnTo: returnUrlInputSchema,
  })
  .strict();

/** The server must verify an authenticated recovery session before accepting this input. */
export const passwordResetInputSchema = z
  .object({
    password: newPasswordSchema,
    passwordConfirmation: z.string().max(128),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.password !== input.passwordConfirmation) {
      context.addIssue({
        code: "custom",
        message: "Passwords do not match",
        path: ["passwordConfirmation"],
      });
    }
  });

export const authorizationCallbackInputSchema = z
  .object({
    code: opaqueTokenSchema,
    returnTo: returnUrlInputSchema,
  })
  .strict();

export const emailVerificationInputSchema = z
  .object({
    tokenHash: opaqueTokenSchema,
    verificationType: z.enum(["signup", "email_change", "magic_link", "recovery"]),
    returnTo: returnUrlInputSchema,
  })
  .strict();

const sha256DigestSchema = z.string().regex(/^[a-f0-9]{64}$/u, "Use a SHA-256 digest");
const boundedIntentTimestampSchema = z.iso.datetime({ offset: true });

const pendingAuthAgeGateBaseSchema = z.object({
  version: z.literal(1),
  purpose: z.literal("pending_auth_age_gate"),
  ageBand: selfOnboardingAgeBandSchema.nullable(),
  expiresAt: boundedIntentTimestampSchema,
  flowNonceHash: sha256DigestSchema,
  issuedAt: boundedIntentTimestampSchema,
  returnTo: returnUrlInputSchema,
});

/**
 * Server-signed, short-lived state for an independent-account auth attempt.
 * This is stored only in an HttpOnly cookie. It binds the neutral age decision
 * to the exact auth method and callback nonce instead of trusting callback
 * query parameters or mutable Auth user metadata.
 */
export const pendingAuthAgeGateSchema = z
  .union([
    pendingAuthAgeGateBaseSchema
      .extend({
        flow: z.literal("password_signup"),
        intent: z.literal("sign_up"),
        ageBand: selfOnboardingAgeBandSchema,
        provider: z.null(),
        subjectHash: sha256DigestSchema,
      })
      .strict(),
    pendingAuthAgeGateBaseSchema
      .extend({
        flow: z.literal("oauth"),
        intent: z.literal("sign_up"),
        ageBand: selfOnboardingAgeBandSchema,
        provider: oauthProviderNameSchema,
        subjectHash: z.null(),
      })
      .strict(),
    pendingAuthAgeGateBaseSchema
      .extend({
        flow: z.literal("oauth"),
        intent: z.literal("sign_in"),
        ageBand: z.null(),
        provider: oauthProviderNameSchema,
        subjectHash: z.null(),
      })
      .strict(),
  ])
  .refine(
    (intent) => Date.parse(intent.expiresAt) > Date.parse(intent.issuedAt),
    "Pending auth age gate expiration must follow issuance",
  );

/** Bound to the authenticated account after the provider/email callback. */
export const verifiedOnboardingAgeGateSchema = z
  .object({
    version: z.literal(1),
    purpose: z.literal("verified_onboarding_age_gate"),
    accountId: uuidSchema,
    ageBand: selfOnboardingAgeBandSchema,
    expiresAt: boundedIntentTimestampSchema,
    issuedAt: boundedIntentTimestampSchema,
    nonceHash: sha256DigestSchema,
    returnTo: returnUrlInputSchema,
  })
  .strict()
  .refine(
    (intent) => Date.parse(intent.expiresAt) > Date.parse(intent.issuedAt),
    "Onboarding age gate expiration must follow issuance",
  );

/** Server-signed state issued before a password-recovery email is requested. */
export const pendingRecoveryIntentSchema = z
  .object({
    version: z.literal(1),
    purpose: z.literal("pending_password_recovery"),
    expiresAt: boundedIntentTimestampSchema,
    flowNonceHash: sha256DigestSchema,
    issuedAt: boundedIntentTimestampSchema,
    returnTo: returnUrlInputSchema,
    subjectHash: sha256DigestSchema,
  })
  .strict()
  .refine(
    (intent) => Date.parse(intent.expiresAt) > Date.parse(intent.issuedAt),
    "Pending recovery expiration must follow issuance",
  );

/**
 * Signed/encrypted server-cookie payload established only by a verified recovery callback.
 * It is server state, not a request body and not evidence merely because a client supplied it.
 */
export const recoverySessionIntentSchema = z
  .object({
    version: z.literal(1),
    purpose: z.literal("password_recovery"),
    accountId: uuidSchema,
    issuedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    nonceHash: z.string().regex(/^[a-f0-9]{64}$/u, "Use a SHA-256 nonce digest"),
  })
  .strict()
  .refine(
    (intent) => Date.parse(intent.expiresAt) > Date.parse(intent.issuedAt),
    "Recovery intent expiration must follow issuance",
  );

export const reauthenticationRequestSchema = z.discriminatedUnion("method", [
  z
    .object({
      method: z.literal("password"),
      password: passwordCredentialSchema,
    })
    .strict(),
  z
    .object({
      method: z.literal("authorization_code"),
      code: opaqueTokenSchema,
    })
    .strict(),
  z
    .object({
      method: z.literal("magic_link"),
      challengeToken: opaqueTokenSchema,
    })
    .strict(),
]);

export const signOutInputSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("current") }).strict(),
  z
    .object({
      password: passwordCredentialSchema,
      scope: z.literal("all"),
    })
    .strict(),
]);

/** Server-issued proof consumed by one high-risk mutation; never replace with a client boolean. */
export const reauthenticationProofSchema = z
  .object({
    proofId: uuidSchema,
    proofToken: opaqueTokenSchema,
  })
  .strict();

export type EmailPasswordSignUpInput = z.infer<typeof emailPasswordSignUpInputSchema>;
export type EmailPasswordSignInInput = z.infer<typeof emailPasswordSignInInputSchema>;
export type MagicLinkSignInInput = z.infer<typeof magicLinkSignInInputSchema>;
export type PasswordRecoveryRequestInput = z.infer<typeof passwordRecoveryRequestInputSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetInputSchema>;
export type AuthorizationCallbackInput = z.infer<typeof authorizationCallbackInputSchema>;
export type EmailVerificationInput = z.infer<typeof emailVerificationInputSchema>;
export type RecoverySessionIntent = z.infer<typeof recoverySessionIntentSchema>;
export type PendingRecoveryIntent = z.infer<typeof pendingRecoveryIntentSchema>;
export type PendingAuthAgeGate = z.infer<typeof pendingAuthAgeGateSchema>;
export type VerifiedOnboardingAgeGate = z.infer<typeof verifiedOnboardingAgeGateSchema>;
export type ReauthenticationRequest = z.infer<typeof reauthenticationRequestSchema>;
export type ReauthenticationProof = z.infer<typeof reauthenticationProofSchema>;
export type SignOutInput = z.infer<typeof signOutInputSchema>;
