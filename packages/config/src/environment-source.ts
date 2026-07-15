export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export type NodeEnvironment = "development" | "production" | "test";

export function readNodeEnvironment(source: EnvironmentSource): NodeEnvironment {
  const value = source.NODE_ENV;
  if (value === "production" || value === "test") {
    return value;
  }

  return "development";
}
