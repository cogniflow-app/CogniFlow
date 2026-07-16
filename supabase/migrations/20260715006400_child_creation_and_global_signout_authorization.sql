-- Bind child-profile activation to server-verified deployment/consent checks,
-- and require fresh guardian authorization before global sign-out.

create table private.child_creation_authorizations (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.profiles (id) on delete cascade,
  auth_session_id uuid not null,
  proof_hash bytea,
  payload_hash bytea not null,
  expires_at timestamptz not null,
  issued_at timestamptz not null default pg_catalog.now(),
  issue_idempotency_key uuid not null,
  consumed_at timestamptz,
  consumed_learner_profile_id uuid references public.learner_profiles (id) on delete cascade,
  consumption_idempotency_key uuid,
  constraint child_creation_authorizations_proof_hash_length check (
    proof_hash is null or pg_catalog.octet_length(proof_hash) = 32
  ),
  constraint child_creation_authorizations_payload_hash_length check (
    pg_catalog.octet_length(payload_hash) = 32
  ),
  constraint child_creation_authorizations_distinct_hashes check (
    proof_hash is null or proof_hash <> payload_hash
  ),
  constraint child_creation_authorizations_short_lived check (
    expires_at > issued_at
    and expires_at <= issued_at + interval '10 minutes'
  ),
  constraint child_creation_authorizations_state_complete check (
    (
      consumed_at is null
      and consumed_learner_profile_id is null
      and consumption_idempotency_key is null
      and proof_hash is not null
    )
    or (
      consumed_at is not null
      and consumed_learner_profile_id is not null
      and consumption_idempotency_key is not null
      and consumed_at >= issued_at
      and consumed_at <= expires_at
      and proof_hash is null
    )
  ),
  unique (proof_hash),
  unique (account_id, issue_idempotency_key)
);

create index child_creation_authorizations_account_session_expiry_idx
on private.child_creation_authorizations (account_id, auth_session_id, expires_at)
where proof_hash is not null;

create unique index child_creation_authorizations_consumption_idx
on private.child_creation_authorizations (account_id, consumption_idempotency_key)
where consumption_idempotency_key is not null;

comment on table private.child_creation_authorizations is
  'Hashed, short-lived, service-issued proof that binds one verified child-profile payload to one guardian Auth session.';

create or replace function private.child_creation_payload_hash(
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
        'avatar_seed', p_avatar_seed,
        'consent_scope', coalesce(p_consent_scope, '{}'::jsonb),
        'consent_type', p_consent_type::text,
        'display_name', pg_catalog.btrim(p_display_name),
        'evidence_reference', pg_catalog.btrim(p_evidence_reference),
        'idempotency_key', p_idempotency_key::text,
        'policy_version', pg_catalog.btrim(p_policy_version),
        'pseudonym', pg_catalog.btrim(p_pseudonym),
        'settings', coalesce(p_settings, '{}'::jsonb),
        'verification_method', p_verification_method::text
      )::text,
      'UTF8'
    ),
    'sha256'
  );
$function$;

