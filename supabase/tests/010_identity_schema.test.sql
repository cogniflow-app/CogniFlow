begin;

select plan(55);

select is(
  (
    select count(*)::integer
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
      and table_name = any(array[
        'profiles',
        'privacy_preferences',
        'account_capabilities',
        'learner_profiles',
        'learner_profile_access',
        'guardian_relationships',
        'consent_records',
        'devices',
        'profile_sessions',
        'privacy_requests',
        'data_export_jobs',
        'deletion_jobs',
        'audit_events',
        'guest_sessions'
      ])
  ),
  14,
  'all public identity and privacy tables exist'
);

select is(
  (
    select count(*)::integer
    from information_schema.tables
    where table_schema = 'private'
      and table_name = any(array[
        'child_creation_authorizations',
        'onboarding_authorizations',
        'rate_limit_buckets',
        'reauthentication_grants',
        'learner_profile_credentials'
      ])
  ),
  5,
  'proof, credential, reauthentication, and rate-limit state stays private'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_type as type
    join pg_catalog.pg_namespace as namespace on namespace.oid = type.typnamespace
    where namespace.nspname = 'public'
      and type.typtype = 'e'
      and type.typname = any(array[
        'age_band',
        'account_status',
        'theme_preference',
        'account_capability',
        'learner_profile_kind',
        'learner_profile_status',
        'learner_access_role',
        'learner_permission',
        'guardian_relationship_status',
        'consent_type',
        'consent_action',
        'consent_verification_method',
        'privacy_request_type',
        'request_status',
        'guest_session_status',
        'audit_actor_type',
        'reauthentication_purpose'
      ])
  ),
  17,
  'closed identity states use constrained enums'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any(array[
        'profiles',
        'privacy_preferences',
        'account_capabilities',
        'learner_profiles',
        'learner_profile_access',
        'guardian_relationships',
        'consent_records',
        'devices',
        'profile_sessions',
        'privacy_requests',
        'data_export_jobs',
        'deletion_jobs',
        'audit_events',
        'guest_sessions'
      ])
      and relation.relrowsecurity
  ),
  14,
  'RLS is enabled on every exposed table'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policy as policy
    join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and policy.polcmd <> 'r'
  ),
  0,
  'no exposed table permits a direct policy mutation'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policy as policy
    join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
  ),
  12,
  'only explicit safe read policies exist'
);

select ok(
  not pg_catalog.has_schema_privilege('anon', 'private', 'usage'),
  'anonymous cannot use the private schema'
);

select ok(
  not pg_catalog.has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated cannot use the private schema'
);

select ok(
  not pg_catalog.has_schema_privilege('public', 'private', 'usage'),
  'PUBLIC cannot use the private schema'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = any(array[
        'ensure_current_account',
        'complete_current_account_onboarding',
        'update_current_profile',
        'update_current_privacy_preferences',
        'admin_create_child_learner',
        'admin_create_school_managed_learner',
        'admin_grant_learner_access',
        'admin_revoke_learner_access',
        'admin_update_learner_profile',
        'get_observed_learner_profiles',
        'admin_register_device',
        'admin_revoke_device',
        'admin_set_learner_profile_credentials',
        'admin_verify_learner_profile_credentials',
        'admin_create_profile_session',
        'admin_create_profile_session_with_credentials',
        'admin_resolve_profile_session',
        'admin_revoke_profile_session',
        'admin_record_consent',
        'admin_revoke_consent',
        'admin_issue_reauthentication_grant',
        'request_data_export',
        'admin_request_account_deletion',
        'admin_cancel_account_deletion',
        'admin_consume_rate_limit',
        'admin_create_guest_session',
        'redeem_guest_session',
        'admin_purge_expired_guest_sessions',
        'admin_record_audit_event'
      ])
  ),
  29,
  'the complete identity RPC surface exists'
);

select ok(
  not exists(
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname like 'admin_%'
      and not procedure.prosecdef
  ),
  'all administrative RPCs are security definer functions'
);

