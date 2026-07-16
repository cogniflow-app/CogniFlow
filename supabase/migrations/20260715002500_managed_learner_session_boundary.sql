-- Bind managed-learner mode to the verified Supabase Auth session. The lock
-- remains in force after the short study window expires until a guardian
-- explicitly reauthenticates and exits.

alter table public.devices add column auth_session_id uuid;
update public.devices set auth_session_id = id where auth_session_id is null;
alter table public.devices alter column auth_session_id set not null;
create unique index devices_account_auth_session_idx
on public.devices (account_id, auth_session_id);

alter table public.profile_sessions add column auth_session_id uuid;
update public.profile_sessions set
  revoked_at = coalesce(revoked_at, pg_catalog.now()),
  revoke_reason = coalesce(revoke_reason, 'session-boundary upgrade'),
  auth_session_id = id
where auth_session_id is null;
alter table public.profile_sessions alter column auth_session_id set not null;
create unique index profile_sessions_account_auth_session_active_idx
on public.profile_sessions (account_id, auth_session_id)
where revoked_at is null;

comment on column public.devices.auth_session_id is
  'Verified Supabase Auth session UUID bound to this application device registration.';
comment on column public.profile_sessions.auth_session_id is
  'Verified Supabase Auth session UUID that remains managed-mode locked until guardian exit.';

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
      or new.auth_session_id <> old.auth_session_id
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

create or replace function private.current_auth_session_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_value text := auth.jwt() ->> 'session_id';
begin
  if v_value is null or v_value !~ '^[0-9a-fA-F-]{36}$' then
    return null;
  end if;
  return v_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$function$;

create or replace function private.is_managed_auth_session_locked(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
    from public.profile_sessions as session
    join public.learner_profiles as learner on learner.id = session.learner_profile_id
    where session.account_id = p_account_id
      and session.auth_session_id = private.current_auth_session_id()
      and session.revoked_at is null
      and learner.kind <> 'self'
  );
$function$;