create or replace function public.admin_issue_child_creation_authorization(
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
declare
  v_authorization private.child_creation_authorizations;
  v_payload_hash bytea;
  v_now timestamptz := pg_catalog.now();
begin
  if p_actor_account_id is null
    or p_auth_session_id is null
    or p_creation_idempotency_key is null
    or p_issue_idempotency_key is null
    or pg_catalog.octet_length(p_proof_hash) <> 32
    or p_expires_at <= v_now
    or p_expires_at > v_now + interval '10 minutes' then
    raise exception using errcode = '22023', message = 'invalid child creation authorization';
  end if;

  v_payload_hash := private.child_creation_payload_hash(
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
    p_creation_idempotency_key
  );
  if p_proof_hash = v_payload_hash then
    raise exception using errcode = '22023', message = 'invalid child creation authorization';
  end if;

  if not exists(
      select 1
      from public.profiles as profile
      where profile.id = p_actor_account_id
        and profile.auth_subject_id = p_actor_account_id
        and profile.account_status = 'active'
        and profile.age_band in ('teen', 'adult')
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
    raise exception using errcode = '42501', message = 'child creation authorization cannot be issued';
  end if;

  insert into private.child_creation_authorizations (
    account_id,
    auth_session_id,
    proof_hash,
    payload_hash,
    expires_at,
    issue_idempotency_key
  ) values (
    p_actor_account_id,
    p_auth_session_id,
    p_proof_hash,
    v_payload_hash,
    p_expires_at,
    p_issue_idempotency_key
  )
  returning * into v_authorization;

  perform private.write_audit_event(
    'account',
    p_actor_account_id,
    null,
    null,
    'learner.child_creation_authorization_issued',
    'child_creation_authorization',
    v_authorization.id,
    p_issue_idempotency_key,
    '{}'::jsonb
  );
  return v_authorization.id;
end;
$function$;

revoke all on function public.current_create_child_learner_configured(
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
) from public, anon, authenticated, service_role;

drop function public.current_create_child_learner_configured(
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
);

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
  p_authorization_proof_hash bytea,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := private.assert_current_self_context();
  v_auth_session_id uuid := private.current_auth_session_id();
  v_authorization private.child_creation_authorizations;
  v_learner_profile_id uuid;
  v_payload_hash bytea;
begin
  if p_idempotency_key is null
    or pg_catalog.octet_length(p_authorization_proof_hash) <> 32 then
    raise exception using errcode = '22023', message = 'invalid child creation request';
  end if;

  v_payload_hash := private.child_creation_payload_hash(
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
    p_idempotency_key
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'child-creation-authorization:' || v_account_id::text || ':' || p_idempotency_key::text,
      0
    )
  );

  select proof_record.* into v_authorization
  from private.child_creation_authorizations as proof_record
  where proof_record.account_id = v_account_id
    and proof_record.consumption_idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_authorization.payload_hash <> v_payload_hash then
      raise exception using errcode = '22023', message = 'child creation replay does not match';
    end if;
    return v_authorization.consumed_learner_profile_id;
  end if;

  select proof_record.* into v_authorization
  from private.child_creation_authorizations as proof_record
  where proof_record.account_id = v_account_id
    and proof_record.auth_session_id = v_auth_session_id
    and proof_record.proof_hash = p_authorization_proof_hash
    and proof_record.payload_hash = v_payload_hash
  for update;
  if not found or v_authorization.expires_at <= pg_catalog.now() then
    raise exception using errcode = '42501', message = 'child creation authorization is unavailable';
  end if;

  v_learner_profile_id := public.admin_create_child_learner_configured(
    v_account_id,
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
    p_idempotency_key
  );

  update private.child_creation_authorizations
  set proof_hash = null,
      consumed_at = pg_catalog.now(),
      consumed_learner_profile_id = v_learner_profile_id,
      consumption_idempotency_key = p_idempotency_key
  where id = v_authorization.id;

  perform private.write_audit_event(
    'account',
    v_account_id,
    v_learner_profile_id,
    null,
    'learner.child_creation_authorization_consumed',
    'child_creation_authorization',
    v_authorization.id,
    p_idempotency_key,
    '{}'::jsonb
  );
  return v_learner_profile_id;
end;
$function$;

revoke all on table private.child_creation_authorizations
from public, anon, authenticated, service_role;
revoke all on function private.child_creation_payload_hash(
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
) from public, anon, authenticated, service_role;
revoke all on function public.admin_issue_child_creation_authorization(
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
revoke all on function public.current_create_child_learner_configured(
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
  uuid
) from public, anon, authenticated, service_role;

grant execute on function public.admin_issue_child_creation_authorization(
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
grant execute on function public.current_create_child_learner_configured(
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
  uuid
) to authenticated;

create or replace function public.current_sign_out_devices(
  p_scope text,
  p_idempotency_key uuid
)
returns boolean
language plpgsql
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
  if p_scope <> 'current' or p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'invalid sign-out request';
  end if;

  perform 1
  from public.profiles as profile
  where profile.id = v_account_id
    and profile.auth_subject_id = v_account_id
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'account is unavailable';
  end if;

  if exists(
    select 1
    from public.audit_events as event
    where event.actor_type = 'account'
      and event.actor_account_id = v_account_id
      and event.event_type = 'account.auth_devices_signed_out'
      and event.correlation_id = p_idempotency_key
  ) then
    return true;
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'managed-session:' || v_account_id::text || ':' || v_auth_session_id::text,
      0
    )
  );

  update public.devices as device
  set revoked_at = coalesce(device.revoked_at, pg_catalog.now())
  where device.account_id = v_account_id
    and device.auth_session_id = v_auth_session_id
    and device.revoked_at is null;
  update public.profile_sessions as session
  set revoked_at = coalesce(session.revoked_at, pg_catalog.now()),
      revoke_reason = coalesce(session.revoke_reason, 'current auth session signed out')
  where session.account_id = v_account_id
    and session.auth_session_id = v_auth_session_id
    and session.revoked_at is null;

  perform private.write_audit_event(
    'account',
    v_account_id,
    null,
    null,
    'account.auth_devices_signed_out',
    'profile',
    v_account_id,
    p_idempotency_key,
    pg_catalog.jsonb_build_object('scope', 'current')
  );
  return true;
end;
$function$;

create or replace function public.current_sign_out_all_devices(
  p_reauthentication_proof_hash bytea,
  p_idempotency_key uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid := auth.uid();
  v_auth_session_id uuid := private.current_auth_session_id();
  v_target_auth_session_id uuid;
begin
  if v_account_id is null or v_auth_session_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;
  if p_idempotency_key is null
    or pg_catalog.octet_length(p_reauthentication_proof_hash) <> 32 then
    raise exception using errcode = '22023', message = 'invalid all-device sign-out request';
  end if;

  if exists(
    select 1
    from public.audit_events as event
    where event.actor_type = 'account'
      and event.actor_account_id = v_account_id
      and event.event_type = 'account.auth_devices_signed_out'
      and event.correlation_id = p_idempotency_key
  ) then
    return true;
  end if;

  if private.assert_current_self_context() <> v_account_id then
    raise exception using errcode = '42501', message = 'account context is unavailable';
  end if;

  for v_target_auth_session_id in
    select device.auth_session_id
    from public.devices as device
    where device.account_id = v_account_id
      and device.revoked_at is null
    order by device.auth_session_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'managed-session:' || v_account_id::text || ':' || v_target_auth_session_id::text,
        0
      )
    );
  end loop;

  perform private.consume_current_reauthentication_grant(
    v_account_id,
    'security_change',
    p_reauthentication_proof_hash
  );

  update public.devices as device
  set revoked_at = coalesce(device.revoked_at, pg_catalog.now())
  where device.account_id = v_account_id
    and device.revoked_at is null;
  update public.profile_sessions as session
  set revoked_at = coalesce(session.revoked_at, pg_catalog.now()),
      revoke_reason = coalesce(session.revoke_reason, 'all auth sessions signed out')
  where session.account_id = v_account_id
    and session.revoked_at is null;

  perform private.write_audit_event(
    'account',
    v_account_id,
    null,
    null,
    'account.auth_devices_signed_out',
    'profile',
    v_account_id,
    p_idempotency_key,
    pg_catalog.jsonb_build_object('scope', 'all')
  );
  return true;
end;
$function$;

revoke all on function public.current_sign_out_devices(text, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.current_sign_out_all_devices(bytea, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.current_sign_out_devices(text, uuid) to authenticated;
grant execute on function public.current_sign_out_all_devices(bytea, uuid) to authenticated;

comment on function public.current_sign_out_devices(text, uuid) is
  'Revokes only the current application device, including from managed-learner mode.';
comment on function public.current_sign_out_all_devices(bytea, uuid) is
  'Consumes fresh self-context reauthentication before revoking every application device.';
