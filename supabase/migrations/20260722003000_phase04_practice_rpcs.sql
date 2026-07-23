-- Phase 04 trusted practice boundary. TypeScript computes grading, mastery, and
-- selection; these service-only RPCs re-authorize, validate, and commit atomically.

create or replace function private.phase04_json_object_bounded(p_value jsonb, p_max_bytes integer)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  select p_value is not null
    and pg_catalog.jsonb_typeof(p_value) = 'object'
    and p_max_bytes > 0
    and pg_catalog.octet_length(pg_catalog.convert_to(p_value::text, 'UTF8')) <= p_max_bytes;
$function$;

create or replace function private.phase04_mastery_json_valid(p_value jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  v_recognition double precision;
  v_recall double precision;
  v_overall double precision;
  v_evidence_count integer;
  v_spaced integer;
  v_content_version bigint;
begin
  if not private.phase04_json_object_bounded(p_value, 8192)
    or not p_value ?& array[
      'recognition','recall','overall','stage','evidenceCount','spacedRecallSuccesses',
      'lastEvidenceAt','contentVersion'
    ]
    or p_value->>'stage' not in (
      'unseen','introduced','recognition','guided_recall','free_recall','mastered','needs_refresh'
    ) then
    return false;
  end if;
  v_recognition := (p_value->>'recognition')::double precision;
  v_recall := (p_value->>'recall')::double precision;
  v_overall := (p_value->>'overall')::double precision;
  v_evidence_count := (p_value->>'evidenceCount')::integer;
  v_spaced := (p_value->>'spacedRecallSuccesses')::integer;
  v_content_version := (p_value->>'contentVersion')::bigint;
  if p_value->'lastEvidenceAt' <> 'null'::jsonb then
    perform (p_value->>'lastEvidenceAt')::timestamptz;
  end if;
  return v_recognition between 0 and 1 and v_recall between 0 and 1
    and v_overall between 0 and 1 and v_evidence_count >= 0
    and v_spaced between 0 and 2 and v_content_version > 0;
exception when others then
  return false;
end;
$function$;

create or replace function private.phase04_mastery_result(p_mastery public.concept_mastery)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'recognition', p_mastery.recognition,
    'recall', p_mastery.recall,
    'overall', p_mastery.overall,
    'stage', p_mastery.stage,
    'evidenceCount', p_mastery.evidence_count,
    'spacedRecallSuccesses', p_mastery.spaced_recall_successes,
    'lastEvidenceAt', p_mastery.last_evidence_at,
    'contentVersion', p_mastery.content_version,
    'version', p_mastery.version
  );
$function$;

