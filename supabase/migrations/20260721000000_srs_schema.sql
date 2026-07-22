-- Phase 03: learner-private scheduling state, append-only review evidence, and study sessions.

create type public.srs_algorithm as enum ('fsrs', 'sm2');
create type public.srs_state as enum ('new', 'learning', 'review', 'relearning');
create type public.review_rating as enum ('again', 'hard', 'good', 'easy');
create type public.review_source as enum (
  'today', 'deck', 'folder', 'filtered', 'review_ahead', 'cram', 'import', 'rebuild'
);
create type public.new_card_order as enum ('created', 'due', 'random');
create type public.review_card_order as enum ('due', 'relative_overdueness', 'retrievability', 'random');
create type public.new_review_mix as enum ('before', 'after', 'interleave');
create type public.srs_leech_action as enum ('tag', 'suspend');
create type public.study_session_mode as enum (
  'today', 'deck', 'folder', 'new_only', 'due_only', 'forgotten_today', 'leeches',
  'starred', 'tag_query', 'review_ahead', 'cram', 'interval_range', 'card_state'
);
create type public.study_session_status as enum ('active', 'paused', 'completed', 'abandoned');
create type public.study_session_item_status as enum ('pending', 'shown', 'reviewed', 'skipped');
create type public.schedule_operation_kind as enum (
  'suspend', 'unsuspend', 'star', 'unstar', 'bury', 'bury_siblings', 'forget', 'manual_due',
  'reschedule', 'due_order', 'mark_leech', 'content_preserve', 'content_relearn',
  'content_reset', 'rebuild', 'algorithm_migration'
);
create type public.srs_optimization_status as enum (
  'queued', 'running', 'preview_ready', 'confirmed', 'rolled_back', 'failed', 'cancelled'
);

create table public.srs_presets (
  id uuid primary key default extensions.gen_random_uuid(),
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  name text not null,
  algorithm public.srs_algorithm not null default 'fsrs',
  requested_retention numeric(4,3) not null default 0.900,
  maximum_interval_days integer not null default 36500,
  learning_steps_minutes integer[] not null default array[1, 10],
  relearning_steps_minutes integer[] not null default array[10],
  short_term_enabled boolean not null default true,
  fuzz_enabled boolean not null default true,
  new_cards_per_day integer not null default 20,
  reviews_per_day integer not null default 200,
  new_card_order public.new_card_order not null default 'created',
  review_order public.review_card_order not null default 'due',
  new_review_mix public.new_review_mix not null default 'interleave',
  bury_siblings boolean not null default true,
  leech_threshold integer not null default 8,
  leech_action public.srs_leech_action not null default 'tag',
  fsrs_weights jsonb,
  is_default boolean not null default false,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint srs_presets_name_length check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 80),
  constraint srs_presets_retention_range check (requested_retention between 0.700 and 0.990),
  constraint srs_presets_maximum_interval_range check (maximum_interval_days between 1 and 36500),
  constraint srs_presets_learning_steps_valid check (
    pg_catalog.cardinality(learning_steps_minutes) <= 10
    and 0 < all(learning_steps_minutes) and 43201 > all(learning_steps_minutes)
  ),
  constraint srs_presets_relearning_steps_valid check (
    pg_catalog.cardinality(relearning_steps_minutes) <= 10
    and 0 < all(relearning_steps_minutes) and 43201 > all(relearning_steps_minutes)
  ),
  constraint srs_presets_short_term_steps check (
    short_term_enabled or (pg_catalog.cardinality(learning_steps_minutes) = 0 and pg_catalog.cardinality(relearning_steps_minutes) = 0)
  ),
  constraint srs_presets_daily_limits check (new_cards_per_day between 0 and 10000 and reviews_per_day between 0 and 100000),
  constraint srs_presets_leech_threshold check (leech_threshold between 1 and 100),
  constraint srs_presets_weights_array check (fsrs_weights is null or pg_catalog.jsonb_typeof(fsrs_weights) = 'array'),
  constraint srs_presets_version_positive check (version > 0)
);
create unique index srs_presets_learner_name_idx
on public.srs_presets (learner_profile_id, pg_catalog.lower(name)) where deleted_at is null;
create unique index srs_presets_one_default_idx
on public.srs_presets (learner_profile_id) where is_default and deleted_at is null;

