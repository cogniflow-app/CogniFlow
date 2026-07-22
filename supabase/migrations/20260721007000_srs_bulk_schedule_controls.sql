-- Phase 03: previewed, confirmed, transaction-safe bulk schedule controls.

create or replace function public.admin_bulk_srs_schedule_control(
  p_actor_account_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid,
  p_learner_profile_id uuid,
  p_profile_session_id uuid,
  p_deck_ids uuid[],
  p_operation public.schedule_operation_kind,
  p_preview boolean,
  p_expected_count integer,
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
  v_count integer;
  v_existing public.schedule_operation_events;
  v_before jsonb;
  v_after jsonb;
begin
  perform private.assert_srs_runtime_context(
    p_actor_account_id, p_auth_session_id, p_device_id, p_learner_profile_id, p_profile_session_id
  );
  if p_deck_ids is null or pg_catalog.cardinality(p_deck_ids) not between 1 and 100
    or p_operation not in ('suspend','unsuspend','bury','mark_leech')
    or p_preview is null or p_effective_at is null or pg_catalog.jsonb_typeof(p_value) <> 'object'
    or (not p_preview and (p_expected_count is null or p_expected_count < 1
      or p_operation_event_id is null or p_idempotency_key is null)) then
    raise exception using errcode = '22023', message = 'invalid bulk schedule command';
  end if;
  if p_operation = 'bury' and (
    not p_value ? 'until' or (p_value->>'until')::timestamptz <= p_effective_at
  ) then
    raise exception using errcode = '22023', message = 'invalid bulk bury boundary';
  end if;

  if exists(
    select 1 from pg_catalog.unnest(p_deck_ids) as requested(deck_id)
    where not private.srs_can_study_deck(p_actor_account_id, p_learner_profile_id, requested.deck_id)
  ) then
    raise exception using errcode = '42501', message = 'one or more decks are unavailable';
  end if;

  if not p_preview then
    select * into v_existing from public.schedule_operation_events as event
    where event.learner_profile_id = p_learner_profile_id
      and event.idempotency_key = p_idempotency_key;
    if found then
      return pg_catalog.jsonb_build_object(
        'eventId', v_existing.id, 'duplicate', true, 'affectedCount', v_existing.affected_count
      );
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('srs-bulk:' || p_learner_profile_id::text, 0)
    );
    perform 1
    from public.card_schedules as schedule
    join public.cards as card on card.id = schedule.card_id
    join public.notes as note on note.id = card.note_id
    where schedule.learner_profile_id = p_learner_profile_id
      and note.deck_id = any(p_deck_ids)
    for update of schedule;
  end if;

  select pg_catalog.count(*)::integer into v_count
  from public.card_schedules as schedule
  join public.cards as card on card.id = schedule.card_id
  join public.notes as note on note.id = card.note_id
  where schedule.learner_profile_id = p_learner_profile_id
    and note.deck_id = any(p_deck_ids)
    and card.active and card.deleted_at is null and note.deleted_at is null
    and case p_operation
      when 'suspend' then not schedule.suspended
      when 'unsuspend' then schedule.suspended
      when 'bury' then schedule.buried_until is null or schedule.buried_until < (p_value->>'until')::timestamptz
      when 'mark_leech' then not schedule.leech
      else false
    end;
  if p_preview then
    return pg_catalog.jsonb_build_object('preview', true, 'affectedCount', v_count);
  end if;
  if v_count <> p_expected_count then
    raise exception using errcode = '40001', message = 'SRS_BULK_PREVIEW_STALE';
  end if;

  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(schedule.*) order by schedule.card_id)
  into v_before
  from public.card_schedules as schedule
  join public.cards as card on card.id = schedule.card_id
  join public.notes as note on note.id = card.note_id
  where schedule.learner_profile_id = p_learner_profile_id
    and note.deck_id = any(p_deck_ids)
    and card.active and card.deleted_at is null and note.deleted_at is null
    and case p_operation
      when 'suspend' then not schedule.suspended
      when 'unsuspend' then schedule.suspended
      when 'bury' then schedule.buried_until is null or schedule.buried_until < (p_value->>'until')::timestamptz
      when 'mark_leech' then not schedule.leech
      else false
    end;

  update public.card_schedules as schedule set
    suspended = case when p_operation = 'suspend' then true when p_operation = 'unsuspend' then false else schedule.suspended end,
    suspended_at = case when p_operation = 'suspend' then p_effective_at when p_operation = 'unsuspend' then null else schedule.suspended_at end,
    buried_until = case when p_operation = 'bury' then (p_value->>'until')::timestamptz else schedule.buried_until end,
    leech = case when p_operation = 'mark_leech' then true else schedule.leech end,
    version = schedule.version + 1,
    updated_at = pg_catalog.now()
  from public.cards as card, public.notes as note
  where schedule.learner_profile_id = p_learner_profile_id
    and card.id = schedule.card_id and note.id = card.note_id and note.deck_id = any(p_deck_ids)
    and card.active and card.deleted_at is null and note.deleted_at is null
    and case p_operation
      when 'suspend' then not schedule.suspended
      when 'unsuspend' then schedule.suspended
      when 'bury' then schedule.buried_until is null or schedule.buried_until < (p_value->>'until')::timestamptz
      when 'mark_leech' then not schedule.leech
      else false
    end;

  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(schedule.*) order by schedule.card_id)
  into v_after
  from public.card_schedules as schedule
  where schedule.learner_profile_id = p_learner_profile_id
    and schedule.card_id in (
      select (entry->>'card_id')::uuid from pg_catalog.jsonb_array_elements(v_before) as entry
    );

  insert into public.schedule_operation_events (
    id, learner_profile_id, card_id, actor_account_id, device_id, operation,
    idempotency_key, affected_count, before_state, after_state
  ) values (
    p_operation_event_id, p_learner_profile_id, null, p_actor_account_id, p_device_id,
    p_operation, p_idempotency_key, v_count, v_before, v_after
  );
  return pg_catalog.jsonb_build_object(
    'preview', false, 'eventId', p_operation_event_id, 'duplicate', false, 'affectedCount', v_count
  );
exception when invalid_text_representation or datetime_field_overflow then
  raise exception using errcode = '22023', message = 'invalid bulk schedule value';
end;
$function$;

revoke all on function public.admin_bulk_srs_schedule_control(
  uuid,uuid,uuid,uuid,uuid,uuid[],public.schedule_operation_kind,boolean,integer,uuid,uuid,timestamptz,jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.admin_bulk_srs_schedule_control(
  uuid,uuid,uuid,uuid,uuid,uuid[],public.schedule_operation_kind,boolean,integer,uuid,uuid,timestamptz,jsonb
) to service_role;
