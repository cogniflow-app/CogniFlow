-- Phase 04: learner-private practice, mastery, testing, planning, and guide state.
-- Practice evidence remains separate from canonical Phase 03 review evidence.

create type public.practice_mode as enum (
  'flashcards', 'learn', 'write', 'test', 'match', 'spell', 'pronunciation', 'diagram'
);
create type public.practice_session_status as enum ('active', 'paused', 'completed', 'abandoned');
create type public.practice_item_status as enum ('pending', 'shown', 'answered', 'skipped');
create type public.practice_verdict as enum ('correct', 'partial', 'incorrect', 'needs_review');
create type public.mastery_stage as enum (
  'unseen', 'introduced', 'recognition', 'guided_recall', 'free_recall', 'mastered', 'needs_refresh'
);
create type public.answer_retention as enum ('discarded', 'hash_only', 'minimized_text');
create type public.practice_qualification_status as enum ('not_eligible', 'eligible', 'qualified');
create type public.learning_goal_status as enum ('active', 'completed', 'archived');
create type public.exam_plan_status as enum ('active', 'completed', 'archived');
create type public.practice_test_status as enum ('active', 'completed', 'abandoned');
create type public.product_guide_status as enum ('not_started', 'in_progress', 'completed', 'dismissed');

create table public.practice_sessions (
  id uuid primary key,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  actor_account_id uuid not null references public.profiles (id) on delete restrict,
  mode public.practice_mode not null,
  status public.practice_session_status not null default 'active',
  config_schema_version integer not null default 1,
  config jsonb not null default '{}'::jsonb,
  scope jsonb not null default '{}'::jsonb,
  queue_seed text not null,
  command_hash text not null,
  total_items integer not null default 0,
  completed_items integer not null default 0,
  version bigint not null default 1,
  started_at timestamptz not null default pg_catalog.now(),
  last_activity_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  constraint practice_sessions_schema_version_positive check (config_schema_version > 0),
  constraint practice_sessions_config_bounded check (
    pg_catalog.jsonb_typeof(config) = 'object'
    and pg_catalog.octet_length(pg_catalog.convert_to(config::text, 'UTF8')) <= 32768
  ),
  constraint practice_sessions_scope_bounded check (
    pg_catalog.jsonb_typeof(scope) = 'object'
    and pg_catalog.octet_length(pg_catalog.convert_to(scope::text, 'UTF8')) <= 16384
  ),
  constraint practice_sessions_seed_length check (pg_catalog.char_length(queue_seed) between 8 and 200),
  constraint practice_sessions_command_hash check (command_hash ~ '^[a-f0-9]{64}$'),
  constraint practice_sessions_item_counts check (total_items >= 0 and completed_items between 0 and total_items),
  constraint practice_sessions_version_positive check (version > 0),
  constraint practice_sessions_completion_consistent check (
    (status = 'completed' and completed_at is not null) or (status <> 'completed' and completed_at is null)
  )
);
create index practice_sessions_learner_activity_idx
on public.practice_sessions (learner_profile_id, last_activity_at desc, id);
create index practice_sessions_resume_idx
on public.practice_sessions (learner_profile_id, status, last_activity_at desc)
where status in ('active', 'paused');

create table public.practice_session_items (
  practice_session_id uuid not null references public.practice_sessions (id) on delete restrict,
  position integer not null,
  card_id uuid not null references public.cards (id) on delete restrict,
  question_level text not null,
  question_kind text not null,
  seed_fragment text not null,
  status public.practice_item_status not null default 'pending',
  attempt_count integer not null default 0,
  shown_at timestamptz,
  completed_at timestamptz,
  primary key (practice_session_id, position),
  constraint practice_session_items_position check (position between 0 and 9999),
  constraint practice_session_items_question_level check (
    question_level in ('introduction','recognition','guided_recall','free_recall','delayed_retest')
  ),
  constraint practice_session_items_question_kind_length check (
    pg_catalog.char_length(question_kind) between 1 and 80
  ),
  constraint practice_session_items_seed_length check (pg_catalog.char_length(seed_fragment) between 1 and 200),
  constraint practice_session_items_attempt_count check (attempt_count between 0 and 100),
  constraint practice_session_items_shown_consistent check (status = 'pending' or shown_at is not null),
  constraint practice_session_items_completed_consistent check (
    (status in ('answered','skipped') and completed_at is not null)
    or (status not in ('answered','skipped') and completed_at is null)
  )
);
create index practice_session_items_pending_idx
on public.practice_session_items (practice_session_id, status, position);
create index practice_session_items_card_idx
on public.practice_session_items (card_id, practice_session_id, position);

