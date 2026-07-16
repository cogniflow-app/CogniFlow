begin;

select plan(47);

select ok(
  pg_catalog.to_regprocedure('public.admin_process_account_deletion(uuid,uuid)') is not null,
  'the account-deletion worker RPC exists'
);

select is(
  (
    select procedure_record.prosecdef
    from pg_catalog.pg_proc as procedure_record
    where procedure_record.oid = pg_catalog.to_regprocedure(
      'public.admin_process_account_deletion(uuid,uuid)'
    )
  ),
  true,
  'the deletion worker is security definer'
);

select is(
  (
    select pg_catalog.array_to_string(procedure_record.proconfig, ',')
    from pg_catalog.pg_proc as procedure_record
    where procedure_record.oid = pg_catalog.to_regprocedure(
      'public.admin_process_account_deletion(uuid,uuid)'
    )
  ),
  'search_path=""',
  'the deletion worker fixes an empty search path'
);

select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_process_account_deletion(uuid,uuid)',
    'execute'
  ),
  'the service role can execute the deletion worker'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.admin_process_account_deletion(uuid,uuid)',
    'execute'
  ),
  'anonymous callers cannot execute the deletion worker'
);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_process_account_deletion(uuid,uuid)',
    'execute'
  ),
  'authenticated callers cannot execute the deletion worker'
);

select ok(
  exists(
    select 1
    from pg_catalog.pg_constraint as constraint_record
    join pg_catalog.pg_attribute as attribute_record
      on attribute_record.attrelid = constraint_record.conrelid
      and attribute_record.attnum = any(constraint_record.conkey)
    where constraint_record.conrelid = 'public.profiles'::regclass
      and constraint_record.confrelid = 'auth.users'::regclass
      and constraint_record.contype = 'f'
      and constraint_record.confdeltype = 'n'
      and attribute_record.attname = 'auth_subject_id'
  )
  and not exists(
    select 1
    from pg_catalog.pg_constraint as constraint_record
    join pg_catalog.pg_attribute as attribute_record
      on attribute_record.attrelid = constraint_record.conrelid
      and attribute_record.attnum = any(constraint_record.conkey)
    where constraint_record.conrelid = 'public.profiles'::regclass
      and constraint_record.confrelid = 'auth.users'::regclass
      and constraint_record.contype = 'f'
      and attribute_record.attname = 'id'
  ),
  'live Auth subjects use a nullable SET NULL link while the application tombstone ID is durable'
);

create temporary table deletion_fixture_ids (
  name text primary key,
  id uuid not null
) on commit drop;

grant select on deletion_fixture_ids to anon, authenticated, service_role;

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
    '61000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'delete-me@example.test',
    '',
    pg_catalog.now(),
    '{}'::jsonb,
    '{"untrusted":"must disappear"}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now(),
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '61000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'keep-me@example.test',
    '',
    pg_catalog.now(),
    '{}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now(),
    false
  );

update public.profiles
set
  display_name = case id
    when '61000000-0000-0000-0000-000000000001' then 'Delete This Person'
    else 'Unrelated Person'
  end,
  handle = case id
    when '61000000-0000-0000-0000-000000000001' then 'delete_this_person'
    else 'unrelated_person'
  end,
  locale = 'en-US',
  timezone = 'America/Chicago',
  study_day_start = 300,
  age_band = 'adult',
  account_status = 'active',
  learning_goals = array['private goal'],
  onboarding_completed_at = pg_catalog.now()
where id in (
  '61000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000002'
);

update public.learner_profiles as learner
set
  display_name = profile.display_name,
  pseudonym = case profile.id
    when '61000000-0000-0000-0000-000000000001' then 'Personal Learner Name'
    else 'Unrelated Learner'
  end,
  age_band = profile.age_band,
  settings = '{"privatePreference":"remove"}'::jsonb
from public.profiles as profile
where learner.owner_account_id = profile.id
  and learner.kind = 'self'
  and profile.id in (
    '61000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000002'
  );

insert into deletion_fixture_ids (name, id)
select 'self_learner', learner.id
from public.learner_profiles as learner
where learner.owner_account_id = '61000000-0000-0000-0000-000000000001'
  and learner.kind = 'self';

