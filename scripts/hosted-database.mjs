import { spawn } from "node:child_process";
import { mkdir, open, readFile, readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const HOSTED_DATABASE_TARGETS = Object.freeze({
  preview: Object.freeze({
    projectRef: "cfwddajyjbueggpzfomh",
  }),
  beta: Object.freeze({
    projectRef: "qccbaynfvtyxigiikpmq",
  }),
});

const MIGRATION_FILE_PATTERN = /^(\d{14})_[a-z0-9_]+\.sql$/u;
const LINK_PATH = resolve("supabase/.temp/project-ref");
const LOCK_PATH = resolve("supabase/.temp/hosted-database.lock");
const HOSTED_INVARIANT_PATH = "supabase/tests/hosted_invariants.test.sql";
const SUPABASE_PLATFORM_RLS_DIFF = `set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;`;

export function parseHostedDatabaseArguments(arguments_) {
  if (arguments_.length !== 2) {
    throw new Error("Usage: hosted-database.mjs <deploy|verify> <preview|beta>");
  }

  const [action, targetName] = arguments_;
  if (action !== "deploy" && action !== "verify") {
    throw new Error("Hosted database action must be deploy or verify.");
  }
  if (targetName !== "preview" && targetName !== "beta") {
    throw new Error("Hosted database target must be preview or beta.");
  }

  return Object.freeze({ action, targetName, target: HOSTED_DATABASE_TARGETS[targetName] });
}

export function migrationVersionsFromFileNames(fileNames) {
  const sqlFiles = fileNames.filter((fileName) => fileName.endsWith(".sql"));
  const versions = sqlFiles.map((fileName) => {
    const match = MIGRATION_FILE_PATTERN.exec(fileName);
    if (!match?.[1]) {
      throw new Error(`Invalid migration filename: ${fileName}`);
    }
    return match[1];
  });

  const sorted = [...versions].sort();
  if (new Set(sorted).size !== sorted.length) {
    throw new Error("Committed migration versions must be unique.");
  }
  if (sorted.length === 0) {
    throw new Error("No committed migrations were found.");
  }
  return Object.freeze(sorted);
}

export function assertCommittedMigrationFileSet(onDiskFileNames, trackedFileNames) {
  const onDisk = [...onDiskFileNames].sort();
  const tracked = [...trackedFileNames].sort();
  if (
    onDisk.length !== tracked.length ||
    onDisk.some((fileName, index) => fileName !== tracked[index])
  ) {
    throw new Error(
      "Every on-disk Supabase migration must be a committed regular file, with no missing or ignored files.",
    );
  }
}

function normalizeMigrationVersion(value, label) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string" || !/^\d{14}$/u.test(value)) {
    throw new Error(`Supabase returned an invalid ${label} migration version.`);
  }
  return value;
}

