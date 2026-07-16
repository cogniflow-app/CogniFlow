begin;

select plan(38);

-- Five independent accounts exercise onboarding, an unrelated Auth session,
-- managed-mode sign-out, global sign-out, and provisional rejection.
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
    '38000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'onboarding-boundary@example.test',
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
    '38000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'unrelated-boundary@example.test',
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
    '38000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'managed-signout@example.test',
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
    '38000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'global-signout@example.test',
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
    '38000000-0000-0000-0000-000000000005',
    'authenticated',
    'authenticated',
    'provisional-rejection@example.test',
    '',
    pg_catalog.now(),
    '{}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now(),
    false
  );

-- The onboarding and provisional fixtures intentionally retain their default
-- onboarding state. The remaining accounts are completed test guardians.
update public.profiles
set
  display_name = case id
    when '38000000-0000-0000-0000-000000000002' then 'Unrelated Boundary'
    when '38000000-0000-0000-0000-000000000003' then 'Managed Boundary'
    else 'Global Boundary'
  end,
  handle = case id
    when '38000000-0000-0000-0000-000000000002' then 'unrelated_boundary'
    when '38000000-0000-0000-0000-000000000003' then 'managed_boundary'
    else 'global_boundary'
  end,
  age_band = 'adult',
  account_status = 'active',
  onboarding_completed_at = pg_catalog.now()
where id in (
  '38000000-0000-0000-0000-000000000002',
  '38000000-0000-0000-0000-000000000003',
  '38000000-0000-0000-0000-000000000004'
);

insert into auth.sessions (id, user_id, created_at, updated_at, not_after) values
  (
    '38000000-0000-0000-0000-000000000011',
    '38000000-0000-0000-0000-000000000001',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now() + interval '1 hour'
  ),
  (
    '38000000-0000-0000-0000-000000000012',
    '38000000-0000-0000-0000-000000000002',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now() + interval '1 hour'
  ),
  (
    '38000000-0000-0000-0000-000000000013',
    '38000000-0000-0000-0000-000000000003',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now() + interval '1 hour'
  ),
  (
    '38000000-0000-0000-0000-000000000014',
    '38000000-0000-0000-0000-000000000003',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now() + interval '1 hour'
  ),
  (
    '38000000-0000-0000-0000-000000000015',
    '38000000-0000-0000-0000-000000000004',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now() + interval '1 hour'
  ),
  (
    '38000000-0000-0000-0000-000000000016',
    '38000000-0000-0000-0000-000000000004',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now() + interval '1 hour'
  );

set local role service_role;

select is(
  (
    public.admin_register_request_device(
      '38000000-0000-0000-0000-000000000001',
      '38000000-0000-0000-0000-000000000011',
      '38000000-0000-0000-0000-000000000021',
      'Onboarding browser',
      'test'
    )
  ).id,
  '38000000-0000-0000-0000-000000000021'::uuid,
  'request-device registration accepts a real Auth session owned by the account'
);

select is(
  (
    public.admin_register_request_device(
      '38000000-0000-0000-0000-000000000001',
      '38000000-0000-0000-0000-000000000011',
      '38000000-0000-0000-0000-000000000022',
      'Onboarding browser refreshed',
      'test'
    )
  ).id,
  '38000000-0000-0000-0000-000000000021'::uuid,
  'request-device replay resolves the original device instead of trusting a new candidate ID'
);

select throws_ok(
  $$
    select public.admin_register_request_device(
      '38000000-0000-0000-0000-000000000001',
      '38000000-0000-0000-0000-000000000012',
      '38000000-0000-0000-0000-000000000023',
      'Cross-account session',
      'test'
    )
  $$,
  '42501',
  'device cannot be registered',
  'request-device registration rejects a real Auth session owned by another account'
);

