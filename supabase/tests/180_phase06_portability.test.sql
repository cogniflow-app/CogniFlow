begin;

select no_plan();

select has_table('public', 'import_jobs', 'import jobs exist');
select has_table('public', 'export_jobs', 'export jobs exist');
select has_table('public', 'export_artifacts', 'sanitized export artifact metadata exists');
select has_table('private', 'portability_upload_objects', 'private upload metadata exists');
select has_table('private', 'portability_artifact_objects', 'private artifact paths exist');
select has_table('private', 'portability_job_queue', 'leased portability queue exists');
select has_table('private', 'portability_job_attempts', 'bounded attempt evidence exists');
select has_table('private', 'portability_job_checkpoints', 'crash-safe checkpoints exist');
select has_table('private', 'portability_job_items', 'idempotent item receipts exist');
select has_table('private', 'portability_job_receipts', 'terminal receipts exist');
select has_table('private', 'portability_diagnostic_artifacts', 'private expiring diagnostics exist');

select ok(
  exists(
    select 1
    from pg_catalog.pg_enum as enum_value
    join pg_catalog.pg_type as enum_type on enum_type.oid = enum_value.enumtypid
    join pg_catalog.pg_namespace as namespace on namespace.oid = enum_type.typnamespace
    where namespace.nspname = 'public'
      and enum_type.typname = 'portability_format'
      and enum_value.enumlabel = 'xlsx'
  ),
  'XLSX is a first-class import job format'
);

select ok(
  exists(
    select 1
    from storage.buckets as bucket
    cross join lateral pg_catalog.unnest(bucket.allowed_mime_types) as allowed_mime_type
    where bucket.id = 'lumen-portability'
      and allowed_mime_type =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ),
  'the private portability bucket accepts XLSX uploads'
);

select ok(
  exists(
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.export_jobs'::regclass
      and conname = 'export_jobs_xlsx_import_only'
      and contype = 'c'
  )
  and exists(
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.export_artifacts'::regclass
      and conname = 'export_artifacts_xlsx_import_only'
      and contype = 'c'
  ),
  'XLSX remains import-only at both export table boundaries'
);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.import_jobs'::regclass)
  and (select relrowsecurity from pg_catalog.pg_class where oid = 'public.export_jobs'::regclass)
  and (select relrowsecurity from pg_catalog.pg_class where oid = 'public.export_artifacts'::regclass),
  'RLS is enabled on every exposed portability table'
);

select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.import_jobs', 'select')
  and pg_catalog.has_table_privilege('authenticated', 'public.export_jobs', 'select')
  and pg_catalog.has_table_privilege('authenticated', 'public.export_artifacts', 'select')
  and not pg_catalog.has_table_privilege('authenticated', 'public.import_jobs', 'insert')
  and not pg_catalog.has_table_privilege('authenticated', 'public.export_jobs', 'update')
  and not pg_catalog.has_table_privilege('anon', 'public.export_artifacts', 'select'),
  'browser roles receive owner-filtered reads and no table writes'
);

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'private.portability_upload_objects', 'select')
  and not pg_catalog.has_table_privilege('service_role', 'private.portability_upload_objects', 'select')
  and not pg_catalog.has_table_privilege('authenticated', 'private.portability_artifact_objects', 'select')
  and not pg_catalog.has_table_privilege('service_role', 'private.portability_job_receipts', 'select'),
  'private source paths, receipts, and checkpoints are not direct table surfaces'
);

select ok(
  not exists(
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'admin_begin_portability_job',
        'admin_checkpoint_portability_job',
        'admin_claim_portability_jobs',
        'admin_claim_portability_object_cleanup',
        'admin_complete_portability_job',
        'admin_confirm_portability_object_deleted',
        'admin_delete_portability_artifact',
        'admin_expire_portability_objects',
        'admin_get_portability_artifact_object',
        'admin_get_portability_audit_events',
        'admin_get_portability_card_id_map',
        'admin_get_portability_upload_object',
        'admin_mark_portability_upload_deleted',
        'admin_record_portability_job_item',
        'admin_register_export_artifact',
        'admin_register_portability_upload',
        'admin_restore_portability_evidence_chunk',
        'admin_restore_portability_progress_chunk',
        'admin_yield_portability_job'
      )
      and (
        not procedure.prosecdef
        or procedure.proconfig @> array['search_path=""']::text[] is not true
        or pg_catalog.has_function_privilege('authenticated', procedure.oid, 'execute')
        or not pg_catalog.has_function_privilege('service_role', procedure.oid, 'execute')
      )
  ),
  'worker RPCs are service-only security-definer functions with empty search paths'
);