create or replace function public.admin_create_practice_session(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_practice_session_id uuid,
  p_mode public.practice_mode,
  p_config_schema_version integer,
  p_config jsonb,
  p_scope jsonb,
  p_queue_seed text,
  p_command_hash text,
  p_started_at timestamptz,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing public.practice_sessions;
  v_item jsonb;
  v_count integer;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_practice_session_id is null or p_started_at is null or p_config_schema_version <= 0
    or not private.phase04_json_object_bounded(p_config, 32768)
    or not private.phase04_json_object_bounded(p_scope, 16384)
    or pg_catalog.char_length(p_queue_seed) not between 8 and 200
    or p_command_hash !~ '^[a-f0-9]{64}$'
    or pg_catalog.jsonb_typeof(p_items) <> 'array'
    or pg_catalog.jsonb_array_length(p_items) not between 1 and 10000 then
    raise exception using errcode = '22023', message = 'invalid practice session request';
  end if;
  v_count := pg_catalog.jsonb_array_length(p_items);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('practice-session:' || p_practice_session_id::text, 0)
  );
  select * into v_existing
  from public.practice_sessions as session where session.id = p_practice_session_id;
  if found then
    if v_existing.learner_profile_id <> p_learner_profile_id
      or v_existing.actor_account_id <> p_actor_account_id
      or v_existing.command_hash <> p_command_hash then
      raise exception using errcode = '22023', message = 'practice session id was reused';
    end if;
    return pg_catalog.jsonb_build_object(
      'sessionId', v_existing.id, 'totalItems', v_existing.total_items,
      'status', v_existing.status, 'duplicate', true
    );
  end if;

  insert into public.practice_sessions (
    id, learner_profile_id, actor_account_id, mode, config_schema_version, config, scope,
    queue_seed, command_hash, total_items, started_at, last_activity_at
  ) values (
    p_practice_session_id, p_learner_profile_id, p_actor_account_id, p_mode,
    p_config_schema_version, p_config, p_scope, p_queue_seed, p_command_hash, v_count,
    p_started_at, p_started_at
  );

  for v_item in select value from pg_catalog.jsonb_array_elements(p_items) loop
    if not (v_item ?& array['cardId','position','questionLevel','questionKind','seedFragment'])
      or (v_item->>'position')::integer not between 0 and 9999
      or v_item->>'questionLevel' not in (
        'introduction','recognition','guided_recall','free_recall','delayed_retest'
      )
      or pg_catalog.char_length(v_item->>'questionKind') not between 1 and 80
      or pg_catalog.char_length(v_item->>'seedFragment') not between 1 and 200
      or not exists(
        select 1
        from public.cards as card
        join public.notes as note on note.id = card.note_id
        where card.id = (v_item->>'cardId')::uuid
          and card.active and card.deleted_at is null and note.deleted_at is null
          and private.srs_can_study_deck(p_actor_account_id, p_learner_profile_id, note.deck_id)
      ) then
      raise exception using errcode = '22023', message = 'invalid practice session item';
    end if;
    insert into public.practice_session_items (
      practice_session_id, position, card_id, question_level, question_kind, seed_fragment
    ) values (
      p_practice_session_id, (v_item->>'position')::integer, (v_item->>'cardId')::uuid,
      v_item->>'questionLevel', v_item->>'questionKind', v_item->>'seedFragment'
    );
  end loop;
  return pg_catalog.jsonb_build_object(
    'sessionId', p_practice_session_id, 'totalItems', v_count, 'status', 'active', 'duplicate', false
  );
exception when unique_violation or invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = 'invalid practice session item';
end;
$function$;

