-- Explicit, previewed scheduler-algorithm migration. TypeScript replays immutable
-- history; PostgreSQL reauthorizes, locks, validates, compares versions, and commits.

create or replace function private.enforce_deck_srs_algorithm_compatibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_algorithm public.srs_algorithm;
begin
  select preset.algorithm into v_algorithm
  from public.srs_presets as preset
  where preset.id = new.preset_id
    and preset.learner_profile_id = new.learner_profile_id
    and preset.deleted_at is null;
  if not found or exists(
    select 1
    from public.card_schedules as schedule
    join public.cards as card on card.id = schedule.card_id
    join public.notes as note on note.id = card.note_id
    where schedule.learner_profile_id = new.learner_profile_id
      and note.deck_id = new.deck_id
      and schedule.algorithm <> v_algorithm
  ) then
    raise exception using errcode = '55000', message = 'preset algorithm migration requires schedule replay';
  end if;
  return new;
end;
$function$;

create trigger deck_srs_settings_algorithm_compatible
before insert or update of preset_id on public.deck_srs_settings
for each row execute function private.enforce_deck_srs_algorithm_compatibility();

create or replace function private.assert_srs_migration_scope(
  p_actor_account_id uuid,
  p_learner_profile_id uuid,
  p_deck_ids uuid[],
  p_target_preset_id uuid
)
returns public.srs_presets
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_preset public.srs_presets;
begin
  if p_deck_ids is null or pg_catalog.cardinality(p_deck_ids) not between 1 and 100
    or exists(
      select 1 from pg_catalog.unnest(p_deck_ids) as requested(deck_id)
      where not private.srs_can_study_deck(
        p_actor_account_id,
        p_learner_profile_id,
        requested.deck_id
      )
    ) then
    raise exception using errcode = '42501', message = 'one or more decks are unavailable';
  end if;
  select * into v_preset from public.srs_presets as preset
  where preset.id = p_target_preset_id
    and preset.learner_profile_id = p_learner_profile_id
    and preset.deleted_at is null;
  if not found then
    raise exception using errcode = '42501', message = 'target SRS preset is unavailable';
  end if;
  return v_preset;
end;
$function$;

create or replace function public.admin_preview_srs_algorithm_migration(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_deck_ids uuid[],
  p_target_preset_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_preset public.srs_presets;
  v_count integer;
  v_algorithms jsonb;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  v_preset := private.assert_srs_migration_scope(
    p_actor_account_id, p_learner_profile_id, p_deck_ids, p_target_preset_id
  );
  select coalesce(pg_catalog.sum(source.count), 0)::integer,
    coalesce(pg_catalog.jsonb_object_agg(source.algorithm, source.count), '{}'::jsonb)
  into v_count, v_algorithms
  from (
    select schedule.algorithm::text as algorithm, pg_catalog.count(*)::integer as count
    from public.card_schedules as schedule
    join public.cards as card on card.id = schedule.card_id
    join public.notes as note on note.id = card.note_id
    where schedule.learner_profile_id = p_learner_profile_id
      and note.deck_id = any(p_deck_ids)
      and schedule.algorithm <> v_preset.algorithm
    group by schedule.algorithm
  ) as source;
  return pg_catalog.jsonb_build_object(
    'affectedCount', coalesce(v_count, 0),
    'currentAlgorithms', v_algorithms,
    'targetAlgorithm', v_preset.algorithm,
    'targetPresetId', v_preset.id,
    'targetPresetVersion', v_preset.version
  );
end;
$function$;

create or replace function public.admin_get_srs_algorithm_migration_context(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_deck_ids uuid[],
  p_target_preset_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_preset public.srs_presets;
  v_rows jsonb;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  v_preset := private.assert_srs_migration_scope(
    p_actor_account_id, p_learner_profile_id, p_deck_ids, p_target_preset_id
  );
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'cardId', schedule.card_id,
      'createdAt', card.created_at,
      'expectedVersion', schedule.version,
      'history', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'rating', log.rating,
            'reviewedAt', log.reviewed_at,
            'durationMs', log.duration_ms
          ) order by log.reviewed_at, log.id
        )
        from public.review_logs as log
        where log.learner_profile_id = p_learner_profile_id
          and log.card_id = schedule.card_id
          and not exists(
            select 1 from public.review_undo_events as undo where undo.review_log_id = log.id
          )
      ), '[]'::jsonb)
    ) order by schedule.card_id
  ), '[]'::jsonb) into v_rows
  from public.card_schedules as schedule
  join public.cards as card on card.id = schedule.card_id
  join public.notes as note on note.id = card.note_id
  where schedule.learner_profile_id = p_learner_profile_id
    and note.deck_id = any(p_deck_ids)
    and schedule.algorithm <> v_preset.algorithm;
  return pg_catalog.jsonb_build_object('preset', pg_catalog.to_jsonb(v_preset), 'rows', v_rows);