select ok(
  not exists(
    select 1
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname in (
        'admin_complete_portability_job',
        'admin_restore_portability_evidence_chunk',
        'admin_restore_portability_progress_chunk'
      )
      and (
        pg_catalog.strpos(proc.prosrc, 'pg_catalog.least(') > 0
        or pg_catalog.strpos(proc.prosrc, 'pg_catalog.greatest(') > 0
      )
  ),
  'Phase 06 routines use LEAST and GREATEST as SQL expressions'
);

select ok(
  not exists(
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'current_create_import_job',
        'current_create_export_job',
        'current_cancel_portability_job',
        'current_retry_portability_job'
      )
      and (
        not procedure.prosecdef
        or procedure.proconfig @> array['search_path=""']::text[] is not true
        or not pg_catalog.has_function_privilege('authenticated', procedure.oid, 'execute')
        or pg_catalog.has_function_privilege('anon', procedure.oid, 'execute')
      )
  ),
  'owner job commands are authenticated-only security-definer functions'
);

select ok(
  exists(
    select 1 from storage.buckets
    where id = 'lumen-portability'
      and not public
      and file_size_limit = 67108864
  )
  and not exists(
    select 1 from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        qual like '%lumen-portability%'
        or with_check like '%lumen-portability%'
      )
  ),
  'the portability bucket is private, bounded, and has no browser Storage policy'
);

select ok(
  exists(select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'import_jobs_account_status_idx')
  and exists(select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'export_jobs_account_status_idx')
  and exists(select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'export_artifacts_expiry_idx')
  and exists(select 1 from pg_catalog.pg_indexes where schemaname = 'private' and indexname = 'portability_queue_claim_idx')
  and exists(select 1 from pg_catalog.pg_indexes where schemaname = 'private' and indexname = 'portability_queue_lease_idx'),
  'owner, expiry, claim, and lease paths have supporting indexes'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '61000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'phase06-owner@example.test', '',
    pg_catalog.now(), '{}', '{}', pg_catalog.now(), pg_catalog.now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '61000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'phase06-attacker@example.test', '',
    pg_catalog.now(), '{}', '{}', pg_catalog.now(), pg_catalog.now(), false
  );

update public.profiles
set account_status = 'active',
    onboarding_completed_at = pg_catalog.now(),
    age_band = 'adult',
    display_name = case when id = '61000000-0000-4000-8000-000000000001'
      then 'Phase 06 owner' else 'Phase 06 attacker' end,
    handle = case when id = '61000000-0000-4000-8000-000000000001'
      then 'phase06_owner' else 'phase06_attacker' end
where id in (
  '61000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002'
);

insert into auth.sessions (id, user_id, created_at, updated_at, not_after) values
  (
    '62000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '1 hour'
  ),
  (
    '62000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000002',
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '1 hour'
  );

insert into public.devices (
  id, account_id, auth_session_id, display_name, platform, idempotency_key
) values
  (
    '63000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    '62000000-0000-4000-8000-000000000001',
    'Phase 06 owner browser', 'pgTAP',
    '64000000-0000-4000-8000-000000000001'
  ),
  (
    '63000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000002',
    '62000000-0000-4000-8000-000000000002',
    'Phase 06 attacker browser', 'pgTAP',
    '64000000-0000-4000-8000-000000000002'
  );

create temporary table phase06_fixture (name text primary key, value text not null) on commit drop;
grant select, insert, update, delete on phase06_fixture to authenticated, service_role;
insert into phase06_fixture values
  (
    'owner_learner',
    (select id::text from public.learner_profiles
     where owner_account_id = '61000000-0000-4000-8000-000000000001' and kind = 'self')
  ),
  (
    'attacker_learner',
    (select id::text from public.learner_profiles
     where owner_account_id = '61000000-0000-4000-8000-000000000002' and kind = 'self')
  );

