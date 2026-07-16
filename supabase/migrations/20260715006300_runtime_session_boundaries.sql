-- Keep runtime session lookups behind narrow RPCs. The service role is
-- intentionally not granted direct SELECT on identity tables.

create or replace function public.admin_get_authentication_profile_state(
  p_actor_account_id uuid
)
returns table (
  profile_exists boolean,
  onboarding_completed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    profile.id is not null,
    profile.onboarding_completed_at
  from (select p_actor_account_id as id) as requested
  left join public.profiles as profile on profile.id = requested.id;
$function$;

create or replace function public.admin_register_request_device(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_candidate_device_id uuid,
  p_display_name text,
  p_platform text
)
returns public.devices
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_device public.devices;
  v_device_id uuid := p_candidate_device_id;
begin
  if p_actor_account_id is null
    or p_auth_session_id is null
    or p_candidate_device_id is null
    or pg_catalog.char_length(pg_catalog.btrim(p_display_name)) not between 1 and 80
    or pg_catalog.char_length(pg_catalog.btrim(p_platform)) not between 1 and 40
    or not exists(
      select 1
      from public.profiles as profile
      where profile.id = p_actor_account_id
        and profile.auth_subject_id = p_actor_account_id
        and profile.account_status in ('onboarding', 'active', 'pending_deletion')
    )
    or not exists(
      select 1
      from auth.sessions as session
      where session.id = p_auth_session_id
        and session.user_id = p_actor_account_id
        and (session.not_after is null or session.not_after > pg_catalog.now())
    ) then
    raise exception using errcode = '42501', message = 'device cannot be registered';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'request-device:' || p_actor_account_id::text || ':' || p_auth_session_id::text,
      0
    )
  );

  select * into v_device
  from public.devices as device
  where device.account_id = p_actor_account_id
    and device.auth_session_id = p_auth_session_id
  for update;

  if found then
    if v_device.revoked_at is not null then
      raise exception using errcode = '42501', message = 'device session is revoked';
    end if;
    update public.devices as device
    set display_name = pg_catalog.btrim(p_display_name),
        platform = pg_catalog.btrim(p_platform),
        last_seen_at = pg_catalog.now()
    where device.id = v_device.id
    returning * into v_device;
    return v_device;
  end if;

  if exists(select 1 from public.devices as device where device.id = v_device_id) then
    v_device_id := extensions.gen_random_uuid();
  end if;

  insert into public.devices (
    id,
    account_id,
    auth_session_id,
    display_name,
    platform,
    idempotency_key
  ) values (
    v_device_id,
    p_actor_account_id,
    p_auth_session_id,
    pg_catalog.btrim(p_display_name),
    pg_catalog.btrim(p_platform),
    v_device_id
  ) returning * into v_device;

  perform private.write_audit_event(
    'account',
    p_actor_account_id,
    null,
    null,
    'account.device_registered',
    'device',
    v_device.id,
    v_device.id,
    '{}'::jsonb
  );
  return v_device;
end;
$function$;

create or replace function public.current_assert_self_context()
returns uuid
language sql
volatile
security definer
set search_path = ''
as $function$
  select private.assert_current_self_context();
$function$;

revoke all on function public.admin_get_authentication_profile_state(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.admin_register_request_device(uuid, uuid, uuid, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.current_assert_self_context()
from public, anon, authenticated, service_role;

grant execute on function public.admin_get_authentication_profile_state(uuid) to service_role;
grant execute on function public.admin_register_request_device(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.current_assert_self_context() to authenticated;

comment on function public.admin_register_request_device(uuid, uuid, uuid, text, text) is
  'Registers or refreshes the one active device bound to a verified Auth session without granting service-role table reads.';
comment on function public.current_assert_self_context() is
  'Verifies the JWT-derived account, active device, and absence of a managed-learner lock.';
