\set ON_ERROR_STOP on

begin transaction read only;

select '1..1';

do $hosted_invariants$
declare
  v_authenticated_oid oid := (select oid from pg_catalog.pg_roles where rolname = 'authenticated');
begin
  if exists(
    select 1
    from pg_catalog.unnest(array[
      'account_capabilities', 'audit_events', 'consent_records', 'data_export_jobs',
      'deletion_jobs', 'devices', 'guardian_relationships', 'guest_sessions',
      'learner_profile_access', 'learner_profiles', 'privacy_preferences',
      'privacy_requests', 'profile_sessions', 'profiles'
    ]::text[]) as expected(table_name)
    where not exists(
      select 1
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relkind = 'r'
        and relation.relname = expected.table_name
    )
  ) then
    raise exception 'a committed identity table is missing from the additive schema';
  end if;

  if exists(
    select 1
    from pg_catalog.unnest(array[
      'child_creation_authorizations', 'learner_profile_credentials',
      'onboarding_authorizations', 'rate_limit_buckets', 'reauthentication_grants',
      'school_authorization_proofs'
    ]::text[]) as expected(table_name)
    where not exists(
      select 1 from pg_catalog.pg_tables as table_record
      where table_record.schemaname = 'private'
        and table_record.tablename = expected.table_name
    )
  ) then
    raise exception 'a committed private identity table is missing from the additive schema';
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
      and relation.relname = any(array[
        'account_capabilities', 'audit_events', 'consent_records', 'data_export_jobs',
        'deletion_jobs', 'devices', 'guardian_relationships', 'guest_sessions',
        'learner_profile_access', 'learner_profiles', 'privacy_preferences',
        'privacy_requests', 'profile_sessions', 'profiles'
      ])
  ) <> 12 then
    raise exception 'the identity policy count differs from the committed contract';
  end if;

  if exists(
    select 1
    from pg_catalog.pg_policy as policy
    join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any(array[
        'account_capabilities', 'audit_events', 'consent_records', 'data_export_jobs',
        'deletion_jobs', 'devices', 'guardian_relationships', 'guest_sessions',
        'learner_profile_access', 'learner_profiles', 'privacy_preferences',
        'privacy_requests', 'profile_sessions', 'profiles'
      ])
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
      and table_grant.table_name not in (
        'deck_publications', 'card_publications', 'media_publications',
        'published_decks', 'published_cards', 'published_media'
      )
  ) or exists(
    select 1
    from information_schema.role_column_grants as column_grant
    where column_grant.table_schema = 'public'
      and column_grant.grantee in ('PUBLIC', 'anon')
      and column_grant.table_name not in (
        'deck_publications', 'card_publications', 'media_publications',
        'published_decks', 'published_cards', 'published_media'
      )
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
      and relation.relname not in (
        'deck_publications', 'card_publications', 'media_publications'
      )
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

  if exists(
    select 1 from pg_catalog.pg_views
    where schemaname = 'public'
      and viewname not in ('published_decks', 'published_cards', 'published_media')
  ) or exists(select 1 from pg_catalog.pg_matviews where schemaname = 'public') then
    raise exception 'the exposed schema contains an unreviewed view';
  end if;

  if exists(
    select 1 from pg_catalog.pg_policies
    where schemaname = 'storage'
      and policyname <> 'content_media_read'
  ) then
    raise exception 'the storage schema contains an unreviewed policy';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'private.can_write_content_media_object(uuid,text,text)',
    'execute'
  ) then
    raise exception 'browser credentials can write content Storage directly';
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