select throws_ok(
  $$
    select public.admin_register_request_device(
      '38000000-0000-0000-0000-000000000001',
      '38000000-0000-0000-0000-000000000099',
      '38000000-0000-0000-0000-000000000024',
      'Missing session',
      'test'
    )
  $$,
  '42501',
  'device cannot be registered',
  'request-device registration rejects a caller-supplied session UUID absent from Auth'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.devices
    where account_id = '38000000-0000-0000-0000-000000000001'
  ),
  1,
  'device resolution creates exactly one application device for an Auth session'
);

select is(
  (
    select auth_session_id
    from public.devices
    where id = '38000000-0000-0000-0000-000000000021'
  ),
  '38000000-0000-0000-0000-000000000011'::uuid,
  'the resolved device persists the verified Auth-session binding'
);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_issue_onboarding_authorization(uuid,uuid,text,text,text,text,smallint,public.age_band,text[],public.theme_preference,boolean,boolean,text,bytea,timestamptz,uuid,uuid)',
    'execute'
  ),
  'authenticated callers cannot issue their own onboarding authorization proof'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '38000000-0000-0000-0000-000000000001';
set local "request.jwt.claims" = '{"sub":"38000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"38000000-0000-0000-0000-000000000011"}';

select throws_ok(
  $$
    select public.current_complete_account_onboarding(
      'Authorized Learner',
      'authorized_learner',
      'en-US',
      'UTC',
      240::smallint,
      'adult',
      array['daily_review']::text[],
      'dark',
      true,
      true,
      'increased_spacing',
      pg_catalog.decode(pg_catalog.repeat('aa', 32), 'hex'),
      '38000000-0000-0000-0000-000000000031'
    )
  $$,
  '42501',
  'onboarding authorization is unavailable',
  'an authenticated account cannot complete onboarding with an unissued proof digest'
);

reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

