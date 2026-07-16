begin;

select plan(72);

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
    '30000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'guardian-rpc@example.test',
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
    '30000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'attacker-rpc@example.test',
    '',
    pg_catalog.now(),
    '{}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now(),
    false
  );

update public.profiles set
  display_name = case id
    when '30000000-0000-0000-0000-000000000001' then 'Guardian RPC'
    else 'Attacker RPC'
  end,
  handle = case id
    when '30000000-0000-0000-0000-000000000001' then 'guardian_rpc'
    else 'attacker_rpc'
  end,
  age_band = 'adult',
  account_status = 'active',
  onboarding_completed_at = pg_catalog.now()
where id in (
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002'
);
update public.learner_profiles as learner set
  display_name = profile.display_name,
  age_band = profile.age_band
from public.profiles as profile
where learner.owner_account_id = profile.id and learner.kind = 'self';

set local role postgres;
select lives_ok(
  $$
    select public.admin_create_child_learner(
      '30000000-0000-0000-0000-000000000001',
      'Cedar Learner',
      'Cedar Fox',
      'under_13',
      'cedar-01',
      'child_profile',
      'local-test-v1',
      '{"analytics":false}'::jsonb,
      'local_test',
      'local-test-only',
      '40000000-0000-0000-0000-000000000001'
    )
  $$,
  'database-owner fixture creates the child through the implementation RPC'
);
reset role;

insert into fixture_ids (name, id)
select 'child', learner_profile_id
from public.guardian_relationships
where guardian_account_id = '30000000-0000-0000-0000-000000000001';
insert into fixture_ids (name, id)
select 'consent', id
from public.consent_records
where learner_profile_id = (select id from fixture_ids where name = 'child')
  and action = 'granted';

set local role service_role;
select lives_ok(
  $$
    select public.admin_register_device(
      '30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000020',
      '30000000-0000-0000-0000-000000000010',
      'Guardian tablet',
      'test',
      '40000000-0000-0000-0000-000000000013'
    );
    select public.admin_register_device(
      '30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000020',
      '30000000-0000-0000-0000-000000000010',
      'Guardian tablet',
      'test',
      '40000000-0000-0000-0000-000000000013'
    );
  $$,
  'first and idempotent replay device registration both succeed'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.audit_events
    where event_type = 'account.device_registered'
      and actor_account_id = '30000000-0000-0000-0000-000000000001'
      and target_type = 'device'
      and target_id = '30000000-0000-0000-0000-000000000010'
      and correlation_id = '40000000-0000-0000-0000-000000000013'
  ),
  1,
  'device registration emits one correctly attributed audit event across replay'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '30000000-0000-0000-0000-000000000001';
select throws_ok(
  $$
    select public.admin_set_learner_profile_credentials(
      auth.uid(),
      (select id from fixture_ids where name = 'child'),
      '749281',
      'ABCD-EFGH-JKLM-NPQR',
      '40000000-0000-0000-0000-000000000002'
    )
  $$,
  '42501',
  null,
  'authenticated guardians cannot call the service-only credential RPC directly'
);
select throws_ok(
  $$select * from private.learner_profile_credentials$$,
  '42501',
  null,
  'authenticated users cannot read private PIN or family-code hashes'
);
reset role;

set local role service_role;
select lives_ok(
  $$
    select public.admin_set_learner_profile_credentials(
      '30000000-0000-0000-0000-000000000001',
      (select id from fixture_ids where name = 'child'),
      '749281',
      'ABCD-EFGH-JKLM-NPQR',
      '40000000-0000-0000-0000-000000000002'
    )
  $$,
  'the service can store strongly hashed child profile credentials'
);
reset role;

select ok(
  (
    select pin_hash from private.learner_profile_credentials
    where learner_profile_id = (select id from fixture_ids where name = 'child')
  ) like '$2a$12$%',
  'PINs are stored as cost-12 bcrypt hashes'
);

select is(
  (
    select pg_catalog.octet_length(family_code_hash)
    from private.learner_profile_credentials
    where learner_profile_id = (select id from fixture_ids where name = 'child')
  ),
  60,
  'new family codes are stored only as slow salted digests'
);