select is(
  (
    select count(*)::integer
    from public.profiles as profile
    where profile.id in (
      '61000000-0000-0000-0000-000000000001',
      '61000000-0000-0000-0000-000000000002'
    )
      and profile.auth_subject_id = profile.id
  ),
  2,
  'newly provisioned profiles retain their live Auth subject link'
);

set local role postgres;
select lives_ok(
  $$
    select public.admin_create_child_learner(
      '61000000-0000-0000-0000-000000000001',
      'Private Child Name',
      'Private Child Pseudonym',
      'under_13',
      'private-child-avatar',
      'child_profile',
      'deletion-test-v1',
      '{"analytics":false}'::jsonb,
      'local_test',
      'deletion-evidence-reference',
      '62000000-0000-0000-0000-000000000001'
    )
  $$,
  'database-owner setup creates a consented child learner'
);
reset role;

insert into deletion_fixture_ids (name, id)
select 'child_learner', relationship.learner_profile_id
from public.guardian_relationships as relationship
where relationship.guardian_account_id = '61000000-0000-0000-0000-000000000001'
  and relationship.idempotency_key = '62000000-0000-0000-0000-000000000001';

insert into deletion_fixture_ids (name, id)
select 'consent_grant', consent.id
from public.consent_records as consent
where consent.learner_profile_id = (
    select fixture.id
    from deletion_fixture_ids as fixture
    where fixture.name = 'child_learner'
  )
  and consent.action = 'granted';

insert into deletion_fixture_ids (name, id)
select 'historical_audit', event.id
from public.audit_events as event
where event.event_type = 'learner.child_profile_created'
  and event.actor_account_id = '61000000-0000-0000-0000-000000000001';

set local role service_role;
select lives_ok(
  $$
    select public.admin_register_device(
      '61000000-0000-0000-0000-000000000001',
      '61000000-0000-0000-0000-000000000011',
      '61000000-0000-0000-0000-000000000010',
      'Personally named device',
      'private-platform',
      '62000000-0000-0000-0000-000000000010'
    );
    select public.admin_set_learner_profile_credentials(
      '61000000-0000-0000-0000-000000000001',
      (select id from deletion_fixture_ids where name = 'child_learner'),
      '749281',
      'SAFE7K29BCDFGHJM',
      '62000000-0000-0000-0000-000000000011'
    );
    select * from public.admin_create_profile_session(
      '61000000-0000-0000-0000-000000000001',
      '61000000-0000-0000-0000-000000000011',
      (select id from deletion_fixture_ids where name = 'child_learner'),
      '61000000-0000-0000-0000-000000000010',
      pg_catalog.decode(pg_catalog.repeat('41', 32), 'hex'),
      pg_catalog.now() + interval '10 minutes',
      '62000000-0000-0000-0000-000000000012'
    );
    select public.admin_issue_school_authorization(
      '61000000-0000-0000-0000-000000000001',
      '61000000-0000-0000-0000-000000000001',
      pg_catalog.decode(pg_catalog.repeat('43', 32), 'hex'),
      pg_catalog.decode(pg_catalog.repeat('44', 32), 'hex'),
      pg_catalog.now() + interval '10 minutes',
      '62000000-0000-0000-0000-000000000013'
    );
  $$,
  'service setup creates device, learner-session, and school-proof secrets'
);
reset role;

set local role service_role;
select lives_ok(
  $$
    select public.admin_request_data_export(
      '61000000-0000-0000-0000-000000000001',
      '62000000-0000-0000-0000-000000000020'
    )
  $$,
  'an outstanding export job exists before deletion'
);
reset role;

update public.privacy_requests
set details = '{"privateReason":"remove this text"}'::jsonb
where account_id = '61000000-0000-0000-0000-000000000001'
  and request_type = 'export';