create table public.practice_attempts (
  id uuid primary key,
  practice_session_id uuid not null references public.practice_sessions (id) on delete restrict,
  item_position integer not null,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  actor_account_id uuid not null references public.profiles (id) on delete restrict,
  device_id uuid references public.devices (id) on delete set null,
  card_id uuid not null references public.cards (id) on delete restrict,
  mode public.practice_mode not null,
  response_kind text not null,
  correctness double precision not null,
  verdict public.practice_verdict not null,
  confidence double precision not null,
  matched_rule text not null,
  explanation text not null,
  retention public.answer_retention not null,
  response_text text,
  response_hash text,
  hints_used integer not null default 0,
  answer_revealed boolean not null default false,
  retry_count integer not null default 0,
  duration_ms integer not null default 0,
  self_confidence double precision,
  content_version bigint not null,
  qualification_status public.practice_qualification_status not null default 'not_eligible',
  suggested_rating public.review_rating,
  idempotency_key uuid not null,
  command_hash text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint practice_attempts_item_fk foreign key (practice_session_id, item_position)
    references public.practice_session_items (practice_session_id, position) on delete restrict,
  constraint practice_attempts_scores check (
    correctness between 0 and 1 and confidence between 0 and 1
    and (self_confidence is null or self_confidence between 0 and 1)
  ),
  constraint practice_attempts_text_lengths check (
    pg_catalog.char_length(response_kind) between 1 and 80
    and pg_catalog.char_length(matched_rule) between 1 and 120
    and pg_catalog.char_length(explanation) between 1 and 1000
    and (response_text is null or pg_catalog.char_length(response_text) <= 4096)
  ),
  constraint practice_attempts_response_hash check (
    response_hash is null or response_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint practice_attempts_retention_consistent check (
    (retention = 'discarded' and response_text is null and response_hash is null)
    or (retention = 'hash_only' and response_text is null and response_hash is not null)
    or (retention = 'minimized_text' and response_text is not null and response_hash is not null)
  ),
  constraint practice_attempts_assistance_bounds check (
    hints_used between 0 and 100 and retry_count between 0 and 100 and duration_ms between 0 and 86400000
  ),
  constraint practice_attempts_content_version_positive check (content_version > 0),
  constraint practice_attempts_command_hash check (command_hash ~ '^[a-f0-9]{64}$'),
  constraint practice_attempts_qualification_consistent check (
    (qualification_status = 'not_eligible' and suggested_rating is null)
    or (qualification_status in ('eligible','qualified') and suggested_rating is not null)
  ),
  unique (learner_profile_id, idempotency_key)
);
create index practice_attempts_session_time_idx
on public.practice_attempts (practice_session_id, occurred_at, id);
create index practice_attempts_learner_card_idx
on public.practice_attempts (learner_profile_id, card_id, occurred_at desc, id);
create index practice_attempts_qualification_idx
on public.practice_attempts (learner_profile_id, qualification_status, occurred_at desc)
where qualification_status = 'eligible';

create table public.concept_mastery (
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  card_id uuid not null references public.cards (id) on delete restrict,
  recognition double precision not null default 0,
  recall double precision not null default 0,
  overall double precision not null default 0,
  stage public.mastery_stage not null default 'unseen',
  evidence_count integer not null default 0,
  spaced_recall_successes integer not null default 0,
  last_evidence_at timestamptz,
  content_version bigint not null,
  version bigint not null default 1,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (learner_profile_id, card_id),
  constraint concept_mastery_scores check (
    recognition between 0 and 1 and recall between 0 and 1 and overall between 0 and 1
  ),
  constraint concept_mastery_counts check (
    evidence_count >= 0 and spaced_recall_successes between 0 and 2
  ),
  constraint concept_mastery_versions check (content_version > 0 and version > 0)
);
create index concept_mastery_weak_idx
on public.concept_mastery (learner_profile_id, overall, last_evidence_at, card_id);
create index concept_mastery_stage_idx
on public.concept_mastery (learner_profile_id, stage, updated_at desc);

create table public.accepted_answer_rules (
  id uuid primary key,
  card_id uuid not null references public.cards (id) on delete restrict,
  deck_id uuid not null references public.decks (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  schema_version integer not null default 1,
  rules jsonb not null,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint accepted_answer_rules_schema_positive check (schema_version > 0 and version > 0),
  constraint accepted_answer_rules_bounded check (
    pg_catalog.jsonb_typeof(rules) = 'object'
    and pg_catalog.octet_length(pg_catalog.convert_to(rules::text, 'UTF8')) <= 32768
  )
);
create unique index accepted_answer_rules_card_active_idx
on public.accepted_answer_rules (card_id) where deleted_at is null;
create index accepted_answer_rules_deck_idx
on public.accepted_answer_rules (deck_id, card_id) where deleted_at is null;

create table public.answer_overrides (
  id uuid primary key,
  practice_attempt_id uuid not null references public.practice_attempts (id) on delete restrict,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  actor_account_id uuid not null references public.profiles (id) on delete restrict,
  previous_verdict public.practice_verdict not null,
  replacement_verdict public.practice_verdict not null,
  reason_code text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint answer_overrides_changed check (previous_verdict <> replacement_verdict),
  constraint answer_overrides_reason_code check (reason_code in ('learner_correct','learner_incorrect','answer_key_issue')),
  unique (practice_attempt_id)
);
create index answer_overrides_learner_time_idx
on public.answer_overrides (learner_profile_id, created_at desc, id);

create table public.practice_srs_qualifications (
  id uuid primary key,
  practice_attempt_id uuid not null references public.practice_attempts (id) on delete restrict,
  review_log_id uuid not null references public.review_logs (id) on delete restrict,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  actor_account_id uuid not null references public.profiles (id) on delete restrict,
  suggested_rating public.review_rating not null,
  selected_rating public.review_rating not null,
  explicitly_accepted_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  unique (practice_attempt_id),
  unique (review_log_id)
);
create index practice_srs_qualifications_learner_time_idx
on public.practice_srs_qualifications (learner_profile_id, created_at desc, id);

create table public.learning_goals (
  id uuid primary key,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  actor_account_id uuid not null references public.profiles (id) on delete restrict,
  name text not null,
  goal_type text not null,
  target jsonb not null,
  progress jsonb not null default '{}'::jsonb,
  status public.learning_goal_status not null default 'active',
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  constraint learning_goals_name_length check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 120),
  constraint learning_goals_type check (goal_type in ('time','count','mastery','new','due','weak','starred','tags','exam','mixed')),
  constraint learning_goals_documents check (
    pg_catalog.jsonb_typeof(target) = 'object' and pg_catalog.jsonb_typeof(progress) = 'object'
    and pg_catalog.octet_length(pg_catalog.convert_to(target::text, 'UTF8')) <= 16384
    and pg_catalog.octet_length(pg_catalog.convert_to(progress::text, 'UTF8')) <= 16384
  ),
  constraint learning_goals_version_positive check (version > 0),
  constraint learning_goals_completion_consistent check (
    (status = 'completed' and completed_at is not null) or (status <> 'completed' and completed_at is null)
  )
);
create index learning_goals_active_idx
on public.learning_goals (learner_profile_id, status, updated_at desc, id);

create table public.exam_plans (
  id uuid primary key,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  actor_account_id uuid not null references public.profiles (id) on delete restrict,
  name text not null,
  exam_at timestamptz not null,
  timezone text not null,
  scope jsonb not null,
  assumptions jsonb not null,
  plan jsonb not null,
  config_schema_version integer not null default 1,
  status public.exam_plan_status not null default 'active',
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint exam_plans_name_length check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 120),
  constraint exam_plans_timezone_length check (pg_catalog.char_length(timezone) between 1 and 80),
  constraint exam_plans_documents check (
    pg_catalog.jsonb_typeof(scope) = 'object' and pg_catalog.jsonb_typeof(assumptions) = 'object'
    and pg_catalog.jsonb_typeof(plan) = 'object'
    and pg_catalog.octet_length(pg_catalog.convert_to((scope || assumptions || plan)::text, 'UTF8')) <= 65536
  ),
  constraint exam_plans_versions check (config_schema_version > 0 and version > 0)
);
create index exam_plans_active_idx
on public.exam_plans (learner_profile_id, status, exam_at, id);

