-- Trusted replacements for forget, manual reschedule, replay rebuild, and algorithm migration.

create or replace function public.admin_replace_srs_schedule(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_card_id uuid,
  p_operation public.schedule_operation_kind,
  p_operation_event_id uuid,
  p_idempotency_key uuid,
  p_expected_schedule_version bigint,
  p_preset_id uuid,
  p_preset_version bigint,
  p_schedule_after jsonb,
  p_scheduler_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_schedule public.card_schedules;
  v_preset public.srs_presets;
  v_existing public.schedule_operation_events;
  v_deck_id uuid;
  v_content_version bigint;
  v_before jsonb;
  v_after jsonb;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_operation not in ('forget','manual_due','reschedule','rebuild','algorithm_migration')
    or p_operation_event_id is null or p_idempotency_key is null or p_expected_schedule_version < 0 then
    raise exception using errcode = '22023', message = 'invalid schedule replacement';
  end if;
  select * into v_existing from public.schedule_operation_events as event
  where event.learner_profile_id = p_learner_profile_id and event.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.card_id <> p_card_id or v_existing.operation <> p_operation then
      raise exception using errcode = '22023', message = 'schedule replacement idempotency key was reused';
    end if;
    return pg_catalog.jsonb_build_object('eventId', v_existing.id, 'duplicate', true, 'schedule', v_existing.after_state);
  end if;
  select note.deck_id, card.content_version into v_deck_id, v_content_version
  from public.cards as card join public.notes as note on note.id = card.note_id
  where card.id = p_card_id and card.active and card.deleted_at is null and note.deleted_at is null;
  if not found or not private.srs_can_study_deck(p_actor_account_id, p_learner_profile_id, v_deck_id) then
    raise exception using errcode = '42501', message = 'card is unavailable for schedule replacement';
  end if;
  select * into v_preset from public.srs_presets as preset
  where preset.id = p_preset_id and preset.learner_profile_id = p_learner_profile_id
    and preset.version = p_preset_version and preset.deleted_at is null;
  if not found or not private.srs_schedule_json_valid(p_schedule_after, v_preset.algorithm)
    or p_schedule_after->>'schedulerVersion' <> p_scheduler_version then
    raise exception using errcode = '40001', message = 'SRS_STALE_PRESET';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('srs-card:' || p_learner_profile_id::text || ':' || p_card_id::text, 0)
  );
  select * into v_schedule from public.card_schedules as schedule
  where schedule.learner_profile_id = p_learner_profile_id and schedule.card_id = p_card_id for update;
  if found and v_schedule.version <> p_expected_schedule_version then
    raise exception using errcode = '40001', message = 'SRS_STALE_VERSION';
  elsif not found and p_expected_schedule_version <> 0 then
    raise exception using errcode = '40001', message = 'SRS_STALE_VERSION';
  end if;
  v_before := case when v_schedule.card_id is null then '{}'::jsonb else pg_catalog.to_jsonb(v_schedule) end;
  insert into public.card_schedules (
    learner_profile_id, card_id, algorithm, state, due, last_reviewed_at, stability, difficulty,
    elapsed_days, scheduled_days, learning_step, reps, lapses, legacy_ease_factor,
    scheduler_version, preset_version, content_version, version
  ) values (
    p_learner_profile_id, p_card_id, v_preset.algorithm, (p_schedule_after->>'state')::public.srs_state,
    (p_schedule_after->>'due')::timestamptz, (p_schedule_after->>'lastReviewedAt')::timestamptz,
    (p_schedule_after->>'stability')::double precision, (p_schedule_after->>'difficulty')::double precision,
    (p_schedule_after->>'elapsedDays')::integer, (p_schedule_after->>'scheduledDays')::integer,
    (p_schedule_after->>'learningStep')::integer, (p_schedule_after->>'reps')::integer,
    (p_schedule_after->>'lapses')::integer, (p_schedule_after->>'legacyEaseFactor')::integer,
    p_scheduler_version, p_preset_version, v_content_version, p_expected_schedule_version + 1
  ) on conflict (learner_profile_id, card_id) do update set
    algorithm = excluded.algorithm, state = excluded.state, due = excluded.due,
    last_reviewed_at = excluded.last_reviewed_at, stability = excluded.stability,
    difficulty = excluded.difficulty, elapsed_days = excluded.elapsed_days,
    scheduled_days = excluded.scheduled_days, learning_step = excluded.learning_step,
    reps = excluded.reps, lapses = excluded.lapses, legacy_ease_factor = excluded.legacy_ease_factor,
    scheduler_version = excluded.scheduler_version, preset_version = excluded.preset_version,
    content_version = excluded.content_version, version = excluded.version,
    suspended = false, suspended_at = null, buried_until = null, leech = false,
    updated_at = pg_catalog.now()
  returning pg_catalog.to_jsonb(card_schedules.*) into v_after;
  insert into public.schedule_operation_events (
    id, learner_profile_id, card_id, actor_account_id, device_id, operation,
    idempotency_key, affected_count, before_state, after_state
  ) values (
    p_operation_event_id, p_learner_profile_id, p_card_id, p_actor_account_id, p_device_id,
    p_operation, p_idempotency_key, 1, v_before, v_after
  );
  insert into public.schedule_snapshots (
    learner_profile_id, card_id, schedule_version, schedule, reason
  ) values (
    p_learner_profile_id, p_card_id, p_expected_schedule_version + 1, p_schedule_after,
    case when p_operation = 'rebuild' then 'rebuild'
      when p_operation = 'algorithm_migration' then 'migration' else 'operation' end
  );
  return pg_catalog.jsonb_build_object(
    'eventId', p_operation_event_id, 'duplicate', false,
    'scheduleVersion', p_expected_schedule_version + 1, 'schedule', v_after
  );
end;
$function$;

revoke all on function public.admin_replace_srs_schedule(
  uuid,uuid,uuid,uuid,uuid,uuid,public.schedule_operation_kind,uuid,uuid,bigint,uuid,bigint,jsonb,text
) from public, anon, authenticated, service_role;
grant execute on function public.admin_replace_srs_schedule(
  uuid,uuid,uuid,uuid,uuid,uuid,public.schedule_operation_kind,uuid,uuid,bigint,uuid,bigint,jsonb,text
) to service_role;