export function parseMigrationList(output) {
  let parsed;
  try {
    parsed = JSON.parse(output.trim());
  } catch {
    throw new Error("Supabase migration history was not valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.migrations)) {
    throw new Error("Supabase migration history did not contain a migrations array.");
  }

  return Object.freeze(
    parsed.migrations.map((migration) => {
      if (!migration || typeof migration !== "object") {
        throw new Error("Supabase migration history contained an invalid row.");
      }
      return Object.freeze({
        local: normalizeMigrationVersion(migration.local, "local"),
        remote: normalizeMigrationVersion(migration.remote, "remote"),
      });
    }),
  );
}

function assertUniqueVersions(versions, label) {
  if (new Set(versions).size !== versions.length) {
    throw new Error(`${label} migration history contains duplicate versions.`);
  }
}

function assertSameVersions(actual, expected, label) {
  if (
    actual.length !== expected.length ||
    actual.some((version, index) => version !== expected[index])
  ) {
    throw new Error(`${label} migration history does not match committed migrations.`);
  }
}

export function assertDeployableMigrationHistory(rows, expectedVersions) {
  const localVersions = rows.flatMap((row) => (row.local ? [row.local] : []));
  const remoteVersions = rows.flatMap((row) => (row.remote ? [row.remote] : []));

  assertUniqueVersions(localVersions, "Local");
  assertUniqueVersions(remoteVersions, "Remote");
  assertSameVersions(localVersions, expectedVersions, "Local");

  if (rows.some((row) => row.remote && row.local !== row.remote)) {
    throw new Error("Remote migration history contains a version absent from local history.");
  }

  const expectedPrefix = expectedVersions.slice(0, remoteVersions.length);
  assertSameVersions(remoteVersions, expectedPrefix, "Remote");
}

export function assertExactMigrationHistory(rows, expectedVersions) {
  assertDeployableMigrationHistory(rows, expectedVersions);
  const remoteVersions = rows.flatMap((row) => (row.remote ? [row.remote] : []));
  assertSameVersions(remoteVersions, expectedVersions, "Remote");
}

export function assertBetaPromotionState(state) {
  if (state.branch !== "main") {
    throw new Error("Beta database promotion must run from the main branch.");
  }
  if (state.status.trim() !== "") {
    throw new Error("Beta database promotion requires a completely clean worktree.");
  }
  if (!state.head || state.head !== state.originMain) {
    throw new Error("Beta database promotion requires HEAD to exactly match origin/main.");
  }
}

export function assertPreviewPromotionState(state) {
  if (state.migrationStatus.trim() !== "") {
    throw new Error(
      "Preview database promotion requires supabase/migrations to be tracked and clean.",
    );
  }
}

export function createHostedDatabaseCommandPlan(action, targetName) {
  const target = HOSTED_DATABASE_TARGETS[targetName];
  if (!target || (action !== "deploy" && action !== "verify")) {
    throw new Error("Cannot create a hosted database plan for an unknown action or target.");
  }

  const commands = [
    ["supabase", "link", "--project-ref", target.projectRef],
    ["supabase", "migration", "list", "--linked", "--output-format", "json"],
    ["supabase", "db", "push", "--linked", "--dry-run"],
  ];

  if (action === "deploy") {
    commands.push(
      ["supabase", "db", "push", "--linked", "--yes"],
      ["supabase", "migration", "list", "--linked", "--output-format", "json"],
    );
  } else {
    commands.push(
      [
        "supabase",
        "db",
        "lint",
        "--linked",
        "--schema",
        "public,private",
        "--level",
        "warning",
        "--fail-on",
        "error",
      ],
      ["supabase", "test", "db", "--linked", HOSTED_INVARIANT_PATH],
      [
        "supabase",
        "storage",
        "ls",
        "--experimental",
        "--linked",
        "--output-format",
        "json",
        "ss:///",
      ],
      [
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
      [
        "supabase",
        "db",
        "diff",
        "--linked",
        "--schema",
        "public,private",
        "--output-format",
        "json",
      ],
      ["node", "scripts/generate-database-types.mjs", "--check", "--linked"],
    );
  }

  return Object.freeze(commands.map((command) => Object.freeze(command)));
}

function runCommand(executable, arguments_, options = {}) {
  const { capture = false, label = executable } = options;
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, arguments_, {
      cwd: resolve("."),
      env: { ...process.env, NO_COLOR: "1" },
      stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
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
      if (code === 0) {
        resolvePromise(stdout);
        return;
      }
      rejectPromise(
        new Error(
          `${label} failed with ${code === null ? `signal ${signal ?? "unknown"}` : `code ${String(code)}`}.`,
        ),
      );
    });
  });
}

function runSupabase(arguments_, options) {
  return runCommand("pnpm", ["exec", "supabase", ...arguments_], options);
}

