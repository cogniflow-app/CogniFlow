-- Versioned preset administration and learner-private content-change choices.

create table public.srs_preset_versions (
  preset_id uuid not null references public.srs_presets (id) on delete restrict,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  version bigint not null,
  snapshot jsonb not null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (preset_id, version),
  constraint srs_preset_versions_positive check (version > 0),
  constraint srs_preset_versions_snapshot_object check (pg_catalog.jsonb_typeof(snapshot) = 'object')
);
create index srs_preset_versions_learner_time_idx
on public.srs_preset_versions (learner_profile_id, created_at desc);

create table public.content_change_schedule_decisions (
  content_change_impact_id uuid not null references public.content_change_impacts (id) on delete restrict,
  learner_profile_id uuid not null references public.learner_profiles (id) on delete restrict,
  choice public.content_change_resolution not null,
  decided_by_account_id uuid not null references public.profiles (id) on delete restrict,
  idempotency_key uuid not null,
  affected_schedule_count integer not null,
  decided_at timestamptz not null default pg_catalog.now(),
  primary key (content_change_impact_id, learner_profile_id),
  constraint content_change_schedule_decisions_final_choice check (choice in ('preserve','relearn','reset')),
  constraint content_change_schedule_decisions_count_nonnegative check (affected_schedule_count >= 0),
  unique (learner_profile_id, idempotency_key)
);
create index content_change_schedule_decisions_learner_time_idx
on public.content_change_schedule_decisions (learner_profile_id, decided_at desc);

create or replace function private.capture_srs_preset_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and new.version <> old.version + 1 then
    raise exception using errcode = '40001', message = 'SRS_STALE_PRESET';
  end if;
  insert into public.srs_preset_versions (preset_id, learner_profile_id, version, snapshot)
  values (new.id, new.learner_profile_id, new.version, pg_catalog.to_jsonb(new));
  return new;
end;
$function$;
create trigger srs_presets_capture_version
after insert or update on public.srs_presets
for each row execute function private.capture_srs_preset_version();

create trigger srs_preset_versions_append_only
before update or delete on public.srs_preset_versions
for each row execute function private.reject_append_only_srs_mutation();
create trigger content_change_schedule_decisions_append_only
before update or delete on public.content_change_schedule_decisions
for each row execute function private.reject_append_only_srs_mutation();

alter table public.srs_preset_versions enable row level security;
alter table public.content_change_schedule_decisions enable row level security;
create policy srs_preset_versions_select_authorized on public.srs_preset_versions for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
create policy content_change_schedule_decisions_select_authorized
on public.content_change_schedule_decisions for select to authenticated using (
  private.can_access_learner_profile((select auth.uid()), learner_profile_id, 'study')
);
revoke all on public.srs_preset_versions, public.content_change_schedule_decisions
from anon, authenticated, service_role;
grant select on public.srs_preset_versions, public.content_change_schedule_decisions to authenticated;

