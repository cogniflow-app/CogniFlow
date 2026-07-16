begin;

select plan(13);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '39000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'session-owner@example.test', '', pg_catalog.now(),
    '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '39000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'session-attacker@example.test', '', pg_catalog.now(),
    '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now(), false
  );

update public.profiles
set display_name = case id
      when '39000000-0000-0000-0000-000000000001' then 'Session Owner'
      else 'Session Attacker'
    end,
    handle = case id
      when '39000000-0000-0000-0000-000000000001' then 'session_owner'
      else 'session_attacker'
    end,
    age_band = 'adult',
    account_status = 'active',
    onboarding_completed_at = pg_catalog.now()
where id in (
  '39000000-0000-0000-0000-000000000001',
  '39000000-0000-0000-0000-000000000002'
);

insert into auth.sessions (id, user_id, created_at, updated_at, not_after) values
  (
    '39000000-0000-0000-0000-000000000011',
    '39000000-0000-0000-0000-000000000001',
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '1 hour'
  ),
  (
    '39000000-0000-0000-0000-000000000012',
    '39000000-0000-0000-0000-000000000001',
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '1 hour'
  ),
  (
    '39000000-0000-0000-0000-000000000013',
    '39000000-0000-0000-0000-000000000002',
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '1 hour'
  );

set local role service_role;
select public.admin_register_request_device(
  '39000000-0000-0000-0000-000000000001',
  '39000000-0000-0000-0000-000000000011',
  '39000000-0000-0000-0000-000000000021',
  'Current browser', 'test'
);
select public.admin_register_request_device(
  '39000000-0000-0000-0000-000000000001',
  '39000000-0000-0000-0000-000000000012',
  '39000000-0000-0000-0000-000000000022',
  'Learner browser', 'test'
);
select public.admin_register_request_device(
  '39000000-0000-0000-0000-000000000002',
  '39000000-0000-0000-0000-000000000013',
  '39000000-0000-0000-0000-000000000023',
  'Attacker browser', 'test'
);
reset role;

insert into public.profile_sessions (
  id, account_id, auth_session_id, learner_profile_id, device_id, token_hash,
  expires_at, idempotency_key
) values
  (
    '39000000-0000-0000-0000-000000000031',
    '39000000-0000-0000-0000-000000000001',
    '39000000-0000-0000-0000-000000000012',
    (
      select id from public.learner_profiles
      where owner_account_id = '39000000-0000-0000-0000-000000000001' and kind = 'self'
    ),
    '39000000-0000-0000-0000-000000000022',
    pg_catalog.decode(pg_catalog.repeat('31', 32), 'hex'),
    pg_catalog.now() + interval '20 minutes',
    '39000000-0000-0000-0000-000000000041'
  ),
  (
    '39000000-0000-0000-0000-000000000032',
    '39000000-0000-0000-0000-000000000002',
    '39000000-0000-0000-0000-000000000013',
    (
      select id from public.learner_profiles
      where owner_account_id = '39000000-0000-0000-0000-000000000002' and kind = 'self'
    ),
    '39000000-0000-0000-0000-000000000023',
    pg_catalog.decode(pg_catalog.repeat('32', 32), 'hex'),
    pg_catalog.now() + interval '20 minutes',
    '39000000-0000-0000-0000-000000000042'
  );

select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.current_revoke_profile_session(uuid,bytea,uuid)',
    'execute'
  ),
  'authenticated owners receive the single-session revocation wrapper'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.current_revoke_profile_session(uuid,bytea,uuid)',
    'execute'
  ),
  'anonymous callers cannot revoke learner-profile sessions'
);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_revoke_profile_session(uuid,uuid,text,uuid)',
    'execute'
  ),
  'authenticated clients cannot invoke the actor-selecting implementation RPC'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '39000000-0000-0000-0000-000000000001';
set local "request.jwt.claims" =
  '{"sub":"39000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"39000000-0000-0000-0000-000000000011"}';

select throws_ok(
  $$
    select public.current_revoke_profile_session(
      '39000000-0000-0000-0000-000000000031',
      pg_catalog.decode(pg_catalog.repeat('aa', 32), 'hex'),
      '39000000-0000-0000-0000-000000000051'
    )
  $$,
  '28000',
  'recent reauthentication is required',
  'self context alone cannot revoke a profile session without fresh reauthentication'
);

reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

set local role service_role;
select lives_ok(
  $$
    select public.admin_issue_reauthentication_grant(
      '39000000-0000-0000-0000-000000000001',
      'security_change',
      pg_catalog.decode(pg_catalog.repeat('aa', 32), 'hex'),
      pg_catalog.now() + interval '5 minutes',
      '39000000-0000-0000-0000-000000000052'
    )
  $$,
  'the server can issue a short-lived proof for one session revocation'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '39000000-0000-0000-0000-000000000001';
set local "request.jwt.claims" =
  '{"sub":"39000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"39000000-0000-0000-0000-000000000011"}';

select throws_ok(
  $$
    select public.current_revoke_profile_session(
      '39000000-0000-0000-0000-000000000032',
      pg_catalog.decode(pg_catalog.repeat('aa', 32), 'hex'),
      '39000000-0000-0000-0000-000000000053'
    )
  $$,
  '42501',
  'profile session cannot be revoked',
  'an owner cannot revoke another account profile session'
);

select is(
  public.current_revoke_profile_session(
    '39000000-0000-0000-0000-000000000031',
    pg_catalog.decode(pg_catalog.repeat('aa', 32), 'hex'),
    '39000000-0000-0000-0000-000000000054'
  ),
  true,
  'fresh reauthentication revokes the selected owned profile session'
);

select throws_ok(
  $$
    select public.current_revoke_profile_session(
      '39000000-0000-0000-0000-000000000031',
      pg_catalog.decode(pg_catalog.repeat('aa', 32), 'hex'),
      '39000000-0000-0000-0000-000000000055'
    )
  $$,
  '28000',
  'recent reauthentication is required',
  'the same proof cannot revoke another session or authorize a new request'
);

reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

select ok(
  exists(
    select 1 from public.profile_sessions
    where id = '39000000-0000-0000-0000-000000000031'
      and revoked_at is not null
      and revoke_reason = 'revoked by account owner'
  ),
  'the target session records its revocation state and bounded reason'
);

select ok(
  exists(
    select 1 from public.profile_sessions
    where id = '39000000-0000-0000-0000-000000000032'
      and revoked_at is null
  ),
  'the unrelated account session remains active'
);

select ok(
  exists(
    select 1 from private.reauthentication_grants
    where account_id = '39000000-0000-0000-0000-000000000001'
      and purpose = 'security_change'
      and consumed_at is not null
  ),
  'successful revocation consumes the single-use reauthentication grant'
);

select is(
  (
    select count(*)::integer from public.audit_events
    where actor_account_id = '39000000-0000-0000-0000-000000000001'
      and event_type = 'learner.profile_session_revoked'
      and target_id = '39000000-0000-0000-0000-000000000031'
  ),
  1,
  'single-session revocation emits one owner-scoped audit fact'
);

select ok(
  not exists(
    select 1 from public.devices
    where id = '39000000-0000-0000-0000-000000000022'
      and revoked_at is not null
  ),
  'single-session revocation leaves the containing device active'
);

select * from finish();
rollback;