insert into public.audit_events (
  id, actor_type, actor_account_id, event_type, target_type, target_id,
  correlation_id, metadata
) values
  (
    '60000000-0000-4000-8000-000000000001', 'account',
    '61000000-0000-4000-8000-000000000001', 'phase06.owner',
    'portability_test', null, '60000000-0000-4000-8000-000000000011',
    '{"safe":"owner"}'
  ),
  (
    '60000000-0000-4000-8000-000000000002', 'account',
    '61000000-0000-4000-8000-000000000002', 'phase06.attacker',
    'portability_test', null, '60000000-0000-4000-8000-000000000012',
    '{"safe":"attacker"}'
  );

set local role service_role;
select ok(
  public.admin_get_portability_audit_events(
    '61000000-0000-4000-8000-000000000001'
  ) @> '[{"id":"60000000-0000-4000-8000-000000000001"}]'::jsonb
  and not (
    public.admin_get_portability_audit_events(
      '61000000-0000-4000-8000-000000000001'
    ) @> '[{"id":"60000000-0000-4000-8000-000000000002"}]'::jsonb
  ),
  'the service-only account audit snapshot is minimized and account-scoped'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"62000000-0000-4000-8000-000000000001"}';

insert into phase06_fixture
values (
  'import_job',
  (
    select id::text
    from public.current_create_import_job(
      (select value::uuid from phase06_fixture where name = 'owner_learner'),
      'import',
      'delimited',
      'csv',
      'biology.csv',
      128,
      repeat('a', 64),
      '{"duplicatePolicy":"skip","progressPolicy":"omit"}',
      repeat('b', 64),
      '65000000-0000-4000-8000-000000000001'
    )
  )
);

select is(
  (
    select id::text
    from public.current_create_import_job(
      (select value::uuid from phase06_fixture where name = 'owner_learner'),
      'import',
      'delimited',
      'csv',
      'biology.csv',
      128,
      repeat('a', 64),
      '{"duplicatePolicy":"skip","progressPolicy":"omit"}',
      repeat('b', 64),
      '65000000-0000-4000-8000-000000000001'
    )
  ),
  (select value from phase06_fixture where name = 'import_job'),
  'an exact import request retry returns one payload-bound job'
);

select throws_ok(
  $$select public.current_create_import_job(
    (select value::uuid from phase06_fixture where name = 'owner_learner'),
    'import', 'delimited', 'csv', 'biology.csv', 128, repeat('a', 64),
    '{"duplicatePolicy":"create"}', repeat('c', 64),
    '65000000-0000-4000-8000-000000000001'
  )$$,
  '23505',
  'idempotency key payload mismatch',
  'changed-payload import replay is rejected'
);

insert into phase06_fixture
values (
  'export_job',
  (
    select id::text
    from public.current_create_export_job(
      (select value::uuid from phase06_fixture where name = 'owner_learner'),
      'lumen_archive',
      'lumen_archive',
      '{"scope":"complete_account"}',
      '{"includeHistory":true,"includeProgress":true}',
      repeat('d', 64),
      '65000000-0000-4000-8000-000000000002'
    )
  )
);

select is((select count(*)::integer from public.import_jobs), 1, 'owner sees its import job');
select is((select count(*)::integer from public.export_jobs), 1, 'owner sees its export job');
reset role;

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"61000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"62000000-0000-4000-8000-000000000002"}';
select is((select count(*)::integer from public.import_jobs), 0, 'another account cannot enumerate import jobs');
select is((select count(*)::integer from public.export_jobs), 0, 'another account cannot enumerate export jobs');
select throws_ok(
  $$select public.current_cancel_portability_job(
    'import',
    (select value::uuid from phase06_fixture where name = 'import_job')
  )$$,
  'P0002',
  'job is unavailable',
  'another account cannot cancel the owner job'
);
reset role;

set local role service_role;
select lives_ok(
  $$select public.admin_register_portability_upload(
    (select value::uuid from phase06_fixture where name = 'import_job'),
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001/source/object',
    'text/csv',
    'text/csv',
    128,
    repeat('a', 64),
    pg_catalog.now() + interval '1 hour'
  )$$,
  'the service can bind verified private upload metadata to the exact owner job'
);

insert into phase06_fixture
values (
  'import_lease',
  public.admin_begin_portability_job(
    'import',
    (select value::uuid from phase06_fixture where name = 'import_job'),
    '66000000-0000-4000-8000-000000000001',
    60
  )::text
);