create or replace function private.srs_preset_config_valid(p_configuration jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  v_learning integer[];
  v_relearning integer[];
begin
  if pg_catalog.jsonb_typeof(p_configuration) <> 'object'
    or not p_configuration ?& array[
      'algorithm','requested_retention','maximum_interval_days','learning_steps_minutes',
      'relearning_steps_minutes','short_term_enabled','fuzz_enabled','new_cards_per_day',
      'reviews_per_day','new_card_order','review_order','new_review_mix','bury_siblings',
      'leech_threshold','leech_action'
    ]
    or p_configuration->>'algorithm' not in ('fsrs','sm2')
    or (p_configuration->>'requested_retention')::numeric not between 0.700 and 0.990
    or (p_configuration->>'maximum_interval_days')::integer not between 1 and 36500
    or pg_catalog.jsonb_typeof(p_configuration->'learning_steps_minutes') <> 'array'
    or pg_catalog.jsonb_typeof(p_configuration->'relearning_steps_minutes') <> 'array'
    or p_configuration->>'new_card_order' not in ('created','due','random')
    or p_configuration->>'review_order' not in ('due','relative_overdueness','retrievability','random')
    or p_configuration->>'new_review_mix' not in ('before','after','interleave')
    or p_configuration->>'leech_action' not in ('tag','suspend') then
    return false;
  end if;
  select coalesce(pg_catalog.array_agg(value::integer), '{}'::integer[]) into v_learning
  from pg_catalog.jsonb_array_elements_text(p_configuration->'learning_steps_minutes');
  select coalesce(pg_catalog.array_agg(value::integer), '{}'::integer[]) into v_relearning
  from pg_catalog.jsonb_array_elements_text(p_configuration->'relearning_steps_minutes');
  return pg_catalog.cardinality(v_learning) <= 10 and pg_catalog.cardinality(v_relearning) <= 10
    and 0 < all(v_learning) and 43201 > all(v_learning)
    and 0 < all(v_relearning) and 43201 > all(v_relearning)
    and (p_configuration->>'new_cards_per_day')::integer between 0 and 10000
    and (p_configuration->>'reviews_per_day')::integer between 0 and 100000
    and (p_configuration->>'leech_threshold')::integer between 1 and 100
    and (
      (p_configuration->>'short_term_enabled')::boolean
      or (pg_catalog.cardinality(v_learning) = 0 and pg_catalog.cardinality(v_relearning) = 0)
    )
    and (
      not p_configuration ? 'fsrs_weights'
      or p_configuration->'fsrs_weights' = 'null'::jsonb
      or pg_catalog.jsonb_typeof(p_configuration->'fsrs_weights') = 'array'
    );
exception when others then
  return false;
end;
$function$;

create or replace function public.admin_save_srs_preset(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_preset_id uuid,
  p_expected_version bigint,
  p_name text,
  p_configuration jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_preset public.srs_presets;
  v_learning integer[];
  v_relearning integer[];
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_preset_id is null or p_expected_version < 0
    or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 80
    or not private.srs_preset_config_valid(p_configuration) then
    raise exception using errcode = '22023', message = 'invalid SRS preset';
  end if;
  select coalesce(pg_catalog.array_agg(value::integer), '{}'::integer[]) into v_learning
  from pg_catalog.jsonb_array_elements_text(p_configuration->'learning_steps_minutes');
  select coalesce(pg_catalog.array_agg(value::integer), '{}'::integer[]) into v_relearning
  from pg_catalog.jsonb_array_elements_text(p_configuration->'relearning_steps_minutes');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('srs-preset:' || p_preset_id::text, 0));
  select * into v_preset from public.srs_presets as preset where preset.id = p_preset_id for update;
  if found then
    if v_preset.learner_profile_id <> p_learner_profile_id or v_preset.deleted_at is not null then
      raise exception using errcode = '42501', message = 'SRS preset is unavailable';
    end if;
    if v_preset.version <> p_expected_version then
      raise exception using errcode = '40001', message = 'SRS_STALE_PRESET';
    end if;
    if v_preset.algorithm::text <> p_configuration->>'algorithm' and exists(
      select 1 from public.deck_srs_settings as setting
      join public.notes as note on note.deck_id = setting.deck_id
      join public.cards as card on card.note_id = note.id
      join public.card_schedules as schedule
        on schedule.card_id = card.id and schedule.learner_profile_id = p_learner_profile_id
      where setting.preset_id = p_preset_id
    ) then
      raise exception using errcode = '55000', message = 'preset algorithm migration requires schedule replay';
    end if;
    update public.srs_presets set
      name = pg_catalog.btrim(p_name),
      algorithm = (p_configuration->>'algorithm')::public.srs_algorithm,
      requested_retention = (p_configuration->>'requested_retention')::numeric,
      maximum_interval_days = (p_configuration->>'maximum_interval_days')::integer,
      learning_steps_minutes = v_learning, relearning_steps_minutes = v_relearning,
      short_term_enabled = (p_configuration->>'short_term_enabled')::boolean,
      fuzz_enabled = (p_configuration->>'fuzz_enabled')::boolean,
      new_cards_per_day = (p_configuration->>'new_cards_per_day')::integer,
      reviews_per_day = (p_configuration->>'reviews_per_day')::integer,
      new_card_order = (p_configuration->>'new_card_order')::public.new_card_order,
      review_order = (p_configuration->>'review_order')::public.review_card_order,
      new_review_mix = (p_configuration->>'new_review_mix')::public.new_review_mix,
      bury_siblings = (p_configuration->>'bury_siblings')::boolean,
      leech_threshold = (p_configuration->>'leech_threshold')::integer,
      leech_action = (p_configuration->>'leech_action')::public.srs_leech_action,
      fsrs_weights = case when p_configuration->'fsrs_weights' = 'null'::jsonb then null else p_configuration->'fsrs_weights' end,
      version = version + 1, updated_at = pg_catalog.now()
    where id = p_preset_id returning * into v_preset;
  else
    if p_expected_version <> 0 then raise exception using errcode = '40001', message = 'SRS_STALE_PRESET'; end if;
    insert into public.srs_presets (
      id, learner_profile_id, name, algorithm, requested_retention, maximum_interval_days,
      learning_steps_minutes, relearning_steps_minutes, short_term_enabled, fuzz_enabled,
      new_cards_per_day, reviews_per_day, new_card_order, review_order, new_review_mix,
      bury_siblings, leech_threshold, leech_action, fsrs_weights
    ) values (
      p_preset_id, p_learner_profile_id, pg_catalog.btrim(p_name),
      (p_configuration->>'algorithm')::public.srs_algorithm,
      (p_configuration->>'requested_retention')::numeric,
      (p_configuration->>'maximum_interval_days')::integer, v_learning, v_relearning,
      (p_configuration->>'short_term_enabled')::boolean, (p_configuration->>'fuzz_enabled')::boolean,
      (p_configuration->>'new_cards_per_day')::integer, (p_configuration->>'reviews_per_day')::integer,
      (p_configuration->>'new_card_order')::public.new_card_order,
      (p_configuration->>'review_order')::public.review_card_order,
      (p_configuration->>'new_review_mix')::public.new_review_mix,
      (p_configuration->>'bury_siblings')::boolean, (p_configuration->>'leech_threshold')::integer,
      (p_configuration->>'leech_action')::public.srs_leech_action,
      case when p_configuration->'fsrs_weights' = 'null'::jsonb then null else p_configuration->'fsrs_weights' end
    ) returning * into v_preset;
  end if;
  return pg_catalog.to_jsonb(v_preset);
exception when unique_violation or check_violation or invalid_text_representation then
  raise exception using errcode = '22023', message = 'invalid or duplicate SRS preset';
end;
$function$;

create or replace function public.admin_delete_srs_preset(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_preset_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_preset public.srs_presets;
  v_default public.srs_presets;
  v_reassigned integer;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  select * into v_preset from public.srs_presets as preset where preset.id = p_preset_id for update;
  if not found or v_preset.learner_profile_id <> p_learner_profile_id or v_preset.deleted_at is not null then
    raise exception using errcode = '42501', message = 'SRS preset is unavailable';
  end if;
  if v_preset.version <> p_expected_version then raise exception using errcode = '40001', message = 'SRS_STALE_PRESET'; end if;
  if v_preset.is_default then raise exception using errcode = '55000', message = 'default SRS preset cannot be deleted'; end if;
  v_default := private.ensure_default_srs_preset(p_learner_profile_id);
  update public.deck_srs_settings set preset_id = v_default.id, version = version + 1, updated_at = pg_catalog.now()
  where learner_profile_id = p_learner_profile_id and preset_id = p_preset_id;
  get diagnostics v_reassigned = row_count;
  update public.srs_presets set deleted_at = pg_catalog.now(), version = version + 1, updated_at = pg_catalog.now()
  where id = p_preset_id;
  return pg_catalog.jsonb_build_object('presetId', p_preset_id, 'reassignedDecks', v_reassigned);
end;
$function$;

create or replace function public.admin_apply_srs_preset_to_decks(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_preset_id uuid,
  p_deck_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deck_id uuid;
  v_count integer := 0;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if pg_catalog.cardinality(p_deck_ids) not between 1 and 1000
    or not exists(
      select 1 from public.srs_presets as preset
      where preset.id = p_preset_id and preset.learner_profile_id = p_learner_profile_id and preset.deleted_at is null
    ) then
    raise exception using errcode = '22023', message = 'invalid preset application';
  end if;
  for v_deck_id in select distinct value from pg_catalog.unnest(p_deck_ids) as value loop
    if not private.srs_can_study_deck(p_actor_account_id, p_learner_profile_id, v_deck_id) then
      raise exception using errcode = '42501', message = 'deck is not available for preset application';
    end if;
    insert into public.deck_srs_settings (learner_profile_id, deck_id, preset_id)
    values (p_learner_profile_id, v_deck_id, p_preset_id)
    on conflict (learner_profile_id, deck_id) do update set
      preset_id = excluded.preset_id, version = deck_srs_settings.version + 1, updated_at = pg_catalog.now();
    v_count := v_count + 1;
  end loop;
  return pg_catalog.jsonb_build_object('presetId', p_preset_id, 'appliedDecks', v_count);
end;
$function$;

revoke all on function private.capture_srs_preset_version() from public, anon, authenticated, service_role;
revoke all on function private.srs_preset_config_valid(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.admin_save_srs_preset(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.admin_delete_srs_preset(uuid,uuid,uuid,uuid,uuid,uuid,bigint)
from public, anon, authenticated, service_role;
revoke all on function public.admin_apply_srs_preset_to_decks(uuid,uuid,uuid,uuid,uuid,uuid,uuid[])
from public, anon, authenticated, service_role;
grant execute on function public.admin_save_srs_preset(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,jsonb) to service_role;
grant execute on function public.admin_delete_srs_preset(uuid,uuid,uuid,uuid,uuid,uuid,bigint) to service_role;
grant execute on function public.admin_apply_srs_preset_to_decks(uuid,uuid,uuid,uuid,uuid,uuid,uuid[]) to service_role;
