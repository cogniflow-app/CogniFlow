-- A signed web cookie is a route boundary, not a database capability. Exchange
-- it for a short-lived, session-bound proof before activating an account.

create table private.onboarding_authorizations (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.profiles (id) on delete cascade,
  auth_session_id uuid not null,
  age_band public.age_band not null,
  proof_hash bytea,
  payload_hash bytea not null,
  expires_at timestamptz not null,
  issued_at timestamptz not null default pg_catalog.now(),
  issue_idempotency_key uuid not null,
  consumed_at timestamptz,
  consumption_idempotency_key uuid,
  constraint onboarding_authorizations_eligible_age check (age_band in ('teen', 'adult')),
  constraint onboarding_authorizations_proof_hash_length check (
    proof_hash is null or pg_catalog.octet_length(proof_hash) = 32
  ),
  constraint onboarding_authorizations_payload_hash_length check (
    pg_catalog.octet_length(payload_hash) = 32
  ),
  constraint onboarding_authorizations_distinct_hashes check (
    proof_hash is null or proof_hash <> payload_hash
  ),
  constraint onboarding_authorizations_short_lived check (
    expires_at > issued_at
    and expires_at <= issued_at + interval '10 minutes'
  ),
  constraint onboarding_authorizations_state_complete check (
    (
      consumed_at is null
      and consumption_idempotency_key is null
      and proof_hash is not null
    )
    or (
      consumed_at is not null
      and consumption_idempotency_key is not null
      and consumed_at >= issued_at
      and consumed_at <= expires_at
      and proof_hash is null
    )
  ),
  unique (proof_hash),
  unique (account_id, issue_idempotency_key)
);

create index onboarding_authorizations_account_session_expiry_idx
on private.onboarding_authorizations (account_id, auth_session_id, expires_at)
where proof_hash is not null;

create unique index onboarding_authorizations_consumption_idx
on private.onboarding_authorizations (account_id, consumption_idempotency_key)
where consumption_idempotency_key is not null;

create or replace function private.guard_authorization_finalization()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if old.proof_hash is null then
    raise exception using errcode = '55000', message = 'authorization is already finalized';
  end if;
  if new.id is distinct from old.id
    or new.account_id is distinct from old.account_id
    or new.auth_session_id is distinct from old.auth_session_id
    or new.payload_hash is distinct from old.payload_hash
    or new.expires_at is distinct from old.expires_at
    or new.issued_at is distinct from old.issued_at
    or new.issue_idempotency_key is distinct from old.issue_idempotency_key
    or new.proof_hash is not null
    or new.consumed_at is null
    or new.consumption_idempotency_key is null then
    raise exception using errcode = '55000', message = 'authorization finalization is invalid';
  end if;
  return new;
end;
$function$;

create trigger onboarding_authorizations_guard
before update on private.onboarding_authorizations
for each row execute function private.guard_authorization_finalization();

create trigger child_creation_authorizations_guard
before update on private.child_creation_authorizations
for each row execute function private.guard_authorization_finalization();

create or replace function private.onboarding_payload_hash(
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
returns bytea
language sql
immutable
security invoker
set search_path = ''
as $function$
  select extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'age_band', p_age_band::text,
        'display_name', pg_catalog.btrim(p_display_name),
        'handle', pg_catalog.lower(pg_catalog.btrim(p_handle)),
        'idempotency_key', p_idempotency_key::text,
        'learning_goals', pg_catalog.to_jsonb(p_learning_goals),
        'locale', pg_catalog.btrim(p_locale),
        'reading_style', p_reading_style,
        'reduced_motion', p_reduced_motion,
        'serious_mode', p_serious_mode,
        'study_day_start', p_study_day_start,
        'theme', p_theme::text,
        'timezone', p_timezone
      )::text,
      'UTF8'
    ),
    'sha256'
  );
$function$;