create table public.deck_srs_settings (
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  deck_id uuid not null references public.decks (id) on delete restrict,
  preset_id uuid not null references public.srs_presets (id) on delete restrict,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (learner_profile_id, deck_id),
  constraint deck_srs_settings_version_positive check (version > 0)
);
create index deck_srs_settings_preset_idx on public.deck_srs_settings (preset_id, deck_id);

create table public.card_schedules (
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  card_id uuid not null references public.cards (id) on delete restrict,
  algorithm public.srs_algorithm not null,
  state public.srs_state not null default 'new',
  due timestamptz not null,
  last_reviewed_at timestamptz,
  stability double precision,
  difficulty double precision,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  learning_step integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  legacy_ease_factor integer,
  scheduler_version text not null,
  preset_version bigint not null,
  content_version bigint not null,
  version bigint not null default 1,
  suspended boolean not null default false,
  suspended_at timestamptz,
  buried_until timestamptz,
  starred boolean not null default false,
  leech boolean not null default false,
  due_order integer,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (learner_profile_id, card_id),
  constraint card_schedules_numbers_nonnegative check (
    elapsed_days >= 0 and scheduled_days >= 0 and learning_step >= 0 and reps >= 0 and lapses >= 0
  ),
  constraint card_schedules_versions_positive check (preset_version > 0 and content_version > 0 and version > 0),
  constraint card_schedules_scheduler_version_length check (pg_catalog.char_length(scheduler_version) between 1 and 120),
  constraint card_schedules_algorithm_fields check (
    (algorithm = 'fsrs' and legacy_ease_factor is null
      and stability is not null and stability >= 0
      and difficulty is not null and difficulty >= 0 and difficulty <= 10)
    or
    (algorithm = 'sm2' and legacy_ease_factor between 1300 and 4000
      and stability is null and difficulty is null)
  ),
  constraint card_schedules_suspend_consistent check ((suspended and suspended_at is not null) or (not suspended and suspended_at is null))
);
create index card_schedules_due_queue_idx
on public.card_schedules (learner_profile_id, suspended, due, card_id);
create index card_schedules_state_due_idx
on public.card_schedules (learner_profile_id, state, due, card_id) where not suspended;
create index card_schedules_buried_idx
on public.card_schedules (learner_profile_id, buried_until) where buried_until is not null;
create index card_schedules_leech_idx
on public.card_schedules (learner_profile_id, lapses desc, card_id) where leech;

create table public.study_filters (
  id uuid primary key default extensions.gen_random_uuid(),
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  name text not null,
  mode public.study_session_mode not null,
  definition jsonb not null default '{}'::jsonb,
  rescheduling boolean not null default false,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint study_filters_name_length check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 80),
  constraint study_filters_definition_object check (
    pg_catalog.jsonb_typeof(definition) = 'object'
    and pg_catalog.octet_length(pg_catalog.convert_to(definition::text, 'UTF8')) <= 32768
  ),
  constraint study_filters_version_positive check (version > 0)
);
create unique index study_filters_learner_name_idx
on public.study_filters (learner_profile_id, pg_catalog.lower(name)) where deleted_at is null;

create table public.study_sessions (
  id uuid primary key,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  actor_account_id uuid not null references public.profiles (id) on delete restrict,
  deck_id uuid references public.decks (id) on delete restrict,
  filter_id uuid references public.study_filters (id) on delete restrict,
  mode public.study_session_mode not null,
  source public.review_source not null,
  rescheduling boolean not null,
  status public.study_session_status not null default 'active',
  timezone text not null,
  study_day_start smallint not null,
  study_day date not null,
  queue_seed text not null,
  total_items integer not null default 0,
  completed_items integer not null default 0,
  version bigint not null default 1,
  started_at timestamptz not null default pg_catalog.now(),
  last_activity_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  constraint study_sessions_timezone_length check (pg_catalog.char_length(timezone) between 1 and 80),
  constraint study_sessions_day_start_range check (study_day_start between 0 and 1439),
  constraint study_sessions_seed_length check (pg_catalog.char_length(queue_seed) between 8 and 200),
  constraint study_sessions_item_counts check (total_items >= 0 and completed_items between 0 and total_items),
  constraint study_sessions_version_positive check (version > 0),
  constraint study_sessions_completion_consistent check (
    (status = 'completed' and completed_at is not null) or (status <> 'completed' and completed_at is null)
  )
);
create index study_sessions_learner_activity_idx
on public.study_sessions (learner_profile_id, last_activity_at desc);
create index study_sessions_active_idx
on public.study_sessions (learner_profile_id, status, started_at desc) where status in ('active', 'paused');

