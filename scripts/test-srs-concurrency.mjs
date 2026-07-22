import { readFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");
const projectId = config.match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m)?.[1];
if (!projectId) throw new Error("Could not determine the local Supabase project ID.");
const container = `supabase_db_${projectId}`;
const psqlArguments = [
  "exec",
  "-i",
  container,
  "psql",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-At",
];

function psql(sql) {
  return new Promise((resolve) => {
    const child = spawn("docker", psqlArguments, { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stderr, stdout }));
    child.stdin.end(sql);
  });
}

const setupSql = String.raw`
insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000','a1000000-0000-4000-8000-000000000001',
  'authenticated','authenticated','srs-concurrency@example.test','',pg_catalog.now(),
  '{}','{}',pg_catalog.now(),pg_catalog.now(),false
);
update public.profiles set account_status='active', onboarding_completed_at=pg_catalog.now(),
  age_band='adult',display_name='Concurrency Learner',handle='srs_concurrency'
where id='a1000000-0000-4000-8000-000000000001';
insert into auth.sessions (id,user_id,created_at,updated_at,not_after) values (
  'a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
  pg_catalog.now(),pg_catalog.now(),pg_catalog.now()+interval '1 hour'
);
insert into public.devices (id,account_id,auth_session_id,display_name,platform,idempotency_key) values (
  'a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001','Concurrency browser','integration',
  'a4000000-0000-4000-8000-000000000001'
);
insert into public.decks (id,owner_account_id,title,slug,default_note_type_id,content_hash) values (
  'a5000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
  'Concurrency deck','srs-concurrency','02000000-0000-4000-8000-000000000001',repeat('e',64)
);
insert into public.notes (id,deck_id,note_type_id,created_by,updated_by,content_hash,sort_text) values (
  'a6000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001',
  '02000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',repeat('f',64),'Concurrent question'
);
insert into public.cards (id,note_id,template_id,ordinal,card_kind,generation_key,content_version,active) values (
  'a7000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001',
  (select id from public.card_templates where note_type_id='02000000-0000-4000-8000-000000000001' order by ordinal limit 1),
  0,'basic','forward',1,true
);
select id as learner_id from public.learner_profiles
where owner_account_id='a1000000-0000-4000-8000-000000000001' and kind='self' \gset
set role service_role;
select public.admin_get_srs_review_context(
  'a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  :'learner_id'::uuid,
  null,'a7000000-0000-4000-8000-000000000001',null
);
`;

function reviewSql(reviewId, idempotencyKey, hashCharacter) {
  return String.raw`
select id as learner_id from public.learner_profiles
where owner_account_id='a1000000-0000-4000-8000-000000000001' and kind='self' \gset
select id as preset_id from public.srs_presets where learner_profile_id=:'learner_id'::uuid and is_default \gset
set role service_role;
with command as materialized (
  select pg_catalog.clock_timestamp() as reviewed_at, pg_catalog.clock_timestamp() as started_at
), committed as materialized (
select public.admin_commit_srs_review(
  'a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  :'learner_id'::uuid,
  null,'a7000000-0000-4000-8000-000000000001',null,'good',command.reviewed_at,800,
  'America/Chicago',240::smallint,0::bigint,'${reviewId}','${idempotencyKey}',repeat('${hashCharacter}',64),'today',
  :'preset_id'::uuid,
  1::bigint,
  pg_catalog.jsonb_build_object('algorithm','fsrs','state','new','due',command.reviewed_at,'lastReviewedAt',null,
    'stability',0,'difficulty',0,'elapsedDays',0,'scheduledDays',0,'learningStep',0,'reps',0,'lapses',0,
    'legacyEaseFactor',null,'schedulerVersion','lumen-srs/1 (v5.4.1 using FSRS-6.0)'),
  pg_catalog.jsonb_build_object('algorithm','fsrs','state','learning','due',command.reviewed_at+interval '10 minutes',
    'lastReviewedAt',command.reviewed_at,'stability',2.3065,'difficulty',2.11810397,'elapsedDays',0,
    'scheduledDays',0,'learningStep',1,'reps',1,'lapses',0,'legacyEaseFactor',null,
    'schedulerVersion','lumen-srs/1 (v5.4.1 using FSRS-6.0)'),
  'lumen-srs/1 (v5.4.1 using FSRS-6.0)'
) as result, command.started_at from command
)
select committed.result::text || '|SRS_CANONICAL_MUTATION_MS=' ||
  pg_catalog.round(
    (extract(epoch from (pg_catalog.clock_timestamp()-committed.started_at))*1000)::numeric,
    3
  )::text
from committed;
`;
}

let passed = false;
try {
  const setup = await psql(setupSql);
  if (setup.code !== 0) throw new Error(`SRS concurrency setup failed: ${setup.stderr.trim()}`);
  const results = await Promise.all([
    psql(
      reviewSql(
        "a8000000-0000-4000-8000-000000000001",
        "a9000000-0000-4000-8000-000000000001",
        "a",
      ),
    ),
    psql(
      reviewSql(
        "a8000000-0000-4000-8000-000000000002",
        "a9000000-0000-4000-8000-000000000002",
        "b",
      ),
    ),
  ]);
  const successful = results.filter((result) => result.code === 0);
  const stale = results.filter(
    (result) => result.code !== 0 && result.stderr.includes("SRS_STALE_VERSION"),
  );
  if (successful.length !== 1 || stale.length !== 1) {
    throw new Error(
      `Expected one commit and one stale conflict; received ${JSON.stringify(results)}`,
    );
  }
  const mutationMilliseconds = Number(
    /SRS_CANONICAL_MUTATION_MS=([0-9.]+)/u.exec(successful[0]?.stdout ?? "")?.[1],
  );
  if (!Number.isFinite(mutationMilliseconds) || mutationMilliseconds > 500) {
    throw new Error(
      `Canonical review mutation exceeded the 500 ms local target: ${String(mutationMilliseconds)} ms`,
    );
  }
  const invariant = await psql(String.raw`
select (select pg_catalog.count(*) from public.review_logs where card_id='a7000000-0000-4000-8000-000000000001')::text
  || ':' || (select version::text from public.card_schedules where card_id='a7000000-0000-4000-8000-000000000001')
  || ':' || (select reps::text from public.card_schedules where card_id='a7000000-0000-4000-8000-000000000001');
`);
  if (invariant.code !== 0 || invariant.stdout.trim() !== "1:1:1") {
    throw new Error(`Concurrent review invariant failed: ${invariant.stderr || invariant.stdout}`);
  }
  passed = true;
  process.stdout.write(
    `SRS concurrency: 1 commit, 1 typed stale conflict, 1 immutable log; canonical mutation ${String(mutationMilliseconds)} ms (passed)\n`,
  );
} finally {
  const reset = spawnSync("pnpm", ["exec", "supabase", "db", "reset", "--local"], {
    cwd: root,
    encoding: "utf8",
    stdio: passed ? "ignore" : "inherit",
  });
  if (reset.status !== 0 && passed)
    throw new Error("Local database cleanup after SRS concurrency failed.");
}