create or replace function public.admin_issue_onboarding_authorization(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
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
  p_proof_hash bytea,
  p_expires_at timestamptz,
  p_completion_idempotency_key uuid,
  p_issue_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_authorization private.onboarding_authorizations;
  v_payload_hash bytea;
  v_now timestamptz := pg_catalog.now();
begin
  if p_actor_account_id is null
    or p_auth_session_id is null
    or p_age_band not in ('teen', 'adult')
    or p_completion_idempotency_key is null
    or p_issue_idempotency_key is null
    or pg_catalog.octet_length(p_proof_hash) <> 32
    or p_expires_at <= v_now
    or p_expires_at > v_now + interval '10 minutes' then
    raise exception using errcode = '22023', message = 'invalid onboarding authorization';
  end if;

  v_payload_hash := private.onboarding_payload_hash(
    p_display_name,
    p_handle,
    p_locale,
    p_timezone,
    p_study_day_start,
    p_age_band,
    p_learning_goals,
    p_theme,
    p_reduced_motion,
    p_serious_mode,
    p_reading_style,
    p_completion_idempotency_key
  );
  if v_payload_hash = p_proof_hash then
    raise exception using errcode = '22023', message = 'invalid onboarding authorization';
  end if;

  if not exists(
      select 1
      from public.profiles as profile
      where profile.id = p_actor_account_id
        and profile.auth_subject_id = p_actor_account_id
        and profile.account_status = 'onboarding'
        and profile.onboarding_completed_at is null
    )
    or not exists(
      select 1
      from auth.sessions as session
      where session.id = p_auth_session_id
        and session.user_id = p_actor_account_id
        and (session.not_after is null or session.not_after > v_now)
    )
    or not exists(
      select 1
      from public.devices as device
      where device.account_id = p_actor_account_id
        and device.auth_session_id = p_auth_session_id
        and device.revoked_at is null
    )
    or exists(
      select 1
      from public.profile_sessions as session
      join public.learner_profiles as learner on learner.id = session.learner_profile_id
      where session.account_id = p_actor_account_id
        and session.auth_session_id = p_auth_session_id
        and session.revoked_at is null
        and learner.kind <> 'self'
    ) then
    raise exception using errcode = '42501', message = 'onboarding authorization cannot be issued';
  end if;

  insert into private.onboarding_authorizations (
    account_id,
    auth_session_id,
    age_band,
    proof_hash,
    payload_hash,
    expires_at,
    issue_idempotency_key
  ) values (
    p_actor_account_id,
    p_auth_session_id,
    p_age_band,
    p_proof_hash,
    v_payload_hash,
    p_expires_at,
    p_issue_idempotency_key
  ) returning * into v_authorization;

  perform private.write_audit_event(
    'account',
    p_actor_account_id,
    null,
    null,
    'account.onboarding_authorization_issued',
    'onboarding_authorization',
    v_authorization.id,
    p_issue_idempotency_key,
    pg_catalog.jsonb_build_object('age_band', p_age_band)
  );
  return v_authorization.id;
end;
$function$;

revoke all on function public.current_complete_account_onboarding(
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
) from public, anon, authenticated, service_role;
drop function public.current_complete_account_onboarding(
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
);

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
  p_authorization_proof_hash bytea,
  p_idempotency_key uuid
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_current_self_context();
  v_auth_session_id uuid := private.current_auth_session_id();
  v_authorization private.onboarding_authorizations;
  v_payload_hash bytea;
  v_profile public.profiles;
begin
  if p_idempotency_key is null
    or pg_catalog.octet_length(p_authorization_proof_hash) <> 32 then
    raise exception using errcode = '22023', message = 'invalid onboarding request';
  end if;

  v_payload_hash := private.onboarding_payload_hash(
    p_display_name,
    p_handle,
    p_locale,
    p_timezone,
    p_study_day_start,
    p_age_band,
    p_learning_goals,
    p_theme,
    p_reduced_motion,
    p_serious_mode,
    p_reading_style,
    p_idempotency_key
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'onboarding-authorization:' || v_account_id::text || ':' || p_idempotency_key::text,
      0
    )
  );

  select proof_record.* into v_authorization
  from private.onboarding_authorizations as proof_record
  where proof_record.account_id = v_account_id
    and proof_record.consumption_idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_authorization.payload_hash <> v_payload_hash then
      raise exception using errcode = '22023', message = 'onboarding replay does not match';
    end if;
    select * into v_profile from public.profiles where id = v_account_id;
    return v_profile;
  end if;

  select proof_record.* into v_authorization
  from private.onboarding_authorizations as proof_record
  where proof_record.account_id = v_account_id
    and proof_record.auth_session_id = v_auth_session_id
    and proof_record.age_band = p_age_band
    and proof_record.proof_hash = p_authorization_proof_hash
    and proof_record.payload_hash = v_payload_hash
  for update;
  if not found or v_authorization.expires_at <= pg_catalog.now() then
    raise exception using errcode = '42501', message = 'onboarding authorization is unavailable';
  end if;

  v_profile := public.admin_complete_current_account_onboarding(
    v_account_id,
    p_display_name,
    p_handle,
    p_locale,
    p_timezone,
    p_study_day_start,
    p_age_band,
    p_learning_goals,
    p_theme,
    p_reduced_motion,
    p_serious_mode,
    p_reading_style,
    p_idempotency_key
  );

  update private.onboarding_authorizations
  set proof_hash = null,
      consumed_at = pg_catalog.now(),
      consumption_idempotency_key = p_idempotency_key
  where id = v_authorization.id;

  return v_profile;
