begin;

select plan(40);

create temporary table child_authorization_fixture (
  name text primary key,
  id uuid not null
) on commit drop;
grant select on child_authorization_fixture to anon, authenticated, service_role;

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
    '71000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'child-proof-guardian@example.test',
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
    '71000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'child-proof-attacker@example.test',
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
    when '71000000-0000-0000-0000-000000000001' then 'Proof Guardian'
    else 'Proof Attacker'
  end,
  handle = case id
    when '71000000-0000-0000-0000-000000000001' then 'proof_guardian'
    else 'proof_attacker'
  end,
  age_band = 'adult',
  account_status = 'active',
  onboarding_completed_at = pg_catalog.now()
where id in (
  '71000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000002'
);

insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values
  (
    '72000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now() + interval '1 hour'
  ),
  (
    '72000000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000002',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now() + interval '1 hour'
  );

insert into public.devices (
  id,
  account_id,
  auth_session_id,
  display_name,
  platform,
  idempotency_key
) values
  (
    '73000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    '72000000-0000-0000-0000-000000000001',
    'Guardian test device',
    'pgTAP',
    '74000000-0000-0000-0000-000000000001'
  ),
  (
    '73000000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000002',
    '72000000-0000-0000-0000-000000000002',
    'Attacker test device',
    'pgTAP',
    '74000000-0000-0000-0000-000000000002'
  );

select has_table(
  'private',
  'child_creation_authorizations',
  'child creation proofs live in the non-exposed private schema'
);

select is(
  pg_catalog.to_regprocedure(
    'public.current_create_child_learner_configured(text,text,public.age_band,text,public.consent_type,text,jsonb,public.consent_verification_method,text,jsonb,uuid)'
  ),
  null,
  'the proofless authenticated child-creation signature is removed'
);

select ok(
  pg_catalog.to_regprocedure(
    'public.admin_issue_verified_child_creation_authorization(uuid,uuid,text,text,public.age_band,text,public.consent_type,text,jsonb,public.consent_verification_method,text,jsonb,bytea,timestamptz,uuid,uuid)'
  ) is not null,
  'the bounded verified child-authorization issuer exists'
);

select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_issue_verified_child_creation_authorization(uuid,uuid,text,text,public.age_band,text,public.consent_type,text,jsonb,public.consent_verification_method,text,jsonb,bytea,timestamptz,uuid,uuid)',
    'execute'
  ),
  'only trusted server code receives the verified issuer capability'
);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_issue_verified_child_creation_authorization(uuid,uuid,text,text,public.age_band,text,public.consent_type,text,jsonb,public.consent_verification_method,text,jsonb,bytea,timestamptz,uuid,uuid)',
    'execute'
  ),
  'authenticated callers cannot mint verified child-creation proofs'
);

select ok(
  not pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_issue_child_creation_authorization(uuid,uuid,text,text,public.age_band,text,public.consent_type,text,jsonb,public.consent_verification_method,text,jsonb,bytea,timestamptz,uuid,uuid)',
    'execute'
  ),
  'the unvalidated implementation issuer is not a service-role entry point'
);

select ok(
  not pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_create_child_learner(uuid,text,text,public.age_band,text,public.consent_type,text,jsonb,public.consent_verification_method,text,uuid)',
    'execute'
  ),
  'the service role cannot bypass proof consumption through the base child RPC'
);

select ok(
  not pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_create_child_learner_configured(uuid,text,text,public.age_band,text,public.consent_type,text,jsonb,public.consent_verification_method,text,jsonb,uuid)',
    'execute'
  ),
  'the service role cannot bypass proof consumption through the configured child RPC'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.current_create_child_learner_configured(text,text,public.age_band,text,public.consent_type,text,jsonb,public.consent_verification_method,text,jsonb,bytea,uuid)',
    'execute'
  ),
  'authenticated guardians receive only the proof-consuming child RPC'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.current_create_child_learner_configured(text,text,public.age_band,text,public.consent_type,text,jsonb,public.consent_verification_method,text,jsonb,bytea,uuid)',
    'execute'
  ),
  'anonymous callers cannot consume child-creation proofs'
);

select ok(
  not pg_catalog.has_table_privilege(
    'authenticated',
    'private.child_creation_authorizations',
    'select'
  ),
  'authenticated callers cannot inspect child-creation proof digests'
);

select ok(
  not pg_catalog.has_table_privilege(
    'service_role',
    'private.child_creation_authorizations',
    'select'
  ),
  'the service issuer cannot read the private proof ledger directly'
);

