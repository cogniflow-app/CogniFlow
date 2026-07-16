import { z } from "zod";

export const oauthProviderNames = ["google", "github", "microsoft"] as const;
export const authProviderNames = ["email_password", "magic_link", ...oauthProviderNames] as const;

export const oauthProviderNameSchema = z.enum(oauthProviderNames);
export const authProviderNameSchema = z.enum(authProviderNames);

export const authProviderConfigurationSchema = z
  .object({
    emailPassword: z.boolean(),
    magicLink: z.boolean(),
    oauth: z
      .array(oauthProviderNameSchema)
      .max(oauthProviderNames.length)
      .refine(
        (providers) => new Set(providers).size === providers.length,
        "Providers must be unique",
      ),
  })
  .strict();

export const publicAuthProviderDescriptorSchema = z
  .object({
    id: authProviderNameSchema,
    kind: z.enum(["password", "email_link", "oauth"]),
    label: z.string().min(1).max(40),
    configured: z.boolean(),
  })
  .strict();

export type AuthProviderName = z.infer<typeof authProviderNameSchema>;
export type OAuthProviderName = z.infer<typeof oauthProviderNameSchema>;
export type AuthProviderConfiguration = z.infer<typeof authProviderConfigurationSchema>;
export type PublicAuthProviderDescriptor = z.infer<typeof publicAuthProviderDescriptorSchema>;

const providerMetadata: Readonly<
  Record<AuthProviderName, Omit<PublicAuthProviderDescriptor, "configured">>
> = Object.freeze({
  email_password: Object.freeze({ id: "email_password", kind: "password", label: "Email" }),
  magic_link: Object.freeze({ id: "magic_link", kind: "email_link", label: "Email link" }),
  google: Object.freeze({ id: "google", kind: "oauth", label: "Google" }),
  github: Object.freeze({ id: "github", kind: "oauth", label: "GitHub" }),
  microsoft: Object.freeze({ id: "microsoft", kind: "oauth", label: "Microsoft" }),
});

/** Produces the only provider fields safe to serialize to an unauthenticated page. */
export function createPublicAuthProviderDescriptors(
  untrustedConfiguration: unknown,
): readonly PublicAuthProviderDescriptor[] {
  const configuration = authProviderConfigurationSchema.parse(untrustedConfiguration);
  const enabledOAuth = new Set(configuration.oauth);

  return Object.freeze(
    authProviderNames.map((id) =>
      Object.freeze({
        ...providerMetadata[id],
        configured:
          id === "email_password"
            ? configuration.emailPassword
            : id === "magic_link"
              ? configuration.magicLink
              : enabledOAuth.has(id),
      }),
    ),
  );
}

export function configuredAuthProviders(
  descriptors: readonly PublicAuthProviderDescriptor[],
): readonly PublicAuthProviderDescriptor[] {
  return Object.freeze(
    descriptors
      .map((descriptor) => publicAuthProviderDescriptorSchema.parse(descriptor))
      .filter((descriptor) => descriptor.configured),
  );
}