create table public.study_session_items (
  study_session_id uuid not null references public.study_sessions (id) on delete restrict,
  position integer not null,
  card_id uuid not null references public.cards (id) on delete restrict,
  schedule_version_at_enqueue bigint not null,
  state_at_enqueue public.srs_state not null,
  status public.study_session_item_status not null default 'pending',
  shown_at timestamptz,
  completed_at timestamptz,
  review_log_id uuid,
  primary key (study_session_id, position),
  unique (study_session_id, card_id),
  constraint study_session_items_position_nonnegative check (position >= 0),
  constraint study_session_items_schedule_version_nonnegative check (schedule_version_at_enqueue >= 0),
  constraint study_session_items_shown_consistent check (status = 'pending' or shown_at is not null),
  constraint study_session_items_completed_consistent check (
    (status in ('reviewed', 'skipped') and completed_at is not null) or (status not in ('reviewed', 'skipped') and completed_at is null)
  )
);
create index study_session_items_pending_idx
on public.study_session_items (study_session_id, status, position);
create index study_session_items_card_idx on public.study_session_items (card_id, study_session_id);

create table public.review_logs (
  id uuid primary key,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  card_id uuid not null references public.cards (id) on delete restrict,
  deck_id uuid not null references public.decks (id) on delete restrict,
  study_session_id uuid references public.study_sessions (id) on delete restrict,
  actor_account_id uuid not null references public.profiles (id) on delete restrict,
  device_id uuid references public.devices (id) on delete set null,
  idempotency_key uuid not null,
  command_hash text not null,
  rating public.review_rating not null,
  reviewed_at timestamptz not null,
  duration_ms integer not null,
  timezone text not null,
  study_day_start smallint not null,
  study_day date not null,
  source public.review_source not null,
  schedule_version_before bigint not null,
  schedule_version_after bigint not null,
  scheduler_version text not null,
  preset_id uuid not null references public.srs_presets (id) on delete restrict,
  preset_version bigint not null,
  content_version bigint not null,
  schedule_before jsonb not null,
  schedule_after jsonb not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint review_logs_duration_range check (duration_ms between 0 and 86400000),
  constraint review_logs_timezone_length check (pg_catalog.char_length(timezone) between 1 and 80),
  constraint review_logs_day_start_range check (study_day_start between 0 and 1439),
  constraint review_logs_schedule_versions check (
    schedule_version_before >= 0 and schedule_version_after = schedule_version_before + 1
  ),
  constraint review_logs_versions_positive check (preset_version > 0 and content_version > 0),
  constraint review_logs_command_hash_format check (command_hash ~ '^[a-f0-9]{64}$'),
  constraint review_logs_scheduler_version_length check (pg_catalog.char_length(scheduler_version) between 1 and 120),
  constraint review_logs_schedule_objects check (
    pg_catalog.jsonb_typeof(schedule_before) = 'object' and pg_catalog.jsonb_typeof(schedule_after) = 'object'
  ),
  unique (learner_profile_id, idempotency_key)
);
alter table public.study_session_items
add constraint study_session_items_review_log_fk foreign key (review_log_id) references public.review_logs (id) on delete restrict;
create index review_logs_learner_time_idx on public.review_logs (learner_profile_id, reviewed_at desc, id);
create index review_logs_card_time_idx on public.review_logs (learner_profile_id, card_id, reviewed_at desc, id);
create index review_logs_deck_day_idx on public.review_logs (learner_profile_id, deck_id, study_day, reviewed_at);
create index review_logs_session_idx on public.review_logs (study_session_id, reviewed_at) where study_session_id is not null;