select ok(
  not pg_catalog.has_table_privilege(
    'service_role',
    'private.child_creation_authorizations',
    'delete'
  ),
  'the service role cannot erase child-creation authorization evidence'
);

set local role service_role;
select throws_ok(
  $$
    select public.admin_issue_verified_child_creation_authorization(
      '71000000-0000-0000-0000-000000000001',
      '72000000-0000-0000-0000-000000000001',
      'Cedar Learner',
      'Cedar Fox',
      'under_13',
      'cedar-01',
      'child_profile',
      'privacy-2026-07-phase-01',
      '{"age_band":"under_13","analytics":"minimized","child_profile":true,"public_content":false}'::jsonb,
      'not_verified',
      'local-test:0123456789abcdef0123456789abcdef01234567',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('31', 32), 'hex'),
      pg_catalog.now() + interval '5 minutes',
      '75000000-0000-0000-0000-000000000031',
      '76000000-0000-0000-0000-000000000031'
    )
  $$,
  '22023',
  'invalid verified child creation payload',
  'the issuer rejects a client-style unverified consent assertion'
);

select throws_ok(
  $$
    select public.admin_issue_verified_child_creation_authorization(
      '71000000-0000-0000-0000-000000000001',
      '72000000-0000-0000-0000-000000000001',
      'Cedar Learner',
      'Cedar Fox',
      'under_13',
      'cedar-01',
      'child_profile',
      'privacy-2026-07-phase-01',
      '{"age_band":"under_13","analytics":"full","child_profile":true,"public_content":false}'::jsonb,
      'local_test',
      'local-test:0123456789abcdef0123456789abcdef01234567',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('32', 32), 'hex'),
      pg_catalog.now() + interval '5 minutes',
      '75000000-0000-0000-0000-000000000032',
      '76000000-0000-0000-0000-000000000032'
    )
  $$,
  '22023',
  'invalid verified child creation payload',
  'the issuer rejects a consent scope that is not minimized'
);

select throws_ok(
  $$
    select public.admin_issue_verified_child_creation_authorization(
      '71000000-0000-0000-0000-000000000001',
      '72000000-0000-0000-0000-000000000001',
      'Cedar Learner',
      'Cedar Fox',
      'under_13',
      'cedar-01',
      'child_profile',
      'privacy-2026-07-phase-01',
      '{"age_band":"under_13","analytics":"minimized","child_profile":true,"public_content":false}'::jsonb,
      'local_test',
      'local-test:0123456789abcdef0123456789abcdef01234567',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":true,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('33', 32), 'hex'),
      pg_catalog.now() + interval '5 minutes',
      '75000000-0000-0000-0000-000000000033',
      '76000000-0000-0000-0000-000000000033'
    )
  $$,
  '22023',
  'invalid verified child creation payload',
  'the issuer rejects unsafe child social settings'
);

select throws_ok(
  $$
    select public.admin_issue_verified_child_creation_authorization(
      '71000000-0000-0000-0000-000000000001',
      '72000000-0000-0000-0000-000000000001',
      'Empty Settings Learner', 'Empty Owl', 'under_13', 'empty-01', 'child_profile',
      'privacy-2026-07-phase-01',
      '{"age_band":"under_13","analytics":"minimized","child_profile":true,"public_content":false}'::jsonb,
      'local_test', 'local-test:empty-settings-evidence-0123456789012345', '{}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('34', 32), 'hex'), pg_catalog.now() + interval '5 minutes',
      '75000000-0000-0000-0000-000000000034', '76000000-0000-0000-0000-000000000034'
    )
  $$,
  '22023',
  'invalid verified child creation payload',
  'the issuer rejects an empty settings object'
);

select throws_ok(
  $$
    select public.admin_issue_verified_child_creation_authorization(
      '71000000-0000-0000-0000-000000000001',
      '72000000-0000-0000-0000-000000000001',
      'Missing Key Learner', 'Missing Owl', 'under_13', 'missing-01', 'child_profile',
      'privacy-2026-07-phase-01',
      '{"age_band":"under_13","analytics":"minimized","child_profile":true,"public_content":false}'::jsonb,
      'local_test', 'local-test:missing-key-evidence-01234567890123456',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('35', 32), 'hex'), pg_catalog.now() + interval '5 minutes',
      '75000000-0000-0000-0000-000000000035', '76000000-0000-0000-0000-000000000035'
    )
  $$,
  '22023',
  'invalid verified child creation payload',
  'the issuer rejects settings with a missing required key'
);

