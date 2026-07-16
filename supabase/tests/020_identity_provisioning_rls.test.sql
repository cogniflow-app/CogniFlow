begin;

select plan(33);

create temporary table fixture_ids (
  name text primary key,
  id uuid not null
) on commit drop;
grant select on fixture_ids to anon, authenticated, service_role;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_anonymous
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'guardian@example.test',
    '',
    pg_catalog.now(),
    '{}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now(),
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'unrelated@example.test',
    '',
    pg_catalog.now(),
    '{}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now(),
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'teacher@example.test',
    '',
    pg_catalog.now(),
    '{}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now(),
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'attacker@example.test',
    '',
    pg_catalog.now(),
    '{}'::jsonb,
    '{"role":"service_role","capabilities":["moderate","admin"]}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now(),
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000009',
    'authenticated',
    'authenticated',
    null,
    '',
    null,
    '{}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now(),
    true
  );

update public.profiles set
  display_name = case id
    when '10000000-0000-0000-0000-000000000001' then 'Guardian One'
    when '10000000-0000-0000-0000-000000000002' then 'Unrelated Two'
    when '10000000-0000-0000-0000-000000000003' then 'Teacher Three'
    else 'Attacker Four'
  end,
  handle = ('user_' || pg_catalog.right(id::text, 1))::extensions.citext,
  age_band = 'adult',
  account_status = 'active',
  onboarding_completed_at = pg_catalog.now()
where id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004'
);
update public.learner_profiles as learner set
  display_name = profile.display_name,
  age_band = profile.age_band
from public.profiles as profile
where learner.owner_account_id = profile.id and learner.kind = 'self';

select is(
  (select count(*)::integer from public.profiles),
  4,
  'every eligible non-anonymous auth account is provisioned'
);

select is(
  (
    select count(*)::integer from public.profiles
    where id = '10000000-0000-0000-0000-000000000009'
  ),
  0,
  'anonymous auth identities do not become persistent account profiles'
);

select is(
  (
    select count(*)::integer from public.learner_profiles
    where kind = 'self'
  ),
  4,
  'provisioning creates one self learner per eligible account'
);

select is(
  (
    select count(*)::integer from public.learner_profile_access
    where role = 'self' and revoked_at is null
  ),
  4,
  'provisioning creates explicit self access'
);

select is(
  (
    select count(*)::integer from public.account_capabilities
    where account_id = '10000000-0000-0000-0000-000000000004'
      and revoked_at is null
  ),
  4,
  'user-editable metadata cannot add authorization capabilities'
);

select is(
  private.provision_account('10000000-0000-0000-0000-000000000001'),
  '10000000-0000-0000-0000-000000000001'::uuid,
  'provisioning can be retried idempotently'
);

select is(
  (
    select count(*)::integer from public.learner_profiles
    where owner_account_id = '10000000-0000-0000-0000-000000000001'
      and kind = 'self'
  ),
  1,
  'idempotent provisioning still has exactly one self learner'
);

set local role service_role;
select lives_ok(
  $$
    select public.admin_register_device(
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000011',
      '10000000-0000-0000-0000-000000000010',
      'Guardian browser',
      'test',
      '20000000-0000-0000-0000-000000000010'
    )
  $$,
  'the guardian fixture registers the verified Auth session before self-context mutations'
);
reset role;

select throws_ok(
  $$
    insert into public.learner_profiles (
      kind, owner_account_id, pseudonym, avatar_seed
    ) values (
      'self',
      '10000000-0000-0000-0000-000000000001',
      'Duplicate learner',
      'duplicate-seed'
    )
  $$,
  '23505',
  null,
  'a unique partial index prevents a second self learner'
);

set local role anon;
select throws_ok(
  $$select * from public.profiles$$,
  '42501',
  null,
  'anonymous visitors cannot enumerate profiles'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"10000000-0000-0000-0000-000000000011"}';

select is(
  (select count(*)::integer from public.profiles),
  1,
  'an authenticated owner reads only their own account profile'
);

select is(
  (
    select count(*)::integer from public.profiles
    where id = '10000000-0000-0000-0000-000000000002'
  ),
  0,
  'an authenticated owner cannot read another account profile'
);

select is(
  (select count(*)::integer from public.learner_profiles where kind = 'self'),
  1,
  'an authenticated account reads only its own self learner initially'
);

select throws_ok(
  $$update public.profiles set account_status = 'active'$$,
  '42501',
  null,
  'clients cannot directly update authorization-critical profile fields'
);

select throws_ok(
  $$insert into public.account_capabilities (account_id, capability) values (auth.uid(), 'teach')$$,
  '42501',
  null,
  'clients cannot forge capability rows'
);

select throws_ok(
  $$
    select public.admin_create_child_learner(
      auth.uid(),
      'Tampered Child',
      'Tampered',
      'under_13',
      'tampered-seed',
      'child_profile',
      'test-v1',
      '{}'::jsonb,
      'local_test',
      null,
      '20000000-0000-0000-0000-000000000099'
    )
  $$,
  '42501',
  null,
  'authenticated callers cannot bypass the server-only child-profile gate'
);

reset role;
reset "request.jwt.claims";
update public.profiles
set account_status = 'onboarding', onboarding_completed_at = null
where id = '10000000-0000-0000-0000-000000000001';

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"10000000-0000-0000-0000-000000000011"}';

select throws_ok(
  $$
    select public.current_complete_account_onboarding(
      'Too Young',
      'too_young',
      'en-US',
      'UTC',
      240::smallint,
      'under_13',
      '{}'::text[],
      'system',
      false,
      false,
      'standard',
      pg_catalog.decode(pg_catalog.repeat('99', 32), 'hex'),
      '20000000-0000-0000-0000-000000000098'
    )
  $$,
  '42501',
  'onboarding authorization is unavailable',
  'under-13 age selection cannot activate an independent account'
);
reset role;
reset "request.jwt.claims";
update public.profiles
set account_status = 'active', onboarding_completed_at = pg_catalog.now()
where id = '10000000-0000-0000-0000-000000000001';