select is(
  public.admin_checkpoint_portability_job(
    'import',
    (select value::uuid from phase06_fixture where name = 'import_job'),
    (select value::uuid from phase06_fixture where name = 'import_lease'),
    'write',
    'chunk-0000',
    0,
    repeat('b', 64),
    10,
    10,
    1,
    0,
    '{"created":10}'
  )->>'status',
  'running',
  'a valid lease writes a payload-bound resumable checkpoint'
);

select is(
  public.admin_complete_portability_job(
    'import',
    (select value::uuid from phase06_fixture where name = 'import_job'),
    (select value::uuid from phase06_fixture where name = 'import_lease'),
    'completed_with_warnings',
    1,
    0
  )->>'status',
  'completed_with_warnings',
  'the import completes with a durable warning-aware result'
);

insert into phase06_fixture
values (
  'export_lease',
  public.admin_begin_portability_job(
    'export',
    (select value::uuid from phase06_fixture where name = 'export_job'),
    '66000000-0000-4000-8000-000000000002',
    60
  )::text
);

insert into phase06_fixture
values (
  'artifact',
  (
    select id::text
    from public.admin_register_export_artifact(
      (select value::uuid from phase06_fixture where name = 'export_job'),
      '61000000-0000-4000-8000-000000000001',
      'lumen_archive',
      'account-backup.lumen',
      'application/vnd.lumen.archive+zip',
      2048,
      repeat('e', 64),
      0,
      '[]',
      '61000000-0000-4000-8000-000000000001/artifact/object',
      pg_catalog.now() + interval '1 hour'
    )
  )
);

insert into phase06_fixture
values (
  'cleanup_artifact',
  (
    select id::text
    from public.admin_register_export_artifact(
      (select value::uuid from phase06_fixture where name = 'export_job'),
      '61000000-0000-4000-8000-000000000001',
      'lumen_json',
      'expired.json',
      'application/json',
      128,
      repeat('f', 64),
      0,
      '[]',
      '61000000-0000-4000-8000-000000000001/artifact/expired',
      pg_catalog.now() + interval '1 hour'
    )
  )
);
reset role;
update public.export_artifacts
set created_at = pg_catalog.now() - interval '2 hours',
    expires_at = pg_catalog.now() - interval '1 hour'
where id = (select value::uuid from phase06_fixture where name = 'cleanup_artifact');

set local role service_role;
select is(
  (
    select storage_path
    from public.admin_claim_portability_object_cleanup(10)
    where object_id = (select value::uuid from phase06_fixture where name = 'cleanup_artifact')
  ),
  '61000000-0000-4000-8000-000000000001/artifact/expired',
  'expired artifact cleanup exposes one bounded private path to the service'
);
select is(
  public.admin_confirm_portability_object_deleted(
    'artifact',
    (select value::uuid from phase06_fixture where name = 'cleanup_artifact')
  ),
  true,
  'artifact metadata is finalized only after Storage deletion is confirmed'
);
reset role;
select ok(
  not (select available from public.export_artifacts
       where id = (select value::uuid from phase06_fixture where name = 'cleanup_artifact'))
  and (select deleted_at is not null from private.portability_artifact_objects
       where artifact_id = (select value::uuid from phase06_fixture where name = 'cleanup_artifact')),
  'confirmed artifact cleanup makes the public artifact unavailable'
);

set local role service_role;
select is(
  (
    select storage_path
    from public.admin_get_portability_artifact_object(
      (select value::uuid from phase06_fixture where name = 'artifact'),
      '61000000-0000-4000-8000-000000000001'
    )
  ),
  '61000000-0000-4000-8000-000000000001/artifact/object',
  'the service resolves an unexpired artifact only for the bound owner'
);

select is(
  (
    select count(*)::integer
    from public.admin_get_portability_artifact_object(
      (select value::uuid from phase06_fixture where name = 'artifact'),
      '61000000-0000-4000-8000-000000000002'
    )
  ),
  0,
  'cross-account artifact resolution returns no private path'
);

select is(
  public.admin_complete_portability_job(
    'export',
    (select value::uuid from phase06_fixture where name = 'export_job'),
    (select value::uuid from phase06_fixture where name = 'export_lease'),
    'completed',
    0,
    0
  )->>'status',
  'completed',
  'the export job completes after its artifact is registered'
);
reset role;