create table public.daily_study_counters (
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  study_day date not null,
  new_reviewed integer not null default 0,
  learning_reviewed integer not null default 0,
  review_reviewed integer not null default 0,
  total_duration_ms bigint not null default 0,
  again_count integer not null default 0,
  hard_count integer not null default 0,
  good_count integer not null default 0,
  easy_count integer not null default 0,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (learner_profile_id, study_day),
  constraint daily_study_counters_nonnegative check (
    new_reviewed >= 0 and learning_reviewed >= 0 and review_reviewed >= 0
    and total_duration_ms >= 0 and again_count >= 0 and hard_count >= 0 and good_count >= 0 and easy_count >= 0
  )
);
create index daily_study_counters_recent_idx
on public.daily_study_counters (learner_profile_id, study_day desc);

create table public.schedule_snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  card_id uuid not null references public.cards (id) on delete restrict,
  review_log_id uuid references public.review_logs (id) on delete restrict,
  schedule_version bigint not null,
  schedule jsonb not null,
  reason text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint schedule_snapshots_version_nonnegative check (schedule_version >= 0),
  constraint schedule_snapshots_schedule_object check (pg_catalog.jsonb_typeof(schedule) = 'object'),
  constraint schedule_snapshots_reason check (reason in ('review', 'undo', 'rebuild', 'migration', 'operation')),
  unique (learner_profile_id, card_id, schedule_version)
);
create index schedule_snapshots_card_version_idx
on public.schedule_snapshots (learner_profile_id, card_id, schedule_version desc);

create table public.review_undo_events (
  id uuid primary key,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  review_log_id uuid not null references public.review_logs (id) on delete restrict,
  actor_account_id uuid not null references public.profiles (id) on delete restrict,
  device_id uuid references public.devices (id) on delete set null,
  idempotency_key uuid not null,
  schedule_version_before bigint not null,
  schedule_version_after bigint not null,
  restored_schedule jsonb not null,
  reason text,
  created_at timestamptz not null default pg_catalog.now(),
  constraint review_undo_events_versions check (schedule_version_before >= 1 and schedule_version_after = schedule_version_before + 1),
  constraint review_undo_events_schedule_object check (pg_catalog.jsonb_typeof(restored_schedule) = 'object'),
  constraint review_undo_events_reason_length check (reason is null or pg_catalog.char_length(reason) <= 300),
  unique (learner_profile_id, review_log_id),
  unique (learner_profile_id, idempotency_key)
);
create index review_undo_events_learner_time_idx on public.review_undo_events (learner_profile_id, created_at desc);

create table public.schedule_operation_events (
  id uuid primary key,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  card_id uuid references public.cards (id) on delete restrict,
  actor_account_id uuid not null references public.profiles (id) on delete restrict,
  device_id uuid references public.devices (id) on delete set null,
  operation public.schedule_operation_kind not null,
  idempotency_key uuid not null,
  affected_count integer not null,
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint schedule_operation_events_affected_positive check (affected_count > 0),
  constraint schedule_operation_events_states_valid check (
    pg_catalog.jsonb_typeof(before_state) in ('object', 'array') and pg_catalog.jsonb_typeof(after_state) in ('object', 'array')
  ),
  unique (learner_profile_id, idempotency_key)
);
create index schedule_operation_events_learner_time_idx on public.schedule_operation_events (learner_profile_id, created_at desc);