select ok(
  not exists(
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and procedure.proname = any(array[
        'ensure_current_account',
        'complete_current_account_onboarding',
        'update_current_profile',
        'update_current_privacy_preferences',
        'admin_create_child_learner',
        'admin_create_school_managed_learner',
        'admin_grant_learner_access',
        'admin_revoke_learner_access',
        'admin_update_learner_profile',
        'get_observed_learner_profiles',
        'admin_register_device',
        'admin_revoke_device',
        'admin_set_learner_profile_credentials',
        'admin_verify_learner_profile_credentials',
        'admin_create_profile_session',
        'admin_create_profile_session_with_credentials',
        'admin_resolve_profile_session',
        'admin_revoke_profile_session',
        'admin_record_consent',
        'admin_revoke_consent',
        'admin_issue_reauthentication_grant',
        'request_data_export',
        'admin_request_account_deletion',
        'admin_cancel_account_deletion',
        'admin_consume_rate_limit',
        'admin_create_guest_session',
        'redeem_guest_session',
        'admin_purge_expired_guest_sessions',
        'admin_record_audit_event',
        'provision_account',
        'ensure_self_learner_profile',
        'can_access_learner_profile',
        'has_account_capability',
        'write_audit_event',
        'consume_rate_limit',
        'verify_learner_profile_credentials'
      ])
      and not (
        pg_catalog.array_to_string(procedure.proconfig, ',') like 'search_path=%'
      )
  ),
  'every privileged identity function fixes an empty search path'
);

select ok(
  not pg_catalog.has_table_privilege('anon', 'public.profiles', 'select'),
  'anonymous visitors cannot enumerate account profiles'
);

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'insert'),
  'authenticated users cannot insert profiles directly'
);

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'update'),
  'authenticated users cannot update profiles directly'
);

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'delete'),
  'authenticated users cannot delete profiles directly'
);

select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'select'),
  'authenticated users receive RLS-scoped profile reads'
);

select ok(
  not pg_catalog.has_table_privilege('service_role', 'public.profiles', 'select'),
  'the service role uses narrow administrative RPCs instead of broad identity-table reads'
);

select ok(
  not pg_catalog.has_column_privilege(
    'authenticated',
    'public.profile_sessions',
    'token_hash',
    'select'
  ),
  'profile-session hashes cannot be selected by authenticated clients'
);

select ok(
  pg_catalog.has_column_privilege(
    'authenticated',
    'public.profile_sessions',
    'id',
    'select'
  ),
  'profile-session summaries expose a safe identifier'
);

select ok(
  not pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_create_child_learner(uuid,text,text,public.age_band,text,public.consent_type,text,jsonb,public.consent_verification_method,text,uuid)',
    'execute'
  ),
  'service callers cannot bypass the verified child-creation proof boundary'
);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_create_child_learner(uuid,text,text,public.age_band,text,public.consent_type,text,jsonb,public.consent_verification_method,text,uuid)',
    'execute'
  ),
  'authenticated clients cannot bypass the child-profile deployment gate'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.admin_create_child_learner(uuid,text,text,public.age_band,text,public.consent_type,text,jsonb,public.consent_verification_method,text,uuid)',
    'execute'
  ),
  'anonymous clients cannot create child profiles'
);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.complete_current_account_onboarding(text,text,text,text,smallint,public.age_band,text[],public.theme_preference,boolean,boolean,text,uuid)',
    'execute'
  ),
  'the legacy onboarding RPC cannot bypass the JWT-bound self-context wrapper'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.current_complete_account_onboarding(text,text,text,text,smallint,public.age_band,text[],public.theme_preference,boolean,boolean,text,bytea,uuid)',
    'execute'
  ),
  'authenticated users receive only the proof-bearing JWT-bound onboarding wrapper'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.current_guardian_exit_managed_session(bytea,uuid)',
    'execute'
  ),
  'authenticated guardians can exit a JWT-bound managed session through reauthentication'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.current_guardian_exit_managed_session(bytea,uuid)',
    'execute'
  ),
  'anonymous callers cannot invoke the guardian-exit wrapper'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.current_sign_out_devices(text,uuid)',
    'execute'
  ),
  'authenticated accounts can close application device sessions during sign-out'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.current_sign_out_devices(text,uuid)',
    'execute'
  ),
  'anonymous callers cannot revoke account device sessions'
);

select ok(
  not exists(
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname like 'current\_%' escape '\'
      and pg_catalog.array_to_string(procedure.proconfig, ',') not like 'search_path=%'
  ),
  'all JWT-bound current-context wrappers fix their search path'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.complete_current_account_onboarding(text,text,text,text,smallint,public.age_band,text[],public.theme_preference,boolean,boolean,text,uuid)',
    'execute'
  ),
  'anonymous visitors cannot invoke onboarding'
);