end;
$function$;

-- Rejected pre-onboarding identities are minimized immediately without using
-- the end-user deletion grace period. Completed accounts cannot use this path.
create or replace function public.admin_reject_provisional_account(
  p_actor_account_id uuid,
  p_idempotency_key uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile public.profiles;
  v_now timestamptz := pg_catalog.now();
  v_tombstone_id uuid := extensions.gen_random_uuid();
begin
  if p_actor_account_id is null or p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'invalid provisional account rejection';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('provisional-account-rejection:' || p_actor_account_id::text, 0)
  );
  select * into v_profile
  from public.profiles as profile
  where profile.id = p_actor_account_id
  for update;

  if not found then
    perform pg_catalog.set_config('lumen.account_deletion_subject', p_actor_account_id::text, true);
    delete from auth.users where id = p_actor_account_id;
    return true;
  end if;
  if v_profile.account_status = 'deleted' and v_profile.auth_subject_id is null then
    return true;
  end if;
  if v_profile.account_status <> 'onboarding'
    or v_profile.onboarding_completed_at is not null
    or exists(
      select 1
      from public.learner_profiles as learner
      where learner.owner_account_id = p_actor_account_id
        and learner.kind <> 'self'
    ) then
    raise exception using errcode = '42501', message = 'provisional account cannot be rejected';
  end if;

  update public.devices
  set revoked_at = coalesce(revoked_at, v_now)
  where account_id = p_actor_account_id;
  update public.profile_sessions
  set revoked_at = coalesce(revoked_at, v_now),
      revoke_reason = coalesce(revoke_reason, 'provisional account rejected')
  where account_id = p_actor_account_id;
  update public.account_capabilities
  set revoked_at = coalesce(revoked_at, v_now)
  where account_id = p_actor_account_id;
  update public.privacy_preferences
  set first_party_analytics = false,
      allow_product_updates = false,
      allow_social_interactions = false,
      default_content_private = true,
      targeted_advertising = false,
      data_sale = false
  where account_id = p_actor_account_id;
  update public.learner_profiles as learner
  set display_name = null,
      pseudonym = 'Rejected-' || pg_catalog.substr(
        pg_catalog.encode(extensions.digest(learner.id::text, 'sha256'), 'hex'),
        1,
        12
      ),
      age_band = 'unknown',
      avatar_seed = 'rejected-' || pg_catalog.substr(
        pg_catalog.encode(extensions.digest(learner.id::text, 'sha256'), 'hex'),
        1,
        24
      ),
      status = 'deleted',
      settings = '{}'::jsonb
  where learner.owner_account_id = p_actor_account_id;

  perform pg_catalog.set_config('lumen.account_deletion_subject', p_actor_account_id::text, true);
  delete from auth.users where id = p_actor_account_id;

  update public.profiles
  set handle = null,
      display_name = null,
      locale = 'und',
      timezone = 'UTC',
      study_day_start = 0,
      age_band = 'unknown',
      account_status = 'deleted',
      learning_goals = '{}'::text[],
      theme = 'system',
      reduced_motion = false,
      serious_mode = true,
      onboarding_completed_at = null,
      deletion_tombstone_id = coalesce(deletion_tombstone_id, v_tombstone_id),
      deleted_at = coalesce(deleted_at, v_now)
  where id = p_actor_account_id
    and auth_subject_id is null;

  perform private.write_audit_event(
    'system',
    p_actor_account_id,
    null,
    null,
    'account.provisional_identity_rejected',
    'profile',
    p_actor_account_id,
    p_idempotency_key,
    pg_catalog.jsonb_build_object('account_tombstone_id', v_tombstone_id)
  );
  return true;