create table public.srs_optimization_jobs (
  id uuid primary key,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  preset_id uuid not null references public.srs_presets (id) on delete restrict,
  status public.srs_optimization_status not null default 'queued',
  source_review_count integer not null,
  input_schema_version text not null default 'lumen-fsrs-optimizer/1',
  previous_parameters jsonb not null,
  proposed_parameters jsonb,
  result_summary jsonb,
  error_code text,
  idempotency_key uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  confirmed_at timestamptz,
  rolled_back_at timestamptz,
  constraint srs_optimization_jobs_minimum_logs check (source_review_count >= 400),
  constraint srs_optimization_jobs_input_version_length check (pg_catalog.char_length(input_schema_version) between 1 and 80),
  constraint srs_optimization_jobs_objects check (
    pg_catalog.jsonb_typeof(previous_parameters) = 'object'
    and (proposed_parameters is null or pg_catalog.jsonb_typeof(proposed_parameters) = 'object')
    and (result_summary is null or pg_catalog.jsonb_typeof(result_summary) = 'object')
  ),
  constraint srs_optimization_jobs_error_length check (error_code is null or pg_catalog.char_length(error_code) <= 120),
  unique (learner_profile_id, idempotency_key)
);
create index srs_optimization_jobs_learner_time_idx on public.srs_optimization_jobs (learner_profile_id, created_at desc);

create or replace function private.reject_append_only_srs_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception using errcode = '55000', message = 'SRS evidence is append-only';
end;
$function$;

create trigger review_logs_append_only
before update or delete on public.review_logs
for each row execute function private.reject_append_only_srs_mutation();
create trigger schedule_snapshots_append_only
before update or delete on public.schedule_snapshots
for each row execute function private.reject_append_only_srs_mutation();
create trigger review_undo_events_append_only
before update or delete on public.review_undo_events
for each row execute function private.reject_append_only_srs_mutation();
create trigger schedule_operation_events_append_only
before update or delete on public.schedule_operation_events
for each row execute function private.reject_append_only_srs_mutation();

do $block$
declare
  v_table text;
begin
  foreach v_table in array array[
    'srs_presets', 'deck_srs_settings', 'card_schedules', 'study_filters',
    'study_sessions', 'study_session_items', 'review_logs', 'daily_study_counters',
    'schedule_snapshots', 'review_undo_events', 'schedule_operation_events', 'srs_optimization_jobs'
  ] loop
    execute pg_catalog.format('alter table public.%I enable row level security', v_table);
  end loop;
end;
$block$;

create policy srs_presets_select_authorized on public.srs_presets for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy deck_srs_settings_select_authorized on public.deck_srs_settings for select to authenticated using (
  private.can_study_deck((select auth.uid()), learner_profile_id, deck_id)
);
create policy card_schedules_select_authorized on public.card_schedules for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
  and exists(
    select 1 from public.cards as card
    join public.notes as note on note.id = card.note_id
    where card.id = card_schedules.card_id
      and private.can_study_deck((select auth.uid()), card_schedules.learner_profile_id, note.deck_id)
  )
);
create policy study_filters_select_authorized on public.study_filters for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy study_sessions_select_authorized on public.study_sessions for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy study_session_items_select_authorized on public.study_session_items for select to authenticated using (
  exists(
    select 1 from public.study_sessions as session
    where session.id = study_session_items.study_session_id
      and private.can_access_learner_profile((select auth.uid()), session.learner_profile_id, 'study')
  )
);
create policy review_logs_select_authorized on public.review_logs for select to authenticated using (
  private.can_study_deck((select auth.uid()), learner_profile_id, deck_id)
);
create policy daily_study_counters_select_authorized on public.daily_study_counters for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy schedule_snapshots_select_authorized on public.schedule_snapshots for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy review_undo_events_select_authorized on public.review_undo_events for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy schedule_operation_events_select_authorized on public.schedule_operation_events for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy srs_optimization_jobs_select_authorized on public.srs_optimization_jobs for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);

revoke all on public.srs_presets, public.deck_srs_settings, public.card_schedules,
  public.study_filters, public.study_sessions, public.study_session_items, public.review_logs,
  public.daily_study_counters, public.schedule_snapshots, public.review_undo_events,
  public.schedule_operation_events, public.srs_optimization_jobs
from anon, authenticated, service_role;
grant select on public.srs_presets, public.deck_srs_settings, public.card_schedules,
  public.study_filters, public.study_sessions, public.study_session_items, public.review_logs,
  public.daily_study_counters, public.schedule_snapshots, public.review_undo_events,
  public.schedule_operation_events, public.srs_optimization_jobs
to authenticated;

revoke all on function private.reject_append_only_srs_mutation() from public, anon, authenticated, service_role;
