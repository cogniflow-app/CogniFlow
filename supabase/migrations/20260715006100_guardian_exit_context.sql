-- Guardian exit is the one account transition intentionally performed while a
-- managed session is active. Derive its account/session from the JWT and hold
-- the managed-session lock through proof consumption and revocation.

create or replace function public.current_guardian_exit_managed_session(
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
begin
  if v_account_id is null or v_auth_session_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'managed-session:' || v_account_id::text || ':' || v_auth_session_id::text,
      0
    )
  );
  if not exists(
    select 1
    from public.profiles as profile
    join public.devices as device on device.account_id = profile.id
    where profile.id = v_account_id
      and profile.auth_subject_id = v_account_id
      and profile.account_status = 'active'
      and device.auth_session_id = v_auth_session_id
      and device.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = 'guardian session is unavailable';
  end if;
  return public.admin_guardian_exit_managed_session(
    v_account_id, v_auth_session_id, p_reauthentication_proof_hash,
    p_idempotency_key
  );
end;
$function$;

revoke all on function public.current_guardian_exit_managed_session(bytea, uuid) from public, anon, authenticated, service_role;
grant execute on function public.current_guardian_exit_managed_session(bytea, uuid) to authenticated;

comment on function public.current_guardian_exit_managed_session(bytea, uuid) is
  'Exits the JWT-bound managed learner session after consuming a recent guardian reauthentication proof.';
