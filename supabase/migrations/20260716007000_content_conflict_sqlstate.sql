-- Optimistic conflicts are application outcomes, not PostgreSQL serialization
-- failures. SQLSTATE 40001 causes PostgREST/PostgreSQL clients to retry the
-- same stale mutation until timeout; use the standard user exception state
-- while retaining the typed JSON conflict detail.

begin;

create or replace function private.raise_content_conflict(
  p_resource_type text,
  p_resource_id uuid,
  p_expected_version bigint,
  p_actual_version bigint
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  raise exception using
    errcode = 'P0001',
    message = 'content version conflict',
    detail = pg_catalog.jsonb_build_object(
      'code', 'version_conflict',
      'resourceType', p_resource_type,
      'resourceId', p_resource_id,
      'expectedVersion', p_expected_version,
      'actualVersion', p_actual_version
    )::text;
end;
$function$;

revoke all on function private.raise_content_conflict(text, uuid, bigint, bigint)
from public, anon, authenticated, service_role;

comment on function private.raise_content_conflict(text, uuid, bigint, bigint)
is 'Raises a typed, non-retryable application conflict without using serialization-failure SQLSTATE 40001.';

commit;
