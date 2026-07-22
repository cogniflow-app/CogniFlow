-- Phase 03: explicit sibling burying and private study-content reports.

create type public.study_content_report_reason as enum (
  'incorrect', 'outdated', 'unclear', 'unsafe', 'accessibility', 'other'
);

create table public.study_content_reports (
  id uuid primary key,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  card_id uuid not null references public.cards (id) on delete restrict,
  deck_id uuid not null references public.decks (id) on delete restrict,
  reporter_account_id uuid not null references public.profiles (id) on delete restrict,
  device_id uuid references public.devices (id) on delete set null,
  reason public.study_content_report_reason not null,
  details text,
  content_version bigint not null,
  idempotency_key uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint study_content_reports_details_length check (
    details is null or pg_catalog.char_length(pg_catalog.btrim(details)) between 1 and 1000
  ),
  constraint study_content_reports_content_version_positive check (content_version > 0),
  unique (learner_profile_id, idempotency_key)
);

create index study_content_reports_learner_time_idx
on public.study_content_reports (learner_profile_id, created_at desc);
create index study_content_reports_deck_time_idx
on public.study_content_reports (deck_id, created_at desc);

create trigger study_content_reports_append_only
before update or delete on public.study_content_reports
for each row execute function private.reject_append_only_srs_mutation();

alter table public.study_content_reports enable row level security;

create policy study_content_reports_select_authorized
on public.study_content_reports for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);

revoke all on public.study_content_reports from anon, authenticated, service_role;
grant select on public.study_content_reports to authenticated;

create or replace function public.admin_bury_srs_siblings(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_card_id uuid,
  p_operation_event_id uuid,
  p_idempotency_key uuid,
  p_buried_until timestamptz,
  p_scheduler_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_note_id uuid;
  v_deck_id uuid;
  v_preset public.srs_presets;
  v_existing public.schedule_operation_events;
  v_before jsonb;
  v_after jsonb;
  v_count integer;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_card_id is null or p_operation_event_id is null or p_idempotency_key is null
    or p_buried_until is null or p_buried_until <= pg_catalog.now()
    or pg_catalog.char_length(p_scheduler_version) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'invalid sibling bury command';
  end if;

  select * into v_existing from public.schedule_operation_events as event
  where event.learner_profile_id = p_learner_profile_id
    and event.idempotency_key = p_idempotency_key;
  if found then
    return pg_catalog.jsonb_build_object(
      'eventId', v_existing.id, 'duplicate', true, 'affectedCount', v_existing.affected_count
    );
  end if;

  select card.note_id, note.deck_id into v_note_id, v_deck_id
  from public.cards as card
  join public.notes as note on note.id = card.note_id
  where card.id = p_card_id and card.active and card.deleted_at is null and note.deleted_at is null
    and private.srs_can_study_deck(p_actor_account_id, p_learner_profile_id, note.deck_id);
  if not found then
    raise exception using errcode = '42501', message = 'card is not available for sibling burying';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'srs-note:' || p_learner_profile_id::text || ':' || v_note_id::text,
      0
    )
  );

  select preset.* into v_preset
  from public.deck_srs_settings as setting
  join public.srs_presets as preset on preset.id = setting.preset_id
  where setting.learner_profile_id = p_learner_profile_id
    and setting.deck_id = v_deck_id and preset.deleted_at is null;
  if not found then v_preset := private.ensure_default_srs_preset(p_learner_profile_id); end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('cardId', sibling.id, 'schedule', pg_catalog.to_jsonb(schedule.*))
      order by sibling.id
    ),
    '[]'::jsonb
  ) into v_before
  from public.cards as sibling
  left join public.card_schedules as schedule
    on schedule.learner_profile_id = p_learner_profile_id and schedule.card_id = sibling.id
  where sibling.note_id = v_note_id and sibling.id <> p_card_id
    and sibling.active and sibling.deleted_at is null;

  insert into public.card_schedules (
    learner_profile_id, card_id, algorithm, state, due, stability, difficulty, elapsed_days,
    scheduled_days, learning_step, reps, lapses, legacy_ease_factor, scheduler_version,
    preset_version, content_version, version, buried_until
  )
  select p_learner_profile_id, sibling.id, v_preset.algorithm, 'new', pg_catalog.now(),
    case when v_preset.algorithm = 'fsrs' then 0 else null end,
    case when v_preset.algorithm = 'fsrs' then 0 else null end,
    0, 0, 0, 0, 0, case when v_preset.algorithm = 'sm2' then 2500 else null end,
    p_scheduler_version, v_preset.version, sibling.content_version, 1, p_buried_until
  from public.cards as sibling
  where sibling.note_id = v_note_id and sibling.id <> p_card_id
    and sibling.active and sibling.deleted_at is null
  on conflict (learner_profile_id, card_id) do update set
    buried_until = greatest(card_schedules.buried_until, excluded.buried_until),
    version = card_schedules.version + 1,
    updated_at = pg_catalog.now();
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception using errcode = '22023', message = 'card has no active siblings';
  end if;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('cardId', sibling.id, 'schedule', pg_catalog.to_jsonb(schedule.*))
    order by sibling.id
  ) into v_after
  from public.cards as sibling
  join public.card_schedules as schedule
    on schedule.learner_profile_id = p_learner_profile_id and schedule.card_id = sibling.id
  where sibling.note_id = v_note_id and sibling.id <> p_card_id
    and sibling.active and sibling.deleted_at is null;

  insert into public.schedule_operation_events (
    id, learner_profile_id, card_id, actor_account_id, device_id, operation,
    idempotency_key, affected_count, before_state, after_state
  ) values (
    p_operation_event_id, p_learner_profile_id, p_card_id, p_actor_account_id, p_device_id,
    'bury_siblings', p_idempotency_key, v_count, v_before, v_after
  );
  return pg_catalog.jsonb_build_object(
    'eventId', p_operation_event_id, 'duplicate', false, 'affectedCount', v_count
  );