create table public.practice_test_definitions (
  id uuid primary key,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  actor_account_id uuid not null references public.profiles (id) on delete restrict,
  name text not null,
  config_schema_version integer not null default 1,
  config jsonb not null,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint practice_test_definitions_name_length check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 120),
  constraint practice_test_definitions_config check (
    config_schema_version > 0 and version > 0 and pg_catalog.jsonb_typeof(config) = 'object'
    and pg_catalog.octet_length(pg_catalog.convert_to(config::text, 'UTF8')) <= 32768
  )
);
create index practice_test_definitions_learner_idx
on public.practice_test_definitions (learner_profile_id, updated_at desc, id) where deleted_at is null;

create table public.practice_test_attempts (
  id uuid primary key,
  definition_id uuid not null references public.practice_test_definitions (id) on delete restrict,
  practice_session_id uuid references public.practice_sessions (id) on delete restrict,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  actor_account_id uuid not null references public.profiles (id) on delete restrict,
  status public.practice_test_status not null default 'active',
  seed text not null,
  question_count integer not null,
  answered_count integer not null default 0,
  awarded_points double precision not null default 0,
  available_points double precision not null,
  started_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  constraint practice_test_attempts_seed_length check (pg_catalog.char_length(seed) between 8 and 200),
  constraint practice_test_attempts_counts check (
    question_count between 1 and 1000 and answered_count between 0 and question_count
  ),
  constraint practice_test_attempts_points check (
    awarded_points >= 0 and available_points > 0 and awarded_points <= available_points
  ),
  constraint practice_test_attempts_completion_consistent check (
    (status = 'completed' and completed_at is not null and answered_count = question_count)
    or (status <> 'completed' and completed_at is null)
  )
);
create index practice_test_attempts_learner_time_idx
on public.practice_test_attempts (learner_profile_id, started_at desc, id);

