import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const localConfigUrl = new URL("../supabase/config.toml", import.meta.url);

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

function parseLocalProjectId(config) {
  const match = /^project_id\s*=\s*"([a-z0-9-]+)"\s*$/mu.exec(config);
  if (!match?.[1]) {
    throw new Error("Local Supabase config does not contain a safe project_id.");
  }
  return match[1];
}

function isLoopbackHost(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

async function authHealthCheck(supabaseUrl, fetchImplementation) {
  const healthUrl = new URL("/auth/v1/health", supabaseUrl);
  if (!isLoopbackHost(healthUrl.hostname)) {
    throw new Error("Local Supabase recovery refuses to target a non-loopback host.");
  }

  try {
    const response = await fetchImplementation(healthUrl, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function ensureLocalSupabaseGateway(
  localEnvironment,
  {
    execFileImplementation = execFileAsync,
    fetchImplementation = fetch,
    readFileImplementation = readFile,
    waitImplementation = wait,
  } = {},
) {
  const supabaseUrl = localEnvironment.NEXT_PUBLIC_SUPABASE_URL;
  if (await authHealthCheck(supabaseUrl, fetchImplementation)) {
    return Object.freeze({ refreshed: false });
  }

  const config = await readFileImplementation(localConfigUrl, "utf8");
  const projectId = parseLocalProjectId(config);
  const gatewayContainer = `supabase_kong_${projectId}`;
  await execFileImplementation("docker", ["restart", gatewayContainer], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  });

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await authHealthCheck(supabaseUrl, fetchImplementation)) {
      return Object.freeze({ refreshed: true });
    }
    await waitImplementation(250);
  }

  throw new Error("Local Supabase Auth remained unavailable after refreshing its gateway.");
}
