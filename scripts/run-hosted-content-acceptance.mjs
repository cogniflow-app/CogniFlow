import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertEmptyHostedStorage } from "./hosted-database.mjs";
import { isTrustedVercelAutomationOrigin, normalizeHostedBaseUrl } from "./run-hosted-smoke.mjs";

const PREVIEW_PROJECT_REF = "cfwddajyjbueggpzfomh";
const LINK_PATH = resolve("supabase/.temp/project-ref");
const LOCK_PATH = resolve("supabase/.temp/hosted-database.lock");
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

function runCommand(executable, arguments_, { capture = false, env = process.env } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, arguments_, {
      cwd: repositoryRoot,
      env: { ...env, NO_COLOR: "1" },
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    let stdout = "";
    if (capture) {
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });
    }
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise({ code, stdout });
      else rejectPromise(new Error(`Command failed with ${code ?? signal ?? "unknown status"}.`));
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
  if (!Array.isArray(parsed)) throw new Error("Supabase returned an invalid API-key inventory.");
  const selected =
    parsed.find((candidate) => candidate?.type === "secret") ??
    parsed.find((candidate) => candidate?.name === "service_role");
  if (!selected || typeof selected.api_key !== "string" || selected.api_key.length < 24) {
    throw new Error("The Preview server key is unavailable to the authenticated operator.");
  }
  return selected.api_key;
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
      or deck.title <> 'Deleted deck'
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

async function cleanupPreviewFixture(runId) {
  const release = await acquireLock();
  let linked = false;
  let failure;
  try {
    await runCommand("pnpm", [
      "exec",
      "supabase",
      "link",
      "--project-ref",
      PREVIEW_PROJECT_REF,
      "--yes",
    ]);
    linked = true;
    if ((await readFile(LINK_PATH, "utf8")).trim() !== PREVIEW_PROJECT_REF) {
      throw new Error("Supabase linked a different project during fixture cleanup.");
    }
    await runCommand("pnpm", [
      "exec",
      "supabase",
      "db",
      "query",
      "--linked",
      createHostedAcceptanceCleanupSql(runId),
    ]);
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
      { capture: true },
    );
    assertEmptyHostedStorage(inventory.stdout);
  } catch (error) {
    failure = error;
  } finally {
    if (linked) {
      try {
        await runCommand("pnpm", ["exec", "supabase", "unlink"]);
      } catch (error) {
        failure ??= error;
      }
    }
    await release();
  }
  if (failure) throw failure;
}

async function main() {
  const argumentIndex = process.argv.indexOf("--url");
  const untrustedUrl =
    argumentIndex >= 0 ? process.argv[argumentIndex + 1] : process.env.HOSTED_PREVIEW_URL;
  const baseURL = normalizeHostedBaseUrl(untrustedUrl);
  if (!isTrustedVercelAutomationOrigin(baseURL)) {
    throw new Error("Hosted content acceptance is restricted to this repository's Vercel project.");
  }
  const runId = randomUUID();
  const keyInventory = await runCommand(
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
    { capture: true },
  );
  const secretKey = parsePreviewSecretKey(keyInventory.stdout);
  let testFailure;
  try {
    await runCommand(
      "pnpm",
      ["exec", "playwright", "test", "--config=playwright.hosted-content.config.ts"],
      {
        env: {
          ...process.env,
          HOSTED_ACCEPTANCE_RUN_ID: runId,
          HOSTED_PREVIEW_SUPABASE_SECRET_KEY: secretKey,
          HOSTED_PREVIEW_SUPABASE_URL: `https://${PREVIEW_PROJECT_REF}.supabase.co`,
          PLAYWRIGHT_BASE_URL: baseURL,
        },
      },
    );
  } catch (error) {
    testFailure = error;
  }

  let cleanupFailure;
  try {
    await cleanupPreviewFixture(runId);
  } catch (error) {
    cleanupFailure = error;
  }
  if (cleanupFailure) throw cleanupFailure;
  if (testFailure) throw testFailure;
  process.stdout.write("Preview Phase 02 content acceptance and cleanup completed successfully.\n");
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Hosted content acceptance failed."}\n`,
    );
    process.exitCode = 1;
  });
}