end;
$function$;

create or replace function public.admin_commit_srs_algorithm_migration(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_deck_ids uuid[],
  p_target_preset_id uuid,
  p_expected_count integer,
  p_operation_event_id uuid,
  p_idempotency_key uuid,
  p_transitions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_preset public.srs_presets;
  v_existing public.schedule_operation_events;
  v_count integer;
  v_transition jsonb;
  v_schedule public.card_schedules;
  v_after jsonb;
  v_before jsonb;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  v_preset := private.assert_srs_migration_scope(
    p_actor_account_id, p_learner_profile_id, p_deck_ids, p_target_preset_id
  );
  if p_expected_count < 1 or p_operation_event_id is null or p_idempotency_key is null
    or pg_catalog.jsonb_typeof(p_transitions) <> 'array'
    or pg_catalog.jsonb_array_length(p_transitions) <> p_expected_count
    or p_expected_count > 10000 then
    raise exception using errcode = '22023', message = 'invalid algorithm migration command';
  end if;
  select * into v_existing from public.schedule_operation_events as event
  where event.learner_profile_id = p_learner_profile_id
    and event.idempotency_key = p_idempotency_key;
  if found then
    return pg_catalog.jsonb_build_object(
      'eventId', v_existing.id,
      'duplicate', true,
      'affectedCount', v_existing.affected_count
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('srs-migration:' || p_learner_profile_id::text, 0)
  );
  perform 1
  from public.card_schedules as schedule
  join public.cards as card on card.id = schedule.card_id
  join public.notes as note on note.id = card.note_id
  where schedule.learner_profile_id = p_learner_profile_id
    and note.deck_id = any(p_deck_ids)
  order by schedule.card_id
  for update of schedule;

  select pg_catalog.count(*)::integer into v_count
  from public.card_schedules as schedule
  join public.cards as card on card.id = schedule.card_id
  join public.notes as note on note.id = card.note_id
  where schedule.learner_profile_id = p_learner_profile_id
    and note.deck_id = any(p_deck_ids)
    and schedule.algorithm <> v_preset.algorithm;
  if v_count <> p_expected_count then
    raise exception using errcode = '40001', message = 'SRS_ALGORITHM_PREVIEW_STALE';
  end if;

  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(schedule.*) order by schedule.card_id)
  into v_before
  from public.card_schedules as schedule
  where schedule.learner_profile_id = p_learner_profile_id
    and schedule.card_id in (
      select (entry->>'cardId')::uuid
      from pg_catalog.jsonb_array_elements(p_transitions) as entry
    );

  for v_transition in select value from pg_catalog.jsonb_array_elements(p_transitions) loop
    if not v_transition ?& array['cardId','expectedVersion','scheduleAfter']
      or pg_catalog.jsonb_typeof(v_transition->'scheduleAfter') <> 'object' then
      raise exception using errcode = '22023', message = 'invalid algorithm migration transition';
    end if;
    select schedule.* into v_schedule
    from public.card_schedules as schedule
    join public.cards as card on card.id = schedule.card_id
    join public.notes as note on note.id = card.note_id
    where schedule.learner_profile_id = p_learner_profile_id
      and schedule.card_id = (v_transition->>'cardId')::uuid
      and note.deck_id = any(p_deck_ids);
    if not found or v_schedule.version <> (v_transition->>'expectedVersion')::bigint
      or v_schedule.algorithm = v_preset.algorithm
      or not private.srs_schedule_json_valid(v_transition->'scheduleAfter', v_preset.algorithm) then
      raise exception using errcode = '40001', message = 'SRS_ALGORITHM_MIGRATION_STALE';
    end if;
    update public.card_schedules set
      algorithm = v_preset.algorithm,
      state = (v_transition->'scheduleAfter'->>'state')::public.srs_state,
      due = (v_transition->'scheduleAfter'->>'due')::timestamptz,
      last_reviewed_at = (v_transition->'scheduleAfter'->>'lastReviewedAt')::timestamptz,
      stability = (v_transition->'scheduleAfter'->>'stability')::double precision,
      difficulty = (v_transition->'scheduleAfter'->>'difficulty')::double precision,
      elapsed_days = (v_transition->'scheduleAfter'->>'elapsedDays')::integer,
      scheduled_days = (v_transition->'scheduleAfter'->>'scheduledDays')::integer,
      learning_step = (v_transition->'scheduleAfter'->>'learningStep')::integer,
      reps = (v_transition->'scheduleAfter'->>'reps')::integer,
      lapses = (v_transition->'scheduleAfter'->>'lapses')::integer,
      legacy_ease_factor = (v_transition->'scheduleAfter'->>'legacyEaseFactor')::integer,
      scheduler_version = v_transition->'scheduleAfter'->>'schedulerVersion',
      preset_version = v_preset.version,
      version = v_schedule.version + 1,
      updated_at = pg_catalog.now()
    where learner_profile_id = p_learner_profile_id and card_id = v_schedule.card_id;
  end loop;

  insert into public.deck_srs_settings (learner_profile_id, deck_id, preset_id)
  select p_learner_profile_id, requested.deck_id, p_target_preset_id
  from (select distinct value as deck_id from pg_catalog.unnest(p_deck_ids) as value) as requested
  on conflict (learner_profile_id, deck_id) do update set
    preset_id = excluded.preset_id,
    version = deck_srs_settings.version + 1,
    updated_at = pg_catalog.now();

  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(schedule.*) order by schedule.card_id)
  into v_after
  from public.card_schedules as schedule
  where schedule.learner_profile_id = p_learner_profile_id
    and schedule.card_id in (
      select (entry->>'cardId')::uuid
      from pg_catalog.jsonb_array_elements(p_transitions) as entry
    );
  insert into public.schedule_operation_events (
    id, learner_profile_id, card_id, actor_account_id, device_id, operation,
    idempotency_key, affected_count, before_state, after_state
  ) values (
    p_operation_event_id, p_learner_profile_id, null, p_actor_account_id, p_device_id,
    'algorithm_migration', p_idempotency_key, v_count, v_before, v_after
  );
  return pg_catalog.jsonb_build_object(
    'eventId', p_operation_event_id,
    'duplicate', false,
    'affectedCount', v_count,
    'targetAlgorithm', v_preset.algorithm,
    'targetPresetId', v_preset.id
  );
