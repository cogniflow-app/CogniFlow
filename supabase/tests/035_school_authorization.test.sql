begin;

select plan(52);

create temporary table school_authorization_fixture (
  name text primary key,
  id uuid,
  expires_at timestamptz
) on commit drop;
grant select on school_authorization_fixture to anon, authenticated, service_role;

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
    '50000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'school-actor@example.test',
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
    '50000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'school-owner@example.test',
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
    '50000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'school-attacker@example.test',
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
    when '50000000-0000-0000-0000-000000000001' then 'School actor'
    when '50000000-0000-0000-0000-000000000002' then 'School owner'
    else 'School attacker'
  end,
  handle = case id
    when '50000000-0000-0000-0000-000000000001' then 'school_actor'
    when '50000000-0000-0000-0000-000000000002' then 'school_owner'
    else 'school_attacker'
  end,
  age_band = 'adult',
  account_status = 'active',
  onboarding_completed_at = pg_catalog.now()
where id in (
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000002',
  '50000000-0000-0000-0000-000000000003'
);

insert into school_authorization_fixture (name, expires_at)
values ('primary_expiry', pg_catalog.now() + interval '10 minutes');

select has_table(
  'private',
  'school_authorization_proofs',
  'school authorization proofs live in the non-exposed private schema'
);

select is(
  pg_catalog.to_regprocedure(
    'public.admin_create_school_managed_learner(uuid,uuid,text,text,public.age_band,text,jsonb,uuid)'
  ),
  null,
  'the teach-only school profile RPC signature is removed'
);

select ok(
  pg_catalog.to_regprocedure(
    'public.admin_issue_school_authorization(uuid,uuid,bytea,bytea,timestamptz,uuid)'
  ) is not null,
  'the service-owned school authorization issuance RPC exists'
);

select ok(
  pg_catalog.to_regprocedure(
    'public.admin_create_school_managed_learner(uuid,uuid,text,text,public.age_band,text,jsonb,bytea,uuid)'
  ) is not null,
  'school profile creation requires the authorization proof argument'
);

select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_issue_school_authorization(uuid,uuid,bytea,bytea,timestamptz,uuid)',
    'execute'
  ),
  'only trusted server code can issue a school authorization proof'
);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_issue_school_authorization(uuid,uuid,bytea,bytea,timestamptz,uuid)',
    'execute'
  ),
  'authenticated accounts cannot issue their own school authorization proof'
);

select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_create_school_managed_learner(uuid,uuid,text,text,public.age_band,text,jsonb,bytea,uuid)',
    'execute'
  ),
  'the trusted server may consume a school authorization proof'
);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_create_school_managed_learner(uuid,uuid,text,text,public.age_band,text,jsonb,bytea,uuid)',
    'execute'
  ),
  'authenticated accounts cannot call school profile creation directly'
);

select ok(
  not pg_catalog.has_table_privilege(
    'authenticated',
    'private.school_authorization_proofs',
    'select'
  ),
  'authenticated accounts cannot inspect proof digests'
);

select ok(
  not pg_catalog.has_table_privilege(
    'service_role',
    'private.school_authorization_proofs',
    'select'
  ),
  'the service role uses the bounded RPCs instead of direct proof-table access'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'school_authorization_proofs'
      and data_type in ('text', 'character varying', 'character')
  ),
  1,
  'the proof ledger stores only the bounded revocation reason as text, never raw provider evidence or school identity'
);

select ok(
  private.has_account_capability(
    '50000000-0000-0000-0000-000000000001',
    'teach'
  ),
  'the fixture actor has the ordinary default teach capability'
);

