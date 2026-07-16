import "server-only";

import {
  createPublicAuthProviderDescriptors,
  type PublicAuthProviderDescriptor,
} from "@lumen/auth/providers";
import { getPublicCapabilities } from "@lumen/config/server-capabilities";

export function getConfiguredAuthProviders(): readonly PublicAuthProviderDescriptor[] {
  const capabilities = getPublicCapabilities();
  return createPublicAuthProviderDescriptors({
    emailPassword: true,
    magicLink: true,
    oauth: capabilities.oauthProviders.map((provider) =>
      provider === "azure" ? "microsoft" : provider,
    ),
  }).filter((provider) => provider.configured);
}
