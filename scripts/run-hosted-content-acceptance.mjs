import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertEmptyHostedStorage } from "./hosted-database.mjs";
import { createHostedPlaywrightEnvironment } from "./hosted-child-environment.mjs";
import hostedPreflightContract from "./hosted-preflight.cjs";
import { isCandidateVercelAutomationOrigin, normalizeHostedBaseUrl } from "./run-hosted-smoke.mjs";
import {
  authenticateVercelDeploymentOwnership,
  createHostedPreflightAttestation,
  fetchHostedHealthWithScopedBypass,
  resolveVercelAutomationBypass,
} from "./vercel-deployment-ownership.mjs";

const PREVIEW_PROJECT_REF = "cfwddajyjbueggpzfomh";
const PRODUCTION_ORIGINS = new Set([
  "https://cogniflow-pearl.vercel.app",
  "https://recallflash.com",
]);
const LINK_PATH = resolve("supabase/.temp/project-ref");
const LOCK_PATH = resolve("supabase/.temp/hosted-database.lock");
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const { createHostedPreflightFile, destroyHostedPreflightFile } = hostedPreflightContract;

function signalExitCode(signal) {
  return signal === "SIGINT" ? 130 : 143;
}

function signalError(signal) {
  const error = new Error(
    `Hosted content acceptance received ${signal}; fixture cleanup was attempted before exit.`,
  );
  error.exitCode = signalExitCode(signal);
  error.signal = signal;
  return error;
}

export function createHostedContentSignalController(processImplementation = process) {
  let activeChild = null;
  let cleanupInProgress = false;
  let installed = false;
  let requestedSignal = null;
  let escalationTimer;

  function interruptActiveChild() {
    if (!activeChild?.interruptible || cleanupInProgress || !requestedSignal) return;
    try {
      activeChild.child.kill(requestedSignal);
    } catch {
      // The command may already have exited. Its normal completion path still reaches cleanup.
    }
    escalationTimer = setTimeout(() => {
      try {
        activeChild?.child.kill("SIGKILL");
      } catch {
        // A completed process needs no escalation.
      }
    }, 10_000);
    escalationTimer.unref?.();
  }

  const handlers = Object.freeze({
    SIGINT: () => {
      if (requestedSignal) return;
      requestedSignal = "SIGINT";
      interruptActiveChild();
    },
    SIGTERM: () => {
      if (requestedSignal) return;
      requestedSignal = "SIGTERM";
      interruptActiveChild();
    },
  });

  return Object.freeze({
    beginCleanup() {
      cleanupInProgress = true;
      activeChild = null;
      if (escalationTimer) clearTimeout(escalationTimer);
    },
    dispose() {
      if (!installed) return;
      installed = false;
      processImplementation.removeListener("SIGINT", handlers.SIGINT);
      processImplementation.removeListener("SIGTERM", handlers.SIGTERM);
      if (escalationTimer) clearTimeout(escalationTimer);
    },
    get requestedSignal() {
      return requestedSignal;
    },
    install() {
      if (installed) return;
      installed = true;
      processImplementation.on("SIGINT", handlers.SIGINT);
      processImplementation.on("SIGTERM", handlers.SIGTERM);
    },
    throwIfSignaled() {
      if (requestedSignal) throw signalError(requestedSignal);
    },
    terminateActiveChild() {
      if (!activeChild?.interruptible || cleanupInProgress) return;
      try {
        activeChild.child.kill("SIGTERM");
      } catch {
        // A completed process needs no termination.
      }
    },
    trackChild(child, { interruptible = true } = {}) {
      const tracked = { child, interruptible };
      activeChild = tracked;
      interruptActiveChild();
      return () => {
        if (activeChild === tracked) activeChild = null;
        if (escalationTimer) clearTimeout(escalationTimer);
        escalationTimer = undefined;
      };
    },
  });
}

export function createOnceAsync(operation) {
  let promise;
  return (...arguments_) => {
    promise ??= Promise.resolve().then(() => operation(...arguments_));
    return promise;
  };
}

