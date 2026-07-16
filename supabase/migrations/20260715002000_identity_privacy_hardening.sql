-- Phase 01 hardening: keep destructive cancellation behind the same
-- server-owned, single-use reauthentication boundary as deletion requests.

revoke all on function public.cancel_account_deletion(uuid, uuid) from public;
revoke all on function public.cancel_account_deletion(uuid, uuid) from anon;
revoke all on function public.cancel_account_deletion(uuid, uuid) from authenticated;
revoke all on function public.cancel_account_deletion(uuid, uuid) from service_role;
drop function public.cancel_account_deletion(uuid, uuid);

create or replace function public.admin_cancel_account_deletion(
  p_actor_account_id uuid,
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
  v_request_id uuid;
  v_grant_id uuid;
begin
  if exists(
    select 1
    from public.audit_events as event
    where event.actor_account_id = p_actor_account_id
      and event.event_type = 'privacy.deletion_cancelled'
      and event.target_type = 'deletion_job'
      and event.target_id = p_deletion_job_id
      and event.correlation_id = p_idempotency_key
  ) then
    return true;
  end if;

  select job.privacy_request_id into v_request_id
  from public.deletion_jobs as job
  where job.id = p_deletion_job_id
    and job.account_id = p_actor_account_id
    and job.status = 'queued'
    and job.execute_after > pg_catalog.now()
  for update;
  if v_request_id is null then
    raise exception using errcode = '42501', message = 'deletion request cannot be cancelled';
  end if;

  select grant_record.id into v_grant_id
  from private.reauthentication_grants as grant_record
  where grant_record.account_id = p_actor_account_id
    and grant_record.purpose = 'account_deletion'
    and grant_record.proof_hash = p_reauthentication_proof_hash
    and grant_record.consumed_at is null
    and grant_record.expires_at > pg_catalog.now()
  for update;
  if v_grant_id is null then
    raise exception using errcode = '28000', message = 'recent reauthentication is required';
  end if;

  update private.reauthentication_grants
  set consumed_at = pg_catalog.now()
  where id = v_grant_id;

  update public.deletion_jobs set
    status = 'cancelled',
    cancelled_at = pg_catalog.now()
  where id = p_deletion_job_id;
  update public.privacy_requests set
    status = 'cancelled',
    completed_at = pg_catalog.now()
  where id = v_request_id;
  update public.profiles set account_status = 'active'
  where id = p_actor_account_id and account_status = 'pending_deletion';

  perform private.write_audit_event(
    'account', p_actor_account_id, null, null,
    'privacy.deletion_cancelled', 'deletion_job', p_deletion_job_id,
    p_idempotency_key, '{}'::jsonb
  );
  return true;
end;
$function$;

revoke all on function public.admin_cancel_account_deletion(uuid, uuid, bytea, uuid) from public;
revoke all on function public.admin_cancel_account_deletion(uuid, uuid, bytea, uuid) from anon;
revoke all on function public.admin_cancel_account_deletion(uuid, uuid, bytea, uuid) from authenticated;
grant execute on function public.admin_cancel_account_deletion(uuid, uuid, bytea, uuid) to service_role;

comment on function public.admin_cancel_account_deletion(uuid, uuid, bytea, uuid) is
  'Cancels an account deletion during its grace period after consuming a server-issued reauthentication proof.';