set local role service_role;
select throws_ok(
  $$
    select public.admin_create_school_managed_learner(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      'Adult Learner',
      'Adult Star',
      'adult',
      'adult-01',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('31', 32), 'hex'),
      '71000000-0000-0000-0000-000000000001'
    )
  $$,
  '22023',
  'invalid school-managed profile fields',
  'school-managed creation rejects the adult age band'
);
select throws_ok(
  $$
    select public.admin_create_school_managed_learner(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      'Unknown Learner',
      'Unknown Star',
      'unknown',
      'unknown-01',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('31', 32), 'hex'),
      '71000000-0000-0000-0000-000000000002'
    )
  $$,
  '22023',
  'invalid school-managed profile fields',
  'school-managed creation rejects an unknown age band'
);
select throws_ok(
  $$
    select public.admin_create_school_managed_learner(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      'Empty Settings',
      'Empty Star',
      'teen',
      'empty-01',
      '{}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('31', 32), 'hex'),
      '71000000-0000-0000-0000-000000000003'
    )
  $$,
  '22023',
  'invalid school-managed profile settings',
  'school-managed creation rejects an empty settings object'
);
select throws_ok(
  $$
    select public.admin_create_school_managed_learner(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      'Missing Settings',
      'Missing Star',
      'teen',
      'missing-01',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('31', 32), 'hex'),
      '71000000-0000-0000-0000-000000000004'
    )
  $$,
  '22023',
  'invalid school-managed profile settings',
  'school-managed creation rejects a settings object with a missing required key'
);
select throws_ok(
  $$
    select public.admin_create_school_managed_learner(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      'Null Settings',
      'Null Star',
      'teen',
      'null-01',
      null::jsonb,
      pg_catalog.decode(pg_catalog.repeat('31', 32), 'hex'),
      '71000000-0000-0000-0000-000000000005'
    )
  $$,
  '22023',
  'invalid school-managed profile settings',
  'school-managed creation rejects null settings'
);
select throws_ok(
  $$
    select public.admin_create_school_managed_learner(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      'Null Value',
      'Null Value Star',
      'teen',
      'null-value-01',
      '{"analytics":null,"public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('31', 32), 'hex'),
      '71000000-0000-0000-0000-000000000006'
    )
  $$,
  '22023',
  'invalid school-managed profile settings',
  'school-managed creation rejects a JSON-null required setting'
);
select throws_ok(
  $$
    select public.admin_create_school_managed_learner(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      'Wrong Type',
      'Wrong Type Star',
      'teen',
      'wrong-type-01',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":"yes","serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('31', 32), 'hex'),
      '71000000-0000-0000-0000-000000000007'
    )
  $$,
  '22023',
  'invalid school-managed profile settings',
  'school-managed creation rejects a mistyped setting'
);
select throws_ok(
  $$
    select public.admin_create_school_managed_learner(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      'Extra Setting',
      'Extra Star',
      'teen',
      'extra-01',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system","tracking":true}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('31', 32), 'hex'),
      '71000000-0000-0000-0000-000000000008'
    )
  $$,
  '22023',
  'invalid school-managed profile settings',
  'school-managed creation rejects an unexpected settings key'
);
select throws_ok(
  $$
    select public.admin_create_school_managed_learner(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      'Unsafe Setting',
      'Unsafe Star',
      'teen',
      'unsafe-01',
      '{"analytics":"essential_only","public_content":true,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('31', 32), 'hex'),
      '71000000-0000-0000-0000-000000000009'
    )
  $$,
  '22023',
  'invalid school-managed profile settings',
  'school-managed creation rejects unsafe public-content settings'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-0000-0000-000000000001';
select throws_ok(
  $$
    select public.admin_issue_school_authorization(
      auth.uid(),
      '50000000-0000-0000-0000-000000000002',
      pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex'),
      pg_catalog.decode(pg_catalog.repeat('21', 32), 'hex'),
      pg_catalog.now() + interval '10 minutes',
      '60000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  null,
  'a default-teach authenticated account cannot mint a school authorization'
);
select throws_ok(
  $$
    select public.admin_create_school_managed_learner(
      auth.uid(),
      '50000000-0000-0000-0000-000000000002',
      'North Learner',
      'North Star',
      'teen',
      'north-01',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex'),
      '70000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  null,
  'a default-teach authenticated account cannot create a school profile'
);
reset role;

set local role service_role;
select throws_ok(
  $$
    select public.admin_create_school_managed_learner(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      'North Learner',
      'North Star',
      'teen',
      'north-01',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex'),
      '70000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  'school authorization proof is unavailable',
  'the service cannot substitute the default teach capability for a proof'
);

select throws_ok(
  $$
    select public.admin_issue_school_authorization(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      pg_catalog.decode(pg_catalog.repeat('12', 32), 'hex'),
      pg_catalog.decode(pg_catalog.repeat('22', 32), 'hex'),
      pg_catalog.now() + interval '16 minutes',
      '60000000-0000-0000-0000-000000000002'
    )
  $$,
  '22023',
  'invalid school authorization proof',
  'the service cannot issue a proof beyond the fifteen-minute ceiling'
);

select lives_ok(
  $$
    select public.admin_issue_school_authorization(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex'),
      pg_catalog.decode(pg_catalog.repeat('21', 32), 'hex'),
      (select expires_at from school_authorization_fixture where name = 'primary_expiry'),
      '60000000-0000-0000-0000-000000000001'
    )
  $$,
  'the service records a bounded proof after upstream authorization'
);
reset role;

insert into school_authorization_fixture (name, id)
select 'primary_authorization', id
from private.school_authorization_proofs
where proof_hash = pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex');

set local role service_role;
select is(
  public.admin_issue_school_authorization(
    '50000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002',
    pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex'),
    pg_catalog.decode(pg_catalog.repeat('21', 32), 'hex'),
    (select expires_at from school_authorization_fixture where name = 'primary_expiry'),
    '60000000-0000-0000-0000-000000000001'
  ),
  (select id from school_authorization_fixture where name = 'primary_authorization'),
  'issuing the same proof is idempotent when every bound field matches'
);
reset role;

select is(
  (
    select count(*)::integer
    from private.school_authorization_proofs
    where issue_idempotency_key = '60000000-0000-0000-0000-000000000001'
  ),
  1,
  'an issuance replay does not duplicate the proof ledger'
);

select is(
  (
    select count(*)::integer
    from public.audit_events
    where event_type = 'learner.school_authorization_issued'
      and correlation_id = '60000000-0000-0000-0000-000000000001'
  ),
  1,
  'proof issuance emits one auditable event across replay'
);

set local role service_role;
select lives_ok(
  $$
    select public.admin_create_school_managed_learner(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      'North Learner',
      'North Star',
      'teen',
      'north-01',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex'),
      '70000000-0000-0000-0000-000000000001'
    )
  $$,
  'the service creates a school learner by consuming its matching proof'
);
reset role;

insert into school_authorization_fixture (name, id)
select 'school_learner', id
from public.learner_profiles
where kind = 'school_managed'
  and owner_account_id = '50000000-0000-0000-0000-000000000002';

select is(
  (
    select kind
    from public.learner_profiles
    where id = (select id from school_authorization_fixture where name = 'school_learner')
  ),
  'school_managed'::public.learner_profile_kind,
  'proof consumption creates only the intended school-managed learner kind'
);

select is(
  (
    select settings
    from public.learner_profiles
    where id = (select id from school_authorization_fixture where name = 'school_learner')
  ),
  '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
  'school-managed creation persists only the canonical privacy-safe settings object'
);

select is(
  (
    select role
    from public.learner_profile_access
    where learner_profile_id = (
      select id from school_authorization_fixture where name = 'school_learner'
    )
      and account_id = '50000000-0000-0000-0000-000000000002'
      and revoked_at is null
  ),
  'school_admin'::public.learner_access_role,
  'the authorized owner receives explicit school-admin access'
);

select is(
  (
    select consumed_learner_profile_id
    from private.school_authorization_proofs
    where id = (select id from school_authorization_fixture where name = 'primary_authorization')
  ),
  (select id from school_authorization_fixture where name = 'school_learner'),
  'proof consumption is atomically linked to the created learner'
);

select ok(
  exists(
    select 1
    from public.audit_events
    where event_type = 'learner.school_profile_created'
      and target_id = (select id from school_authorization_fixture where name = 'school_learner')
      and metadata ? 'authorization_proof_id'
      and not (metadata ? 'evidence_reference')
      and not (metadata ? 'proof_hash')
  ),
  'school creation is auditable without copying proof or evidence material into the audit log'
);

set local role service_role;
select is(
  public.admin_create_school_managed_learner(
    '50000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002',
    'North Learner',
    'North Star',
    'teen',
    'north-01',
    '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
    pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex'),
    '70000000-0000-0000-0000-000000000001'
  ),
  (select id from school_authorization_fixture where name = 'school_learner'),
  'an exact creation retry returns the original learner after proof consumption'
);

select throws_ok(
  $$
    select public.admin_create_school_managed_learner(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      'Second Learner',
      'Second Star',
      'teen',
      'north-02',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex'),
      '70000000-0000-0000-0000-000000000002'
    )
  $$,
  '42501',
  'school authorization proof is unavailable',
  'a consumed proof cannot authorize a second learner'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.learner_profiles
    where kind = 'school_managed'
      and owner_account_id = '50000000-0000-0000-0000-000000000002'
  ),
  1,
  'proof replay never duplicates a school-managed learner'
);

set local role service_role;
select lives_ok(
  $$
    select public.admin_issue_school_authorization(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      pg_catalog.decode(pg_catalog.repeat('13', 32), 'hex'),
      pg_catalog.decode(pg_catalog.repeat('23', 32), 'hex'),
      pg_catalog.now() + interval '10 minutes',
      '60000000-0000-0000-0000-000000000003'
    )
  $$,
  'a second independently evidenced proof can be issued'
);

select throws_ok(
  $$
    select public.admin_create_school_managed_learner(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000003',
      'Wrong Owner',
      'Wrong Star',
      'teen',
      'wrong-01',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('13', 32), 'hex'),
      '70000000-0000-0000-0000-000000000003'
    )
  $$,
  '42501',
  'school authorization proof is unavailable',
  'a proof cannot be retargeted to a different owner account'
);
reset role;

select throws_ok(
  $$
    update private.school_authorization_proofs
    set
      proof_hash = null,
      revoked_at = pg_catalog.now(),
      revocation_reason = 'account_deletion'
    where proof_hash = pg_catalog.decode(pg_catalog.repeat('13', 32), 'hex')
  $$,
  '55000',
  'account deletion proof revocation requires the deletion worker',
  'ordinary privileged code cannot impersonate the account deletion worker'
);

select lives_ok(
  $$
    select pg_catalog.set_config(
      'lumen.account_deletion_subject',
      '50000000-0000-0000-0000-000000000002',
      true
    );
    update private.school_authorization_proofs
    set
      proof_hash = null,
      revoked_at = pg_catalog.now(),
      revocation_reason = 'account_deletion'
    where proof_hash = pg_catalog.decode(pg_catalog.repeat('13', 32), 'hex');
  $$,
  'the account deletion worker can revoke an unconsumed proof bound to the deleted account'
);

select ok(
  exists(
    select 1
    from private.school_authorization_proofs
    where issue_idempotency_key = '60000000-0000-0000-0000-000000000003'
      and proof_hash is null
      and revoked_at is not null
      and revocation_reason = 'account_deletion'
  ),
  'account deletion clears the remaining bearer digest but preserves an opaque audit state'
);

insert into private.school_authorization_proofs (
  actor_account_id,
  owner_account_id,
  proof_hash,
  evidence_reference_hash,
  issued_at,
  expires_at,
  issue_idempotency_key
) values (
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000002',
  pg_catalog.decode(pg_catalog.repeat('14', 32), 'hex'),
  pg_catalog.decode(pg_catalog.repeat('24', 32), 'hex'),
  pg_catalog.now() - interval '10 minutes',
  pg_catalog.now() - interval '1 minute',
  '60000000-0000-0000-0000-000000000004'
);

set local role service_role;
select throws_ok(
  $$
    select public.admin_create_school_managed_learner(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      'Expired Learner',
      'Expired Star',
      'teen',
      'expired-01',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('14', 32), 'hex'),
      '70000000-0000-0000-0000-000000000004'
    )
  $$,
  '42501',
  'school authorization proof is unavailable',
  'an expired proof cannot create a school-managed learner'
);
reset role;

select throws_ok(
  $$
    update private.school_authorization_proofs
    set expires_at = expires_at + interval '1 minute'
    where id = (select id from school_authorization_fixture where name = 'primary_authorization')
  $$,
  '55000',
  'school authorization proof identity is immutable',
  'even privileged code cannot extend a proof after issuance'
);

select throws_ok(
  $$
    delete from private.school_authorization_proofs
    where id = (select id from school_authorization_fixture where name = 'primary_authorization')
  $$,
  '55000',
  'school authorization proofs cannot be deleted',
  'proof history cannot be erased'
);

set local role service_role;
select lives_ok(
  $$
    select public.admin_issue_school_authorization(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      pg_catalog.decode(pg_catalog.repeat('15', 32), 'hex'),
      pg_catalog.decode(pg_catalog.repeat('25', 32), 'hex'),
      pg_catalog.now() + interval '10 minutes',
      '60000000-0000-0000-0000-000000000005'
    )
  $$,
  'a final proof is issued before the actor capability is revoked'
);
reset role;

update public.account_capabilities
set revoked_at = pg_catalog.now()
where account_id = '50000000-0000-0000-0000-000000000001'
  and capability = 'teach';

set local role service_role;
select throws_ok(
  $$
    select public.admin_create_school_managed_learner(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      'Revoked Learner',
      'Revoked Star',
      'teen',
      'revoked-01',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('15', 32), 'hex'),
      '70000000-0000-0000-0000-000000000005'
    )
  $$,
  '42501',
  'school-managed profile is not authorized',
  'a proof cannot outlive revocation of the actor teach capability'
);
reset role;

