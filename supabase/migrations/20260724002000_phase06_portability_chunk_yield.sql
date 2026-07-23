-- Phase 06: let a bounded route finish one durable chunk and release its lease
-- without treating normal continuation as a failure or consuming a retry.

create or replace function public.admin_yield_portability_job(
  p_job_kind public.portability_job_kind,
  p_job_id uuid,
  p_lease_token uuid,
  p_next_phase text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_queue private.portability_job_queue;
begin
  if p_next_phase is null
    or pg_catalog.char_length(pg_catalog.btrim(p_next_phase)) not between 1 and 80
  then
    raise exception using errcode = '22023', message = 'invalid portability continuation';
  end if;
  select * into v_queue
  from private.portability_job_queue as queue
  where queue.job_kind = p_job_kind
    and queue.job_id = p_job_id
    and queue.lease_token = p_lease_token
    and queue.lease_expires_at > pg_catalog.now()
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'portability lease is unavailable';
  end if;

  delete from private.portability_job_attempts
  where queue_id = v_queue.id
    and lease_token = p_lease_token
    and result = 'running';
  update private.portability_job_queue
  set phase = p_next_phase,
      attempt_count = pg_catalog.greatest(0, attempt_count - 1),
      available_at = pg_catalog.now(),
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null,
      updated_at = pg_catalog.now()
  where id = v_queue.id;

  if p_job_kind in ('import', 'restore') then
    update public.import_jobs
    set status = 'queued', current_phase = p_next_phase, updated_at = pg_catalog.now()
    where id = p_job_id and status = 'running';
  else
    update public.export_jobs
    set status = 'queued', current_phase = p_next_phase, updated_at = pg_catalog.now()
    where id = p_job_id and status = 'running';
  end if;
  return pg_catalog.jsonb_build_object(
    'id', p_job_id,
    'phase', p_next_phase,
    'status', 'queued'
  );
end;
$function$;

revoke all on function public.admin_yield_portability_job(
  public.portability_job_kind, uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.admin_yield_portability_job(
  public.portability_job_kind, uuid, uuid, text
) to service_role;