set local role postgres;
select lives_ok(
  $$
    select public.admin_create_child_learner(
      '10000000-0000-0000-0000-000000000001',
      'River Learner',
      'River Otter',
      'under_13',
      'river-01',
      'child_profile',
      'local-test-v1',
      '{"analytics":false}'::jsonb,
      'local_test',
      'local-test-only',
      '20000000-0000-0000-0000-000000000001'
    )
  $$,
  'database-owner fixture creates a guardian-managed learner atomically'
);
reset role;

insert into fixture_ids (name, id)
select 'child', learner_profile_id
from public.guardian_relationships
where guardian_account_id = '10000000-0000-0000-0000-000000000001'
  and idempotency_key = '20000000-0000-0000-0000-000000000001';

select is(
  (
    select count(*)::integer from public.guardian_relationships
    where learner_profile_id = (select id from fixture_ids where name = 'child')
      and status = 'active'
  ),
  1,
  'child creation records one active guardian relationship'
);

select is(
  (
    select count(*)::integer from public.consent_records
    where learner_profile_id = (select id from fixture_ids where name = 'child')
      and action = 'granted'
  ),
  1,
  'child creation records consent in the same transaction'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000001';
select is(
  (
    select count(*)::integer from public.learner_profiles
    where id = (select id from fixture_ids where name = 'child')
  ),
  1,
  'the active guardian can read the child learner profile'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000002';
select is(
  (
    select count(*)::integer from public.learner_profiles
    where id = (select id from fixture_ids where name = 'child')
  ),
  0,
  'an unrelated authenticated account cannot tamper with a learner-profile ID'
);
reset role;

set local role postgres;
select lives_ok(
  $$
    select public.admin_grant_learner_access(
      '10000000-0000-0000-0000-000000000001',
      (select id from fixture_ids where name = 'child'),
      '10000000-0000-0000-0000-000000000003',
      'teacher_observer',
      array['observe']::public.learner_permission[],
      '20000000-0000-0000-0000-000000000002'
    )
  $$,
  'a managing guardian can grant a teacher-observer placeholder'
);
reset role;

insert into fixture_ids (name, id)
select 'teacher_access', id
from public.learner_profile_access
where learner_profile_id = (select id from fixture_ids where name = 'child')
  and account_id = '10000000-0000-0000-0000-000000000003'
  and role = 'teacher_observer';

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000003';
select is(
  (
    select count(*)::integer from public.learner_profiles
    where id = (select id from fixture_ids where name = 'child')
  ),
  0,
  'teacher observers cannot select full learner records'
);
select is(
  (
    select count(*)::integer from public.get_observed_learner_profiles()
    where learner_profile_id = (select id from fixture_ids where name = 'child')
  ),
  1,
  'teacher observers receive only the safe observation projection'
);
reset role;

set local role service_role;
select lives_ok(
  $$
    select public.admin_revoke_learner_access(
      '10000000-0000-0000-0000-000000000001',
      (select id from fixture_ids where name = 'teacher_access'),
      '20000000-0000-0000-0000-000000000003'
    )
  $$,
  'teacher-observer access can be revoked atomically'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000003';
select is(
  (select count(*)::integer from public.get_observed_learner_profiles()),
  0,
  'a revoked teacher observer loses the safe projection immediately'
);
reset role;

set local role postgres;
select is(
  public.admin_create_child_learner(
    '10000000-0000-0000-0000-000000000001',
    'River Learner',
    'River Otter',
    'under_13',
    'river-01',
    'child_profile',
    'local-test-v1',
    '{"analytics":false}'::jsonb,
    'local_test',
    'local-test-only',
    '20000000-0000-0000-0000-000000000001'
  ),
  (select id from fixture_ids where name = 'child'),
  'child-profile creation returns the original result on idempotent replay'
);
reset role;

select is(
  (
    select count(*)::integer from public.learner_profiles
    where kind = 'child'
      and owner_account_id = '10000000-0000-0000-0000-000000000001'
  ),
  1,
  'idempotent child creation does not duplicate a learner'
);

insert into fixture_ids (name, id)
select 'child_consent', id
from public.consent_records
where learner_profile_id = (select id from fixture_ids where name = 'child')
  and action = 'granted';

set local role service_role;
select lives_ok(
  $$
    select public.admin_revoke_consent(
      '10000000-0000-0000-0000-000000000001',
      (select id from fixture_ids where name = 'child_consent'),
      'guardian revoked local consent',
      '20000000-0000-0000-0000-000000000004'
    )
  $$,
  'consent revocation atomically revokes guardian access'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000001';
select is(
  (
    select count(*)::integer from public.learner_profiles
    where id = (select id from fixture_ids where name = 'child')
  ),
  0,
  'a revoked guardian no longer reads the child learner record'
);
reset role;

set local role service_role;
select lives_ok(
  $$
    select public.admin_record_audit_event(
      'system',
      null,
      null,
      null,
      'security.service_path_verified',
      'profile',
      '10000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000005',
      '{}'::jsonb
    )
  $$,
  'the service/admin path can invoke an explicitly privileged mutation'
);
reset role;

select is(
  (
    select count(*)::integer from public.audit_events
    where event_type = 'security.service_path_verified'
      and correlation_id = '20000000-0000-0000-0000-000000000005'
  ),
  1,
  'the privileged service mutation writes an auditable event'
);

select * from finish();
rollback;