set local role service_role;
select is(
  (
    select count(*)::integer
    from public.admin_verify_learner_profile_credentials(
      (select id from fixture_ids where name = 'child'),
      'ABCDEFGHJKLMNPQR',
      '000000',
      pg_catalog.decode(pg_catalog.repeat('10', 32), 'hex')
    )
  ),
  0,
  'an invalid PIN returns no identity context'
);

select is(
  (
    select owner_account_id
    from public.admin_verify_learner_profile_credentials(
      (select id from fixture_ids where name = 'child'),
      'ABCD-EFGH-JKLM-NPQR',
      '749281',
      pg_catalog.decode(pg_catalog.repeat('10', 32), 'hex')
    )
  ),
  '30000000-0000-0000-0000-000000000001'::uuid,
  'valid family-code and PIN credentials resolve without an auth JWT'
);

select lives_ok(
  $$
    select * from public.admin_create_profile_session_with_credentials(
      '30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000020',
      (select id from fixture_ids where name = 'child'),
      'ABCD-EFGH-JKLM-NPQR',
      '749281',
      pg_catalog.decode(pg_catalog.repeat('10', 32), 'hex'),
      '30000000-0000-0000-0000-000000000010',
      pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex'),
      pg_catalog.now() + interval '20 minutes',
      '40000000-0000-0000-0000-000000000003'
    )
  $$,
  'valid credentials create a short-lived profile session'
);
reset role;

insert into fixture_ids (name, id)
select 'profile_session', id
from public.profile_sessions
where token_hash = pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex');

select is(
  (
    select count(*)::integer from public.profile_sessions
    where learner_profile_id = (select id from fixture_ids where name = 'child')
  ),
  1,
  'profile-session creation persists exactly one hashed session row'
);

set local role service_role;
select is(
  (
    select profile_session_id
    from public.admin_create_profile_session_with_credentials(
      '30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000020',
      (select id from fixture_ids where name = 'child'),
      'ABCD-EFGH-JKLM-NPQR',
      '749281',
      pg_catalog.decode(pg_catalog.repeat('10', 32), 'hex'),
      '30000000-0000-0000-0000-000000000010',
      pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex'),
      (
        select expires_at
        from public.admin_get_managed_profile_session_context(
          '30000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000020',
          '30000000-0000-0000-0000-000000000010',
          pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex')
        )
      ),
      '40000000-0000-0000-0000-000000000003'
    )
  ),
  (select id from fixture_ids where name = 'profile_session'),
  'profile-session creation returns the original row on idempotent replay'
);

select throws_ok(
  $$
    select * from public.admin_create_profile_session_with_credentials(
      '30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000020',
      (select id from fixture_ids where name = 'child'),
      'ABCD-EFGH-JKLM-NPQR',
      '749281',
      pg_catalog.decode(pg_catalog.repeat('10', 32), 'hex'),
      '30000000-0000-0000-0000-000000000010',
      pg_catalog.decode(pg_catalog.repeat('19', 32), 'hex'),
      (
        select expires_at
        from public.admin_get_managed_profile_session_context(
          '30000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000020',
          '30000000-0000-0000-0000-000000000010',
          pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex')
        )
      ),
      '40000000-0000-0000-0000-000000000003'
    )
  $$,
  '22023',
  'profile session replay does not match',
  'profile-session idempotency rejects a replay with a different token'
);

select throws_ok(
  $$
    select * from public.admin_create_profile_session(
      '30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000099',
      (select id from fixture_ids where name = 'child'),
      '30000000-0000-0000-0000-000000000010',
      pg_catalog.decode(pg_catalog.repeat('18', 32), 'hex'),
      pg_catalog.now() + interval '10 minutes',
      '40000000-0000-0000-0000-000000000018'
    )
  $$,
  '42501',
  'device is unavailable',
  'profile-session creation rejects a device bound to another Auth session'
);