async function readMigrationVersions() {
  const entries = await readdir(resolve("supabase/migrations"), { withFileTypes: true });
  const migrationEntries = entries.filter((entry) => entry.name.endsWith(".sql"));
  if (migrationEntries.some((entry) => !entry.isFile())) {
    throw new Error("Supabase migrations must be regular files, not links or special files.");
  }

  const trackedOutput = await readGitValue(
    ["ls-files", "--", "supabase/migrations"],
    "Reading committed migration files",
  );
  const trackedFileNames = trackedOutput
    .split(/\r?\n/u)
    .filter((path) => path.endsWith(".sql"))
    .map((path) => path.slice("supabase/migrations/".length));
  const onDiskFileNames = migrationEntries.map((entry) => entry.name);
  assertCommittedMigrationFileSet(onDiskFileNames, trackedFileNames);
  return migrationVersionsFromFileNames(onDiskFileNames);
}

async function readRemoteHistory() {
  const output = await runSupabase(["migration", "list", "--linked", "--output-format", "json"], {
    capture: true,
    label: "Hosted migration history",
  });
  return parseMigrationList(output);
}

async function assertLinkedProject(expectedProjectRef) {
  const linkedProjectRef = (await readFile(LINK_PATH, "utf8")).trim();
  if (linkedProjectRef !== expectedProjectRef) {
    throw new Error("Supabase linked a different hosted project than requested.");
  }
}

async function readGitValue(arguments_, label) {
  return (
    await runCommand("git", arguments_, {
      capture: true,
      label,
    })
  ).trim();
}

async function enforceBetaPromotionGuard() {
  await runCommand("git", ["fetch", "--quiet", "origin", "main"], {
    label: "Refreshing origin/main",
  });
  const [branch, status, head, originMain] = await Promise.all([
    readGitValue(["branch", "--show-current"], "Reading the current branch"),
    readGitValue(["status", "--porcelain", "--untracked-files=all"], "Reading worktree state"),
    readGitValue(["rev-parse", "HEAD"], "Reading HEAD"),
    readGitValue(["rev-parse", "origin/main"], "Reading origin/main"),
  ]);
  assertBetaPromotionState({ branch, status, head, originMain });
}

async function enforcePreviewPromotionGuard() {
  const migrationStatus = await readGitValue(
    ["status", "--porcelain", "--untracked-files=all", "--", "supabase/migrations"],
    "Reading migration worktree state",
  );
  assertPreviewPromotionState({ migrationStatus });
}