set local role service_role;
select lives_ok(
  $$
    select public.admin_issue_reauthentication_grant(
      '61000000-0000-0000-0000-000000000001',
      'account_deletion',
      pg_catalog.decode(pg_catalog.repeat('42', 32), 'hex'),
      pg_catalog.now() + interval '5 minutes',
      '62000000-0000-0000-0000-000000000021'
    );
    select public.admin_request_account_deletion(
      '61000000-0000-0000-0000-000000000001',
      pg_catalog.decode(pg_catalog.repeat('42', 32), 'hex'),
      1,
      '62000000-0000-0000-0000-000000000022'
    );
  $$,
  'a reauthenticated deletion request creates a queued grace-period job'
);
reset role;

insert into deletion_fixture_ids (name, id)
select 'deletion_job', job.id
from public.deletion_jobs as job
where job.account_id = '61000000-0000-0000-0000-000000000001'
  and job.status = 'queued';

select throws_ok(
  $$delete from auth.users where id = '61000000-0000-0000-0000-000000000002'$$,
  '55000',
  'auth account deletion requires the due deletion worker',
  'direct Auth deletion cannot strand an active application profile'
);

set local role service_role;
select throws_ok(
  $$
    select public.admin_process_account_deletion(
      (select id from deletion_fixture_ids where name = 'deletion_job'),
      '62000000-0000-0000-0000-000000000023'
    )
  $$,
  '55000',
  'deletion grace period has not elapsed',
  'the worker refuses a deletion before the grace deadline'
);
reset role;

update public.deletion_jobs
set
  requested_at = pg_catalog.now() - interval '2 days',
  execute_after = pg_catalog.now() - interval '1 day'
where id = (select id from deletion_fixture_ids where name = 'deletion_job');

set local role service_role;
select ok(
  public.admin_process_account_deletion(
    (select id from deletion_fixture_ids where name = 'deletion_job'),
    '62000000-0000-0000-0000-000000000023'
  ) is not null,
  'the service worker completes one due deletion job'
);
reset role;

select is(
  (
    select count(*)::integer
    from auth.users
    where id = '61000000-0000-0000-0000-000000000001'
  ),
  0,
  'the completed deletion removes the Supabase Auth principal'
);

select is(
  (
    select count(*)::integer
    from auth.users
    where id = '61000000-0000-0000-0000-000000000002'
  ),
  1,
  'the deletion worker does not remove an unrelated Auth principal'
);

select ok(
  (
    select profile.account_status = 'deleted'
      and profile.auth_subject_id is null
      and profile.deletion_tombstone_id is not null
      and profile.deleted_at is not null
    from public.profiles as profile
    where profile.id = '61000000-0000-0000-0000-000000000001'
  ),
  'the durable application profile becomes a complete pseudonymous tombstone'
);

select ok(
  (
    select profile.handle is null
      and profile.display_name is null
      and profile.locale = 'und'
      and profile.timezone = 'UTC'
      and profile.age_band = 'unknown'
      and profile.learning_goals = '{}'::text[]
      and profile.onboarding_completed_at is null
    from public.profiles as profile
    where profile.id = '61000000-0000-0000-0000-000000000001'
  ),
  'account profile fields containing personal data are minimized'
);

select ok(
  (
    select profile.account_status = 'active'
      and profile.display_name = 'Unrelated Person'
      and profile.handle::text = 'unrelated_person'
      and profile.auth_subject_id = profile.id
    from public.profiles as profile
    where profile.id = '61000000-0000-0000-0000-000000000002'
  ),
  'an unrelated application profile remains unchanged'
);

select is(
  (
    select count(*)::integer
    from public.learner_profiles as learner
    where learner.owner_account_id = '61000000-0000-0000-0000-000000000001'
      and learner.status = 'deleted'
      and learner.age_band = 'unknown'
  ),
  2,
  'the self and guardian-managed learner rows are retained as deleted tombstones'
);

select ok(
  not exists(
    select 1
    from public.learner_profiles as learner
    where learner.owner_account_id = '61000000-0000-0000-0000-000000000001'
      and (
        learner.display_name is not null
        or learner.pseudonym not like 'Deleted-%'
        or learner.avatar_seed not like 'deleted-%'
        or learner.settings <> '{}'::jsonb
      )
  ),
  'retained learner tombstones contain no mutable personal profile fields'
);