select is(
  (select count(*)::integer from private.portability_job_checkpoints),
  1,
  'one checkpoint is persisted'
);
select is(
  (select count(*)::integer from private.portability_job_receipts),
  2,
  'one terminal receipt exists for each completed job'
);
select is(
  (select count(*)::integer from private.portability_job_queue),
  0,
  'terminal completion removes both queue entries'
);
select is(
  (select count(*)::integer from private.portability_job_attempts where result = 'completed'),
  1,
  'the clean export attempt is recorded as completed'
);
select is(
  (select count(*)::integer from private.portability_job_attempts where result = 'completed_with_warnings'),
  1,
  'the warning-bearing import attempt retains its exact result'
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"62000000-0000-4000-8000-000000000001"}';
select is((select count(*)::integer from public.export_artifacts), 2, 'owner sees sanitized artifact metadata');
select is(
  (
    select available::text from public.export_artifacts
    where id = (select value::uuid from phase06_fixture where name = 'artifact')
  ),
  'true',
  'owner sees active artifact availability'
);
reset role;

set local role service_role;
select is(
  (
    select storage_path
    from public.admin_delete_portability_artifact(
      (select value::uuid from phase06_fixture where name = 'artifact'),
      '61000000-0000-4000-8000-000000000001'
    )
  ),
  '61000000-0000-4000-8000-000000000001/artifact/object',
  'manual deletion returns the private path only to the cleanup service'
);
select is(
  (
    select count(*)::integer
    from public.admin_get_portability_artifact_object(
      (select value::uuid from phase06_fixture where name = 'artifact'),
      '61000000-0000-4000-8000-000000000001'
    )
  ),
  0,
  'a deleted artifact is immediately unavailable'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"62000000-0000-4000-8000-000000000001"}';
insert into phase06_fixture
values
  (
    'yield_job',
    (
      select id::text
      from public.current_create_import_job(
        (select value::uuid from phase06_fixture where name = 'owner_learner'),
        'import', 'delimited', 'csv', 'large.csv', 1048577, repeat('1', 64),
        '{"duplicatePolicy":"skip"}', repeat('2', 64),
        '65000000-0000-4000-8000-000000000003'
      )
    )
  ),
  (
    'cancel_job',
    (
      select id::text
      from public.current_create_import_job(
        (select value::uuid from phase06_fixture where name = 'owner_learner'),
        'restore', 'lumen_archive', 'lumen_archive', 'backup.lumen', 256,
        repeat('3', 64), '{"conflictPolicy":"abort"}', repeat('4', 64),
        '65000000-0000-4000-8000-000000000004'
      )
    )
  );
reset role;

set local role service_role;
insert into phase06_fixture
values (
  'yield_lease',
  public.admin_begin_portability_job(
    'import',
    (select value::uuid from phase06_fixture where name = 'yield_job'),
    '66000000-0000-4000-8000-000000000003',
    60
  )::text
);
select is(
  public.admin_yield_portability_job(
    'import',
    (select value::uuid from phase06_fixture where name = 'yield_job'),
    (select value::uuid from phase06_fixture where name = 'yield_lease'),
    'write'
  )->>'status',
  'queued',
  'a successful bounded chunk releases its lease for continuation'
);
reset role;
select is(
  (
    select attempt_count
    from private.portability_job_queue
    where job_kind = 'import'
      and job_id = (select value::uuid from phase06_fixture where name = 'yield_job')
  ),
  0::smallint,
  'normal chunk continuation does not consume a retry attempt'
);
select is(
  (
    select count(*)::integer
    from private.portability_job_attempts
    where job_kind = 'import'
      and job_id = (select value::uuid from phase06_fixture where name = 'yield_job')
  ),
  0,
  'normal chunk continuation leaves no false failed attempt'
);
set local role service_role;
insert into phase06_fixture
values (
  'expiring_lease',
  public.admin_begin_portability_job(
    'import',
    (select value::uuid from phase06_fixture where name = 'yield_job'),
    '66000000-0000-4000-8000-000000000004',
    60
  )::text
);
reset role;
update private.portability_job_queue
set lease_expires_at = pg_catalog.now() - interval '1 second'
where job_kind = 'import'
  and job_id = (select value::uuid from phase06_fixture where name = 'yield_job');
