begin;

select no_plan();

select has_table('public', 'sync_device_state', 'device/profile sync checkpoints exist');
select has_table('private', 'sync_operation_receipts', 'payload-bound sync receipts exist');
select has_table('private', 'sync_change_feed', 'privacy-minimized change feed exists');

select ok(
  (select relation.relrowsecurity
   from pg_catalog.pg_class as relation
   where relation.oid = 'public.sync_device_state'::regclass),
  'RLS is enabled on the exposed synchronization state'
);
select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.sync_device_state', 'select')
  and not pg_catalog.has_table_privilege('authenticated', 'public.sync_device_state', 'insert')
  and not pg_catalog.has_table_privilege('anon', 'public.sync_device_state', 'select')
  and not pg_catalog.has_table_privilege('service_role', 'private.sync_operation_receipts', 'select')
  and not pg_catalog.has_table_privilege('service_role', 'private.sync_change_feed', 'select'),
  'only the narrow RLS read surface is exposed'
);
select ok(
  exists(
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public' and indexname = 'sync_device_state_learner_seen_idx'
  )
  and exists(
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'private' and indexname = 'sync_change_feed_profile_sequence_idx'
  )
  and exists(
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'private' and indexname = 'sync_operation_receipts_profile_status_idx'
  ),
  'authorization, cursor, and receipt query paths are indexed'
);
select ok(
  not exists(
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'admin_begin_sync_operation',
        'admin_complete_sync_operation',
        'admin_pull_sync_changes',
        'admin_update_sync_device_preferences'
      )
      and (
        not procedure.prosecdef
        or procedure.proconfig @> array['search_path=""']::text[] is not true
        or pg_catalog.has_function_privilege('authenticated', procedure.oid, 'execute')
        or not pg_catalog.has_function_privilege('service_role', procedure.oid, 'execute')
      )
  ),
  'sync RPCs are service-only security-definer functions with empty search paths'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  '51000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'phase05-owner@example.test',
  '',
  pg_catalog.now(),
  '{}',
  '{}',
  pg_catalog.now(),
  pg_catalog.now(),
  false
);
update public.profiles
set account_status = 'active',
    onboarding_completed_at = pg_catalog.now(),
    age_band = 'adult',
    display_name = 'Phase 05 owner',
    handle = 'phase05_owner'
where id = '51000000-0000-4000-8000-000000000001';
insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values (
  '52000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  pg_catalog.now(),
  pg_catalog.now(),
  pg_catalog.now() + interval '1 hour'
);
insert into public.devices (
  id, account_id, auth_session_id, display_name, platform, idempotency_key
) values (
  '53000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001',
  'Phase 05 browser',
  'pgTAP',
  '54000000-0000-4000-8000-000000000001'
);

create temporary table phase05_fixture (name text primary key, value text not null) on commit drop;
grant select, insert, update, delete on phase05_fixture to service_role;
insert into phase05_fixture
values (
  'learner',
  (
    select id::text
    from public.learner_profiles
    where owner_account_id = '51000000-0000-4000-8000-000000000001'
      and kind = 'self'
  )
);

set local role service_role;
select is(
  public.admin_begin_sync_operation(
    '51000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000001',
    (select value::uuid from phase05_fixture where name = 'learner'),
    null,
    '55000000-0000-4000-8000-000000000001',
    '56000000-0000-4000-8000-000000000001',
    'review.submit',
    repeat('a', 64),
    1
  )->>'state',
  'new',
  'a new payload-bound operation reserves one receipt'
);
select is(
  public.admin_begin_sync_operation(
    '51000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000001',
    (select value::uuid from phase05_fixture where name = 'learner'),
    null,
    '55000000-0000-4000-8000-000000000001',
    '56000000-0000-4000-8000-000000000001',
    'review.submit',
    repeat('a', 64),
    1
  )->>'state',
  'pending',
  'an exact concurrent retry observes the pending receipt'
);
select throws_ok(
  $$select public.admin_begin_sync_operation(
    '51000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000001',
    (select value::uuid from phase05_fixture where name = 'learner'),
    null,
    '55000000-0000-4000-8000-000000000001',
    '56000000-0000-4000-8000-000000000001',
    'review.submit',
    repeat('b', 64),
    1
  )$$,
  '22023',
  'synchronization id was reused with different input',
  'changed-payload operation reuse is rejected'
);
select is(
  public.admin_complete_sync_operation(
    '51000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000001',
    (select value::uuid from phase05_fixture where name = 'learner'),
    null,
    '55000000-0000-4000-8000-000000000001',
    repeat('a', 64),
    '{"operationId":"55000000-0000-4000-8000-000000000001","status":"acknowledged"}',
    'review',
    '57000000-0000-4000-8000-000000000001',
    1,
    false
  )->>'status',
  'acknowledged',
  'completion durably acknowledges the typed result'
);
select is(
  public.admin_begin_sync_operation(
    '51000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000001',
    (select value::uuid from phase05_fixture where name = 'learner'),
    null,
    '55000000-0000-4000-8000-000000000001',
    '56000000-0000-4000-8000-000000000001',
    'review.submit',
    repeat('a', 64),
    1
  )->>'state',
  'complete',
  'an exact completed retry replays the existing result'
);
select is(
  pg_catalog.jsonb_array_length(
    public.admin_pull_sync_changes(
      '51000000-0000-4000-8000-000000000001',
      '52000000-0000-4000-8000-000000000001',
      '53000000-0000-4000-8000-000000000001',
      (select value::uuid from phase05_fixture where name = 'learner'),
      null,
      0,
      100
    )->'changes'
  ),
  1,
  'cursor pull returns one authorized minimal entity reference'
);
select is(
  public.admin_pull_sync_changes(
    '51000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000001',
    (select value::uuid from phase05_fixture where name = 'learner'),
    null,
    0,
    100
  )->'changes'->0->>'deviceId',
  '53000000-0000-4000-8000-000000000001',
  'pulled changes identify the originating registered device for client delta suppression'
);
select is(
  public.admin_update_sync_device_preferences(
    '51000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000001',
    (select value::uuid from phase05_fixture where name = 'learner'),
    null,
    true,
    'pause',
    'none'
  )->>'paused',
  'true',
  'the registered device can persist bounded profile-specific sync preferences'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"51000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"52000000-0000-4000-8000-000000000001"}';
select is(
  (select count(*)::integer from public.sync_device_state),
  1,
  'the authorized account can read its own device/profile checkpoint'
);
reset role;

select is(
  (select count(*)::integer from private.sync_operation_receipts),
  1,
  'exact retries do not duplicate receipt evidence'
);
select is(
  (select count(*)::integer from private.sync_change_feed),
  1,
  'one acknowledged operation emits one minimal change reference'
);

select * from finish();
rollback;