create or replace function private.current_managed_learner_id(p_account_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select session.learner_profile_id
  from public.profile_sessions as session
  join public.learner_profiles as learner on learner.id = session.learner_profile_id
  where session.account_id = p_account_id
    and session.auth_session_id = private.current_auth_session_id()
    and session.revoked_at is null
    and learner.kind <> 'self'
  order by session.created_at desc
  limit 1;
$function$;

create or replace function private.is_current_auth_session_revoked(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
    from public.devices as device
    where device.account_id = p_account_id
      and device.auth_session_id = private.current_auth_session_id()
      and device.revoked_at is not null
  );
$function$;

revoke execute on function private.current_auth_session_id() from public, anon, authenticated, service_role;
revoke execute on function private.is_managed_auth_session_locked(uuid) from public, anon, authenticated, service_role;
revoke execute on function private.current_managed_learner_id(uuid) from public, anon, authenticated, service_role;
revoke execute on function private.is_current_auth_session_revoked(uuid) from public, anon, authenticated, service_role;
grant execute on function private.current_auth_session_id() to authenticated;
grant execute on function private.is_managed_auth_session_locked(uuid) to authenticated;
grant execute on function private.current_managed_learner_id(uuid) to authenticated;
grant execute on function private.is_current_auth_session_revoked(uuid) to authenticated;

drop policy profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles for select to authenticated using (
  id = (select auth.uid())
  and not private.is_managed_auth_session_locked((select auth.uid()))
  and not private.is_current_auth_session_revoked((select auth.uid()))
);
drop policy privacy_preferences_select_self on public.privacy_preferences;
create policy privacy_preferences_select_self on public.privacy_preferences for select to authenticated using (
  account_id = (select auth.uid())
  and not private.is_managed_auth_session_locked((select auth.uid()))
  and not private.is_current_auth_session_revoked((select auth.uid()))
);
drop policy account_capabilities_select_self on public.account_capabilities;
create policy account_capabilities_select_self on public.account_capabilities for select to authenticated using (
  account_id = (select auth.uid())
  and not private.is_managed_auth_session_locked((select auth.uid()))
  and not private.is_current_auth_session_revoked((select auth.uid()))
);
drop policy learner_profiles_select_authorized on public.learner_profiles;
create policy learner_profiles_select_authorized on public.learner_profiles for select to authenticated using (
  not private.is_current_auth_session_revoked((select auth.uid()))
  and case
    when private.is_managed_auth_session_locked((select auth.uid()))
      then id = private.current_managed_learner_id((select auth.uid()))
    else private.can_access_learner_profile((select auth.uid()), id, 'view')
  end
);
drop policy learner_profile_access_select_authorized on public.learner_profile_access;
create policy learner_profile_access_select_authorized on public.learner_profile_access for select to authenticated using (
  not private.is_managed_auth_session_locked((select auth.uid()))
  and not private.is_current_auth_session_revoked((select auth.uid()))
  and (
    account_id = (select auth.uid())
    or private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'manage')
  )
);
drop policy guardian_relationships_select_authorized on public.guardian_relationships;
create policy guardian_relationships_select_authorized on public.guardian_relationships for select to authenticated using (
  not private.is_managed_auth_session_locked((select auth.uid()))
  and not private.is_current_auth_session_revoked((select auth.uid()))
  and (
    guardian_account_id = (select auth.uid())
    or private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'manage')
  )
);
drop policy consent_records_select_authorized on public.consent_records;
create policy consent_records_select_authorized on public.consent_records for select to authenticated using (
  not private.is_managed_auth_session_locked((select auth.uid()))
  and not private.is_current_auth_session_revoked((select auth.uid()))
  and (
    guardian_account_id = (select auth.uid())
    or private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'manage_consent')
  )
);
drop policy devices_select_self on public.devices;
create policy devices_select_self on public.devices for select to authenticated using (
  account_id = (select auth.uid())
  and not private.is_managed_auth_session_locked((select auth.uid()))
  and not private.is_current_auth_session_revoked((select auth.uid()))
);
drop policy profile_sessions_select_self on public.profile_sessions;
create policy profile_sessions_select_self on public.profile_sessions for select to authenticated using (
  account_id = (select auth.uid())
  and not private.is_managed_auth_session_locked((select auth.uid()))
  and not private.is_current_auth_session_revoked((select auth.uid()))
);
drop policy privacy_requests_select_self on public.privacy_requests;
create policy privacy_requests_select_self on public.privacy_requests for select to authenticated using (
  account_id = (select auth.uid())
  and not private.is_managed_auth_session_locked((select auth.uid()))
  and not private.is_current_auth_session_revoked((select auth.uid()))
);
drop policy data_export_jobs_select_self on public.data_export_jobs;
create policy data_export_jobs_select_self on public.data_export_jobs for select to authenticated using (
  account_id = (select auth.uid())
  and not private.is_managed_auth_session_locked((select auth.uid()))
  and not private.is_current_auth_session_revoked((select auth.uid()))
);
drop policy deletion_jobs_select_self on public.deletion_jobs;
create policy deletion_jobs_select_self on public.deletion_jobs for select to authenticated using (
  account_id = (select auth.uid())
  and not private.is_managed_auth_session_locked((select auth.uid()))
  and not private.is_current_auth_session_revoked((select auth.uid()))
);

-- Authenticated callers can no longer bypass the server learner-context gate.
revoke execute on function public.ensure_current_account() from authenticated;
revoke execute on function public.complete_current_account_onboarding(text, text, text, text, smallint, public.age_band, text[], public.theme_preference, boolean, boolean, text, uuid) from authenticated;
revoke execute on function public.update_current_profile(text, text, text, text, smallint, text[], public.theme_preference, boolean, boolean, text, uuid) from authenticated;
revoke execute on function public.update_current_privacy_preferences(boolean, boolean, boolean, boolean, uuid) from authenticated;
revoke execute on function public.get_observed_learner_profiles() from authenticated;
revoke execute on function public.request_data_export(uuid) from authenticated;

create or replace function public.admin_ensure_account(p_actor_account_id uuid)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $function$
  select private.provision_account(p_actor_account_id);
$function$;

