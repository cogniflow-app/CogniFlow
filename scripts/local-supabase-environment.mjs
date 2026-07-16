import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function decodeEnvironmentValue(rawValue) {
  const value = rawValue.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error("Local Supabase returned a malformed quoted environment value.");
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseSupabaseStatusEnvironment(output) {
  const parsed = new Map();

  for (const line of output.split(/\r?\n/u)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line.trim());
    if (match?.[1] && match[2] !== undefined) {
      parsed.set(match[1], decodeEnvironmentValue(match[2]));
    }
  }

  const supabaseUrl = parsed.get("API_URL");
  const publishableKey = parsed.get("PUBLISHABLE_KEY") ?? parsed.get("ANON_KEY");
  const secretKey = parsed.get("SECRET_KEY") ?? parsed.get("SERVICE_ROLE_KEY");
  const databaseUrl = parsed.get("DB_URL");

  if (!supabaseUrl || !publishableKey || !secretKey || !databaseUrl) {
    throw new Error("Local Supabase status did not provide every required application value.");
  }

  return Object.freeze({
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SECRET_KEY: secretKey,
    DATABASE_URL: databaseUrl,
  });
}

export async function readLocalSupabaseEnvironment(baseEnvironment = process.env) {
  const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  let stdout;

  try {
    ({ stdout } = await execFileAsync(executable, ["exec", "supabase", "status", "-o", "env"], {
      encoding: "utf8",
      env: baseEnvironment,
      maxBuffer: 1024 * 1024,
    }));
  } catch {
    throw new Error(
      "Unable to read the local Supabase test environment. Start it with `pnpm db:start`.",
    );
  }

  return parseSupabaseStatusEnvironment(stdout);
}