exception when invalid_text_representation or numeric_value_out_of_range or check_violation then
  raise exception using errcode = '22023', message = 'invalid algorithm migration transition';
end;
$function$;

revoke all on function private.enforce_deck_srs_algorithm_compatibility()
from public, anon, authenticated, service_role;
revoke all on function private.assert_srs_migration_scope(uuid,uuid,uuid[],uuid)
from public, anon, authenticated, service_role;
revoke all on function public.admin_preview_srs_algorithm_migration(uuid,uuid,uuid,uuid,uuid,uuid[],uuid)
from public, anon, authenticated, service_role;
revoke all on function public.admin_get_srs_algorithm_migration_context(uuid,uuid,uuid,uuid,uuid,uuid[],uuid)
from public, anon, authenticated, service_role;
revoke all on function public.admin_commit_srs_algorithm_migration(
  uuid,uuid,uuid,uuid,uuid,uuid[],uuid,integer,uuid,uuid,jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.admin_preview_srs_algorithm_migration(uuid,uuid,uuid,uuid,uuid,uuid[],uuid)
to service_role;
grant execute on function public.admin_get_srs_algorithm_migration_context(uuid,uuid,uuid,uuid,uuid,uuid[],uuid)
to service_role;
grant execute on function public.admin_commit_srs_algorithm_migration(
  uuid,uuid,uuid,uuid,uuid,uuid[],uuid,integer,uuid,uuid,jsonb
) to service_role;