select throws_ok(
  $$
    select public.admin_issue_verified_child_creation_authorization(
      '71000000-0000-0000-0000-000000000001',
      '72000000-0000-0000-0000-000000000001',
      'Null Setting Learner', 'Null Owl', 'under_13', 'null-01', 'child_profile',
      'privacy-2026-07-phase-01',
      '{"age_band":"under_13","analytics":"minimized","child_profile":true,"public_content":false}'::jsonb,
      'local_test', 'local-test:null-setting-evidence-0123456789012345',
      '{"analytics":null,"public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('36', 32), 'hex'), pg_catalog.now() + interval '5 minutes',
      '75000000-0000-0000-0000-000000000036', '76000000-0000-0000-0000-000000000036'
    )
  $$,
  '22023',
  'invalid verified child creation payload',
  'the issuer rejects JSON-null required settings'
);

select throws_ok(
  $$
    select public.admin_issue_verified_child_creation_authorization(
      '71000000-0000-0000-0000-000000000001',
      '72000000-0000-0000-0000-000000000001',
      'Wrong Type Learner', 'Type Owl', 'under_13', 'type-01', 'child_profile',
      'privacy-2026-07-phase-01',
      '{"age_band":"under_13","analytics":"minimized","child_profile":true,"public_content":false}'::jsonb,
      'local_test', 'local-test:wrong-type-evidence-01234567890123456',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":"yes","serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('37', 32), 'hex'), pg_catalog.now() + interval '5 minutes',
      '75000000-0000-0000-0000-000000000037', '76000000-0000-0000-0000-000000000037'
    )
  $$,
  '22023',
  'invalid verified child creation payload',
  'the issuer rejects a required setting with the wrong JSON type'
);

select throws_ok(
  $$
    select public.admin_issue_verified_child_creation_authorization(
      '71000000-0000-0000-0000-000000000001',
      '72000000-0000-0000-0000-000000000001',
      'Extra Key Learner', 'Extra Owl', 'under_13', 'extra-01', 'child_profile',
      'privacy-2026-07-phase-01',
      '{"age_band":"under_13","analytics":"minimized","child_profile":true,"public_content":false}'::jsonb,
      'local_test', 'local-test:extra-key-evidence-012345678901234567',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system","tracking":true}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('38', 32), 'hex'), pg_catalog.now() + interval '5 minutes',
      '75000000-0000-0000-0000-000000000038', '76000000-0000-0000-0000-000000000038'
    )
  $$,
  '22023',
  'invalid verified child creation payload',
  'the issuer rejects unrecognized settings keys'
);

select lives_ok(
  $$
    select public.admin_issue_verified_child_creation_authorization(
      '71000000-0000-0000-0000-000000000001',
      '72000000-0000-0000-0000-000000000001',
      'Cedar Learner',
      'Cedar Fox',
      'under_13',
      'cedar-01',
      'child_profile',
      'privacy-2026-07-phase-01',
      '{"age_band":"under_13","analytics":"minimized","child_profile":true,"public_content":false}'::jsonb,
      'local_test',
      'local-test:0123456789abcdef0123456789abcdef01234567',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex'),
      pg_catalog.now() + interval '5 minutes',
      '75000000-0000-0000-0000-000000000001',
      '76000000-0000-0000-0000-000000000001'
    )
  $$,
  'trusted server verification issues the primary session-bound proof'
);

select lives_ok(
  $$
    select public.admin_issue_verified_child_creation_authorization(
      '71000000-0000-0000-0000-000000000001',
      '72000000-0000-0000-0000-000000000001',
      'Maple Learner',
      'Maple Owl',
      'teen',
      'maple-01',
      'child_profile',
      'privacy-2026-07-phase-01',
      '{"age_band":"teen","analytics":"minimized","child_profile":true,"public_content":false}'::jsonb,
      'local_test',
      'local-test:fedcba9876543210fedcba9876543210fedcba98',
      '{"analytics":"essential_only","public_content":false,"reading_style":"increased_spacing","reduced_motion":false,"serious_mode":true,"social_interactions":false,"theme":"dark"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('22', 32), 'hex'),
      pg_catalog.now() + interval '5 minutes',
      '75000000-0000-0000-0000-000000000002',
      '76000000-0000-0000-0000-000000000002'
    )
  $$,
  'a separate verified request receives an independent proof'
);
reset role;