export async function provisionHostedAcceptanceFixture(
  runId,
  secretKey,
  { fetchImplementation = fetch, signal } = {},
) {
  const identity = createHostedAcceptanceIdentity(runId);
  if (typeof secretKey !== "string" || secretKey.length < 24) {
    throw new Error("The Preview Auth fixture provisioner received an invalid server credential.");
  }
  const headers = {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
  };
  const response = await fetchImplementation(
    `https://${PREVIEW_PROJECT_REF}.supabase.co/auth/v1/admin/users`,
    {
      body: JSON.stringify({
        email: identity.email,
        email_confirm: true,
        password: createHostedAcceptancePassword(runId),
        user_metadata: { lumen_hosted_acceptance: runId },
      }),
      cache: "no-store",
      headers,
      method: "POST",
      redirect: "error",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
        : AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error("Preview Auth fixture provisioning failed.");
  const serialized = await response.text();
  if (Buffer.byteLength(serialized, "utf8") > 65_536) {
    throw new Error("Preview Auth returned an oversized fixture response.");
  }
  let body;
  try {
    body = JSON.parse(serialized);
  } catch {
    throw new Error("Preview Auth returned an invalid fixture response.");
  }
  const user = record(body);
  if (
    user?.email !== identity.email ||
    typeof user.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(user.id) ||
    record(user.user_metadata)?.lumen_hosted_acceptance !== runId
  ) {
    throw new Error("Preview Auth returned an unexpected fixture identity.");
  }
}

function runCommand(
  executable,
  arguments_,
  { capture = false, env = process.env, signalController } = {},
) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, arguments_, {
      cwd: repositoryRoot,
      env: { ...env, NO_COLOR: "1" },
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    let stdout = "";
    let settled = false;
    const stopTracking = signalController?.trackChild(child);
    const settle = (callback) => {
      if (settled) return;
      settled = true;
      stopTracking?.();
      callback();
    };
    if (capture) {
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });
    }
    child.once("error", (error) => settle(() => rejectPromise(error)));
    child.once("exit", (code, signal) => {
      settle(() => {
        if (code === 0) resolvePromise({ code, stdout });
        else rejectPromise(new Error(`Command failed with ${code ?? signal ?? "unknown status"}.`));
      });
    });
  });
}

export function parsePreviewSecretKey(output) {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("Supabase returned an invalid API-key inventory.");
  }
  const inventory = Array.isArray(parsed)
    ? parsed
    : record(parsed) && Array.isArray(parsed.keys)
      ? parsed.keys
      : null;
  if (!inventory) throw new Error("Supabase returned an invalid API-key inventory.");
  const candidates = inventory.filter(
    (candidate) =>
      record(candidate)?.type === "secret" &&
      typeof candidate.api_key === "string" &&
      /^sb_secret_[A-Za-z0-9_-]{16,256}$/u.test(candidate.api_key),
  );
  if (candidates.length !== 1) {
    throw new Error("The Preview server key is unavailable to the authenticated operator.");
  }
  return candidates[0].api_key;
}

export function resolveHostedContentBaseUrl(argv, environment = process.env) {
  let override;
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option !== "--url" || override !== undefined) {
      throw new Error(`Unknown or repeated hosted content option: ${option ?? ""}`);
    }
    override = argv[index + 1];
    if (!override) throw new Error("--url requires a value.");
    index += 1;
  }

  const baseURL = normalizeHostedBaseUrl(override ?? environment.HOSTED_PREVIEW_URL);
  if (PRODUCTION_ORIGINS.has(baseURL)) {
    throw new Error("Hosted content acceptance must never target a Production alias.");
  }
  if (!isCandidateVercelAutomationOrigin(baseURL)) {
    throw new Error("Hosted content acceptance is restricted to this repository's Vercel project.");
  }
  return baseURL;
}

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

export function assertPreviewHealthProjection(value) {
  const health = record(value);
  if (
    health?.status !== "ok" ||
    health.provider !== "vercel" ||
    health.deploymentProfile !== "vercel_beta" ||
    health.vercelEnvironment !== "preview" ||
    health.supabaseProjectRef !== PREVIEW_PROJECT_REF ||
    typeof health.buildVersion !== "string" ||
    !health.buildVersion.trim() ||
    health.buildVersion === "development"
  ) {
    throw new Error(
      "Hosted content acceptance requires a healthy Vercel Preview backed by the fixed Preview Supabase project.",
    );
  }
}

export async function preflightHostedContentTarget(
  baseURL,
  environment = process.env,
  fetchImplementation = fetch,
  authenticateOwnershipImplementation = authenticateVercelDeploymentOwnership,
  resolveBypassImplementation = resolveVercelAutomationBypass,
) {
  const trustedBaseURL = resolveHostedContentBaseUrl(["--url", baseURL], {});
  const ownership = await authenticateOwnershipImplementation(
    trustedBaseURL,
    "preview",
    environment,
  );
  const bypass = await resolveBypassImplementation(ownership, environment, {
    fetchImplementation,
  });
  const { bypassCookie, response } = await fetchHostedHealthWithScopedBypass(
    trustedBaseURL,
    bypass,
    fetchImplementation,
  );
  if (!response.ok || !response.headers.get("cache-control")?.includes("no-store")) {
    throw new Error("Hosted content acceptance Preview health preflight failed.");
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("Hosted content acceptance Preview health response was invalid.");
  }
  assertPreviewHealthProjection(body);
  return createHostedPreflightAttestation({
    baseURL: trustedBaseURL,
    bypassCookie,
    ownership,
    target: "preview",
  });
}

