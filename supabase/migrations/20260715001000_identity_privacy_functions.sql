begin;

create or replace function private.reject_append_only_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '55000',
    message = pg_catalog.format('%I is append-only', tg_table_name);
end;
$function$;

create or replace function private.guard_learner_profile_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' and old.kind = 'self' then
    raise exception using errcode = '55000', message = 'self learner profiles cannot be deleted';
  end if;

  if tg_op = 'UPDATE' and (
    new.id <> old.id
    or new.kind <> old.kind
    or new.owner_account_id <> old.owner_account_id
  ) then
    raise exception using errcode = '55000', message = 'learner profile identity is immutable';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create or replace function private.guard_secret_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_table_name = 'profile_sessions' then
    if new.id <> old.id
      or new.account_id <> old.account_id
      or new.learner_profile_id <> old.learner_profile_id
      or new.token_hash <> old.token_hash
      or new.created_at <> old.created_at then
      raise exception using errcode = '55000', message = 'profile session identity is immutable';
    end if;
    return new;
  end if;

  if tg_table_name = 'guest_sessions' then
    if new.id <> old.id
      or new.game_reference <> old.game_reference
      or new.reconnect_token_hash <> old.reconnect_token_hash
      or new.created_at <> old.created_at then
      raise exception using errcode = '55000', message = 'guest session identity is immutable';
    end if;
  end if;

  return new;
end;
$function$;

