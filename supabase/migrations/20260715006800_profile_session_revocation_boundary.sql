-- Let an authenticated guardian revoke one learner-profile session without
-- granting direct access to the administrative implementation function.

create or replace function public.current_revoke_profile_session(
  p_profile_session_id uuid,
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
  if p_profile_session_id is null
    or p_idempotency_key is null
    or p_reauthentication_proof_hash is null
    or pg_catalog.octet_length(p_reauthentication_proof_hash) is distinct from 32 then
    raise exception using errcode = '22023', message = 'invalid profile session revocation';
  end if;

  select session.auth_session_id into v_target_auth_session_id
  from public.profile_sessions as session
  where session.id = p_profile_session_id
    and session.account_id = v_account_id
  for update;
  if v_target_auth_session_id is null then
    raise exception using errcode = '42501', message = 'profile session cannot be revoked';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'managed-session:' || v_account_id::text || ':' || v_target_auth_session_id::text,
      0
    )
  );
  perform private.consume_current_reauthentication_grant(
    v_account_id,
    'security_change',
    p_reauthentication_proof_hash
  );
  return public.admin_revoke_profile_session(
    v_account_id,
    p_profile_session_id,
    'revoked by account owner',
    p_idempotency_key
  );
end;
$function$;

revoke all on function public.current_revoke_profile_session(uuid, bytea, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.current_revoke_profile_session(uuid, bytea, uuid)
to authenticated;

comment on function public.current_revoke_profile_session(uuid, bytea, uuid) is
  'Revokes one account-owned learner-profile session after atomic self-context authorization and fresh reauthentication.';
