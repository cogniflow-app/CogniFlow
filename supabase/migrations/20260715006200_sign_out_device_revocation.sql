-- Supabase global sign-out revokes refresh sessions, but an already-issued
-- access token can remain valid briefly. Revoke the corresponding application
-- devices in the same user action so RLS denies those tokens immediately.

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
  v_target_auth_session_id uuid;
begin
  if v_account_id is null or v_auth_session_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;
  if p_scope not in ('current', 'all') or p_idempotency_key is null then
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

  -- Lock every affected Auth session in a deterministic order. Profile switch,
  -- self-context mutation, guardian exit, and device revocation use this key.
  for v_target_auth_session_id in
    select device.auth_session_id
    from public.devices as device
    where device.account_id = v_account_id
      and device.revoked_at is null
      and (p_scope = 'all' or device.auth_session_id = v_auth_session_id)
    order by device.auth_session_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'managed-session:' || v_account_id::text || ':' || v_target_auth_session_id::text,
        0
      )
    );
  end loop;

  if p_scope = 'all' then
    update public.devices as device
    set revoked_at = coalesce(device.revoked_at, pg_catalog.now())
    where device.account_id = v_account_id
      and device.revoked_at is null;
    update public.profile_sessions as session
    set
      revoked_at = coalesce(session.revoked_at, pg_catalog.now()),
      revoke_reason = coalesce(session.revoke_reason, 'all auth sessions signed out')
    where session.account_id = v_account_id
      and session.revoked_at is null;
  else
    update public.devices as device
    set revoked_at = coalesce(device.revoked_at, pg_catalog.now())
    where device.account_id = v_account_id
      and device.auth_session_id = v_auth_session_id
      and device.revoked_at is null;
    update public.profile_sessions as session
    set
      revoked_at = coalesce(session.revoked_at, pg_catalog.now()),
      revoke_reason = coalesce(session.revoke_reason, 'current auth session signed out')
    where session.account_id = v_account_id
      and session.auth_session_id = v_auth_session_id
      and session.revoked_at is null;
  end if;

  perform private.write_audit_event(
    'account', v_account_id, null, null,
    'account.auth_devices_signed_out', 'profile', v_account_id,
    p_idempotency_key, pg_catalog.jsonb_build_object('scope', p_scope)
  );
  return true;
end;
$function$;

revoke all on function public.current_sign_out_devices(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.current_sign_out_devices(text, uuid) to authenticated;

comment on function public.current_sign_out_devices(text, uuid) is
  'Revokes the current or every application device for auth.uid(), closing stale-access-token reads before Auth sign-out completes.';