create or replace function private.write_audit_event(
  p_actor_type public.audit_actor_type,
  p_actor_account_id uuid,
  p_actor_learner_profile_id uuid,
  p_actor_guest_session_id uuid,
  p_event_type text,
  p_target_type text,
  p_target_id uuid,
  p_correlation_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid := extensions.gen_random_uuid();
begin
  if p_correlation_id is null then
    raise exception using errcode = '22023', message = 'correlation ID is required';
  end if;

  insert into public.audit_events (
    id,
    actor_type,
    actor_account_id,
    actor_learner_profile_id,
    actor_guest_session_id,
    event_type,
    target_type,
    target_id,
    correlation_id,
    metadata
  ) values (
    v_id,
    p_actor_type,
    p_actor_account_id,
    p_actor_learner_profile_id,
    p_actor_guest_session_id,
    pg_catalog.btrim(p_event_type),
    pg_catalog.btrim(p_target_type),
    p_target_id,
    p_correlation_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (event_type, correlation_id) do nothing;

  if not found then
    select id into v_id
    from public.audit_events
    where event_type = pg_catalog.btrim(p_event_type)
      and correlation_id = p_correlation_id;
  end if;

  return v_id;
end;
$function$;

create or replace function private.has_account_capability(
  p_account_id uuid,
  p_capability public.account_capability
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    exists(
      select 1
      from public.account_capabilities as capability
      join public.profiles as profile on profile.id = capability.account_id
      where capability.account_id = p_account_id
        and capability.capability = p_capability
        and capability.revoked_at is null
        and profile.account_status in ('onboarding', 'active', 'pending_deletion')
    ),
    false
  );
$function$;

create or replace function private.can_access_learner_profile(
  p_account_id uuid,
  p_learner_profile_id uuid,
  p_required_permission public.learner_permission
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    exists(
      select 1
      from public.learner_profiles as learner
      join public.profiles as account on account.id = p_account_id
      where learner.id = p_learner_profile_id
        and learner.status <> 'deleted'
        and account.account_status in ('onboarding', 'active', 'pending_deletion')
        and (
          (learner.owner_account_id = p_account_id and learner.kind = 'self')
          or exists(
            select 1
            from public.learner_profile_access as access
            where access.learner_profile_id = learner.id
              and access.account_id = p_account_id
              and access.revoked_at is null
              and p_required_permission = any(access.permissions)
              and (
                access.role <> 'guardian'
                or exists(
                  select 1
                  from public.guardian_relationships as relationship
                  where relationship.learner_profile_id = learner.id
                    and relationship.guardian_account_id = p_account_id
                    and relationship.status = 'active'
                )
              )
          )
        )
    ),
    false
  );
$function$;

create or replace function private.consume_rate_limit(
  p_scope text,
  p_subject_hash bytea,
  p_limit integer,
  p_window_seconds integer,
  p_now timestamptz
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_window_started_at timestamptz;
  v_request_count integer;
  v_retry integer;
begin
  if pg_catalog.char_length(pg_catalog.btrim(p_scope)) not between 2 and 100
    or pg_catalog.octet_length(p_subject_hash) not between 16 and 64
    or p_limit not between 1 and 10000
    or p_window_seconds not between 1 and 86400
    or p_now is null then
    raise exception using errcode = '22023', message = 'invalid rate-limit parameters';
  end if;

  v_window_started_at := pg_catalog.to_timestamp(
    pg_catalog.floor(extract(epoch from p_now) / p_window_seconds) * p_window_seconds
  );

  insert into private.rate_limit_buckets (
    scope,
    subject_hash,
    window_started_at,
    window_seconds,
    request_count,
    expires_at
  ) values (
    pg_catalog.btrim(p_scope),
    p_subject_hash,
    v_window_started_at,
    p_window_seconds,
    1,
    v_window_started_at + pg_catalog.make_interval(secs => p_window_seconds * 2)
  )
  on conflict (scope, subject_hash, window_started_at)
  do update set
    request_count = private.rate_limit_buckets.request_count + 1,
    expires_at = excluded.expires_at
  returning request_count into v_request_count;

  v_retry := greatest(
    0,
    pg_catalog.ceil(
      extract(
        epoch from (v_window_started_at + pg_catalog.make_interval(secs => p_window_seconds) - p_now)
      )
    )::integer
  );

  return query select
    v_request_count <= p_limit,
    greatest(p_limit - v_request_count, 0),
    case when v_request_count <= p_limit then 0 else v_retry end;
end;
$function$;

create or replace function private.ensure_self_learner_profile(p_account_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_learner_profile_id uuid;
begin
  if not exists(select 1 from public.profiles where id = p_account_id) then
    raise exception using errcode = '23503', message = 'account profile does not exist';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('self-learner:' || p_account_id::text, 0)
  );

  select id into v_learner_profile_id
  from public.learner_profiles
  where owner_account_id = p_account_id and kind = 'self';

  if v_learner_profile_id is null then
    v_learner_profile_id := extensions.gen_random_uuid();
    insert into public.learner_profiles (
      id,
      kind,
      owner_account_id,
      display_name,
      pseudonym,
      age_band,
      avatar_seed,
      status
    ) values (
      v_learner_profile_id,
      'self',
      p_account_id,
      null,
      'Learner-' || pg_catalog.substr(pg_catalog.replace(v_learner_profile_id::text, '-', ''), 1, 8),
      'unknown',
      pg_catalog.replace(v_learner_profile_id::text, '-', ''),
      'active'
    );
  end if;

  if not exists(
    select 1 from public.learner_profile_access
    where learner_profile_id = v_learner_profile_id
      and account_id = p_account_id
      and role = 'self'
      and revoked_at is null
  ) then
    insert into public.learner_profile_access (
      learner_profile_id,
      account_id,
      role,
      permissions,
      granted_by,
      idempotency_key
    ) values (
      v_learner_profile_id,
      p_account_id,
      'self',
      array[
        'view',
        'study',
        'manage',
        'manage_consent',
        'export_data',
        'request_deletion'
      ]::public.learner_permission[],
      p_account_id,
      v_learner_profile_id
    );
  end if;

  return v_learner_profile_id;
end;
$function$;

create or replace function private.provision_account(p_account_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_is_anonymous boolean;
  v_inserted_count bigint := 0;
  v_self_id uuid;
begin
  select coalesce(users.is_anonymous, false)
  into v_is_anonymous
  from auth.users as users
  where users.id = p_account_id;

  if not found then
    raise exception using errcode = '23503', message = 'auth account does not exist';
  end if;

  if v_is_anonymous then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('account-provision:' || p_account_id::text, 0)
  );

  insert into public.profiles (id)
  values (p_account_id)
  on conflict (id) do nothing;
  get diagnostics v_inserted_count = row_count;

  insert into public.privacy_preferences (account_id)
  values (p_account_id)
  on conflict (account_id) do nothing;

  insert into public.account_capabilities (account_id, capability)
  select p_account_id, capability
  from pg_catalog.unnest(pg_catalog.enum_range(null::public.account_capability)) as capability
  on conflict (account_id, capability) do nothing;

  v_self_id := private.ensure_self_learner_profile(p_account_id);

  if v_inserted_count > 0 then
    perform private.write_audit_event(
      'account',
      p_account_id,
      v_self_id,
      null,
      'account.provisioned',
      'profile',
      p_account_id,
      extensions.gen_random_uuid(),
      '{}'::jsonb
    );
  end if;

  return p_account_id;
end;
$function$;

create or replace function private.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not coalesce(new.is_anonymous, false) then
    perform private.provision_account(new.id);
  end if;
  return new;
end;
$function$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger privacy_preferences_set_updated_at
before update on public.privacy_preferences
for each row execute function private.set_updated_at();

create trigger learner_profiles_set_updated_at
before update on public.learner_profiles
for each row execute function private.set_updated_at();

create trigger privacy_requests_set_updated_at
before update on public.privacy_requests
for each row execute function private.set_updated_at();

create trigger learner_profile_credentials_set_updated_at
before update on private.learner_profile_credentials
for each row execute function private.set_updated_at();

create trigger consent_records_append_only
before update or delete on public.consent_records
for each row execute function private.reject_append_only_mutation();

create trigger audit_events_append_only
before update or delete on public.audit_events
for each row execute function private.reject_append_only_mutation();

create trigger learner_profiles_identity_guard
before update or delete on public.learner_profiles
for each row execute function private.guard_learner_profile_identity();

create trigger profile_sessions_identity_guard
before update on public.profile_sessions
for each row execute function private.guard_secret_identity();

create trigger guest_sessions_identity_guard
before update on public.guest_sessions
for each row execute function private.guard_secret_identity();

create trigger auth_user_created_provision_account
after insert on auth.users
for each row execute function private.handle_auth_user_created();

select private.provision_account(users.id)
from auth.users as users
where not coalesce(users.is_anonymous, false);

create or replace function public.ensure_current_account()
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := auth.uid();
begin
  if v_account_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;
  return private.provision_account(v_account_id);
end;
$function$;

create or replace function public.complete_current_account_onboarding(
  p_display_name text,
  p_handle text,
  p_locale text,
  p_timezone text,
  p_study_day_start smallint,
  p_age_band public.age_band,
  p_learning_goals text[],
  p_theme public.theme_preference,
  p_reduced_motion boolean,
  p_serious_mode boolean,
  p_reading_style text,
  p_idempotency_key uuid
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := auth.uid();
  v_self_id uuid;
  v_profile public.profiles;
begin
  if v_account_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'idempotency key is required';
  end if;
  if p_age_band not in ('teen', 'adult') then
    raise exception using errcode = '22023', message = 'a guardian-managed profile is required';
  end if;
  if p_reading_style not in ('standard', 'increased_spacing') then
    raise exception using errcode = '22023', message = 'invalid reading style';
  end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception using errcode = '22023', message = 'invalid time zone';
  end if;
  if p_learning_goals is null or pg_catalog.cardinality(p_learning_goals) > 20
    or exists(
      select 1 from pg_catalog.unnest(p_learning_goals) as goal
      where pg_catalog.char_length(pg_catalog.btrim(goal)) not between 1 and 120
    ) then
    raise exception using errcode = '22023', message = 'invalid learning goals';
  end if;

  perform private.provision_account(v_account_id);
  v_self_id := private.ensure_self_learner_profile(v_account_id);

  update public.profiles set
    display_name = pg_catalog.btrim(p_display_name),
    handle = pg_catalog.lower(pg_catalog.btrim(p_handle))::extensions.citext,
    locale = pg_catalog.btrim(p_locale),
    timezone = p_timezone,
    study_day_start = p_study_day_start,
    age_band = p_age_band,
    learning_goals = p_learning_goals,
    theme = p_theme,
    reduced_motion = p_reduced_motion,
    serious_mode = p_serious_mode,
    account_status = 'active',
    onboarding_completed_at = coalesce(onboarding_completed_at, pg_catalog.now())
  where id = v_account_id
  returning * into v_profile;

  update public.learner_profiles set
    display_name = pg_catalog.btrim(p_display_name),
    age_band = p_age_band,
    settings = pg_catalog.jsonb_set(
      settings,
      '{reading_style}'::text[],
      pg_catalog.to_jsonb(p_reading_style),
      true
    ),
    status = 'active'
  where id = v_self_id;

  perform private.write_audit_event(
    'account', v_account_id, v_self_id, null,
    'account.onboarding_completed', 'profile', v_account_id,
    p_idempotency_key, '{}'::jsonb
  );

  return v_profile;
end;
$function$;

create or replace function public.update_current_profile(
  p_display_name text,
  p_handle text,
  p_locale text,
  p_timezone text,
  p_study_day_start smallint,
  p_learning_goals text[],
  p_theme public.theme_preference,
  p_reduced_motion boolean,
  p_serious_mode boolean,
  p_reading_style text,
  p_idempotency_key uuid
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := auth.uid();
  v_self_id uuid;
  v_profile public.profiles;
begin
  if v_account_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'idempotency key is required';
  end if;
  if p_reading_style not in ('standard', 'increased_spacing') then
    raise exception using errcode = '22023', message = 'invalid reading style';
  end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception using errcode = '22023', message = 'invalid time zone';
  end if;
  if p_learning_goals is null or pg_catalog.cardinality(p_learning_goals) > 20
    or exists(
      select 1 from pg_catalog.unnest(p_learning_goals) as goal
      where pg_catalog.char_length(pg_catalog.btrim(goal)) not between 1 and 120
    ) then
    raise exception using errcode = '22023', message = 'invalid learning goals';
  end if;

  v_self_id := private.ensure_self_learner_profile(v_account_id);
  update public.profiles set
    display_name = pg_catalog.btrim(p_display_name),
    handle = pg_catalog.lower(pg_catalog.btrim(p_handle))::extensions.citext,
    locale = pg_catalog.btrim(p_locale),
    timezone = p_timezone,
    study_day_start = p_study_day_start,
    learning_goals = p_learning_goals,
    theme = p_theme,
    reduced_motion = p_reduced_motion,
    serious_mode = p_serious_mode
  where id = v_account_id
    and account_status in ('onboarding', 'active', 'pending_deletion')
  returning * into v_profile;

  if not found then
    raise exception using errcode = '42501', message = 'profile cannot be updated';
  end if;

  update public.learner_profiles
  set
    display_name = pg_catalog.btrim(p_display_name),
    settings = pg_catalog.jsonb_set(
      settings,
      '{reading_style}'::text[],
      pg_catalog.to_jsonb(p_reading_style),
      true
    )
  where id = v_self_id;

  perform private.write_audit_event(
    'account', v_account_id, v_self_id, null,
    'account.profile_updated', 'profile', v_account_id,
    p_idempotency_key, '{}'::jsonb
  );
  return v_profile;
end;
$function$;

create or replace function public.update_current_privacy_preferences(
  p_first_party_analytics boolean,
  p_allow_product_updates boolean,
  p_allow_social_interactions boolean,
  p_default_content_private boolean,
  p_idempotency_key uuid
)
returns public.privacy_preferences
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := auth.uid();
  v_preferences public.privacy_preferences;
begin
  if v_account_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'idempotency key is required';
  end if;

  update public.privacy_preferences set
    first_party_analytics = p_first_party_analytics,
    allow_product_updates = p_allow_product_updates,
    allow_social_interactions = p_allow_social_interactions,
    default_content_private = p_default_content_private
  where account_id = v_account_id
  returning * into v_preferences;

  if not found then
    raise exception using errcode = '42501', message = 'privacy preferences cannot be updated';
  end if;

  perform private.write_audit_event(
    'account', v_account_id, null, null,
    'account.privacy_preferences_updated', 'privacy_preferences', v_account_id,
    p_idempotency_key,
    pg_catalog.jsonb_build_object('first_party_analytics', p_first_party_analytics)
  );
  return v_preferences;
end;
$function$;

create or replace function public.admin_create_child_learner(
  p_actor_account_id uuid,
  p_display_name text,
  p_pseudonym text,
  p_age_band public.age_band,
  p_avatar_seed text,
  p_consent_type public.consent_type,
  p_policy_version text,
  p_consent_scope jsonb,
  p_verification_method public.consent_verification_method,
  p_evidence_reference text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_learner_profile_id uuid;
  v_relationship_id uuid;
  v_status public.learner_profile_status;
begin
  if p_idempotency_key is null or p_actor_account_id is null then
    raise exception using errcode = '22023', message = 'actor and idempotency key are required';
  end if;
  if p_age_band not in ('under_13', 'teen') then
    raise exception using errcode = '22023', message = 'invalid child age band';
  end if;
  if p_consent_type not in ('guardian_account', 'child_profile') then
    raise exception using errcode = '22023', message = 'child profile consent is required';
  end if;
  if not exists(
    select 1 from public.profiles
    where id = p_actor_account_id and account_status = 'active' and age_band in ('teen', 'adult')
  ) then
    raise exception using errcode = '42501', message = 'guardian account is not eligible';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('child-create:' || p_actor_account_id::text || ':' || p_idempotency_key::text, 0)
  );

  select relationship.learner_profile_id into v_learner_profile_id
  from public.guardian_relationships as relationship
  where relationship.guardian_account_id = p_actor_account_id
    and relationship.idempotency_key = p_idempotency_key;
  if v_learner_profile_id is not null then
    return v_learner_profile_id;
  end if;

  v_learner_profile_id := extensions.gen_random_uuid();
  v_relationship_id := extensions.gen_random_uuid();
  v_status := case
    when p_verification_method = 'not_verified' then 'pending_consent'::public.learner_profile_status
    else 'active'::public.learner_profile_status
  end;

  insert into public.learner_profiles (
    id, kind, owner_account_id, display_name, pseudonym, age_band, avatar_seed, status
  ) values (
    v_learner_profile_id,
    'child',
    p_actor_account_id,
    pg_catalog.btrim(p_display_name),
    pg_catalog.btrim(p_pseudonym),
    p_age_band,
    p_avatar_seed,
    v_status
  );

  insert into public.guardian_relationships (
    id,
    learner_profile_id,
    guardian_account_id,
    status,
    verification_metadata,
    idempotency_key,
    activated_at
  ) values (
    v_relationship_id,
    v_learner_profile_id,
    p_actor_account_id,
    case
      when v_status = 'active' then 'active'::public.guardian_relationship_status
      else 'pending'::public.guardian_relationship_status
    end,
    pg_catalog.jsonb_build_object('verification_method', p_verification_method),
    p_idempotency_key,
    case when v_status = 'active' then pg_catalog.now() else null end
  );

  insert into public.learner_profile_access (
    learner_profile_id,
    account_id,
    role,
    permissions,
    granted_by,
    idempotency_key
  ) values (
    v_learner_profile_id,
    p_actor_account_id,
    'guardian',
    array[
      'view',
      'study',
      'manage',
      'manage_consent',
      'export_data',
      'request_deletion'
    ]::public.learner_permission[],
    p_actor_account_id,
    v_relationship_id
  );

  insert into public.consent_records (
    learner_profile_id,
    guardian_account_id,
    consent_type,
    action,
    policy_version,
    scope,
    verification_method,
    evidence_reference,
    idempotency_key
  ) values (
    v_learner_profile_id,
    p_actor_account_id,
    p_consent_type,
    'granted',
    pg_catalog.btrim(p_policy_version),
    coalesce(p_consent_scope, '{}'::jsonb),
    p_verification_method,
    p_evidence_reference,
    p_idempotency_key
  );

  perform private.write_audit_event(
    'account', p_actor_account_id, v_learner_profile_id, null,
    'learner.child_profile_created', 'learner_profile', v_learner_profile_id,
    p_idempotency_key,
    pg_catalog.jsonb_build_object('age_band', p_age_band, 'status', v_status)
  );
  return v_learner_profile_id;
end;
$function$;

create or replace function public.admin_create_school_managed_learner(
  p_actor_account_id uuid,
  p_owner_account_id uuid,
  p_display_name text,
  p_pseudonym text,
  p_age_band public.age_band,
  p_avatar_seed text,
  p_settings jsonb,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_learner_profile_id uuid;
begin
  if p_idempotency_key is null
    or not private.has_account_capability(p_actor_account_id, 'teach')
    or not exists(
      select 1 from public.profiles
      where id = p_owner_account_id and account_status = 'active'
    ) then
    raise exception using errcode = '42501', message = 'school-managed profile is not authorized';
  end if;
  if pg_catalog.jsonb_typeof(coalesce(p_settings, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'settings must be an object';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('school-profile:' || p_owner_account_id::text || ':' || p_idempotency_key::text, 0)
  );

  select access.learner_profile_id into v_learner_profile_id
  from public.learner_profile_access as access
  where access.account_id = p_owner_account_id
    and access.idempotency_key = p_idempotency_key;
  if v_learner_profile_id is not null then
    return v_learner_profile_id;
  end if;

  v_learner_profile_id := extensions.gen_random_uuid();
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
    v_learner_profile_id,
    'school_managed',
    p_owner_account_id,
    pg_catalog.btrim(p_display_name),
    pg_catalog.btrim(p_pseudonym),
    p_age_band,
    p_avatar_seed,
    'active',
    coalesce(p_settings, '{}'::jsonb)
  );

  insert into public.learner_profile_access (
    learner_profile_id,
    account_id,
    role,
    permissions,
    granted_by,
    idempotency_key
  ) values (
    v_learner_profile_id,
    p_owner_account_id,
    'school_admin',
    array[
      'view',
      'study',
      'manage',
      'manage_consent',
      'export_data',
      'request_deletion',
      'observe'
    ]::public.learner_permission[],
    p_actor_account_id,
    p_idempotency_key
  );

  perform private.write_audit_event(
    'account', p_actor_account_id, v_learner_profile_id, null,
    'learner.school_profile_created', 'learner_profile', v_learner_profile_id,
    p_idempotency_key,
    pg_catalog.jsonb_build_object('owner_account_id', p_owner_account_id)
  );
  return v_learner_profile_id;
end;
$function$;

create or replace function public.admin_grant_learner_access(
  p_actor_account_id uuid,
  p_learner_profile_id uuid,
  p_account_id uuid,
  p_role public.learner_access_role,
  p_permissions public.learner_permission[],
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_access_id uuid;
begin
  if p_role in ('self', 'guardian') then
    raise exception using errcode = '22023', message = 'this access role requires its dedicated workflow';
  end if;
  if not private.can_access_learner_profile(p_actor_account_id, p_learner_profile_id, 'manage') then
    raise exception using errcode = '42501', message = 'learner access cannot be granted';
  end if;
  if not exists(select 1 from public.profiles where id = p_account_id and account_status = 'active') then
    raise exception using errcode = '23503', message = 'target account is unavailable';
  end if;
  if p_permissions is null or pg_catalog.cardinality(p_permissions) = 0 then
    raise exception using errcode = '22023', message = 'permissions are required';
  end if;
  if p_role = 'teacher_observer'
    and not (p_permissions <@ array['observe']::public.learner_permission[]) then
    raise exception using errcode = '22023', message = 'teacher observers receive observation only';
  end if;

  select id into v_access_id
  from public.learner_profile_access
  where account_id = p_account_id and idempotency_key = p_idempotency_key;
  if v_access_id is not null then
    return v_access_id;
  end if;

  insert into public.learner_profile_access (
    learner_profile_id,
    account_id,
    role,
    permissions,
    granted_by,
    idempotency_key
  ) values (
    p_learner_profile_id,
    p_account_id,
    p_role,
    p_permissions,
    p_actor_account_id,
    p_idempotency_key
  ) returning id into v_access_id;

  perform private.write_audit_event(
    'account', p_actor_account_id, p_learner_profile_id, null,
    'learner.access_granted', 'learner_profile_access', v_access_id,
    p_idempotency_key,
    pg_catalog.jsonb_build_object('role', p_role, 'account_id', p_account_id)
  );
  return v_access_id;
end;
$function$;

create or replace function public.admin_revoke_learner_access(
  p_actor_account_id uuid,
  p_access_id uuid,
  p_idempotency_key uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_access public.learner_profile_access;
begin
  select * into v_access
  from public.learner_profile_access
  where id = p_access_id
  for update;

  if not found or v_access.role = 'self'
    or not private.can_access_learner_profile(
      p_actor_account_id,
      v_access.learner_profile_id,
      'manage'
    ) then
    raise exception using errcode = '42501', message = 'learner access cannot be revoked';
  end if;

  if v_access.revoked_at is null then
    update public.learner_profile_access set revoked_at = pg_catalog.now() where id = p_access_id;

    if v_access.role = 'guardian' then
      update public.guardian_relationships set
        status = 'revoked',
        revoked_at = pg_catalog.now()
      where learner_profile_id = v_access.learner_profile_id
        and guardian_account_id = v_access.account_id
        and status <> 'revoked';

      if not exists(
        select 1 from public.guardian_relationships
        where learner_profile_id = v_access.learner_profile_id and status = 'active'
      ) then
        update public.learner_profiles
        set status = 'locked'
        where id = v_access.learner_profile_id and kind = 'child';
      end if;
    end if;

    update public.profile_sessions set
      revoked_at = pg_catalog.now(),
      revoke_reason = 'learner access revoked'
    where learner_profile_id = v_access.learner_profile_id
      and account_id = v_access.account_id
      and revoked_at is null;

    perform private.write_audit_event(
      'account', p_actor_account_id, v_access.learner_profile_id, null,
      'learner.access_revoked', 'learner_profile_access', p_access_id,
      p_idempotency_key,
      pg_catalog.jsonb_build_object('role', v_access.role, 'account_id', v_access.account_id)
    );
  end if;
  return true;
end;
$function$;

create or replace function public.admin_update_learner_profile(
  p_actor_account_id uuid,
  p_learner_profile_id uuid,
  p_display_name text,
  p_pseudonym text,
  p_avatar_seed text,
  p_settings jsonb,
  p_idempotency_key uuid
)
returns public.learner_profiles
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile public.learner_profiles;
begin
  if not private.can_access_learner_profile(p_actor_account_id, p_learner_profile_id, 'manage') then
    raise exception using errcode = '42501', message = 'learner profile cannot be updated';
  end if;
  if pg_catalog.jsonb_typeof(coalesce(p_settings, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'settings must be an object';
  end if;

  update public.learner_profiles set
    display_name = pg_catalog.btrim(p_display_name),
    pseudonym = pg_catalog.btrim(p_pseudonym),
    avatar_seed = p_avatar_seed,
    settings = coalesce(p_settings, '{}'::jsonb)
  where id = p_learner_profile_id and status <> 'deleted'
  returning * into v_profile;

  perform private.write_audit_event(
    'account', p_actor_account_id, p_learner_profile_id, null,
    'learner.profile_updated', 'learner_profile', p_learner_profile_id,
    p_idempotency_key, '{}'::jsonb
  );
  return v_profile;
end;
$function$;

create or replace function public.get_observed_learner_profiles()
returns table (
  learner_profile_id uuid,
  display_name text,
  pseudonym text,
  age_band public.age_band,
  status public.learner_profile_status,
  access_role public.learner_access_role
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    learner.id,
    learner.display_name,
    learner.pseudonym,
    learner.age_band,
    learner.status,
    access.role
  from public.learner_profile_access as access
  join public.learner_profiles as learner on learner.id = access.learner_profile_id
  where access.account_id = auth.uid()
    and access.revoked_at is null
    and 'observe'::public.learner_permission = any(access.permissions)
    and learner.status <> 'deleted';
$function$;

create or replace function public.admin_register_device(
  p_actor_account_id uuid,
  p_device_id uuid,
  p_display_name text,
  p_platform text,
  p_idempotency_key uuid
)
returns public.devices
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_device public.devices;
begin
  if not exists(
    select 1 from public.profiles
    where id = p_actor_account_id and account_status in ('onboarding', 'active', 'pending_deletion')
  ) then
    raise exception using errcode = '42501', message = 'device cannot be registered';
  end if;

  insert into public.devices (
    id, account_id, display_name, platform, idempotency_key
  ) values (
    p_device_id,
    p_actor_account_id,
    pg_catalog.btrim(p_display_name),
    pg_catalog.btrim(p_platform),
    p_idempotency_key
  )
  on conflict on constraint devices_account_id_idempotency_key_key
  do update set
    display_name = excluded.display_name,
    platform = excluded.platform,
    last_seen_at = pg_catalog.now()
  returning * into v_device;

  perform private.write_audit_event(
    'account', p_actor_account_id, null, null,
    'account.device_registered', 'device', v_device.id,
    p_idempotency_key, '{}'::jsonb
  );
  return v_device;
end;
$function$;

create or replace function public.admin_revoke_device(
  p_actor_account_id uuid,
  p_device_id uuid,
  p_idempotency_key uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.devices set revoked_at = coalesce(revoked_at, pg_catalog.now())
  where id = p_device_id and account_id = p_actor_account_id;
  if not found then
    raise exception using errcode = '42501', message = 'device cannot be revoked';
  end if;

  update public.profile_sessions set
    revoked_at = coalesce(revoked_at, pg_catalog.now()),
    revoke_reason = coalesce(revoke_reason, 'device revoked')
  where device_id = p_device_id and revoked_at is null;

  perform private.write_audit_event(
    'account', p_actor_account_id, null, null,
    'account.device_revoked', 'device', p_device_id,
    p_idempotency_key, '{}'::jsonb
  );
  return true;
end;
$function$;

create or replace function public.admin_set_learner_profile_credentials(
  p_actor_account_id uuid,
  p_learner_profile_id uuid,
  p_pin text,
  p_family_code text,
  p_idempotency_key uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not private.can_access_learner_profile(p_actor_account_id, p_learner_profile_id, 'manage')
    or not exists(
      select 1 from public.learner_profiles
      where id = p_learner_profile_id and kind in ('child', 'school_managed') and status <> 'deleted'
    ) then
    raise exception using errcode = '42501', message = 'learner credentials cannot be changed';
  end if;
  if p_pin !~ '^[0-9]{6,12}$'
    or p_pin ~ '^([0-9])\1+$'
    or p_pin in ('123456', '654321', '012345', '543210')
    or pg_catalog.regexp_replace(
      pg_catalog.upper(pg_catalog.btrim(p_family_code)),
      '[[:space:]-]+',
      '',
      'g'
    ) !~ '^[A-HJ-NP-Z2-9]{8}$' then
    raise exception using errcode = '22023', message = 'invalid learner credentials';
  end if;

  insert into private.learner_profile_credentials (
    learner_profile_id,
    pin_hash,
    family_code_hash
  ) values (
    p_learner_profile_id,
    extensions.crypt(p_pin, extensions.gen_salt('bf', 12)),
    extensions.digest(
      pg_catalog.regexp_replace(
        pg_catalog.upper(pg_catalog.btrim(p_family_code)),
        '[[:space:]-]+',
        '',
        'g'
      ),
      'sha256'
    )
  )
  on conflict (learner_profile_id)
  do update set
    pin_hash = excluded.pin_hash,
    family_code_hash = excluded.family_code_hash,
    version = private.learner_profile_credentials.version + 1;

  update public.profile_sessions set
    revoked_at = coalesce(revoked_at, pg_catalog.now()),
    revoke_reason = coalesce(revoke_reason, 'credentials rotated')
  where learner_profile_id = p_learner_profile_id and revoked_at is null;

  perform private.write_audit_event(
    'account', p_actor_account_id, p_learner_profile_id, null,
    'learner.credentials_rotated', 'learner_profile', p_learner_profile_id,
    p_idempotency_key, '{}'::jsonb
  );
  return true;
end;
$function$;

create or replace function private.verify_learner_profile_credentials(
  p_learner_profile_id uuid,
  p_family_code text,
  p_pin text,
  p_subject_hash bytea,
  p_now timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_subject_allowed boolean;
  v_profile_allowed boolean;
  v_pin_hash text;
  v_family_code_hash bytea;
  v_profile_subject bytea;
begin
  select rate.allowed into v_subject_allowed
  from private.consume_rate_limit(
    'profile_pin_subject:' || p_learner_profile_id::text,
    p_subject_hash,
    5,
    900,
    p_now
  ) as rate;

  v_profile_subject := extensions.digest(p_learner_profile_id::text, 'sha256');
  select rate.allowed into v_profile_allowed
  from private.consume_rate_limit(
    'profile_pin_profile',
    v_profile_subject,
    20,
    900,
    p_now
  ) as rate;

  if not v_subject_allowed or not v_profile_allowed then
    return false;
  end if;

  select credential.pin_hash, credential.family_code_hash
  into v_pin_hash, v_family_code_hash
  from private.learner_profile_credentials as credential
  join public.learner_profiles as learner on learner.id = credential.learner_profile_id
  where credential.learner_profile_id = p_learner_profile_id
    and learner.status = 'active';

  if v_pin_hash is null then
    perform extensions.crypt(
      coalesce(p_pin, ''),
      extensions.gen_salt('bf', 12)
    );
    return false;
  end if;

  return
    extensions.digest(
      pg_catalog.regexp_replace(
        pg_catalog.upper(pg_catalog.btrim(p_family_code)),
        '[[:space:]-]+',
        '',
        'g'
      ),
      'sha256'
    ) = v_family_code_hash
    and extensions.crypt(p_pin, v_pin_hash) = v_pin_hash;
exception
  when others then
    return false;
end;
$function$;

create or replace function public.admin_verify_learner_profile_credentials(
  p_learner_profile_id uuid,
  p_family_code text,
  p_pin text,
  p_subject_hash bytea
)
returns table (owner_account_id uuid, learner_profile_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not private.verify_learner_profile_credentials(
    p_learner_profile_id,
    p_family_code,
    p_pin,
    p_subject_hash,
    pg_catalog.now()
  ) then
    return;
  end if;

  return query
  select learner.owner_account_id, learner.id
  from public.learner_profiles as learner
  where learner.id = p_learner_profile_id and learner.status = 'active';
end;
$function$;

create or replace function public.admin_create_profile_session(
  p_actor_account_id uuid,
  p_learner_profile_id uuid,
  p_device_id uuid,
  p_token_hash bytea,
  p_expires_at timestamptz,
  p_idempotency_key uuid
)
returns table (
  profile_session_id uuid,
  account_id uuid,
  learner_profile_id uuid,
  device_id uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.profile_sessions;
begin
  if not private.can_access_learner_profile(p_actor_account_id, p_learner_profile_id, 'study') then
    raise exception using errcode = '42501', message = 'profile session cannot be created';
  end if;
  if p_expires_at <= pg_catalog.now()
    or p_expires_at > pg_catalog.now() + interval '30 minutes'
    or pg_catalog.octet_length(p_token_hash) <> 32 then
    raise exception using errcode = '22023', message = 'invalid profile session';
  end if;
  if p_device_id is not null and not exists(
    select 1 from public.devices as device
    where device.id = p_device_id
      and device.account_id = p_actor_account_id
      and device.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = 'device is unavailable';
  end if;

  insert into public.profile_sessions (
    account_id,
    learner_profile_id,
    device_id,
    token_hash,
    expires_at,
    idempotency_key
  ) values (
    p_actor_account_id,
    p_learner_profile_id,
    p_device_id,
    p_token_hash,
    p_expires_at,
    p_idempotency_key
  )
  on conflict on constraint profile_sessions_account_id_idempotency_key_key
  do update set account_id = excluded.account_id
  returning * into v_session;

  perform private.write_audit_event(
    'account', p_actor_account_id, p_learner_profile_id, null,
    'learner.profile_session_created', 'profile_session', v_session.id,
    p_idempotency_key, '{}'::jsonb
  );

  return query select
    v_session.id,
    v_session.account_id,
    v_session.learner_profile_id,
    v_session.device_id,
    v_session.expires_at;
end;
$function$;

create or replace function public.admin_create_profile_session_with_credentials(
  p_learner_profile_id uuid,
  p_family_code text,
  p_pin text,
  p_subject_hash bytea,
  p_device_id uuid,
  p_token_hash bytea,
  p_expires_at timestamptz,
  p_idempotency_key uuid
)
returns table (
  profile_session_id uuid,
  account_id uuid,
  learner_profile_id uuid,
  device_id uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner_account_id uuid;
begin
  if not private.verify_learner_profile_credentials(
    p_learner_profile_id,
    p_family_code,
    p_pin,
    p_subject_hash,
    pg_catalog.now()
  ) then
    raise exception using errcode = '28000', message = 'profile credentials are invalid or rate limited';
  end if;

  select owner_account_id into v_owner_account_id
  from public.learner_profiles
  where id = p_learner_profile_id and status = 'active';

  return query select * from public.admin_create_profile_session(
    v_owner_account_id,
    p_learner_profile_id,
    p_device_id,
    p_token_hash,
    p_expires_at,
    p_idempotency_key
  );
end;
$function$;

create or replace function public.admin_resolve_profile_session(p_token_hash bytea)
returns table (
  profile_session_id uuid,
  account_id uuid,
  learner_profile_id uuid,
  learner_kind public.learner_profile_kind,
  learner_age_band public.age_band,
  learner_status public.learner_profile_status,
  device_id uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.profile_sessions as session set last_used_at = pg_catalog.now()
  from public.learner_profiles as learner, public.profiles as account
  where session.token_hash = p_token_hash
    and session.learner_profile_id = learner.id
    and session.account_id = account.id
    and session.revoked_at is null
    and session.expires_at > pg_catalog.now()
    and learner.status = 'active'
    and account.account_status = 'active'
    and (
      session.device_id is null
      or exists(
        select 1 from public.devices as device
        where device.id = session.device_id and device.revoked_at is null
      )
    );

  return query
  select
    session.id,
    session.account_id,
    session.learner_profile_id,
    learner.kind,
    learner.age_band,
    learner.status,
    session.device_id,
    session.expires_at
  from public.profile_sessions as session
  join public.learner_profiles as learner on learner.id = session.learner_profile_id
  join public.profiles as account on account.id = session.account_id
  where session.token_hash = p_token_hash
    and session.revoked_at is null
    and session.expires_at > pg_catalog.now()
    and learner.status = 'active'
    and account.account_status = 'active'
    and (
      session.device_id is null
      or exists(
        select 1 from public.devices as device
        where device.id = session.device_id and device.revoked_at is null
      )
    );
end;
$function$;

create or replace function public.admin_revoke_profile_session(
  p_actor_account_id uuid,
  p_profile_session_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.profile_sessions;
begin
  select * into v_session from public.profile_sessions
  where id = p_profile_session_id
  for update;

  if not found or v_session.account_id <> p_actor_account_id then
    raise exception using errcode = '42501', message = 'profile session cannot be revoked';
  end if;

  update public.profile_sessions set
    revoked_at = coalesce(revoked_at, pg_catalog.now()),
    revoke_reason = coalesce(revoke_reason, pg_catalog.left(p_reason, 200))
  where id = p_profile_session_id;

  perform private.write_audit_event(
    'account', p_actor_account_id, v_session.learner_profile_id, null,
    'learner.profile_session_revoked', 'profile_session', p_profile_session_id,
    p_idempotency_key, '{}'::jsonb
  );
  return true;
end;
$function$;

create or replace function public.admin_record_consent(
  p_actor_account_id uuid,
  p_learner_profile_id uuid,
  p_consent_type public.consent_type,
  p_policy_version text,
  p_scope jsonb,
  p_verification_method public.consent_verification_method,
  p_evidence_reference text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_consent_id uuid;
begin
  if not private.can_access_learner_profile(
    p_actor_account_id,
    p_learner_profile_id,
    'manage_consent'
  ) then
    raise exception using errcode = '42501', message = 'consent cannot be recorded';
  end if;

  select id into v_consent_id
  from public.consent_records
  where guardian_account_id = p_actor_account_id and idempotency_key = p_idempotency_key;
  if v_consent_id is not null then
    return v_consent_id;
  end if;

  insert into public.consent_records (
    learner_profile_id,
    guardian_account_id,
    consent_type,
    action,
    policy_version,
    scope,
    verification_method,
    evidence_reference,
    idempotency_key
  ) values (
    p_learner_profile_id,
    p_actor_account_id,
    p_consent_type,
    'granted',
    pg_catalog.btrim(p_policy_version),
    coalesce(p_scope, '{}'::jsonb),
    p_verification_method,
    p_evidence_reference,
    p_idempotency_key
  ) returning id into v_consent_id;

  if p_consent_type in ('guardian_account', 'child_profile')
    and p_verification_method <> 'not_verified' then
    update public.guardian_relationships set
      status = 'active',
      activated_at = coalesce(activated_at, pg_catalog.now())
    where learner_profile_id = p_learner_profile_id
      and guardian_account_id = p_actor_account_id
      and status = 'pending';
    update public.learner_profiles set status = 'active'
    where id = p_learner_profile_id and status = 'pending_consent';
  end if;

  perform private.write_audit_event(
    'account', p_actor_account_id, p_learner_profile_id, null,
    'consent.granted', 'consent_record', v_consent_id,
    p_idempotency_key,
    pg_catalog.jsonb_build_object('consent_type', p_consent_type)
  );
  return v_consent_id;
end;
$function$;

create or replace function public.admin_revoke_consent(
  p_actor_account_id uuid,
  p_consent_record_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_original public.consent_records;
  v_revocation_id uuid;
begin
  select id into v_revocation_id
  from public.consent_records
  where guardian_account_id = p_actor_account_id and idempotency_key = p_idempotency_key;
  if v_revocation_id is not null then
    return v_revocation_id;
  end if;

  select * into v_original
  from public.consent_records
  where id = p_consent_record_id and action = 'granted'
  for share;

  if not found
    or v_original.guardian_account_id <> p_actor_account_id
    or not private.can_access_learner_profile(
      p_actor_account_id,
      v_original.learner_profile_id,
      'manage_consent'
    ) then
    raise exception using errcode = '42501', message = 'consent cannot be revoked';
  end if;

  insert into public.consent_records (
    learner_profile_id,
    guardian_account_id,
    consent_type,
    action,
    policy_version,
    scope,
    verification_method,
    prior_consent_record_id,
    reason,
    idempotency_key
  ) values (
    v_original.learner_profile_id,
    p_actor_account_id,
    v_original.consent_type,
    'revoked',
    v_original.policy_version,
    v_original.scope,
    v_original.verification_method,
    v_original.id,
    pg_catalog.left(p_reason, 500),
    p_idempotency_key
  ) returning id into v_revocation_id;

  if v_original.consent_type in ('guardian_account', 'child_profile') then
    update public.guardian_relationships set
      status = 'revoked',
      revoked_at = pg_catalog.now()
    where learner_profile_id = v_original.learner_profile_id
      and guardian_account_id = p_actor_account_id
      and status <> 'revoked';

    update public.learner_profile_access set revoked_at = pg_catalog.now()
    where learner_profile_id = v_original.learner_profile_id
      and account_id = p_actor_account_id
      and role = 'guardian'
      and revoked_at is null;

    update public.profile_sessions set
      revoked_at = pg_catalog.now(),
      revoke_reason = 'guardian consent revoked'
    where learner_profile_id = v_original.learner_profile_id and revoked_at is null;

    if not exists(
      select 1 from public.guardian_relationships
      where learner_profile_id = v_original.learner_profile_id and status = 'active'
    ) then
      update public.learner_profiles set status = 'locked'
      where id = v_original.learner_profile_id and kind = 'child';
    end if;
  end if;

  perform private.write_audit_event(
    'account', p_actor_account_id, v_original.learner_profile_id, null,
    'consent.revoked', 'consent_record', v_revocation_id,
    p_idempotency_key,
    pg_catalog.jsonb_build_object('prior_consent_record_id', p_consent_record_id)
  );
  return v_revocation_id;
end;
$function$;

create or replace function public.admin_issue_reauthentication_grant(
  p_actor_account_id uuid,
  p_purpose public.reauthentication_purpose,
  p_proof_hash bytea,
  p_expires_at timestamptz,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_grant_id uuid;
begin
  if not exists(
    select 1 from public.profiles
    where id = p_actor_account_id and account_status in ('active', 'pending_deletion')
  ) or pg_catalog.octet_length(p_proof_hash) <> 32
    or p_expires_at <= pg_catalog.now()
    or p_expires_at > pg_catalog.now() + interval '10 minutes' then
    raise exception using errcode = '42501', message = 'reauthentication grant cannot be issued';
  end if;

  insert into private.reauthentication_grants (
    account_id,
    purpose,
    proof_hash,
    idempotency_key,
    expires_at
  ) values (
    p_actor_account_id,
    p_purpose,
    p_proof_hash,
    p_idempotency_key,
    p_expires_at
  )
  on conflict (account_id, idempotency_key)
  do update set account_id = excluded.account_id
  returning id into v_grant_id;

  perform private.write_audit_event(
    'account', p_actor_account_id, null, null,
    'account.reauthentication_verified', 'profile', p_actor_account_id,
    p_idempotency_key,
    pg_catalog.jsonb_build_object('purpose', p_purpose)
  );
  return v_grant_id;
end;
$function$;

create or replace function public.request_data_export(p_idempotency_key uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := auth.uid();
  v_request_id uuid;
  v_job_id uuid;
  v_allowed boolean;
begin
  if v_account_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;

  select request.id into v_request_id
  from public.privacy_requests as request
  where request.account_id = v_account_id and request.idempotency_key = p_idempotency_key;
  if v_request_id is not null then
    select id into v_job_id from public.data_export_jobs
    where privacy_request_id = v_request_id;
    return v_job_id;
  end if;

  select rate.allowed into v_allowed
  from private.consume_rate_limit(
    'data_export_request',
    extensions.digest(v_account_id::text, 'sha256'),
    3,
    900,
    pg_catalog.now()
  ) as rate;
  if not v_allowed then
    raise exception using errcode = 'P0001', message = 'request is rate limited';
  end if;

  insert into public.privacy_requests (
    account_id, request_type, status, idempotency_key
  ) values (
    v_account_id, 'export', 'queued', p_idempotency_key
  ) returning id into v_request_id;

  insert into public.data_export_jobs (
    privacy_request_id, account_id, status
  ) values (
    v_request_id, v_account_id, 'queued'
  ) returning id into v_job_id;

  perform private.write_audit_event(
    'account', v_account_id, null, null,
    'privacy.export_requested', 'data_export_job', v_job_id,
    p_idempotency_key, '{}'::jsonb
  );
  return v_job_id;
end;
$function$;

create or replace function public.admin_request_account_deletion(
  p_actor_account_id uuid,
  p_reauthentication_proof_hash bytea,
  p_grace_period_days integer,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := p_actor_account_id;
  v_request_id uuid;
  v_job_id uuid;
  v_grant_id uuid;
  v_allowed boolean;
begin
  if not exists(
    select 1
    from public.profiles
    where id = v_account_id and account_status in ('active', 'pending_deletion')
  ) then
    raise exception using errcode = '42501', message = 'account deletion cannot be requested';
  end if;

  if p_grace_period_days is null or p_grace_period_days not between 1 and 90 then
    raise exception using errcode = '22023', message = 'deletion grace period must be between 1 and 90 days';
  end if;

  select request.id into v_request_id
  from public.privacy_requests as request
  where request.account_id = v_account_id and request.idempotency_key = p_idempotency_key;
  if v_request_id is not null then
    select id into v_job_id from public.deletion_jobs where privacy_request_id = v_request_id;
    return v_job_id;
  end if;

  select grant_record.id into v_grant_id
  from private.reauthentication_grants as grant_record
  where grant_record.account_id = v_account_id
    and grant_record.purpose = 'account_deletion'
    and grant_record.proof_hash = p_reauthentication_proof_hash
    and grant_record.consumed_at is null
    and grant_record.expires_at > pg_catalog.now()
  for update;
  if v_grant_id is null then
    raise exception using errcode = '28000', message = 'recent reauthentication is required';
  end if;

  select rate.allowed into v_allowed
  from private.consume_rate_limit(
    'account_deletion_request',
    extensions.digest(v_account_id::text, 'sha256'),
    3,
    900,
    pg_catalog.now()
  ) as rate;
  if not v_allowed then
    raise exception using errcode = 'P0001', message = 'request is rate limited';
  end if;

  update private.reauthentication_grants
  set consumed_at = pg_catalog.now()
  where id = v_grant_id;

  insert into public.privacy_requests (
    account_id, request_type, status, idempotency_key
  ) values (
    v_account_id, 'deletion', 'queued', p_idempotency_key
  ) returning id into v_request_id;

  insert into public.deletion_jobs (
    privacy_request_id,
    account_id,
    status,
    execute_after
  ) values (
    v_request_id,
    v_account_id,
    'queued',
    pg_catalog.now() + pg_catalog.make_interval(days => p_grace_period_days)
  ) returning id into v_job_id;

  update public.profiles set account_status = 'pending_deletion' where id = v_account_id;
  update public.profile_sessions set
    revoked_at = coalesce(revoked_at, pg_catalog.now()),
    revoke_reason = coalesce(revoke_reason, 'account deletion requested')
  where account_id = v_account_id and revoked_at is null;

  perform private.write_audit_event(
    'account', v_account_id, null, null,
    'privacy.deletion_requested', 'deletion_job', v_job_id,
    p_idempotency_key, '{}'::jsonb
  );
  return v_job_id;
end;
$function$;

create or replace function public.cancel_account_deletion(
  p_deletion_job_id uuid,
  p_idempotency_key uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := auth.uid();
  v_request_id uuid;
begin
  if v_account_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;

  select privacy_request_id into v_request_id
  from public.deletion_jobs
  where id = p_deletion_job_id
    and account_id = v_account_id
    and status in ('queued', 'cancelled')
  for update;
  if v_request_id is null then
    raise exception using errcode = '42501', message = 'deletion request cannot be cancelled';
  end if;

  update public.deletion_jobs set
    status = 'cancelled',
    cancelled_at = coalesce(cancelled_at, pg_catalog.now())
  where id = p_deletion_job_id;
  update public.privacy_requests set
    status = 'cancelled',
    completed_at = coalesce(completed_at, pg_catalog.now())
  where id = v_request_id;
  update public.profiles set account_status = 'active'
  where id = v_account_id and account_status = 'pending_deletion';

  perform private.write_audit_event(
    'account', v_account_id, null, null,
    'privacy.deletion_cancelled', 'deletion_job', p_deletion_job_id,
    p_idempotency_key, '{}'::jsonb
  );
  return true;
end;
$function$;

create or replace function public.admin_consume_rate_limit(
  p_scope text,
  p_subject_hash bytea,
  p_limit integer,
  p_window_seconds integer,
  p_now timestamptz default pg_catalog.now()
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language sql
volatile
security definer
set search_path = ''
as $function$
  select * from private.consume_rate_limit(
    p_scope,
    p_subject_hash,
    p_limit,
    p_window_seconds,
    p_now
  );
$function$;

create or replace function public.admin_create_guest_session(
  p_game_reference text,
  p_nickname text,
  p_reconnect_token_hash bytea,
  p_expires_at timestamptz,
  p_subject_hash bytea,
  p_idempotency_key uuid
)
returns table (guest_session_id uuid, nickname text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_guest public.guest_sessions;
  v_allowed boolean;
begin
  if p_expires_at <= pg_catalog.now()
    or p_expires_at > pg_catalog.now() + interval '24 hours'
    or pg_catalog.octet_length(p_reconnect_token_hash) <> 32 then
    raise exception using errcode = '22023', message = 'invalid guest session';
  end if;

  select * into v_guest from public.guest_sessions
  where idempotency_key = p_idempotency_key;
  if found then
    return query select v_guest.id, v_guest.nickname, v_guest.expires_at;
    return;
  end if;

  select rate.allowed into v_allowed
  from private.consume_rate_limit(
    'guest_session_create', p_subject_hash, 20, 900, pg_catalog.now()
  ) as rate;
  if not v_allowed then
    raise exception using errcode = 'P0001', message = 'request is rate limited';
  end if;

  insert into public.guest_sessions (
    game_reference,
    nickname,
    reconnect_token_hash,
    status,
    expires_at,
    idempotency_key
  ) values (
    pg_catalog.btrim(p_game_reference),
    pg_catalog.btrim(p_nickname),
    p_reconnect_token_hash,
    'issued',
    p_expires_at,
    p_idempotency_key
  ) returning * into v_guest;

  perform private.write_audit_event(
    'guest', null, null, v_guest.id,
    'guest.session_created', 'guest_session', v_guest.id,
    p_idempotency_key,
    pg_catalog.jsonb_build_object('game_reference', v_guest.game_reference)
  );
  return query select v_guest.id, v_guest.nickname, v_guest.expires_at;
end;
$function$;

create or replace function public.redeem_guest_session(p_reconnect_token_hash bytea)
returns table (
  guest_session_id uuid,
  game_reference text,
  nickname text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.guest_sessions as guest set
    status = 'expired',
    revoked_at = coalesce(guest.revoked_at, pg_catalog.now())
  where guest.reconnect_token_hash = p_reconnect_token_hash
    and guest.expires_at <= pg_catalog.now()
    and guest.status <> 'expired';

  return query
  update public.guest_sessions as guest set
    status = 'active',
    redeemed_at = coalesce(guest.redeemed_at, pg_catalog.now()),
    last_seen_at = pg_catalog.now()
  where guest.reconnect_token_hash = p_reconnect_token_hash
    and guest.status in ('issued', 'active')
    and guest.revoked_at is null
    and guest.expires_at > pg_catalog.now()
  returning guest.id, guest.game_reference, guest.nickname, guest.expires_at;
end;
$function$;

create or replace function public.admin_purge_expired_guest_sessions(
  p_before timestamptz default pg_catalog.now()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deleted bigint;
begin
  delete from public.guest_sessions
  where expires_at <= p_before or status in ('revoked', 'expired');
  get diagnostics v_deleted = row_count;

  delete from private.rate_limit_buckets where expires_at <= p_before;
  return v_deleted;
end;
$function$;

create or replace function public.admin_record_audit_event(
  p_actor_type public.audit_actor_type,
  p_actor_account_id uuid,
  p_actor_learner_profile_id uuid,
  p_actor_guest_session_id uuid,
  p_event_type text,
  p_target_type text,
  p_target_id uuid,
  p_correlation_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $function$
  select private.write_audit_event(
    p_actor_type,
    p_actor_account_id,
    p_actor_learner_profile_id,
    p_actor_guest_session_id,
    p_event_type,
    p_target_type,
    p_target_id,
    p_correlation_id,
    p_metadata
  );
$function$;

create policy profiles_select_self
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy privacy_preferences_select_self
on public.privacy_preferences for select to authenticated
using (account_id = (select auth.uid()));

create policy account_capabilities_select_self
on public.account_capabilities for select to authenticated
using (account_id = (select auth.uid()));

create policy learner_profiles_select_authorized
on public.learner_profiles for select to authenticated
using (
  private.can_access_learner_profile(
    (select auth.uid()),
    id,
    'view'
  )
);

create policy learner_profile_access_select_authorized
on public.learner_profile_access for select to authenticated
using (
  account_id = (select auth.uid())
  or private.can_access_learner_profile(
    (select auth.uid()),
    learner_profile_id,
    'manage'
  )
);

create policy guardian_relationships_select_authorized
on public.guardian_relationships for select to authenticated
using (
  guardian_account_id = (select auth.uid())
  or private.can_access_learner_profile(
    (select auth.uid()),
    learner_profile_id,
    'manage'
  )
);

create policy consent_records_select_authorized
on public.consent_records for select to authenticated
using (
  guardian_account_id = (select auth.uid())
  or private.can_access_learner_profile(
    (select auth.uid()),
    learner_profile_id,
    'manage_consent'
  )
);

create policy devices_select_self
on public.devices for select to authenticated
using (account_id = (select auth.uid()));

create policy profile_sessions_select_self
on public.profile_sessions for select to authenticated
using (account_id = (select auth.uid()));

create policy privacy_requests_select_self
on public.privacy_requests for select to authenticated
using (account_id = (select auth.uid()));

create policy data_export_jobs_select_self
on public.data_export_jobs for select to authenticated
using (account_id = (select auth.uid()));

create policy deletion_jobs_select_self
on public.deletion_jobs for select to authenticated
using (account_id = (select auth.uid()));

revoke execute on all functions in schema public from public, anon, authenticated, service_role;
revoke execute on all functions in schema private from public, anon, authenticated, service_role;

-- Stored RLS policy expressions need EXECUTE on their bound helper OID. The
-- private schema remains without USAGE, so the helper is not directly callable
-- or exposed through PostgREST.
grant execute on function private.can_access_learner_profile(
  uuid,
  uuid,
  public.learner_permission
) to authenticated;

grant select on public.profiles to authenticated;
grant select on public.privacy_preferences to authenticated;
grant select on public.account_capabilities to authenticated;
grant select on public.learner_profiles to authenticated;
grant select on public.learner_profile_access to authenticated;
grant select on public.guardian_relationships to authenticated;
grant select on public.consent_records to authenticated;
grant select on public.devices to authenticated;
grant select (
  id,
  account_id,
  learner_profile_id,
  device_id,
  expires_at,
  created_at,
  last_used_at,
  revoked_at,
  revoke_reason,
  idempotency_key
) on public.profile_sessions to authenticated;
grant select on public.privacy_requests to authenticated;
grant select on public.data_export_jobs to authenticated;
grant select on public.deletion_jobs to authenticated;

grant execute on function public.ensure_current_account() to authenticated;
grant execute on function public.complete_current_account_onboarding(
  text,
  text,
  text,
  text,
  smallint,
  public.age_band,
  text[],
  public.theme_preference,
  boolean,
  boolean,
  text,
  uuid
) to authenticated;
grant execute on function public.update_current_profile(
  text,
  text,
  text,
  text,
  smallint,
  text[],
  public.theme_preference,
  boolean,
  boolean,
  text,
  uuid
) to authenticated;
grant execute on function public.update_current_privacy_preferences(
  boolean,
  boolean,
  boolean,
  boolean,
  uuid
) to authenticated;
grant execute on function public.get_observed_learner_profiles() to authenticated;
grant execute on function public.request_data_export(uuid) to authenticated;
grant execute on function public.cancel_account_deletion(uuid, uuid) to authenticated;
grant execute on function public.redeem_guest_session(bytea) to anon, authenticated;

grant execute on function public.admin_create_child_learner(
  uuid,
  text,
  text,
  public.age_band,
  text,
  public.consent_type,
  text,
  jsonb,
  public.consent_verification_method,
  text,
  uuid
) to service_role;
grant execute on function public.admin_create_school_managed_learner(
  uuid,
  uuid,
  text,
  text,
  public.age_band,
  text,
  jsonb,
  uuid
) to service_role;
grant execute on function public.admin_grant_learner_access(
  uuid,
  uuid,
  uuid,
  public.learner_access_role,
  public.learner_permission[],
  uuid
) to service_role;
grant execute on function public.admin_revoke_learner_access(uuid, uuid, uuid) to service_role;
grant execute on function public.admin_update_learner_profile(
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  uuid
) to service_role;
grant execute on function public.admin_register_device(uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.admin_revoke_device(uuid, uuid, uuid) to service_role;
grant execute on function public.admin_set_learner_profile_credentials(
  uuid,
  uuid,
  text,
  text,
  uuid
) to service_role;
grant execute on function public.admin_verify_learner_profile_credentials(
  uuid,
  text,
  text,
  bytea
) to service_role;
grant execute on function public.admin_create_profile_session(
  uuid,
  uuid,
  uuid,
  bytea,
  timestamptz,
  uuid
) to service_role;
grant execute on function public.admin_create_profile_session_with_credentials(
  uuid,
  text,
  text,
  bytea,
  uuid,
  bytea,
  timestamptz,
  uuid
) to service_role;
grant execute on function public.admin_resolve_profile_session(bytea) to service_role;
grant execute on function public.admin_revoke_profile_session(uuid, uuid, text, uuid) to service_role;
grant execute on function public.admin_record_consent(
  uuid,
  uuid,
  public.consent_type,
  text,
  jsonb,
  public.consent_verification_method,
  text,
  uuid
) to service_role;
grant execute on function public.admin_revoke_consent(uuid, uuid, text, uuid) to service_role;
grant execute on function public.admin_issue_reauthentication_grant(
  uuid,
  public.reauthentication_purpose,
  bytea,
  timestamptz,
  uuid
) to service_role;
grant execute on function public.admin_request_account_deletion(
  uuid,
  bytea,
  integer,
  uuid
) to service_role;
grant execute on function public.admin_consume_rate_limit(
  text,
  bytea,
  integer,
  integer,
  timestamptz
) to service_role;
grant execute on function public.admin_create_guest_session(
  text,
  text,
  bytea,
  timestamptz,
  bytea,
  uuid
) to service_role;
grant execute on function public.admin_purge_expired_guest_sessions(timestamptz) to service_role;
grant execute on function public.admin_record_audit_event(
  public.audit_actor_type,
  uuid,
  uuid,
  uuid,
  text,
  text,
  uuid,
  uuid,
  jsonb
) to service_role;

comment on function public.admin_create_child_learner(
  uuid,
  text,
  text,
  public.age_band,
  text,
  public.consent_type,
  text,
  jsonb,
  public.consent_verification_method,
  text,
  uuid
) is
  'Service-only. The application must enforce deployment capability and consent-mode gates before calling.';
comment on function public.admin_create_guest_session(
  text,
  text,
  bytea,
  timestamptz,
  bytea,
  uuid
) is
  'Service-only. A game-admission adapter must validate game_reference before calling.';

commit;