create or replace function public.admin_complete_current_account_onboarding(
  p_actor_account_id uuid,
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
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = p_actor_account_id for update;
  if not found or v_profile.account_status not in ('onboarding', 'active') then
    raise exception using errcode = '42501', message = 'account cannot complete onboarding';
  end if;
  if v_profile.account_status = 'active' and v_profile.onboarding_completed_at is not null then
    return v_profile;
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub', p_actor_account_id::text, true);
  return public.complete_current_account_onboarding(
    p_display_name, p_handle, p_locale, p_timezone, p_study_day_start, p_age_band,
    p_learning_goals, p_theme, p_reduced_motion, p_serious_mode, p_reading_style,
    p_idempotency_key
  );
end;
$function$;

create or replace function public.admin_update_current_profile(
  p_actor_account_id uuid,
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
begin
  if not exists(select 1 from public.profiles where id = p_actor_account_id and account_status = 'active') then
    raise exception using errcode = '42501', message = 'profile cannot be updated';
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub', p_actor_account_id::text, true);
  return public.update_current_profile(
    p_display_name, p_handle, p_locale, p_timezone, p_study_day_start,
    p_learning_goals, p_theme, p_reduced_motion, p_serious_mode, p_reading_style,
    p_idempotency_key
  );
end;
$function$;

create or replace function public.admin_update_current_privacy_preferences(
  p_actor_account_id uuid,
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
begin
  if not exists(select 1 from public.profiles where id = p_actor_account_id and account_status = 'active') then
    raise exception using errcode = '42501', message = 'privacy preferences cannot be updated';
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub', p_actor_account_id::text, true);
  return public.update_current_privacy_preferences(
    p_first_party_analytics, p_allow_product_updates, p_allow_social_interactions,
    p_default_content_private, p_idempotency_key
  );
end;
$function$;

create or replace function public.admin_request_data_export(
  p_actor_account_id uuid,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists(select 1 from public.profiles where id = p_actor_account_id and account_status in ('active', 'pending_deletion')) then
    raise exception using errcode = '42501', message = 'data export cannot be requested';
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub', p_actor_account_id::text, true);
  return public.request_data_export(p_idempotency_key);
end;
$function$;

-- Replace device and profile-session creation with auth-session-bound variants.
revoke all on function public.admin_register_device(uuid, uuid, text, text, uuid) from public, anon, authenticated, service_role;
drop function public.admin_register_device(uuid, uuid, text, text, uuid);

create or replace function public.admin_register_device(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
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
  if p_auth_session_id is null or not exists(
    select 1 from public.profiles
    where id = p_actor_account_id and account_status in ('onboarding', 'active', 'pending_deletion')
  ) then
    raise exception using errcode = '42501', message = 'device cannot be registered';
  end if;
  insert into public.devices (
    id, account_id, auth_session_id, display_name, platform, idempotency_key
  ) values (
    p_device_id, p_actor_account_id, p_auth_session_id,
    pg_catalog.btrim(p_display_name), pg_catalog.btrim(p_platform), p_idempotency_key
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    platform = excluded.platform,
    last_seen_at = pg_catalog.now()
  where devices.account_id = excluded.account_id
    and devices.auth_session_id = excluded.auth_session_id
    and devices.revoked_at is null
  returning * into v_device;
  if v_device.id is null then
    raise exception using errcode = '42501', message = 'device cannot be registered';
  end if;
  perform private.write_audit_event(
    'account', p_actor_account_id, null, null,
    'account.device_registered', 'device', v_device.id,
    p_idempotency_key, '{}'::jsonb
  );
  return v_device;
end;
$function$;

revoke all on function public.admin_create_profile_session_with_credentials(uuid, text, text, bytea, uuid, bytea, timestamptz, uuid) from public, anon, authenticated, service_role;
drop function public.admin_create_profile_session_with_credentials(uuid, text, text, bytea, uuid, bytea, timestamptz, uuid);
revoke all on function public.admin_create_profile_session(uuid, uuid, uuid, bytea, timestamptz, uuid) from public, anon, authenticated, service_role;
drop function public.admin_create_profile_session(uuid, uuid, uuid, bytea, timestamptz, uuid);

create or replace function public.admin_create_profile_session(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_learner_profile_id uuid,
  p_device_id uuid,
  p_token_hash bytea,
  p_expires_at timestamptz,
  p_idempotency_key uuid
)
returns table (profile_session_id uuid, account_id uuid, learner_profile_id uuid, device_id uuid, expires_at timestamptz)
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
  if p_auth_session_id is null or p_device_id is null
    or p_expires_at <= pg_catalog.now()
    or p_expires_at > pg_catalog.now() + interval '30 minutes'
    or pg_catalog.octet_length(p_token_hash) <> 32 then
    raise exception using errcode = '22023', message = 'invalid profile session';
  end if;
  if not exists(
    select 1 from public.devices as device
    where device.id = p_device_id
      and device.account_id = p_actor_account_id
      and device.auth_session_id = p_auth_session_id
      and device.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = 'device is unavailable';
  end if;

  update public.profile_sessions set
    revoked_at = coalesce(revoked_at, pg_catalog.now()),
    revoke_reason = coalesce(revoke_reason, 'profile switched')
  where account_id = p_actor_account_id
    and auth_session_id = p_auth_session_id
    and revoked_at is null;

  insert into public.profile_sessions (
    account_id, auth_session_id, learner_profile_id, device_id,
    token_hash, expires_at, idempotency_key
  ) values (
    p_actor_account_id, p_auth_session_id, p_learner_profile_id, p_device_id,
    p_token_hash, p_expires_at, p_idempotency_key
  )
  on conflict on constraint profile_sessions_account_id_idempotency_key_key
  do update set account_id = excluded.account_id
  returning * into v_session;

  perform private.write_audit_event(
    'account', p_actor_account_id, p_learner_profile_id, null,
    'learner.profile_session_created', 'profile_session', v_session.id,
    p_idempotency_key, '{}'::jsonb
  );
  return query select v_session.id, v_session.account_id, v_session.learner_profile_id,
    v_session.device_id, v_session.expires_at;
end;
$function$;

create or replace function public.admin_create_profile_session_with_credentials(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_learner_profile_id uuid,
  p_family_code text,
  p_pin text,
  p_subject_hash bytea,
  p_device_id uuid,
  p_token_hash bytea,
  p_expires_at timestamptz,
  p_idempotency_key uuid
)
returns table (profile_session_id uuid, account_id uuid, learner_profile_id uuid, device_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not private.verify_learner_profile_credentials(
    p_learner_profile_id, p_family_code, p_pin, p_subject_hash, pg_catalog.now()
  ) then
    raise exception using errcode = '28000', message = 'profile credentials are invalid or rate limited';
  end if;
  if not exists(
    select 1 from public.learner_profiles
    where id = p_learner_profile_id
      and owner_account_id = p_actor_account_id
      and kind <> 'self'
      and status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'profile session cannot be created';
  end if;
  return query select * from public.admin_create_profile_session(
    p_actor_account_id, p_auth_session_id, p_learner_profile_id, p_device_id,
    p_token_hash, p_expires_at, p_idempotency_key
  );
end;
$function$;

create or replace function public.admin_get_managed_profile_session_context(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_token_hash bytea
)
returns table (
  profile_session_id uuid,
  learner_profile_id uuid,
  device_id uuid,
  expires_at timestamptz,
  token_matches boolean,
  is_active boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    session.id,
    session.learner_profile_id,
    session.device_id,
    session.expires_at,
    p_token_hash is not null and session.token_hash = p_token_hash,
    p_token_hash is not null
      and session.token_hash = p_token_hash
      and session.expires_at > pg_catalog.now()
      and session.device_id = p_device_id
      and learner.status = 'active'
      and account.account_status = 'active'
      and device.revoked_at is null
  from public.profile_sessions as session
  join public.learner_profiles as learner on learner.id = session.learner_profile_id
  join public.profiles as account on account.id = session.account_id
  join public.devices as device on device.id = session.device_id
  where session.account_id = p_actor_account_id
    and session.auth_session_id = p_auth_session_id
    and session.revoked_at is null
    and learner.kind <> 'self'
  order by session.created_at desc
  limit 1;
$function$;

create or replace function public.admin_guardian_exit_managed_session(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_reauthentication_proof_hash bytea,
  p_idempotency_key uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_grant_id uuid;
  v_profile_session_id uuid;
  v_learner_profile_id uuid;
begin
  if exists(
    select 1 from public.audit_events
    where actor_account_id = p_actor_account_id
      and event_type = 'learner.guardian_exit'
      and correlation_id = p_idempotency_key
  ) then
    return true;
  end if;
  select grant_record.id into v_grant_id
  from private.reauthentication_grants as grant_record
  where grant_record.account_id = p_actor_account_id
    and grant_record.purpose = 'security_change'
    and grant_record.proof_hash = p_reauthentication_proof_hash
    and grant_record.consumed_at is null
    and grant_record.expires_at > pg_catalog.now()
  for update;
  if v_grant_id is null then
    raise exception using errcode = '28000', message = 'recent reauthentication is required';
  end if;
  select session.id, session.learner_profile_id
  into v_profile_session_id, v_learner_profile_id
  from public.profile_sessions as session
  join public.learner_profiles as learner on learner.id = session.learner_profile_id
  where session.account_id = p_actor_account_id
    and session.auth_session_id = p_auth_session_id
    and session.revoked_at is null
    and learner.kind <> 'self'
  order by session.created_at desc
  limit 1
  for update of session;

  update private.reauthentication_grants set consumed_at = pg_catalog.now() where id = v_grant_id;
  if v_profile_session_id is not null then
    update public.profile_sessions set
      revoked_at = pg_catalog.now(),
      revoke_reason = 'guardian exit'
    where id = v_profile_session_id;
  end if;
  perform private.write_audit_event(
    'account', p_actor_account_id, v_learner_profile_id, null,
    'learner.guardian_exit', 'profile_session', v_profile_session_id,
    p_idempotency_key, '{}'::jsonb
  );
  return true;
end;
$function$;

create or replace function public.admin_create_child_learner_configured(
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
  p_settings jsonb,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_learner_id uuid;
begin
  if pg_catalog.jsonb_typeof(p_settings) <> 'object' then
    raise exception using errcode = '22023', message = 'settings must be an object';
  end if;
  if exists(
    select 1 from public.audit_events
    where actor_account_id = p_actor_account_id
      and event_type = 'learner.child_profile_configured'
      and correlation_id = p_idempotency_key
  ) then
    select learner_profile_id into v_learner_id
    from public.guardian_relationships
    where guardian_account_id = p_actor_account_id and idempotency_key = p_idempotency_key;
    return v_learner_id;
  end if;
  v_learner_id := public.admin_create_child_learner(
    p_actor_account_id, p_display_name, p_pseudonym, p_age_band, p_avatar_seed,
    p_consent_type, p_policy_version, p_consent_scope, p_verification_method,
    p_evidence_reference, p_idempotency_key
  );
  perform public.admin_update_learner_profile(
    p_actor_account_id, v_learner_id, p_display_name, p_pseudonym,
    p_avatar_seed, p_settings, p_idempotency_key
  );
  perform private.write_audit_event(
    'account', p_actor_account_id, v_learner_id, null,
    'learner.child_profile_configured', 'learner_profile', v_learner_id,
    p_idempotency_key, '{}'::jsonb
  );
  return v_learner_id;
end;
$function$;

create or replace function public.admin_configure_learner_profile_access(
  p_actor_account_id uuid,
  p_learner_profile_id uuid,
  p_pin text,
  p_family_code text,
  p_lock_after_minutes integer,
  p_reauthentication_proof_hash bytea,
  p_idempotency_key uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_grant_id uuid;
  v_learner public.learner_profiles;
  v_settings jsonb;
begin
  if exists(
    select 1 from public.audit_events
    where actor_account_id = p_actor_account_id
      and event_type = 'learner.profile_access_configured'
      and correlation_id = p_idempotency_key
  ) then
    return true;
  end if;
  if p_lock_after_minutes not between 5 and 30 then
    raise exception using errcode = '22023', message = 'invalid profile lock duration';
  end if;
  select grant_record.id into v_grant_id
  from private.reauthentication_grants as grant_record
  where grant_record.account_id = p_actor_account_id
    and grant_record.purpose = 'security_change'
    and grant_record.proof_hash = p_reauthentication_proof_hash
    and grant_record.consumed_at is null
    and grant_record.expires_at > pg_catalog.now()
  for update;
  if v_grant_id is null then
    raise exception using errcode = '28000', message = 'recent reauthentication is required';
  end if;
  select * into v_learner from public.learner_profiles
  where id = p_learner_profile_id and kind <> 'self' for update;
  if not found or not private.can_access_learner_profile(p_actor_account_id, p_learner_profile_id, 'manage') then
    raise exception using errcode = '42501', message = 'learner profile access cannot be configured';
  end if;
  update private.reauthentication_grants set consumed_at = pg_catalog.now() where id = v_grant_id;
  perform public.admin_set_learner_profile_credentials(
    p_actor_account_id, p_learner_profile_id, p_pin, p_family_code, p_idempotency_key
  );
  v_settings := pg_catalog.jsonb_set(
    coalesce(v_learner.settings, '{}'::jsonb),
    '{lock_after_minutes}', pg_catalog.to_jsonb(p_lock_after_minutes), true
  );
  perform public.admin_update_learner_profile(
    p_actor_account_id, p_learner_profile_id,
    coalesce(v_learner.display_name, v_learner.pseudonym), v_learner.pseudonym,
    v_learner.avatar_seed, v_settings, p_idempotency_key
  );
  perform private.write_audit_event(
    'account', p_actor_account_id, p_learner_profile_id, null,
    'learner.profile_access_configured', 'learner_profile', p_learner_profile_id,
    p_idempotency_key,
    pg_catalog.jsonb_build_object('lock_after_minutes', p_lock_after_minutes)
  );
  return true;
end;
$function$;

revoke all on function public.admin_ensure_account(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_complete_current_account_onboarding(uuid, text, text, text, text, smallint, public.age_band, text[], public.theme_preference, boolean, boolean, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_update_current_profile(uuid, text, text, text, text, smallint, text[], public.theme_preference, boolean, boolean, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_update_current_privacy_preferences(uuid, boolean, boolean, boolean, boolean, uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_request_data_export(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_register_device(uuid, uuid, uuid, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_create_profile_session(uuid, uuid, uuid, uuid, bytea, timestamptz, uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_create_profile_session_with_credentials(uuid, uuid, uuid, text, text, bytea, uuid, bytea, timestamptz, uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_get_managed_profile_session_context(uuid, uuid, uuid, bytea) from public, anon, authenticated, service_role;
revoke all on function public.admin_guardian_exit_managed_session(uuid, uuid, bytea, uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_create_child_learner_configured(uuid, text, text, public.age_band, text, public.consent_type, text, jsonb, public.consent_verification_method, text, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_configure_learner_profile_access(uuid, uuid, text, text, integer, bytea, uuid) from public, anon, authenticated, service_role;

grant execute on function public.admin_ensure_account(uuid) to service_role;
grant execute on function public.admin_complete_current_account_onboarding(uuid, text, text, text, text, smallint, public.age_band, text[], public.theme_preference, boolean, boolean, text, uuid) to service_role;
grant execute on function public.admin_update_current_profile(uuid, text, text, text, text, smallint, text[], public.theme_preference, boolean, boolean, text, uuid) to service_role;
grant execute on function public.admin_update_current_privacy_preferences(uuid, boolean, boolean, boolean, boolean, uuid) to service_role;
grant execute on function public.admin_request_data_export(uuid, uuid) to service_role;
grant execute on function public.admin_register_device(uuid, uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.admin_create_profile_session(uuid, uuid, uuid, uuid, bytea, timestamptz, uuid) to service_role;
grant execute on function public.admin_create_profile_session_with_credentials(uuid, uuid, uuid, text, text, bytea, uuid, bytea, timestamptz, uuid) to service_role;
grant execute on function public.admin_get_managed_profile_session_context(uuid, uuid, uuid, bytea) to service_role;
grant execute on function public.admin_guardian_exit_managed_session(uuid, uuid, bytea, uuid) to service_role;
grant execute on function public.admin_create_child_learner_configured(uuid, text, text, public.age_band, text, public.consent_type, text, jsonb, public.consent_verification_method, text, jsonb, uuid) to service_role;
grant execute on function public.admin_configure_learner_profile_access(uuid, uuid, text, text, integer, bytea, uuid) to service_role;
