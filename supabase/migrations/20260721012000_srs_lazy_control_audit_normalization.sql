-- Represent the absence of a preexisting schedule as explicit JSON audit evidence.

create or replace function private.normalize_lazy_srs_control_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.before_state is null then
    new.before_state := pg_catalog.jsonb_build_object('initialized', true, 'schedule', null);
  end if;
  return new;
end;
$function$;

create trigger schedule_operation_events_normalize_lazy_before
before insert on public.schedule_operation_events
for each row execute function private.normalize_lazy_srs_control_audit();

revoke all on function private.normalize_lazy_srs_control_audit()
from public, anon, authenticated, service_role;