select ok(
  pg_catalog.has_function_privilege('anon', 'public.redeem_guest_session(bytea)', 'execute'),
  'anonymous guests can redeem only an opaque issued guest token'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.redeem_guest_session(bytea)',
    'execute'
  ),
  'authenticated callers can reconnect a guest session during conversion flows'
);

select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_consume_rate_limit(text,bytea,integer,integer,timestamptz)',
    'execute'
  ),
  'service routes can consume shared database-backed rate limits'
);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_consume_rate_limit(text,bytea,integer,integer,timestamptz)',
    'execute'
  ),
  'clients cannot consume or inspect arbitrary rate-limit buckets'
);

select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_request_account_deletion(uuid,bytea,integer,uuid)',
    'execute'
  ),
  'service routes can request deletion with a bounded configured grace period'
);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_request_account_deletion(uuid,bytea,integer,uuid)',
    'execute'
  ),
  'clients cannot choose their own deletion grace period or actor account'
);

select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_cancel_account_deletion(uuid,uuid,bytea,uuid)',
    'execute'
  ),
  'service routes can cancel deletion only through the reauthentication boundary'
);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_cancel_account_deletion(uuid,uuid,bytea,uuid)',
    'execute'
  ),
  'authenticated clients cannot bypass server reauthentication to cancel deletion'
);

select is(
  pg_catalog.to_regprocedure('public.cancel_account_deletion(uuid,uuid)'),
  null,
  'the client-callable deletion cancellation RPC is removed'
);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_resolve_profile_session(bytea)',
    'execute'
  ),
  'clients cannot resolve arbitrary profile-session hashes'
);

select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_resolve_profile_session(bytea)',
    'execute'
  ),
  'the server can resolve a profile session into a safe identity context'
);

select ok(
  exists(
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public' and indexname = 'learner_profile_access_account_active_idx'
  ),
  'learner access policy account lookups are indexed'
);

select ok(
  exists(
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public' and indexname = 'guardian_relationships_guardian_status_idx'
  ),
  'guardian policy lookups are indexed'
);

select ok(
  exists(
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public' and indexname = 'profile_sessions_account_active_idx'
  ),
  'profile-session owner lookups are indexed'
);

select ok(
  exists(
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public' and indexname = 'guest_sessions_expiry_idx'
  ),
  'guest expiry cleanup is indexed'
);

select is(
  (
    select count(*)::integer from information_schema.columns
    where table_schema = 'public'
      and table_name in ('profiles', 'learner_profiles')
      and column_name in ('birthday', 'birth_date', 'date_of_birth')
  ),
  0,
  'identity tables store age bands rather than exact birth dates'
);

select is(
  (
    select count(*)::integer from information_schema.columns
    where table_schema = 'public'
      and table_name = 'guest_sessions'
      and column_name in ('email', 'phone', 'ip_address', 'fingerprint')
  ),
  0,
  'guest records contain no email or invasive persistent identifier'
);

select col_type_is(
  'public',
  'profile_sessions',
  'token_hash',
  'bytea',
  'profile session token identifiers are binary hashes'
);

select col_type_is(
  'public',
  'guest_sessions',
  'reconnect_token_hash',
  'bytea',
  'guest reconnect token identifiers are binary hashes'
);

select is(
  (
    select count(*)::integer from information_schema.columns
    where table_schema = 'public'
      and table_name = 'consent_records'
      and column_name in ('updated_at', 'revoked_at')
  ),
  0,
  'consent revocation cannot be modeled as an in-place history rewrite'
);

select ok(
  exists(
    select 1 from pg_catalog.pg_trigger
    where tgname = 'consent_records_append_only' and not tgisinternal
  ),
  'consent rows have an append-only trigger'
);

select ok(
  exists(
    select 1 from pg_catalog.pg_trigger
    where tgname = 'audit_events_append_only' and not tgisinternal
  ),
  'audit rows have an append-only trigger'
);

select ok(
  exists(
    select 1 from pg_catalog.pg_trigger
    where tgname = 'auth_user_created_provision_account'
      and tgrelid = 'auth.users'::regclass
      and not tgisinternal
  ),
  'auth signup has a transactional provisioning trigger'
);

select ok(
  (
    select procedure.prosecdef
      and pg_catalog.array_to_string(procedure.proconfig, ',') like 'search_path=%'
    from pg_catalog.pg_proc as procedure
    where procedure.oid = pg_catalog.to_regprocedure('private.handle_auth_user_created()')
  ),
  'auth provisioning trigger is hardened'
);

select * from finish();
rollback;
