-- Phase 04 learner goals, exam plans, practice tests, and personal-best boundaries.

create or replace function public.admin_upsert_learning_goal(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_goal_id uuid,
  p_name text,
  p_goal_type text,
  p_target jsonb,
  p_progress jsonb,
  p_status public.learning_goal_status,
  p_expected_version bigint,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_goal public.learning_goals;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_goal_id is null or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 120
    or p_goal_type not in ('time','count','mastery','new','due','weak','starred','tags','exam','mixed')
    or not private.phase04_json_object_bounded(p_target, 16384)
    or not private.phase04_json_object_bounded(p_progress, 16384)
    or p_expected_version < 0 or p_occurred_at is null then
    raise exception using errcode = '22023', message = 'invalid learning goal';
  end if;
  select * into v_goal from public.learning_goals as goal
  where goal.id = p_goal_id for update;
  if v_goal.id is not null and v_goal.learner_profile_id <> p_learner_profile_id then
    raise exception using errcode = '42501', message = 'learning goal is unavailable';
  end if;
  if (v_goal.id is null and p_expected_version <> 0)
    or (v_goal.id is not null and v_goal.version <> p_expected_version) then
    raise exception using errcode = '40001', message = 'PRACTICE_STALE_GOAL';
  end if;
  if v_goal.id is null then
    insert into public.learning_goals (
      id, learner_profile_id, actor_account_id, name, goal_type, target, progress,
      status, created_at, updated_at, completed_at
    ) values (
      p_goal_id, p_learner_profile_id, p_actor_account_id, pg_catalog.btrim(p_name),
      p_goal_type, p_target, p_progress, p_status, p_occurred_at, p_occurred_at,
      case when p_status = 'completed' then p_occurred_at else null end
    ) returning * into v_goal;
  else
    update public.learning_goals
    set name = pg_catalog.btrim(p_name), goal_type = p_goal_type, target = p_target,
      progress = p_progress, status = p_status,
      completed_at = case when p_status = 'completed' then p_occurred_at else null end,
      updated_at = p_occurred_at, version = version + 1
    where id = p_goal_id returning * into v_goal;
  end if;
  return pg_catalog.jsonb_build_object(
    'goalId', v_goal.id, 'status', v_goal.status, 'version', v_goal.version
  );
end;
$function$;

create or replace function public.admin_upsert_exam_plan(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_exam_plan_id uuid,
  p_name text,
  p_exam_at timestamptz,
  p_timezone text,
  p_scope jsonb,
  p_assumptions jsonb,
  p_plan jsonb,
  p_config_schema_version integer,
  p_status public.exam_plan_status,
  p_expected_version bigint,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan public.exam_plans;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_exam_plan_id is null or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 120
    or p_exam_at is null or p_timezone is null
    or not exists(select 1 from pg_catalog.pg_timezone_names where name = p_timezone)
    or not private.phase04_json_object_bounded(p_scope, 16384)
    or not private.phase04_json_object_bounded(p_assumptions, 16384)
    or not private.phase04_json_object_bounded(p_plan, 32768)
    or pg_catalog.octet_length(pg_catalog.convert_to((p_scope || p_assumptions || p_plan)::text, 'UTF8')) > 65536
    or p_config_schema_version <= 0 or p_expected_version < 0 or p_occurred_at is null then
    raise exception using errcode = '22023', message = 'invalid exam plan';
  end if;
  select * into v_plan from public.exam_plans as plan where plan.id = p_exam_plan_id for update;
  if v_plan.id is not null and v_plan.learner_profile_id <> p_learner_profile_id then
    raise exception using errcode = '42501', message = 'exam plan is unavailable';
  end if;
  if (v_plan.id is null and p_expected_version <> 0)
    or (v_plan.id is not null and v_plan.version <> p_expected_version) then
    raise exception using errcode = '40001', message = 'PRACTICE_STALE_EXAM_PLAN';
  end if;
  if v_plan.id is null then
    insert into public.exam_plans (
      id, learner_profile_id, actor_account_id, name, exam_at, timezone, scope,
      assumptions, plan, config_schema_version, status, created_at, updated_at
    ) values (
      p_exam_plan_id, p_learner_profile_id, p_actor_account_id, pg_catalog.btrim(p_name),
      p_exam_at, p_timezone, p_scope, p_assumptions, p_plan, p_config_schema_version,
      p_status, p_occurred_at, p_occurred_at
    ) returning * into v_plan;
  else
    update public.exam_plans
    set name = pg_catalog.btrim(p_name), exam_at = p_exam_at, timezone = p_timezone,
      scope = p_scope, assumptions = p_assumptions, plan = p_plan,
      config_schema_version = p_config_schema_version, status = p_status,
      updated_at = p_occurred_at, version = version + 1
    where id = p_exam_plan_id returning * into v_plan;
  end if;
  return pg_catalog.jsonb_build_object(
    'examPlanId', v_plan.id, 'status', v_plan.status,
    'examAt', v_plan.exam_at, 'version', v_plan.version
  );
end;
$function$;

create or replace function public.admin_upsert_practice_test_definition(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_definition_id uuid,
  p_name text,
  p_config_schema_version integer,
  p_config jsonb,
  p_expected_version bigint,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_definition public.practice_test_definitions;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_definition_id is null or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 120
    or p_config_schema_version <= 0 or not private.phase04_json_object_bounded(p_config, 32768)
    or p_expected_version < 0 or p_occurred_at is null then
    raise exception using errcode = '22023', message = 'invalid practice test definition';
  end if;
  select * into v_definition from public.practice_test_definitions as definition
  where definition.id = p_definition_id and definition.deleted_at is null for update;
  if v_definition.id is not null and v_definition.learner_profile_id <> p_learner_profile_id then
    raise exception using errcode = '42501', message = 'practice test definition is unavailable';
  end if;
  if (v_definition.id is null and p_expected_version <> 0)
    or (v_definition.id is not null and v_definition.version <> p_expected_version) then
    raise exception using errcode = '40001', message = 'PRACTICE_STALE_TEST_DEFINITION';
  end if;
  if v_definition.id is null then
    insert into public.practice_test_definitions (
      id, learner_profile_id, actor_account_id, name, config_schema_version,
      config, created_at, updated_at
    ) values (
      p_definition_id, p_learner_profile_id, p_actor_account_id, pg_catalog.btrim(p_name),
      p_config_schema_version, p_config, p_occurred_at, p_occurred_at
    ) returning * into v_definition;
  else
    update public.practice_test_definitions
    set name = pg_catalog.btrim(p_name), config_schema_version = p_config_schema_version,
      config = p_config, updated_at = p_occurred_at, version = version + 1
    where id = p_definition_id returning * into v_definition;
  end if;
  return pg_catalog.jsonb_build_object(
    'definitionId', v_definition.id, 'version', v_definition.version
  );
end;
$function$;

create or replace function public.admin_create_practice_test_attempt(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_test_attempt_id uuid,
  p_definition_id uuid,
  p_practice_session_id uuid,
  p_seed text,
  p_question_count integer,
  p_available_points double precision,
  p_started_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_definition public.practice_test_definitions;
  v_existing public.practice_test_attempts;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  select * into v_definition from public.practice_test_definitions as definition
  where definition.id = p_definition_id and definition.deleted_at is null;
  if v_definition.id is null or v_definition.learner_profile_id <> p_learner_profile_id
    or pg_catalog.char_length(p_seed) not between 8 and 200
    or p_question_count not between 1 and 1000 or p_available_points <= 0
    or p_started_at is null
    or (p_practice_session_id is not null and not exists(
      select 1 from public.practice_sessions as session
      where session.id = p_practice_session_id
        and session.learner_profile_id = p_learner_profile_id and session.mode = 'test'
    )) then
    raise exception using errcode = '22023', message = 'invalid practice test attempt';
  end if;
  select * into v_existing from public.practice_test_attempts as attempt
  where attempt.id = p_test_attempt_id;
  if found then
    if v_existing.learner_profile_id <> p_learner_profile_id
      or v_existing.definition_id <> p_definition_id
      or v_existing.seed <> p_seed or v_existing.question_count <> p_question_count then
      raise exception using errcode = '22023', message = 'practice test attempt id was reused';
    end if;
    return pg_catalog.jsonb_build_object('testAttemptId', v_existing.id, 'duplicate', true);
  end if;
  insert into public.practice_test_attempts (
    id, definition_id, practice_session_id, learner_profile_id, actor_account_id,
    seed, question_count, available_points, started_at
  ) values (
    p_test_attempt_id, p_definition_id, p_practice_session_id, p_learner_profile_id,
    p_actor_account_id, p_seed, p_question_count, p_available_points, p_started_at
  );
  return pg_catalog.jsonb_build_object('testAttemptId', p_test_attempt_id, 'duplicate', false);
end;
$function$;

create or replace function public.admin_record_practice_test_response(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_response_id uuid,
  p_test_attempt_id uuid,
  p_card_id uuid,
  p_position integer,
  p_question_kind text,
  p_verdict public.practice_verdict,
  p_awarded_points double precision,
  p_available_points double precision,
  p_practice_attempt_id uuid,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_test public.practice_test_attempts;
  v_existing public.practice_test_responses;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_response_id is null or p_position not between 0 and 999
    or pg_catalog.char_length(p_question_kind) not between 1 and 80
    or p_available_points <= 0 or p_awarded_points < 0 or p_awarded_points > p_available_points
    or p_occurred_at is null then
    raise exception using errcode = '22023', message = 'invalid practice test response';
  end if;
  select * into v_test from public.practice_test_attempts as attempt
  where attempt.id = p_test_attempt_id for update;
  if v_test.id is null or v_test.learner_profile_id <> p_learner_profile_id
    or v_test.actor_account_id <> p_actor_account_id or v_test.status <> 'active'
    or not exists(
      select 1 from public.cards as card
      join public.notes as note on note.id = card.note_id
      where card.id = p_card_id and card.active and card.deleted_at is null
        and note.deleted_at is null
        and private.srs_can_study_deck(p_actor_account_id, p_learner_profile_id, note.deck_id)
    )
    or (p_practice_attempt_id is not null and not exists(
      select 1 from public.practice_attempts as practice
      where practice.id = p_practice_attempt_id
        and practice.learner_profile_id = p_learner_profile_id and practice.card_id = p_card_id
    )) then
    raise exception using errcode = '42501', message = 'practice test response is unavailable';
  end if;
  select * into v_existing from public.practice_test_responses as response
  where response.practice_test_attempt_id = p_test_attempt_id and response.position = p_position;
  if found then
    if v_existing.card_id <> p_card_id or v_existing.awarded_points <> p_awarded_points
      or v_existing.available_points <> p_available_points then
      raise exception using errcode = '22023', message = 'practice test response was reused';
    end if;
    return pg_catalog.jsonb_build_object('responseId', v_existing.id, 'duplicate', true);
  end if;
  if v_test.answered_count >= v_test.question_count
    or v_test.awarded_points + p_awarded_points > v_test.available_points then
    raise exception using errcode = '40001', message = 'practice test is already complete';
  end if;
  insert into public.practice_test_responses (
    id, practice_test_attempt_id, learner_profile_id, card_id, position, question_kind,
    verdict, awarded_points, available_points, practice_attempt_id, created_at
  ) values (
    p_response_id, p_test_attempt_id, p_learner_profile_id, p_card_id, p_position,
    p_question_kind, p_verdict, p_awarded_points, p_available_points,
    p_practice_attempt_id, p_occurred_at
  );
  update public.practice_test_attempts
  set answered_count = answered_count + 1,
    awarded_points = awarded_points + p_awarded_points,
    status = case when answered_count + 1 = question_count
      then 'completed'::public.practice_test_status else status end,
    completed_at = case when answered_count + 1 = question_count then p_occurred_at else null end
  where id = p_test_attempt_id returning * into v_test;
  return pg_catalog.jsonb_build_object(
    'responseId', p_response_id, 'duplicate', false, 'status', v_test.status,
    'answeredCount', v_test.answered_count, 'questionCount', v_test.question_count,
    'awardedPoints', v_test.awarded_points, 'availablePoints', v_test.available_points
  );
end;
$function$;

create or replace function public.admin_record_personal_best(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_mode public.practice_mode,
  p_scope_hash text,
  p_metric text,
  p_value double precision,
  p_higher_is_better boolean,
  p_source_practice_session_id uuid,
  p_source_test_attempt_id uuid,
  p_achieved_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_best public.personal_bests;
  v_improved boolean := false;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_scope_hash !~ '^[a-f0-9]{64}$' or pg_catalog.char_length(p_metric) not between 1 and 80
    or p_value < 0 or p_achieved_at is null
    or (p_source_practice_session_id is not null)::integer
      + (p_source_test_attempt_id is not null)::integer <> 1
    or (p_source_practice_session_id is not null and not exists(
      select 1 from public.practice_sessions as session
      where session.id = p_source_practice_session_id
        and session.learner_profile_id = p_learner_profile_id and session.mode = p_mode
        and session.status = 'completed'
    ))
    or (p_source_test_attempt_id is not null and not exists(
      select 1 from public.practice_test_attempts as attempt
      where attempt.id = p_source_test_attempt_id
        and attempt.learner_profile_id = p_learner_profile_id and attempt.status = 'completed'
    )) then
    raise exception using errcode = '22023', message = 'invalid personal best';
  end if;
  select * into v_best from public.personal_bests as best
  where best.learner_profile_id = p_learner_profile_id and best.mode = p_mode
    and best.scope_hash = p_scope_hash and best.metric = p_metric for update;
  if v_best.learner_profile_id is null
    or (p_higher_is_better and p_value > v_best.value)
    or (not p_higher_is_better and p_value < v_best.value) then
    if v_best.learner_profile_id is not null and v_best.higher_is_better <> p_higher_is_better then
      raise exception using errcode = '22023', message = 'personal best direction changed';
    end if;
    insert into public.personal_bests (
      learner_profile_id, mode, scope_hash, metric, value, higher_is_better,
      source_practice_session_id, source_test_attempt_id, achieved_at, updated_at
    ) values (
      p_learner_profile_id, p_mode, p_scope_hash, p_metric, p_value, p_higher_is_better,
      p_source_practice_session_id, p_source_test_attempt_id, p_achieved_at, p_achieved_at
    ) on conflict (learner_profile_id, mode, scope_hash, metric) do update set
      value = excluded.value, source_practice_session_id = excluded.source_practice_session_id,
      source_test_attempt_id = excluded.source_test_attempt_id,
      achieved_at = excluded.achieved_at, updated_at = excluded.updated_at
    returning * into v_best;
    v_improved := true;
  end if;
  return pg_catalog.jsonb_build_object(
    'improved', v_improved, 'value', v_best.value, 'achievedAt', v_best.achieved_at
  );
end;
$function$;

revoke all on function public.admin_upsert_learning_goal(
  uuid,uuid,uuid,uuid,uuid,uuid,text,text,jsonb,jsonb,public.learning_goal_status,bigint,timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.admin_upsert_learning_goal(
  uuid,uuid,uuid,uuid,uuid,uuid,text,text,jsonb,jsonb,public.learning_goal_status,bigint,timestamptz
) to service_role;

revoke all on function public.admin_upsert_exam_plan(
  uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,text,jsonb,jsonb,jsonb,integer,
  public.exam_plan_status,bigint,timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.admin_upsert_exam_plan(
  uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,text,jsonb,jsonb,jsonb,integer,
  public.exam_plan_status,bigint,timestamptz
) to service_role;

revoke all on function public.admin_upsert_practice_test_definition(
  uuid,uuid,uuid,uuid,uuid,uuid,text,integer,jsonb,bigint,timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.admin_upsert_practice_test_definition(
  uuid,uuid,uuid,uuid,uuid,uuid,text,integer,jsonb,bigint,timestamptz
) to service_role;

revoke all on function public.admin_create_practice_test_attempt(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,integer,double precision,timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.admin_create_practice_test_attempt(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,integer,double precision,timestamptz
) to service_role;

revoke all on function public.admin_record_practice_test_response(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,text,public.practice_verdict,
  double precision,double precision,uuid,timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.admin_record_practice_test_response(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,text,public.practice_verdict,
  double precision,double precision,uuid,timestamptz
) to service_role;

revoke all on function public.admin_record_personal_best(
  uuid,uuid,uuid,uuid,uuid,public.practice_mode,text,text,double precision,boolean,uuid,uuid,timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.admin_record_personal_best(
  uuid,uuid,uuid,uuid,uuid,public.practice_mode,text,text,double precision,boolean,uuid,uuid,timestamptz
) to service_role;