end;
$function$;

-- Do not accept arbitrary learner settings through direct PostgREST calls.
revoke all on function public.current_update_learner_profile(
  uuid,
  text,
  text,
  text,
  jsonb,
  uuid
) from public, anon, authenticated, service_role;
drop function public.current_update_learner_profile(uuid, text, text, text, jsonb, uuid);

create or replace function public.current_update_learner_profile(
  p_learner_profile_id uuid,
  p_display_name text,
  p_pseudonym text,
  p_avatar_seed text,
  p_theme public.theme_preference,
  p_reduced_motion boolean,
  p_serious_mode boolean,
  p_reading_style text,
  p_idempotency_key uuid
)
returns public.learner_profiles
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_current_self_context();
  v_learner public.learner_profiles;
  v_settings jsonb;
begin
  if p_idempotency_key is null
    or (p_reading_style is not null and p_reading_style not in ('standard', 'increased_spacing')) then
    raise exception using errcode = '22023', message = 'invalid learner profile preferences';
  end if;

  select * into v_learner
  from public.learner_profiles as learner
  where learner.id = p_learner_profile_id
    and learner.kind <> 'self'
  for update;
  if not found
    or not private.can_access_learner_profile(v_account_id, p_learner_profile_id, 'manage') then
    raise exception using errcode = '42501', message = 'learner profile cannot be updated';
  end if;

  v_settings := coalesce(v_learner.settings, '{}'::jsonb)
    || pg_catalog.jsonb_build_object(
      'analytics', 'essential_only',
      'public_content', false,
      'social_interactions', false,
      'theme', coalesce(
        p_theme::text,
        case
          when v_learner.settings ->> 'theme' in ('system', 'light', 'dark')
            then v_learner.settings ->> 'theme'
          else null
        end,
        'system'
      ),
      'reduced_motion', coalesce(
        p_reduced_motion,
        case
          when pg_catalog.jsonb_typeof(v_learner.settings -> 'reduced_motion') = 'boolean'
            then (v_learner.settings ->> 'reduced_motion')::boolean
          else null
        end,
        false
      ),
      'serious_mode', coalesce(
        p_serious_mode,
        case
          when pg_catalog.jsonb_typeof(v_learner.settings -> 'serious_mode') = 'boolean'
            then (v_learner.settings ->> 'serious_mode')::boolean
          else null
        end,
        true
      ),
      'reading_style', coalesce(
        p_reading_style,
        case
          when v_learner.settings ->> 'reading_style' in ('standard', 'increased_spacing')
            then v_learner.settings ->> 'reading_style'
          else null
        end,
        'standard'
      )
    );

  return public.admin_update_learner_profile(
    v_account_id,
    p_learner_profile_id,
    p_display_name,
    p_pseudonym,
    p_avatar_seed,
    v_settings,
    p_idempotency_key
  );
end;
$function$;