select is(
  (
    select count(*)::integer
    from public.profile_sessions
    where account_id = '61000000-0000-0000-0000-000000000001'
  ),
  0,
  'profile-session token hashes are purged'
);

select is(
  (
    select count(*)::integer
    from public.devices
    where account_id = '61000000-0000-0000-0000-000000000001'
  ),
  0,
  'device records are purged'
);

select is(
  (
    select count(*)::integer
    from private.learner_profile_credentials
    where learner_profile_id = (
      select id from deletion_fixture_ids where name = 'child_learner'
    )
  ),
  0,
  'PIN and family-code hashes are purged'
);

select is(
  (
    select count(*)::integer
    from private.reauthentication_grants
    where account_id = '61000000-0000-0000-0000-000000000001'
  ),
  0,
  'reauthentication proof hashes are purged'
);

select ok(
  (
    select proof_record.proof_hash is null
      and proof_record.revoked_at is not null
      and proof_record.revocation_reason = 'account_deletion'
      and pg_catalog.octet_length(proof_record.evidence_reference_hash) = 32
    from private.school_authorization_proofs as proof_record
    where proof_record.actor_account_id = '61000000-0000-0000-0000-000000000001'
      and proof_record.issue_idempotency_key = '62000000-0000-0000-0000-000000000013'
  ),
  'active school authorization bearer proof is cleared while its opaque evidence receipt is retained'
);

select is(
  (
    select count(*)::integer
    from private.rate_limit_buckets
    where subject_hash = extensions.digest(
      '61000000-0000-0000-0000-000000000001',
      'sha256'
    )
  ),
  0,
  'account-derived rate-limit subjects are purged'
);

select is(
  (
    select count(*)::integer
    from public.account_capabilities
    where account_id = '61000000-0000-0000-0000-000000000001'
      and revoked_at is null
  ),
  0,
  'all deleted-account capabilities are revoked'
);

select is(
  (
    select count(*)::integer
    from public.learner_profile_access as access
    where (
      access.account_id = '61000000-0000-0000-0000-000000000001'
      or access.learner_profile_id in (
        select learner.id
        from public.learner_profiles as learner
        where learner.owner_account_id = '61000000-0000-0000-0000-000000000001'
      )
    )
      and access.revoked_at is null
  ),
  0,
  'all account and owned-learner access grants are revoked'
);

select ok(
  not exists(
    select 1
    from public.guardian_relationships as relationship
    where relationship.guardian_account_id = '61000000-0000-0000-0000-000000000001'
      and (
        relationship.status <> 'revoked'
        or relationship.revoked_at is null
        or relationship.verification_metadata <> '{"tombstoned":true}'::jsonb
      )
  ),
  'guardian relationship state is revoked and minimized'
);

select ok(
  (
    select consent.action = 'granted'
      and consent.evidence_reference = 'deletion-evidence-reference'
      and consent.reason is null
    from public.consent_records as consent
    where consent.id = (
      select id from deletion_fixture_ids where name = 'consent_grant'
    )
  ),
  'the original immutable consent evidence remains unchanged'
);

select is(
  (
    select count(*)::integer
    from public.consent_records as consent
    where consent.prior_consent_record_id = (
      select id from deletion_fixture_ids where name = 'consent_grant'
    )
      and consent.action = 'revoked'
      and consent.reason = 'account deletion completed'
  ),
  1,
  'account deletion appends one compensating consent revocation'
);

select is(
  (
    select count(*)::integer
    from public.audit_events as event
    where event.id = (
      select id from deletion_fixture_ids where name = 'historical_audit'
    )
      and event.event_type = 'learner.child_profile_created'
  ),
  1,
  'pre-deletion audit history remains immutable and referentially valid'
);

select is(
  (
    select count(*)::integer
    from public.audit_events as event
    where event.event_type = 'privacy.account_deletion_completed'
      and event.target_id = (
        select id from deletion_fixture_ids where name = 'deletion_job'
      )
      and event.correlation_id = '62000000-0000-0000-0000-000000000023'
  ),
  1,
  'the worker appends one completion audit event'
);