set local role service_role;
select lives_ok(
  $$
    select public.admin_issue_onboarding_authorization(
      '38000000-0000-0000-0000-000000000001',
      '38000000-0000-0000-0000-000000000011',
      'Authorized Learner',
      'authorized_learner',
      'en-US',
      'UTC',
      240::smallint,
      'adult',
      array['daily_review']::text[],
      'dark',
      true,
      true,
      'increased_spacing',
      pg_catalog.decode(pg_catalog.repeat('aa', 32), 'hex'),
      pg_catalog.now() + interval '5 minutes',
      '38000000-0000-0000-0000-000000000031',
      '38000000-0000-0000-0000-000000000032'
    )
  $$,
  'the trusted service can issue a short-lived payload- and Auth-session-bound onboarding proof'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '38000000-0000-0000-0000-000000000001';
set local "request.jwt.claims" = '{"sub":"38000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"38000000-0000-0000-0000-000000000011"}';

select throws_ok(
  $$
    select public.current_complete_account_onboarding(
      'Tampered Learner',
      'authorized_learner',
      'en-US',
      'UTC',
      240::smallint,
      'adult',
      array['daily_review']::text[],
      'dark',
      true,
      true,
      'increased_spacing',
      pg_catalog.decode(pg_catalog.repeat('aa', 32), 'hex'),
      '38000000-0000-0000-0000-000000000031'
    )
  $$,
  '42501',
  'onboarding authorization is unavailable',
  'an issued onboarding proof rejects payload tampering before consumption'
);

select is(
  (
    public.current_complete_account_onboarding(
      'Authorized Learner',
      'authorized_learner',
      'en-US',
      'UTC',
      240::smallint,
      'adult',
      array['daily_review']::text[],
      'dark',
      true,
      true,
      'increased_spacing',
      pg_catalog.decode(pg_catalog.repeat('aa', 32), 'hex'),
      '38000000-0000-0000-0000-000000000031'
    )
  ).id,
  '38000000-0000-0000-0000-000000000001'::uuid,
  'the exact authorized onboarding payload activates its bound account'
);

select is(
  (
    select account_status::text || ':' || age_band::text
    from public.profiles
    where id = '38000000-0000-0000-0000-000000000001'
  ),
  'active:adult',
  'authorized onboarding persists the eligible age band and active account state'
);

select is(
  (
    public.current_complete_account_onboarding(
      'Authorized Learner',
      'authorized_learner',
      'en-US',
      'UTC',
      240::smallint,
      'adult',
      array['daily_review']::text[],
      'dark',
      true,
      true,
      'increased_spacing',
      pg_catalog.decode(pg_catalog.repeat('aa', 32), 'hex'),
      '38000000-0000-0000-0000-000000000031'
    )
  ).id,
  '38000000-0000-0000-0000-000000000001'::uuid,
  'an exact onboarding retry is idempotent after proof consumption'
);

select throws_ok(
  $$
    select public.current_complete_account_onboarding(
      'Replay Tamper',
      'authorized_learner',
      'en-US',
      'UTC',
      240::smallint,
      'adult',
      array['daily_review']::text[],
      'dark',
      true,
      true,
      'increased_spacing',
      pg_catalog.decode(pg_catalog.repeat('aa', 32), 'hex'),
      '38000000-0000-0000-0000-000000000031'
    )
  $$,
  '22023',
  'onboarding replay does not match',
  'an onboarding retry cannot alter the payload associated with its idempotency key'
);

select throws_ok(
  $$
    select public.current_complete_account_onboarding(
      'Authorized Learner',
      'authorized_learner',
      'en-US',
      'UTC',
      240::smallint,
      'adult',
      array['daily_review']::text[],
      'dark',
      true,
      true,
      'increased_spacing',
      pg_catalog.decode(pg_catalog.repeat('aa', 32), 'hex'),
      '38000000-0000-0000-0000-000000000033'
    )
  $$,
  '42501',
  'onboarding authorization is unavailable',
  'a consumed onboarding proof cannot authorize a new completion idempotency key'
);

reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

select is(
  (
    select count(*)::integer
    from private.onboarding_authorizations
    where account_id = '38000000-0000-0000-0000-000000000001'
      and proof_hash is null
      and consumed_at is not null
      and consumption_idempotency_key = '38000000-0000-0000-0000-000000000031'
  ),
  1,
  'successful onboarding irreversibly consumes exactly one private authorization row'
);

select is(
  (
    select count(*)::integer
    from public.audit_events
    where actor_account_id = '38000000-0000-0000-0000-000000000001'
      and event_type = 'account.onboarding_completed'
      and correlation_id = '38000000-0000-0000-0000-000000000031'
  ),
  1,
  'authorized onboarding and its exact retry produce one completion audit event'
);

set local role service_role;
select is(
  public.admin_reject_provisional_account(
    '38000000-0000-0000-0000-000000000005',
    '38000000-0000-0000-0000-000000000041'
  ),
  true,
  'the trusted service rejects an uncompleted provisional identity'
);
reset role;

select is(
  (
    select count(*)::integer
    from auth.users
    where id = '38000000-0000-0000-0000-000000000005'
  ),
  0,
  'provisional rejection removes the Auth principal immediately'
);

select is(
  (
    select account_status::text || ':' || coalesce(auth_subject_id::text, 'none')
    from public.profiles
    where id = '38000000-0000-0000-0000-000000000005'
  ),
  'deleted:none',
  'provisional rejection retains only a deleted application tombstone'
);

select is(
  (
    select count(*)::integer
    from public.learner_profiles
    where owner_account_id = '38000000-0000-0000-0000-000000000005'
      and kind = 'self'
      and status = 'deleted'
      and display_name is null
      and age_band = 'unknown'
  ),
  1,
  'provisional rejection minimizes and tombstones the automatically provisioned self learner'
);

set local role service_role;
select is(
  public.admin_reject_provisional_account(
    '38000000-0000-0000-0000-000000000005',
    '38000000-0000-0000-0000-000000000041'
  ),
  true,
  'provisional rejection is idempotent after the Auth principal is gone'
);
reset role;

-- Register two real Auth sessions for each sign-out fixture and an unrelated
-- account device that global sign-out must not touch.
set local role service_role;
select public.admin_register_request_device(
  '38000000-0000-0000-0000-000000000002',
  '38000000-0000-0000-0000-000000000012',
  '38000000-0000-0000-0000-000000000025',
  'Unrelated browser',
  'test'
);
select public.admin_register_request_device(
  '38000000-0000-0000-0000-000000000003',
  '38000000-0000-0000-0000-000000000013',
  '38000000-0000-0000-0000-000000000026',
  'Managed browser',
  'test'
);
select public.admin_register_request_device(
  '38000000-0000-0000-0000-000000000003',
  '38000000-0000-0000-0000-000000000014',
  '38000000-0000-0000-0000-000000000027',
  'Guardian second browser',
  'test'
);
select public.admin_register_request_device(
  '38000000-0000-0000-0000-000000000004',
  '38000000-0000-0000-0000-000000000015',
  '38000000-0000-0000-0000-000000000028',
  'Global browser one',
  'test'
);
select public.admin_register_request_device(
  '38000000-0000-0000-0000-000000000004',
  '38000000-0000-0000-0000-000000000016',
  '38000000-0000-0000-0000-000000000029',
  'Global browser two',
  'test'
);
reset role;

insert into public.learner_profiles (
  id,
  kind,
  owner_account_id,
  display_name,
  pseudonym,
  age_band,
  avatar_seed,
  status,
  settings
) values (
  '38000000-0000-0000-0000-000000000051',
  'child',
  '38000000-0000-0000-0000-000000000003',
  'Managed Learner',
  'Quiet Comet',
  'under_13',
  'managed-boundary-child',
  'active',
  '{"analytics":"essential_only","public_content":false,"social_interactions":false}'::jsonb
);

insert into public.profile_sessions (
  account_id,
  auth_session_id,
  learner_profile_id,
  device_id,
  token_hash,
  expires_at,
  idempotency_key
) values
  (
    '38000000-0000-0000-0000-000000000003',
    '38000000-0000-0000-0000-000000000013',
    '38000000-0000-0000-0000-000000000051',
    '38000000-0000-0000-0000-000000000026',
    pg_catalog.decode(pg_catalog.repeat('dd', 32), 'hex'),
    pg_catalog.now() + interval '20 minutes',
    '38000000-0000-0000-0000-000000000052'
  ),
  (
    '38000000-0000-0000-0000-000000000004',
    '38000000-0000-0000-0000-000000000016',
    (
      select id
      from public.learner_profiles
      where owner_account_id = '38000000-0000-0000-0000-000000000004'
        and kind = 'self'
    ),
    '38000000-0000-0000-0000-000000000029',
    pg_catalog.decode(pg_catalog.repeat('ee', 32), 'hex'),
    pg_catalog.now() + interval '20 minutes',
    '38000000-0000-0000-0000-000000000053'
  );

set local role authenticated;
set local "request.jwt.claim.sub" = '38000000-0000-0000-0000-000000000003';
set local "request.jwt.claims" = '{"sub":"38000000-0000-0000-0000-000000000003","role":"authenticated","session_id":"38000000-0000-0000-0000-000000000013"}';

select throws_ok(
  $$
    select public.current_sign_out_devices(
      'all',
      '38000000-0000-0000-0000-000000000061'
    )
  $$,
  '22023',
  'invalid sign-out request',
  'the current-device RPC cannot be used as a direct all-device bypass'
);

select throws_ok(
  $$
    select public.current_sign_out_all_devices(
      pg_catalog.decode(pg_catalog.repeat('bb', 32), 'hex'),
      '38000000-0000-0000-0000-000000000062'
    )
  $$,
  '42501',
  'managed learner context is active',
  'managed learner mode cannot invoke all-device sign-out directly'
);

select is(
  public.current_sign_out_devices(
    'current',
    '38000000-0000-0000-0000-000000000063'
  ),
  true,
  'current-device sign-out remains available as a managed-mode escape hatch'
);

reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

select ok(
  exists(
    select 1
    from public.devices
    where id = '38000000-0000-0000-0000-000000000026'
      and revoked_at is not null
  ),
  'managed current-device sign-out revokes its exact application device'
);

select ok(
  exists(
    select 1
    from public.devices
    where id = '38000000-0000-0000-0000-000000000027'
      and revoked_at is null
  ),
  'managed current-device sign-out leaves the guardian second device active'
);

select ok(
  exists(
    select 1
    from public.profile_sessions
    where account_id = '38000000-0000-0000-0000-000000000003'
      and auth_session_id = '38000000-0000-0000-0000-000000000013'
      and revoked_at is not null
      and revoke_reason = 'current auth session signed out'
  ),
  'managed current-device sign-out also closes the bound learner-profile session'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '38000000-0000-0000-0000-000000000004';
set local "request.jwt.claims" = '{"sub":"38000000-0000-0000-0000-000000000004","role":"authenticated","session_id":"38000000-0000-0000-0000-000000000015"}';

select throws_ok(
  $$
    select public.current_sign_out_all_devices(
      pg_catalog.decode(pg_catalog.repeat('bb', 32), 'hex'),
      '38000000-0000-0000-0000-000000000071'
    )
  $$,
  '28000',
  'recent reauthentication is required',
  'self context alone cannot perform all-device sign-out without a fresh proof'
);

reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

set local role service_role;
select lives_ok(
  $$
    select public.admin_issue_reauthentication_grant(
      '38000000-0000-0000-0000-000000000004',
      'security_change',
      pg_catalog.decode(pg_catalog.repeat('bb', 32), 'hex'),
      pg_catalog.now() + interval '5 minutes',
      '38000000-0000-0000-0000-000000000072'
    )
  $$,
  'the trusted reauthentication boundary issues a short-lived all-sign-out proof'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '38000000-0000-0000-0000-000000000004';
set local "request.jwt.claims" = '{"sub":"38000000-0000-0000-0000-000000000004","role":"authenticated","session_id":"38000000-0000-0000-0000-000000000015"}';

select is(
  public.current_sign_out_all_devices(
    pg_catalog.decode(pg_catalog.repeat('bb', 32), 'hex'),
    '38000000-0000-0000-0000-000000000073'
  ),
  true,
  'fresh self-context reauthentication revokes every account device'
);

select is(
  public.current_sign_out_all_devices(
    pg_catalog.decode(pg_catalog.repeat('bb', 32), 'hex'),
    '38000000-0000-0000-0000-000000000073'
  ),
  true,
  'an exact all-device sign-out retry is idempotent after device revocation'
);

select is(
  (select count(*)::integer from public.profiles),
  0,
  'the caller stale JWT loses profile reads immediately after all-device sign-out'
);

reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

select is(
  (
    select count(*)::integer
    from public.devices
    where account_id = '38000000-0000-0000-0000-000000000004'
      and revoked_at is not null
  ),
  2,
  'all-device sign-out revokes every registered application device for the account'
);

select ok(
  exists(
    select 1
    from public.profile_sessions
    where account_id = '38000000-0000-0000-0000-000000000004'
      and revoked_at is not null
      and revoke_reason = 'all auth sessions signed out'
  ),
  'all-device sign-out revokes the account profile-session rows'
);

select ok(
  exists(
    select 1
    from private.reauthentication_grants
    where account_id = '38000000-0000-0000-0000-000000000004'
      and purpose = 'security_change'
      and consumed_at is not null
  ),
  'all-device sign-out consumes its single-use reauthentication grant'
);

select ok(
  exists(
    select 1
    from public.devices
    where account_id = '38000000-0000-0000-0000-000000000002'
      and id = '38000000-0000-0000-0000-000000000025'
      and revoked_at is null
  ),
  'all-device sign-out does not revoke an unrelated account device'
);

select is(
  (
    select count(*)::integer
    from public.audit_events
    where actor_account_id = '38000000-0000-0000-0000-000000000004'
      and event_type = 'account.auth_devices_signed_out'
      and correlation_id = '38000000-0000-0000-0000-000000000073'
      and metadata ->> 'scope' = 'all'
  ),
  1,
  'all-device sign-out and its exact retry emit one actor-scoped audit event'
);

select * from finish();
rollback;