create table public.practice_test_responses (
  id uuid primary key,
  practice_test_attempt_id uuid not null references public.practice_test_attempts (id) on delete restrict,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  card_id uuid not null references public.cards (id) on delete restrict,
  position integer not null,
  question_kind text not null,
  verdict public.practice_verdict not null,
  awarded_points double precision not null,
  available_points double precision not null,
  practice_attempt_id uuid references public.practice_attempts (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  constraint practice_test_responses_position check (position between 0 and 999),
  constraint practice_test_responses_kind_length check (pg_catalog.char_length(question_kind) between 1 and 80),
  constraint practice_test_responses_points check (
    awarded_points >= 0 and available_points > 0 and awarded_points <= available_points
  ),
  unique (practice_test_attempt_id, position)
);
create index practice_test_responses_learner_idx
on public.practice_test_responses (learner_profile_id, practice_test_attempt_id, position);

create table public.personal_bests (
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  mode public.practice_mode not null,
  scope_hash text not null,
  metric text not null,
  value double precision not null,
  higher_is_better boolean not null,
  source_practice_session_id uuid references public.practice_sessions (id) on delete restrict,
  source_test_attempt_id uuid references public.practice_test_attempts (id) on delete restrict,
  achieved_at timestamptz not null,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (learner_profile_id, mode, scope_hash, metric),
  constraint personal_bests_scope_hash check (scope_hash ~ '^[a-f0-9]{64}$'),
  constraint personal_bests_metric_length check (pg_catalog.char_length(metric) between 1 and 80),
  constraint personal_bests_value_nonnegative check (value >= 0),
  constraint personal_bests_source check (
    (source_practice_session_id is not null)::integer + (source_test_attempt_id is not null)::integer = 1
  )
);
create index personal_bests_mode_idx
on public.personal_bests (learner_profile_id, mode, metric, value desc);

create table public.practice_mode_preferences (
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  mode public.practice_mode not null,
  config_schema_version integer not null default 1,
  config jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (learner_profile_id, mode),
  constraint practice_mode_preferences_config check (
    config_schema_version > 0 and version > 0 and pg_catalog.jsonb_typeof(config) = 'object'
    and pg_catalog.octet_length(pg_catalog.convert_to(config::text, 'UTF8')) <= 32768
  )
);

create table public.product_guide_progress (
  id uuid primary key,
  account_id uuid not null references public.profiles (id) on delete restrict,
  learner_profile_id uuid references public.learner_profiles (id) on delete restrict,
  guide_key text not null,
  guide_version integer not null,
  status public.product_guide_status not null default 'not_started',
  current_step integer not null default 0,
  metadata_schema_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  last_seen_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint product_guide_progress_key check (guide_key ~ '^[a-z][a-z0-9_.-]{0,79}$'),
  constraint product_guide_progress_versions check (guide_version > 0 and metadata_schema_version > 0),
  constraint product_guide_progress_step check (current_step between 0 and 1000),
  constraint product_guide_progress_metadata check (
    pg_catalog.jsonb_typeof(metadata) = 'object'
    and pg_catalog.octet_length(pg_catalog.convert_to(metadata::text, 'UTF8')) <= 4096
  ),
  constraint product_guide_progress_status_times check (
    (status <> 'in_progress' or started_at is not null)
    and (status <> 'completed' or completed_at is not null)
    and (status <> 'dismissed' or dismissed_at is not null)
  )
);
create unique index product_guide_progress_version_idx
on public.product_guide_progress (account_id, learner_profile_id, guide_key, guide_version)
nulls not distinct;
create index product_guide_progress_account_idx
on public.product_guide_progress (account_id, updated_at desc, id);
create index product_guide_progress_learner_idx
on public.product_guide_progress (learner_profile_id, updated_at desc, id)
where learner_profile_id is not null;

create or replace function private.reject_append_only_practice_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception using errcode = '55000', message = 'practice evidence is append-only';
end;
$function$;

create trigger answer_overrides_append_only
before update or delete on public.answer_overrides
for each row execute function private.reject_append_only_practice_mutation();
create trigger practice_srs_qualifications_append_only
before update or delete on public.practice_srs_qualifications
for each row execute function private.reject_append_only_practice_mutation();
create trigger practice_test_responses_append_only
before update or delete on public.practice_test_responses
for each row execute function private.reject_append_only_practice_mutation();

do $block$
declare
  v_table text;
begin
  foreach v_table in array array[
    'practice_sessions','practice_session_items','practice_attempts','concept_mastery',
    'accepted_answer_rules','answer_overrides','practice_srs_qualifications','learning_goals',
    'exam_plans','practice_test_definitions','practice_test_attempts','practice_test_responses',
    'personal_bests','practice_mode_preferences','product_guide_progress'
  ] loop
    execute pg_catalog.format('alter table public.%I enable row level security', v_table);
  end loop;
end;
$block$;

create policy practice_sessions_select_authorized
on public.practice_sessions for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy practice_session_items_select_authorized
on public.practice_session_items for select to authenticated using (
  exists(
    select 1 from public.practice_sessions as session
    where session.id = practice_session_items.practice_session_id
      and private.can_access_learner_profile((select auth.uid()), session.learner_profile_id, 'study')
  )
);
create policy practice_attempts_select_authorized
on public.practice_attempts for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy concept_mastery_select_authorized
on public.concept_mastery for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy accepted_answer_rules_select_deck_viewer
on public.accepted_answer_rules for select to authenticated using (
  card_id in (select private.current_viewable_card_ids()) and deleted_at is null
);
create policy answer_overrides_select_authorized
on public.answer_overrides for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy practice_srs_qualifications_select_authorized
on public.practice_srs_qualifications for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy learning_goals_select_authorized
on public.learning_goals for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy exam_plans_select_authorized
on public.exam_plans for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy practice_test_definitions_select_authorized
on public.practice_test_definitions for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy practice_test_attempts_select_authorized
on public.practice_test_attempts for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy practice_test_responses_select_authorized
on public.practice_test_responses for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy personal_bests_select_authorized
on public.personal_bests for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy practice_mode_preferences_select_authorized
on public.practice_mode_preferences for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy product_guide_progress_select_authorized
on public.product_guide_progress for select to authenticated using (
  account_id = (select auth.uid())
  and private.has_current_content_context((select auth.uid()))
  and (
    learner_profile_id is null
    or private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
  )
);

revoke all on public.practice_sessions, public.practice_session_items, public.practice_attempts,
  public.concept_mastery, public.accepted_answer_rules, public.answer_overrides,
  public.practice_srs_qualifications, public.learning_goals, public.exam_plans,
  public.practice_test_definitions, public.practice_test_attempts, public.practice_test_responses,
  public.personal_bests, public.practice_mode_preferences, public.product_guide_progress
from anon, authenticated, service_role;

grant select on public.practice_sessions, public.practice_session_items, public.practice_attempts,
  public.concept_mastery, public.accepted_answer_rules, public.answer_overrides,
  public.practice_srs_qualifications, public.learning_goals, public.exam_plans,
  public.practice_test_definitions, public.practice_test_attempts, public.practice_test_responses,
  public.personal_bests, public.practice_mode_preferences, public.product_guide_progress
to authenticated;

revoke all on function private.reject_append_only_practice_mutation()
from public, anon, authenticated, service_role;

create or replace function private.tombstone_account_phase04()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.account_status <> 'deleted' and new.account_status = 'deleted' then
    if pg_catalog.current_setting('lumen.account_deletion_subject', true) is distinct from new.id::text then
      raise exception using errcode = '42501', message = 'Phase 04 deletion minimization requires the account-deletion worker';
    end if;

    update public.practice_sessions as session
    set config = '{}'::jsonb, scope = '{}'::jsonb, queue_seed = 'deleted-' || session.id::text,
      last_activity_at = pg_catalog.now(), version = session.version + 1
    where session.learner_profile_id in (
      select learner.id from public.learner_profiles as learner where learner.owner_account_id = new.id
    );
    update public.practice_attempts as attempt
    set response_text = null, response_hash = null, retention = 'discarded', explanation = 'Deleted account response'
    where attempt.learner_profile_id in (
      select learner.id from public.learner_profiles as learner where learner.owner_account_id = new.id
    );
    update public.accepted_answer_rules as rule
    set rules = '{}'::jsonb, deleted_at = coalesce(rule.deleted_at, pg_catalog.now()),
      updated_at = pg_catalog.now(), version = rule.version + 1
    where rule.created_by = new.id;
    update public.learning_goals as goal
    set name = 'Deleted goal ' || pg_catalog.substr(goal.id::text, 1, 8),
      target = '{}'::jsonb, progress = '{}'::jsonb, status = 'archived',
      completed_at = null, updated_at = pg_catalog.now(), version = goal.version + 1
    where goal.learner_profile_id in (
      select learner.id from public.learner_profiles as learner where learner.owner_account_id = new.id
    );
    update public.exam_plans as plan
    set name = 'Deleted exam plan ' || pg_catalog.substr(plan.id::text, 1, 8),
      scope = '{}'::jsonb, assumptions = '{}'::jsonb, plan = '{}'::jsonb,
      status = 'archived', timezone = 'UTC', updated_at = pg_catalog.now(), version = plan.version + 1
    where plan.learner_profile_id in (
      select learner.id from public.learner_profiles as learner where learner.owner_account_id = new.id
    );
    update public.practice_test_definitions as definition
    set name = 'Deleted test ' || pg_catalog.substr(definition.id::text, 1, 8),
      config = '{}'::jsonb, deleted_at = coalesce(definition.deleted_at, pg_catalog.now()),
      updated_at = pg_catalog.now(), version = definition.version + 1
    where definition.learner_profile_id in (
      select learner.id from public.learner_profiles as learner where learner.owner_account_id = new.id
    );
    update public.practice_mode_preferences as preference
    set config = '{}'::jsonb, updated_at = pg_catalog.now(), version = preference.version + 1
    where preference.learner_profile_id in (
      select learner.id from public.learner_profiles as learner where learner.owner_account_id = new.id
    );
    update public.product_guide_progress as guide
    set metadata = '{}'::jsonb, updated_at = pg_catalog.now(), last_seen_at = pg_catalog.now()
    where guide.account_id = new.id;
  end if;
  return new;
end;
$function$;

create trigger profiles_tombstone_account_phase04
after update of account_status on public.profiles
for each row execute function private.tombstone_account_phase04();

revoke all on function private.tombstone_account_phase04()
from public, anon, authenticated, service_role;
