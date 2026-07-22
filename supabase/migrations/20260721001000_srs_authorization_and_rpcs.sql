-- Phase 03 trusted scheduling boundary. TypeScript computes transitions through
-- @lumen/srs; these service-only functions validate, compare-and-swap, and commit atomically.

create or replace function private.assert_srs_runtime_context(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_kind public.learner_profile_kind;
begin
  if p_actor_account_id is null or p_auth_session_id is null or p_device_id is null or p_learner_profile_id is null then
    raise exception using errcode = '22023', message = 'invalid SRS runtime context';
  end if;

  if not exists(
      select 1 from public.profiles as profile
      where profile.id = p_actor_account_id
        and profile.auth_subject_id = p_actor_account_id
        and profile.account_status = 'active'
    )
    or not exists(
      select 1 from auth.sessions as session
      where session.id = p_auth_session_id
        and session.user_id = p_actor_account_id
        and (session.not_after is null or session.not_after > pg_catalog.now())
    )
    or not exists(
      select 1 from public.devices as device
      where device.id = p_device_id
        and device.account_id = p_actor_account_id
        and device.auth_session_id = p_auth_session_id
        and device.revoked_at is null
    )
    or not private.can_access_learner_profile(p_actor_account_id, p_learner_profile_id, 'study') then
    raise exception using errcode = '42501', message = 'SRS runtime context is not authorized';
  end if;

  select learner.kind into v_kind
  from public.learner_profiles as learner
  where learner.id = p_learner_profile_id and learner.status = 'active';
  if not found then
    raise exception using errcode = '42501', message = 'learner profile is unavailable';
  end if;

  if v_kind = 'self' then
    if p_profile_session_id is not null or not exists(
      select 1 from public.learner_profiles as learner
      where learner.id = p_learner_profile_id and learner.owner_account_id = p_actor_account_id
    ) then
      raise exception using errcode = '42501', message = 'self learner context is invalid';
    end if;
  elsif p_profile_session_id is null or not exists(
    select 1 from public.profile_sessions as session
    where session.id = p_profile_session_id
      and session.account_id = p_actor_account_id
      and session.auth_session_id = p_auth_session_id
      and session.device_id = p_device_id
      and session.learner_profile_id = p_learner_profile_id
      and session.revoked_at is null
      and session.expires_at > pg_catalog.now()
  ) then
    raise exception using errcode = '42501', message = 'managed learner session is invalid';
  end if;
end;
$function$;

create or replace function private.ensure_default_srs_preset(p_learner_profile_id uuid)
returns public.srs_presets
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_preset public.srs_presets;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('srs-default-preset:' || p_learner_profile_id::text, 0)
  );
  select * into v_preset from public.srs_presets as preset
  where preset.learner_profile_id = p_learner_profile_id
    and preset.is_default and preset.deleted_at is null
  for update;
  if found then return v_preset; end if;

  insert into public.srs_presets (learner_profile_id, name, is_default)
  values (p_learner_profile_id, 'Default', true)
  returning * into v_preset;
  return v_preset;
end;
$function$;

