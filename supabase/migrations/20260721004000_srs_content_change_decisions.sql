-- Per-learner resolution of semantic content changes. Content authors never mutate another learner's schedule.

create or replace function public.admin_apply_content_change_schedule_decision(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_card_id uuid,
  p_choice public.content_change_resolution,
  p_operation_event_id uuid,
  p_idempotency_key uuid,
  p_expected_schedule_version bigint,
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
  v_note_id uuid;
  v_deck_id uuid;
  v_content_version bigint;
  v_impact_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_choice not in ('preserve','relearn','reset') or p_operation_event_id is null
    or p_idempotency_key is null or p_expected_schedule_version < 1 then
    raise exception using errcode = '22023', message = 'invalid content-change schedule decision';
  end if;
  select * into v_existing from public.schedule_operation_events as event
  where event.learner_profile_id = p_learner_profile_id and event.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.card_id <> p_card_id
      or v_existing.operation::text <> ('content_' || p_choice::text) then
      raise exception using errcode = '22023', message = 'content-change idempotency key was reused';
    end if;
    return pg_catalog.jsonb_build_object('eventId', v_existing.id, 'duplicate', true, 'schedule', v_existing.after_state);
  end if;
  select note.id, note.deck_id, card.content_version into v_note_id, v_deck_id, v_content_version
  from public.cards as card join public.notes as note on note.id = card.note_id
  where card.id = p_card_id and card.active and card.deleted_at is null and note.deleted_at is null;
  if not found or not private.srs_can_study_deck(p_actor_account_id, p_learner_profile_id, v_deck_id) then
    raise exception using errcode = '42501', message = 'card is unavailable for a content-change decision';
  end if;
  select preset.* into v_preset
  from public.deck_srs_settings as setting join public.srs_presets as preset on preset.id = setting.preset_id
  where setting.learner_profile_id = p_learner_profile_id and setting.deck_id = v_deck_id and preset.deleted_at is null;
  if not found then v_preset := private.ensure_default_srs_preset(p_learner_profile_id); end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('srs-card:' || p_learner_profile_id::text || ':' || p_card_id::text, 0)
  );
  select * into v_schedule from public.card_schedules as schedule
  where schedule.learner_profile_id = p_learner_profile_id and schedule.card_id = p_card_id for update;
  if not found or v_schedule.version <> p_expected_schedule_version then
    raise exception using errcode = '40001', message = 'SRS_STALE_VERSION';
  end if;
  if v_schedule.content_version = v_content_version then
    raise exception using errcode = '40001', message = 'SRS_CONTENT_ALREADY_RESOLVED';
  end if;
  if p_choice <> 'preserve' and (
    not private.srs_schedule_json_valid(p_schedule_after, v_preset.algorithm)
    or p_schedule_after->>'schedulerVersion' <> p_scheduler_version
  ) then
    raise exception using errcode = '22023', message = 'invalid content-change schedule transition';
  end if;
  v_before := pg_catalog.to_jsonb(v_schedule);
  if p_choice = 'preserve' then
    update public.card_schedules set content_version = v_content_version,
      preset_version = v_preset.version, version = version + 1, updated_at = pg_catalog.now()
    where learner_profile_id = p_learner_profile_id and card_id = p_card_id
    returning pg_catalog.to_jsonb(card_schedules.*) into v_after;
  else
    update public.card_schedules set
      algorithm = (p_schedule_after->>'algorithm')::public.srs_algorithm,
      state = (p_schedule_after->>'state')::public.srs_state,
      due = (p_schedule_after->>'due')::timestamptz,
      last_reviewed_at = (p_schedule_after->>'lastReviewedAt')::timestamptz,
      stability = (p_schedule_after->>'stability')::double precision,
      difficulty = (p_schedule_after->>'difficulty')::double precision,
      elapsed_days = (p_schedule_after->>'elapsedDays')::integer,
      scheduled_days = (p_schedule_after->>'scheduledDays')::integer,
      learning_step = (p_schedule_after->>'learningStep')::integer,
      reps = (p_schedule_after->>'reps')::integer,
      lapses = (p_schedule_after->>'lapses')::integer,
      legacy_ease_factor = (p_schedule_after->>'legacyEaseFactor')::integer,
      scheduler_version = p_scheduler_version, preset_version = v_preset.version,
      content_version = v_content_version, version = version + 1, updated_at = pg_catalog.now()
    where learner_profile_id = p_learner_profile_id and card_id = p_card_id
    returning pg_catalog.to_jsonb(card_schedules.*) into v_after;
  end if;
  insert into public.schedule_operation_events (
    id, learner_profile_id, card_id, actor_account_id, device_id, operation,
    idempotency_key, affected_count, before_state, after_state
  ) values (
    p_operation_event_id, p_learner_profile_id, p_card_id, p_actor_account_id, p_device_id,
    ('content_' || p_choice::text)::public.schedule_operation_kind,
    p_idempotency_key, 1, v_before, v_after
  );
  select impact.id into v_impact_id
  from public.content_change_impacts as impact
  where impact.note_id = v_note_id and impact.to_note_version = v_content_version
    and impact.classification in ('prompt','answer','structural')
  order by impact.created_at desc limit 1;
  if v_impact_id is not null then
    insert into public.content_change_schedule_decisions (
      content_change_impact_id, learner_profile_id, choice, decided_by_account_id,
      idempotency_key, affected_schedule_count
    ) values (
      v_impact_id, p_learner_profile_id, p_choice, p_actor_account_id, p_idempotency_key, 1
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'eventId', p_operation_event_id, 'duplicate', false, 'choice', p_choice,
    'scheduleVersion', p_expected_schedule_version + 1, 'schedule', v_after
  );
end;
$function$;

revoke all on function public.admin_apply_content_change_schedule_decision(
  uuid,uuid,uuid,uuid,uuid,uuid,public.content_change_resolution,uuid,uuid,bigint,jsonb,text
) from public, anon, authenticated, service_role;
grant execute on function public.admin_apply_content_change_schedule_decision(
  uuid,uuid,uuid,uuid,uuid,uuid,public.content_change_resolution,uuid,uuid,bigint,jsonb,text
) to service_role;
