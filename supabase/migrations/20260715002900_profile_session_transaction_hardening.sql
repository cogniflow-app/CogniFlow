-- Serialize switches per Auth session and let invalid PIN attempts commit their
-- database-backed counters by returning no row instead of raising.

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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'managed-session:' || p_actor_account_id::text || ':' || p_auth_session_id::text,
      0
    )
  );
  select * into v_session
  from public.profile_sessions as session
  where session.account_id = p_actor_account_id
    and session.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_session.auth_session_id <> p_auth_session_id
      or v_session.learner_profile_id <> p_learner_profile_id
      or v_session.device_id <> p_device_id
      or v_session.token_hash <> p_token_hash
      or v_session.expires_at <> p_expires_at then
      raise exception using errcode = '22023', message = 'profile session replay does not match';
    end if;
    return query select v_session.id, v_session.account_id, v_session.learner_profile_id,
      v_session.device_id, v_session.expires_at;
    return;
  end if;

  update public.profile_sessions as active_session set
    revoked_at = coalesce(active_session.revoked_at, pg_catalog.now()),
    revoke_reason = coalesce(active_session.revoke_reason, 'profile switched')
  where active_session.account_id = p_actor_account_id
    and active_session.auth_session_id = p_auth_session_id
    and active_session.revoked_at is null;

  insert into public.profile_sessions (
    account_id, auth_session_id, learner_profile_id, device_id,
    token_hash, expires_at, idempotency_key
  ) values (
    p_actor_account_id, p_auth_session_id, p_learner_profile_id, p_device_id,
    p_token_hash, p_expires_at, p_idempotency_key
  ) returning * into v_session;
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
    return;
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

revoke all on function public.admin_create_profile_session(uuid, uuid, uuid, uuid, bytea, timestamptz, uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_create_profile_session_with_credentials(uuid, uuid, uuid, text, text, bytea, uuid, bytea, timestamptz, uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_create_profile_session(uuid, uuid, uuid, uuid, bytea, timestamptz, uuid) to service_role;
grant execute on function public.admin_create_profile_session_with_credentials(uuid, uuid, uuid, text, text, bytea, uuid, bytea, timestamptz, uuid) to service_role;