create or replace function private.srs_can_study_deck(
  p_actor_account_id uuid,
  p_learner_profile_id uuid,
  p_deck_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.can_access_learner_profile(p_actor_account_id, p_learner_profile_id, 'study')
    and exists(
      select 1 from public.decks as deck
      where deck.id = p_deck_id and deck.status = 'active'
        and (
          deck.owner_account_id = p_actor_account_id
          or exists(
            select 1 from public.deck_members as member
            where member.deck_id = deck.id and member.account_id = p_actor_account_id
              and member.revoked_at is null
          )
        )
    );
$function$;

create or replace function private.srs_schedule_json_valid(
  p_schedule jsonb,
  p_algorithm public.srs_algorithm
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  v_state text;
  v_stability double precision;
  v_difficulty double precision;
  v_ease integer;
begin
  if p_schedule is null or pg_catalog.jsonb_typeof(p_schedule) <> 'object'
    or not p_schedule ?& array[
      'algorithm','state','due','lastReviewedAt','stability','difficulty','elapsedDays',
      'scheduledDays','learningStep','reps','lapses','legacyEaseFactor','schedulerVersion'
    ]
    or p_schedule->>'algorithm' <> p_algorithm::text
    or pg_catalog.char_length(p_schedule->>'schedulerVersion') not between 1 and 120 then
    return false;
  end if;
  v_state := p_schedule->>'state';
  if v_state not in ('new', 'learning', 'review', 'relearning')
    or (p_schedule->>'due')::timestamptz is null
    or (p_schedule->>'elapsedDays')::integer < 0
    or (p_schedule->>'scheduledDays')::integer < 0
    or (p_schedule->>'learningStep')::integer < 0
    or (p_schedule->>'reps')::integer < 0
    or (p_schedule->>'lapses')::integer < 0 then
    return false;
  end if;
  if p_schedule->>'lastReviewedAt' is not null then
    perform (p_schedule->>'lastReviewedAt')::timestamptz;
  end if;
  if p_algorithm = 'fsrs' then
    if p_schedule->'legacyEaseFactor' <> 'null'::jsonb then return false; end if;
    v_stability := (p_schedule->>'stability')::double precision;
    v_difficulty := (p_schedule->>'difficulty')::double precision;
    return v_stability between 0 and 36500 and v_difficulty between 0 and 10;
  end if;
  if p_schedule->'stability' <> 'null'::jsonb or p_schedule->'difficulty' <> 'null'::jsonb then return false; end if;
  v_ease := (p_schedule->>'legacyEaseFactor')::integer;
  return v_ease between 1300 and 4000;
exception when others then
  return false;
end;
$function$;

create or replace function private.srs_schedule_matches_row(
  p_learner_profile_id uuid,
  p_card_id uuid,
  p_schedule jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1 from public.card_schedules as schedule
    where schedule.learner_profile_id = p_learner_profile_id
      and schedule.card_id = p_card_id
      and schedule.algorithm::text = p_schedule->>'algorithm'
      and schedule.state::text = p_schedule->>'state'
      and schedule.due = (p_schedule->>'due')::timestamptz
      and schedule.last_reviewed_at is not distinct from (p_schedule->>'lastReviewedAt')::timestamptz
      and schedule.stability is not distinct from (p_schedule->>'stability')::double precision
      and schedule.difficulty is not distinct from (p_schedule->>'difficulty')::double precision
      and schedule.elapsed_days = (p_schedule->>'elapsedDays')::integer
      and schedule.scheduled_days = (p_schedule->>'scheduledDays')::integer
      and schedule.learning_step = (p_schedule->>'learningStep')::integer
      and schedule.reps = (p_schedule->>'reps')::integer
      and schedule.lapses = (p_schedule->>'lapses')::integer
      and schedule.legacy_ease_factor is not distinct from (p_schedule->>'legacyEaseFactor')::integer
      and schedule.scheduler_version = p_schedule->>'schedulerVersion'
  );
$function$;

create or replace function private.srs_review_result(p_log public.review_logs)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'reviewId', p_log.id,
    'duplicate', true,
    'scheduleVersion', p_log.schedule_version_after,
    'schedule', p_log.schedule_after,
    'studyDay', p_log.study_day,
    'leech', coalesce((p_log.schedule_after->>'lapses')::integer >= preset.leech_threshold, false),
    'remainingDue', (
      select pg_catalog.count(*)::integer
      from public.cards as card
      join public.notes as note on note.id = card.note_id
      left join public.card_schedules as schedule
        on schedule.card_id = card.id and schedule.learner_profile_id = p_log.learner_profile_id
      where card.active and card.deleted_at is null and note.deleted_at is null
        and private.srs_can_study_deck(
          p_log.actor_account_id,
          p_log.learner_profile_id,
          note.deck_id
        )
        and (schedule.card_id is null or (
          not schedule.suspended and (schedule.buried_until is null or schedule.buried_until <= pg_catalog.now())
          and schedule.due <= pg_catalog.now()
        ))
    )
  )
  from public.srs_presets as preset where preset.id = p_log.preset_id;
$function$;

create or replace function public.admin_get_srs_review_context(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_card_id uuid,
  p_study_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deck_id uuid;
  v_content_version bigint;
  v_schedule public.card_schedules;
  v_preset public.srs_presets;
  v_session public.study_sessions;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  select note.deck_id, card.content_version into v_deck_id, v_content_version
  from public.cards as card join public.notes as note on note.id = card.note_id
  join public.decks as deck on deck.id = note.deck_id
  where card.id = p_card_id and card.active and card.deleted_at is null
    and note.deleted_at is null and deck.status = 'active';
  if not found or not private.srs_can_study_deck(p_actor_account_id, p_learner_profile_id, v_deck_id) then
    raise exception using errcode = '42501', message = 'card is not available for study';
  end if;

  if p_study_session_id is not null then
    select * into v_session from public.study_sessions as session
    where session.id = p_study_session_id for update;
    if not found or v_session.learner_profile_id <> p_learner_profile_id
      or v_session.actor_account_id <> p_actor_account_id
      or v_session.status not in ('active', 'paused')
      or not exists(
        select 1 from public.study_session_items as item
        where item.study_session_id = p_study_session_id and item.card_id = p_card_id
          and item.status in ('pending', 'shown')
      ) then
      raise exception using errcode = '42501', message = 'study session item is unavailable';
    end if;
  end if;

  v_preset := private.ensure_default_srs_preset(p_learner_profile_id);
  select preset.* into v_preset
  from public.deck_srs_settings as setting join public.srs_presets as preset on preset.id = setting.preset_id
  where setting.learner_profile_id = p_learner_profile_id and setting.deck_id = v_deck_id
    and preset.deleted_at is null;
  if not found then
    v_preset := private.ensure_default_srs_preset(p_learner_profile_id);
    insert into public.deck_srs_settings (learner_profile_id, deck_id, preset_id)
    values (p_learner_profile_id, v_deck_id, v_preset.id)
    on conflict (learner_profile_id, deck_id) do nothing;
  end if;

  select * into v_schedule from public.card_schedules as schedule
  where schedule.learner_profile_id = p_learner_profile_id and schedule.card_id = p_card_id;

  return pg_catalog.jsonb_build_object(
    'deckId', v_deck_id,
    'contentVersion', v_content_version,
    'scheduleVersion', coalesce(v_schedule.version, 0),
    'schedule', case when v_schedule.card_id is null then null else pg_catalog.jsonb_build_object(
      'algorithm', v_schedule.algorithm, 'state', v_schedule.state, 'due', v_schedule.due,
      'lastReviewedAt', v_schedule.last_reviewed_at, 'stability', v_schedule.stability,
      'difficulty', v_schedule.difficulty, 'elapsedDays', v_schedule.elapsed_days,
      'scheduledDays', v_schedule.scheduled_days, 'learningStep', v_schedule.learning_step,
      'reps', v_schedule.reps, 'lapses', v_schedule.lapses,
      'legacyEaseFactor', v_schedule.legacy_ease_factor, 'schedulerVersion', v_schedule.scheduler_version
    ) end,
    'suspended', coalesce(v_schedule.suspended, false),
    'buriedUntil', v_schedule.buried_until,
    'timezone', v_session.timezone,
    'studyDayStart', v_session.study_day_start,
    'source', v_session.source,
    'rescheduling', v_session.rescheduling,
    'preset', pg_catalog.to_jsonb(v_preset)
  );
end;
$function$;

create or replace function public.admin_create_study_session(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_study_session_id uuid,
  p_deck_id uuid,
  p_filter_id uuid,
  p_mode public.study_session_mode,
  p_source public.review_source,
  p_rescheduling boolean,
  p_timezone text,
  p_study_day_start smallint,
  p_started_at timestamptz,
  p_queue_seed text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item jsonb;
  v_count integer;
  v_study_day date;
  v_existing public.study_sessions;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_study_session_id is null or p_started_at is null or p_study_day_start not between 0 and 1439
    or pg_catalog.char_length(p_timezone) not between 1 and 80
    or not exists(select 1 from pg_catalog.pg_timezone_names where name = p_timezone)
    or pg_catalog.char_length(p_queue_seed) not between 8 and 200
    or pg_catalog.jsonb_typeof(p_items) <> 'array'
    or pg_catalog.jsonb_array_length(p_items) > 10000 then
    raise exception using errcode = '22023', message = 'invalid study session request';
  end if;
  if p_deck_id is not null and not private.srs_can_study_deck(p_actor_account_id, p_learner_profile_id, p_deck_id) then
    raise exception using errcode = '42501', message = 'deck is not available for study';
  end if;
  if p_filter_id is not null and not exists(
    select 1 from public.study_filters as filter
    where filter.id = p_filter_id and filter.learner_profile_id = p_learner_profile_id and filter.deleted_at is null
  ) then
    raise exception using errcode = '42501', message = 'study filter is unavailable';
  end if;
  if not p_rescheduling and p_source not in ('filtered', 'cram') then
    raise exception using errcode = '22023', message = 'only filtered or cram sessions can be preview-only';
  end if;
  v_study_day := ((p_started_at at time zone p_timezone) - pg_catalog.make_interval(mins => p_study_day_start))::date;
  v_count := pg_catalog.jsonb_array_length(p_items);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('study-session:' || p_study_session_id::text, 0));
  select * into v_existing from public.study_sessions as session where session.id = p_study_session_id;
  if found then
    if v_existing.actor_account_id <> p_actor_account_id or v_existing.learner_profile_id <> p_learner_profile_id
      or v_existing.total_items <> v_count then
      raise exception using errcode = '22023', message = 'study session id was reused with different input';
    end if;
    return pg_catalog.jsonb_build_object('sessionId', v_existing.id, 'totalItems', v_existing.total_items, 'duplicate', true);
  end if;

  insert into public.study_sessions (
    id, learner_profile_id, actor_account_id, deck_id, filter_id, mode, source, rescheduling,
    timezone, study_day_start, study_day, queue_seed, total_items, started_at, last_activity_at
  ) values (
    p_study_session_id, p_learner_profile_id, p_actor_account_id, p_deck_id, p_filter_id, p_mode, p_source,
    p_rescheduling, p_timezone, p_study_day_start, v_study_day, p_queue_seed, v_count, p_started_at, p_started_at
  );

  for v_item in select value from pg_catalog.jsonb_array_elements(p_items) loop
    if not (v_item ?& array['cardId','position','scheduleVersion','state'])
      or (v_item->>'position')::integer not between 0 and 9999
      or (v_item->>'scheduleVersion')::bigint < 0
      or (v_item->>'state') not in ('new','learning','review','relearning')
      or not exists(
        select 1 from public.cards as card join public.notes as note on note.id = card.note_id
        where card.id = (v_item->>'cardId')::uuid and card.active and card.deleted_at is null
          and note.deleted_at is null
          and private.srs_can_study_deck(p_actor_account_id, p_learner_profile_id, note.deck_id)
          and (p_deck_id is null or note.deck_id = p_deck_id)
      ) then
      raise exception using errcode = '22023', message = 'invalid study session item';
    end if;
    insert into public.study_session_items (
      study_session_id, position, card_id, schedule_version_at_enqueue, state_at_enqueue
    ) values (
      p_study_session_id, (v_item->>'position')::integer, (v_item->>'cardId')::uuid,
      (v_item->>'scheduleVersion')::bigint, (v_item->>'state')::public.srs_state
    );
  end loop;
  return pg_catalog.jsonb_build_object('sessionId', p_study_session_id, 'totalItems', v_count, 'duplicate', false);
exception when unique_violation or invalid_text_representation then
  raise exception using errcode = '22023', message = 'invalid study session item';
end;
$function$;

create or replace function public.admin_commit_srs_review(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_card_id uuid,
  p_study_session_id uuid,
  p_rating public.review_rating,
  p_reviewed_at timestamptz,
  p_duration_ms integer,
  p_timezone text,
  p_study_day_start smallint,
  p_current_schedule_version bigint,
  p_review_id uuid,
  p_idempotency_key uuid,
  p_command_hash text,
  p_source public.review_source,
  p_preset_id uuid,
  p_preset_version bigint,
  p_schedule_before jsonb,
  p_schedule_after jsonb,
  p_scheduler_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing public.review_logs;
  v_schedule public.card_schedules;
  v_preset public.srs_presets;
  v_session public.study_sessions;
  v_deck_id uuid;
  v_note_id uuid;
  v_content_version bigint;
  v_study_day date;
  v_remaining integer;
  v_is_leech boolean;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_review_id is null or p_idempotency_key is null or p_reviewed_at is null
    or p_duration_ms not between 0 and 86400000 or p_study_day_start not between 0 and 1439
    or p_current_schedule_version < 0 or p_preset_version <= 0
    or p_command_hash !~ '^[a-f0-9]{64}$'
    or pg_catalog.char_length(p_timezone) not between 1 and 80
    or not exists(select 1 from pg_catalog.pg_timezone_names where name = p_timezone)
    or p_reviewed_at > pg_catalog.now() + interval '5 minutes'
    or p_reviewed_at < pg_catalog.now() - interval '24 hours' then
    raise exception using errcode = '22023', message = 'invalid review command';
  end if;

  select * into v_existing from public.review_logs as log
  where log.id = p_review_id
     or (log.learner_profile_id = p_learner_profile_id and log.idempotency_key = p_idempotency_key)
  order by case when log.id = p_review_id then 0 else 1 end limit 1;
  if found then
    if v_existing.learner_profile_id <> p_learner_profile_id or v_existing.command_hash <> p_command_hash then
      raise exception using errcode = '22023', message = 'review idempotency key was reused with different input';
    end if;
    return private.srs_review_result(v_existing);
  end if;

  select note.deck_id, note.id, card.content_version into v_deck_id, v_note_id, v_content_version
  from public.cards as card join public.notes as note on note.id = card.note_id
  join public.decks as deck on deck.id = note.deck_id
  where card.id = p_card_id and card.active and card.deleted_at is null
    and note.deleted_at is null and deck.status = 'active';
  if not found or not private.srs_can_study_deck(p_actor_account_id, p_learner_profile_id, v_deck_id) then
    raise exception using errcode = '42501', message = 'card is not available for study';
  end if;

  select * into v_preset from public.srs_presets as preset
  where preset.id = p_preset_id and preset.learner_profile_id = p_learner_profile_id
    and preset.deleted_at is null;
  if not found or v_preset.version <> p_preset_version
    or not exists(
      select 1 from public.deck_srs_settings as setting
      where setting.learner_profile_id = p_learner_profile_id and setting.deck_id = v_deck_id
        and setting.preset_id = p_preset_id
    ) then
    raise exception using errcode = '40001', message = 'SRS_STALE_PRESET';
  end if;
  if not private.srs_schedule_json_valid(p_schedule_before, v_preset.algorithm)
    or not private.srs_schedule_json_valid(p_schedule_after, v_preset.algorithm)
    or p_schedule_after->>'schedulerVersion' <> p_scheduler_version
    or (p_schedule_after->>'lastReviewedAt')::timestamptz <> p_reviewed_at
    or (p_schedule_after->>'reps')::integer <> (p_schedule_before->>'reps')::integer + 1 then
    raise exception using errcode = '22023', message = 'invalid scheduler transition';
  end if;

  if p_study_session_id is not null then
    select * into v_session from public.study_sessions as session where session.id = p_study_session_id for update;
    if not found or v_session.learner_profile_id <> p_learner_profile_id
      or v_session.actor_account_id <> p_actor_account_id or not v_session.rescheduling
      or v_session.status not in ('active', 'paused')
      or v_session.source <> p_source
      or not exists(
        select 1 from public.study_session_items as item
        where item.study_session_id = p_study_session_id and item.card_id = p_card_id
          and item.status in ('pending', 'shown')
      ) then
      raise exception using errcode = '42501', message = 'study session cannot reschedule this card';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('srs-card:' || p_learner_profile_id::text || ':' || p_card_id::text, 0)
  );
  select * into v_schedule from public.card_schedules as schedule
  where schedule.learner_profile_id = p_learner_profile_id and schedule.card_id = p_card_id for update;

  if found then
    if v_schedule.version <> p_current_schedule_version then
      raise exception using errcode = '40001', message = 'SRS_STALE_VERSION';
    end if;
    if v_schedule.suspended or (v_schedule.buried_until is not null and v_schedule.buried_until > p_reviewed_at)
      or not private.srs_schedule_matches_row(p_learner_profile_id, p_card_id, p_schedule_before) then
      raise exception using errcode = '40001', message = 'SRS_STALE_STATE';
    end if;
  elsif p_current_schedule_version <> 0
    or p_schedule_before->>'state' <> 'new'
    or (p_schedule_before->>'reps')::integer <> 0
    or (p_schedule_before->>'lapses')::integer <> 0 then
    raise exception using errcode = '40001', message = 'SRS_STALE_VERSION';
  end if;

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
    p_scheduler_version, p_preset_version, v_content_version, p_current_schedule_version + 1
  ) on conflict (learner_profile_id, card_id) do update set
    algorithm = excluded.algorithm, state = excluded.state, due = excluded.due,
    last_reviewed_at = excluded.last_reviewed_at, stability = excluded.stability,
    difficulty = excluded.difficulty, elapsed_days = excluded.elapsed_days,
    scheduled_days = excluded.scheduled_days, learning_step = excluded.learning_step,
    reps = excluded.reps, lapses = excluded.lapses, legacy_ease_factor = excluded.legacy_ease_factor,
    scheduler_version = excluded.scheduler_version, preset_version = excluded.preset_version,
    content_version = excluded.content_version, version = excluded.version, updated_at = pg_catalog.now();

  v_is_leech := (p_schedule_after->>'lapses')::integer >= v_preset.leech_threshold;
  if v_is_leech then
    update public.card_schedules set leech = true,
      suspended = case when v_preset.leech_action = 'suspend' then true else suspended end,
      suspended_at = case when v_preset.leech_action = 'suspend' then coalesce(suspended_at, p_reviewed_at) else suspended_at end
    where learner_profile_id = p_learner_profile_id and card_id = p_card_id;
  end if;

  v_study_day := ((p_reviewed_at at time zone p_timezone) - pg_catalog.make_interval(mins => p_study_day_start))::date;
  insert into public.review_logs (
    id, learner_profile_id, card_id, deck_id, study_session_id, actor_account_id, device_id,
    idempotency_key, command_hash, rating, reviewed_at, duration_ms, timezone, study_day_start,
    study_day, source, schedule_version_before, schedule_version_after, scheduler_version,
    preset_id, preset_version, content_version, schedule_before, schedule_after
  ) values (
    p_review_id, p_learner_profile_id, p_card_id, v_deck_id, p_study_session_id,
    p_actor_account_id, p_device_id, p_idempotency_key, p_command_hash, p_rating, p_reviewed_at,
    p_duration_ms, p_timezone, p_study_day_start, v_study_day, p_source,
    p_current_schedule_version, p_current_schedule_version + 1, p_scheduler_version,
    p_preset_id, p_preset_version, v_content_version, p_schedule_before, p_schedule_after
  );
  insert into public.schedule_snapshots (
    learner_profile_id, card_id, review_log_id, schedule_version, schedule, reason
  ) values (
    p_learner_profile_id, p_card_id, p_review_id, p_current_schedule_version + 1, p_schedule_after, 'review'
  );

  insert into public.daily_study_counters (
    learner_profile_id, study_day, new_reviewed, learning_reviewed, review_reviewed,
    total_duration_ms, again_count, hard_count, good_count, easy_count
  ) values (
    p_learner_profile_id, v_study_day,
    case when p_schedule_before->>'state' = 'new' then 1 else 0 end,
    case when p_schedule_before->>'state' in ('learning','relearning') then 1 else 0 end,
    case when p_schedule_before->>'state' = 'review' then 1 else 0 end,
    p_duration_ms,
    case when p_rating = 'again' then 1 else 0 end, case when p_rating = 'hard' then 1 else 0 end,
    case when p_rating = 'good' then 1 else 0 end, case when p_rating = 'easy' then 1 else 0 end
  ) on conflict (learner_profile_id, study_day) do update set
    new_reviewed = daily_study_counters.new_reviewed + excluded.new_reviewed,
    learning_reviewed = daily_study_counters.learning_reviewed + excluded.learning_reviewed,
    review_reviewed = daily_study_counters.review_reviewed + excluded.review_reviewed,
    total_duration_ms = daily_study_counters.total_duration_ms + excluded.total_duration_ms,
    again_count = daily_study_counters.again_count + excluded.again_count,
    hard_count = daily_study_counters.hard_count + excluded.hard_count,
    good_count = daily_study_counters.good_count + excluded.good_count,
    easy_count = daily_study_counters.easy_count + excluded.easy_count, updated_at = pg_catalog.now();

  if p_study_session_id is not null then
    update public.study_session_items set status = 'reviewed',
      shown_at = coalesce(shown_at, p_reviewed_at), completed_at = p_reviewed_at, review_log_id = p_review_id
    where study_session_id = p_study_session_id and card_id = p_card_id;
    update public.study_sessions set completed_items = completed_items + 1, last_activity_at = p_reviewed_at,
      status = case when completed_items + 1 >= total_items then 'completed'::public.study_session_status else 'active' end,
      completed_at = case when completed_items + 1 >= total_items then p_reviewed_at else null end,
      version = version + 1
    where id = p_study_session_id;
  end if;

  if v_preset.bury_siblings then
    insert into public.card_schedules (
      learner_profile_id, card_id, algorithm, state, due, stability, difficulty, elapsed_days,
      scheduled_days, learning_step, reps, lapses, legacy_ease_factor, scheduler_version,
      preset_version, content_version, version, buried_until
    )
    select p_learner_profile_id, sibling.id, v_preset.algorithm, 'new', p_reviewed_at,
      case when v_preset.algorithm = 'fsrs' then 0 else null end,
      case when v_preset.algorithm = 'fsrs' then 0 else null end,
      0, 0, 0, 0, 0, case when v_preset.algorithm = 'sm2' then 2500 else null end,
      p_scheduler_version, p_preset_version, sibling.content_version, 1,
      (((v_study_day + 1)::timestamp + pg_catalog.make_interval(mins => p_study_day_start)) at time zone p_timezone)
    from public.cards as sibling
    where sibling.note_id = v_note_id and sibling.id <> p_card_id and sibling.active and sibling.deleted_at is null
    on conflict (learner_profile_id, card_id) do update set
      buried_until = greatest(card_schedules.buried_until, excluded.buried_until),
      updated_at = pg_catalog.now();
  end if;

  select pg_catalog.count(*)::integer into v_remaining
  from public.cards as card join public.notes as note on note.id = card.note_id
  left join public.card_schedules as schedule
    on schedule.card_id = card.id and schedule.learner_profile_id = p_learner_profile_id
  where card.active and card.deleted_at is null and note.deleted_at is null
    and private.srs_can_study_deck(p_actor_account_id, p_learner_profile_id, note.deck_id)
    and (schedule.card_id is null or (
      not schedule.suspended and (schedule.buried_until is null or schedule.buried_until <= p_reviewed_at)
      and schedule.due <= p_reviewed_at
    ));
  return pg_catalog.jsonb_build_object(
    'reviewId', p_review_id, 'duplicate', false, 'scheduleVersion', p_current_schedule_version + 1,
    'schedule', p_schedule_after, 'studyDay', v_study_day, 'leech', v_is_leech, 'remainingDue', v_remaining
  );
exception when unique_violation then
  select * into v_existing from public.review_logs as log
  where log.id = p_review_id
     or (log.learner_profile_id = p_learner_profile_id and log.idempotency_key = p_idempotency_key)
  limit 1;
  if found and v_existing.learner_profile_id = p_learner_profile_id and v_existing.command_hash = p_command_hash then
    return private.srs_review_result(v_existing);
  end if;
  raise exception using errcode = '22023', message = 'review idempotency conflict';
end;
$function$;

create or replace function public.admin_undo_srs_review(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_review_log_id uuid,
  p_undo_event_id uuid,
  p_idempotency_key uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_log public.review_logs;
  v_schedule public.card_schedules;
  v_existing public.review_undo_events;
  v_after_version bigint;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_review_log_id is null or p_undo_event_id is null or p_idempotency_key is null
    or (p_reason is not null and pg_catalog.char_length(p_reason) > 300) then
    raise exception using errcode = '22023', message = 'invalid undo command';
  end if;
  select * into v_existing from public.review_undo_events as event
  where event.learner_profile_id = p_learner_profile_id
    and (event.review_log_id = p_review_log_id or event.idempotency_key = p_idempotency_key);
  if found then
    return pg_catalog.jsonb_build_object(
      'undoEventId', v_existing.id, 'duplicate', true,
      'scheduleVersion', v_existing.schedule_version_after, 'schedule', v_existing.restored_schedule
    );
  end if;
  select * into v_log from public.review_logs as log
  where log.id = p_review_log_id and log.learner_profile_id = p_learner_profile_id;
  if not found or v_log.actor_account_id <> p_actor_account_id
    or exists(select 1 from public.review_undo_events as event where event.review_log_id = v_log.id)
    or exists(
      select 1 from public.review_logs as later
      where later.learner_profile_id = p_learner_profile_id and later.card_id = v_log.card_id
        and later.schedule_version_after > v_log.schedule_version_after
    ) then
    raise exception using errcode = '40001', message = 'SRS_UNDO_NOT_LATEST';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('srs-card:' || p_learner_profile_id::text || ':' || v_log.card_id::text, 0)
  );
  select * into v_schedule from public.card_schedules as schedule
  where schedule.learner_profile_id = p_learner_profile_id and schedule.card_id = v_log.card_id for update;
  if not found or v_schedule.version <> v_log.schedule_version_after then
    raise exception using errcode = '40001', message = 'SRS_STALE_VERSION';
  end if;
  v_after_version := v_schedule.version + 1;
  update public.card_schedules set
    algorithm = (v_log.schedule_before->>'algorithm')::public.srs_algorithm,
    state = (v_log.schedule_before->>'state')::public.srs_state,
    due = (v_log.schedule_before->>'due')::timestamptz,
    last_reviewed_at = (v_log.schedule_before->>'lastReviewedAt')::timestamptz,
    stability = (v_log.schedule_before->>'stability')::double precision,
    difficulty = (v_log.schedule_before->>'difficulty')::double precision,
    elapsed_days = (v_log.schedule_before->>'elapsedDays')::integer,
    scheduled_days = (v_log.schedule_before->>'scheduledDays')::integer,
    learning_step = (v_log.schedule_before->>'learningStep')::integer,
    reps = (v_log.schedule_before->>'reps')::integer,
    lapses = (v_log.schedule_before->>'lapses')::integer,
    legacy_ease_factor = (v_log.schedule_before->>'legacyEaseFactor')::integer,
    scheduler_version = v_log.schedule_before->>'schedulerVersion', version = v_after_version,
    leech = false, suspended = false, suspended_at = null, updated_at = pg_catalog.now()
  where learner_profile_id = p_learner_profile_id and card_id = v_log.card_id;

  insert into public.review_undo_events (
    id, learner_profile_id, review_log_id, actor_account_id, device_id, idempotency_key,
    schedule_version_before, schedule_version_after, restored_schedule, reason
  ) values (
    p_undo_event_id, p_learner_profile_id, p_review_log_id, p_actor_account_id, p_device_id,
    p_idempotency_key, v_schedule.version, v_after_version, v_log.schedule_before, p_reason
  );
  insert into public.schedule_snapshots (
    learner_profile_id, card_id, schedule_version, schedule, reason
  ) values (p_learner_profile_id, v_log.card_id, v_after_version, v_log.schedule_before, 'undo');

  update public.daily_study_counters set
    new_reviewed = new_reviewed - case when v_log.schedule_before->>'state' = 'new' then 1 else 0 end,
    learning_reviewed = learning_reviewed - case when v_log.schedule_before->>'state' in ('learning','relearning') then 1 else 0 end,
    review_reviewed = review_reviewed - case when v_log.schedule_before->>'state' = 'review' then 1 else 0 end,
    total_duration_ms = total_duration_ms - v_log.duration_ms,
    again_count = again_count - case when v_log.rating = 'again' then 1 else 0 end,
    hard_count = hard_count - case when v_log.rating = 'hard' then 1 else 0 end,
    good_count = good_count - case when v_log.rating = 'good' then 1 else 0 end,
    easy_count = easy_count - case when v_log.rating = 'easy' then 1 else 0 end,
    updated_at = pg_catalog.now()
  where learner_profile_id = p_learner_profile_id and study_day = v_log.study_day;

  if v_log.study_session_id is not null then
    update public.study_session_items set status = 'shown', completed_at = null, review_log_id = null
    where study_session_id = v_log.study_session_id and card_id = v_log.card_id and review_log_id = v_log.id;
    update public.study_sessions set completed_items = greatest(0, completed_items - 1),
      status = 'active', completed_at = null, version = version + 1, last_activity_at = pg_catalog.now()
    where id = v_log.study_session_id;
  end if;
  return pg_catalog.jsonb_build_object(
    'undoEventId', p_undo_event_id, 'duplicate', false,
    'scheduleVersion', v_after_version, 'schedule', v_log.schedule_before
  );
end;
$function$;

create or replace function public.admin_set_srs_schedule_control(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_card_id uuid,
  p_operation public.schedule_operation_kind,
  p_operation_event_id uuid,
  p_idempotency_key uuid,
  p_effective_at timestamptz,
  p_value jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_schedule public.card_schedules;
  v_existing public.schedule_operation_events;
  v_before jsonb;
  v_after jsonb;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_operation not in ('suspend','unsuspend','star','unstar','bury','manual_due','due_order','mark_leech')
    or p_operation_event_id is null or p_idempotency_key is null or p_effective_at is null
    or pg_catalog.jsonb_typeof(p_value) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid schedule control command';
  end if;
  select * into v_existing from public.schedule_operation_events as event
  where event.learner_profile_id = p_learner_profile_id and event.idempotency_key = p_idempotency_key;
  if found then
    return pg_catalog.jsonb_build_object('eventId', v_existing.id, 'duplicate', true, 'schedule', v_existing.after_state);
  end if;
  if not exists(
    select 1 from public.cards as card join public.notes as note on note.id = card.note_id
    where card.id = p_card_id and card.active and card.deleted_at is null and note.deleted_at is null
      and private.srs_can_study_deck(p_actor_account_id, p_learner_profile_id, note.deck_id)
  ) then
    raise exception using errcode = '42501', message = 'card is not available for schedule control';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('srs-card:' || p_learner_profile_id::text || ':' || p_card_id::text, 0)
  );
  select * into v_schedule from public.card_schedules as schedule
  where schedule.learner_profile_id = p_learner_profile_id and schedule.card_id = p_card_id for update;
  if not found then raise exception using errcode = '22023', message = 'card has no schedule to control'; end if;
  if p_operation = 'due_order' and (
    v_schedule.state <> 'new' or not (p_value ? 'order')
    or (p_value->>'order')::integer not between 0 and 1000000000
  ) then
    raise exception using errcode = '22023', message = 'due order applies only to New cards';
  end if;
  v_before := pg_catalog.to_jsonb(v_schedule);
  update public.card_schedules set
    suspended = case when p_operation = 'suspend' then true when p_operation = 'unsuspend' then false else suspended end,
    suspended_at = case when p_operation = 'suspend' then p_effective_at when p_operation = 'unsuspend' then null else suspended_at end,
    starred = case when p_operation = 'star' then true when p_operation = 'unstar' then false else starred end,
    buried_until = case when p_operation = 'bury' then (p_value->>'until')::timestamptz else buried_until end,
    due = case when p_operation = 'manual_due' then (p_value->>'due')::timestamptz else due end,
    due_order = case when p_operation = 'due_order' then (p_value->>'order')::integer else due_order end,
    leech = case when p_operation = 'mark_leech' then true else leech end,
    version = version + 1, updated_at = pg_catalog.now()
  where learner_profile_id = p_learner_profile_id and card_id = p_card_id
  returning pg_catalog.to_jsonb(card_schedules.*) into v_after;
  insert into public.schedule_operation_events (
    id, learner_profile_id, card_id, actor_account_id, device_id, operation,
    idempotency_key, affected_count, before_state, after_state
  ) values (
    p_operation_event_id, p_learner_profile_id, p_card_id, p_actor_account_id, p_device_id,
    p_operation, p_idempotency_key, 1, v_before, v_after
  );
  return pg_catalog.jsonb_build_object('eventId', p_operation_event_id, 'duplicate', false, 'schedule', v_after);
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = 'invalid schedule control value';
end;
$function$;

revoke all on function private.assert_srs_runtime_context(uuid,uuid,uuid,uuid,uuid)
from public, anon, authenticated, service_role;
revoke all on function private.ensure_default_srs_preset(uuid) from public, anon, authenticated, service_role;
revoke all on function private.srs_can_study_deck(uuid,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function private.srs_schedule_json_valid(jsonb,public.srs_algorithm)
from public, anon, authenticated, service_role;
revoke all on function private.srs_schedule_matches_row(uuid,uuid,jsonb)
from public, anon, authenticated, service_role;
revoke all on function private.srs_review_result(public.review_logs)
from public, anon, authenticated, service_role;

revoke all on function public.admin_get_srs_review_context(uuid,uuid,uuid,uuid,uuid,uuid,uuid)
from public, anon, authenticated, service_role;
revoke all on function public.admin_create_study_session(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,public.study_session_mode,public.review_source,
  boolean,text,smallint,timestamptz,text,jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.admin_commit_srs_review(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,public.review_rating,timestamptz,integer,text,smallint,
  bigint,uuid,uuid,text,public.review_source,uuid,bigint,jsonb,jsonb,text
) from public, anon, authenticated, service_role;
revoke all on function public.admin_undo_srs_review(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)
from public, anon, authenticated, service_role;
revoke all on function public.admin_set_srs_schedule_control(
  uuid,uuid,uuid,uuid,uuid,uuid,public.schedule_operation_kind,uuid,uuid,timestamptz,jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.admin_get_srs_review_context(uuid,uuid,uuid,uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.admin_create_study_session(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,public.study_session_mode,public.review_source,
  boolean,text,smallint,timestamptz,text,jsonb
) to service_role;
grant execute on function public.admin_commit_srs_review(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,public.review_rating,timestamptz,integer,text,smallint,
  bigint,uuid,uuid,text,public.review_source,uuid,bigint,jsonb,jsonb,text
) to service_role;
grant execute on function public.admin_undo_srs_review(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text) to service_role;
grant execute on function public.admin_set_srs_schedule_control(
  uuid,uuid,uuid,uuid,uuid,uuid,public.schedule_operation_kind,uuid,uuid,timestamptz,jsonb
) to service_role;