update public.account_capabilities
set revoked_at = null
where account_id = '50000000-0000-0000-0000-000000000001'
  and capability = 'teach';

set local role service_role;
select lives_ok(
  $$
    select public.admin_issue_school_authorization(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      pg_catalog.decode(pg_catalog.repeat('16', 32), 'hex'),
      pg_catalog.decode(pg_catalog.repeat('26', 32), 'hex'),
      pg_catalog.now() + interval '10 minutes',
      '60000000-0000-0000-0000-000000000006'
    );
    select public.admin_create_school_managed_learner(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      'South Learner',
      'South Star',
      'under_13',
      'south-01',
      '{"analytics":"essential_only","public_content":false,"reading_style":"increased_spacing","reduced_motion":false,"serious_mode":false,"social_interactions":false,"theme":"dark"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('16', 32), 'hex'),
      '70000000-0000-0000-0000-000000000006'
    );
  $$,
  'a canonical under-13 school learner can consume an independently issued proof'
);
reset role;

select ok(
  exists(
    select 1
    from public.learner_profiles
    where kind = 'school_managed'
      and owner_account_id = '50000000-0000-0000-0000-000000000002'
      and display_name = 'South Learner'
      and age_band = 'under_13'
      and settings = '{"analytics":"essential_only","public_content":false,"reading_style":"increased_spacing","reduced_motion":false,"serious_mode":false,"social_interactions":false,"theme":"dark"}'::jsonb
  ),
  'under-13 school creation preserves typed appearance preferences inside the safe schema'
);

set local role service_role;
select throws_ok(
  $$
    select public.admin_issue_school_authorization(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000003',
      pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex'),
      pg_catalog.decode(pg_catalog.repeat('21', 32), 'hex'),
      (select expires_at from school_authorization_fixture where name = 'primary_expiry'),
      '60000000-0000-0000-0000-000000000001'
    )
  $$,
  '22023',
  'school authorization replay does not match',
  'issuance idempotency cannot be replayed with a different owner binding'
);
reset role;

select ok(
  (
    select proof_hash is null
      and pg_catalog.octet_length(evidence_reference_hash) = 32
    from private.school_authorization_proofs
    where id = (select id from school_authorization_fixture where name = 'primary_authorization')
  ),
  'consumption clears the bearer proof digest and retains only the evidence digest'
);

select * from finish();
rollback;
