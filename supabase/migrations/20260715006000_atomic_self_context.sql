-- Keep account-level mutations and the managed-learner switch boundary in the
-- same database transaction. Authenticated wrappers derive the actor from the
-- verified JWT instead of accepting an account ID from the caller.

create or replace function private.assert_current_self_context()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := auth.uid();
  v_auth_session_id uuid := private.current_auth_session_id();
begin
  if v_account_id is null or v_auth_session_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;

  -- Profile-session creation takes this same lock. Holding it for the whole
  -- mutation prevents a managed-mode switch between authorization and write.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'managed-session:' || v_account_id::text || ':' || v_auth_session_id::text,
      0
    )
  );

  perform 1
  from public.profiles as profile
  where profile.id = v_account_id
    and profile.auth_subject_id = v_account_id
    and profile.account_status in ('onboarding', 'active', 'pending_deletion')
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'account context is unavailable';
  end if;

  if not exists(
    select 1
    from public.devices as device
    where device.account_id = v_account_id
      and device.auth_session_id = v_auth_session_id
      and device.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = 'device session is unavailable';
  end if;

  -- An unrevoked row remains a lock even after the short study window expires.
  if exists(
    select 1
    from public.profile_sessions as session
    join public.learner_profiles as learner on learner.id = session.learner_profile_id
    where session.account_id = v_account_id
      and session.auth_session_id = v_auth_session_id
      and session.revoked_at is null
      and learner.kind <> 'self'
  ) then
    raise exception using errcode = '42501', message = 'managed learner context is active';
  end if;

  return v_account_id;
end;
$function$;

create or replace function private.consume_current_reauthentication_grant(
  p_account_id uuid,
  p_purpose public.reauthentication_purpose,
  p_proof_hash bytea
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_grant_id uuid;
begin
  select grant_record.id into v_grant_id
  from private.reauthentication_grants as grant_record
  where grant_record.account_id = p_account_id
    and grant_record.purpose = p_purpose
    and grant_record.proof_hash = p_proof_hash
    and grant_record.consumed_at is null
    and grant_record.expires_at > pg_catalog.now()
  for update;
  if v_grant_id is null then
    raise exception using errcode = '28000', message = 'recent reauthentication is required';
  end if;
  update private.reauthentication_grants
  set consumed_at = pg_catalog.now()
  where id = v_grant_id;
end;
$function$;

revoke all on function private.assert_current_self_context() from public, anon, authenticated, service_role;
revoke all on function private.consume_current_reauthentication_grant(uuid, public.reauthentication_purpose, bytea) from public, anon, authenticated, service_role;

create or replace function public.current_complete_account_onboarding(
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
  v_account_id uuid := private.assert_current_self_context();
begin
  return public.admin_complete_current_account_onboarding(
    v_account_id, p_display_name, p_handle, p_locale, p_timezone,
    p_study_day_start, p_age_band, p_learning_goals, p_theme,
    p_reduced_motion, p_serious_mode, p_reading_style, p_idempotency_key
  );
end;
$function$;

create or replace function public.current_update_profile(
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
  v_account_id uuid := private.assert_current_self_context();
begin
  return public.admin_update_current_profile(
    v_account_id, p_display_name, p_handle, p_locale, p_timezone,
    p_study_day_start, p_learning_goals, p_theme, p_reduced_motion,
    p_serious_mode, p_reading_style, p_idempotency_key
  );
end;
$function$;

create or replace function public.current_update_privacy_preferences(
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
  v_account_id uuid := private.assert_current_self_context();
begin
  return public.admin_update_current_privacy_preferences(
    v_account_id, p_first_party_analytics, p_allow_product_updates,
    p_allow_social_interactions, p_default_content_private, p_idempotency_key
  );
end;
$function$;

create or replace function public.current_request_data_export(p_idempotency_key uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_current_self_context();
begin
  return public.admin_request_data_export(v_account_id, p_idempotency_key);
end;
$function$;

create or replace function public.current_create_child_learner_configured(
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
  v_account_id uuid := private.assert_current_self_context();
begin
  return public.admin_create_child_learner_configured(
    v_account_id, p_display_name, p_pseudonym, p_age_band, p_avatar_seed,
    p_consent_type, p_policy_version, p_consent_scope, p_verification_method,
    p_evidence_reference, p_settings, p_idempotency_key
  );
end;
$function$;

create or replace function public.current_update_learner_profile(
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
  v_account_id uuid := private.assert_current_self_context();
begin
  return public.admin_update_learner_profile(
    v_account_id, p_learner_profile_id, p_display_name, p_pseudonym,
    p_avatar_seed, p_settings, p_idempotency_key
  );
end;
$function$;

create or replace function public.current_configure_learner_profile_access(
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
  v_account_id uuid := private.assert_current_self_context();
begin
  return public.admin_configure_learner_profile_access(
    v_account_id, p_learner_profile_id, p_pin, p_family_code,
    p_lock_after_minutes, p_reauthentication_proof_hash, p_idempotency_key
  );
end;
$function$;

create or replace function public.current_revoke_device(
  p_device_id uuid,
  p_reauthentication_proof_hash bytea,
  p_idempotency_key uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_current_self_context();
  v_target_auth_session_id uuid;
begin
  select device.auth_session_id into v_target_auth_session_id
  from public.devices as device
  where device.id = p_device_id and device.account_id = v_account_id
  for update;
  if v_target_auth_session_id is null then
    raise exception using errcode = '42501', message = 'device cannot be revoked';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'managed-session:' || v_account_id::text || ':' || v_target_auth_session_id::text,
      0
    )
  );
  perform private.consume_current_reauthentication_grant(
    v_account_id, 'security_change', p_reauthentication_proof_hash
  );
  return public.admin_revoke_device(v_account_id, p_device_id, p_idempotency_key);
end;
$function$;

create or replace function public.current_revoke_consent(
  p_consent_record_id uuid,
  p_reason text,
  p_reauthentication_proof_hash bytea,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_current_self_context();
begin
  perform private.consume_current_reauthentication_grant(
    v_account_id, 'security_change', p_reauthentication_proof_hash
  );
  return public.admin_revoke_consent(
    v_account_id, p_consent_record_id, p_reason, p_idempotency_key
  );
end;
$function$;

create or replace function public.current_request_account_deletion(
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
  v_account_id uuid := private.assert_current_self_context();
begin
  return public.admin_request_account_deletion(
    v_account_id, p_reauthentication_proof_hash, p_grace_period_days,
    p_idempotency_key
  );
end;
$function$;

create or replace function public.current_cancel_account_deletion(
  p_deletion_job_id uuid,
  p_reauthentication_proof_hash bytea,
  p_idempotency_key uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_current_self_context();
begin
  return public.admin_cancel_account_deletion(
    v_account_id, p_deletion_job_id, p_reauthentication_proof_hash,
    p_idempotency_key
  );
end;
$function$;

-- Restore the teacher/observer projection while respecting the same revoked
-- device and managed-mode boundary as direct table reads.
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
    and learner.status <> 'deleted'
    and not private.is_managed_auth_session_locked(auth.uid())
    and not private.is_current_auth_session_revoked(auth.uid());
$function$;

revoke all on function public.current_complete_account_onboarding(text, text, text, text, smallint, public.age_band, text[], public.theme_preference, boolean, boolean, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.current_update_profile(text, text, text, text, smallint, text[], public.theme_preference, boolean, boolean, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.current_update_privacy_preferences(boolean, boolean, boolean, boolean, uuid) from public, anon, authenticated, service_role;
revoke all on function public.current_request_data_export(uuid) from public, anon, authenticated, service_role;
revoke all on function public.current_create_child_learner_configured(text, text, public.age_band, text, public.consent_type, text, jsonb, public.consent_verification_method, text, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function public.current_update_learner_profile(uuid, text, text, text, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function public.current_configure_learner_profile_access(uuid, text, text, integer, bytea, uuid) from public, anon, authenticated, service_role;
revoke all on function public.current_revoke_device(uuid, bytea, uuid) from public, anon, authenticated, service_role;
revoke all on function public.current_revoke_consent(uuid, text, bytea, uuid) from public, anon, authenticated, service_role;
revoke all on function public.current_request_account_deletion(bytea, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.current_cancel_account_deletion(uuid, bytea, uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_observed_learner_profiles() from public, anon, authenticated, service_role;

grant execute on function public.current_complete_account_onboarding(text, text, text, text, smallint, public.age_band, text[], public.theme_preference, boolean, boolean, text, uuid) to authenticated;
grant execute on function public.current_update_profile(text, text, text, text, smallint, text[], public.theme_preference, boolean, boolean, text, uuid) to authenticated;
grant execute on function public.current_update_privacy_preferences(boolean, boolean, boolean, boolean, uuid) to authenticated;
grant execute on function public.current_request_data_export(uuid) to authenticated;
grant execute on function public.current_create_child_learner_configured(text, text, public.age_band, text, public.consent_type, text, jsonb, public.consent_verification_method, text, jsonb, uuid) to authenticated;
grant execute on function public.current_update_learner_profile(uuid, text, text, text, jsonb, uuid) to authenticated;
grant execute on function public.current_configure_learner_profile_access(uuid, text, text, integer, bytea, uuid) to authenticated;
grant execute on function public.current_revoke_device(uuid, bytea, uuid) to authenticated;
grant execute on function public.current_revoke_consent(uuid, text, bytea, uuid) to authenticated;
grant execute on function public.current_request_account_deletion(bytea, integer, uuid) to authenticated;
grant execute on function public.current_cancel_account_deletion(uuid, bytea, uuid) to authenticated;
grant execute on function public.get_observed_learner_profiles() to authenticated;

comment on function private.assert_current_self_context() is
  'Atomically verifies the JWT account, active device session, and absence of a managed-learner lock.';