select lives_ok(
  $$
    do $block$
    begin
      for attempt in 1..6 loop
        perform * from public.admin_create_profile_session_with_credentials(
          '30000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000020',
          (select id from fixture_ids where name = 'child'),
          'ABCD-EFGH-JKLM-NPQR',
          '000000',
          pg_catalog.decode(pg_catalog.repeat('14', 32), 'hex'),
          '30000000-0000-0000-0000-000000000010',
          pg_catalog.decode(pg_catalog.repeat('15', 32), 'hex'),
          pg_catalog.now() + interval '10 minutes',
          '40000000-0000-0000-0000-000000000015'
        );
      end loop;
    end
    $block$
  $$,
  'invalid PIN attempts return a neutral empty result so their counters commit'
);
reset role;

select is(
  (
    select request_count
    from private.rate_limit_buckets
    where scope = 'profile_pin_subject:' || (select id::text from fixture_ids where name = 'child')
      and subject_hash = pg_catalog.decode(pg_catalog.repeat('14', 32), 'hex')
  ),
  6,
  'invalid PIN attempts persist in the database-backed subject bucket'
);

set local role service_role;
select is(
  (
    select count(*)::integer
    from public.admin_create_profile_session_with_credentials(
      '30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000020',
      (select id from fixture_ids where name = 'child'),
      'ABCD-EFGH-JKLM-NPQR',
      '749281',
      pg_catalog.decode(pg_catalog.repeat('14', 32), 'hex'),
      '30000000-0000-0000-0000-000000000010',
      pg_catalog.decode(pg_catalog.repeat('16', 32), 'hex'),
      pg_catalog.now() + interval '10 minutes',
      '40000000-0000-0000-0000-000000000016'
    )
  ),
  0,
  'a correct PIN remains denied after the subject bucket is rate limited'
);

select is(
  (
    select profile_session_id
    from public.admin_resolve_profile_session(
      pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex')
    )
  ),
  (select id from fixture_ids where name = 'profile_session'),
  'a valid profile token resolves to the safe active identity context'
);

select throws_ok(
  $$
    select * from public.admin_create_profile_session(
      '30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000020',
      (select id from fixture_ids where name = 'child'),
      '30000000-0000-0000-0000-000000000010',
      pg_catalog.decode(pg_catalog.repeat('12', 32), 'hex'),
      pg_catalog.now() + interval '31 minutes',
      '40000000-0000-0000-0000-000000000004'
    )
  $$,
  '22023',
  'invalid profile session',
  'profile sessions cannot exceed the configured 30-minute maximum'
);

select is(
  public.admin_revoke_profile_session(
    '30000000-0000-0000-0000-000000000001',
    (select id from fixture_ids where name = 'profile_session'),
    'guardian exit',
    '40000000-0000-0000-0000-000000000005'
  ),
  true,
  'guardian exit revokes the active profile session by safe ID'
);

