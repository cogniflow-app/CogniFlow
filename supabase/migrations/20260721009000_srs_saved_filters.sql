-- Versioned saved custom-study filters. Browser callers never write filter rows directly.

create or replace function private.srs_filter_definition_valid(p_definition jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  v_mode text;
  v_range jsonb;
begin
  if pg_catalog.jsonb_typeof(p_definition) <> 'object'
    or p_definition - array[
      'mode','rescheduling','deckId','deckIds','intervalRangeDays','reviewOrder',
      'stateFilter','tagQuery'
    ]::text[] <> '{}'::jsonb
    or not p_definition ?& array['mode','rescheduling']
    or pg_catalog.jsonb_typeof(p_definition->'rescheduling') <> 'boolean' then
    return false;
  end if;
  v_mode := p_definition->>'mode';
  if v_mode not in (
    'today','new_only','due_only','forgotten_today','leeches','starred','review_ahead',
    'cram','folder','tag_query','interval_range','card_state'
  ) or (
    p_definition ? 'reviewOrder'
    and p_definition->>'reviewOrder' not in ('due','random','relative_overdueness','retrievability')
  ) then
    return false;
  end if;
  if p_definition ? 'deckId' then perform (p_definition->>'deckId')::uuid; end if;
  if p_definition ? 'deckIds' then
    if pg_catalog.jsonb_typeof(p_definition->'deckIds') <> 'array'
      or pg_catalog.jsonb_array_length(p_definition->'deckIds') not between 1 and 100
      or exists(
        select 1 from pg_catalog.jsonb_array_elements_text(p_definition->'deckIds') as entry(value)
        where entry.value::uuid is null
      ) then return false; end if;
  end if;
  if p_definition ? 'deckId' and p_definition ? 'deckIds' then return false; end if;
  if p_definition ? 'tagQuery' then
    if pg_catalog.jsonb_typeof(p_definition->'tagQuery') <> 'array'
      or pg_catalog.jsonb_array_length(p_definition->'tagQuery') not between 1 and 20
      or exists(
        select 1 from pg_catalog.jsonb_array_elements_text(p_definition->'tagQuery') as entry(value)
        where pg_catalog.char_length(pg_catalog.btrim(entry.value)) not between 1 and 80
      ) then return false; end if;
  end if;
  if p_definition ? 'stateFilter' then
    if pg_catalog.jsonb_typeof(p_definition->'stateFilter') <> 'array'
      or pg_catalog.jsonb_array_length(p_definition->'stateFilter') not between 1 and 4
      or exists(
        select 1 from pg_catalog.jsonb_array_elements_text(p_definition->'stateFilter') as entry(value)
        where entry.value not in ('new','learning','review','relearning')
      ) then return false; end if;
  end if;
  if p_definition ? 'intervalRangeDays' then
    v_range := p_definition->'intervalRangeDays';
    if pg_catalog.jsonb_typeof(v_range) <> 'object'
      or v_range - array['min','max']::text[] <> '{}'::jsonb
      or not v_range ?& array['min','max']
      or (v_range->>'min')::integer not between 0 and 36500
      or (v_range->>'max')::integer not between 0 and 36500
      or (v_range->>'min')::integer > (v_range->>'max')::integer then return false; end if;
  end if;
  return (v_mode <> 'tag_query' or p_definition ? 'tagQuery')
    and (v_mode <> 'interval_range' or p_definition ? 'intervalRangeDays')
    and (v_mode <> 'card_state' or p_definition ? 'stateFilter')
    and (v_mode <> 'folder' or p_definition ? 'deckIds');
exception when others then
  return false;
end;
$function$;

create or replace function public.admin_save_study_filter(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_filter_id uuid,
  p_expected_version bigint,
  p_name text,
  p_definition jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_filter public.study_filters;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_filter_id is null or p_expected_version < 0
    or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 80
    or not private.srs_filter_definition_valid(p_definition) then
    raise exception using errcode = '22023', message = 'invalid study filter';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('study-filter:' || p_filter_id::text, 0)
  );
  select * into v_filter from public.study_filters as filter where filter.id = p_filter_id for update;
  if found then
    if v_filter.learner_profile_id <> p_learner_profile_id or v_filter.deleted_at is not null then
      raise exception using errcode = '42501', message = 'study filter is unavailable';
    end if;
    if v_filter.version <> p_expected_version then
      raise exception using errcode = '40001', message = 'SRS_STALE_FILTER';
    end if;
    update public.study_filters set
      name = pg_catalog.btrim(p_name),
      mode = (p_definition->>'mode')::public.study_session_mode,
      definition = p_definition,
      rescheduling = (p_definition->>'rescheduling')::boolean,
      version = version + 1,
      updated_at = pg_catalog.now()
    where id = p_filter_id returning * into v_filter;
  else
    if p_expected_version <> 0 then
      raise exception using errcode = '40001', message = 'SRS_STALE_FILTER';
    end if;
    insert into public.study_filters (
      id, learner_profile_id, name, mode, definition, rescheduling
    ) values (
      p_filter_id, p_learner_profile_id, pg_catalog.btrim(p_name),
      (p_definition->>'mode')::public.study_session_mode, p_definition,
      (p_definition->>'rescheduling')::boolean
    ) returning * into v_filter;
  end if;
  return pg_catalog.to_jsonb(v_filter);
exception when unique_violation or check_violation or invalid_text_representation then
  raise exception using errcode = '22023', message = 'invalid or duplicate study filter';
end;
$function$;

create or replace function public.admin_delete_study_filter(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_filter_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_filter public.study_filters;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  select * into v_filter from public.study_filters as filter where filter.id = p_filter_id for update;
  if not found or v_filter.learner_profile_id <> p_learner_profile_id or v_filter.deleted_at is not null then
    raise exception using errcode = '42501', message = 'study filter is unavailable';
  end if;
  if v_filter.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'SRS_STALE_FILTER';
  end if;
  update public.study_filters set deleted_at = pg_catalog.now(), version = version + 1,
    updated_at = pg_catalog.now() where id = p_filter_id returning * into v_filter;
  return pg_catalog.jsonb_build_object('filterId', v_filter.id, 'version', v_filter.version);
end;
$function$;

revoke all on function private.srs_filter_definition_valid(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.admin_save_study_filter(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.admin_delete_study_filter(uuid,uuid,uuid,uuid,uuid,uuid,bigint)
from public, anon, authenticated, service_role;
grant execute on function public.admin_save_study_filter(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,jsonb)
to service_role;
grant execute on function public.admin_delete_study_filter(uuid,uuid,uuid,uuid,uuid,uuid,bigint)
to service_role;