export function createHostedAcceptanceIdentity(runId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(runId)) {
    throw new Error("Hosted acceptance requires a UUIDv4 run identifier.");
  }
  return Object.freeze({
    email: `phase02-preview-${runId.replaceAll("-", "")}@example.test`,
    runId,
  });
}

export function createHostedAcceptancePassword(runId) {
  createHostedAcceptanceIdentity(runId);
  return `Preview-only-${runId.replaceAll("-", "")}-Pass!`;
}

export function createHostedAcceptanceCleanupSql(runId) {
  const identity = createHostedAcceptanceIdentity(runId);
  return `
create temporary table hosted_acceptance_accounts (id uuid primary key) on commit drop;
insert into hosted_acceptance_accounts (id)
select id from auth.users
where email = '${identity.email}'
   or raw_user_meta_data ->> 'lumen_hosted_acceptance' = '${identity.runId}';

do $cleanup$
declare
  v_account_id uuid;
  v_job_id uuid;
  v_proof bytea;
begin
  for v_account_id in select id from hosted_acceptance_accounts loop
    if exists(
      select 1 from public.profiles
      where id = v_account_id and account_status = 'onboarding'
    ) then
      perform public.admin_reject_provisional_account(v_account_id, extensions.gen_random_uuid());
    elsif exists(
      select 1 from public.profiles
      where id = v_account_id and account_status in ('active', 'pending_deletion')
    ) then
      v_proof := extensions.digest(v_account_id::text || ':${identity.runId}', 'sha256');
      perform public.admin_issue_reauthentication_grant(
        v_account_id, 'account_deletion', v_proof,
        pg_catalog.now() + interval '5 minutes', extensions.gen_random_uuid()
      );
      v_job_id := public.admin_request_account_deletion(
        v_account_id, v_proof, 1, extensions.gen_random_uuid()
      );
      update public.deletion_jobs
      set execute_after = pg_catalog.now() - interval '1 second'
      where id = v_job_id;
      perform public.admin_process_account_deletion(v_job_id, extensions.gen_random_uuid());
    elsif exists(select 1 from auth.users where id = v_account_id) then
      perform public.admin_reject_provisional_account(v_account_id, extensions.gen_random_uuid());
    end if;
  end loop;

  if exists(
    select 1 from auth.users as users
    join hosted_acceptance_accounts as fixture on fixture.id = users.id
  ) then
    raise exception 'hosted acceptance Auth cleanup failed';
  end if;
  if exists(
    select 1 from public.deck_publications as publication
    join public.decks as deck on deck.public_id = publication.public_id
    join hosted_acceptance_accounts as fixture on fixture.id = deck.owner_account_id
  ) then
    raise exception 'hosted acceptance publication cleanup failed';
  end if;
  if exists(
    select 1 from public.decks as deck
    join hosted_acceptance_accounts as fixture on fixture.id = deck.owner_account_id
    where deck.status <> 'deleted'
      or deck.title <> 'Deleted deck ' || pg_catalog.left(deck.id::text, 8)
      or deck.description_plain <> ''
  ) then
    raise exception 'hosted acceptance content minimization failed';
  end if;
end;
$cleanup$;
`;
}

async function acquireLock() {
  await mkdir(dirname(LOCK_PATH), { recursive: true });
  const handle = await open(LOCK_PATH, "wx").catch((error) => {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      throw new Error("Another hosted database operation is already running.");
    }
    throw error;
  });
  return async () => {
    await handle.close();
    await rm(LOCK_PATH, { force: true });
  };
}