function assertEmptySchemaDiff(output) {
  let parsed;
  try {
    parsed = JSON.parse(output.trim());
  } catch {
    throw new Error("Supabase schema diff was not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || typeof parsed.diff !== "string") {
    throw new Error("Supabase schema diff did not contain a diff string.");
  }
  const normalizedDiff = parsed.diff.trim();
  if (normalizedDiff !== "" && normalizedDiff !== SUPABASE_PLATFORM_RLS_DIFF) {
    throw new Error("Linked database schema differs from committed migrations.");
  }
}

export function assertHostedStoragePaths(output, expectedPaths, label = "Hosted storage") {
  let parsed;
  try {
    parsed = JSON.parse(output.trim());
  } catch {
    throw new Error("Supabase storage inventory was not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.paths)) {
    throw new Error(`${label} inventory did not contain a paths array.`);
  }
  const actualPaths = parsed.paths.map((path) =>
    typeof path === "string"
      ? path
      : path && typeof path === "object" && typeof path.name === "string"
        ? path.name
        : null,
  );
  const actual = [...actualPaths].sort();
  const expected = [...expectedPaths].sort();
  if (
    actual.some((path) => path === null) ||
    actual.length !== expected.length ||
    actual.some((path, index) => path !== expected[index])
  ) {
    throw new Error(`${label} does not match the committed Phase 02 contract.`);
  }
}

export function assertEmptyHostedStorage(output) {
  assertHostedStoragePaths(output, [], "Hosted storage object");
}

async function deployHostedDatabase(expectedVersions) {
  const before = await readRemoteHistory();
  assertDeployableMigrationHistory(before, expectedVersions);
  await runSupabase(["db", "push", "--linked", "--dry-run"], {
    label: "Hosted migration dry run",
  });
  await runSupabase(["db", "push", "--linked", "--yes"], {
    label: "Hosted migration deployment",
  });
  assertExactMigrationHistory(await readRemoteHistory(), expectedVersions);
}

async function verifyHostedDatabase(expectedVersions) {
  assertExactMigrationHistory(await readRemoteHistory(), expectedVersions);
  await runSupabase(["db", "push", "--linked", "--dry-run"], {
    label: "Hosted migration dry run",
  });
  await runSupabase(
    [
      "db",
      "lint",
      "--linked",
      "--schema",
      "public,private",
      "--level",
      "warning",
      "--fail-on",
      "error",
    ],
    { label: "Hosted database lint" },
  );
  await runSupabase(["test", "db", "--linked", HOSTED_INVARIANT_PATH], {
    label: "Hosted database invariants",
  });
  const storageRoot = await runSupabase(
    ["storage", "ls", "--experimental", "--linked", "--output-format", "json", "ss:///"],
    { capture: true, label: "Hosted storage bucket inventory" },
  );
  assertHostedStoragePaths(
    storageRoot,
    ["lumen-content-media/", "lumen-portability/"],
    "Hosted storage bucket",
  );
  const contentObjects = await runSupabase(
    [
      "storage",
      "ls",
      "--experimental",
      "--linked",
      "--recursive",
      "--output-format",
      "json",
      "ss:///lumen-content-media/",
    ],
    { capture: true, label: "Hosted content-media object inventory" },
  );
  assertEmptyHostedStorage(contentObjects);
  const portabilityObjects = await runSupabase(
    [
      "storage",
      "ls",
      "--experimental",
      "--linked",
      "--recursive",
      "--output-format",
      "json",
      "ss:///lumen-portability/",
    ],
    { capture: true, label: "Hosted portability object inventory" },
  );
  assertEmptyHostedStorage(portabilityObjects);
  const diff = await runSupabase(
    ["db", "diff", "--linked", "--schema", "public,private", "--output-format", "json"],
    { capture: true, label: "Hosted schema diff" },
  );
  assertEmptySchemaDiff(diff);
  await runCommand(
    process.execPath,
    ["scripts/generate-database-types.mjs", "--check", "--linked"],
    { label: "Hosted database type parity" },
  );
}

async function acquireOperationLock() {
  await mkdir(dirname(LOCK_PATH), { recursive: true });
  let handle;
  try {
    handle = await open(LOCK_PATH, "wx");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      throw new Error("Another hosted database operation is already running.");
    }
    throw error;
  }
  return async () => {
    await handle.close();
    await rm(LOCK_PATH, { force: true });
  };
}

async function runHostedDatabase() {
  const { action, targetName, target } = parseHostedDatabaseArguments(process.argv.slice(2));
  if (action === "deploy" && targetName === "beta") {
    await enforceBetaPromotionGuard();
  } else if (action === "deploy") {
    await enforcePreviewPromotionGuard();
  }

  const expectedVersions = await readMigrationVersions();
  const releaseLock = await acquireOperationLock();
  let linked = false;
  let operationError;
  try {
    await runSupabase(["link", "--project-ref", target.projectRef], {
      label: `Linking the ${targetName} database`,
    });
    linked = true;
    await assertLinkedProject(target.projectRef);
    if (action === "deploy") {
      await deployHostedDatabase(expectedVersions);
    } else {
      await verifyHostedDatabase(expectedVersions);
    }
  } catch (error) {
    operationError = error;
  } finally {
    if (linked) {
      try {
        await runSupabase(["unlink"], { label: "Removing the hosted database link" });
      } catch (error) {
        operationError ??= error;
      }
    }
    await releaseLock();
  }

  if (operationError) {
    throw operationError;
  }
  process.stdout.write(`${targetName} database ${action} completed successfully.\n`);
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isEntrypoint) {
  runHostedDatabase().catch((error) => {
    const message = error instanceof Error ? error.message : "Hosted database operation failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
