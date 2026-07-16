\set ON_ERROR_STOP on

begin transaction read only;

select '1..1';

do $hosted_invariants$
declare
  v_authenticated_oid oid := (select oid from pg_catalog.pg_roles where rolname = 'authenticated');
begin
  if (
    select pg_catalog.array_agg(relation.relname order by relation.relname)
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
  ) is distinct from array[
    'account_capabilities',
    'audit_events',
    'consent_records',
    'data_export_jobs',
    'deletion_jobs',
    'devices',
    'guardian_relationships',
    'guest_sessions',
    'learner_profile_access',
    'learner_profiles',
    'privacy_preferences',
    'privacy_requests',
    'profile_sessions',
    'profiles'
  ]::name[] then
    raise exception 'public table inventory differs from the committed Phase 01 contract';
  end if;

  if (
    select pg_catalog.array_agg(table_record.tablename order by table_record.tablename)
    from pg_catalog.pg_tables as table_record
    where table_record.schemaname = 'private'
  ) is distinct from array[
    'child_creation_authorizations',
    'learner_profile_credentials',
    'onboarding_authorizations',
    'rate_limit_buckets',
    'reauthentication_grants',
    'school_authorization_proofs'
  ]::name[] then
    raise exception 'private table inventory differs from the committed Phase 01 contract';
  end if;

  if exists(
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and not relation.relrowsecurity
  ) then
    raise exception 'an exposed table does not enable row-level security';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_policy as policy
    join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
  ) <> 12 then
    raise exception 'the public policy count differs from the committed contract';
  end if;

  if exists(
    select 1
    from pg_catalog.pg_policy as policy
    join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and (
        policy.polcmd <> 'r'
        or policy.polroles <> array[v_authenticated_oid]::oid[]
      )
  ) then
    raise exception 'an exposed policy is broader than authenticated read access';
  end if;

  if exists(
    select 1
    from information_schema.role_table_grants as table_grant
    where table_grant.table_schema = 'public'
      and table_grant.grantee in ('PUBLIC', 'anon')
  ) or exists(
    select 1
    from information_schema.role_column_grants as column_grant
    where column_grant.table_schema = 'public'
      and column_grant.grantee in ('PUBLIC', 'anon')
  ) then
    raise exception 'anonymous roles have an exposed table or column grant';
  end if;

  if exists(
    select 1
    from information_schema.role_table_grants as table_grant
    where table_grant.table_schema = 'public'
      and table_grant.grantee = 'authenticated'
      and table_grant.privilege_type <> 'SELECT'
  ) or exists(
    select 1
    from information_schema.role_column_grants as column_grant
    where column_grant.table_schema = 'public'
      and column_grant.grantee = 'authenticated'
      and column_grant.privilege_type <> 'SELECT'
  ) then
    raise exception 'authenticated roles have a direct exposed mutation grant';
  end if;

  if exists(
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and (
        pg_catalog.has_table_privilege('anon', relation.oid, 'SELECT')
        or pg_catalog.has_table_privilege('anon', relation.oid, 'INSERT')
        or pg_catalog.has_table_privilege('anon', relation.oid, 'UPDATE')
        or pg_catalog.has_table_privilege('anon', relation.oid, 'DELETE')
      )
  ) then
    raise exception 'anonymous has an exposed table data privilege';
  end if;

  if exists(
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and (
        pg_catalog.has_table_privilege('authenticated', relation.oid, 'INSERT')
        or pg_catalog.has_table_privilege('authenticated', relation.oid, 'UPDATE')
        or pg_catalog.has_table_privilege('authenticated', relation.oid, 'DELETE')
      )
  ) then
    raise exception 'authenticated has an exposed table mutation privilege';
  end if;

  if exists(
    select 1
    from information_schema.role_table_grants as table_grant
    where table_grant.table_schema = 'public'
      and table_grant.grantee = 'service_role'
      and table_grant.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'the service role has broad exposed table data access';
  end if;

  if exists(
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and (
        pg_catalog.has_table_privilege('service_role', relation.oid, 'SELECT')
        or pg_catalog.has_table_privilege('service_role', relation.oid, 'INSERT')
        or pg_catalog.has_table_privilege('service_role', relation.oid, 'UPDATE')
        or pg_catalog.has_table_privilege('service_role', relation.oid, 'DELETE')
      )
  ) then
    raise exception 'the service role has broad exposed table data access';
  end if;

  if exists(
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and procedure.prosecdef
      and not (
        pg_catalog.array_to_string(procedure.proconfig, ',') like 'search_path=%'
      )
  ) then
    raise exception 'a security-definer function does not fix an empty search path: %', (
      select pg_catalog.string_agg(namespace.nspname || '.' || procedure.proname, ', ' order by namespace.nspname, procedure.proname)
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname in ('public', 'private')
        and procedure.prosecdef
        and not (
          pg_catalog.array_to_string(procedure.proconfig, ',') like 'search_path=%'
        )
    );
  end if;

  if exists(
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and pg_catalog.has_function_privilege('public', procedure.oid, 'execute')
  ) then
    raise exception 'PUBLIC can execute an application function';
  end if;

  if pg_catalog.has_schema_privilege('public', 'private', 'usage')
    or pg_catalog.has_schema_privilege('anon', 'private', 'usage')
    or pg_catalog.has_schema_privilege('authenticated', 'private', 'usage') then
    raise exception 'the private schema is usable by an untrusted role';
  end if;

  if exists(select 1 from pg_catalog.pg_views where schemaname = 'public')
    or exists(select 1 from pg_catalog.pg_matviews where schemaname = 'public') then
    raise exception 'the exposed schema contains an unreviewed view';
  end if;

  if exists(select 1 from pg_catalog.pg_policies where schemaname = 'storage') then
    raise exception 'Phase 01 must not add a storage policy';
  end if;

  if exists(
    select 1
    from pg_catalog.pg_publication_tables as publication_table
    where publication_table.schemaname in ('public', 'private')
  ) then
    raise exception 'Phase 01 tables must not be added to a realtime publication';
  end if;
end;
$hosted_invariants$;

select 'ok 1 - hosted database invariants hold';

rollback;