select ok(
  (
    select job.status = 'completed'
      and job.completed_at is not null
      and job.completion_idempotency_key = '62000000-0000-0000-0000-000000000023'
      and job.account_tombstone_id = profile.deletion_tombstone_id
    from public.deletion_jobs as job
    join public.profiles as profile on profile.id = job.account_id
    where job.id = (
      select id from deletion_fixture_ids where name = 'deletion_job'
    )
  ),
  'the deletion job stores its completed state, idempotency key, and rotated tombstone ID'
);

select is(
  (
    select request.status::text
    from public.privacy_requests as request
    join public.deletion_jobs as job on job.privacy_request_id = request.id
    where job.id = (
      select id from deletion_fixture_ids where name = 'deletion_job'
    )
  ),
  'completed',
  'the owning privacy request is completed'
);

select ok(
  (
    select export.status = 'cancelled'
      and not export.result_available
      and export.error_code = 'account_deleted'
      and export.completed_at is not null
      and request.details = '{}'::jsonb
    from public.data_export_jobs as export
    join public.privacy_requests as request on request.id = export.privacy_request_id
    where request.account_id = '61000000-0000-0000-0000-000000000001'
  ),
  'outstanding export state is cancelled and made unavailable'
);

select ok(
  (
    select not preference.first_party_analytics
      and not preference.allow_product_updates
      and not preference.allow_social_interactions
      and preference.default_content_private
      and not preference.targeted_advertising
      and not preference.data_sale
    from public.privacy_preferences as preference
    where preference.account_id = '61000000-0000-0000-0000-000000000001'
  ),
  'retained privacy preferences are reset to the most restrictive values'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"61000000-0000-0000-0000-000000000011"}';
select throws_ok(
  $$select public.current_request_data_export('62000000-0000-0000-0000-000000000024')$$,
  '42501',
  'account context is unavailable',
  'a stale access token cannot create new privacy jobs for a deleted tombstone'
);
select throws_ok(
  $$
    select public.current_update_privacy_preferences(
      true,
      true,
      true,
      false,
      '62000000-0000-0000-0000-000000000025'
    )
  $$,
  '42501',
  'account context is unavailable',
  'a stale access token cannot mutate minimized privacy preferences'
);
reset role;
reset "request.jwt.claims";

set local role service_role;
select ok(
  public.admin_process_account_deletion(
    (select id from deletion_fixture_ids where name = 'deletion_job'),
    '62000000-0000-0000-0000-000000000023'
  ) is not null,
  'replaying the same worker operation returns the original tombstone ID'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.consent_records as consent
    where consent.prior_consent_record_id = (
      select id from deletion_fixture_ids where name = 'consent_grant'
    )
      and consent.action = 'revoked'
  ),
  1,
  'idempotent replay does not duplicate consent revocations'
);

select is(
  (
    select count(*)::integer
    from public.audit_events as event
    where event.event_type = 'privacy.account_deletion_completed'
      and event.target_id = (
        select id from deletion_fixture_ids where name = 'deletion_job'
      )
  ),
  1,
  'idempotent replay does not duplicate completion audit events'
);

select throws_ok(
  $$
    update public.consent_records
    set reason = 'rewrite attempt'
    where id = (select id from deletion_fixture_ids where name = 'consent_grant')
  $$,
  '55000',
  null,
  'consent history remains append-only after deletion'
);

select throws_ok(
  $$
    delete from public.audit_events
    where id = (select id from deletion_fixture_ids where name = 'historical_audit')
  $$,
  '55000',
  null,
  'audit history remains append-only after deletion'
);

select throws_ok(
  $$
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
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '61000000-0000-0000-0000-000000000001',
      'authenticated',
      'authenticated',
      'reuse@example.test',
      '',
      pg_catalog.now(),
      '{}'::jsonb,
      '{}'::jsonb,
      pg_catalog.now(),
      pg_catalog.now(),
      false
    )
  $$,
  '23505',
  'deleted auth subject cannot be reused',
  'a deleted Auth subject ID cannot be re-provisioned onto its tombstone'
);

select * from finish();
rollback;
