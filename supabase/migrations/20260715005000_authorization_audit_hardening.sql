-- Treat deleted, suspended, unregistered, and revoked Auth sessions as denied;
-- scope audit idempotency to the actor and reject mismatched replays.

create or replace function private.is_current_auth_session_revoked(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    not exists(
      select 1 from public.profiles as profile
      where profile.id = p_account_id
        and profile.auth_subject_id = p_account_id
        and profile.account_status in ('onboarding', 'active', 'pending_deletion')
    )
    or (
      private.current_auth_session_id() is not null
      and not exists(
        select 1 from public.devices as device
        where device.account_id = p_account_id
          and device.auth_session_id = private.current_auth_session_id()
          and device.revoked_at is null
      )
    );
$function$;

drop index public.audit_events_idempotency_idx;
create unique index audit_events_idempotency_idx
on public.audit_events (
  event_type,
  actor_type,
  actor_account_id,
  actor_learner_profile_id,
  actor_guest_session_id,
  correlation_id
) nulls not distinct;

create or replace function private.write_audit_event(
  p_actor_type public.audit_actor_type,
  p_actor_account_id uuid,
  p_actor_learner_profile_id uuid,
  p_actor_guest_session_id uuid,
  p_event_type text,
  p_target_type text,
  p_target_id uuid,
  p_correlation_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid := extensions.gen_random_uuid();
  v_existing public.audit_events;
begin
  if p_correlation_id is null then
    raise exception using errcode = '22023', message = 'correlation ID is required';
  end if;
  insert into public.audit_events (
    id, actor_type, actor_account_id, actor_learner_profile_id,
    actor_guest_session_id, event_type, target_type, target_id,
    correlation_id, metadata
  ) values (
    v_id, p_actor_type, p_actor_account_id, p_actor_learner_profile_id,
    p_actor_guest_session_id, pg_catalog.btrim(p_event_type),
    pg_catalog.btrim(p_target_type), p_target_id, p_correlation_id,
    coalesce(p_metadata, '{}'::jsonb)
  ) on conflict do nothing;

  if not found then
    select * into v_existing
    from public.audit_events as event
    where event.event_type = pg_catalog.btrim(p_event_type)
      and event.actor_type = p_actor_type
      and event.actor_account_id is not distinct from p_actor_account_id
      and event.actor_learner_profile_id is not distinct from p_actor_learner_profile_id
      and event.actor_guest_session_id is not distinct from p_actor_guest_session_id
      and event.correlation_id = p_correlation_id;
    if not found
      or v_existing.target_type <> pg_catalog.btrim(p_target_type)
      or v_existing.target_id is distinct from p_target_id then
      raise exception using errcode = '22023', message = 'audit idempotency replay does not match';
    end if;
    return v_existing.id;
  end if;
  return v_id;
end;
$function$;

revoke execute on function private.is_current_auth_session_revoked(uuid) from public, anon, authenticated, service_role;
grant execute on function private.is_current_auth_session_revoked(uuid) to authenticated;
