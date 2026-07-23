-- Phase 06: finalize private temporary-upload cleanup only after the backing
-- Storage object has been removed successfully.

create or replace function public.admin_mark_portability_upload_deleted(
  p_import_job_id uuid,
  p_account_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deleted boolean := false;
begin
  if not exists(
    select 1
    from public.import_jobs as job
    where job.id = p_import_job_id
      and job.account_id = p_account_id
  ) then
    raise exception using errcode = '42501', message = 'import job is unavailable';
  end if;

  update private.portability_upload_objects as upload
  set deleted_at = coalesce(upload.deleted_at, pg_catalog.now())
  where upload.import_job_id = p_import_job_id
    and upload.account_id = p_account_id
    and upload.deleted_at is null;
  v_deleted := found;
  return v_deleted;
end;
$function$;

revoke all on function public.admin_mark_portability_upload_deleted(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.admin_mark_portability_upload_deleted(uuid, uuid)
to service_role;