select ok(
  (
    select pg_catalog.octet_length(proof_hash) = 32
      and pg_catalog.octet_length(payload_hash) = 32
      and proof_hash <> payload_hash
    from private.child_creation_authorizations
    where proof_hash = pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex')
  ),
  'the ledger stores only independent fixed-length proof and payload digests'
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"72000000-0000-0000-0000-000000000001"}';
select throws_ok(
  $$
    select public.current_create_child_learner_configured(
      'Forged Learner',
      'Forged Fox',
      'under_13',
      'forged-01',
      'child_profile',
      'privacy-2026-07-phase-01',
      '{"age_band":"under_13","analytics":"minimized","child_profile":true,"public_content":false}'::jsonb,
      'verified_external',
      'provider-evidence-forged',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('99', 32), 'hex'),
      '75000000-0000-0000-0000-000000000099'
    )
  $$,
  '42501',
  'child creation authorization is unavailable',
  'a direct authenticated caller cannot forge verified consent and a proof'
);
reset role;
reset "request.jwt.claims";

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"71000000-0000-0000-0000-000000000002","role":"authenticated","session_id":"72000000-0000-0000-0000-000000000002"}';
select throws_ok(
  $$
    select public.current_create_child_learner_configured(
      'Cedar Learner',
      'Cedar Fox',
      'under_13',
      'cedar-01',
      'child_profile',
      'privacy-2026-07-phase-01',
      '{"age_band":"under_13","analytics":"minimized","child_profile":true,"public_content":false}'::jsonb,
      'local_test',
      'local-test:0123456789abcdef0123456789abcdef01234567',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex'),
      '75000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  'child creation authorization is unavailable',
  'a proof is bound to the guardian account and cannot be consumed by another account'
);
reset role;
reset "request.jwt.claims";

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"72000000-0000-0000-0000-000000000001"}';
select throws_ok(
  $$
    select public.current_create_child_learner_configured(
      'Cedar Learner',
      'Cedar Fox',
      'under_13',
      'cedar-01',
      'child_profile',
      'privacy-2026-07-phase-01',
      '{"age_band":"under_13","analytics":"minimized","child_profile":true,"public_content":false}'::jsonb,
      'local_test',
      'local-test:0123456789abcdef0123456789abcdef01234567',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('98', 32), 'hex'),
      '75000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  'child creation authorization is unavailable',
  'a tampered bearer-proof digest is rejected'
);

