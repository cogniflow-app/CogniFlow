-- Phase 06: delete private portability objects from Storage before finalizing
-- metadata so transient provider failures remain safely retryable.

create or replace function public.admin_claim_portability_object_cleanup(
  p_limit integer default 100
)
returns table (
  object_kind text,
  object_id uuid,
  storage_bucket text,
  storage_path text
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_limit not between 1 and 500 then
    raise exception using errcode = '22023', message = 'invalid cleanup limit';
  end if;

  return query
  with artifact_candidates as (
    select
      'artifact'::text as kind,
      object_record.artifact_id as id,
      object_record.storage_bucket as bucket,
      object_record.storage_path as path,
      artifact.expires_at as eligible_at
    from private.portability_artifact_objects as object_record
    join public.export_artifacts as artifact on artifact.id = object_record.artifact_id
    where object_record.deleted_at is null
      and (
        artifact.expires_at <= pg_catalog.clock_timestamp()
        or not artifact.available
        or artifact.deleted_at is not null
      )
    order by artifact.expires_at, object_record.artifact_id
    limit p_limit
    for update of object_record skip locked
  ),
  upload_candidates as (
    select
      'upload'::text as kind,
      upload.id,
      upload.storage_bucket as bucket,
      upload.storage_path as path,
      upload.expires_at as eligible_at
    from private.portability_upload_objects as upload
    where upload.deleted_at is null
      and upload.expires_at <= pg_catalog.clock_timestamp()
    order by upload.expires_at, upload.id
    limit p_limit
    for update of upload skip locked
  )
  select candidate.kind, candidate.id, candidate.bucket, candidate.path
  from (
    select * from artifact_candidates
    union all
    select * from upload_candidates
  ) as candidate
  order by candidate.eligible_at, candidate.kind, candidate.id
  limit p_limit;
end;
$function$;

create or replace function public.admin_confirm_portability_object_deleted(
  p_object_kind text,
  p_object_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_found boolean := false;
begin
  if p_object_kind = 'artifact' then
    update private.portability_artifact_objects as object_record
    set deleted_at = coalesce(object_record.deleted_at, pg_catalog.clock_timestamp())
    where object_record.artifact_id = p_object_id;
    v_found := found;

    if v_found then
      update public.export_artifacts as artifact
      set available = false,
          deleted_at = coalesce(artifact.deleted_at, pg_catalog.clock_timestamp())
      where artifact.id = p_object_id;
    end if;
  elsif p_object_kind = 'upload' then
    update private.portability_upload_objects as upload
    set deleted_at = coalesce(upload.deleted_at, pg_catalog.clock_timestamp())
    where upload.id = p_object_id;
    v_found := found;
  else
    raise exception using errcode = '22023', message = 'invalid portability object kind';
  end if;

  return v_found;
end;
$function$;

-- Preserve the old service-only entry point as a non-finalizing compatibility
-- alias. Current workers use the explicit claim/confirm pair.
create or replace function public.admin_expire_portability_objects(
  p_limit integer default 100
)
returns table (
  object_kind text,
  object_id uuid,
  storage_bucket text,
  storage_path text
)
language sql
security definer
set search_path = ''
as $function$
  select *
  from public.admin_claim_portability_object_cleanup(p_limit);
$function$;

create or replace function private.cancel_portability_for_deleted_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.account_status = 'deleted' and old.account_status is distinct from new.account_status then
    update public.import_jobs
    set status = 'cancelled', cancelled_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    where account_id = new.id
      and status not in ('cancelled', 'completed', 'completed_with_warnings', 'failed', 'expired');

    update public.export_jobs
    set status = 'cancelled', cancelled_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    where account_id = new.id
      and status not in ('cancelled', 'completed', 'completed_with_warnings', 'failed', 'expired');

    update public.export_artifacts as artifact
    set available = false,
        deleted_at = coalesce(artifact.deleted_at, pg_catalog.clock_timestamp()),
        expires_at = greatest(
          artifact.created_at + interval '1 microsecond',
          least(artifact.expires_at, pg_catalog.clock_timestamp())
        )
    where artifact.account_id = new.id;

    update private.portability_upload_objects as upload
    set expires_at = greatest(
      upload.created_at + interval '1 microsecond',
      least(upload.expires_at, pg_catalog.clock_timestamp())
    )
    where upload.account_id = new.id and upload.deleted_at is null;

    delete from private.portability_job_queue as queue
    where exists(
      select 1 from public.import_jobs as job
      where queue.job_kind in ('import', 'restore')
        and queue.job_id = job.id and job.account_id = new.id
    ) or exists(
      select 1 from public.export_jobs as job
      where queue.job_kind = 'export'
        and queue.job_id = job.id and job.account_id = new.id
    );
  end if;
  return new;
end;
$function$;

revoke all on function public.admin_claim_portability_object_cleanup(integer)
from public, anon, authenticated, service_role;
revoke all on function public.admin_confirm_portability_object_deleted(text, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.admin_expire_portability_objects(integer)
from public, anon, authenticated, service_role;
revoke all on function private.cancel_portability_for_deleted_account()
from public, anon, authenticated, service_role;

grant execute on function public.admin_claim_portability_object_cleanup(integer)
to service_role;
grant execute on function public.admin_confirm_portability_object_deleted(text, uuid)
to service_role;
grant execute on function public.admin_expire_portability_objects(integer)
to service_role;