set local role service_role;
insert into phase06_fixture
values (
  'reclaimed_lease',
  public.admin_begin_portability_job(
    'import',
    (select value::uuid from phase06_fixture where name = 'yield_job'),
    '66000000-0000-4000-8000-000000000005',
    60
  )::text
);
reset role;
select is(
  (
    select count(*)::integer
    from private.portability_job_attempts
    where job_kind = 'import'
      and job_id = (select value::uuid from phase06_fixture where name = 'yield_job')
      and result = 'lease_expired'
  ),
  1,
  'an expired lease is recorded and safely reclaimed'
);
set local role service_role;
select lives_ok(
  $$select public.admin_register_portability_upload(
    (select value::uuid from phase06_fixture where name = 'cancel_job'),
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001/cancel/object',
    'application/vnd.lumen.archive+zip',
    'application/zip',
    256,
    repeat('3', 64),
    pg_catalog.now() + interval '1 hour'
  )$$,
  'a cancellable restore owns one private temporary upload'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"62000000-0000-4000-8000-000000000001"}';
select is(
  public.current_cancel_portability_job(
    'restore',
    (select value::uuid from phase06_fixture where name = 'cancel_job')
  )->>'status',
  'cancelled',
  'an owner can cancel a restore before it starts'
);
reset role;

set local role service_role;
select is(
  public.admin_mark_portability_upload_deleted(
    (select value::uuid from phase06_fixture where name = 'cancel_job'),
    '61000000-0000-4000-8000-000000000001'
  ),
  true,
  'successful Storage cleanup marks the private upload deleted'
);
select is(
  (
    select count(*)::integer
    from public.admin_get_portability_upload_object(
      (select value::uuid from phase06_fixture where name = 'cancel_job'),
      '61000000-0000-4000-8000-000000000001'
    )
  ),
  0,
  'a cleaned upload can no longer be resolved'
);
reset role;

set local role service_role;
select lives_ok(
  $$
    select public.admin_issue_reauthentication_grant(
      '61000000-0000-4000-8000-000000000001',
      'account_deletion',
      pg_catalog.decode(pg_catalog.repeat('61', 32), 'hex'),
      pg_catalog.now() + interval '5 minutes',
      '65000000-0000-4000-8000-000000000005'
    );
    select public.admin_request_account_deletion(
      '61000000-0000-4000-8000-000000000001',
      pg_catalog.decode(pg_catalog.repeat('61', 32), 'hex'),
      1,
      '65000000-0000-4000-8000-000000000006'
    );
  $$,
  'the established privacy boundary queues deletion for the portability owner'
);
reset role;

insert into phase06_fixture
select 'deletion_job', job.id::text
from public.deletion_jobs as job
where job.account_id = '61000000-0000-4000-8000-000000000001'
  and job.status = 'queued';
update public.deletion_jobs
set requested_at = pg_catalog.now() - interval '2 days',
    execute_after = pg_catalog.now() - interval '1 day'
where id = (select value::uuid from phase06_fixture where name = 'deletion_job');

set local role service_role;
select ok(
  public.admin_process_account_deletion(
    (select value::uuid from phase06_fixture where name = 'deletion_job'),
    '65000000-0000-4000-8000-000000000007'
  ) is not null,
  'the canonical due-deletion worker completes with portability state present'
);
reset role;

select ok(
  not exists(
    select 1 from public.export_artifacts
    where account_id = '61000000-0000-4000-8000-000000000001' and available
  )
  and exists(
    select 1 from private.portability_upload_objects
    where account_id = '61000000-0000-4000-8000-000000000001'
      and storage_path = '61000000-0000-4000-8000-000000000001/source/object'
      and deleted_at is null
  ),
  'account deletion hides artifacts but keeps backing objects claimable until Storage cleanup'
);
insert into phase06_fixture
select 'account_cleanup_upload', upload.id::text
from private.portability_upload_objects as upload
where upload.storage_path = '61000000-0000-4000-8000-000000000001/source/object';
set local role service_role;
select is(
  (
    select storage_path
    from public.admin_claim_portability_object_cleanup(10)
    where object_kind = 'upload'
      and storage_path = '61000000-0000-4000-8000-000000000001/source/object'
  ),
  '61000000-0000-4000-8000-000000000001/source/object',
  'account deletion makes the remaining upload eligible for cleanup'
);
select is(
  public.admin_confirm_portability_object_deleted(
    'upload',
    (select value::uuid from phase06_fixture where name = 'account_cleanup_upload')
  ),
  true,
  'account-deletion upload cleanup can be confirmed after Storage removal'
);
reset role;

select * from finish();
rollback;