create or replace function public.admin_issue_verified_child_creation_authorization(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
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
  p_proof_hash bytea,
  p_expires_at timestamptz,
  p_creation_idempotency_key uuid,
  p_issue_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_age_band not in ('under_13', 'teen')
    or p_consent_type <> 'child_profile'
    or p_verification_method not in ('local_test', 'verified_external')
    or pg_catalog.char_length(pg_catalog.btrim(p_display_name)) not between 1 and 80
    or pg_catalog.char_length(pg_catalog.btrim(p_pseudonym)) not between 2 and 40
    or pg_catalog.char_length(p_avatar_seed) not between 1 and 64
    or p_avatar_seed !~ '^[A-Za-z0-9_-]+$'
    or pg_catalog.char_length(pg_catalog.btrim(p_policy_version)) not between 3 and 100
    or pg_catalog.char_length(pg_catalog.btrim(p_evidence_reference)) not between 8 and 256
    or p_consent_scope is distinct from pg_catalog.jsonb_build_object(
      'age_band', p_age_band::text,
      'analytics', 'minimized',
      'child_profile', true,
      'public_content', false
    )
    or pg_catalog.jsonb_typeof(p_settings) <> 'object'
    or p_settings ->> 'analytics' <> 'essential_only'
    or p_settings -> 'public_content' <> 'false'::jsonb
    or p_settings -> 'social_interactions' <> 'false'::jsonb
    or p_settings ->> 'theme' not in ('system', 'light', 'dark')
    or p_settings ->> 'reading_style' not in ('standard', 'increased_spacing')
    or pg_catalog.jsonb_typeof(p_settings -> 'reduced_motion') <> 'boolean'
    or pg_catalog.jsonb_typeof(p_settings -> 'serious_mode') <> 'boolean'
    or exists(
      select 1
      from pg_catalog.jsonb_object_keys(p_settings) as setting_key
      where setting_key <> all(array[
        'analytics',
        'public_content',
        'reading_style',
        'reduced_motion',
        'serious_mode',
        'social_interactions',
        'theme'
      ]::text[])
    ) then
    raise exception using errcode = '22023', message = 'invalid verified child creation payload';
  end if;

  return public.admin_issue_child_creation_authorization(
    p_actor_account_id,
    p_auth_session_id,
    p_display_name,
    p_pseudonym,
    p_age_band,
    p_avatar_seed,
    p_consent_type,
    p_policy_version,
    p_consent_scope,
    p_verification_method,
    p_evidence_reference,
    p_settings,
    p_proof_hash,
    p_expires_at,
    p_creation_idempotency_key,
    p_issue_idempotency_key
  );
end;
$function$;

revoke all on table private.onboarding_authorizations
from public, anon, authenticated, service_role;
revoke all on function private.guard_authorization_finalization()
from public, anon, authenticated, service_role;
revoke all on function private.onboarding_payload_hash(
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
) from public, anon, authenticated, service_role;
revoke all on function public.admin_issue_onboarding_authorization(
  uuid,
  uuid,
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
  bytea,
  timestamptz,
  uuid,
  uuid
) from public, anon, authenticated, service_role;
revoke all on function public.admin_reject_provisional_account(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.admin_issue_verified_child_creation_authorization(
  uuid,
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
  jsonb,
  bytea,
  timestamptz,
  uuid,
  uuid
) from public, anon, authenticated, service_role;
revoke execute on function public.admin_issue_child_creation_authorization(
  uuid,
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
  jsonb,
  bytea,
  timestamptz,
  uuid,
  uuid
) from service_role;
revoke execute on function public.admin_create_child_learner(
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
) from service_role;
revoke execute on function public.admin_create_child_learner_configured(
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
  jsonb,
  uuid
) from service_role;
revoke all on function public.current_complete_account_onboarding(
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
  bytea,
  uuid
) from public, anon, authenticated, service_role;
revoke all on function public.current_update_learner_profile(
  uuid,
  text,
  text,
  text,
  public.theme_preference,
  boolean,
  boolean,
  text,
  uuid
) from public, anon, authenticated, service_role;

grant execute on function public.admin_issue_onboarding_authorization(
  uuid,
  uuid,
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
  bytea,
  timestamptz,
  uuid,
  uuid
) to service_role;
grant execute on function public.admin_reject_provisional_account(uuid, uuid) to service_role;
grant execute on function public.admin_issue_verified_child_creation_authorization(
  uuid,
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
  jsonb,
  bytea,
  timestamptz,
  uuid,
  uuid
) to service_role;
grant execute on function public.current_complete_account_onboarding(
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
  bytea,
  uuid
) to authenticated;
grant execute on function public.current_update_learner_profile(
  uuid,
  text,
  text,
  text,
  public.theme_preference,
  boolean,
  boolean,
  text,
  uuid
) to authenticated;

comment on function public.admin_reject_provisional_account(uuid, uuid) is
  'Immediately removes Auth credentials and minimizes an uncompleted, child-free provisional account.';
