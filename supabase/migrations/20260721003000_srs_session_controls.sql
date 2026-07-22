-- Audited pause/resume and preview-only progression. Preview progression never touches schedules.

create table public.study_session_events (
  id uuid primary key,
  study_session_id uuid not null references public.study_sessions (id) on delete restrict,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  actor_account_id uuid not null references public.profiles (id) on delete restrict,
  card_id uuid references public.cards (id) on delete restrict,
  action text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint study_session_events_action check (action in ('pause','resume','preview_next')),
  unique (study_session_id, id)
);
create index study_session_events_learner_time_idx
on public.study_session_events (learner_profile_id, created_at desc);
create trigger study_session_events_append_only
before update or delete on public.study_session_events
for each row execute function private.reject_append_only_srs_mutation();
alter table public.study_session_events enable row level security;
create policy study_session_events_select_authorized on public.study_session_events for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
revoke all on public.study_session_events from anon, authenticated, service_role;
grant select on public.study_session_events to authenticated;

create or replace function public.admin_control_study_session(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_study_session_id uuid,
  p_event_id uuid,
  p_action text,
  p_card_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.study_sessions;
  v_existing public.study_session_events;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_study_session_id is null or p_event_id is null or p_action not in ('pause','resume','preview_next') then
    raise exception using errcode = '22023', message = 'invalid study session control';
  end if;
  select * into v_existing from public.study_session_events as event where event.id = p_event_id;
  if found then
    if v_existing.learner_profile_id <> p_learner_profile_id or v_existing.study_session_id <> p_study_session_id
      or v_existing.action <> p_action or v_existing.card_id is distinct from p_card_id then
      raise exception using errcode = '22023', message = 'study session event id was reused';
    end if;
    return pg_catalog.jsonb_build_object('eventId', v_existing.id, 'duplicate', true);
  end if;
  select * into v_session from public.study_sessions as session
  where session.id = p_study_session_id for update;
  if not found or v_session.learner_profile_id <> p_learner_profile_id
    or v_session.actor_account_id <> p_actor_account_id then
    raise exception using errcode = '42501', message = 'study session is unavailable';
  end if;

  if p_action = 'pause' then
    if v_session.status <> 'active' then raise exception using errcode = '40001', message = 'study session is not active'; end if;
    update public.study_sessions set status = 'paused', last_activity_at = pg_catalog.now(), version = version + 1
    where id = p_study_session_id;
  elsif p_action = 'resume' then
    if v_session.status <> 'paused' then raise exception using errcode = '40001', message = 'study session is not paused'; end if;
    update public.study_sessions set status = 'active', last_activity_at = pg_catalog.now(), version = version + 1
    where id = p_study_session_id;
  else
    if v_session.rescheduling or v_session.status not in ('active','paused') or p_card_id is null then
      raise exception using errcode = '42501', message = 'only preview sessions can advance without a review';
    end if;
    update public.study_session_items set status = 'skipped', shown_at = coalesce(shown_at, pg_catalog.now()),
      completed_at = pg_catalog.now()
    where study_session_id = p_study_session_id and card_id = p_card_id and status in ('pending','shown');
    if not found then raise exception using errcode = '40001', message = 'preview item is no longer current'; end if;
    update public.study_sessions set completed_items = completed_items + 1,
      status = case when completed_items + 1 >= total_items then 'completed'::public.study_session_status else 'active' end,
      completed_at = case when completed_items + 1 >= total_items then pg_catalog.now() else null end,
      last_activity_at = pg_catalog.now(), version = version + 1
    where id = p_study_session_id;
  end if;
  insert into public.study_session_events (
    id, study_session_id, learner_profile_id, actor_account_id, card_id, action
  ) values (p_event_id, p_study_session_id, p_learner_profile_id, p_actor_account_id, p_card_id, p_action);
  return pg_catalog.jsonb_build_object('eventId', p_event_id, 'duplicate', false, 'action', p_action);
end;
$function$;

revoke all on function public.admin_control_study_session(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid)
from public, anon, authenticated, service_role;
grant execute on function public.admin_control_study_session(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid)
to service_role;