create or replace function public.admin_control_practice_session(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_practice_session_id uuid,
  p_expected_version bigint,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.practice_sessions;
  v_status public.practice_session_status;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_action not in ('pause','resume','abandon') or p_expected_version <= 0 then
    raise exception using errcode = '22023', message = 'invalid practice session control';
  end if;
  select * into v_session from public.practice_sessions as session
  where session.id = p_practice_session_id for update;
  if not found or v_session.learner_profile_id <> p_learner_profile_id
    or v_session.actor_account_id <> p_actor_account_id then
    raise exception using errcode = '42501', message = 'practice session is unavailable';
  end if;
  if v_session.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'PRACTICE_STALE_SESSION';
  end if;
  if (p_action = 'pause' and v_session.status <> 'active')
    or (p_action = 'resume' and v_session.status <> 'paused')
    or (p_action = 'abandon' and v_session.status not in ('active','paused')) then
    raise exception using errcode = '40001', message = 'practice session state changed';
  end if;
  v_status := case p_action
    when 'pause' then 'paused'::public.practice_session_status
    when 'resume' then 'active'::public.practice_session_status
    else 'abandoned'::public.practice_session_status
  end;
  update public.practice_sessions
  set status = v_status, last_activity_at = pg_catalog.now(), version = version + 1
  where id = p_practice_session_id
  returning * into v_session;
  return pg_catalog.jsonb_build_object(
    'sessionId', v_session.id, 'status', v_session.status, 'version', v_session.version
  );
end;
$function$;

create or replace function public.admin_record_practice_attempt(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_practice_attempt_id uuid,
  p_practice_session_id uuid,
  p_item_position integer,
  p_idempotency_key uuid,
  p_command_hash text,
  p_response_kind text,
  p_correctness double precision,
  p_verdict public.practice_verdict,
  p_confidence double precision,
  p_matched_rule text,
  p_explanation text,
  p_retention public.answer_retention,
  p_response_text text,
  p_response_hash text,
  p_hints_used integer,
  p_answer_revealed boolean,
  p_retry_count integer,
  p_duration_ms integer,
  p_self_confidence double precision,
  p_content_version bigint,
  p_suggested_rating public.review_rating,
  p_occurred_at timestamptz,
  p_expected_mastery_version bigint,
  p_new_mastery jsonb,
  p_complete_item boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempt public.practice_attempts;
  v_session public.practice_sessions;
  v_item public.practice_session_items;
  v_mastery public.concept_mastery;
  v_card public.cards;
  v_learner public.learner_profiles;
  v_retention public.answer_retention;
  v_response_text text;
  v_response_hash text;
  v_eligible boolean;
  v_was_complete boolean;
  v_test public.practice_test_attempts;
  v_scope_hash text;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_practice_attempt_id is null or p_idempotency_key is null or p_occurred_at is null
    or p_command_hash !~ '^[a-f0-9]{64}$'
    or p_correctness not between 0 and 1 or p_confidence not between 0 and 1
    or (p_self_confidence is not null and p_self_confidence not between 0 and 1)
    or pg_catalog.char_length(p_response_kind) not between 1 and 80
    or pg_catalog.char_length(p_matched_rule) not between 1 and 120
    or pg_catalog.char_length(p_explanation) not between 1 and 1000
    or p_hints_used not between 0 and 100 or p_retry_count not between 0 and 100
    or p_duration_ms not between 0 and 86400000 or p_content_version <= 0
    or p_expected_mastery_version < 0 or not private.phase04_mastery_json_valid(p_new_mastery) then
    raise exception using errcode = '22023', message = 'invalid practice attempt';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('practice-attempt:' || p_learner_profile_id::text || ':' || p_idempotency_key::text, 0)
  );
  select * into v_attempt from public.practice_attempts as attempt
  where attempt.learner_profile_id = p_learner_profile_id
    and attempt.idempotency_key = p_idempotency_key;
  if found then
    if v_attempt.command_hash <> p_command_hash then
      raise exception using errcode = '22023', message = 'practice idempotency key was reused';
    end if;
    select * into v_mastery from public.concept_mastery as mastery
    where mastery.learner_profile_id = p_learner_profile_id and mastery.card_id = v_attempt.card_id;
    return pg_catalog.jsonb_build_object(
      'attemptId', v_attempt.id, 'duplicate', true,
      'qualificationStatus', v_attempt.qualification_status,
      'mastery', private.phase04_mastery_result(v_mastery)
    );
  end if;

  select * into v_session from public.practice_sessions as session
  where session.id = p_practice_session_id for update;
  select * into v_item from public.practice_session_items as item
  where item.practice_session_id = p_practice_session_id and item.position = p_item_position for update;
  if v_session.id is null or v_item.practice_session_id is null
    or v_session.learner_profile_id <> p_learner_profile_id
    or v_session.actor_account_id <> p_actor_account_id
    or v_session.status <> 'active' or v_item.status in ('answered','skipped') then
    raise exception using errcode = '42501', message = 'practice item is unavailable';
  end if;
  select * into v_card from public.cards as card where card.id = v_item.card_id;
  if not found or not v_card.active or v_card.deleted_at is not null
    or v_card.content_version <> p_content_version then
    raise exception using errcode = '40001', message = 'PRACTICE_CONTENT_CHANGED';
  end if;
  select * into v_learner from public.learner_profiles as learner
  where learner.id = p_learner_profile_id and learner.status = 'active';

  v_retention := p_retention;
  v_response_text := p_response_text;
  v_response_hash := p_response_hash;
  if v_learner.kind <> 'self' or v_learner.age_band = 'under_13' then
    v_response_text := null;
    v_retention := case when p_response_hash is null then 'discarded'::public.answer_retention
      else 'hash_only'::public.answer_retention end;
  end if;
  if (v_retention = 'discarded' and (v_response_text is not null or v_response_hash is not null))
    or (v_retention = 'hash_only' and (v_response_text is not null or v_response_hash !~ '^[a-f0-9]{64}$'))
    or (v_retention = 'minimized_text' and (
      v_response_text is null or pg_catalog.char_length(v_response_text) > 4096
      or v_response_hash !~ '^[a-f0-9]{64}$'
    )) then
    raise exception using errcode = '22023', message = 'invalid practice answer retention';
  end if;

  select * into v_mastery from public.concept_mastery as mastery
  where mastery.learner_profile_id = p_learner_profile_id and mastery.card_id = v_item.card_id
  for update;
  if (v_mastery.card_id is null and p_expected_mastery_version <> 0)
    or (v_mastery.card_id is not null and v_mastery.version <> p_expected_mastery_version)
    or (p_new_mastery->>'evidenceCount')::integer <> coalesce(v_mastery.evidence_count, 0) + 1
    or (p_new_mastery->>'contentVersion')::bigint <> p_content_version then
    raise exception using errcode = '40001', message = 'PRACTICE_STALE_MASTERY';
  end if;

  v_eligible := v_session.mode in ('learn','write')
    and v_item.question_level in ('free_recall','delayed_retest')
    and p_correctness >= 0.8 and p_verdict = 'correct'
    and p_hints_used = 0 and not p_answer_revealed and p_retry_count = 0
    and (
      not exists(
        select 1 from public.card_schedules as schedule
        where schedule.learner_profile_id = p_learner_profile_id and schedule.card_id = v_item.card_id
      )
      or exists(
        select 1 from public.card_schedules as schedule
        where schedule.learner_profile_id = p_learner_profile_id and schedule.card_id = v_item.card_id
          and (schedule.state = 'new' or schedule.due <= p_occurred_at)
      )
    );
  if (v_eligible and p_suggested_rating is null) or (not v_eligible and p_suggested_rating is not null) then
    raise exception using errcode = '22023', message = 'invalid practice SRS qualification';
  end if;

  insert into public.practice_attempts (
    id, practice_session_id, item_position, learner_profile_id, actor_account_id, device_id,
    card_id, mode, response_kind, correctness, verdict, confidence, matched_rule, explanation,
    retention, response_text, response_hash, hints_used, answer_revealed, retry_count, duration_ms,
    self_confidence, content_version, qualification_status, suggested_rating,
    idempotency_key, command_hash, occurred_at
  ) values (
    p_practice_attempt_id, p_practice_session_id, p_item_position, p_learner_profile_id,
    p_actor_account_id, p_device_id, v_item.card_id, v_session.mode, p_response_kind,
    p_correctness, p_verdict, p_confidence, p_matched_rule, p_explanation, v_retention,
    v_response_text, v_response_hash, p_hints_used, p_answer_revealed, p_retry_count,
    p_duration_ms, p_self_confidence, p_content_version,
    case when v_eligible then 'eligible'::public.practice_qualification_status
      else 'not_eligible'::public.practice_qualification_status end,
    p_suggested_rating, p_idempotency_key, p_command_hash, p_occurred_at
  ) returning * into v_attempt;

  insert into public.concept_mastery (
    learner_profile_id, card_id, recognition, recall, overall, stage, evidence_count,
    spaced_recall_successes, last_evidence_at, content_version, version, updated_at
  ) values (
    p_learner_profile_id, v_item.card_id,
    (p_new_mastery->>'recognition')::double precision,
    (p_new_mastery->>'recall')::double precision,
    (p_new_mastery->>'overall')::double precision,
    (p_new_mastery->>'stage')::public.mastery_stage,
    (p_new_mastery->>'evidenceCount')::integer,
    (p_new_mastery->>'spacedRecallSuccesses')::integer,
    nullif(p_new_mastery->>'lastEvidenceAt', '')::timestamptz,
    p_content_version, 1, pg_catalog.now()
  ) on conflict (learner_profile_id, card_id) do update set
    recognition = excluded.recognition, recall = excluded.recall, overall = excluded.overall,
    stage = excluded.stage, evidence_count = excluded.evidence_count,
    spaced_recall_successes = excluded.spaced_recall_successes,
    last_evidence_at = excluded.last_evidence_at, content_version = excluded.content_version,
    version = public.concept_mastery.version + 1, updated_at = pg_catalog.now()
  returning * into v_mastery;

  if v_session.mode = 'test' and p_complete_item then
    select * into v_test from public.practice_test_attempts as test_attempt
    where test_attempt.practice_session_id = p_practice_session_id
      and test_attempt.learner_profile_id = p_learner_profile_id
      and test_attempt.status = 'active'
    for update;
    if v_test.id is null or v_test.answered_count >= v_test.question_count then
      raise exception using errcode = '40001', message = 'PRACTICE_TEST_CONTEXT_CHANGED';
    end if;
    insert into public.practice_test_responses (
      id, practice_test_attempt_id, learner_profile_id, card_id, position,
      question_kind, verdict, awarded_points, available_points,
      practice_attempt_id, created_at
    ) values (
      extensions.gen_random_uuid(), v_test.id, p_learner_profile_id, v_item.card_id,
      p_item_position, v_item.question_kind, p_verdict, p_correctness, 1,
      v_attempt.id, p_occurred_at
    );
    update public.practice_test_attempts
    set answered_count = answered_count + 1,
      awarded_points = awarded_points + p_correctness,
      status = case when answered_count + 1 = question_count
        then 'completed'::public.practice_test_status else status end,
      completed_at = case when answered_count + 1 = question_count then p_occurred_at else null end
    where id = v_test.id;
  end if;

  v_was_complete := v_item.status in ('answered','skipped');
  update public.practice_session_items
  set status = case when p_complete_item then 'answered'::public.practice_item_status
      else 'shown'::public.practice_item_status end,
    attempt_count = attempt_count + 1,
    shown_at = coalesce(shown_at, p_occurred_at),
    completed_at = case when p_complete_item then p_occurred_at else null end
  where practice_session_id = p_practice_session_id and position = p_item_position;

  if p_complete_item and not v_was_complete then
    update public.practice_sessions
    set completed_items = completed_items + 1,
      status = case when completed_items + 1 >= total_items
        then 'completed'::public.practice_session_status else status end,
      completed_at = case when completed_items + 1 >= total_items then p_occurred_at else null end,
      last_activity_at = p_occurred_at, version = version + 1
    where id = p_practice_session_id;
  else
    update public.practice_sessions
    set last_activity_at = p_occurred_at, version = version + 1
    where id = p_practice_session_id;
  end if;

  if v_session.config #>> '{goal,id}' is not null then
    update public.learning_goals
    set progress = pg_catalog.jsonb_build_object(
        'practiceSessionId', p_practice_session_id,
        'completedItems', v_session.completed_items + case when p_complete_item then 1 else 0 end,
        'totalItems', v_session.total_items
      ),
      status = case
        when p_complete_item and v_session.completed_items + 1 >= v_session.total_items
          and v_session.config #>> '{goal,kind}' <> 'exam'
          then 'completed'::public.learning_goal_status
        else status
      end,
      completed_at = case
        when p_complete_item and v_session.completed_items + 1 >= v_session.total_items
          and v_session.config #>> '{goal,kind}' <> 'exam'
          then p_occurred_at
        else completed_at
      end,
      version = version + 1,
      updated_at = p_occurred_at
    where id = (v_session.config #>> '{goal,id}')::uuid
      and learner_profile_id = p_learner_profile_id;
  end if;

  if v_session.mode = 'match' and p_complete_item
    and v_session.completed_items + 1 >= v_session.total_items then
    v_scope_hash := pg_catalog.encode(
      extensions.digest(v_session.scope::text, 'sha256'), 'hex'
    );
    insert into public.personal_bests (
      learner_profile_id, mode, scope_hash, metric, value, higher_is_better,
      source_practice_session_id, achieved_at, updated_at
    ) values (
      p_learner_profile_id, 'match', v_scope_hash, 'completion_ms',
      (select pg_catalog.sum(attempt.duration_ms)::double precision
        from public.practice_attempts as attempt
        where attempt.practice_session_id = p_practice_session_id),
      false, p_practice_session_id, p_occurred_at, p_occurred_at
    ) on conflict (learner_profile_id, mode, scope_hash, metric) do update
    set value = excluded.value,
      source_practice_session_id = excluded.source_practice_session_id,
      achieved_at = excluded.achieved_at,
      updated_at = excluded.updated_at
    where excluded.value < public.personal_bests.value;
  end if;

  return pg_catalog.jsonb_build_object(
    'attemptId', v_attempt.id, 'duplicate', false,
    'qualificationStatus', v_attempt.qualification_status,
    'suggestedRating', v_attempt.suggested_rating,
    'mastery', private.phase04_mastery_result(v_mastery)
  );
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
  raise exception using errcode = '22023', message = 'invalid practice attempt';
end;
$function$;

create or replace function public.admin_record_answer_override(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_override_id uuid,
  p_practice_attempt_id uuid,
  p_replacement_verdict public.practice_verdict,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempt public.practice_attempts;
  v_existing public.answer_overrides;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  select * into v_attempt from public.practice_attempts as attempt
  where attempt.id = p_practice_attempt_id;
  if not found or v_attempt.learner_profile_id <> p_learner_profile_id
    or p_replacement_verdict = v_attempt.verdict
    or p_reason_code not in ('learner_correct','learner_incorrect','answer_key_issue') then
    raise exception using errcode = '22023', message = 'invalid answer override';
  end if;
  select * into v_existing from public.answer_overrides as override
  where override.practice_attempt_id = p_practice_attempt_id;
  if found then
    if v_existing.actor_account_id <> p_actor_account_id
      or v_existing.replacement_verdict <> p_replacement_verdict
      or v_existing.reason_code <> p_reason_code then
      raise exception using errcode = '22023', message = 'answer override was reused';
    end if;
    return pg_catalog.jsonb_build_object('overrideId', v_existing.id, 'duplicate', true);
  end if;
  insert into public.answer_overrides (
    id, practice_attempt_id, learner_profile_id, actor_account_id,
    previous_verdict, replacement_verdict, reason_code
  ) values (
    p_override_id, p_practice_attempt_id, p_learner_profile_id, p_actor_account_id,
    v_attempt.verdict, p_replacement_verdict, p_reason_code
  );
  return pg_catalog.jsonb_build_object('overrideId', p_override_id, 'duplicate', false);
end;
$function$;

create or replace function public.admin_link_practice_srs_qualification(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_qualification_id uuid,
  p_practice_attempt_id uuid,
  p_review_log_id uuid,
  p_selected_rating public.review_rating,
  p_explicitly_accepted_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempt public.practice_attempts;
  v_review public.review_logs;
  v_existing public.practice_srs_qualifications;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  select * into v_attempt from public.practice_attempts as attempt
  where attempt.id = p_practice_attempt_id for update;
  select * into v_review from public.review_logs as review where review.id = p_review_log_id;
  if v_attempt.id is null or v_review.id is null
    or v_attempt.learner_profile_id <> p_learner_profile_id
    or v_attempt.actor_account_id <> p_actor_account_id
    or v_attempt.qualification_status not in ('eligible','qualified')
    or v_review.learner_profile_id <> p_learner_profile_id
    or v_review.actor_account_id <> p_actor_account_id
    or v_review.card_id <> v_attempt.card_id
    or v_review.rating <> p_selected_rating
    or p_explicitly_accepted_at is null or p_explicitly_accepted_at < v_attempt.occurred_at then
    raise exception using errcode = '42501', message = 'practice qualification link is invalid';
  end if;
  select * into v_existing from public.practice_srs_qualifications as qualification
  where qualification.practice_attempt_id = p_practice_attempt_id;
  if found then
    if v_existing.review_log_id <> p_review_log_id or v_existing.selected_rating <> p_selected_rating then
      raise exception using errcode = '22023', message = 'practice qualification was reused';
    end if;
    return pg_catalog.jsonb_build_object('qualificationId', v_existing.id, 'duplicate', true);
  end if;
  insert into public.practice_srs_qualifications (
    id, practice_attempt_id, review_log_id, learner_profile_id, actor_account_id,
    suggested_rating, selected_rating, explicitly_accepted_at
  ) values (
    p_qualification_id, p_practice_attempt_id, p_review_log_id, p_learner_profile_id,
    p_actor_account_id, v_attempt.suggested_rating, p_selected_rating, p_explicitly_accepted_at
  );
  update public.practice_attempts set qualification_status = 'qualified'
  where id = p_practice_attempt_id;
  return pg_catalog.jsonb_build_object('qualificationId', p_qualification_id, 'duplicate', false);
end;
$function$;

create or replace function public.admin_upsert_accepted_answer_rules(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_rule_id uuid,
  p_card_id uuid,
  p_schema_version integer,
  p_rules jsonb,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deck_id uuid;
  v_rule public.accepted_answer_rules;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  select note.deck_id into v_deck_id
  from public.cards as card join public.notes as note on note.id = card.note_id
  where card.id = p_card_id and card.active and card.deleted_at is null and note.deleted_at is null;
  if v_deck_id is null or not private.can_edit_deck(p_actor_account_id, v_deck_id)
    or p_schema_version <= 0 or p_expected_version < 0
    or not private.phase04_json_object_bounded(p_rules, 32768) then
    raise exception using errcode = '42501', message = 'accepted-answer rules are unavailable';
  end if;
  select * into v_rule from public.accepted_answer_rules as rule
  where rule.card_id = p_card_id and rule.deleted_at is null for update;
  if (v_rule.id is null and p_expected_version <> 0)
    or (v_rule.id is not null and v_rule.version <> p_expected_version) then
    raise exception using errcode = '40001', message = 'PRACTICE_STALE_ANSWER_RULES';
  end if;
  if v_rule.id is null then
    insert into public.accepted_answer_rules (
      id, card_id, deck_id, created_by, schema_version, rules
    ) values (p_rule_id, p_card_id, v_deck_id, p_actor_account_id, p_schema_version, p_rules)
    returning * into v_rule;
  else
    update public.accepted_answer_rules
    set schema_version = p_schema_version, rules = p_rules, version = version + 1,
      updated_at = pg_catalog.now()
    where id = v_rule.id returning * into v_rule;
  end if;
  return pg_catalog.jsonb_build_object('ruleId', v_rule.id, 'version', v_rule.version);
end;
$function$;

create or replace function public.admin_upsert_practice_mode_preference(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_mode public.practice_mode,
  p_config_schema_version integer,
  p_config jsonb,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_preference public.practice_mode_preferences;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_config_schema_version <= 0 or p_expected_version < 0
    or not private.phase04_json_object_bounded(p_config, 32768) then
    raise exception using errcode = '22023', message = 'invalid practice preference';
  end if;
  select * into v_preference from public.practice_mode_preferences as preference
  where preference.learner_profile_id = p_learner_profile_id and preference.mode = p_mode for update;
  if (v_preference.learner_profile_id is null and p_expected_version <> 0)
    or (v_preference.learner_profile_id is not null and v_preference.version <> p_expected_version) then
    raise exception using errcode = '40001', message = 'PRACTICE_STALE_PREFERENCE';
  end if;
  insert into public.practice_mode_preferences (
    learner_profile_id, mode, config_schema_version, config
  ) values (p_learner_profile_id, p_mode, p_config_schema_version, p_config)
  on conflict (learner_profile_id, mode) do update set
    config_schema_version = excluded.config_schema_version, config = excluded.config,
    version = public.practice_mode_preferences.version + 1, updated_at = pg_catalog.now()
  returning * into v_preference;
  return pg_catalog.jsonb_build_object('mode', v_preference.mode, 'version', v_preference.version);
end;
$function$;

create or replace function public.admin_upsert_product_guide_progress(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_context_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_progress_id uuid,
  p_learner_profile_id uuid,
  p_guide_key text,
  p_guide_version integer,
  p_status public.product_guide_status,
  p_current_step integer,
  p_metadata_schema_version integer,
  p_metadata jsonb,
  p_seen_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_progress public.product_guide_progress;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id,
    p_context_learner_profile_id, p_profile_session_id
  );
  if p_learner_profile_id is not null and p_learner_profile_id <> p_context_learner_profile_id then
    raise exception using errcode = '42501', message = 'guide learner context is invalid';
  end if;
  if p_progress_id is null or p_guide_key !~ '^[a-z][a-z0-9_.-]{0,79}$'
    or p_guide_version <= 0 or p_current_step not between 0 and 1000
    or p_metadata_schema_version <= 0 or p_seen_at is null
    or not private.phase04_json_object_bounded(p_metadata, 4096) then
    raise exception using errcode = '22023', message = 'invalid guide progress';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'product-guide:' || p_actor_account_id::text || ':' || coalesce(p_learner_profile_id::text, 'account')
      || ':' || p_guide_key || ':' || p_guide_version::text,
    0
  ));
  select * into v_progress from public.product_guide_progress as progress
  where progress.account_id = p_actor_account_id
    and progress.learner_profile_id is not distinct from p_learner_profile_id
    and progress.guide_key = p_guide_key and progress.guide_version = p_guide_version
  for update;
  if v_progress.id is null then
    insert into public.product_guide_progress (
      id, account_id, learner_profile_id, guide_key, guide_version, status, current_step,
      metadata_schema_version, metadata, started_at, last_seen_at, completed_at, dismissed_at,
      created_at, updated_at
    ) values (
      p_progress_id, p_actor_account_id, p_learner_profile_id, p_guide_key, p_guide_version,
      p_status, p_current_step, p_metadata_schema_version, p_metadata,
      case when p_status = 'in_progress' then p_seen_at else null end, p_seen_at,
      case when p_status = 'completed' then p_seen_at else null end,
      case when p_status = 'dismissed' then p_seen_at else null end,
      p_seen_at, p_seen_at
    ) returning * into v_progress;
  else
    update public.product_guide_progress
    set status = p_status, current_step = p_current_step,
      metadata_schema_version = p_metadata_schema_version, metadata = p_metadata,
      started_at = case
        when p_status = 'in_progress' and v_progress.status <> 'in_progress' then p_seen_at
        else v_progress.started_at end,
      last_seen_at = p_seen_at,
      completed_at = case when p_status = 'completed' then p_seen_at else null end,
      dismissed_at = case when p_status = 'dismissed' then p_seen_at else null end,
      updated_at = p_seen_at
    where id = v_progress.id returning * into v_progress;
  end if;
  return pg_catalog.jsonb_build_object(
    'progressId', v_progress.id, 'status', v_progress.status,
    'currentStep', v_progress.current_step, 'guideVersion', v_progress.guide_version
  );
end;
$function$;

revoke all on function private.phase04_json_object_bounded(jsonb,integer)
from public, anon, authenticated, service_role;
revoke all on function private.phase04_mastery_json_valid(jsonb)
from public, anon, authenticated, service_role;
revoke all on function private.phase04_mastery_result(public.concept_mastery)
from public, anon, authenticated, service_role;

revoke all on function public.admin_create_practice_session(
  uuid,uuid,uuid,uuid,uuid,uuid,public.practice_mode,integer,jsonb,jsonb,text,text,timestamptz,jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.admin_create_practice_session(
  uuid,uuid,uuid,uuid,uuid,uuid,public.practice_mode,integer,jsonb,jsonb,text,text,timestamptz,jsonb
) to service_role;

revoke all on function public.admin_control_practice_session(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text)
from public, anon, authenticated, service_role;
grant execute on function public.admin_control_practice_session(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text)
to service_role;

revoke all on function public.admin_record_practice_attempt(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,uuid,text,text,double precision,
  public.practice_verdict,double precision,text,text,public.answer_retention,text,text,
  integer,boolean,integer,integer,double precision,bigint,public.review_rating,timestamptz,bigint,jsonb,boolean
) from public, anon, authenticated, service_role;
grant execute on function public.admin_record_practice_attempt(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,uuid,text,text,double precision,
  public.practice_verdict,double precision,text,text,public.answer_retention,text,text,
  integer,boolean,integer,integer,double precision,bigint,public.review_rating,timestamptz,bigint,jsonb,boolean
) to service_role;

revoke all on function public.admin_record_answer_override(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,public.practice_verdict,text
) from public, anon, authenticated, service_role;
grant execute on function public.admin_record_answer_override(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,public.practice_verdict,text
) to service_role;

revoke all on function public.admin_link_practice_srs_qualification(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,public.review_rating,timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.admin_link_practice_srs_qualification(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,public.review_rating,timestamptz
) to service_role;

revoke all on function public.admin_upsert_accepted_answer_rules(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,jsonb,bigint
) from public, anon, authenticated, service_role;
grant execute on function public.admin_upsert_accepted_answer_rules(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,jsonb,bigint
) to service_role;

revoke all on function public.admin_upsert_practice_mode_preference(
  uuid,uuid,uuid,uuid,uuid,public.practice_mode,integer,jsonb,bigint
) from public, anon, authenticated, service_role;
grant execute on function public.admin_upsert_practice_mode_preference(
  uuid,uuid,uuid,uuid,uuid,public.practice_mode,integer,jsonb,bigint
) to service_role;

revoke all on function public.admin_upsert_product_guide_progress(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,integer,public.product_guide_status,integer,integer,jsonb,timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.admin_upsert_product_guide_progress(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,integer,public.product_guide_status,integer,integer,jsonb,timestamptz
) to service_role;