select is(
  (
    select count(*)::integer
    from public.admin_resolve_profile_session(
      pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex')
    )
  ),
  0,
  'a revoked profile session can no longer resolve'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '30000000-0000-0000-0000-000000000001';
select throws_ok(
  $$
    select * from public.admin_resolve_profile_session(
      pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex')
    )
  $$,
  '42501',
  null,
  'authenticated clients cannot use the service-only identity resolver'
);
reset role;

set local role service_role;
select lives_ok(
  $$
    select public.admin_register_device(
      '30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000021',
      '30000000-0000-0000-0000-000000000011',
      'Expired managed browser',
      'test',
      '40000000-0000-0000-0000-000000000021'
    );
    select public.admin_register_device(
      '30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000022',
      '30000000-0000-0000-0000-000000000012',
      'Revocable browser',
      'test',
      '40000000-0000-0000-0000-000000000023'
    );
  $$,
  'service setup binds managed and ordinary devices to distinct Auth sessions'
);
reset role;

insert into public.profile_sessions (
  account_id,
  auth_session_id,
  learner_profile_id,
  device_id,
  token_hash,
  created_at,
  expires_at,
  idempotency_key
) values (
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000021',
  (select id from fixture_ids where name = 'child'),
  '30000000-0000-0000-0000-000000000011',
  pg_catalog.decode(pg_catalog.repeat('21', 32), 'hex'),
  pg_catalog.now() - interval '2 hours',
  pg_catalog.now() - interval '1 hour',
  '40000000-0000-0000-0000-000000000022'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"30000000-0000-0000-0000-000000000021"}';
select is(
  (select count(*)::integer from public.profiles),
  0,
  'an expired managed study window still locks account-private profile data'
);
select is(
  (
    select count(*)::integer
    from public.learner_profiles
    where id = (select id from fixture_ids where name = 'child')
  ),
  1,
  'an expired managed study window exposes only its exact learner context'
);
select is(
  (select count(*)::integer from public.profile_sessions),
  0,
  'a managed learner cannot inspect account profile-session records'
);
select throws_ok(
  $$
    select public.current_guardian_exit_managed_session(
      pg_catalog.decode(pg_catalog.repeat('22', 32), 'hex'),
      '40000000-0000-0000-0000-000000000024'
    )
  $$,
  '28000',
  'recent reauthentication is required',
  'guardian exit rejects an unverified proof while the managed lock remains active'
);
reset role;

set local role service_role;
select lives_ok(
  $$
    select public.admin_issue_reauthentication_grant(
      '30000000-0000-0000-0000-000000000001',
      'security_change',
      pg_catalog.decode(pg_catalog.repeat('22', 32), 'hex'),
      pg_catalog.now() + interval '5 minutes',
      '40000000-0000-0000-0000-000000000025'
    )
  $$,
  'guardian exit receives a short-lived security-change proof after reauthentication'
);
reset role;

set local role authenticated;
select is(
  public.current_guardian_exit_managed_session(
    pg_catalog.decode(pg_catalog.repeat('22', 32), 'hex'),
    '40000000-0000-0000-0000-000000000026'
  ),
  true,
  'the JWT-bound guardian exit consumes the proof and revokes managed mode'
);
select is(
  (select count(*)::integer from public.profiles),
  1,
  'account-private profile data becomes readable only after guardian exit'
);
reset role;
reset "request.jwt.claims";

select ok(
  exists(
    select 1
    from public.profile_sessions
    where auth_session_id = '30000000-0000-0000-0000-000000000021'
      and revoked_at is not null
      and revoke_reason = 'guardian exit'
  ),
  'guardian exit records a durable revocation on the managed profile session'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"30000000-0000-0000-0000-000000000022"}';
select is(
  public.current_sign_out_devices(
    'current',
    '40000000-0000-0000-0000-000000000027'
  ),
  true,
  'current-device sign-out atomically revokes the JWT-bound application session'
);
select is(
  (select count(*)::integer from public.profiles),
  0,
  'a revoked device session is denied even while its Auth JWT remains valid'
);
reset role;
reset "request.jwt.claims";

set local role service_role;
select results_eq(
  $$
    select allowed, remaining
    from public.admin_consume_rate_limit(
      'test.rate',
      pg_catalog.decode(pg_catalog.repeat('20', 32), 'hex'),
      2,
      900,
      '2026-07-15 12:00:00+00'::timestamptz
    )
  $$,
  $$values (true, 1)$$,
  'the first fixed-window request is allowed with one remaining'
);
select results_eq(
  $$
    select allowed, remaining
    from public.admin_consume_rate_limit(
      'test.rate',
      pg_catalog.decode(pg_catalog.repeat('20', 32), 'hex'),
      2,
      900,
      '2026-07-15 12:00:01+00'::timestamptz
    )
  $$,
  $$values (true, 0)$$,
  'the final allowed fixed-window request reaches zero remaining'
);
select results_eq(
  $$
    select allowed, remaining, retry_after_seconds > 0
    from public.admin_consume_rate_limit(
      'test.rate',
      pg_catalog.decode(pg_catalog.repeat('20', 32), 'hex'),
      2,
      900,
      '2026-07-15 12:00:02+00'::timestamptz
    )
  $$,
  $$values (false, 0, true)$$,
  'excess fixed-window requests are denied with a retry delay'
);
reset role;

select throws_ok(
  $$
    update public.consent_records set reason = 'rewrite'
    where id = (select id from fixture_ids where name = 'consent')
  $$,
  '55000',
  'consent_records is append-only',
  'even a privileged direct update cannot rewrite consent history'
);

select throws_ok(
  $$
    delete from public.consent_records
    where id = (select id from fixture_ids where name = 'consent')
  $$,
  '55000',
  'consent_records is append-only',
  'even a privileged direct delete cannot erase consent history'
);

set local role service_role;
select lives_ok(
  $$
    select public.admin_revoke_consent(
      '30000000-0000-0000-0000-000000000001',
      (select id from fixture_ids where name = 'consent'),
      'test revocation',
      '40000000-0000-0000-0000-000000000006'
    )
  $$,
  'consent is revoked by an append-only compensating row'
);
reset role;

insert into fixture_ids (name, id)
select 'revocation', id from public.consent_records
where prior_consent_record_id = (select id from fixture_ids where name = 'consent');

select is(
  (
    select count(*)::integer from public.consent_records
    where learner_profile_id = (select id from fixture_ids where name = 'child')
  ),
  2,
  'the original consent and compensating revocation both remain'
);

set local role service_role;
select is(
  public.admin_revoke_consent(
    '30000000-0000-0000-0000-000000000001',
    (select id from fixture_ids where name = 'consent'),
    'test revocation',
    '40000000-0000-0000-0000-000000000006'
  ),
  (select id from fixture_ids where name = 'revocation'),
  'consent revocation returns the original result on idempotent replay'
);
reset role;

set local role service_role;
select lives_ok(
  $$
    select * from public.admin_create_guest_session(
      'fixture-room-alpha',
      'Bright Otter',
      pg_catalog.decode(pg_catalog.repeat('31', 32), 'hex'),
      pg_catalog.now() + interval '2 hours',
      pg_catalog.decode(pg_catalog.repeat('30', 32), 'hex'),
      '40000000-0000-0000-0000-000000000007'
    )
  $$,
  'the service can create a pseudonymous guest after room-adapter validation'
);
reset role;

insert into fixture_ids (name, id)
select 'guest', id from public.guest_sessions
where idempotency_key = '40000000-0000-0000-0000-000000000007';

set local role service_role;
select is(
  (
    select guest_session_id from public.admin_create_guest_session(
      'fixture-room-alpha',
      'Bright Otter',
      pg_catalog.decode(pg_catalog.repeat('31', 32), 'hex'),
      pg_catalog.now() + interval '2 hours',
      pg_catalog.decode(pg_catalog.repeat('30', 32), 'hex'),
      '40000000-0000-0000-0000-000000000007'
    )
  ),
  (select id from fixture_ids where name = 'guest'),
  'guest creation returns the original session on idempotent replay'
);
reset role;

set local role anon;
select throws_ok(
  $$select * from public.guest_sessions$$,
  '42501',
  null,
  'anonymous guests cannot enumerate issued guest rows'
);
select is(
  (
    select count(*)::integer from public.redeem_guest_session(
      pg_catalog.decode(pg_catalog.repeat('32', 32), 'hex')
    )
  ),
  0,
  'an incorrect reconnect token reveals no guest session'
);
select is(
  (
    select guest_session_id from public.redeem_guest_session(
      pg_catalog.decode(pg_catalog.repeat('31', 32), 'hex')
    )
  ),
  (select id from fixture_ids where name = 'guest'),
  'the correct reconnect token redeems only its guest session'
);
reset role;

set local role service_role;
select is(
  public.admin_purge_expired_guest_sessions(pg_catalog.now() + interval '3 hours'),
  1::bigint,
  'the retention job purges an expired guest identity'
);
reset role;

set local role anon;
select is(
  (
    select count(*)::integer from public.redeem_guest_session(
      pg_catalog.decode(pg_catalog.repeat('31', 32), 'hex')
    )
  ),
  0,
  'purged guest credentials cannot reconnect'
);
reset role;

set local role service_role;
select is(
  public.admin_request_data_export(
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000008'
  ),
  public.admin_request_data_export(
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000008'
  ),
  'the server export adapter remains idempotent after client RPC hardening'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '30000000-0000-0000-0000-000000000001';
select is(
  (select count(*)::integer from public.data_export_jobs),
  1,
  'the owner sees the real queued export job'
);
select throws_ok(
  $$
    select public.admin_request_account_deletion(
      '30000000-0000-0000-0000-000000000001',
      pg_catalog.decode(pg_catalog.repeat('41', 32), 'hex'),
      17,
      '40000000-0000-0000-0000-000000000009'
    )
  $$,
  '42501',
  null,
  'authenticated clients cannot call the server-only deletion request RPC'
);
reset role;

set local role service_role;
select throws_ok(
  $$
    select public.admin_request_account_deletion(
      '30000000-0000-0000-0000-000000000001',
      pg_catalog.decode(pg_catalog.repeat('41', 32), 'hex'),
      17,
      '40000000-0000-0000-0000-000000000009'
    )
  $$,
  '28000',
  'recent reauthentication is required',
  'account deletion rejects an unverified proof even from the trusted route'
);
select lives_ok(
  $$
    select public.admin_issue_reauthentication_grant(
      '30000000-0000-0000-0000-000000000001',
      'account_deletion',
      pg_catalog.decode(pg_catalog.repeat('41', 32), 'hex'),
      pg_catalog.now() + interval '5 minutes',
      '40000000-0000-0000-0000-000000000010'
    )
  $$,
  'the service can issue a short-lived proof after real reauthentication'
);
reset role;

set local role service_role;
select throws_ok(
  $$
    select public.admin_request_account_deletion(
      '30000000-0000-0000-0000-000000000001',
      pg_catalog.decode(pg_catalog.repeat('41', 32), 'hex'),
      0,
      '40000000-0000-0000-0000-000000000009'
    )
  $$,
  '22023',
  'deletion grace period must be between 1 and 90 days',
  'the deletion grace period is bounded before proof consumption'
);
select lives_ok(
  $$
    select public.admin_request_account_deletion(
      '30000000-0000-0000-0000-000000000001',
      pg_catalog.decode(pg_catalog.repeat('41', 32), 'hex'),
      17,
      '40000000-0000-0000-0000-000000000009'
    )
  $$,
  'a verified destructive request creates a deletion job'
);
reset role;

insert into fixture_ids (name, id)
select 'deletion_job', id from public.deletion_jobs
where account_id = '30000000-0000-0000-0000-000000000001';

select is(
  (
    select account_status from public.profiles
    where id = '30000000-0000-0000-0000-000000000001'
  ),
  'pending_deletion'::public.account_status,
  'a deletion request moves the account into a pending-deletion state'
);

select ok(
  (
    select execute_after between requested_at + interval '16 days' and requested_at + interval '18 days'
    from public.deletion_jobs where id = (select id from fixture_ids where name = 'deletion_job')
  ),
  'deletion uses the server-configured 17-day grace period'
);

set local role service_role;
select is(
  public.admin_request_account_deletion(
    '30000000-0000-0000-0000-000000000001',
    pg_catalog.decode(pg_catalog.repeat('41', 32), 'hex'),
    17,
    '40000000-0000-0000-0000-000000000009'
  ),
  (select id from fixture_ids where name = 'deletion_job'),
  'deletion replay returns the original job after the proof is consumed'
);
reset role;

set local role service_role;
select lives_ok(
  $$
    select public.admin_issue_reauthentication_grant(
      '30000000-0000-0000-0000-000000000001',
      'account_deletion',
      pg_catalog.decode(pg_catalog.repeat('42', 32), 'hex'),
      pg_catalog.now() + interval '5 minutes',
      '40000000-0000-0000-0000-000000000011'
    )
  $$,
  'cancellation receives its own short-lived destructive-action proof'
);
reset role;

update public.deletion_jobs
set
  requested_at = pg_catalog.now() - interval '2 days',
  execute_after = pg_catalog.now() - interval '1 second'
where id = (select id from fixture_ids where name = 'deletion_job');
set local role service_role;
select throws_ok(
  $$
    select public.admin_cancel_account_deletion(
      '30000000-0000-0000-0000-000000000001',
      (select id from fixture_ids where name = 'deletion_job'),
      pg_catalog.decode(pg_catalog.repeat('42', 32), 'hex'),
      '40000000-0000-0000-0000-000000000012'
    )
  $$,
  '42501',
  'deletion request cannot be cancelled',
  'cancellation is refused once the grace period has elapsed'
);
reset role;
update public.deletion_jobs
set execute_after = pg_catalog.now() + interval '17 days'
where id = (select id from fixture_ids where name = 'deletion_job');
set local role service_role;
select is(
  public.admin_cancel_account_deletion(
    '30000000-0000-0000-0000-000000000001',
    (select id from fixture_ids where name = 'deletion_job'),
    pg_catalog.decode(pg_catalog.repeat('42', 32), 'hex'),
    '40000000-0000-0000-0000-000000000013'
  ),
  true,
  'the trusted route can cancel during grace after reauthentication'
);
reset role;

select is(
  (
    select status from public.deletion_jobs
    where id = (select id from fixture_ids where name = 'deletion_job')
  ),
  'cancelled'::public.request_status,
  'cancellation records a real cancelled job state'
);

select is(
  (
    select account_status from public.profiles
    where id = '30000000-0000-0000-0000-000000000001'
  ),
  'active'::public.account_status,
  'cancelling deletion restores the active account state'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '30000000-0000-0000-0000-000000000002';
select is(
  (select count(*)::integer from public.deletion_jobs),
  0,
  'an unrelated account cannot see another deletion job'
);
select throws_ok(
  $$
    select public.admin_cancel_account_deletion(
      '30000000-0000-0000-0000-000000000002',
      (select id from fixture_ids where name = 'deletion_job'),
      pg_catalog.decode(pg_catalog.repeat('42', 32), 'hex'),
      '40000000-0000-0000-0000-000000000014'
    )
  $$,
  '42501',
  null,
  'an authenticated attacker cannot invoke the service-only cancellation RPC'
);
select throws_ok(
  $$
    insert into public.audit_events (
      actor_type, event_type, target_type, correlation_id
    ) values (
      'account', 'security.forged', 'profile', extensions.gen_random_uuid()
    )
  $$,
  '42501',
  null,
  'authenticated clients cannot forge audit events'
);
reset role;

set local role service_role;
select lives_ok(
  $$
      select public.admin_record_audit_event(
        'account',
        '30000000-0000-0000-0000-000000000001',
        null,
        null,
        'security.shared_correlation',
        'profile',
        '30000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000030',
        '{}'::jsonb
      );
      select public.admin_record_audit_event(
        'account',
        '30000000-0000-0000-0000-000000000002',
        null,
        null,
        'security.shared_correlation',
        'profile',
        '30000000-0000-0000-0000-000000000002',
        '40000000-0000-0000-0000-000000000030',
        '{}'::jsonb
      );
  $$,
  'audit idempotency is actor-scoped when two accounts reuse one correlation ID'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.audit_events
    where event_type = 'security.shared_correlation'
      and correlation_id = '40000000-0000-0000-0000-000000000030'
  ),
  2,
  'actor-scoped audit idempotency retains both accounts as distinct events'
);

set local role service_role;
select throws_ok(
  $$
    select public.admin_record_audit_event(
      'account',
      '30000000-0000-0000-0000-000000000001',
      null,
      null,
      'security.shared_correlation',
      'profile',
      '30000000-0000-0000-0000-000000000099',
      '40000000-0000-0000-0000-000000000030',
      '{}'::jsonb
    )
  $$,
  '22023',
  'audit idempotency replay does not match',
  'an actor cannot replay an audit correlation against a different target'
);
reset role;

select throws_ok(
  $$update public.audit_events set metadata = '{"forged":true}'::jsonb$$,
  '55000',
  'audit_events is append-only',
  'even privileged direct updates cannot rewrite audit history'
);

select ok(
  (select count(*) > 0 from public.audit_events),
  'sensitive identity mutations emitted audit events'
);

select * from finish();
rollback;