export async function cleanupPreviewFixture(runId, environment = process.env) {
  const release = await acquireLock();
  let linked = false;
  let failure;
  try {
    await runCommand(
      "pnpm",
      ["exec", "supabase", "link", "--project-ref", PREVIEW_PROJECT_REF, "--yes"],
      { env: environment },
    );
    linked = true;
    if ((await readFile(LINK_PATH, "utf8")).trim() !== PREVIEW_PROJECT_REF) {
      throw new Error("Supabase linked a different project during fixture cleanup.");
    }
    await runCommand(
      "pnpm",
      ["exec", "supabase", "db", "query", "--linked", createHostedAcceptanceCleanupSql(runId)],
      { env: environment },
    );
    const inventory = await runCommand(
      "pnpm",
      [
        "exec",
        "supabase",
        "storage",
        "ls",
        "--experimental",
        "--linked",
        "--recursive",
        "--output-format",
        "json",
        "ss:///lumen-content-media/",
      ],
      { capture: true, env: environment },
    );
    assertEmptyHostedStorage(inventory.stdout);
  } catch (error) {
    failure = error;
  } finally {
    if (linked) {
      try {
        await runCommand("pnpm", ["exec", "supabase", "unlink"], { env: environment });
      } catch (error) {
        failure ??= error;
      }
    }
    try {
      await release();
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
}

export async function runHostedContentAcceptance(
  argv = process.argv.slice(2),
  environment = process.env,
  {
    cleanupImplementation = cleanupPreviewFixture,
    createChildEnvironmentImplementation = createHostedPlaywrightEnvironment,
    createPreflightFileImplementation = createHostedPreflightFile,
    destroyPreflightFileImplementation = destroyHostedPreflightFile,
    preflightImplementation = preflightHostedContentTarget,
    processImplementation = process,
    provisionFixtureImplementation = provisionHostedAcceptanceFixture,
    randomUUIDImplementation = randomUUID,
    runCommandImplementation = runCommand,
    signalControllerImplementation = createHostedContentSignalController,
    writeFileImplementation = writeFile,
  } = {},
) {
  let fixtureAbortController;
  const signalController = signalControllerImplementation(processImplementation);
  let cleanupFailure;
  let cleanupOnce;
  let fixtureMayExist = false;
  let preflightFile;
  let runFailure;
  let sandbox;
  signalController.install();

  try {
    signalController.throwIfSignaled();
    const baseURL = resolveHostedContentBaseUrl(argv, environment);
    const preflight = await preflightImplementation(baseURL, environment);
    signalController.throwIfSignaled();

    const downstreamEnvironment = { ...environment };
    delete downstreamEnvironment.VERCEL_TOKEN;
    delete downstreamEnvironment.VERCEL_AUTOMATION_BYPASS_SECRET;
    const runId = randomUUIDImplementation();
    cleanupOnce = createOnceAsync(() => cleanupImplementation(runId, downstreamEnvironment));
    const keyInventory = await runCommandImplementation(
      "pnpm",
      [
        "exec",
        "supabase",
        "projects",
        "api-keys",
        "--project-ref",
        PREVIEW_PROJECT_REF,
        "--reveal",
        "--output-format",
        "json",
      ],
      { capture: true, env: downstreamEnvironment, signalController },
    );
    signalController.throwIfSignaled();
    const secretKey = parsePreviewSecretKey(keyInventory.stdout);
    sandbox = createChildEnvironmentImplementation(
      downstreamEnvironment,
      ({ temporaryDirectory }) => {
        preflightFile = createPreflightFileImplementation(preflight, temporaryDirectory);
        return {
          HOSTED_ACCEPTANCE_RUN_ID: runId,
          HOSTED_CONTENT_PREFLIGHT_FILE: preflightFile,
          PLAYWRIGHT_BASE_URL: baseURL,
        };
      },
    );
    if (!sandbox.fixtureConfirmationFile) {
      throw new Error("Hosted content acceptance did not receive a private confirmation marker.");
    }
    signalController.throwIfSignaled();
    fixtureMayExist = true;
    fixtureAbortController = new AbortController();
    await provisionFixtureImplementation(runId, secretKey, {
      signal: fixtureAbortController.signal,
    });
    signalController.throwIfSignaled();
    await writeFileImplementation(sandbox.fixtureConfirmationFile, runId, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    signalController.throwIfSignaled();
    await runCommandImplementation(
      "pnpm",
      ["exec", "playwright", "test", "--config=playwright.hosted-content.config.ts"],
      {
        env: sandbox.environment,
        signalController,
      },
    );
    signalController.throwIfSignaled();
  } catch (error) {
    runFailure = error;
  } finally {
    fixtureAbortController?.abort();
    if (preflightFile) {
      try {
        destroyPreflightFileImplementation(preflightFile);
      } catch (error) {
        cleanupFailure ??= error;
      }
    }
    try {
      sandbox?.cleanup();
    } catch (error) {
      cleanupFailure ??= error;
    }
    if (fixtureMayExist && cleanupOnce) {
      signalController.beginCleanup();
      try {
        await cleanupOnce();
      } catch (error) {
        cleanupFailure ??= error;
      }
    }
    signalController.dispose();
  }

  if (signalController.requestedSignal && !runFailure?.signal) {
    runFailure = signalError(signalController.requestedSignal);
  }
  if (runFailure && cleanupFailure) {
    const error = new AggregateError(
      [runFailure, cleanupFailure],
      "Hosted content acceptance failed and fixture cleanup did not complete; inspect Preview before another run.",
    );
    error.exitCode = 1;
    throw error;
  }
  if (cleanupFailure) {
    const error = new AggregateError(
      [cleanupFailure],
      "Hosted content fixture cleanup did not complete; inspect Preview before another run.",
    );
    error.exitCode = 1;
    throw error;
  }
  if (runFailure) throw runFailure;
  processImplementation.stdout.write(
    "Preview Phase 02 content acceptance and verified minimization completed successfully.\n",
  );
  return 0;
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  runHostedContentAcceptance().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Hosted content acceptance failed."}\n`,
    );
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  });
}