select throws_ok(
  $$
    select public.current_create_child_learner_configured(
      'Cedar Learner',
      'Changed Fox',
      'under_13',
      'cedar-01',
      'child_profile',
      'privacy-2026-07-phase-01',
      '{"age_band":"under_13","analytics":"minimized","child_profile":true,"public_content":false}'::jsonb,
      'local_test',
      'local-test:0123456789abcdef0123456789abcdef01234567',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex'),
      '75000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  'child creation authorization is unavailable',
  'a proof cannot authorize a payload changed after verification'
);

select lives_ok(
  $$
    select public.current_create_child_learner_configured(
      'Cedar Learner',
      'Cedar Fox',
      'under_13',
      'cedar-01',
      'child_profile',
      'privacy-2026-07-phase-01',
      '{"age_band":"under_13","analytics":"minimized","child_profile":true,"public_content":false}'::jsonb,
      'local_test',
      'local-test:0123456789abcdef0123456789abcdef01234567',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex'),
      '75000000-0000-0000-0000-000000000001'
    )
  $$,
  'the bound guardian session consumes its matching verified proof'
);
reset role;
reset "request.jwt.claims";

insert into child_authorization_fixture (name, id)
select 'child', learner_profile_id
from public.guardian_relationships
where guardian_account_id = '71000000-0000-0000-0000-000000000001'
  and idempotency_key = '75000000-0000-0000-0000-000000000001';

select is(
  (
    select settings
    from public.learner_profiles
    where id = (select id from child_authorization_fixture where name = 'child')
  ),
  '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
  'proof consumption persists only the bounded child-safe learner settings'
);

select ok(
  exists(
    select 1
    from public.consent_records
    where learner_profile_id = (select id from child_authorization_fixture where name = 'child')
      and guardian_account_id = '71000000-0000-0000-0000-000000000001'
      and consent_type = 'child_profile'
      and action = 'granted'
      and verification_method = 'local_test'
      and evidence_reference = 'local-test:0123456789abcdef0123456789abcdef01234567'
      and scope = '{"age_band":"under_13","analytics":"minimized","child_profile":true,"public_content":false}'::jsonb
  ),
  'the created learner receives the exact verified, minimized consent record'
);

select ok(
  exists(
    select 1
    from public.guardian_relationships
    where learner_profile_id = (select id from child_authorization_fixture where name = 'child')
      and guardian_account_id = '71000000-0000-0000-0000-000000000001'
      and status = 'active'
      and activated_at is not null
  ),
  'proof consumption establishes the active guardian relationship atomically'
);

select ok(
  (
    select proof_hash is null
      and consumed_at is not null
      and consumed_learner_profile_id = (
        select id from child_authorization_fixture where name = 'child'
      )
      and consumption_idempotency_key = '75000000-0000-0000-0000-000000000001'
    from private.child_creation_authorizations
    where issue_idempotency_key = '76000000-0000-0000-0000-000000000001'
  ),
  'consumption clears the bearer digest and links the proof to exactly one child learner'
);

select is(
  (
    select count(*)::integer
    from public.audit_events
    where actor_account_id = '71000000-0000-0000-0000-000000000001'
      and event_type in (
        'learner.child_creation_authorization_issued',
        'learner.child_creation_authorization_consumed'
      )
      and correlation_id in (
        '75000000-0000-0000-0000-000000000001',
        '76000000-0000-0000-0000-000000000001'
      )
      and metadata = '{}'::jsonb
      and metadata::text not like '%local-test:%'
      and metadata::text not like '%11111111%'
  ),
  2,
  'issuance and consumption are audited without raw proof or consent evidence metadata'
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"72000000-0000-0000-0000-000000000001"}';
select is(
  public.current_create_child_learner_configured(
    'Cedar Learner',
    'Cedar Fox',
    'under_13',
    'cedar-01',
    'child_profile',
    'privacy-2026-07-phase-01',
    '{"age_band":"under_13","analytics":"minimized","child_profile":true,"public_content":false}'::jsonb,
    'local_test',
    'local-test:0123456789abcdef0123456789abcdef01234567',
    '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
    pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex'),
    '75000000-0000-0000-0000-000000000001'
  ),
  (select id from child_authorization_fixture where name = 'child'),
  'an exact creation replay returns the original learner after proof consumption'
);

select throws_ok(
  $$
    select public.current_create_child_learner_configured(
      'Cedar Learner',
      'Replay Changed',
      'under_13',
      'cedar-01',
      'child_profile',
      'privacy-2026-07-phase-01',
      '{"age_band":"under_13","analytics":"minimized","child_profile":true,"public_content":false}'::jsonb,
      'local_test',
      'local-test:0123456789abcdef0123456789abcdef01234567',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex'),
      '75000000-0000-0000-0000-000000000001'
    )
  $$,
  '22023',
  'child creation replay does not match',
  'an idempotency replay cannot substitute a different payload'
);

select throws_ok(
  $$
    select public.current_create_child_learner_configured(
      'Second Learner',
      'Second Fox',
      'under_13',
      'second-01',
      'child_profile',
      'privacy-2026-07-phase-01',
      '{"age_band":"under_13","analytics":"minimized","child_profile":true,"public_content":false}'::jsonb,
      'local_test',
      'local-test:0123456789abcdef0123456789abcdef01234567',
      '{"analytics":"essential_only","public_content":false,"reading_style":"standard","reduced_motion":true,"serious_mode":true,"social_interactions":false,"theme":"system"}'::jsonb,
      pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex'),
      '75000000-0000-0000-0000-000000000003'
    )
  $$,
  '42501',
  'child creation authorization is unavailable',
  'a consumed proof cannot authorize a second learner or idempotency key'
);
reset role;
reset "request.jwt.claims";

select throws_ok(
  $$
    update private.child_creation_authorizations
    set account_id = '71000000-0000-0000-0000-000000000002'
    where proof_hash = pg_catalog.decode(pg_catalog.repeat('22', 32), 'hex')
  $$,
  '55000',
  'authorization finalization is invalid',
  'an active proof ledger identity cannot be rewritten'
);

select throws_ok(
  $$
    update private.child_creation_authorizations
    set expires_at = expires_at + interval '1 minute'
    where consumption_idempotency_key = '75000000-0000-0000-0000-000000000001'
  $$,
  '55000',
  'authorization is already finalized',
  'a consumed proof ledger row is immutable'
);

set local role service_role;
select throws_ok(
  $$
    delete from private.child_creation_authorizations
    where proof_hash = pg_catalog.decode(pg_catalog.repeat('22', 32), 'hex')
  $$,
  '42501',
  null,
  'the service role cannot delete active authorization evidence'
);
reset role;

select * from finish();
rollback;