end;
$function$;

create or replace function public.admin_report_study_content(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_card_id uuid,
  p_report_id uuid,
  p_idempotency_key uuid,
  p_reason public.study_content_report_reason,
  p_details text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deck_id uuid;
  v_content_version bigint;
  v_existing public.study_content_reports;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_card_id is null or p_report_id is null or p_idempotency_key is null or p_reason is null
    or (p_details is not null and pg_catalog.char_length(pg_catalog.btrim(p_details)) not between 1 and 1000) then
    raise exception using errcode = '22023', message = 'invalid study content report';
  end if;
  select * into v_existing from public.study_content_reports as report
  where report.learner_profile_id = p_learner_profile_id
    and report.idempotency_key = p_idempotency_key;
  if found then
    return pg_catalog.jsonb_build_object('reportId', v_existing.id, 'duplicate', true);
  end if;

  select note.deck_id, card.content_version into v_deck_id, v_content_version
  from public.cards as card
  join public.notes as note on note.id = card.note_id
  where card.id = p_card_id and card.active and card.deleted_at is null and note.deleted_at is null
    and private.srs_can_study_deck(p_actor_account_id, p_learner_profile_id, note.deck_id);
  if not found then
    raise exception using errcode = '42501', message = 'card is not available to report';
  end if;

  insert into public.study_content_reports (
    id, learner_profile_id, card_id, deck_id, reporter_account_id, device_id,
    reason, details, content_version, idempotency_key
  ) values (
    p_report_id, p_learner_profile_id, p_card_id, v_deck_id, p_actor_account_id, p_device_id,
    p_reason, nullif(pg_catalog.btrim(p_details), ''), v_content_version, p_idempotency_key
  );
  return pg_catalog.jsonb_build_object('reportId', p_report_id, 'duplicate', false);
end;
$function$;

revoke all on function public.admin_bury_srs_siblings(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text
) from public, anon, authenticated, service_role;
revoke all on function public.admin_report_study_content(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,public.study_content_report_reason,text
) from public, anon, authenticated, service_role;

grant execute on function public.admin_bury_srs_siblings(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text
) to service_role;
grant execute on function public.admin_report_study_content(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,public.study_content_report_reason,text
) to service_role;
