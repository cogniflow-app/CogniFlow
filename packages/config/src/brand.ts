export const DEFAULT_APP_NAME = "Lumen";

export interface BrandConfig {
  readonly name: string;
  readonly shortName: string;
  readonly description: string;
}

export interface BrandEnvironment {
  readonly NEXT_PUBLIC_APP_NAME?: string;
}

function normalizeName(value: string | undefined): string {
  const candidate = value?.trim();
  return candidate && candidate.length <= 80 ? candidate : DEFAULT_APP_NAME;
}

/**
 * Returns replaceable visible-brand copy. Product code should use this module
 * instead of embedding the temporary project name in components.
 */
export function createBrandConfig(
  environment: BrandEnvironment = process.env.NEXT_PUBLIC_APP_NAME
    ? { NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME }
    : {},
): BrandConfig {
  const name = normalizeName(environment.NEXT_PUBLIC_APP_NAME);

  return Object.freeze({
    name,
    shortName: name,
    description: "Remember deeply. Practice deliberately. Learn together.",
  });
}

export const brandConfig = createBrandConfig();
export const brand = brandConfig;
